import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { v4 as uuidv4 } from "uuid";
import path from 'path'

// Ralph loop state interface
interface RalphLoopState {
  id: string;
  active: boolean;
  task: string;
  completionPromise?: string;
  maxIterations: number;
  iteration: number;
  retryOnError: boolean;
  stopOnToolError: boolean;
  verifyCommand?: string;
  lastAssistantText?: string;
  lastError?: string;
  lastQueuedAt?: number;
  lastTurnCount?: number;
  stopReason?: "completed" | "cancelled" | "max-iterations" | "error";
  createdAt: number;
  updatedAt: number;
}

// Define the shape for command input parameters
const RalphLoopCommandParams = Type.Object({
  task: Type.String({ description: "Task prompt for the Ralph loop" }),
  completionPromise: Type.Optional(Type.String({ description: "Completion promise text" })),
  maxIterations: Type.Optional(Type.Number({ default: 20 })),
  retryOnError: Type.Optional(Type.Boolean({ default: false })),
  stopOnToolError: Type.Optional(Type.Boolean({ default: false })),
  verifyCommand: Type.Optional(Type.String({ description: "Optional command to verify build/test status" })),
  replace: Type.Optional(Type.Boolean({ default: false })),
  label: Type.Optional(Type.String({ description: "Optional label for loop instance" })),
});

// Session entry type for persistence
const RALPH_STATE_TYPE = "ralph-state";

