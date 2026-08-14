import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const PRODUCTION_CERTIFICATION_HARNESS_VERSION = 1;
export const PRODUCTION_CERTIFICATION_STATE_SCHEMA =
  "interior-ai.production-certification-state.v1";
export const PRODUCTION_CERTIFICATION_DOCTOR_SCHEMA =
  "interior-ai.production-certification-doctor.v1";
export const PRODUCTION_CERTIFICATION_ATTEMPT_SCHEMA =
  "interior-ai.production-certification-attempt.v1";
export const PRODUCTION_CERTIFICATION_FINAL_EVIDENCE_SCHEMA =
  "interior-ai.production-certification-final-evidence.v1";
export const PRODUCTION_CERTIFICATION_PHASE8_EVIDENCE_SCHEMA =
  "interior-ai.production-certification-phase8-evidence.v1";
export const PRODUCTION_CERTIFICATION_RUNTIME_EVIDENCE_SCHEMA =
  "interior-ai.production-certification-runtime-smoke-evidence.v1";
export const PRODUCTION_CERTIFICATION_BROWSER_EVIDENCE_SCHEMA =
  "interior-ai.production-certification-browser-owner-evidence.v1";
export const PRODUCTION_CERTIFICATION_CONTINUITY_SCHEMA =
  "interior-ai.production-certification-continuity.v1";
export const PRODUCTION_ARCHIVE_PLAN_SCHEMA =
  "interior-ai.production-archive-plan.v1";
export const PRODUCTION_ARCHIVE_INVENTORY_SCHEMA =
  "interior-ai.production-archive-inventory.v1";
export const PRODUCTION_VERIFIER_CLOSURE_SCHEMA =
  "interior-ai.production-verifier-source-closure.v1";

export const CERTIFICATION_STATE_ENV = "PRODUCTION_CERTIFICATION_STATE";
export const CERTIFICATION_EVIDENCE_ROOT_ENV = "CERTIFICATION_EVIDENCE_ROOT";
export const PHASE8_EXTERNAL_EVIDENCE_ROOT_ENV =
  "PHASE8_EXTERNAL_EVIDENCE_ROOT";

export const CERTIFICATION_STAGE_ORDER = Object.freeze([
  "doctor",
  "source-validation",
  "build",
  "archive-preflight",
  "archive",
  "extracted-archive-preflight",
  "phase8",
  "runtime-smoke",
  "browser-owners",
  "final-standalone",
  "continuity",
  "integration-ready",
]);

export const CERTIFICATION_STAGE_STATUSES = Object.freeze([
  "pending",
  "running",
  "passed",
  "failed",
  "invalidated",
]);

export const CERTIFICATION_FAILURE_CLASSIFICATIONS = Object.freeze([
  "PRECONDITION_ORCHESTRATION_FAILURE",
  "INFRASTRUCTURE_TRANSIENT",
  "SOURCE_CONTRACT_FAILURE",
  "BUILD_FAILURE",
  "ARCHIVE_FAILURE",
  "PERFORMANCE_GATE_FAILURE",
  "PRODUCT_ASSERTION_FAILURE",
  "ARTIFACT_CONTINUITY_FAILURE",
  "FINAL_EVIDENCE_FAILURE",
]);

export const CERTIFICATION_STAGE_COMMANDS = Object.freeze({
  doctor: "npm run certification:doctor",
  "source-validation": "npm run certification:state:validate",
  build: "npm run certification:build",
  "archive-preflight": "npm run certification:archive-preflight",
  archive: "npm run certification:archive",
  "extracted-archive-preflight":
    "npm run certification:extracted-archive-preflight",
  phase8: "npm run certification:phase8",
  "runtime-smoke": "npm run certification:runtime-smoke",
  "browser-owners": "npm run certification:browser-owners",
  "final-standalone": "npm run certification:final-standalone",
  continuity: "npm run certification:continuity",
  "integration-ready": "npm run certification:state:validate",
});

