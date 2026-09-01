import assert from "node:assert/strict";

import {
  assertCabinetFiniteNumberIntegrity,
  findCabinetNonFiniteNumbers,
  hasCabinetNonFiniteNumbers,
  validateCabinetNumberDraft,
} from "../features/cabinetry/numericInput";
import {
  cabinetDisplayToModelMillimetres,
  cabinetDisplayToMillimetres,
  cabinetMillimetresToDisplay,
  formatCabinetMeasurement,
  formatCabinetMeasurementTokens,
  getCabinetDisplayDraftStep,
  getCabinetDisplayResolutionMm,
  resolveCabinetDisplayMeasurement,
} from "../features/cabinetry/measurementUnits";

assert.equal(cabinetMillimetresToDisplay(2540, "mm"), 2540);
assert.equal(cabinetMillimetresToDisplay(2540, "cm"), 254);
assert.equal(cabinetMillimetresToDisplay(2540, "in"), 100);
assert.equal(cabinetDisplayToMillimetres(36, "in"), 914.4);
assert.equal(cabinetDisplayToMillimetres(90, "cm"), 900);
assert.equal(formatCabinetMeasurement(914.4, "in"), "36 in");
assert.equal(
  formatCabinetMeasurement(914.4, "in", { includeMillimetreReference: true }),
  "36 in (914 mm)"
);
assert.equal(
  formatCabinetMeasurementTokens(
    "Available range is -125.5 mm to 1,200 mm; keep 12.25 mm clear.",
    "cm"
  ),
  "Available range is -12.55 cm (-125.5 mm) to 120 cm (1,200 mm); keep 1.23 cm (12.25 mm) clear."
);
assert.equal(
  formatCabinetMeasurementTokens("Offsets: -12.7 mm / 25.4 mm.", "in"),
  "Offsets: -0.5 in (-12.7 mm) / 1 in (25.4 mm)."
);
assert.equal(
  formatCabinetMeasurementTokens(
    "Typical heights are 380-520 mm; tolerance is -12.5–25.5 mm.",
    "cm"
  ),
  "Typical heights are 38 cm (380 mm)-52 cm (520 mm); tolerance is -1.25 cm (-12.5 mm)–2.55 cm (25.5 mm)."
);
assert.equal(
  formatCabinetMeasurementTokens(
    "Module module-1200 mm, SKU1200, 42 parts, 12 mm², 24 mm^2, and 1200mm stay literal.",
    "cm"
  ),
  "Module module-1200 mm, SKU1200, 42 parts, 12 mm², 24 mm^2, and 1200mm stay literal."
);
assert.equal(
  formatCabinetMeasurementTokens("Already 120 cm (1,200 mm).", "cm"),
  "Already 120 cm (1,200 mm).",
  "feedback formatting must be idempotent for an existing secondary mm reference"
);
assert.equal(
  formatCabinetMeasurementTokens("Single height is 380 mm.", "ft-in"),
  "Single height is 1′ 3.0″ (380 mm)."
);
const feetAndInchesRange = formatCabinetMeasurementTokens(
  "Typical heights are 380-520 mm.",
  "ft-in"
);
assert.equal(
  feetAndInchesRange,
  "Typical heights are 1′ 3.0″ (380 mm)-1′ 8.5″ (520 mm)."
);
assert.equal(
  formatCabinetMeasurementTokens("Already 1′ 3.0″ (380 mm).", "ft-in"),
  "Already 1′ 3.0″ (380 mm)."
);
assert.equal(
  formatCabinetMeasurementTokens(feetAndInchesRange, "ft-in"),
  feetAndInchesRange,
  "feet-and-inches feedback formatting must be exactly idempotent"
);
for (const [message, unit] of [
  ["Already 38 cm (380 mm).", "cm"],
  ["Already 14.961 in (380 mm).", "in"],
] as const) {
  assert.equal(formatCabinetMeasurementTokens(message, unit), message);
}
assert.equal(
  formatCabinetMeasurementTokens("Keep -12.5 mm and ID-12.5 mm.", "mm"),
  "Keep -12.5 mm and ID-12.5 mm."
);
assert.equal(getCabinetDisplayDraftStep("mm"), 0.01);
assert.equal(getCabinetDisplayDraftStep("cm"), 0.01);
assert.equal(getCabinetDisplayDraftStep("in"), 0.001);
assert.equal(getCabinetDisplayResolutionMm("cm"), 0.1);
assert.equal(getCabinetDisplayResolutionMm("in"), 0.0254);

for (const unit of ["mm", "cm", "in"] as const) {
  for (const valueMm of [-321.987, 0, 0.1, 120, 914.4, 12_345.678]) {
    const displayed = cabinetMillimetresToDisplay(valueMm, unit);
    const rawRoundTrip = cabinetDisplayToMillimetres(displayed, unit);
    assert(
      Math.abs(rawRoundTrip - valueMm) <= getCabinetDisplayResolutionMm(unit) / 2 + 0.001,
      `${valueMm} mm should round-trip through ${unit} within its display resolution`
    );
    assert.equal(
      cabinetDisplayToModelMillimetres(displayed, unit, { referenceMm: valueMm }),
      valueMm,
      `${unit} conversion should not drift an unchanged model value`
    );
  }
}

assert.equal(
  cabinetDisplayToModelMillimetres(4.724, "in", { minMm: 120 }),
  120,
  "a rounded displayed minimum should restore the exact model boundary"
);
assert.equal(
  cabinetDisplayToModelMillimetres(5.906, "in", { maxMm: 150 }),
  150,
  "a rounded displayed maximum should restore the exact model boundary"
);
assert(
  cabinetDisplayToModelMillimetres(5.907, "in", { maxMm: 150 }) > 150,
  "conversion must not clamp a genuinely out-of-range display value"
);
assert.equal(
  cabinetDisplayToModelMillimetres(35.827, "in", {
    minMm: 300,
    snapStepMm: 10,
    stepBaseMm: 300,
  }),
  910,
  "a displayed approximation of a model step should restore the exact step"
);

