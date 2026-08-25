import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import {
  canonicalJsonBytes,
  isSha256,
  isSourceSha,
  sha256Bytes,
} from "./production-certification-contract.mjs";

export const PRODUCTION_CERTIFICATION_BROWSER_SERVER_LIFECYCLE_SCHEMA =
  "interior-ai.production-certification-browser-server-lifecycle.v1";
export const NEXT_DEV_GENERATED_TSCONFIG_INCLUDE =
  ".next/dev/dev/types/**/*.ts";

const EVIDENCE_SEAL_DOMAIN =
  "interior-ai.production-certification-browser-server-lifecycle-seal.v1\n";
const DEVELOPMENT_SERVER_COMMAND = "npm run dev";
const DEVELOPMENT_SERVER_READINESS_URL = "http://127.0.0.1:3000";
const EXPECTED_TSCONFIG_ONLY_STATUS_SHA256 = sha256Bytes(
  Buffer.from(" M tsconfig.json\0"),
);

function sha256(value) {
  return sha256Bytes(value);
}

function git(repositoryRoot, args, { allowFailure = false } = {}) {
  const child = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!allowFailure && (child.error || child.signal || child.status !== 0)) {
    throw new Error("browser-server tracked-output Git owner failed closed");
  }
  return child;
}

function gitText(repositoryRoot, args) {
  return git(repositoryRoot, args).stdout.trim();
}

function pathInventory(raw) {
  return raw.split("\0").filter(Boolean).sort();
}

function assertRegularFile(filePath, label) {
  const metadata = lstatSync(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a physical regular file`);
  }
}

function expectedGeneratedTsconfig(preBytes) {
  const parsed = JSON.parse(preBytes.toString("utf8"));
  if (!Array.isArray(parsed.include)) {
    throw new Error("browser-server tsconfig include contract is malformed");
  }
  if (parsed.include.includes(NEXT_DEV_GENERATED_TSCONFIG_INCLUDE)) {
    throw new Error("browser-server tsconfig contains unowned persistent dev output");
  }
  parsed.include.push(NEXT_DEV_GENERATED_TSCONFIG_INCLUDE);
  return Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`);
}

function sealEvidence(value) {
  const payload = structuredClone(value);
  delete payload.aggregateEvidenceSha256;
  return {
    ...payload,
    aggregateEvidenceSha256: sha256(
      Buffer.concat([Buffer.from(EVIDENCE_SEAL_DOMAIN), canonicalJsonBytes(payload)]),
    ),
  };
}

function lifecycleError(message, evidence = null) {
  const error = new Error(message);
  error.code = "BROWSER_SERVER_TRACKED_OUTPUT_REJECTED";
  error.safeEvidence = evidence;
  return error;
}

function cleanPreState(repositoryRoot, candidate) {
  const commitSha = gitText(repositoryRoot, ["rev-parse", "HEAD"]);
  const treeSha = gitText(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
  const branch = gitText(repositoryRoot, ["branch", "--show-current"]);
  const status = git(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]).stdout;
  if (
    commitSha !== candidate.commitSha ||
    treeSha !== candidate.treeSha ||
    branch !== "" ||
    status !== ""
  ) {
    throw new Error(
      "browser-server lifecycle requires the clean detached development-browser candidate",
    );
  }
  return { commitSha, treeSha, statusSha256: sha256(status) };
}

