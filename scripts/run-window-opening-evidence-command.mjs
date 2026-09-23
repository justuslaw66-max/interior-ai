import fs from "node:fs/promises";
import path from "node:path";
import {
  collectCommandMetadata,
  createAttemptId,
  parseEvidenceCommandArguments,
  physicalFileRecord,
  redactCommandEvidence,
  spawnCapture,
} from "./window-opening-evidence-command.mjs";
import {
  buildWindowOpeningChildEnvironment,
  explicitEnvironmentValues,
} from "./window-opening-child-environment.mjs";

const parsed = parseEvidenceCommandArguments(process.argv.slice(2));
const cwd = process.cwd();
const startedAt = new Date();
const attemptId = parsed.explicitAttemptId ?? createAttemptId(startedAt);
const commandRoot = path.join(parsed.evidenceRoot, "commands", parsed.logicalCommandId);
const attemptRoot = path.join(commandRoot, attemptId);
await fs.mkdir(commandRoot, { recursive: true });
await fs.mkdir(attemptRoot, { recursive: false });

const childEnvironment = buildWindowOpeningChildEnvironment({
  hostEnvironment: process.env,
  values: explicitEnvironmentValues(
    process.env,
    parsed.environmentNames,
    "explicitly selected evidence-command input"
  ),
});
const metadata = await collectCommandMetadata(parsed.argv, cwd, childEnvironment.environment);
const startedNs = process.hrtime.bigint();
const execution = await spawnCapture(parsed.argv[0], parsed.argv.slice(1), {
  cwd,
  env: childEnvironment.environment,
});
const endedAt = new Date();
const redacted = redactCommandEvidence({
  argv: parsed.argv,
  stdout: execution.stdout,
  stderr: execution.stderr,
  environment: childEnvironment.environment,
});
const stdoutPath = path.join(attemptRoot, "stdout.log");
const stderrPath = path.join(attemptRoot, "stderr.log");
await fs.writeFile(stdoutPath, redacted.stdout, { flag: "wx", mode: 0o644 });
await fs.writeFile(stderrPath, redacted.stderr, { flag: "wx", mode: 0o644 });
const record = {
  schemaVersion: "window-opening-command-attempt/v2",
  logicalCommandId: parsed.logicalCommandId,
  attemptId,
  argv: redacted.argv,
  workingDirectory: cwd,
  environment: childEnvironment.records,
  environmentNames: childEnvironment.names,
  classification: parsed.classification,
  required: parsed.classification === "required",
  ...metadata,
  startedAt: startedAt.toISOString(),
  endedAt: endedAt.toISOString(),
  durationMs: Number(process.hrtime.bigint() - startedNs) / 1e6,
  exitCode: execution.code,
  signal: execution.signal,
  stdout: await physicalFileRecord(stdoutPath, parsed.evidenceRoot),
  stderr: await physicalFileRecord(stderrPath, parsed.evidenceRoot),
};
const recordPath = path.join(attemptRoot, "record.json");
await fs.writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, {
  flag: "wx",
  mode: 0o644,
});
process.stdout.write(redacted.stdout);
process.stderr.write(redacted.stderr);
process.stdout.write(`${JSON.stringify({
  attemptId,
  recordPath: path.relative(parsed.evidenceRoot, recordPath),
})}\n`);
process.exitCode = execution.code;
