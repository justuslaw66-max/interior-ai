import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

type SmokeResult = {
  latestFeedbackBase?: string;
  latestFeedbackDeploymentId?: string;
  stableAlias?: string;
  stableAliasTarget?: string;
  fields?: Record<string, unknown>;
  error?: unknown;
};

type StableAliasPromotionResult = {
  stableAlias?: string;
  targetPreview?: string;
  deploymentId?: string;
  status?: string;
};

type RetestResult = {
  artifacts?: {
    checkout?: {
      status?: number;
      hasUrl?: boolean;
    };
  };
  error?: unknown;
};

type FeedbackReferenceResult = {
  response?: {
    eventId?: string;
    persisted?: boolean;
  };
};

const root = process.cwd();
const handoffPath = join(root, "reports/beta-release-handoff-2026-06-24.md");
const hygienePath = join(root, "reports/beta-release-hygiene-2026-06-22.md");
const checklistPath = join(root, "reports/beta-staging-smoke-checklist-2026-06-23.md");
const smokePath = join(root, "reports/staging-smoke-evidence-2026-06-24/smoke-result.json");
const artifactManifestPath = join(root, "reports/staging-smoke-evidence-2026-06-24/artifact-manifest.json");
const aliasPath = join(root, "reports/staging-smoke-evidence-2026-06-24/stable-alias-promotion-result.json");
const retestPath = join(root, "reports/staging-smoke-evidence-2026-06-24/retest-checkout-fingerprint-result.json");
const feedbackPath = join(root, "reports/staging-smoke-evidence-2026-06-24/feedback-reference-result.json");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function assertRepoArtifact(path: string) {
  const absPath = resolve(root, path);
  assert.ok(absPath.startsWith(root), `handoff artifact must stay inside repository: ${path}`);
  assert.ok(existsSync(absPath), `handoff artifact should exist: ${path}`);
  assert.ok(statSync(absPath).size > 0, `handoff artifact should not be empty: ${path}`);
}

function collectReportArtifacts(value: string) {
  return [...value.matchAll(/reports\/[A-Za-z0-9._/-]+/g)].map((match) =>
    match[0].replace(/[).,;:]+$/, "")
  );
}

const handoff = readFileSync(handoffPath, "utf8");
const hygiene = readFileSync(hygienePath, "utf8");
const checklist = readFileSync(checklistPath, "utf8");
const smoke = readJson<SmokeResult>(smokePath);
const artifactManifest = readJson<{ fileCount?: number; entries?: unknown[] }>(artifactManifestPath);
const alias = readJson<StableAliasPromotionResult>(aliasPath);
const retest = readJson<RetestResult>(retestPath);
const feedback = readJson<FeedbackReferenceResult>(feedbackPath);

assert.equal(smoke.error, null, "handoff should point at a successful smoke result.");
assert.equal(artifactManifest.fileCount, artifactManifest.entries?.length, "handoff artifact manifest should be internally consistent.");
assert.equal(retest.error, null, "handoff should point at a successful checkout/fingerprint retest.");
assert.equal(alias.status, "READY", "handoff alias target should be ready.");
assert.equal(alias.stableAlias, smoke.stableAlias, "handoff stable alias should match smoke evidence.");
assert.equal(alias.targetPreview, smoke.stableAliasTarget, "handoff alias target should match smoke evidence.");
assert.equal(alias.deploymentId, smoke.latestFeedbackDeploymentId, "handoff deployment should match smoke evidence.");
assert.equal(retest.artifacts?.checkout?.status, 503, "handoff checkout boundary should fail closed.");
assert.equal(retest.artifacts?.checkout?.hasUrl, false, "handoff checkout boundary should not include a checkout URL.");
assert.equal(feedback.response?.persisted, true, "handoff feedback evidence should be persisted.");
assert.equal(
  feedback.response?.eventId,
  smoke.fields?.feedbackReportId,
  "handoff feedback id should match smoke evidence."
);

for (const required of [
  "# Beta Release Handoff - 2026-06-24",
  "ready for beta release review",
  String(smoke.stableAlias),
  String(smoke.stableAliasTarget),
  String(smoke.latestFeedbackDeploymentId),
  String(feedback.response?.eventId),
  "Staging result: `PASS`",
  "Required evidence complete: `YES`",
  "Hard stops reviewed: `YES`",
  "npm run test:beta-release-candidate",
  "npm run test:beta-staging-evidence",
  "npm run test:beta-staging-artifacts",
  "reports/staging-smoke-evidence-2026-06-24/artifact-manifest.json",
  "Rotate the Vercel automation bypass secret",
]) {
  assert.ok(handoff.includes(required), `handoff should include: ${required}`);
}

for (const artifact of collectReportArtifacts(handoff)) {
  assertRepoArtifact(artifact);
}

const releaseCandidateScript = packageJson.scripts?.["test:beta-release-candidate"] ?? "";
assert.match(
  releaseCandidateScript,
  /npm run test:beta-staging-artifacts/,
  "release candidate command should run the artifact manifest guard."
);
assert.match(
  releaseCandidateScript,
  /npm run test:beta-release-handoff/,
  "release candidate command should run the handoff guard."
);
assert.match(
  packageJson.scripts?.["test:beta-staging-artifacts"] ?? "",
  /scripts\/test-beta-staging-artifacts\.ts/,
  "package should expose the artifact manifest guard."
);
assert.match(
  packageJson.scripts?.["test:beta-release-handoff"] ?? "",
  /scripts\/test-beta-release-handoff\.ts/,
  "package should expose the handoff guard."
);
assert.ok(hygiene.includes("beta-release-handoff-2026-06-24.md"), "hygiene report should link the handoff.");
assert.ok(checklist.includes("npm run test:beta-staging-evidence"), "checklist should mention staging evidence guard.");

const rawSecretNeedles = [
  ["x", "vercel", "protection", "bypass"].join("-"),
  ["_", "vercel", "jwt"].join(""),
  "authorization:",
  "set-cookie:",
  "cookie:",
];
for (const content of [handoff, hygiene, checklist]) {
  const normalized = content.toLowerCase();
  for (const needle of rawSecretNeedles) {
    assert.ok(!normalized.includes(needle), `release handoff docs should not store raw auth material: ${needle}`);
  }
}

console.log("Beta release handoff checks passed.");
