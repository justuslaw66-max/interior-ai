import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const AUTH_PREFLIGHT_WORKTREE_SCHEMA =
  "interior-ai.auth-preflight-worktree-lifecycle.v1";
export const NEXT_GENERATED_TSCONFIG_INCLUDE =
  ".next/dev/dev/types/**/*.ts";

const TASK_ROOT_PREFIX = "ci-auth-preflight-worktree-";
const GIT_OBJECT_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(repositoryRoot, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (
    !allowFailure &&
    (result.error || result.signal || result.status !== 0)
  ) {
    throw new Error("Auth preflight worktree Git owner failed closed");
  }
  return result;
}

function gitText(repositoryRoot, args) {
  return git(repositoryRoot, args).stdout.trim();
}

function safePathInventory(raw) {
  return raw.split("\0").filter(Boolean).sort();
}

function registeredWorktrees(repositoryRoot) {
  return gitText(repositoryRoot, ["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

function cleanSourceSnapshot({
  repositoryRoot,
  candidateCommitSha,
  candidateTreeSha,
}) {
  const head = gitText(repositoryRoot, ["rev-parse", "HEAD"]);
  const tree = gitText(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
  const trackedStatus = git(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]).stdout;
  const trackedIgnored = git(repositoryRoot, [
    "ls-files",
    "-ci",
    "--exclude-standard",
    "-z",
  ]).stdout;
  const index = git(repositoryRoot, ["ls-files", "-s", "-z"]).stdout;
  const diffFiles = git(repositoryRoot, [
    "diff-files",
    "--quiet",
    "--ignore-submodules=none",
  ], { allowFailure: true });
  const diffIndex = git(repositoryRoot, [
    "diff-index",
    "--cached",
    "--quiet",
    "HEAD",
    "--",
  ], { allowFailure: true });
  if (
    head !== candidateCommitSha ||
    tree !== candidateTreeSha ||
    trackedStatus !== "" ||
    trackedIgnored !== "" ||
    diffFiles.status !== 0 ||
    diffIndex.status !== 0
  ) {
    throw new Error(
      "Auth preflight requires an exact clean committed source root",
    );
  }
  const identity = {
    candidateCommitSha: head,
    candidateTreeSha: tree,
    trackedStatusSha256: sha256(trackedStatus),
    trackedIndexSha256: sha256(index),
    trackedIgnoredSha256: sha256(trackedIgnored),
  };
  return Object.freeze({
    ...identity,
    cleanStateSha256: sha256(JSON.stringify(identity)),
  });
}

function expectedGeneratedTsconfig(preBytes) {
  const parsed = JSON.parse(preBytes.toString("utf8"));
  if (!Array.isArray(parsed.include)) {
    throw new Error("Auth preflight tsconfig include contract is malformed");
  }
  if (parsed.include.includes(NEXT_GENERATED_TSCONFIG_INCLUDE)) {
    throw new Error("Auth preflight tsconfig already contains generated dev output");
  }
  parsed.include.push(NEXT_GENERATED_TSCONFIG_INCLUDE);
  return Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`);
}

function assertRegularFile(filePath, label) {
  const metadata = lstatSync(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a physical regular file`);
  }
}

function removeOwnedWorktree(workspace) {
  const taskRootParent = realpathSync(path.dirname(workspace.taskRoot));
  if (
    taskRootParent !== realpathSync(tmpdir()) ||
    !path.basename(workspace.taskRoot).startsWith(TASK_ROOT_PREFIX) ||
    path.dirname(workspace.worktreeRoot) !== workspace.taskRoot
  ) {
    throw new Error("Auth preflight worktree cleanup ownership is invalid");
  }
  if (!registeredWorktrees(workspace.repositoryRoot).includes(workspace.worktreeRoot)) {
    throw new Error("Auth preflight worktree registration disappeared before cleanup");
  }
  const removal = git(
    workspace.repositoryRoot,
    ["worktree", "remove", "--force", workspace.worktreeRoot],
    { allowFailure: true },
  );
  if (removal.error || removal.signal || removal.status !== 0) {
    throw new Error("Auth preflight task-owned worktree cleanup failed");
  }
  rmSync(workspace.taskRoot, { recursive: true, force: true });
  if (registeredWorktrees(workspace.repositoryRoot).includes(workspace.worktreeRoot)) {
    throw new Error("Auth preflight worktree registration remains after cleanup");
  }
}

export function createAuthPreflightWorktree({
  repositoryRoot = process.cwd(),
  candidateCommitSha,
  candidateTreeSha,
  fixtureSessionIdentitySha256,
}) {
  if (
    !GIT_OBJECT_PATTERN.test(candidateCommitSha) ||
    !GIT_OBJECT_PATTERN.test(candidateTreeSha) ||
    !SHA256_PATTERN.test(fixtureSessionIdentitySha256)
  ) {
    throw new Error("Auth preflight worktree identity is malformed");
  }
  const resolvedRepositoryRoot = realpathSync(repositoryRoot);
  const sourceBefore = cleanSourceSnapshot({
    repositoryRoot: resolvedRepositoryRoot,
    candidateCommitSha,
    candidateTreeSha,
  });
  const sourceNodeModules = path.join(resolvedRepositoryRoot, "node_modules");
  const nodeModulesMetadata = lstatSync(sourceNodeModules);
  if (!nodeModulesMetadata.isDirectory() || nodeModulesMetadata.isSymbolicLink()) {
    throw new Error("Auth preflight requires physical source dependencies");
  }
  const taskRoot = realpathSync(
    mkdtempSync(path.join(tmpdir(), TASK_ROOT_PREFIX)),
  );
  chmodSync(taskRoot, 0o700);
  const worktreeRoot = path.join(taskRoot, "exact-head");
  let registered = false;
  try {
    git(resolvedRepositoryRoot, [
      "worktree",
      "add",
      "--detach",
      worktreeRoot,
      candidateCommitSha,
    ]);
    registered = true;
    if (
      gitText(worktreeRoot, ["rev-parse", "HEAD"]) !== candidateCommitSha ||
      gitText(worktreeRoot, ["rev-parse", "HEAD^{tree}"]) !== candidateTreeSha ||
      gitText(worktreeRoot, ["branch", "--show-current"]) !== ""
    ) {
      throw new Error("Auth preflight worktree is not detached exact-head source");
    }
    symlinkSync(sourceNodeModules, path.join(worktreeRoot, "node_modules"), "dir");
    const tsconfigPath = path.join(worktreeRoot, "tsconfig.json");
    assertRegularFile(tsconfigPath, "Auth preflight tsconfig");
    const tsconfigPreBytes = readFileSync(tsconfigPath);
    const tsconfigPreBlob = gitText(worktreeRoot, [
      "rev-parse",
      "HEAD:tsconfig.json",
    ]);
    const expectedPostBytes = expectedGeneratedTsconfig(tsconfigPreBytes);
    return {
      schema: AUTH_PREFLIGHT_WORKTREE_SCHEMA,
      repositoryRoot: resolvedRepositoryRoot,
      taskRoot,
      worktreeRoot,
      candidateCommitSha,
      candidateTreeSha,
      fixtureSessionIdentitySha256,
      sourceBefore,
      tsconfigPreBytes,
      tsconfigPreBlob,
      expectedPostBytes,
      pathIdentitySha256: sha256(worktreeRoot),
    };
  } catch (error) {
    if (registered) {
      git(
        resolvedRepositoryRoot,
        ["worktree", "remove", "--force", worktreeRoot],
        { allowFailure: true },
      );
    }
    rmSync(taskRoot, { recursive: true, force: true });
    throw error;
  }
}

function rejectedWorkspaceEvidence(evidence) {
  const error = new Error(
    "Auth preflight worktree generated-output lifecycle failed closed",
  );
  error.code = "AUTH_PREFLIGHT_WORKTREE_OUTPUT_REJECTED";
  error.safeEvidence = evidence;
  return error;
}

export function inspectAuthPreflightWorktree(workspace) {
  if (workspace.inspectionEvidence) {
    if (workspace.inspectionEvidence.trackedOutput.issues.length > 0) {
      throw rejectedWorkspaceEvidence(workspace.inspectionEvidence);
    }
    return workspace.inspectionEvidence;
  }
  const issues = [];
  let evidence = null;
  try {
    const sourceDuring = cleanSourceSnapshot({
      repositoryRoot: workspace.repositoryRoot,
      candidateCommitSha: workspace.candidateCommitSha,
      candidateTreeSha: workspace.candidateTreeSha,
    });
    const trackedStatus = git(workspace.worktreeRoot, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ]).stdout;
    const changedPaths = safePathInventory(
      git(workspace.worktreeRoot, [
        "diff",
        "--name-only",
        "-z",
        "HEAD",
        "--",
      ]).stdout,
    );
    const stagedPaths = safePathInventory(
      git(workspace.worktreeRoot, [
        "diff",
        "--cached",
        "--name-only",
        "-z",
        "HEAD",
        "--",
      ]).stdout,
    );
    const ordinaryUntrackedPaths = safePathInventory(
      git(workspace.worktreeRoot, [
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
      ]).stdout,
    );
    const tsconfigPath = path.join(workspace.worktreeRoot, "tsconfig.json");
    let tsconfigPostBytes = Buffer.alloc(0);
    try {
      assertRegularFile(tsconfigPath, "Auth preflight terminal tsconfig");
      tsconfigPostBytes = readFileSync(tsconfigPath);
    } catch {
      issues.push("tsconfig-type");
    }
    if (stagedPaths.length > 0) issues.push("staged-paths");
    if (ordinaryUntrackedPaths.length > 0) issues.push("ordinary-untracked-paths");
    if (
      changedPaths.length > 1 ||
      (changedPaths.length === 1 && changedPaths[0] !== "tsconfig.json")
    ) {
      issues.push("unexpected-tracked-paths");
    }
    let mutationClassification = "absent";
    if (changedPaths.length === 0) {
      if (!tsconfigPostBytes.equals(workspace.tsconfigPreBytes)) {
        issues.push("unreported-tsconfig-change");
      }
    } else if (changedPaths[0] === "tsconfig.json") {
      mutationClassification = "deterministic-next-generated";
      if (!tsconfigPostBytes.equals(workspace.expectedPostBytes)) {
        issues.push("unexpected-tsconfig-mutation");
      }
    }
    evidence = {
      schema: AUTH_PREFLIGHT_WORKTREE_SCHEMA,
      owner: "scripts/ci-auth-preflight-worktree.mjs",
      classification: "AUTH_PREFLIGHT_EXACT_HEAD_DISPOSABLE_WORKTREE",
      candidateCommitSha: workspace.candidateCommitSha,
      candidateTreeSha: workspace.candidateTreeSha,
      fixtureSessionIdentitySha256: workspace.fixtureSessionIdentitySha256,
      pathIdentitySha256: workspace.pathIdentitySha256,
      exactHeadDetached: true,
      sourceRoot: {
        beforeCleanStateSha256: workspace.sourceBefore.cleanStateSha256,
        duringCleanStateSha256: sourceDuring.cleanStateSha256,
        byteIdenticalBeforeAndDuring:
          workspace.sourceBefore.cleanStateSha256 === sourceDuring.cleanStateSha256,
      },
      trackedOutput: {
        preTrackedStatusSha256: sha256(""),
        postTrackedStatusSha256: sha256(trackedStatus),
        changedPaths,
        changedPathCount: changedPaths.length,
        stagedPathCount: stagedPaths.length,
        ordinaryUntrackedPathCount: ordinaryUntrackedPaths.length,
        mutationClassification,
        expectedGeneratedInclude: NEXT_GENERATED_TSCONFIG_INCLUDE,
        tsconfigPreBlob: workspace.tsconfigPreBlob,
        tsconfigPreSha256: sha256(workspace.tsconfigPreBytes),
        tsconfigPostSha256: sha256(tsconfigPostBytes),
        expectedGeneratedSha256: sha256(workspace.expectedPostBytes),
        unexpectedTrackedPathCount:
          changedPaths.filter((entry) => entry !== "tsconfig.json").length,
        issues,
      },
      cleanup: {
        owner: "scripts/ci-auth-preflight-worktree.mjs",
        method: "git-worktree-remove-force-exact-task-owned-path",
        worktreeRemoved: false,
        registrationAbsent: false,
        sourceByteIdenticalAfterCleanup: false,
        completed: false,
      },
    };
  } catch {
    issues.push("terminal-inspection-failure");
    if (!evidence) {
      evidence = {
        schema: AUTH_PREFLIGHT_WORKTREE_SCHEMA,
        owner: "scripts/ci-auth-preflight-worktree.mjs",
        classification: "AUTH_PREFLIGHT_EXACT_HEAD_DISPOSABLE_WORKTREE",
        candidateCommitSha: workspace.candidateCommitSha,
        candidateTreeSha: workspace.candidateTreeSha,
        fixtureSessionIdentitySha256: workspace.fixtureSessionIdentitySha256,
        pathIdentitySha256: workspace.pathIdentitySha256,
        exactHeadDetached: true,
        sourceRoot: {
          beforeCleanStateSha256: workspace.sourceBefore.cleanStateSha256,
          duringCleanStateSha256: null,
          byteIdenticalBeforeAndDuring: false,
        },
        trackedOutput: {
          preTrackedStatusSha256: sha256(""),
          postTrackedStatusSha256: sha256(""),
          changedPaths: [],
          changedPathCount: 0,
          stagedPathCount: 0,
          ordinaryUntrackedPathCount: 0,
          mutationClassification: "inspection-failed",
          expectedGeneratedInclude: NEXT_GENERATED_TSCONFIG_INCLUDE,
          tsconfigPreBlob: workspace.tsconfigPreBlob,
          tsconfigPreSha256: sha256(workspace.tsconfigPreBytes),
          tsconfigPostSha256: sha256(""),
          expectedGeneratedSha256: sha256(workspace.expectedPostBytes),
          unexpectedTrackedPathCount: 0,
          issues,
        },
        cleanup: {},
      };
    }
  }
  workspace.inspectionEvidence = evidence;
  if (
    issues.length > 0 ||
    evidence.sourceRoot.byteIdenticalBeforeAndDuring !== true
  ) {
    throw rejectedWorkspaceEvidence(evidence);
  }
  return evidence;
}

