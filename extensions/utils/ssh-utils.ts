import { spawn } from "node:child_process";
import fs from 'fs';
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isAllowedCommand, allowedCommands } from "./is-allowed-commands";

export function sshExec(remote: string, command: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", [remote, command], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on("data", (data) => chunks.push(data));
    child.stderr.on("data", (data) => errChunks.push(data));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`SSH failed (${code}): ${Buffer.concat(errChunks).toString()}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
  });
}

let RESOLVED_SSH: { remote: string, remoteCwd: string } | undefined = undefined;

//Make sure to only call this after session_start event!
export async function resolveSshRemote(pi: ExtensionAPI) {
  const readFromCache = (path): string | undefined => {
    if (fs.existsSync(path)) {
      return fs.readFileSync(path).toString()
    }
    return undefined;
  }
  const arg = pi.getFlag("ssh") as string | undefined || readFromCache('./cache');
  if (arg) {
    fs.writeFileSync('./cache', arg);
    if (arg.includes(":")) {
      const [remote, path] = arg.split(":");
      RESOLVED_SSH = { remote, remoteCwd: path };
      return RESOLVED_SSH;
    } else {
      const remote = arg;
      const pwd = `${await sshExec(remote, "pwd")}`.trim();
      RESOLVED_SSH = { remote, remoteCwd: pwd };
      return RESOLVED_SSH;
    }
  }
  return RESOLVED_SSH
}

export async function executeSafeCommand(remote, command, { signal, onData, timeout }): Promise<{ exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const { isAllowed, executedCommands } = isAllowedCommand(command);
    if (!isAllowed) {
      return reject(new Error(`${command} has some unallowed command! Commands tried to be executed ${Array.from(executedCommands)} Allowed Commands ${Array.from(allowedCommands)} NOTES: 'xargs' is very limited. It won't support any flags!`));
    }
    const cmd = `sudo ${command}`;
    const child = spawn("ssh", [remote, cmd], { stdio: ["ignore", "pipe", "pipe"] });
    let timedOut = false;
    const timer = timeout
      ? setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeout * 1000)
      : undefined;
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(e);
    });
    const onAbort = () => child.kill();
    signal?.addEventListener("abort", onAbort, { once: true });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) reject(new Error("aborted"));
      else if (timedOut) reject(new Error(`timeout:${timeout}`));
      else resolve({ exitCode: code });
    });
  })
}

export async function executeSafeCommandInContext(pi: ExtensionAPI, command, { signal, onData, timeout }) {
  const ssh = await resolveSshRemote(pi);
  if (ssh) {
    return executeSafeCommand(ssh.remote, command, { signal, onData, timeout });
  }
  throw new Error('Missing remote flag!');
}
