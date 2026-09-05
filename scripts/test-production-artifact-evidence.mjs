import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  chmodSync,
  copyFileSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  FLOOR_PLAN_ROUTE_NFT_PATHS,
  PRODUCTION_EVIDENCE_VERIFIER_SOURCE_PATHS,
  canonicalizeBoundRuntimeSmokeReport,
  canonicalizeProductionEvidenceReport,
  certifiedNestedDatabaseUrl,
  comparePortablePaths,
  createProductionEvidenceBundle,
  createProductionEvidenceManifest,
  executeProductionEvidenceChild,
  handoffProductionEvidenceSemanticJournal,
  initializeProductionEvidenceSemanticJournal,
  inspectFloorPlanRouteNftContract,
  projectArtifactProductServerEnvironment,
  readProductionEvidenceSemanticJournal,
  recordProductionEvidenceTest,
  recoverProductionEvidenceFromSemanticJournal,
  resolveProductionEvidenceToolchain,
  validateProductionEvidenceSemanticJournal,
  validateProductionEvidence,
  validateArtifactProductServerAuthFixtureBinding,
  verifyRuntimeSmokeFailureEvidence,
  writeProductionEvidenceManifest,
} from "./production-artifact-evidence.mjs";
import {
  BUILD_COMMAND,
  CURRENT_PRODUCTION_EVIDENCE_VERSIONS,
  DEPENDENCY_INSTALL_COMMAND,
  GENERATED_SOURCE_CHECK_COMMAND,
  PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
  PRODUCTION_EVIDENCE_JOURNAL_VERSION,
  PRODUCTION_EVIDENCE_SCHEMA,
  PRODUCTION_EVIDENCE_SERVER_COMMAND,
  PRODUCTION_EVIDENCE_VALIDATOR_VERSION,
  PRODUCTION_EVIDENCE_VERIFICATION_MODES,
  PRODUCTION_EVIDENCE_VERIFICATION_RESULT_SCHEMA,
  certificationPreparedBuildJournalIssues,
  validateCurrentProductionEvidenceManifest,
} from "./production-artifact-contract.mjs";
import { inspectDirectProductionIdentity } from "./runtime-smoke-direct-production-identity.mjs";
import { loadProductionArtifactForPlaywright } from "./production-artifact-playwright.mjs";
import {
  assertDirectRuntimeSmokeServer,
  directRuntimeSmokeServerEnvironment,
  loadDirectRuntimeSmokeIdentity,
} from "./runtime-smoke-direct-identity.mjs";
import {
  PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT,
  authorizeRuntimeSmokeReportPath,
  resolvePlaywrightReportPath,
} from "./playwright-report-path.mjs";
import { validateRequiredTestReport } from "./required-test-truthfulness.mjs";
import { inspectGitTree } from "./vercel-output-manifest.mjs";
import { verifyStableRuntimeSmokeStandalone } from "./stable-runtime-smoke-standalone.mjs";
import { STABLE_PORTABLE_SUMMARY_PATH } from "./stable-runtime-smoke-resources.mjs";
import {
  certificationEnvironmentProfile,
  projectCertificationChildEnvironment,
} from "./production-certification-stage-environment.mjs";
import {
  GITLEAKS_ARCHIVE_ENTRIES,
  GITLEAKS_STAGING_ROOT,
  prepareGitleaksArtifact,
  verifyCheckedOutSourceIdentity,
  verifyGitleaksArtifact,
} from "./gitleaks-artifact.mjs";
import {
  FURNISHED_TEMPLATE_PHASE_CONTRACTS,
  FURNISHED_TEMPLATE_RELOAD_CONTRACT,
  RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT,
  RUNTIME_SMOKE_OVERHEAD_BUDGETS,
  RUNTIME_SMOKE_PHASE_BUDGETS,
  RUNTIME_SMOKE_PHASE_TIMING_SCHEMA,
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS,
  RuntimeSmokeNoProgressError,
  RuntimeSmokeOperationAttemptTimeoutError,
  RuntimeSmokeOperationTimeoutError,
  RuntimeSmokePhaseTimeoutError,
  RuntimeSmokeTerminalError,
  createRuntimeSmokeOperationDeadline,
  createRuntimeSmokePhaseRecorder,
  deriveFurnishedTemplatePhaseTimeout,
  deriveRuntimeSmokeWholeTestTimeout,
  runRuntimeSmokeBoundedOperation,
  runtimeSmokeAggregateLifecycleState,
  runtimeSmokeOperationAttempt,
  runtimeSmokePhaseBudget,
  waitForRuntimeSmokeOperationDeadline,
} from "./runtime-smoke-phase-budget.mjs";
import {
  captureImmediatePostReadinessSnapshot,
  runRuntimeSmokePostReadinessOperation,
} from "./runtime-smoke-post-readiness.mjs";
import {
  RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_ATTACHMENT,
  createRuntimeSmokeTelemetryBootstrapEvidence,
} from "./runtime-smoke-telemetry-bootstrap-contract.mjs";
import {
  createRuntimeSmokeReadinessObservation,
  evaluateRuntimeSmokeActiveRequiredModels,
  projectRuntimeSmokeReloadReadiness,
  runtimeSmokeRequiredRegistryReady,
} from "./runtime-smoke-readiness-diagnostics.mjs";
import {
  classifyRuntimeSmokeBrowserCallbackProgress,
  projectRuntimeSmokeBrowserCallbackMilestone,
  projectRuntimeSmokeBrowserHeartbeat,
  runtimeSmokeBrowserHeartbeatSupportsIdleAdmission,
  runtimeSmokeBrowserCallbackMilestoneMatchesRequest,
} from "./runtime-smoke-browser-diagnostics.mjs";
import {
  RUNTIME_SMOKE_RENDER_IDLE_OBSERVATION_CONTRACT,
  evaluateRuntimeSmokeRendererIdle,
} from "./runtime-smoke-render-idle.mjs";

const sequentialRuntimeSmokeBudgetMs = RUNTIME_SMOKE_PHASE_BUDGETS.reduce(
  (total, phase) => total + phase.timeoutMs,
  0,
);
const runtimeSmokeOverheadBudgetMs = Object.values(
  RUNTIME_SMOKE_OVERHEAD_BUDGETS,
).reduce((total, budget) => total + budget, 0);
const boundsPhaseBudgets = RUNTIME_SMOKE_PHASE_BUDGETS.filter(
  (phase) => phase.name === "bounds-verification",
);
assert.equal(boundsPhaseBudgets.length, 1, "bounds-verification must have one canonical budget");
assert.equal(boundsPhaseBudgets[0]?.timeoutMs, 103_000);

process.env.CERTIFICATION_QUALIFICATION_MODE = "1";

function boundAuthFixtureEnvironment() {
  const nonce = "e".repeat(32);
  const googleClientId =
    `123456789012345-gate-a3-ci-${nonce}.apps.googleusercontent.com`;
  const googleClientSecret = `GOCSPX-gate-a3-ci-${nonce}`;
  return {
    CI_AUTH_FIXTURE_ACTIVE: "1",
    CI_AUTH_FIXTURE_LOCAL_TEST: "1",
    CI_AUTH_FIXTURE_MODE: "1",
    CI_AUTH_FIXTURE_NO_REGENERATION: "1",
    CI_AUTH_FIXTURE_PROVIDER_CLIENT_ID_SHA256: createHash("sha256")
      .update(googleClientId)
      .digest("hex"),
    CI_AUTH_FIXTURE_PROVIDER_CLIENT_SECRET_SHA256: createHash("sha256")
      .update(googleClientSecret)
      .digest("hex"),
    CI_AUTH_FIXTURE_SESSION_CLASSIFICATION:
      "PRODUCTION_INELIGIBLE_SYNTHETIC_AUTH",
    CI_AUTH_FIXTURE_SESSION_ID: "artifact-fixture-session-001",
    CI_AUTH_FIXTURE_SESSION_NONCE: "artifact-fixture-nonce-001",
    CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: "a".repeat(40),
    CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: "b".repeat(40),
    GOOGLE_CLIENT_ID: googleClientId,
    GOOGLE_CLIENT_SECRET: googleClientSecret,
  };
}

{
  const lifecycleIdentity = "a".repeat(32);
  const runtimeEnvironment = {
    CERTIFICATION_ENVIRONMENT_STAGE: "runtime-smoke",
    CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_ID: "runtime-smoke",
    PRODUCTION_CERTIFICATION_ID: "certification-nested-database-test",
    PRODUCTION_EVIDENCE_CANDIDATE_ID: "candidate-nested-database-test",
    DATABASE_URL:
      `postgresql://interior_ai_cert_stage_${lifecycleIdentity}:c4a8e2f6b0d93571c4a8e2f6b0d93571@127.0.0.1:5432/interior_ai_gate_a3_test_cert_${lifecycleIdentity}`,
  };
  assert.equal(
    certifiedNestedDatabaseUrl(runtimeEnvironment),
    runtimeEnvironment.DATABASE_URL,
  );
  assert.throws(
    () =>
      certifiedNestedDatabaseUrl({
        ...runtimeEnvironment,
        DATABASE_URL: runtimeEnvironment.DATABASE_URL.replace(
          `interior_ai_cert_stage_${lifecycleIdentity}`,
          `interior_ai_cert_stage_${"b".repeat(32)}`,
        ),
      }),
    /not lifecycle scoped/,
  );
}

{
  const readyModel = (key, overrides = {}) => ({
    key,
    sceneItemId: key,
    readinessKey: `g2:${key}:product:variant:standard`,
    active: true,
    requiredForReadiness: true,
    generationState: "current",
    reloadGeneration: 2,
    urlHash: "fnv1a-1234abcd",
    mountInstanceId: "g2:m1",
    loadState: "ready",
    pendingStage: null,
    requestStarted: true,
    responseCompleted: true,
    cacheStatus: "network",
    parseDecodeState: "complete",
    normalizationState: "complete",
    materialState: "complete",
    boundsState: "complete",
    sceneAttachmentState: "complete",
    cancellationState: "active",
    terminalErrorCategory: null,
    loadErrorCode: null,
    ...overrides,
  });
  const explicitFixtureKeys = [
    "runtime-smoke-model-1",
    "runtime-smoke-model-2",
    "runtime-smoke-model-3",
  ];
  const templateKeys = Array.from(
    { length: 5 },
    (_, index) => `template-model-${index + 1}`,
  );
  const activeRequiredModelIds = [...explicitFixtureKeys, ...templateKeys];
  const snapshot = (models, ids = activeRequiredModelIds) => ({
    schema: "interior-ai.glb-required-snapshot.v1",
    reloadGeneration: 2,
    activeRequiredCount: ids.length,
    activeRequiredModelIds: ids,
    models,
  });
  const readyModels = activeRequiredModelIds.map((key) => readyModel(key));

  assert.deepEqual(
    projectRuntimeSmokeReloadReadiness({
      activeRequiredEvaluation: null,
      expectedModelCount: 8,
      minimumReloadGeneration: 2,
    }),
    {
      activeRequiredDiagnostics: [],
      expectedReadyModelCount: 8,
      observedReadyModelCount: 0,
      currentReloadGeneration: null,
      unreadyModelKeys: [],
      ready: false,
    },
  );

  const complete = evaluateRuntimeSmokeActiveRequiredModels({
    snapshot: snapshot(readyModels),
    expectedModelCount: 8,
  });
  assert.equal(
    readyModels.filter(
      (model) => explicitFixtureKeys.includes(model.key) && model.loadState === "ready",
    ).length,
    3,
    "the historical explicit-fixture projection reproduces the observed 3",
  );
  assert.equal(complete.ready, true);
  assert.equal(complete.observedReadyCount, 8);
  assert.equal(complete.activeRequiredDiagnostics.length, 8);
  assert.deepEqual(
    projectRuntimeSmokeReloadReadiness({
      activeRequiredEvaluation: complete,
      expectedModelCount: 8,
      minimumReloadGeneration: 2,
    }),
    {
      activeRequiredDiagnostics: complete.activeRequiredDiagnostics,
      expectedReadyModelCount: 8,
      observedReadyModelCount: 8,
      currentReloadGeneration: 2,
      unreadyModelKeys: [],
      ready: true,
    },
  );

  const initialRealm = evaluateRuntimeSmokeActiveRequiredModels({
    snapshot: {
      ...snapshot(readyModels),
      reloadGeneration: 1,
      models: readyModels.map((model) => ({
        ...model,
        reloadGeneration: 1,
        readinessKey: model.readinessKey.replace(/^g2:/, "g1:"),
        mountInstanceId: "g1:m1",
      })),
    },
    expectedModelCount: 8,
  });
  const staleInitialRealm = projectRuntimeSmokeReloadReadiness({
    activeRequiredEvaluation: initialRealm,
    expectedModelCount: 8,
    minimumReloadGeneration: 2,
  });
  assert.equal(staleInitialRealm.currentReloadGeneration, 1);
  assert.equal(staleInitialRealm.ready, false);

  const explicitFixtureOnly = evaluateRuntimeSmokeActiveRequiredModels({
    snapshot: snapshot(
      readyModels.filter((model) => explicitFixtureKeys.includes(model.key)),
      explicitFixtureKeys,
    ),
    expectedModelCount: 8,
  });
  const explicitFixtureOnlyProjection = projectRuntimeSmokeReloadReadiness({
    activeRequiredEvaluation: explicitFixtureOnly,
    expectedModelCount: 8,
    minimumReloadGeneration: 2,
  });
  assert.equal(explicitFixtureOnlyProjection.observedReadyModelCount, 3);
  assert.equal(explicitFixtureOnlyProjection.ready, false);

  const templateUnready = evaluateRuntimeSmokeActiveRequiredModels({
    snapshot: snapshot(
      readyModels.map((model) =>
        model.key === "template-model-4"
          ? { ...model, loadState: "loading", pendingStage: "bounds" }
          : model,
      ),
    ),
    expectedModelCount: 8,
  });
  assert.equal(templateUnready.ready, false);
  assert.deepEqual(templateUnready.unreadyModelKeys, ["template-model-4"]);
  const templateUnreadyProjection = projectRuntimeSmokeReloadReadiness({
    activeRequiredEvaluation: templateUnready,
    expectedModelCount: 8,
    minimumReloadGeneration: 2,
  });
  assert.equal(templateUnreadyProjection.ready, false);
  assert.deepEqual(templateUnreadyProjection.unreadyModelKeys, [
    "template-model-4",
  ]);

  const explicitUnready = evaluateRuntimeSmokeActiveRequiredModels({
    snapshot: snapshot(
      readyModels.map((model) =>
        model.key === "runtime-smoke-model-2"
          ? { ...model, loadState: "loading", pendingStage: "materials" }
          : model,
      ),
    ),
    expectedModelCount: 8,
  });
  assert.equal(explicitUnready.ready, false);
  assert.deepEqual(explicitUnready.unreadyModelKeys, ["runtime-smoke-model-2"]);

  const stale = readyModel("stale-model", {
    generationState: "stale",
    reloadGeneration: 1,
  });
  const withoutStale = evaluateRuntimeSmokeActiveRequiredModels({
    snapshot: snapshot(
      readyModels.concat(stale),
      activeRequiredModelIds.concat(stale.key),
    ),
    expectedModelCount: 8,
  });
  assert.equal(withoutStale.ready, true);
  assert.equal(
    withoutStale.declaredActiveRequiredKeys.includes(stale.key),
    true,
    "the stale exclusion fixture must match the canonical top-level snapshot shape",
  );
  assert.equal(
    withoutStale.activeRequiredDiagnostics.some(({ key }) => key === stale.key),
    false,
  );

  const inactive = readyModel("deleted-model", { active: false });
  const withoutInactive = evaluateRuntimeSmokeActiveRequiredModels({
    snapshot: snapshot(readyModels.concat(inactive)),
    expectedModelCount: 8,
  });
  assert.equal(withoutInactive.ready, true);
  assert.equal(
    withoutInactive.activeRequiredDiagnostics.some(({ key }) => key === inactive.key),
    false,
  );

  const foreignGeneration = readyModel("foreign-document-model", {
    reloadGeneration: 99,
    generationState: "stale",
  });
  const withoutForeignGeneration = evaluateRuntimeSmokeActiveRequiredModels({
    snapshot: snapshot(
      readyModels.concat(foreignGeneration),
      activeRequiredModelIds.concat(foreignGeneration.key),
    ),
    expectedModelCount: 8,
  });
  assert.equal(withoutForeignGeneration.ready, true);
  assert.equal(
    withoutForeignGeneration.declaredActiveRequiredKeys.includes(
      foreignGeneration.key,
    ),
    true,
  );
  assert.equal(
    withoutForeignGeneration.activeRequiredDiagnostics.some(
      ({ key }) => key === foreignGeneration.key,
    ),
    false,
  );

  const canonicalConsumerSnapshot = snapshot(
    readyModels.concat(stale, foreignGeneration),
    activeRequiredModelIds.concat(stale.key, foreignGeneration.key),
  );
  const canonicalConsumerEvaluation =
    evaluateRuntimeSmokeActiveRequiredModels({
      snapshot: canonicalConsumerSnapshot,
      expectedModelCount: 8,
    });
  const canonicalConsumerDiagnostics = explicitFixtureKeys.map((key) => ({
    key,
    registrySize: canonicalConsumerSnapshot.models.length,
    activeRequiredKeys:
      canonicalConsumerEvaluation.observedActiveRequiredKeys,
  }));
  assert.equal(
    runtimeSmokeRequiredRegistryReady({
      diagnostics: canonicalConsumerDiagnostics,
      diagnosticKeys: explicitFixtureKeys,
      activeRequiredEvaluation: canonicalConsumerEvaluation,
    }),
    true,
    "the actual wait consumer must accept eight current models when canonical top-level IDs also contain stale and foreign generations",
  );
  assert.equal(
    runtimeSmokeRequiredRegistryReady({
      diagnostics: canonicalConsumerDiagnostics.map((entry) => ({
        ...entry,
        activeRequiredKeys: canonicalConsumerSnapshot.activeRequiredModelIds,
      })),
      diagnosticKeys: explicitFixtureKeys,
      activeRequiredEvaluation: canonicalConsumerEvaluation,
    }),
    false,
    "the regression must reproduce the old raw top-level key comparison",
  );

  const identityMismatch = evaluateRuntimeSmokeActiveRequiredModels({
    snapshot: snapshot(
      readyModels,
      activeRequiredModelIds.with(7, "missing-template-model"),
    ),
    expectedModelCount: 8,
  });
  assert.equal(identityMismatch.ready, false);
  assert.equal(identityMismatch.identityMatches, false);
  assert.deepEqual(identityMismatch.missingActiveRequiredKeys, [
    "missing-template-model",
  ]);
  assert.deepEqual(identityMismatch.unexpectedActiveRequiredKeys, [
    "template-model-5",
  ]);

}

{
  const safeReadinessSummary = {
    schema: "interior-ai.glb-safe-readiness-summary.v1",
    reloadGeneration: 2,
    registryVersion: 41,
    activeSetHash: "fnv1a-1234abcd",
    activeRequiredCount: 1,
    includedModelCount: 1,
    omittedModelCount: 0,
    eventLoopDelayMs: { last: 7, maximum: 31 },
    cacheTotals: {
      parsedEntries: 1,
      parsedReferences: 1,
      preparedEntries: 1,
      preparedReferences: 1,
    },
    models: [
      {
        ordinal: 1,
        identityHash: "fnv1a-abcd1234",
        active: true,
        requiredForReadiness: true,
        reloadGeneration: 2,
        generationState: "current",
        loadState: "loading",
        pendingStage: "parse-decode",
        lastTransitionName: "response-complete",
        lastTransitionAtMs: 125,
        stageAtMs: {
          mounted: 10,
          requestStarted: 12,
          responseCompleted: 125,
          parseCompleted: null,
          normalizationStarted: null,
          normalizationCompleted: null,
          materialsStarted: 11,
          materialsCompleted: 13,
          boundsStarted: null,
          boundsCompleted: null,
          sceneAttached: null,
          ready: null,
          error: null,
          cancelled: null,
        },
        cache: {
          delivery: "network",
          parsedAcquisition: "miss",
          preparedAcquisition: "miss",
          resourceKind: "prepared",
          selectedEntry: { state: "pending", referenceCount: 1 },
          parsedEntry: { state: "pending", referenceCount: 1 },
          preparedEntry: { state: "pending", referenceCount: 1 },
          acquiredAtMs: 12,
          releasedAtMs: null,
        },
        counters: {
          mounts: 1,
          unmounts: 0,
          supersededMounts: 0,
          ignoredStaleTransitions: 0,
        },
      },
    ],
  };
  const observation = createRuntimeSmokeReadinessObservation({
    phaseName: "reload-1",
    snapshot: { safeReadinessSummary },
    responseTotal: 6,
    responseRequired: 6,
    requestTotal: 6,
    browserErrorCount: 0,
  });
  assert.match(observation.signature, /fnv1a-1234abcd/);
  assert.ok(observation.checkpoints.length >= 8);
  assert.equal(
    observation.checkpoints.every((name) =>
      /^[a-z0-9][a-z0-9-]{0,95}$/.test(name),
    ),
    true,
  );
  assert.equal(
    JSON.stringify(observation.diagnostic).includes("/assets/models/"),
    false,
  );
  assert.notEqual(
    createRuntimeSmokeReadinessObservation({
      phaseName: "reload-1",
      snapshot: { safeReadinessSummary },
      responseTotal: 7,
      responseRequired: 9,
      requestTotal: 7,
      browserErrorCount: 0,
    }).signature,
    observation.signature,
    "response changes must create meaningful readiness progress",
  );
  assert.notEqual(
    createRuntimeSmokeReadinessObservation({
      phaseName: "reload-1",
      snapshot: { safeReadinessSummary },
      responseTotal: 6,
      responseRequired: 6,
      requestTotal: 7,
      browserErrorCount: 0,
    }).signature,
    observation.signature,
    "request changes must retain outstanding-request progress",
  );
  assert.throws(
    () =>
      createRuntimeSmokeReadinessObservation({
        phaseName: "reload-1",
        snapshot: {
          safeReadinessSummary: {
            ...safeReadinessSummary,
            url: "https://unsafe.example.test/model.glb",
          },
        },
        responseTotal: 6,
        responseRequired: 6,
        requestTotal: 6,
        browserErrorCount: 0,
      }),
    /safe readiness summary is malformed/,
    "unknown summary fields must never reach retained diagnostics",
  );
  assert.throws(
    () =>
      createRuntimeSmokeReadinessObservation({
        phaseName: "reload-1",
        snapshot: {
          safeReadinessSummary: {
            ...safeReadinessSummary,
            models: [
              {
                ...safeReadinessSummary.models[0],
                token: "unsafe",
              },
            ],
          },
        },
        responseTotal: 6,
        responseRequired: 6,
        requestTotal: 6,
        browserErrorCount: 0,
      }),
    /safe readiness model is malformed/,
    "unknown model fields must never reach retained diagnostics",
  );
}

{
  const models = [
    { key: "model-1", renderCount: 3, boundsMaterialChangeCount: 1 },
    { key: "model-2", renderCount: 4, boundsMaterialChangeCount: 1 },
  ];
  const idleSamples = () =>
    Array.from(
      { length: RUNTIME_SMOKE_RENDER_IDLE_OBSERVATION_CONTRACT.requiredSampleCount },
      (_, index) => ({
        schema: "interior-ai.runtime-smoke-render-idle-sample.v1",
        version: 1,
        capturedAtMs: 1_000 + index * 500,
        callbackRequestId: 16,
        callbackEnteredAtMs: 1_000,
        callbackEntryObserved: true,
        documentGenerationId: "document-1",
        reloadGeneration: 3,
        rendererInstrumentationGeneration: 2,
        rendererCalls: 180,
        invalidationCalls: 24,
        lastRendererCallAtMs: 500,
        lastInvalidationAtMs: 500,
        visibilityState: "visible",
        lifecycleState: "active",
        webglContextState: "active",
        webglGeneration: 0,
        activeControlTransitionCount: 0,
        activeItemAnimationCount: 0,
        activeSupportedAnimationCount: 0,
        pendingInvalidation: false,
        requiredModelRegistryIdentity: "g3:v14:model-1,model-2",
        requiredActiveModelCount: 2,
        models: structuredClone(models),
        sampleFreshnessMs: 0,
      }),
    );
  const expectRejected = (samples, reason, description) => {
    const verdict = evaluateRuntimeSmokeRendererIdle({ samples });
    assert.equal(verdict.settled, false, description);
    assert.ok(verdict.reasons.includes(reason), description);
  };
  const positive = evaluateRuntimeSmokeRendererIdle({ samples: idleSamples() });
  assert.equal(positive.settled, true, "a static scene must become idle");
  assert.equal(positive.observationDurationMs, 2_500);
  assert.equal(positive.rendererCallDelta, 0);
  assert.equal(positive.invalidationCallDelta, 0);

  const permanent = idleSamples().map((sample, index) => ({
    ...sample,
    rendererCalls: 180 + index * 30,
    lastRendererCallAtMs: sample.capturedAtMs,
  }));
  expectRejected(
    permanent,
    "renderer-calls-observed",
    "a permanent 60-Hz renderer loop must fail",
  );

  const lowFrequency = idleSamples();
  for (let index = 3; index < lowFrequency.length; index += 1) {
    lowFrequency[index].rendererCalls += 1;
    lowFrequency[index].invalidationCalls += 1;
    lowFrequency[index].lastRendererCallAtMs = lowFrequency[3].capturedAtMs;
    lowFrequency[index].lastInvalidationAtMs = lowFrequency[3].capturedAtMs;
  }
  expectRejected(
    lowFrequency,
    "invalidations-observed",
    "a 1.5-second recurring invalidation must fail the 2.5-second window",
  );

  for (const [description, reason, mutate] of [
    ["stale identical samples", "stale-sample", (samples) => {
      samples[2].capturedAtMs = samples[1].capturedAtMs;
    }],
    ["cross-document samples", "cross-document-observation", (samples) => {
      samples[4].documentGenerationId = "document-2";
    }],
    ["cross-reload samples", "cross-reload-observation", (samples) => {
      samples[4].reloadGeneration = 4;
    }],
    ["hidden documents", "document-not-visible", (samples) => {
      samples[2].visibilityState = "hidden";
    }],
    ["WebGL-lost documents", "webgl-context-lost", (samples) => {
      samples[2].webglContextState = "lost";
    }],
    ["WebGL restoration between samples", "webgl-generation-changed", (samples) => {
      samples[4].webglGeneration = 2;
    }],
    ["renderer counter resets", "renderer-counter-reset", (samples) => {
      samples[3].rendererCalls = 179;
    }],
    ["invalidation counter resets", "invalidation-counter-reset", (samples) => {
      samples[3].invalidationCalls = 23;
    }],
    ["active item animations", "active-item-animation", (samples) => {
      samples[2].activeItemAnimationCount = 1;
      samples[2].activeSupportedAnimationCount = 1;
    }],
    ["active control damping", "active-control-transition", (samples) => {
      samples[2].activeControlTransitionCount = 1;
      samples[2].activeSupportedAnimationCount = 1;
    }],
    ["pending invalidation", "pending-invalidation", (samples) => {
      samples[2].pendingInvalidation = true;
    }],
  ]) {
    const samples = idleSamples();
    mutate(samples);
    expectRejected(samples, reason, description);
  }
  for (const [description, mutate] of [
    ["missing renderer instrumentation", (samples) => {
      samples[0].rendererInstrumentationGeneration = 0;
    }],
    ["callback with no entered-browser milestone", (samples) => {
      samples[0].callbackEntryObserved = false;
    }],
    ["malformed renderer counters", (samples) => {
      samples[0].rendererCalls = -1;
    }],
  ]) {
    const samples = idleSamples();
    mutate(samples);
    assert.throws(
      () => evaluateRuntimeSmokeRendererIdle({ samples }),
      /observation is malformed/,
      description,
    );
  }
}

