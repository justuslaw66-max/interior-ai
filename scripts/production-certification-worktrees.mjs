import { spawnSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  statfsSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  canonicalJsonBytes,
  isCandidateId,
  isCanonicalUtcTimestamp,
  isSha256,
  isSourceSha,
  PRODUCTION_CERTIFICATION_HARNESS_VERSION,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import {
  PRODUCTION_CERTIFICATION_DEPENDENCY_LIFECYCLE_SCHEMA,
  dependencyLifecycleIssues,
  measureCertificationWorktreeDependencies,
  readAndValidateCertificationDependencyBindingEvidence,
  readAndValidateCertificationDependencyInstallationEvidence,
} from "./production-certification-dependencies.mjs";

export const CERTIFICATION_WORKTREE_ROOT_ENV = "CERTIFICATION_WORKTREE_ROOT";
export const PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA =
  "interior-ai.production-certification-worktrees.v2";
export const PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA_V1 =
  "interior-ai.production-certification-worktrees.v1";
export const PRODUCTION_CERTIFICATION_WORKTREE_PRIVATE_SCHEMA =
  "interior-ai.production-certification-worktree-private.v1";
export const PRODUCTION_CERTIFICATION_PRE_STATE_FAILURE_SCHEMA =
  "interior-ai.production-certification-pre-state-failure.v1";
export const PRODUCTION_CERTIFICATION_WORKTREE_CLEANUP_SCHEMA =
  "interior-ai.production-certification-worktree-cleanup.v1";
export const CERTIFICATION_WORKTREE_CLEANUP_EVIDENCE_NAME = "worktree-cleanup";
export const CERTIFICATION_WORKTREE_ROLES = Object.freeze([
  "source-validation",
  "final-artifact",
  "development-browser",
]);

const ROLE_DIRECTORY = Object.freeze({
  "source-validation": "source-validation",
  "final-artifact": "final-artifact",
  "development-browser": "development-browser",
});
const INFLUENTIAL_ENVIRONMENT_PATHS = Object.freeze([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.staging",
]);
const ALWAYS_PROHIBITED_ROOTS = Object.freeze([
  ".vercel",
  "playwright-report",
  "release-evidence-private",
]);
const ROLE_ALLOWED_IGNORED_ROOTS = Object.freeze({
  "source-validation": ["node_modules"],
  "final-artifact": ["node_modules", ".next", ".local"],
  "development-browser": ["node_modules", "test-results", "playwright-report"],
});
const MINIMUM_AVAILABLE_BYTES = 1024 ** 3;
const GIT_EXECUTABLE = (() => {
  const names = process.platform === "win32" ? ["git.exe", "git.cmd"] : ["git"];
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return "git";
})();

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
}

