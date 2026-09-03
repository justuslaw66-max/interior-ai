import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";

import {
  createProductionEvidenceBundle,
  recordProductionEvidenceTest,
  validateProductionEvidence,
  writeProductionEvidenceManifest,
} from "./production-artifact-evidence.mjs";
import { PRODUCTION_EVIDENCE_VERIFICATION_MODES } from "./production-artifact-contract.mjs";
import {
  STABLE_RUNTIME_SMOKE_DATABASE_PROFILE,
} from "./production-certification-database-contract.mjs";
import {
  abortCertificationDatabase,
  bindCertificationDatabaseStage,
  completeStableRuntimeSmokeDatabase,
  createStableRuntimeSmokeDatabaseBinding,
  planCertificationDatabase,
  provisionCertificationDatabase,
  readCertificationDatabaseLifecycle,
  resolveCertificationDatabaseStageEnvironment,
  verifyInitialCertificationDatabase,
} from "./production-certification-database-lifecycle.mjs";
import {
  STABLE_BUNDLE_PATH,
  STABLE_JOURNAL_PATH,
  STABLE_MANIFEST_PATH,
  STABLE_PORTABLE_REPORT_PATH,
  STABLE_PORTABLE_SUMMARY_PATH,
  STABLE_PORTABLE_TIMING_PATH,
  createPortableStableRuntimeEvidence,
  createStableRuntimeFailureAttribution,
  createStableRuntimeProjection,
  createStableRuntimeRoots,
  removeStableRuntimeRoot,
  requiredStableRuntimeInput,
  stableRuntimePaths,
  stableSha256,
  writeStableRuntimeSummary,
} from "./stable-runtime-smoke-resources.mjs";
import { configureStableRuntimeDatabaseTransport } from "./stable-runtime-smoke-database-transport.mjs";

const RUNTIME_COMMAND =
  "npx playwright test tests/e2e/00-runtime-smoke.spec.ts --project=chromium";

async function cleanupDatabase({ repositoryRoot, lifecycleEnvironment }) {
  return completeStableRuntimeSmokeDatabase({
    repositoryRoot,
    environment: lifecycleEnvironment,
  });
}

async function abortDatabase({ repositoryRoot, lifecycleEnvironment, failure }) {
  if (!lifecycleEnvironment?.CERTIFICATION_DATABASE_LIFECYCLE_PATH ||
      !existsSync(lifecycleEnvironment.CERTIFICATION_DATABASE_LIFECYCLE_PATH)) return true;
  const current = readCertificationDatabaseLifecycle({ repositoryRoot, environment: lifecycleEnvironment });
  if (new Set([
    "absence-verified",
    "stable-absence-verified",
    "abort-absence-verified",
  ]).has(current.evidence.currentState)) {
    return true;
  }
  const result = await abortCertificationDatabase({
    repositoryRoot,
    environment: lifecycleEnvironment,
    originalFailure: failure,
  });
  return result.evidence.currentState === "abort-absence-verified";
}

function createLifecycleEnvironment({ environment, manifest, roots }) {
  const lifecycleEnvironment = {
    ...environment,
    CERTIFICATION_DATABASE_ADMIN_URL: requiredStableRuntimeInput(
      environment,
      "CERTIFICATION_DATABASE_ADMIN_URL",
    ),
    CERTIFICATION_DATABASE_LIFECYCLE_PATH: path.join(
      roots.evidenceRoot,
      "database/lifecycle.json",
    ),
    CERTIFICATION_EVIDENCE_ROOT: roots.evidenceRoot,
    CERTIFICATION_EXPECTED_COMMIT_SHA: manifest.source.commitSha,
    CERTIFICATION_EXPECTED_TREE_SHA: manifest.source.treeSha,
    CERTIFICATION_WORKTREE_ROOT: roots.privateRoot,
    PRODUCTION_CERTIFICATION_ID: roots.owner.certificationId,
    PRODUCTION_EVIDENCE_CANDIDATE_ID: manifest.candidateIdentifier,
  };
  delete lifecycleEnvironment.DATABASE_URL;
  mkdirSync(path.dirname(lifecycleEnvironment.CERTIFICATION_DATABASE_LIFECYCLE_PATH), {
    mode: 0o700,
  });
  return lifecycleEnvironment;
}

