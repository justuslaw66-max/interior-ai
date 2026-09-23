import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { globalPaths as nodeGlobalPaths } from "node:module";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  canonicalJsonBytes,
  isCanonicalUtcTimestamp,
  isSha256,
  sha256Bytes,
} from "./production-certification-contract.mjs";

export const PRODUCTION_CERTIFICATION_DEPENDENCY_LIFECYCLE_SCHEMA =
  "interior-ai.production-certification-worktree-dependency-lifecycle.v1";
export const PRODUCTION_CERTIFICATION_DEPENDENCY_INSTALLATION_SCHEMA =
  "interior-ai.production-certification-worktree-dependency-installation.v1";
export const PRODUCTION_CERTIFICATION_DEPENDENCY_BINDING_SCHEMA =
  "interior-ai.production-certification-worktree-dependency-binding.v1";
export const CERTIFICATION_DEPENDENCY_INSTALL_COMMAND = "npm ci --include=dev";
export const CERTIFICATION_DEPENDENCY_STATUSES = Object.freeze([
  "not-installed",
  "installing",
  "installed",
  "failed",
  "removed",
]);

const DEPENDENCY_BINDING_SEAL_DOMAIN =
  "interior-ai.production-certification-worktree-dependency-binding-seal.v1\n";
const WORKTREE_ROLES = new Set([
  "source-validation",
  "final-artifact",
  "development-browser",
]);
const INSTALL_ENVIRONMENT_ALLOWLIST = new Set([
  "CI",
  "COMSPEC",
  "LANG",
  "LC_ALL",
  "NPM_CONFIG_CACHE",
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
]);

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
}

export function certificationDependencyInstallationEnvironment(environment) {
  if (environment.NODE_PATH || environment.NODE_OPTIONS) {
    throw new Error(
      "dependency installation rejects NODE_PATH and NODE_OPTIONS module influence",
    );
  }
  const projected = Object.fromEntries(
    Object.entries(environment).filter(([name]) =>
      INSTALL_ENVIRONMENT_ALLOWLIST.has(name),
    ),
  );
  projected.NPM_CONFIG_AUDIT = "false";
  projected.NPM_CONFIG_FUND = "false";
  projected.NPM_CONFIG_UPDATE_NOTIFIER = "false";
  const nullConfig = process.platform === "win32" ? "NUL" : "/dev/null";
  projected.NPM_CONFIG_GLOBALCONFIG = nullConfig;
  projected.NPM_CONFIG_USERCONFIG = path.join(
    nullConfig,
    "certification-empty-userconfig",
  );
  return projected;
}

function portable(value) {
  return value.split(path.sep).join("/");
}

function pathInside(parent, child) {
  const root = path.resolve(parent);
  const target = path.resolve(child);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function descriptor(evidenceRoot, filePath) {
  const root = realpathSync(evidenceRoot);
  const metadata = lstatSync(filePath);
  const physical = realpathSync(filePath);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    !physical.startsWith(`${root}${path.sep}`)
  ) {
    throw new Error("dependency evidence is not a contained physical file");
  }
  return {
    path: portable(path.relative(root, physical)),
    sha256: sha256Bytes(readFileSync(physical)),
  };
}

function resolvedEvidenceFile(evidenceRoot, value, description) {
  if (
    !value ||
    typeof value.path !== "string" ||
    path.isAbsolute(value.path) ||
    value.path.includes("\\") ||
    path.posix.normalize(value.path) !== value.path ||
    !isSha256(value.sha256)
  ) {
    throw new Error(`${description} descriptor is malformed`);
  }
  const root = realpathSync(evidenceRoot);
  const requested = path.resolve(root, value.path);
  const metadata = lstatSync(requested);
  const physical = realpathSync(requested);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    !physical.startsWith(`${root}${path.sep}`)
  ) {
    throw new Error(`${description} is not a contained physical file`);
  }
  const bytes = readFileSync(physical);
  if (sha256Bytes(bytes) !== value.sha256) {
    throw new Error(`${description} hash mismatch`);
  }
  return { path: physical, bytes };
}

function assertContainedPhysicalDirectory(evidenceRoot, directory, description) {
  const root = realpathSync(evidenceRoot);
  const metadata = lstatSync(directory);
  const physical = realpathSync(directory);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    (physical !== root && !physical.startsWith(`${root}${path.sep}`))
  ) {
    throw new Error(`${description} is not a contained physical directory`);
  }
  return physical;
}

function containedEvidenceAttemptRoot(evidenceRoot, role, attemptNumber) {
  let current = assertContainedPhysicalDirectory(
    evidenceRoot,
    evidenceRoot,
    "dependency evidence root",
  );
  for (const component of ["worktree-dependencies", role]) {
    const next = path.join(current, component);
    if (!existsSync(next)) mkdirSync(next, { mode: 0o700 });
    current = assertContainedPhysicalDirectory(
      evidenceRoot,
      next,
      "dependency evidence parent",
    );
  }
  const attempt = path.join(
    current,
    `attempt-${String(attemptNumber).padStart(3, "0")}`,
  );
  if (existsSync(attempt)) {
    throw new Error("dependency installation evidence target must be absent");
  }
  mkdirSync(attempt, { mode: 0o700 });
  return assertContainedPhysicalDirectory(
    evidenceRoot,
    attempt,
    "dependency installation evidence target",
  );
}

function assertDependencyInstallationAttempt(state, role, attemptNumber) {
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) {
    throw new Error(
      "dependency installation attempt number must be a positive safe integer",
    );
  }
  const stageName =
    role === "source-validation"
      ? "source-validation"
      : role === "final-artifact"
        ? "build"
        : "browser-owners";
  const stage = state?.stages?.[stageName];
  const attempt = stage?.attempts?.at(-1);
  if (
    stage?.status !== "running" ||
    attempt?.status !== "running" ||
    attempt?.completedAt !== null ||
    attempt?.number !== attemptNumber
  ) {
    throw new Error(
      `dependency installation attempt does not match the latest running ${stageName} attempt`,
    );
  }
}

function writeExclusive(evidenceRoot, filePath, bytes) {
  assertContainedPhysicalDirectory(
    evidenceRoot,
    path.dirname(filePath),
    "dependency evidence output parent",
  );
  writeFileSync(filePath, bytes, { flag: "wx", mode: 0o600 });
}

