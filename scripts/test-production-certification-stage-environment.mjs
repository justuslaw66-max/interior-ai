import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  canonicalJsonBytes,
  harnessSourceIdentity,
  sha256Bytes,
  sourceValidationCheckSet,
} from "./production-certification-contract.mjs";
import {
  completeCertificationStage,
  createCertificationState,
  startCertificationStage,
} from "./production-certification-state.mjs";
import {
  sourceValidationStageEvidence,
  validateSourceValidationEvidence,
} from "./production-certification-source-continuity.mjs";
import {
  certificationEnvironmentProfile,
  projectCertificationChildEnvironment,
  stageEnvironmentContract,
  validateProjectedEnvironmentMetadata,
} from "./production-certification-stage-environment.mjs";

const FIXED_GIT_DATE = "2026-08-14T00:00:00Z";
const FIXTURE_DATABASE_URL =
  "postgresql://certification:certification@127.0.0.1:1/certification";
const repositoryRoot = process.cwd();
const SYNTHETIC_OPENAI_SECRET = "synthetic-floor-plan-source-secret";

function stageInputs(profileId, stage, extra = {}) {
  const profile = certificationEnvironmentProfile(repositoryRoot, profileId);
  return Object.fromEntries(
    profile.requiredVariables.map((name) => [
      name,
      extra[name] ?? profile.fixedValues[name] ?? `fixture-${stage}-${name}`,
    ]),
  );
}

function projected({
  profileId,
  stage,
  checkId = null,
  baseEnvironment = {},
  requiredEnvironmentNames = [],
}) {
  const stageEnvironment = stageInputs(profileId, stage, {
    CERTIFICATION_SOURCE_VALIDATION_CHECK_ID: checkId,
  });
  return projectCertificationChildEnvironment({
    repositoryRoot,
    baseEnvironment,
    stage,
    checkId,
    profileId,
    requiredEnvironmentNames,
    stageInputs: stageEnvironment,
  });
}

function assertProjectedMetadataValid({
  projection,
  profileId,
  stage,
  checkId = null,
  requiredEnvironmentNames = [],
}) {
  assert.deepEqual(
    validateProjectedEnvironmentMetadata({
      repositoryRoot,
      stage,
      checkId,
      profileId,
      requiredEnvironmentNames,
      metadata: projection.metadata,
    }),
    { valid: true, issues: [] },
  );
}

