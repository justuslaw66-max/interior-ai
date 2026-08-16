import path from "node:path";

export const PRODUCTION_TRACE_ARCHIVE_POLICY_SCHEMA =
  "interior-ai.production-trace-archive-policy.v1";

export const TRACE_INPUT_PROVENANCE = Object.freeze({
  CERTIFICATION_EVIDENCE: "certification-evidence",
  MANUAL: "manual",
  NFT: "nft-manifest",
});

export const TRACE_RUNTIME_NECESSITY = Object.freeze({
  REQUIRED: "trace-required",
  PROVEN_OVERTRACE: "proven-nft-overtrace",
  UNKNOWN: "unknown",
});

export const TRACE_SENSITIVE_SCAN = Object.freeze({
  REQUIRED: "required",
  PASSED: "passed",
  MATCH: "match",
});

export const TRACE_POLICY_REASONS = Object.freeze({
  INCLUDED: "TRACE_REQUIRED_INPUT",
  MALFORMED_NFT_REFERENCE: "MALFORMED_NFT_REFERENCE_REJECTED",
  MANUAL_TEST_SOURCE: "MANUAL_TEST_SOURCE_REJECTED",
  PROHIBITED_PATH: "PROHIBITED_PATH_REJECTED",
  PROVEN_OVERTRACE: "PROVEN_NFT_OVERTRACE_REJECTED",
  SENSITIVE_MATCH: "SENSITIVE_MATCH_REJECTED",
  UNKNOWN_PROVENANCE: "UNKNOWN_PROVENANCE_REJECTED",
  UNKNOWN_RUNTIME_NECESSITY: "UNKNOWN_RUNTIME_NECESSITY_REJECTED",
});

export const GLB_OPTIMIZER_NFT_MANIFEST =
  ".next/server/app/api/tools/glb-optimizer/route.js.nft.json";

export const MUTABLE_ARTIFACT_ROOTS = Object.freeze([
  ".next/cache",
  ".next/dev",
  ".next/diagnostics",
  ".next/trace",
]);

const PROHIBITED_ROOTS = Object.freeze([
  ".git",
  ".local",
  ".vercel",
  "release-evidence-private",
  "test-results",
  "tests",
  ...MUTABLE_ARTIFACT_ROOTS,
]);

const CANONICAL_CERTIFICATION_EVIDENCE_PATHS = Object.freeze([
  ".local/production-artifact-evidence/artifact-inventory.json",
  ".local/production-artifact-evidence/manifest.json",
  ".local/production-artifact-evidence/manifest.json.sha256",
  ".local/production-artifact-evidence/semantic-event-journal.json",
]);

function portable(value) {
  return value.split(path.sep).join("/");
}

export function normalizeTraceArchiveRelativePath(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\n") ||
    value.includes("\\") ||
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
    return null;
  }
  const normalized = portable(path.posix.normalize(value));
  if (
    normalized !== value ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    return null;
  }
  return normalized;
}

export function isValidNftTraceReference(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\0") &&
    !value.includes("\\") &&
    !path.isAbsolute(value) &&
    !path.win32.isAbsolute(value)
  );
}

export function resolveNftTraceReference({ nftManifestPath, reference }) {
  const normalizedManifest = normalizeTraceArchiveRelativePath(nftManifestPath);
  if (!normalizedManifest || !isValidNftTraceReference(reference)) return null;
  return normalizeTraceArchiveRelativePath(
    path.posix.join(path.posix.dirname(normalizedManifest), reference),
  );
}

export function isTestSourcePath(relativePath) {
  return (
    /^scripts\/test-[^/]+/.test(relativePath) ||
    relativePath === "tests" ||
    relativePath.startsWith("tests/")
  );
}

export function prohibitedTraceArchivePath(relativePath) {
  return (
    relativePath === ".env" ||
    relativePath.startsWith(".env.") ||
    PROHIBITED_ROOTS.some(
      (root) => relativePath === root || relativePath.startsWith(`${root}/`),
    )
  );
}

export function classifyNftRuntimeNecessity({ relativePath, nftManifestPath }) {
  const normalizedPath = normalizeTraceArchiveRelativePath(relativePath);
  const normalizedManifest = normalizeTraceArchiveRelativePath(nftManifestPath);
  if (!normalizedPath || !normalizedManifest) return TRACE_RUNTIME_NECESSITY.UNKNOWN;
  if (
    normalizedManifest === GLB_OPTIMIZER_NFT_MANIFEST &&
    isTestSourcePath(normalizedPath)
  ) {
    return TRACE_RUNTIME_NECESSITY.PROVEN_OVERTRACE;
  }
  return isTestSourcePath(normalizedPath)
    ? TRACE_RUNTIME_NECESSITY.UNKNOWN
    : TRACE_RUNTIME_NECESSITY.REQUIRED;
}

