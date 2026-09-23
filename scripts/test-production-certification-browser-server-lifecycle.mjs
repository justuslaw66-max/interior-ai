import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  NEXT_DEV_GENERATED_OUTPUT_PATH,
  NEXT_DEV_GENERATED_TSCONFIG_INCLUDE,
  NEXT_DEV_GENERATED_TYPE_DECLARATION_BYTES,
  RETAILER_BROWSER_FIXTURE_OUTPUT_PATH,
  beginBrowserServerTrackedOutputLifecycle,
  browserServerTrackedOutputEvidenceIssues,
  completeBrowserServerTrackedOutputLifecycle,
  developmentBrowserGeneratedOutputDeclarations,
  simulatedBrowserServerTrackedOutputLifecycle,
} from "./production-certification-browser-server-lifecycle.mjs";
import {
  canonicalJsonBytes,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import {
  developmentBrowserOwnerStageFailure,
  executeDevelopmentBrowserOwnerChild,
} from "./production-certification-real.mjs";

const EVIDENCE_SEAL_DOMAIN =
  "interior-ai.production-certification-browser-server-lifecycle-seal.v2\n";
const OWNERSHIP_SEAL_DOMAIN =
  "interior-ai.production-certification-browser-server-output-ownership.v1\n";

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

function resealOwnership(value) {
  const payload = structuredClone(value);
  payload.ownershipIdentitySha256 = sha256Bytes(
    Buffer.concat([
      Buffer.from(OWNERSHIP_SEAL_DOMAIN),
      canonicalJsonBytes({
        certificationId: payload.certificationId,
        candidateId: payload.candidateId,
        candidateCommitSha: payload.candidateCommitSha,
        candidateTreeSha: payload.candidateTreeSha,
        ownerId: payload.ownerId,
        stageAttempt: payload.stageAttempt,
        worktreeIdentitySha256: payload.worktreeIdentitySha256,
        dependencyBinding: payload.dependencyBinding,
        outputs: developmentBrowserGeneratedOutputDeclarations(
          payload.ownerId,
        ).map(({ id, relativePath, pathType, producer }) => ({
          id,
          relativePath,
          pathType,
          producer,
        })),
      }),
    ]),
  );
  return resealEvidence(payload);
}

function expectedIdentity(value) {
  return {
    candidateId: value.candidate.id,
    ...value.dependencyBinding,
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
  const ownerRoot = mkdtempSync(
    path.join(tmpdir(), `browser-server-lifecycle-${label}-`),
  );
  const root = path.join(ownerRoot, "development-browser");
  const outsideRoot = path.join(ownerRoot, "outside-root");
  mkdirSync(root);
  mkdirSync(outsideRoot);
  writeFileSync(
    path.join(root, ".gitignore"),
    "/.next*/\nnext-env.d.ts\nnode_modules/\n*.ignored\n",
  );
  writeFileSync(path.join(root, "marker.txt"), "candidate marker\n");
  for (const name of [
    "source-validation",
    "final-artifact",
    "canonical",
    "historical",
  ]) {
    mkdirSync(path.join(root, name));
    writeFileSync(path.join(root, name, "sentinel.txt"), `${name} sentinel\n`);
  }
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
  mkdirSync(path.join(root, "node_modules"));
  writeFileSync(path.join(root, "node_modules", "bound.txt"), "bound dependency\n");
  writeFileSync(path.join(outsideRoot, "sentinel.txt"), "outside sentinel\n");
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.name", "Browser Lifecycle Regression"]);
  git(root, ["config", "user.email", "browser-lifecycle@example.invalid"]);
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "fixture"]);
  git(root, ["checkout", "--detach", "--quiet"]);
  const candidate = {
    id: `browser-lifecycle-${label}`,
    commitSha: git(root, ["rev-parse", "HEAD"]),
    treeSha: git(root, ["rev-parse", "HEAD^{tree}"]),
  };
  const nodeModulesPath = path.join(root, "node_modules");
  const nodeModulesMetadata = lstatSync(nodeModulesPath);
  const dependencyBinding = {
    bindingEvidenceSha256: "b".repeat(64),
    dependencyIdentitySha256: "d".repeat(64),
    dependencyInventorySha256: "e".repeat(64),
    nodeModulesRootIdentitySha256: sha256Bytes(realpathSync(nodeModulesPath)),
    nodeModulesFilesystemIdentitySha256: sha256Bytes(
      `${nodeModulesMetadata.dev}:${nodeModulesMetadata.ino}`,
    ),
  };
  const tsconfigBytes = readFileSync(path.join(root, "tsconfig.json"));
  const protectedBytes = Object.fromEntries(
    ["source-validation", "final-artifact", "canonical", "historical"].map(
      (name) => [name, readFileSync(path.join(root, name, "sentinel.txt"))],
    ),
  );
  return {
    ownerRoot,
    root,
    outsideRoot,
    candidate,
    dependencyBinding,
    tsconfigBytes,
    protectedBytes,
    nodeModulesBytes: readFileSync(path.join(root, "node_modules", "bound.txt")),
  };
}