{
  const callback = projectRuntimeSmokeBrowserCallbackMilestone({
    schema: "interior-ai.runtime-smoke-browser-callback.v2",
    phaseName: "reload-1",
    operationName: "model-responses-and-readiness",
    requestId: 3,
    stage: "snapshot-complete",
    observedAtMs: 1_234,
  });
  assert.deepEqual(callback, {
    schema: "interior-ai.runtime-smoke-browser-callback.v2",
    phaseName: "reload-1",
    operationName: "model-responses-and-readiness",
    requestId: 3,
    stage: "snapshot-complete",
    observedAtMs: 1_234,
  });
  assert.equal(
    runtimeSmokeBrowserCallbackMilestoneMatchesRequest(
      {
        phaseName: "reload-1",
        operationName: "model-responses-and-readiness",
        requestId: 4,
      },
      callback,
    ),
    false,
    "a stale snapshot milestone must not be attributed to the active request",
  );
  assert.deepEqual(
    classifyRuntimeSmokeBrowserCallbackProgress({
      request: {
        phaseName: "reload-1",
        operationName: "diagnostics-settle-evaluation",
        requestId: 16,
      },
      milestones: [],
    }),
    { latestStage: "not-entered", nextStage: "entered-browser" },
    "a missing first milestone must attribute the wait before browser entry",
  );
  assert.throws(
    () =>
      projectRuntimeSmokeBrowserCallbackMilestone({
        ...callback,
        url: "https://unsafe.example.test/model.glb",
      }),
    /callback milestone is unsafe/,
  );
  for (const invalidCallback of [
    { ...callback, schema: "unsafe.callback.v1" },
    { ...callback, requestId: 0 },
    { ...callback, stage: "raw-payload-ready" },
  ]) {
    assert.throws(
      () => projectRuntimeSmokeBrowserCallbackMilestone(invalidCallback),
      /callback milestone is unsafe/,
      "invalid callback values must be rejected before host logging",
    );
  }
  const heartbeat = projectRuntimeSmokeBrowserHeartbeat({
    schema: "interior-ai.runtime-smoke-browser-heartbeat.v2",
    kind: "interval",
    sequence: 4,
    observedAtMs: 2_000,
    eventLoopDelayMs: 7,
    maximumEventLoopDelayMs: 12,
    lastAnimationFrameDelayMs: 3,
    maximumAnimationFrameDelayMs: 9,
    lastAnimationFrameCadenceMs: 1_003,
    visibilityState: "visible",
    documentReadyState: "complete",
    lifecycleState: "active",
    rendererCalls: 180,
    rendererCallDelta: 60,
    rendererCallRateHz: 60,
    activeAnimationCount: 0,
    controlActivity: "idle",
    controlEventCount: 0,
    webglContextLostCount: 0,
    webglContextRestoredCount: 0,
  });
  assert.deepEqual(heartbeat, {
    schema: "interior-ai.runtime-smoke-browser-heartbeat.v2",
    kind: "interval",
    sequence: 4,
    observedAtMs: 2_000,
    eventLoopDelayMs: 7,
    maximumEventLoopDelayMs: 12,
    lastAnimationFrameDelayMs: 3,
    maximumAnimationFrameDelayMs: 9,
    lastAnimationFrameCadenceMs: 1_003,
    visibilityState: "visible",
    documentReadyState: "complete",
    lifecycleState: "active",
    rendererCalls: 180,
    rendererCallDelta: 60,
    rendererCallRateHz: 60,
    activeAnimationCount: 0,
    controlActivity: "idle",
    controlEventCount: 0,
    webglContextLostCount: 0,
    webglContextRestoredCount: 0,
  });
  const quiescentHeartbeat = {
    ...heartbeat,
    rendererCallDelta: 0,
    rendererCallRateHz: 0,
  };
  assert.equal(
    runtimeSmokeBrowserHeartbeatSupportsIdleAdmission(quiescentHeartbeat),
    true,
    "a complete, active, quiescent interval heartbeat may admit the authoritative idle observation",
  );
  for (const activeHeartbeat of [
    { ...quiescentHeartbeat, kind: "started" },
    { ...quiescentHeartbeat, visibilityState: "hidden" },
    { ...quiescentHeartbeat, documentReadyState: "interactive" },
    { ...quiescentHeartbeat, lifecycleState: "frozen" },
    { ...quiescentHeartbeat, rendererCallDelta: 1 },
    { ...quiescentHeartbeat, rendererCallRateHz: 1 },
    { ...quiescentHeartbeat, activeAnimationCount: 1 },
    { ...quiescentHeartbeat, controlActivity: "pointer-active" },
    { ...quiescentHeartbeat, webglContextLostCount: 1 },
    { ...quiescentHeartbeat, webglContextRestoredCount: 1 },
  ]) {
    assert.equal(
      runtimeSmokeBrowserHeartbeatSupportsIdleAdmission(activeHeartbeat),
      false,
      "non-quiescent browser state must not admit an idle observation",
    );
  }
  assert.throws(
    () => projectRuntimeSmokeBrowserHeartbeat({ ...heartbeat, token: "unsafe" }),
    /browser heartbeat is unsafe/,
  );
  for (const invalidHeartbeat of [
    { ...heartbeat, schema: "unsafe.heartbeat.v1" },
    { ...heartbeat, sequence: 0 },
    { ...heartbeat, eventLoopDelayMs: -1 },
    { ...heartbeat, maximumEventLoopDelayMs: 6 },
  ]) {
    assert.throws(
      () => projectRuntimeSmokeBrowserHeartbeat(invalidHeartbeat),
      /browser heartbeat is unsafe/,
      "invalid heartbeats must be rejected before host logging",
    );
  }
}
assert.deepEqual(RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT, {
  observation: {
    schema: "interior-ai.runtime-smoke-render-idle-observation-contract.v1",
    version: 1,
    sampleIntervalMs: 500,
    requiredSampleCount: 6,
    observationDurationMs: 2_500,
    rendererIdleWindowMs: 2_000,
    maximumSampleFreshnessMs: 750,
    maximumSampleGapMs: 1_250,
  },
  maximumObservationAttempts: 2,
  finalReadbackEvaluationCount: 1,
  admissionRequiresQuiescentHeartbeat: true,
  firstSampleImmediate: true,
  retryAlignsToQuiescence: true,
  evaluationCount: 3,
  evaluationTimeoutMs: 10_000,
  assertionAllowanceMs: 2_000,
  minimumTheoreticalCompletionMs: 2_500,
  maximumLegalSequentialEnvelopeMs: 32_000,
  orchestrationMarginMs: 10_000,
  timeoutMs: 42_000,
});
assert.ok(
  RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.timeoutMs >=
    RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.maximumLegalSequentialEnvelopeMs +
      RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.orchestrationMarginMs,
  "diagnostics-settle budget must contain its full sequential envelope and margin",
);
const reloadOperationEnvelopeMs = FURNISHED_TEMPLATE_RELOAD_CONTRACT.operations.reduce(
  (total, operation) => total + operation.timeoutMs,
  0,
);
assert.equal(reloadOperationEnvelopeMs, 278_000);
assert.equal(FURNISHED_TEMPLATE_RELOAD_CONTRACT.orchestrationMarginMs, 30_000);
assert.equal(
  deriveFurnishedTemplatePhaseTimeout(FURNISHED_TEMPLATE_RELOAD_CONTRACT),
  308_000,
  "reload correctness timeout must equal the legal nested envelope plus margin",
);
assert.equal(FURNISHED_TEMPLATE_RELOAD_CONTRACT.performanceWarningThresholdMs, 70_000);
assert.equal(
  runtimeSmokeAggregateLifecycleState({
    expectedModelCount: 3,
    readyModelCount: 1,
    loadingModelCount: 0,
    terminalErrorModelCount: 0,
    combinedReadinessSatisfied: false,
  }),
  "loading",
  "partial ready diagnostics with missing models must not claim aggregate ready",
);
assert.equal(
  runtimeSmokeAggregateLifecycleState({
    expectedModelCount: 3,
    readyModelCount: 3,
    loadingModelCount: 0,
    terminalErrorModelCount: 0,
    combinedReadinessSatisfied: true,
  }),
  "ready",
);
assert.ok(
  FURNISHED_TEMPLATE_RELOAD_CONTRACT.performanceWarningThresholdMs <
    deriveFurnishedTemplatePhaseTimeout(FURNISHED_TEMPLATE_RELOAD_CONTRACT),
  "performance observation must remain separate from correctness",
);
const operationDeadlineExports = Object.keys(
  await import("./runtime-smoke-operation-deadline.mjs"),
);
assert.equal(
  operationDeadlineExports.includes(
    "createRuntimeSmokeOperationDeadlineContext",
  ),
  false,
  "the raw canonical-budget branding factory must not be public",
);
assert.equal(
  operationDeadlineExports.includes("assertRuntimeSmokeOperationAttempt"),
  false,
  "operation-attempt branding must remain private",
);
assert.throws(
  () => new RuntimeSmokeOperationTimeoutError({
    phaseId: "reload-1",
    operationId: "model-responses-and-readiness",
    operationElapsedMs: 65_508,
    operationBudgetMs: 65_507,
  }),
  /operation attempt is invalid/,
  "callers must not be able to construct timeout evidence from an arbitrary budget",
);
{
  let clock = 0;
  const operationContext = createRuntimeSmokeOperationDeadline({
    phaseName: "reload-1",
    operationName: "hydration-snapshot",
    now: () => clock,
  });
  const operationAttempt = runtimeSmokeOperationAttempt(operationContext);
  clock = 4_999.75;
  assert.throws(
    () => new RuntimeSmokeOperationTimeoutError({ operationAttempt }),
    /requires a reached deadline/,
    "a valid branded attempt must not mint canonical evidence before its deadline",
  );
}
for (const phaseName of ["reload-1", "reload-2", "reload-3"]) {
  assert.equal(
    FURNISHED_TEMPLATE_PHASE_CONTRACTS[phaseName],
    FURNISHED_TEMPLATE_RELOAD_CONTRACT,
    `${phaseName} must consume the one canonical reload contract`,
  );
  assert.equal(runtimeSmokePhaseBudget(phaseName), 308_000);
}
assert.equal(runtimeSmokePhaseBudget("remount"), 160_000);
assert.ok(
  runtimeSmokePhaseBudget("bounds-verification") - 43_432 >= 25_000,
  "bounds verification needs meaningful GitHub-runner headroom",
);

{
  let clock = 0;
  let fireTimeout;
  let clearedHandle = null;
  const operationContext = createRuntimeSmokeOperationDeadline({
    phaseName: "reload-1",
    operationName: "hydration-snapshot",
    now: () => clock,
  });
  const operationAttempt = runtimeSmokeOperationAttempt(operationContext);
  const operation = runRuntimeSmokeBoundedOperation({
    operationAttempt,
    task: () => new Promise(() => {}),
    setTimer: (callback, timeoutMs) => {
      assert.equal(timeoutMs, 5_000);
      fireTimeout = callback;
      return 17;
    },
    clearTimer: (handle) => {
      clearedHandle = handle;
    },
  });
  clock = 5_000;
  fireTimeout();
  await assert.rejects(
    operation,
    (error) =>
      error instanceof RuntimeSmokeOperationTimeoutError &&
      error.phaseId === "reload-1" &&
      error.operationId === "hydration-snapshot" &&
      error.operationBudgetMs === 5_000 &&
      error.operationElapsedMs === 5_000 &&
      error.operationElapsedPreciseMs === 5_000 &&
      error.attemptTimeoutMs === 5_000 &&
      error.remainingAtAttemptStartMs === 5_000 &&
      error.deadlineReached === true,
  );
  assert.equal(clearedHandle, 17);
}

{
  let clock = 0;
  let fireTimeout;
  const operationContext = createRuntimeSmokeOperationDeadline({
    phaseName: "reload-1",
    operationName: "model-responses-and-readiness",
    now: () => clock,
  });
  assert.equal(operationContext.canonicalBudgetMs, 70_000);
  assert.equal(operationContext.monotonicStartedAt, 0);
  assert.equal(operationContext.monotonicDeadlineAt, 70_000);
  clock = 1_000;
  const firstPollingAttempt = runtimeSmokeOperationAttempt(operationContext);
  assert.equal(firstPollingAttempt.attemptTimeoutMs, 69_000);
  assert.equal(operationContext.canonicalBudgetMs, 70_000);
  clock = 4_493;
  const cappedPollingAttempt = runtimeSmokeOperationAttempt(
    operationContext,
    500,
  );
  assert.equal(cappedPollingAttempt.attemptTimeoutMs, 500);
  assert.equal(cappedPollingAttempt.remainingAtAttemptStartMs, 65_507);
  assert.equal(operationContext.canonicalBudgetMs, 70_000);
  const operationAttempt = runtimeSmokeOperationAttempt(operationContext);
  assert.equal(operationAttempt.attemptTimeoutMs, 65_507);
  assert.equal(operationAttempt.remainingAtAttemptStartMs, 65_507);
  const operation = runRuntimeSmokeBoundedOperation({
    operationAttempt,
    task: () => new Promise(() => {}),
    setTimer: (callback, timeoutMs) => {
      assert.equal(timeoutMs, 65_507);
      fireTimeout = callback;
      return 23;
    },
    clearTimer: () => {},
  });
  clock = 70_001;
  fireTimeout();
  await assert.rejects(
    operation,
    (error) =>
      error instanceof RuntimeSmokeOperationTimeoutError &&
      error.operationBudgetMs === 70_000 &&
      error.operationElapsedMs === 70_001 &&
      error.operationElapsedPreciseMs === 70_001 &&
      error.attemptTimeoutMs === 65_507 &&
      error.remainingAtAttemptStartMs === 65_507 &&
      error.deadlineReached === true,
    "a dynamic attempt allowance must not replace the canonical operation budget",
  );
}

{
  let clock = 0;
  let nextHandle = 0;
  const timers = new Map();
  const scheduledDelays = [];
  const setTimer = (callback, delayMs) => {
    const handle = ++nextHandle;
    timers.set(handle, callback);
    scheduledDelays.push(delayMs);
    return handle;
  };
  const clearTimer = (handle) => timers.delete(handle);
  const fireLatestTimer = () => {
    const handle = Math.max(...timers.keys());
    const callback = timers.get(handle);
    assert.equal(typeof callback, "function");
    timers.delete(handle);
    callback();
  };
  const operationContext = createRuntimeSmokeOperationDeadline({
    phaseName: "reload-1",
    operationName: "model-responses-and-readiness",
    now: () => clock,
  });
  clock = 4_542;
  const operationAttempt = runtimeSmokeOperationAttempt(operationContext);
  assert.equal(operationAttempt.attemptTimeoutMs, 65_458);
  assert.equal(operationAttempt.remainingAtAttemptStartMs, 65_458);
  let settled = false;
  const operation = runRuntimeSmokeBoundedOperation({
    operationAttempt,
    task: () => new Promise(() => {}),
    setTimer,
    clearTimer,
  }).finally(() => {
    settled = true;
  });
  clock = 69_999.75;
  fireLatestTimer();
  await Promise.resolve();
  assert.equal(
    settled,
    false,
    "an integer display boundary must not emit an early canonical timeout",
  );
  assert.deepEqual(scheduledDelays, [65_458, 1]);
  clock = 70_000.25;
  fireLatestTimer();
  await assert.rejects(
    operation,
    (error) =>
      error instanceof RuntimeSmokeOperationTimeoutError &&
      error.operationBudgetMs === 70_000 &&
      error.operationElapsedMs === 70_000 &&
      error.operationElapsedPreciseMs === 70_000.25 &&
      error.attemptTimeoutMs === 65_458 &&
      error.remainingAtAttemptStartMs === 65_458 &&
      error.deadlineReached === true,
    "the producer must wait for the monotonic deadline before persisting a timeout",
  );
}

{
  let clock = 0;
  let fireTimeout;
  const operationContext = createRuntimeSmokeOperationDeadline({
    phaseName: "reload-1",
    operationName: "model-responses-and-readiness",
    now: () => clock,
  });
  const operationAttempt = runtimeSmokeOperationAttempt(
    operationContext,
    500,
  );
  const operation = runRuntimeSmokeBoundedOperation({
    operationAttempt,
    task: () => new Promise(() => {}),
    setTimer: (callback, timeoutMs) => {
      assert.equal(timeoutMs, 500);
      fireTimeout = callback;
      return 31;
    },
    clearTimer: () => {},
  });
  clock = 500;
  fireTimeout();
  await assert.rejects(
    operation,
    (error) =>
      error instanceof RuntimeSmokeOperationAttemptTimeoutError &&
      !(error instanceof RuntimeSmokeOperationTimeoutError) &&
      error.attemptTimeoutMs === 500 &&
      error.remainingAtAttemptStartMs === 70_000 &&
      error.deadlineReached === false,
    "a materially early capped attempt must not impersonate canonical expiration",
  );
}

{
  let clock = 0;
  let fireTimeout;
  const recorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    now: () => clock,
    phaseBudgets: [{ name: "reload-1", timeoutMs: 308_000 }],
  });
  await assert.rejects(
    recorder.run(
      "reload-1",
      () => {
        const operationContext = createRuntimeSmokeOperationDeadline({
          phaseName: "reload-1",
          operationName: "model-responses-and-readiness",
          now: () => clock,
        });
        const operation = runRuntimeSmokeBoundedOperation({
          operationAttempt: runtimeSmokeOperationAttempt(
            operationContext,
            500,
          ),
          task: () => new Promise(() => {}),
          setTimer: (callback) => {
            fireTimeout = callback;
            return 37;
          },
          clearTimer: () => {},
        });
        clock = 500;
        fireTimeout();
        return operation;
      },
      () => "loading",
    ),
    RuntimeSmokeOperationAttemptTimeoutError,
  );
  const failure = recorder.records[0]?.failure;
  assert.equal(recorder.records[0]?.outcome, "failed");
  assert.equal(recorder.records[0]?.timeoutBudgetMs, 308_000);
  assert.equal(failure?.failureKind, "unexpected-error");
  assert.equal(failure?.operationId, null);
  assert.equal(failure?.operationBudgetMs, null);
  assert.equal(failure?.operationElapsedMs, null);
  assert.equal(failure?.operationElapsedPreciseMs, null);
  assert.equal(failure?.deadlineReached, null);
}

{
  let clock = 10.25;
  const operationContext = createRuntimeSmokeOperationDeadline({
    phaseName: "reload-1",
    operationName: "model-responses-and-readiness",
    now: () => clock,
  });
  assert.equal(operationContext.monotonicStartedAt, 10.25);
  assert.equal(operationContext.monotonicDeadlineAt, 70_010.25);
  clock = 4_552.5;
  const operationAttempt = runtimeSmokeOperationAttempt(operationContext);
  assert.equal(
    operationAttempt.remainingAtAttemptStartMs,
    65_458,
    "remaining allowance must round up so integer conversion cannot shorten the deadline",
  );
  assert.equal(operationAttempt.attemptTimeoutMs, 65_458);
}

{
  let clock = 0;
  let nextHandle = 0;
  const timers = new Map();
  const scheduledDelays = [];
  const setTimer = (callback, delayMs) => {
    const handle = ++nextHandle;
    timers.set(handle, callback);
    scheduledDelays.push(delayMs);
    return handle;
  };
  const clearTimer = (handle) => timers.delete(handle);
  const fireLatestTimer = () => {
    const handle = Math.max(...timers.keys());
    const callback = timers.get(handle);
    assert.equal(typeof callback, "function");
    timers.delete(handle);
    callback();
  };
  const settleContext = createRuntimeSmokeOperationDeadline({
    phaseName: "bounds-verification",
    operationName: "diagnostics-settle",
    now: () => clock,
  });
  clock = 35_000;
  const settleAttempt = runtimeSmokeOperationAttempt(
    settleContext,
    RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.evaluationTimeoutMs,
  );
  assert.equal(settleAttempt.attemptTimeoutMs, 7_000);
  const evaluationContext = createRuntimeSmokeOperationDeadline({
    phaseName: "bounds-verification",
    operationName: "diagnostics-settle-evaluation",
    now: () => clock,
  });
  const evaluationAttempt = runtimeSmokeOperationAttempt(
    evaluationContext,
    settleAttempt.attemptTimeoutMs,
  );
  const evaluation = runRuntimeSmokeBoundedOperation({
    operationAttempt: evaluationAttempt,
    task: () => new Promise(() => {}),
    setTimer,
    clearTimer,
  });
  let evaluationSettled = false;
  evaluation.finally(() => {
    evaluationSettled = true;
  }).catch(() => {});
  clock = 41_999.75;
  fireLatestTimer();
  await Promise.resolve();
  assert.equal(
    evaluationSettled,
    false,
    "a capped leaf attempt must not expire before its monotonic attempt deadline",
  );
  clock = 42_000.25;
  fireLatestTimer();
  const attemptError = await evaluation.catch((error) => error);
  assert.ok(attemptError instanceof RuntimeSmokeOperationAttemptTimeoutError);
  assert.equal(attemptError.deadlineReached, false);
  const operation = waitForRuntimeSmokeOperationDeadline({
    operationAttempt: settleAttempt,
    cause: attemptError,
    setTimer,
    clearTimer,
  });
  await assert.rejects(
    operation,
    (error) =>
      error instanceof RuntimeSmokeOperationTimeoutError &&
      error.operationId === "diagnostics-settle" &&
      error.operationBudgetMs === 42_000 &&
      error.operationElapsedMs === 42_000 &&
      error.operationElapsedPreciseMs === 42_000.25 &&
      error.attemptTimeoutMs === 7_000 &&
      error.deadlineReached === true &&
      error.cause === attemptError,
    "a capped diagnostics leaf timeout must retain its expired parent provenance",
  );
  assert.deepEqual(scheduledDelays, [7_000, 1]);
}

{
  let clock = 0;
  const nestedTimeoutRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    now: () => clock,
    phaseBudgets: [{ name: "bounds-verification", timeoutMs: 103_000 }],
  });
  await assert.rejects(
    nestedTimeoutRecorder.run(
      "bounds-verification",
      () => {
        const operationContext = createRuntimeSmokeOperationDeadline({
          phaseName: "bounds-verification",
          operationName: "diagnostics-settle",
          now: () => clock,
        });
        const operationAttempt = runtimeSmokeOperationAttempt(operationContext);
        clock = 42_000;
        throw new RuntimeSmokeOperationTimeoutError({
          operationAttempt,
        });
      },
      () => "ready",
    ),
    RuntimeSmokeOperationTimeoutError,
  );
  const record = nestedTimeoutRecorder.records[0];
  assert.equal(record?.outcome, "failed");
  assert.equal(record?.timeoutBudgetMs, 103_000);
  assert.equal(record?.failure?.failureKind, "nested-operation-timeout");
  assert.equal(record?.failure?.operationId, "diagnostics-settle");
  assert.equal(record?.failure?.operationOutcome, "timed-out");
  assert.equal(record?.failure?.operationBudgetMs, 42_000);
  assert.equal(record?.failure?.operationElapsedPreciseMs, 42_000);
  assert.equal(record?.failure?.attemptTimeoutMs, 42_000);
  assert.equal(record?.failure?.remainingAtAttemptStartMs, 42_000);
  assert.equal(record?.failure?.deadlineReached, true);
  assert.equal(record?.failure?.phaseBudgetMs, 103_000);
}
assert.ok(
  runtimeSmokePhaseBudget("remount") - 53_769 >= 100_000,
  "remount needs meaningful GitHub-runner headroom",
);
assert.equal(
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS,
  sequentialRuntimeSmokeBudgetMs + runtimeSmokeOverheadBudgetMs,
  "the whole-test timeout must equal all sequential phase budgets plus explicit overhead",
);
assert.ok(
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS > sequentialRuntimeSmokeBudgetMs,
  "the whole-test timeout must leave explicit setup, teardown, assertion, and orchestration headroom",
);
const increasedPhaseBudgets = RUNTIME_SMOKE_PHASE_BUDGETS.map((phase) =>
  phase.name === "bounds-verification"
    ? { ...phase, timeoutMs: phase.timeoutMs + 7_000 }
    : phase,
);

const changedReloadContract = {
  ...FURNISHED_TEMPLATE_RELOAD_CONTRACT,
  operations: FURNISHED_TEMPLATE_RELOAD_CONTRACT.operations.map((operation) =>
    operation.name === "model-responses-and-readiness"
      ? { ...operation, timeoutMs: operation.timeoutMs + 11_000 }
      : operation,
  ),
};
assert.equal(
  deriveFurnishedTemplatePhaseTimeout(changedReloadContract),
  deriveFurnishedTemplatePhaseTimeout(FURNISHED_TEMPLATE_RELOAD_CONTRACT) + 11_000,
);
const changedReloadPhaseBudgets = RUNTIME_SMOKE_PHASE_BUDGETS.map((phase) =>
  phase.name.startsWith("reload-")
    ? { ...phase, timeoutMs: deriveFurnishedTemplatePhaseTimeout(changedReloadContract) }
    : phase,
);
assert.equal(
  deriveRuntimeSmokeWholeTestTimeout({ phases: changedReloadPhaseBudgets }),
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS + 33_000,
  "one reload-contract change must update all three reloads and the whole envelope",
);
assert.equal(
  deriveRuntimeSmokeWholeTestTimeout({ phases: increasedPhaseBudgets }),
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS + 7_000,
  "changing one canonical phase budget must mechanically update the whole-test timeout",
);

{
  const terminalRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    phaseBudgets: [{ name: "bounds-verification", timeoutMs: 1_000 }],
  });
  let attempts = 0;
  const terminalStartedAt = Date.now();
  await assert.rejects(
    terminalRecorder.run("bounds-verification", async () => {
      attempts += 1;
      throw new RuntimeSmokeTerminalError("bounds-verification");
    }, () => "error"),
    /bounds-verification reached terminal lifecycle state error/,
  );
  assert.equal(attempts, 1, "a terminal lifecycle error must fail immediately");
  assert.ok(Date.now() - terminalStartedAt < 1_000, "terminal error must beat the phase timeout");
  assert.deepEqual(
    terminalRecorder.records.map(({ outcome, finalLifecycleState, failure }) => ({
      outcome,
      finalLifecycleState,
      failureKind: failure?.failureKind,
    })),
    [{
      outcome: "terminal-error",
      finalLifecycleState: "error",
      failureKind: "terminal-lifecycle-error",
    }],
  );
}

{
  const timeoutRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    phaseBudgets: [{ name: "bounds-verification", timeoutMs: 5 }],
  });
  await assert.rejects(
    timeoutRecorder.run(
      "bounds-verification",
      () => new Promise(() => {}),
      () => "loading",
    ),
    (error) =>
      error instanceof RuntimeSmokePhaseTimeoutError &&
      error.phaseId === "bounds-verification" &&
      error.phaseBudgetMs === 5,
  );
  assert.equal(timeoutRecorder.records[0]?.outcome, "timed-out");
  assert.equal(timeoutRecorder.records[0]?.name, "bounds-verification");
  assert.equal(timeoutRecorder.records[0]?.timeoutBudgetMs, 5);
  assert.equal(timeoutRecorder.records[0]?.finalLifecycleState, "loading");
  assert.equal(timeoutRecorder.records[0]?.failure?.failureKind, "phase-timeout");
  assert.equal(timeoutRecorder.records[0]?.failure?.operationId, null);
}

{
  const assertionRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    phaseBudgets: [{ name: "bounds-verification", timeoutMs: 1_000 }],
  });
  await assert.rejects(
    assertionRecorder.run("bounds-verification", () => assert.fail("fixture assertion")),
    /fixture assertion/,
  );
  assert.equal(assertionRecorder.records[0]?.outcome, "failed");
  assert.equal(
    assertionRecorder.records[0]?.failure?.failureKind,
    "assertion-failure",
  );
}

{
  const playwrightAssertionRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    phaseBudgets: [
      { name: "remount", timeoutMs: runtimeSmokePhaseBudget("remount") },
    ],
  });
  const matcherError = new Error("structured matcher fixture");
  matcherError.matcherResult = { pass: false };
  await assert.rejects(
    playwrightAssertionRecorder.run("remount", () => {
      throw matcherError;
    }),
    /structured matcher fixture/,
  );
  assert.equal(
    playwrightAssertionRecorder.records[0]?.failure?.failureKind,
    "assertion-failure",
  );
}

{
  let clock = 0;
  const unexpectedRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    now: () => clock,
    phaseBudgets: [{ name: "bounds-verification", timeoutMs: 103_000 }],
  });
  await assert.rejects(
    unexpectedRecorder.run(
      "bounds-verification",
      () => {
        clock = 12_088;
        throw new Error("unexpected structured fixture");
      },
      () => "loading",
    ),
    /unexpected structured fixture/,
  );
  assert.equal(unexpectedRecorder.records[0]?.outcome, "failed");
  assert.equal(
    unexpectedRecorder.records[0]?.failure?.failureKind,
    "unexpected-error",
  );
}

{
  const warnings = [];
  let clock = 0;
  const progressRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    now: () => clock++,
    phaseBudgets: [{ name: "reload-1", timeoutMs: 100 }],
    phaseContracts: {
      "reload-1": {
        operations: [{ name: "work", timeoutMs: 20 }],
        orchestrationMarginMs: 80,
        noProgressTimeoutMs: 50,
        performanceWarningThresholdMs: 0,
      },
    },
    writePerformanceWarning: (message) => warnings.push(message),
  });
  await progressRecorder.run("reload-1", async ({ checkpoint }) => {
    checkpoint("navigation-complete", "loading");
    checkpoint("models-ready", "ready");
  }, () => "ready");
  assert.equal(progressRecorder.records[0]?.outcome, "passed");
  assert.equal(progressRecorder.records[0]?.performanceWarningExceeded, true);
  assert.equal(warnings.length, 1);
  assert.deepEqual(
    progressRecorder.records[0]?.progressCheckpoints.map(({ name }) => name),
    ["phase-start", "navigation-complete", "models-ready", "phase-complete"],
  );
}

{
  let lateCheckpoint;
  const noProgressRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    phaseBudgets: [{ name: "reload-1", timeoutMs: 100 }],
    phaseContracts: {
      "reload-1": {
        operations: [{ name: "work", timeoutMs: 5 }],
        orchestrationMarginMs: 95,
        noProgressTimeoutMs: 5,
        performanceWarningThresholdMs: 70,
      },
    },
    writePerformanceWarning: () => undefined,
  });
  await assert.rejects(
    noProgressRecorder.run(
      "reload-1",
      ({ checkpoint }) => {
        lateCheckpoint = checkpoint;
        return new Promise(() => {});
      },
      () => "loading",
    ),
    RuntimeSmokeNoProgressError,
  );
  assert.equal(noProgressRecorder.records[0]?.outcome, "stalled");
  assert.equal(
    noProgressRecorder.records[0]?.failure?.failureKind,
    "no-progress-watchdog",
  );
  lateCheckpoint("late-task-progress", "ready");
  assert.deepEqual(
    noProgressRecorder.records[0]?.progressCheckpoints.map(({ name }) => name),
    ["phase-start"],
    "a task that outlives its failed phase must not mutate retained progress",
  );
}

{
  const postReadinessRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    phaseBudgets: [{ name: "reload-1", timeoutMs: 100 }],
    phaseContracts: {
      "reload-1": {
        operations: [{ name: "work", timeoutMs: 5 }],
        orchestrationMarginMs: 95,
        noProgressTimeoutMs: 5,
        performanceWarningThresholdMs: 70,
      },
    },
    writePerformanceWarning: () => undefined,
  });
  await assert.rejects(
    postReadinessRecorder.run(
      "reload-1",
      ({ checkpoint }) =>
        runRuntimeSmokePostReadinessOperation({
          checkpoint,
          startedCheckpoint: "post-ready-settle-started",
          completedCheckpoint: "post-ready-settle-complete",
          task: () => new Promise(() => {}),
        }),
      () => "ready",
    ),
    RuntimeSmokeNoProgressError,
  );
  assert.equal(postReadinessRecorder.records[0]?.outcome, "stalled");
  assert.equal(
    postReadinessRecorder.records[0]?.failure?.failureKind,
    "no-progress-watchdog",
  );
  assert.equal(
    postReadinessRecorder.records[0]?.failure?.lastSafeCheckpoint,
    "post-ready-settle-started",
  );
  assert.deepEqual(
    postReadinessRecorder.records[0]?.progressCheckpoints.map(
      ({ name }) => name,
    ),
    ["phase-start", "post-ready-settle-started"],
    "a stalled post-readiness await must retain its exact started checkpoint",
  );
}

{
  const checkpoints = [];
  const diagnostics = [];
  const sourceSnapshot = {
    schema: "interior-ai.glb-required-snapshot.v1",
    reloadGeneration: 2,
    registryEntryCount: 1,
    activeRequiredCount: 1,
    activeRequiredModelIds: ["runtime-smoke-model-1"],
    models: [
      {
        key: "runtime-smoke-model-1",
        active: true,
        requiredForReadiness: true,
        loadState: "ready",
        generationState: "current",
        lastTransitionName: "ready",
        lastTransitionAtMs: 123.4,
      },
    ],
    caches: {
      parsed: { entryCount: 1, activeReferenceCount: 1 },
      prepared: {
        entryCount: 1,
        activeReferenceCount: 1,
        zeroReferenceEntryCount: 0,
      },
    },
  };
  const detachedSnapshot = captureImmediatePostReadinessSnapshot({
    checkpoint: (name, lifecycleState) =>
      checkpoints.push({ name, lifecycleState }),
    phaseName: "reload-1",
    responseTotal: 6,
    snapshot: sourceSnapshot,
    timing: {
      hostRequestStartedAtUnixMs: 99,
      schedulingDelayMs: 1,
      computationDurationMs: 2,
      serializationDurationMs: 3,
      transferDurationMs: 4,
    },
    writeDiagnostic: (message) => diagnostics.push(message),
  });
  sourceSnapshot.models[0].loadState = "error";
  assert.equal(detachedSnapshot.models[0].loadState, "ready");
  assert.deepEqual(
    checkpoints.map(({ name }) => name),
    [
      "immediate-snapshot-captured",
      "immediate-generation-2",
      "immediate-registry-1-required-1-ready-1-loading-0-error-0-stale-0",
      "immediate-cache-parsed-1-refs-1-prepared-1-refs-1-retained-0",
      "immediate-response-total-6",
      "immediate-active-key-1-runtime-smoke-model-1",
      "immediate-model-1-transition-ready-at-123",
      "immediate-snapshot-wait-1-compute-2-serialize-3-transfer-4",
    ],
  );
  assert.equal(
    diagnostics[0]?.startsWith(
      "[runtime-smoke-immediate-post-readiness-snapshot] ",
    ),
    true,
  );
  assert.doesNotMatch(
    diagnostics[0],
    /hostRequestStartedAtUnixMs/,
    "immediate evidence must retain relative timing only",
  );
}