export const PHASE8_SOURCE_BINDING_PATHS = Object.freeze([
  "scripts/benchmark-phase8-projects.ts",
  "scripts/phase8-representative-projects.ts",
  "lib/snapshot-fingerprint.ts",
  "config/phase8-performance-budgets.json",
  "package.json",
  "package-lock.json",
  "scripts/phase8-project-benchmark-contract.ts",
  "scripts/phase8-project-benchmark-validator.ts",
  "scripts/phase8-project-benchmark-context.ts",
  "scripts/phase8-project-benchmark-evidence-io.ts",
  "scripts/run-phase8-project-benchmark.ts",
]);

export const REQUIRED_BROWSER_OWNERS = Object.freeze([
  Object.freeze({
    id: "floor-plan-upload",
    gateId: "ci.floor-plan-upload-accessibility",
    config: "playwright.floor-plan-upload.config.ts",
    packageCommand: "test:floor-plan-upload-accessibility-required",
    applicationEnvironment: "development",
    productionServer: true,
  }),
  Object.freeze({
    id: "pro-visual",
    gateId: "ci.pro-visual-policy",
    config: "playwright.pro-visual.config.ts",
    packageCommand: "test:pro-visual-policy",
    applicationEnvironment: "staging",
    productionServer: false,
  }),
  Object.freeze({
    id: "guest-save",
    gateId: "ci.guest-save-overlay-accessibility",
    config: "playwright.guest-save-overlay.config.ts",
    packageCommand: "test:guest-save-overlay-accessibility-required",
    applicationEnvironment: "development",
    productionServer: true,
  }),
  Object.freeze({
    id: "my-designs",
    gateId: "ci.my-designs-overlay-accessibility",
    config: "playwright.my-designs-overlay.config.ts",
    packageCommand: "test:my-designs-overlay-accessibility-required",
    applicationEnvironment: "development",
    productionServer: true,
  }),
  Object.freeze({
    id: "public-share",
    gateId: "ci.public-share-responsive",
    config: "playwright.share-responsive.config.ts",
    packageCommand: "test:public-share-responsive-required",
    applicationEnvironment: "staging",
    productionServer: true,
  }),
  Object.freeze({
    id: "cart",
    gateId: "ci.cart-overlay-accessibility",
    config: "playwright.cart-overlay.config.ts",
    packageCommand: "test:cart-overlay-accessibility-required",
    applicationEnvironment: "development",
    productionServer: false,
  }),
  Object.freeze({
    id: "retailer",
    gateId: "ci.retailer-confirmation-accessibility",
    config: "playwright.retailer-confirmation.config.ts",
    packageCommand: "test:retailer-confirmation-accessibility-required",
    applicationEnvironment: "development",
    productionServer: false,
  }),
]);

export const CERTIFICATION_HARNESS_SOURCE_PATHS = Object.freeze([
  "package.json",
  "playwright.config.ts",
  "playwright.floor-plan-upload.config.ts",
  "playwright.pro-visual.config.ts",
  "playwright.guest-save-overlay.config.ts",
  "playwright.my-designs-overlay.config.ts",
  "playwright.share-responsive.config.ts",
  "playwright.cart-overlay.config.ts",
  "playwright.retailer-confirmation.config.ts",
  "scripts/production-certification-contract.mjs",
  "scripts/production-certification-state.mjs",
  "scripts/production-certification-evidence.mjs",
  "scripts/production-certification-doctor.mjs",
  "scripts/production-certification-real.mjs",
  "scripts/production-certification.mjs",
  "scripts/production-certification-simulation.mjs",
  "scripts/production-archive.mjs",
  "scripts/production-verifier-closure.mjs",
  "scripts/production-artifact-contract.mjs",
  "scripts/production-artifact-evidence.mjs",
  "scripts/production-artifact-playwright.mjs",
  "scripts/playwright-report-path.mjs",
  "scripts/required-test-playwright.mjs",
  "scripts/required-test-truthfulness.mjs",
  "scripts/required-test-manifest.json",
  "scripts/production-certification-regressions.json",
  "scripts/certification-playwright-start-reporter.mjs",
  "scripts/benchmark-phase8-projects.ts",
  "scripts/phase8-project-benchmark-contract.ts",
  "scripts/run-phase8-project-benchmark.ts",
]);

