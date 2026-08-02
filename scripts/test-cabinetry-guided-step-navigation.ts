import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CABINET_GUIDED_STEPS,
  CabinetGuidedStepNavigation,
} from "../features/cabinetry/components/CabinetGuidedStepNavigation";

assert.deepEqual(
  CABINET_GUIDED_STEPS.map(({ id, label, hint }) => ({ id, label, hint })),
  [
    { id: "type", label: "Type", hint: "Choose what to build" },
    { id: "space", label: "Space", hint: "Choose where it will go" },
    { id: "size", label: "Size", hint: "Set the available size" },
    { id: "layout", label: "Layout", hint: "Arrange useful storage" },
    { id: "style", label: "Style", hint: "Choose finishes" },
    { id: "review", label: "Review", hint: "Check and place" },
  ]
);

const markup = renderToStaticMarkup(
  createElement(CabinetGuidedStepNavigation, {
    currentStepIndex: 2,
    onStepChange: () => undefined,
  })
);
assert.match(markup, /^<nav aria-label="Guided millwork steps"/);
assert.equal(markup.match(/data-testid="cabinet-guided-step-/g)?.length, 6);
assert.match(
  markup,
  /data-testid="cabinet-guided-step-size" aria-current="step"/
);
assert.doesNotMatch(
  markup,
  /data-testid="cabinet-guided-step-(?:type|space|layout|style|review)" aria-current="step"/
);
assert.equal(markup.match(/bg-emerald-100 text-emerald-700/g)?.length, 2);
assert.match(markup, />Type<\/span>/);
assert.match(markup, />Review<\/span>/);

const guidedViewSource = readFileSync(
  resolve(
    process.cwd(),
    "features/cabinetry/components/CabinetryStudioGuidedView.tsx"
  ),
  "utf8"
);
assert.match(
  guidedViewSource,
  /import \{[\s\S]*?CABINET_GUIDED_STEPS,[\s\S]*?CabinetGuidedStepNavigation[\s\S]*?\} from "\.\/CabinetGuidedStepNavigation"/,
  "The studio must compose the extracted Guided-step boundary."
);
assert.match(guidedViewSource, /<CabinetGuidedStepNavigation/);
assert.doesNotMatch(
  guidedViewSource,
  /aria-label="Guided millwork steps"/,
  "The studio shell must not regain Guided-step navigation markup."
);

console.log("Cabinetry Guided-step navigation checks passed.");