const runtimeSmokeSource = readFileSync(
  path.join(process.cwd(), "tests/e2e/00-runtime-smoke.spec.ts"),
  "utf8",
);
assert.match(
  runtimeSmokeSource,
  /observedReadyModelCount:\s*remountedReadiness\.activeRequiredDiagnostics\.filter/,
  "the remount checkpoint must count the full set returned by the readiness wait",
);
assert.doesNotMatch(
  runtimeSmokeSource,
  /observedReadyModelCount:\s*remountedDiagnostics\.filter/,
  "the remount checkpoint must not count only explicit fixture diagnostics",
);
assert.match(
  runtimeSmokeSource,
  /observedReadyModelCount:\s*reloadDiagnostics\.readiness\.observedReadyModelCount/,
  "reload telemetry must count the authoritative current-generation active-required set",
);
assert.doesNotMatch(
  runtimeSmokeSource,
  /observedReadyModelCount:\s*reloadDiagnostics\.filter/,
  "reload telemetry must not project the three explicit fixtures as the ready set",
);
const runtimeReadinessConsumerSource = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf("const readModelDiagnostics ="),
  runtimeSmokeSource.indexOf("const readModelDiagnosticsWithin ="),
);
assert.match(
  runtimeReadinessConsumerSource,
  /activeRequiredKeys:\s*activeRequiredEvaluation\.observedActiveRequiredKeys/,
  "the actual wait must consume filtered current-generation keys",
);
assert.match(
  runtimeReadinessConsumerSource,
  /runtimeSmokeRequiredRegistryReady\(\{/,
  "the actual wait must use the executable shared registry consumer",
);
assert.doesNotMatch(
  runtimeReadinessConsumerSource,
  /activeRequiredKeys:\s*snapshot\.activeRequiredModelIds/,
  "the actual wait must not compare against raw broad snapshot keys",
);
const runtimeSnapshotProofSource = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf("const recordRequiredSnapshotProof ="),
  runtimeSmokeSource.indexOf("const waitForModelDiagnosticsReady ="),
);
assert.match(
  runtimeSnapshotProofSource,
  /activeRequiredEvaluation\.activeRequiredDiagnostics/,
  "snapshot proof must use the same filtered current-generation diagnostics",
);
assert.doesNotMatch(
  runtimeSnapshotProofSource,
  /expect\(snapshot\.activeRequiredCount\)\.toBe\(\s*EXPECTED_ACTIVE_REQUIRED_MODEL_COUNT/,
  "snapshot proof must not treat the broad top-level count as the current-generation total",
);
assert.match(
  runtimeSmokeSource,
  /test\.setTimeout\(RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS\)/,
  "the required identity must consume the derived timeout without duplicating a number",
);
assert.doesNotMatch(runtimeSmokeSource, /test\.slow\(|test\.skip\(|retries\s*:/);
const heartbeatHandlerSource = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf("const browserHeartbeatPrefix"),
  runtimeSmokeSource.indexOf('if (message.type() === "error")'),
);
assert.match(
  heartbeatHandlerSource,
  /projectRuntimeSmokeBrowserHeartbeat/,
  "browser heartbeats must cross an exact safe projection boundary",
);
assert.doesNotMatch(
  heartbeatHandlerSource,
  /fatalErrors\.push|checkpoint\(/,
  "invalid or delayed heartbeats must never fail or reset progress",
);
const heartbeatProducerSource = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf("if (!diagnosticsGlobal.__INTERIOR_AI_RUNTIME_SMOKE_HEARTBEAT__)"),
  runtimeSmokeSource.indexOf('const clearSentinel = "__e2e_runtime_smoke_storage_cleared"'),
);
assert.equal(
  heartbeatProducerSource.match(/requestAnimationFrame/g)?.length,
  1,
  "liveness diagnostics may request one animation frame per heartbeat but must not create a continuous frame loop",
);
assert.match(
  heartbeatProducerSource,
  /if \(!animationFramePending\)[\s\S]*requestAnimationFrame[\s\S]*animationFramePending = false/,
  "animation-frame liveness sampling must remain coalesced and one-shot",
);
assert.match(
  runtimeSmokeSource,
  /projectRuntimeSmokeBrowserCallbackMilestone/,
  "browser callback milestones must be projected before host logging",
);
const reloadLoop = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf("for (let reloadIndex"),
  runtimeSmokeSource.indexOf('await phaseRecorder.run("persistence-assertions"'),
);
assert.match(reloadLoop, /waitForReloadModelsReady/);
assert.match(reloadLoop, /reloadIndex\s*<\s*3/);
assert.match(
  reloadLoop,
  /MODEL_FIXTURES\.length\s*\*\s*\(reloadIndex\s*\+\s*2\)/,
  "three reloads must retain cumulative response totals 6, 9, and 12",
);
assert.doesNotMatch(reloadLoop, /waitForModelResponsesOrTerminal/);
assert.doesNotMatch(reloadLoop, /waitForModelDiagnosticsReady/);
assert.match(reloadLoop, /Promise\.all\(\[/);
assert.doesNotMatch(
  reloadLoop,
  /await\s+readModelDiagnostics\(\)/,
  "reload diagnostics must not bypass a named wall-clock operation bound",
);
assert.match(
  reloadLoop,
  /lastMainThreadTelemetrySummary\?\.counters\.rendererCalls[\s\S]*settledRendererCallsByPhase\.get\(phaseName\)/,
  "reload assertions must prove the global scene renderer stayed idle",
);
assert.doesNotMatch(
  reloadLoop,
  /expect\(page\.locator\(["']body["']\)\)\.not\.toContainText/,
  "reload body verification must use the canonical hard-bounded host operation",
);
assert.doesNotMatch(
  runtimeSmokeSource,
  /__INTERIOR_AI_GLB_DIAGNOSTICS__/,
  "runtime smoke must not invoke the legacy rich diagnostics global",
);
const postReadinessCaptureIndex = reloadLoop.indexOf(
  "captureImmediatePostReadinessSnapshot",
);
const postReadinessResponseIndex = reloadLoop.lastIndexOf(
  "const responseTotal =",
  postReadinessCaptureIndex,
);
assert.ok(postReadinessResponseIndex >= 0 && postReadinessCaptureIndex >= 0);
assert.doesNotMatch(
  reloadLoop.slice(postReadinessResponseIndex, postReadinessCaptureIndex),
  /\bawait\b/,
  "the immediate snapshot must be captured before any later awaited action",
);
const orderedPostReadinessTokens = [
  "captureImmediatePostReadinessSnapshot",
  "response-total-verification-started",
  "response-total-verification-complete",
  "generation-verification-started",
  "generation-verification-complete",
  "active-key-verification-started",
  "active-key-verification-complete",
  "body-state-verification-started",
  "body-state-verification-complete",
  "post-ready-settle-started",
  "post-ready-settle-complete",
  "post-settle-observation-started",
  "post-settle-observation-complete",
  "required-snapshot-requested",
  "required-snapshot-returned",
  "required-snapshot-assertions-complete",
];
let previousPostReadinessTokenIndex = -1;
for (const token of orderedPostReadinessTokens) {
  const tokenIndex = reloadLoop.indexOf(token);
  assert.ok(
    tokenIndex > previousPostReadinessTokenIndex,
    `${token} must retain ordered post-readiness control flow`,
  );
  previousPostReadinessTokenIndex = tokenIndex;
}
const bodyStateOperationSource = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf("const verifyBodyStateAfterReadiness"),
  runtimeSmokeSource.indexOf("const waitForReloadModelsReady"),
);
assert.match(bodyStateOperationSource, /runRuntimeSmokeBoundedOperation/);
assert.match(bodyStateOperationSource, /operationName:\s*["']body-state-assertion["']/);
assert.match(bodyStateOperationSource, /performance\.now\(\)/);
assert.doesNotMatch(
  bodyStateOperationSource,
  /page\.evaluate/,
  "the body-state assertion must not require a second post-readiness browser admission",
);
for (const milestone of [
  "entered-browser",
  "callback-exited",
  "serialization-complete",
]) {
  assert.match(bodyStateOperationSource, new RegExp(milestone));
}
const diagnosticSnapshotSource = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf("const readModelDiagnostics ="),
  runtimeSmokeSource.indexOf("let expectedLifecycleRegistrySize"),
);
assert.match(
  diagnosticSnapshotSource,
  /document\.body\.textContent\?\.includes/,
  "body state must be observed inside the atomic readiness callback",
);
assert.match(
  diagnosticSnapshotSource,
  /operation:\s*\{\s*phaseName:\s*string;\s*operationName:\s*string\s*\}/,
  "every diagnostic callback must carry its canonical phase and operation identity",
);
assert.match(
  diagnosticSnapshotSource,
  /interior-ai\.runtime-smoke-browser-callback\.v2/,
  "diagnostic callbacks must expose fixed-stage browser timing observations",
);
assert.match(
  diagnosticSnapshotSource,
  /runtime-smoke-browser-callback-requested[\s\S]*page\.evaluate/,
  "host evidence must identify callback requests before browser admission",
);
assert.match(
  diagnosticSnapshotSource,
  /browserCallbackEnteredMs[\s\S]*browserCallbackExitedMs[\s\S]*serializationCompletedMs[\s\S]*resultReceivedMs/,
  "host and browser timing attribution must remain separate and relative",
);
assert.match(reloadLoop, /recordRequiredSnapshotProof\(phaseName, checkpoint\)/);
assert.match(runtimeSmokeSource, /expect\(immediatePostReadinessSnapshots\)\.toHaveLength\(3\)/);
assert.doesNotMatch(
  runtimeSmokeSource,
  /maximumSamples/,
  "diagnostics settling must enforce elapsed wall time rather than sample count",
);
const rendererIdleObservationSource = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf("const collectRendererIdleObservation"),
  runtimeSmokeSource.indexOf("const settledResponseTotal"),
);
assert.match(
  runtimeSmokeSource,
  /admissionRequiresQuiescentHeartbeat[\s\S]*runtimeSmokeBrowserHeartbeatSupportsIdleAdmission\([\s\S]*lastBrowserHeartbeat/,
  "renderer-idle evaluation must wait for a valid quiescent browser heartbeat",
);
assert.match(
  runtimeSmokeSource,
  /model-responses-ready[\s\S]*browser-callback-admission-wait-started[\s\S]*runtimeSmokeBrowserHeartbeatSupportsIdleAdmission\([\s\S]*browser-callback-admission-ready[\s\S]*selection-verification/,
  "selection diagnostics must use the existing model-response budget to await quiescent browser admission",
);
assert.match(
  runtimeSmokeSource,
  /expectedReloadActiveResourceKindCounts[\s\S]*prepared\.activeReferenceCount[\s\S]*parsed\.activeReferenceCount/,
  "reload cache proof must bind stable active-resource topology and exact live lease ownership",
);
assert.doesNotMatch(
  runtimeSmokeSource,
  /expectedReloadCacheEntryCounts/,
  "reload cache proof must not require optional zero-reference retention across documents",
);
assert.match(
  rendererIdleObservationSource,
  /requestAnimationFrame\(observeFrame\)/,
  "renderer-idle sampling must use monotonic animation-frame admission",
);
assert.doesNotMatch(
  rendererIdleObservationSource,
  /window\.setTimeout\(resolve, contract\.sampleIntervalMs\)/,
  "renderer-idle sampling must not depend on throttled timeout admission",
);
assert.match(
  rendererIdleObservationSource,
  /alignToQuiescence[\s\S]*samples\.length = 0/,
  "the retry observation must restart its candidate window until quiescent",
);
assert.match(
  runtimeSmokeSource,
  /attempt > 1[\s\S]*RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT\.retryAlignsToQuiescence/,
  "only retry observations may align their evidence window to quiescence",
);
assert.match(runtimeSmokeSource, /createRuntimeSmokeOperationDeadline/);
assert.match(runtimeSmokeSource, /runtimeSmokeOperationAttempt/);
assert.match(runtimeSmokeSource, /runRuntimeSmokeBoundedOperation/);
assert.match(runtimeSmokeSource, /RuntimeSmokeOperationTimeoutError/);
const settleSampleSource = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf("const readSettleSample"),
  runtimeSmokeSource.indexOf("let previous = await readSettleSample"),
);
assert.match(
  settleSampleSource,
  /RuntimeSmokeOperationAttemptTimeoutError/,
  "a capped settle leaf must be distinguished from canonical expiration",
);
assert.match(
  settleSampleSource,
  /waitForRuntimeSmokeOperationDeadline/,
  "a capped settle leaf at the parent boundary must retain parent provenance",
);
assert.match(
  settleSampleSource,
  /settleContext\.deadlineReached\(\)/,
  "settle timeout conversion must prove the parent monotonic deadline",
);
assert.doesNotMatch(runtimeSmokeSource, /operationBudgetMs\s*:/);
assert.doesNotMatch(runtimeSmokeSource, /remainingOperationTimeout/);
assert.doesNotMatch(
  runtimeSmokeSource,
  /RuntimeSmokePhaseTimeoutError/,
  "nested operation exhaustion must not be flattened into a parent phase timeout",
);
for (const operation of FURNISHED_TEMPLATE_RELOAD_CONTRACT.operations.filter(
  ({ name }) => ![
    "hydration-snapshot",
    "model-responses-and-readiness",
    "body-state-assertion",
    "diagnostics-settle",
    "final-diagnostics-snapshot",
  ].includes(name),
)) {
  const uses = runtimeSmokeSource.match(
    new RegExp(
      `reloadOperationTimeout\\(\\s*["']${operation.name}["']\\s*,?\\s*\\)`,
      "g",
    ),
  ) ?? [];
  assert.equal(
    uses.length,
    1,
    `${operation.name} must be consumed once per reload implementation`,
  );
}
const phaseOperationUseCount = (phaseName, operationName) =>
  runtimeSmokeSource.match(
    new RegExp(
      `phaseOperationTimeout\\(\\s*["']${phaseName}["']\\s*,\\s*` +
        `["']${operationName}["']\\s*,?\\s*\\)`,
      "g",
    ),
  )?.length ?? 0;
for (const phaseName of [
  "initial-glb-loading-and-selection-verification",
  "bounds-verification",
  "remount",
]) {
  for (const operation of FURNISHED_TEMPLATE_PHASE_CONTRACTS[
    phaseName
  ].operations.filter(({ name }) => ![
    "model-responses",
    "model-readiness",
    "diagnostics-settle",
    "diagnostic-snapshot-and-assertions",
  ].includes(name))) {
    assert.equal(
      phaseOperationUseCount(phaseName, operation.name),
      1,
      `${phaseName}/${operation.name} must own exactly one sequential call budget`,
    );
  }
}
for (const operationName of [
  "model-readiness",
  "diagnostics-settle",
  "diagnostics-settle-evaluation",
  "model-responses-and-readiness",
  "body-state-assertion",
  "model-responses",
  "diagnostic-snapshot-and-assertions",
  "hydration-snapshot",
  "final-diagnostics-snapshot",
]) {
  assert.match(
    runtimeSmokeSource,
    new RegExp(`operationName:\\s*["']${operationName}["']`),
    `${operationName} must derive its deadline from the canonical contract`,
  );
}
assert.match(
  reloadLoop,
  /finalLifecycleState\s*=\s*["']not-observed["'];\s*await phaseRecorder\.run/,
  "every reload phase must reset lifecycle evidence before phase-start",
);
for (const checkpoint of [
  "route-design-loaded",
  "local-fixture-hydrated",
  "view-3d-active",
  "models-ready",
  "bounds-settled",
  "reload-assertions-complete",
]) {
  assert.match(runtimeSmokeSource, new RegExp(checkpoint));
}
for (const modelPath of [
  "public/assets/models/sofa-real-castlery-dawson-ottoman.glb",
  "public/assets/models/sofa-real-castlery-jaron-3s.glb",
  "public/assets/models/sofa-real-castlery-auburn-performance-fabric-3-seater-sofa.glb",
]) {
  assert.equal(
    existsSync(path.join(process.cwd(), modelPath)),
    true,
    `${modelPath} must remain a repository-controlled production fixture`,
  );
}

if (process.argv.includes("--deadline-boundary-contract-only")) {
  console.log("CH-0017 runtime-smoke deadline-boundary contract tests passed.");
  process.exit(0);
}

if (process.argv.includes("--post-readiness-contract-only")) {
  console.log("CH-0028 runtime-smoke post-readiness contract tests passed.");
  process.exit(0);
}

if (process.argv.includes("--readiness-diagnostics-contract-only")) {
  console.log("CH-0028 runtime-smoke readiness diagnostic contract tests passed.");
  process.exit(0);
}

if (process.argv.includes("--phase-budget-contract-only")) {
  console.log("CH-0017 runtime-smoke phase-budget contract tests passed.");
  process.exit(0);
}

{
  const root = mkdtempSync(path.join(tmpdir(), "ch-0017-gitleaks-artifact-"));
  git(root, ["init"]);
  git(root, ["config", "user.name", "CH-0017 Fixture"]);
  git(root, ["config", "user.email", "ch-0017@example.test"]);
  const sarifBytes = Buffer.from(
    `${JSON.stringify({
      version: "2.1.0",
      runs: [{ tool: { driver: { name: "gitleaks" } }, results: [] }],
    }, null, 2)}\n`,
  );
  write(root, "results.sarif", sarifBytes);
  write(root, "unrelated-runner-file.txt", "must not enter the artifact\n");
  git(root, ["add", "results.sarif", "unrelated-runner-file.txt"]);
  git(root, ["commit", "-m", "fixture"]);
  const testedSourceSha = git(root, ["rev-parse", "HEAD"]);
  const workflowContextSha = "8".repeat(40);
  const githubOutputPath = path.join(root, "github-output");
  writeFileSync(githubOutputPath, "");
  assert.equal(
    verifyCheckedOutSourceIdentity({
      repositoryRoot: root,
      expectedSourceSha: testedSourceSha,
      githubOutputPath,
    }),
    testedSourceSha,
  );
  assert.equal(readFileSync(githubOutputPath, "utf8"), `tested_source_sha=${testedSourceSha}\n`);
  assert.throws(
    () =>
      verifyCheckedOutSourceIdentity({
        repositoryRoot: root,
        expectedSourceSha: "9".repeat(40),
        githubOutputPath,
      }),
    /does not match/,
  );
  for (const malformed of [undefined, "not-a-sha"] ) {
    assert.throws(
      () =>
        verifyCheckedOutSourceIdentity({
          repositoryRoot: root,
          expectedSourceSha: malformed,
          githubOutputPath,
        }),
      /expected source SHA is missing or malformed/,
    );
  }
  const manifest = prepareGitleaksArtifact({
    repositoryRoot: root,
    testedSourceSha,
    workflowContextSha,
    runId: "30684560486",
    runAttempt: "1",
  });
  assert.deepEqual(
    readdirSync(path.join(root, GITLEAKS_STAGING_ROOT)).sort(),
    [...GITLEAKS_ARCHIVE_ENTRIES],
    "the staging tree must contain only deterministic root-level entries",
  );
  assert.deepEqual(
    readFileSync(path.join(root, GITLEAKS_STAGING_ROOT, "results.sarif")),
    sarifBytes,
    "portable staging must preserve the already-scanned SARIF bytes",
  );
  assert.equal(manifest.testedSourceSha, testedSourceSha);
  assert.equal(manifest.workflowContextSha, workflowContextSha);
  assert.equal(manifest.sarif.archiveEntry, "results.sarif");
  assert.equal(
    readFileSync(path.join(root, GITLEAKS_STAGING_ROOT, "artifact-manifest.json"), "utf8")
      .includes("work/interior-ai/interior-ai"),
    false,
  );
  assert.doesNotThrow(() =>
    verifyGitleaksArtifact({
      repositoryRoot: root,
      expectedTestedSourceSha: testedSourceSha,
    }),
  );
  write(root, `${GITLEAKS_STAGING_ROOT}/extra.txt`, "unexpected\n");
  assert.throws(
    () =>
      verifyGitleaksArtifact({
        repositoryRoot: root,
        expectedTestedSourceSha: testedSourceSha,
      }),
    /archive entries are not exact/,
  );
  rmSync(path.join(root, GITLEAKS_STAGING_ROOT, "extra.txt"));
  const manifestPath = path.join(root, GITLEAKS_STAGING_ROOT, "artifact-manifest.json");
  const storedManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  storedManifest.testedSourceSha = "a".repeat(40);
  storedManifest.workflowContextSha = testedSourceSha;
  writeFileSync(manifestPath, `${JSON.stringify(storedManifest, null, 2)}\n`);
  assert.throws(
    () =>
      verifyGitleaksArtifact({
        repositoryRoot: root,
        expectedTestedSourceSha: testedSourceSha,
      }),
    /testedSourceSha does not match/,
    "workflowContextSha must never compensate for a wrong testedSourceSha",
  );
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(
    () =>
      prepareGitleaksArtifact({
        repositoryRoot: root,
        testedSourceSha: "7".repeat(40),
        workflowContextSha,
        runId: "30684560486",
        runAttempt: "1",
      }),
    /does not match the checked-out source SHA/,
  );
  for (const malformed of [undefined, "merge-sha"] ) {
    assert.throws(
      () =>
        prepareGitleaksArtifact({
          repositoryRoot: root,
          testedSourceSha,
          workflowContextSha: malformed,
          runId: "30684560486",
          runAttempt: "1",
        }),
      /workflow-context SHA is missing or malformed/,
    );
  }

  write(
    root,
    "results.sarif",
    `${JSON.stringify({
      version: "2.1.0",
      runs: [{ artifacts: [{ location: { uri: "/home/runner/work/repo/results" } }] }],
    })}\n`,
  );
  assert.throws(
    () =>
      prepareGitleaksArtifact({
        repositoryRoot: root,
        testedSourceSha,
        workflowContextSha,
        runId: "30684560486",
        runAttempt: "1",
      }),
    /contains runner paths/,
  );
  assert.equal(existsSync(path.join(root, GITLEAKS_STAGING_ROOT)), false);
  assert.equal(existsSync(path.join(root, `${GITLEAKS_STAGING_ROOT}.staging`)), false);
}

assert.deepEqual(
  ["é", "a", "Z", "!"].sort(comparePortablePaths),
  ["!", "Z", "a", "é"],
  "artifact paths must use locale-independent code-unit ordering",
);

function write(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function deterministicClock(values) {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    if (!value) throw new Error("deterministic clock exhausted");
    return value;
  };
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function writeFloorPlanRouteNftFixture(root) {
  write(root, "public/assets/floor-plans/preview.webp", "preview\n");
  for (const nftPath of FLOOR_PLAN_ROUTE_NFT_PATHS) {
    const routeChunkPath = nftPath.slice(0, -".nft.json".length);
    write(root, routeChunkPath, "route chunk\n");
    const reference = path
      .relative(path.dirname(path.join(root, nftPath)), path.join(root, "public/assets/floor-plans/preview.webp"))
      .replaceAll(path.sep, "/");
    write(root, nftPath, `${JSON.stringify({ version: 1, files: [reference] })}\n`);
  }
}

function floorPlanRouteNftFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "ch-0015i-floor-plan-nft-"));
  writeFloorPlanRouteNftFixture(root);
  return root;
}

function appendFloorPlanNftReference(root, nftPath, sourcePath) {
  const absoluteNftPath = path.join(root, nftPath);
  const manifest = JSON.parse(readFileSync(absoluteNftPath, "utf8"));
  manifest.files.push(
    path.relative(path.dirname(absoluteNftPath), path.join(root, sourcePath)).replaceAll(path.sep, "/"),
  );
  write(root, nftPath, `${JSON.stringify(manifest)}\n`);
}

{
  const root = floorPlanRouteNftFixture();
  const result = inspectFloorPlanRouteNftContract(root);
  assert.equal(result.targetCount, 3);
  assert.equal(result.rejectedSourceEdges, 0);
  assert.equal(result.testSourceEdges, 0);
  assert.equal(result.targets.every((target) => target.publicAssetReferenceCount === 1), true);
}

for (const rejectedPath of [
  "scripts/test-required-test-truthfulness.mjs",
  "scripts/test-production-artifact-evidence.mjs",
  "tests/required/floor-plan-security.spec.ts",
]) {
  const root = floorPlanRouteNftFixture();
  write(root, rejectedPath, "test source\n");
  appendFloorPlanNftReference(root, FLOOR_PLAN_ROUTE_NFT_PATHS[0], rejectedPath);
  assert.throws(
    () => inspectFloorPlanRouteNftContract(root),
    new RegExp(`${rejectedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*production trace/archive policy rejects`),
  );
}

{
  const root = floorPlanRouteNftFixture();
  rmSync(path.join(root, FLOOR_PLAN_ROUTE_NFT_PATHS[0].slice(0, -".nft.json".length)));
  assert.throws(
    () => inspectFloorPlanRouteNftContract(root),
    /required generated route chunk is missing/,
  );
}

{
  const root = floorPlanRouteNftFixture();
  const nftPath = FLOOR_PLAN_ROUTE_NFT_PATHS[0];
  write(root, nftPath, `${JSON.stringify({ version: 1, files: ["missing-runtime.webp"] })}\n`);
  assert.throws(
    () => inspectFloorPlanRouteNftContract(root),
    /missing-runtime\.webp: NFT path is missing/,
  );
}

{
  const root = floorPlanRouteNftFixture();
  write(root, "scripts/test-symlink-target.mjs", "test source\n");
  const linkedAsset = "public/assets/floor-plans/linked-test.webp";
  symlinkSync(
    path.relative(
      path.dirname(path.join(root, linkedAsset)),
      path.join(root, "scripts/test-symlink-target.mjs"),
    ),
    path.join(root, linkedAsset),
  );
  appendFloorPlanNftReference(root, FLOOR_PLAN_ROUTE_NFT_PATHS[0], linkedAsset);
  assert.throws(
    () => inspectFloorPlanRouteNftContract(root),
    /public\/assets\/floor-plans\/linked-test\.webp -> scripts\/test-symlink-target\.mjs: UNKNOWN_RUNTIME_NECESSITY_REJECTED: production trace\/archive policy rejects/,
  );
}

{
  const root = floorPlanRouteNftFixture();
  const nftPath = FLOOR_PLAN_ROUTE_NFT_PATHS[0];
  write(
    root,
    nftPath,
    `${JSON.stringify({
      version: 1,
      files: [path.join(root, "public/assets/floor-plans/preview.webp")],
    })}\n`,
  );
  assert.throws(
    () => inspectFloorPlanRouteNftContract(root),
    /MALFORMED_NFT_REFERENCE_REJECTED: production trace\/archive policy rejects <invalid-relative-path>/,
  );
}

const nextConfigSource = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
const outputTracingExclusions = nextConfigSource.match(/outputFileTracingExcludes:\s*\{[\s\S]*?\n\s*\},\n\s*turbopack:/)?.[0] ?? "";
assert.ok(outputTracingExclusions, "The production tracing exclusion contract must remain inspectable.");
assert.match(
  outputTracingExclusions,
  /"\/api\/tools\/glb-optimizer": \["\.\/scripts\/test-\*"\]/,
);
assert.doesNotMatch(outputTracingExclusions, /"\/\*":\s*\[[^\]]*scripts\/test-/);
assert.doesNotMatch(outputTracingExclusions, /tests\/|test-required-test-truthfulness|test-production-artifact-evidence/);
assert.doesNotMatch(outputTracingExclusions, /"\.\/scripts\/\*\*\/\*"|"\.\/tests\/\*\*\/\*"/);
const productionArtifactSource = readFileSync(
  path.join(process.cwd(), "scripts/production-artifact-evidence.mjs"),
  "utf8",
);
const productionArtifactContractSource = readFileSync(
  path.join(process.cwd(), "scripts/production-artifact-contract.mjs"),
  "utf8",
);
const artifactRoots = productionArtifactSource.match(/const ARTIFACT_ROOTS = \[[^;]+;/)?.[0] ?? "";
const artifactExclusions = productionArtifactSource.match(/const ARTIFACT_EXCLUSIONS = \[[\s\S]*?\n\];/)?.[0] ?? "";
assert.equal(artifactRoots, 'const ARTIFACT_ROOTS = [".next", "public"];');
assert.doesNotMatch(artifactExclusions, /scripts|tests|allowlist|exception/i);
const executingWrapperSource = productionArtifactSource.match(
  /export function executeProductionEvidenceChild\([\s\S]*?\n}\n\nfunction startArtifactInventory/,
)?.[0] ?? "";
assert.ok(executingWrapperSource, "the semantic child-process owner must remain inspectable");
assert.match(
  executingWrapperSource,
  /status: "running",\n\s+startedAt: clock\(\),[\s\S]*?result = dispatch\(\);/,
  "the executing wrapper must durably capture semantic start immediately before dispatch",
);
assert.match(
  executingWrapperSource,
  /result = dispatch\(\);[\s\S]*?completedAt: clock\(\),/,
  "the executing wrapper must capture semantic completion immediately after child return",
);
const recoverySource = productionArtifactSource.match(
  /export async function recoverProductionEvidenceFromSemanticJournal\([\s\S]*?\n}\n\nexport async function writeProductionEvidenceManifest/,
)?.[0] ?? "";
assert.ok(recoverySource, "the semantic recovery owner must remain inspectable");
assert.doesNotMatch(
  recoverySource,
  /\b(?:statSync|birthtime|ctime|mtime)\b/,
  "recovery must never derive semantic event fields from filesystem metadata",
);
for (const bindingMarker of [
  "runNonce",
  "commitSha",
  "treeSha",
  "generatedSourceCheck",
  "commands.build",
  "owner.wrapper",
  "nextBuildId",
  "artifactSha256",
]) {
  assert.ok(
    productionArtifactSource.includes(bindingMarker),
    `semantic evidence owner is missing binding marker ${bindingMarker}`,
  );
}
assert.match(
  productionArtifactContractSource,
  /generatedSourceCheckCompletedAt[\s\S]*?buildStartedAt/,
  "the generated-source-before-build ordering validator must remain",
);
assert.doesNotMatch(
  productionArtifactSource,
  /ca77e55|ch0015i-final-integrator-ca77/i,
  "the failed historical ca77 cycle must not receive a source-level exception",
);
for (const policySource of [
  nextConfigSource,
  readFileSync(path.join(process.cwd(), "scripts/gitleaks-artifact.mjs"), "utf8"),
  readFileSync(path.join(process.cwd(), "scripts/required-test-truthfulness.mjs"), "utf8"),
]) {
  assert.doesNotMatch(
    policySource,
    /test-required-test-truthfulness|test-production-artifact-evidence/,
    "Production exclusions, archive scope, and sensitive scanners must not contain file-specific exceptions.",
  );
}

const semanticJournalEnvironment = Object.freeze({
  CERTIFICATION_QUALIFICATION_MODE: "1",
  APP_ENV: "staging",
  NEXT_PUBLIC_APP_ENV: "staging",
  NODE_ENV: "production",
  CATALOG_STRICT_VALIDATION: "true",
  DATABASE_URL:
    "postgresql://test:e3b7d1f5a9c20468e3b7d1f5a9c20468@localhost:5432/semantic_journal_fixture",
  OPENAI_API_KEY: "fixture-openai-placeholder",
  SHOPIFY_STORE_DOMAIN: "fixture.myshopify.example",
  SHOPIFY_STOREFRONT_TOKEN: "fixture-shopify-placeholder",
  POSTHOG_KEY: "fixture-posthog-placeholder",
  STRIPE_SECRET_KEY: "sk_test_fixture_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture_placeholder",
  STRIPE_PRICE_PRO_MONTHLY: "price_fixture_monthly",
  STRIPE_PRICE_PRO_YEARLY: "price_fixture_yearly",
  AUTH_SECRET: "fixture-auth-secret-at-least-32-characters",
  GOOGLE_CLIENT_ID: "fixture.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "GOCSPX-fixture-placeholder",
  APP_ORIGIN: "http://127.0.0.1:3000",
  ADMIN_EMAILS: "fixture-admin@example.test",
});
const semanticJournalToolchain = Object.freeze({
  nodeVersion: process.version,
  npmVersion: "11.6.2",
});
const semanticJournalProcessIdentity = Object.freeze({
  pid: process.pid,
  parentPid: process.ppid,
});

async function semanticJournalFixture({
  complete = false,
  processIdentity = semanticJournalProcessIdentity,
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "ch-0015i-semantic-journal-"));
  write(root, ".gitignore", ".local/\n");
  write(root, "package.json", `${JSON.stringify({
    name: "semantic-journal-fixture",
    private: true,
    packageManager: "npm@11.6.2",
  }, null, 2)}\n`);
  write(
    root,
    "scripts/production-artifact-evidence.mjs",
    readFileSync(path.join(process.cwd(), "scripts/production-artifact-evidence.mjs"), "utf8"),
  );
  write(
    root,
    "scripts/production-artifact-contract.mjs",
    readFileSync(path.join(process.cwd(), "scripts/production-artifact-contract.mjs"), "utf8"),
  );
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "CH-0015I test"]);
  git(root, ["config", "user.email", "ch-0015i@example.test"]);
  git(root, [
    "add",
    ".gitignore",
    "package.json",
    "scripts/production-artifact-contract.mjs",
    "scripts/production-artifact-evidence.mjs",
  ]);
  git(root, ["commit", "-qm", "semantic journal fixture"]);
  const source = {
    commitSha: git(root, ["rev-parse", "HEAD"]),
    treeSha: git(root, ["rev-parse", "HEAD^{tree}"]),
  };
  const journal = await initializeProductionEvidenceSemanticJournal({
    repositoryRoot: root,
    candidateIdentifier: "ch-0015i-semantic-journal",
    source,
    buildContract: { applicationEnvironment: "staging", catalogStrictValidation: true },
    toolchain: semanticJournalToolchain,
    nonce: "123e4567-e89b-42d3-a456-426614174000",
    processIdentity,
    clock: deterministicClock([
      "2026-08-13T00:00:00.000Z",
      "2026-08-13T00:00:00.001Z",
    ]),
  });
  if (complete) {
    const childClock = deterministicClock([
      "2026-08-13T00:00:00.010Z",
      "2026-08-13T00:00:00.020Z",
      "2026-08-13T00:00:00.030Z",
      "2026-08-13T00:00:00.040Z",
      "2026-08-13T00:00:00.050Z",
      "2026-08-13T00:00:00.060Z",
    ]);
    for (const action of ["install", "generatedSourceCheck", "build"]) {
      executeProductionEvidenceChild({
        repositoryRoot: root,
        expectedRunNonce: journal.runNonce,
        action,
        dispatch: () => ({ status: 0 }),
        clock: childClock,
      });
    }
  }
  return {
    root,
    source,
    runNonce: journal.runNonce,
    processIdentity,
  };
}

function overwriteSemanticJournal(root, mutate) {
  const journalPath = path.join(
    root,
    ".local/production-artifact-evidence/semantic-event-journal.json",
  );
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  mutate(journal);
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  return journal;
}

{
  const context = await semanticJournalFixture();
  assert.deepEqual(
    resolveProductionEvidenceToolchain({
      repositoryRoot: context.root,
      nodeVersion: "v24.13.0",
      npmVersionReader: () => "11.6.2",
    }),
    { nodeVersion: "v24.13.0", npmVersion: "11.6.2" },
  );
  assert.throws(
    () =>
      resolveProductionEvidenceToolchain({
        repositoryRoot: context.root,
        npmVersionReader: () => "11.7.0",
      }),
    /executing npm version does not match the committed package manager identity/,
  );
}

{
  const context = await semanticJournalFixture({ complete: true });
  const journal = readProductionEvidenceSemanticJournal({
    repositoryRoot: context.root,
  });
  assert.ok(
    certificationPreparedBuildJournalIssues(journal).includes(
      "certification prepared build requires exactly one process handoff",
    ),
    "certification prepare/complete must reject a missing process handoff",
  );
  const artifactOwnerSource = readFileSync(
    path.join(process.cwd(), "scripts/production-artifact-evidence.mjs"),
    "utf8",
  );
  assert.match(
    artifactOwnerSource,
    /complete-certification-build[\s\S]*requireProcessHandoff: true/,
  );
}

{
  const context = await semanticJournalFixture();
  const clock = deterministicClock([
    "2026-08-13T00:00:00.010Z",
    "2026-08-13T00:00:00.020Z",
  ]);
  let observedDuringDispatch;
  executeProductionEvidenceChild({
    repositoryRoot: context.root,
    expectedRunNonce: context.runNonce,
    action: "install",
    clock,
    dispatch() {
      observedDuringDispatch = readProductionEvidenceSemanticJournal({
        repositoryRoot: context.root,
      });
      return { status: 0 };
    },
  });
  assert.equal(observedDuringDispatch.events.dependencyInstall.status, "running");
  assert.equal(
    observedDuringDispatch.events.dependencyInstall.startedAt,
    "2026-08-13T00:00:00.010Z",
    "semantic start must be durable immediately before child dispatch",
  );
  assert.equal(observedDuringDispatch.events.dependencyInstall.completedAt, null);
  const afterReturn = readProductionEvidenceSemanticJournal({ repositoryRoot: context.root });
  assert.equal(afterReturn.events.dependencyInstall.status, "succeeded");
  assert.equal(
    afterReturn.events.dependencyInstall.completedAt,
    "2026-08-13T00:00:00.020Z",
    "semantic completion must be durable immediately after child return",
  );
}

{
  const context = await semanticJournalFixture({
    processIdentity: { pid: 9999, parentPid: 99 },
  });
  assert.throws(
    () =>
      executeProductionEvidenceChild({
        repositoryRoot: context.root,
        expectedRunNonce: context.runNonce,
        action: "install",
        dispatch: () => ({ status: 0 }),
      }),
    /belongs to another executing process/,
  );
  const journal = readProductionEvidenceSemanticJournal({ repositoryRoot: context.root });
  assert.equal(journal.events.dependencyInstall.status, "pending");
  assert.equal(journal.events.dependencyInstall.startedAt, null);
}

{
  const preparingProcess = { pid: 9998, parentPid: 98 };
  const completingProcess = { pid: process.pid, parentPid: process.ppid };
  const context = await semanticJournalFixture({ processIdentity: preparingProcess });
  executeProductionEvidenceChild({
    repositoryRoot: context.root,
    expectedRunNonce: context.runNonce,
    action: "install",
    processIdentity: preparingProcess,
    dispatch: () => ({ status: 0 }),
    clock: deterministicClock([
      "2026-08-13T00:00:00.010Z",
      "2026-08-13T00:00:00.020Z",
    ]),
  });
  const handedOff = handoffProductionEvidenceSemanticJournal({
    repositoryRoot: context.root,
    expectedRunNonce: context.runNonce,
    expectedOwnerProcess: preparingProcess,
    nextOwnerProcess: completingProcess,
    clock: () => "2026-08-13T00:00:00.025Z",
  });
  assert.deepEqual(handedOff.owner.process, completingProcess);
  assert.deepEqual(handedOff.owner.processHandoffs, [
    {
      from: preparingProcess,
      to: completingProcess,
      boundary: "post-dependency-install-pre-generated-source",
      completedAt: "2026-08-13T00:00:00.025Z",
    },
  ]);
  executeProductionEvidenceChild({
    repositoryRoot: context.root,
    expectedRunNonce: context.runNonce,
    action: "generatedSourceCheck",
    dispatch: () => ({ status: 0 }),
    clock: deterministicClock([
      "2026-08-13T00:00:00.030Z",
      "2026-08-13T00:00:00.040Z",
    ]),
  });
  assert.throws(
    () =>
      handoffProductionEvidenceSemanticJournal({
        repositoryRoot: context.root,
        expectedRunNonce: context.runNonce,
        expectedOwnerProcess: completingProcess,
        nextOwnerProcess: preparingProcess,
      }),
    /requires one completed install/,
  );
}

{
  const context = await semanticJournalFixture({ complete: true });
  const journal = readProductionEvidenceSemanticJournal({ repositoryRoot: context.root });
  assert.equal(validateProductionEvidenceSemanticJournal(journal).valid, true);
  assert.equal(journal.schema, PRODUCTION_EVIDENCE_JOURNAL_SCHEMA);
  assert.deepEqual(journal.commands, {
    dependencyInstall: DEPENDENCY_INSTALL_COMMAND,
    generatedSourceCheck: GENERATED_SOURCE_CHECK_COMMAND,
    build: BUILD_COMMAND,
  });
  assert.ok(
    Date.parse(journal.events.buildWrapperStartedAt) <
      Date.parse(journal.events.generatedSourceCheck.startedAt),
  );
  assert.ok(
    Date.parse(journal.events.generatedSourceCheck.completedAt) <=
      Date.parse(journal.events.build.startedAt),
  );

  const lateGeneratedCheck = structuredClone(journal);
  lateGeneratedCheck.events.generatedSourceCheck.completedAt = "2026-08-13T00:00:00.051Z";
  assert.equal(validateProductionEvidenceSemanticJournal(lateGeneratedCheck).valid, false);
  assert.ok(
    validateProductionEvidenceSemanticJournal(lateGeneratedCheck).issues.some((issue) =>
      issue.includes("buildStartedAt predates generatedSourceCheckCompletedAt"),
    ),
  );

  const invalidIso = structuredClone(journal);
  invalidIso.events.build.startedAt = "2026-08-13 00:00:00Z";
  assert.equal(validateProductionEvidenceSemanticJournal(invalidIso).valid, false);

  const diagnosticMetadata = structuredClone(journal);
  diagnosticMetadata.diagnostics.filesystemMetadata.push({
    label: "build-log",
    birthtime: "2026-08-13T00:00:00.000Z",
    ctime: "2026-08-13T00:00:00.001Z",
    mtime: "2026-08-13T00:00:00.060Z",
  });
  assert.equal(
    validateProductionEvidenceSemanticJournal(diagnosticMetadata).valid,
    true,
    "filesystem timestamps are permitted only in explicitly diagnostic metadata",
  );

  for (const [field, value, expected] of [
    ["generatedSourceCheck", "not-the-generated-command", "command binding"],
    ["build", "npm run dev", "command binding"],
  ]) {
    const mismatch = structuredClone(journal);
    mismatch.commands[field] = value;
    assert.ok(
      validateProductionEvidenceSemanticJournal(mismatch).issues.some((issue) =>
        issue.includes(expected),
      ),
    );
  }
}

{
  const context = await semanticJournalFixture();
  executeProductionEvidenceChild({
    repositoryRoot: context.root,
    expectedRunNonce: context.runNonce,
    action: "install",
    dispatch: () => ({ status: 0 }),
    clock: deterministicClock([
      "2026-08-13T00:00:00.010Z",
      "2026-08-13T00:00:00.020Z",
    ]),
  });
  assert.throws(
    () =>
      executeProductionEvidenceChild({
        repositoryRoot: context.root,
        expectedRunNonce: context.runNonce,
        action: "generatedSourceCheck",
        dispatch: () => ({ status: 17 }),
        clock: deterministicClock([
          "2026-08-13T00:00:00.030Z",
          "2026-08-13T00:00:00.040Z",
        ]),
      }),
    /failed with status 17/,
  );
  const journal = readProductionEvidenceSemanticJournal({ repositoryRoot: context.root });
  assert.equal(journal.events.generatedSourceCheck.status, "failed");
  assert.equal(journal.events.generatedSourceCheck.exitCode, 17);
  assert.equal(journal.events.build.status, "pending");
  assert.equal(journal.events.build.startedAt, null, "generated-source failure must not invent build start");
}

{
  const context = await semanticJournalFixture();
  const childClock = deterministicClock([
    "2026-08-13T00:00:00.010Z",
    "2026-08-13T00:00:00.020Z",
    "2026-08-13T00:00:00.030Z",
    "2026-08-13T00:00:00.040Z",
    "2026-08-13T00:00:00.050Z",
    "2026-08-13T00:00:00.060Z",
  ]);
  for (const action of ["install", "generatedSourceCheck"]) {
    executeProductionEvidenceChild({
      repositoryRoot: context.root,
      expectedRunNonce: context.runNonce,
      action,
      dispatch: () => ({ status: 0 }),
      clock: childClock,
    });
  }
  assert.throws(
    () =>
      executeProductionEvidenceChild({
        repositoryRoot: context.root,
        expectedRunNonce: context.runNonce,
        action: "build",
        dispatch: () => ({ status: 23 }),
        clock: childClock,
      }),
    /failed with status 23/,
  );
  const journal = readProductionEvidenceSemanticJournal({ repositoryRoot: context.root });
  assert.equal(journal.events.build.status, "failed");
  assert.equal(journal.events.build.exitCode, 23);
  assert.equal(journal.events.build.startedAt, "2026-08-13T00:00:00.050Z");
  assert.equal(journal.events.build.completedAt, "2026-08-13T00:00:00.060Z");
}

{
  const context = await semanticJournalFixture();
  const childClock = deterministicClock([
    "2026-08-13T00:00:00.010Z",
    "2026-08-13T00:00:00.020Z",
    "2026-08-13T00:00:00.030Z",
    "2026-08-13T00:00:00.040Z",
    "2026-08-13T00:00:00.050Z",
    "2026-08-13T00:00:00.060Z",
  ]);
  for (const action of ["install", "generatedSourceCheck"]) {
    executeProductionEvidenceChild({
      repositoryRoot: context.root,
      expectedRunNonce: context.runNonce,
      action,
      dispatch: () => ({ status: 0, signal: null }),
      clock: childClock,
    });
  }
  assert.throws(
    () =>
      executeProductionEvidenceChild({
        repositoryRoot: context.root,
        expectedRunNonce: context.runNonce,
        action: "build",
        dispatch: () => ({ status: null, signal: "SIGTERM" }),
        clock: childClock,
      }),
    /failed with signal SIGTERM/,
  );
  const journal = readProductionEvidenceSemanticJournal({ repositoryRoot: context.root });
  assert.equal(journal.events.build.exitCode, null);
  assert.equal(journal.events.build.signal, "SIGTERM");
  assert.equal(journal.events.build.failureKind, "child_signal");
}

{
  const missingRoot = mkdtempSync(path.join(tmpdir(), "ch-0015i-missing-journal-"));
  await assert.rejects(
    () =>
      recoverProductionEvidenceFromSemanticJournal({
        repositoryRoot: missingRoot,
        expectedRunNonce: "123e4567-e89b-42d3-a456-426614174000",
        environment: semanticJournalEnvironment,
        toolchain: semanticJournalToolchain,
      }),
    /semantic event journal is missing/,
  );
}

{
  const context = await semanticJournalFixture();
  await assert.rejects(
    () =>
      recoverProductionEvidenceFromSemanticJournal({
        repositoryRoot: context.root,
        expectedRunNonce: context.runNonce,
        environment: semanticJournalEnvironment,
        toolchain: semanticJournalToolchain,
      }),
    /dependency installation is incomplete or failed/,
  );
  await assert.rejects(
    () =>
      recoverProductionEvidenceFromSemanticJournal({
        repositoryRoot: context.root,
        expectedRunNonce: "223e4567-e89b-42d3-a456-426614174000",
        environment: semanticJournalEnvironment,
        toolchain: semanticJournalToolchain,
      }),
    /run nonce mismatch/,
  );
}

for (const [mutate, expected] of [
  [(journal) => { journal.source.treeSha = "f".repeat(40); }, /source commit or tree mismatch/],
  [(journal) => { journal.commands.generatedSourceCheck = "npx false"; }, /command binding is not canonical/],
  [(journal) => { journal.commands.build = "npm run dev"; }, /command binding is not canonical/],
  [(journal) => { journal.owner.wrapper.sha256 = "f".repeat(64); }, /wrapper version or source hash mismatch/],
]) {
  const context = await semanticJournalFixture({ complete: true });
  overwriteSemanticJournal(context.root, mutate);
  await assert.rejects(
    () =>
      recoverProductionEvidenceFromSemanticJournal({
        repositoryRoot: context.root,
        expectedRunNonce: context.runNonce,
        environment: semanticJournalEnvironment,
        toolchain: semanticJournalToolchain,
      }),
    expected,
  );
}

async function fixture({
  environmentOverrides = {},
  publicArtifactText = "public artifact\n",
  manifestFactory = createProductionEvidenceManifest,
  recordRuntimeTest = true,
  nextBuildId = "build-fixture-001",
  commitDate = null,
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "ch-0016-evidence-"));
  write(root, ".gitignore", ".next/\n.local/\nnode_modules/\n*.local.js\n");
  write(root, "package.json", `${JSON.stringify({
    name: "evidence-fixture",
    private: true,
    packageManager: "npm@11.6.2",
  }, null, 2)}\n`);
  write(root, "package-lock.json", `${JSON.stringify({
    name: "evidence-fixture",
    lockfileVersion: 3,
    packages: {},
  }, null, 2)}\n`);
  write(root, ".nvmrc", "24.13.0\n");
  write(
    root,
    "scripts/production-artifact-evidence.mjs",
    readFileSync(path.join(process.cwd(), "scripts/production-artifact-evidence.mjs"), "utf8"),
  );
  write(
    root,
    "scripts/production-artifact-contract.mjs",
    readFileSync(path.join(process.cwd(), "scripts/production-artifact-contract.mjs"), "utf8"),
  );
  write(
    root,
    "scripts/required-test-truthfulness.mjs",
    readFileSync(path.join(process.cwd(), "scripts/required-test-truthfulness.mjs"), "utf8"),
  );
  write(
    root,
    "scripts/runtime-smoke-phase-budget.mjs",
    readFileSync(path.join(process.cwd(), "scripts/runtime-smoke-phase-budget.mjs"), "utf8"),
  );
  write(
    root,
    "scripts/runtime-smoke-failure-evidence.mjs",
    readFileSync(
      path.join(process.cwd(), "scripts/runtime-smoke-failure-evidence.mjs"),
      "utf8",
    ),
  );
  for (const sourceName of [
    "runtime-smoke-operation-contracts.mjs",
    "runtime-smoke-operation-deadline.mjs",
    "runtime-smoke-telemetry-bootstrap-contract.mjs",
  ]) {
    write(
      root,
      `scripts/${sourceName}`,
      readFileSync(path.join(process.cwd(), "scripts", sourceName), "utf8"),
    );
  }
  write(
    root,
    "scripts/required-test-manifest.json",
    readFileSync(path.join(process.cwd(), "scripts/required-test-manifest.json"), "utf8"),
  );
  for (const relativePath of [
    "scripts/test-production-archive-plan-evidence.mjs",
    "scripts/test-production-trace-archive-policy.mjs",
  ]) {
    write(
      root,
      relativePath,
      readFileSync(path.join(process.cwd(), relativePath), "utf8"),
    );
  }
  for (const relativePath of PRODUCTION_EVIDENCE_VERIFIER_SOURCE_PATHS) {
    write(
      root,
      relativePath,
      readFileSync(path.join(process.cwd(), relativePath)),
    );
  }
  write(root, "generated/runtime.ts", "export const generated = true;\n");
  write(root, "public/asset.txt", publicArtifactText);
  write(root, ".next/BUILD_ID", `${nextBuildId}\n`);
  write(root, ".next/build-manifest.json", "{}\n");
  write(root, ".next/required-server-files.json", "{}\n");
  write(root, ".next/static/chunk.js", "static chunk\n");
  write(root, ".next/server/app.js", "server output\n");
  write(root, ".next/server/app.js.nft.json", `${JSON.stringify({
    version: 1,
    files: ["../../package.json", "../../node_modules/.package-lock.json"],
  })}\n`);
  writeFloorPlanRouteNftFixture(root);
  symlinkSync("../../public/asset.txt", path.join(root, ".next/server/public-asset-link"));
  write(root, ".next/cache/excluded.txt", "mutable cache\n");
  write(root, ".next/dev/excluded.txt", "development output\n");
  write(root, ".next/diagnostics/excluded.txt", "diagnostics\n");
  write(root, ".next/trace/excluded.txt", "trace\n");
  write(root, "node_modules/.package-lock.json", "installed dependency identity\n");

  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "CH-0016 test"]);
  git(root, ["config", "user.email", "ch-0016@example.test"]);
  git(root, [
    "add",
    ".gitignore",
    ".nvmrc",
    "package.json",
    "package-lock.json",
    "scripts/production-artifact-contract.mjs",
    "scripts/production-artifact-evidence.mjs",
    "scripts/runtime-smoke-phase-budget.mjs",
    "scripts/runtime-smoke-failure-evidence.mjs",
    "scripts/runtime-smoke-operation-contracts.mjs",
    "scripts/runtime-smoke-operation-deadline.mjs",
    "scripts/runtime-smoke-telemetry-bootstrap-contract.mjs",
    "scripts/required-test-truthfulness.mjs",
    "scripts/required-test-manifest.json",
    "scripts/test-production-archive-plan-evidence.mjs",
    "scripts/test-production-trace-archive-policy.mjs",
    ...PRODUCTION_EVIDENCE_VERIFIER_SOURCE_PATHS,
    "generated/runtime.ts",
    "public/asset.txt",
    "public/assets/floor-plans/preview.webp",
  ]);
  execFileSync("git", ["commit", "-qm", "fixture"], {
    cwd: root, env: { ...process.env, ...(commitDate ? {
      GIT_AUTHOR_DATE: commitDate, GIT_COMMITTER_DATE: commitDate,
    } : {}) },
  });

  const manifestPath = ".local/production-artifact-evidence/manifest.json";
  const reportPath = ".local/production-artifact-evidence/runtime-smoke.json";
  const phaseTimingPath = ".local/production-artifact-evidence/runtime-smoke-phases.json";
  const environment = {
      CERTIFICATION_QUALIFICATION_MODE: "1",
      APP_ENV: "staging",
      NEXT_PUBLIC_APP_ENV: "staging",
      NODE_ENV: "production",
      CATALOG_STRICT_VALIDATION: "true",
      DATABASE_URL:
        "postgresql://test:f2a6c0e4b8d19357f2a6c0e4b8d19357@localhost:5432/evidence_fixture",
      OPENAI_API_KEY: "fixture-openai-placeholder",
      SHOPIFY_STORE_DOMAIN: "fixture.myshopify.example",
      SHOPIFY_STOREFRONT_TOKEN: "fixture-shopify-placeholder",
      POSTHOG_KEY: "fixture-posthog-placeholder",
      STRIPE_SECRET_KEY: "sk_test_fixture_placeholder",
      STRIPE_WEBHOOK_SECRET: "whsec_fixture_placeholder",
      STRIPE_PRICE_PRO_MONTHLY: "price_fixture_monthly",
      STRIPE_PRICE_PRO_YEARLY: "price_fixture_yearly",
      AUTH_SECRET: "fixture-auth-secret-at-least-32-characters",
      GOOGLE_CLIENT_ID: "fixture.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-fixture-placeholder",
      APP_ORIGIN: "http://127.0.0.1:3000",
      ADMIN_EMAILS: "fixture-admin@example.test",
      ...environmentOverrides,
  };
  const toolchain = { nodeVersion: process.version, npmVersion: "11.6.2" };
  const clock = deterministicClock([
    "2026-07-31T00:00:00.000Z",
    "2026-07-31T00:00:00.100Z",
    "2026-07-31T00:00:00.200Z",
    "2026-07-31T00:00:01.000Z",
    "2026-07-31T00:00:01.100Z",
    "2026-07-31T00:00:02.000Z",
    "2026-07-31T00:00:03.000Z",
    "2026-07-31T00:00:04.000Z",
    "2026-07-31T00:00:04.100Z",
    "2026-07-31T00:00:04.200Z",
    "2026-07-31T00:00:04.300Z",
  ]);
  const source = {
    commitSha: git(root, ["rev-parse", "HEAD"]),
    treeSha: git(root, ["rev-parse", "HEAD^{tree}"]),
  };
  const journal = await initializeProductionEvidenceSemanticJournal({
    repositoryRoot: root,
    candidateIdentifier: "ch-0016-fixture",
    source,
    buildContract: { applicationEnvironment: "staging", catalogStrictValidation: true },
    toolchain,
    clock,
  });
  for (const action of ["install", "generatedSourceCheck", "build"]) {
    executeProductionEvidenceChild({
      repositoryRoot: root,
      expectedRunNonce: journal.runNonce,
      action,
      dispatch: () => ({ status: 0 }),
      clock,
    });
  }
  const { manifest } = await recoverProductionEvidenceFromSemanticJournal({
    repositoryRoot: root,
    manifestPath,
    expectedRunNonce: journal.runNonce,
    environment,
    toolchain,
    clock,
    manifestFactory,
  });
  assert.equal(manifest.schema, "interior-ai.production-artifact-evidence.v3");
  assert.equal(manifest.validatorVersion, 3);
  assert.equal(manifest.execution.runNonce, journal.runNonce);
  assert.equal(manifest.source.treeSha, source.treeSha);
  assert.ok(
    Date.parse(manifest.build.wrapperStartedAt) <
      Date.parse(manifest.generatedSourceCheck.startedAt),
    "wrapper start may truthfully precede the generated-source check",
  );
  assert.ok(
    Date.parse(manifest.generatedSourceCheck.completedAt) <=
      Date.parse(manifest.build.startedAt),
    "generated-source verification must complete before actual build dispatch",
  );
  if (!recordRuntimeTest) {
    return { root, manifestPath, reportPath, phaseTimingPath };
  }
  const telemetryEvidence = [1, 2, 3, 4].map((generation, index) => {
    const queuedAtActivation = index === 0 ? 0 : index + 1;
    return createRuntimeSmokeTelemetryBootstrapEvidence({
      phaseName: index === 0 ? "initial-document" : `reload-${index}`,
      expectedCollectorActivationGeneration: generation,
      expectedReadyModelCount: 8,
      observedReadyModelCount: 8,
      telemetry: {
        schema: "interior-ai.glb-main-thread-telemetry.v2",
        snapshotHookPresent: true,
        collectorImportState: "active",
        collectorActivationMode:
          queuedAtActivation === 0
            ? "direct-empty-bootstrap"
            : "hydrated-bootstrap",
        collectorActivationGeneration: generation,
        bootstrapRecordsQueuedAtActivation: queuedAtActivation,
        bootstrapEventsFlushed: queuedAtActivation,
        bootstrapFlushCompleted: true,
        directModeActive: true,
        directTelemetryObserved: true,
        timingCount: 6,
        counters: {
          lifecycleTransitions: 8,
          diagnosticStoreUpdates: 8,
          reactRenders: 2,
          sceneAttachments: 8,
          rendererCalls: 12,
        },
      },
    });
  });
  const report = {
    config: {
      configFile: path.join(root, "playwright.config.ts"),
      rootDir: path.join(root, "tests/e2e"),
      forbidOnly: true,
      grep: {},
      grepInvert: null,
      shard: null,
      projects: [
        {
          name: "chromium",
          retries: 0,
          repeatEach: 1,
          outputDir: path.join(root, ".local/production-artifact-evidence/playwright-output"),
          testDir: path.join(root, "tests/e2e"),
          snapshotDir: null,
        },
      ],
      webServer: {
        command: PRODUCTION_EVIDENCE_SERVER_COMMAND,
        url: "http://127.0.0.1:3000",
        reuseExistingServer: false,
      },
      metadata: {
        productionArtifactEvidence: {
          schema: PRODUCTION_EVIDENCE_SCHEMA,
          sourceCommitSha: manifest.source.commitSha,
          artifactSha256: manifest.artifact.sha256,
          nextBuildId: manifest.build.nextBuildId,
          serverCommand: PRODUCTION_EVIDENCE_SERVER_COMMAND,
          buildMode: "production",
        },
      },
    },
    suites: [
      {
        title: "00-runtime-smoke.spec.ts",
        file: "00-runtime-smoke.spec.ts",
        specs: [
          {
            title: "furnished template remains stable without a render loop",
            file: "00-runtime-smoke.spec.ts",
            ok: true,
            tests: [
              {
                projectId: "chromium",
                projectName: "chromium",
                status: "expected",
                annotations: [],
                results: [{
                  status: "passed",
                  retry: 0,
                  annotations: [],
                  attachments: telemetryEvidence.map((evidence) => ({
                    name: RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_ATTACHMENT,
                    contentType: "application/json",
                    body: Buffer.from(JSON.stringify(evidence)).toString("base64"),
                  })),
                }],
              },
            ],
          },
          {
            title: "health and catalog endpoints report ready",
            file: "00-runtime-smoke.spec.ts",
            ok: true,
            tests: [
              {
                projectId: "chromium",
                projectName: "chromium",
                status: "expected",
                annotations: [],
                results: [{ status: "passed", retry: 0, annotations: [] }],
              },
            ],
          },
        ],
      },
    ],
    errors: [],
    runtimeSmokeFailure: null,
    stats: {
      startTime: "2026-07-31T00:00:04.500Z",
      duration: 400,
      expected: 2,
      skipped: 0,
      unexpected: 0,
      flaky: 0,
    },
  };
  write(root, reportPath, `${JSON.stringify(report, null, 2)}\n`);
  write(
    root,
    phaseTimingPath,
    `${JSON.stringify({
      schema: RUNTIME_SMOKE_PHASE_TIMING_SCHEMA,
      testIdentity: "runtime.template-stability",
      wholeTestTimeoutMs: RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS,
      sequentialPhaseBudgetMs: sequentialRuntimeSmokeBudgetMs,
      overheadBudgets: RUNTIME_SMOKE_OVERHEAD_BUDGETS,
      phaseBudgets: RUNTIME_SMOKE_PHASE_BUDGETS,
      phases: RUNTIME_SMOKE_PHASE_BUDGETS.map((phase, index) => ({
        name: phase.name,
        startTimeRelativeMs: index * 10,
        elapsedMs: 10,
        outcome: "passed",
        timeoutBudgetMs: phase.timeoutMs,
        performanceWarningThresholdMs:
          FURNISHED_TEMPLATE_PHASE_CONTRACTS[phase.name]
            ?.performanceWarningThresholdMs ?? null,
        performanceWarningExceeded: false,
        finalLifecycleState: index < 5 ? "loading" : "stable",
        failure: null,
        progressCheckpoints: [
          {
            name: "phase-start",
            elapsedMs: 0,
            finalLifecycleState: index < 5 ? "loading" : "stable",
          },
          {
            name: "phase-complete",
            elapsedMs: 10,
            finalLifecycleState: index < 5 ? "loading" : "stable",
          },
        ],
      })),
      failure: null,
      complete: true,
    }, null, 2)}\n`,
  );
  canonicalizeProductionEvidenceReport(root, reportPath);
  const canonicalReport = readFileSync(path.join(root, reportPath), "utf8");
  assert.equal(canonicalReport.includes(root), false);
  assert.match(canonicalReport, /<repository-root>/);
  await recordProductionEvidenceTest({
    repositoryRoot: root,
    manifestPath,
    reportPath,
    phaseTimingPath,
    name: "runtime-smoke",
    command: "npx playwright test tests/e2e/00-runtime-smoke.spec.ts --project=chromium",
    processExitCode: 0,
    completedAt: "2026-07-31T00:00:05.000Z",
  });
  return { root, manifestPath, reportPath, phaseTimingPath };
}

function readManifest(root, manifestPath) {
  return JSON.parse(readFileSync(path.join(root, manifestPath), "utf8"));
}

function createStagedArchiveTree(context) {
  const stagedRoot = mkdtempSync(
    path.join(tmpdir(), "ch-0015i-staged-archive-preflight-"),
  );
  for (const relativePath of [
    ".next",
    "public",
    ".nvmrc",
    "package.json",
    "package-lock.json",
    ...PRODUCTION_EVIDENCE_VERIFIER_SOURCE_PATHS,
    context.manifestPath,
    `${context.manifestPath}.sha256`,
    ".local/production-artifact-evidence/semantic-event-journal.json",
    ".local/production-artifact-evidence/artifact-inventory.json",
    ...(existsSync(path.join(context.root, context.reportPath))
      ? [context.reportPath]
      : []),
    ...(existsSync(path.join(context.root, context.phaseTimingPath))
      ? [context.phaseTimingPath]
      : []),
  ]) {
    const sourcePath = path.join(context.root, relativePath);
    const destinationPath = path.join(stagedRoot, relativePath);
    mkdirSync(path.dirname(destinationPath), { recursive: true });
    cpSync(sourcePath, destinationPath, {
      recursive: true,
      dereference: false,
      preserveTimestamps: false,
      verbatimSymlinks: true,
    });
  }
  return stagedRoot;
}

function cloneStagedArchiveTree(stagedRoot) {
  const cloneRoot = mkdtempSync(
    path.join(tmpdir(), "ch-0015i-staged-archive-clone-"),
  );
  cpSync(stagedRoot, cloneRoot, {
    recursive: true,
    dereference: false,
    preserveTimestamps: false,
    verbatimSymlinks: true,
  });
  return cloneRoot;
}

function verifierSourceClosureSha256(root) {
  const digestInput = PRODUCTION_EVIDENCE_VERIFIER_SOURCE_PATHS.map(
    (relativePath) => {
      const bytes = readFileSync(path.join(root, relativePath));
      return `${createHash("sha256").update(bytes).digest("hex")}  ${bytes.byteLength}  ${relativePath}\n`;
    },
  ).join("");
  return createHash("sha256").update(digestInput).digest("hex");
}

function archivePreflightEnvironment(manifest, stagedRoot, overrides = {}) {
  const expectedVerifierSourceClosureSha256 =
    overrides.PRODUCTION_EVIDENCE_EXPECTED_VERIFIER_SOURCE_CLOSURE_SHA256 ??
    verifierSourceClosureSha256(stagedRoot);
  return {
    ...process.env,
    PRODUCTION_EVIDENCE_EXPECTED_CANDIDATE_ID: manifest.candidateIdentifier,
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: manifest.source.commitSha,
    PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: manifest.source.treeSha,
    PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: manifest.build.nextBuildId,
    PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256: manifest.artifact.sha256,
    PRODUCTION_EVIDENCE_EXPECTED_VERIFIER_SOURCE_CLOSURE_SHA256:
      expectedVerifierSourceClosureSha256,
    ...overrides,
  };
}

function runStagedVerifier(
  stagedRoot,
  command,
  expectedManifest = readManifest(
    stagedRoot,
    ".local/production-artifact-evidence/manifest.json",
  ),
  environmentOverrides = {},
) {
  const entryPoint = realpathSync(
    path.join(stagedRoot, "scripts/production-artifact-evidence.mjs"),
  );
  return spawnSync(process.execPath, [entryPoint, command], {
    cwd: stagedRoot,
    env: archivePreflightEnvironment(
      expectedManifest,
      stagedRoot,
      environmentOverrides,
    ),
    encoding: "utf8",
  });
}

function readStagedJson(stagedRoot, relativePath) {
  return JSON.parse(readFileSync(path.join(stagedRoot, relativePath), "utf8"));
}

function writeStagedJson(stagedRoot, relativePath, value) {
  writeFileSync(
    path.join(stagedRoot, relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

async function rewriteStagedManifest(stagedRoot, mutate) {
  const manifestPath = ".local/production-artifact-evidence/manifest.json";
  const manifest = readManifest(stagedRoot, manifestPath);
  mutate(manifest);
  await writeProductionEvidenceManifest({
    repositoryRoot: stagedRoot,
    manifestPath,
    manifest,
  });
}

async function rewriteManifest(root, manifestPath, mutate) {
  const manifest = readManifest(root, manifestPath);
  mutate(manifest);
  await writeProductionEvidenceManifest({ repositoryRoot: root, manifestPath, manifest });
}

async function rewritePhaseTimings(context, mutate) {
  const absolutePath = path.join(context.root, context.phaseTimingPath);
  const timing = JSON.parse(readFileSync(absolutePath, "utf8"));
  mutate(timing);
  const bytes = Buffer.from(`${JSON.stringify(timing, null, 2)}\n`);
  writeFileSync(absolutePath, bytes);
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].phaseTimings.sha256 = createHash("sha256").update(bytes).digest("hex");
  });
}

function playwrightContractEnvironment(context, overrides = {}) {
  const manifestBytes = readFileSync(path.join(context.root, context.manifestPath));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  return {
    CERTIFICATION_QUALIFICATION_MODE: "1",
    APP_ENV: manifest.build.applicationEnvironment,
    NEXT_PUBLIC_APP_ENV: manifest.build.applicationEnvironment,
    VERCEL_ENV: "",
    PRODUCTION_EVIDENCE_JOURNAL_PATH:
      ".local/production-artifact-evidence/semantic-event-journal.json",
    PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256: createHash("sha256")
      .update(manifestBytes)
      .digest("hex"),
    PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: manifest.build.nextBuildId,
    PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256: manifest.artifact.sha256,
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: manifest.source.commitSha,
    PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: manifest.source.treeSha,
    ...overrides,
  };
}

function validatePlaywrightContractMutation(context, { mutateManifest, mutateJournal, mutateExpected } = {}) {
  const manifest = readManifest(context.root, context.manifestPath);
  const journal = JSON.parse(
    readFileSync(
      path.join(
        context.root,
        ".local/production-artifact-evidence/semantic-event-journal.json",
      ),
      "utf8",
    ),
  );
  const environment = playwrightContractEnvironment(context);
  const expectedIdentity = {
    sourceCommitSha: environment.PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA,
    sourceTreeSha: environment.PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA,
    nextBuildId: environment.PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID,
    artifactSha256: environment.PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256,
  };
  mutateManifest?.(manifest);
  mutateJournal?.(journal);
  mutateExpected?.(expectedIdentity);
  return validateCurrentProductionEvidenceManifest({
    manifest,
    semanticJournal: journal,
    expectedIdentity,
    requirePendingTests: true,
  });
}

function listedSpecCount(suites) {
  return suites.reduce(
    (total, suite) =>
      total + (suite.specs?.length ?? 0) + listedSpecCount(suite.suites ?? []),
    0,
  );
}

{
  const repositoryRoot = mkdtempSync(
    path.join(tmpdir(), "ch-0015i-report-path-repository-"),
  );
  const externalRoot = mkdtempSync(
    path.join(tmpdir(), "ch-0015i-report-path-external-"),
  );
  const outsideRoot = mkdtempSync(
    path.join(tmpdir(), "ch-0015i-report-path-outside-"),
  );
  const repositoryReportParent = path.join(
    repositoryRoot,
    ".local/production-artifact-evidence",
  );
  const externalReportParent = path.join(externalRoot, "playwright");
  const outsideReportParent = path.join(outsideRoot, "playwright");
  let unwritableParent = null;
  try {
    mkdirSync(repositoryReportParent, { recursive: true });
    mkdirSync(externalReportParent, { recursive: true });
    mkdirSync(outsideReportParent, { recursive: true });

    const relativeReportPath =
      ".local/production-artifact-evidence/playwright-list.json";
    const relative = resolvePlaywrightReportPath({
      requestedPath: relativeReportPath,
      repositoryRoot,
      additionalRepositoryRoots: [process.cwd()],
    });
    assert.equal(relative.destinationClass, "repository-relative");
    assert.equal(
      relative.outputPath,
      path.join(repositoryRoot, relativeReportPath),
    );
    assert.equal(relative.displayPath, relativeReportPath);

    const externalReportPath = path.join(
      externalReportParent,
      "playwright-list.json",
    );
    const external = resolvePlaywrightReportPath({
      requestedPath: externalReportPath,
      repositoryRoot,
      authorizedExternalRoot: externalRoot,
      additionalRepositoryRoots: [process.cwd()],
    });
    assert.equal(external.destinationClass, "external-evidence-root");
    assert.equal(external.outputPath, externalReportPath);
    assert.equal(external.displayPath, "<external-evidence-root>");
    assert.equal(
      resolvePlaywrightReportPath({
        requestedPath: path.join(externalReportParent, "trailing-root.json"),
        repositoryRoot,
        authorizedExternalRoot: `${externalRoot}${path.sep}`,
      }).destinationClass,
      "external-evidence-root",
    );
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: `${externalReportPath}${path.sep}`,
          repositoryRoot,
          authorizedExternalRoot: externalRoot,
        }),
      /malformed/,
    );

    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: path.join(repositoryReportParent, "inside-worktree.json"),
          repositoryRoot,
          authorizedExternalRoot: repositoryRoot,
          additionalRepositoryRoots: [process.cwd()],
        }),
      /repository worktree/,
    );
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: path.join(
            process.cwd(),
            "scripts/inside-canonical-repository.json",
          ),
          repositoryRoot,
          authorizedExternalRoot: process.cwd(),
          additionalRepositoryRoots: [process.cwd()],
        }),
      /repository worktree/,
    );
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: path.join(outsideReportParent, "outside-root.json"),
          repositoryRoot,
          authorizedExternalRoot: externalRoot,
          additionalRepositoryRoots: [process.cwd()],
        }),
      /beneath the authorized external evidence root/,
    );
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath:
            ".local/production-artifact-evidence/../../traversal.json",
          repositoryRoot,
        }),
      /normalized/,
    );
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: `${externalReportPath}\0synthetic-secret`,
          repositoryRoot,
          authorizedExternalRoot: externalRoot,
        }),
      /malformed/,
    );
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: externalReportPath,
          repositoryRoot,
        }),
      /root is required/,
    );
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: externalReportPath,
          repositoryRoot,
          authorizedExternalRoot: "relative-evidence-root",
        }),
      /root must be absolute/,
    );
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: path.join(
            externalRoot,
            "missing-parent/report.json",
          ),
          repositoryRoot,
          authorizedExternalRoot: externalRoot,
        }),
      /parent directory must already exist/,
    );

    unwritableParent = path.join(externalRoot, "unwritable");
    mkdirSync(unwritableParent);
    chmodSync(unwritableParent, 0o500);
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: path.join(unwritableParent, "report.json"),
          repositoryRoot,
          authorizedExternalRoot: externalRoot,
        }),
      /parent directory is not writable/,
    );
    chmodSync(unwritableParent, 0o700);
    unwritableParent = null;

    const existingTarget = path.join(externalReportParent, "existing.json");
    writeFileSync(existingTarget, "{}\n");
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: existingTarget,
          repositoryRoot,
          authorizedExternalRoot: externalRoot,
        }),
      /must not already exist/,
    );
    const directoryTarget = path.join(externalReportParent, "directory.json");
    mkdirSync(directoryTarget);
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: directoryTarget,
          repositoryRoot,
          authorizedExternalRoot: externalRoot,
        }),
      /cannot be a directory/,
    );

    const repositoryParentLink = path.join(externalRoot, "repository-parent");
    symlinkSync(repositoryReportParent, repositoryParentLink);
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: path.join(repositoryParentLink, "symlink-report.json"),
          repositoryRoot,
          authorizedExternalRoot: externalRoot,
        }),
      /escapes the authorized external evidence root|repository worktree/,
    );
    const outsideParentLink = path.join(externalRoot, "outside-parent");
    symlinkSync(outsideReportParent, outsideParentLink);
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: path.join(outsideParentLink, "escaped-report.json"),
          repositoryRoot,
          authorizedExternalRoot: externalRoot,
        }),
      /escapes the authorized external evidence root/,
    );
    const externalRootLink = path.join(outsideRoot, "external-root-link");
    symlinkSync(externalRoot, externalRootLink);
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: path.join(
            externalRootLink,
            "playwright/symlink-root-report.json",
          ),
          repositoryRoot,
          authorizedExternalRoot: externalRootLink,
        }),
      /root must be a directory|root cannot be a symlink/,
    );

    for (const malformedPath of [undefined, null, "", "report.txt"]) {
      assert.throws(
        () =>
          resolvePlaywrightReportPath({
            requestedPath: malformedPath,
            repositoryRoot,
          }),
        /required|JSON file/,
      );
    }
    assert.throws(
      () =>
        resolvePlaywrightReportPath({
          requestedPath: relativeReportPath,
          repositoryRoot,
          pathPolicy: "unknown-report-policy",
        }),
      /Unknown Playwright report destination policy/,
    );

    const syntheticCredential = "synthetic-report-path-secret-never-print";
    let safeError;
    try {
      resolvePlaywrightReportPath({
        requestedPath: externalReportPath,
        repositoryRoot,
        authorizedExternalRoot: path.join(externalRoot, syntheticCredential),
      });
    } catch (error) {
      safeError = error;
    }
    assert.ok(safeError);
    assert.doesNotMatch(String(safeError), new RegExp(syntheticCredential));
  } finally {
    if (unwritableParent) chmodSync(unwritableParent, 0o700);
    rmSync(repositoryRoot, { recursive: true, force: true });
    rmSync(externalRoot, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  }
}

