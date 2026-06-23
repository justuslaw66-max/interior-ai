import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const checklist = readFileSync(
  join(root, "reports/beta-staging-smoke-checklist-2026-06-23.md"),
  "utf8"
);
const hygieneReport = readFileSync(
  join(root, "reports/beta-release-hygiene-2026-06-22.md"),
  "utf8"
);

const releaseCandidateScript = packageJson.scripts?.["test:beta-release-candidate"] ?? "";
const stagingChecklistScript = packageJson.scripts?.["test:beta-staging-checklist"] ?? "";

assert.match(
  releaseCandidateScript,
  /npm run test:beta-gate/,
  "release candidate script should run the full beta gate."
);
assert.match(
  releaseCandidateScript,
  /CATALOG_CHECK_REMOTE_ASSETS=true npm run test:catalog-asset-availability/,
  "release candidate script should run remote catalog asset availability."
);
assert.match(
  releaseCandidateScript,
  /npm run test:beta-staging-checklist/,
  "release candidate script should verify the staging smoke checklist."
);
assert.match(
  stagingChecklistScript,
  /scripts\/test-beta-staging-checklist\.ts/,
  "staging checklist script should run this guard."
);

for (const required of [
  "Open staging `/design` signed out",
  "Sign in or create a staging test user",
  "Start from template",
  "Add or edit a room in 2D",
  "Place furniture manually",
  "Verify smart placement actions",
  "Fix shopping readiness",
  "Save and reload",
  "Create and open share link",
  "Export PDF",
  "Export shopping CSV",
  "Export 2D PNG/SVG",
  "Open retailer link",
  "Start checkout boundary",
]) {
  assert.ok(checklist.includes(required), `staging checklist should include: ${required}`);
}

assert.match(
  checklist,
  /Do not complete a real payment in staging/,
  "staging checklist should explicitly block real payment completion by default."
);
assert.match(
  checklist,
  /checkout start uses live Stripe keys or a production database in staging/,
  "staging checklist should guard against live Stripe keys or production DB usage."
);
assert.match(
  checklist,
  /Status \| Evidence required \| Evidence link\/artifact \| Notes/,
  "staging checklist should include guided pass/fail evidence columns."
);
assert.match(
  checklist,
  /Every row must be marked `PASS`, `FAIL`, or `N\/A`/,
  "staging checklist should require explicit row status."
);
for (const requiredEvidenceField of [
  "Build ID or commit SHA",
  "Saved design ID",
  "Share token",
  "Editor snapshot fingerprint",
  "Share snapshot fingerprint",
  "Export snapshot fingerprint",
  "Checkout boundary response mode",
  "Checkout diagnostics screenshot or redacted JSON",
  "Catalog commerce readiness screenshot",
  "Feedback report ID or copied payload filename",
]) {
  assert.ok(
    checklist.includes(requiredEvidenceField),
    `staging checklist should require evidence field: ${requiredEvidenceField}`
  );
}
assert.match(
  checklist,
  /Staging URL:[\s\S]*Build ID or commit SHA:[\s\S]*Tester:[\s\S]*Result: `PASS` \/ `FAIL`[\s\S]*Required evidence complete: `YES` \/ `NO`[\s\S]*Hard stops reviewed: `YES` \/ `NO`/,
  "staging checklist should include a manual signoff record with evidence completion."
);
assert.match(
  hygieneReport,
  /npm run test:beta-release-candidate/,
  "beta release hygiene report should point to the release candidate command."
);
assert.match(
  hygieneReport,
  /beta-staging-smoke-checklist-2026-06-23\.md/,
  "beta release hygiene report should link the staging smoke checklist."
);

console.log("Beta staging smoke checklist checks passed.");