function git(repositoryRoot, args, { allowFailure = false, trim = true } = {}) {
  const child = spawnSync(GIT_EXECUTABLE, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (child.error || child.signal || (!allowFailure && child.status !== 0)) {
    throw new Error(
      String(child.stderr || child.stdout || "certification Git worktree operation failed").trim(),
    );
  }
  if (child.status !== 0) return null;
  return trim ? child.stdout.trim() : child.stdout;
}

function pathInside(parent, child) {
  const root = path.resolve(parent);
  const target = path.resolve(child);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function physicalDirectory(directoryPath, description) {
  const metadata = lstatSync(directoryPath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${description} must be a physical directory`);
  }
  return realpathSync(directoryPath);
}

function atomicWrite(filePath, bytes) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    throw error;
  }
}

function atomicWriteAbsent(filePath, bytes) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${sha256Bytes(bytes).slice(0, 12)}`;
  try {
    writeFileSync(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    linkSync(temporaryPath, filePath);
    unlinkSync(temporaryPath);
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    if (error?.code === "EEXIST") {
      throw new Error("pre-state failure receipt target is no longer absent");
    }
    throw error;
  }
}

function containedPrivateSidecarDirectory(
  evidenceRoot,
  role,
  { create = false } = {},
) {
  validateRole(role);
  const physicalEvidenceRoot = physicalDirectory(
    evidenceRoot,
    "certification evidence root",
  );
  let current = physicalEvidenceRoot;
  for (const component of ["worktrees", "private", ROLE_DIRECTORY[role]]) {
    const next = path.join(current, component);
    if (!existsSync(next)) {
      if (!create) {
        throw new Error("stage worktree private sidecar parent is missing");
      }
      mkdirSync(next, { mode: 0o700 });
    }
    current = physicalDirectory(
      next,
      "stage worktree private sidecar parent",
    );
    if (!pathInside(physicalEvidenceRoot, current)) {
      throw new Error(
        "stage worktree private sidecar parent escapes the evidence root",
      );
    }
  }
  return { physicalEvidenceRoot, directory: current };
}

function normalizedInventory(values) {
  const paths = [...values].sort();
  return {
    count: paths.length,
    sha256: sha256Bytes(paths.map((value) => `${value}\n`).join("")),
  };
}

function worktreeRolesSha256(roles) {
  return sha256Bytes(canonicalJsonBytes(roles));
}

function ignoredPaths(repositoryRoot) {
  const output = git(
    repositoryRoot,
    ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"],
    { trim: false },
  );
  return output
    .split("\0")
    .filter(Boolean)
    .map((value) => value.split(path.sep).join("/"))
    .sort();
}

function ordinaryStatus(repositoryRoot) {
  const output = git(
    repositoryRoot,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { trim: false },
  );
  return output.split("\0").filter(Boolean);
}

function generatedOutputPathMatches(relativePath, declaration) {
  return declaration.pathType === "directory"
    ? relativePath === declaration.relativePath ||
        relativePath.startsWith(`${declaration.relativePath}/`)
    : relativePath === declaration.relativePath;
}

export function sourceValidationWorktreeOutputState({
  repositoryRoot,
  activeGeneratedOutputs = [],
}) {
  const duplicatePaths = activeGeneratedOutputs.filter(
    (entry, index, entries) =>
      entries.findIndex((candidate) => candidate.relativePath === entry.relativePath) !==
      index,
  );
  if (
    duplicatePaths.length > 0 ||
    activeGeneratedOutputs.some(
      (entry) =>
        !entry ||
        typeof entry.relativePath !== "string" ||
        !new Set(["file", "directory"]).has(entry.pathType),
    )
  ) {
    throw new Error("active source generated-output declaration is malformed");
  }
  const status = ordinaryStatus(repositoryRoot).sort();
  const ignored = ignoredPaths(repositoryRoot);
  const persistentIgnoredPaths = [];
  const declaredGeneratedPaths = [];
  const undeclaredIgnoredPaths = [];
  for (const relativePath of ignored) {
    if (relativePath === "node_modules" || relativePath.startsWith("node_modules/")) {
      persistentIgnoredPaths.push(relativePath);
      continue;
    }
    const owner = activeGeneratedOutputs.find((entry) =>
      generatedOutputPathMatches(relativePath, entry),
    );
    if (owner) declaredGeneratedPaths.push(relativePath);
    else undeclaredIgnoredPaths.push(relativePath);
  }
  return {
    trackedAndOrdinaryUntrackedClean: status.length === 0,
    ordinaryStatus: status,
    persistentIgnoredInventory: normalizedInventory(persistentIgnoredPaths),
    declaredGeneratedInventory: normalizedInventory(declaredGeneratedPaths),
    undeclaredIgnoredInventory: normalizedInventory(undeclaredIgnoredPaths),
    undeclaredIgnoredPaths,
    activeGeneratedOutputIds: activeGeneratedOutputs.map((entry) => entry.id).sort(),
    valid: status.length === 0 && undeclaredIgnoredPaths.length === 0,
  };
}

function ignoredPathAllowed(role, relativePath, phase) {
  if (phase === "pristine") return false;
  return ROLE_ALLOWED_IGNORED_ROOTS[role].some(
    (root) => relativePath === root || relativePath.startsWith(`${root}/`),
  );
}

function dependencyIdentity(repositoryRoot) {
  const dependencyRoot = path.join(repositoryRoot, "node_modules");
  if (!existsSync(dependencyRoot)) return null;
  return measureCertificationWorktreeDependencies({ repositoryRoot });
}

function commonDirectoryIdentity(repositoryRoot) {
  const gitCommonDir = git(repositoryRoot, ["rev-parse", "--git-common-dir"]);
  const resolved = realpathSync(path.resolve(repositoryRoot, gitCommonDir));
  const metadata = statSync(resolved);
  return {
    sha256: sha256Bytes(resolved),
    filesystemIdentitySha256: sha256Bytes(`${metadata.dev}:${metadata.ino}`),
    private: { realpath: resolved, device: metadata.dev, inode: metadata.ino },
  };
}

function validateRole(role) {
  if (!CERTIFICATION_WORKTREE_ROLES.includes(role)) {
    throw new Error(`unknown certification worktree role: ${String(role)}`);
  }
}

export function stageWorktreeRole(stage, ownerId = null) {
  if (stage === "source-validation") return "source-validation";
  if (stage === "browser-owners" && new Set(["cart", "retailer"]).has(ownerId)) {
    return "development-browser";
  }
  if (
    new Set([
      "build",
      "archive-preflight",
      "archive",
      "extracted-archive-preflight",
      "phase8",
      "runtime-smoke",
      "browser-owners",
      "final-standalone",
      "continuity",
    ]).has(stage)
  ) {
    return "final-artifact";
  }
  return null;
}

export function planCertificationStageWorktrees({
  canonicalRoot,
  evidenceRoot,
  worktreeRoot,
  certificationId,
}) {
  if (!path.isAbsolute(worktreeRoot ?? "")) {
    throw new Error(`${CERTIFICATION_WORKTREE_ROOT_ENV} must be absolute`);
  }
  const canonical = physicalDirectory(canonicalRoot, "canonical checkout");
  const evidence = physicalDirectory(evidenceRoot, "certification evidence root");
  const ownerRoot = physicalDirectory(worktreeRoot, "certification worktree root");
  if (
    pathInside(canonical, ownerRoot) ||
    pathInside(ownerRoot, canonical) ||
    pathInside(evidence, ownerRoot) ||
    pathInside(ownerRoot, evidence)
  ) {
    throw new Error("certification worktree root must be outside canonical and evidence roots");
  }
  const capacity = statfsSync(ownerRoot);
  const availableBytes = Number(capacity.bavail) * Number(capacity.bsize);
  if (availableBytes < MINIMUM_AVAILABLE_BYTES) {
    throw new Error("certification worktree filesystem capacity is below policy");
  }
  if (
    certificationId === "." ||
    certificationId === ".." ||
    path.basename(certificationId) !== certificationId
  ) {
    throw new Error("certification ID cannot escape the worktree owner root");
  }
  const certificationRoot = path.join(ownerRoot, certificationId);
  if (existsSync(certificationRoot)) {
    throw new Error("certification worktree owner root already exists or was reused");
  }
  return {
    canonicalRoot: canonical,
    evidenceRoot: evidence,
    ownerRoot,
    certificationRoot,
    availableBytes,
    roles: Object.fromEntries(
      CERTIFICATION_WORKTREE_ROLES.map((role) => [
        role,
        path.join(certificationRoot, ROLE_DIRECTORY[role]),
      ]),
    ),
  };
}

export function inspectCertificationStageWorktree({
  repositoryRoot,
  canonicalRoot,
  evidenceRoot,
  role,
  certificationId,
  candidate,
  phase = "active",
}) {
  validateRole(role);
  const rootEntry = lstatSync(repositoryRoot);
  const root = realpathSync(repositoryRoot);
  const canonical = realpathSync(canonicalRoot);
  const evidence = realpathSync(evidenceRoot);
  if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
    throw new Error("stage worktree root must be a physical directory");
  }
  if (root === canonical || pathInside(canonical, root) || pathInside(evidence, root)) {
    throw new Error("canonical checkout or evidence root cannot be a stage worktree");
  }
  const gitTop = realpathSync(git(root, ["rev-parse", "--show-toplevel"]));
  const commitSha = git(root, ["rev-parse", "HEAD"]);
  const treeSha = git(root, ["rev-parse", "HEAD^{tree}"]);
  const symbolicRef = git(root, ["symbolic-ref", "-q", "HEAD"], {
    allowFailure: true,
  });
  if (
    gitTop !== root ||
    symbolicRef !== null ||
    commitSha !== candidate.commitSha ||
    treeSha !== candidate.treeSha
  ) {
    throw new Error("stage worktree is not detached at the exact candidate commit/tree");
  }
  const status = ordinaryStatus(root);
  if (status.length > 0) {
    throw new Error("stage worktree tracked or ordinary untracked state is not clean");
  }
  const ignored = ignoredPaths(root);
  const prohibited = ignored.filter(
    (relativePath) =>
      INFLUENTIAL_ENVIRONMENT_PATHS.some(
        (name) => relativePath === name || relativePath.startsWith(`${name}.`),
      ) ||
      ALWAYS_PROHIBITED_ROOTS.some(
        (name) => relativePath === name || relativePath.startsWith(`${name}/`),
      ) ||
      !ignoredPathAllowed(role, relativePath, phase),
  );
  if (prohibited.length > 0) {
    throw new Error(
      `stage worktree contains ignored influential paths: ${prohibited.join(", ")}`,
    );
  }
  if (
    role === "development-browser" &&
    [".next", ".local/phase8", ".local/production-artifact-evidence"].some(
      (relativePath) => existsSync(path.join(root, relativePath)),
    )
  ) {
    throw new Error("development-browser worktree contains production artifact or Phase 8 state");
  }
  const rootStat = statSync(root);
  const common = commonDirectoryIdentity(root);
  const dependency = phase === "failed" ? null : dependencyIdentity(root);
  if (phase === "pristine" && dependency) {
    throw new Error("pristine stage worktree must not contain node_modules");
  }
  const ignoredInventory = normalizedInventory(ignored);
  const cleanPayload = {
    commitSha,
    treeSha,
    detached: true,
    trackedAndOrdinaryUntrackedClean: true,
  };
  const privateSidecar = {
    schema: PRODUCTION_CERTIFICATION_WORKTREE_PRIVATE_SCHEMA,
    certificationId,
    role,
    realpath: root,
    gitCommonDirRealpath: common.private.realpath,
    filesystem: { device: rootStat.dev, inode: rootStat.ino },
    dependency: dependency?.private ?? null,
  };
  const portable = {
    role,
    certificationId,
    candidateCommitSha: commitSha,
    candidateTreeSha: treeSha,
    gitCommonDirSha256: common.sha256,
    gitCommonDirFilesystemIdentitySha256: common.filesystemIdentitySha256,
    privateRealpathSha256: sha256Bytes(root),
    filesystemIdentitySha256: sha256Bytes(`${rootStat.dev}:${rootStat.ino}`),
    cleanStateSha256: sha256Bytes(canonicalJsonBytes(cleanPayload)),
    ignoredPathInventory: ignoredInventory,
    dependencyIdentitySha256: dependency?.identitySha256 ?? null,
  };
  return { root, portable, privateSidecar };
}

function writePrivateSidecar(evidenceRoot, role, sidecar, ledger = null) {
  const bytes = canonicalJsonBytes(sidecar);
  const digest = sha256Bytes(bytes);
  const physicalEvidenceRoot = physicalDirectory(
    evidenceRoot,
    "certification evidence root",
  );
  let directory = physicalEvidenceRoot;
  for (const component of ["worktrees", "private", ROLE_DIRECTORY[role]]) {
    const next = path.join(directory, component);
    if (!existsSync(next)) {
      mkdirSync(next, { mode: 0o700 });
      ledger?.createdDirectories.push(next);
    }
    directory = physicalDirectory(
      next,
      "stage worktree private sidecar parent",
    );
    if (!pathInside(physicalEvidenceRoot, directory)) {
      throw new Error("stage worktree private sidecar parent escapes the evidence root");
    }
  }
  const filePath = path.join(directory, `${digest}.json`);
  if (existsSync(filePath)) {
    const metadata = lstatSync(filePath);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      !readFileSync(filePath).equals(bytes)
    ) {
      throw new Error(
        "stage worktree private sidecar target is not the exact canonical physical file",
      );
    }
  } else {
    atomicWrite(filePath, bytes);
    ledger?.createdSidecars.push({ role, filePath, sha256: digest });
  }
  return {
    path: ["worktrees", "private", ROLE_DIRECTORY[role], `${digest}.json`].join(
      "/",
    ),
    sha256: digest,
  };
}

function physicalPrivateSidecarFile(binding, evidenceRoot) {
  const descriptor = binding?.privateSidecar;
  const role = binding?.role;
  if (
    !exactKeys(descriptor, ["path", "sha256"]) ||
    !isSha256(descriptor?.sha256) ||
    !ROLE_DIRECTORY[role]
  ) {
    throw new Error("stage worktree private sidecar descriptor is malformed");
  }
  if (
    descriptor.path !==
    [
      "worktrees",
      "private",
      ROLE_DIRECTORY[role],
      `${descriptor.sha256}.json`,
    ].join("/")
  ) {
    throw new Error(
      "stage worktree private sidecar descriptor is cross-role or noncanonical",
    );
  }
  const { physicalEvidenceRoot, directory } = containedPrivateSidecarDirectory(
    evidenceRoot,
    role,
  );
  const filePath = path.join(directory, `${descriptor.sha256}.json`);
  const metadata = lstatSync(filePath);
  const physical = realpathSync(filePath);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    !pathInside(physicalEvidenceRoot, physical)
  ) {
    throw new Error("stage worktree private sidecar escapes the evidence root");
  }
  return physical;
}

function bindingFromInspection(inspection, descriptor, createdAt) {
  return {
    ...inspection.portable,
    creationEvent: { owner: "state:init", createdAt },
    lifecycleStatus: "active",
    cleanupStatus: "pending",
    dependencyLifecycleSchema:
      PRODUCTION_CERTIFICATION_DEPENDENCY_LIFECYCLE_SCHEMA,
    dependencyStatus: "not-installed",
    dependencyBindingEvidence: null,
    dependencyInstallation: null,
    privateSidecar: descriptor,
  };
}

function canonicalCheckoutProof(repositoryRoot) {
  const payload = {
    commitSha: git(repositoryRoot, ["rev-parse", "HEAD"]),
    treeSha: git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]),
    symbolicRef: git(repositoryRoot, ["symbolic-ref", "-q", "HEAD"], {
      allowFailure: true,
    }),
    statusSha256: sha256Bytes(
      git(
        repositoryRoot,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        { trim: false },
      ),
    ),
  };
  return { ...payload, sha256: sha256Bytes(canonicalJsonBytes(payload)) };
}