function begin(value, ownerId = "cart", overrides = {}) {
  return beginBrowserServerTrackedOutputLifecycle({
    repositoryRoot: value.root,
    candidate: value.candidate,
    certificationId: "browser-server-lifecycle-certification",
    ownerId,
    stageAttempt: 1,
    dependencyBinding: value.dependencyBinding,
    ...overrides,
  });
}

function addExpectedNextMutation(value) {
  const filePath = path.join(value.root, "tsconfig.json");
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  parsed.include.push(NEXT_DEV_GENERATED_TSCONFIG_INCLUDE);
  writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
}

function produceExpectedOutputs(value, ownerId = "cart") {
  const devRoot = path.join(value.root, NEXT_DEV_GENERATED_OUTPUT_PATH);
  mkdirSync(path.join(devRoot, "server", "app"), { recursive: true });
  writeFileSync(path.join(devRoot, "build-manifest.json"), '{"dev":true}\n');
  writeFileSync(path.join(devRoot, "server", "app", "page.js"), "dev output\n");
  writeFileSync(
    path.join(value.root, "next-env.d.ts"),
    NEXT_DEV_GENERATED_TYPE_DECLARATION_BYTES,
  );
  if (ownerId === "retailer") {
    const fixtureRoot = path.join(value.root, RETAILER_BROWSER_FIXTURE_OUTPUT_PATH);
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(path.join(fixtureRoot, "bundle.js"), "retailer fixture bundle\n");
  }
}

function assertProtectedRootsUnchanged(value) {
  for (const [name, bytes] of Object.entries(value.protectedBytes)) {
    assert.deepEqual(readFileSync(path.join(value.root, name, "sentinel.txt")), bytes);
  }
  assert.equal(
    readFileSync(path.join(value.outsideRoot, "sentinel.txt"), "utf8"),
    "outside sentinel\n",
  );
}

function assertClean(value) {
  assert.equal(
    git(value.root, ["status", "--porcelain=v1", "--untracked-files=all"]),
    "",
  );
  assert.deepEqual(readFileSync(path.join(value.root, "tsconfig.json")), value.tsconfigBytes);
  assert.equal(existsSync(path.join(value.root, ".next")), false);
  assert.equal(existsSync(path.join(value.root, "next-env.d.ts")), false);
  assert.deepEqual(
    readFileSync(path.join(value.root, "node_modules", "bound.txt")),
    value.nodeModulesBytes,
  );
  assertProtectedRootsUnchanged(value);
}

function withFixture(label, action) {
  const value = fixture(label);
  try {
    action(value);
  } finally {
    rmSync(value.ownerRoot, { recursive: true, force: true });
  }
}

