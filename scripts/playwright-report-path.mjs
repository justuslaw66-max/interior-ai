import { createHash } from "node:crypto";
import {
  constants,
  accessSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
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
  requireAbsentJsonTarget(requestedPath);
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

function certificationOutputDirectory(reportDestination, gateId) {
  if (reportDestination.destinationClass === "repository-relative") {
    return `.local/required-test-evidence/${gateId}/playwright-output`;
  }
  const outputDirectory = path.join(
    path.dirname(reportDestination.outputPath),
    `${gateId}-playwright-output`,
  );
  if (existsPath(outputDirectory)) {
    throw new Error("Certification Playwright output directory must not already exist.");
  }
  return outputDirectory;
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
  return Object.freeze({
    ...destination,
    outputDirectory: certificationOutputDirectory(destination, gateId),
  });
}