function runtimeReportCanonicalizationFixture(nextBuildId = "runtime-portable-build") {
  const repositoryRoot = process.cwd();
  const externalRoot = mkdtempSync(
    path.join(tmpdir(), "runtime-report-canonicalization-"),
  );
  const outsideRoot = mkdtempSync(
    path.join(tmpdir(), "runtime-report-canonicalization-outside-"),
  );
  const runtimeRoot = path.join(externalRoot, "runtime-smoke");
  mkdirSync(runtimeRoot);
  const reportPath = path.join(runtimeRoot, "playwright-report.json");
  const markerPath = path.join(runtimeRoot, "product-test-start.json");
  const environment = {
    PRODUCTION_CERTIFICATION_ID: "CERT-runtime-portable-fixture",
    PRODUCTION_EVIDENCE_CANDIDATE_ID: "CANDIDATE-runtime-portable-fixture",
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: "1".repeat(40),
    PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: "2".repeat(40),
    PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: nextBuildId,
    PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256: "3".repeat(64),
    PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256: "4".repeat(64),
    PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_SHA256: "5".repeat(64),
    PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE:
      "12345678-1234-4123-8123-123456789abc",
    CERTIFICATION_RUNTIME_STAGE_ATTEMPT: "1",
  };
  authorizeRuntimeSmokeReportPath({
    requestedPath: reportPath,
    repositoryRoot,
    authorizedExternalRoot: externalRoot,
    environment,
  });
  writeFileSync(
    markerPath,
    `${JSON.stringify({
      schema: "interior-ai.production-certification-playwright-start.v1",
      boundary: "test-begin",
      gateId: "ci.production-runtime-smoke",
      project: "chromium",
      title: "furnished template remains stable without a render loop",
      retry: 0,
    }, null, 2)}\n`,
  );
  const report = {
    config: {
      configFile: path.join(repositoryRoot, "playwright.config.ts"),
      rootDir: path.join(repositoryRoot, "tests/e2e"),
      forbidOnly: true,
      projects: [
        {
          name: "chromium",
          retries: 0,
          repeatEach: 1,
          outputDir: path.join(
            repositoryRoot,
            ".local/production-artifact-evidence/playwright-output",
          ),
          testDir: path.join(repositoryRoot, "tests/e2e"),
          snapshotDir: null,
        },
      ],
      reporter: [
        ["list", null],
        ["json", { outputFile: reportPath }],
        [
          path.join(
            repositoryRoot,
            "scripts/certification-playwright-start-reporter.mjs",
          ),
          {
            markerPath,
            boundary: "test-begin",
            gateId: "ci.production-runtime-smoke",
          },
        ],
      ],
      webServer: {
        command: PRODUCTION_EVIDENCE_SERVER_COMMAND,
        url: "http://127.0.0.1:3000",
        reuseExistingServer: false,
      },
      metadata: {
        productionArtifactEvidence: {
          schema: PRODUCTION_EVIDENCE_SCHEMA,
          validatorVersion: PRODUCTION_EVIDENCE_VALIDATOR_VERSION,
          candidateIdentifier:
            environment.PRODUCTION_EVIDENCE_CANDIDATE_ID,
          sourceCommitSha:
            environment.PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA,
          sourceTreeSha: environment.PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA,
          artifactSha256:
            environment.PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256,
          nextBuildId: environment.PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID,
          semanticJournalSchema: PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
          semanticJournalVersion: PRODUCTION_EVIDENCE_JOURNAL_VERSION,
          runNonce:
            environment.PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE,
          serverCommand: PRODUCTION_EVIDENCE_SERVER_COMMAND,
          buildMode: "production",
        },
      },
    },
    suites: [
      {
        title: "00-runtime-smoke.spec.ts",
        file: "00-runtime-smoke.spec.ts",
        specs: [
          {
            title: "furnished template remains stable without a render loop",
            file: "00-runtime-smoke.spec.ts",
            ok: true,
            tests: [
              {
                projectId: "chromium",
                projectName: "chromium",
                status: "expected",
                annotations: [],
                results: [
                  {
                    status: "passed",
                    retry: 0,
                    annotations: [],
                    attachments: [],
                  },
                ],
              },
            ],
          },
          {
            title: "health and catalog endpoints report ready",
            file: "00-runtime-smoke.spec.ts",
            ok: true,
            tests: [
              {
                projectId: "chromium",
                projectName: "chromium",
                status: "expected",
                annotations: [],
                results: [
                  {
                    status: "passed",
                    retry: 0,
                    annotations: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    errors: [],
    stats: {
      startTime: "2026-08-22T17:51:15.942Z",
      duration: 73572.596,
      expected: 2,
      skipped: 0,
      unexpected: 0,
      flaky: 0,
    },
  };
  const writeReport = (value = report) => {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    writeFileSync(reportPath, bytes);
    return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
  };
  const raw = writeReport();
  const canonicalize = (options = {}) =>
    canonicalizeProductionEvidenceReport(
      repositoryRoot,
      reportPath,
      options.authorizedExternalRoot ?? externalRoot,
      {
        expectedRawReportSha256:
          options.expectedRawReportSha256 ??
          createHash("sha256").update(readFileSync(reportPath)).digest("hex"),
        reportAuthorizationEnvironment:
          options.environment ?? environment,
      },
    );
  return {
    repositoryRoot,
    externalRoot,
    outsideRoot,
    runtimeRoot,
    reportPath,
    markerPath,
    environment,
    report,
    raw,
    writeReport,
    canonicalize,
    cleanup() {
      rmSync(externalRoot, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    },
  };
}

// Physical report fixtures exercise authorization through portable evidence binding.
for (const nextBuildId of [
  "-HMijapRnjq-h9tldkjN0", "_jT2Js5lQ3W97uL42t3VQ",
  "v3Dmenpr6d_fsLQY9tQPM", "release-2026.09:build_42", "A", "_".repeat(128),
]) {
  const fixture = runtimeReportCanonicalizationFixture(nextBuildId);
  try {
    const ownerBytes = readFileSync(`${fixture.reportPath}.owner.json`);
    const portable = fixture.canonicalize({
      expectedRawReportSha256: fixture.raw.sha256,
    });
    assert.deepEqual(readFileSync(fixture.reportPath), fixture.raw.bytes);
    assert.equal(
      createHash("sha256").update(readFileSync(fixture.reportPath)).digest("hex"),
      fixture.raw.sha256,
    );
    assert.deepEqual(readFileSync(`${fixture.reportPath}.owner.json`), ownerBytes);
    assert.equal(
      portable.config.reporter[1][1].outputFile,
      "runtime-smoke/playwright-report.json",
    );
    assert.equal(
      portable.config.reporter[2][1].markerPath,
      "runtime-smoke/product-test-start.json",
    );
    assert.equal(JSON.stringify(portable).includes(fixture.externalRoot), false);
    assert.equal(portable.config.projects[0].retries, 0);
    assert.equal(portable.config.projects[0].repeatEach, 1);
    const rawReport = JSON.parse(readFileSync(fixture.reportPath, "utf8"));
    assert.equal(rawReport.config.reporter[1][1].outputFile, fixture.reportPath);
    assert.equal(rawReport.config.reporter[2][1].markerPath, fixture.markerPath);
    const truthfulness = validateRequiredTestReport({
      repositoryRoot: fixture.repositoryRoot,
      gateId: "ci.production-runtime-smoke",
      report: portable,
      processExitCode: 0,
      requireMetadata: false,
      validateRepository: false,
    });
    assert.deepEqual(truthfulness.issues, []);
    assert.equal(truthfulness.valid, true);
    const finalPortable = canonicalizeBoundRuntimeSmokeReport({
      repositoryRoot: fixture.repositoryRoot,
      reportPath: fixture.reportPath,
      markerPath: fixture.markerPath,
      authorizedExternalRoot: fixture.externalRoot,
      expectedRawReportSha256: fixture.raw.sha256,
      reportAuthorizationEnvironment: fixture.environment,
    });
    assert.deepEqual(finalPortable, portable);
    assert.equal(JSON.parse(ownerBytes).buildId, nextBuildId);
    assert.equal(finalPortable.config.metadata.productionArtifactEvidence.nextBuildId, nextBuildId);

    for (const environmentMutation of [
      { PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: "foreign-build" },
      { PRODUCTION_CERTIFICATION_ID: "CERT-foreign" },
      { PRODUCTION_EVIDENCE_CANDIDATE_ID: "CANDIDATE-foreign" },
      {
        PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE:
          "87654321-4321-4321-8321-cba987654321",
      },
      { CERTIFICATION_RUNTIME_STAGE_ATTEMPT: "2" },
    ]) {
      assert.throws(
        () =>
          fixture.canonicalize({
            expectedRawReportSha256: fixture.raw.sha256,
            environment: { ...fixture.environment, ...environmentMutation },
          }),
        /owned by another certification, candidate, run, attempt, path, or evidence root/,
      );
    }
    assert.throws(
      () =>
        fixture.canonicalize({
          expectedRawReportSha256: "0".repeat(64),
        }),
      /raw Playwright report SHA-256/,
    );
    const foreignRoot = mkdtempSync(
      path.join(tmpdir(), "runtime-report-canonicalization-foreign-"),
    );
    try {
      assert.throws(
        () => fixture.canonicalize({ authorizedExternalRoot: foreignRoot }),
        /escapes its authorized root|outside every repository worktree/,
      );
    } finally {
      rmSync(foreignRoot, { recursive: true, force: true });
    }
  } finally {
    fixture.cleanup();
  }
}

for (const mutation of [
  {
    name: "outside-root outputFile",
    apply: (fixture, report) => {
      report.config.reporter[1][1].outputFile = path.join(
        fixture.outsideRoot,
        "playwright-report.json",
      );
    },
    expected: /exact bound raw report|escapes the authorized external evidence root/,
  },
  {
    name: "traversal markerPath",
    apply: (fixture, report) => {
      report.config.reporter[2][1].markerPath =
        `${fixture.runtimeRoot}${path.sep}nested${path.sep}..${path.sep}` +
        "product-test-start.json";
    },
    expected:
      /exact bound start marker|normalized absolute path|explicit ownership contract/,
  },
  {
    name: "arbitrary absolute path",
    apply: (fixture, report) => {
      report.config.metadata.unownedPath = path.join(
        fixture.outsideRoot,
        "arbitrary.json",
      );
    },
    expected: /absolute paths outside its explicit ownership contract/,
  },
  {
    name: "unowned external-root path",
    apply: (fixture, report) => {
      report.config.metadata.unownedExternalPath = path.join(
        fixture.externalRoot,
        "unowned.json",
      );
    },
    expected: /absolute paths outside its explicit ownership contract/,
  },
  {
    name: "repository-prefix sibling path",
    apply: (fixture, report) => {
      report.config.metadata.repositoryPrefixSiblingPath =
        `${fixture.repositoryRoot}-foreign${path.sep}secret.json`;
    },
    expected: /absolute paths outside its explicit ownership contract/,
  },
  {
    name: "repository-root traversal path",
    apply: (fixture, report) => {
      report.config.metadata.repositoryTraversalPath =
        `${fixture.repositoryRoot}${path.sep}..${path.sep}foreign` +
        `${path.sep}secret.json`;
    },
    expected: /absolute paths outside its explicit ownership contract/,
  },
  {
    name: "embedded repository-prefix sibling path",
    apply: (fixture, report) => {
      report.config.metadata.embeddedRepositoryPrefixSibling =
        `error: ${fixture.repositoryRoot}-foreign${path.sep}secret.json`;
    },
    expected: /retains a raw machine-local root/,
  },
  {
    name: "embedded repository traversal path",
    apply: (fixture, report) => {
      report.config.metadata.embeddedRepositoryTraversal =
        `error: ${fixture.repositoryRoot}${path.sep}nested${path.sep}` +
        `..${path.sep}..${path.sep}foreign${path.sep}secret.json`;
    },
    expected: /retains a raw machine-local root/,
  },
]) {
  const fixture = runtimeReportCanonicalizationFixture();
  try {
    const report = structuredClone(fixture.report);
    mutation.apply(fixture, report);
    const raw = fixture.writeReport(report);
    assert.throws(
      () => fixture.canonicalize({ expectedRawReportSha256: raw.sha256 }),
      mutation.expected,
      mutation.name,
    );
  } finally {
    fixture.cleanup();
  }
}

{
  const fixture = runtimeReportCanonicalizationFixture();
  try {
    rmSync(fixture.markerPath);
    assert.throws(
      () => fixture.canonicalize({ expectedRawReportSha256: fixture.raw.sha256 }),
      /missing/,
    );
  } finally {
    fixture.cleanup();
  }
}

{
  const fixture = runtimeReportCanonicalizationFixture();
  try {
    const outsideMarker = path.join(fixture.outsideRoot, "product-test-start.json");
    writeFileSync(outsideMarker, "{}\n");
    rmSync(fixture.markerPath);
    symlinkSync(outsideMarker, fixture.markerPath);
    assert.throws(
      () => fixture.canonicalize({ expectedRawReportSha256: fixture.raw.sha256 }),
      /physical file|escapes its authorized root/,
    );
  } finally {
    fixture.cleanup();
  }
}

{
  const context = await fixture({ recordRuntimeTest: false });
  assert.deepEqual(CURRENT_PRODUCTION_EVIDENCE_VERSIONS, [3]);
  assert.equal(PRODUCTION_EVIDENCE_VALIDATOR_VERSION, 3);
  const accepted = validatePlaywrightContractMutation(context);
  assert.deepEqual(accepted.issues, []);
  assert.equal(accepted.valid, true, "valid current v3 manifest must be accepted");

  const negativeCases = [
    [
      "unknown schema",
      { mutateManifest: (manifest) => { manifest.schema = "unknown.production-evidence.v3"; } },
      "unsupported production evidence schema or validator version",
    ],
    [
      "unknown future version",
      { mutateManifest: (manifest) => { manifest.validatorVersion = 4; } },
      "unsupported production evidence schema or validator version",
    ],
    [
      "historical v2 current-certification manifest",
      { mutateManifest: (manifest) => {
        manifest.schema = "interior-ai.production-artifact-evidence.v2";
        manifest.validatorVersion = 2;
      } },
      "unsupported production evidence schema or validator version",
    ],
    [
      "secret-bearing manifest field",
      { mutateManifest: (manifest) => { manifest.authSecret = "synthetic-never-print"; } },
      "manifest contains prohibited secret-bearing fields",
    ],
    [
      "filesystem timestamp semantic field",
      { mutateManifest: (manifest) => { manifest.build.mtime = manifest.build.completedAt; } },
      "filesystem timestamps cannot populate portable semantic evidence",
    ],
    [
      "wrong journal schema/version",
      { mutateJournal: (journal) => {
        journal.schema = "interior-ai.production-artifact-semantic-event-journal.v1";
        journal.version = 1;
      } },
      "unsupported semantic event journal schema or version",
    ],
    [
      "unknown journal schema",
      { mutateJournal: (journal) => {
        journal.schema = "interior-ai.production-artifact-semantic-event-journal.unknown";
      } },
      "unsupported semantic event journal schema or version",
    ],
    [
      "future journal version",
      { mutateJournal: (journal) => { journal.version = 3; } },
      "unsupported semantic event journal schema or version",
    ],
    [
      "missing journal version",
      { mutateJournal: (journal) => { delete journal.version; } },
      "semantic event journal shape is malformed",
    ],
    [
      "malformed journal version",
      { mutateJournal: (journal) => { journal.version = "2"; } },
      "unsupported semantic event journal schema or version",
    ],
    [
      "missing journal-v2 worktree binding",
      { mutateJournal: (journal) => {
        delete journal.owner.worktreeIdentitySha256;
      } },
      "semantic event journal owner binding is malformed",
    ],
    [
      "coherently bound handoff with unknown fields",
      {
        mutateManifest: (manifest) => {
          const from = structuredClone(manifest.execution.owner.process);
          const to = { pid: from.pid + 100000, parentPid: from.pid };
          const handoff = {
            from,
            to,
            boundary: "post-dependency-install-pre-generated-source",
            completedAt: manifest.dependencies.installCompletedAt,
            unexpected: true,
          };
          manifest.execution.owner.process = to;
          manifest.execution.owner.processHandoffs = [handoff];
        },
        mutateJournal: (journal) => {
          const from = structuredClone(journal.owner.process);
          const to = { pid: from.pid + 100000, parentPid: from.pid };
          const handoff = {
            from,
            to,
            boundary: "post-dependency-install-pre-generated-source",
            completedAt: journal.events.dependencyInstall.completedAt,
            unexpected: true,
          };
          journal.owner.process = to;
          journal.owner.processHandoffs = [handoff];
        },
      },
      "semantic event journal owner binding is malformed",
    ],
    [
      "coherently bound out-of-order process handoff",
      {
        mutateManifest: (manifest) => {
          const from = structuredClone(manifest.execution.owner.process);
          const to = { pid: from.pid + 100001, parentPid: from.pid };
          const completedAt = new Date(
            Date.parse(manifest.dependencies.installStartedAt) - 1,
          ).toISOString();
          manifest.execution.owner.process = to;
          manifest.execution.owner.processHandoffs = [{
            from,
            to,
            boundary: "post-dependency-install-pre-generated-source",
            completedAt,
          }];
        },
        mutateJournal: (journal) => {
          const from = structuredClone(journal.owner.process);
          const to = { pid: from.pid + 100001, parentPid: from.pid };
          const completedAt = new Date(
            Date.parse(journal.events.dependencyInstall.startedAt) - 1,
          ).toISOString();
          journal.owner.process = to;
          journal.owner.processHandoffs = [{
            from,
            to,
            boundary: "post-dependency-install-pre-generated-source",
            completedAt,
          }];
        },
      },
      "semantic process handoff boundary is malformed or out of order",
    ],
    [
      "missing nonce",
      { mutateManifest: (manifest) => { delete manifest.execution.runNonce; } },
      "manifest semantic journal nonce, owner, or command binding is invalid",
    ],
    [
      "mismatched nonce",
      { mutateManifest: (manifest) => {
        manifest.execution.runNonce = "223e4567-e89b-42d3-a456-426614174000";
      } },
      "manifest semantic journal nonce, owner, or command binding is invalid",
    ],
    [
      "candidate commit mismatch",
      { mutateExpected: (expected) => { expected.sourceCommitSha = "f".repeat(40); } },
      "manifest source identity does not match canonical preflight",
    ],
    [
      "candidate tree mismatch",
      { mutateExpected: (expected) => { expected.sourceTreeSha = "f".repeat(40); } },
      "manifest source identity does not match canonical preflight",
    ],
    [
      "Build ID mismatch",
      { mutateExpected: (expected) => { expected.nextBuildId = "other-build"; } },
      "manifest Build ID does not match canonical preflight",
    ],
    [
      "artifact hash mismatch",
      { mutateExpected: (expected) => { expected.artifactSha256 = "f".repeat(64); } },
      "manifest artifact SHA-256 does not match canonical preflight",
    ],
    [
      "generated-source/build ordering invalid",
      { mutateJournal: (journal) => {
        journal.events.generatedSourceCheck.completedAt = new Date(
          Date.parse(journal.events.build.startedAt) + 1,
        ).toISOString();
      } },
      "semantic event journal buildStartedAt predates generatedSourceCheckCompletedAt",
    ],
    [
      "build failed/nonzero",
      { mutateJournal: (journal) => {
        journal.events.build.status = "failed";
        journal.events.build.exitCode = 17;
        journal.events.build.failureKind = "child_exit";
      } },
      "semantic event journal does not record a complete successful build",
    ],
    [
      "inventory incomplete",
      { mutateJournal: (journal) => { journal.events.artifactInventory.status = "running"; } },
      "semantic event journal does not record a complete successful build",
    ],
    [
      "manifest incomplete",
      { mutateJournal: (journal) => {
        journal.manifest.status = "pending";
        journal.manifest.createdAt = null;
        journal.completionState = "artifact_inventory_succeeded";
      } },
      "semantic event journal does not record manifest completion",
    ],
  ];
  for (const [name, mutation, expectedIssue] of negativeCases) {
    const rejected = validatePlaywrightContractMutation(context, mutation);
    assert.equal(rejected.valid, false, `${name} must fail closed`);
    assert.ok(
      rejected.issues.includes(expectedIssue),
      `${name} rejection must include ${expectedIssue}`,
    );
  }

  const load = (overrides = {}) =>
    loadProductionArtifactForPlaywright({
      repositoryRoot: context.root,
      manifestPath: context.manifestPath,
      reportPath: context.reportPath,
      useProductionServer: true,
      releaseBaseURL: "",
      environment:
        overrides.environment ?? playwrightContractEnvironment(context),
      ...overrides,
    });
  const canonicalPreflight = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    verificationMode:
      PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_PREFLIGHT,
    environment: playwrightContractEnvironment(context),
  });
  assert.deepEqual(canonicalPreflight.issues, []);
  const loaded = load();
  assert.deepEqual(loaded.identity, accepted.identity);
  const direct = await inspectDirectProductionIdentity({
    repositoryRoot: context.root, manifestPath: context.manifestPath,
    environment: playwrightContractEnvironment(context),
  });
  assert.equal(direct.executionMode, "production");
  assert.equal(direct.buildIdentity, loaded.identity.nextBuildId);
  assert.equal(direct.artifactSha256, loaded.identity.artifactSha256);
  assert.equal(direct.candidateTreeSha, loaded.identity.sourceTreeSha);
  const health = { build: direct.buildIdentity, productionArtifact: {
    kind: "local-production-mode-artifact", nextBuildId: direct.buildIdentity,
    artifactSha256: direct.artifactSha256, sourceCommitSha: direct.candidateCommitSha,
  } };
  assert.doesNotThrow(() => assertDirectRuntimeSmokeServer(direct, health));
  assert.throws(() => assertDirectRuntimeSmokeServer(direct, { ...health, build: "other" }), /does not match/);
  assert.throws(() => assertDirectRuntimeSmokeServer(direct, {}), /does not match/);
  assert.throws(() => assertDirectRuntimeSmokeServer(direct, {
    ...health, productionArtifact: { ...health.productionArtifact, artifactSha256: "f".repeat(64) },
  }), /does not match/);
  assert.equal(directRuntimeSmokeServerEnvironment(direct).PRODUCTION_ARTIFACT_BUILD_ID, direct.buildIdentity);
  const development = loadDirectRuntimeSmokeIdentity({
    repositoryRoot: context.root, useProductionServer: false,
  });
  assert.equal(development.executionMode, "development");
  assert.equal(development.buildIdentity, "next-development-server");
  assert.equal(development.artifactSha256, null);
  await assert.rejects(() => inspectDirectProductionIdentity({
    repositoryRoot: context.root, manifestPath: context.manifestPath,
    environment: { ...playwrightContractEnvironment(context), PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: "wrong" },
  }), /conflicts|rejected/);
  await assert.rejects(() => inspectDirectProductionIdentity({
    repositoryRoot: context.root, manifestPath: "missing.json",
  }), /rejected/);
  assert.equal(loaded.reportDestination.destinationClass, "repository-relative");
  assert.equal(
    loaded.reportDestination.outputPath,
    path.join(context.root, context.reportPath),
  );
  assert.throws(
    () => load({ reportPath: undefined }),
    /Production evidence report path is required/,
  );
  assert.throws(() => load({ manifestPath: "" }), /manifest path is required/);
  assert.throws(
    () => load({ useProductionServer: false }),
    /PLAYWRIGHT_USE_PRODUCTION_SERVER=1/,
  );
  assert.throws(
    () => load({ releaseBaseURL: "https:\/\/release.example.test" }),
    /cannot be presented as HTTPS deployment evidence/,
  );
  assert.throws(
    () => load({
      environment: playwrightContractEnvironment(context, {
        NEXT_PUBLIC_APP_ENV: "production",
      }),
    }),
    /environment identity is contradictory/,
  );

  const canonicalManifest = readManifest(context.root, context.manifestPath);
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    delete manifest.evidenceKind;
  });
  const rejectedByCanonicalValidator = spawnSync(
    process.execPath,
    [
      realpathSync(path.join(context.root, "scripts/production-artifact-evidence.mjs")),
      "verify-preflight",
    ],
    {
      cwd: context.root,
      env: {
        ...playwrightContractEnvironment(context),
        PRODUCTION_EVIDENCE_MANIFEST: context.manifestPath,
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(
    rejectedByCanonicalValidator.status,
    0,
    "the canonical validator must reject the divergence fixture",
  );
  assert.throws(
    () => load({ reportPath: undefined }),
    /canonical validation failed/,
    "invalid artifact schema must fail before report-path resolution",
  );
  await writeProductionEvidenceManifest({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    manifest: canonicalManifest,
  });

  const alternateJournalPath =
    ".local/production-artifact-evidence/alternate-semantic-event-journal.json";
  const alternateJournal = JSON.parse(
    readFileSync(
      path.join(
        context.root,
        ".local/production-artifact-evidence/semantic-event-journal.json",
      ),
      "utf8",
    ),
  );
  alternateJournal.noncanonicalField = true;
  writeFileSync(
    path.join(context.root, alternateJournalPath),
    `${JSON.stringify(alternateJournal, null, 2)}\n`,
  );
  assert.throws(
    () =>
      load({
        environment: playwrightContractEnvironment(context, {
          PRODUCTION_EVIDENCE_JOURNAL_PATH: alternateJournalPath,
        }),
      }),
    /semantic event journal path is not canonical/,
    "Playwright must not validate a different journal than canonical preflight",
  );

  const canonicalJournalPath = path.join(
    context.root,
    ".local/production-artifact-evidence/semantic-event-journal.json",
  );
  const canonicalJournalBytes = readFileSync(canonicalJournalPath);
  const noncanonicalJournal = JSON.parse(canonicalJournalBytes.toString("utf8"));
  noncanonicalJournal.owner.wrapper.version = 999;
  writeFileSync(canonicalJournalPath, `${JSON.stringify(noncanonicalJournal, null, 2)}\n`);
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.execution.owner.wrapper.version = 999;
  });
  assert.throws(
    () => load(),
    /canonical validation failed/,
    "matching but noncanonical wrapper fields must fail canonical validation",
  );
  writeFileSync(canonicalJournalPath, canonicalJournalBytes);
  await writeProductionEvidenceManifest({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    manifest: canonicalManifest,
  });

  const journalPath = path.join(
    context.root,
    ".local/production-artifact-evidence/semantic-event-journal.json",
  );
  const journalBytes = readFileSync(journalPath);
  rmSync(journalPath);
  assert.throws(() => load(), /canonical validation failed/);
  writeFileSync(journalPath, journalBytes);

  const manifestPath = path.join(context.root, context.manifestPath);
  const manifestBytes = readFileSync(manifestPath);
  const syntheticCredential = "synthetic-password-never-print";
  const safeMalformedEnvironment = playwrightContractEnvironment(context);
  writeFileSync(manifestPath, `{\"credential\":\"${syntheticCredential}\"`);
  let malformedError;
  try {
    load({
      environment: {
        ...safeMalformedEnvironment,
        DATABASE_URL: syntheticCredential,
      },
    });
  } catch (error) {
    malformedError = error;
  }
  assert.match(String(malformedError), /canonical validation failed/);
  assert.doesNotMatch(String(malformedError), new RegExp(syntheticCredential));
  writeFileSync(manifestPath, manifestBytes);

  const mainRepositoryRoot = process.cwd();
  const listReportPath = ".local/production-artifact-evidence/playwright-list.json";
  const configEnvironment = {
    ...process.env,
    ...playwrightContractEnvironment(context),
    CI: "true",
    NODE_ENV: "production",
    PLAYWRIGHT_USE_PRODUCTION_SERVER: "1",
    PRODUCTION_EVIDENCE_MANIFEST: context.manifestPath,
    PLAYWRIGHT_JSON_OUTPUT_FILE: listReportPath,
    PLAYWRIGHT_RELEASE_BASE_URL: "",
    REQUIRED_TEST_GATE_ID: "",
    REQUIRED_TEST_REPORT_PATH: "",
  };
  execFileSync(
    process.execPath,
    [
        path.join(mainRepositoryRoot, "node_modules/@playwright/test/cli.js"),
        "test",
        "tests/e2e/00-runtime-smoke.spec.ts",
        "--config",
        path.join(mainRepositoryRoot, "playwright.config.ts"),
        "--project=chromium",
        "--list",
        "--reporter=json",
    ],
    { cwd: context.root, env: configEnvironment, encoding: "utf8" },
  );
  const report = JSON.parse(readFileSync(path.join(context.root, listReportPath), "utf8"));
  const identity = report.config.metadata.productionArtifactEvidence;
  assert.equal(identity.schema, PRODUCTION_EVIDENCE_SCHEMA);
  assert.equal(identity.validatorVersion, PRODUCTION_EVIDENCE_VALIDATOR_VERSION);
  assert.equal(identity.sourceCommitSha, accepted.identity.sourceCommitSha);
  assert.equal(identity.sourceTreeSha, accepted.identity.sourceTreeSha);
  assert.equal(identity.nextBuildId, accepted.identity.nextBuildId);
  assert.equal(identity.artifactSha256, accepted.identity.artifactSha256);
  assert.equal(identity.runNonce, accepted.identity.runNonce);
  assert.equal(report.config.webServer.command, PRODUCTION_EVIDENCE_SERVER_COMMAND);
  assert.equal(report.config.webServer.reuseExistingServer, false);
  assert.equal(report.config.projects[0].retries, 0);
  assert.ok(
    listedSpecCount(report.suites) > 0,
    "producer manifest passes real Playwright config with nonzero discovery",
  );
  assert.equal(
    listedSpecCount(report.suites),
    2,
    "repository-relative compatibility must discover both runtime-smoke specs",
  );

  const leakageRegressionRoot = mkdtempSync(
    path.join(tmpdir(), "ch-0015i-source-stage-leakage-regression-"),
  );
  try {
    const sourceValidationReport =
      ".local/production-artifact-evidence/source-validation-list.json";
    const sourceValidationConfig = spawnSync(
      process.execPath,
      [
        path.join(mainRepositoryRoot, "node_modules/@playwright/test/cli.js"),
        "test",
        "tests/e2e/00-runtime-smoke.spec.ts",
        "--config",
        path.join(mainRepositoryRoot, "playwright.config.ts"),
        "--project=chromium",
        "--list",
        "--reporter=json",
      ],
      {
        cwd: context.root,
        env: {
          ...configEnvironment,
          CERTIFICATION_EVIDENCE_ROOT: leakageRegressionRoot,
          CERTIFICATION_ENVIRONMENT_STAGE: "source-validation",
          PLAYWRIGHT_JSON_OUTPUT_FILE: sourceValidationReport,
        },
        encoding: "utf8",
      },
    );
    assert.equal(
      sourceValidationConfig.status,
      0,
      `real source-validation Playwright config must not activate runtime smoke: ${sourceValidationConfig.stderr}`,
    );
    assert.equal(
      listedSpecCount(
        JSON.parse(
          readFileSync(path.join(context.root, sourceValidationReport), "utf8"),
        ).suites,
      ),
      2,
      "the exact leakage regression must retain real Playwright discovery",
    );
    const runtimeWithoutMarker = spawnSync(
      process.execPath,
      [
        path.join(mainRepositoryRoot, "node_modules/@playwright/test/cli.js"),
        "test",
        "tests/e2e/00-runtime-smoke.spec.ts",
        "--config",
        path.join(mainRepositoryRoot, "playwright.config.ts"),
        "--project=chromium",
        "--list",
        "--reporter=json",
      ],
      {
        cwd: context.root,
        env: {
          ...configEnvironment,
          CERTIFICATION_EVIDENCE_ROOT: leakageRegressionRoot,
          CERTIFICATION_ENVIRONMENT_STAGE: "runtime-smoke",
          CERTIFICATION_RUNTIME_STAGE_ATTEMPT: "1",
          PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT: leakageRegressionRoot,
          PRODUCTION_CERTIFICATION_ID: "certification-marker-test",
          PRODUCTION_EVIDENCE_CANDIDATE_ID: "candidate-marker-test",
          PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE: identity.runNonce,
          PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_SHA256: createHash("sha256")
            .update(journalBytes)
            .digest("hex"),
          PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(
            leakageRegressionRoot,
            "playwright-report.json",
          ),
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(runtimeWithoutMarker.status, 0);
    assert.match(
      `${runtimeWithoutMarker.stdout}\n${runtimeWithoutMarker.stderr}`,
      /certification runtime smoke requires its product-test start marker/,
      "explicit runtime-smoke activation must retain the fail-closed marker requirement",
    );
  } finally {
    rmSync(leakageRegressionRoot, { recursive: true, force: true });
  }

  const runtimeConfigReentryRoot = mkdtempSync(
    path.join(tmpdir(), "runtime-config-reentry-"),
  );
  try {
    const runtimeEvidenceDirectory = path.join(
      runtimeConfigReentryRoot,
      "runtime-smoke",
    );
    mkdirSync(runtimeEvidenceDirectory);
    const runtimeReportPath = path.join(
      runtimeEvidenceDirectory,
      "playwright-report.json",
    );
    const runtimeStartMarkerPath = path.join(
      runtimeEvidenceDirectory,
      "product-test-start.json",
    );
    const runtimeConfigEnvironment = {
      ...configEnvironment,
      CERTIFICATION_EVIDENCE_ROOT: runtimeConfigReentryRoot,
      PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT: runtimeConfigReentryRoot,
      CERTIFICATION_ENVIRONMENT_STAGE: "runtime-smoke",
      CERTIFICATION_RUNTIME_STAGE_ATTEMPT: "1",
      CERTIFICATION_RUNTIME_START_MARKER_PATH: runtimeStartMarkerPath,
      PRODUCTION_CERTIFICATION_ID: "certification-config-reentry",
      PRODUCTION_EVIDENCE_CANDIDATE_ID: "candidate-config-reentry",
      PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE: identity.runNonce,
      PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_SHA256: createHash("sha256")
        .update(journalBytes)
        .digest("hex"),
      PLAYWRIGHT_JSON_OUTPUT_FILE: runtimeReportPath,
    };
    const loadRuntimeConfig = (environment = runtimeConfigEnvironment) =>
      spawnSync(
        process.execPath,
        [
          path.join(mainRepositoryRoot, "node_modules/@playwright/test/cli.js"),
          "test",
          "tests/e2e/00-runtime-smoke.spec.ts",
          "--config",
          path.join(mainRepositoryRoot, "playwright.config.ts"),
          "--project=chromium",
          "--list",
          "--reporter=line",
        ],
        { cwd: context.root, env: environment, encoding: "utf8" },
      );

    const initialConfig = loadRuntimeConfig();
    assert.equal(
      initialConfig.status,
      0,
      `initial absent runtime targets must load the real Playwright config: ${initialConfig.stderr}`,
    );
    assert.equal(existsSync(runtimeReportPath), false);
    assert.equal(existsSync(`${runtimeReportPath}.owner.json`), true);
    writeFileSync(
      runtimeStartMarkerPath,
      `${JSON.stringify(
        {
          schema: "interior-ai.production-certification-playwright-start.v1",
          boundary: "test-begin",
          gateId: "ci.production-runtime-smoke",
          project: "chromium",
          title: "furnished template remains stable without a render loop",
          retry: 0,
        },
        null,
        2,
      )}\n`,
      { flag: "wx", mode: 0o600 },
    );
    const replacementWorkerConfig = loadRuntimeConfig();
    assert.equal(
      replacementWorkerConfig.status,
      0,
      `same-run replacement-worker config evaluation must accept its retained start marker: ${replacementWorkerConfig.stderr}`,
    );
    assert.equal(existsSync(runtimeReportPath), false);

    const foreignAttempt = loadRuntimeConfig({
      ...runtimeConfigEnvironment,
      CERTIFICATION_RUNTIME_STAGE_ATTEMPT: "2",
    });
    assert.notEqual(foreignAttempt.status, 0);
    assert.match(
      `${foreignAttempt.stdout}\n${foreignAttempt.stderr}`,
      /owned by another run, attempt, destination, or evidence root/,
    );

    writeFileSync(runtimeReportPath, "{}\n", { flag: "wx", mode: 0o600 });
    const completedReportReentry = loadRuntimeConfig();
    assert.notEqual(completedReportReentry.status, 0);
    assert.match(
      `${completedReportReentry.stdout}\n${completedReportReentry.stderr}`,
      /Production evidence report path must not already exist/,
    );
  } finally {
    rmSync(runtimeConfigReentryRoot, { recursive: true, force: true });
  }

  const externalEvidenceRoot = mkdtempSync(
    path.join(tmpdir(), "ch-0015i-playwright-external-evidence-"),
  );
  const externalReportParent = path.join(externalEvidenceRoot, "playwright");
  const externalReportPath = path.join(
    externalReportParent,
    "runtime-smoke-list.json",
  );
  const syntheticExternalSecret =
    "synthetic-external-playwright-secret-never-print";
  try {
    mkdirSync(externalReportParent);
    const externalEnvironment = {
      ...configEnvironment,
      PLAYWRIGHT_JSON_OUTPUT_FILE: externalReportPath,
      [PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT]: externalEvidenceRoot,
      SYNTHETIC_EXTERNAL_REPORT_SECRET: syntheticExternalSecret,
    };
    execFileSync(
      process.execPath,
      [
        path.join(mainRepositoryRoot, "node_modules/@playwright/test/cli.js"),
        "test",
        "tests/e2e/00-runtime-smoke.spec.ts",
        "--config",
        path.join(mainRepositoryRoot, "playwright.config.ts"),
        "--project=chromium",
        "--list",
        "--reporter=json",
      ],
      { cwd: context.root, env: externalEnvironment, encoding: "utf8" },
    );
    assert.equal(
      existsSync(externalReportPath),
      true,
      "real Playwright config must write to the exact external report path",
    );
    const externalReportBytes = readFileSync(externalReportPath);
    const externalReportText = externalReportBytes.toString("utf8");
    const externalReport = JSON.parse(externalReportText);
    assert.equal(listedSpecCount(externalReport.suites), 2);
    assert.equal(
      externalReport.config.metadata.productionArtifactEvidence.schema,
      PRODUCTION_EVIDENCE_SCHEMA,
    );
    assert.equal(
      externalReport.config.webServer.command,
      PRODUCTION_EVIDENCE_SERVER_COMMAND,
    );
    assert.equal(externalReport.config.projects[0].retries, 0);
    const externalReportSha256 = createHash("sha256")
      .update(externalReportBytes)
      .digest("hex");
    assert.match(
      externalReportSha256,
      /^[0-9a-f]{64}$/,
      "external Playwright report content must have a recorded SHA-256",
    );
    assert.doesNotMatch(
      externalReportText,
      new RegExp(syntheticExternalSecret),
    );
    for (const unexpectedRepositoryReport of [
      path.join(
        context.root,
        ".local/production-artifact-evidence/runtime-smoke-list.json",
      ),
      path.join(context.root, "test-results/runtime-smoke-list.json"),
      path.join(context.root, "playwright-report/runtime-smoke-list.json"),
    ]) {
      assert.equal(
        existsSync(unexpectedRepositoryReport),
        false,
        "external report must not be rewritten into repository-owned output",
      );
    }

    const whitespaceTarget = path.join(
      externalReportParent,
      "whitespace-must-not-be-trimmed.json",
    );
    const malformedConfigResult = spawnSync(
      process.execPath,
      [
        path.join(mainRepositoryRoot, "node_modules/@playwright/test/cli.js"),
        "test",
        "tests/e2e/00-runtime-smoke.spec.ts",
        "--config",
        path.join(mainRepositoryRoot, "playwright.config.ts"),
        "--project=chromium",
        "--list",
        "--reporter=json",
      ],
      {
        cwd: context.root,
        env: {
          ...externalEnvironment,
          PLAYWRIGHT_JSON_OUTPUT_FILE: ` ${whitespaceTarget} `,
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(
      malformedConfigResult.status,
      0,
      "real Playwright config must reject rather than trim a malformed report path",
    );
    assert.match(
      `${malformedConfigResult.stdout}\n${malformedConfigResult.stderr}`,
      /Production evidence report path is malformed/,
    );
    assert.equal(
      existsSync(whitespaceTarget),
      false,
      "malformed report path must not create its trimmed target",
    );
  } finally {
    rmSync(externalEvidenceRoot, { recursive: true, force: true });
  }
}

{
  const producerSource = readFileSync(
    path.join(process.cwd(), "scripts/production-artifact-evidence.mjs"),
    "utf8",
  );
  const configSource = readFileSync(path.join(process.cwd(), "playwright.config.ts"), "utf8");
  const loaderSource = readFileSync(
    path.join(process.cwd(), "scripts/production-artifact-playwright.mjs"),
    "utf8",
  );
  const reportPathSource = readFileSync(
    path.join(process.cwd(), "scripts/playwright-report-path.mjs"),
    "utf8",
  );
  const contractSource = readFileSync(
    path.join(process.cwd(), "scripts/production-artifact-contract.mjs"),
    "utf8",
  );
  const manifestOwner = JSON.parse(
    readFileSync(path.join(process.cwd(), "scripts/required-test-manifest.json"), "utf8"),
  ).gates.find((gate) => gate.id === "ci.production-artifact-contract");
  assert.match(
    producerSource,
    /await import\("\.\/production-artifact-contract\.mjs"\)/,
  );
  assert.doesNotMatch(producerSource, /journal\.version\s*!==\s*1|\n\s*version:\s*1,\n/);
  assert.match(configSource, /loadProductionArtifactForPlaywright/);
  assert.match(loaderSource, /from "\.\/production-artifact-contract\.mjs"/);
  assert.match(loaderSource, /from "\.\/playwright-report-path\.mjs"/);
  assert.match(loaderSource, /PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT/);
  assert.match(loaderSource, /verify-preflight/);
  assert.doesNotMatch(
    loaderSource,
    /reportPath,\s*"Production evidence report path"\s*\)/,
    "Playwright loader must not retain the repository-relative-only report check",
  );
  assert.match(configSource, /reportDestination\.outputPath/);
  assert.doesNotMatch(
    configSource,
    /PLAYWRIGHT_JSON_OUTPUT_FILE\?\.trim/,
    "real Playwright config must preserve malformed input for fail-closed validation",
  );
  assert.match(reportPathSource, /external-evidence-root/);
  assert.match(reportPathSource, /must not already exist/);
  assert.match(reportPathSource, /authorized external evidence root/);
  assert.doesNotMatch(producerSource, /PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT/);
  assert.doesNotMatch(configSource, /production-artifact-evidence\.v2|validatorVersion:\s*2/);
  assert.equal(
    [producerSource, configSource, loaderSource].some((source) =>
      source.includes('"interior-ai.production-artifact-evidence.v3"'),
    ),
    false,
    "runtime producer and consumers must not duplicate the canonical schema literal",
  );
  assert.match(contractSource, /CURRENT_PRODUCTION_EVIDENCE_VERSIONS/);
  for (const requiredSource of [
    "playwright.config.ts",
    "scripts/production-artifact-contract.mjs",
    "scripts/production-artifact-playwright.mjs",
    "scripts/playwright-report-path.mjs",
  ]) {
    assert.ok(manifestOwner.requiredSources.includes(requiredSource));
  }
  assert.ok(
    manifestOwner.requiredContributions.some(
      (contribution) => contribution.id === "artifact.playwright-v3-producer-consumer",
    ),
  );
  assert.ok(
    manifestOwner.requiredContributions.some(
      (contribution) =>
        contribution.id === "artifact.staged-archive-preflight-cli" &&
        contribution.source === "scripts/test-production-artifact-evidence.mjs",
    ),
  );
  assert.match(
    producerSource,
    /ARCHIVE_PREFLIGHT[\s\S]{0,180}standalone:\s*true[\s\S]{0,120}testPolicy:\s*"pre-runtime-optional"/,
    "archive preflight must remain explicitly standalone and pre-runtime",
  );
  assert.match(
    producerSource,
    /STANDALONE_FINAL[\s\S]{0,180}standalone:\s*true[\s\S]{0,120}testPolicy:\s*"external-certification-required"/,
    "final standalone verification must continue to require tests",
  );
  assert.match(
    producerSource,
    /REPOSITORY_PREFLIGHT[\s\S]{0,180}standalone:\s*false[\s\S]{0,120}testPolicy:\s*"pre-runtime-optional"/,
    "repository preflight must remain repository-bound",
  );
  const validationSignature = producerSource.slice(
    producerSource.indexOf("export async function validateProductionEvidence({"),
    producerSource.indexOf("}) {", producerSource.indexOf(
      "export async function validateProductionEvidence({",
    )),
  );
  assert.doesNotMatch(
    validationSignature,
    /requireTests|standalone|allowFailedRuntimeSmoke|testPolicy/,
    "callers must select a closed verification mode rather than test-bypass flags",
  );
  assert.match(
    producerSource,
    /verificationMode:\s*PRODUCTION_EVIDENCE_VERIFICATION_MODES\.ARCHIVE_PREFLIGHT/,
  );
  assert.match(
    producerSource,
    /certificationComplete:\s*false[\s\S]{0,120}finalStandaloneVerificationRequired:\s*true/,
    "archive preflight success must not be representable as final certification",
  );
  assert.doesNotMatch(
    producerSource,
    /ARCHIVE_PREFLIGHT[\s\S]{0,220}inspectSourceIdentity/,
    "archive preflight must not fall back to Git or a source worktree",
  );
  assert.ok(
    manifestOwner.requiredContributions.some(
      (contribution) =>
        contribution.id ===
        "artifact.playwright-external-report-producer-consumer",
    ),
  );
  const smokeSource = producerSource.slice(
    producerSource.indexOf("async function smokeEvidence"),
    producerSource.indexOf("async function cli"),
  );
  const preflightIndex = smokeSource.indexOf(
    "const preflight = await validateProductionEvidence",
  );
  const preflightRejectionIndex = smokeSource.indexOf(
    "if (!preflight.valid) throw new Error",
    preflightIndex,
  );
  const runtimeStartIndex = smokeSource.indexOf(
    "const playwright = run(",
    preflightIndex,
  );
  assert.ok(
    smokeSource.length > 0 &&
      preflightIndex >= 0 &&
      preflightRejectionIndex > preflightIndex &&
      runtimeStartIndex > preflightRejectionIndex,
    "runtime smoke cannot start when manifest validation fails",
  );
  assert.match(
    smokeSource,
    /playwright\.status !== 0 && !existsSync\(absolutePhaseTimingPath\)[\s\S]*preceding Playwright webServer failure is authoritative/,
    "a pre-test server failure must remain the primary direct-smoke diagnostic",
  );
  assert.match(
    smokeSource,
    /bindRuntimeSmokeFailureToReport\([\s\S]*requestedTimingPath,[\s\S]*externalTimingRoot/,
    "repository-relative timing evidence must retain its requested path at the binding boundary",
  );
  assert.ok(
    configSource.indexOf("loadProductionArtifactForPlaywright") <
      configSource.indexOf("export default defineConfig"),
    "Playwright must reject invalid evidence before exposing a webServer command",
  );
}

async function rewriteFailurePair(context, mutate) {
  const absoluteReportPath = path.join(context.root, context.reportPath);
  const absoluteTimingPath = path.join(context.root, context.phaseTimingPath);
  const report = JSON.parse(readFileSync(absoluteReportPath, "utf8"));
  const timing = JSON.parse(readFileSync(absoluteTimingPath, "utf8"));
  mutate({ report, timing });
  const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  const timingBytes = Buffer.from(`${JSON.stringify(timing, null, 2)}\n`);
  writeFileSync(absoluteReportPath, reportBytes);
  writeFileSync(absoluteTimingPath, timingBytes);
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    const test = manifest.tests[0];
    test.report.sha256 = createHash("sha256").update(reportBytes).digest("hex");
    test.phaseTimings.sha256 = createHash("sha256").update(timingBytes).digest("hex");
    test.phaseTimings.phaseCount = timing.phases.length;
    test.phaseTimings.totalElapsedMs = timing.phases.reduce(
      (total, phase) => total + phase.elapsedMs,
      0,
    );
    test.stats = report.stats;
  });
}

async function runtimeFailureFixture({
  phaseName = "bounds-verification",
  phaseElapsedMs = 42_000,
  operationId = "diagnostics-settle",
  operationElapsedMs = 42_000,
  operationElapsedPreciseMs = operationElapsedMs,
  operationBudgetMs = 42_000,
  attemptTimeoutMs = 42_000,
  remainingAtAttemptStartMs = 42_000,
  deadlineReached = true,
} = {}) {
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests = [];
    manifest.repositoryEvidence.status = "pending_tests";
  });
  const absoluteReportPath = path.join(context.root, context.reportPath);
  const absoluteTimingPath = path.join(context.root, context.phaseTimingPath);
  const report = JSON.parse(readFileSync(absoluteReportPath, "utf8"));
  const timing = JSON.parse(readFileSync(absoluteTimingPath, "utf8"));
  const furnishedSpec = report.suites[0].specs[0];
  furnishedSpec.ok = false;
  furnishedSpec.tests[0].status = "unexpected";
  furnishedSpec.tests[0].results[0].status = "failed";
  furnishedSpec.tests[0].results[0].error = {
    name: "RuntimeSmokeOperationTimeoutError",
    message: "Structured fixture failure",
  };
  report.stats.expected = 1;
  report.stats.unexpected = 1;
  const failurePhaseIndex = timing.phases.findIndex(
    (phase) => phase.name === phaseName,
  );
  assert.notEqual(failurePhaseIndex, -1);
  const failurePhase = timing.phases[failurePhaseIndex];
  failurePhase.elapsedMs = phaseElapsedMs;
  failurePhase.outcome = "failed";
  failurePhase.performanceWarningExceeded =
    failurePhase.performanceWarningThresholdMs !== null &&
    phaseElapsedMs > failurePhase.performanceWarningThresholdMs;
  failurePhase.finalLifecycleState = "ready";
  failurePhase.progressCheckpoints = [failurePhase.progressCheckpoints[0]];
  failurePhase.failure = {
    failureKind: "nested-operation-timeout",
    phaseId: phaseName,
    phaseElapsedMs,
    phaseBudgetMs: failurePhase.timeoutBudgetMs,
    operationId,
    operationOutcome: "timed-out",
    operationElapsedMs,
    operationElapsedPreciseMs,
    operationBudgetMs,
    attemptTimeoutMs,
    remainingAtAttemptStartMs,
    deadlineReached,
    watchdogBudgetMs: null,
    lastSafeCheckpoint: "phase-start",
    safeLifecycleState: "ready",
    progressObserved: false,
    originalCause: null,
  };
  timing.phases = timing.phases.slice(0, failurePhaseIndex + 1);
  timing.complete = false;
  timing.failure = failurePhase.failure;
  report.runtimeSmokeFailure = failurePhase.failure;
  writeFileSync(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(absoluteTimingPath, `${JSON.stringify(timing, null, 2)}\n`);
  await recordProductionEvidenceTest({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
    name: "runtime-smoke",
    command: "npx playwright test tests/e2e/00-runtime-smoke.spec.ts --project=chromium",
    processExitCode: 1,
  });
  return context;
}

// Physical artifact/manifest fixtures; no compiled artifact is rewritten here.
// Independent inventories from the same source commit must stay distinct.
{
  const identities = [];
  for (const nextBuildId of [
    "-HMijapRnjq-h9tldkjN0", "_jT2Js5lQ3W97uL42t3VQ",
    "v3Dmenpr6d_fsLQY9tQPM", "release-2026.09:build_42", "A", "_".repeat(128),
  ]) {
    const context = await fixture({ nextBuildId, recordRuntimeTest: false,
      commitDate: "2026-07-31T00:00:00Z" });
    try {
      const identity = await inspectDirectProductionIdentity({
        repositoryRoot: context.root, manifestPath: context.manifestPath,
        environment: playwrightContractEnvironment(context),
      });
      assert.equal(identity.buildIdentity, nextBuildId, "physical BUILD_ID is never sanitized");
      assert.equal(readFileSync(path.join(context.root, ".next/BUILD_ID"), "utf8"), `${nextBuildId}\n`);
      const health = { build: nextBuildId, productionArtifact: {
        kind: "local-production-mode-artifact", nextBuildId,
        artifactSha256: identity.artifactSha256,
        sourceCommitSha: identity.candidateCommitSha,
      } };
      assertDirectRuntimeSmokeServer(identity, health);
      assert.throws(() => assertDirectRuntimeSmokeServer(identity, {
        ...health, build: "foreign-build",
      }), /does not match/);
      assert.throws(() => assertDirectRuntimeSmokeServer(identity, {
        ...health, productionArtifact: { ...health.productionArtifact, nextBuildId: "foreign-build" },
      }), /does not match/);
      await assert.rejects(() => inspectDirectProductionIdentity({
        repositoryRoot: context.root, manifestPath: context.manifestPath,
        environment: { ...playwrightContractEnvironment(context),
          PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: "foreign-build" },
      }), /conflicts with PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID/);
      identities.push(identity);
      write(context.root, ".next/BUILD_ID", "unbound-build\n");
      await assert.rejects(() => inspectDirectProductionIdentity({
        repositoryRoot: context.root, manifestPath: context.manifestPath,
        environment: playwrightContractEnvironment(context),
      }), /rejected/);
    } finally { rmSync(context.root, { recursive: true, force: true }); }
  }
  assert.equal(identities[0].candidateCommitSha, identities[1].candidateCommitSha);
  assert.notEqual(identities[0].buildIdentity, identities[1].buildIdentity);
  assert.notEqual(identities[0].artifactSha256, identities[1].artifactSha256);
  console.log("Direct build identity C1-C6 controls passed, including distinct physical builds.");
}

async function expectRejected(context, expectedText) {
  const result = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_FINAL,
  });
  assert.equal(result.valid, false, `expected rejection containing ${expectedText}`);
  assert.ok(
    result.issues.some((issue) => issue.includes(expectedText)),
    `missing rejection ${JSON.stringify(expectedText)} in ${JSON.stringify(result.issues)}`,
  );
}

{
  const context = await fixture();
  const result = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_FINAL,
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true);
  assert.equal(result.manifest.repositoryEvidence.status, "valid");
  assert.equal(result.manifest.repositoryEvidence.releaseReady, false);
}

{
  const context = await fixture();
  await rewriteFailurePair(context, ({ report, timing }) => {
    delete report.runtimeSmokeFailure;
    assert.equal(timing.failure, null);
  });
  const result = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_FINAL,
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true);
}

{
  const context = await fixture();
  await rewriteFailurePair(context, ({ report, timing }) => {
    assert.equal(timing.failure, null);
    report.runtimeSmokeFailure = {
      failureKind: "assertion-failure",
      phaseId: timing.phases[0].name,
      phaseElapsedMs: timing.phases[0].elapsedMs,
      phaseBudgetMs: timing.phases[0].timeoutBudgetMs,
      operationId: null,
      operationOutcome: null,
      operationElapsedMs: null,
      operationElapsedPreciseMs: null,
      operationBudgetMs: null,
      attemptTimeoutMs: null,
      remainingAtAttemptStartMs: null,
      deadlineReached: null,
      watchdogBudgetMs: null,
      lastSafeCheckpoint: "phase-complete",
      safeLifecycleState: timing.phases[0].finalLifecycleState,
      progressObserved: true,
      originalCause: null,
    };
  });
  await expectRejected(
    context,
    "successful runtime-smoke report retains stale failure provenance",
  );
}

{
  const context = await fixture();
  const result = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_FINAL,
    environment: {},
  });
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.includes(
      "build auth fixture continuity is missing or contradictory",
    ),
  );
}

{
  const authEnvironment = {
    ...boundAuthFixtureEnvironment(),
    CERTIFICATION_ENVIRONMENT_STAGE: "build",
  };
  const context = await fixture({ environmentOverrides: authEnvironment });
  const result = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_FINAL,
    environment: { ...process.env, ...authEnvironment },
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true);
  assert.equal(
    result.manifest.build.authFixtureContinuity.providerDigests
      .googleClientSecondaryValueSha256,
    authEnvironment.CI_AUTH_FIXTURE_PROVIDER_CLIENT_SECRET_SHA256,
  );
}

{
  const buildAuthEnvironment = {
    ...boundAuthFixtureEnvironment(),
    CERTIFICATION_ENVIRONMENT_STAGE: "build",
  };
  const context = await fixture({
    environmentOverrides: buildAuthEnvironment,
  });
  const archiveParentEnvironment = {
    ...buildAuthEnvironment,
    CERTIFICATION_ENVIRONMENT_STAGE: "archive-preflight",
    CI_AUTH_FIXTURE_SESSION_ROOT: "/private/task-owned-auth-session",
  };
  delete archiveParentEnvironment.CI_AUTH_FIXTURE_LOCAL_TEST;
  delete archiveParentEnvironment.CI_AUTH_FIXTURE_MODE;
  const result = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    verificationMode:
      PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_PREFLIGHT,
    environment: archiveParentEnvironment,
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true);

  const foreignSession = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    verificationMode:
      PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_PREFLIGHT,
    environment: {
      ...buildAuthEnvironment,
      CI_AUTH_FIXTURE_SESSION_ID: "foreign-artifact-session-001",
    },
  });
  assert.equal(foreignSession.valid, false);
  assert.ok(
    foreignSession.issues.includes(
      "build auth fixture continuity differs from the projected child",
    ),
  );

  const wrongCandidateContext = await fixture({
    environmentOverrides: buildAuthEnvironment,
  });
  await rewriteManifest(
    wrongCandidateContext.root,
    wrongCandidateContext.manifestPath,
    (manifest) => {
      manifest.source.commitSha = "f".repeat(40);
    },
  );
  const wrongCandidate = await validateProductionEvidence({
    repositoryRoot: wrongCandidateContext.root,
    manifestPath: wrongCandidateContext.manifestPath,
    verificationMode:
      PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_PREFLIGHT,
    environment: archiveParentEnvironment,
  });
  assert.equal(wrongCandidate.valid, false);
  assert.ok(
    wrongCandidate.issues.some((issue) =>
      issue.includes("source commit"),
    ),
  );
}

