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
