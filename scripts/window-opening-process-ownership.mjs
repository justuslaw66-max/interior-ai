import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

function capture(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("close", (code) => resolve({
      code: code ?? 1,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
  });
}

export function parseLsofListenerOutput(output) {
  const listeners = [];
  let current = null;
  for (const line of output.split("\n").filter(Boolean)) {
    if (line.startsWith("p")) {
      if (current) listeners.push(current);
      current = { pid: Number(line.slice(1)), command: null, endpoint: null };
    } else if (current && line.startsWith("c")) current.command = line.slice(1);
    else if (current && line.startsWith("n")) current.endpoint = line.slice(1);
  }
  if (current) listeners.push(current);
  return listeners.filter((entry) => Number.isSafeInteger(entry.pid) && entry.pid > 1);
}

async function listenerEntries(port, run = capture) {
  const result = await run("lsof", [
    "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpcn",
  ]);
  if (result.code !== 0 && !result.stdout.trim()) return [];
  return parseLsofListenerOutput(result.stdout);
}

async function processCwd(pid, run = capture) {
  const result = await run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  if (result.code !== 0) return null;
  return result.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? null;
}

async function processExecutable(pid, run = capture) {
  const result = await run("lsof", ["-a", "-p", String(pid), "-d", "txt", "-Fn"]);
  if (result.code !== 0) return null;
  return result.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? null;
}

async function parentPid(pid, run = capture) {
  const result = await run("ps", ["-p", String(pid), "-o", "ppid="]);
  const parsed = Number(result.stdout.trim());
  return result.code === 0 && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function ancestry(pid, run = capture) {
  const values = [];
  let current = pid;
  while (current && current > 1 && values.length < 64) {
    if (values.includes(current)) break;
    values.push(current);
    current = await parentPid(current, run);
  }
  return values;
}

async function canonical(candidate) {
  try { return await fs.realpath(candidate); } catch { return path.resolve(candidate); }
}

export async function assertPortHasNoListener(port, run = capture) {
  const listeners = await listenerEntries(port, run);
  if (listeners.length) {
    throw new Error(`Selected port ${port} already has listener PID ${listeners[0].pid}.`);
  }
}

export async function resolveOwnedPortListener({ port, launcherPid, repositoryRoot, run = capture }) {
  const listeners = await listenerEntries(port, run);
  if (listeners.length !== 1) {
    throw new Error(`Expected one listener on port ${port}; found ${listeners.length}.`);
  }
  const listener = listeners[0];
  const [cwd, executable, processAncestry, expectedRoot] = await Promise.all([
    processCwd(listener.pid, run),
    processExecutable(listener.pid, run),
    ancestry(listener.pid, run),
    canonical(repositoryRoot),
  ]);
  if (!processAncestry.includes(launcherPid)) {
    throw new Error(`Listener PID ${listener.pid} does not descend from launcher PID ${launcherPid}.`);
  }
  if (!cwd || await canonical(cwd) !== expectedRoot) {
    throw new Error(`Listener cwd mismatch: ${cwd ?? "unavailable"}.`);
  }
  return {
    launcherPid,
    listenerPid: listener.pid,
    listenerCommand: listener.command,
    listenerEndpoint: listener.endpoint,
    listenerCwd: cwd,
    listenerExecutable: executable,
    ancestry: processAncestry,
    verifiedAt: new Date().toISOString(),
  };
}

export async function observePortListener({ port, expectedPid, expectedCwd, run = capture }) {
  const listeners = await listenerEntries(port, run);
  const listener = listeners.find((entry) => entry.pid === expectedPid);
  if (!listener || listeners.length !== 1) {
    throw new Error(`Listener PID ${expectedPid} did not exclusively own port ${port}.`);
  }
  const cwd = await processCwd(expectedPid, run);
  if (!cwd || await canonical(cwd) !== await canonical(expectedCwd)) {
    throw new Error(`Capture-time listener cwd mismatch: ${cwd ?? "unavailable"}.`);
  }
  return {
    observedAt: new Date().toISOString(),
    pid: expectedPid,
    port,
    cwd,
    command: listener.command,
    endpoint: listener.endpoint,
  };
}

export function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch (cause) {
    return cause?.code === "EPERM";
  }
}
