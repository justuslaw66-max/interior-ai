import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STAGING_SMOKE_CHECKLIST_ROWS,
  STAGING_SMOKE_HARD_STOPS,
  STAGING_SMOKE_REQUIRED_EVIDENCE_FIELDS,
  buildStagingSmokeEvidenceBundle,
  stagingSmokeEvidenceToCsv,
  stagingSmokeEvidenceToJson,
  stagingSmokeEvidenceToMarkdown,
} from "../lib/beta-staging-evidence";

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
const stagingEvidenceSource = readFileSync(join(root, "lib/beta-staging-evidence.ts"), "utf8");
const adminPageSource = readFileSync(join(root, "app/admin/page.tsx"), "utf8");
const designPageSource = readFileSync(join(root, "app/design/page.tsx"), "utf8");
const stagingEvidencePanelSource = readFileSync(
  join(root, "components/admin/StagingSmokeEvidencePanel.tsx"),
  "utf8"
);
const appEventsSource = readFileSync(join(root, "lib/app-events.ts"), "utf8");
const appEventRouteSource = readFileSync(join(root, "app/api/track/app-event/route.ts"), "utf8");
const betaSmokeSource = readFileSync(join(root, "tests/e2e/00-beta-smoke.spec.ts"), "utf8");
const stagingSignoffSource = readFileSync(join(root, "tests/e2e/19-staging-signoff.spec.ts"), "utf8");
const mobilePlanModeSource = readFileSync(join(root, "tests/e2e/20-mobile-plan-mode.spec.ts"), "utf8");

