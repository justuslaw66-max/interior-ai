import { spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import {
  PHASE8_CHILD_COMPLETION_FILE,
  PHASE8_CHILD_REPORT_FILE,
  PHASE8_FINAL_COMPLETION_FILE,
  PHASE8_FINAL_REPORT_FILE,
  PHASE8_MAX_OUTPUT_BYTES,
  PHASE8_MAX_REPORT_BYTES,
  PHASE8_MAX_RETAINED_RUN_DIRECTORIES,
  PHASE8_STDERR_FILE,
  PHASE8_STDOUT_FILE,
  PHASE8_VALIDATION_FAILURE_FILE,
  sha256Bytes,
  type Phase8BenchmarkEvidence,
  type Phase8BenchmarkMode,
} from "./phase8-project-benchmark-contract";
import {
  assertPhase8SourceIsClean,
  createPhase8FixtureSummaries,
  phase8BenchmarkCommand,
  phase8ProjectBenchmarkBudgets,
  readPhase8GitIdentity,
  readPhase8SourceBindings,
} from "./phase8-project-benchmark-context";
import {
  atomicWriteJson,
  readBoundedFile,
  prunePhase8EvidenceRuns,
  sanitizePhase8Diagnostic,
  writeCapturedOutput,
  writeHashedEvidence,
} from "./phase8-project-benchmark-evidence-io";
import {
  parsePhase8EvidenceJson,
  validatePhase8ChildInvocation,
  type Phase8CompletionMarker,
} from "./phase8-project-benchmark-validator";

function currentNpmVersion(repositoryRoot: string): string | null {
  try {
    return execFileSync("npm", ["--version"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

function safeTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, "");
}

function createRunDirectory(repositoryRoot: string, nonce: string): {
  absolutePath: string;
  relativePath: string;
} {
  const evidenceRoot = path.join(repositoryRoot, ".local", "phase8-project-benchmark-evidence");
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  prunePhase8EvidenceRuns(evidenceRoot, PHASE8_MAX_RETAINED_RUN_DIRECTORIES - 1);
  const name = `${safeTimestamp(new Date())}-${process.pid}-${nonce.slice(0, 12)}`;
  const absolutePath = path.join(evidenceRoot, name);
  mkdirSync(absolutePath, { recursive: false, mode: 0o700 });
  return {
    absolutePath,
    relativePath: path.relative(repositoryRoot, absolutePath).split(path.sep).join("/"),
  };
}

function parseCompletionMarker(filePath: string): Phase8CompletionMarker | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(
      readBoundedFile(filePath, PHASE8_MAX_REPORT_BYTES).toString("utf8"),
    ) as Phase8CompletionMarker;
  } catch {
    return null;
  }
}

function writeValidationFailure(
  runDirectory: string,
  details: {
    nonce: string;
    sourceCommitSha: string;
    sourceTreeSha: string;
    childPid: number | null;
    childExitCode: number | null;
    childSignal: NodeJS.Signals | null;
    childStdoutSha256: string;
    childStderrSha256: string;
    childReportSha256: string | null;
    issues: string[];
  },
): void {
  writeHashedEvidence(path.join(runDirectory, PHASE8_VALIDATION_FAILURE_FILE), {
    schema: "interior-ai.phase8-project-benchmark-validation-failure.v1",
    ...details,
    parentValidated: false,
    finalPassed: false,
  });
}

function replayChildOutput(stdout: Buffer, stderr: Buffer): void {
  if (stdout.byteLength > 0) process.stdout.write(stdout);
  if (stderr.byteLength > 0) process.stderr.write(stderr);
}

function main(): void {
  const repositoryRoot = process.cwd();
  const mode: Phase8BenchmarkMode = process.argv.includes("--check") ? "check" : "report";
  const jsonOutput = process.argv.includes("--json");
  const nonce = randomBytes(24).toString("hex");
  assertPhase8SourceIsClean(repositoryRoot);
  const runDirectory = createRunDirectory(repositoryRoot, nonce);
  const gitIdentity = readPhase8GitIdentity(repositoryRoot);
  const command = phase8BenchmarkCommand(mode, jsonOutput);
  const npmVersion = currentNpmVersion(repositoryRoot);
  const invocationStartedAtMs = Date.now();
  const childArguments = [
    path.join(repositoryRoot, "node_modules", "ts-node", "dist", "bin.js"),
    "--transpile-only",
    "--compiler-options",
    '{"module":"CommonJS","moduleResolution":"node"}',
    "-r",
    "tsconfig-paths/register",
    "scripts/benchmark-phase8-projects.ts",
    "--nonce",
    nonce,
    "--run-directory",
    runDirectory.absolutePath,
    "--source-commit",
    gitIdentity.sourceCommitSha,
    "--source-tree",
    gitIdentity.sourceTreeSha,
    "--parent-pid",
    String(process.pid),
    "--npm-version",
    npmVersion ?? "unavailable",
    "--mode",
    mode,
    ...(jsonOutput ? ["--json"] : []),
  ];
  const child = spawnSync(process.execPath, childArguments, {
    cwd: repositoryRoot,
    encoding: "buffer",
    maxBuffer: PHASE8_MAX_OUTPUT_BYTES,
    windowsHide: true,
  });
  const invocationEndedAtMs = Date.now();
  const stdout = child.stdout ?? Buffer.alloc(0);
  const stderr = child.stderr ?? Buffer.alloc(0);
  let stdoutSha256: string;
  let stderrSha256: string;
  try {
    stdoutSha256 = writeCapturedOutput(
      path.join(runDirectory.absolutePath, PHASE8_STDOUT_FILE),
      stdout,
    );
    stderrSha256 = writeCapturedOutput(
      path.join(runDirectory.absolutePath, PHASE8_STDERR_FILE),
      stderr,
    );
  } catch (error) {
    replayChildOutput(stdout, stderr);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  const issues: string[] = [];
  if (child.error) issues.push(`benchmark child spawn failed: ${child.error.message}`);
  const childReportPath = path.join(runDirectory.absolutePath, PHASE8_CHILD_REPORT_FILE);
  let childReportBytes: Buffer | null = null;
  if (existsSync(childReportPath)) {
    try {
      childReportBytes = readBoundedFile(childReportPath, PHASE8_MAX_REPORT_BYTES);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  const parsed = parsePhase8EvidenceJson(childReportBytes);
  issues.push(...parsed.issues);
  const completionMarker = parseCompletionMarker(
    path.join(runDirectory.absolutePath, PHASE8_CHILD_COMPLETION_FILE),
  );
  const childReportSha256 = childReportBytes ? sha256Bytes(childReportBytes) : null;
  let recomputedThresholdPassed = false;
  let validatedEvidence: Phase8BenchmarkEvidence | null = null;
  if (parsed.value && childReportSha256) {
    const sourceBindings = readPhase8SourceBindings(repositoryRoot);
    const fixtures = createPhase8FixtureSummaries();
    const thresholds = phase8ProjectBenchmarkBudgets();
    const validation = validatePhase8ChildInvocation({
      value: parsed.value,
      expected: {
        nonce,
        sourceCommitSha: gitIdentity.sourceCommitSha,
        sourceTreeSha: gitIdentity.sourceTreeSha,
        childPid: child.pid ?? -1,
        parentPid: process.pid,
        command,
        sourceBindings,
        fixtures,
        thresholds,
        invocationStartedAtMs,
        invocationEndedAtMs,
        childReportSha256,
        completionMarker,
      },
      childExitCode: child.status,
      childSignal: child.signal,
    });
    recomputedThresholdPassed = validation.recomputedThresholdPassed;
    validatedEvidence = validation.evidence;
    issues.push(...validation.issues);
  } else if (child.signal) {
    issues.push(`benchmark child terminated by signal ${child.signal}`);
  }

  if (issues.length > 0 || !validatedEvidence) {
    try {
      writeValidationFailure(runDirectory.absolutePath, {
        nonce,
        sourceCommitSha: gitIdentity.sourceCommitSha,
        sourceTreeSha: gitIdentity.sourceTreeSha,
        childPid: child.pid ?? null,
        childExitCode: child.status,
        childSignal: child.signal,
        childStdoutSha256: stdoutSha256,
        childStderrSha256: stderrSha256,
        childReportSha256,
        issues: (issues.length > 0 ? issues : ["child result is missing"]).map((issue) =>
          sanitizePhase8Diagnostic(issue, repositoryRoot),
        ),
      });
    } catch (error) {
      issues.push(
        `parent validation-evidence write failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    replayChildOutput(stdout, stderr);
    for (const issue of issues) console.error(`Phase 8 evidence validation failed: ${issue}`);
    console.error(`Phase 8 evidence directory: ${runDirectory.relativePath}`);
    process.exitCode = child.status && child.status !== 0 ? child.status : 2;
    return;
  }

  const childPassed = validatedEvidence.integrity.childCalculated.passed;
  const finalEvidence: Phase8BenchmarkEvidence = {
    ...validatedEvidence,
    integrity: {
      ...validatedEvidence.integrity,
      parentValidated: {
        passed: true,
        issues: [],
        recomputedThresholdPassed,
      },
      childStdoutSha256: stdoutSha256,
      childStderrSha256: stderrSha256,
      evidenceSha256Sidecar: `${PHASE8_FINAL_REPORT_FILE}.sha256`,
      finalPassed: childPassed && child.status === 0,
    },
  };
  let finalResult: ReturnType<typeof writeHashedEvidence>;
  try {
    finalResult = writeHashedEvidence(
      path.join(runDirectory.absolutePath, PHASE8_FINAL_REPORT_FILE),
      finalEvidence,
    );
    atomicWriteJson(path.join(runDirectory.absolutePath, PHASE8_FINAL_COMPLETION_FILE), {
      schema: "interior-ai.phase8-project-benchmark-parent-completion.v1",
      nonce,
      reportFile: PHASE8_FINAL_REPORT_FILE,
      reportSha256: finalResult.sha256,
    });
  } catch (error) {
    replayChildOutput(stdout, stderr);
    console.error(
      `Phase 8 parent evidence write failed after child result ${child.status}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    console.error(`Phase 8 evidence directory: ${runDirectory.relativePath}`);
    process.exitCode = child.status && child.status !== 0 ? child.status : 2;
    return;
  }
  replayChildOutput(stdout, stderr);
  console.error(
    `Phase 8 evidence: ${runDirectory.relativePath}/${PHASE8_FINAL_REPORT_FILE} (${finalResult.sha256})`,
  );
  process.exitCode = child.status ?? 2;
}

main();
