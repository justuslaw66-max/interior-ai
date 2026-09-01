import assert from "node:assert/strict";

import {
  DEFAULT_DISPLAY_UNIT,
  DISPLAY_UNIT_GROUPS,
  formatDisplayArea,
  formatDisplayLength,
  formatDisplayLengthInput,
  getDisplayLengthInputError,
  getMeasurementSystem,
  normalizeDisplayUnit,
  parseDisplayLength,
  resolveDisplayLengthInput,
  type DisplayUnit,
} from "@/lib/display-units";

function expectParsedMm(
  input: string,
  unit: DisplayUnit,
  expectedMm: number,
  toleranceMm = 0.001
) {
  const result = parseDisplayLength(input, unit);
  assert.equal(result.status, "valid", `${input} should parse as ${unit}`);
  if (result.status === "valid") {
    assert.ok(
      Math.abs(result.valueMm - expectedMm) <= toleranceMm,
      `${input} should resolve to ${expectedMm} mm, received ${result.valueMm}`
    );
  }
}

function expectInvalid(
  input: string,
  code?: Exclude<ReturnType<typeof parseDisplayLength>, { status: "valid" }>["code"]
) {
  const result = parseDisplayLength(input, "ft-in");
  assert.equal(result.status, "invalid", `${JSON.stringify(input)} should be rejected`);
  if (result.status === "invalid" && code) assert.equal(result.code, code);
}

assert.equal(formatDisplayLength(2_540, "mm"), "2,540 mm");
assert.equal(formatDisplayLength(2_540, "cm"), "254 cm");
assert.equal(formatDisplayLength(2_540, "in"), "100 in");

assert.equal(formatDisplayLength(4_200, "ft-in"), "13′ 9.4″");
assert.equal(formatDisplayLength(4_800, "ft-in"), "15′ 9.0″");
assert.equal(formatDisplayLength(8 * 304.8, "ft-in"), "8′ 0″");
assert.equal(
  formatDisplayLength((13 * 12 + 11.96) * 25.4, "ft-in"),
  "14′ 0″",
  "rounded inches should carry into the feet value"
);

expectParsedMm(`13' 9.4"`, "ft-in", 4_201.16);
expectParsedMm("13 ft 9.4 in", "ft-in", 4_201.16);
expectParsedMm("13ft 9.4in", "ft-in", 4_201.16);
expectParsedMm("13′ 9.4″", "ft-in", 4_201.16);
expectParsedMm("13.75 ft", "ft-in", 4_191);
expectParsedMm("13.75 feet", "ft-in", 4_191);
expectParsedMm("165.4 in", "ft-in", 4_201.16);
expectParsedMm("0′ 0″", "ft-in", 0);
expectParsedMm("11.96 in", "ft-in", 303.784);
expectParsedMm("9.4 in", "ft-in", 238.76);

for (const input of [
  "13.75 ft 9.4 in",
  `13.5' 2"`,
  "13.5 ft 2 in",
  "13 ft -2 in",
  "-13 ft 2 in",
  "+13 ft 2 in",
  "13 ft 9 in 2 in",
  `13 ft 9" 2"`,
  "13′ 9.4′",
  "13″ 9.4′",
  "13' 9 ft",
  "13 ft ft",
  "13 in 9 ft",
  "13 ft nine in",
  "13..5 ft",
  "13.5.2 in",
  "",
  "   ",
  "--13 in",
]) {
  expectInvalid(input);
}
expectInvalid("13 ft 12 in", "compound_inches_out_of_range");
expectInvalid("13 ft 12.1 in", "compound_inches_out_of_range");
expectInvalid("NaN", "non_finite");
expectInvalid("Infinity", "non_finite");

const overflow = resolveDisplayLengthInput("13 ft 12.1 in", "ft-in");
assert.equal(
  getDisplayLengthInputError(overflow, "ft-in"),
  "Inches must be less than 12 when feet are included."
);

const negative = resolveDisplayLengthInput("-9.4 in", "ft-in", { minMm: 0 });
assert.equal(negative.status, "invalid");
if (negative.status === "invalid") assert.equal(negative.code, "below_minimum");

const canonicalWidthMm = 4_200;
const imperialDraft = formatDisplayLengthInput(canonicalWidthMm, "ft-in");
const snappedImperial = resolveDisplayLengthInput(imperialDraft, "ft-in", {
  referenceMm: canonicalWidthMm,
  minMm: 1_800,
  maxMm: 20_000,
  snapStepMm: 10,
  stepBaseMm: 1_800,
});
assert.deepEqual(snappedImperial, { status: "valid", valueMm: canonicalWidthMm });

