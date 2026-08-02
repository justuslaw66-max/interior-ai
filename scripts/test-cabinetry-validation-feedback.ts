import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CabinetMeasurementUnitProvider } from "../features/cabinetry/components/CabinetMeasurementUnitContext";
import {
  ModuleIssueBadges,
  ValidationFixPreview,
  ValidationIssueCard,
} from "../features/cabinetry/components/CabinetValidationFeedback";
import { createCabinetPreset } from "../features/cabinetry/presets";
import type { CabinetValidationIssue } from "../features/cabinetry/types";
import { validateCabinetDefinition } from "../features/cabinetry/validation";

function withCentimetres(child: ReturnType<typeof createElement>) {
  // Children is required by the provider's props type when using createElement in this .ts test.
  // eslint-disable-next-line react/no-children-prop
  return createElement(CabinetMeasurementUnitProvider, { unit: "cm", children: child });
}

const invalidDefinition = createCabinetPreset("base", "validation-feedback-invalid");
invalidDefinition.modules[0].frontType = "drawer_stack";
invalidDefinition.modules[0].drawerCount = 0;
const issue = validateCabinetDefinition(invalidDefinition).issues.find(
  (candidate) => candidate.code === "front.drawer.count_required"
);
assert(issue, "The fixture must produce the drawer-count validation issue.");
const fix = issue.fixes?.find((candidate) => candidate.label === "Use three drawers");
assert(fix, "The drawer-count issue must retain its previewable auto-fix.");

const issueMarkup = renderToStaticMarkup(
  withCentimetres(
    createElement(ValidationIssueCard, {
      issue,
      onFocus: () => undefined,
      onRequestFix: () => undefined,
    })
  )
);
assert.match(issueMarkup, /data-testid="cabinet-validation-error"/);
assert.match(issueMarkup, /data-validation-code="front\.drawer\.count_required"/);
assert.match(issueMarkup, /data-validation-scope="module"/);
assert.match(issueMarkup, /Use three drawers/);
assert.match(issueMarkup, /data-testid="cabinet-validation-fix"/);

const warningIssue: CabinetValidationIssue = {
  ...issue,
  id: "validation-feedback-warning",
  severity: "warning",
  fixes: undefined,
};
const badgesMarkup = renderToStaticMarkup(
  createElement(ModuleIssueBadges, { issues: [issue, warningIssue] })
);
assert.match(badgesMarkup, /aria-label="1 errors and 1 warnings"/);
assert.match(badgesMarkup, />1E</);
assert.match(badgesMarkup, />1W</);

const candidateDefinition = createCabinetPreset("base", "validation-feedback-candidate");
const previewMarkup = renderToStaticMarkup(
  withCentimetres(
    createElement(ValidationFixPreview, {
      pending: { issue, fix, candidate: candidateDefinition },
      current: invalidDefinition,
      onCancel: () => undefined,
      onApply: () => undefined,
    })
  )
);
assert.match(previewMarkup, /role="dialog"/);
assert.match(previewMarkup, /aria-label="Preview fix: Use three drawers"/);
assert.match(previewMarkup, /data-testid="cabinet-fix-preview"/);
assert.match(previewMarkup, /90 cm \(900 mm\)/);
assert.match(previewMarkup, /0 errors/);
assert.match(previewMarkup, /data-testid="cabinet-fix-preview-cancel"/);
assert.match(previewMarkup, /data-testid="cabinet-fix-preview-apply"/);

const studioSource = readFileSync(
  resolve(process.cwd(), "features/cabinetry/components/CabinetryStudio.tsx"),
  "utf8"
);
const validationConsumerSource = [
  "CabinetryStudioGuidedView.tsx",
  "CabinetryStudioDetailedView.tsx",
  "CabinetPartInspector.tsx",
  "CabinetGuidedReviewPanel.tsx",
  "CabinetStudioOutputsPanel.tsx",
]
  .map((fileName) =>
    readFileSync(
      resolve(process.cwd(), "features/cabinetry/components", fileName),
      "utf8"
    )
  )
  .join("\n");
assert.match(
  `${studioSource}\n${validationConsumerSource}`,
  /ModuleIssueBadges[\s\S]*?ValidationFixPreview[\s\S]*?ValidationIssueCard/,
  "The Studio UI boundary must compose the extracted validation-feedback components."
);
assert.match(validationConsumerSource, /<CabinetPartInspector\b/);
assert.match(validationConsumerSource, /<CabinetGuidedReviewPanel\b/);
assert.match(validationConsumerSource, /<CabinetStudioOutputsPanel\b/);
assert.doesNotMatch(
  studioSource,
  /function (?:ValidationIssueCard|ModuleIssueBadges|ValidationFixPreview)/,
  "The studio shell must not regain validation-feedback implementations."
);

console.log("Cabinetry validation-feedback checks passed.");
