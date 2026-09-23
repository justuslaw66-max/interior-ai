import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { windowOpeningPrerequisite, windowOpeningTarget } from "./window-opening-browser-context.mjs";

const execute = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function inspectLocalListener(context) {
  if (context.owner !== "local-mounted") throw windowOpeningPrerequisite("local listener proof requires the local mounted owner.");
  const bytes = await fs.readFile(context.serverContextPath);
  const server = JSON.parse(bytes.toString("utf8"));
  if (sha256(bytes) !== context.serverContextSha256 || server.runRoot !== context.runRoot ||
      server.runId !== context.runId || server.baseUrl !== context.baseURL ||
      server.sourceCompleteStateIdentitySha256 !== context.sourceIdentity) {
    throw windowOpeningPrerequisite("local server context changed after setup.");
  }
  const listener = await execute("lsof", ["-nP", `-iTCP:${server.port}`, "-sTCP:LISTEN", "-Fpcn"]);
  const pids = listener.stdout.split("\n").filter((line) => line.startsWith("p")).map((line) => Number(line.slice(1)));
  if (pids.length !== 1 || pids[0] !== server.listenerPid) {
    throw windowOpeningPrerequisite("local listener PID/port/cwd no longer belongs to the mounted run.");
  }
  const cwdResult = await execute("lsof", ["-a", "-p", String(server.listenerPid), "-d", "cwd", "-Fn"]);
  const cwd = cwdResult.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1);
  if (pids.length !== 1 || pids[0] !== server.listenerPid || !cwd ||
      await fs.realpath(cwd) !== await fs.realpath(server.serverCwd)) {
    throw windowOpeningPrerequisite("local listener PID/port/cwd no longer belongs to the mounted run.");
  }
  return { server, bytes, observation: { observedAt: new Date().toISOString(),
    pid: server.listenerPid, port: server.port, cwd, listenerOutput: listener.stdout,
    cwdOutput: cwdResult.stdout, listenerOutputSha256: sha256(listener.stdout) } };
}

export async function observeWindowOpeningLocalListener(context) {
  try {
    return await inspectLocalListener(context);
  } catch {
    throw windowOpeningPrerequisite("local listener PID/port/cwd or frozen server context is missing or mismatched; use the owned mounted runner.");
  }
}

export async function windowOpeningCaptureProvenance(context, screenshotId, targetURL) {
  if (windowOpeningTarget(new URL(targetURL).origin) !== context.baseURL) {
    throw windowOpeningPrerequisite("capture navigated away from its owner's target origin.");
  }
  if (context.owner !== "local-mounted") {
    if (!["release.gate-a3", "advisory.full-e2e"].includes(context.owner) ||
        (context.owner === "release.gate-a3") !== Boolean(context.deployment)) {
      throw windowOpeningPrerequisite("capture has missing or contradictory canonical provenance.");
    }
    return { execution: context, runId: context.runId };
  }
  const { server, bytes, observation } = await observeWindowOpeningLocalListener(context);
  const binding = { screenshotId, serverContextSha256: sha256(bytes), observedAt: observation.observedAt,
    pid: observation.pid, port: observation.port, cwd: observation.cwd,
    listenerOutputSha256: observation.listenerOutputSha256 };
  const record = { schemaVersion: "window-opening-listener-observation/v1", ...binding,
    listenerOutput: observation.listenerOutput, cwdOutput: observation.cwdOutput,
    bindingSha256: sha256(JSON.stringify(binding)) };
  const recordPath = path.join(context.runRoot, "listener-observations", `${screenshotId}.json`);
  await fs.mkdir(path.dirname(recordPath), { recursive: true });
  const recordBytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
  await fs.writeFile(recordPath, recordBytes, { flag: "wx", mode: 0o644 });
  return { runId: server.runId, listenerPid: server.listenerPid, launcherPid: server.launcherPid,
    serverCwd: server.serverCwd, serverExecutable: server.serverExecutable, serverPort: server.port,
    serverContext: { absolutePath: context.serverContextPath,
      evidenceRootRelativePath: path.relative(context.evidenceRoot, context.serverContextPath), sha256: sha256(bytes) },
    sourceCompleteStateIdentitySha256: context.sourceIdentity,
    listenerOwnership: { observedAt: observation.observedAt, pid: observation.pid, port: observation.port,
      cwd: observation.cwd, listenerOutputSha256: observation.listenerOutputSha256,
      bindingSha256: record.bindingSha256, record: { absolutePath: recordPath,
        evidenceRootRelativePath: path.relative(context.evidenceRoot, recordPath),
        bytes: recordBytes.byteLength, sha256: sha256(recordBytes) } } };
}