function registrationPresent(repositoryRoot, target) {
  const output = git(repositoryRoot, ["worktree", "list", "--porcelain"], {
    trim: false,
  });
  return output
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => path.resolve(line.slice("worktree ".length)))
    .includes(path.resolve(target));
}

function formerWorktreePathPresent(target) {
  const absoluteTarget = path.resolve(target);
  try {
    return readdirSync(path.dirname(absoluteTarget)).some(
      (name) => name === path.basename(absoluteTarget),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function portableCreatedResourceInventory(ledger) {
  const worktreeRoles = ledger.createdWorktrees.map(({ role }) => role);
  const registrationRoles = ledger.createdRegistrations.map(({ role }) => role);
  const sidecarRoles = ledger.createdSidecars.map(({ role }) => role);
  return {
    worktreeCount: worktreeRoles.length,
    worktreeRoleInventorySha256: sha256Bytes(canonicalJsonBytes(worktreeRoles)),
    registrationCount: registrationRoles.length,
    registrationRoleInventorySha256: sha256Bytes(
      canonicalJsonBytes(registrationRoles),
    ),
    sidecarCount: sidecarRoles.length,
    sidecarRoleInventorySha256: sha256Bytes(canonicalJsonBytes(sidecarRoles)),
    directoryCount: ledger.createdDirectories.length,
    directoryInventorySha256: sha256Bytes(
      canonicalJsonBytes(
        ledger.createdDirectories.map((entry) => sha256Bytes(entry)),
      ),
    ),
  };
}

function safeRollbackIssue(kind, role = null) {
  return role ? `${kind}:${role}` : kind;
}

export function beginCertificationStageWorktreeTransaction({
  canonicalRoot,
  evidenceRoot,
  worktreeRoot,
  certificationId,
  candidate,
  createdAt,
  testHooks = null,
}) {
  if (
    !isSourceSha(candidate?.commitSha) ||
    !isSourceSha(candidate?.treeSha) ||
    !isCandidateId(certificationId)
  ) {
    throw new Error("stage worktree creation identity is malformed");
  }
  const plan = planCertificationStageWorktrees({
    canonicalRoot,
    evidenceRoot,
    worktreeRoot,
    certificationId,
  });
  const initialCanonicalProof = canonicalCheckoutProof(plan.canonicalRoot);
  const ledger = {
    createdWorktrees: [],
    createdRegistrations: [],
    createdSidecars: [],
    createdDirectories: [],
  };
  let status = "planned";

  function allocate() {
    if (status !== "planned") {
      throw new Error("certification worktree transaction allocation is not pending");
    }
    status = "allocating";
    mkdirSync(plan.certificationRoot, { mode: 0o700 });
    ledger.createdDirectories.push(plan.certificationRoot);
    for (const role of CERTIFICATION_WORKTREE_ROLES) {
      const target = plan.roles[role];
      git(plan.canonicalRoot, [
        "worktree",
        "add",
        "--detach",
        target,
        candidate.commitSha,
      ]);
      ledger.createdWorktrees.push({ role, target });
      if (!registrationPresent(plan.canonicalRoot, target)) {
        throw new Error("certification worktree registration was not published");
      }
      ledger.createdRegistrations.push({ role, target });
      if (testHooks?.failAfterWorktreeCount === ledger.createdWorktrees.length) {
        throw new Error("injected certification worktree allocation failure");
      }
    }
    const inspections = Object.fromEntries(
      CERTIFICATION_WORKTREE_ROLES.map((role) => [
        role,
        inspectCertificationStageWorktree({
          repositoryRoot: plan.roles[role],
          canonicalRoot: plan.canonicalRoot,
          evidenceRoot: plan.evidenceRoot,
          role,
          certificationId,
          candidate,
          phase: "pristine",
        }),
      ]),
    );
    const realpaths = Object.values(inspections).map((entry) => entry.root);
    if (new Set(realpaths).size !== realpaths.length) {
      throw new Error("certification stage worktree roles alias the same realpath");
    }
    const roles = {};
    for (const role of CERTIFICATION_WORKTREE_ROLES) {
      const descriptor = writePrivateSidecar(
        plan.evidenceRoot,
        role,
        inspections[role].privateSidecar,
        ledger,
      );
      roles[role] = bindingFromInspection(inspections[role], descriptor, createdAt);
    }
    status = "allocated";
    return {
      schema: PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA,
      roles,
    };
  }

  function rollback() {
    if (status === "committed") {
      throw new Error("durable certification worktrees cannot use pre-state rollback");
    }
    if (status === "rolled-back") {
      throw new Error("certification worktree transaction was already rolled back");
    }
    status = "rolling-back";
    const issues = [];
    const worktrees = [];
    for (const { role, target } of [...ledger.createdWorktrees].reverse()) {
      let removed = false;
      if (testHooks?.failRollbackRole === role) {
        issues.push(safeRollbackIssue("worktree-removal-failed", role));
      } else {
        const result = git(
          plan.canonicalRoot,
          ["worktree", "remove", "--force", target],
          { allowFailure: true },
        );
        removed = result !== null;
        if (!removed && registrationPresent(plan.canonicalRoot, target)) {
          issues.push(safeRollbackIssue("worktree-removal-failed", role));
        }
      }
      const registrationAbsent = !registrationPresent(plan.canonicalRoot, target);
      const physicalPathAbsent = !existsSync(target);
      if (!registrationAbsent) {
        issues.push(safeRollbackIssue("registration-remains", role));
      }
      if (!physicalPathAbsent) {
        issues.push(safeRollbackIssue("worktree-path-remains", role));
      }
      worktrees.push({ role, removed, physicalPathAbsent, registrationAbsent });
    }
    const sidecars = [];
    for (const entry of [...ledger.createdSidecars].reverse()) {
      let removed = false;
      try {
        const metadata = lstatSync(entry.filePath);
        if (
          metadata.isSymbolicLink() ||
          !metadata.isFile() ||
          sha256Bytes(readFileSync(entry.filePath)) !== entry.sha256
        ) {
          throw new Error("sidecar ownership changed");
        }
        unlinkSync(entry.filePath);
        removed = true;
      } catch {
        issues.push(safeRollbackIssue("sidecar-removal-failed", entry.role));
      }
      sidecars.push({ role: entry.role, removed });
    }
    for (const directory of [...ledger.createdDirectories].reverse()) {
      try {
        if (existsSync(directory)) rmdirSync(directory);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          issues.push("owned-directory-removal-failed");
        }
      }
    }
    const terminalCanonicalProof = canonicalCheckoutProof(plan.canonicalRoot);
    const canonicalCheckoutUnchanged =
      terminalCanonicalProof.sha256 === initialCanonicalProof.sha256;
    if (!canonicalCheckoutUnchanged) {
      issues.push("canonical-checkout-changed");
    }
    const terminalRegistrationAbsence = {
      proven:
        worktrees.every((entry) => entry.registrationAbsent) &&
        ledger.createdWorktrees.length === worktrees.length,
      roleResults: Object.fromEntries(
        worktrees
          .map((entry) => [entry.role, entry.registrationAbsent])
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
    };
    status = "rolled-back";
    return Object.freeze({
      outcome: issues.length === 0 ? "completed" : "failed",
      createdResourceInventory: portableCreatedResourceInventory(ledger),
      worktrees: worktrees.sort((left, right) => left.role.localeCompare(right.role)),
      sidecars: sidecars.sort((left, right) => left.role.localeCompare(right.role)),
      terminalRegistrationAbsence,
      canonicalCheckoutUnchanged,
      issues: [...new Set(issues)].sort(),
    });
  }

  return Object.freeze({
    allocate,
    rollback,
    commit() {
      if (status !== "allocated") {
        throw new Error("certification worktree transaction is not allocated");
      }
      status = "committed";
    },
    createdResourceInventory() {
      return portableCreatedResourceInventory(ledger);
    },
  });
}

export function createCertificationStageWorktrees(options) {
  const transaction = beginCertificationStageWorktreeTransaction(options);
  try {
    const worktrees = transaction.allocate();
    transaction.commit();
    return worktrees;
  } catch (error) {
    const rollback = transaction.rollback();
    if (rollback.outcome !== "completed") {
      throw Object.assign(
        new Error("certification worktree allocation and rollback failed"),
        { cause: error, certificationWorktreeRollback: rollback },
      );
    }
    throw error;
  }
}

const PRE_STATE_DEFECT_CLASSIFICATIONS = Object.freeze([
  "PRE_STATE_WORKTREE_TRANSACTION_DEFECT",
  "STATE_INIT_RESOURCE_ORDERING_DEFECT",
  "PRE_STATE_FAILURE_CLEANUP_OWNER_MISSING",
]);

function preStateFailurePayload(value) {
  const payload = structuredClone(value);
  delete payload.receiptSha256;
  return payload;
}

function sealPreStateFailureReceipt(value) {
  const payload = preStateFailurePayload(value);
  return Object.freeze({
    ...payload,
    receiptSha256: sha256Bytes(canonicalJsonBytes(payload)),
  });
}

function preStateReceiptIssues(value) {
  const issues = [];
  const rollback = value?.rollback;
  const inventory = value?.createdResourceInventory;
  if (
    !exactKeys(value, [
      "schema",
      "version",
      "certificationId",
      "candidate",
      "harness",
      "invocationNonce",
      "failure",
      "defectClassifications",
      "stateCreated",
      "createdResourceInventory",
      "rollback",
      "terminalRegistrationAbsence",
      "completionMarker",
      "completedAt",
      "receiptSha256",
    ]) ||
    value.schema !== PRODUCTION_CERTIFICATION_PRE_STATE_FAILURE_SCHEMA ||
    value.version !== 1 ||
    !isCandidateId(value.certificationId) ||
    !exactKeys(value.candidate, ["id", "commitSha", "treeSha"]) ||
    !isCandidateId(value.candidate.id) ||
    !isSourceSha(value.candidate.commitSha) ||
    !isSourceSha(value.candidate.treeSha) ||
    !exactKeys(value.harness, ["version", "sourceSha256"]) ||
    value.harness.version !== PRODUCTION_CERTIFICATION_HARNESS_VERSION ||
    !isSha256(value.harness.sourceSha256) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(value.invocationNonce) ||
    !exactKeys(value.failure, ["classification", "messageSha256"]) ||
    value.failure.classification !== "PRECONDITION_ORCHESTRATION_FAILURE" ||
    !isSha256(value.failure.messageSha256) ||
    JSON.stringify(value.defectClassifications) !==
      JSON.stringify(PRE_STATE_DEFECT_CLASSIFICATIONS) ||
    value.stateCreated !== false ||
    !exactKeys(inventory, [
      "worktreeCount",
      "worktreeRoleInventorySha256",
      "registrationCount",
      "registrationRoleInventorySha256",
      "sidecarCount",
      "sidecarRoleInventorySha256",
      "directoryCount",
      "directoryInventorySha256",
    ]) ||
    ![
      inventory.worktreeCount,
      inventory.registrationCount,
      inventory.sidecarCount,
      inventory.directoryCount,
    ].every((entry) => Number.isSafeInteger(entry) && entry >= 0) ||
    ![
      inventory.worktreeRoleInventorySha256,
      inventory.registrationRoleInventorySha256,
      inventory.sidecarRoleInventorySha256,
      inventory.directoryInventorySha256,
    ].every(isSha256) ||
    !exactKeys(rollback, [
      "outcome",
      "createdResourceInventory",
      "worktrees",
      "sidecars",
      "terminalRegistrationAbsence",
      "canonicalCheckoutUnchanged",
      "issues",
    ]) ||
    !new Set(["completed", "failed"]).has(rollback.outcome) ||
    JSON.stringify(rollback.createdResourceInventory) !== JSON.stringify(inventory) ||
    !Array.isArray(rollback.worktrees) ||
    !Array.isArray(rollback.sidecars) ||
    !Array.isArray(rollback.issues) ||
    typeof rollback.canonicalCheckoutUnchanged !== "boolean" ||
    JSON.stringify(value.terminalRegistrationAbsence) !==
      JSON.stringify(rollback.terminalRegistrationAbsence) ||
    !exactKeys(value.completionMarker, ["complete", "result", "stateCreated"]) ||
    value.completionMarker.complete !== true ||
    value.completionMarker.result !== "failed" ||
    value.completionMarker.stateCreated !== false ||
    typeof value.completedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.completedAt) ||
    Number.isNaN(Date.parse(value.completedAt)) ||
    new Date(value.completedAt).toISOString() !== value.completedAt ||
    !isSha256(value.receiptSha256) ||
    value.receiptSha256 !== sha256Bytes(canonicalJsonBytes(preStateFailurePayload(value)))
  ) {
    issues.push("pre-state failure receipt is malformed or contradictory");
  }
  if (
    rollback?.outcome === "completed" &&
    (rollback.issues?.length !== 0 ||
      rollback.canonicalCheckoutUnchanged !== true ||
      rollback.terminalRegistrationAbsence?.proven !== true ||
      (Array.isArray(rollback.worktrees) && rollback.worktrees.some(
        (entry) =>
          entry.physicalPathAbsent !== true || entry.registrationAbsent !== true,
      )) ||
      (Array.isArray(rollback.sidecars) &&
        rollback.sidecars.some((entry) => entry.removed !== true)))
  ) {
    issues.push("pre-state failure receipt overclaims completed rollback");
  }
  if (
    inventory &&
    rollback &&
    (inventory.worktreeCount !== rollback.worktrees?.length ||
      inventory.registrationCount !== inventory.worktreeCount ||
      inventory.sidecarCount !== rollback.sidecars?.length)
  ) {
    issues.push("pre-state failure receipt created-resource inventory is inconsistent");
  }
  const worktreeRoles = rollback?.worktrees?.map((entry) => entry?.role) ?? [];
  const sidecarRoles = rollback?.sidecars?.map((entry) => entry?.role) ?? [];
  if (
    rollback &&
    Array.isArray(rollback.worktrees) &&
    Array.isArray(rollback.sidecars) &&
    (rollback.worktrees.some(
      (entry) =>
        !exactKeys(entry, [
          "role",
          "removed",
          "physicalPathAbsent",
          "registrationAbsent",
        ]) ||
        !CERTIFICATION_WORKTREE_ROLES.includes(entry.role) ||
        typeof entry.removed !== "boolean" ||
        typeof entry.physicalPathAbsent !== "boolean" ||
        typeof entry.registrationAbsent !== "boolean",
    ) ||
      rollback.sidecars.some(
        (entry) =>
          !exactKeys(entry, ["role", "removed"]) ||
          !CERTIFICATION_WORKTREE_ROLES.includes(entry.role) ||
          typeof entry.removed !== "boolean",
      ) ||
      new Set(worktreeRoles).size !== worktreeRoles.length ||
      new Set(sidecarRoles).size !== sidecarRoles.length ||
      !exactKeys(
        rollback.terminalRegistrationAbsence,
        ["proven", "roleResults"],
      ) ||
      typeof rollback.terminalRegistrationAbsence.proven !== "boolean" ||
      !exactKeys(
        rollback.terminalRegistrationAbsence.roleResults,
        worktreeRoles,
      ) ||
      worktreeRoles.some(
        (role) =>
          rollback.terminalRegistrationAbsence.roleResults[role] !==
          rollback.worktrees.find((entry) => entry.role === role)
            ?.registrationAbsent,
      ))
  ) {
    issues.push("pre-state failure receipt rollback inventory is malformed");
  }
  if (
    rollback?.outcome === "failed" &&
    rollback.terminalRegistrationAbsence?.proven === true &&
    rollback.issues?.length === 0
  ) {
    issues.push("pre-state failure receipt cleanup failure is not retained truthfully");
  }
  return issues;
}

export function writeCertificationPreStateFailureReceipt({
  evidenceRoot,
  certificationId,
  candidate,
  harnessSourceSha256,
  invocationNonce,
  originalError,
  rollback,
  completedAt = new Date().toISOString(),
}) {
  const value = sealPreStateFailureReceipt({
    schema: PRODUCTION_CERTIFICATION_PRE_STATE_FAILURE_SCHEMA,
    version: 1,
    certificationId,
    candidate: {
      id: candidate.id,
      commitSha: candidate.commitSha,
      treeSha: candidate.treeSha,
    },
    harness: {
      version: PRODUCTION_CERTIFICATION_HARNESS_VERSION,
      sourceSha256: harnessSourceSha256,
    },
    invocationNonce,
    failure: {
      classification: "PRECONDITION_ORCHESTRATION_FAILURE",
      messageSha256: sha256Bytes(
        originalError instanceof Error ? originalError.message : String(originalError),
      ),
    },
    defectClassifications: [...PRE_STATE_DEFECT_CLASSIFICATIONS],
    stateCreated: false,
    createdResourceInventory: structuredClone(rollback.createdResourceInventory),
    rollback: structuredClone(rollback),
    terminalRegistrationAbsence: structuredClone(
      rollback.terminalRegistrationAbsence,
    ),
    completionMarker: { complete: true, result: "failed", stateCreated: false },
    completedAt,
  });
  const issues = preStateReceiptIssues(value);
  if (issues.length > 0) throw new Error(issues.join("; "));
  const root = physicalDirectory(evidenceRoot, "certification evidence root");
  let directory = root;
  for (const component of ["state-init", "pre-state-failures"]) {
    const next = path.join(directory, component);
    if (!existsSync(next)) mkdirSync(next, { mode: 0o700 });
    directory = physicalDirectory(next, "pre-state failure receipt directory");
    if (!pathInside(root, directory)) {
      throw new Error("pre-state failure receipt directory escapes evidence root");
    }
  }
  const relativePath = [
    "state-init",
    "pre-state-failures",
    `${sha256Bytes(invocationNonce)}.json`,
  ].join("/");
  const filePath = path.join(root, relativePath);
  atomicWriteAbsent(filePath, canonicalJsonBytes(value));
  return Object.freeze({
    receipt: value,
    descriptor: { path: relativePath, sha256: sha256Bytes(canonicalJsonBytes(value)) },
  });
}

export function readCertificationPreStateFailureReceipt({
  evidenceRoot,
  descriptor,
  expectedInvocationNonce = null,
}) {
  if (
    !exactKeys(descriptor, ["path", "sha256"]) ||
    typeof descriptor.path !== "string" ||
    path.isAbsolute(descriptor.path) ||
    path.posix.normalize(descriptor.path) !== descriptor.path ||
    !descriptor.path.startsWith("state-init/pre-state-failures/") ||
    !isSha256(descriptor.sha256)
  ) {
    throw new Error("pre-state failure receipt descriptor is malformed");
  }
  const root = physicalDirectory(evidenceRoot, "certification evidence root");
  const filePath = path.join(root, descriptor.path);
  const metadata = lstatSync(filePath);
  const physical = realpathSync(filePath);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    !pathInside(root, physical)
  ) {
    throw new Error("pre-state failure receipt is not a contained physical file");
  }
  const bytes = readFileSync(physical);
  if (sha256Bytes(bytes) !== descriptor.sha256) {
    throw new Error("pre-state failure receipt hash mismatch");
  }
  const receipt = JSON.parse(bytes.toString("utf8"));
  if (
    !bytes.equals(canonicalJsonBytes(receipt)) ||
    preStateReceiptIssues(receipt).length > 0 ||
    descriptor.path !==
      [
        "state-init",
        "pre-state-failures",
        `${sha256Bytes(receipt.invocationNonce)}.json`,
      ].join("/") ||
    (expectedInvocationNonce !== null &&
      receipt.invocationNonce !== expectedInvocationNonce)
  ) {
    throw new Error("pre-state failure receipt is invalid or stale");
  }
  return Object.freeze(receipt);
}

function readPrivateSidecar(binding, evidenceRoot) {
  const descriptor = binding?.privateSidecar;
  const filePath = physicalPrivateSidecarFile(binding, evidenceRoot);
  const bytes = readFileSync(filePath);
  if (sha256Bytes(bytes) !== descriptor.sha256) {
    throw new Error("stage worktree private sidecar hash mismatch");
  }
  const sidecar = JSON.parse(bytes.toString("utf8"));
  if (
    !bytes.equals(canonicalJsonBytes(sidecar)) ||
    sidecar.schema !== PRODUCTION_CERTIFICATION_WORKTREE_PRIVATE_SCHEMA
  ) {
    throw new Error("stage worktree private sidecar is not canonical or supported");
  }
  return { filePath, sidecar };
}

export function resolveCertificationStageWorktree({
  state,
  evidenceRoot,
  canonicalRoot,
  role,
  phase = "active",
}) {
  validateRole(role);
  const binding = state?.worktrees?.roles?.[role];
  if (!binding || binding.lifecycleStatus !== "active") {
    throw new Error(`certification worktree role is not active: ${role}`);
  }
  const { sidecar } = readPrivateSidecar(binding, evidenceRoot);
  if (
    sidecar.certificationId !== state.certificationId ||
    sidecar.role !== role ||
    sha256Bytes(sidecar.realpath) !== binding.privateRealpathSha256 ||
    sha256Bytes(sidecar.gitCommonDirRealpath) !== binding.gitCommonDirSha256 ||
    sha256Bytes(`${sidecar.filesystem?.device}:${sidecar.filesystem?.inode}`) !==
      binding.filesystemIdentitySha256
  ) {
    throw new Error("stage worktree sidecar belongs to another certification or role");
  }
  const inspection = inspectCertificationStageWorktree({
    repositoryRoot: sidecar.realpath,
    canonicalRoot,
    evidenceRoot,
    role,
    certificationId: state.certificationId,
    candidate: state.candidate,
    phase:
      binding.dependencyStatus === "installed" ||
      (binding.dependencyStatus === undefined &&
        binding.dependencyIdentitySha256 !== null) ||
      phase === "binding"
        ? "active"
        : binding.dependencyStatus === "failed"
          ? "failed"
        : phase,
  });
  for (const name of [
    "candidateCommitSha",
    "candidateTreeSha",
    "gitCommonDirSha256",
    "gitCommonDirFilesystemIdentitySha256",
    "privateRealpathSha256",
    "filesystemIdentitySha256",
    "cleanStateSha256",
  ]) {
    if (inspection.portable[name] !== binding[name]) {
      throw new Error(`stage worktree ${role} binding changed: ${name}`);
    }
  }
  if (
    (binding.dependencyStatus === "installed" ||
      (binding.dependencyStatus === undefined &&
        binding.dependencyIdentitySha256 !== null)) &&
    (inspection.portable.dependencyIdentitySha256 !==
      binding.dependencyIdentitySha256 ||
      (binding.dependencyStatus === undefined &&
        JSON.stringify(inspection.portable.ignoredPathInventory) !==
          JSON.stringify(binding.ignoredPathInventory)))
  ) {
    throw new Error(`stage worktree ${role} dependency or ignored-path identity changed`);
  }
  if (
    binding.dependencyStatus !== undefined &&
    phase !== "binding" &&
    binding.dependencyStatus !== "installed" &&
    inspection.portable.dependencyIdentitySha256 !== null
  ) {
    throw new Error(`stage worktree ${role} contains unbound dependencies`);
  }
  if (
    phase === "pristine" &&
    JSON.stringify(inspection.portable.ignoredPathInventory) !==
      JSON.stringify(binding.ignoredPathInventory)
  ) {
    throw new Error(`stage worktree ${role} ignored-path inventory changed`);
  }
  return { ...inspection, binding };
}

function validationPhase(binding) {
  if (binding?.dependencyStatus === "failed") return "failed";
  if (
    binding?.dependencyStatus === "installed" ||
    (binding?.dependencyStatus === undefined &&
      binding?.dependencyIdentitySha256 !== null)
  ) {
    return "active";
  }
  return "pristine";
}

export function certificationWorktreeValidationMode(state) {
  if (!new Set([2, 3, 4]).has(state?.version)) {
    return "legacy-repository-root";
  }
  const roles = state?.worktrees?.roles;
  if (!exactKeys(roles, CERTIFICATION_WORKTREE_ROLES)) {
    throw new Error(
      "certification validation roots have an incomplete worktree inventory",
    );
  }
  const bindings = CERTIFICATION_WORKTREE_ROLES.map((role) => roles[role]);
  const allActive = bindings.every(
    (binding) =>
      binding?.lifecycleStatus === "active" &&
      binding?.cleanupStatus === "pending",
  );
  if (
    allActive &&
    state.worktrees.cleanup === undefined &&
    state.evidenceFiles?.[CERTIFICATION_WORKTREE_CLEANUP_EVIDENCE_NAME] ===
      undefined
  ) {
    return "state-bound-live-worktrees";
  }
  const allCleaned = bindings.every(
    (binding) =>
      binding?.lifecycleStatus === "cleaned" &&
      binding?.cleanupStatus === "removed",
  );
  if (
    allCleaned &&
    exactKeys(state.worktrees.cleanup, ["path", "sha256"]) &&
    state.worktrees.cleanup.path === "worktrees/cleanup.json" &&
    isSha256(state.worktrees.cleanup.sha256) &&
    JSON.stringify(state.evidenceFiles?.[CERTIFICATION_WORKTREE_CLEANUP_EVIDENCE_NAME]) ===
      JSON.stringify(state.worktrees.cleanup)
  ) {
    return "sealed-evidence";
  }
  throw new Error(
    "certification validation roots have a mixed, incomplete, or unreceipted worktree lifecycle",
  );
}

export function resolveCertificationStateValidationRoots({
  state,
  evidenceRoot,
  canonicalRoot,
  verifyPhysical = true,
}) {
  const sealedOnly = {
    sourceValidationRoot: canonicalRoot,
    artifactRoot: canonicalRoot,
    verifyCurrentSource: false,
    lifecycle: "sealed-evidence",
  };
  const lifecycle = certificationWorktreeValidationMode(state);
  if (lifecycle === "legacy-repository-root") {
    return {
      ...sealedOnly,
      verifyCurrentSource: verifyPhysical,
      lifecycle: "legacy-repository-root",
    };
  }
  if (lifecycle === "sealed-evidence") return sealedOnly;
  const resolveRole = (role) =>
    resolveCertificationStageWorktree({
      state,
      evidenceRoot,
      canonicalRoot,
      role,
      phase: validationPhase(state.worktrees.roles[role]),
    }).root;
  return {
    sourceValidationRoot: resolveRole("source-validation"),
    artifactRoot: resolveRole("final-artifact"),
    verifyCurrentSource: true,
    lifecycle: "state-bound-live-worktrees",
  };
}

export function refreshCertificationStageWorktreeBinding({
  state,
  evidenceRoot,
  canonicalRoot,
  role,
  phase = "active",
}) {
  const current = state?.worktrees?.roles?.[role];
  if (current?.dependencyLifecycleSchema) {
    if (current.dependencyStatus !== "installed") {
      throw new Error(
        `worktree dependency refresh cannot bind lifecycle state: ${role}`,
      );
    }
    const resolved = resolveCertificationStageWorktree({
      state,
      evidenceRoot,
      canonicalRoot,
      role,
      phase,
    });
    return structuredClone(resolved.binding);
  }
  const resolved = resolveCertificationStageWorktree({
    state,
    evidenceRoot,
    canonicalRoot,
    role,
    phase,
  });
  const descriptor = writePrivateSidecar(
    evidenceRoot,
    role,
    resolved.privateSidecar,
  );
  return {
    ...resolved.binding,
    ...resolved.portable,
    privateSidecar: descriptor,
  };
}

export function createInstalledCertificationStageWorktreeBinding({
  state,
  evidenceRoot,
  canonicalRoot,
  role,
  dependencyBindingEvidence,
  dependencyInstallation,
  resolvedWorktree = null,
}) {
  const current = state?.worktrees?.roles?.[role];
  if (
    current?.dependencyLifecycleSchema !==
      PRODUCTION_CERTIFICATION_DEPENDENCY_LIFECYCLE_SCHEMA ||
    current?.dependencyStatus !== "not-installed"
  ) {
    throw new Error(`worktree dependencies cannot be bound from current state: ${role}`);
  }
  const resolved = resolvedWorktree ?? resolveCertificationStageWorktree({
    state,
    evidenceRoot,
    canonicalRoot,
    role,
    phase: "binding",
  });
  if (
    resolved.binding?.privateSidecar?.sha256 !== current.privateSidecar.sha256 ||
    resolved.binding?.privateSidecar?.path !== current.privateSidecar.path
  ) {
    throw new Error(`resolved worktree differs from the bound role: ${role}`);
  }
  if (!isSha256(resolved.portable.dependencyIdentitySha256)) {
    throw new Error(`worktree dependency identity is missing after installation: ${role}`);
  }
  const privateSidecar = writePrivateSidecar(
    evidenceRoot,
    role,
    resolved.privateSidecar,
  );
  return {
    ...current,
    ...resolved.portable,
    dependencyLifecycleSchema:
      PRODUCTION_CERTIFICATION_DEPENDENCY_LIFECYCLE_SCHEMA,
    dependencyStatus: "installed",
    dependencyBindingEvidence: structuredClone(dependencyBindingEvidence),
    dependencyInstallation: structuredClone(dependencyInstallation),
    privateSidecar,
  };
}

export function createFailedCertificationStageWorktreeBinding({
  state,
  evidenceRoot = null,
  role,
  dependencyInstallation,
  resolvedWorktree = null,
}) {
  const current = state?.worktrees?.roles?.[role];
  if (
    current?.dependencyLifecycleSchema !==
      PRODUCTION_CERTIFICATION_DEPENDENCY_LIFECYCLE_SCHEMA ||
    current?.dependencyStatus !== "not-installed"
  ) {
    throw new Error(`worktree dependency failure cannot be recorded: ${role}`);
  }
  const failedInspection = resolvedWorktree
    ? {
        ...resolvedWorktree.portable,
        privateSidecar: writePrivateSidecar(
          evidenceRoot,
          role,
          resolvedWorktree.privateSidecar,
        ),
      }
    : {};
  return {
    ...current,
    ...failedInspection,
    dependencyStatus: "failed",
    dependencyIdentitySha256: null,
    dependencyBindingEvidence: null,
    dependencyInstallation: structuredClone(dependencyInstallation),
  };
}

function dependencyOwnerStage(role) {
  if (role === "source-validation") return "source-validation";
  if (role === "final-artifact") return "build";
  return "browser-owners";
}

function dependencyInstallationChronologyIssues(state, role, binding) {
  if (!binding?.dependencyInstallation) return [];
  const stage = state.stages?.[dependencyOwnerStage(role)];
  const startedAt = binding.dependencyInstallation.startedAt;
  const completedAt = binding.dependencyInstallation.completedAt;
  const owningAttempts = (stage?.attempts ?? []).filter(
    (attempt) =>
      Date.parse(startedAt ?? "") >= Date.parse(attempt.startedAt ?? "") &&
      Date.parse(completedAt ?? "") <=
        Date.parse(attempt.completedAt ?? state.updatedAt ?? ""),
  );
  if (
    owningAttempts.length !== 1 ||
    Date.parse(completedAt ?? "") < Date.parse(startedAt ?? "")
  ) {
    return [
      `${role}: dependency installation interval is outside its owning stage attempt`,
    ];
  }
  return [];
}

function cleanupReceiptDescriptor(evidenceRoot, receipt) {
  const bytes = canonicalJsonBytes(receipt);
  const filePath = path.join(evidenceRoot, "worktrees/cleanup.json");
  atomicWriteAbsent(filePath, bytes);
  return {
    path: "worktrees/cleanup.json",
    sha256: sha256Bytes(bytes),
  };
}

export function readCertificationWorktreeCleanupReceipt({
  state,
  evidenceRoot,
}) {
  const descriptor = state?.worktrees?.cleanup;
  if (
    !exactKeys(descriptor, ["path", "sha256"]) ||
    descriptor.path !== "worktrees/cleanup.json" ||
    !isSha256(descriptor.sha256) ||
    JSON.stringify(
      state?.evidenceFiles?.[CERTIFICATION_WORKTREE_CLEANUP_EVIDENCE_NAME],
    ) !== JSON.stringify(descriptor)
  ) {
    throw new Error("worktree cleanup receipt binding is missing or malformed");
  }
  const physicalEvidenceRoot = physicalDirectory(
    evidenceRoot,
    "certification evidence root",
  );
  const worktreeEvidenceRoot = physicalDirectory(
    path.join(physicalEvidenceRoot, "worktrees"),
    "worktree cleanup receipt parent",
  );
  const filePath = path.join(worktreeEvidenceRoot, "cleanup.json");
  const metadata = lstatSync(filePath);
  const physical = realpathSync(filePath);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    !pathInside(physicalEvidenceRoot, physical)
  ) {
    throw new Error("worktree cleanup receipt is not a contained physical file");
  }
  const bytes = readFileSync(physical);
  if (sha256Bytes(bytes) !== descriptor.sha256) {
    throw new Error("worktree cleanup receipt hash mismatch");
  }
  let receipt;
  try {
    receipt = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("worktree cleanup receipt is not valid JSON");
  }
  if (!bytes.equals(canonicalJsonBytes(receipt))) {
    throw new Error("worktree cleanup receipt is not canonical JSON");
  }
  if (
    !exactKeys(receipt, [
      "schema",
      "owner",
      "canonicalCommand",
      "certificationId",
      "candidate",
      "invocationNonce",
      "invocationNonceSha256",
      "preStateSha256",
      "preStateUpdatedAt",
      "completedAt",
      "preWorktreeRolesSha256",
      "cleanedWorktreeRolesSha256",
      "roles",
      "complete",
    ]) ||
    receipt.schema !== PRODUCTION_CERTIFICATION_WORKTREE_CLEANUP_SCHEMA ||
    receipt.owner !== "worktrees:cleanup" ||
    receipt.canonicalCommand !== "npm run certification:worktrees:cleanup" ||
    receipt.certificationId !== state.certificationId ||
    JSON.stringify(receipt.candidate) !== JSON.stringify({
      id: state.candidate.id,
      commitSha: state.candidate.commitSha,
      treeSha: state.candidate.treeSha,
    }) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(
      receipt.invocationNonce ?? "",
    ) ||
    receipt.invocationNonceSha256 !== sha256Bytes(receipt.invocationNonce) ||
    !isSha256(receipt.preStateSha256) ||
    !isSha256(receipt.preWorktreeRolesSha256) ||
    !isSha256(receipt.cleanedWorktreeRolesSha256) ||
    !isCanonicalUtcTimestamp(receipt.preStateUpdatedAt) ||
    !isCanonicalUtcTimestamp(receipt.completedAt) ||
    Date.parse(receipt.completedAt) < Date.parse(receipt.preStateUpdatedAt) ||
    !exactKeys(receipt.roles, CERTIFICATION_WORKTREE_ROLES) ||
    receipt.complete !== true
  ) {
    throw new Error("worktree cleanup receipt is incomplete or cross-run");
  }
  return Object.freeze({ descriptor, receipt, filePath: physical });
}