async function prepareStableDatabase({ repositoryRoot, lifecycleEnvironment }) {
  await planCertificationDatabase({
    repositoryRoot,
    environment: lifecycleEnvironment,
    nonce: randomUUID().replaceAll("-", ""),
    profile: STABLE_RUNTIME_SMOKE_DATABASE_PROFILE,
  });
  await provisionCertificationDatabase({
    repositoryRoot,
    environment: lifecycleEnvironment,
  });
  await verifyInitialCertificationDatabase({
    repositoryRoot,
    environment: lifecycleEnvironment,
  });
  await bindCertificationDatabaseStage({
    repositoryRoot,
    environment: lifecycleEnvironment,
    stage: "runtime-smoke",
  });
  const active = readCertificationDatabaseLifecycle({
    repositoryRoot,
    environment: lifecycleEnvironment,
  });
  const stableBinding = createStableRuntimeSmokeDatabaseBinding({
    current: active,
  });
  const database = resolveCertificationDatabaseStageEnvironment({
    repositoryRoot,
    environment: lifecycleEnvironment,
    stage: "runtime-smoke",
    stableRuntimeLifecycleBinding: stableBinding,
  });
  return { active, stableBinding, database };
}

async function executeRuntimeSmoke({ repositoryRoot, paths, runtime }) {
  const child = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "playwright",
      "test",
      "tests/e2e/00-runtime-smoke.spec.ts",
      "--project=chromium",
    ],
    { cwd: repositoryRoot, env: runtime.projection.environment, stdio: "inherit" },
  );
  const consumed = existsSync(paths.marker);
  if (child.status !== 0 || child.signal || child.error) {
    const error = new Error(
      consumed
        ? "stable runtime-smoke product tests failed"
        : "stable runtime-smoke failed before the product test began",
    );
    error.classification = child.error || child.signal
      ? "INFRASTRUCTURE_TRANSIENT"
      : consumed
        ? "PRODUCT_ASSERTION_FAILURE"
        : "PRECONDITION_ORCHESTRATION_FAILURE";
    error.consumedSubstantiveGate = consumed;
    error.runtimeCommand = RUNTIME_COMMAND;
    error.childStatus = child.status;
    error.childSignal = child.signal ?? null;
    error.spawnErrorClassification = child.error ? "child-spawn-error" : null;
    throw error;
  }
  if (!consumed) throw new Error("stable runtime-smoke passed without its start marker");
  const rawReportSha256 = stableSha256(readFileSync(paths.report));
  const validation = await recordProductionEvidenceTest({
    repositoryRoot,
    manifestPath: STABLE_MANIFEST_PATH,
    reportPath: paths.report,
    phaseTimingPath: paths.timings,
    name: "runtime-smoke",
    command: RUNTIME_COMMAND,
    processExitCode: 0,
    environment: runtime.projection.environment,
    persistManifest: false,
    expectedRawReportSha256: rawReportSha256,
  });
  return { consumed, rawReportSha256, validation };
}

async function finalizeStableEvidence({
  repositoryRoot,
  lifecycleEnvironment,
  roots,
  paths,
  validation,
}) {
  const finalDatabase = await cleanupDatabase({ repositoryRoot, lifecycleEnvironment });
  const portable = createPortableStableRuntimeEvidence({ roots, paths, validation });
  const finalManifest = validation.manifest;
  finalManifest.tests = [
    ...finalManifest.tests.filter((entry) => entry.name !== "runtime-smoke"),
    portable.test,
  ];
  finalManifest.repositoryEvidence.status = "valid";
  finalManifest.repositoryEvidence.releaseReady = false;
  finalManifest.repositoryEvidence.actualDeploymentVerified = false;
  await writeProductionEvidenceManifest({
    repositoryRoot,
    manifestPath: STABLE_MANIFEST_PATH,
    manifest: finalManifest,
  });
  return { finalDatabase, portable };
}

