import { createHash } from "node:crypto";
import {
  constants,
  accessSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT =
  "PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT";
export const CERTIFICATION_EVIDENCE_ROOT = "CERTIFICATION_EVIDENCE_ROOT";
export const PLAYWRIGHT_PRODUCTION_EVIDENCE_PATH_POLICY =
  "production-evidence";
export const RUNTIME_SMOKE_EVIDENCE_ROOT_CONTRACT_SCHEMA =
  "interior-ai.runtime-smoke-evidence-root-contract.v1";
export const RUNTIME_SMOKE_EVIDENCE_ROOT_CONTRACT_VERSION = 1;
export const RUNTIME_SMOKE_EVIDENCE_DESTINATION_CLASS =
  "playwright-external-evidence-root";
export const RUNTIME_SMOKE_REPORT_AUTHORIZATION_SCHEMA =
  "interior-ai.runtime-smoke-report-authorization.v2";
export const REQUIRED_TEST_OUTPUT_AUTHORIZATION_SCHEMA =
  "interior-ai.required-test-output-authorization.v1";
export const REQUIRED_TEST_OUTPUT_COMPLETION_SCHEMA =
  "interior-ai.required-test-output-completion.v1";

export const RUNTIME_SMOKE_EVIDENCE_OUTPUTS = Object.freeze({
  report: Object.freeze({ filename: "playwright-report.json" }),
  timings: Object.freeze({ filename: "phase-timings.json" }),
  summary: Object.freeze({ filename: "evidence.json" }),
  startMarker: Object.freeze({ filename: "product-test-start.json" }),
});

const RUNTIME_SMOKE_EVIDENCE_ROOT_CONTRACT = Object.freeze({
  schema: RUNTIME_SMOKE_EVIDENCE_ROOT_CONTRACT_SCHEMA,
  version: RUNTIME_SMOKE_EVIDENCE_ROOT_CONTRACT_VERSION,
  rootVariableName: PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT,
  destinationClass: RUNTIME_SMOKE_EVIDENCE_DESTINATION_CLASS,
  requestedPath: "normalized-absolute-json-file",
  containment: "beneath-physical-authorized-root-outside-all-worktrees",
  parentPolicy: "existing-physical-writable-directory",
  targetPolicy: "absent-single-writer",
  portablePath: "relative-to-authorized-root",
});

export const RUNTIME_SMOKE_EVIDENCE_ROOT_CONTRACT_SHA256 = createHash("sha256")
  .update(`${JSON.stringify(RUNTIME_SMOKE_EVIDENCE_ROOT_CONTRACT, null, 2)}\n`)
  .digest("hex");

const REPOSITORY_REPORT_DIRECTORY =
  ".local/production-artifact-evidence";

function containedBy(root, candidate, { allowRoot = false } = {}) {
  return (
    (allowRoot && candidate === root) ||
    candidate.startsWith(`${root}${path.sep}`)
  );
}

function requiredNormalizedPath(value, description) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${description} is required.`);
  }
  if (value.includes("\0") || value !== value.trim()) {
    throw new Error(`${description} is malformed.`);
  }
  if (path.normalize(value) !== value) {
    throw new Error(`${description} must be normalized.`);
  }
  return value;
}

function existingWritableParent(targetPath) {
  const parentPath = path.dirname(targetPath);
  let parent;
  try {
    parent = statSync(parentPath);
  } catch {
    throw new Error("Production evidence report parent directory must already exist.");
  }
  if (!parent.isDirectory()) {
    throw new Error("Production evidence report parent directory must be a directory.");
  }
  if ((parent.mode & 0o222) === 0) {
    throw new Error("Production evidence report parent directory is not writable.");
  }
  try {
    accessSync(parentPath, constants.W_OK);
  } catch {
    throw new Error("Production evidence report parent directory is not writable.");
  }
  return { parentPath, parentRealpath: realpathSync(parentPath) };
}

function requireAbsentJsonTarget(targetPath) {
  if (path.extname(targetPath) !== ".json" || path.basename(targetPath) === ".json") {
    throw new Error("Production evidence report path must name a JSON file.");
  }
  try {
    const target = lstatSync(targetPath);
    if (target.isDirectory()) {
      throw new Error("Production evidence report path cannot be a directory.");
    }
    throw new Error("Production evidence report path must not already exist.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function inspectPhysicalJsonTarget(targetPath) {
  if (path.extname(targetPath) !== ".json" || path.basename(targetPath) === ".json") {
    throw new Error("Production evidence report path must name a JSON file.");
  }
  try {
    const target = lstatSync(targetPath);
    if (target.isSymbolicLink() || !target.isFile()) {
      throw new Error(
        "Production evidence re-entry target must be a physical JSON file.",
      );
    }
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function readGitDirectory(repositoryRoot) {
  const dotGitPath = path.join(repositoryRoot, ".git");
  let dotGit;
  try {
    dotGit = lstatSync(dotGitPath);
  } catch {
    return null;
  }
  if (dotGit.isDirectory()) return realpathSync(dotGitPath);
  if (!dotGit.isFile()) return null;
  let gitDirectory;
  try {
    const match = /^gitdir: (.+)$/m.exec(readFileSync(dotGitPath, "utf8"));
    if (!match) return null;
    gitDirectory = path.resolve(repositoryRoot, match[1]);
  } catch {
    return null;
  }
  return realpathSync(gitDirectory);
}

function discoverWorktreeRoots(repositoryRoot) {
  const roots = new Set([path.resolve(repositoryRoot)]);
  const gitDirectory = readGitDirectory(repositoryRoot);
  if (!gitDirectory) return roots;
  const worktreeSegment = `${path.sep}worktrees${path.sep}`;
  const worktreeIndex = gitDirectory.lastIndexOf(worktreeSegment);
  const commonGitDirectory =
    worktreeIndex >= 0
      ? gitDirectory.slice(0, worktreeIndex)
      : gitDirectory;
  if (path.basename(commonGitDirectory) !== ".git") return roots;
  roots.add(path.dirname(commonGitDirectory));
  const worktreesDirectory = path.join(commonGitDirectory, "worktrees");
  let entries;
  try {
    entries = readdirSync(worktreesDirectory, { withFileTypes: true });
  } catch {
    return roots;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const gitFilePath = readFileSync(
        path.join(worktreesDirectory, entry.name, "gitdir"),
        "utf8",
      ).trim();
      if (gitFilePath) roots.add(path.dirname(path.resolve(gitFilePath)));
    } catch {
      // A stale or concurrently removed administrative entry grants no access.
    }
  }
  return roots;
}

function knownRepositoryRoots(repositoryRoot, additionalRepositoryRoots) {
  const roots = discoverWorktreeRoots(repositoryRoot);
  for (const additionalRoot of additionalRepositoryRoots ?? []) {
    if (typeof additionalRoot !== "string" || !additionalRoot.trim()) continue;
    for (const discovered of discoverWorktreeRoots(additionalRoot)) {
      roots.add(discovered);
    }
  }
  const identities = new Set();
  for (const root of roots) {
    const absoluteRoot = path.resolve(root);
    identities.add(absoluteRoot);
    try {
      if (statSync(absoluteRoot).isDirectory()) {
        identities.add(realpathSync(absoluteRoot));
      }
    } catch {
      // Missing administrative worktree entries cannot authorize a destination.
    }
  }
  return [...identities];
}

function assertOutsideRepositories(candidatePaths, repositoryRoots, description) {
  if (
    candidatePaths.some((candidate) =>
      repositoryRoots.some((root) => containedBy(root, candidate, { allowRoot: true })),
    )
  ) {
    throw new Error(`${description} must remain outside every repository worktree.`);
  }
}

function pathEntry(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
    throw error;
  }
}

export function resolveCertificationExternalDestination({
  requestedPath,
  repositoryRoot,
  authorizedExternalRoot,
  additionalRepositoryRoots = [],
  targetType,
  expectedSuffix,
  requireExistingParent = false,
}) {
  const normalized = requiredNormalizedPath(
    requestedPath,
    "Certification external destination path",
  );
  if (!path.isAbsolute(normalized) || path.win32.isAbsolute(normalized) !== path.isAbsolute(normalized)) {
    throw new Error("Certification external destination path must be absolute.");
  }
  if (!new Set(["file", "directory"]).has(targetType)) {
    throw new Error("Certification external destination type is malformed.");
  }
  if (
    (targetType === "directory" && expectedSuffix !== null) ||
    (targetType === "file" &&
      (typeof expectedSuffix !== "string" || !normalized.endsWith(expectedSuffix)))
  ) {
    throw new Error("Certification external destination type or suffix is invalid.");
  }
  const root = resolveAuthorizedExternalEvidenceRoot({
    authorizedExternalRoot,
    repositoryRoot,
    additionalRepositoryRoots,
  });
  const absolutePath = path.resolve(normalized);
  if (!containedBy(root.externalRoot, absolutePath)) {
    throw new Error(
      "Certification external destination must remain beneath its authorized root.",
    );
  }
  const repositoryRoots = knownRepositoryRoots(
    repositoryRoot,
    additionalRepositoryRoots,
  );
  assertOutsideRepositories(
    [absolutePath],
    repositoryRoots,
    "Certification external destination",
  );
  const targetEntry = pathEntry(absolutePath);
  if (targetEntry !== null) {
    throw new Error("Certification external destination target must remain absent.");
  }
  const parentPath = path.dirname(absolutePath);
  const relativeParent = path.relative(root.externalRoot, parentPath);
  let current = root.externalRoot;
  let parentExists = true;
  for (const component of relativeParent.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const entry = pathEntry(current);
    if (entry === null) {
      parentExists = false;
      continue;
    }
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error(
        "Certification external destination parent chain must contain only physical directories.",
      );
    }
    const physical = realpathSync(current);
    if (!containedBy(root.externalRootRealpath, physical, { allowRoot: true })) {
      throw new Error("Certification external destination parent escapes its authorized root.");
    }
    assertOutsideRepositories(
      [physical],
      repositoryRoots,
      "Certification external destination parent",
    );
  }
  let parentRealpath = null;
  if (parentExists) {
    const parent = existingWritableParent(absolutePath);
    parentRealpath = parent.parentRealpath;
    if (!containedBy(root.externalRootRealpath, parentRealpath, { allowRoot: true })) {
      throw new Error("Certification external destination parent escapes its authorized root.");
    }
  } else if (requireExistingParent) {
    throw new Error("Certification external destination parent directory must already exist.");
  }
  const portableRelativePath = path
    .relative(root.externalRoot, absolutePath)
    .split(path.sep)
    .join("/");
  return Object.freeze({
    outputPath: absolutePath,
    parentPath,
    parentExists,
    parentRealpath,
    destinationClass: "certification-external-evidence-root",
    portableRelativePath,
    targetType,
  });
}

function resolveRepositoryRelativeReport({ requestedPath, repositoryRoot }) {
  if (path.isAbsolute(requestedPath) || path.win32.isAbsolute(requestedPath)) {
    throw new Error("Production evidence report path class is contradictory.");
  }
  if (requestedPath.includes("\\")) {
    throw new Error("Production evidence report path is malformed.");
  }
  const portablePath = requestedPath.split(path.sep).join("/");
  if (!portablePath.startsWith(`${REPOSITORY_REPORT_DIRECTORY}/`)) {
    throw new Error(
      "Repository-relative production evidence reports must use the approved ignored evidence directory.",
    );
  }
  const root = path.resolve(repositoryRoot);
  const rootRealpath = realpathSync(root);
  const outputPath = path.resolve(root, requestedPath);
  if (!containedBy(root, outputPath)) {
    throw new Error("Production evidence report path must remain inside the repository.");
  }
  requireAbsentJsonTarget(outputPath);
  const { parentRealpath } = existingWritableParent(outputPath);
  if (!containedBy(rootRealpath, parentRealpath, { allowRoot: true })) {
    throw new Error("Production evidence report parent escapes the repository.");
  }
  return Object.freeze({
    outputPath,
    destinationClass: "repository-relative",
    displayPath: portablePath,
    parentRealpath,
  });
}

function resolveExternalReport({
  requestedPath,
  repositoryRoot,
  authorizedExternalRoot,
  additionalRepositoryRoots,
  inspectExistingTarget = false,
}) {
  const externalRootInput = requiredNormalizedPath(
    authorizedExternalRoot,
    "Authorized external Playwright evidence root",
  );
  if (!path.isAbsolute(externalRootInput)) {
    throw new Error("Authorized external Playwright evidence root must be absolute.");
  }
  const externalRoot = path.resolve(externalRootInput);
  let externalRootEntry;
  try {
    externalRootEntry = lstatSync(externalRoot);
  } catch {
    throw new Error("Authorized external Playwright evidence root must already exist.");
  }
  if (externalRootEntry.isSymbolicLink()) {
    throw new Error("Authorized external Playwright evidence root cannot be a symlink.");
  }
  if (!externalRootEntry.isDirectory()) {
    throw new Error("Authorized external Playwright evidence root must be a directory.");
  }
  const externalRootRealpath = realpathSync(externalRoot);
  const repositoryRoots = knownRepositoryRoots(
    repositoryRoot,
    additionalRepositoryRoots,
  );
  assertOutsideRepositories(
    [externalRoot, externalRootRealpath],
    repositoryRoots,
    "Authorized external Playwright evidence root",
  );
  if (
    repositoryRoots.some((root) =>
      containedBy(externalRootRealpath, root, { allowRoot: true }),
    )
  ) {
    throw new Error(
      "Authorized external Playwright evidence root must not contain a repository worktree.",
    );
  }
  if (!containedBy(externalRoot, requestedPath)) {
    throw new Error(
      "Production evidence report path must remain beneath the authorized external evidence root.",
    );
  }
  let targetExists = false;
  if (inspectExistingTarget) {
    targetExists = inspectPhysicalJsonTarget(requestedPath);
  } else {
    requireAbsentJsonTarget(requestedPath);
  }
  const { parentRealpath } = existingWritableParent(requestedPath);
  const canonicalTarget = path.join(parentRealpath, path.basename(requestedPath));
  if (!containedBy(externalRootRealpath, canonicalTarget)) {
    throw new Error(
      "Production evidence report parent escapes the authorized external evidence root.",
    );
  }
  assertOutsideRepositories(
    [requestedPath, parentRealpath, canonicalTarget],
    repositoryRoots,
    "Production evidence report path",
  );
  return Object.freeze({
    outputPath: requestedPath,
    destinationClass: "external-evidence-root",
    displayPath: "<external-evidence-root>",
    parentRealpath,
    ...(inspectExistingTarget ? { targetExists } : {}),
  });
}

export function resolveAuthorizedExternalEvidenceRoot({
  authorizedExternalRoot,
  repositoryRoot,
  additionalRepositoryRoots = [],
}) {
  const externalRootInput = requiredNormalizedPath(
    authorizedExternalRoot,
    "Authorized external evidence root",
  );
  if (!path.isAbsolute(externalRootInput)) {
    throw new Error("Authorized external evidence root must be absolute.");
  }
  const externalRoot = path.resolve(externalRootInput);
  const entry = lstatSync(externalRoot);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error("Authorized external evidence root must be a physical directory.");
  }
  const externalRootRealpath = realpathSync(externalRoot);
  const repositoryRoots = knownRepositoryRoots(
    repositoryRoot,
    additionalRepositoryRoots,
  );
  assertOutsideRepositories(
    [externalRoot, externalRootRealpath],
    repositoryRoots,
    "Authorized external evidence root",
  );
  if (
    repositoryRoots.some((root) =>
      containedBy(externalRootRealpath, root, { allowRoot: true }),
    )
  ) {
    throw new Error("Authorized external evidence root cannot contain a worktree.");
  }
  return Object.freeze({ externalRoot, externalRootRealpath });
}

export function resolveRetainedExternalEvidenceFile({
  filePath,
  authorizedExternalRoot,
  repositoryRoot,
}) {
  const root = resolveAuthorizedExternalEvidenceRoot({
    authorizedExternalRoot,
    repositoryRoot,
  });
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    throw new Error("Retained external evidence file must be absolute.");
  }
  const absolutePath = path.resolve(filePath);
  let entry;
  try {
    entry = lstatSync(absolutePath);
  } catch {
    throw new Error("Retained external evidence file is missing.");
  }
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error("Retained external evidence file must be a physical file.");
  }
  const real = realpathSync(absolutePath);
  if (!real.startsWith(`${root.externalRootRealpath}${path.sep}`)) {
    throw new Error("Retained external evidence file escapes its authorized root.");
  }
  return Object.freeze({ absolutePath, realpath: real });
}

export function resolvePlaywrightReportPath({
  requestedPath,
  repositoryRoot,
  authorizedExternalRoot,
  additionalRepositoryRoots = [],
  pathPolicy = PLAYWRIGHT_PRODUCTION_EVIDENCE_PATH_POLICY,
}) {
  if (pathPolicy !== PLAYWRIGHT_PRODUCTION_EVIDENCE_PATH_POLICY) {
    throw new Error("Unknown Playwright report destination policy.");
  }
  const reportPath = requiredNormalizedPath(
    requestedPath,
    "Production evidence report path",
  );
  if (reportPath.endsWith(path.sep)) {
    throw new Error("Production evidence report path is malformed.");
  }
  if (path.extname(reportPath) !== ".json" || path.basename(reportPath) === ".json") {
    throw new Error("Production evidence report path must name a JSON file.");
  }
  if (path.isAbsolute(reportPath)) {
    return resolveExternalReport({
      requestedPath: reportPath,
      repositoryRoot,
      authorizedExternalRoot,
      additionalRepositoryRoots,
    });
  }
  return resolveRepositoryRelativeReport({
    requestedPath: reportPath,
    repositoryRoot,
  });
}

export function resolveRuntimeSmokeEvidencePath({
  requestedPath,
  repositoryRoot,
  authorizedExternalRoot,
  outputRole,
  additionalRepositoryRoots = [],
}) {
  const output = RUNTIME_SMOKE_EVIDENCE_OUTPUTS[outputRole];
  if (!output) {
    throw new Error("Runtime-smoke evidence output role is unknown.");
  }
  const destination = resolvePlaywrightReportPath({
    requestedPath,
    repositoryRoot,
    authorizedExternalRoot,
    additionalRepositoryRoots,
  });
  if (destination.destinationClass !== "external-evidence-root") {
    throw new Error("Runtime-smoke evidence must use its authorized external root.");
  }
  if (path.basename(destination.outputPath) !== output.filename) {
    throw new Error(
      `Runtime-smoke ${outputRole} output must use filename ${output.filename}.`,
    );
  }
  const externalRoot = path.resolve(authorizedExternalRoot);
  const portableRelativePath = path
    .relative(externalRoot, destination.outputPath)
    .split(path.sep)
    .join("/");
  if (
    !portableRelativePath ||
    portableRelativePath === ".." ||
    portableRelativePath.startsWith("../") ||
    path.isAbsolute(portableRelativePath)
  ) {
    throw new Error("Runtime-smoke portable evidence path is invalid.");
  }
  return Object.freeze({
    ...destination,
    outputRole,
    destinationClass: RUNTIME_SMOKE_EVIDENCE_DESTINATION_CLASS,
    portableRelativePath,
    rootVariableName: PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT,
    rootContractSchema: RUNTIME_SMOKE_EVIDENCE_ROOT_CONTRACT_SCHEMA,
    rootContractVersion: RUNTIME_SMOKE_EVIDENCE_ROOT_CONTRACT_VERSION,
    rootContractSha256: RUNTIME_SMOKE_EVIDENCE_ROOT_CONTRACT_SHA256,
  });
}

function runtimeReportIdentityValue(environment, name) {
  const value = environment?.[name];
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  ) {
    throw new Error(`Runtime-smoke report authorization is missing ${name}.`);
  }
  return value;
}

function runtimeReportHexIdentityValue(environment, name, length) {
  const value = runtimeReportIdentityValue(environment, name);
  if (!new RegExp(`^[a-f0-9]{${length}}$`).test(value)) {
    throw new Error(`Runtime-smoke report authorization has invalid ${name}.`);
  }
  return value;
}

function runtimeReportAuthorizationIdentity({
  destination,
  externalRootRealpath,
  environment,
}) {
  const runtimeStageAttempt = runtimeReportIdentityValue(
    environment,
    "CERTIFICATION_RUNTIME_STAGE_ATTEMPT",
  );
  if (!/^[1-9]\d*$/.test(runtimeStageAttempt)) {
    throw new Error("Runtime-smoke report stage attempt is invalid.");
  }
  const runNonce = runtimeReportIdentityValue(
    environment,
    "PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE",
  );
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      runNonce,
    )
  ) {
    throw new Error("Runtime-smoke report run nonce is invalid.");
  }
  return Object.freeze({
    schema: RUNTIME_SMOKE_REPORT_AUTHORIZATION_SCHEMA,
    certificationId: runtimeReportIdentityValue(
      environment,
      "PRODUCTION_CERTIFICATION_ID",
    ),
    candidateId: runtimeReportIdentityValue(
      environment,
      "PRODUCTION_EVIDENCE_CANDIDATE_ID",
    ),
    sourceCommitSha: runtimeReportHexIdentityValue(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA",
      40,
    ),
    sourceTreeSha: runtimeReportHexIdentityValue(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA",
      40,
    ),
    buildId: runtimeReportIdentityValue(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID",
    ),
    artifactSha256: runtimeReportHexIdentityValue(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256",
      64,
    ),
    productionManifestSha256: runtimeReportHexIdentityValue(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256",
      64,
    ),
    semanticJournalSha256: runtimeReportHexIdentityValue(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_SHA256",
      64,
    ),
    runtimeStage: "runtime-smoke",
    runtimeStageAttempt: Number(runtimeStageAttempt),
    runNonce,
    reportRelativePath: destination.portableRelativePath,
    evidenceRootIdentitySha256: createHash("sha256")
      .update(externalRootRealpath)
      .digest("hex"),
  });
}

function readRuntimeReportAuthorization(authorizationPath) {
  let entry;
  let bytes;
  try {
    entry = lstatSync(authorizationPath);
    bytes = readFileSync(authorizationPath);
  } catch {
    throw new Error(
      "Runtime-smoke report authorization sidecar is missing or unreadable.",
    );
  }
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error(
      "Runtime-smoke report authorization sidecar must be a physical file.",
    );
  }
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Runtime-smoke report authorization sidecar is invalid.");
  }
  const canonicalBytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  if (!bytes.equals(canonicalBytes)) {
    throw new Error(
      "Runtime-smoke report authorization sidecar is not canonical JSON.",
    );
  }
  return value;
}

export function authorizeRuntimeSmokeReportPath({
  requestedPath,
  repositoryRoot,
  authorizedExternalRoot,
  environment,
  additionalRepositoryRoots = [],
}) {
  const destination = resolveRuntimeSmokeEvidencePath({
    requestedPath,
    repositoryRoot,
    authorizedExternalRoot,
    outputRole: "report",
    additionalRepositoryRoots,
  });
  const root = resolveAuthorizedExternalEvidenceRoot({
    authorizedExternalRoot,
    repositoryRoot,
    additionalRepositoryRoots,
  });
  const authorization = runtimeReportAuthorizationIdentity({
    destination,
    externalRootRealpath: root.externalRootRealpath,
    environment,
  });
  const authorizationPath = `${destination.outputPath}.owner.json`;
  const authorizationBytes = Buffer.from(
    `${JSON.stringify(authorization, null, 2)}\n`,
  );
  let authorizationStatus = "initial";
  try {
    writeFileSync(authorizationPath, authorizationBytes, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    authorizationStatus = "same-run-reentry";
    const existing = readRuntimeReportAuthorization(authorizationPath);
    if (JSON.stringify(existing) !== JSON.stringify(authorization)) {
      throw new Error(
        "Runtime-smoke report path is owned by another run, attempt, destination, or evidence root.",
      );
    }
  }
  return Object.freeze({
    ...destination,
    authorization: Object.freeze({
      schema: authorization.schema,
      status: authorizationStatus,
      reportRelativePath: authorization.reportRelativePath,
      evidenceRootIdentitySha256:
        authorization.evidenceRootIdentitySha256,
    }),
  });
}

function readRuntimeSmokeStartMarker(markerPath) {
  let bytes;
  try {
    bytes = readFileSync(markerPath);
  } catch {
    throw new Error("Runtime-smoke start marker is missing or unreadable.");
  }
  let marker;
  try {
    marker = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Runtime-smoke start marker is invalid.");
  }
  const canonicalBytes = Buffer.from(`${JSON.stringify(marker, null, 2)}\n`);
  if (!bytes.equals(canonicalBytes)) {
    throw new Error("Runtime-smoke start marker is not canonical JSON.");
  }
  const expectedKeys = [
    "schema",
    "boundary",
    "gateId",
    "project",
    "title",
    "retry",
  ];
  if (
    !marker ||
    typeof marker !== "object" ||
    Array.isArray(marker) ||
    Object.keys(marker).length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(marker, key)) ||
    marker.schema !== "interior-ai.production-certification-playwright-start.v1" ||
    marker.boundary !== "test-begin" ||
    marker.gateId !== "ci.production-runtime-smoke" ||
    marker.project !== "chromium" ||
    marker.title !== "furnished template remains stable without a render loop" ||
    marker.retry !== 0
  ) {
    throw new Error("Runtime-smoke start marker does not match this stage contract.");
  }
  return marker;
}

export function resolveRuntimeSmokeStartMarkerPath({
  requestedPath,
  repositoryRoot,
  authorizedExternalRoot,
  reportDestination,
  additionalRepositoryRoots = [],
}) {
  const markerPath = requiredNormalizedPath(
    requestedPath,
    "Runtime-smoke start marker path",
  );
  if (!path.isAbsolute(markerPath)) {
    throw new Error("Runtime-smoke start marker path must be absolute.");
  }
  const destination = resolveExternalReport({
    requestedPath: markerPath,
    repositoryRoot,
    authorizedExternalRoot,
    additionalRepositoryRoots,
    inspectExistingTarget: true,
  });
  if (
    path.basename(destination.outputPath) !==
    RUNTIME_SMOKE_EVIDENCE_OUTPUTS.startMarker.filename
  ) {
    throw new Error(
      `Runtime-smoke startMarker output must use filename ${RUNTIME_SMOKE_EVIDENCE_OUTPUTS.startMarker.filename}.`,
    );
  }
  if (
    reportDestination?.authorization?.schema !==
      RUNTIME_SMOKE_REPORT_AUTHORIZATION_SCHEMA ||
    path.dirname(reportDestination.outputPath) !==
      path.dirname(destination.outputPath)
  ) {
    throw new Error(
      "Runtime-smoke start marker is missing its exact report authorization binding.",
    );
  }
  if (existsPath(reportDestination.outputPath)) {
    throw new Error("Production evidence report path must not already exist.");
  }
  let reentryStatus = "initial";
  if (destination.targetExists) {
    if (reportDestination.authorization.status !== "same-run-reentry") {
      throw new Error(
        "Runtime-smoke start marker is not authorized for configuration re-entry.",
      );
    }
    readRuntimeSmokeStartMarker(destination.outputPath);
    reentryStatus = "same-run-reentry";
  }
  return Object.freeze({
    ...destination,
    outputRole: "startMarker",
    destinationClass: RUNTIME_SMOKE_EVIDENCE_DESTINATION_CLASS,
    reentryStatus,
  });
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function requiredTestOutputAuthorizationPaths(outputRoot) {
  return Object.freeze({
    authorizationPath: path.join(outputRoot, ".owner.json"),
    completionPath: path.join(outputRoot, ".complete.json"),
    outputDirectory: path.join(outputRoot, "test-results"),
  });
}

function readCanonicalPhysicalJson(filePath, description) {
  let entry;
  let bytes;
  try {
    entry = lstatSync(filePath);
    bytes = readFileSync(filePath);
  } catch {
    throw new Error(`${description} is missing or unreadable.`);
  }
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error(`${description} must be a physical file.`);
  }
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${description} is not valid JSON.`);
  }
  if (!bytes.equals(canonicalJsonBytes(value))) {
    throw new Error(`${description} is not canonical JSON.`);
  }
  return Object.freeze({ bytes, value, sha256: sha256Bytes(bytes) });
}

