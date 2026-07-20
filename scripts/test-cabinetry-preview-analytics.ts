import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CABINET_PREVIEW_REGENERATION_INDICATOR_DELAY_MS,
  INITIAL_CABINET_PREVIEW_INDICATOR_STATE,
  reduceCabinetPreviewIndicator,
} from "../features/cabinetry/previewRegenerationIndicator";
import {
  cabinetStudioElapsedMs,
  collectCabinetValidationIssueExposures,
  type CabinetValidationExposureState,
} from "../features/cabinetry/validationIssueAnalytics";
import type { CabinetValidationIssue } from "../features/cabinetry/types";

assert.equal(CABINET_PREVIEW_REGENERATION_INDICATOR_DELAY_MS, 200);
let previewState = reduceCabinetPreviewIndicator(
  INITIAL_CABINET_PREVIEW_INDICATOR_STATE,
  { type: "synchronize", pending: true }
);
assert.deepEqual(previewState, { pending: true, visible: false, cycle: 1 });
previewState = reduceCabinetPreviewIndicator(previewState, {
  type: "delay_elapsed",
  cycle: 1,
});
assert.equal(previewState.visible, true, "a perceptibly long regeneration reveals status");
previewState = reduceCabinetPreviewIndicator(previewState, {
  type: "synchronize",
  pending: false,
});
assert.deepEqual(previewState, { pending: false, visible: false, cycle: 2 });
assert.deepEqual(
  reduceCabinetPreviewIndicator(previewState, { type: "delay_elapsed", cycle: 1 }),
  previewState,
  "a stale elapsed callback cannot reopen a resolved indicator"
);

let fastState = reduceCabinetPreviewIndicator(
  INITIAL_CABINET_PREVIEW_INDICATOR_STATE,
  { type: "synchronize", pending: true }
);
fastState = reduceCabinetPreviewIndicator(fastState, {
  type: "synchronize",
  pending: false,
});
fastState = reduceCabinetPreviewIndicator(fastState, {
  type: "delay_elapsed",
  cycle: 1,
});
assert.equal(
  fastState.visible,
  false,
  "regeneration that resolves before the delay never flashes status"
);

function issue(
  code: string,
  severity: CabinetValidationIssue["severity"],
  moduleId = "module-private-1"
): CabinetValidationIssue {
  return {
    id: `${code}-${moduleId}`,
    code,
    severity,
    title: "Human-facing title with 1234 mm",
    message: "A private field value is 1234 mm.",
    resolution: "Change the private value.",
    field: "privateField",
    target: {
      scope: "module",
      field: "privateField",
      moduleIds: [moduleId],
    },
  };
}

let exposureState: CabinetValidationExposureState | null = null;
const first = collectCabinetValidationIssueExposures(
  "definition-1",
  [issue("front.drawer.count_required", "error")],
  exposureState
);
exposureState = first.state;
assert.deepEqual(first.exposures.map(({ key: _key, ...event }) => event), [
  {
    issueCode: "front.drawer.count_required",
    severity: "error",
    targetScope: "module",
  },
]);
assert.doesNotMatch(
  JSON.stringify(first.exposures.map(({ key: _key, ...event }) => event)),
  /1234|privateField|module-private/,
  "analytics projection must not contain values, fields, messages, or target identifiers"
);

const repeated = collectCabinetValidationIssueExposures(
  "definition-1",
  [issue("front.drawer.count_required", "error")],
  exposureState
);
assert.equal(repeated.exposures.length, 0, "rerenders do not duplicate an active issue");
exposureState = repeated.state;
const resolved = collectCabinetValidationIssueExposures(
  "definition-1",
  [],
  exposureState
);
assert.equal(resolved.exposures.length, 0);
const reappeared = collectCabinetValidationIssueExposures(
  "definition-1",
  [issue("front.drawer.count_required", "error")],
  resolved.state
);
assert.equal(reappeared.exposures.length, 1, "a resolved issue can begin a new encounter");
const newDefinition = collectCabinetValidationIssueExposures(
  "definition-2",
  [issue("front.drawer.count_required", "error")],
  reappeared.state
);
assert.equal(newDefinition.exposures.length, 1, "a new definition starts a new exposure scope");
assert.equal(cabinetStudioElapsedMs(100.2, 350.7), 251);
assert.equal(cabinetStudioElapsedMs(400, 350), 0);

const studioSource = readFileSync(
  resolve(process.cwd(), "features/cabinetry/components/CabinetryStudio.tsx"),
  "utf8"
);
const validationExposureHookSource = readFileSync(
  resolve(
    process.cwd(),
    "features/cabinetry/hooks/useCabinetStudioValidationExposure.ts"
  ),
  "utf8"
);
assert.match(studioSource, /useDelayedCabinetPreviewRegenerationIndicator/);
assert.match(studioSource, /useCabinetStudioValidationExposure/);
assert.match(validationExposureHookSource, /millwork_validation_issue_exposed/);
assert.match(validationExposureHookSource, /issue_code: exposure\.issueCode/);
assert.match(validationExposureHookSource, /target_scope: exposure\.targetScope/);
assert.doesNotMatch(
  validationExposureHookSource.match(/trackStudioInteraction\("millwork_validation_issue_exposed"[\s\S]*?\n\s*\}\);/)?.[0] ?? "",
  /message|title|field|moduleIds|hostId/,
  "the exposure event must not capture user-authored or dimensional fields"
);
const qaSource = readFileSync(
  resolve(process.cwd(), "docs/qa/cabinetry-studio-mvp.md"),
  "utf8"
);
assert.match(qaSource, /`millwork_validation_issue_exposed`/);

console.log("Cabinetry delayed-preview and validation-exposure analytics checks passed.");