export default function piRalphWiggum(pi: ExtensionAPI) {
  // In-memory state
  let state: RalphLoopState | null = null;

  // Load state from session entries
  function loadState(ctx: ExtensionContext): RalphLoopState | null {
    let latest: RalphLoopState | null = null;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === RALPH_STATE_TYPE) {
        latest = entry.data as RalphLoopState;
      }
    }
    return latest;
  }

  // Save state using pi.appendEntry
  async function saveState(newState: RalphLoopState) {
    state = newState;
    state.updatedAt = Date.now();
    await pi.appendEntry(RALPH_STATE_TYPE, state);
  }

  // Clear state by marking inactive
  async function clearState(reason: RalphLoopState["stopReason"] = "cancelled") {
    if (state) {
      state.active = false;
      state.stopReason = reason;
      await saveState(state);
      state = null;
    }
  }

  // Build prompt for Ralph iteration
  function buildPrompt(state: RalphLoopState): string {
    return `Ralph loop iteration ${state.iteration} of ${state.maxIterations}.

Primary task:
${state.task}

Rules:
- Inspect the current repository state before changing anything.
- Continue from existing work instead of restarting.
- Run relevant verification steps.
- If finished, output exactly: <promise>${state.completionPromise ?? "COMPLETE"}</promise>
- If not finished, make the next best incremental progress.
`;
  }

  // Try to detect completion in assistant output
  function isComplete(text: string | undefined, completionPromise?: string): boolean {
    if (!text) return false;
    const promise = completionPromise ?? "COMPLETE";
    return text.includes(`<promise>${promise}</promise>`);
  }

  // Send next iteration
  async function sendNextIteration(ctx: ExtensionContext) {
    if (!state) return;
    if (!state.active) return;
    if (state.iteration >= state.maxIterations) {
      state.active = false;
      state.stopReason = "max-iterations";
      await saveState(state);
      ctx.ui.notify(`Ralph loop stopped: reached max iterations ${state.maxIterations}`, "info");
      state = null;
      return;
    }

    state.iteration++;
    await saveState(state);

    // Expand @filename references in task
    let expandedTask = state.task;
    const regex = /"?@([\w./\\-]+)"?/g;
    let match;
    while ((match = regex.exec(state.task)) !== null) {
      let filePath = match[1];
      let readFilePath = path.join(process.cwd(), filePath);
      try {
        // Remove surrounding quotes if present
        readFilePath = readFilePath.replace(/^"|"$/g, "");
        const readResult = await pi.exec('cat', [`${readFilePath}`]);
        if (readResult && readResult.code === 0 && readResult.stdout) {
          // Replace full match including optional quotes
          const fullMatchRegex = new RegExp(`"?@${filePath.replace(/[.*+?^${}()|[\\]\/]/g, "\\$&")}"?`, "g");
          expandedTask = expandedTask.replace(fullMatchRegex, readResult.stdout);
        } else {
          ctx.ui.notify(`Failed to read file: ${filePath}`, "warning");
        }
      } catch (e) {
        ctx.ui.notify(`Error reading file ${filePath}: ${e.message}`, "error");
      }
    }

    // Build prompt using expanded task
    const prompt = buildPrompt({ ...state, task: expandedTask });
    pi.sendUserMessage(prompt, { deliverAs: "steer" });

    ctx.ui.notify(`Ralph loop iteration ${state.iteration} sent.`, "info");
  }

  // Command: /ralph-loop
  pi.registerCommand("ralph-loop", {
    description: "Start a Ralph loop in current session",
    parameters: RalphLoopCommandParams,
    handler: async (args, ctx) => {
      ctx.ui.notify(`Debug: raw args received: ${JSON.stringify(args)}`, "info");

      // Support raw string input with CLI flags
      let input: {
        task: string;
        completionPromise?: string;
        maxIterations?: number;
        retryOnError?: boolean;
        stopOnToolError?: boolean;
        verifyCommand?: string;
        replace?: boolean;
        label?: string;
      };

      if (typeof args === "string") {
        // Simple parser for flags --completion-promise, --max-iterations
        const matches: any = {};
        const regex = /--completion-promise\s+"([^"]+)"|--max-iterations\s+(\d+)/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(args))) {
          if (match[1]) matches.completionPromise = match[1];
          if (match[2]) matches.maxIterations = parseInt(match[2], 10);
        }

        // Remove flags from input to extract task
        const task = args.replace(/--completion-promise\s+"[^"]+"|--max-iterations\s+\d+/g, "").trim();

        input = {
          task: task,
          completionPromise: matches.completionPromise,
          maxIterations: matches.maxIterations,
          retryOnError: false,
          stopOnToolError: false,
          replace: false,
        };
      } else if (
        args && typeof args === "object" && typeof (args as any).task === "string"
      ) {
        input = args as unknown as typeof input;
      } else {
        ctx.ui.notify("Invalid or missing task argument", "error");
        return;
      }

      // Validate mandatory prompt
      if (!input.task.trim()) {
        ctx.ui.notify("Task prompt is required.", "error");
        return;
      }

      // Load existing state if present
      const currentState = loadState(ctx);
      if (currentState && currentState.active && !input.replace) {
        ctx.ui.notify("A Ralph loop is already active. Use --replace to restart.", "warning");
        return;
      }

      const loopState: RalphLoopState = {
        id: uuidv4(),
        active: true,
        task: input.task,
        completionPromise: input.completionPromise,
        maxIterations: input.maxIterations ?? 20,
        iteration: 0,
        retryOnError: input.retryOnError ?? false,
        stopOnToolError: input.stopOnToolError ?? false,
        verifyCommand: input.verifyCommand,
        lastAssistantText: undefined,
        lastError: undefined,
        lastQueuedAt: Date.now(),
        lastTurnCount: 0,
        stopReason: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveState(loopState);
      ctx.ui.notify("Started Ralph loop", "info");

      // Send first iteration prompt immediately
      await sendNextIteration(ctx);
    },
  });

  // Command: /cancel-ralph
  pi.registerCommand("cancel-ralph", {
    description: "Cancel active Ralph loop",
    handler: async (_args, ctx) => {
      if (!state || !state.active) {
        ctx.ui.notify("No active Ralph loop to cancel", "warning");
        return;
      }
      await clearState("cancelled");
      ctx.ui.notify("Cancelled Ralph loop", "info");
    },
  });

  // Command: /ralph-status
  pi.registerCommand("ralph-status", {
    description: "Show current Ralph loop status",
    handler: async (_args, ctx) => {
      if (!state) {
        ctx.ui.notify("No Ralph loop state found", "info");
        return;
      }
      const s = state;

      ctx.ui.notify(
        `Ralph Loop Status:\nActive: ${s.active}\nTask: ${s.task}\nIteration: ${s.iteration} / ${s.maxIterations}\nCompletion Promise: ${s.completionPromise}\nStop Reason: ${s.stopReason ?? "N/A"}`,
        "info"
      );
    },
  });

  // Monitor agent_end event to drive loop
  pi.on("agent_end", async (event, ctx) => {
    if (!state || !state.active) return;

    // Check if this is a new turn
    if (event.messages.length === 0) return;

    const assistantMsg = event.messages.find((m) => m.role === "assistant");
    if (!assistantMsg) return;

    const assistantText = assistantMsg.content
      .map((c) => (typeof c === "string" ? c : c.text))
      .join("");

    // Save last assistant text
    state.lastAssistantText = assistantText;

    // Check for completion
    if (isComplete(assistantText, state.completionPromise)) {
      state.active = false;
      state.stopReason = "completed";
      await saveState(state);
      ctx.ui.notify("Ralph loop completed successfully!", "success");
      state = null;
      return;
    }

    // Check iteration limits
    if (state.iteration >= state.maxIterations) {
      state.active = false;
      state.stopReason = "max-iterations";
      await saveState(state);
      ctx.ui.notify(`Ralph loop stopped: reached max iterations ${state.maxIterations}`, "warning");
      state = null;
      return;
    }

    // Optional verify command
    if (state.verifyCommand) {
      try {
        const execResult = await pi.exec("bash", ["-c", state.verifyCommand], { timeout: 30000 });
        if (execResult.code !== 0) {
          ctx.ui.notify(
            `Verification failed with exit code ${execResult.code}: ${execResult.stdout} ${execResult.stderr}`,
            "error"
          );
          if (!state.retryOnError) {
            state.active = false;
            state.stopReason = "error";
            await saveState(state);
            ctx.ui.notify("Ralph loop stopped due to verification failure", "error");
            state = null;
            return;
          }
        }
      } catch (err) {
        ctx.ui.notify(`Verification command error: ${err.message}`, "error");
        if (!state.retryOnError) {
          state.active = false;
          state.stopReason = "error";
          await saveState(state);
          ctx.ui.notify("Ralph loop stopped due to verification exception", "error");
          state = null;
          return;
        }
      }
    }

    // Check for tool errors if policy is set
    if (state.stopOnToolError && event.toolResults?.some((r) => r.isError)) {
      ctx.ui.notify("Tool error detected, stopping Ralph loop.", "error");
      state.active = false;
      state.stopReason = "error";
      await saveState(state);
      state = null;
      return;
    }

    // Queue next iteration
    await sendNextIteration(ctx);
  });

  // On session start reconstruct state
  pi.on("session_start", async (_event, ctx) => {
    const loaded = loadState(ctx);
    if (loaded) {
      state = loaded;
      if (state.active) {
        ctx.ui.notify(
          `Recovered active Ralph loop with iteration ${state.iteration}/${state.maxIterations}`,
          "info"
        );
      }
    }
  });

  // On shutdown clear state
  pi.on("session_shutdown", async (_event, ctx) => {
    if (state) {
      await saveState(state);
    }
  });
}
