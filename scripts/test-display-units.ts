import assert from "node:assert/strict";

import {
  DEFAULT_DISPLAY_UNIT,
  DISPLAY_UNIT_GROUPS,
  formatDisplayArea,
  formatDisplayLength,
  formatDisplayLengthInput,
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
expectParsedMm("9.4 in", "ft-in", 238.76);

for (const input of ["13 ft nine in", "NaN", "Infinity", "--13 in"]) {
  assert.equal(
    parseDisplayLength(input, "ft-in").status,
    "invalid",
    `${input} should be rejected`
  );
}

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

for (let iteration = 0; iteration < 20; iteration += 1) {
  for (const unit of ["cm", "ft-in", "in", "mm"] as const) {
    const draft = formatDisplayLengthInput(canonicalWidthMm, unit);
    const resolved = resolveDisplayLengthInput(draft, unit, {
      referenceMm: canonicalWidthMm,
    });
    assert.deepEqual(
      resolved,
      { status: "valid", valueMm: canonicalWidthMm },
      `${unit} switching should preserve the canonical value without drift`
    );
  }
}

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
