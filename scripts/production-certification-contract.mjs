import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { stageEnvironmentContract } from "./production-certification-stage-environment.mjs";

export const PRODUCTION_CERTIFICATION_HARNESS_VERSION = 1;
export const PRODUCTION_CERTIFICATION_STATE_SCHEMA_V1 =
  "interior-ai.production-certification-state.v1";
export const PRODUCTION_CERTIFICATION_STATE_SCHEMA =
  "interior-ai.production-certification-state.v3";
export const PRODUCTION_CERTIFICATION_STATE_SCHEMA_V2 =
  "interior-ai.production-certification-state.v2";
export const PRODUCTION_CERTIFICATION_STATE_VALIDATION_SCHEMA =
  "interior-ai.production-certification-state-validation.v1";
export const PRODUCTION_CERTIFICATION_INVALIDATION_PLAN_SCHEMA =
  "interior-ai.production-certification-invalidation-plan.v1";
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
export const PRODUCTION_CERTIFICATION_SOURCE_VALIDATION_SCHEMA =
  "interior-ai.production-certification-source-validation.v4";
export const PRODUCTION_CERTIFICATION_SOURCE_VALIDATION_SCHEMA_V3 =
  "interior-ai.production-certification-source-validation.v3";
export const PRODUCTION_CERTIFICATION_SOURCE_GENERATED_OUTPUT_CONTRACT_SCHEMA =
  "interior-ai.production-certification-source-generated-outputs.v1";
export const PRODUCTION_CERTIFICATION_SOURCE_GENERATED_OUTPUT_EVIDENCE_SCHEMA =
  "interior-ai.production-certification-source-generated-output-evidence.v1";
export const PRODUCTION_CERTIFICATION_ARTIFACT_SNAPSHOT_SCHEMA =
  "interior-ai.production-certification-artifact-snapshot.v1";
export const PRODUCTION_CERTIFICATION_ARTIFACT_ROOT_SCHEMA =
  "interior-ai.production-certification-artifact-root-private.v1";
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
  "source-validation": "npm run certification:source-validation",
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
  "integration-ready": "npm run certification:integration-ready",
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
  "scripts/production-certification-historical-evidence.mjs",
  "scripts/production-certification-doctor.mjs",
  "scripts/production-certification-dependencies.mjs",
  "scripts/production-certification-build-generated-output.mjs",
  "scripts/production-certification-real.mjs",
  "scripts/production-certification-source-continuity.mjs",
  "scripts/production-certification-source-generated-outputs.mjs",
  "scripts/build-floor-plan-upload-browser-fixture.mjs",
  "scripts/guest-save-overlay-ts-loader.mjs",
  "scripts/production-certification.mjs",
  "scripts/production-certification-simulation.mjs",
  "scripts/production-certification-stage-environment.mjs",
  "scripts/production-certification-worktrees.mjs",
  "scripts/test-production-certification-state-worktrees.mjs",
  "scripts/test-production-certification-dependency-lifecycle.mjs",
  "scripts/test-production-certification-build-generated-output.mjs",
  "scripts/test-production-certification-stage-environment.mjs",
  "scripts/test-production-certification-source-generated-outputs.mjs",
  "scripts/test-floor-plan-vision-configuration.ts",
  "scripts/test-floor-plan-local-ocr.ts",
  "tests/required/fixtures/floor-plan-empty-entry-harness.tsx",
  "tests/required/fixtures/floor-plan-upload-dialog-harness.tsx",
  "tests/required/fixtures/next-navigation-browser-fixture.ts",
  "lib/floor-plan-imports/pdf-raster-adapter.ts",
  "lib/floor-plan-imports/vision-configuration.ts",
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
  "docs/qa/production-certification-contract.v1.json",
  "docs/qa/production-certification-source-generated-outputs.v1.json",
  "docs/qa/production-certification-stage-environment.v2.json",
  "docs/qa/production-certification-harness-v1.md",
  "docs/qa/production-certification-state-worktree-remediation.md",
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

export function productionCertificationContract(repositoryRoot) {
  const contractPath = path.join(
    repositoryRoot,
    "docs/qa/production-certification-contract.v1.json",
  );
  const bytes = readFileSync(contractPath);
  let contract;
  try {
    contract = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("production certification contract matrix is invalid JSON");
  }
  if (
    contract?.schema !== "interior-ai.production-certification-contract-matrix.v1" ||
    contract?.sourceValidation?.schema !==
      "interior-ai.production-certification-source-check-set.v1" ||
    contract?.buildGeneratedOutputLifecycle?.schema !==
      "interior-ai.production-certification-build-generated-output-lifecycle.v1" ||
    contract?.continuity?.schema !==
      "interior-ai.production-certification-continuity-contract.v1"
  ) {
    throw new Error("production certification contract matrix schema is unsupported");
  }
  return Object.freeze({
    value: contract,
    sha256: sha256Bytes(bytes),
    path: "docs/qa/production-certification-contract.v1.json",
  });
}

