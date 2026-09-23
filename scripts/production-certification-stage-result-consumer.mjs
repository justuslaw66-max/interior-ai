import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { canonicalJsonBytes } from "./production-certification-contract.mjs";
import {
  PRODUCTION_CERTIFICATION_STAGE_RESULT_NONCE_ENV,
  captureCertificationStageResultInvocation,
  certificationStageResultSensitiveValues,
  consumeCertificationStageResult,
  createCertificationStageResultNonce,
  validateCertificationStageResult,
  parseCertificationStageResult,
} from "./production-certification-stage-result-contract.mjs";

export class CertificationStageResultConsumptionError extends Error {
  constructor(message, diagnostics = {}) {
    super(message);
    this.name = "CertificationStageResultConsumptionError";
    this.stdout = diagnostics.stdout ?? "";
    this.stderr = diagnostics.stderr ?? "";
    this.exitCode = diagnostics.exitCode ?? null;
    this.signal = diagnostics.signal ?? null;
    this.spawnErrorClassification =
      diagnostics.spawnErrorClassification ?? null;
  }
}

function spawnErrorClassification(error) {
  if (!error) return null;
  if (error.code === "ENOENT") return "wrapper-executable-not-found";
  if (error.code === "EACCES") return "wrapper-executable-not-authorized";
  return "wrapper-spawn-error";
}

export async function runCertificationStageCommand({
  command,
  repositoryRoot,
  environment = process.env,
  executable = process.execPath,
  args = ["scripts/production-certification.mjs", command],
  expectedCertificationId,
  expectedCandidate,
  expectedHarnessSourceSha256,
  verifyCurrentSource = true,
} = {}) {
  if (!repositoryRoot) {
    throw new Error(
      "certification stage-result consumer requires an explicit repository root",
    );
  }
  const nonce = createCertificationStageResultNonce(environment);
  const childEnvironment = {
    ...environment,
    [PRODUCTION_CERTIFICATION_STAGE_RESULT_NONCE_ENV]: nonce,
  };
  const invocation = captureCertificationStageResultInvocation({
    command,
    environment: childEnvironment,
  });
  const statePath = childEnvironment.PRODUCTION_CERTIFICATION_STATE?.trim();
  const evidenceRoot = childEnvironment.CERTIFICATION_EVIDENCE_ROOT?.trim();
  if (!statePath || !evidenceRoot) {
    throw new Error(
      "certification stage-result consumer requires the state and evidence root",
    );
  }
  const child = spawn(executable, args, {
    cwd: repositoryRoot,
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let spawnError = null;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.once("error", (error) => {
    spawnError = error;
  });
  const processResult = await new Promise((resolve) => {
    child.once("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal: signal ?? null,
        spawnErrorClassification: spawnErrorClassification(spawnError),
      });
    });
  });
  if (spawnError) {
    throw new CertificationStageResultConsumptionError(
      "certification wrapper could not be spawned",
      { stdout, stderr, ...processResult },
    );
  }
  try {
    return consumeCertificationStageResult({
      stdout,
      stderr,
      process: processResult,
      statePath,
      evidenceRoot,
      repositoryRoot,
      expectedCommand: command,
      expectedInvocationNonce: nonce,
      expectedPreStateSha256: invocation.preStateSha256,
      expectedCertificationId,
      expectedCandidate,
      expectedHarnessSourceSha256,
      sensitiveValues: certificationStageResultSensitiveValues(
        childEnvironment,
      ),
      verifyCurrentSource,
    });
  } catch (error) {
    throw new CertificationStageResultConsumptionError(
      error instanceof Error ? error.message : String(error),
      { stdout, stderr, ...processResult },
    );
  }
}

function cliArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error("stage-result validator arguments are malformed");
    }
    values[name.slice(2)] = value;
  }
  return values;
}

function requiredArgument(values, name) {
  const value = values[name]?.trim();
  if (!value) throw new Error(`stage-result validator requires --${name}`);
  return value;
}

export function validateCertificationStageResultFile({
  stdoutPath,
  stderrPath = null,
  statePath,
  evidenceRoot,
  repositoryRoot,
  command,
  invocationNonce,
  preStateSha256,
} = {}) {
  if (!repositoryRoot) {
    throw new Error(
      "stage-result file validation requires an explicit repository root",
    );
  }
  const stdout = readFileSync(stdoutPath, "utf8");
  const stderr = stderrPath ? readFileSync(stderrPath, "utf8") : "";
  const value = parseCertificationStageResult(stdout);
  const validation = validateCertificationStageResult({
    value,
    statePath,
    evidenceRoot,
    repositoryRoot,
    expectedCommand: command,
    expectedInvocationNonce: invocationNonce,
    expectedPreStateSha256:
      preStateSha256 === "null" ? null : preStateSha256,
  });
  return {
    schema:
      "interior-ai.production-certification-stage-result-validation.v1",
    valid: validation.valid,
    command,
    nextStateSha256: validation.nextStateSha256 ?? null,
    stdoutBytes: Buffer.byteLength(stdout),
    stderrBytes: Buffer.byteLength(stderr),
    issues: validation.issues,
  };
}

function cli() {
  if (process.argv[2] !== "validate") {
    throw new Error("stage-result consumer supports only validation");
  }
  const values = cliArguments(process.argv.slice(3));
  const result = validateCertificationStageResultFile({
    stdoutPath: path.resolve(requiredArgument(values, "stdout")),
    stderrPath: values.stderr ? path.resolve(values.stderr) : null,
    statePath: path.resolve(requiredArgument(values, "state")),
    evidenceRoot: path.resolve(requiredArgument(values, "evidence-root")),
    repositoryRoot: path.resolve(requiredArgument(values, "repository-root")),
    command: requiredArgument(values, "command"),
    invocationNonce: requiredArgument(values, "nonce"),
    preStateSha256: requiredArgument(values, "pre-state-sha"),
  });
  process.stdout.write(canonicalJsonBytes(result));
  if (!result.valid) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    cli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
