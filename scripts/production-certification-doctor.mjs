import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync, statfsSync } from "node:fs";
import path from "node:path";

import {
  CERTIFICATION_EVIDENCE_ROOT_ENV,
  CERTIFICATION_HARNESS_SOURCE_PATHS,
  CERTIFICATION_STAGE_COMMANDS,
  CERTIFICATION_STAGE_ORDER,
  PHASE8_EXTERNAL_EVIDENCE_ROOT_ENV,
  PRODUCTION_CERTIFICATION_DOCTOR_SCHEMA,
  PRODUCTION_CERTIFICATION_HARNESS_VERSION,
  REQUIRED_BROWSER_OWNERS,
  canonicalJsonBytes,
  harnessSourceIdentity,
  isCandidateId,
  isSourceSha,
  continuityContract,
  sourceValidationCheckSet,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import {
  isCertificationControlVariableName,
  stageEnvironmentContract,
} from "./production-certification-stage-environment.mjs";
import { deriveProductionVerifierClosure } from "./production-verifier-closure.mjs";
import {
  resolveAuthorizedExternalEvidenceRoot,
  resolvePlaywrightReportPath,
  resolveRequiredTestReportPath,
  resolveRuntimeSmokeEvidencePath,
} from "./playwright-report-path.mjs";
import { readCertificationState } from "./production-certification-state.mjs";
import {
  CERTIFICATION_WORKTREE_ROLES,
  certificationWorktreeIssues,
  resolveCertificationStageWorktree,
} from "./production-certification-worktrees.mjs";

const REQUIRED_APPLICATION_ENVIRONMENT_NAMES = Object.freeze([
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_STOREFRONT_TOKEN|SHOPIFY_STOREFRONT_ACCESS_TOKEN",
  "POSTHOG_KEY|NEXT_PUBLIC_POSTHOG_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_YEARLY",
  "AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "APP_ORIGIN",
  "ADMIN_EMAILS",
]);
const PORTS = Object.freeze([3000, 3317]);

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

function git(repositoryRoot, args) {
  const result = run("git", args, repositoryRoot);
  return result.status === 0 ? result.stdout.trim() : null;
}

function check(checks, issues, id, action) {
  try {
    const details = action();
    checks.push({ id, passed: true, details: details ?? null });
  } catch (error) {
    checks.push({ id, passed: false, details: null });
    issues.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requiredAlternativesPresent(environment, alternatives) {
  return alternatives.split("|").some((name) => environment[name]?.trim());
}

function validateDatabaseShape(environment) {
  let url;
  try {
    url = new URL(environment.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL shape is invalid");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.pathname.slice(1) ||
    (url.port && !/^\d{2,5}$/.test(url.port))
  ) {
    throw new Error("database role/connectivity shape is incomplete");
  }
  return { protocol: url.protocol, hostPresent: true, rolePresent: true, databasePresent: true };
}

function validateNetworkShape(environment) {
  let origin;
  try {
    origin = new URL(environment.APP_ORIGIN);
  } catch {
    throw new Error("APP_ORIGIN network shape is invalid");
  }
  if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password) {
    throw new Error("APP_ORIGIN network shape is unsafe");
  }
  return { protocol: origin.protocol, hostPresent: Boolean(origin.hostname) };
}

export function assertFileBackedOwner(repositoryRoot, relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  const metadata = lstatSync(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${relativePath} is not a physical source file`);
  }
  const source = readFileSync(absolutePath, "utf8");
  if (/data:text\/javascript|\beval\s*\(|node\s+-|\/dev\/stdin/.test(source)) {
    throw new Error(`${relativePath} permits data URL, eval, or stdin execution`);
  }
  return { sourceSha256: sha256Bytes(source) };
}

function validatePortsAndProcesses(repositoryRoot) {
  const occupied = [];
  for (const port of PORTS) {
    const result = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], repositoryRoot);
    if (result.status === 0 && result.stdout.trim()) occupied.push(port);
  }
  if (occupied.length > 0) {
    throw new Error(`required certification ports are occupied: ${occupied.join(", ")}`);
  }
  const orchestrationPids = new Set([process.pid]);
  let ancestor = process.pid;
  for (let depth = 0; depth < 8; depth += 1) {
    const parent = run("ps", ["-o", "ppid=", "-p", String(ancestor)], repositoryRoot);
    const parentPid = Number(parent.stdout?.trim());
    if (!Number.isSafeInteger(parentPid) || parentPid <= 1 || orchestrationPids.has(parentPid)) {
      break;
    }
    orchestrationPids.add(parentPid);
    ancestor = parentPid;
  }
  const processes = run("lsof", ["-nP", "-a", "-d", "cwd", "+D", repositoryRoot], repositoryRoot);
  const prohibited = (processes.stdout ?? "")
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("COMMAND") &&
        !orchestrationPids.has(Number(line.trim().split(/\s+/)[1])) &&
        /\b(?:npm|node|next|playwright|prisma|benchmark)\b/i.test(line),
    );
  if (prohibited.length > 0) {
    throw new Error("repository-owned application/build/test process is running");
  }
  return { ports: [...PORTS], repositoryOwnedProcesses: 0 };
}

function validateEvidenceDestinations(repositoryRoot, environment) {
  const evidenceRoot = environment[CERTIFICATION_EVIDENCE_ROOT_ENV];
  resolveAuthorizedExternalEvidenceRoot({
    authorizedExternalRoot: evidenceRoot,
    repositoryRoot,
  });
  if (environment[PHASE8_EXTERNAL_EVIDENCE_ROOT_ENV] !== evidenceRoot) {
    throw new Error("Phase 8 and certification evidence roots must be identical");
  }
  const destinations = new Set();
  const add = (value, name) => {
    if (destinations.has(value)) throw new Error(`duplicate evidence target: ${name}`);
    destinations.add(value);
  };
  const root = realpathSync(evidenceRoot);
  const absentContainedTarget = (value, name, { directory = false } = {}) => {
    if (!path.isAbsolute(value ?? "")) {
      throw new Error(`${name} target must be absolute`);
    }
    const resolved = path.resolve(value);
    let existingParent = path.dirname(resolved);
    while (!existsSync(existingParent)) {
      const next = path.dirname(existingParent);
      if (next === existingParent) break;
      existingParent = next;
    }
    const parent = realpathSync(existingParent);
    if (parent !== root && !parent.startsWith(`${root}${path.sep}`)) {
      throw new Error(`${name} target escapes its authorized root`);
    }
    if (lstatSync(existingParent).isSymbolicLink()) {
      throw new Error(`${name} target parent must be physical`);
    }
    if (existsSync(resolved)) throw new Error(`${name} target must be absent`);
    add(resolved, name);
    return { path: resolved, kind: directory ? "directory" : "file" };
  };
  for (const [variable, name, outputRole] of [
    ["CERTIFICATION_RUNTIME_REPORT_PATH", "runtime-smoke", "report"],
    ["CERTIFICATION_RUNTIME_PHASE_TIMINGS_PATH", "runtime phase timings", "timings"],
    ["CERTIFICATION_RUNTIME_EVIDENCE_PATH", "runtime certification evidence", "summary"],
  ]) {
    try {
      const destination = resolveRuntimeSmokeEvidencePath({
        requestedPath: environment[variable],
        repositoryRoot,
        authorizedExternalRoot: evidenceRoot,
        outputRole,
      });
      add(destination.outputPath, name);
    } catch (error) {
      throw new Error(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const runtimeStart = resolveRuntimeSmokeEvidencePath({
    requestedPath: path.join(
      path.resolve(evidenceRoot),
      "runtime-smoke/product-test-start.json",
    ),
    repositoryRoot,
    authorizedExternalRoot: evidenceRoot,
    outputRole: "startMarker",
  });
  add(runtimeStart.outputPath, "runtime start marker");
  for (const owner of REQUIRED_BROWSER_OWNERS) {
    const variable = `CERTIFICATION_BROWSER_${owner.id.toUpperCase().replaceAll("-", "_")}_REPORT_PATH`;
    const destination = resolveRequiredTestReportPath({
      requestedPath: environment[variable],
      repositoryRoot,
      gateId: owner.gateId,
      authorizedExternalRoot: evidenceRoot,
    });
    add(destination.outputPath, owner.id);
  }
  const phase8Path = resolvePlaywrightReportPath({
    requestedPath: environment.CERTIFICATION_PHASE8_EVIDENCE_PATH,
    repositoryRoot,
    authorizedExternalRoot: evidenceRoot,
  });
  add(phase8Path.outputPath, "phase8 certification evidence");
  absentContainedTarget(path.join(root, "phase8"), "Phase 8 raw evidence root", {
    directory: true,
  });
  for (const [relativeTarget, name, directory] of [
    ["archive/plan.json", "archive plan", false],
    ["archive/stage", "archive stage", true],
    ["archive/candidate.tar.gz", "compressed archive", false],
    ["archive/extracted", "archive extraction", true],
  ]) {
    absentContainedTarget(path.join(root, relativeTarget), name, { directory });
  }
  const requestedStatePath = path.resolve(
    environment.PRODUCTION_CERTIFICATION_STATE ?? "",
  );
  const statePath = path.join(
    realpathSync(path.dirname(requestedStatePath)),
    path.basename(requestedStatePath),
  );
  if (!statePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("certification state escapes its authorized root");
  }
  const stateMetadata = lstatSync(statePath);
  if (!stateMetadata.isFile() || stateMetadata.isSymbolicLink()) {
    throw new Error("certification state must be a physical file");
  }
  add(statePath, "certification state");
  return { rootClass: "external", uniqueTargetCount: destinations.size };
}

function validateSource(repositoryRoot, environment) {
  const commitSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
  const treeSha = git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
  const status = git(repositoryRoot, ["status", "--porcelain", "--untracked-files=all"]);
  if (!isSourceSha(commitSha) || !isSourceSha(treeSha)) {
    throw new Error("source SHA or tree cannot be resolved");
  }
  if (commitSha !== environment.CERTIFICATION_EXPECTED_COMMIT_SHA) {
    throw new Error("source commit does not match the declared candidate");
  }
  if (treeSha !== environment.CERTIFICATION_EXPECTED_TREE_SHA) {
    throw new Error("source tree does not match the declared candidate");
  }
  if (status !== "") throw new Error("source worktree or index is not clean");
  const parent = git(repositoryRoot, ["rev-parse", "HEAD^"]);
  if (!isSourceSha(environment.CERTIFICATION_EXPECTED_PARENT_SHA)) {
    throw new Error("declared candidate parent SHA is missing or malformed");
  }
  if (parent !== environment.CERTIFICATION_EXPECTED_PARENT_SHA) {
    throw new Error("candidate parentage is not exact");
  }
  return { commitSha, treeSha, parentSha: parent, trackedAndUntrackedClean: true };
}

function validateBuildTargetsPristine(repositoryRoot) {
  const targets = [
    ".next",
    ".local/production-artifact-evidence/semantic-event-journal.json",
    ".local/production-artifact-evidence/manifest.json",
    ".local/production-artifact-evidence/artifact-inventory.json",
  ];
  const present = targets.filter((relativePath) =>
    existsSync(path.join(repositoryRoot, relativePath)),
  );
  if (present.length > 0) {
    throw new Error(`strict build targets are not pristine: ${present.join(", ")}`);
  }
  return { absentTargets: targets };
}

function validateStageWorktreeIsolation(repositoryRoot, environment) {
  const statePath = environment.PRODUCTION_CERTIFICATION_STATE?.trim();
  const evidenceRoot = environment.CERTIFICATION_EVIDENCE_ROOT?.trim();
  if (!statePath || !evidenceRoot) {
    throw new Error("stage-worktree validation requires state and evidence roots");
  }
  const state = readCertificationState(statePath);
  const issues = certificationWorktreeIssues({
    state,
    evidenceRoot,
    canonicalRoot: repositoryRoot,
    requirePhysical: true,
  });
  if (issues.length > 0) throw new Error(issues.join("; "));
  const roots = [];
  for (const role of CERTIFICATION_WORKTREE_ROLES) {
    const resolved = resolveCertificationStageWorktree({
      state,
      evidenceRoot,
      canonicalRoot: repositoryRoot,
      role,
      phase: "pristine",
    });
    const capacity = statfsSync(resolved.root);
    if (Number(capacity.bavail) * Number(capacity.bsize) < 1024 ** 3) {
      throw new Error(`stage worktree filesystem capacity is below policy: ${role}`);
    }
    roots.push(resolved.root);
  }
  if (new Set(roots).size !== CERTIFICATION_WORKTREE_ROLES.length) {
    throw new Error("stage worktree roles are not physically distinct");
  }
  return {
    roles: [...CERTIFICATION_WORKTREE_ROLES],
    pathsOutsideCanonicalCheckout: true,
    pathsOutsideEvidenceRoot: true,
    symlinkAliasesRejected: true,
    exactCandidateAvailable: true,
    creationPermissionsProven: true,
    filesystemCapacityPolicyBytes: 1024 ** 3,
    pristineIgnoredPathCount: 0,
    canonicalIgnoredArtifactsInArtifactContract: false,
    quarantineRequired: false,
  };
}

function validateContracts(repositoryRoot) {
  const artifactContract = readFileSync(
    path.join(repositoryRoot, "scripts/production-artifact-contract.mjs"),
    "utf8",
  );
  const artifactOwner = readFileSync(
    path.join(repositoryRoot, "scripts/production-artifact-evidence.mjs"),
    "utf8",
  );
  const phase8Owner = readFileSync(
    path.join(repositoryRoot, "scripts/run-phase8-project-benchmark.ts"),
    "utf8",
  );
  const certificationRunner = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-real.mjs"),
    "utf8",
  );
  const sourceContinuityOwner = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/production-certification-source-continuity.mjs",
    ),
    "utf8",
  );
  const worktreeOwner = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-worktrees.mjs"),
    "utf8",
  );
  const worktreeRegressionOwner = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/test-production-certification-state-worktrees.mjs",
    ),
    "utf8",
  );
  const contractMatrix = JSON.parse(
    readFileSync(
      path.join(repositoryRoot, "docs/qa/production-certification-contract.v1.json"),
      "utf8",
    ),
  );
  for (const marker of [
    "interior-ai.production-artifact-evidence.v3",
    "interior-ai.production-artifact-semantic-event-journal.v1",
    "ARCHIVE_PREFLIGHT",
    "STANDALONE_FINAL",
  ]) {
    if (!artifactContract.includes(marker) && !artifactOwner.includes(marker)) {
      throw new Error(`verification compatibility marker is missing: ${marker}`);
    }
  }
  if (
    !artifactOwner.includes('testPolicy: "external-certification-required"') ||
    artifactOwner.includes("requireTests: false") ||
    !phase8Owner.includes("PHASE8_EXTERNAL_EVIDENCE_ROOT")
  ) {
    throw new Error("verification mode or external Phase 8 policy is incomplete");
  }
  const generatedCompleted = artifactOwner.indexOf("generatedSourceCheck.completedAt");
  const buildStarted = artifactOwner.indexOf("manifest.build.startedAt");
  if (generatedCompleted < 0 || buildStarted < 0) {
    throw new Error("generated-source/build ordering contract is missing");
  }
  if (
    !artifactContract.includes(
      "filesystem timestamps cannot populate portable semantic evidence",
    )
  ) {
    throw new Error("semantic timestamp ownership rejection is missing");
  }
  const source = sourceValidationCheckSet(repositoryRoot);
  const continuity = continuityContract(repositoryRoot);
  if (
    source.checks.length === 0 ||
    source.checks.some(
      (check) => !check.canonicalCommand || check.continueAfterFailure !== false,
    ) ||
    continuity.lifecyclePositions.length !== 6 ||
    continuity.syntheticCopiedHashAllowed !== false ||
    continuity.retainPhysicalRootsUntilPassed !== true ||
    JSON.stringify(continuity.integrationReadyRequires) !==
      JSON.stringify(["source-validation", "final-standalone", "continuity"]) ||
    !certificationRunner.includes("sourceValidationStageEvidence") ||
    !certificationRunner.includes("captureArtifactSnapshot") ||
    !certificationRunner.includes("measureFinalContinuity") ||
    !sourceContinuityOwner.includes("rehashPhysicalRoot: true") ||
    contractMatrix.transactionalStateValidation?.canonicalIdentitySource !==
      "sealed certification state" ||
    contractMatrix.stageWorktrees?.minimumDistinctPhysicalRoots !== 3 ||
    !worktreeOwner.includes("CERTIFICATION_WORKTREE_ROLES") ||
    !worktreeRegressionOwner.includes('name: "missing-candidate-id"') ||
    !worktreeRegressionOwner.includes("canonical-checkout-as-stage-root-rejected") ||
    /git\s+clean|clean\s+-x/.test(`${certificationRunner}\n${worktreeOwner}`) ||
    /\.map\(\(name\) => \[name, state\.bindings\.artifactSha256\]\)/.test(
      certificationRunner,
    )
  ) {
    throw new Error(
      "source-validation execution or measured continuity contract is incomplete",
    );
  }
  return {
    artifactSchema: "v3",
    journalSchema: "v1",
    verificationModes: ["verify-preflight", "verify-archive-preflight", "verify-standalone"],
    sourceValidation: {
      schema: "interior-ai.production-certification-source-validation.v3",
      checkCount: source.checks.length,
      checkSetSha256: source.sha256,
      allCanonicalCommandsPresent: true,
    },
    continuity: {
      schema: "interior-ai.production-certification-artifact-snapshot.v1",
      lifecyclePositions: continuity.lifecyclePositions.map((entry) => entry.id),
      captureCommandsDeclared: true,
      comparisonScopes: Object.keys(continuity.comparisons),
      retainedPhysicalRoots: true,
      syntheticCopiedHashAllowed: false,
      integrationReadyRequires: continuity.integrationReadyRequires,
    },
  };
}

function validateStageEnvironmentCapabilities(repositoryRoot, environment) {
  const contract = stageEnvironmentContract(repositoryRoot);
  const profileEntries = Object.entries(contract.profiles);
  const missingStages = CERTIFICATION_STAGE_ORDER.filter(
    (stage) => !profileEntries.some(([, profile]) => profile.stages.includes(stage)),
  );
  if (missingStages.length > 0) {
    throw new Error(
      `certification stages are missing environment profiles: ${missingStages.join(", ")}`,
    );
  }
  const source = sourceValidationCheckSet(repositoryRoot);
  if (
    source.checks.length !== 19 ||
    source.checks.some(
      (check) =>
        !check.environmentProfileId ||
        !contract.profiles[check.environmentProfileId]?.stages.includes(
          "source-validation",
        ) ||
        !check.qualificationEnvironmentProfileId ||
        !contract.profiles[
          check.qualificationEnvironmentProfileId
        ]?.stages.includes("source-validation"),
    )
  ) {
    throw new Error("all 19 source checks must declare source-validation profiles");
  }
  const sourceProfile = contract.profiles["source-validation"];
  const runtimeProfile = contract.profiles["runtime-smoke"];
  const phase8Profile = contract.profiles.phase8;
  const productionBrowser = contract.profiles["production-browser-owner"];
  const developmentBrowser = contract.profiles["development-browser-owner"];
  const qualificationSourceProfile =
    contract.profiles["source-validation-qualification"];
  const floorPlanCheck = source.checks.find(
    (entry) => entry.id === "floor-plan-required-closure",
  );
  const sourcePolicies = sourceProfile.valuePolicies;
  const qualificationSourcePolicies = qualificationSourceProfile.valuePolicies;
  const floorPlanLocalOcrTest = readFileSync(
    path.join(repositoryRoot, "scripts/test-floor-plan-local-ocr.ts"),
    "utf8",
  );
  const floorPlanAdapter = readFileSync(
    path.join(repositoryRoot, "lib/floor-plan-imports/pdf-raster-adapter.ts"),
    "utf8",
  );
  const floorPlanVisionConfiguration = readFileSync(
    path.join(
      repositoryRoot,
      "lib/floor-plan-imports/vision-configuration.ts",
    ),
    "utf8",
  );
  const stageEnvironmentRegression = readFileSync(
    path.join(
      repositoryRoot,
      "scripts/test-production-certification-stage-environment.mjs",
    ),
    "utf8",
  );
  const runtimeTimingWriter = readFileSync(
    path.join(repositoryRoot, "scripts/runtime-smoke-phase-budget.mjs"),
    "utf8",
  );
  const certificationRunner = readFileSync(
    path.join(repositoryRoot, "scripts/production-certification-real.mjs"),
    "utf8",
  );
  if (
    !sourceProfile.parentOnlyVariables.includes("CERTIFICATION_EVIDENCE_ROOT") ||
    sourceProfile.childVisibleVariables.includes("CERTIFICATION_EVIDENCE_ROOT") ||
    sourceProfile.childVisibleVariables.some((name) =>
      new Set([
        "CERTIFICATION_RUNTIME_START_MARKER_PATH",
        "PLAYWRIGHT_JSON_OUTPUT_FILE",
        "PHASE8_EXTERNAL_EVIDENCE_ROOT",
        "REQUIRED_TEST_GATE_ID",
      ]).has(name),
    ) ||
    runtimeProfile.fixedValues.CERTIFICATION_ENVIRONMENT_STAGE !==
      "runtime-smoke" ||
    !runtimeProfile.requiredVariables.includes(
      "CERTIFICATION_RUNTIME_START_MARKER_PATH",
    ) ||
    !runtimeProfile.requiredVariables.includes(
      "PRODUCTION_EVIDENCE_MANIFEST",
    ) ||
    !runtimeProfile.parentOnlyVariables.includes("CERTIFICATION_EVIDENCE_ROOT") ||
    runtimeProfile.childVisibleVariables.includes("CERTIFICATION_EVIDENCE_ROOT") ||
    !runtimeProfile.requiredVariables.includes(
      "PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT",
    ) ||
    !runtimeProfile.requiredVariables.includes("RUNTIME_SMOKE_PHASE_TIMINGS_PATH") ||
    !runtimeProfile.requiredVariables.includes(
      "CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_SHA256",
    ) ||
    sourceProfile.childVisibleVariables.includes(
      "PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT",
    ) ||
    sourceProfile.childVisibleVariables.includes("RUNTIME_SMOKE_PHASE_TIMINGS_PATH") ||
    developmentBrowser.childVisibleVariables.includes(
      "RUNTIME_SMOKE_PHASE_TIMINGS_PATH",
    ) ||
    runtimeTimingWriter.includes("CERTIFICATION_EVIDENCE_ROOT") ||
    !runtimeTimingWriter.includes("resolveRuntimeSmokeEvidencePath") ||
    !runtimeTimingWriter.includes("PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT") ||
    !certificationRunner.includes("preflightRuntimeSmokeEvidenceOutputs") ||
    !certificationRunner.includes("createRuntimeSmokeTimingEvidenceBinding") ||
    !phase8Profile.requiredVariables.includes("PHASE8_EXTERNAL_EVIDENCE_ROOT") ||
    productionBrowser.fixedValues.PLAYWRIGHT_USE_PRODUCTION_SERVER !== "1" ||
    developmentBrowser.childVisibleVariables.includes(
      "PLAYWRIGHT_USE_PRODUCTION_SERVER",
    ) ||
    floorPlanCheck?.canonicalCommand !== "npm run test:floor-plan-required" ||
    sourcePolicies.FLOOR_PLAN_VISION_ENABLED?.policy !==
      "check-owned-fixture-value" ||
    sourcePolicies.FLOOR_PLAN_VISION_ENABLED?.value !== "0" ||
    sourcePolicies.FLOOR_PLAN_VISION_ENABLED?.valueType !== "boolean" ||
    JSON.stringify(
      sourcePolicies.FLOOR_PLAN_VISION_ENABLED?.ownerCheckIds,
    ) !== JSON.stringify(["floor-plan-required-closure"]) ||
    JSON.stringify(sourcePolicies) !==
      JSON.stringify(qualificationSourcePolicies) ||
    [
      "FLOOR_PLAN_LOCAL_OCR_DISABLED",
      "FLOOR_PLAN_VISION_DISABLED",
      "FLOOR_PLAN_VISION_MODEL",
      "OPENAI_API_KEY",
    ].some((name) => sourcePolicies[name]?.policy !== "must-be-absent") ||
    [contract.profiles.build, runtimeProfile].some(
      (profile) =>
        profile.valuePolicies.FLOOR_PLAN_VISION_ENABLED?.policy !==
          "optional-non-secret-enum" ||
        profile.valuePolicies.OPENAI_API_KEY?.policy !==
          "optional-secret-value-not-recorded" ||
        Object.values(profile.valuePolicies).some(
          (policy) => policy.policy === "check-owned-fixture-value",
        ),
    ) ||
    !CERTIFICATION_HARNESS_SOURCE_PATHS.includes(
      "scripts/test-production-certification-stage-environment.mjs",
    ) ||
    !/module import before environment setup/i.test(stageEnvironmentRegression) ||
    !/historical real-runner leakage reproduction/i.test(
      stageEnvironmentRegression,
    ) ||
    !/externalVisionEnabled, false/.test(floorPlanLocalOcrTest) ||
    /process\.env|delete\s+process\.env/.test(floorPlanLocalOcrTest) ||
    !/externalVisionEnabled:\s*environment\.FLOOR_PLAN_VISION_ENABLED === "1"/.test(
      floorPlanVisionConfiguration,
    ) ||
    !/const vision = floorPlanVisionRuntimeConfiguration\(\)/.test(
      floorPlanAdapter,
    ) ||
    !/externalVisionEnabled: vision\.externalVisionEnabled/.test(
      floorPlanAdapter,
    ) ||
    !/!vision\.externalVisionEnabled/.test(floorPlanAdapter) ||
    !/!vision\.apiKeyConfigured/.test(floorPlanAdapter)
  ) {
    throw new Error(
      "runtime, browser-owner, Phase 8, or source-validation environment profiles are incoherent",
    );
  }
  const unknownParentControls = Object.keys(environment)
    .filter(
      (name) =>
        isCertificationControlVariableName(name, contract) &&
        !Object.hasOwn(contract.variables, name),
    )
    .sort();
  if (unknownParentControls.length > 0) {
    throw new Error(
      `unknown certification-control variables are prohibited: ${unknownParentControls.join(", ")}`,
    );
  }
  return {
    schema: contract.value.schema,
    contractSha256: contract.sha256,
    profileCount: profileEntries.length,
    sourceCheckCount: source.checks.length,
    sourceEvidenceRootParentOnly: true,
    floorPlanSourceConfigurationOwned: true,
    valuePolicySha256: sourceProfile.valuePolicySha256,
    importOrderRegressionRegistered: true,
    historicalFloorPlanRegressionRegistered: true,
    buildRuntimeVisionConfigurationPreserved: true,
    runtimeActivationExplicit: true,
    runtimeTimingRootOwner: "PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT",
    runtimeTimingTargetPreflight: true,
    runtimeTimingWriterContractShared: true,
    unknownControlPolicy: "fail-closed-in-doctor; strip-and-record-in-projector",
  };
}

export function runCertificationDoctor({
  repositoryRoot = process.cwd(),
  environment = process.env,
}) {
  const root = path.resolve(repositoryRoot);
  const checks = [];
  const issues = [];
  check(checks, issues, "source-identity", () => validateSource(root, environment));
  check(checks, issues, "candidate-id", () => {
    if (!isCandidateId(environment.PRODUCTION_EVIDENCE_CANDIDATE_ID)) {
      throw new Error("candidate ID is missing or malformed");
    }
    return { propagatedName: "PRODUCTION_EVIDENCE_CANDIDATE_ID" };
  });
  check(checks, issues, "environment-name-shape", () => {
    const missing = REQUIRED_APPLICATION_ENVIRONMENT_NAMES.filter(
      (name) => !requiredAlternativesPresent(environment, name),
    );
    if (missing.length > 0) throw new Error(`missing required names: ${missing.join(", ")}`);
    return { requiredNameCount: REQUIRED_APPLICATION_ENVIRONMENT_NAMES.length };
  });
  check(checks, issues, "execution-classification", () => {
    if (!new Set(["real-candidate", "deterministic-simulation"]).has(environment.CERTIFICATION_EXECUTION_CLASS)) {
      throw new Error("execution classification is missing or unknown");
    }
    return { executionClass: environment.CERTIFICATION_EXECUTION_CLASS };
  });
  check(checks, issues, "database-shape", () => validateDatabaseShape(environment));
  check(checks, issues, "network-shape", () => validateNetworkShape(environment));
  check(checks, issues, "external-evidence-destinations", () =>
    validateEvidenceDestinations(root, environment));
  check(checks, issues, "stage-worktree-isolation", () =>
    validateStageWorktreeIsolation(root, environment));
  check(checks, issues, "strict-build-target-absence", () => {
    const state = readCertificationState(environment.PRODUCTION_CERTIFICATION_STATE);
    const finalArtifact = resolveCertificationStageWorktree({
      state,
      evidenceRoot: environment.CERTIFICATION_EVIDENCE_ROOT,
      canonicalRoot: root,
      role: "final-artifact",
      phase: "pristine",
    });
    return validateBuildTargetsPristine(finalArtifact.root);
  });
  check(checks, issues, "schema-and-mode-compatibility", () => validateContracts(root));
  check(checks, issues, "stage-environment-capabilities", () =>
    validateStageEnvironmentCapabilities(root, environment));
  check(checks, issues, "archive-file-backed-owner", () =>
    assertFileBackedOwner(root, "scripts/production-archive.mjs"));
  check(checks, issues, "verifier-transitive-closure", () => {
    const closure = deriveProductionVerifierClosure(root);
    if (
      closure.missingImports.length ||
      closure.escapingImports.length ||
      closure.destinationCollisions.length ||
      closure.sourceWorktreeFallback ||
      closure.globalModuleFallback
    ) {
      throw new Error("verifier source closure is incomplete or unsafe");
    }
    return {
      fileCount: closure.files.length,
      edgeCount: closure.edges.length,
      closureSha256: closure.closureSha256,
    };
  });
  check(checks, issues, "runtime-browser-inventory", () => ({
    runtimeSmokeCount: 2,
    browserOwners: REQUIRED_BROWSER_OWNERS.map((owner) => owner.id),
  }));
  check(checks, issues, "ports-and-processes", () => validatePortsAndProcesses(root));
  const sourceIdentity = harnessSourceIdentity(root);
  const payload = {
    schema: PRODUCTION_CERTIFICATION_DOCTOR_SCHEMA,
    harnessVersion: PRODUCTION_CERTIFICATION_HARNESS_VERSION,
    harnessSourceSha256: sourceIdentity.sha256,
    nonConsuming: true,
    substantiveGateConsumed: false,
    canonicalCommand: CERTIFICATION_STAGE_COMMANDS.doctor,
    valid: issues.length === 0,
    checks,
    issues,
  };
  return {
    ...payload,
    seal: { algorithm: "sha256", sha256: sha256Bytes(canonicalJsonBytes(payload)) },
  };
}

function cli() {
  const repositoryRoot = process.env.CERTIFICATION_SOURCE_ROOT || process.cwd();
  const result = runCertificationDoctor({ repositoryRoot });
  process.stdout.write(canonicalJsonBytes(result));
  if (!result.valid) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1], "file:").href) cli();
