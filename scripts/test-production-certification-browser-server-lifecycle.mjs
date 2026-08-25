import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  NEXT_DEV_GENERATED_TSCONFIG_INCLUDE,
  beginBrowserServerTrackedOutputLifecycle,
  browserServerTrackedOutputEvidenceIssues,
  completeBrowserServerTrackedOutputLifecycle,
  simulatedBrowserServerTrackedOutputLifecycle,
} from "./production-certification-browser-server-lifecycle.mjs";
import {
  canonicalJsonBytes,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import { executeDevelopmentBrowserOwnerChild } from "./production-certification-real.mjs";

const EVIDENCE_SEAL_DOMAIN =
  "interior-ai.production-certification-browser-server-lifecycle-seal.v1\n";

function resealEvidence(value) {
  const payload = structuredClone(value);
  delete payload.aggregateEvidenceSha256;
  return {
    ...payload,
    aggregateEvidenceSha256: sha256Bytes(
      Buffer.concat([Buffer.from(EVIDENCE_SEAL_DOMAIN), canonicalJsonBytes(payload)]),
    ),
  };
}

function git(repositoryRoot, args) {
  const child = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(child.status, 0, `fixture Git failed: git ${args.join(" ")}`);
  return child.stdout.trim();
}

function fixture(label) {
  const root = mkdtempSync(
    path.join(tmpdir(), `browser-server-lifecycle-${label}-`),
  );
  writeFileSync(path.join(root, ".gitignore"), "/.next\n");
  writeFileSync(path.join(root, "marker.txt"), "candidate marker\n");
  writeFileSync(
    path.join(root, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {},
        include: ["**/*.ts", ".next/dev/types/**/*.ts"],
        exclude: ["node_modules"],
      },
      null,
      2,
    )}\n`,
  );
  mkdirSync(path.join(root, ".next"));
  writeFileSync(path.join(root, ".next", "ignored.txt"), "ignored\n");
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.name", "Browser Lifecycle Regression"]);
  git(root, ["config", "user.email", "browser-lifecycle@example.invalid"]);
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "fixture"]);
  git(root, ["checkout", "--detach", "--quiet"]);
  const candidate = {
    commitSha: git(root, ["rev-parse", "HEAD"]),
    treeSha: git(root, ["rev-parse", "HEAD^{tree}"]),
  };
  const tsconfigBytes = readFileSync(path.join(root, "tsconfig.json"));
  return { root, candidate, tsconfigBytes };
}

function begin(value, overrides = {}) {
  return beginBrowserServerTrackedOutputLifecycle({
    repositoryRoot: value.root,
    candidate: value.candidate,
    certificationId: "browser-server-lifecycle-certification",
    ownerId: "cart",
    stageAttempt: 1,
    ...overrides,
  });
}

function addExpectedNextMutation(value) {
  const filePath = path.join(value.root, "tsconfig.json");
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  parsed.include.push(NEXT_DEV_GENERATED_TSCONFIG_INCLUDE);
  writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
}

function assertClean(value) {
  assert.equal(
    git(value.root, ["status", "--porcelain=v1", "--untracked-files=all"]),
    "",
  );
  assert.deepEqual(readFileSync(path.join(value.root, "tsconfig.json")), value.tsconfigBytes);
}

function withFixture(label, action) {
  const value = fixture(label);
  try {
    action(value);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
}

withFixture("absent", (value) => {
  const evidence = completeBrowserServerTrackedOutputLifecycle(begin(value), {
    processExitCode: 0,
  });
  assert.equal(evidence.trackedOutput.mutationClassification, "absent");
  assert.equal(evidence.trackedOutput.changedPathCount, 0);
  assert.equal(evidence.cleanup.trackedAndOrdinaryUntrackedClean, true);
  assert.deepEqual(browserServerTrackedOutputEvidenceIssues(evidence), []);
  assertClean(value);
});

withFixture("deterministic", (value) => {
  const lifecycle = begin(value);
  addExpectedNextMutation(value);
  const evidence = completeBrowserServerTrackedOutputLifecycle(lifecycle, {
    processExitCode: 0,
  });
  assert.equal(
    evidence.trackedOutput.mutationClassification,
    "deterministic-next-dev-generated",
  );
  assert.deepEqual(evidence.trackedOutput.changedPaths, ["tsconfig.json"]);
  assert.deepEqual(evidence.cleanup.restoredPaths, ["tsconfig.json"]);
  assert.equal(evidence.cleanup.tsconfigRestoredByteIdentical, true);
  assertClean(value);
});

withFixture("failed-server", (value) => {
  const lifecycle = begin(value);
  addExpectedNextMutation(value);
  const evidence = completeBrowserServerTrackedOutputLifecycle(lifecycle, {
    processExitCode: 1,
    signal: null,
  });
  assert.equal(evidence.process.exitCode, 1);
  assert.equal(evidence.complete, true);
  assertClean(value);
});

withFixture("real-runner-wrapper-failure", (value) => {
  const result = executeDevelopmentBrowserOwnerChild({
    repositoryRoot: value.root,
    candidate: value.candidate,
    certificationId: "browser-server-real-runner-wrapper",
    ownerId: "cart",
    stageAttempt: 1,
    executeChild() {
      addExpectedNextMutation(value);
      return { status: 1, signal: null, error: null };
    },
  });
  assert.equal(result.child.status, 1);
  assert.equal(result.lifecycleFailure, null);
  assert.equal(result.lifecycleEvidence.process.exitCode, 1);
  assert.deepEqual(result.lifecycleEvidence.cleanup.restoredPaths, ["tsconfig.json"]);
  assertClean(value);
});

withFixture("real-runner-wrapper-throw", (value) => {
  const result = executeDevelopmentBrowserOwnerChild({
    repositoryRoot: value.root,
    candidate: value.candidate,
    certificationId: "browser-server-real-runner-wrapper-throw",
    ownerId: "cart",
    stageAttempt: 1,
    executeChild() {
      addExpectedNextMutation(value);
      throw new Error("synthetic child dispatch failure");
    },
  });
  assert.match(result.child.error.message, /synthetic child dispatch failure/);
  assert.equal(result.lifecycleFailure, null);
  assert.equal(result.lifecycleEvidence.process.exitCode, null);
  assertClean(value);
});

withFixture("exact-owner-only", (value) => {
  const lifecycle = begin(value);
  addExpectedNextMutation(value);
  writeFileSync(path.join(value.root, "marker.txt"), "unexpected\n");
  let retained;
  try {
    completeBrowserServerTrackedOutputLifecycle(lifecycle, {
      processExitCode: 1,
    });
  } catch (error) {
    retained = error;
  }
  assert.equal(retained?.code, "BROWSER_SERVER_TRACKED_OUTPUT_REJECTED");
  assert.deepEqual(retained.safeEvidence.cleanup.restoredPaths, ["tsconfig.json"]);
  assert.deepEqual(
    readFileSync(path.join(value.root, "tsconfig.json")),
    value.tsconfigBytes,
  );
  assert.equal(readFileSync(path.join(value.root, "marker.txt"), "utf8"), "unexpected\n");
});

for (const scenario of [
  {
    label: "altered-tsconfig",
    mutate(value) {
      const filePath = path.join(value.root, "tsconfig.json");
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      parsed.include.push("unexpected/**/*.ts");
      writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
    },
    issue: "unexpected-tsconfig-mutation",
  },
  {
    label: "unrelated-tracked",
    mutate(value) {
      writeFileSync(path.join(value.root, "marker.txt"), "unexpected\n");
    },
    issue: "unexpected-tracked-paths",
  },
  {
    label: "staged",
    mutate(value) {
      writeFileSync(path.join(value.root, "marker.txt"), "staged\n");
      git(value.root, ["add", "marker.txt"]);
    },
    issue: "staged-paths",
  },
  {
    label: "ordinary-untracked",
    mutate(value) {
      writeFileSync(path.join(value.root, "unexpected.txt"), "untracked\n");
    },
    issue: "ordinary-untracked-paths",
  },
  {
    label: "symlink-tsconfig",
    mutate(value) {
      unlinkSync(path.join(value.root, "tsconfig.json"));
      symlinkSync("marker.txt", path.join(value.root, "tsconfig.json"));
    },
    issue: "tsconfig-type",
  },
]) {
  withFixture(scenario.label, (value) => {
    const lifecycle = begin(value);
    scenario.mutate(value);
    let retained;
    try {
      completeBrowserServerTrackedOutputLifecycle(lifecycle, {
        processExitCode: 1,
      });
    } catch (error) {
      retained = error;
    }
    assert.equal(retained?.code, "BROWSER_SERVER_TRACKED_OUTPUT_REJECTED");
    assert.ok(retained.safeEvidence.trackedOutput.issues.includes(scenario.issue));
    assert.equal(retained.safeEvidence.cleanup.trackedAndOrdinaryUntrackedClean, false);
    assert.notEqual(
      git(value.root, ["status", "--porcelain=v1", "--untracked-files=all"]),
      "",
      "unexpected output must be retained for forensic rejection",
    );
  });
}

withFixture("wrong-worktree", (value) => {
  assert.throws(
    () =>
      begin(value, {
        candidate: { ...value.candidate, treeSha: "f".repeat(40) },
      }),
    /clean detached development-browser candidate/,
  );
  assert.throws(
    () => begin(value, { readinessUrl: "http://127.0.0.1:3317" }),
    /server contract is invalid/,
  );
  assertClean(value);
});

withFixture("tampered-evidence", (value) => {
  const evidence = completeBrowserServerTrackedOutputLifecycle(begin(value), {
    processExitCode: 0,
  });
  assert.match(
    browserServerTrackedOutputEvidenceIssues({
      ...evidence,
      server: { ...evidence.server, retries: 1 },
    }).join("\n"),
    /invalid or incomplete/,
  );
  const internallyContradictory = resealEvidence({
    ...evidence,
    trackedOutput: {
      ...evidence.trackedOutput,
      changedPaths: ["secrets.txt"],
      changedPathCount: 999,
      tsconfigPreBlob: "not-a-sha",
    },
  });
  assert.match(
    browserServerTrackedOutputEvidenceIssues(internallyContradictory).join("\n"),
    /invalid or incomplete/,
  );
  const contradictoryAbsentStatus = resealEvidence({
    ...evidence,
    trackedOutput: {
      ...evidence.trackedOutput,
      postStatusSha256: "1".repeat(64),
    },
  });
  assert.match(
    browserServerTrackedOutputEvidenceIssues(contradictoryAbsentStatus).join("\n"),
    /invalid or incomplete/,
  );
  const wrongOwner = resealEvidence({ ...evidence, ownerId: "retailer" });
  assert.deepEqual(
    browserServerTrackedOutputEvidenceIssues(wrongOwner),
    [],
    "the generic validator accepts a valid owner; final state binding rejects swaps",
  );
  assertClean(value);
});

withFixture("simulation", (value) => {
  const evidence = simulatedBrowserServerTrackedOutputLifecycle({
    repositoryRoot: value.root,
    candidate: value.candidate,
    certificationId: "browser-server-lifecycle-simulation",
    ownerId: "retailer",
    stageAttempt: 2,
  });
  assert.equal(evidence.executionClass, "deterministic-simulation");
  assert.equal(
    evidence.trackedOutput.mutationClassification,
    "not-observed-in-simulation",
  );
  assert.deepEqual(browserServerTrackedOutputEvidenceIssues(evidence), []);
  assert.match(
    browserServerTrackedOutputEvidenceIssues(
      resealEvidence({
        ...evidence,
        trackedOutput: {
          ...evidence.trackedOutput,
          tsconfigPreSha256: "0".repeat(64),
        },
      }),
    ).join("\n"),
    /invalid or incomplete/,
  );
  assertClean(value);
});

console.log("Production certification browser-server lifecycle checks passed.");
