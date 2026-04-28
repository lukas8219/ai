/**
 * SSH Remote Execution Example
 *
 * Demonstrates delegating tool operations to a remote machine via SSH.
 * When --ssh is provided, read/write/edit/bash run on the remote.
 *
 * Usage:
 *   pi -e ./ssh.ts --ssh user@host
 *   pi -e ./ssh.ts --ssh user@host:/remote/path
 *
 * Requirements:
 *   - SSH key-based auth (no password prompts)
 *   - bash on remote
 */

import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	type BashOperations,
	createBashTool,
	createReadTool,
	type ReadOperations,
} from "@mariozechner/pi-coding-agent";
import { executeSafeCommand, resolveSshRemote, sshExec } from './utils/ssh-utils.ts'

function createRemoteReadOps(remote: string, remoteCwd: string, localCwd: string): ReadOperations {
	return {
		readFile: (p) => sshExec(remote, `sudo cat ${p}`),
		access: () => sshExec(remote, `sudo test -r ${remoteCwd}`).then(() => { }),
	};
}

function createRemoteBashOps(remote: string, _remoteCwd: string, _localCwd: string): BashOperations {
	return {
		exec: (command, _cwd, { onData, signal, timeout }) => executeSafeCommand(remote, command, { onData, signal, timeout })
	}
}

export default function(pi: ExtensionAPI) {
	pi.registerFlag("ssh", { description: "SSH remote: user@host or user@host:/path", type: "string" });

	const localCwd = process.cwd();
	const localRead = createReadTool(localCwd);
	const localBash = createBashTool(localCwd);

	// Resolved lazily on session_start (CLI flags not available during factory)
	let resolvedSsh: { remote: string; remoteCwd: string } | null = null;

	const getSsh = () => resolvedSsh;

	pi.registerTool({
		...localRead,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = await resolveSshRemote(pi);
			if (ssh) {
				const tool = createReadTool(localCwd, {
					operations: createRemoteReadOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localRead.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localBash,
		async execute(id, params, signal, onUpdate, _ctx) {
			const ssh = await resolveSshRemote(pi);
			if (ssh) {
				const tool = createBashTool(localCwd, {
					operations: createRemoteBashOps(ssh.remote, ssh.remoteCwd, localCwd),
				});
				return tool.execute(id, params, signal, onUpdate);
			}
			return localBash.execute(id, params, signal, onUpdate);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		// Resolve SSH config now that CLI flags are available
		resolvedSsh = await resolveSshRemote(pi);
		if (!resolvedSsh) return;
		ctx.ui.setStatus("ssh", ctx.ui.theme.fg("accent", `SSH: ${resolvedSsh.remote}:${resolvedSsh.remoteCwd}`));
		ctx.ui.notify(`SSH mode: ${resolvedSsh.remote}:${resolvedSsh.remoteCwd}`, "info");
	});

	// Handle user ! commands via SSH
	pi.on("user_bash", async (_event) => {
		const ssh = await resolveSshRemote(pi);
		if (!ssh) return; // No SSH, use local execution
		return { operations: createRemoteBashOps(ssh.remote, ssh.remoteCwd, localCwd) };
	});

	// Replace local cwd with remote cwd in system prompt
	pi.on("before_agent_start", async (event) => {
		const ssh = await resolveSshRemote(pi);
		if (ssh) {
			const modified = event.systemPrompt.replace(
				`Current working directory: ${localCwd}`,
				`Current working directory: ${ssh.remoteCwd} (via SSH: ${ssh.remote})`,
			);
			return { systemPrompt: modified };
		}
	});
}

