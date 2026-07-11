import assert from "node:assert/strict";

import {
  getRecommendedCompatibleCabinetFrontHardware,
  resolveCabinetHardwareCompatibility,
} from "../features/cabinetry/hardwareCompatibility";
import { createCabinetPreset } from "../features/cabinetry/presets";
import type {
  CabinetDefinition,
  CabinetValidationAutoFix,
} from "../features/cabinetry/types";
import { validateCabinetDefinition } from "../features/cabinetry/validation";

function applyModulePatchFix(
  definition: CabinetDefinition,
  fix: CabinetValidationAutoFix
): CabinetDefinition {
  const action = fix.action;
  assert.equal(action.type, "patch_module");
  if (action.type !== "patch_module") return definition;
  return {
    ...definition,
    modules: definition.modules.map((module) =>
      module.id === action.moduleId
        ? { ...module, ...action.patch }
        : module
    ),
  };
}

const glassFront = createCabinetPreset("wall", "hardware-autofix-glass-front");
glassFront.modules[0].doorStyle = "glass";
glassFront.modules[0].hardwareId = "edge_pull";

const replacement = getRecommendedCompatibleCabinetFrontHardware(
  glassFront.modules[0],
  glassFront.hardware
);
assert.equal(
  replacement?.id,
  "push_to_open",
  "glass fronts should recommend the first fully compatible opening method"
);
assert.equal(
  replacement &&
    resolveCabinetHardwareCompatibility(replacement, glassFront.modules[0]).status,
  "compatible",
  "a recommended replacement must be fully compatible rather than review-required"
);

const result = validateCabinetDefinition(glassFront);
const issue = result.issues.find(
  (candidate) => candidate.code === "front.hardware.incompatible"
);
assert(issue, "an edge pull on a glass front should produce a hardware issue");
assert.equal(issue.title, "Choose compatible opening hardware");
assert.match(issue.message, /edge pulls.*glass front/i);
assert.match(issue.resolution, /compatible.*front/i);
assert.doesNotMatch(issue.title, /hardware id/i);
assert.doesNotMatch(issue.resolution, /nearest valid range/i);
assert.deepEqual(issue.target.moduleIds, [glassFront.modules[0].id]);

const fix = issue.fixes?.[0];
assert(fix, "a known compatible catalog replacement should produce an auto-fix");
assert.equal(
  fix.confirmation,
  "preview",
  "hardware replacement must use the existing confirmation flow"
);
assert.equal(fix.action.type, "patch_module");
if (fix.action.type === "patch_module") {
  assert.equal(fix.action.moduleId, glassFront.modules[0].id);
  assert.deepEqual(fix.action.patch, { hardwareId: "push_to_open" });
}

const fixed = applyModulePatchFix(glassFront, fix);
assert.equal(
  glassFront.modules[0].hardwareId,
  "edge_pull",
  "building the preview candidate must not mutate the source design"
);
assert.equal(fixed.modules[0].hardwareId, "push_to_open");
assert.equal(
  validateCabinetDefinition(fixed).issues.some(
    (candidate) => candidate.code === "front.hardware.incompatible"
  ),
  false,
  "applying the recommended patch should resolve the compatibility issue"
);

const noAlternative = createCabinetPreset(
  "wall",
  "hardware-autofix-no-compatible-option"
);
noAlternative.modules[0].doorStyle = "glass";
noAlternative.modules[0].hardwareId = "edge_pull";
noAlternative.hardware = noAlternative.hardware.filter(
  (hardware) => hardware.id === "edge_pull"
);
assert.equal(
  getRecommendedCompatibleCabinetFrontHardware(
    noAlternative.modules[0],
    noAlternative.hardware
  ),
  undefined,
  "recommendations must stay within the hardware catalog carried by the design"
);
const noAlternativeIssue = validateCabinetDefinition(noAlternative).issues.find(
  (candidate) => candidate.code === "front.hardware.incompatible"
);
assert(noAlternativeIssue, "the incompatible selection should remain visible");
assert.equal(
  noAlternativeIssue.fixes,
  undefined,
  "validation must not offer an unsafe fix when no compatible catalog item exists"
);

console.log("Cabinetry hardware compatibility auto-fix checks passed");