export function beginBrowserServerTrackedOutputLifecycle({
  repositoryRoot,
  candidate,
  certificationId,
  ownerId,
  stageAttempt,
  command = DEVELOPMENT_SERVER_COMMAND,
  readinessUrl = DEVELOPMENT_SERVER_READINESS_URL,
}) {
  if (
    !isSourceSha(candidate?.commitSha) ||
    !isSourceSha(candidate?.treeSha) ||
    typeof certificationId !== "string" ||
    !certificationId ||
    !new Set(["cart", "retailer"]).has(ownerId) ||
    !Number.isSafeInteger(stageAttempt) ||
    stageAttempt < 1 ||
    command !== DEVELOPMENT_SERVER_COMMAND ||
    readinessUrl !== DEVELOPMENT_SERVER_READINESS_URL
  ) {
    throw new Error("browser-server lifecycle identity or server contract is invalid");
  }
  const root = realpathSync(repositoryRoot);
  const preState = cleanPreState(root, candidate);
  const tsconfigPath = path.join(root, "tsconfig.json");
  assertRegularFile(tsconfigPath, "browser-server tsconfig");
  const tsconfigPreBytes = readFileSync(tsconfigPath);
  return Object.freeze({
    repositoryRoot: root,
    candidate: Object.freeze({ ...candidate }),
    certificationId,
    ownerId,
    stageAttempt,
    command,
    readinessUrl,
    preState,
    tsconfigPreBytes,
    tsconfigPreBlob: gitText(root, ["rev-parse", "HEAD:tsconfig.json"]),
    expectedGeneratedBytes: expectedGeneratedTsconfig(tsconfigPreBytes),
    worktreeIdentitySha256: sha256(root),
  });
}

function inspectTerminalState(lifecycle) {
  const root = lifecycle.repositoryRoot;
  const changedResult = git(
    root,
    ["diff", "--name-only", "-z", "HEAD", "--"],
    { allowFailure: true },
  );
  const stagedResult = git(
    root,
    ["diff", "--cached", "--name-only", "-z", "HEAD", "--"],
    { allowFailure: true },
  );
  const untrackedResult = git(
    root,
    ["ls-files", "--others", "--exclude-standard", "-z"],
    { allowFailure: true },
  );
  const statusResult = git(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ], { allowFailure: true });
  const gitResults = [changedResult, stagedResult, untrackedResult, statusResult];
  if (
    gitResults.some(
      (result) => result.error || result.signal || result.status !== 0,
    )
  ) {
    return {
      status: null,
      changedPaths: null,
      stagedPaths: null,
      ordinaryUntrackedPaths: null,
      tsconfigPostBytes: null,
      mutationClassification: "not-observed",
      issues: ["terminal-inspection-failed"],
    };
  }
  const changedPaths = pathInventory(changedResult.stdout);
  const stagedPaths = pathInventory(stagedResult.stdout);
  const ordinaryUntrackedPaths = pathInventory(untrackedResult.stdout);
  const status = statusResult.stdout;
  const issues = [];
  const tsconfigPath = path.join(root, "tsconfig.json");
  let tsconfigPostBytes = Buffer.alloc(0);
  try {
    assertRegularFile(tsconfigPath, "browser-server terminal tsconfig");
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
    if (!tsconfigPostBytes.equals(lifecycle.tsconfigPreBytes)) {
      issues.push("unreported-tsconfig-change");
    }
  } else if (changedPaths.includes("tsconfig.json")) {
    if (tsconfigPostBytes.equals(lifecycle.expectedGeneratedBytes)) {
      mutationClassification = "deterministic-next-dev-generated";
    } else {
      mutationClassification = "unexpected";
      issues.push("unexpected-tsconfig-mutation");
    }
  } else {
    mutationClassification = "unexpected";
  }
  return {
    status,
    changedPaths,
    stagedPaths,
    ordinaryUntrackedPaths,
    tsconfigPostBytes,
    mutationClassification,
    issues,
  };
}

