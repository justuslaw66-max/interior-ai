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
    // A command that cannot start (missing lsof or ps) reads as a failed run, not a crash.
    child.on("error", (error) => resolve({ code: 127, stdout: "", stderr: String(error) }));
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

const lsofListenerArgs = (port) => ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpcn"];
const lsofCwdArgs = (pid) => ["-a", "-p", String(pid), "-d", "cwd", "-Fn"];

async function listenerEntries(port, run = capture) {
  const result = await run("lsof", lsofListenerArgs(port));
  if (result.code !== 0 && !result.stdout.trim()) return [];
  return parseLsofListenerOutput(result.stdout);
}

async function processCwd(pid, run = capture) {
  const result = await run("lsof", lsofCwdArgs(pid));
  if (result.code !== 0) return null;
  return result.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? null;
}

async function processExecutable(pid, run = capture) {
  const result = await run("lsof", ["-a", "-p", String(pid), "-d", "txt", "-Fn"]);
  if (result.code !== 0) return null;
  return result.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? null;
}

// On Linux the listener is read from /proc, not lsof. Next names its server process
// "next-server (v16.2.11)". Linux keeps the first 15 bytes, "next-server (v1", so the name
// field of /proc/<pid>/stat has an unmatched "(". lsof 4.95 (Ubuntu 24.04) then skips the
// process entirely: it lists none of its sockets, not even with -p. macOS lsof reads process
// names through libproc and is unaffected, so the Mac keeps lsof.
const linuxProc = Object.freeze({
  readText: (file) => fs.readFile(file, "utf8"),
  list: (directory) => fs.readdir(directory),
  link: (file) => fs.readlink(file),
});
const PROC_TCP_LISTEN_STATE = "0A";

async function optional(read) {
  try { return await read(); } catch { return null; }
}

// /proc/net/tcp{,6} print each address as 32-bit words in host (little-endian) byte order.
function procAddress(hex) {
  const bytes = (hex.match(/.{8}/g) ?? []).flatMap((word) => [6, 4, 2, 0].map(
    (offset) => Number.parseInt(word.slice(offset, offset + 2), 16)
  ));
  if (bytes.length === 4) return bytes.join(".");
  const groups = [];
  for (let index = 0; index < bytes.length; index += 2) {
    groups.push(((bytes[index] << 8) | bytes[index + 1]).toString(16));
  }
  return new URL(`http://[${groups.join(":")}]/`).hostname;
}

export function parseProcNetTcpListeners(table, port) {
  const listeners = [];
  for (const line of table.split("\n").slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 10 || fields[3] !== PROC_TCP_LISTEN_STATE) continue;
    const [address, portHex] = fields[1].split(":");
    if (Number.parseInt(portHex, 16) !== port) continue;
    listeners.push({ inode: fields[9], endpoint: `${procAddress(address)}:${port}` });
  }
  return listeners;
}

async function procSocketOwners(sockets, proc) {
  const owners = new Map(sockets.map((socket) => [`socket:[${socket.inode}]`, []]));
  for (const name of await proc.list("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    const descriptors = await optional(() => proc.list(`/proc/${name}/fd`)) ?? [];
    for (const descriptor of descriptors) {
      const target = await optional(() => proc.link(`/proc/${name}/fd/${descriptor}`));
      const pids = owners.get(target);
      if (pids && !pids.includes(Number(name))) pids.push(Number(name));
    }
  }
  return owners;
}

// One entry per owning process, as lsof lists them. A listening socket whose owner this user
// cannot inspect still counts, with pid null, so a port held by another user is never free.
async function procListenerEntries(port, proc) {
  const tables = await Promise.all(["/proc/net/tcp", "/proc/net/tcp6"].map(
    (file) => optional(() => proc.readText(file))
  ));
  const sockets = tables.flatMap((table) => table ? parseProcNetTcpListeners(table, port) : []);
  if (!sockets.length) return [];
  const owners = await procSocketOwners(sockets, proc);
  const entries = [];
  for (const socket of sockets) {
    const pids = owners.get(`socket:[${socket.inode}]`);
    if (!pids.length) entries.push({ pid: null, command: null, endpoint: socket.endpoint });
    for (const pid of pids) {
      const command = (await optional(() => proc.readText(`/proc/${pid}/comm`)))?.trim() ?? null;
      entries.push({ pid, command, endpoint: socket.endpoint });
    }
  }
  return entries;
}

function processInspector({ run = capture, platform = process.platform, proc = linuxProc } = {}) {
  if (platform === "linux") {
    return {
      source: "linux-proc",
      listeners: (port) => procListenerEntries(port, proc),
      cwd: (pid) => optional(() => proc.link(`/proc/${pid}/cwd`)),
      executable: (pid) => optional(() => proc.link(`/proc/${pid}/exe`)),
    };
  }
  return {
    source: "lsof",
    listeners: (port) => listenerEntries(port, run),
    cwd: (pid) => processCwd(pid, run),
    executable: (pid) => processExecutable(pid, run),
  };
}

// The raw listener and cwd readings a capture records, in lsof's -F field format (p, c, n):
// lsof's own output on macOS, and /proc readings written in that format on Linux, so the
// evidence verifier reads both. `source` says which.
export async function readListenerObservation({ port, pid, ...host }) {
  const inspector = processInspector(host);
  if (inspector.source === "lsof") {
    const run = host.run ?? capture;
    const listener = await run("lsof", lsofListenerArgs(port));
    const cwd = await run("lsof", lsofCwdArgs(pid));
    return { source: inspector.source, listenerOutput: listener.stdout, cwdOutput: cwd.stdout };
  }
  const listeners = await inspector.listeners(port);
  if (listeners.some((entry) => entry.pid === null)) {
    throw new Error(`The listener on port ${port} belongs to a process this user cannot inspect.`);
  }
  const cwd = await inspector.cwd(pid);
  return {
    source: inspector.source,
    listenerOutput: listeners.map((entry) => `p${entry.pid}\nc${entry.command ?? ""}\nn${entry.endpoint}\n`).join(""),
    cwdOutput: cwd ? `p${pid}\nn${cwd}\n` : "",
  };
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

export async function assertPortHasNoListener(port, host = {}) {
  const listeners = await processInspector(host).listeners(port);
  if (listeners.length) {
    throw new Error(`Selected port ${port} already has listener PID ${listeners[0].pid ?? "unknown"}.`);
  }
}

export async function resolveOwnedPortListener({ port, launcherPid, repositoryRoot, ...host }) {
  const inspector = processInspector(host);
  const listeners = await inspector.listeners(port);
  if (listeners.length !== 1) {
    throw new Error(`Expected one listener on port ${port}; found ${listeners.length}.`);
  }
  const listener = listeners[0];
  if (listener.pid === null) {
    throw new Error(`The listener on port ${port} belongs to a process this user cannot inspect.`);
  }
  const [cwd, executable, processAncestry, expectedRoot] = await Promise.all([
    inspector.cwd(listener.pid),
    inspector.executable(listener.pid),
    ancestry(listener.pid, host.run),
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

export async function observePortListener({ port, expectedPid, expectedCwd, ...host }) {
  const inspector = processInspector(host);
  const listeners = await inspector.listeners(port);
  const listener = listeners.find((entry) => entry.pid === expectedPid);
  if (!listener || listeners.length !== 1) {
    throw new Error(`Listener PID ${expectedPid} did not exclusively own port ${port}.`);
  }
  const cwd = await inspector.cwd(expectedPid);
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