function decision(relativePath, included, reason, requiresSensitiveScan) {
  return Object.freeze({
    schema: PRODUCTION_TRACE_ARCHIVE_POLICY_SCHEMA,
    relativePath,
    decision: included ? "include" : "reject",
    reason,
    requiresSensitiveScan,
  });
}

export function decideProductionTraceArchiveInclusion({
  relativePath,
  provenance,
  nftManifestPath = null,
  runtimeNecessity = TRACE_RUNTIME_NECESSITY.UNKNOWN,
  sensitiveScan = TRACE_SENSITIVE_SCAN.REQUIRED,
}) {
  const normalized = normalizeTraceArchiveRelativePath(relativePath);
  if (!normalized || !Object.values(TRACE_INPUT_PROVENANCE).includes(provenance)) {
    return decision(normalized, false, TRACE_POLICY_REASONS.UNKNOWN_PROVENANCE, true);
  }
  if (sensitiveScan === TRACE_SENSITIVE_SCAN.MATCH) {
    return decision(normalized, false, TRACE_POLICY_REASONS.SENSITIVE_MATCH, true);
  }
  if (!Object.values(TRACE_SENSITIVE_SCAN).includes(sensitiveScan)) {
    return decision(normalized, false, TRACE_POLICY_REASONS.UNKNOWN_PROVENANCE, true);
  }
  if (
    provenance === TRACE_INPUT_PROVENANCE.CERTIFICATION_EVIDENCE &&
    CANONICAL_CERTIFICATION_EVIDENCE_PATHS.includes(normalized)
  ) {
    return decision(normalized, true, TRACE_POLICY_REASONS.INCLUDED, true);
  }
  if (prohibitedTraceArchivePath(normalized)) {
    return decision(normalized, false, TRACE_POLICY_REASONS.PROHIBITED_PATH, true);
  }
  if (provenance === TRACE_INPUT_PROVENANCE.MANUAL && isTestSourcePath(normalized)) {
    return decision(normalized, false, TRACE_POLICY_REASONS.MANUAL_TEST_SOURCE, true);
  }
  if (provenance === TRACE_INPUT_PROVENANCE.MANUAL) {
    return decision(normalized, true, TRACE_POLICY_REASONS.INCLUDED, true);
  }
  if (provenance !== TRACE_INPUT_PROVENANCE.NFT) {
    return decision(normalized, false, TRACE_POLICY_REASONS.UNKNOWN_PROVENANCE, true);
  }
  if (!normalizeTraceArchiveRelativePath(nftManifestPath)) {
    return decision(normalized, false, TRACE_POLICY_REASONS.UNKNOWN_PROVENANCE, true);
  }
  if (runtimeNecessity === TRACE_RUNTIME_NECESSITY.PROVEN_OVERTRACE) {
    return decision(normalized, false, TRACE_POLICY_REASONS.PROVEN_OVERTRACE, true);
  }
  if (runtimeNecessity !== TRACE_RUNTIME_NECESSITY.REQUIRED) {
    return decision(
      normalized,
      false,
      TRACE_POLICY_REASONS.UNKNOWN_RUNTIME_NECESSITY,
      true,
    );
  }
  return decision(normalized, true, TRACE_POLICY_REASONS.INCLUDED, true);
}

export function decideNftTraceArchiveInclusion({
  relativePath,
  nftManifestPath,
  sensitiveScan = TRACE_SENSITIVE_SCAN.REQUIRED,
}) {
  return decideProductionTraceArchiveInclusion({
    relativePath,
    provenance: TRACE_INPUT_PROVENANCE.NFT,
    nftManifestPath,
    runtimeNecessity: classifyNftRuntimeNecessity({
      relativePath,
      nftManifestPath,
    }),
    sensitiveScan,
  });
}

export function decideNftTraceReferenceInclusion({
  nftManifestPath,
  reference,
  sensitiveScan = TRACE_SENSITIVE_SCAN.REQUIRED,
}) {
  const relativePath = resolveNftTraceReference({
    nftManifestPath,
    reference,
  });
  if (!relativePath) {
    return decision(
      null,
      false,
      TRACE_POLICY_REASONS.MALFORMED_NFT_REFERENCE,
      true,
    );
  }
  return decideNftTraceArchiveInclusion({
    relativePath,
    nftManifestPath,
    sensitiveScan,
  });
}

export function formatTraceArchivePolicyRejection(decisionValue) {
  const rejectedPath = decisionValue.relativePath ?? "<invalid-relative-path>";
  return `${decisionValue.reason}: production trace/archive policy rejects ${rejectedPath}`;
}