function retainedFailure(action) {
  try {
    action();
  } catch (error) {
    return error;
  }
  assert.fail("expected browser generated-output lifecycle failure");
}

withFixture("cart-success", (value) => {
  const lifecycle = begin(value, "cart");
  produceExpectedOutputs(value, "cart");
  addExpectedNextMutation(value);
  const evidence = completeBrowserServerTrackedOutputLifecycle(lifecycle, {
    processExitCode: 0,
  });
  assert.deepEqual(
    evidence.generatedOutputs.map((output) => output.relativePath),
    [NEXT_DEV_GENERATED_OUTPUT_PATH, "next-env.d.ts"],
  );
  assert.equal(evidence.generatedOutputs.every((output) => output.produced), true);
  assert.equal(evidence.cleanup.postCleanupAbsenceProof, true);
  assert.equal(evidence.terminalWorktree.complete, true);
  assert.equal(evidence.server.retries, 0);
  assert.deepEqual(browserServerTrackedOutputEvidenceIssues(evidence), []);
  assertClean(value);
});

withFixture("retailer-success", (value) => {
  const lifecycle = begin(value, "retailer");
  produceExpectedOutputs(value, "retailer");
  const evidence = completeBrowserServerTrackedOutputLifecycle(lifecycle, {
    processExitCode: 0,
  });
  const nextEnvironment = evidence.generatedOutputs.find(
    (output) => output.relativePath === "next-env.d.ts",
  );
  const retailerFixture = evidence.generatedOutputs.find(
    (output) => output.relativePath === RETAILER_BROWSER_FIXTURE_OUTPUT_PATH,
  );
  assert.equal(nextEnvironment.contentContractSha256, sha256Bytes(NEXT_DEV_GENERATED_TYPE_DECLARATION_BYTES));
  assert.deepEqual(
    retailerFixture.entries.map((entry) => entry.path),
    [
      RETAILER_BROWSER_FIXTURE_OUTPUT_PATH,
      `${RETAILER_BROWSER_FIXTURE_OUTPUT_PATH}/bundle.js`,
    ],
  );
  assert.deepEqual(
    evidence.finalizationOrdering,
    [
      "browser-owner-process-exit-observed",
      "generated-output-evidence-sealed",
      "exact-generated-output-cleanup",
      "tracked-output-cleanup",
      "terminal-worktree-validation",
    ],
  );
  assert.equal(evidence.server.retries, 0);
  assert.deepEqual(browserServerTrackedOutputEvidenceIssues(evidence), []);
  assertClean(value);
});

for (const [ownerId, passed] of [["cart", 16], ["retailer", 24]]) {
  withFixture(`${ownerId}-product-result`, (value) => {
    const productResult = Object.freeze({ passed, unexpected: 0, retries: 0 });
    const result = executeDevelopmentBrowserOwnerChild({
      repositoryRoot: value.root,
      candidate: value.candidate,
      certificationId: `${ownerId}-product-result-certification`,
      ownerId,
      stageAttempt: 1,
      dependencyBinding: value.dependencyBinding,
      executeChild() {
        produceExpectedOutputs(value, ownerId);
        return { status: 0, signal: null, error: null, productResult };
      },
    });
    assert.strictEqual(result.child.productResult, productResult);
    assert.equal(result.child.productResult.retries, 0);
    assert.equal(result.lifecycleFailure, null);
    assertClean(value);
  });
}

withFixture("failed-owner-cleanup", (value) => {
  const result = executeDevelopmentBrowserOwnerChild({
    repositoryRoot: value.root,
    candidate: value.candidate,
    certificationId: "failed-owner-cleanup-certification",
    ownerId: "cart",
    stageAttempt: 1,
    dependencyBinding: value.dependencyBinding,
    executeChild() {
      produceExpectedOutputs(value, "cart");
      return { status: 1, signal: null, error: null };
    },
  });
  const failure = developmentBrowserOwnerStageFailure({
    ownerId: "cart",
    lifecycleResult: result,
    ownerStarted: true,
    consumed: true,
  });
  assert.equal(result.lifecycleFailure, null);
  assert.equal(result.lifecycleEvidence.complete, true);
  assert.equal(failure.classification, "PRODUCT_ASSERTION_FAILURE");
  assert.equal(failure.consumed, true);
  assertClean(value);
});