async function createAndVerifyBundle({
  repositoryRoot,
  environment,
  manifest,
  roots,
  runtime,
}) {
  await createProductionEvidenceBundle({
    repositoryRoot,
    manifestPath: STABLE_MANIFEST_PATH,
    reportPath: STABLE_PORTABLE_REPORT_PATH,
    bundlePath: STABLE_BUNDLE_PATH,
    environment: runtime.projection.environment,
    externalEvidenceRoot: roots.evidenceRoot,
    externalBundleInputs: [
      STABLE_PORTABLE_REPORT_PATH,
      STABLE_PORTABLE_TIMING_PATH,
      STABLE_PORTABLE_SUMMARY_PATH,
    ],
  });
  const extractedRoot = path.join(roots.taskRoot, "standalone");
  mkdirSync(extractedRoot, { mode: 0o700 });
  const extract = spawnSync(
    "tar",
    ["-xzf", path.join(repositoryRoot, STABLE_BUNDLE_PATH), "-C", extractedRoot],
    { stdio: "inherit" },
  );
  if (extract.status !== 0 || extract.signal || extract.error) {
    throw new Error("stable runtime-smoke standalone bundle extraction failed");
  }
  const standalone = spawnSync(
    process.execPath,
    ["scripts/stable-runtime-smoke-standalone.mjs"],
    {
      cwd: extractedRoot,
      env: {
        ...environment,
        PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: manifest.source.commitSha,
      },
      stdio: "inherit",
    },
  );
  if (standalone.status !== 0 || standalone.signal || standalone.error) {
    throw new Error("stable runtime-smoke standalone bundle verification failed");
  }
}

async function completeStableRuntimeSmoke(context) {
  const paths = stableRuntimePaths(context.roots.evidenceRoot);
  context.paths = paths;
  context.lifecycleEnvironment = createLifecycleEnvironment(context);
  context.lifecycleEnvironment = configureStableRuntimeDatabaseTransport({
    ...context,
    lifecycleEnvironment: context.lifecycleEnvironment,
  });
  context.testHooks?.afterTransportAccepted?.();
  const databaseState = await prepareStableDatabase(context);
  context.databaseState = databaseState;
  const journal = JSON.parse(
    readFileSync(path.join(context.repositoryRoot, STABLE_JOURNAL_PATH), "utf8"),
  );
  context.journal = journal;
  const runtime = createStableRuntimeProjection({
    ...context,
    paths,
    databaseUrl: databaseState.database.environment.DATABASE_URL,
    journal,
  });
  context.runtime = runtime;
  const execution = await executeRuntimeSmoke({ ...context, paths, runtime });
  context.consumed = execution.consumed;
  const finalization = await finalizeStableEvidence({
    ...context,
    paths,
    validation: execution.validation,
  });
  context.manifestFinalized = true;
  writeStableRuntimeSummary({
    ...context, paths, databaseState, runtime, execution, finalization, journal,
  });
  context.bundleStarted = true;
  await createAndVerifyBundle({ ...context, runtime });
  removeStableRuntimeRoot(context.roots);
  context.roots = null;
  console.log(
    JSON.stringify({
      classification: "STABLE_RUNTIME_SMOKE_PASSED",
      candidateId: context.manifest.candidateIdentifier,
      artifactSha256: context.manifest.artifact.sha256,
      expectedTests: execution.validation.report.stats.expected,
      databaseName: databaseState.active.binding.databaseName,
      databaseLifecycleState: finalization.finalDatabase.evidence.currentState,
      externalEvidenceRootRemoved: true,
    }),
  );
}