function testFloorPlanValuePolicies() {
  const checkId = "floor-plan-required-closure";
  const relevantParent = {
    DATABASE_URL: FIXTURE_DATABASE_URL,
    FLOOR_PLAN_LOCAL_OCR_DISABLED: "1",
    FLOOR_PLAN_VISION_DISABLED: "1",
    FLOOR_PLAN_VISION_ENABLED: "1",
    FLOOR_PLAN_VISION_MODEL: "synthetic-parent-model",
    FLOOR_PLAN_UNDECLARED_AMBIENT_FLAG: "1",
    OPENAI_API_KEY: SYNTHETIC_OPENAI_SECRET,
  };
  for (const ambientFlag of [undefined, "0", "1"]) {
    const baseEnvironment = { ...relevantParent };
    if (ambientFlag === undefined) delete baseEnvironment.FLOOR_PLAN_VISION_ENABLED;
    else baseEnvironment.FLOOR_PLAN_VISION_ENABLED = ambientFlag;
    const projection = projected({
      profileId: "source-validation",
      stage: "source-validation",
      checkId,
      baseEnvironment,
      requiredEnvironmentNames: ["DATABASE_URL"],
    });
    assert.equal(projection.environment.FLOOR_PLAN_VISION_ENABLED, "0");
    assert.equal(projection.environment.FLOOR_PLAN_VISION_MODEL, undefined);
    assert.equal(projection.environment.FLOOR_PLAN_VISION_DISABLED, undefined);
    assert.equal(projection.environment.FLOOR_PLAN_LOCAL_OCR_DISABLED, undefined);
    assert.equal(projection.environment.OPENAI_API_KEY, undefined);
    assert.equal(
      projection.environment.FLOOR_PLAN_UNDECLARED_AMBIENT_FLAG,
      undefined,
    );
    assert.equal(
      projection.metadata.strippedUnknownApplicationFeatureVariables.includes(
        "FLOOR_PLAN_UNDECLARED_AMBIENT_FLAG",
      ),
      true,
    );
    assert.equal(
      projection.metadata.appliedValuePolicies.find(
        (entry) => entry.name === "FLOOR_PLAN_VISION_ENABLED",
      )?.effectiveValueClassification,
      "boolean:false",
    );
    assert.equal(
      projection.metadata.appliedValuePolicies.find(
        (entry) => entry.name === "OPENAI_API_KEY",
      )?.effectiveValueClassification,
      "absent",
    );
    assert.equal(JSON.stringify(projection.metadata).includes(SYNTHETIC_OPENAI_SECRET), false);
    assertProjectedMetadataValid({
      projection,
      profileId: "source-validation",
      stage: "source-validation",
      checkId,
      requiredEnvironmentNames: ["DATABASE_URL"],
    });
  }

  const nonOwner = projected({
    profileId: "source-validation",
    stage: "source-validation",
    checkId: "production-artifact-evidence-contracts",
    baseEnvironment: relevantParent,
  });
  assert.equal(nonOwner.environment.FLOOR_PLAN_VISION_ENABLED, undefined);

  const firstChild = {
    ...projected({
      profileId: "source-validation",
      stage: "source-validation",
      checkId,
      baseEnvironment: relevantParent,
      requiredEnvironmentNames: ["DATABASE_URL"],
    }).environment,
  };
  firstChild.FLOOR_PLAN_VISION_ENABLED = "1";
  const laterChild = projected({
    profileId: "source-validation",
    stage: "source-validation",
    checkId,
    baseEnvironment: relevantParent,
    requiredEnvironmentNames: ["DATABASE_URL"],
  });
  assert.equal(laterChild.environment.FLOOR_PLAN_VISION_ENABLED, "0");

  for (const profileId of ["build", "runtime-smoke"]) {
    const projection = projected({
      profileId,
      stage: profileId === "build" ? "build" : "runtime-smoke",
      baseEnvironment: relevantParent,
    });
    assert.equal(projection.environment.FLOOR_PLAN_VISION_ENABLED, "1");
    assert.equal(projection.environment.FLOOR_PLAN_VISION_MODEL, "synthetic-parent-model");
    assert.equal(projection.environment.OPENAI_API_KEY, SYNTHETIC_OPENAI_SECRET);
    assert.equal(
      JSON.stringify(projection.metadata).includes(SYNTHETIC_OPENAI_SECRET),
      false,
    );
    assertProjectedMetadataValid({
      projection,
      profileId,
      stage: profileId === "build" ? "build" : "runtime-smoke",
    });
  }

  const corrected = projected({
    profileId: "source-validation",
    stage: "source-validation",
    checkId,
    baseEnvironment: relevantParent,
    requiredEnvironmentNames: ["DATABASE_URL"],
  });
  const wrongHash = structuredClone(corrected.metadata);
  wrongHash.valuePolicySha256 = "0".repeat(64);
  assert.equal(
    validateProjectedEnvironmentMetadata({
      repositoryRoot,
      stage: "source-validation",
      checkId,
      profileId: "source-validation",
      requiredEnvironmentNames: ["DATABASE_URL"],
      metadata: wrongHash,
    }).valid,
    false,
  );

  const wrongProvenance = structuredClone(corrected.metadata);
  wrongProvenance.appliedValuePolicies.find(
    (entry) => entry.name === "OPENAI_API_KEY",
  ).source = "ambient-secret-retained-without-value-evidence";
  assert.equal(
    validateProjectedEnvironmentMetadata({
      repositoryRoot,
      stage: "source-validation",
      checkId,
      profileId: "source-validation",
      requiredEnvironmentNames: ["DATABASE_URL"],
      metadata: wrongProvenance,
    }).valid,
    false,
  );

  const injectedMetadata = structuredClone(corrected.metadata);
  injectedMetadata.rawSecretValue = SYNTHETIC_OPENAI_SECRET;
  assert.equal(
    validateProjectedEnvironmentMetadata({
      repositoryRoot,
      stage: "source-validation",
      checkId,
      profileId: "source-validation",
      requiredEnvironmentNames: ["DATABASE_URL"],
      metadata: injectedMetadata,
    }).valid,
    false,
  );

  const injectedNestedMetadata = structuredClone(corrected.metadata);
  injectedNestedMetadata.prohibitedAmbientValueAbsence.rawSecretValue =
    SYNTHETIC_OPENAI_SECRET;
  assert.equal(
    validateProjectedEnvironmentMetadata({
      repositoryRoot,
      stage: "source-validation",
      checkId,
      profileId: "source-validation",
      requiredEnvironmentNames: ["DATABASE_URL"],
      metadata: injectedNestedMetadata,
    }).valid,
    false,
  );

  const strippedProvenanceTamper = structuredClone(corrected.metadata);
  strippedProvenanceTamper.ambientApplicationVariableNamesStripped =
    strippedProvenanceTamper.ambientApplicationVariableNamesStripped.filter(
      (name) => name !== "OPENAI_API_KEY",
    );
  strippedProvenanceTamper.appliedValuePolicies.find(
    (entry) => entry.name === "OPENAI_API_KEY",
  ).source = "ambient-absent";
  assert.equal(
    validateProjectedEnvironmentMetadata({
      repositoryRoot,
      stage: "source-validation",
      checkId,
      profileId: "source-validation",
      requiredEnvironmentNames: ["DATABASE_URL"],
      metadata: strippedProvenanceTamper,
    }).valid,
    false,
  );

  const sourceClassificationTamper = structuredClone(corrected.metadata);
  sourceClassificationTamper.appliedValuePolicies.find(
    (entry) => entry.name === "OPENAI_API_KEY",
  ).source = "ambient-absent";
  assert.equal(
    validateProjectedEnvironmentMetadata({
      repositoryRoot,
      stage: "source-validation",
      checkId,
      profileId: "source-validation",
      requiredEnvironmentNames: ["DATABASE_URL"],
      metadata: sourceClassificationTamper,
    }).valid,
    false,
  );

  for (const field of [
    "strippedKnownCertificationControlVariables",
    "strippedUnknownCertificationControlVariables",
  ]) {
    const injectedNameInventory = structuredClone(corrected.metadata);
    injectedNameInventory[field].push(SYNTHETIC_OPENAI_SECRET);
    injectedNameInventory[field].sort();
    assert.equal(
      validateProjectedEnvironmentMetadata({
        repositoryRoot,
        stage: "source-validation",
        checkId,
        profileId: "source-validation",
        requiredEnvironmentNames: ["DATABASE_URL"],
        metadata: injectedNameInventory,
      }).valid,
      false,
    );
  }

  const injectedEnvironmentName = structuredClone(corrected.metadata);
  injectedEnvironmentName.environmentNames.push(SYNTHETIC_OPENAI_SECRET);
  injectedEnvironmentName.environmentNames.sort();
  injectedEnvironmentName.environmentNamesSha256 = sha256Bytes(
    canonicalJsonBytes(injectedEnvironmentName.environmentNames),
  );
  injectedEnvironmentName.prohibitedCertificationVariableAbsence.checkedNameCount =
    injectedEnvironmentName.environmentNames.length;
  assert.equal(
    validateProjectedEnvironmentMetadata({
      repositoryRoot,
      stage: "source-validation",
      checkId,
      profileId: "source-validation",
      requiredEnvironmentNames: ["DATABASE_URL"],
      metadata: injectedEnvironmentName,
    }).valid,
    false,
  );

  const emptyAmbientProjection = projected({
    profileId: "source-validation",
    stage: "source-validation",
    checkId,
    baseEnvironment: { OPENAI_API_KEY: "" },
  });
  const emptyAmbientRecord = emptyAmbientProjection.metadata.appliedValuePolicies.find(
    (entry) => entry.name === "OPENAI_API_KEY",
  );
  assert.equal(emptyAmbientRecord.ambientValueClassification, "present-empty");
  assert.equal(emptyAmbientRecord.source, "ambient-stripped");
  assertProjectedMetadataValid({
    projection: emptyAmbientProjection,
    profileId: "source-validation",
    stage: "source-validation",
    checkId,
  });

  const readdedVisibleControl = projected({
    profileId: "source-validation",
    stage: "source-validation",
    checkId,
    baseEnvironment: {
      CERTIFICATION_ENVIRONMENT_STAGE: "ambient-stage-value",
      CERTIFICATION_SOURCE_VALIDATION_CHECK_ID: "ambient-check-value",
    },
  });
  assert.equal(
    readdedVisibleControl.metadata.strippedKnownCertificationControlVariables.includes(
      "CERTIFICATION_ENVIRONMENT_STAGE",
    ),
    true,
  );
  assert.equal(
    readdedVisibleControl.metadata.environmentNames.includes(
      "CERTIFICATION_ENVIRONMENT_STAGE",
    ),
    true,
  );
  assertProjectedMetadataValid({
    projection: readdedVisibleControl,
    profileId: "source-validation",
    stage: "source-validation",
    checkId,
  });

  assert.throws(
    () =>
      projected({
        profileId: "build",
        stage: "build",
        baseEnvironment: {
          ...relevantParent,
          FLOOR_PLAN_VISION_ENABLED: "true",
        },
      }),
    /invalid enum for FLOOR_PLAN_VISION_ENABLED/,
  );

  const malformedRoot = mkdtempSync(
    path.join(tmpdir(), "floor-plan-value-policy-malformed-"),
  );
  try {
    const malformedContractPath = path.join(
      malformedRoot,
      "docs/qa/production-certification-stage-environment.v2.json",
    );
    mkdirSync(path.dirname(malformedContractPath), { recursive: true });
    const malformedContract = JSON.parse(
      readFileSync(
        path.join(
          repositoryRoot,
          "docs/qa/production-certification-stage-environment.v2.json",
        ),
        "utf8",
      ),
    );
    delete malformedContract.profiles["source-validation"].valuePolicies
      .FLOOR_PLAN_VISION_ENABLED.value;
    writeFileSync(
      malformedContractPath,
      canonicalJsonBytes(malformedContract),
      { mode: 0o600 },
    );
    assert.throws(
      () => stageEnvironmentContract(malformedRoot),
      /check-owned value policy is malformed: FLOOR_PLAN_VISION_ENABLED/,
    );
  } finally {
    rmSync(malformedRoot, { recursive: true, force: true });
  }

  // The module import before environment setup is harmless because projection is per invocation.
  assert.equal(
    projected({
      profileId: "source-validation",
      stage: "source-validation",
      checkId,
      baseEnvironment: relevantParent,
      requiredEnvironmentNames: ["DATABASE_URL"],
    }).environment.FLOOR_PLAN_VISION_ENABLED,
    "0",
  );
}