withFixture("failed-owner-cleanup-failure", (value) => {
  const result = executeDevelopmentBrowserOwnerChild({
    repositoryRoot: value.root,
    candidate: value.candidate,
    certificationId: "failed-owner-cleanup-failure-certification",
    ownerId: "cart",
    stageAttempt: 1,
    dependencyBinding: value.dependencyBinding,
    executeChild() {
      produceExpectedOutputs(value, "cart");
      writeFileSync(path.join(value.root, "marker.txt"), "unexpected tracked mutation\n");
      return { status: 1, signal: null, error: null };
    },
  });
  const failure = developmentBrowserOwnerStageFailure({
    ownerId: "cart",
    lifecycleResult: result,
    ownerStarted: true,
    consumed: true,
  });
  assert.equal(failure.classification, "PRODUCT_ASSERTION_FAILURE");
  assert.equal(failure.consumed, true);
  assert.equal(failure.cleanupFailure.code, "BROWSER_SERVER_GENERATED_OUTPUT_REJECTED");
  assert.equal(result.lifecycleEvidence.complete, false);
  assert.equal(result.lifecycleEvidence.terminalWorktree.complete, false);
});

for (const child of [
  { status: 1, signal: null, error: null },
  { status: null, signal: null, error: new Error("dispatch failed") },
]) {
  const failure = developmentBrowserOwnerStageFailure({
    ownerId: "cart",
    lifecycleResult: {
      child,
      lifecycleEvidence: null,
      lifecycleFailure: null,
    },
    ownerStarted: true,
    consumed: true,
    lifecyclePublicationFailure: new Error("no safe lifecycle evidence"),
  });
  assert.equal(
    failure.classification,
    child.error ? "INFRASTRUCTURE_TRANSIENT" : "PRODUCT_ASSERTION_FAILURE",
  );
  assert.equal(failure.consumed, true);
  assert.match(failure.cleanupFailure.message, /no safe lifecycle evidence/);
}

for (const scenario of [
  {
    label: "unexpected-tracked",
    mutate(value) {
      writeFileSync(path.join(value.root, "marker.txt"), "unexpected\n");
    },
    issue: "unexpected-tracked-paths",
  },
  {
    label: "ordinary-untracked",
    mutate(value) {
      writeFileSync(path.join(value.root, "unexpected.txt"), "untracked\n");
    },
    issue: "ordinary-untracked-paths",
  },
  {
    label: "unrelated-ignored",
    mutate(value) {
      writeFileSync(path.join(value.root, "unrelated.ignored"), "ignored\n");
    },
    issue: "unexpected-ignored-paths",
  },
  {
    label: "altered-next-environment",
    mutate(value) {
      writeFileSync(path.join(value.root, "next-env.d.ts"), "altered\n");
    },
    issue: "differs from its exact content contract",
  },
  {
    label: "altered-retailer-inventory",
    ownerId: "retailer",
    mutate(value) {
      writeFileSync(
        path.join(value.root, RETAILER_BROWSER_FIXTURE_OUTPUT_PATH, "extra.js"),
        "unexpected fixture\n",
      );
    },
    issue: "altered exact inventory",
  },
  {
    label: "altered-retailer-empty-directory",
    ownerId: "retailer",
    mutate(value) {
      mkdirSync(
        path.join(
          value.root,
          RETAILER_BROWSER_FIXTURE_OUTPUT_PATH,
          "unexpected-empty-directory",
        ),
      );
    },
    issue: "altered exact inventory",
  },
]) {
  withFixture(scenario.label, (value) => {
    const ownerId = scenario.ownerId ?? "cart";
    const lifecycle = begin(value, ownerId);
    produceExpectedOutputs(value, ownerId);
    scenario.mutate(value);
    const failure = retainedFailure(() =>
      completeBrowserServerTrackedOutputLifecycle(lifecycle, {
        processExitCode: 0,
      }),
    );
    assert.equal(failure.code, "BROWSER_SERVER_GENERATED_OUTPUT_REJECTED");
    assert.match(failure.safeEvidence.trackedOutput.issues.join("\n"), new RegExp(scenario.issue));
    assert.equal(failure.safeEvidence.terminalWorktree.complete, false);
  });
}

