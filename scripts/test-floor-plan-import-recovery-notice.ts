import assert from "node:assert/strict";
import { importRecoveryNotice } from "@/components/editor/floor-plan-import-review/import-review-summary";
import type { FloorPlanReviewIssue } from "@/lib/floor-plan-imports/types";

// The upload review's recovery box (9 Nov 2026). J's HDB 670 upload stopped at "One small correction is needed" with
// "adjust the highlighted part of the plan", but its only blocker was the plan being over the 5 MB cap on a candidate:
// nothing to correct, and a rerun reads it the same way.

const issue = (code: string, message: string, resolved = false): FloorPlanReviewIssue =>
  ({ id: code, code, message, severity: "critical", resolved });
const tooLarge = issue("canonical_document_invalid", "candidate is larger than 5 MB");

function testTooLarge() {
  const notice = importRecoveryNotice({ needsRoomRecovery: false, unresolvedCritical: [issue("entrance_confirmation", "Confirm the main entrance."), tooLarge] });
  assert.equal(notice.title, "This floor plan has too much drawing detail to import");
  assert.match(notice.description, /Choose another file/);
  assert.equal(notice.retry, false, "rerunning detection would read it the same way");
}

function testOtherUnbuiltReading() {
  const notice = importRecoveryNotice({ needsRoomRecovery: false,
    unresolvedCritical: [issue("canonical_document_invalid", "Wall wall-3 crosses wall wall-9 without a shared vertex")] });
  assert.equal(notice.title, "AI couldn't build this floor plan");
  assert.equal(notice.retry, true, "a rerun may read it differently");
}

function testUnchangedCases() {
  assert.equal(importRecoveryNotice({ needsRoomRecovery: true, unresolvedCritical: [tooLarge] }).title,
    "For the fastest result, upload the original floor plan", "no rooms or walls comes first, as before");
  const correction = importRecoveryNotice({ needsRoomRecovery: false, unresolvedCritical: [], prerequisite: "Set scale with the tracing tools first." });
  assert.deepEqual(correction, { title: "One small correction is needed", retry: true, description: "Set scale with the tracing tools first." });
  assert.equal(importRecoveryNotice({ needsRoomRecovery: false, unresolvedCritical: [] }).description,
    "Open the correction tools and adjust the highlighted part of the plan.");
  assert.equal(importRecoveryNotice({ needsRoomRecovery: false, unresolvedCritical: [issue("canonical_document_invalid", "candidate is larger than 5 MB", true)] }).title,
    "One small correction is needed", "a resolved issue doesn't count");
}

testTooLarge();
testOtherUnbuiltReading();
testUnchangedCases();
console.log("floor-plan import recovery notice: ok");