{
  const buildAuthEnvironment = {
    ...boundAuthFixtureEnvironment(),
    CERTIFICATION_ENVIRONMENT_STAGE: "build",
  };
  const context = await fixture({
    environmentOverrides: buildAuthEnvironment,
  });
  const manifest = readManifest(context.root, context.manifestPath);
  const productEnvironment = {
    ...buildAuthEnvironment,
    APP_ENV: "staging",
    NEXT_PUBLIC_APP_ENV: "staging",
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    CERTIFICATION_ENVIRONMENT_STAGE: "artifact-product-server",
    CERTIFICATION_RUNTIME_STAGE_ATTEMPT: "4",
    PRODUCTION_ARTIFACT_EVIDENCE: "1",
    PRODUCTION_ARTIFACT_COMMIT_SHA: manifest.source.commitSha,
    PRODUCTION_CERTIFICATION_ID: "certification-fixture-001",
    PRODUCTION_EVIDENCE_CANDIDATE_ID: manifest.candidateIdentifier,
    PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: manifest.source.treeSha,
    CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: manifest.source.commitSha,
    CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: manifest.source.treeSha,
  };
  const projectedProductEnvironment = projectArtifactProductServerEnvironment({
    repositoryRoot: process.cwd(),
    baseEnvironment: productEnvironment,
    manifest,
    databaseUrl:
      "postgresql://fixture:fixture@127.0.0.1:5432/evidence_fixture",
  });
  assert.deepEqual(
    validateArtifactProductServerAuthFixtureBinding({
      environment: projectedProductEnvironment,
      manifest,
    }),
    manifest.build.authFixtureContinuity,
  );
  const githubBuildManifest = structuredClone(manifest);
  githubBuildManifest.build.authFixtureContinuity.activationScope =
    "github-actions";
  assert.equal(
    validateArtifactProductServerAuthFixtureBinding({
      environment: projectedProductEnvironment,
      manifest: githubBuildManifest,
    }).activationScope,
    "local-certification-projection",
    "the server-local fixture activation may preserve the same GitHub-built session identity",
  );
  assert.equal(
    projectedProductEnvironment.PRODUCTION_CERTIFICATION_ID,
    productEnvironment.PRODUCTION_CERTIFICATION_ID,
  );
  assert.equal(
    projectedProductEnvironment.PRODUCTION_EVIDENCE_CANDIDATE_ID,
    manifest.candidateIdentifier,
  );
  assert.equal(
    projectedProductEnvironment.CERTIFICATION_RUNTIME_STAGE_ATTEMPT,
    "4",
  );
  assert.equal(
    projectedProductEnvironment.PRODUCTION_ARTIFACT_COMMIT_SHA,
    manifest.source.commitSha,
  );
  assert.equal(
    projectedProductEnvironment.PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA,
    manifest.source.treeSha,
  );
  const missingRuntimeBindingEnvironment = { ...productEnvironment };
  delete missingRuntimeBindingEnvironment.CERTIFICATION_RUNTIME_STAGE_ATTEMPT;
  assert.throws(
    () =>
      projectArtifactProductServerEnvironment({
        repositoryRoot: process.cwd(),
        baseEnvironment: missingRuntimeBindingEnvironment,
        manifest,
        databaseUrl:
          "postgresql://fixture:fixture@127.0.0.1:5432/evidence_fixture",
      }),
    /CERTIFICATION_RUNTIME_STAGE_ATTEMPT/,
  );

  for (const [name, mutate, expected] of [
    [
      "missing continuity",
      (environment) => delete environment.CI_AUTH_FIXTURE_ACTIVE,
      /digest or classification|incomplete/,
    ],
    [
      "foreign candidate",
      (environment) => {
        environment.CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA = "f".repeat(40);
      },
      /another candidate/,
    ],
    [
      "foreign session",
      (environment) => {
        environment.CI_AUTH_FIXTURE_SESSION_ID = "foreign-runtime-session-001";
      },
      /differs from build continuity/,
    ],
    [
      "foreign nonce",
      (environment) => {
        environment.CI_AUTH_FIXTURE_SESSION_NONCE = "foreign-runtime-nonce-001";
      },
      /differs from build continuity/,
    ],
    [
      "altered digest",
      (environment) => {
        environment.CI_AUTH_FIXTURE_PROVIDER_CLIENT_SECRET_SHA256 = "0".repeat(64);
      },
      /digest or classification/,
    ],
    [
      "production identity",
      (environment) => {
        environment.APP_ENV = "production";
      },
      /exact staging\/preview identity/,
    ],
    [
      "foreign release candidate identity",
      (environment) => {
        environment.PRODUCTION_EVIDENCE_CANDIDATE_ID = "another-candidate";
      },
      /release candidate identity/,
    ],
    [
      "missing certification identity",
      (environment) => {
        delete environment.PRODUCTION_CERTIFICATION_ID;
      },
      /release candidate identity/,
    ],
  ]) {
    const mutated = { ...projectedProductEnvironment };
    mutate(mutated);
    assert.throws(
      () =>
        validateArtifactProductServerAuthFixtureBinding({
          environment: mutated,
          manifest,
        }),
      expected,
      name,
    );
  }
}