withFixture("altered-after-seal", (value) => {
  const lifecycle = begin(value, "cart");
  produceExpectedOutputs(value, "cart");
  const failure = retainedFailure(() =>
    completeBrowserServerTrackedOutputLifecycle(lifecycle, {
      processExitCode: 0,
      testHooks: {
        afterEvidenceSealed() {
          writeFileSync(
            path.join(value.root, NEXT_DEV_GENERATED_OUTPUT_PATH, "build-manifest.json"),
            "altered after seal\n",
          );
        },
      },
    }),
  );
  assert.match(
    failure.safeEvidence.trackedOutput.issues.join("\n"),
    /changed after evidence sealing/,
  );
  assert.equal(failure.safeEvidence.cleanup.postCleanupAbsenceProof, false);
  assert.equal(failure.safeEvidence.terminalWorktree.complete, false);
});

withFixture("symlink-output", (value) => {
  const lifecycle = begin(value, "cart");
  mkdirSync(path.join(value.root, ".next"));
  symlinkSync(value.outsideRoot, path.join(value.root, NEXT_DEV_GENERATED_OUTPUT_PATH));
  writeFileSync(
    path.join(value.root, "next-env.d.ts"),
    NEXT_DEV_GENERATED_TYPE_DECLARATION_BYTES,
  );
  const failure = retainedFailure(() =>
    completeBrowserServerTrackedOutputLifecycle(lifecycle, { processExitCode: 0 }),
  );
  assert.match(failure.safeEvidence.trackedOutput.issues.join("\n"), /symlink/);
  assertProtectedRootsUnchanged(value);
});

withFixture("traversal-descendant", (value) => {
  const lifecycle = begin(value, "cart");
  produceExpectedOutputs(value, "cart");
  symlinkSync(
    "../../../../outside-root",
    path.join(value.root, NEXT_DEV_GENERATED_OUTPUT_PATH, "server", "escape"),
  );
  const failure = retainedFailure(() =>
    completeBrowserServerTrackedOutputLifecycle(lifecycle, { processExitCode: 0 }),
  );
  assert.match(failure.safeEvidence.trackedOutput.issues.join("\n"), /symlink/);
  assertProtectedRootsUnchanged(value);
});

withFixture("outside-root-parent", (value) => {
  const lifecycle = begin(value, "cart");
  symlinkSync(value.outsideRoot, path.join(value.root, ".next"));
  writeFileSync(path.join(value.outsideRoot, "dev"), "outside generated decoy\n");
  writeFileSync(
    path.join(value.root, "next-env.d.ts"),
    NEXT_DEV_GENERATED_TYPE_DECLARATION_BYTES,
  );
  const failure = retainedFailure(() =>
    completeBrowserServerTrackedOutputLifecycle(lifecycle, { processExitCode: 0 }),
  );
  assert.match(failure.safeEvidence.trackedOutput.issues.join("\n"), /symlink/);
  assert.equal(
    readFileSync(path.join(value.outsideRoot, "dev"), "utf8"),
    "outside generated decoy\n",
  );
});

withFixture("foreign-attempt", (value) => {
  produceExpectedOutputs(value, "cart");
  assert.throws(() => begin(value, "cart"), /clean detached|foreign attempt/);
  assert.equal(existsSync(path.join(value.root, NEXT_DEV_GENERATED_OUTPUT_PATH)), true);
});

