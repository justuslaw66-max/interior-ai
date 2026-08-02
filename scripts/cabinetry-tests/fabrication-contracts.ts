import assert from "assert";
import {
  buildCabinetFabricationDxf,
} from "@/features/cabinetry/exportCabinetFabricationDxf";
import {
  generateCabinetBOM,
} from "@/features/cabinetry/generateCabinetBOM";
import {
  buildCabinetSourceDefinitionJson,
  generateCabinetDocumentation,
  parseCabinetSourceDefinitionJson,
} from "@/features/cabinetry/generateCabinetDocumentation";
import {
  generateCabinetParts,
} from "@/features/cabinetry/generateCabinetParts";
import {
  CABINET_HARDWARE,
} from "@/features/cabinetry/catalog/hardware";
import {
  resolveCabinetPartFabricationSpec,
} from "@/features/cabinetry/fabricationSemantics";
import {
  getCompatibleCabinetFrontHardware,
  resolveCabinetHardwareCompatibility,
} from "@/features/cabinetry/hardwareCompatibility";
import {
  createCabinetPreset,
} from "@/features/cabinetry/presets";
import {
  validateCabinetDefinition,
} from "@/features/cabinetry/validation";
import {
  clone,
} from "./helpers";

export function runFabricationContractTests(): void {
  const directional = createCabinetPreset("base", "cabinet-test-fabrication-directional");
  directional.modules[0].materialId = "oak_veneer";
  directional.modules[0].frontMaterialId = "oak_veneer";
  const drawerFront = generateCabinetParts(directional).find(
    (part) => part.type === "drawer_front"
  );
  assert(drawerFront, "base preset should generate a drawer front for fabrication tests");
  const automaticSpec = resolveCabinetPartFabricationSpec(directional, drawerFront);
  assert.strictEqual(automaticSpec.grainDirection, "vertical", "directional fronts should default to vertical grain");
  assert.strictEqual(automaticSpec.grainAxis, "cut_height", "vertical grain should follow the resolved cut height");

  const horizontal = clone(directional);
  horizontal.modules[0].grainDirection = "horizontal";
  const horizontalDrawer = generateCabinetParts(horizontal).find(
    (part) => part.id === drawerFront.id
  );
  assert(horizontalDrawer, "grain overrides should preserve stable generated part IDs");
  assert.strictEqual(
    resolveCabinetPartFabricationSpec(horizontal, horizontalDrawer).grainAxis,
    "cut_width",
    "horizontal overrides should drive the cut-list grain axis"
  );

  const noEdge = clone(directional);
  noEdge.modules[0].edgeTreatment = "none";
  const noEdgeCutList = generateCabinetDocumentation(noEdge).cutList.filter(
    (item) => item.moduleId === noEdge.modules[0].id
  );
  assert(
    noEdgeCutList.every((item) => item.edgeBandingMm === 0 && item.edgeTreatment === "none"),
    "no-edge overrides should clear only the selected module's treated-edge quantities"
  );

  const contrasting = clone(directional);
  contrasting.modules[0].edgeTreatment = "contrasting_edge_band";
  contrasting.modules[0].edgeMaterialId = "matte_black_laminate";
  const contrastingValidation = validateCabinetDefinition(contrasting);
  assert(contrastingValidation.valid, "a catalog-backed contrasting edge should validate");
  const contrastingDocumentation = generateCabinetDocumentation(contrasting);
  assert(
    contrastingDocumentation.edgeBandingSchedule.some(
      (item) =>
        item.edgeTreatment === "contrasting_edge_band" &&
        item.edgeMaterialId === "matte_black_laminate"
    ),
    "edge schedules should retain treatment and contrasting material identity"
  );

  const explicitFaces = clone(contrasting);
  explicitFaces.modules[0].exposedFaces = ["front", "right"];
  const explicitRoundTrip = parseCabinetSourceDefinitionJson(
    buildCabinetSourceDefinitionJson(explicitFaces)
  );
  assert.deepStrictEqual(
    explicitRoundTrip.modules[0].exposedFaces,
    ["front", "right"],
    "explicit exposed faces should survive fingerprinted source export and import"
  );
  const malformedFaces = clone(explicitFaces) as unknown as Record<string, unknown>;
  const malformedModules = malformedFaces.modules as Array<Record<string, unknown>>;
  malformedModules[0].exposedFaces = ["front", "ceiling"];
  assert.throws(
    () => parseCabinetSourceDefinitionJson(JSON.stringify(malformedFaces)),
    /module 1 is malformed/i,
    "unknown exposed-face values should be rejected during source parsing"
  );

  const mixed = clone(directional);
  mixed.modules = [
    { ...clone(directional.modules[0]), id: "fabrication-module-a", edgeTreatment: "matching_edge_band" },
    { ...clone(directional.modules[0]), id: "fabrication-module-b", edgeTreatment: "none" },
  ];
  mixed.totalWidth = mixed.modules.reduce((sum, module) => sum + module.width, 0);
  const mixedTopPanels = generateCabinetBOM(mixed).filter((item) => item.type === "top_panel");
  assert.strictEqual(
    mixedTopPanels.length,
    2,
    "fabrication-identical geometry with different edge treatments must remain separate in the BOM"
  );

  const compatiblePull = CABINET_HARDWARE.find((hardware) => hardware.id === "black_bar_pull");
  const accessory = CABINET_HARDWARE.find((hardware) => hardware.id === "library_ladder_rail");
  assert(compatiblePull && accessory, "hardware catalog fixtures should exist");
  assert.strictEqual(
    resolveCabinetHardwareCompatibility(compatiblePull, directional.modules[0]).status,
    "compatible",
    "catalogued front pulls should pass compatible drawer-front geometry"
  );
  const openModule = { ...directional.modules[0], frontType: "open" as const, hardwareId: compatiblePull.id };
  assert.strictEqual(
    resolveCabinetHardwareCompatibility(compatiblePull, openModule).status,
    "incompatible",
    "front hardware on open storage should be rejected"
  );
  assert.strictEqual(
    resolveCabinetHardwareCompatibility(accessory, directional.modules[0]).status,
    "incompatible",
    "accessory hardware must not be assignable as a front handle"
  );
  assert.strictEqual(
    resolveCabinetHardwareCompatibility(
      { id: "custom-pull", name: "Custom pull", type: "bar_pull" },
      directional.modules[0]
    ).status,
    "review_required",
    "unknown custom front hardware should remain selectable with review"
  );
  assert(
    getCompatibleCabinetFrontHardware(directional.modules[0]).every(
      (hardware) => hardware.role === "front_operation"
    ),
    "front-hardware options should never include cabinetry accessories"
  );

  const dxf = buildCabinetFabricationDxf(directional);
  assert(dxf.includes("GRAIN"), "fabrication DXF should include a grain layer");
  assert(dxf.includes("grainAxis=cut_height"), "fabrication DXF metadata should include resolved grain axes");
  assert(dxf.includes("edgeTreatment="), "fabrication DXF metadata should include edge treatments");
}
