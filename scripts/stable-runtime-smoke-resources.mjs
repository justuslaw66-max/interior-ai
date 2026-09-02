import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import authFixtureSession from "./ci-auth-fixture-session.cjs";
import { canonicalJsonBytes } from "./production-certification-database-contract.mjs";
import {
  certificationEnvironmentProfile,
  projectCertificationChildEnvironment,
} from "./production-certification-stage-environment.mjs";
import {
  authorizeRuntimeSmokeReportPath,
  resolveAuthorizedExternalEvidenceRoot,
  resolveRuntimeSmokeEvidencePath,
} from "./playwright-report-path.mjs";

export const STABLE_MANIFEST_PATH =
  ".local/production-artifact-evidence/manifest.json";
export const STABLE_JOURNAL_PATH =
  ".local/production-artifact-evidence/semantic-event-journal.json";
export const STABLE_PORTABLE_REPORT_PATH =
  ".local/production-artifact-evidence/runtime-smoke.json";
export const STABLE_PORTABLE_TIMING_PATH =
  ".local/production-artifact-evidence/runtime-smoke-phases.json";
export const STABLE_PORTABLE_SUMMARY_PATH =
  ".local/production-artifact-evidence/stable-runtime-smoke-evidence.json";
export const STABLE_BUNDLE_PATH =
  ".local/production-artifact-evidence/upload/ch0016-ch0017-evidence-bundle.tar.gz";

export function stableSha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function requiredStableRuntimeInput(environment, name, pattern = null) {
  const value = environment[name]?.trim();
  if (!value || (pattern && !pattern.test(value))) {
    throw new Error(`stable runtime-smoke parent requires valid ${name}`);
  }
  return value;
}

function stableRuntimeRootOwner({ manifest, runId, runAttempt }) {
  return {
    schema: "interior-ai.stable-runtime-smoke-root-owner.v1",
    certificationId:
      `stable-runtime-smoke:${runId}:${runAttempt}:${manifest.source.commitSha.slice(0, 12)}`,
    runId,
    runAttempt: Number(runAttempt),
    candidateId: manifest.candidateIdentifier,
    sourceCommitSha: manifest.source.commitSha,
    sourceTreeSha: manifest.source.treeSha,
    lifecycleNonce: randomUUID(),
  };
}

function initializeStableRuntimeRoot({
  repositoryRoot,
  taskRoot,
  evidenceRoot,
  privateRoot,
  owner,
}) {
  mkdirSync(taskRoot, { mode: 0o700 });
  try {
    mkdirSync(evidenceRoot, { mode: 0o700 });
    mkdirSync(privateRoot, { mode: 0o700 });
    resolveAuthorizedExternalEvidenceRoot({
      authorizedExternalRoot: evidenceRoot,
      repositoryRoot,
    });
    const ownerPath = path.join(taskRoot, "owner.json");
    writeFileSync(ownerPath, canonicalJsonBytes(owner), {
      flag: "wx",
      mode: 0o600,
    });
    return ownerPath;
  } catch (error) {
    rmSync(taskRoot, { recursive: true, force: true });
    throw error;
  }
}

export function createStableRuntimeRoots({ repositoryRoot, environment, manifest }) {
  const requestedRunnerTemp = requiredStableRuntimeInput(
    environment,
    "RUNNER_TEMP",
  );
  if (!path.isAbsolute(requestedRunnerTemp)) {
    throw new Error("stable runtime-smoke RUNNER_TEMP must be absolute");
  }
  const runnerTemp = realpathSync(requestedRunnerTemp);
  const runId = requiredStableRuntimeInput(
    environment,
    "GITHUB_RUN_ID",
    /^\d+$/,
  );
  const runAttempt = requiredStableRuntimeInput(
    environment,
    "GITHUB_RUN_ATTEMPT",
    /^[1-9]\d*$/,
  );
  const expectedSource = requiredStableRuntimeInput(
    environment,
    "STABLE_RUNTIME_SMOKE_EXPECTED_SOURCE_SHA",
    /^[a-f0-9]{40}$/,
  );
  if (expectedSource !== manifest.source.commitSha) {
    throw new Error("stable runtime-smoke expected source differs from the built artifact");
  }
  const taskRoot = path.join(
    runnerTemp,
    `interior-ai-stable-runtime-smoke-${runId}-${runAttempt}`,
  );
  if (existsSync(taskRoot)) {
    throw new Error("stable runtime-smoke task root already exists");
  }
  const evidenceRoot = path.join(taskRoot, "evidence");
  const privateRoot = path.join(taskRoot, "private");
  const owner = stableRuntimeRootOwner({ manifest, runId, runAttempt });
  const ownerPath = initializeStableRuntimeRoot({
    repositoryRoot,
    taskRoot,
    evidenceRoot,
    privateRoot,
    owner,
  });
  return { taskRoot, evidenceRoot, privateRoot, owner, ownerPath };
}