function cleanupReceiptRoleIssues(receipt, role, binding) {
  const result = receipt.roles?.[role];
  if (
    !exactKeys(result, [
      "role",
      "privateSidecar",
      "privateRealpathSha256",
      "gitCommonDirSha256",
      "priorLifecycleStatus",
      "priorCleanupStatus",
      "priorDependencyStatus",
      "resultingLifecycleStatus",
      "resultingCleanupStatus",
      "resultingDependencyStatus",
      "physicalPathAbsent",
      "registrationAbsent",
    ]) ||
    result.role !== role ||
    JSON.stringify(result.privateSidecar) !==
      JSON.stringify(binding.privateSidecar) ||
    result.privateRealpathSha256 !== binding.privateRealpathSha256 ||
    result.gitCommonDirSha256 !== binding.gitCommonDirSha256 ||
    result.priorLifecycleStatus !== "active" ||
    result.priorCleanupStatus !== "pending" ||
    !new Set(["installed", null]).has(result.priorDependencyStatus) ||
    result.resultingLifecycleStatus !== "cleaned" ||
    result.resultingCleanupStatus !== "removed" ||
    result.resultingDependencyStatus !==
      (binding.dependencyStatus === undefined ? null : "removed") ||
    result.physicalPathAbsent !== true ||
    result.registrationAbsent !== true
  ) {
    return [`worktree cleanup receipt role binding is invalid: ${role}`];
  }
  return [];
}