function safeGeneratedOutputRelativePath(relativePath) {
  return (
    typeof relativePath === "string" &&
    relativePath.length > 0 &&
    !path.isAbsolute(relativePath) &&
    !relativePath.includes("\\") &&
    !/[?*\[\]{}]/.test(relativePath) &&
    relativePath.split("/").every((component) => component && component !== "." && component !== "..") &&
    path.posix.normalize(relativePath) === relativePath &&
    !new Set([".next", ".next/cache", "node_modules"]).has(relativePath)
  );
}

export function validateSourceGeneratedOutputContractValue(
  value,
  expectedCheckIds = null,
) {
  const issues = [];
  const policies = Array.isArray(value?.checkPolicies) ? value.checkPolicies : [];
  const outputs = Array.isArray(value?.outputs) ? value.outputs : [];
  const policyIds = policies.map((entry) => entry?.checkId);
  const outputIds = outputs.map((entry) => entry?.id);
  const checkIds = expectedCheckIds ?? policyIds;
  const checkIndex = new Map(checkIds.map((id, index) => [id, index]));
  if (
    value?.schema !==
      PRODUCTION_CERTIFICATION_SOURCE_GENERATED_OUTPUT_CONTRACT_SCHEMA ||
    value?.version !== 1 ||
    value?.unknownGeneratedOutputPolicy !== "fail-closed" ||
    JSON.stringify(value?.terminalPersistentIgnoredRoots) !==
      JSON.stringify(["node_modules"])
  ) {
    issues.push("generated-output contract header or terminal policy is invalid");
  }
  if (
    policies.length !== checkIds.length ||
    new Set(policyIds).size !== policyIds.length ||
    JSON.stringify(policyIds) !== JSON.stringify(checkIds)
  ) {
    issues.push("every source check must have one ordered generated-output policy");
  }
  if (new Set(outputIds).size !== outputIds.length) {
    issues.push("generated-output IDs are duplicated");
  }
  const referencedOutputs = [];
  for (const policy of policies) {
    if (
      !policy ||
      !checkIndex.has(policy.checkId) ||
      policy.expectedTrackedModifications !== "none" ||
      !Array.isArray(policy.generatedOutputIds) ||
      policy.generatedOutputIds.some((id) => !outputIds.includes(id))
    ) {
      issues.push(`generated-output check policy is malformed: ${String(policy?.checkId)}`);
      continue;
    }
    referencedOutputs.push(...policy.generatedOutputIds);
  }
  if (
    referencedOutputs.length !== outputs.length ||
    new Set(referencedOutputs).size !== referencedOutputs.length ||
    outputs.some((entry) => !referencedOutputs.includes(entry.id))
  ) {
    issues.push("every generated output must have exactly one check-policy owner");
  }
  for (const output of outputs) {
    const ownerIndex = checkIndex.get(output?.ownerCheckId);
    const consumerIds = output?.permittedConsumerCheckIds;
    const lastConsumerId = output?.retentionLifetime?.lastConsumerCheckId;
    const lastConsumerIndex = checkIndex.get(lastConsumerId);
    const policy = policies.find((entry) => entry?.checkId === output?.ownerCheckId);
    const inventory = output?.inventoryPolicy;
    if (
      !output ||
      typeof output.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(output.id) ||
      !safeGeneratedOutputRelativePath(output.relativePath) ||
      !new Set(["file", "directory"]).has(output.pathType) ||
      output.productionTiming !== "during-check" ||
      !Number.isSafeInteger(ownerIndex) ||
      !Array.isArray(consumerIds) ||
      consumerIds.some((id) => !checkIndex.has(id)) ||
      consumerIds.some((id) => checkIndex.get(id) <= ownerIndex) ||
      output.expectedPreCheckState !== "absent" ||
      output.retentionLifetime?.kind !== "through-last-consumer" ||
      !Number.isSafeInteger(lastConsumerIndex) ||
      lastConsumerIndex < ownerIndex ||
      (consumerIds.length > 0 &&
        Math.max(...consumerIds.map((id) => checkIndex.get(id))) !==
          lastConsumerIndex) ||
      (consumerIds.length === 0 && lastConsumerId !== output.ownerCheckId) ||
      output.cleanupOwnerCheckId !== lastConsumerId ||
      output.cleanupDeadline?.kind !== "immediately-after-check" ||
      output.cleanupDeadline?.checkId !== lastConsumerId ||
      !Number.isSafeInteger(output.maximumPathCount) ||
      output.maximumPathCount < 1 ||
      output.symlinkPolicy !== "prohibited" ||
      output.evidenceInventoryRequired !== true ||
      output.emptyOutputPermitted !== false ||
      output.affectsLaterCertificationStage !== false ||
      !policy?.generatedOutputIds.includes(output.id)
    ) {
      issues.push(`generated-output entry is malformed: ${String(output?.id)}`);
      continue;
    }
    if (
      output.pathType === "file" &&
      (output.maximumPathCount !== 1 || inventory?.kind !== "sealed-single-file")
    ) {
      issues.push(`generated file inventory policy is invalid: ${output.id}`);
    }
    if (output.pathType === "directory") {
      if (
        inventory?.kind !== "producer-stdout-manifest" ||
        typeof inventory.schema !== "string" ||
        !inventory.schema ||
        typeof inventory.stdoutPrefix !== "string" ||
        !inventory.stdoutPrefix ||
        !Array.isArray(inventory.requiredFiles) ||
        inventory.requiredFiles.length === 0 ||
        inventory.requiredFiles.some((name) => !safeGeneratedOutputRelativePath(name)) ||
        !Array.isArray(inventory.producerSourcePaths) ||
        inventory.producerSourcePaths.length === 0 ||
        inventory.producerSourcePaths.some((name) => !safeGeneratedOutputRelativePath(name))
      ) {
        issues.push(`generated directory inventory policy is invalid: ${output.id}`);
      }
    }
  }
  for (const [index, left] of outputs.entries()) {
    for (const right of outputs.slice(index + 1)) {
      if (
        left.relativePath === right.relativePath ||
        left.relativePath.startsWith(`${right.relativePath}/`) ||
        right.relativePath.startsWith(`${left.relativePath}/`)
      ) {
        issues.push(`generated-output paths overlap: ${left.id}, ${right.id}`);
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

export function sourceGeneratedOutputContract(repositoryRoot) {
  const contractPath = path.join(
    repositoryRoot,
    "docs/qa/production-certification-source-generated-outputs.v1.json",
  );
  const bytes = readFileSync(contractPath);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("source generated-output contract is invalid JSON");
  }
  const validation = validateSourceGeneratedOutputContractValue(value);
  if (!validation.valid) {
    throw new Error(validation.issues.join("; "));
  }
  return Object.freeze({
    value,
    path: "docs/qa/production-certification-source-generated-outputs.v1.json",
    sha256: sha256Bytes(bytes),
    entrySha256: Object.fromEntries(
      value.outputs.map((entry) => [entry.id, sha256Bytes(canonicalJsonBytes(entry))]),
    ),
    policySha256: Object.fromEntries(
      value.checkPolicies.map((entry) => [entry.checkId, sha256Bytes(canonicalJsonBytes(entry))]),
    ),
  });
}

export function sourceValidationCheckSet(repositoryRoot) {
  const contract = productionCertificationContract(repositoryRoot);
  const environmentContract = stageEnvironmentContract(repositoryRoot);
  const checks = contract.value.sourceValidation.checks;
  const ids = [];
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new Error("source-validation check set is missing or empty");
  }
  for (const check of checks) {
    if (
      !check ||
      typeof check.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(check.id) ||
      typeof check.canonicalCommand !== "string" ||
      !check.canonicalCommand ||
      typeof check.executable !== "string" ||
      !check.executable ||
      !new Set(["npm", "node", "git"]).has(check.executable) ||
      !Array.isArray(check.args) ||
      check.args.some((argument) => typeof argument !== "string") ||
      check.args.some(
        (argument) => !/^[A-Za-z0-9._:/=@-]+$/.test(argument),
      ) ||
      [check.executable, ...check.args].join(" ") !== check.canonicalCommand ||
      (check.executable === "npm" &&
        (check.args[0] !== "run" || check.args.length < 2)) ||
      (check.executable === "node" &&
        (!check.args[0]?.startsWith("scripts/") ||
          !check.args[0].endsWith(".mjs"))) ||
      (check.executable === "git" &&
        JSON.stringify(check.args) !== JSON.stringify(["diff", "--check"])) ||
      typeof check.commandOwner !== "string" ||
      !check.commandOwner ||
      typeof check.environmentProfileId !== "string" ||
      !environmentContract.profiles[check.environmentProfileId] ||
      !environmentContract.profiles[check.environmentProfileId].stages.includes(
        "source-validation",
      ) ||
      typeof check.qualificationEnvironmentProfileId !== "string" ||
      !environmentContract.profiles[check.qualificationEnvironmentProfileId] ||
      !environmentContract.profiles[
        check.qualificationEnvironmentProfileId
      ].stages.includes("source-validation") ||
      !Array.isArray(check.requiredEnvironmentNames) ||
      !Array.isArray(check.expectedEvidence) ||
      typeof check.substantive !== "boolean" ||
      check.continueAfterFailure !== false
    ) {
      throw new Error("source-validation check contract is malformed");
    }
    ids.push(check.id);
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error("source-validation check IDs are duplicated");
  }
  const generatedOutputs = sourceGeneratedOutputContract(repositoryRoot);
  const generatedOutputValidation = validateSourceGeneratedOutputContractValue(
    generatedOutputs.value,
    ids,
  );
  const generatedOutputMatrix = contract.value.sourceValidation.generatedOutputContract;
  if (
    !generatedOutputValidation.valid ||
    generatedOutputMatrix?.schema !== generatedOutputs.value.schema ||
    generatedOutputMatrix?.path !== generatedOutputs.path ||
    generatedOutputMatrix?.unknownOutputPolicy !== "fail-closed" ||
    JSON.stringify(generatedOutputMatrix?.terminalPersistentIgnoredRoots) !==
      JSON.stringify(["node_modules"]) ||
    generatedOutputMatrix?.evidenceSchema !==
      PRODUCTION_CERTIFICATION_SOURCE_GENERATED_OUTPUT_EVIDENCE_SCHEMA
  ) {
    throw new Error(
      generatedOutputValidation.issues.length > 0
        ? generatedOutputValidation.issues.join("; ")
        : "source generated-output contract matrix binding is invalid",
    );
  }
  const semantic = {
    schema: contract.value.sourceValidation.schema,
    workingDirectoryPolicy:
      contract.value.sourceValidation.workingDirectoryPolicy,
    stopOnFirstRequiredFailure:
      contract.value.sourceValidation.stopOnFirstRequiredFailure,
    fixtureCommandOwner: contract.value.sourceValidation.fixtureCommandOwner,
    environmentContractSha256: environmentContract.sha256,
    generatedOutputContractSha256: generatedOutputs.sha256,
    checks,
  };
  if (
    semantic.workingDirectoryPolicy !== "exact-candidate-root" ||
    semantic.stopOnFirstRequiredFailure !== true ||
    semantic.fixtureCommandOwner !==
      "scripts/production-certification-source-continuity.mjs"
  ) {
    throw new Error("source-validation execution policy is malformed");
  }
  return Object.freeze({
    ...semantic,
    checks: Object.freeze(checks.map((check) => Object.freeze({ ...check }))),
    generatedOutputs,
    sha256: sha256Bytes(canonicalJsonBytes(semantic)),
    contractMatrixSha256: contract.sha256,
  });
}

export function continuityContract(repositoryRoot) {
  const contract = productionCertificationContract(repositoryRoot);
  const continuity = contract.value.continuity;
  const positions = continuity.lifecyclePositions;
  if (
    continuity.syntheticCopiedHashAllowed !== false ||
    continuity.retainPhysicalRootsUntilPassed !== true ||
    JSON.stringify(continuity.integrationReadyRequires) !==
      JSON.stringify(["source-validation", "final-standalone", "continuity"]) ||
    !Array.isArray(positions) ||
    positions.length !== 6 ||
    new Set(positions.map((position) => position.id)).size !== positions.length ||
    positions.some(
      (position) =>
        typeof position.id !== "string" ||
        !CERTIFICATION_STAGE_ORDER.includes(position.stage) ||
        typeof position.captureCommand !== "string" ||
        !position.captureCommand ||
        typeof position.rootClassification !== "string" ||
        !position.rootClassification ||
        !Array.isArray(position.scopes) ||
        position.scopes.length === 0,
    )
  ) {
    throw new Error("continuity lifecycle contract is incomplete or synthetic");
  }
  for (const scope of [
    "canonicalApplicationArtifact",
    "executableArchiveClosure",
  ]) {
    const comparison = continuity.comparisons?.[scope];
    if (!Array.isArray(comparison) || comparison.length < 3) {
      throw new Error(`continuity comparison scope is incomplete: ${scope}`);
    }
    for (const position of comparison) {
      if (!positions.some((entry) => entry.id === position)) {
        throw new Error(`continuity comparison references unknown position: ${position}`);
      }
    }
  }
  const semantic = {
    schema: continuity.schema,
    syntheticCopiedHashAllowed: continuity.syntheticCopiedHashAllowed,
    retainPhysicalRootsUntilPassed: continuity.retainPhysicalRootsUntilPassed,
    integrationReadyRequires: continuity.integrationReadyRequires,
    scopes: continuity.scopes,
    lifecyclePositions: positions,
    comparisons: continuity.comparisons,
  };
  return Object.freeze({
    ...semantic,
    sha256: sha256Bytes(canonicalJsonBytes(semantic)),
    contractMatrixSha256: contract.sha256,
  });
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