assert.deepEqual(
  resolveCabinetDisplayMeasurement(35.827, "in", {
    minMm: 300,
    maxMm: 1500,
    snapStepMm: 10,
    stepBaseMm: 300,
  }),
  { status: "valid", valueMm: 910 },
  "a rounded inch representation of an exact model increment must remain valid"
);
assert.equal(
  resolveCabinetDisplayMeasurement(35.85, "in", {
    minMm: 300,
    maxMm: 1500,
    snapStepMm: 10,
    stepBaseMm: 300,
  }).status,
  "invalid",
  "an arbitrary inch value must not bypass a 10 mm accepted increment"
);
assert.deepEqual(
  resolveCabinetDisplayMeasurement(91, "cm", {
    minMm: 300,
    snapStepMm: 10,
    stepBaseMm: 300,
  }),
  { status: "valid", valueMm: 910 }
);
const offStepCentimetres = resolveCabinetDisplayMeasurement(91.05, "cm", {
  minMm: 300,
  snapStepMm: 10,
  stepBaseMm: 300,
});
assert.equal(offStepCentimetres.status, "invalid");
if (offStepCentimetres.status === "invalid") {
  assert.equal(offStepCentimetres.code, "step_mismatch");
}

let exactArrowModelMm = 900;
for (let index = 0; index < 40; index += 1) {
  const expectedMm = exactArrowModelMm + 10;
  const displayed = cabinetMillimetresToDisplay(expectedMm, "in");
  const resolved = resolveCabinetDisplayMeasurement(displayed, "in", {
    referenceMm: exactArrowModelMm,
    minMm: 300,
    snapStepMm: 10,
    stepBaseMm: 300,
  });
  assert.equal(resolved.status, "valid", `arrow step ${index + 1} should remain valid`);
  if (resolved.status !== "valid") break;
  assert.equal(resolved.valueMm, expectedMm, "rounded display must not accumulate arrow drift");
  exactArrowModelMm = resolved.valueMm;
}

function expectIssue(
  draft: string,
  code: Exclude<ReturnType<typeof validateCabinetNumberDraft>, { status: "valid" }>["code"],
  constraints?: Parameters<typeof validateCabinetNumberDraft>[1]
) {
  const result = validateCabinetNumberDraft(draft, constraints);
  assert.notEqual(result.status, "valid", `${JSON.stringify(draft)} should not validate`);
  if (result.status === "valid") return;
  assert.equal(result.code, code, `${JSON.stringify(draft)} should report ${code}`);
}

expectIssue("", "empty");
expectIssue("   ", "empty");
expectIssue("-", "incomplete");
expectIssue("+", "incomplete");
expectIssue(".", "incomplete");
expectIssue("-.", "incomplete");
expectIssue("1e", "incomplete");
expectIssue("-2.5e+", "incomplete");
expectIssue("1..2", "invalid_syntax");
expectIssue("0x10", "invalid_syntax");
expectIssue("NaN", "invalid_syntax");
expectIssue("Infinity", "invalid_syntax");
expectIssue("-Infinity", "invalid_syntax");
expectIssue("1e309", "non_finite");
expectIssue("99", "below_minimum", { min: 100, unit: "mm" });
expectIssue("501", "above_maximum", { max: 500, unit: "mm" });
expectIssue("2.5", "integer_required", { integer: true });
expectIssue("12", "step_mismatch", { min: 0, step: 5, unit: "mm" });

assert.deepEqual(validateCabinetNumberDraft(".5"), {
  status: "valid",
  value: 0.5,
  normalizedDraft: "0.5",
});
assert.deepEqual(validateCabinetNumberDraft("-125", { min: -4000, max: 4000, step: 5 }), {
  status: "valid",
  value: -125,
  normalizedDraft: "-125",
});
assert.deepEqual(validateCabinetNumberDraft("-2", { integer: true }), {
  status: "valid",
  value: -2,
  normalizedDraft: "-2",
});
assert.equal(validateCabinetNumberDraft("0.3", { step: 0.1 }).status, "valid");
assert.equal(validateCabinetNumberDraft("6", { min: 1, step: 5 }).status, "valid");

const finiteTree: Record<string, unknown> = {
  totalWidth: 1200,
  modules: [{ width: 600 }, { width: 600, shelfPositionsMm: [300, 600] }],
};
finiteTree.self = finiteTree;
assert.equal(hasCabinetNonFiniteNumbers(finiteTree), false);
assert.doesNotThrow(() => assertCabinetFiniteNumberIntegrity(finiteTree));

const invalidTree = {
  totalWidth: Number.NaN,
  modules: [
    { width: 600 },
    { width: Number.POSITIVE_INFINITY, offsets: [0, Number.NEGATIVE_INFINITY] },
  ],
};
const integrityIssues = findCabinetNonFiniteNumbers(invalidTree);
assert.deepEqual(
  integrityIssues.map((issue) => issue.path),
  [
    "definition.totalWidth",
    "definition.modules[1].width",
    "definition.modules[1].offsets[1]",
  ]
);
assert.equal(hasCabinetNonFiniteNumbers(invalidTree), true);
assert.throws(
  () => assertCabinetFiniteNumberIntegrity(invalidTree, "cabinet"),
  /cabinet\.totalWidth.*cabinet\.modules\[1\]\.width.*cabinet\.modules\[1\]\.offsets\[1\]/
);

console.log("Cabinet numeric draft and finite-integrity tests passed.");
