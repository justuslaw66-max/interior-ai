import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEFAULT_TRACKED_ARTIFACT_POLICY,
  evaluateTrackedArtifactHygiene,
  inspectTrackedArtifactHygiene,
  normalizeRepositoryPath,
} from "./code-quality/tracked-artifact-policy.mjs";

const repositories = [];

function git(root, arguments_) {
  return execFileSync("git", arguments_, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function write(root, relativePath, contents = "fixture\n") {
  const absolutePath = join(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function makeRepository({ tracked = {}, forceTracked = {}, untracked = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "interior-ai-tracked-artifacts-"));
  repositories.push(root);
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.name", "Tracked Artifact Test"]);
  git(root, ["config", "user.email", "tracked-artifact-test@example.invalid"]);
  write(
    root,
    ".gitignore",
    "/test-results\n/playwright-report\n/.next/\n/.local/\n*.db\n*.db-journal\n*.sqlite\n*.sqlite3\n*.ignored\n.env*\n!.env.staging.template\n",
  );
  write(root, "src/valid.ts", "export const valid = true;\n");
  for (const [relativePath, contents] of Object.entries(tracked)) write(root, relativePath, contents);
  for (const [relativePath, contents] of Object.entries(forceTracked)) write(root, relativePath, contents);
  git(root, ["add", ".gitignore", "src/valid.ts", ...Object.keys(tracked)]);
  for (const relativePath of Object.keys(forceTracked)) git(root, ["add", "--force", relativePath]);
  git(root, ["commit", "--quiet", "-m", "fixture"]);
  for (const [relativePath, contents] of Object.entries(untracked)) write(root, relativePath, contents);
  return root;
}

function failureCodes(root, policy) {
  return inspectTrackedArtifactHygiene(root, policy).map((failure) => failure.code);
}

try {
  const trackedLastRun = makeRepository({
    forceTracked: { "test-results/.last-run.json": "{\"status\":\"passed\"}\n" },
  });
  assert.deepEqual(failureCodes(trackedLastRun), ["TRACKED_GENERATED_OUTPUT"]);

  const ignoredLastRun = makeRepository({
    untracked: { "test-results/.last-run.json": "{\"status\":\"passed\"}\n" },
  });
  assert.deepEqual(inspectTrackedArtifactHygiene(ignoredLastRun), []);
  assert.match(git(ignoredLastRun, ["check-ignore", "test-results/.last-run.json"]), /\.last-run\.json/);
  assert.equal(git(ignoredLastRun, ["status", "--porcelain", "--untracked-files=all"]), "");

  const trackedFrameworkOutput = makeRepository({
    forceTracked: {
      ".next/cache/trace": "generated\n",
      ".local/asset-inventory.json": "{}\n",
      "playwright-report/index.html": "generated\n",
    },
  });
  assert.deepEqual(failureCodes(trackedFrameworkOutput), [
    "TRACKED_GENERATED_OUTPUT",
    "TRACKED_GENERATED_OUTPUT",
    "TRACKED_GENERATED_OUTPUT",
  ]);

  const trackedIgnored = makeRepository({ forceTracked: { "notes/cache.ignored": "generated\n" } });
  assert.deepEqual(failureCodes(trackedIgnored), ["TRACKED_IGNORED_FILE"]);
  assert.deepEqual(
    inspectTrackedArtifactHygiene(trackedIgnored, {
      ...DEFAULT_TRACKED_ARTIFACT_POLICY,
      intentionalTrackedIgnoredPaths: ["notes/cache.ignored"],
    }),
    [],
  );

  const trackedDatabase = makeRepository({ forceTracked: { "prisma/dev.db": "" } });
  assert.deepEqual(failureCodes(trackedDatabase), ["TRACKED_MUTABLE_DATABASE"]);

  const fixturePath = "tests/fixtures/catalog.sqlite";
  const trackedDatabaseFixture = makeRepository({ forceTracked: { [fixturePath]: "SQLite fixture bytes\n" } });
  assert.deepEqual(failureCodes(trackedDatabaseFixture), ["TRACKED_MUTABLE_DATABASE"]);
  assert.deepEqual(
    inspectTrackedArtifactHygiene(trackedDatabaseFixture, {
      ...DEFAULT_TRACKED_ARTIFACT_POLICY,
      databaseFixturePaths: [fixturePath],
    }),
    [],
  );

  const cleanSource = makeRepository({
    tracked: { ".env.staging.template": "DATABASE_URL=postgresql://placeholder.invalid/db\n" },
    untracked: { "node_modules/cache/dev.sqlite3": "ignored dependency output\n" },
  });
  assert.deepEqual(inspectTrackedArtifactHygiene(cleanSource), []);
  git(cleanSource, ["switch", "--detach", "--quiet"]);
  assert.deepEqual(inspectTrackedArtifactHygiene(cleanSource), []);

  assert.equal(normalizeRepositoryPath(".\\test-results\\.last-run.json"), "test-results/.last-run.json");
  assert.deepEqual(
    evaluateTrackedArtifactHygiene({
      trackedPaths: ["test-results\\.last-run.json", "src\\valid.ts"],
      ignoredTrackedPaths: ["test-results\\.last-run.json"],
    }),
    [{
      code: "TRACKED_GENERATED_OUTPUT",
      path: "test-results/.last-run.json",
      message: "Generated output under test-results/ must be removed from Git; keep it ignored and regenerate it locally.",
    }],
  );

  console.log("Tracked-artifact hygiene tests passed (9 policy and Git-index scenarios).");
} finally {
  for (const root of repositories) rmSync(root, { recursive: true, force: true });
}