function cleanupTerminalState(lifecycle, terminal) {
  const ownsExactTsconfigMutation =
    terminal.mutationClassification === "deterministic-next-dev-generated" &&
    Array.isArray(terminal.stagedPaths) &&
    !terminal.stagedPaths.includes("tsconfig.json");
  const restoredPaths = ownsExactTsconfigMutation ? ["tsconfig.json"] : [];
  const cleanupIssues = [];
  if (restoredPaths.length > 0) {
    const restored = git(
      lifecycle.repositoryRoot,
      ["restore", "--source=HEAD", "--worktree", "--", "tsconfig.json"],
      { allowFailure: true },
    );
    if (restored.error || restored.signal || restored.status !== 0) {
      restoredPaths.length = 0;
      cleanupIssues.push("cleanup-failed");
    }
  }
  const statusResult = git(lifecycle.repositoryRoot, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ], { allowFailure: true });
  let restoredBytes = null;
  try {
    assertRegularFile(
      path.join(lifecycle.repositoryRoot, "tsconfig.json"),
      "browser-server restored tsconfig",
    );
    restoredBytes = readFileSync(
      path.join(lifecycle.repositoryRoot, "tsconfig.json"),
    );
  } catch {
    cleanupIssues.push("cleanup-tsconfig-observation-failed");
  }
  if (
    statusResult.error ||
    statusResult.signal ||
    statusResult.status !== 0
  ) {
    cleanupIssues.push("cleanup-status-observation-failed");
  }
  const status = statusResult.status === 0 ? statusResult.stdout : null;
  return {
    cleanup: {
      performed: true,
      restoredPaths,
      removedOrdinaryUntrackedPathCount: 0,
      trackedAndOrdinaryUntrackedClean: status === "",
      statusSha256: status === null ? null : sha256(status),
      tsconfigRestoredByteIdentical:
        restoredBytes !== null && restoredBytes.equals(lifecycle.tsconfigPreBytes),
    },
    issues: cleanupIssues,
  };
}

export function completeBrowserServerTrackedOutputLifecycle(
  lifecycle,
  { processExitCode, signal = null } = {},
) {
  const terminal = inspectTerminalState(lifecycle);
  const cleanupResult = cleanupTerminalState(lifecycle, terminal);
  const cleanup = cleanupResult.cleanup;
  terminal.issues.push(...cleanupResult.issues);
  if (
    cleanup.trackedAndOrdinaryUntrackedClean !== true ||
    cleanup.tsconfigRestoredByteIdentical !== true
  ) {
    terminal.issues.push("terminal-worktree-not-clean");
  }
  const evidence = sealEvidence({
    schema: PRODUCTION_CERTIFICATION_BROWSER_SERVER_LIFECYCLE_SCHEMA,
    owner: "scripts/production-certification-browser-server-lifecycle.mjs",
    executionClass: "real-candidate",
    certificationId: lifecycle.certificationId,
    ownerId: lifecycle.ownerId,
    stageAttempt: lifecycle.stageAttempt,
    candidateCommitSha: lifecycle.candidate.commitSha,
    candidateTreeSha: lifecycle.candidate.treeSha,
    worktreeRole: "development-browser",
    worktreeIdentitySha256: lifecycle.worktreeIdentitySha256,
    server: {
      command: lifecycle.command,
      cwdRole: "development-browser",
      readinessUrl: lifecycle.readinessUrl,
      retries: 0,
    },
    process: {
      exitCode: Number.isSafeInteger(processExitCode) ? processExitCode : null,
      signal: typeof signal === "string" && signal ? signal : null,
    },
    trackedOutput: {
      physicalObservation: true,
      preStatusSha256: lifecycle.preState.statusSha256,
      postStatusSha256:
        terminal.status === null ? null : sha256(terminal.status),
      changedPaths: terminal.changedPaths,
      changedPathCount: terminal.changedPaths?.length ?? null,
      stagedPathCount: terminal.stagedPaths?.length ?? null,
      ordinaryUntrackedPathCount: terminal.ordinaryUntrackedPaths?.length ?? null,
      mutationClassification: terminal.mutationClassification,
      expectedGeneratedInclude: NEXT_DEV_GENERATED_TSCONFIG_INCLUDE,
      tsconfigPreBlob: lifecycle.tsconfigPreBlob,
      tsconfigPreSha256: sha256(lifecycle.tsconfigPreBytes),
      tsconfigPostSha256:
        terminal.tsconfigPostBytes === null
          ? null
          : sha256(terminal.tsconfigPostBytes),
      expectedGeneratedSha256: sha256(lifecycle.expectedGeneratedBytes),
      issues: [...new Set(terminal.issues)],
    },
    cleanup,
    complete:
      terminal.issues.length === 0 &&
      cleanup.trackedAndOrdinaryUntrackedClean === true &&
      cleanup.tsconfigRestoredByteIdentical === true,
  });
  if (!evidence.complete) {
    throw lifecycleError(
      "browser-server tracked-output lifecycle failed closed",
      evidence,
    );
  }
  return Object.freeze(evidence);
}