export function completeAuthPreflightWorktree(workspace) {
  let inspectionError = null;
  let evidence;
  try {
    evidence = inspectAuthPreflightWorktree(workspace);
  } catch (error) {
    inspectionError = error;
    evidence = error.safeEvidence ?? workspace.inspectionEvidence;
  }
  let cleanupFailure = null;
  try {
    removeOwnedWorktree(workspace);
  } catch (error) {
    cleanupFailure = error;
  }
  let sourceByteIdenticalAfterCleanup = false;
  if (!cleanupFailure) {
    const sourceAfter = cleanSourceSnapshot({
      repositoryRoot: workspace.repositoryRoot,
      candidateCommitSha: workspace.candidateCommitSha,
      candidateTreeSha: workspace.candidateTreeSha,
    });
    sourceByteIdenticalAfterCleanup =
      sourceAfter.cleanStateSha256 === workspace.sourceBefore.cleanStateSha256;
  }
  const completedEvidence = {
    ...evidence,
    sourceRoot: { ...evidence.sourceRoot },
    trackedOutput: {
      ...evidence.trackedOutput,
      changedPaths: [...evidence.trackedOutput.changedPaths],
      issues: [...evidence.trackedOutput.issues],
    },
    cleanup: {
      owner: "scripts/ci-auth-preflight-worktree.mjs",
      method: "git-worktree-remove-force-exact-task-owned-path",
      worktreeRemoved: !cleanupFailure,
      registrationAbsent: !cleanupFailure,
      sourceByteIdenticalAfterCleanup,
      completed: !cleanupFailure,
    },
  };
  workspace.completionEvidence = completedEvidence;
  if (cleanupFailure) {
    cleanupFailure.safeEvidence = completedEvidence;
    throw cleanupFailure;
  }
  if (inspectionError || !sourceByteIdenticalAfterCleanup) {
    throw rejectedWorkspaceEvidence(completedEvidence);
  }
  return Object.freeze(completedEvidence);
}
