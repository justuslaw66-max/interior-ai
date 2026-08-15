import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  statfsSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  canonicalJsonBytes,
  isCandidateId,
  isSha256,
  isSourceSha,
  sha256Bytes,
} from "./production-certification-contract.mjs";

export const CERTIFICATION_WORKTREE_ROOT_ENV = "CERTIFICATION_WORKTREE_ROOT";
export const PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA =
  "interior-ai.production-certification-worktrees.v1";
export const PRODUCTION_CERTIFICATION_WORKTREE_PRIVATE_SCHEMA =
  "interior-ai.production-certification-worktree-private.v1";
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

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
}

function git(repositoryRoot, args, { allowFailure = false, trim = true } = {}) {
  const child = spawnSync("git", args, {
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
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    throw error;
  }
}

function normalizedInventory(values) {
  const paths = [...values].sort();
  return {
    count: paths.length,
    sha256: sha256Bytes(paths.map((value) => `${value}\n`).join("")),
  };
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

function ignoredPathAllowed(role, relativePath, phase) {
  if (phase === "pristine") return false;
  return ROLE_ALLOWED_IGNORED_ROOTS[role].some(
    (root) => relativePath === root || relativePath.startsWith(`${root}/`),
  );
}

function dependencyIdentity(repositoryRoot) {
  const dependencyRoot = path.join(repositoryRoot, "node_modules");
  if (!existsSync(dependencyRoot)) return null;
  const metadata = lstatSync(dependencyRoot);
  const physicalRoot = realpathSync(dependencyRoot);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    !pathInside(repositoryRoot, physicalRoot)
  ) {
    throw new Error("stage worktree node_modules must be a physical local directory");
  }
  const installedLockPath = path.join(dependencyRoot, ".package-lock.json");
  if (!existsSync(installedLockPath) || !lstatSync(installedLockPath).isFile()) {
    throw new Error("stage worktree node_modules is missing its physical installed-lock identity");
  }
  const rootStat = statSync(dependencyRoot);
  const packageLockPath = path.join(repositoryRoot, "package-lock.json");
  const payload = {
    packageLockSha256: sha256Bytes(readFileSync(packageLockPath)),
    installedLockSha256: sha256Bytes(readFileSync(installedLockPath)),
    physicalRootSha256: sha256Bytes(physicalRoot),
    filesystemIdentitySha256: sha256Bytes(`${rootStat.dev}:${rootStat.ino}`),
  };
  return {
    ...payload,
    identitySha256: sha256Bytes(canonicalJsonBytes(payload)),
    private: { realpath: physicalRoot, device: rootStat.dev, inode: rootStat.ino },
  };
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
  mkdirSync(worktreeRoot, { recursive: true, mode: 0o700 });
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
  const dependency = dependencyIdentity(root);
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

function writePrivateSidecar(evidenceRoot, role, sidecar) {
  const bytes = canonicalJsonBytes(sidecar);
  const digest = sha256Bytes(bytes);
  const filePath = path.join(
    evidenceRoot,
    "worktrees",
    "private",
    role,
    `${digest}.json`,
  );
  if (!existsSync(filePath)) atomicWrite(filePath, bytes);
  return {
    path: path.relative(evidenceRoot, filePath).split(path.sep).join("/"),
    sha256: digest,
  };
}

function bindingFromInspection(inspection, descriptor, createdAt) {
  return {
    ...inspection.portable,
    creationEvent: { owner: "state:init", createdAt },
    lifecycleStatus: "active",
    cleanupStatus: "pending",
    privateSidecar: descriptor,
  };
}

export function createCertificationStageWorktrees({
  canonicalRoot,
  evidenceRoot,
  worktreeRoot,
  certificationId,
  candidate,
  createdAt,
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
  mkdirSync(plan.certificationRoot, { mode: 0o700 });
  const created = [];
  try {
    for (const role of CERTIFICATION_WORKTREE_ROLES) {
      const target = plan.roles[role];
      git(plan.canonicalRoot, [
        "worktree",
        "add",
        "--detach",
        target,
        candidate.commitSha,
      ]);
      created.push(target);
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
      );
      roles[role] = bindingFromInspection(inspections[role], descriptor, createdAt);
    }
    return {
      schema: PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA,
      roles,
    };
  } catch (error) {
    for (const target of created.reverse()) {
      git(plan.canonicalRoot, ["worktree", "remove", "--force", target], {
        allowFailure: true,
      });
    }
    throw error;
  }
}

function readPrivateSidecar(binding, evidenceRoot) {
  const descriptor = binding?.privateSidecar;
  if (
    !exactKeys(descriptor, ["path", "sha256"]) ||
    typeof descriptor.path !== "string" ||
    path.isAbsolute(descriptor.path) ||
    path.normalize(descriptor.path) !== descriptor.path ||
    !isSha256(descriptor.sha256)
  ) {
    throw new Error("stage worktree private sidecar descriptor is malformed");
  }
  const filePath = path.resolve(evidenceRoot, descriptor.path);
  if (!pathInside(evidenceRoot, filePath) || !lstatSync(filePath).isFile()) {
    throw new Error("stage worktree private sidecar escapes the evidence root");
  }
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
    phase,
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
    binding.dependencyIdentitySha256 !== null &&
    (inspection.portable.dependencyIdentitySha256 !==
      binding.dependencyIdentitySha256 ||
      JSON.stringify(inspection.portable.ignoredPathInventory) !==
        JSON.stringify(binding.ignoredPathInventory))
  ) {
    throw new Error(`stage worktree ${role} dependency or ignored-path identity changed`);
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

export function refreshCertificationStageWorktreeBinding({
  state,
  evidenceRoot,
  canonicalRoot,
  role,
  phase = "active",
}) {
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

export function certificationWorktreeIssues({
  state,
  evidenceRoot,
  canonicalRoot,
  requirePhysical = true,
}) {
  const issues = [];
  if (
    state?.worktrees?.schema !== PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA ||
    !exactKeys(state?.worktrees?.roles, CERTIFICATION_WORKTREE_ROLES)
  ) {
    return ["certification stage-worktree binding inventory is missing or malformed"];
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
      roots.push(sidecar.realpath);
      commonDirectoryHashes.push(binding.gitCommonDirSha256);
      commonDirectoryFilesystemHashes.push(
        binding.gitCommonDirFilesystemIdentitySha256,
      );
      if (sidecar.dependency?.realpath) dependencyRoots.push(sidecar.dependency.realpath);
      if (binding.lifecycleStatus === "active" && requirePhysical) {
        resolveCertificationStageWorktree({
          state,
          evidenceRoot,
          canonicalRoot,
          role,
          phase:
            binding.dependencyIdentitySha256 === null
              ? "pristine"
              : "active",
        });
      } else if (
        binding.lifecycleStatus === "cleaned" &&
        (binding.cleanupStatus !== "removed" || existsSync(sidecar.realpath))
      ) {
        throw new Error("cleaned worktree still exists or lacks removed status");
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
  return issues;
}

export function cleanupCertificationStageWorktrees({
  state,
  evidenceRoot,
  canonicalRoot,
}) {
  if (state.stages?.continuity?.status !== "passed") {
    throw new Error("stage worktrees cannot be removed before continuity passes");
  }
  const roles = structuredClone(state.worktrees.roles);
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
      privateSidecar: descriptor,
    };
  }
  return { schema: PRODUCTION_CERTIFICATION_WORKTREE_SCHEMA, roles };
}