export function simulatedBrowserServerTrackedOutputLifecycle({
  repositoryRoot,
  candidate,
  certificationId,
  ownerId,
  stageAttempt,
}) {
  if (
    !isSourceSha(candidate?.commitSha) ||
    !isSourceSha(candidate?.treeSha) ||
    typeof certificationId !== "string" ||
    !certificationId ||
    !new Set(["cart", "retailer"]).has(ownerId) ||
    !Number.isSafeInteger(stageAttempt) ||
    stageAttempt < 1
  ) {
    throw new Error("simulated browser-server lifecycle identity is invalid");
  }
  const root = realpathSync(repositoryRoot);
  const preState = cleanPreState(root, candidate);
  return Object.freeze(
    sealEvidence({
      schema: PRODUCTION_CERTIFICATION_BROWSER_SERVER_LIFECYCLE_SCHEMA,
      owner: "scripts/production-certification-browser-server-lifecycle.mjs",
      executionClass: "deterministic-simulation",
      certificationId,
      ownerId,
      stageAttempt,
      candidateCommitSha: candidate.commitSha,
      candidateTreeSha: candidate.treeSha,
      worktreeRole: "development-browser",
      worktreeIdentitySha256: sha256(root),
      server: {
        command: DEVELOPMENT_SERVER_COMMAND,
        cwdRole: "development-browser",
        readinessUrl: DEVELOPMENT_SERVER_READINESS_URL,
        retries: 0,
      },
      process: { exitCode: 0, signal: null },
      trackedOutput: {
        physicalObservation: false,
        preStatusSha256: preState.statusSha256,
        mutationClassification: "not-observed-in-simulation",
        issues: [],
      },
      cleanup: {
        performed: false,
        terminalCleanPrecondition: true,
      },
      complete: true,
    }),
  );
}

function hasExactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
}

