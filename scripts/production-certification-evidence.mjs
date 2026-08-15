import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import {
  CERTIFICATION_EVIDENCE_ROOT_ENV,
  CERTIFICATION_STATE_ENV,
  PRODUCTION_CERTIFICATION_BROWSER_EVIDENCE_SCHEMA,
  PRODUCTION_CERTIFICATION_FINAL_EVIDENCE_SCHEMA,
  PRODUCTION_CERTIFICATION_PHASE8_EVIDENCE_SCHEMA,
  PRODUCTION_CERTIFICATION_RUNTIME_EVIDENCE_SCHEMA,
  PRODUCTION_CERTIFICATION_STATE_SCHEMA,
  PRODUCTION_CERTIFICATION_STATE_SCHEMA_V1,
  PHASE8_SOURCE_BINDING_PATHS,
  REQUIRED_BROWSER_OWNERS,
  canonicalJsonBytes,
  isSha256,
  productionArchiveInventoryIssues,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import { inventoryProductionArchiveTree } from "./production-archive.mjs";
import { deriveProductionVerifierClosure } from "./production-verifier-closure.mjs";
import { validateRequiredTestReport } from "./required-test-truthfulness.mjs";
import {
  readRuntimeSmokeTelemetryBootstrapEvidence,
  validateRetainedRuntimeSmokePhaseTimings,
} from "./production-artifact-evidence.mjs";
import {
  readCertificationState,
  validateCertificationState,
} from "./production-certification-state.mjs";

const PHASE8_SCALES = Object.freeze(["small", "medium", "large"]);
const PHASE8_OPERATIONS = Object.freeze([
  "fingerprintCold",
  "fingerprintCached",
  "save",
  "load",
]);
const PHASE8_SAMPLE_COUNTS = Object.freeze({ small: 160, medium: 80, large: 30 });
const RUNTIME_TEST_IDS = Object.freeze([
  "runtime.template-stability",
  "runtime.health-catalog-ready",
]);
const PLAYWRIGHT_START_SCHEMA =
  "interior-ai.production-certification-playwright-start.v1";

function startMarkerIssues(marker, { boundary, gateId }) {
  const issues = [];
  if (marker?.schema !== PLAYWRIGHT_START_SCHEMA) {
    issues.push(`Playwright ${gateId} start marker schema is invalid`);
  }
  if (marker?.boundary !== boundary || marker?.gateId !== gateId) {
    issues.push(`Playwright ${gateId} start marker boundary is invalid`);
  }
  if (
    boundary === "discovery" &&
    (!Number.isSafeInteger(marker?.discoveredTestCount) ||
      marker.discoveredTestCount < 1)
  ) {
    issues.push(`Playwright ${gateId} discovery marker has no discovered tests`);
  }
  if (
    boundary === "test-begin" &&
    (typeof marker?.title !== "string" || !marker.title)
  ) {
    issues.push(`Playwright ${gateId} product-test marker has no test title`);
  }
  return issues;
}

function readCanonicalJson(filePath, description) {
  let bytes;
  try {
    bytes = readFileSync(filePath);
  } catch {
    throw new Error(`${description} is missing or unreadable`);
  }
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${description} is not valid JSON`);
  }
  if (!bytes.equals(canonicalJsonBytes(value))) {
    throw new Error(`${description} is not canonical JSON`);
  }
  return { bytes, value, sha256: sha256Bytes(bytes) };
}

function containedEvidencePath(evidenceRoot, relativePath) {
  if (
    typeof relativePath !== "string" ||
    path.isAbsolute(relativePath) ||
    path.normalize(relativePath) !== relativePath ||
    relativePath.includes("\\")
  ) {
    throw new Error("certification evidence path is malformed");
  }
  const root = path.resolve(evidenceRoot);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("certification evidence path escapes its authorized root");
  }
  return resolved;
}

function boundEvidence(state, evidenceRoot, name) {
  const descriptor = state.evidenceFiles?.[name];
  if (!descriptor || !isSha256(descriptor.sha256)) {
    throw new Error(`certification evidence binding is missing: ${name}`);
  }
  const read = readCanonicalJson(
    containedEvidencePath(evidenceRoot, descriptor.path),
    `certification evidence ${name}`,
  );
  if (read.sha256 !== descriptor.sha256) {
    throw new Error(`certification evidence hash mismatch: ${name}`);
  }
  return read;
}

function boundRawJsonEvidence(state, evidenceRoot, name) {
  const descriptor = state.evidenceFiles?.[name];
  if (!descriptor || !isSha256(descriptor.sha256)) {
    throw new Error(`certification evidence binding is missing: ${name}`);
  }
  const filePath = containedEvidencePath(evidenceRoot, descriptor.path);
  let bytes;
  let value;
  try {
    bytes = readFileSync(filePath);
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`certification evidence ${name} is missing or invalid JSON`);
  }
  const sha256 = sha256Bytes(bytes);
  if (sha256 !== descriptor.sha256) {
    throw new Error(`certification evidence hash mismatch: ${name}`);
  }
  return { bytes, value, sha256, filePath };
}

function identityIssues(identity, state) {
  const expected = {
    certificationId: state.certificationId,
    candidateId: state.candidate.id,
    commitSha: state.candidate.commitSha,
    treeSha: state.candidate.treeSha,
    parentSha: state.candidate.parentSha,
    nextBuildId: state.bindings.nextBuildId,
    artifactSha256: state.bindings.artifactSha256,
    harnessVersion: state.harness.version,
    harnessSourceSha256: state.harness.sourceSha256,
  };
  return JSON.stringify(identity) === JSON.stringify(expected)
    ? []
    : ["certification evidence belongs to another candidate, artifact, or harness"];
}

function validateExecutionClass(evidence, state, issues) {
  const expectedSimulation = state.executionClass === "deterministic-simulation";
  if (
    evidence?.executionClass !== state.executionClass ||
    evidence?.simulation !== expectedSimulation
  ) {
    issues.push("certification evidence execution classification is contradictory");
  }
}

function validatePhase8Evidence(evidence, state, artifactRoot) {
  const issues = [];
  if (evidence?.schema !== PRODUCTION_CERTIFICATION_PHASE8_EVIDENCE_SCHEMA) {
    issues.push("Phase 8 certification evidence schema is unsupported");
  }
  issues.push(...identityIssues(evidence?.identity, state));
  validateExecutionClass(evidence, state, issues);
  if (
    evidence?.childCalculatedPassed !== true ||
    evidence?.parentValidatedPassed !== true ||
    evidence?.complete !== true ||
    evidence?.contradictions?.length !== 0
  ) {
    issues.push("Phase 8 child/parent validation or completion is incomplete");
  }
  const sourceBindings = evidence?.sourceBindings;
  if (
    !Array.isArray(sourceBindings) ||
    JSON.stringify(sourceBindings.map((binding) => binding.path)) !==
      JSON.stringify(PHASE8_SOURCE_BINDING_PATHS) ||
    sourceBindings.some(
      (binding) =>
        !isSha256(binding?.sha256) ||
        sha256Bytes(readFileSync(path.join(artifactRoot, binding.path))) !== binding.sha256,
    )
  ) {
    issues.push("Phase 8 benchmark source/input hashes are incomplete");
  }
  let projectBudgets = null;
  try {
    projectBudgets = JSON.parse(
      readFileSync(path.join(artifactRoot, "config/phase8-performance-budgets.json"), "utf8"),
    ).projectBenchmarks;
  } catch {
    issues.push("Phase 8 canonical performance budgets are unavailable");
  }
  const measurements = evidence?.measurements;
  if (!Array.isArray(measurements) || measurements.length !== PHASE8_SCALES.length) {
    issues.push("Phase 8 scale measurement inventory is incomplete");
  } else {
    for (const scale of PHASE8_SCALES) {
      const measurement = measurements.find((entry) => entry.scale === scale);
      if (
        !measurement ||
        measurement.maxSerializedBytes !== projectBudgets?.[scale]?.maxSerializedBytes ||
        measurement.fixture?.serializedBytes > measurement.maxSerializedBytes ||
        measurement.serializedSizePassed !== true ||
        !Array.isArray(measurement.operations) ||
        measurement.operations.length !== PHASE8_OPERATIONS.length
      ) {
        issues.push(`Phase 8 ${scale} measurement is incomplete`);
        continue;
      }
      for (const operationName of PHASE8_OPERATIONS) {
        const operation = measurement.operations.find(
          (entry) => entry.operation === operationName,
        );
        if (
          !operation ||
          operation.thresholdMs !==
            projectBudgets?.[scale]?.maxP95Ms?.[operationName] ||
          operation.passed !== true ||
          !Array.isArray(operation.samplesMs) ||
          operation.samplesMs.length !== PHASE8_SAMPLE_COUNTS[scale] ||
          operation.samplesMs.some(
            (sample) => typeof sample !== "number" || !Number.isFinite(sample) || sample < 0,
          ) ||
          !isSha256(operation.samplesSha256)
        ) {
          issues.push(`Phase 8 ${scale} ${operationName} raw evidence is incomplete`);
        } else {
          const ordered = [...operation.samplesMs].sort((left, right) => left - right);
          const percentile = (fraction) =>
            Number(
              ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)].toFixed(6),
            );
          if (
            operation.samplesSha256 !==
              sha256Bytes(JSON.stringify(operation.samplesMs)) ||
            operation.p50Ms !== percentile(0.5) ||
            operation.p95Ms !== percentile(0.95) ||
            operation.maxMs !== Number(ordered.at(-1).toFixed(6)) ||
            operation.p95Ms > operation.thresholdMs
          ) {
            issues.push(`Phase 8 ${scale} ${operationName} samples contradict their summary`);
          }
        }
        if (
          scale === "large" &&
          operationName === "fingerprintCold" &&
          !(operation?.p95Ms <= 6)
        ) {
          issues.push("Phase 8 large fingerprintCold p95 exceeds 6 ms");
        }
        if (
          scale === "large" &&
          operationName === "load" &&
          !(operation?.p95Ms <= 10)
        ) {
          issues.push("Phase 8 large load p95 exceeds 10 ms");
        }
      }
    }
  }
  for (const gate of ["project", "bundle", "runtime", "boundary"]) {
    if (evidence?.budgets?.[gate] !== "passed") {
      issues.push(`Phase 8 ${gate} budget did not pass`);
    }
  }
  return issues;
}

function validateRuntimeEvidence(evidence, state) {
  const issues = [];
  if (evidence?.schema !== PRODUCTION_CERTIFICATION_RUNTIME_EVIDENCE_SCHEMA) {
    issues.push("runtime-smoke certification evidence schema is unsupported");
  }
  issues.push(...identityIssues(evidence?.identity, state));
  validateExecutionClass(evidence, state, issues);
  const stats = evidence?.stats;
  if (
    stats?.expected !== 2 ||
    stats?.passed !== 2 ||
    stats?.unexpected !== 0 ||
    stats?.skipped !== 0 ||
    stats?.flaky !== 0 ||
    stats?.retries !== 0
  ) {
    issues.push("runtime-smoke evidence must record 2/2 with zero retries, flakes, or skips");
  }
  const testIds = evidence?.tests?.map((entry) => entry.id).sort();
  if (JSON.stringify(testIds) !== JSON.stringify([...RUNTIME_TEST_IDS].sort())) {
    issues.push("runtime-smoke test identity inventory is incomplete");
  }
  if (
    !Array.isArray(evidence?.tests) ||
    evidence.tests.some(
      (entry) =>
        entry.outcome !== "passed" || entry.retries !== 0 || entry.skipped === true,
    )
  ) {
    issues.push("runtime-smoke per-test outcomes contradict their aggregate result");
  }
  const realms = evidence?.telemetryProvenance;
  if (
    !Array.isArray(realms) ||
    JSON.stringify(realms.map((entry) => entry.realm)) !==
      JSON.stringify(["initial", "reload-1", "reload-2", "reload-3"]) ||
    realms.some(
      (entry) =>
        entry.valid !== true ||
        !Number.isSafeInteger(entry.activationGeneration) ||
        entry.activationGeneration <= 0,
    )
  ) {
    issues.push("runtime-smoke telemetry provenance is incomplete");
  }
  if (
    !isSha256(evidence?.reportSha256) ||
    !isSha256(evidence?.phaseTimingsSha256) ||
    evidence?.complete !== true
  ) {
    issues.push("runtime-smoke raw hashes or completion marker are missing");
  }
  return issues;
}

function requiredOwnerGate(requiredManifest, gateId) {
  const gate = requiredManifest.gates?.find((entry) => entry.id === gateId);
  if (!gate) throw new Error(`required browser owner is unregistered: ${gateId}`);
  return gate;
}

function validateBrowserEvidence(evidence, owner, gate, state) {
  const issues = [];
  if (
    evidence?.schema !== PRODUCTION_CERTIFICATION_BROWSER_EVIDENCE_SCHEMA ||
    evidence?.ownerId !== owner.id ||
    evidence?.gateId !== owner.gateId
  ) {
    issues.push(`browser-owner evidence identity is invalid: ${owner.id}`);
  }
  issues.push(...identityIssues(evidence?.identity, state));
  validateExecutionClass(evidence, state, issues);
  const expected = (gate.requiredTests ?? []).flatMap((test) =>
    (gate.requiredProjects ?? []).map((project) => ({
      id: test.id,
      file: test.file,
      title: test.title,
      project,
    })),
  );
  const actual = (evidence?.tests ?? []).map(({ id, file, title, project }) => ({
    id,
    file,
    title,
    project,
  }));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    issues.push(`browser-owner required identities are incomplete: ${owner.id}`);
  }
  if (
    !Array.isArray(evidence?.tests) ||
    evidence.tests.some(
      (test) => test.outcome !== "passed" || test.retries !== 0 || test.skipped === true,
    ) ||
    evidence?.stats?.passed !== expected.length ||
    evidence?.stats?.unexpected !== 0 ||
    evidence?.stats?.skipped !== 0 ||
    evidence?.stats?.flaky !== 0 ||
    evidence?.stats?.retries !== 0
  ) {
    issues.push(`browser-owner outcomes are not complete and clean: ${owner.id}`);
  }
  if (!isSha256(evidence?.reportSha256) || evidence?.complete !== true) {
    issues.push(`browser-owner report hash or completion marker is missing: ${owner.id}`);
  }
  return issues;
}

function validateRawPhase8Evidence(raw, evidence, state) {
  const issues = [];
  if (
    raw?.schema !== "interior-ai.phase8-project-benchmark-evidence.v1" ||
    raw?.run?.sourceCommitSha !== state.candidate.commitSha ||
    raw?.run?.sourceTreeSha !== state.candidate.treeSha ||
    raw?.integrity?.childCalculated?.passed !== true ||
    raw?.integrity?.parentValidated?.passed !== true ||
    raw?.integrity?.finalPassed !== true ||
    JSON.stringify(
      raw?.sourceBindings?.map(({ path: sourcePath, sha256 }) => ({
        path: sourcePath,
        sha256,
      })),
    ) !== JSON.stringify(evidence?.sourceBindings) ||
    JSON.stringify(raw?.measurements) !== JSON.stringify(evidence?.measurements)
  ) {
    issues.push("Phase 8 certification summary contradicts its raw parent-validated evidence");
  }
  return issues;
}

function validateRawPlaywrightReport({
  report,
  gateId,
  artifactRoot,
  state,
  requireMetadata,
}) {
  const truthfulness = validateRequiredTestReport({
    repositoryRoot: artifactRoot,
    gateId,
    report,
    processExitCode: 0,
    requireMetadata,
    validateRepository: false,
    expectedSourceCommitSha: state.candidate.commitSha,
    expectedArtifactSha256: state.bindings.artifactSha256,
    environment: {},
  });
  const issues = [...truthfulness.issues];
  if (gateId === "ci.production-runtime-smoke") {
    const identity = report?.config?.metadata?.productionArtifactEvidence;
    if (
      identity?.candidateIdentifier !== state.candidate.id ||
      identity?.sourceCommitSha !== state.candidate.commitSha ||
      identity?.sourceTreeSha !== state.candidate.treeSha ||
      identity?.artifactSha256 !== state.bindings.artifactSha256 ||
      identity?.nextBuildId !== state.bindings.nextBuildId ||
      identity?.runNonce !== state.bindings.semanticJournalNonce ||
      identity?.semanticJournalSchema !==
        "interior-ai.production-artifact-semantic-event-journal.v1" ||
      identity?.semanticJournalVersion !== 1 ||
      identity?.serverCommand !== "npm run evidence:production:serve" ||
      identity?.buildMode !== "production"
    ) {
      issues.push("runtime-smoke raw report does not identify the certified artifact");
    }
  } else {
    const metadata = report?.config?.metadata?.requiredTestEvidence;
    const owner = REQUIRED_BROWSER_OWNERS.find(
      (candidate) => candidate.gateId === gateId,
    );
    if (
      !owner ||
      metadata?.sourceCommitSha !== state.candidate.commitSha ||
      metadata?.sourceTreeSha !== state.candidate.treeSha ||
      metadata?.artifactSha256 !== state.bindings.artifactSha256 ||
      metadata?.nextBuildId !== state.bindings.nextBuildId ||
      metadata?.releaseCandidateId !== state.candidate.id ||
      metadata?.releaseEnvironment !== owner.applicationEnvironment ||
      metadata?.harnessVersion !== String(state.harness.version) ||
      metadata?.harnessSourceSha256 !== state.harness.sourceSha256 ||
      metadata?.destinationClass !== "external-evidence-root"
    ) {
      issues.push(`browser-owner raw report identity is incomplete: ${gateId}`);
    }
  }
  return { issues, truthfulness };
}

function manifestIdentityIssues(manifestRead, artifactRoot, state) {
  const issues = [];
  const manifest = manifestRead.value;
  if (
    manifest?.schema !== "interior-ai.production-artifact-evidence.v3" ||
    manifest?.candidateIdentifier !== state.candidate.id ||
    manifest?.source?.commitSha !== state.candidate.commitSha ||
    manifest?.source?.treeSha !== state.candidate.treeSha ||
    manifest?.build?.nextBuildId !== state.bindings.nextBuildId ||
    manifest?.artifact?.sha256 !== state.bindings.artifactSha256 ||
    manifest?.execution?.runNonce !== state.bindings.semanticJournalNonce ||
    manifestRead.sha256 !== state.bindings.productionManifestSha256
  ) {
    issues.push("production manifest does not match the complete candidate identity");
  }
  const journalRead = readCanonicalJson(
    path.join(
      artifactRoot,
      ".local/production-artifact-evidence/semantic-event-journal.json",
    ),
    "semantic journal v1",
  );
  if (
    journalRead.value?.schema !==
      "interior-ai.production-artifact-semantic-event-journal.v1" ||
    journalRead.value?.runNonce !== state.bindings.semanticJournalNonce ||
    journalRead.sha256 !== state.bindings.semanticJournalSha256
  ) {
    issues.push("semantic journal does not match the complete candidate identity");
  }
  return issues;
}

export function verifyFinalCertificationEvidence({
  artifactRoot,
  manifestPath,
  environment = process.env,
}) {
  const statePath = environment[CERTIFICATION_STATE_ENV]?.trim();
  const evidenceRoot = environment[CERTIFICATION_EVIDENCE_ROOT_ENV]?.trim();
  if (!statePath || !evidenceRoot) {
    throw new Error("final standalone verification requires certification state and evidence root");
  }
  const physicalEvidenceRoot = realpathSync(evidenceRoot);
  const root = path.resolve(artifactRoot);
  const artifactRootEntry = lstatSync(root);
  const physicalArtifactRoot = realpathSync(root);
  const evidenceRootEntry = lstatSync(evidenceRoot);
  const stateEntry = lstatSync(statePath);
  const physicalStatePath = realpathSync(statePath);
  if (
    evidenceRootEntry.isSymbolicLink() ||
    !evidenceRootEntry.isDirectory() ||
    artifactRootEntry.isSymbolicLink() ||
    !artifactRootEntry.isDirectory() ||
    physicalArtifactRoot !==
      path.join(physicalEvidenceRoot, "archive/extracted") ||
    stateEntry.isSymbolicLink() ||
    !stateEntry.isFile() ||
    !physicalStatePath.startsWith(`${physicalEvidenceRoot}${path.sep}`)
  ) {
    throw new Error(
      "final standalone artifact/state/evidence paths are not canonical physical paths",
    );
  }
  const state = readCertificationState(statePath);
  if (
    !new Set([
      PRODUCTION_CERTIFICATION_STATE_SCHEMA_V1,
      PRODUCTION_CERTIFICATION_STATE_SCHEMA,
    ]).has(state.schema)
  ) {
    throw new Error("final standalone certification state schema is unsupported");
  }
  if (
    state.executionClass === "deterministic-simulation" &&
    environment.CERTIFICATION_ALLOW_SIMULATION !== "1"
  ) {
    throw new Error("deterministic simulation evidence cannot certify a real candidate");
  }
  const stateValidation = validateCertificationState({
    state,
    evidenceRoot,
    expectedCandidate: state.candidate,
    expectedHarnessSourceSha256: state.harness.sourceSha256,
    repositoryRoot: root,
    verifyCurrentSource: false,
  });
  const issues = [...stateValidation.issues];
  for (const stage of [
    "doctor",
    "source-validation",
    "build",
    "archive-preflight",
    "archive",
    "extracted-archive-preflight",
    "phase8",
    "runtime-smoke",
    "browser-owners",
  ]) {
    if (state.stages?.[stage]?.status !== "passed") {
      issues.push(`final standalone requires passed stage ${stage}`);
    }
  }
  const manifestRead = readCanonicalJson(
    path.resolve(root, manifestPath),
    "production manifest v3",
  );
  issues.push(...manifestIdentityIssues(manifestRead, root, state));
  const phase8 = boundEvidence(state, evidenceRoot, "phase8");
  const rawPhase8 = boundEvidence(state, evidenceRoot, "phase8-raw");
  const phase8Completion = boundEvidence(
    state,
    evidenceRoot,
    "phase8-completion",
  );
  const runtime = boundEvidence(state, evidenceRoot, "runtime-smoke");
  const rawRuntime = boundEvidence(state, evidenceRoot, "runtime-report");
  const runtimeStart = boundEvidence(state, evidenceRoot, "runtime-start");
  const rawRuntimeTimings = boundRawJsonEvidence(
    state,
    evidenceRoot,
    "runtime-phase-timings",
  );
  const archiveInventory = boundEvidence(
    state,
    evidenceRoot,
    "archive-inventory",
  );
  issues.push(...validatePhase8Evidence(phase8.value, state, root));
  issues.push(...validateRuntimeEvidence(runtime.value, state));
  issues.push(
    ...startMarkerIssues(runtimeStart.value, {
      boundary: "test-begin",
      gateId: "ci.production-runtime-smoke",
    }),
  );
  issues.push(...productionArchiveInventoryIssues(archiveInventory.value));
  if (
    archiveInventory.value?.inventorySha256 !==
    state.bindings.archiveInventorySha256
  ) {
    issues.push("retained archive inventory does not match its state binding");
  }
  try {
    const extractedInventory = readCanonicalJson(
      path.join(root, ".certification/archive-inventory.json"),
      "extracted archive inventory",
    );
    issues.push(...productionArchiveInventoryIssues(extractedInventory.value));
    const physicalInventory = inventoryProductionArchiveTree(root);
    if (
      extractedInventory.sha256 !== archiveInventory.sha256 ||
      extractedInventory.value.inventorySha256 !==
        state.bindings.archiveInventorySha256 ||
      physicalInventory.inventorySha256 !==
        state.bindings.archiveInventorySha256
    ) {
      issues.push(
        "retained, extracted, and physical archive inventories do not match",
      );
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  if (
    phase8Completion.value?.schema !==
      "interior-ai.phase8-project-benchmark-parent-completion.v1" ||
    phase8Completion.value?.reportFile !== "evidence.json" ||
    phase8Completion.value?.reportSha256 !== rawPhase8.sha256 ||
    phase8Completion.value?.nonce !== rawPhase8.value?.run?.nonce
  ) {
    issues.push("Phase 8 completion marker is missing or contradicts retained evidence");
  }
  if (state.executionClass === "real-candidate") {
    issues.push(...validateRawPhase8Evidence(rawPhase8.value, phase8.value, state));
    issues.push(
      ...validateRawPlaywrightReport({
        report: rawRuntime.value,
        gateId: "ci.production-runtime-smoke",
        artifactRoot: root,
        state,
        requireMetadata: false,
      }).issues,
    );
    const telemetry = readRuntimeSmokeTelemetryBootstrapEvidence(rawRuntime.value);
    issues.push(...telemetry.issues.map((issue) => `runtime telemetry: ${issue}`));
    const observedTelemetry = telemetry.observations.map((observation) => ({
      realm:
        observation.phaseName === "initial-document"
          ? "initial"
          : observation.phaseName,
      activationGeneration:
        observation.telemetry?.collectorActivationGeneration ?? null,
      valid: observation.valid,
    }));
    if (
      JSON.stringify(observedTelemetry) !==
      JSON.stringify(runtime.value?.telemetryProvenance)
    ) {
      issues.push("runtime telemetry summary contradicts the retained raw report");
    }
    const timingValidation = validateRetainedRuntimeSmokePhaseTimings({
      repositoryRoot: root,
      timingPath: rawRuntimeTimings.filePath,
      timingSha256: rawRuntimeTimings.sha256,
      report: rawRuntime.value,
      environment: {},
    });
    issues.push(
      ...timingValidation.issues.map((issue) => `runtime phase timings: ${issue}`),
    );
  }
  let closure;
  try {
    closure = deriveProductionVerifierClosure(root);
    if (closure.closureSha256 !== state.bindings.verifierSourceClosureSha256) {
      issues.push("physical verifier source closure does not match certification state");
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  let requiredManifest;
  try {
    requiredManifest = JSON.parse(
      readFileSync(path.join(root, "scripts/required-test-manifest.json"), "utf8"),
    );
  } catch {
    throw new Error("required-test manifest is missing or invalid JSON");
  }
  const reportHashes = [runtime.value?.reportSha256];
  if (
    state.evidenceFiles?.["runtime-report"]?.sha256 !== runtime.value?.reportSha256
  ) {
    issues.push("runtime-smoke raw report is not retained by state");
  }
  if (
    state.evidenceFiles?.["runtime-phase-timings"]?.sha256 !==
    runtime.value?.phaseTimingsSha256
  ) {
    issues.push("runtime-smoke phase timings are not retained by state");
  }
  if (
    state.evidenceFiles?.["phase8-raw"]?.sha256 !== phase8.value?.rawEvidenceSha256
  ) {
    issues.push("Phase 8 raw evidence is not retained by state");
  }
  if (state.evidenceFiles?.archive?.sha256 !== state.bindings.archiveSha256) {
    issues.push("retained compressed archive does not match its state binding");
  }
  const browserEvidenceSha256 = {};
  const browserReportSha256 = {};
  const browserStartSha256 = {};
  for (const owner of REQUIRED_BROWSER_OWNERS) {
    const evidence = boundEvidence(state, evidenceRoot, `browser:${owner.id}`);
    const rawReport = boundEvidence(
      state,
      evidenceRoot,
      `browser-report:${owner.id}`,
    );
    const startMarker = boundEvidence(
      state,
      evidenceRoot,
      `browser-start:${owner.id}`,
    );
    const gate = requiredOwnerGate(requiredManifest, owner.gateId);
    issues.push(...validateBrowserEvidence(evidence.value, owner, gate, state));
    issues.push(
      ...startMarkerIssues(startMarker.value, {
        boundary: "discovery",
        gateId: owner.gateId,
      }),
    );
    if (state.executionClass === "real-candidate") {
      const raw = validateRawPlaywrightReport({
        report: rawReport.value,
        gateId: owner.gateId,
        artifactRoot: root,
        state,
        requireMetadata: true,
      });
      issues.push(...raw.issues);
      const rawRecords = raw.truthfulness.records
        .map(({ file, title, project, outcome, retries }) => ({
          file,
          title,
          project,
          outcome,
          retries,
        }))
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        );
      const summaryRecords = (evidence.value?.tests ?? [])
        .map(({ file, title, project, outcome, retries }) => ({
          file,
          title,
          project,
          outcome,
          retries,
        }))
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        );
      if (JSON.stringify(rawRecords) !== JSON.stringify(summaryRecords)) {
        issues.push(`browser-owner summary contradicts raw report: ${owner.id}`);
      }
    }
    reportHashes.push(evidence.value?.reportSha256);
    if (
      state.evidenceFiles?.[`browser-report:${owner.id}`]?.sha256 !==
      evidence.value?.reportSha256
    ) {
      issues.push(`browser-owner raw report is not retained by state: ${owner.id}`);
    }
    browserEvidenceSha256[owner.id] = evidence.sha256;
    browserReportSha256[owner.id] = rawReport.sha256;
    browserStartSha256[owner.id] = startMarker.sha256;
    if (state.bindings.browserOwnerEvidenceSha256?.[owner.id] !== evidence.sha256) {
      issues.push(`browser-owner state hash mismatch: ${owner.id}`);
    }
  }
  if (
    reportHashes.some((digest) => !isSha256(digest)) ||
    new Set(reportHashes).size !== reportHashes.length
  ) {
    issues.push("runtime and browser report hashes must be present and unique");
  }
  for (const [binding, expected] of [
    ["phase8EvidenceSha256", phase8.sha256],
    ["runtimeSmokeEvidenceSha256", runtime.sha256],
  ]) {
    if (state.bindings[binding] !== expected) {
      issues.push(`certification state ${binding} does not match retained evidence`);
    }
  }
  if (issues.length > 0) throw new Error(issues.join("; "));
  return Object.freeze({
    schema: PRODUCTION_CERTIFICATION_FINAL_EVIDENCE_SCHEMA,
    certificationComplete: state.executionClass === "real-candidate",
    simulationComplete: state.executionClass === "deterministic-simulation",
    identity: {
      certificationId: state.certificationId,
      candidateId: state.candidate.id,
      commitSha: state.candidate.commitSha,
      treeSha: state.candidate.treeSha,
      parentSha: state.candidate.parentSha,
      nextBuildId: state.bindings.nextBuildId,
      artifactSha256: state.bindings.artifactSha256,
      manifestSha256: state.bindings.productionManifestSha256,
      journalSha256: state.bindings.semanticJournalSha256,
      journalNonce: state.bindings.semanticJournalNonce,
      verifierClosureSha256: state.bindings.verifierSourceClosureSha256,
      archiveSha256: state.bindings.archiveSha256,
      archiveInventorySha256: state.bindings.archiveInventorySha256,
      phase8Sha256: phase8.sha256,
      phase8RawSha256: rawPhase8.sha256,
      phase8CompletionSha256: phase8Completion.sha256,
      runtimeSha256: runtime.sha256,
      runtimeReportSha256: rawRuntime.sha256,
      runtimePhaseTimingsSha256: rawRuntimeTimings.sha256,
      runtimeStartSha256: runtimeStart.sha256,
      browserEvidenceSha256,
      browserReportSha256,
      browserStartSha256,
      harnessVersion: state.harness.version,
      harnessSourceSha256: state.harness.sourceSha256,
    },
  });
}