const imperialRoomOptions = {
  minMm: 1_800,
  maxMm: 20_000,
  snapStepMm: 10,
  stepBaseMm: 1_800,
};
for (const [referenceMm, input, unit, expectedMm] of [
  [4_267, "14 ft", "ft-in", 4_267.2],
  [4_266.184, "14 ft", "ft-in", 4_267.2],
  [4_200, `13' 9.4"`, "ft-in", 4_201.16],
  [4_200, "13 ft 9.4 in", "ft-in", 4_201.16],
  [4_200, "165.4 in", "in", 4_201.16],
  [4_267, "168 in", "in", 4_267.2],
] as const) {
  assert.deepEqual(
    resolveDisplayLengthInput(input, unit, {
      ...imperialRoomOptions,
      referenceMm,
    }),
    { status: "valid", valueMm: expectedMm },
    `${input} must resolve independently of the nearby ${referenceMm} mm reference`
  );
}
assert.equal(formatDisplayLengthInput(4_267.2, "ft-in"), "14′ 0″");

for (const referenceMm of [4_266.184, 4_200]) {
  const exactRenderedText = formatDisplayLengthInput(referenceMm, "ft-in");
  assert.equal(
    exactRenderedText,
    referenceMm === 4_266.184 ? "14′ 0″" : "13′ 9.4″"
  );
  let repeatedReferenceMm = referenceMm;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const result = resolveDisplayLengthInput(exactRenderedText, "ft-in", {
      ...imperialRoomOptions,
      referenceMm: repeatedReferenceMm,
    });
    assert.deepEqual(
      result,
      { status: "valid", valueMm: referenceMm },
      `exact rendered re-entry ${iteration + 1} must preserve ${referenceMm} mm`
    );
    if (result.status === "valid") repeatedReferenceMm = result.valueMm;
  }
  assert.equal(repeatedReferenceMm, referenceMm);
}

for (const alternateFourteenFeet of [
  "14 ft",
  "14'",
  "14 ft 0 in",
  `14' 0"`,
]) {
  assert.deepEqual(
    resolveDisplayLengthInput(alternateFourteenFeet, "ft-in", {
      ...imperialRoomOptions,
      referenceMm: 4_266.184,
    }),
    { status: "valid", valueMm: 4_267.2 },
    `${alternateFourteenFeet} is explicit text, not exact rendered-text identity`
  );
}

assert.deepEqual(
  resolveDisplayLengthInput("420.05", "cm", {
    ...imperialRoomOptions,
    referenceMm: canonicalWidthMm,
  }),
  { status: "invalid", code: "step_mismatch", valueMm: 4_200.5 },
  "metric input keeps the established 10 mm accepted increment"
);

let cycledWidthMm = canonicalWidthMm;
for (let iteration = 0; iteration < 100; iteration += 1) {
  for (const unit of ["cm", "ft-in", "cm", "mm", "in", "ft-in", "mm"] as const) {
    const draft = formatDisplayLengthInput(cycledWidthMm, unit);
    const resolved = resolveDisplayLengthInput(draft, unit, {
      referenceMm: cycledWidthMm,
    });
    assert.deepEqual(
      resolved,
      { status: "valid", valueMm: cycledWidthMm },
      `${unit} switch ${iteration + 1} should preserve the canonical value without drift`
    );
    if (resolved.status === "valid") cycledWidthMm = resolved.valueMm;
  }
}
assert.equal(cycledWidthMm, canonicalWidthMm, "100 complete unit cycles must not drift");

const canonicalRoomGeometry = Object.freeze({
  width: 4.2,
  depth: 4.8,
  wallThickness: 0.12,
});
const geometryBeforeFormatting = JSON.stringify(canonicalRoomGeometry);
for (const unit of ["cm", "ft-in", "cm"] as const) {
  formatDisplayLength(canonicalRoomGeometry.width * 1_000, unit);
  formatDisplayLength(canonicalRoomGeometry.depth * 1_000, unit);
}
assert.equal(
  JSON.stringify(canonicalRoomGeometry),
  geometryBeforeFormatting,
  "display-only switching must not rewrite room geometry or save payload values"
);

assert.equal(formatDisplayArea(20.16, "mm"), "20.2 m²");
assert.equal(formatDisplayArea(20.16, "cm"), "20.2 m²");
assert.equal(formatDisplayArea(20.16, "in"), "217.0 ft²");
assert.equal(formatDisplayArea(20.16, "ft-in"), "217.0 ft²");

assert.equal(DEFAULT_DISPLAY_UNIT, "cm");
assert.equal(normalizeDisplayUnit(null), "cm");
assert.equal(normalizeDisplayUnit("unknown"), "cm");
for (const unit of ["mm", "cm", "in", "ft-in"] as const) {
  assert.equal(normalizeDisplayUnit(unit), unit);
}
assert.equal(getMeasurementSystem("mm"), "metric");
assert.equal(getMeasurementSystem("cm"), "metric");
assert.equal(getMeasurementSystem("in"), "imperial");
assert.equal(getMeasurementSystem("ft-in"), "imperial");
assert.deepEqual(
  DISPLAY_UNIT_GROUPS.map((group) => [group.label, [...group.units]]),
  [
    ["Metric", ["mm", "cm"]],
    ["Imperial", ["in", "ft-in"]],
  ]
);

console.log("Display-unit formatting, parsing, area, and drift tests passed.");