export function browserServerTrackedOutputEvidenceIssues(evidence) {
  const issues = [];
  const commonValid =
    hasExactKeys(evidence, [
      "schema",
      "owner",
      "executionClass",
      "certificationId",
      "ownerId",
      "stageAttempt",
      "candidateCommitSha",
      "candidateTreeSha",
      "worktreeRole",
      "worktreeIdentitySha256",
      "server",
      "process",
      "trackedOutput",
      "cleanup",
      "complete",
      "aggregateEvidenceSha256",
    ]);
  const processValid =
    hasExactKeys(evidence?.process, ["exitCode", "signal"]) &&
    (evidence.process.exitCode === null ||
      Number.isSafeInteger(evidence.process.exitCode)) &&
    (evidence.process.signal === null ||
      (typeof evidence.process.signal === "string" && evidence.process.signal));
  const identityValid =
    evidence?.schema === PRODUCTION_CERTIFICATION_BROWSER_SERVER_LIFECYCLE_SCHEMA &&
    evidence?.owner ===
      "scripts/production-certification-browser-server-lifecycle.mjs" &&
    new Set(["real-candidate", "deterministic-simulation"]).has(
      evidence?.executionClass,
    ) &&
    typeof evidence?.certificationId === "string" &&
    evidence.certificationId.length > 0 &&
    new Set(["cart", "retailer"]).has(evidence?.ownerId) &&
    Number.isSafeInteger(evidence?.stageAttempt) &&
    evidence.stageAttempt > 0 &&
    evidence?.worktreeRole === "development-browser" &&
    hasExactKeys(evidence?.server, [
      "command",
      "cwdRole",
      "readinessUrl",
      "retries",
    ]) &&
    evidence.server.command === DEVELOPMENT_SERVER_COMMAND &&
    evidence.server.cwdRole === "development-browser" &&
    evidence.server.readinessUrl === DEVELOPMENT_SERVER_READINESS_URL &&
    evidence.server.retries === 0 &&
    isSourceSha(evidence?.candidateCommitSha) &&
    isSourceSha(evidence?.candidateTreeSha) &&
    isSha256(evidence?.worktreeIdentitySha256) &&
    processValid &&
    evidence?.complete === true &&
    evidence?.aggregateEvidenceSha256 ===
      sealEvidence(evidence).aggregateEvidenceSha256;
  const emptySha256 = sha256(Buffer.alloc(0));
  let executionValid = false;
  if (evidence?.executionClass === "real-candidate") {
    const output = evidence.trackedOutput;
    const cleanup = evidence.cleanup;
    const commonOutputValid =
      hasExactKeys(output, [
        "physicalObservation",
        "preStatusSha256",
        "postStatusSha256",
        "changedPaths",
        "changedPathCount",
        "stagedPathCount",
        "ordinaryUntrackedPathCount",
        "mutationClassification",
        "expectedGeneratedInclude",
        "tsconfigPreBlob",
        "tsconfigPreSha256",
        "tsconfigPostSha256",
        "expectedGeneratedSha256",
        "issues",
      ]) &&
      output.physicalObservation === true &&
      output.preStatusSha256 === emptySha256 &&
      isSha256(output.postStatusSha256) &&
      Array.isArray(output.changedPaths) &&
      output.changedPathCount === output.changedPaths.length &&
      output.stagedPathCount === 0 &&
      output.ordinaryUntrackedPathCount === 0 &&
      output.expectedGeneratedInclude === NEXT_DEV_GENERATED_TSCONFIG_INCLUDE &&
      isSourceSha(output.tsconfigPreBlob) &&
      isSha256(output.tsconfigPreSha256) &&
      isSha256(output.tsconfigPostSha256) &&
      isSha256(output.expectedGeneratedSha256) &&
      Array.isArray(output.issues) &&
      output.issues.length === 0 &&
      hasExactKeys(cleanup, [
        "performed",
        "restoredPaths",
        "removedOrdinaryUntrackedPathCount",
        "trackedAndOrdinaryUntrackedClean",
        "statusSha256",
        "tsconfigRestoredByteIdentical",
      ]) &&
      cleanup.performed === true &&
      Array.isArray(cleanup.restoredPaths) &&
      cleanup.removedOrdinaryUntrackedPathCount === 0 &&
      cleanup.trackedAndOrdinaryUntrackedClean === true &&
      cleanup.statusSha256 === emptySha256 &&
      cleanup.tsconfigRestoredByteIdentical === true;
    const absentValid =
      output?.mutationClassification === "absent" &&
      output.changedPathCount === 0 &&
      output.changedPaths.length === 0 &&
      output.postStatusSha256 === emptySha256 &&
      output.tsconfigPostSha256 === output.tsconfigPreSha256 &&
      cleanup?.restoredPaths.length === 0;
    const generatedValid =
      output?.mutationClassification === "deterministic-next-dev-generated" &&
      output.changedPathCount === 1 &&
      output.changedPaths[0] === "tsconfig.json" &&
      output.postStatusSha256 === EXPECTED_TSCONFIG_ONLY_STATUS_SHA256 &&
      output.tsconfigPostSha256 === output.expectedGeneratedSha256 &&
      cleanup?.restoredPaths.length === 1 &&
      cleanup.restoredPaths[0] === "tsconfig.json";
    executionValid = commonOutputValid && (absentValid || generatedValid);
  } else if (evidence?.executionClass === "deterministic-simulation") {
    executionValid =
      evidence.process.exitCode === 0 &&
      evidence.process.signal === null &&
      hasExactKeys(evidence.trackedOutput, [
        "physicalObservation",
        "preStatusSha256",
        "mutationClassification",
        "issues",
      ]) &&
      evidence.trackedOutput.physicalObservation === false &&
      evidence.trackedOutput.preStatusSha256 === emptySha256 &&
      evidence.trackedOutput.mutationClassification ===
        "not-observed-in-simulation" &&
      Array.isArray(evidence.trackedOutput.issues) &&
      evidence.trackedOutput.issues.length === 0 &&
      hasExactKeys(evidence.cleanup, ["performed", "terminalCleanPrecondition"]) &&
      evidence.cleanup.performed === false &&
      evidence.cleanup.terminalCleanPrecondition === true;
  }
  if (!commonValid || !identityValid || !executionValid) {
    issues.push("browser-server tracked-output evidence is invalid or incomplete");
  }
  return issues;
}
