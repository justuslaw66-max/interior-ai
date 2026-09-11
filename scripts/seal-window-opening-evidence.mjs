import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildWindowOpeningChildEnvironment } from "./window-opening-child-environment.mjs";
import { physicalFileRecord, sha256, spawnCapture } from "./window-opening-evidence-command.mjs";
import { collectWorkingTreeIdentity } from "./window-opening-evidence-manifest.mjs";

function parseOptions(args) {
  if (args.length !== 4 || args[0] !== "--root" || args[2] !== "--metadata") {
    throw new Error("Usage: seal-window-opening-evidence.mjs --root <root> --metadata <path>");
  }
  return { evidenceRoot: path.resolve(args[1]), metadataPath: path.resolve(args[3]) };
}

const { evidenceRoot, metadataPath } = parseOptions(process.argv.slice(2));
const repositoryRoot = process.cwd();
const startedAt = new Date();
const attemptId = `${startedAt.toISOString().replace(/[-:.]/g, "")}-${randomUUID()}`;
const attemptRoot = path.join(evidenceRoot, "sealing", attemptId);
const journalPath = path.join(evidenceRoot, "seal-attempt-journal.ndjson");
await fs.mkdir(path.dirname(attemptRoot), { recursive: true });
await fs.mkdir(attemptRoot, { recursive: false });
const finalizerArgv = [
  process.execPath,
  path.join(repositoryRoot, "scripts/finalize-window-opening-evidence-manifest.mjs"),
  "--root", evidenceRoot,
  "--metadata", metadataPath,
];
const sourceIdentity = await collectWorkingTreeIdentity(repositoryRoot);
const startedRecord = {
  schemaVersion: "window-opening-seal-attempt/v1",
  event: "seal_attempt_started",
  attemptId,
  startedAt: startedAt.toISOString(),
  sourceCompleteStateIdentitySha256: sourceIdentity.completeStateIdentitySha256,
  evidenceRoot,
  finalizerArgv,
};
const startedRecordPath = path.join(attemptRoot, "started.json");
await fs.writeFile(startedRecordPath, `${JSON.stringify(startedRecord, null, 2)}\n`, {
  flag: "wx", mode: 0o644,
});
await fs.appendFile(journalPath, `${JSON.stringify(startedRecord)}\n`, { mode: 0o644 });

const environment = buildWindowOpeningChildEnvironment({ hostEnvironment: process.env });
const execution = await spawnCapture(finalizerArgv[0], finalizerArgv.slice(1), {
  cwd: repositoryRoot,
  env: environment.environment,
});
const stdoutPath = path.join(attemptRoot, "stdout.log");
const stderrPath = path.join(attemptRoot, "stderr.log");
await Promise.all([
  fs.writeFile(stdoutPath, execution.stdout, { flag: "wx", mode: 0o644 }),
  fs.writeFile(stderrPath, execution.stderr, { flag: "wx", mode: 0o644 }),
]);
const manifestPath = path.join(evidenceRoot, "manifest.json");
let manifestPresent = false;
try { manifestPresent = (await fs.lstat(manifestPath)).isFile(); } catch { manifestPresent = false; }
const succeeded = execution.code === 0 && execution.signal === null && manifestPresent;
const stderrLines = execution.stderr.toString("utf8").trim().split("\n").filter(Boolean);
const terminalRecord = {
  schemaVersion: "window-opening-seal-attempt/v1",
  event: succeeded ? "seal_succeeded" : "seal_failed",
  attemptId,
  startedAt: startedRecord.startedAt,
  endedAt: new Date().toISOString(),
  sourceCompleteStateIdentitySha256: sourceIdentity.completeStateIdentitySha256,
  evidenceRoot,
  finalizerArgv,
  exitCode: execution.code,
  signal: execution.signal,
  stdout: await physicalFileRecord(stdoutPath, evidenceRoot),
  stderr: await physicalFileRecord(stderrPath, evidenceRoot),
  failureReason: succeeded ? null : stderrLines.find((line) =>
    /^(?:Error|[A-Za-z]+Error(?: \[[^\]]+\])?):/.test(line)
  ) ??
    stderrLines.at(-1) ??
    `Finalizer exited ${execution.code}${execution.signal ? ` with ${execution.signal}` : ""}.`,
  manifestProduced: manifestPresent,
};
await fs.appendFile(journalPath, `${JSON.stringify(terminalRecord)}\n`, { mode: 0o644 });
const terminalPath = path.join(attemptRoot, "terminal.json");
await fs.writeFile(terminalPath, `${JSON.stringify(terminalRecord, null, 2)}\n`, {
  flag: "wx", mode: 0o644,
});
process.stdout.write(execution.stdout);
process.stderr.write(execution.stderr);
process.stdout.write(`${JSON.stringify({
  attemptId,
  event: terminalRecord.event,
  journalPath,
  journalSha256: sha256(await fs.readFile(journalPath)),
  terminalPath,
}, null, 2)}\n`);
process.exitCode = succeeded ? 0 : execution.code || 1;
