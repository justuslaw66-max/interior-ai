import {
  constants,
  accessSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import {
  CERTIFICATION_EVIDENCE_ROOT_ENV,
  CERTIFICATION_STATE_ENV,
  canonicalJsonBytes,
  isSha256,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import {
  createPreparationEvidence,
  preparationEvidenceBindingIssues,
  preparationEvidenceIssues,
  preparationTimestamps,
  resourceSiblingProbeContract,
} from "./production-certification-resource-evidence.mjs";
import {
  assertCurrentCertificationResourcePlan,
  resolveCertificationResourceDestinations,
} from "./production-certification-resource-plan.mjs";
import {
  readCertificationState,
  transitionCertificationResourcePreparation,
} from "./production-certification-state.mjs";
import { resolveRetainedExternalEvidenceFile } from "./playwright-report-path.mjs";

function requiredEnvironment(environment, name) {
  const value = environment[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`certification resource preparation requires ${name}`);
  }
  return value;
}

function sanitizedFilesystemError(error, context) {
  if (typeof error?.code === "string") {
    return new Error(`${context} (${error.code})`);
  }
  return error instanceof Error ? error : new Error(context);
}

function pathExists(filePath) {
  try {
    lstatSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw sanitizedFilesystemError(
      error,
      "certification resource filesystem inspection failed",
    );
  }
}

function createPhysicalParent(rootPath, rootRealpath, parentPath) {
  const root = path.resolve(rootPath);
  const relative = path.relative(root, parentPath);
  let current = root;
  let created = false;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (!pathExists(current)) {
      mkdirSync(current, { mode: 0o700 });
      created = true;
    }
    const entry = lstatSync(current);
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error(
        "certification resource parent chain must contain physical directories",
      );
    }
    const physical = realpathSync(current);
    if (
      physical !== rootRealpath &&
      !physical.startsWith(`${rootRealpath}${path.sep}`)
    ) {
      throw new Error("certification resource parent escaped its authorized root");
    }
  }
  const metadata = lstatSync(parentPath);
  if ((metadata.mode & 0o222) === 0) {
    throw new Error("certification resource parent is not writable");
  }
  accessSync(parentPath, constants.W_OK);
  return created;
}

function probePaths(destination, evidenceRoot) {
  const base = `.certification-resource-${destination.id}-${destination.pathContractSha256.slice(0, 12)}.probe`;
  const probePath = path.join(destination.parentPath, base);
  return {
    probePath,
    stagingPath: `${probePath}.tmp`,
    portableProbePath: path.relative(evidenceRoot, probePath).split(path.sep).join("/"),
    portableStagingPath: path
      .relative(evidenceRoot, `${probePath}.tmp`)
      .split(path.sep)
      .join("/"),
  };
}