{
  const authEnvironment = {
    ...boundAuthFixtureEnvironment(),
    CERTIFICATION_ENVIRONMENT_STAGE: "build",
  };
  const missing = await fixture({ environmentOverrides: authEnvironment });
  await rewriteManifest(missing.root, missing.manifestPath, (manifest) => {
    delete manifest.build.authFixtureContinuity;
  });
  await expectRejected(
    missing,
    "build auth fixture continuity is missing or contradictory",
  );

  const altered = await fixture({ environmentOverrides: authEnvironment });
  await rewriteManifest(altered.root, altered.manifestPath, (manifest) => {
    manifest.build.authFixtureContinuity.noRegenerationProof = "altered";
  });
  await expectRejected(
    altered,
    "build auth fixture continuity is missing or contradictory",
  );
}

{
  const context = await fixture();
  const manifest = readManifest(context.root, context.manifestPath);
  write(context.root, ".next/BUILD_ID", "cross-run-build-id\n");
  await assert.rejects(
    () =>
      recoverProductionEvidenceFromSemanticJournal({
        repositoryRoot: context.root,
        manifestPath: context.manifestPath,
        expectedRunNonce: manifest.execution.runNonce,
        environment: semanticJournalEnvironment,
        toolchain: semanticJournalToolchain,
      }),
    /current dependency, Build ID, or artifact identity does not match/,
  );
}