export function removeStableRuntimeRoot(roots) {
  if (!roots || realpathSync(roots.taskRoot) !== roots.taskRoot) {
    throw new Error("stable runtime-smoke cleanup root is not physical");
  }
  const ownerBytes = readFileSync(roots.ownerPath);
  if (!ownerBytes.equals(canonicalJsonBytes(roots.owner))) {
    throw new Error("stable runtime-smoke cleanup root ownership changed");
  }
  rmSync(roots.taskRoot, { recursive: true });
}

export function stableRuntimePaths(evidenceRoot) {
  const directory = path.join(evidenceRoot, "runtime-smoke");
  mkdirSync(directory, { mode: 0o700 });
  return {
    report: path.join(directory, "playwright-report.json"),
    timings: path.join(directory, "phase-timings.json"),
    marker: path.join(directory, "product-test-start.json"),
    summary: path.join(directory, "evidence.json"),
  };
}

function consumeAuthFixture({ repositoryRoot, environment, manifest }) {
  const consumed = authFixtureSession.consumeFixtureSession({
    repositoryRoot,
    environment: {
      ...environment,
      CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: manifest.source.commitSha,
      CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: manifest.source.treeSha,
    },
    requireAmbientProviderValues: true,
    sourceCommand: "evidence:production:stable-runtime-smoke",
    sourceMode: "stable-runtime-smoke-parent-projection",
  });
  const projected = {
    ...authFixtureSession.projectedFixtureEnvironment(consumed),
  };
  const continuityInputs = { ...environment, ...projected };
  if (environment.CI === "true" && environment.GITHUB_ACTIONS === "true") {
    delete continuityInputs.CI_AUTH_FIXTURE_LOCAL_TEST;
  }
  const continuity = authFixtureSession.validateProjectedFixtureEnvironment(
    continuityInputs,
    { commitSha: manifest.source.commitSha, treeSha: manifest.source.treeSha },
  );
  if (
    JSON.stringify(continuity) !==
    JSON.stringify(manifest.build.authFixtureContinuity)
  ) {
    throw new Error("stable runtime-smoke auth fixture differs from build continuity");
  }
  return { projected, continuity };
}

function stableRuntimeStageInputs({
  auth,
  databaseUrl,
  journal,
  journalSha256,
  manifest,
  manifestSha256,
  paths,
  profile,
  roots,
}) {
  return {
    ...auth.projected,
    CERTIFICATION_ENVIRONMENT_STAGE: "runtime-smoke",
    CERTIFICATION_RUNTIME_STAGE_ATTEMPT: "1",
    CERTIFICATION_RUNTIME_START_MARKER_PATH: paths.marker,
    CERTIFICATION_STAGE_ENVIRONMENT_CONTRACT_SHA256: profile.contract.sha256,
    CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_ID: profile.id,
    CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_SHA256: profile.sha256,
    DATABASE_URL: databaseUrl,
    PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT: roots.evidenceRoot,
    PLAYWRIGHT_JSON_OUTPUT_FILE: paths.report,
    PLAYWRIGHT_USE_PRODUCTION_SERVER: "1",
    PRODUCTION_CERTIFICATION_ID: roots.owner.certificationId,
    PRODUCTION_EVIDENCE_CANDIDATE_ID: manifest.candidateIdentifier,
    PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256: manifest.artifact.sha256,
    PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: manifest.build.nextBuildId,
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: manifest.source.commitSha,
    PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE: journal.runNonce,
    PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_SHA256: journalSha256,
    PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256: manifestSha256,
    PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: manifest.source.treeSha,
    PRODUCTION_EVIDENCE_JOURNAL_PATH: STABLE_JOURNAL_PATH,
    PRODUCTION_EVIDENCE_MANIFEST: STABLE_MANIFEST_PATH,
    RUNTIME_SMOKE_PHASE_TIMINGS_PATH: paths.timings,
  };
}

