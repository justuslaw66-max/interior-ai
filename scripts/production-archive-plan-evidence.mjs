import { createHash } from "node:crypto";

import {
  TRACE_POLICY_REASONS,
  normalizeTraceArchiveRelativePath,
} from "./production-trace-archive-policy.mjs";

export const PRODUCTION_ARCHIVE_PLAN_CHILD_RESULT_SCHEMA =
  "interior-ai.production-archive-plan-child-result.v1";

const ARCHIVE_FAILURE_SCHEMA = "interior-ai.production-archive-failure.v1";
const SENSITIVE_ENVIRONMENT_NAME =
  /(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_KEY|COOKIE|DATABASE_URL|AUTH_SECRET|CLIENT_SECRET)/i;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function portableSpawnError(error) {
  const code = error?.code;
  return typeof code === "string" && /^[A-Z0-9_-]+$/i.test(code)
    ? code
    : error
      ? "spawn-error"
      : null;
}

function safeEnvironmentProfile(metadata) {
  return Object.freeze({
    profileId: metadata.profileId,
    stage: metadata.stage,
    contractSchema: metadata.contractSchema,
    contractSha256: metadata.contractSha256,
    profileSha256: metadata.profileSha256,
    allowedVariableNamesSha256: metadata.allowedVariableNamesSha256,
    requiredVariableNamesSha256: metadata.requiredVariableNamesSha256,
    valuePolicySha256: metadata.valuePolicySha256,
    environmentNamesSha256: metadata.environmentNamesSha256,
    valuePolicyValidationPassed:
      metadata.valuePolicyValidation?.passed === true,
  });
}

export function archivePlanStreamDescriptor(relativePath, contents) {
  const normalizedPath = normalizeTraceArchiveRelativePath(relativePath);
  if (!normalizedPath) {
    throw new Error("archive planner stream path is not normalized and relative");
  }
  const bytes = Buffer.from(contents);
  return Object.freeze({
    path: normalizedPath,
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
  });
}

export function redactArchivePlanStream(
  value,
  { privatePaths = [], environment = {} } = {},
) {
  let redacted = String(value ?? "");
  const replacements = [
    ...privatePaths.filter((entry) => typeof entry === "string" && entry),
    ...Object.entries(environment)
      .filter(
        ([name, entry]) =>
          SENSITIVE_ENVIRONMENT_NAME.test(name) &&
          typeof entry === "string" &&
          entry.length >= 4,
      )
      .map(([, entry]) => entry),
  ].sort((left, right) => right.length - left.length);
  for (const sensitive of new Set(replacements)) {
    redacted = redacted.split(sensitive).join("<redacted>");
  }
  return redacted
    .replace(/\/(?:Users|private|var\/folders|tmp)\/[^\s"'`]+/g, "<private-path>")
    .replace(/[A-Za-z]:\\Users\\[^\s"'`]+/g, "<private-path>");
}

export function parseStructuredArchivePlanFailure(stderr) {
  for (const line of String(stderr ?? "").trim().split("\n").reverse()) {
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    const safePath = normalizeTraceArchiveRelativePath(
      value?.rejectedRelativePath,
    );
    if (
      value?.schema === ARCHIVE_FAILURE_SCHEMA &&
      typeof value.failureCode === "string" &&
      /^[A-Z0-9_]+$/.test(value.failureCode) &&
      (value.rejectedRelativePath === null || safePath) &&
      (value.policyDecision === null || value.policyDecision === "reject") &&
      (value.policyReason === null ||
        Object.values(TRACE_POLICY_REASONS).includes(value.policyReason)) &&
      value.completionMarker === "failed"
    ) {
      return Object.freeze({
        code: value.failureCode,
        rejectedRelativePath: safePath,
        policyDecision: value.policyDecision,
        policyReason: value.policyReason,
      });
    }
  }
  return Object.freeze({
    code: "ARCHIVE_PLAN_CHILD_FAILURE",
    rejectedRelativePath: null,
    policyDecision: null,
    policyReason: null,
  });
}

export function createArchivePlanChildEvidence({
  child,
  stderr,
  stdoutDescriptor,
  stderrDescriptor,
  environmentProfileMetadata,
  workingDirectory,
}) {
  const passed = !child.error && !child.signal && child.status === 0;
  const failure = passed ? null : parseStructuredArchivePlanFailure(stderr);
  return Object.freeze({
    schema: PRODUCTION_ARCHIVE_PLAN_CHILD_RESULT_SCHEMA,
    command: Object.freeze({
      id: "production-archive-plan",
      canonicalCommand: "node scripts/production-archive.mjs plan",
      executable: "node",
      arguments: Object.freeze(["scripts/production-archive.mjs", "plan"]),
    }),
    workingDirectory: Object.freeze({ ...workingDirectory }),
    environmentProfile: safeEnvironmentProfile(environmentProfileMetadata),
    process: Object.freeze({
      childPid: Number.isSafeInteger(child.pid) && child.pid > 0 ? child.pid : null,
      exitStatus:
        child.error || child.signal || !Number.isSafeInteger(child.status)
          ? null
          : child.status,
      signal: child.signal ?? null,
      spawnErrorClassification: portableSpawnError(child.error),
    }),
    stdout: Object.freeze({ ...stdoutDescriptor }),
    stderr: Object.freeze({ ...stderrDescriptor }),
    failure,
    completionMarker: Object.freeze({
      complete: true,
      result: passed ? "succeeded" : "failed",
    }),
  });
}