export const CERTIFICATION_RESULTS = Object.freeze([
  "QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION",
  "NOT_QUALIFIED_SOURCE_CONTRACT_DEFECT",
  "NOT_QUALIFIED_ORCHESTRATION_GAP",
  "INCONCLUSIVE",
]);

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

export function productionArchiveInventoryIssues(inventory) {
  const issues = [];
  const exactKeys = (value, keys) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");
  if (
    !exactKeys(inventory, [
      "schema",
      "files",
      "fileCount",
      "bytes",
      "inventorySha256",
    ]) ||
    inventory?.schema !== PRODUCTION_ARCHIVE_INVENTORY_SCHEMA ||
    !Array.isArray(inventory?.files)
  ) {
    return ["production archive inventory shape or schema is invalid"];
  }
  const paths = [];
  let totalBytes = 0;
  for (const record of inventory.files) {
    if (
      !exactKeys(record, ["path", "bytes", "sha256"]) ||
      typeof record.path !== "string" ||
      !record.path ||
      record.path.includes("\\") ||
      path.posix.normalize(record.path) !== record.path ||
      record.path === ".." ||
      record.path.startsWith("../") ||
      !Number.isSafeInteger(record.bytes) ||
      record.bytes < 0 ||
      !isSha256(record.sha256)
    ) {
      issues.push("production archive inventory file record is invalid");
      continue;
    }
    paths.push(record.path);
    totalBytes += record.bytes;
  }
  if (
    new Set(paths).size !== paths.length ||
    JSON.stringify(paths) !== JSON.stringify([...paths].sort())
  ) {
    issues.push("production archive inventory paths are not unique and sorted");
  }
  if (
    inventory.fileCount !== inventory.files.length ||
    inventory.bytes !== totalBytes
  ) {
    issues.push("production archive inventory totals are contradictory");
  }
  const semanticPayload = {
    schema: inventory.schema,
    files: inventory.files,
    fileCount: inventory.fileCount,
    bytes: inventory.bytes,
  };
  if (
    !isSha256(inventory.inventorySha256) ||
    inventory.inventorySha256 !== sha256Bytes(canonicalJsonBytes(semanticPayload))
  ) {
    issues.push("production archive inventory semantic digest is invalid");
  }
  return issues;
}

export function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function isSourceSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40,64}$/.test(value);
}

export function isCandidateId(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

export function isCanonicalUtcTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

export function assertKnownStage(stage) {
  if (!CERTIFICATION_STAGE_ORDER.includes(stage)) {
    throw new Error(`unknown certification stage: ${String(stage)}`);
  }
}

export function assertKnownStageStatus(status) {
  if (!CERTIFICATION_STAGE_STATUSES.includes(status)) {
    throw new Error(`unknown certification stage status: ${String(status)}`);
  }
}

export function assertKnownFailureClassification(classification) {
  if (!CERTIFICATION_FAILURE_CLASSIFICATIONS.includes(classification)) {
    throw new Error(
      `unknown certification failure classification: ${String(classification)}`,
    );
  }
}

export function harnessSourceIdentity(repositoryRoot) {
  const records = CERTIFICATION_HARNESS_SOURCE_PATHS.map((relativePath) => {
    const bytes = readFileSync(path.join(repositoryRoot, relativePath));
    return {
      path: relativePath,
      bytes: bytes.byteLength,
      sha256: sha256Bytes(bytes),
    };
  });
  const digestInput = records
    .map((record) => `${record.sha256}  ${record.bytes}  ${record.path}\n`)
    .join("");
  return Object.freeze({ records, sha256: sha256Bytes(digestInput) });
}