export async function cleanupFailedStableRun(context, error) {
  const cleanupIssues = [];
  let databaseAbsent = false;
  try {
    let failure = {
      classification: error.classification ?? "PRECONDITION_ORCHESTRATION_FAILURE",
      consumedSubstantiveGate:
        error.consumedSubstantiveGate ?? context.consumed,
      stage: "runtime-smoke",
      attempt: 1,
    };
    if (
      context.lifecycleEnvironment?.CERTIFICATION_DATABASE_LIFECYCLE_PATH &&
      existsSync(
        context.lifecycleEnvironment.CERTIFICATION_DATABASE_LIFECYCLE_PATH,
      )
    ) {
      const readLifecycle =
        context.testHooks?.readDatabaseLifecycle ??
        readCertificationDatabaseLifecycle;
      const lifecycleState = readLifecycle({
        repositoryRoot: context.repositoryRoot,
        environment: context.lifecycleEnvironment,
      });
      const terminalStates = new Set([
        "absence-verified",
        "stable-absence-verified",
        "abort-absence-verified",
      ]);
      if (!terminalStates.has(lifecycleState.evidence.currentState)) {
        const attribution = createStableRuntimeFailureAttribution({
          ...context,
          lifecycleState,
          lifecyclePath:
            context.lifecycleEnvironment.CERTIFICATION_DATABASE_LIFECYCLE_PATH,
          error,
        });
        failure = {
          ...attribution.failure,
          stage: attribution.failure.originalStage,
        };
        context.testHooks?.afterFailureAttribution?.(attribution);
      }
    }
    const abort = context.testHooks?.abortDatabase ?? abortDatabase;
    const absent = await abort({
      repositoryRoot: context.repositoryRoot,
      lifecycleEnvironment: context.lifecycleEnvironment,
      failure,
    });
    databaseAbsent = absent;
    context.testHooks?.afterDatabaseAbort?.({ databaseAbsent, failure });
    if (!databaseAbsent) cleanupIssues.push("database absence was not proved");
  } catch (cleanupError) {
    cleanupIssues.push(`database cleanup: ${cleanupError.message}`);
  }
  try {
    if (context.manifestFinalized) {
      await writeProductionEvidenceManifest({
        repositoryRoot: context.repositoryRoot,
        manifestPath: STABLE_MANIFEST_PATH,
        manifest: context.originalManifest,
      });
    }
  } catch (cleanupError) {
    cleanupIssues.push(`manifest rollback: ${cleanupError.message}`);
  }
  try {
    if (context.bundleStarted) {
      rmSync(path.join(context.repositoryRoot, ".local/production-artifact-evidence/upload"), {
        recursive: true,
        force: true,
      });
    }
  } catch (cleanupError) {
    cleanupIssues.push(`bundle cleanup: ${cleanupError.message}`);
  }
  try {
    if (context.roots && databaseAbsent) {
      removeStableRuntimeRoot(context.roots);
      context.roots = null;
    } else if (context.roots) {
      cleanupIssues.push(
        "external root retained because database absence was not proved",
      );
    }
  } catch (cleanupError) {
    cleanupIssues.push(`external-root cleanup: ${cleanupError.message}`);
  }
  if (cleanupIssues.length > 0) throw new Error(cleanupIssues.join("; "));
}

export async function runStableRuntimeSmoke({
  repositoryRoot = process.cwd(),
  environment = process.env,
  testHooks = null,
} = {}) {
  const preflight = await validateProductionEvidence({
    repositoryRoot,
    manifestPath: STABLE_MANIFEST_PATH,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_PREFLIGHT,
    environment,
  });
  if (!preflight.valid) throw new Error(preflight.issues.join("; "));
  const context = {
    repositoryRoot,
    environment,
    manifest: preflight.manifest,
    originalManifest: structuredClone(preflight.manifest),
    roots: null,
    lifecycleEnvironment: null,
    consumed: false,
    bundleStarted: false,
    manifestFinalized: false,
    testHooks,
  };
  try {
    context.roots = createStableRuntimeRoots(context);
    await completeStableRuntimeSmoke(context);
  } catch (error) {
    try {
      await cleanupFailedStableRun(context, error);
    } catch (cleanupError) {
      console.error(`stable runtime-smoke cleanup failed: ${cleanupError.message}`);
    }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  runStableRuntimeSmoke().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