export function certificationWorktreeIssues({
  state,
  evidenceRoot,
  canonicalRoot,
  requirePhysical = true,
}) {
  const issues = [];
  if (
    !new Set([
      PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA,
      PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA_V1,
    ]).has(state?.worktrees?.schema) ||
    !exactKeys(state?.worktrees?.roles, CERTIFICATION_WORKTREE_ROLES)
  ) {
    return ["certification stage-worktree binding inventory is missing or malformed"];
  }
  let validationMode = null;
  let cleanupReceipt = null;
  try {
    validationMode = certificationWorktreeValidationMode(state);
    if (validationMode === "sealed-evidence") {
      cleanupReceipt = readCertificationWorktreeCleanupReceipt({
        state,
        evidenceRoot,
      }).receipt;
      if (
        cleanupReceipt.cleanedWorktreeRolesSha256 !==
        worktreeRolesSha256(state.worktrees.roles)
      ) {
        throw new Error("worktree cleanup receipt cleaned-role hash mismatch");
      }
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  const roots = [];
  const dependencyRoots = [];
  const commonDirectoryHashes = [];
  const commonDirectoryFilesystemHashes = [];
  for (const role of CERTIFICATION_WORKTREE_ROLES) {
    const binding = state.worktrees.roles[role];
    if (
      binding?.role !== role ||
      binding?.certificationId !== state.certificationId ||
      binding?.candidateCommitSha !== state.candidate.commitSha ||
      binding?.candidateTreeSha !== state.candidate.treeSha ||
      !isSha256(binding?.gitCommonDirSha256) ||
      !isSha256(binding?.gitCommonDirFilesystemIdentitySha256) ||
      !isSha256(binding?.privateRealpathSha256) ||
      !isSha256(binding?.cleanStateSha256) ||
      !isSha256(binding?.ignoredPathInventory?.sha256) ||
      !Number.isSafeInteger(binding?.ignoredPathInventory?.count) ||
      !new Set(["active", "cleaned"]).has(binding?.lifecycleStatus) ||
      !new Set(["pending", "removed"]).has(binding?.cleanupStatus)
    ) {
      issues.push(`certification worktree binding is malformed: ${role}`);
      continue;
    }
    if (
      !(
        (binding.lifecycleStatus === "active" &&
          binding.cleanupStatus === "pending") ||
        (binding.lifecycleStatus === "cleaned" &&
          binding.cleanupStatus === "removed")
      )
    ) {
      issues.push(
        `certification worktree lifecycle/cleanup status pair is invalid: ${role}`,
      );
    }
    if (state.worktrees.schema === PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA) {
      issues.push(
        ...dependencyLifecycleIssues(binding, {
          active: binding.lifecycleStatus === "active",
        }).map((issue) => `${role}: ${issue}`),
        ...dependencyInstallationChronologyIssues(state, role, binding),
      );
    }
    try {
      const { sidecar } = readPrivateSidecar(binding, evidenceRoot);
      if (
        sidecar.certificationId !== state.certificationId ||
        sidecar.role !== role ||
        sha256Bytes(sidecar.realpath) !== binding.privateRealpathSha256 ||
        sha256Bytes(sidecar.gitCommonDirRealpath) !== binding.gitCommonDirSha256 ||
        sha256Bytes(`${sidecar.filesystem?.device}:${sidecar.filesystem?.inode}`) !==
          binding.filesystemIdentitySha256
      ) {
        throw new Error("private identity is cross-certification or cross-role");
      }
      if (
        !path.isAbsolute(sidecar.realpath) ||
        path.basename(sidecar.realpath) !== ROLE_DIRECTORY[role] ||
        path.basename(path.dirname(sidecar.realpath)) !== state.certificationId ||
        pathInside(canonicalRoot, sidecar.realpath) ||
        pathInside(evidenceRoot, sidecar.realpath)
      ) {
        throw new Error("private worktree root ownership is unsafe or contradictory");
      }
      roots.push(sidecar.realpath);
      commonDirectoryHashes.push(binding.gitCommonDirSha256);
      commonDirectoryFilesystemHashes.push(
        binding.gitCommonDirFilesystemIdentitySha256,
      );
      if (sidecar.dependency?.realpath) dependencyRoots.push(sidecar.dependency.realpath);
      if (binding.lifecycleStatus === "active" && requirePhysical) {
        const resolved = resolveCertificationStageWorktree({
          state,
          evidenceRoot,
          canonicalRoot,
          role,
          phase:
            binding.dependencyStatus === "failed"
              ? "failed"
              : binding.dependencyStatus === "installed" ||
            (binding.dependencyStatus === undefined &&
              binding.dependencyIdentitySha256 !== null)
              ? "active"
              : "pristine",
        });
        if (
          state.worktrees.schema === PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA &&
          binding.dependencyStatus === "installed"
        ) {
          const retained =
            readAndValidateCertificationDependencyBindingEvidence({
              evidenceRoot,
              descriptor: binding.dependencyBindingEvidence,
              state,
              role,
              repositoryRoot: resolved.root,
              remeasure: true,
            });
          if (!retained.validation.valid) {
            throw new Error(retained.validation.issues.join("; "));
          }
          const installation = binding.dependencyInstallation;
          if (
            retained.evidence.dependencyIdentitySha256 !==
              binding.dependencyIdentitySha256 ||
            retained.evidence.aggregateEvidenceSha256 !==
              installation?.aggregateEvidenceSha256 ||
            retained.evidence.installationStartedAt !==
              installation?.startedAt ||
            retained.evidence.installationCompletedAt !==
              installation?.completedAt ||
            retained.evidence.child?.exitCode !== installation?.exitCode ||
            retained.evidence.child?.signal !== installation?.signal
          ) {
            throw new Error(
              "dependency lifecycle state contradicts its sealed binding evidence",
            );
          }
        }
        if (
          state.worktrees.schema === PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA &&
          binding.dependencyStatus === "failed"
        ) {
          if (binding.dependencyInstallation?.result === "binding-failed") {
            const retained =
              readAndValidateCertificationDependencyBindingEvidence({
                evidenceRoot,
                descriptor: binding.dependencyInstallation.bindingEvidence,
                state,
                role,
                repositoryRoot: resolved.root,
                remeasure: false,
              });
            if (
              !retained.validation.valid ||
              retained.evidence.installationStartedAt !==
                binding.dependencyInstallation.startedAt ||
              retained.evidence.installationCompletedAt !==
                binding.dependencyInstallation.completedAt ||
              retained.evidence.child?.exitCode !==
                binding.dependencyInstallation.exitCode ||
              retained.evidence.child?.signal !==
                binding.dependencyInstallation.signal ||
              retained.evidence.child?.spawnError !==
                binding.dependencyInstallation.spawnError ||
              JSON.stringify(retained.evidence.installationEvidence) !==
                JSON.stringify(binding.dependencyInstallation.evidence)
            ) {
              throw new Error(
                "failed dependency binding state contradicts its sealed evidence",
              );
            }
          } else {
          const retained =
            readAndValidateCertificationDependencyInstallationEvidence({
              evidenceRoot,
              descriptor: binding.dependencyInstallation?.evidence,
              state,
              role,
              expectedResult: [
                "failed",
                "measurement-failed",
                "wrapper-failed",
              ],
            });
          const retainedProcess =
            retained.evidence.completionMarker?.result === "wrapper-failed"
              ? retained.evidence.dispatch
              : retained.evidence.child;
          if (!retained.validation.valid) {
            throw new Error(retained.validation.issues.join("; "));
          }
          if (
            retained.evidence.installationStartedAt !==
              binding.dependencyInstallation?.startedAt ||
            retained.evidence.installationCompletedAt !==
              binding.dependencyInstallation?.completedAt ||
            retainedProcess?.exitCode !==
              binding.dependencyInstallation?.exitCode ||
            retainedProcess?.signal !==
              binding.dependencyInstallation?.signal ||
            retainedProcess?.spawnError !==
              binding.dependencyInstallation?.spawnError ||
            retained.evidence.completionMarker?.result !==
              binding.dependencyInstallation?.result
          ) {
            throw new Error(
              "failed dependency lifecycle state contradicts its sealed installation evidence",
            );
          }
          }
        }
      } else if (
        binding.lifecycleStatus === "cleaned" &&
        (binding.cleanupStatus !== "removed" ||
          formerWorktreePathPresent(sidecar.realpath) ||
          registrationPresent(canonicalRoot, sidecar.realpath))
      ) {
        throw new Error(
          "cleaned worktree still exists, remains registered, or lacks removed status",
        );
      }
      if (cleanupReceipt) {
        issues.push(...cleanupReceiptRoleIssues(cleanupReceipt, role, binding));
      }
      if (
        state.worktrees.schema === PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA &&
        binding.lifecycleStatus === "cleaned"
      ) {
        if (binding.dependencyBindingEvidence !== null) {
          const retained =
            readAndValidateCertificationDependencyBindingEvidence({
              evidenceRoot,
              descriptor: binding.dependencyBindingEvidence,
              state,
              role,
              repositoryRoot: canonicalRoot,
              remeasure: false,
            });
          if (!retained.validation.valid) {
            throw new Error(retained.validation.issues.join("; "));
          }
          if (
            retained.evidence.dependencyIdentitySha256 !==
              binding.dependencyIdentitySha256 ||
            retained.evidence.aggregateEvidenceSha256 !==
              binding.dependencyInstallation?.aggregateEvidenceSha256 ||
            retained.evidence.installationStartedAt !==
              binding.dependencyInstallation?.startedAt ||
            retained.evidence.installationCompletedAt !==
              binding.dependencyInstallation?.completedAt ||
            retained.evidence.child?.exitCode !==
              binding.dependencyInstallation?.exitCode ||
            retained.evidence.child?.signal !==
              binding.dependencyInstallation?.signal ||
            retained.evidence.child?.spawnError !==
              binding.dependencyInstallation?.spawnError ||
            binding.dependencyInstallation?.result !== "succeeded"
          ) {
            throw new Error(
              "removed dependency lifecycle state contradicts its sealed binding evidence",
            );
          }
        } else if (binding.dependencyInstallation !== null) {
          const retained =
            readAndValidateCertificationDependencyInstallationEvidence({
              evidenceRoot,
              descriptor: binding.dependencyInstallation.evidence,
              state,
              role,
              expectedResult: [
                "failed",
                "measurement-failed",
                "wrapper-failed",
              ],
            });
          const retainedProcess =
            retained.evidence.completionMarker?.result === "wrapper-failed"
              ? retained.evidence.dispatch
              : retained.evidence.child;
          if (
            !retained.validation.valid ||
            retained.evidence.installationStartedAt !==
              binding.dependencyInstallation.startedAt ||
            retained.evidence.installationCompletedAt !==
              binding.dependencyInstallation.completedAt ||
            retainedProcess?.exitCode !==
              binding.dependencyInstallation.exitCode ||
            retainedProcess?.signal !==
              binding.dependencyInstallation.signal ||
            retainedProcess?.spawnError !==
              binding.dependencyInstallation.spawnError ||
            retained.evidence.completionMarker?.result !==
              binding.dependencyInstallation.result
          ) {
            throw new Error(
              "removed failed dependency lifecycle evidence is invalid or contradictory",
            );
          }
        }
      }
    } catch (error) {
      issues.push(
        `certification worktree ${role} is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (new Set(roots.map((value) => path.resolve(value))).size !== roots.length) {
    issues.push("certification stage-worktree roles alias the same realpath");
  }
  if (
    new Set(commonDirectoryHashes).size !== 1 ||
    new Set(commonDirectoryFilesystemHashes).size !== 1
  ) {
    issues.push("certification stage worktrees do not share one Git common directory");
  } else if (requirePhysical) {
    try {
      const canonicalCommon = commonDirectoryIdentity(canonicalRoot);
      if (
        commonDirectoryHashes.some((digest) => digest !== canonicalCommon.sha256) ||
        commonDirectoryFilesystemHashes.some(
          (digest) => digest !== canonicalCommon.filesystemIdentitySha256,
        )
      ) {
        issues.push(
          "certification stage worktrees do not share the canonical Git common directory",
        );
      }
    } catch (error) {
      issues.push(
        `canonical Git common-directory identity is unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (
    new Set(dependencyRoots.map((value) => path.resolve(value))).size !==
    dependencyRoots.length
  ) {
    issues.push("certification stage worktrees share or alias node_modules");
  }
  if (
    validationMode === "sealed-evidence" &&
    cleanupReceipt?.preWorktreeRolesSha256 ===
      cleanupReceipt?.cleanedWorktreeRolesSha256
  ) {
    issues.push("worktree cleanup receipt does not prove a lifecycle transition");
  }
  return issues;
}

export function cleanupCertificationStageWorktrees({
  state,
  evidenceRoot,
  canonicalRoot,
  preStateSha256,
  completedAt,
  invocationNonce,
}) {
  if (
    state.stages?.continuity?.status !== "passed" ||
    state.stages?.["integration-ready"]?.status !== "passed"
  ) {
    throw new Error(
      "stage worktrees cannot be removed before continuity and integration readiness pass",
    );
  }
  if (
    !isSha256(preStateSha256) ||
    !isCanonicalUtcTimestamp(completedAt) ||
    Date.parse(completedAt) < Date.parse(state.updatedAt ?? "") ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(invocationNonce ?? "")
  ) {
    throw new Error("worktree cleanup transition identity is malformed");
  }
  if (certificationWorktreeValidationMode(state) !== "state-bound-live-worktrees") {
    throw new Error("stage worktrees are not in the exact active cleanup predecessor state");
  }
  const preWorktreeRolesSha256 = worktreeRolesSha256(state.worktrees.roles);
  const roles = structuredClone(state.worktrees.roles);
  const roleResults = {};
  for (const role of CERTIFICATION_WORKTREE_ROLES) {
    const binding = roles[role];
    const { sidecar } = readPrivateSidecar(binding, evidenceRoot);
    if (
      !path.isAbsolute(sidecar.realpath) ||
      path.basename(sidecar.realpath) !== ROLE_DIRECTORY[role] ||
      path.basename(path.dirname(sidecar.realpath)) !== state.certificationId ||
      pathInside(canonicalRoot, sidecar.realpath) ||
      pathInside(evidenceRoot, sidecar.realpath)
    ) {
      throw new Error("cleanup target is not a task-owned certification worktree");
    }
    if (binding.lifecycleStatus === "active") {
      if (existsSync(sidecar.realpath)) {
        resolveCertificationStageWorktree({
          state,
          evidenceRoot,
          canonicalRoot,
          role,
          phase: "active",
        });
        git(canonicalRoot, ["worktree", "remove", "--force", sidecar.realpath]);
      } else {
        git(canonicalRoot, ["worktree", "remove", "--force", sidecar.realpath], {
          allowFailure: true,
        });
      }
    }
    const descriptor = writePrivateSidecar(evidenceRoot, role, sidecar);
    roles[role] = {
      ...binding,
      lifecycleStatus: "cleaned",
      cleanupStatus: "removed",
      ...(binding.dependencyLifecycleSchema
        ? { dependencyStatus: "removed" }
        : {}),
      privateSidecar: descriptor,
    };
    const physicalPathAbsent = !existsSync(sidecar.realpath);
    const registrationAbsent = !registrationPresent(
      canonicalRoot,
      sidecar.realpath,
    );
    if (!physicalPathAbsent || !registrationAbsent) {
      throw new Error(
        `worktree cleanup absence proof is incomplete: ${role}`,
      );
    }
    roleResults[role] = {
      role,
      privateSidecar: descriptor,
      privateRealpathSha256: binding.privateRealpathSha256,
      gitCommonDirSha256: binding.gitCommonDirSha256,
      priorLifecycleStatus: binding.lifecycleStatus,
      priorCleanupStatus: binding.cleanupStatus,
      priorDependencyStatus: binding.dependencyStatus ?? null,
      resultingLifecycleStatus: roles[role].lifecycleStatus,
      resultingCleanupStatus: roles[role].cleanupStatus,
      resultingDependencyStatus: roles[role].dependencyStatus ?? null,
      physicalPathAbsent,
      registrationAbsent,
    };
  }
  const receipt = {
    schema: PRODUCTION_CERTIFICATION_WORKTREE_CLEANUP_SCHEMA,
    owner: "worktrees:cleanup",
    canonicalCommand: "npm run certification:worktrees:cleanup",
    certificationId: state.certificationId,
    candidate: {
      id: state.candidate.id,
      commitSha: state.candidate.commitSha,
      treeSha: state.candidate.treeSha,
    },
    invocationNonce,
    invocationNonceSha256: sha256Bytes(invocationNonce),
    preStateSha256,
    preStateUpdatedAt: state.updatedAt,
    completedAt,
    preWorktreeRolesSha256,
    cleanedWorktreeRolesSha256: worktreeRolesSha256(roles),
    roles: roleResults,
    complete: true,
  };
  const cleanup = cleanupReceiptDescriptor(evidenceRoot, receipt);
  return { schema: state.worktrees.schema, roles, cleanup };
}