{
  let failedRoot;
  await assert.rejects(
    () =>
      fixture({
        manifestFactory: async (options) => {
          failedRoot = options.repositoryRoot;
          throw new Error("injected manifest construction failure");
        },
      }),
    /injected manifest construction failure/,
  );
  const journal = readProductionEvidenceSemanticJournal({ repositoryRoot: failedRoot });
  assert.equal(journal.events.build.status, "succeeded");
  assert.equal(journal.events.build.exitCode, 0);
  assert.equal(journal.events.artifactInventory.status, "succeeded");
  assert.equal(journal.manifest.status, "pending");
  assert.equal(
    journal.completionState,
    "artifact_inventory_succeeded",
    "manifest failure must leave the completed semantic build and inventory durable",
  );
  let manifestConstructionCompleted = false;
  const recovered = await recoverProductionEvidenceFromSemanticJournal({
    repositoryRoot: failedRoot,
    expectedRunNonce: journal.runNonce,
    environment: semanticJournalEnvironment,
    toolchain: semanticJournalToolchain,
    manifestFactory: async (options) => {
      const draft = await createProductionEvidenceManifest(options);
      assert.equal(draft.createdAt, undefined);
      manifestConstructionCompleted = true;
      return draft;
    },
    clock: () => {
      assert.equal(
        manifestConstructionCompleted,
        true,
        "manifestCreatedAt must be captured after successful manifest construction",
      );
      return "2026-07-31T00:00:04.400Z";
    },
  });
  assert.equal(recovered.manifest.createdAt, "2026-07-31T00:00:04.400Z");
  assert.equal(recovered.journal.manifest.createdAt, "2026-07-31T00:00:04.400Z");
}

{
  const context = await fixture();
  await rewriteFailurePair(context, ({ report }) => {
    report.suites[0].specs[0].tests[0].results[0].attachments = [];
  });
  await expectRejected(
    context,
    "runtime telemetry observations do not cover the initial realm and three reloads",
  );
}

{
  const context = await fixture();
  const manifest = readManifest(context.root, context.manifestPath);
  await rewriteManifest(context.root, context.manifestPath, (candidate) => {
    candidate.artifact.floorPlanRouteNftContract.targets = [];
  });
  rmSync(path.join(context.root, ".git"), { recursive: true, force: true });
  rmSync(path.join(context.root, "node_modules"), { recursive: true, force: true });
  const result = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.STANDALONE_FINAL,
    expectedSourceCommitSha: manifest.source.commitSha,
  });
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.includes("recorded Floor Plan route NFT contract is incomplete or unsafe"),
  );
}

{
  const context = await fixture();
  await rewriteFailurePair(context, ({ report }) => {
    const attachment =
      report.suites[0].specs[0].tests[0].results[0].attachments[0];
    const evidence = JSON.parse(
      Buffer.from(attachment.body, "base64").toString("utf8"),
    );
    evidence.telemetry.bootstrapRecordsQueuedAtActivation = 4;
    evidence.telemetry.bootstrapEventsFlushed = 0;
    attachment.body = Buffer.from(JSON.stringify(evidence)).toString("base64");
  });
  await expectRejected(context, "bootstrap.accounting");
}

{
  const context = await fixture();
  await rewriteFailurePair(context, ({ report }) => {
    const attachment =
      report.suites[0].specs[0].tests[0].results[0].attachments[0];
    attachment.body = Buffer.from("{}").toString("base64");
  });
  await expectRejected(
    context,
    "runtime telemetry evidence fields are missing or unknown",
  );
}

{
  const context = await fixture();
  await rewriteFailurePair(context, ({ report }) => {
    const attachment =
      report.suites[0].specs[0].tests[0].results[0].attachments[0];
    attachment.path = "/tmp/non-portable-telemetry.json";
  });
  await expectRejected(
    context,
    "runtime telemetry report attachment is malformed or non-portable",
  );
}

{
  const context = await runtimeFailureFixture();
  const verified = await verifyRuntimeSmokeFailureEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
  });
  assert.equal(verified.failure.failureKind, "nested-operation-timeout");
  assert.equal(verified.failure.operationId, "diagnostics-settle");
  assert.equal(verified.failure.operationBudgetMs, 42_000);
  assert.equal(verified.failure.phaseBudgetMs, 103_000);
  assert.equal(verified.timing.phases.at(-1).outcome, "failed");
  const stableResult = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_FINAL,
  });
  assert.equal(stableResult.valid, false, "failed smoke must withhold stable evidence");
  assert.ok(
    stableResult.issues.some((issue) =>
      issue.includes("failed evidence validation cannot produce an approval-ready result")
    ),
  );
}

{
  const context = await runtimeFailureFixture();
  await rewriteFailurePair(context, ({ report }) => {
    delete report.runtimeSmokeFailure;
  });
  const verified = await verifyRuntimeSmokeFailureEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
  });
  assert.equal(verified.failure.failureKind, "nested-operation-timeout");
  assert.equal(verified.failure.phaseId, "bounds-verification");
}

{
  const context = await runtimeFailureFixture({
    phaseName: "reload-1",
    phaseElapsedMs: 70_001,
    operationId: "model-responses-and-readiness",
    operationElapsedMs: 70_000,
    operationElapsedPreciseMs: 70_000.25,
    operationBudgetMs: 70_000,
    attemptTimeoutMs: 65_458,
    remainingAtAttemptStartMs: 65_458,
  });
  const verified = await verifyRuntimeSmokeFailureEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
  });
  assert.equal(verified.failure.failureKind, "nested-operation-timeout");
  assert.equal(verified.failure.phaseId, "reload-1");
  assert.equal(verified.failure.phaseBudgetMs, 308_000);
  assert.equal(verified.failure.operationId, "model-responses-and-readiness");
  assert.equal(verified.failure.operationBudgetMs, 70_000);
  assert.equal(verified.failure.operationElapsedMs, 70_000);
  assert.equal(verified.failure.operationElapsedPreciseMs, 70_000.25);
  assert.equal(verified.failure.attemptTimeoutMs, 65_458);
  assert.equal(verified.failure.remainingAtAttemptStartMs, 65_458);
  assert.equal(verified.failure.deadlineReached, true);
  assert.equal(verified.timing.schema, "interior-ai.runtime-smoke-phase-timings.v3");
  assert.equal(verified.timing.phases.at(-1).outcome, "failed");
  assert.notEqual(verified.timing.phases.at(-1).outcome, "timed-out");
  const failedManifest = readManifest(context.root, context.manifestPath);
  assert.equal(failedManifest.tests[0].processExitCode, 1);
  const stableResult = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_FINAL,
  });
  assert.equal(stableResult.valid, false, "forced failure must withhold stable evidence");

  const evidenceRoot = path.dirname(path.join(context.root, context.manifestPath));
  const failureUploadRoot = path.join(evidenceRoot, "failure-upload");
  mkdirSync(failureUploadRoot);
  const safeFiles = [
    [context.manifestPath, "manifest.json"],
    [context.phaseTimingPath, "runtime-smoke-phases.json"],
    [context.reportPath, "runtime-smoke.json"],
  ];
  for (const [sourcePath, stagedName] of safeFiles) {
    copyFileSync(
      path.join(context.root, sourcePath),
      path.join(failureUploadRoot, stagedName),
    );
  }
  assert.deepEqual(
    readdirSync(failureUploadRoot).sort(),
    ["manifest.json", "runtime-smoke-phases.json", "runtime-smoke.json"],
  );
  const safeContent = readdirSync(failureUploadRoot)
    .map((name) => {
      const text = readFileSync(path.join(failureUploadRoot, name), "utf8");
      JSON.parse(text);
      return text;
    })
    .join("\n");
  assert.doesNotMatch(
    safeContent,
    /(?:^|[\s"'(])\/(?:home|Users|private\/tmp|tmp|var\/tmp|var\/folders)\//im,
  );
  assert.equal(
    existsSync(path.join(evidenceRoot, "upload")),
    false,
    "forced failure must not stage stable release evidence",
  );
}

{
  const context = await runtimeFailureFixture({
    phaseName: "reload-1",
    phaseElapsedMs: 70_001,
    operationId: "model-responses-and-readiness",
    operationElapsedMs: 70_001,
    operationElapsedPreciseMs: 70_001.25,
    operationBudgetMs: 70_000,
    attemptTimeoutMs: 65_507,
    remainingAtAttemptStartMs: 65_507,
  });
  await rewriteFailurePair(context, ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.phaseElapsedMs = 65_508;
    failure.operationElapsedMs = 65_508;
    failure.operationElapsedPreciseMs = 65_508;
    failure.operationBudgetMs = 65_507;
    timing.phases.at(-1).elapsedMs = 65_508;
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  });
  await assert.rejects(
    () => verifyRuntimeSmokeFailureEvidence({
      repositoryRoot: context.root,
      manifestPath: context.manifestPath,
      reportPath: context.reportPath,
      phaseTimingPath: context.phaseTimingPath,
    }),
    /runtime-smoke nested operation timeout is non-canonical/,
    "the external dynamic-allowance-as-budget record must remain rejected",
  );
}

{
  const context = await runtimeFailureFixture();
  await rewriteFailurePair(context, ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.phaseElapsedMs = 12_088;
    failure.operationId = "diagnostics-settle-evaluation";
    failure.operationElapsedMs = 10_000;
    failure.operationElapsedPreciseMs = 10_000.5;
    failure.operationBudgetMs = 10_000;
    failure.attemptTimeoutMs = 10_000;
    failure.remainingAtAttemptStartMs = 10_000;
    timing.phases.at(-1).elapsedMs = 12_088;
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  });
  const verified = await verifyRuntimeSmokeFailureEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
  });
  assert.equal(verified.failure.failureKind, "nested-operation-timeout");
  assert.equal(verified.failure.operationId, "diagnostics-settle-evaluation");
  assert.equal(verified.failure.operationBudgetMs, 10_000);
}

{
  const context = await runtimeFailureFixture();
  await rewriteFailurePair(context, ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.failureKind = "no-progress-watchdog";
    failure.phaseElapsedMs = 60_000;
    failure.operationId = null;
    failure.operationOutcome = null;
    failure.operationElapsedMs = null;
    failure.operationElapsedPreciseMs = null;
    failure.operationBudgetMs = null;
    failure.attemptTimeoutMs = null;
    failure.remainingAtAttemptStartMs = null;
    failure.deadlineReached = null;
    failure.watchdogBudgetMs = 60_000;
    timing.phases.at(-1).elapsedMs = 60_000;
    timing.phases.at(-1).outcome = "stalled";
    timing.phases.at(-1).performanceWarningExceeded = true;
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  });
  const verified = await verifyRuntimeSmokeFailureEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
  });
  assert.equal(verified.failure.failureKind, "no-progress-watchdog");
  assert.equal(verified.failure.watchdogBudgetMs, 60_000);
  assert.equal(verified.timing.phases.at(-1).outcome, "stalled");
}

{
  const context = await runtimeFailureFixture();
  await rewriteFailurePair(context, ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.failureKind = "unexpected-error";
    failure.phaseElapsedMs = 12_088;
    failure.operationId = null;
    failure.operationOutcome = null;
    failure.operationElapsedMs = null;
    failure.operationElapsedPreciseMs = null;
    failure.operationBudgetMs = null;
    failure.attemptTimeoutMs = null;
    failure.remainingAtAttemptStartMs = null;
    failure.deadlineReached = null;
    timing.phases.at(-1).elapsedMs = 12_088;
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  });
  const verified = await verifyRuntimeSmokeFailureEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
  });
  assert.equal(verified.failure.failureKind, "unexpected-error");
  assert.equal(verified.timing.phases.at(-1).outcome, "failed");
}

{
  const context = await runtimeFailureFixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    const substitutedSource = "f".repeat(40);
    const substitutedArtifact = "e".repeat(64);
    const substitutedBuildId = "substituted-build-id";
    manifest.source.commitSha = substitutedSource;
    manifest.artifact.sha256 = substitutedArtifact;
    manifest.build.nextBuildId = substitutedBuildId;
    manifest.tests[0].sourceCommitSha = substitutedSource;
    manifest.tests[0].artifactSha256 = substitutedArtifact;
    manifest.tests[0].nextBuildId = substitutedBuildId;
  });
  await assert.rejects(
    () => verifyRuntimeSmokeFailureEvidence({
      repositoryRoot: context.root,
      manifestPath: context.manifestPath,
      reportPath: context.reportPath,
      phaseTimingPath: context.phaseTimingPath,
    }),
    /source|artifact|build|metadata/i,
  );
}

{
  const context = await runtimeFailureFixture();
  await rewriteFailurePair(context, ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.failureKind = "phase-timeout";
    failure.phaseElapsedMs = 103_000;
    failure.operationId = null;
    failure.operationOutcome = null;
    failure.operationElapsedMs = null;
    failure.operationElapsedPreciseMs = null;
    failure.operationBudgetMs = null;
    failure.attemptTimeoutMs = null;
    failure.remainingAtAttemptStartMs = null;
    failure.deadlineReached = null;
    timing.phases.at(-1).elapsedMs = 103_000;
    timing.phases.at(-1).outcome = "timed-out";
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
    timing.phases.at(-1).performanceWarningExceeded = true;
  });
  const verified = await verifyRuntimeSmokeFailureEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
  });
  assert.equal(verified.failure.failureKind, "phase-timeout");
  assert.equal(verified.failure.operationId, null);
}

for (const mutate of [
  ({ report, timing }) => {
    timing.failure.operationId = null;
    timing.phases.at(-1).failure.operationId = null;
    report.runtimeSmokeFailure.operationId = null;
  },
  ({ report, timing }) => {
    timing.failure.operationBudgetMs = 10_000;
    timing.phases.at(-1).failure.operationBudgetMs = 10_000;
    report.runtimeSmokeFailure.operationBudgetMs = 10_000;
  },
  ({ report, timing }) => {
    timing.failure.operationElapsedMs = 69_999;
    timing.failure.operationElapsedPreciseMs = 69_999.75;
    timing.failure.deadlineReached = false;
    timing.phases.at(-1).failure.operationElapsedMs = 69_999;
    timing.phases.at(-1).failure.operationElapsedPreciseMs = 69_999.75;
    timing.phases.at(-1).failure.deadlineReached = false;
    report.runtimeSmokeFailure.operationElapsedMs = 69_999;
    report.runtimeSmokeFailure.operationElapsedPreciseMs = 69_999.75;
    report.runtimeSmokeFailure.deadlineReached = false;
  },
  ({ report, timing }) => {
    timing.failure.operationElapsedPreciseMs = 42_999.5;
    timing.phases.at(-1).failure.operationElapsedPreciseMs = 42_999.5;
    report.runtimeSmokeFailure.operationElapsedPreciseMs = 42_999.5;
  },
  ({ report, timing }) => {
    delete timing.failure.deadlineReached;
    delete timing.phases.at(-1).failure.deadlineReached;
    delete report.runtimeSmokeFailure.deadlineReached;
  },
  ({ timing }) => {
    timing.phases.at(-1).outcome = "timed-out";
  },
  ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.failureKind = "phase-timeout";
    failure.phaseBudgetMs = 42_000;
    failure.operationId = null;
    failure.operationOutcome = null;
    failure.operationElapsedMs = null;
    failure.operationElapsedPreciseMs = null;
    failure.operationBudgetMs = null;
    failure.attemptTimeoutMs = null;
    failure.remainingAtAttemptStartMs = null;
    failure.deadlineReached = null;
    timing.phases.at(-1).outcome = "timed-out";
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  },
  ({ report }) => {
    report.runtimeSmokeFailure.operationId = "final-diagnostics-snapshot";
  },
  ({ timing }) => {
    timing.failure = null;
  },
  ({ report, timing }) => {
    timing.failure.failureKind = "unknown-failure";
    timing.phases.at(-1).failure.failureKind = "unknown-failure";
    report.runtimeSmokeFailure.failureKind = "unknown-failure";
  },
  ({ report, timing }) => {
    timing.failure.phaseId = "reload-1";
    timing.phases.at(-1).failure.phaseId = "reload-1";
    report.runtimeSmokeFailure.phaseId = "reload-1";
  },
  ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.failureKind = "no-progress-watchdog";
    failure.phaseElapsedMs = 59_999;
    failure.operationId = null;
    failure.operationOutcome = null;
    failure.operationElapsedMs = null;
    failure.operationElapsedPreciseMs = null;
    failure.operationBudgetMs = null;
    failure.attemptTimeoutMs = null;
    failure.remainingAtAttemptStartMs = null;
    failure.deadlineReached = null;
    failure.watchdogBudgetMs = 60_000;
    timing.phases.at(-1).elapsedMs = 59_999;
    timing.phases.at(-1).outcome = "stalled";
    timing.phases.at(-1).performanceWarningExceeded = true;
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  },
  ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.failureKind = "terminal-lifecycle-error";
    failure.operationId = null;
    failure.operationOutcome = null;
    failure.operationElapsedMs = null;
    failure.operationElapsedPreciseMs = null;
    failure.operationBudgetMs = null;
    failure.attemptTimeoutMs = null;
    failure.remainingAtAttemptStartMs = null;
    failure.deadlineReached = null;
    timing.phases.at(-1).outcome = "terminal-error";
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  },
  ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.failureKind = "unexpected-error";
    failure.phaseElapsedMs = 103_001;
    failure.operationId = null;
    failure.operationOutcome = null;
    failure.operationElapsedMs = null;
    failure.operationElapsedPreciseMs = null;
    failure.operationBudgetMs = null;
    failure.attemptTimeoutMs = null;
    failure.remainingAtAttemptStartMs = null;
    failure.deadlineReached = null;
    timing.phases.at(-1).elapsedMs = 103_001;
    timing.phases.at(-1).outcome = "failed";
    timing.phases.at(-1).performanceWarningExceeded = true;
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  },
  ({ report, timing }) => {
    timing.failure.operationElapsedMs = 41_999;
    timing.phases.at(-1).failure.operationElapsedMs = 41_999;
    report.runtimeSmokeFailure.operationElapsedMs = 41_999;
  },
  ({ report, timing }) => {
    timing.failure.attemptTimeoutMs = 42_001;
    timing.phases.at(-1).failure.attemptTimeoutMs = 42_001;
    report.runtimeSmokeFailure.attemptTimeoutMs = 42_001;
  },
  ({ report, timing }) => {
    timing.failure.remainingAtAttemptStartMs = 42_001;
    timing.phases.at(-1).failure.remainingAtAttemptStartMs = 42_001;
    report.runtimeSmokeFailure.remainingAtAttemptStartMs = 42_001;
  },
  ({ report, timing }) => {
    const unsafeCause = {
      name: "RuntimeSmokeOperationTimeoutError",
      operationId: "diagnostics-settle-evaluation",
      operationElapsedMs: 9_999,
      operationElapsedPreciseMs: 9_999.75,
      operationBudgetMs: 10_000,
      attemptTimeoutMs: 10_000,
      remainingAtAttemptStartMs: 10_000,
      deadlineReached: false,
      message: "unbounded cause text is not portable evidence",
    };
    timing.failure.originalCause = unsafeCause;
    timing.phases.at(-1).failure.originalCause = unsafeCause;
    report.runtimeSmokeFailure.originalCause = unsafeCause;
  },
]) {
  const context = await runtimeFailureFixture();
  await rewriteFailurePair(context, mutate);
  await assert.rejects(
    () => verifyRuntimeSmokeFailureEvidence({
      repositoryRoot: context.root,
      manifestPath: context.manifestPath,
      reportPath: context.reportPath,
      phaseTimingPath: context.phaseTimingPath,
    }),
    /runtime-smoke/,
  );
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[1].startTimeRelativeMs =
      timing.phases[0].startTimeRelativeMs + timing.phases[0].elapsedMs - 1;
  });
  await expectRejected(context, "phase timing timeline is overlapping");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    const finalPhase = timing.phases.at(-1);
    finalPhase.startTimeRelativeMs = timing.wholeTestTimeoutMs - finalPhase.elapsedMs + 1;
  });
  await expectRejected(context, "exceeds the whole-test timeout");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[0].message = "private diagnostic text must not be retained";
  });
  await expectRejected(context, "phase timing outcomes are invalid");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[0].finalLifecycleState = "credential-bearing-private-state";
  });
  await expectRejected(context, "phase timing outcomes are invalid");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[0].performanceWarningThresholdMs += 1;
    timing.phases[0].performanceWarningExceeded = true;
  });
  await expectRejected(context, "phase timing outcomes are invalid");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[0].progressCheckpoints[1].name = "unsafe checkpoint/name";
  });
  await expectRejected(context, "phase timing outcomes are invalid");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[0].progressCheckpoints.pop();
  });
  await expectRejected(context, "phase timing outcomes are invalid");
}

{
  const openAiSecret = "gate-a3-ci-openai-placeholder";
  const context = await fixture({
    environmentOverrides: { OPENAI_API_KEY: openAiSecret },
    publicArtifactText: `embedded ${openAiSecret}\n`,
  });
  await assert.rejects(
    () =>
      createProductionEvidenceBundle({
        repositoryRoot: context.root,
        manifestPath: context.manifestPath,
        reportPath: context.reportPath,
        environment: {
          CERTIFICATION_QUALIFICATION_MODE: "1",
          OPENAI_API_KEY: openAiSecret,
        },
      }),
    /production artifact contains sensitive environment values: OPENAI_API_KEY/,
  );
}

