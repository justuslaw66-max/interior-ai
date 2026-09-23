import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CabinetMeasurementUnitProvider } from "../features/cabinetry/components/CabinetMeasurementUnitContext";
import {
  CabinetModuleOptionGroup,
  Field,
  GuidedNumberField,
  sectionTitle,
  selectClass,
} from "../features/cabinetry/components/CabinetStudioFormPrimitives";
import type { CabinetValidationIssue } from "../features/cabinetry/types";

function withCentimetres(child: ReturnType<typeof createElement>) {
  // Children is required by the provider's props type when using createElement in this .ts test.
  // eslint-disable-next-line react/no-children-prop
  return createElement(CabinetMeasurementUnitProvider, { unit: "cm", children: child });
}

assert.equal(
  selectClass(),
  "h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
);

const headingMarkup = renderToStaticMarkup(sectionTitle("Materials"));
assert.match(headingMarkup, /^<h3/);
assert.match(headingMarkup, /uppercase tracking-wide/);
assert.match(headingMarkup, />Materials<\/h3>$/);

const fieldMarkup = renderToStaticMarkup(
  // Children is required by the component's props type when using createElement in this .ts test.
  // eslint-disable-next-line react/no-children-prop
  createElement(Field, {
    label: "Door style",
    helper: "Applied to the selected module.",
    children: createElement(
      "select",
      { "data-testid": "door-style" },
      createElement("option", null, "Slab")
    ),
  })
);
assert.match(fieldMarkup, /^<label/);
assert.match(fieldMarkup, />Door style<\/span>/);
assert.match(fieldMarkup, /data-testid="door-style"/);
assert.match(fieldMarkup, /Applied to the selected module\./);

const hiddenGroupMarkup = renderToStaticMarkup(
  // Children is required by the component's props type when using createElement in this .ts test.
  // eslint-disable-next-line react/no-children-prop
  createElement(CabinetModuleOptionGroup, {
    id: "installation_cleat",
    visible: false,
    children: createElement("input"),
  })
);
assert.equal(hiddenGroupMarkup, "");

const visibleGroupMarkup = renderToStaticMarkup(
  // Children is required by the component's props type when using createElement in this .ts test.
  // eslint-disable-next-line react/no-children-prop
  createElement(CabinetModuleOptionGroup, {
    id: "installation_cleat",
    visible: true,
    children: createElement("input", { "data-testid": "cleat-control" }),
  })
);
assert.match(
  visibleGroupMarkup,
  /data-testid="cabinet-module-option-group-installation-cleat"/
);
assert.match(visibleGroupMarkup, /data-testid="cleat-control"/);

const issue: CabinetValidationIssue = {
  id: "guided-width-warning",
  code: "width.warning",
  severity: "warning",
  field: "totalWidth",
  title: "Review width",
  message: "Confirm the available span.",
  target: { scope: "assembly", field: "totalWidth" },
  resolution: "Measure the host wall.",
};
const guidedMarkup = renderToStaticMarkup(
  withCentimetres(
    createElement(GuidedNumberField, {
      label: "Available width",
      value: 900,
      min: 200,
      max: 2400,
      step: 10,
      suffix: "mm",
      testId: "guided-width",
      fieldPath: "totalWidth",
      issues: [issue],
      onCommit: () => undefined,
    })
  )
);
assert.match(guidedMarkup, />Available width<\/span>/);
assert.match(guidedMarkup, /data-testid="guided-width"/);
assert.match(guidedMarkup, /data-validation-field="totalWidth"/);
assert.match(guidedMarkup, /data-model-value-mm="900"/);
assert.match(guidedMarkup, /data-display-step="0\.01"/);
assert.match(guidedMarkup, /data-keyboard-step="1"/);
assert.match(guidedMarkup, /value="90"/);
assert.match(guidedMarkup, /h-11 rounded-xl text-base/);
assert.match(guidedMarkup, /Review width Confirm the available span\. Measure the host wall\./);

const studioSource = readFileSync(
  resolve(process.cwd(), "features/cabinetry/components/CabinetryStudio.tsx"),
  "utf8"
);
const modeViewSource = [
  "CabinetryStudioGuidedView.tsx",
  "CabinetryStudioDetailedView.tsx",
]
  .map((fileName) =>
    readFileSync(
      resolve(process.cwd(), "features/cabinetry/components", fileName),
      "utf8"
    )
  )
  .join("\n");
assert.match(
  modeViewSource,
  /from "\.\/CabinetStudioFormPrimitives"/,
  "The mode views must compose the extracted form-primitives boundary."
);
for (const primitive of [
  "CabinetModuleOptionGroup",
  "Field",
  "GuidedNumberField",
  "sectionTitle",
  "selectClass",
]) {
  assert.ok(modeViewSource.includes(primitive));
}
assert.doesNotMatch(
  studioSource,
  /function (?:selectClass|sectionTitle|Field|CabinetModuleOptionGroup|GuidedNumberField)/,
  "The studio shell must not regain form-primitives implementations."
);

console.log("Cabinetry studio form-primitives checks passed.");