const releaseCandidateScript = packageJson.scripts?.["test:beta-release-candidate"] ?? "";
const stagingChecklistScript = packageJson.scripts?.["test:beta-staging-checklist"] ?? "";
const stagingEvidenceScript = packageJson.scripts?.["test:beta-staging-evidence"] ?? "";
const releaseHandoffScript = packageJson.scripts?.["test:beta-release-handoff"] ?? "";
const betaE2eScript = packageJson.scripts?.["test:e2e:beta"] ?? "";
const betaEditorPolishScript = packageJson.scripts?.["test:beta-editor-polish"] ?? "";
const mobilePlanScript = packageJson.scripts?.["test:e2e:mobile-plan"] ?? "";

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
  releaseCandidateScript,
  /npm run test:beta-staging-evidence/,
  "release candidate script should verify the completed staging evidence bundle."
);
assert.match(
  releaseCandidateScript,
  /npm run test:beta-release-handoff/,
  "release candidate script should verify the release handoff manifest."
);
assert.match(
  stagingChecklistScript,
  /scripts\/test-beta-staging-checklist\.ts/,
  "staging checklist script should run this guard."
);
assert.match(
  stagingEvidenceScript,
  /scripts\/test-beta-staging-evidence\.ts/,
  "staging evidence script should run the evidence bundle guard."
);
assert.match(
  releaseHandoffScript,
  /scripts\/test-beta-release-handoff\.ts/,
  "release handoff script should run the handoff manifest guard."
);
assert.match(
  betaE2eScript,
  /00-beta-smoke\.spec\.ts[\s\S]*19-staging-signoff\.spec\.ts[\s\S]*20-mobile-plan-mode\.spec\.ts/,
  "beta e2e script should run beta smoke, staging signoff, and mobile Plan mode specs."
);
assert.match(
  betaEditorPolishScript,
  /test:floor-plan-quality[\s\S]*test:load-design-delete-modal[\s\S]*test:room-resize-handle-style/,
  "beta editor polish should include floor-plan quality, saved-design delete, and resize-handle guardrails."
);
assert.match(
  mobilePlanScript,
  /20-mobile-plan-mode\.spec\.ts/,
  "mobile Plan script should run the focused mobile/tablet Plan mode guard."
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
assert.equal(
  STAGING_SMOKE_CHECKLIST_ROWS.length,
  14,
  "staging evidence helper should mirror the full 14-row smoke path."
);
for (const row of STAGING_SMOKE_CHECKLIST_ROWS) {
  assert.ok(row.id, "staging checklist rows need stable ids.");
  assert.ok(row.step, `staging checklist row ${row.id} needs a step label.`);
  assert.ok(row.expectedResult, `staging checklist row ${row.id} needs an expected result.`);
  assert.ok(["TODO", "PASS", "FAIL", "N/A"].includes(row.status), `staging checklist row ${row.id} needs a valid status.`);
  assert.ok(row.evidenceRequired, `staging checklist row ${row.id} needs evidence requirements.`);
  assert.equal(typeof row.evidenceArtifact, "string", `staging checklist row ${row.id} needs an evidence artifact field.`);
  assert.equal(typeof row.notes, "string", `staging checklist row ${row.id} needs notes.`);
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
for (const requiredEvidenceField of STAGING_SMOKE_REQUIRED_EVIDENCE_FIELDS) {
  assert.ok(
    checklist.includes(requiredEvidenceField),
    `staging evidence helper field should be documented in checklist: ${requiredEvidenceField}`
  );
}
for (const hardStop of STAGING_SMOKE_HARD_STOPS) {
  assert.ok(
    checklist.includes(hardStop),
    `staging evidence hard stop should be documented in checklist: ${hardStop}`
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
assert.match(
  hygieneReport,
  /npm run test:beta-staging-evidence/,
  "beta release hygiene report should point to the staging evidence guard."
);
assert.match(
  hygieneReport,
  /beta-release-handoff-2026-06-24\.md/,
  "beta release hygiene report should link the release handoff manifest."
);
assert.match(
  stagingEvidenceSource,
  /stagingSmokeEvidenceToCsv[\s\S]*stagingSmokeEvidenceToMarkdown[\s\S]*stagingSmokeEvidenceToJson/,
  "staging evidence helper should provide JSON, CSV, and Markdown serializers."
);
const fixtureBundle = buildStagingSmokeEvidenceBundle({
  generatedAt: new Date("2026-06-24T00:00:00.000Z"),
  evidence: {
    stagingDeploymentUrl: "https://staging.example.test",
    buildIdOrCommitSha: "abc123",
    tester: "qa@example.test",
    savedDesignId: "design_123",
    shareToken: "share_123",
    editorSnapshotFingerprint: "deadbeef",
    shareSnapshotFingerprint: "deadbeef",
    exportSnapshotFingerprint: "deadbeef",
  },
});
assert.match(stagingSmokeEvidenceToJson(fixtureBundle), /"savedDesignId": "design_123"/);
assert.match(stagingSmokeEvidenceToCsv(fixtureBundle), /"checklist_id","step","expected_result","status","evidence_required","evidence_artifact","notes"/);
assert.match(stagingSmokeEvidenceToMarkdown(fixtureBundle), /# Beta Staging Smoke Evidence/);
assert.match(
  adminPageSource,
  /StagingSmokeEvidencePanel[\s\S]*buildStagingSmokeEvidenceBundle/,
  "admin overview should render the staging smoke evidence panel from the shared helper."
);
assert.match(
  stagingEvidencePanelSource,
  /data-testid="staging-smoke-evidence"[\s\S]*data-testid="staging-smoke-evidence-json"[\s\S]*data-testid="staging-smoke-evidence-csv"[\s\S]*data-testid="staging-smoke-evidence-markdown"/,
  "staging evidence panel should expose JSON, CSV, and Markdown downloads."
);
assert.match(
  stagingEvidencePanelSource,
  /data-testid="staging-smoke-evidence-copy-json"[\s\S]*data-testid="staging-smoke-evidence-copy-markdown"/,
  "staging evidence panel should expose copy actions."
);
assert.match(
  stagingEvidencePanelSource,
  /localStorage[\s\S]*staging-smoke-progress-summary[\s\S]*staging-smoke-row-status-\$\{row\.id\}[\s\S]*staging-smoke-row-evidence-\$\{row\.id\}[\s\S]*staging-smoke-row-notes-\$\{row\.id\}/,
  "staging evidence panel should persist tester edits and expose editable row status, evidence, and notes."
);
assert.match(
  stagingEvidencePanelSource,
  /savedDesignId: "Saved design ID"[\s\S]*shareToken: "Share token"[\s\S]*editorSnapshotFingerprint: "Editor fingerprint"[\s\S]*staging-smoke-evidence-field-\$\{field\}/,
  "staging evidence panel should expose editable required evidence fields."
);
assert.match(
  stagingEvidencePanelSource,
  /stagingSmokeEvidenceToJson\(draftBundle\)[\s\S]*stagingSmokeEvidenceToCsv\(draftBundle\)[\s\S]*stagingSmokeEvidenceToMarkdown\(draftBundle\)/,
  "staging evidence exports should use the edited worksheet state."
);
assert.ok(
  [
    "firstRunActivationTrackedStepsRef",
    "first_run_activation_step_completed",
    "guided_plan_actions",
    "viewport_width",
  ].every((token) => designPageSource.includes(token)),
  "design page should track first-run activation step completion with useful funnel context."
);
assert.match(
  appEventsSource,
  /first_run_activation_step_completed/,
  "first-run activation step completion should be an app event type."
);
assert.match(
  appEventRouteSource,
  /first_run_activation_step_completed/,
  "first-run activation step completion should be accepted by the app-event API."
);
assert.match(
  appEventRouteSource,
  /eventId:\s*result\.eventId/,
  "app-event API should return persisted event ids so staging feedback evidence can be recorded."
);
assert.match(
  mobilePlanModeSource,
  /390[\s\S]*768[\s\S]*plan-guided-actions-toggle[\s\S]*plan-manual-quick-actions[\s\S]*manual-plan-action-fit[\s\S]*scrollWidth/,
  "mobile Plan mode spec should guard phone/tablet controls, manual actions, and overflow."
);
assert.match(
  betaSmokeSource,
  /editorSnapshotFingerprint[\s\S]*shareSnapshotFingerprint[\s\S]*exportSnapshotFingerprint[\s\S]*pdfFilename[\s\S]*csvFilename[\s\S]*pngFilename[\s\S]*svgFilename[\s\S]*checkoutBoundaryResponseMode/,
  "beta smoke should collect staging signoff evidence fields from the full path."
);
assert.match(
  stagingSignoffSource,
  /staging-smoke-evidence[\s\S]*staging-smoke-evidence-json[\s\S]*staging-smoke-evidence-csv[\s\S]*staging-smoke-evidence-markdown/,
  "staging signoff Playwright spec should verify the admin evidence panel exports."
);

console.log("Beta staging smoke checklist checks passed.");