function normalizedBrowserRunIdentity(identity, gateId) {
  const expectedKeys = [
    "browserOwnerId",
    "candidateId",
    "certificationId",
    "gateId",
    "runNonce",
    "sourceCommitSha",
    "sourceTreeSha",
    "stageAttempt",
  ];
  if (!exactKeys(identity, expectedKeys) || identity.gateId !== gateId) {
    throw new Error("Required-test browser run identity is malformed.");
  }
  for (const name of [
    "browserOwnerId",
    "candidateId",
    "certificationId",
    "gateId",
    "runNonce",
  ]) {
    const value = identity[name];
    if (
      typeof value !== "string" ||
      value !== value.trim() ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,255}$/.test(value)
    ) {
      throw new Error("Required-test browser run identity is malformed.");
    }
  }
  if (
    !/^[0-9a-f]{40}$/.test(identity.sourceCommitSha) ||
    !/^[0-9a-f]{40}$/.test(identity.sourceTreeSha) ||
    !Number.isSafeInteger(identity.stageAttempt) ||
    identity.stageAttempt < 1
  ) {
    throw new Error("Required-test browser run identity is malformed.");
  }
  return Object.freeze({ ...identity });
}

function normalizedProcessIdentity(processIdentity) {
  if (
    !exactKeys(processIdentity, ["pid", "ppid"]) ||
    !Number.isSafeInteger(processIdentity.pid) ||
    processIdentity.pid < 1 ||
    !Number.isSafeInteger(processIdentity.ppid) ||
    processIdentity.ppid < 1
  ) {
    throw new Error("Required-test browser process identity is malformed.");
  }
  return Object.freeze({ ...processIdentity });
}