function run(command, args, cwd, environment = process.env) {
  const child = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (child.error || child.signal || child.status !== 0) {
    throw new Error(`${command} stage-environment regression setup failed`);
  }
  return child.stdout.trim();
}

function copyCurrentSource(sourceRoot) {
  const inventory = run(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    repositoryRoot,
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  for (const relativePath of inventory) {
    const sourcePath = path.join(repositoryRoot, relativePath);
    if (!existsSync(sourcePath)) continue;
    const destination = path.join(sourceRoot, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(sourcePath, destination, {
      recursive: lstatSync(sourcePath).isDirectory(),
      verbatimSymlinks: true,
    });
  }
  symlinkSync(
    path.join(repositoryRoot, "node_modules"),
    path.join(sourceRoot, "node_modules"),
    "dir",
  );
}

function initializeGit(sourceRoot) {
  const environment = {
    ...process.env,
    GIT_AUTHOR_DATE: FIXED_GIT_DATE,
    GIT_COMMITTER_DATE: FIXED_GIT_DATE,
  };
  run("git", ["init", "-q"], sourceRoot, environment);
  run("git", ["config", "user.name", "Certification regression"], sourceRoot);
  run(
    "git",
    ["config", "user.email", "certification-regression@example.test"],
    sourceRoot,
  );
  run("git", ["add", "."], sourceRoot, environment);
  run("git", ["commit", "-qm", "stage environment regression fixture"], sourceRoot, environment);
  const parentSha = run("git", ["rev-parse", "HEAD"], sourceRoot);
  run(
    "git",
    ["commit", "--allow-empty", "-qm", "stage environment regression candidate"],
    sourceRoot,
    environment,
  );
  return {
    commitSha: run("git", ["rev-parse", "HEAD"], sourceRoot),
    treeSha: run("git", ["rev-parse", "HEAD^{tree}"], sourceRoot),
    parentSha,
  };
}

function diagnosticTail(filePath) {
  if (!filePath || !existsSync(filePath)) return "";
  return readFileSync(filePath, "utf8")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(
      /\b([A-Z0-9_]*(?:COOKIE|SECRET|TOKEN|PASSWORD|DATABASE_URL)[A-Z0-9_]*)=\S+/gi,
      "$1=[REDACTED]",
    )
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .trim()
    .split("\n")
    .slice(-20)
    .join("\n");
}

async function reproduceHistoricalRealRunnerLeakage(regressionRoot) {
  const historicalRoot = path.join(regressionRoot, "historical-source");
  const historicalEvidenceRoot = path.join(regressionRoot, "historical-evidence");
  const archivePath = path.join(regressionRoot, "historical-source.tar");
  mkdirSync(historicalRoot, { recursive: true, mode: 0o700 });
  mkdirSync(historicalEvidenceRoot, { recursive: true, mode: 0o700 });
  run(
    "git",
    [
      "archive",
      "--format=tar",
      "--output",
      archivePath,
      "e39875191b0d444e258d26598c010b3f8eb412d1",
    ],
    repositoryRoot,
  );
  run("tar", ["-xf", archivePath, "-C", historicalRoot], repositoryRoot);
  symlinkSync(
    path.join(repositoryRoot, "node_modules"),
    path.join(historicalRoot, "node_modules"),
    "dir",
  );
  const historicalIdentity = initializeGit(historicalRoot);
  const moduleUrl = (relativePath) =>
    `${pathToFileURL(path.join(historicalRoot, relativePath)).href}?historical=1`;
  const historicalContract = await import(
    moduleUrl("scripts/production-certification-contract.mjs")
  );
  const historicalState = await import(
    moduleUrl("scripts/production-certification-state.mjs")
  );
  const historicalRunner = await import(
    moduleUrl("scripts/production-certification-source-continuity.mjs")
  );
  const harness = historicalContract.harnessSourceIdentity(historicalRoot);
  let state = historicalState.createCertificationState({
    certificationId: "ch0015i-historical-floor-plan-source-leakage",
    candidateId: "ch0015i-historical-floor-plan-source-leakage-candidate",
    commitSha: historicalIdentity.commitSha,
    treeSha: historicalIdentity.treeSha,
    parentSha: historicalIdentity.parentSha,
    harnessSourceSha256: harness.sha256,
    executionClass: "real-candidate",
    createdAt: "2026-08-14T00:00:00.000Z",
  });
  state = historicalState.startCertificationStage(state, {
    stage: "doctor",
    startedAt: "2026-08-14T00:00:01.000Z",
  });
  const doctorRelativePath = "doctor/historical.json";
  const doctorBytes = historicalContract.canonicalJsonBytes({
    schema: "interior-ai.production-certification-doctor-historical-fixture.v1",
    valid: true,
  });
  const doctorPath = path.join(historicalEvidenceRoot, doctorRelativePath);
  mkdirSync(path.dirname(doctorPath), { recursive: true, mode: 0o700 });
  writeFileSync(doctorPath, doctorBytes, { mode: 0o600 });
  const doctorSha256 = historicalContract.sha256Bytes(doctorBytes);
  state = historicalState.completeCertificationStage(state, {
    stage: "doctor",
    passed: true,
    completedAt: "2026-08-14T00:00:02.000Z",
    exitCode: 0,
    outputHashes: { doctor: doctorSha256 },
    evidenceFiles: {
      doctor: { path: doctorRelativePath, sha256: doctorSha256 },
    },
  });
  state = historicalState.startCertificationStage(state, {
    stage: "source-validation",
    startedAt: "2026-08-14T00:00:03.000Z",
  });
  const result = historicalRunner.sourceValidationStageEvidence({
    repositoryRoot: historicalRoot,
    evidenceRoot: historicalEvidenceRoot,
    state,
    environment: {
      ...process.env,
      DATABASE_URL: FIXTURE_DATABASE_URL,
      FLOOR_PLAN_LOCAL_OCR_DISABLED: "1",
      FLOOR_PLAN_VISION_DISABLED: "1",
      FLOOR_PLAN_VISION_ENABLED: "1",
      FLOOR_PLAN_VISION_MODEL: "synthetic-historical-model",
      OPENAI_API_KEY: SYNTHETIC_OPENAI_SECRET,
    },
  });
  assert.equal(result.passed, false);
  assert.equal(result.failedCheckId, "floor-plan-required-closure");
  assert.equal(result.evidence.checks.length, 5);
  assert.equal(result.evidence.checks.slice(0, 4).every((check) => check.passed), true);
  const failed = result.evidence.checks[4];
  assert.equal(failed.invocationMode, "canonical-real");
  assert.equal(failed.invokedCommand, "npm run test:floor-plan-required");
  assert.equal(failed.environmentProfileId, "source-validation");
  assert.equal(
    failed.environment.contractSha256,
    "acb656a2da0d3de7b346b358087ea91908cc09cd22f2906075e9ffc56213799a",
  );
  assert.equal(
    failed.environment.profileSha256,
    "a8f3a3b5b240949b7205bed420c93f044e2c027ee71b091b6b06cfab53da40c1",
  );
  for (const name of [
    "FLOOR_PLAN_VISION_ENABLED",
    "FLOOR_PLAN_VISION_MODEL",
    "OPENAI_API_KEY",
  ]) {
    assert.equal(failed.environment.environmentNames.includes(name), true);
  }
  const stderr = readFileSync(
    path.join(historicalEvidenceRoot, failed.stderr.path),
    "utf8",
  );
  assert.match(stderr, /true !== false/);
  assert.match(stderr, /test-floor-plan-local-ocr\.ts:168/);
  assert.equal(JSON.stringify(result.evidence).includes(SYNTHETIC_OPENAI_SECRET), false);
  assert.equal(stderr.includes(SYNTHETIC_OPENAI_SECRET), false);
  process.stdout.write(
    "Historical real-runner leakage reproduction passed.\n",
  );
}

testFloorPlanValuePolicies();

const regressionRoot = mkdtempSync(
  path.join(tmpdir(), "production-certification-stage-environment-regression-"),
);
try {
  await reproduceHistoricalRealRunnerLeakage(regressionRoot);
  const sourceRoot = path.join(regressionRoot, "source");
  const evidenceRoot = path.join(regressionRoot, "evidence");
  mkdirSync(sourceRoot, { recursive: true, mode: 0o700 });
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  copyCurrentSource(sourceRoot);
  const identity = initializeGit(sourceRoot);
  const harness = harnessSourceIdentity(sourceRoot);
  let state = createCertificationState({
    certificationId: "stage-environment-regression",
    candidateId: "stage-environment-regression-candidate",
    commitSha: identity.commitSha,
    treeSha: identity.treeSha,
    parentSha: identity.parentSha,
    harnessSourceSha256: harness.sha256,
    executionClass: "real-candidate",
    createdAt: "2026-08-14T00:01:00.000Z",
  });
  state = startCertificationStage(state, {
    stage: "doctor",
    startedAt: "2026-08-14T00:01:01.000Z",
  });
  const doctorRelativePath = "doctor/attempt-001.json";
  const doctorPath = path.join(evidenceRoot, doctorRelativePath);
  const doctorBytes = canonicalJsonBytes({
    schema: "interior-ai.production-certification-doctor-regression-fixture.v1",
    valid: true,
  });
  mkdirSync(path.dirname(doctorPath), { recursive: true, mode: 0o700 });
  writeFileSync(doctorPath, doctorBytes, { mode: 0o600 });
  const doctorSha256 = sha256Bytes(doctorBytes);
  state = completeCertificationStage(state, {
    stage: "doctor",
    passed: true,
    completedAt: "2026-08-14T00:01:02.000Z",
    exitCode: 0,
    outputHashes: { doctor: doctorSha256 },
    evidenceFiles: {
      doctor: { path: doctorRelativePath, sha256: doctorSha256 },
    },
  });
  state = startCertificationStage(state, {
    stage: "source-validation",
    startedAt: "2026-08-14T00:01:03.000Z",
  });
  const result = sourceValidationStageEvidence({
    repositoryRoot: sourceRoot,
    evidenceRoot,
    state,
    environment: {
      ...process.env,
      DATABASE_URL: FIXTURE_DATABASE_URL,
      CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
      PRODUCTION_CERTIFICATION_STATE: path.join(
        evidenceRoot,
        "certification-state.json",
      ),
      CERTIFICATION_RUNTIME_REPORT_PATH: path.join(
        evidenceRoot,
        "runtime/report.json",
      ),
      CERTIFICATION_RUNTIME_PHASE_TIMINGS_PATH: path.join(
        evidenceRoot,
        "runtime/timings.json",
      ),
      CERTIFICATION_RUNTIME_EVIDENCE_PATH: path.join(
        evidenceRoot,
        "runtime/evidence.json",
      ),
      CERTIFICATION_PHASE8_EVIDENCE_PATH: path.join(
        evidenceRoot,
        "phase8/evidence.json",
      ),
      PHASE8_EXTERNAL_EVIDENCE_ROOT: evidenceRoot,
      FLOOR_PLAN_LOCAL_OCR_DISABLED: "1",
      FLOOR_PLAN_VISION_DISABLED: "1",
      FLOOR_PLAN_VISION_ENABLED: "1",
      FLOOR_PLAN_VISION_MODEL: "synthetic-corrected-model",
      OPENAI_API_KEY: SYNTHETIC_OPENAI_SECRET,
      CERTIFICATION_BROWSER_FLOOR_PLAN_UPLOAD_REPORT_PATH: path.join(
        evidenceRoot,
        "browser/floor-plan-upload.json",
      ),
    },
  });
  if (!result.passed) {
    const failed = result.evidence.checks.at(-1);
    throw new Error(
      [
        `source stage regression failed: ${result.failedCheckId}`,
        JSON.stringify(failed?.process ?? null),
        diagnosticTail(
          failed?.stderr?.path
            ? path.join(evidenceRoot, failed.stderr.path)
            : null,
        ),
        diagnosticTail(
          failed?.stdout?.path
            ? path.join(evidenceRoot, failed.stdout.path)
            : null,
        ),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  assert.equal(result.evidence.checks.length, 19);
  const first = result.evidence.checks[0];
  assert.equal(first.id, "production-artifact-evidence-contracts");
  assert.equal(first.invocationMode, "canonical-real");
  assert.equal(first.invokedCommand, "npm run test:production-artifact-evidence");
  assert.equal(first.passed, true);
  assert.equal(first.environmentProfileId, "source-validation");
  assert.equal(first.environment.environmentNames.includes("DATABASE_URL"), true);
  assert.equal(
    first.environment.environmentNames.includes("CERTIFICATION_EVIDENCE_ROOT"),
    false,
  );
  assert.equal(
    first.environment.environmentNames.includes(
      "CERTIFICATION_RUNTIME_START_MARKER_PATH",
    ),
    false,
  );
  assert.equal(
    first.environment.strippedKnownCertificationControlVariables.includes(
      "CERTIFICATION_EVIDENCE_ROOT",
    ),
    true,
  );
  assert.equal(existsSync(path.join(evidenceRoot, first.stdout.path)), true);
  assert.equal(existsSync(path.join(evidenceRoot, first.stderr.path)), true);
  assert.equal(existsSync(path.join(evidenceRoot, result.descriptor.path)), true);
  assert.equal(JSON.stringify(result.evidence).includes(FIXTURE_DATABASE_URL), false);
  assert.equal(JSON.stringify(result.evidence).includes(SYNTHETIC_OPENAI_SECRET), false);
  const floorPlan = result.evidence.checks[4];
  assert.equal(floorPlan.id, "floor-plan-required-closure");
  assert.equal(floorPlan.invokedCommand, "npm run test:floor-plan-required");
  assert.equal(floorPlan.passed, true);
  assert.equal(
    floorPlan.environment.environmentNames.includes(
      "FLOOR_PLAN_VISION_ENABLED",
    ),
    true,
  );
  assert.equal(
    floorPlan.environment.environmentNames.includes("OPENAI_API_KEY"),
    false,
  );
  assert.equal(
    floorPlan.environment.appliedValuePolicies.find(
      (entry) => entry.name === "FLOOR_PLAN_VISION_ENABLED",
    )?.effectiveValueClassification,
    "boolean:false",
  );
  assert.equal(
    floorPlan.environment.prohibitedAmbientValueAbsence.passed,
    true,
  );
  for (const check of result.evidence.checks) {
    assert.equal(check.environment.valuePolicyValidation.passed, true);
    assert.equal(
      check.environment.prohibitedAmbientValueAbsence.passed,
      true,
    );
  }
  assert.equal(
    validateSourceValidationEvidence({
      evidence: result.evidence,
      evidenceRoot,
      state,
      repositoryRoot: sourceRoot,
    }).valid,
    true,
  );
  assert.equal(sourceValidationCheckSet(sourceRoot).checks.length, 19);
  process.stdout.write(
    "Production certification stage-environment real-runner regression passed.\n",
  );
} finally {
  rmSync(regressionRoot, { recursive: true, force: true });
}