withFixture("wrong-worktree", (value) => {
  assert.throws(
    () =>
      begin(value, "cart", {
        candidate: { ...value.candidate, treeSha: "f".repeat(40) },
      }),
    /clean detached development-browser candidate/,
  );
  assert.throws(
    () => begin(value, "cart", { readinessUrl: "http://127.0.0.1:3317" }),
    /server contract is invalid/,
  );
  assertClean(value);
});

withFixture("tampered-evidence", (value) => {
  const lifecycle = begin(value, "cart");
  produceExpectedOutputs(value, "cart");
  const evidence = completeBrowserServerTrackedOutputLifecycle(lifecycle, {
    processExitCode: 0,
  });
  for (const mutation of [
    (copy) => {
      copy.server.retries = 1;
    },
    (copy) => {
      copy.generatedOutputs[0].relativePath = ".next";
    },
    (copy) => {
      copy.generatedOutputs[0].entries[1].sha256 = "1".repeat(64);
    },
    (copy) => {
      copy.terminalWorktree.complete = false;
    },
    (copy) => {
      copy.ownershipIdentitySha256 = "0".repeat(64);
    },
    (copy) => {
      copy.candidateId = "different-candidate";
    },
    (copy) => {
      copy.dependencyBinding.dependencyIdentitySha256 = "a".repeat(64);
    },
  ]) {
    const copy = structuredClone(evidence);
    mutation(copy);
    assert.match(
      browserServerTrackedOutputEvidenceIssues(resealEvidence(copy)).join("\n"),
      /invalid or incomplete/,
    );
  }
  for (const mutation of [
    (copy) => {
      copy.candidateId = "different-candidate";
    },
    (copy) => {
      copy.dependencyBinding.dependencyIdentitySha256 = "a".repeat(64);
    },
    (copy) => {
      copy.dependencyBinding.dependencyInventorySha256 = "c".repeat(64);
    },
  ]) {
    const copy = structuredClone(evidence);
    mutation(copy);
    assert.match(
      browserServerTrackedOutputEvidenceIssues(
        resealOwnership(copy),
        expectedIdentity(value),
      ).join("\n"),
      /invalid or incomplete/,
    );
  }
  assertClean(value);
});

withFixture("simulation", (value) => {
  const evidence = simulatedBrowserServerTrackedOutputLifecycle({
    repositoryRoot: value.root,
    candidate: value.candidate,
    certificationId: "browser-server-lifecycle-simulation",
    ownerId: "retailer",
    stageAttempt: 2,
    dependencyBinding: value.dependencyBinding,
  });
  assert.equal(evidence.executionClass, "deterministic-simulation");
  assert.equal(evidence.generatedOutputs.length, 3);
  assert.equal(evidence.server.retries, 0);
  assert.equal(evidence.terminalWorktree.complete, true);
  assert.deepEqual(browserServerTrackedOutputEvidenceIssues(evidence), []);
  assertClean(value);
});

assert.deepEqual(
  developmentBrowserGeneratedOutputDeclarations("cart").map(
    (entry) => entry.relativePath,
  ),
  [NEXT_DEV_GENERATED_OUTPUT_PATH, "next-env.d.ts"],
);
assert.deepEqual(
  developmentBrowserGeneratedOutputDeclarations("retailer").map(
    (entry) => entry.relativePath,
  ),
  [
    NEXT_DEV_GENERATED_OUTPUT_PATH,
    "next-env.d.ts",
    RETAILER_BROWSER_FIXTURE_OUTPUT_PATH,
  ],
);
assert.match(readFileSync("playwright.cart-overlay.config.ts", "utf8"), /retries: 0/);
assert.match(
  readFileSync("playwright.retailer-confirmation.config.ts", "utf8"),
  /retries: 0/,
);

console.log(
  "Production certification development-browser generated-output lifecycle checks passed.",
);