function runSiblingProbeUnsafe(destination, evidenceRoot) {
  const paths = probePaths(destination, evidenceRoot);
  if (pathExists(paths.probePath) || pathExists(paths.stagingPath)) {
    throw new Error(`certification resource sibling probe is not absent: ${destination.id}`);
  }
  const contract = resourceSiblingProbeContract(destination);
  const bytes = contract.bytes;
  let descriptor = null;
  try {
    descriptor = openSync(paths.stagingPath, "wx", 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(descriptor, bytes, offset, bytes.length - offset);
      if (written <= 0) throw new Error("certification sibling probe made no progress");
      offset += written;
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(paths.stagingPath, paths.probePath);
    if (!readFileSync(paths.probePath).equals(bytes)) {
      throw new Error("certification sibling probe bytes changed after rename");
    }
    unlinkSync(paths.probePath);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    for (const cleanupPath of [paths.stagingPath, paths.probePath]) {
      if (pathExists(cleanupPath)) unlinkSync(cleanupPath);
    }
  }
  return {
    required: true,
    passed: true,
    sha256: contract.sha256,
    portableProbePath: paths.portableProbePath,
    portableStagingPath: paths.portableStagingPath,
    removed: true,
  };
}

function runSiblingProbe(destination, evidenceRoot) {
  try {
    return runSiblingProbeUnsafe(destination, evidenceRoot);
  } catch (error) {
    throw sanitizedFilesystemError(
      error,
      `certification resource sibling probe failed: ${destination.id}`,
    );
  }
}

function readPreparationEvidence({ repositoryRoot, evidenceRoot, descriptor }) {
  let bytes;
  try {
    const retained = resolveRetainedExternalEvidenceFile({
      filePath: path.join(evidenceRoot, descriptor.path),
      authorizedExternalRoot: evidenceRoot,
      repositoryRoot,
    });
    bytes = readFileSync(retained.absolutePath);
  } catch (error) {
    throw sanitizedFilesystemError(
      error,
      "certification resource preparation evidence read failed",
    );
  }
  if (sha256Bytes(bytes) !== descriptor.sha256) {
    throw new Error("certification resource preparation evidence hash changed");
  }
  const evidence = JSON.parse(bytes.toString("utf8"));
  if (!bytes.equals(canonicalJsonBytes(evidence))) {
    throw new Error("certification resource preparation evidence is not canonical JSON");
  }
  const issues = preparationEvidenceIssues(evidence);
  if (issues.length > 0) throw new Error(issues.join("; "));
  return evidence;
}

export function validateCertificationResourcePreparation({
  repositoryRoot,
  evidenceRoot,
  environment,
  state,
}) {
  if (state?.version !== 4 || state.resourcePreparation === null) {
    throw new Error("canonical certification resource preparation evidence is missing");
  }
  const plan = assertCurrentCertificationResourcePlan({
    statePlan: state.resourcePlan,
    repositoryRoot,
    evidenceRoot,
    environment,
  });
  const resolved = resolveCertificationResourceDestinations({
    repositoryRoot,
    evidenceRoot,
    environment,
    requireExistingParents: true,
  });
  const descriptor = state.resourcePreparation.evidence;
  const evidence = readPreparationEvidence({ repositoryRoot, evidenceRoot, descriptor });
  const bindingIssues = preparationEvidenceBindingIssues({ evidence, state, plan });
  if (bindingIssues.length > 0) throw new Error(bindingIssues.join("; "));
  for (const destination of resolved.destinations) {
    const probes = probePaths(destination, evidenceRoot);
    if (
      pathExists(probes.probePath) ||
      pathExists(probes.stagingPath)
    ) {
      throw new Error(`certification resource preparation is stale: ${destination.id}`);
    }
  }
  return { valid: true, destinationCount: resolved.destinations.length, evidence };
}

function prepareResources({ state, stateSha256, repositoryRoot, evidenceRoot, environment, clock }) {
  const plan = assertCurrentCertificationResourcePlan({
    statePlan: state.resourcePlan,
    repositoryRoot,
    evidenceRoot,
    environment,
  });
  if (state.resourcePreparation !== null) {
    validateCertificationResourcePreparation({
      repositoryRoot,
      evidenceRoot,
      environment,
      state,
    });
    return null;
  }
  const preparable = resolveCertificationResourceDestinations({
    repositoryRoot,
    evidenceRoot,
    environment,
  });
  let root;
  try {
    root = realpathSync(evidenceRoot);
  } catch (error) {
    throw sanitizedFilesystemError(
      error,
      "certification resource external-root inspection failed",
    );
  }
  const initiallyExisting = new Map(
    preparable.destinations.map((destination) => [
      destination.id,
      destination.parentExists,
    ]),
  );
  for (const destination of preparable.destinations) {
    try {
      createPhysicalParent(evidenceRoot, root, destination.parentPath);
    } catch (error) {
      throw sanitizedFilesystemError(
        error,
        `certification resource parent preparation failed: ${destination.id}`,
      );
    }
  }
  const strict = resolveCertificationResourceDestinations({
    repositoryRoot,
    evidenceRoot,
    environment,
    requireExistingParents: true,
  });
  const results = strict.destinations.map((destination) => ({
    id: destination.id,
    lifecycleStage: destination.lifecycleStage,
    targetType: destination.targetType,
    destinationClass: destination.destinationClass,
    portableRelativePath: destination.portableRelativePath,
    pathContractSha256: destination.pathContractSha256,
    targetIdentitySha256: destination.targetIdentitySha256,
    parent: {
      existedBefore: initiallyExisting.get(destination.id),
      createdByPreparation: !initiallyExisting.get(destination.id),
      exists: true,
      writable: true,
      realpathClass: "authorized-external-root",
    },
    externalRootContained: true,
    targetAbsent: true,
    siblingProbe: runSiblingProbe(destination, evidenceRoot),
  }));
  resolveCertificationResourceDestinations({
    repositoryRoot,
    evidenceRoot,
    environment,
    requireExistingParents: true,
  });
  const timestamps = preparationTimestamps(state, environment, clock);
  if (
    Date.parse(timestamps.startedAt) < Date.parse(state.updatedAt) ||
    Date.parse(timestamps.completedAt) < Date.parse(timestamps.startedAt)
  ) {
    throw new Error("certification resource preparation timestamps predate state");
  }
  const evidence = createPreparationEvidence({
    state,
    stateSha256,
    plan,
    results,
    timestamps,
  });
  const evidencePath = path.join(evidenceRoot, "preparation/resources.json");
  mkdirSync(path.dirname(evidencePath), { recursive: true, mode: 0o700 });
  writeFileSync(evidencePath, canonicalJsonBytes(evidence), { flag: "wx", mode: 0o600 });
  const descriptor = {
    path: "preparation/resources.json",
    sha256: sha256Bytes(readFileSync(evidencePath)),
  };
  return {
    descriptor,
    completedAt: timestamps.completedAt,
    contractMatrixSha256: plan.contractMatrixSha256,
    destinationSetSha256: plan.destinationSetSha256,
  };
}

export function runCertificationResourcePreparation({
  repositoryRoot = process.cwd(),
  environment = process.env,
  clock = () => new Date(),
  postCommitValidationHook = null,
} = {}) {
  if (
    postCommitValidationHook !== null &&
    typeof postCommitValidationHook !== "function"
  ) {
    throw new Error("certification resource post-commit hook is malformed");
  }
  const evidenceRoot = requiredEnvironment(environment, CERTIFICATION_EVIDENCE_ROOT_ENV);
  const requestedState = requiredEnvironment(environment, CERTIFICATION_STATE_ENV);
  let retainedState;
  try {
    retainedState = resolveRetainedExternalEvidenceFile({
      filePath: requestedState,
      authorizedExternalRoot: evidenceRoot,
      repositoryRoot,
    });
  } catch (error) {
    throw sanitizedFilesystemError(
      error,
      "certification resource state-path validation failed",
    );
  }
  const expectedCurrentSha256 = requiredEnvironment(
    environment,
    "CERTIFICATION_EXPECTED_STATE_SHA256",
  );
  if (!isSha256(expectedCurrentSha256)) {
    throw new Error("certification expected state SHA-256 is malformed");
  }
  let createdEvidencePath = null;
  let createdEvidenceDescriptor = null;
  let transitionCommitted = false;
  try {
    const transition = transitionCertificationResourcePreparation({
      statePath: retainedState.absolutePath,
      expectedCurrentSha256,
      prepare: ({ state, stateSha256, existing }) => {
        if (existing) {
          validateCertificationResourcePreparation({
            repositoryRoot,
            evidenceRoot,
            environment,
            state,
          });
          return null;
        }
        const result = prepareResources({
          state,
          stateSha256,
          repositoryRoot,
          evidenceRoot,
          environment,
          clock,
        });
        createdEvidencePath = path.join(evidenceRoot, result.descriptor.path);
        createdEvidenceDescriptor = result.descriptor;
        return {
          evidence: result.descriptor,
          completedAt: result.completedAt,
          contractMatrixSha256: result.contractMatrixSha256,
          destinationSetSha256: result.destinationSetSha256,
        };
      },
    });
    transitionCommitted = true;
    if (postCommitValidationHook !== null) {
      if (
        transition.state.executionClass !== "deterministic-simulation" ||
        environment.CERTIFICATION_QUALIFICATION_MODE !== "1"
      ) {
        throw new Error(
          "certification resource post-commit hook is restricted to qualification",
        );
      }
      postCommitValidationHook({
        evidenceRoot,
        state: transition.state,
        stateSha256: transition.stateSha256,
      });
    }
    const validation = validateCertificationResourcePreparation({
      repositoryRoot,
      evidenceRoot,
      environment,
      state: transition.state,
    });
    return {
      valid: true,
      idempotent: !transition.mutated,
      stateSha256: transition.stateSha256,
      destinationCount: validation.destinationCount,
      evidence: transition.state.resourcePreparation.evidence,
    };
  } catch (error) {
    let evidenceBound = transitionCommitted;
    if (!evidenceBound && createdEvidenceDescriptor !== null) {
      try {
        const current = readCertificationState(retainedState.absolutePath);
        evidenceBound =
          current.resourcePreparation?.evidence?.path ===
            createdEvidenceDescriptor.path &&
          current.resourcePreparation?.evidence?.sha256 ===
            createdEvidenceDescriptor.sha256;
      } catch {
        // An unreadable transition result cannot prove the evidence is orphaned.
        evidenceBound = true;
      }
    }
    if (
      !evidenceBound &&
      createdEvidencePath &&
      existsSync(createdEvidencePath)
    ) {
      unlinkSync(createdEvidencePath);
    }
    throw sanitizedFilesystemError(
      error,
      "certification resource preparation failed",
    );
  }
}