function certificationOutputDirectory(
  reportDestination,
  gateId,
  { browserRunIdentity = null, processIdentity = null } = {},
) {
  if (reportDestination.destinationClass === "repository-relative") {
    return `.local/required-test-evidence/${gateId}/playwright-output`;
  }
  const outputRoot = path.join(
    path.dirname(reportDestination.outputPath),
    `${gateId}-playwright-output`,
  );
  const { authorizationPath, completionPath, outputDirectory } =
    requiredTestOutputAuthorizationPaths(outputRoot);
  if (browserRunIdentity === null) {
    if (existsPath(outputRoot)) {
      throw new Error("Certification Playwright output directory must not already exist.");
    }
    return Object.freeze({
      outputRoot,
      outputDirectory,
      outputAuthorization: null,
    });
  }
  const identity = normalizedBrowserRunIdentity(browserRunIdentity, gateId);
  const processOwner = normalizedProcessIdentity(
    processIdentity ?? { pid: process.pid, ppid: process.ppid },
  );
  let claimedNow = false;
  if (!existsPath(outputRoot)) {
    try {
      mkdirSync(outputRoot, { mode: 0o700 });
      claimedNow = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  const outputRootEntry = lstatSync(outputRoot);
  if (outputRootEntry.isSymbolicLink() || !outputRootEntry.isDirectory()) {
    throw new Error(
      "Certification Playwright output directory must be a physical directory.",
    );
  }
  if (claimedNow) {
    const authorization = {
      schema: REQUIRED_TEST_OUTPUT_AUTHORIZATION_SCHEMA,
      status: "claimed",
      ...identity,
      reportFilename: path.basename(reportDestination.outputPath),
      outputRootName: path.basename(outputRoot),
      outputDirectoryName: path.basename(outputDirectory),
      destinationIdentitySha256: sha256Bytes(
        canonicalJsonBytes({
          parentRealpath: reportDestination.parentRealpath,
          reportFilename: path.basename(reportDestination.outputPath),
          outputRootName: path.basename(outputRoot),
          outputDirectoryName: path.basename(outputDirectory),
        }),
      ),
      ownerProcessId: processOwner.pid,
    };
    const bytes = canonicalJsonBytes(authorization);
    try {
      writeFileSync(authorizationPath, bytes, { flag: "wx", mode: 0o600 });
    } catch (error) {
      throw new Error(
        `Certification Playwright output authorization was not claimed${
          error?.code ? ` (${error.code})` : ""
        }.`,
      );
    }
  }
  if (existsPath(completionPath)) {
    throw new Error(
      "Certification Playwright output directory is completed or stale.",
    );
  }
  const authorizationRead = readCanonicalPhysicalJson(
    authorizationPath,
    "Certification Playwright output authorization",
  );
  const authorization = authorizationRead.value;
  const expectedAuthorizationKeys = [
    "browserOwnerId",
    "candidateId",
    "certificationId",
    "destinationIdentitySha256",
    "gateId",
    "outputDirectoryName",
    "outputRootName",
    "ownerProcessId",
    "reportFilename",
    "runNonce",
    "schema",
    "sourceCommitSha",
    "sourceTreeSha",
    "stageAttempt",
    "status",
  ];
  const identityMatches = Object.entries(identity).every(
    ([name, value]) => authorization?.[name] === value,
  );
  const sameProcessTree =
    authorization?.ownerProcessId === processOwner.pid ||
    authorization?.ownerProcessId === processOwner.ppid;
  if (
    !exactKeys(authorization, expectedAuthorizationKeys) ||
    authorization.schema !== REQUIRED_TEST_OUTPUT_AUTHORIZATION_SCHEMA ||
    authorization.status !== "claimed" ||
    authorization.reportFilename !== path.basename(reportDestination.outputPath) ||
    authorization.outputRootName !== path.basename(outputRoot) ||
    authorization.outputDirectoryName !== path.basename(outputDirectory) ||
    authorization.destinationIdentitySha256 !==
      sha256Bytes(
        canonicalJsonBytes({
          parentRealpath: reportDestination.parentRealpath,
          reportFilename: path.basename(reportDestination.outputPath),
          outputRootName: path.basename(outputRoot),
          outputDirectoryName: path.basename(outputDirectory),
        }),
      ) ||
    !Number.isSafeInteger(authorization.ownerProcessId) ||
    authorization.ownerProcessId < 1 ||
    !identityMatches ||
    !sameProcessTree
  ) {
    throw new Error(
      "Certification Playwright output authorization is stale or foreign.",
    );
  }
  const unexpectedRootEntries = readdirSync(outputRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        ![path.basename(authorizationPath), path.basename(outputDirectory)].includes(
          entry.name,
        ),
    )
    .map((entry) => entry.name);
  if (unexpectedRootEntries.length > 0) {
    throw new Error(
      "Certification Playwright output directory contains foreign files.",
    );
  }
  if (existsPath(outputDirectory)) {
    const entry = lstatSync(outputDirectory);
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error(
        "Certification Playwright output directory must be a physical directory.",
      );
    }
  }
  return Object.freeze({
    outputRoot,
    outputDirectory,
    outputAuthorization: Object.freeze({
      authorizationPath,
      completionPath,
      sha256: authorizationRead.sha256,
      status:
        claimedNow
          ? "claimed"
          : authorization.ownerProcessId === processOwner.pid
          ? "same-process-reentry"
          : "same-run-worker-reentry",
    }),
  });
}

function existsPath(targetPath) {
  try {
    lstatSync(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function resolveRequiredTestReportPath({
  requestedPath,
  repositoryRoot,
  gateId,
  authorizedExternalRoot,
  additionalRepositoryRoots = [],
  browserRunIdentity = null,
  processIdentity = null,
}) {
  if (typeof gateId !== "string" || !/^[a-z0-9][a-z0-9.-]+$/.test(gateId)) {
    throw new Error("Required-test gate ID is invalid.");
  }
  const reportPath = requiredNormalizedPath(
    requestedPath,
    "Required-test evidence report path",
  );
  let destination;
  if (path.isAbsolute(reportPath)) {
    destination = resolveExternalReport({
      requestedPath: reportPath,
      repositoryRoot,
      authorizedExternalRoot,
      additionalRepositoryRoots,
    });
  } else {
    if (reportPath.includes("\\")) {
      throw new Error("Required-test evidence report path is malformed.");
    }
    const expectedPrefix = `.local/required-test-evidence/${gateId}/`;
    if (!reportPath.startsWith(expectedPrefix)) {
      throw new Error(
        "Repository-relative required-test reports must use their owned ignored directory.",
      );
    }
    const root = path.resolve(repositoryRoot);
    const outputPath = path.resolve(root, reportPath);
    if (!containedBy(root, outputPath)) {
      throw new Error("Required-test evidence report path escapes the repository.");
    }
    requireAbsentJsonTarget(outputPath);
    const parent = existingWritableParent(outputPath);
    if (!containedBy(realpathSync(root), parent.parentRealpath, { allowRoot: true })) {
      throw new Error("Required-test evidence report parent escapes the repository.");
    }
    destination = Object.freeze({
      outputPath,
      destinationClass: "repository-relative",
      displayPath: reportPath,
      parentRealpath: parent.parentRealpath,
    });
  }
  const output = certificationOutputDirectory(destination, gateId, {
    browserRunIdentity,
    processIdentity,
  });
  return Object.freeze({
    ...destination,
    ...(typeof output === "string"
      ? { outputDirectory: output, outputAuthorization: null }
      : output),
  });
}

function readRequiredTestDiscoveryMarker(markerPath, gateId) {
  const marker = readCanonicalPhysicalJson(
    markerPath,
    "Required-test discovery marker",
  ).value;
  if (
    !exactKeys(marker, ["boundary", "discoveredTestCount", "gateId", "schema"]) ||
    marker.schema !== "interior-ai.production-certification-playwright-start.v1" ||
    marker.boundary !== "discovery" ||
    marker.gateId !== gateId ||
    !Number.isSafeInteger(marker.discoveredTestCount) ||
    marker.discoveredTestCount < 1
  ) {
    throw new Error("Required-test discovery marker is stale or foreign.");
  }
  return marker;
}

export function resolveRequiredTestStartMarkerPath({
  requestedPath,
  repositoryRoot,
  gateId,
  authorizedExternalRoot,
  outputAuthorization,
  additionalRepositoryRoots = [],
}) {
  const markerPath = requiredNormalizedPath(
    requestedPath,
    "Required-test discovery marker path",
  );
  if (!path.isAbsolute(markerPath)) {
    return resolvePlaywrightReportPath({
      requestedPath: markerPath,
      repositoryRoot,
      authorizedExternalRoot,
      additionalRepositoryRoots,
    });
  }
  const destination = resolveExternalReport({
    requestedPath: markerPath,
    repositoryRoot,
    authorizedExternalRoot,
    additionalRepositoryRoots,
    inspectExistingTarget: true,
  });
  let reentryStatus = "initial";
  if (destination.targetExists) {
    if (
      !["same-process-reentry", "same-run-worker-reentry"].includes(
        outputAuthorization?.status,
      )
    ) {
      throw new Error(
        "Required-test discovery marker is not authorized for same-run re-entry.",
      );
    }
    readRequiredTestDiscoveryMarker(destination.outputPath, gateId);
    reentryStatus = outputAuthorization.status;
  }
  return Object.freeze({ ...destination, reentryStatus });
}