{
  const context = await fixture({ recordRuntimeTest: false });
  const manifest = readManifest(context.root, context.manifestPath);
  const expectedVerifierSourceClosureSha256 =
    verifierSourceClosureSha256(context.root);
  const stagedRoot = createStagedArchiveTree(context);
  try {
    assert.equal(existsSync(path.join(stagedRoot, ".git")), false);
    assert.equal(existsSync(path.join(stagedRoot, context.reportPath)), false);
    assert.equal(existsSync(path.join(stagedRoot, context.phaseTimingPath)), false);

    const repositoryPreflight = runStagedVerifier(
      stagedRoot,
      "verify-preflight",
      manifest,
    );
    assert.notEqual(
      repositoryPreflight.status,
      0,
      `${repositoryPreflight.stdout}\n${repositoryPreflight.stderr}`,
    );
    assert.match(
      `${repositoryPreflight.stdout}\n${repositoryPreflight.stderr}`,
      /not a git repository|Unable to inspect the Git working tree/,
    );

    const finalStandalone = runStagedVerifier(
      stagedRoot,
      "verify-standalone",
      manifest,
    );
    assert.notEqual(finalStandalone.status, 0);
    assert.match(
      `${finalStandalone.stdout}\n${finalStandalone.stderr}`,
      /final standalone verification requires certification state and evidence root/,
    );

    const archivePreflight = runStagedVerifier(
      stagedRoot,
      "verify-archive-preflight",
      manifest,
    );
    assert.equal(
      archivePreflight.status,
      0,
      `actual staged archive-preflight CLI executes the physical staged verifier\n${archivePreflight.stdout}\n${archivePreflight.stderr}`,
    );
    const result = JSON.parse(archivePreflight.stdout);
    assert.deepEqual(
      {
        schema: result.schema,
        verificationMode: result.verificationMode,
        preflightPassed: result.preflightPassed,
        certificationComplete: result.certificationComplete,
        runtimeEvidenceRequired: result.runtimeEvidenceRequired,
        finalStandaloneVerificationRequired:
          result.finalStandaloneVerificationRequired,
      },
      {
        schema: PRODUCTION_EVIDENCE_VERIFICATION_RESULT_SCHEMA,
        verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.ARCHIVE_PREFLIGHT,
        preflightPassed: true,
        certificationComplete: false,
        runtimeEvidenceRequired: true,
        finalStandaloneVerificationRequired: true,
      },
    );
    assert.equal(result.candidateIdentifier, manifest.candidateIdentifier);
    assert.equal(result.source.commitSha, manifest.source.commitSha);
    assert.equal(result.source.treeSha, manifest.source.treeSha);
    assert.equal(result.artifact.nextBuildId, manifest.build.nextBuildId);
    assert.equal(result.artifact.sha256, manifest.artifact.sha256);
    assert.equal(result.semanticJournal.runNonce, manifest.execution.runNonce);
    assert.equal(
      result.verifierSourceClosure.fileCount,
      PRODUCTION_EVIDENCE_VERIFIER_SOURCE_PATHS.length,
    );
    const realStagedRoot = realpathSync(stagedRoot);
    for (const relativePath of PRODUCTION_EVIDENCE_VERIFIER_SOURCE_PATHS) {
      const stagedPath = realpathSync(path.join(stagedRoot, relativePath));
      assert.ok(stagedPath.startsWith(`${realStagedRoot}${path.sep}`));
      assert.notEqual(stagedPath, realpathSync(path.join(process.cwd(), relativePath)));
    }

    const archiveNegativeCases = [
      {
        name: "unknown mode",
        command: "verify-archive-future",
        expected: /Usage:/,
      },
      {
        name: "missing manifest",
        mutate(root) {
          rmSync(path.join(root, context.manifestPath));
        },
        expected: /production evidence manifest is missing/,
      },
      {
        name: "malformed manifest JSON",
        mutate(root) {
          writeFileSync(path.join(root, context.manifestPath), "{malformed\n");
        },
        expected: /not valid JSON/,
      },
      {
        name: "schema v2 manifest",
        async mutate(root) {
          await rewriteStagedManifest(root, (candidate) => {
            candidate.schema = "interior-ai.production-artifact-evidence.v2";
            candidate.validatorVersion = 2;
          });
        },
        expected: /unsupported production evidence schema/,
      },
      {
        name: "future manifest schema",
        async mutate(root) {
          await rewriteStagedManifest(root, (candidate) => {
            candidate.schema = "interior-ai.production-artifact-evidence.v99";
            candidate.validatorVersion = 99;
          });
        },
        expected: /unsupported production evidence schema/,
      },
      {
        name: "missing journal",
        mutate(root) {
          rmSync(
            path.join(
              root,
              ".local/production-artifact-evidence/semantic-event-journal.json",
            ),
          );
        },
        expected: /semantic event journal is missing/,
      },
      {
        name: "wrong journal schema",
        mutate(root) {
          const journalPath =
            ".local/production-artifact-evidence/semantic-event-journal.json";
          const journal = readStagedJson(root, journalPath);
          journal.schema =
            "interior-ai.production-artifact-semantic-event-journal.v1";
          journal.version = 1;
          writeStagedJson(root, journalPath, journal);
        },
        expected: /unsupported semantic event journal schema or version/,
      },
      {
        name: "candidate mismatch",
        mutate(root) {
          const journalPath =
            ".local/production-artifact-evidence/semantic-event-journal.json";
          const journal = readStagedJson(root, journalPath);
          journal.candidateIdentifier = "another-candidate";
          writeStagedJson(root, journalPath, journal);
        },
        expected: /candidate, commit, or tree does not match/,
      },
      {
        name: "commit mismatch",
        async mutate(root) {
          await rewriteStagedManifest(root, (candidate) => {
            candidate.source.commitSha = "f".repeat(40);
          });
        },
        expected: /another source commit|candidate, commit, or tree does not match/,
      },
      {
        name: "tree mismatch",
        async mutate(root) {
          await rewriteStagedManifest(root, (candidate) => {
            candidate.source.treeSha = "f".repeat(40);
          });
        },
        expected: /another source tree|candidate, commit, or tree does not match/,
      },
      {
        name: "nonce mismatch",
        async mutate(root) {
          await rewriteStagedManifest(root, (candidate) => {
            candidate.execution.runNonce =
              "123e4567-e89b-42d3-a456-426614174000";
          });
        },
        expected: /nonce, owner, or command binding is invalid/,
      },
      {
        name: "Build ID mismatch",
        async mutate(root) {
          await rewriteStagedManifest(root, (candidate) => {
            candidate.build.nextBuildId = "another-build-id";
          });
        },
        expected: /another Build ID|Build ID does not match/,
      },
      {
        name: "artifact hash mismatch",
        async mutate(root) {
          await rewriteStagedManifest(root, (candidate) => {
            candidate.artifact.sha256 = "f".repeat(64);
          });
        },
        expected: /another artifact|artifact SHA-256 mismatch/,
      },
      {
        name: "artifact inventory mismatch",
        mutate(root) {
          const snapshotPath = path.join(
            root,
            ".local/production-artifact-evidence/artifact-inventory.json",
          );
          writeFileSync(snapshotPath, `${readFileSync(snapshotPath, "utf8")} `);
        },
        expected: /artifact inventory snapshot SHA-256 mismatch/,
      },
      {
        name: "missing archived file",
        mutate(root) {
          rmSync(path.join(root, ".next/build-manifest.json"));
        },
        expected: /Required production artifact path is missing/,
      },
      {
        name: "extra prohibited archived file",
        mutate(root) {
          write(root, ".git/config", "[core]\n");
        },
        expected: /contains prohibited path: \.git/,
      },
      {
        name: "missing verifier contract module",
        mutate(root) {
          rmSync(path.join(root, "scripts/production-artifact-contract.mjs"));
        },
        expected:
          /verifier local import is missing: scripts\/production-artifact-evidence\.mjs -> \.\/production-artifact-contract\.mjs/,
      },
      {
        name: "verifier import escapes staged archive",
        mutate(root) {
          const target = path.join(root, "scripts/production-artifact-contract.mjs");
          rmSync(target);
          symlinkSync(
            path.join(process.cwd(), "scripts/production-artifact-contract.mjs"),
            target,
          );
        },
        expected: /verifier source must be a physical regular file/,
      },
      {
        name: "contained verifier source tampering",
        mutate(root) {
          const target = path.join(
            root,
            "scripts/runtime-smoke-telemetry-bootstrap-contract.mjs",
          );
          writeFileSync(target, "process.exit(0);\n");
        },
        expected: /verifier source closure SHA-256 mismatch/,
      },
      {
        name: "generated-source build ordering violation",
        mutate(root) {
          const journalPath =
            ".local/production-artifact-evidence/semantic-event-journal.json";
          const journal = readStagedJson(root, journalPath);
          journal.events.generatedSourceCheck.completedAt =
            "2026-07-31T00:00:02.500Z";
          writeStagedJson(root, journalPath, journal);
        },
        expected: /predates|ordering is invalid|generated-source evidence is incomplete/,
      },
      {
        name: "build failure",
        mutate(root) {
          const journalPath =
            ".local/production-artifact-evidence/semantic-event-journal.json";
          const journal = readStagedJson(root, journalPath);
          journal.events.build.status = "failed";
          journal.events.build.exitCode = 1;
          journal.events.build.failureKind = "child_exit_nonzero";
          writeStagedJson(root, journalPath, journal);
        },
        expected: /complete successful build|build evidence is incomplete|artifact inventory started before the build succeeded/,
      },
      {
        name: "incomplete artifact inventory",
        mutate(root) {
          const journalPath =
            ".local/production-artifact-evidence/semantic-event-journal.json";
          const journal = readStagedJson(root, journalPath);
          journal.events.artifactInventory.status = "running";
          journal.events.artifactInventory.completedAt = null;
          journal.bindings = {
            artifactInventory: null,
            nextBuildId: null,
            artifactSha256: null,
          };
          writeStagedJson(root, journalPath, journal);
        },
        expected: /artifact inventory|manifest was claimed/,
      },
      {
        name: "incomplete manifest",
        mutate(root) {
          const journalPath =
            ".local/production-artifact-evidence/semantic-event-journal.json";
          const journal = readStagedJson(root, journalPath);
          journal.manifest = { status: "pending", createdAt: null };
          writeStagedJson(root, journalPath, journal);
        },
        expected: /manifest completion|completion state is contradictory/,
      },
      {
        name: "partial test evidence",
        async mutate(root) {
          await rewriteStagedManifest(root, (candidate) => {
            candidate.tests = [{ name: "runtime-smoke" }];
            candidate.repositoryEvidence.status = "failed";
          });
        },
        expected: /required test report|runtime-smoke/,
      },
      {
        name: "relative machine source fallback",
        async mutate(root) {
          await rewriteStagedManifest(root, (candidate) => {
            candidate.source.sourceWorktreePath = "../canonical-checkout";
          });
        },
        expected: /archive preflight source identity shape is malformed/,
      },
      {
        name: "unsafe absolute portable path",
        async mutate(root) {
          await rewriteStagedManifest(root, (candidate) => {
            candidate.execution.owner.wrapper.path =
              "/tmp/production-artifact-evidence.mjs";
          });
        },
        expected: /unsafe absolute portable fields/,
      },
    ];

    for (const testCase of archiveNegativeCases) {
      const negativeRoot = cloneStagedArchiveTree(stagedRoot);
      try {
        await testCase.mutate?.(negativeRoot);
        const rejected = runStagedVerifier(
          negativeRoot,
          testCase.command ?? "verify-archive-preflight",
          manifest,
          {
            PRODUCTION_EVIDENCE_EXPECTED_VERIFIER_SOURCE_CLOSURE_SHA256:
              expectedVerifierSourceClosureSha256,
          },
        );
        assert.notEqual(rejected.status, 0, `${testCase.name} must fail closed`);
        assert.match(
          `${rejected.stdout}\n${rejected.stderr}`,
          testCase.expected,
          testCase.name,
        );
      } finally {
        rmSync(negativeRoot, { recursive: true, force: true });
      }
    }

    const secretRoot = cloneStagedArchiveTree(stagedRoot);
    const syntheticSecret = "synthetic-archive-preflight-secret-never-print";
    try {
      writeFileSync(
        path.join(secretRoot, context.manifestPath),
        `{"credential":"${syntheticSecret}"`,
      );
      const rejected = runStagedVerifier(
        secretRoot,
        "verify-archive-preflight",
        manifest,
        { SYNTHETIC_ARCHIVE_PREFLIGHT_SECRET: syntheticSecret },
      );
      assert.notEqual(rejected.status, 0);
      assert.doesNotMatch(
        `${rejected.stdout}\n${rejected.stderr}`,
        new RegExp(syntheticSecret),
      );
    } finally {
      rmSync(secretRoot, { recursive: true, force: true });
    }
  } finally {
    rmSync(stagedRoot, { recursive: true, force: true });
    rmSync(context.root, { recursive: true, force: true });
  }
}

{
  const context = await fixture();
  const manifest = readManifest(context.root, context.manifestPath);
  const stagedRoot = createStagedArchiveTree(context);
  try {
    const finalStandalone = runStagedVerifier(
      stagedRoot,
      "verify-standalone",
      manifest,
    );
    assert.notEqual(finalStandalone.status, 0);
    assert.match(
      `${finalStandalone.stdout}\n${finalStandalone.stderr}`,
      /final standalone verification requires certification state and evidence root/,
    );

    const archivePreflight = runStagedVerifier(
      stagedRoot,
      "verify-archive-preflight",
      manifest,
    );
    assert.equal(archivePreflight.status, 0);
    const preflightResult = JSON.parse(archivePreflight.stdout);
    assert.equal(preflightResult.preflightPassed, true);
    assert.equal(preflightResult.certificationComplete, false);
    assert.equal(preflightResult.finalStandaloneVerificationRequired, true);
    const preflightResultPath =
      ".local/production-artifact-evidence/archive-preflight-result.json";
    writeStagedJson(stagedRoot, preflightResultPath, preflightResult);
    const substitutedFinal = runStagedVerifier(
      stagedRoot,
      "verify-standalone",
      manifest,
      { PRODUCTION_EVIDENCE_MANIFEST: preflightResultPath },
    );
    assert.notEqual(
      substitutedFinal.status,
      0,
      "an archive-preflight result must not substitute for final standalone evidence",
    );
  } finally {
    rmSync(stagedRoot, { recursive: true, force: true });
    rmSync(context.root, { recursive: true, force: true });
  }
}

{
  const context = await fixture();
  const manifest = readManifest(context.root, context.manifestPath);
  rmSync(path.join(context.root, ".git"), { recursive: true, force: true });
  rmSync(path.join(context.root, "node_modules"), { recursive: true, force: true });
  const result = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.STANDALONE_FINAL,
    expectedSourceCommitSha: manifest.source.commitSha,
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true, "downloaded evidence must verify without Git or node_modules");

  const mismatched = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.STANDALONE_FINAL,
    expectedSourceCommitSha: "f".repeat(40),
  });
  assert.equal(mismatched.valid, false);
  assert.ok(
    mismatched.issues.includes("standalone evidence belongs to another source commit"),
  );
}

{
  const context = await fixture();
  const manifestBytes = readFileSync(path.join(context.root, context.manifestPath));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const test = manifest.tests.find((entry) => entry.name === "runtime-smoke");
  const stageProfile = certificationEnvironmentProfile(
    process.cwd(),
    "runtime-smoke",
  );
  const stageEnvironment = projectCertificationChildEnvironment({
    repositoryRoot: process.cwd(),
    baseEnvironment: {
      APP_ENV: "staging",
      CATALOG_STRICT_VALIDATION: "true",
      CI: "true",
      NEXT_PUBLIC_APP_ENV: "staging",
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
    },
    stage: "runtime-smoke",
    profileId: "runtime-smoke",
    stageInputs: {
      CERTIFICATION_ENVIRONMENT_STAGE: "runtime-smoke",
      CERTIFICATION_RUNTIME_STAGE_ATTEMPT: "1",
      CERTIFICATION_RUNTIME_START_MARKER_PATH: "/private/tmp/stable/marker.json",
      CERTIFICATION_STAGE_ENVIRONMENT_CONTRACT_SHA256:
        stageProfile.contract.sha256,
      CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_ID: stageProfile.id,
      CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_SHA256: stageProfile.sha256,
      DATABASE_URL:
        "postgresql://interior_ai_cert_stage_dddddddddddddddddddddddddddddddd:fixture@127.0.0.1:5432/interior_ai_gate_a3_test_cert_dddddddddddddddddddddddddddddddd",
      GOOGLE_CLIENT_ID: "fixture.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-fixture-placeholder",
      PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT: "/private/tmp/stable/evidence",
      PLAYWRIGHT_JSON_OUTPUT_FILE: "/private/tmp/stable/evidence/report.json",
      PLAYWRIGHT_USE_PRODUCTION_SERVER: "1",
      PRODUCTION_CERTIFICATION_ID:
        `stable-runtime-smoke:123:1:${manifest.source.commitSha.slice(0, 12)}`,
      PRODUCTION_EVIDENCE_CANDIDATE_ID: manifest.candidateIdentifier,
      PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256: manifest.artifact.sha256,
      PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: manifest.build.nextBuildId,
      PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: manifest.source.commitSha,
      PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE: manifest.execution.runNonce,
      PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_SHA256: "c".repeat(64),
      PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256: createHash("sha256")
        .update(manifestBytes)
        .digest("hex"),
      PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: manifest.source.treeSha,
      PRODUCTION_EVIDENCE_JOURNAL_PATH:
        ".local/production-artifact-evidence/semantic-event-journal.json",
      PRODUCTION_EVIDENCE_MANIFEST: context.manifestPath,
      RUNTIME_SMOKE_PHASE_TIMINGS_PATH:
        "/private/tmp/stable/evidence/timings.json",
    },
  }).metadata;
  const summary = {
    schema: "interior-ai.stable-runtime-smoke-evidence.v1",
    classification: "REPOSITORY_STABLE_RUNTIME_SMOKE_ONLY",
    releaseCertification: false,
    identity: {
      certificationId:
        `stable-runtime-smoke:123:1:${manifest.source.commitSha.slice(0, 12)}`,
      candidateId: manifest.candidateIdentifier,
      sourceCommitSha: manifest.source.commitSha,
      sourceTreeSha: manifest.source.treeSha,
      buildId: manifest.build.nextBuildId,
      artifactSha256: manifest.artifact.sha256,
      manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
      journalSha256: "c".repeat(64),
      journalNonce: manifest.execution.runNonce,
    },
    authFixtureContinuity: manifest.build.authFixtureContinuity,
    database: {
      lifecycleClassification: "STABLE_RUNTIME_SMOKE_ONLY",
      databaseName:
        "interior_ai_gate_a3_test_cert_dddddddddddddddddddddddddddddddd",
      databaseIdentitySha256: "d".repeat(64),
      roleName: "interior_ai_cert_stage_dddddddddddddddddddddddddddddddd",
      scopedRoleClassification: "private-stage-login-no-admin",
      transportClassification: "native-loopback",
      transportAttestationSha256: null,
      transportVerificationStatus: "verified-live",
      imageClassification: null,
      migrationCount: 43,
      finalState: "stable-absence-verified",
      targetAbsent: true,
    },
    stageEnvironment,
    evidence: {
      rawReport: {
        path: "runtime-smoke/playwright-report.json",
        sha256: "e".repeat(64),
      },
      portableReport: {
        path: ".local/production-artifact-evidence/runtime-smoke.json",
        sha256: test.report.sha256,
      },
      timings: {
        path: ".local/production-artifact-evidence/runtime-smoke-phases.json",
        sha256: test.phaseTimings.sha256,
      },
      startMarker: {
        path: "runtime-smoke/product-test-start.json",
        sha256: "f".repeat(64),
      },
    },
    stats: test.stats,
    complete: true,
  };
  write(context.root, STABLE_PORTABLE_SUMMARY_PATH, `${JSON.stringify(summary)}\n`);
  const verified = await verifyStableRuntimeSmokeStandalone({
    repositoryRoot: context.root,
    environment: {
      CERTIFICATION_QUALIFICATION_MODE: "1",
      PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: manifest.source.commitSha,
    },
  });
  assert.equal(verified.classification, "STABLE_RUNTIME_SMOKE_STANDALONE_VERIFIED");
  assert.equal(verified.releaseCertification, false);
  assert.equal(verified.databaseTargetAbsent, true);
  write(context.root, STABLE_PORTABLE_SUMMARY_PATH, `${JSON.stringify({
    ...summary,
    database: { ...summary.database, targetAbsent: false },
  })}\n`);
  await assert.rejects(
    () => verifyStableRuntimeSmokeStandalone({
      repositoryRoot: context.root,
      environment: {
        CERTIFICATION_QUALIFICATION_MODE: "1",
        PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: manifest.source.commitSha,
      },
    }),
    /database absence is unproved/,
  );
}

{
  const context = await fixture();
  const manifest = readManifest(context.root, context.manifestPath);
  const bundle = await createProductionEvidenceBundle({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
  });
  const absoluteBundlePath = path.join(context.root, bundle.bundlePath);
  const archiveBytes = readFileSync(absoluteBundlePath);
  const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
  assert.equal(bundle.bundleSha256, archiveSha256);
  assert.equal(
    readFileSync(`${absoluteBundlePath}.sha256`, "utf8"),
    `${archiveSha256}  ${path.basename(absoluteBundlePath)}\n`,
  );

  const archiveEntries = execFileSync("tar", ["-tzf", absoluteBundlePath], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .map((entry) => entry.replace(/\/$/, ""));
  const allowedFiles = new Set([
    ".nvmrc",
    "package.json",
    "package-lock.json",
    ...PRODUCTION_EVIDENCE_VERIFIER_SOURCE_PATHS,
    context.manifestPath,
    `${context.manifestPath}.sha256`,
    context.reportPath,
    ".local/production-artifact-evidence/runtime-smoke-phases.json",
  ]);
  const allowedDirectories = new Set([
    ".next",
    "public",
    "scripts",
    ".local",
    ".local/production-artifact-evidence",
  ]);
  for (const entry of archiveEntries) {
    assert.ok(
      allowedFiles.has(entry) ||
        allowedDirectories.has(entry) ||
        entry.startsWith(".next/") ||
        entry.startsWith("public/"),
      `standalone archive contains non-allowlisted input ${entry}`,
    );
    assert.equal(
      /^(?:\.next\/(?:cache|dev|diagnostics|trace))(?:\/|$)/.test(entry),
      false,
      `standalone archive contains mutable artifact path ${entry}`,
    );
  }

  const extractedRoot = mkdtempSync(path.join(tmpdir(), "ch-0016-bundle-roundtrip-"));
  execFileSync("tar", ["-xzf", absoluteBundlePath, "-C", extractedRoot]);
  const extractedLink = path.join(extractedRoot, ".next/server/public-asset-link");
  assert.equal(lstatSync(extractedLink).isSymbolicLink(), true);
  assert.equal(readlinkSync(extractedLink), "../../public/asset.txt");
  const standaloneResult = spawnSync(
    process.execPath,
    ["scripts/production-artifact-evidence.mjs", "verify-standalone"],
    {
      cwd: extractedRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: manifest.source.commitSha,
      },
    },
  );
  assert.notEqual(standaloneResult.status, 0);
  assert.match(
    `${standaloneResult.stdout}\n${standaloneResult.stderr}`,
    /final standalone verification requires certification state and evidence root/,
  );
}

{
  const context = await fixture();
  const packagePath = path.join(context.root, "package.json");
  const packageBefore = readFileSync(packagePath, "utf8");
  await assert.rejects(
    () =>
      createProductionEvidenceBundle({
        repositoryRoot: context.root,
        manifestPath: context.manifestPath,
        reportPath: context.reportPath,
        bundlePath: "bundle.tar.gz",
      }),
    /evidence bundle path must be exactly/,
  );
  assert.equal(
    readFileSync(packagePath, "utf8"),
    packageBefore,
    "an unsafe bundle override must be rejected before any repository mutation",
  );
}

{
  const context = await fixture();
  write(context.root, "generated/runtime.ts", "export const generated = false;\n");
  await expectRejected(context, "working tree is not clean");
}

{
  const context = await fixture();
  write(context.root, "untracked-source.js", "throw new Error('untracked build influence');\n");
  await expectRejected(context, "untracked source files are present");
}

{
  const context = await fixture();
  write(context.root, "next.config.local.js", "throw new Error('ignored build influence');\n");
  await expectRejected(context, "ignored files could influence the build");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.source.commitSha = "f".repeat(40);
  });
  await expectRejected(context, "source commit does not match HEAD");
}

{
  const context = await fixture();
  write(context.root, "package-lock.json", `${JSON.stringify({
    name: "evidence-fixture-changed",
    lockfileVersion: 3,
    packages: {},
  }, null, 2)}\n`);
  await expectRejected(context, "lockfile SHA-256 mismatch");
}

{
  const context = await fixture();
  rmSync(path.join(context.root, "package-lock.json"));
  await expectRejected(context, "required lockfile is missing");
}

{
  const context = await fixture();
  write(context.root, "node_modules/.package-lock.json", "tampered installed identity\n");
  await expectRejected(context, "installed dependency identity does not match");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.generatedSourceCheck.status = "failed";
  });
  await expectRejected(context, "generated-source drift check did not pass");
}

{
  const context = await fixture();
  write(context.root, ".next/server/app.js", "tampered server output\n");
  await expectRejected(context, "artifact SHA-256 mismatch");
}

{
  const context = await fixture();
  write(context.root, ".next/BUILD_ID", "build-fixture-from-another-run\n");
  await expectRejected(context, "Next.js BUILD_ID does not match the recorded build");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.generatedSourceCheck.mtime = manifest.generatedSourceCheck.completedAt;
    manifest.build.birthtime = manifest.build.startedAt;
  });
  await expectRejected(context, "filesystem timestamps cannot populate portable semantic evidence");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.schema = "interior-ai.production-artifact-evidence.v2";
    manifest.validatorVersion = 2;
    manifest.generatedSourceCheck.completedAt = "2026-07-31T00:00:04.500Z";
  });
  await expectRejected(context, "unsupported production evidence schema or validator version");
  await expectRejected(context, "evidence timestamps are stale or contradictory");
}

{
  const context = await fixture();
  const outside = path.join(tmpdir(), `ch-0016-symlink-${process.pid}.txt`);
  writeFileSync(outside, "outside repository\n");
  symlinkSync(outside, path.join(context.root, ".next/server/outside-link"));
  await expectRejected(context, "Production artifact symlink .next/server/outside-link escapes");
  rmSync(outside);
}

{
  const context = await fixture();
  symlinkSync(
    path.join(context.root, ".git/config"),
    path.join(context.root, ".next/server/prohibited-link"),
  );
  await expectRejected(context, "targets prohibited path .git/config");
}

{
  const context = await fixture();
  write(context.root, context.reportPath, "{\"tampered\":true}\n");
  await expectRejected(context, "test report SHA-256 mismatch");
}

{
  const context = await fixture();
  rmSync(path.join(context.root, context.reportPath));
  await expectRejected(context, "required test report is missing");
}

{
  const context = await fixture();
  rmSync(path.join(context.root, context.manifestPath));
  await expectRejected(context, "production evidence manifest is missing");
}

{
  const context = await fixture();
  rmSync(path.join(context.root, ".next/build-manifest.json"));
  await expectRejected(context, "Required production artifact path is missing");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.applicationEnvironment = "development";
  });
  await expectRejected(context, "production evidence environment must be staging or production");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.mode = "development";
  });
  await expectRejected(context, "development-mode evidence is not accepted");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.environmentIdentity.nextPublicAppEnv = "production";
  });
  await expectRejected(context, "recorded application environment identity is contradictory");
}

await assert.rejects(
  () => fixture({ environmentOverrides: { NEXT_PUBLIC_APP_ENV: "production" } }),
  /NEXT_PUBLIC_APP_ENV must exactly match APP_ENV/,
);

await assert.rejects(
  () => fixture({ environmentOverrides: { VERCEL_ENV: "production" } }),
  /VERCEL_ENV contradicts APP_ENV/,
);

await assert.rejects(
  () => fixture({ environmentOverrides: { APP_ENV: "unknown" } }),
  /APP_ENV must exactly match the recorded production evidence environment/,
);

await assert.rejects(
  () => fixture({ environmentOverrides: { APP_ENV: undefined } }),
  /APP_ENV must exactly match the recorded production evidence environment/,
);

await assert.rejects(
  () => fixture({ environmentOverrides: { OPENAI_API_KEY: undefined } }),
  /required staging configuration shape is incomplete/,
);

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.catalogStrictValidation = false;
  });
  await expectRejected(context, "strict catalog validation was not enabled");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.developmentOnlyFlags.NEXT_PUBLIC_ENABLE_TEST_FIXTURES = true;
  });
  await expectRejected(context, "development-only flags are enabled");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].stats.unexpected = 1;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "required test report contains failures or flaky tests");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].processExitCode = 1;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "production smoke command exited nonzero");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].stats.flaky = 1;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "required test report contains failures or flaky tests");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].stats.expected = 0;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "required test report contains zero passing tests");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].stats.skipped = 1;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "critical production smoke contains skipped tests");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.forbidOnly = false;
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "focused .only execution is forbidden");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.suites[0].specs.pop();
  report.stats.expected = 1;
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "requirement runtime.health-catalog-ready is missing");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.projects[0].name = "webkit";
  report.suites[0].specs.forEach((spec) => {
    spec.tests[0].projectId = "webkit";
    spec.tests[0].projectName = "webkit";
  });
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "required project chromium is missing");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].artifactSha256 = "0".repeat(64);
  });
  await expectRejected(context, "test report is bound to another artifact");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.serverCommand = "npm run dev";
  });
  await expectRejected(context, "build or production-server command is not canonical");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.webServer.command = "npm run dev";
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "test report does not prove the canonical non-reused production server");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.webServer.reuseExistingServer = true;
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "test report does not prove the canonical non-reused production server");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].completedAt = "2026-07-31T00:00:03.000Z";
  });
  await expectRejected(context, "test evidence predates the recorded artifact");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.createdAt = "July 31 2026 00:00:04 UTC";
  });
  await expectRejected(context, "evidence timestamps must use valid UTC ISO 8601 values");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].completedAt = "2026-07-31T08:00:05+08:00";
  });
  await expectRejected(context, "test evidence timestamp must use valid UTC ISO 8601 format");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.externalControls[0].status = "verified";
  });
  await expectRejected(context, "external controls must remain not_verified");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.repositoryEvidence.statement =
      "Repository evidence proves the Vercel production deployment is verified.";
  });
  await expectRejected(context, "repository evidence claim is not canonical");
}

{
  const context = await fixture();
  write(context.root, ".next/server/app.js.nft.json", `${JSON.stringify({
    version: 1,
    files: ["../../missing-runtime-file"],
  })}\n`);
  await expectRejected(context, "traced output contains missing files");
}

{
  const context = await fixture();
  for (const nftPath of [
    ".next/server/app.js.nft.json",
    ...FLOOR_PLAN_ROUTE_NFT_PATHS,
  ]) {
    rmSync(path.join(context.root, nftPath));
  }
  await expectRejected(context, "traced output inventory is empty");
}

{
  const context = await fixture();
  const manifestAbsolutePath = path.join(context.root, context.manifestPath);
  writeFileSync(manifestAbsolutePath, `${readFileSync(manifestAbsolutePath, "utf8")} `);
  await expectRejected(context, "manifest SHA-256 sidecar mismatch");
}

{
  const secretFixture = "postgresql://secret-user:secret-password@example.test/private";
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = secretFixture;
  try {
    const context = await fixture();
    const manifestBytes = readFileSync(path.join(context.root, context.manifestPath), "utf8");
    assert.equal(manifestBytes.includes(secretFixture), false);
    assert.equal(manifestBytes.includes("secret-password"), false);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.metadata.productionArtifactEvidence.authToken = "not-recordable";
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "test report contains prohibited secret-bearing fields");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.configFile = "/home/runner/substituted/playwright.config.ts";
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "test report contains non-canonical or machine-local Playwright paths");
}

{
  const root = mkdtempSync(path.join(tmpdir(), "ch-0016-vercel-source-"));
  write(root, ".gitignore", "*.local.js\n");
  write(root, "tracked.js", "export const tracked = true;\n");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "CH-0016 test"]);
  git(root, ["config", "user.email", "ch-0016@example.test"]);
  git(root, ["add", ".gitignore", "tracked.js"]);
  git(root, ["commit", "-qm", "fixture"]);
  assert.equal((await inspectGitTree(root)).clean, true);
  write(root, "untracked.js", "export const untracked = true;\n");
  assert.equal((await inspectGitTree(root)).clean, false);
  rmSync(path.join(root, "untracked.js"));
  write(root, "next.config.local.js", "throw new Error('ignored');\n");
  const ignoredResult = await inspectGitTree(root);
  assert.equal(ignoredResult.clean, false);
  assert.deepEqual(ignoredResult.ignoredInfluentialFiles, ["next.config.local.js"]);
}

{
  const context = await fixture();
  const secretFixture = "fixture-report-secret-value";
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = secretFixture;
  try {
    const manifest = readManifest(context.root, context.manifestPath);
    const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
    report.config.metadata.productionArtifactEvidence.note = secretFixture;
    write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    manifest.tests[0].report.sha256 = "0".repeat(64);
    await writeProductionEvidenceManifest({
      repositoryRoot: context.root,
      manifestPath: context.manifestPath,
      manifest,
    });
    await expectRejected(context, "test report contains sensitive environment values");
  } finally {
    if (previous === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous;
  }
}

assert.equal(PRODUCTION_EVIDENCE_SERVER_COMMAND, "npm run evidence:production:serve");
const playwrightConfiguration = readFileSync(
  path.join(process.cwd(), "playwright.config.ts"),
  "utf8",
);
assert.match(
  playwrightConfiguration,
  /command: productionArtifactEvidence[\s\S]{0,160}productionArtifactEvidence\.serverCommand[\s\S]{0,160}useProductionServer[\s\S]{0,100}"npm run start -- --hostname 127\.0\.0\.1"[\s\S]{0,100}"npm run dev"/,
  "production artifact evidence must select its verified server before any dev fallback",
);
assert.match(
  playwrightConfiguration,
  /reuseExistingServer: productionArtifactEvidence \|\| directRuntimeSmokeIdentity \|\| useProductionServer \? false/,
  "production artifact evidence must never reuse an unrelated listener",
);
assert.match(
  playwrightConfiguration,
  /captureGitInfo:\s*\{\s*commit:\s*false,\s*diff:\s*false\s*\}/,
  "portable reports must not capture a source diff that can contain configured secrets",
);
const proVisualPlaywrightConfiguration = readFileSync(
  path.join(process.cwd(), "playwright.pro-visual.config.ts"),
  "utf8",
);
assert.match(
  proVisualPlaywrightConfiguration,
  /captureGitInfo:\s*\{\s*commit:\s*false,\s*diff:\s*false\s*\}/,
  "the required Pro visual report must not capture a secret-bearing CI diff",
);
const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8");
assert.equal(workflow.includes('CATALOG_STRICT_VALIDATION: "false"'), false);
assert.match(workflow, /npm run evidence:production:build/);
assert.match(workflow, /npm run evidence:production:stable-runtime-smoke/);
assert.doesNotMatch(workflow, /npm run evidence:production:(?:smoke|bundle|verify)\b/);
assert.match(workflow, /\.local\/production-artifact-evidence\/upload\//);
const vercelManifestSource = readFileSync(
  path.join(process.cwd(), "scripts/vercel-output-manifest.mjs"),
  "utf8",
);
assert.match(vercelManifestSource, /--untracked-files=all/);
assert.match(vercelManifestSource, /--ignored/);
assert.match(vercelManifestSource, /gitUntrackedFilesChecked: true/);
assert.match(vercelManifestSource, /gitIgnoredInfluentialFilesChecked: true/);
const nextConfiguration = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
for (const requiredExclusion of ["./.env*", "./.git/**/*", "./.local/**/*", "./.vercel/**/*", "./release-evidence-private/**/*"]) {
  assert.ok(
    nextConfiguration.includes(requiredExclusion),
    `missing traced-output exclusion ${requiredExclusion}`,
  );
}
const catalogRuntime = readFileSync(path.join(process.cwd(), "lib/catalog-runtime.ts"), "utf8");
const rootLayout = readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8");
assert.match(catalogRuntime, /isProdLike \|\| process\.env\.CATALOG_STRICT_VALIDATION === "true"/);
assert.match(rootLayout, /validateCatalogOrThrow\(\)/);
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "ts-node",
    "--transpile-only",
    "--compiler-options",
    '{"module":"CommonJS","moduleResolution":"node"}',
    "-e",
    'import assert from "node:assert/strict"; import { CatalogValidator } from "./lib/catalog-validation"; const result = new CatalogValidator().validateCatalog({ invalid: { id: "invalid" } }); assert.equal(result.valid, false); assert.ok(result.summary.invalid > 0);',
  ],
  { cwd: process.cwd(), stdio: "pipe" },
);
console.log("CH-0016 production artifact evidence tests passed.");