export function createStableRuntimeProjection({
  repositoryRoot,
  environment,
  manifest,
  roots,
  paths,
  databaseUrl,
  journal,
}) {
  const profile = certificationEnvironmentProfile(repositoryRoot, "runtime-smoke");
  const auth = consumeAuthFixture({ repositoryRoot, environment, manifest });
  const manifestSha256 = stableSha256(
    readFileSync(path.join(repositoryRoot, STABLE_MANIFEST_PATH)),
  );
  const journalSha256 = stableSha256(
    readFileSync(path.join(repositoryRoot, STABLE_JOURNAL_PATH)),
  );
  const stageInputs = stableRuntimeStageInputs({
    auth, databaseUrl, journal, journalSha256, manifest, manifestSha256,
    paths, profile, roots,
  });
  const projection = projectCertificationChildEnvironment({
    repositoryRoot,
    baseEnvironment: {
      ...environment,
      APP_ENV: manifest.build.applicationEnvironment,
      NEXT_PUBLIC_APP_ENV: manifest.build.applicationEnvironment,
      CATALOG_STRICT_VALIDATION: "true",
      CI: "true",
      VERCEL_ENV:
        manifest.build.applicationEnvironment === "staging"
          ? "preview"
          : "production",
    },
    stage: "runtime-smoke",
    profileId: "runtime-smoke",
    stageInputs,
  });
  authorizeRuntimeSmokeReportPath({
    requestedPath: paths.report,
    repositoryRoot,
    authorizedExternalRoot: roots.evidenceRoot,
    environment: projection.environment,
  });
  for (const [outputRole, requestedPath] of Object.entries({
    timings: paths.timings,
    summary: paths.summary,
    startMarker: paths.marker,
  })) {
    resolveRuntimeSmokeEvidencePath({
      requestedPath,
      repositoryRoot,
      authorizedExternalRoot: roots.evidenceRoot,
      outputRole,
    });
  }
  return { projection, auth, manifestSha256, journalSha256 };
}

export function createPortableStableRuntimeEvidence({
  roots,
  paths,
  validation,
}) {
  const portableRoot = path.join(
    roots.evidenceRoot,
    ".local/production-artifact-evidence",
  );
  mkdirSync(portableRoot, { recursive: true, mode: 0o700 });
  const reportPath = path.join(roots.evidenceRoot, STABLE_PORTABLE_REPORT_PATH);
  const timingPath = path.join(roots.evidenceRoot, STABLE_PORTABLE_TIMING_PATH);
  writeFileSync(reportPath, canonicalJsonBytes(validation.report), {
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(timingPath, readFileSync(paths.timings), {
    flag: "wx",
    mode: 0o600,
  });
  const test = structuredClone(validation.test);
  test.report = {
    path: STABLE_PORTABLE_REPORT_PATH,
    sha256: stableSha256(readFileSync(reportPath)),
  };
  test.phaseTimings.path = STABLE_PORTABLE_TIMING_PATH;
  test.phaseTimings.sha256 = stableSha256(readFileSync(timingPath));
  return { reportPath, timingPath, test };
}

function createStableRuntimeSummary({
  repositoryRoot,
  manifest,
  roots,
  paths,
  databaseState,
  runtime,
  execution,
  finalization,
  journal,
}) {
  const target = new URL(databaseState.database.environment.DATABASE_URL);
  return {
    schema: "interior-ai.stable-runtime-smoke-evidence.v1",
    classification: "REPOSITORY_STABLE_RUNTIME_SMOKE_ONLY",
    releaseCertification: false,
    identity: {
      certificationId: roots.owner.certificationId,
      candidateId: manifest.candidateIdentifier,
      sourceCommitSha: manifest.source.commitSha,
      sourceTreeSha: manifest.source.treeSha,
      buildId: manifest.build.nextBuildId,
      artifactSha256: manifest.artifact.sha256,
      manifestSha256: stableSha256(
        readFileSync(path.join(repositoryRoot, STABLE_MANIFEST_PATH)),
      ),
      journalSha256: runtime.journalSha256,
      journalNonce: journal.runNonce,
    },
    authFixtureContinuity: runtime.auth.continuity,
    database: {
      lifecycleClassification: databaseState.stableBinding.classification,
      databaseName: databaseState.active.binding.databaseName,
      databaseIdentitySha256:
        databaseState.active.binding.databaseIdentitySha256,
      roleName: decodeURIComponent(target.username),
      scopedRoleClassification:
        databaseState.database.identity.scopedRoleClassification,
      migrationCount: databaseState.active.evidence.migration.count,
      finalState: finalization.finalDatabase.evidence.currentState,
      targetAbsent: true,
    },
    stageEnvironment: runtime.projection.metadata,
    evidence: {
      rawReport: {
        path: "runtime-smoke/playwright-report.json",
        sha256: execution.rawReportSha256,
      },
      portableReport: {
        path: STABLE_PORTABLE_REPORT_PATH,
        sha256: finalization.portable.test.report.sha256,
      },
      timings: {
        path: STABLE_PORTABLE_TIMING_PATH,
        sha256: finalization.portable.test.phaseTimings.sha256,
      },
      startMarker: {
        path: "runtime-smoke/product-test-start.json",
        sha256: stableSha256(readFileSync(paths.marker)),
      },
    },
    stats: execution.validation.report.stats,
    complete: true,
  };
}

export function writeStableRuntimeSummary(inputs) {
  const bytes = canonicalJsonBytes(createStableRuntimeSummary(inputs));
  writeFileSync(inputs.paths.summary, bytes, {
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(path.join(inputs.roots.evidenceRoot, STABLE_PORTABLE_SUMMARY_PATH), bytes, {
    flag: "wx",
    mode: 0o600,
  });
}
