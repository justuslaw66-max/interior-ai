import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

type SmokeRow = {
  status?: string;
  evidence?: string;
  notes?: string;
};

type SmokeResult = {
  base?: string;
  latestFeedbackBase?: string;
  latestFeedbackDeploymentId?: string;
  stableAlias?: string;
  stableAliasTarget?: string;
  stableAliasPromotionEvidence?: string;
  rows?: Record<string, SmokeRow>;
  fields?: Record<string, unknown>;
  notes?: string[];
  error?: unknown;
};

type FeedbackReferenceResult = {
  base?: string;
  deploymentId?: string;
  response?: {
    status?: number;
    ok?: boolean;
    persisted?: boolean;
    eventId?: string;
  };
};

type StableAliasPromotionResult = {
  stableAlias?: string;
  targetPreview?: string;
  deploymentId?: string;
  status?: string;
  verification?: {
    deploymentProtection?: string;
  };
};

type RetestResult = {
  rows?: Record<string, SmokeRow>;
  artifacts?: {
    checkout?: {
      status?: number;
      hasUrl?: boolean;
    };
  };
  error?: unknown;
};

const root = process.cwd();
const evidenceDir = join(root, "reports/staging-smoke-evidence-2026-06-24");
const checklistPath = join(root, "reports/beta-staging-smoke-checklist-2026-06-23.md");
const hygienePath = join(root, "reports/beta-release-hygiene-2026-06-22.md");
const smokePath = join(evidenceDir, "smoke-result.json");
const feedbackPath = join(evidenceDir, "feedback-reference-result.json");
const aliasPath = join(evidenceDir, "stable-alias-promotion-result.json");
const retestPath = join(evidenceDir, "retest-checkout-fingerprint-result.json");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function assertArtifactExists(path: string) {
  const absPath = resolve(root, path);
  assert.ok(absPath.startsWith(root), `artifact must stay inside repository: ${path}`);
  assert.ok(existsSync(absPath), `referenced evidence artifact should exist: ${path}`);
  assert.ok(statSync(absPath).size > 0, `referenced evidence artifact should not be empty: ${path}`);
}

function collectReportArtifacts(value: string) {
  return [...value.matchAll(/reports\/staging-smoke-evidence-2026-06-24\/[A-Za-z0-9._/-]+/g)].map(
    (match) => match[0].replace(/[).,;:]+$/, "")
  );
}

const checklist = readFileSync(checklistPath, "utf8");
const hygiene = readFileSync(hygienePath, "utf8");
const smoke = readJson<SmokeResult>(smokePath);
const feedback = readJson<FeedbackReferenceResult>(feedbackPath);
const alias = readJson<StableAliasPromotionResult>(aliasPath);
const retest = readJson<RetestResult>(retestPath);

assert.equal(smoke.error, null, "smoke-result should not contain an error.");
assert.ok(smoke.rows, "smoke-result should contain smoke rows.");
for (const [rowId, row] of Object.entries(smoke.rows ?? {})) {
  assert.equal(row.status, "PASS", `smoke-result row should pass: ${rowId}`);
  assert.ok(row.evidence, `smoke-result row should include evidence: ${rowId}`);
}

assert.equal(retest.error, null, "checkout/fingerprint retest should not contain an error.");
for (const [rowId, row] of Object.entries(retest.rows ?? {})) {
  assert.equal(row.status, "PASS", `checkout/fingerprint retest row should pass: ${rowId}`);
}
assert.equal(retest.artifacts?.checkout?.status, 503, "checkout boundary should fail closed with HTTP 503.");
assert.equal(retest.artifacts?.checkout?.hasUrl, false, "checkout boundary must not return a checkout URL.");

assert.equal(feedback.base, smoke.latestFeedbackBase, "feedback evidence should target the latest feedback preview.");
assert.equal(
  feedback.deploymentId,
  smoke.latestFeedbackDeploymentId,
  "feedback evidence should match the latest feedback deployment."
);
assert.equal(feedback.response?.status, 200, "feedback reference API should return HTTP 200.");
assert.equal(feedback.response?.ok, true, "feedback reference API should report ok.");
assert.equal(feedback.response?.persisted, true, "feedback reference API should persist the event.");
assert.equal(
  feedback.response?.eventId,
  smoke.fields?.feedbackReportId,
  "feedback report id should match the smoke evidence field."
);
assert.match(String(feedback.response?.eventId ?? ""), /^cm[a-z0-9]+$/, "feedback report id should look durable.");

assert.equal(alias.status, "READY", "stable alias target should be ready.");
assert.equal(alias.stableAlias, smoke.stableAlias, "stable alias evidence should match smoke-result.");
assert.equal(alias.targetPreview, smoke.stableAliasTarget, "stable alias target should match smoke-result.");
assert.equal(
  alias.deploymentId,
  smoke.latestFeedbackDeploymentId,
  "stable alias should point at the latest feedback deployment."
);
assert.match(
  String(alias.verification?.deploymentProtection ?? ""),
  /SSO|Deployment Protection/i,
  "stable alias evidence should confirm deployment protection remains enabled."
);

assert.match(checklist, /Result: `PASS` \/ `FAIL` -> `PASS`/, "staging checklist should be signed off.");
assert.match(
  checklist,
  /Required evidence complete: `YES` \/ `NO` -> `YES`/,
  "staging checklist should mark required evidence complete."
);
assert.match(checklist, /Blocking issues: None/, "staging checklist should have no blocking issues.");
assert.ok(checklist.includes("stable-alias-promotion-result.json"), "checklist should link alias promotion evidence.");
assert.ok(checklist.includes(String(feedback.response?.eventId)), "checklist should include feedback report id.");
assert.ok(hygiene.includes("stable-alias-promotion-result.json"), "hygiene report should link alias evidence.");

const linkedArtifacts = new Set<string>([
  "reports/staging-smoke-evidence-2026-06-24/smoke-result.json",
  "reports/staging-smoke-evidence-2026-06-24/retest-checkout-fingerprint-result.json",
  "reports/staging-smoke-evidence-2026-06-24/feedback-reference-result.json",
  "reports/staging-smoke-evidence-2026-06-24/stable-alias-promotion-result.json",
]);
for (const row of Object.values(smoke.rows ?? {})) {
  for (const artifact of collectReportArtifacts(`${row.evidence ?? ""} ${row.notes ?? ""}`)) {
    linkedArtifacts.add(artifact);
  }
}
for (const fieldValue of Object.values(smoke.fields ?? {})) {
  if (typeof fieldValue === "string") {
    for (const artifact of collectReportArtifacts(fieldValue)) {
      linkedArtifacts.add(artifact);
    }
  }
}
for (const artifact of linkedArtifacts) {
  assertArtifactExists(artifact);
}

const rawHeaderNeedles = [
  "set-cookie:",
  "authorization:",
  "cookie:",
  ["x", "vercel", "protection", "bypass"].join("-"),
  ["_", "vercel", "jwt"].join(""),
];
for (const artifact of linkedArtifacts) {
  if (!artifact.endsWith(".json") && !artifact.endsWith(".md") && !artifact.endsWith(".txt")) {
    continue;
  }
  const content = readFileSync(resolve(root, artifact), "utf8").toLowerCase();
  for (const needle of rawHeaderNeedles) {
    assert.ok(
      !content.includes(needle),
      `evidence artifact should not store raw auth/protection headers: ${artifact}`
    );
  }
}

console.log("Beta staging evidence checks passed.");