function parseJson(bytes, description) {
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${description} is not valid JSON`);
  }
  return value;
}

function dependencyPackageNames(packageJson) {
  return [
    ...new Set(
      ["dependencies", "devDependencies", "optionalDependencies"]
        .flatMap((field) => Object.keys(packageJson[field] ?? {}))
        .sort(),
    ),
  ].sort();
}

function internalSymlinkInventory(root, relativePath = "") {
  const records = [];
  const visit = (currentRelativePath) => {
    const absolute = path.join(root, currentRelativePath);
    const metadata = lstatSync(absolute);
    if (metadata.isSymbolicLink()) {
      const target = realpathSync(absolute);
      if (!pathInside(root, target)) {
        throw new Error(
          `node_modules contains an external dependency symlink: ${portable(currentRelativePath)}`,
        );
      }
      records.push({
        path: portable(currentRelativePath),
        type: "internal-symlink",
        targetSha256: sha256Bytes(target),
      });
      return;
    }
    if (metadata.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) {
        visit(path.join(currentRelativePath, name));
      }
    }
  };
  visit(relativePath);
  return records;
}

function physicalContentInventory(root) {
  const hash = createHash("sha256");
  let fileCount = 0;
  let directoryCount = 0;
  let symlinkCount = 0;
  let totalBytes = 0;
  const visit = (relativePath) => {
    const absolute = path.join(root, relativePath);
    const metadata = lstatSync(absolute);
    const portablePath = portable(relativePath) || ".";
    if (metadata.isSymbolicLink()) {
      const target = realpathSync(absolute);
      if (!pathInside(root, target)) {
        throw new Error(
          `node_modules contains an external dependency symlink: ${portablePath}`,
        );
      }
      symlinkCount += 1;
      hash.update(`L\0${portablePath}\0${portable(path.relative(root, target))}\0`);
      return;
    }
    if (metadata.isDirectory()) {
      directoryCount += 1;
      hash.update(`D\0${portablePath}\0${metadata.mode & 0o777}\0`);
      for (const name of readdirSync(absolute).sort()) {
        visit(path.join(relativePath, name));
      }
      return;
    }
    if (!metadata.isFile()) {
      throw new Error(`node_modules contains an unsupported filesystem entry: ${portablePath}`);
    }
    const bytes = readFileSync(absolute);
    fileCount += 1;
    totalBytes += bytes.length;
    hash.update(
      `F\0${portablePath}\0${metadata.mode & 0o777}\0${bytes.length}\0${sha256Bytes(bytes)}\0`,
    );
  };
  visit("");
  return {
    fileCount,
    directoryCount,
    symlinkCount,
    totalBytes,
    sha256: hash.digest("hex"),
  };
}

function packageInventory(nodeModulesRoot, installedLock) {
  const packageRecords = Object.entries(installedLock.packages ?? {})
    .filter(([relativePath]) => relativePath.startsWith("node_modules/"))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relativePath, value]) => {
      const absolute = path.join(path.dirname(nodeModulesRoot), relativePath);
      const metadata = lstatSync(absolute);
      const physical = realpathSync(absolute);
      if (!pathInside(nodeModulesRoot, physical)) {
        throw new Error(`installed dependency resolves outside node_modules: ${relativePath}`);
      }
      const packageManifestPath = path.join(absolute, "package.json");
      return {
        path: portable(relativePath),
        type: metadata.isDirectory() ? "directory" : "file",
        physicalIdentitySha256: sha256Bytes(physical),
        packageManifestSha256: existsSync(packageManifestPath)
          ? sha256Bytes(readFileSync(packageManifestPath))
          : null,
        version: typeof value?.version === "string" ? value.version : null,
        integrity: typeof value?.integrity === "string" ? value.integrity : null,
      };
    });
  const symlinks = internalSymlinkInventory(nodeModulesRoot);
  const physicalContent = physicalContentInventory(nodeModulesRoot);
  const value = { packages: packageRecords, symlinks, physicalContent };
  return {
    packageCount: packageRecords.length,
    internalSymlinkCount: symlinks.length,
    packages: packageRecords,
    symlinks,
    physicalContent,
    sha256: sha256Bytes(canonicalJsonBytes(value)),
  };
}

function nodeModuleSearchPathProof(
  repositoryRoot,
  { resolveRepositoryRoot = true } = {},
) {
  const root = resolveRepositoryRoot
    ? realpathSync(repositoryRoot)
    : path.resolve(repositoryRoot);
  const localNodeModules = path.join(root, "node_modules");
  const ancestorCandidates = [];
  let cursor = path.dirname(root);
  while (true) {
    ancestorCandidates.push(path.join(cursor, "node_modules"));
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  const ancestorSet = new Set(ancestorCandidates.map((value) => path.resolve(value)));
  const globalCandidates = [...new Set(nodeGlobalPaths.map((value) => path.resolve(value)))]
    .filter(
      (value) =>
        value !== path.resolve(localNodeModules) && !ancestorSet.has(value),
    );
  const record = (candidate) => ({
    pathIdentitySha256: sha256Bytes(path.resolve(candidate)),
    present: existsSync(candidate),
  });
  const ancestorRoots = ancestorCandidates.map(record);
  const globalRoots = globalCandidates.map(record);
  const nodePathEnvironmentPresent = Boolean(process.env.NODE_PATH?.trim());
  const existingExternalRootCount = [...ancestorRoots, ...globalRoots].filter(
    (entry) => entry.present,
  ).length;
  const payload = {
    schema:
      "interior-ai.production-certification-node-module-search-path-proof.v1",
    ancestorRoots,
    globalRoots,
    nodePathEnvironmentPresent,
    existingExternalRootCount,
    passed:
      existingExternalRootCount === 0 && !nodePathEnvironmentPresent,
  };
  const proof = {
    ...payload,
    sha256: sha256Bytes(canonicalJsonBytes(payload)),
  };
  if (!proof.passed) {
    const source = nodePathEnvironmentPresent
      ? "NODE_PATH"
      : ancestorRoots.some((entry) => entry.present)
        ? "ancestor Node module search root"
        : "global Node module search root";
    throw new Error(
      `${source} can resolve dependencies outside the role-local node_modules`,
    );
  }
  return proof;
}

function expectedNodeSearchPathProof({ evidenceRoot, binding }) {
  const retained = resolvedEvidenceFile(
    evidenceRoot,
    binding?.privateSidecar,
    "dependency worktree private sidecar",
  );
  const sidecar = parseJson(
    retained.bytes,
    "dependency worktree private sidecar",
  );
  if (
    !retained.bytes.equals(canonicalJsonBytes(sidecar)) ||
    typeof sidecar?.realpath !== "string" ||
    !path.isAbsolute(sidecar.realpath) ||
    sha256Bytes(sidecar.realpath) !== binding?.privateRealpathSha256
  ) {
    throw new Error("dependency worktree private sidecar is malformed");
  }
  return nodeModuleSearchPathProof(sidecar.realpath, {
    resolveRepositoryRoot: false,
  });
}

function topLevelResolutionProof(repositoryRoot, nodeModulesRoot, packageJson) {
  const packages = dependencyPackageNames(packageJson).map((name) => {
    const packageManifestPath = path.join(nodeModulesRoot, name, "package.json");
    if (!existsSync(packageManifestPath)) {
      throw new Error(`required top-level dependency is missing: ${name}`);
    }
    const packageRoot = realpathSync(path.dirname(packageManifestPath));
    const physicalManifest = realpathSync(packageManifestPath);
    if (
      !pathInside(nodeModulesRoot, packageRoot) ||
      !pathInside(nodeModulesRoot, physicalManifest)
    ) {
      throw new Error(`top-level dependency resolves outside this worktree: ${name}`);
    }
    return {
      name,
      packageRootIdentitySha256: sha256Bytes(packageRoot),
      packageManifestPath: portable(path.relative(repositoryRoot, packageManifestPath)),
      packageManifestSha256: sha256Bytes(readFileSync(packageManifestPath)),
    };
  });
  return {
    count: packages.length,
    packages,
    sha256: sha256Bytes(canonicalJsonBytes(packages)),
  };
}

function executableIdentity(executablePath) {
  const physical = realpathSync(executablePath);
  const metadata = statSync(physical);
  return {
    realpathSha256: sha256Bytes(physical),
    filesystemIdentitySha256: sha256Bytes(`${metadata.dev}:${metadata.ino}`),
    bytesSha256: metadata.isFile() ? sha256Bytes(readFileSync(physical)) : null,
  };
}

function npmExecutablePath(environment) {
  const pathValue = environment.PATH ?? process.env.PATH ?? "";
  const names = process.platform === "win32"
    ? ["npm.cmd", "npm.exe", "npm"]
    : ["npm"];
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error("npm executable identity cannot be resolved from PATH");
}

export function dependencyWorktreeIdentity(binding) {
  return Object.fromEntries(
    [
      "role",
      "certificationId",
      "candidateCommitSha",
      "candidateTreeSha",
      "gitCommonDirSha256",
      "gitCommonDirFilesystemIdentitySha256",
      "privateRealpathSha256",
      "filesystemIdentitySha256",
      "cleanStateSha256",
    ].map((name) => [name, binding?.[name]]),
  );
}

export function measureCertificationWorktreeDependencies({ repositoryRoot }) {
  const root = realpathSync(repositoryRoot);
  const packageManifestPath = path.join(root, "package.json");
  const packageLockPath = path.join(root, "package-lock.json");
  const nodeModulesPath = path.join(root, "node_modules");
  const installedLockPath = path.join(nodeModulesPath, ".package-lock.json");
  for (const [filePath, description] of [
    [packageManifestPath, "package manifest"],
    [packageLockPath, "package lockfile"],
    [installedLockPath, "installed dependency lockfile"],
  ]) {
    if (!existsSync(filePath) || !lstatSync(filePath).isFile()) {
      throw new Error(`${description} is missing`);
    }
  }
  const rootEntry = lstatSync(nodeModulesPath);
  const physicalNodeModulesRoot = realpathSync(nodeModulesPath);
  if (
    !rootEntry.isDirectory() ||
    rootEntry.isSymbolicLink() ||
    !pathInside(root, physicalNodeModulesRoot)
  ) {
    throw new Error("stage worktree node_modules must be a physical local directory");
  }
  const rootStat = statSync(nodeModulesPath);
  const packageManifestBytes = readFileSync(packageManifestPath);
  const packageLockBytes = readFileSync(packageLockPath);
  const installedLockBytes = readFileSync(installedLockPath);
  const packageJson = parseJson(packageManifestBytes, "package manifest");
  const installedLock = parseJson(installedLockBytes, "installed dependency lockfile");
  const nodeSearchPathProof = nodeModuleSearchPathProof(root);
  const inventory = packageInventory(nodeModulesPath, installedLock);
  const topLevelPackageResolutionProof = topLevelResolutionProof(
    root,
    nodeModulesPath,
    packageJson,
  );
  const payload = {
    packageLockSha256: sha256Bytes(packageLockBytes),
    packageManifestSha256: sha256Bytes(packageManifestBytes),
    installedLockSha256: sha256Bytes(installedLockBytes),
    nodeModulesRootIdentitySha256: sha256Bytes(physicalNodeModulesRoot),
    nodeModulesFilesystemIdentitySha256: sha256Bytes(
      `${rootStat.dev}:${rootStat.ino}`,
    ),
    dependencyInventorySha256: inventory.sha256,
    topLevelPackageResolutionSha256: topLevelPackageResolutionProof.sha256,
    nodeSearchPathProofSha256: nodeSearchPathProof.sha256,
  };
  return {
    ...payload,
    identitySha256: sha256Bytes(canonicalJsonBytes(payload)),
    inventory,
    topLevelPackageResolutionProof,
    nodeSearchPathProof,
    isolation: {
      nodeModulesRootPhysical: true,
      nodeModulesRootLocalToWorktree: true,
      externalDependencySymlinkCount: 0,
      crossWorktreeResolutionCount: 0,
      globalOrNodePathResolutionCount:
        nodeSearchPathProof.existingExternalRootCount +
        (nodeSearchPathProof.nodePathEnvironmentPresent ? 1 : 0),
      passed: true,
    },
    private: {
      realpath: physicalNodeModulesRoot,
      device: rootStat.dev,
      inode: rootStat.ino,
    },
  };
}

function bindingPayload(value) {
  const payload = structuredClone(value);
  delete payload.aggregateEvidenceSha256;
  return payload;
}

export function sealCertificationDependencyBindingEvidence(value) {
  const payload = bindingPayload(value);
  return {
    ...payload,
    aggregateEvidenceSha256: sha256Bytes(
      Buffer.concat([
        Buffer.from(DEPENDENCY_BINDING_SEAL_DOMAIN),
        canonicalJsonBytes(payload),
      ]),
    ),
  };
}

function installationTimes(state, now) {
  if (state.executionClass !== "deterministic-simulation") {
    const startedAt = now();
    return { startedAt, completedAt: null };
  }
  const base = Date.parse(state.updatedAt);
  return {
    startedAt: new Date(base + 1).toISOString(),
    completedAt: new Date(base + 2).toISOString(),
  };
}

export function installCertificationWorktreeDependencies({
  repositoryRoot,
  evidenceRoot,
  state,
  role,
  environment,
  attemptNumber,
  dispatch = null,
  now = () => new Date().toISOString(),
}) {
  if (!WORKTREE_ROLES.has(role)) {
    throw new Error(`unknown dependency installation role: ${String(role)}`);
  }
  assertDependencyInstallationAttempt(state, role, attemptNumber);
  const installEnvironment = certificationDependencyInstallationEnvironment(environment);
  const binding = state.worktrees?.roles?.[role];
  if (
    binding?.dependencyLifecycleSchema !==
      PRODUCTION_CERTIFICATION_DEPENDENCY_LIFECYCLE_SCHEMA ||
    binding?.dependencyStatus !== "not-installed" ||
    binding?.dependencyIdentitySha256 !== null ||
    binding?.dependencyBindingEvidence !== null ||
    binding?.dependencyInstallation !== null
  ) {
    throw new Error(`worktree dependencies are not in the installable state: ${role}`);
  }
  const absoluteRoot = containedEvidenceAttemptRoot(
    evidenceRoot,
    role,
    attemptNumber,
  );
  const npmPath = npmExecutablePath(installEnvironment);
  const npmVersion = spawnSync(npmPath, ["--version"], {
    cwd: repositoryRoot,
    env: installEnvironment,
    encoding: "utf8",
  });
  if (npmVersion.error || npmVersion.signal || npmVersion.status !== 0) {
    throw new Error("npm version identity cannot be measured before installation");
  }
  const times = installationTimes(state, now);
  const dispatched = dispatch
    ? dispatch({ startedAt: times.startedAt, npmPath })
    : spawnSync(npmPath, ["ci", "--include=dev"], {
        cwd: repositoryRoot,
        env: installEnvironment,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
  const completedAt = times.completedAt ?? now();
  const stdoutBytes = Buffer.from(dispatched.stdout ?? "");
  const stderrBytes = Buffer.from(dispatched.stderr ?? "");
  const stdoutPath = path.join(absoluteRoot, "stdout.log");
  const stderrPath = path.join(absoluteRoot, "stderr.log");
  writeExclusive(evidenceRoot, stdoutPath, stdoutBytes);
  writeExclusive(evidenceRoot, stderrPath, stderrBytes);
  if (state.executionClass !== "deterministic-simulation") {
    if (stdoutBytes.length > 0) process.stdout.write(stdoutBytes);
    if (stderrBytes.length > 0) process.stderr.write(stderrBytes);
  }
  const observedInstall = dispatched.installationEvent ?? null;
  const installationAttempted = dispatched.installationAttempted ?? true;
  const dispatchChild = {
    exitCode:
      dispatched.error || dispatched.signal
        ? null
        : Number.isSafeInteger(dispatched.status)
          ? dispatched.status
          : null,
    signal: dispatched.signal ?? null,
    spawnError: dispatched.error?.code ?? null,
  };
  const observedChild = observedInstall
    ? {
        exitCode: observedInstall.exitCode,
        signal: observedInstall.signal,
        spawnError:
          observedInstall.failureKind === "dispatch_error"
            ? "dispatch_error"
            : null,
      }
    : dispatchChild;
  const childSucceeded =
    observedChild.exitCode === 0 &&
    observedChild.signal === null &&
    observedChild.spawnError === null;
  const dispatchSucceeded =
    dispatchChild.exitCode === 0 &&
    dispatchChild.signal === null &&
    dispatchChild.spawnError === null;
  const passed =
    installationAttempted &&
    childSucceeded &&
    dispatchSucceeded;
  const installation = {
    schema: PRODUCTION_CERTIFICATION_DEPENDENCY_INSTALLATION_SCHEMA,
    version: 1,
    certificationId: state.certificationId,
    candidateId: state.candidate.id,
    candidateCommitSha: state.candidate.commitSha,
    candidateTreeSha: state.candidate.treeSha,
    worktreeRole: role,
    worktreeIdentitySha256: sha256Bytes(
      canonicalJsonBytes(dependencyWorktreeIdentity(binding)),
    ),
    canonicalInstallationCommand: CERTIFICATION_DEPENDENCY_INSTALL_COMMAND,
    installationStartedAt: observedInstall?.startedAt ?? times.startedAt,
    installationCompletedAt: observedInstall?.completedAt ?? completedAt,
    child: observedChild,
    dispatch: dispatchChild,
    stdout: {
      ...descriptor(evidenceRoot, stdoutPath),
      bytes: stdoutBytes.length,
    },
    stderr: {
      ...descriptor(evidenceRoot, stderrPath),
      bytes: stderrBytes.length,
    },
    completionMarker: {
      complete: true,
      result: passed
        ? "succeeded"
        : installationAttempted
          ? childSucceeded && !dispatchSucceeded
            ? "wrapper-failed"
            : "failed"
          : "not-started",
    },
  };
  const installationPath = path.join(absoluteRoot, "installation.json");
  if (!passed) {
    writeExclusive(evidenceRoot, installationPath, canonicalJsonBytes(installation));
    const installationDescriptor = descriptor(evidenceRoot, installationPath);
    return {
      passed: false,
      installation,
      installationDescriptor,
      child: dispatched,
      bindingEvidence: null,
      bindingEvidenceDescriptor: null,
      installationAttempted,
      failurePhase: installationAttempted ? "install" : "precondition",
    };
  }
  let measured;
  try {
    measured = measureCertificationWorktreeDependencies({ repositoryRoot });
    const packageManager = parseJson(
      readFileSync(path.join(repositoryRoot, "package.json")),
      "package manifest",
    ).packageManager;
    if (packageManager !== `npm@${npmVersion.stdout.trim()}`) {
      throw new Error(
        "executing npm version differs from the package manifest identity",
      );
    }
  } catch (error) {
    installation.completionMarker.result = "measurement-failed";
    writeExclusive(evidenceRoot, installationPath, canonicalJsonBytes(installation));
    const installationDescriptor = descriptor(evidenceRoot, installationPath);
    return {
      passed: false,
      installation,
      installationDescriptor,
      child: dispatched,
      bindingEvidence: null,
      bindingEvidenceDescriptor: null,
      installationAttempted: true,
      failurePhase: "measurement",
      measurementError: error instanceof Error ? error.message : String(error),
    };
  }
  writeExclusive(evidenceRoot, installationPath, canonicalJsonBytes(installation));
  const installationDescriptor = descriptor(evidenceRoot, installationPath);
  const evidence = sealCertificationDependencyBindingEvidence({
    schema: PRODUCTION_CERTIFICATION_DEPENDENCY_BINDING_SCHEMA,
    version: 1,
    certificationId: state.certificationId,
    candidateId: state.candidate.id,
    candidateCommitSha: state.candidate.commitSha,
    candidateTreeSha: state.candidate.treeSha,
    worktreeRole: role,
    worktreeIdentitySha256: installation.worktreeIdentitySha256,
    privateRealpathIdentitySha256: binding.privateRealpathSha256,
    filesystemIdentitySha256: binding.filesystemIdentitySha256,
    packageLockSha256: measured.packageLockSha256,
    packageManifestSha256: measured.packageManifestSha256,
    nodeVersion: process.version,
    npmVersion: npmVersion.stdout.trim(),
    npmExecutableIdentity: executableIdentity(npmPath),
    canonicalInstallationCommand: CERTIFICATION_DEPENDENCY_INSTALL_COMMAND,
    installationStartedAt: installation.installationStartedAt,
    installationCompletedAt: installation.installationCompletedAt,
    child: structuredClone(installation.child),
    stdout: structuredClone(installation.stdout),
    stderr: structuredClone(installation.stderr),
    installationEvidence: installationDescriptor,
    physicalNodeModulesProof: {
      present: true,
      installedLockSha256: measured.installedLockSha256,
      nodeModulesRootIdentitySha256: measured.nodeModulesRootIdentitySha256,
      nodeModulesFilesystemIdentitySha256:
        measured.nodeModulesFilesystemIdentitySha256,
    },
    dependencyInventory: structuredClone(measured.inventory),
    topLevelPackageResolutionProof: structuredClone(
      measured.topLevelPackageResolutionProof,
    ),
    nodeSearchPathProof: structuredClone(measured.nodeSearchPathProof),
    isolation: structuredClone(measured.isolation),
    dependencyIdentitySha256: measured.identitySha256,
    completionMarker: {
      complete: true,
      result: "installed-and-measured",
    },
  });
  const evidencePath = path.join(absoluteRoot, "binding.json");
  writeExclusive(evidenceRoot, evidencePath, canonicalJsonBytes(evidence));
  return {
    passed: true,
    installation,
    installationDescriptor,
    child: dispatched,
    bindingEvidence: evidence,
    bindingEvidenceDescriptor: descriptor(evidenceRoot, evidencePath),
    measured,
    installationAttempted,
    failurePhase: null,
  };
}

function streamIssues(evidenceRoot, stream, description) {
  const issues = [];
  if (
    !exactKeys(stream, ["path", "sha256", "bytes"]) ||
    !Number.isSafeInteger(stream?.bytes) ||
    stream.bytes < 0
  ) {
    return [`${description} descriptor shape is malformed`];
  }
  try {
    const retained = resolvedEvidenceFile(
      evidenceRoot,
      { path: stream?.path, sha256: stream?.sha256 },
      description,
    );
    if (!Number.isSafeInteger(stream?.bytes) || retained.bytes.length !== stream.bytes) {
      issues.push(`${description} byte count mismatch`);
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  return issues;
}

function descriptorIssues(value, description) {
  return exactKeys(value, ["path", "sha256"]) &&
    typeof value.path === "string" &&
    isSha256(value.sha256)
    ? []
    : [`${description} descriptor shape is malformed`];
}

function installationEvidenceIssues(installation, { state, role, expectedResult }) {
  const issues = [];
  const expectedResults = Array.isArray(expectedResult)
    ? expectedResult
    : [expectedResult];
  if (
    !exactKeys(installation, [
      "schema",
      "version",
      "certificationId",
      "candidateId",
      "candidateCommitSha",
      "candidateTreeSha",
      "worktreeRole",
      "worktreeIdentitySha256",
      "canonicalInstallationCommand",
      "installationStartedAt",
      "installationCompletedAt",
      "child",
      "dispatch",
      "stdout",
      "stderr",
      "completionMarker",
    ]) ||
    installation?.schema !== PRODUCTION_CERTIFICATION_DEPENDENCY_INSTALLATION_SCHEMA ||
    installation?.version !== 1 ||
    installation?.certificationId !== state.certificationId ||
    installation?.candidateId !== state.candidate.id ||
    installation?.candidateCommitSha !== state.candidate.commitSha ||
    installation?.candidateTreeSha !== state.candidate.treeSha ||
    installation?.worktreeRole !== role ||
    installation?.worktreeIdentitySha256 !==
      sha256Bytes(
        canonicalJsonBytes(dependencyWorktreeIdentity(state.worktrees.roles[role])),
      ) ||
    installation?.canonicalInstallationCommand !==
      CERTIFICATION_DEPENDENCY_INSTALL_COMMAND ||
    !isCanonicalUtcTimestamp(installation?.installationStartedAt) ||
    !isCanonicalUtcTimestamp(installation?.installationCompletedAt) ||
    Date.parse(installation?.installationCompletedAt ?? "") <
      Date.parse(installation?.installationStartedAt ?? "") ||
    !exactKeys(installation?.child, ["exitCode", "signal", "spawnError"]) ||
    !exactKeys(installation?.dispatch, ["exitCode", "signal", "spawnError"]) ||
    (installation?.child?.exitCode !== null &&
      !Number.isSafeInteger(installation?.child?.exitCode)) ||
    (installation?.child?.signal !== null &&
      (typeof installation?.child?.signal !== "string" ||
        installation.child.signal.length === 0)) ||
    (installation?.child?.spawnError !== null &&
      (typeof installation?.child?.spawnError !== "string" ||
        installation.child.spawnError.length === 0)) ||
    (installation?.dispatch?.exitCode !== null &&
      !Number.isSafeInteger(installation?.dispatch?.exitCode)) ||
    (installation?.dispatch?.signal !== null &&
      (typeof installation?.dispatch?.signal !== "string" ||
        installation.dispatch.signal.length === 0)) ||
    (installation?.dispatch?.spawnError !== null &&
      (typeof installation?.dispatch?.spawnError !== "string" ||
        installation.dispatch.spawnError.length === 0)) ||
    !exactKeys(installation?.completionMarker, ["complete", "result"]) ||
    installation.completionMarker.complete !== true ||
    !expectedResults.includes(installation.completionMarker.result)
  ) {
    issues.push("dependency installation evidence identity, shape, or result is invalid");
  }
  const result = installation?.completionMarker?.result;
  const child = installation?.child;
  const dispatch = installation?.dispatch;
  const childSucceeded =
    child?.exitCode === 0 && child?.signal === null && child?.spawnError === null;
  const childFailed =
    (Number.isSafeInteger(child?.exitCode) && child.exitCode !== 0) ||
    (typeof child?.signal === "string" && child.signal.length > 0) ||
    (typeof child?.spawnError === "string" && child.spawnError.length > 0);
  const dispatchSucceeded =
    dispatch?.exitCode === 0 &&
    dispatch?.signal === null &&
    dispatch?.spawnError === null;
  const dispatchFailed =
    (Number.isSafeInteger(dispatch?.exitCode) && dispatch.exitCode !== 0) ||
    (typeof dispatch?.signal === "string" && dispatch.signal.length > 0) ||
    (typeof dispatch?.spawnError === "string" && dispatch.spawnError.length > 0);
  if (
    !(
      (result === "succeeded" && childSucceeded && dispatchSucceeded) ||
      (result === "measurement-failed" && childSucceeded && dispatchSucceeded) ||
      (result === "failed" && childFailed) ||
      (result === "wrapper-failed" && childSucceeded && dispatchFailed) ||
      result === "not-started"
    )
  ) {
    issues.push("dependency installation child result contradicts its completion marker");
  }
  return issues;
}

function bindingContractIssues(evidence) {
  const issues = [];
  if (!exactKeys(evidence, [
    "schema",
    "version",
    "certificationId",
    "candidateId",
    "candidateCommitSha",
    "candidateTreeSha",
    "worktreeRole",
    "worktreeIdentitySha256",
    "privateRealpathIdentitySha256",
    "filesystemIdentitySha256",
    "packageLockSha256",
    "packageManifestSha256",
    "nodeVersion",
    "npmVersion",
    "npmExecutableIdentity",
    "canonicalInstallationCommand",
    "installationStartedAt",
    "installationCompletedAt",
    "child",
    "stdout",
    "stderr",
    "installationEvidence",
    "physicalNodeModulesProof",
    "dependencyInventory",
    "topLevelPackageResolutionProof",
    "nodeSearchPathProof",
    "isolation",
    "dependencyIdentitySha256",
    "completionMarker",
    "aggregateEvidenceSha256",
  ])) {
    issues.push("dependency-binding evidence shape is not exact");
  }
  const inventory = evidence?.dependencyInventory;
  const physicalContent = inventory?.physicalContent;
  if (
    !exactKeys(evidence?.npmExecutableIdentity, [
      "realpathSha256",
      "filesystemIdentitySha256",
      "bytesSha256",
    ]) ||
    Object.values(evidence?.npmExecutableIdentity ?? {}).some(
      (value) => value !== null && !isSha256(value),
    ) ||
    !exactKeys(evidence?.child, ["exitCode", "signal", "spawnError"]) ||
    !exactKeys(evidence?.physicalNodeModulesProof, [
      "present",
      "installedLockSha256",
      "nodeModulesRootIdentitySha256",
      "nodeModulesFilesystemIdentitySha256",
    ]) ||
    !exactKeys(inventory, [
      "packageCount",
      "internalSymlinkCount",
      "packages",
      "symlinks",
      "physicalContent",
      "sha256",
    ]) ||
    !Array.isArray(inventory?.packages) ||
    !Array.isArray(inventory?.symlinks) ||
    inventory?.packages?.some(
      (entry) =>
        !exactKeys(entry, [
          "path",
          "type",
          "physicalIdentitySha256",
          "packageManifestSha256",
          "version",
          "integrity",
        ]) ||
        typeof entry.path !== "string" ||
        !["directory", "file"].includes(entry.type) ||
        !isSha256(entry.physicalIdentitySha256) ||
        (entry.packageManifestSha256 !== null &&
          !isSha256(entry.packageManifestSha256)) ||
        (entry.version !== null && typeof entry.version !== "string") ||
        (entry.integrity !== null && typeof entry.integrity !== "string"),
    ) ||
    inventory?.symlinks?.some(
      (entry) =>
        !exactKeys(entry, ["path", "type", "targetSha256"]) ||
        typeof entry.path !== "string" ||
        entry.type !== "internal-symlink" ||
        !isSha256(entry.targetSha256),
    ) ||
    !exactKeys(physicalContent, [
      "fileCount",
      "directoryCount",
      "symlinkCount",
      "totalBytes",
      "sha256",
    ]) ||
    [
      physicalContent?.fileCount,
      physicalContent?.directoryCount,
      physicalContent?.symlinkCount,
      physicalContent?.totalBytes,
    ].some((value) => !Number.isSafeInteger(value) || value < 0) ||
    !isSha256(physicalContent?.sha256) ||
    inventory?.packageCount !== inventory?.packages?.length ||
    inventory?.internalSymlinkCount !== inventory?.symlinks?.length ||
    inventory?.sha256 !==
      sha256Bytes(
        canonicalJsonBytes({
          packages: inventory?.packages,
          symlinks: inventory?.symlinks,
          physicalContent,
        }),
      )
  ) {
    issues.push("dependency-binding installed inventory is malformed");
  }
  const resolution = evidence?.topLevelPackageResolutionProof;
  if (
    !exactKeys(resolution, ["count", "packages", "sha256"]) ||
    !Array.isArray(resolution?.packages) ||
    resolution?.count !== resolution?.packages?.length ||
    resolution?.packages?.some(
      (entry) =>
        !exactKeys(entry, [
          "name",
          "packageRootIdentitySha256",
          "packageManifestPath",
          "packageManifestSha256",
        ]) ||
        typeof entry.name !== "string" ||
        typeof entry.packageManifestPath !== "string" ||
        !isSha256(entry.packageRootIdentitySha256) ||
        !isSha256(entry.packageManifestSha256),
    ) ||
    resolution?.sha256 !== sha256Bytes(canonicalJsonBytes(resolution?.packages))
  ) {
    issues.push("dependency-binding top-level resolution proof is malformed");
  }
  const searchPaths = evidence?.nodeSearchPathProof;
  const searchPathPayload = searchPaths
    ? Object.fromEntries(
        Object.entries(searchPaths).filter(([name]) => name !== "sha256"),
      )
    : null;
  if (
    !exactKeys(searchPaths, [
      "schema",
      "ancestorRoots",
      "globalRoots",
      "nodePathEnvironmentPresent",
      "existingExternalRootCount",
      "passed",
      "sha256",
    ]) ||
    searchPaths?.schema !==
      "interior-ai.production-certification-node-module-search-path-proof.v1" ||
    !Array.isArray(searchPaths?.ancestorRoots) ||
    !Array.isArray(searchPaths?.globalRoots) ||
    searchPaths?.ancestorRoots?.length < 1 ||
    new Set(
      [...(searchPaths?.ancestorRoots ?? []), ...(searchPaths?.globalRoots ?? [])]
        .map((entry) => entry?.pathIdentitySha256),
    ).size !==
      (searchPaths?.ancestorRoots?.length ?? 0) +
        (searchPaths?.globalRoots?.length ?? 0) ||
    [...(searchPaths?.ancestorRoots ?? []), ...(searchPaths?.globalRoots ?? [])]
      .some(
        (entry) =>
          !exactKeys(entry, ["pathIdentitySha256", "present"]) ||
          !isSha256(entry.pathIdentitySha256) ||
          entry.present !== false,
      ) ||
    searchPaths?.nodePathEnvironmentPresent !== false ||
    searchPaths?.existingExternalRootCount !== 0 ||
    searchPaths?.passed !== true ||
    !isSha256(searchPaths?.sha256) ||
    searchPaths?.sha256 !== sha256Bytes(canonicalJsonBytes(searchPathPayload))
  ) {
    issues.push("dependency-binding Node module search-path proof is malformed");
  }
  if (
    typeof evidence?.nodeVersion !== "string" ||
    !evidence.nodeVersion ||
    typeof evidence?.npmVersion !== "string" ||
    !evidence.npmVersion ||
    Object.values(evidence?.npmExecutableIdentity ?? {}).some(
      (value) => !isSha256(value),
    )
  ) {
    issues.push("dependency-binding retained Node/npm identity is malformed");
  }
  if (
    !exactKeys(evidence?.isolation, [
      "nodeModulesRootPhysical",
      "nodeModulesRootLocalToWorktree",
      "externalDependencySymlinkCount",
      "crossWorktreeResolutionCount",
      "globalOrNodePathResolutionCount",
      "passed",
    ]) ||
    evidence?.isolation?.nodeModulesRootPhysical !== true ||
    evidence?.isolation?.nodeModulesRootLocalToWorktree !== true ||
    evidence?.isolation?.externalDependencySymlinkCount !== 0 ||
    evidence?.isolation?.crossWorktreeResolutionCount !== 0 ||
    evidence?.isolation?.globalOrNodePathResolutionCount !== 0 ||
    evidence?.isolation?.passed !== true ||
    !exactKeys(evidence?.completionMarker, ["complete", "result"]) ||
    evidence?.completionMarker?.complete !== true ||
    evidence?.completionMarker?.result !== "installed-and-measured" ||
    [
      evidence?.packageLockSha256,
      evidence?.packageManifestSha256,
      evidence?.physicalNodeModulesProof?.installedLockSha256,
      evidence?.physicalNodeModulesProof?.nodeModulesRootIdentitySha256,
      evidence?.physicalNodeModulesProof?.nodeModulesFilesystemIdentitySha256,
      evidence?.nodeSearchPathProof?.sha256,
      evidence?.dependencyIdentitySha256,
      evidence?.aggregateEvidenceSha256,
    ].some((value) => !isSha256(value)) ||
    evidence?.physicalNodeModulesProof?.present !== true
  ) {
    issues.push("dependency-binding physical/isolation contract is malformed");
  }
  issues.push(
    ...descriptorIssues(evidence?.installationEvidence, "dependency installation evidence"),
  );
  return issues;
}

export function validateCertificationDependencyBindingEvidence({
  evidence,
  evidenceRoot,
  state,
  role,
  repositoryRoot,
  remeasure = true,
}) {
  const issues = [];
  const binding = state.worktrees?.roles?.[role];
  issues.push(...bindingContractIssues(evidence));
  if (
    evidence?.schema !== PRODUCTION_CERTIFICATION_DEPENDENCY_BINDING_SCHEMA ||
    evidence?.version !== 1 ||
    evidence?.aggregateEvidenceSha256 !==
      sealCertificationDependencyBindingEvidence(evidence).aggregateEvidenceSha256
  ) {
    issues.push("dependency-binding evidence schema or seal is invalid");
  }
  if (
    evidence?.certificationId !== state.certificationId ||
    evidence?.candidateId !== state.candidate.id ||
    evidence?.candidateCommitSha !== state.candidate.commitSha ||
    evidence?.candidateTreeSha !== state.candidate.treeSha
  ) {
    issues.push("dependency-binding evidence belongs to another certification or candidate");
  }
  if (
    evidence?.worktreeRole !== role ||
    evidence?.worktreeIdentitySha256 !==
      sha256Bytes(canonicalJsonBytes(dependencyWorktreeIdentity(binding))) ||
    evidence?.privateRealpathIdentitySha256 !== binding?.privateRealpathSha256 ||
    evidence?.filesystemIdentitySha256 !== binding?.filesystemIdentitySha256
  ) {
    issues.push("dependency-binding evidence belongs to another role or worktree");
  }
  if (
    evidence?.canonicalInstallationCommand !==
      CERTIFICATION_DEPENDENCY_INSTALL_COMMAND ||
    !isCanonicalUtcTimestamp(evidence?.installationStartedAt) ||
    !isCanonicalUtcTimestamp(evidence?.installationCompletedAt) ||
    Date.parse(evidence?.installationCompletedAt ?? "") <
      Date.parse(evidence?.installationStartedAt ?? "") ||
    evidence?.child?.exitCode !== 0 ||
    evidence?.child?.signal !== null ||
    evidence?.child?.spawnError !== null ||
    evidence?.completionMarker?.complete !== true ||
    evidence?.completionMarker?.result !== "installed-and-measured" ||
    !isSha256(evidence?.dependencyIdentitySha256)
  ) {
    issues.push("dependency-binding installation completion evidence is invalid");
  }
  issues.push(
    ...streamIssues(evidenceRoot, evidence?.stdout, "dependency installation stdout"),
    ...streamIssues(evidenceRoot, evidence?.stderr, "dependency installation stderr"),
  );
  try {
    const retained = resolvedEvidenceFile(
      evidenceRoot,
      evidence?.installationEvidence,
      "dependency installation evidence",
    );
    const installation = parseJson(retained.bytes, "dependency installation evidence");
    issues.push(
      ...installationEvidenceIssues(installation, {
        state,
        role,
        expectedResult: "succeeded",
      }),
    );
    if (
      installation?.child?.exitCode !== 0 ||
      installation?.worktreeIdentitySha256 !== evidence?.worktreeIdentitySha256 ||
      installation?.installationStartedAt !== evidence?.installationStartedAt ||
      installation?.installationCompletedAt !== evidence?.installationCompletedAt ||
      JSON.stringify(installation?.stdout) !== JSON.stringify(evidence?.stdout) ||
      JSON.stringify(installation?.stderr) !== JSON.stringify(evidence?.stderr)
    ) {
      issues.push("dependency installation evidence contradicts the binding evidence");
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  if (remeasure) {
    const installEnvironment =
      certificationDependencyInstallationEnvironment(process.env);
    try {
      const currentNpmPath = npmExecutablePath(installEnvironment);
      const currentNpmIdentity = executableIdentity(currentNpmPath);
      const currentNpmVersion = spawnSync(currentNpmPath, ["--version"], {
        cwd: repositoryRoot,
        env: installEnvironment,
        encoding: "utf8",
      });
      const packageManager = parseJson(
        readFileSync(path.join(repositoryRoot, "package.json")),
        "package manifest",
      ).packageManager;
      if (
        evidence?.nodeVersion !== process.version ||
        currentNpmVersion.error ||
        currentNpmVersion.signal ||
        currentNpmVersion.status !== 0 ||
        evidence?.npmVersion !== currentNpmVersion.stdout.trim() ||
        packageManager !== `npm@${evidence?.npmVersion}` ||
        JSON.stringify(evidence?.npmExecutableIdentity) !==
          JSON.stringify(currentNpmIdentity)
      ) {
        issues.push(
          "dependency-binding Node/npm executable identity is stale or invalid",
        );
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
    try {
      const expectedSearchPaths = expectedNodeSearchPathProof({
        evidenceRoot,
        binding,
      });
      if (
        JSON.stringify(evidence?.nodeSearchPathProof) !==
        JSON.stringify(expectedSearchPaths)
      ) {
        issues.push(
          "dependency-binding Node module search-path proof differs from the exact worktree search roots",
        );
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
    try {
      const measured = measureCertificationWorktreeDependencies({ repositoryRoot });
      for (const [field, observed] of [
        ["packageLockSha256", measured.packageLockSha256],
        ["packageManifestSha256", measured.packageManifestSha256],
        ["dependencyIdentitySha256", measured.identitySha256],
      ]) {
        if (evidence?.[field] !== observed) {
          issues.push(`dependency-binding evidence no longer matches ${field}`);
        }
      }
      if (
        evidence?.physicalNodeModulesProof?.installedLockSha256 !==
          measured.installedLockSha256 ||
        evidence?.physicalNodeModulesProof?.nodeModulesRootIdentitySha256 !==
          measured.nodeModulesRootIdentitySha256 ||
        evidence?.physicalNodeModulesProof
          ?.nodeModulesFilesystemIdentitySha256 !==
          measured.nodeModulesFilesystemIdentitySha256 ||
        evidence?.dependencyInventory?.sha256 !== measured.inventory.sha256 ||
        JSON.stringify(evidence?.dependencyInventory) !==
          JSON.stringify(measured.inventory) ||
        evidence?.topLevelPackageResolutionProof?.sha256 !==
          measured.topLevelPackageResolutionProof.sha256 ||
        JSON.stringify(evidence?.topLevelPackageResolutionProof) !==
          JSON.stringify(measured.topLevelPackageResolutionProof) ||
        JSON.stringify(evidence?.nodeSearchPathProof) !==
          JSON.stringify(measured.nodeSearchPathProof) ||
        evidence?.isolation?.passed !== true ||
        measured.isolation.passed !== true
      ) {
        issues.push("physical dependencies drifted or lost worktree isolation");
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { valid: issues.length === 0, issues };
}

export function readAndValidateCertificationDependencyBindingEvidence({
  evidenceRoot,
  descriptor: value,
  state,
  role,
  repositoryRoot,
  remeasure = true,
}) {
  const retained = resolvedEvidenceFile(
    evidenceRoot,
    value,
    "dependency-binding evidence",
  );
  const evidence = parseJson(retained.bytes, "dependency-binding evidence");
  if (!retained.bytes.equals(canonicalJsonBytes(evidence))) {
    throw new Error("dependency-binding evidence is not canonical JSON");
  }
  const validation = validateCertificationDependencyBindingEvidence({
    evidence,
    evidenceRoot,
    state,
    role,
    repositoryRoot,
    remeasure,
  });
  return { evidence, validation };
}

export function readAndValidateCertificationDependencyInstallationEvidence({
  evidenceRoot,
  descriptor: value,
  state,
  role,
  expectedResult,
}) {
  const retained = resolvedEvidenceFile(
    evidenceRoot,
    value,
    "dependency installation evidence",
  );
  const evidence = parseJson(retained.bytes, "dependency installation evidence");
  const issues = [];
  if (!retained.bytes.equals(canonicalJsonBytes(evidence))) {
    issues.push("dependency installation evidence is not canonical JSON");
  }
  issues.push(
    ...installationEvidenceIssues(evidence, { state, role, expectedResult }),
  );
  issues.push(
    ...streamIssues(evidenceRoot, evidence?.stdout, "dependency installation stdout"),
    ...streamIssues(evidenceRoot, evidence?.stderr, "dependency installation stderr"),
  );
  return { evidence, validation: { valid: issues.length === 0, issues } };
}

export function dependencyLifecycleIssues(binding, { active = true } = {}) {
  const issues = [];
  if (
    binding?.dependencyLifecycleSchema !==
      PRODUCTION_CERTIFICATION_DEPENDENCY_LIFECYCLE_SCHEMA ||
    !CERTIFICATION_DEPENDENCY_STATUSES.includes(binding?.dependencyStatus)
  ) {
    return ["dependency lifecycle schema or status is invalid"];
  }
  const status = binding.dependencyStatus;
  const hasIdentity = isSha256(binding.dependencyIdentitySha256);
  const hasBindingEvidence =
    binding.dependencyBindingEvidence !== null &&
    typeof binding.dependencyBindingEvidence?.path === "string" &&
    isSha256(binding.dependencyBindingEvidence?.sha256);
  const hasInstallation = binding.dependencyInstallation !== null;
  const installedEventKeys = [
    "owner",
    "canonicalCommand",
    "startedAt",
    "completedAt",
    "exitCode",
    "signal",
    "spawnError",
    "result",
    "completionMarker",
    "aggregateEvidenceSha256",
  ];
  const failedEventKeys = [
    "owner",
    "canonicalCommand",
    "startedAt",
    "completedAt",
    "exitCode",
    "signal",
    "spawnError",
    "result",
    "completionMarker",
    "evidence",
  ];
  const bindingFailedEventKeys = [...failedEventKeys, "bindingEvidence"];
  const installationEventTimingInvalid =
    hasInstallation &&
    (!isCanonicalUtcTimestamp(binding.dependencyInstallation?.startedAt) ||
      !isCanonicalUtcTimestamp(binding.dependencyInstallation?.completedAt) ||
      Date.parse(binding.dependencyInstallation.completedAt) <
        Date.parse(binding.dependencyInstallation.startedAt) ||
      binding.dependencyInstallation?.canonicalCommand !==
        CERTIFICATION_DEPENDENCY_INSTALL_COMMAND);
  if (
    status === "not-installed" &&
    (binding.dependencyIdentitySha256 !== null ||
      binding.dependencyBindingEvidence !== null ||
      binding.dependencyInstallation !== null)
  ) {
    issues.push("not-installed dependencies must have null identity and no evidence");
  }
  if (
    status === "installed" &&
    (!hasIdentity ||
      !hasBindingEvidence ||
      !hasInstallation ||
      !exactKeys(binding.dependencyInstallation, installedEventKeys) ||
      installationEventTimingInvalid ||
      binding.dependencyInstallation?.owner !== "worktree-dependencies:bind" ||
      binding.dependencyInstallation?.exitCode !== 0 ||
      binding.dependencyInstallation?.signal !== null ||
      binding.dependencyInstallation?.spawnError !== null ||
      binding.dependencyInstallation?.result !== "succeeded" ||
      !isSha256(
        binding.dependencyInstallation?.aggregateEvidenceSha256,
      ) ||
      binding.dependencyInstallation?.completionMarker !==
        "installed-and-bound")
  ) {
    issues.push("installed dependencies require identity and completion evidence");
  }
  if (
    status === "failed" &&
    (binding.dependencyIdentitySha256 !== null ||
      binding.dependencyBindingEvidence !== null ||
      !hasInstallation)
  ) {
    issues.push("failed dependencies cannot be marked installed or bound");
  }
  if (
    status === "failed" &&
    (!exactKeys(
      binding.dependencyInstallation,
      binding.dependencyInstallation?.result === "binding-failed"
        ? bindingFailedEventKeys
        : failedEventKeys,
    ) ||
      installationEventTimingInvalid ||
      binding.dependencyInstallation?.owner !== "worktree-dependencies:fail" ||
      !new Set([
        "failed",
        "measurement-failed",
        "wrapper-failed",
        "binding-failed",
      ]).has(
        binding.dependencyInstallation?.result,
      ) ||
      (binding.dependencyInstallation?.result === "failed" &&
        !(
          (Number.isSafeInteger(binding.dependencyInstallation?.exitCode) &&
            binding.dependencyInstallation.exitCode !== 0) ||
          binding.dependencyInstallation?.signal ||
          binding.dependencyInstallation?.spawnError
        )) ||
      (binding.dependencyInstallation?.result === "measurement-failed" &&
        (binding.dependencyInstallation?.exitCode !== 0 ||
          binding.dependencyInstallation?.signal !== null ||
          binding.dependencyInstallation?.spawnError !== null)) ||
      (binding.dependencyInstallation?.result === "wrapper-failed" &&
        !(
          (Number.isSafeInteger(binding.dependencyInstallation?.exitCode) &&
            binding.dependencyInstallation.exitCode !== 0) ||
          binding.dependencyInstallation?.signal ||
          binding.dependencyInstallation?.spawnError
        )) ||
      (binding.dependencyInstallation?.result === "binding-failed" &&
        (binding.dependencyInstallation?.exitCode !== 0 ||
          binding.dependencyInstallation?.signal !== null ||
          binding.dependencyInstallation?.spawnError !== null ||
          typeof binding.dependencyInstallation?.bindingEvidence?.path !==
            "string" ||
          !isSha256(binding.dependencyInstallation?.bindingEvidence?.sha256))) ||
      binding.dependencyInstallation?.completionMarker !== "failed")
  ) {
    issues.push("failed dependencies require truthful failure evidence");
  }
  if (status === "installing") {
    issues.push("durable state cannot remain in the transient installing status");
  }
  if (status === "removed" && active) {
    issues.push("removed dependencies cannot belong to an active usable worktree");
  }
  if (status === "removed" && binding.lifecycleStatus !== "cleaned") {
    issues.push("removed dependencies require a cleaned worktree lifecycle");
  }
  if (binding.lifecycleStatus === "cleaned" && status !== "removed") {
    issues.push("cleaned worktree dependencies must be removed");
  }
  if (
    status === "removed" &&
    (!hasIdentity ||
      !hasBindingEvidence ||
      !hasInstallation ||
      !exactKeys(binding.dependencyInstallation, installedEventKeys) ||
      installationEventTimingInvalid ||
      binding.dependencyInstallation?.owner !== "worktree-dependencies:bind" ||
      binding.dependencyInstallation?.exitCode !== 0 ||
      binding.dependencyInstallation?.signal !== null ||
      binding.dependencyInstallation?.spawnError !== null ||
      binding.dependencyInstallation?.result !== "succeeded" ||
      binding.dependencyInstallation?.completionMarker !==
        "installed-and-bound" ||
      !isSha256(binding.dependencyInstallation?.aggregateEvidenceSha256))
  ) {
    issues.push("removed dependencies must retain their successful binding receipt");
  }
  return issues;
}
