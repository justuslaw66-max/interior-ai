import assert from "node:assert/strict";
import * as THREE from "three";

import {
  CABINET_DEFAULT_FINISH_ID,
  CABINET_FINISHES,
  CABINET_FINISH_CATEGORIES,
  CABINET_PLACEHOLDER_FINISH_IDS,
  cabinetFinishAccessibleName,
  cabinetFinishBadge,
  collectCabinetFinishReferences,
  currentCabinetMaterials,
  defaultCabinetContrastingFinishId,
  describeCabinetFinish,
  describeCabinetFinishChoice,
  filterCabinetFinishes,
  findCabinetFinishMaterial,
  inheritCabinetFinishId,
  isCabinetPlaceholderFinish,
  resolveCabinetModuleFinishId,
  syncCabinetFinishMaterials,
} from "../features/cabinetry/catalog/finishes";
import { findCabinetLaminate } from "../features/cabinetry/catalog/laminates";
import { CABINET_MATERIALS } from "../features/cabinetry/catalog/materials";
import { createCabinetThreeGroup } from "../features/cabinetry/createCabinetThreeGroup";
import { generateCabinetDocumentation } from "../features/cabinetry/generateCabinetDocumentation";
import { generateCabinetParts } from "../features/cabinetry/generateCabinetParts";
import { CABINET_PRESET_OPTIONS, createCabinetPreset } from "../features/cabinetry/presets";
import type { CabinetDefinition } from "../features/cabinetry/types";
import { validateCabinetDefinition } from "../features/cabinetry/validation";

const ids = (definition: CabinetDefinition) => definition.materials.map((material) => material.id);

// Only real products are offered (J, 23 Oct 2026): every finish is a supplier's laminate design.
// The 4'x8' collection's 342 designs and the 4.25'x10' collection's 33 the 4'x8' one doesn't have.
assert.equal(CABINET_FINISHES.length, 375);
assert(CABINET_FINISHES.every((finish) => finish.supplier === "Greenlam" && !isCabinetPlaceholderFinish(finish.id)));
assert.deepEqual(
  CABINET_FINISH_CATEGORIES.map((category) => [category.label, category.count]),
  [["Woodgrains", 168], ["Solid colours", 121], ["Stone & abstract", 59], ["Pearlescent", 14], ["Metallic", 6], ["Unicore", 7]]
);
assert.deepEqual([...CABINET_PLACEHOLDER_FINISH_IDS].sort(), [
  "matte_black_laminate", "oak_veneer", "painted_shaker_white", "walnut_veneer", "white_melamine",
]);
assert(CABINET_FINISHES.some((finish) => finish.id === CABINET_DEFAULT_FINISH_ID));

// The picker: a category, or a search by code (from its start) or by name, supplier and kind.
assert.equal(filterCabinetFinishes("", "metals").length, 6);
assert(filterCabinetFinishes("", "woodgrains").every((finish) => finish.laminateCategory === "woodgrains"));
assert.deepEqual(filterCabinetFinishes("5003", "solids").map((finish) => finish.id), ["greenlam-woodgrains-5003"]);
assert.deepEqual(filterCabinetFinishes(" 5003  TEAK ", "solids").map((finish) => finish.id), ["greenlam-woodgrains-5003"]);
assert.equal(filterCabinetFinishes("003", "woodgrains").length, 0, "codes match from their start");
const walnuts = filterCabinetFinishes("walnut", "solids");
assert(walnuts.length >= 6 && walnuts.every((finish) => /walnut/i.test(finish.designName)));
const stone = filterCabinetFinishes("stone", "woodgrains");
assert(filterCabinetFinishes("", "abstracts").every((finish) => stone.includes(finish)), "a kind's name finds its designs");
assert(stone.some((finish) => finish.supplierCode === "133"), "and designs named for it (133 Moonstone)");
assert.equal(filterCabinetFinishes("no such design", "woodgrains").length, 0);

// Tiles and summaries say how a design is drawn.
const santos = findCabinetLaminate("greenlam-woodgrains-5523")!;
const manor = findCabinetLaminate("greenlam-woodgrains-5379")!;
const white = findCabinetLaminate("greenlam-solids-101")!;
const statuario = findCabinetLaminate("greenlam-abstracts-5574")!;
const rift = findCabinetLaminate("greenlam-woodgrains-5308")!;
assert.equal(cabinetFinishBadge(santos), "Horizontal grain");
assert.equal(cabinetFinishBadge(manor), "Pattern");
assert.equal(cabinetFinishBadge(rift), null);
assert.equal(cabinetFinishBadge(findCabinetLaminate("greenlam-unicore-90401")!), "Unicore");
const olympias = filterCabinetFinishes("5594", "woodgrains");
assert.equal(olympias.length, 2, "5594 Olympia is an abstract and a Unicore design");
assert.equal(new Set(olympias.map(cabinetFinishAccessibleName)).size, 2, "their tiles are told apart by kind");
assert.equal(describeCabinetFinish(rift), "Grain runs up doors and sides, at real size from a 1220 × 2440 mm sheet.");
assert.equal(describeCabinetFinish(santos), "Grain runs across, at real size from a 1220 × 2440 mm sheet.");
assert.equal(describeCabinetFinish(statuario), "At real size from a 1220 × 2440 mm sheet.");
assert.equal(describeCabinetFinish(white), "Plain colour, 1220 × 2440 mm sheet.");
assert.equal(
  describeCabinetFinish(findCabinetLaminate("greenlam-woodgrains-5763")!),
  "Grain runs up doors and sides, at real size from a 1300 × 3050 mm sheet.",
  "a 4.25'x10' design says its own sheet"
);
assert.deepEqual(filterCabinetFinishes("albin", "solids").map((finish) => finish.supplierCode), ["5763", "5764", "5765"]);
assert.deepEqual(describeCabinetFinishChoice("greenlam-woodgrains-5308", []), {
  title: "Greenlam 5308 Rift Oak",
  detail: describeCabinetFinish(rift),
  placeholder: false,
});
assert.deepEqual(describeCabinetFinishChoice("oak_veneer", CABINET_MATERIALS), {
  title: "Oak veneer",
  detail: "Placeholder finish, not a real product. Choose a real design.",
  placeholder: true,
});
assert.equal(describeCabinetFinishChoice("glass", CABINET_MATERIALS).placeholder, false);
assert.equal(describeCabinetFinishChoice(undefined, []).title, "Not assigned");

// Every template starts from real designs, with them listed in the design and nothing else added.
const placeholderTemplates = CABINET_PRESET_OPTIONS.filter((option) => {
  const definition = createCabinetPreset(option.id);
  return collectCabinetFinishReferences(definition).some(isCabinetPlaceholderFinish);
});
assert.deepEqual(placeholderTemplates.map((option) => option.id), []);
const kitchen = createCabinetPreset("cabinet_run", "finish-sync");
assert.deepEqual(
  ids(kitchen),
  [...CABINET_MATERIALS.map((material) => material.id), ...collectCabinetFinishReferences(kitchen).filter((id) => findCabinetLaminate(id))]
);
assert.equal(syncCabinetFinishMaterials(kitchen), kitchen, "an in-step design is returned unchanged");
const reopened: CabinetDefinition = JSON.parse(JSON.stringify(kitchen));
assert.equal(syncCabinetFinishMaterials(reopened), reopened, "a saved copy that matches the catalogue is kept as it is");

// Choosing a design lists it; a design no longer chosen leaves; the built-ins stay.
const chosen = syncCabinetFinishMaterials({
  ...kitchen,
  modules: kitchen.modules.map((module) => ({ ...module, materialId: "greenlam-woodgrains-5523", frontMaterialId: "greenlam-woodgrains-5523" })),
  countertopMaterialId: "greenlam-abstracts-5574",
});
assert.deepEqual(ids(chosen), [...CABINET_MATERIALS.map((material) => material.id), "greenlam-woodgrains-5523", "greenlam-abstracts-5574"]);
assert(validateCabinetDefinition(chosen).valid, "a design with chosen laminates stays valid");
const quote = generateCabinetDocumentation(chosen).quoteSummary.lineItems.find((line) => line.id === "quote:mat:greenlam-woodgrains-5523");
assert.equal(quote?.unitCost, 80, "laminates use the laminate placeholder rate");

// A saved design draws a laminate from the current catalogue, so a corrected size reaches it.
const stale = { ...santos, textureSizeMm: { width: 2440, height: 4880 } };
const saved: CabinetDefinition = { ...chosen, materials: chosen.materials.map((material) => (material.id === santos.id ? stale : material)) };
assert.equal(findCabinetFinishMaterial(santos.id, saved.materials), santos);
assert.equal(currentCabinetMaterials(saved.materials).find((material) => material.id === santos.id), santos);
assert.equal(ids(syncCabinetFinishMaterials(saved)).length, ids(chosen).length);
const door = generateCabinetParts(saved).find((part) => part.type === "door_front" && part.materialId === santos.id);
assert(door, "the kitchen run has a 5523 door");
const mesh = createCabinetThreeGroup(saved, [door]).children[0] as THREE.Mesh;
const uv = mesh.geometry.getAttribute("uv");
const normal = mesh.geometry.getAttribute("normal");
const us: number[] = [];
for (let vertex = 0; vertex < uv.count; vertex += 1) if (Math.abs(normal.getZ(vertex)) > 0.99) us.push(uv.getX(vertex));
assert(Math.abs(Math.max(...us) - Math.min(...us) - door.size.width / 1220) < 1e-4, "the door uses the catalogue's 1220 mm width");

// Older designs keep their placeholder finishes; they still open, validate and price.
const legacy: CabinetDefinition = {
  ...kitchen,
  materials: CABINET_MATERIALS,
  modules: kitchen.modules.map((module) => ({ ...module, materialId: "white_melamine", frontMaterialId: "oak_veneer" })),
  countertopMaterialId: undefined,
};
assert.equal(syncCabinetFinishMaterials(legacy), legacy, "a placeholder design is left as it was");
assert(validateCabinetDefinition(legacy).valid);
assert(generateCabinetDocumentation(legacy).materialSchedule.some((item) => item.materialId === "oak_veneer"));

// Module helpers.
const firstModule = kitchen.modules[0];
assert.equal(resolveCabinetModuleFinishId(firstModule), firstModule.frontMaterialId ?? firstModule.materialId);
assert.equal(resolveCabinetModuleFinishId({ ...firstModule, frontMaterialId: undefined }), firstModule.materialId);
assert.equal(defaultCabinetContrastingFinishId({ ...firstModule, frontMaterialId: "greenlam-solids-101" }), "greenlam-solids-9861");
assert.equal(defaultCabinetContrastingFinishId({ ...firstModule, frontMaterialId: "greenlam-woodgrains-5308" }), "greenlam-solids-9861");
for (const dark of ["greenlam-solids-9861", "greenlam-woodgrains-791", "matte_black_laminate"]) {
  assert.equal(defaultCabinetContrastingFinishId({ ...firstModule, frontMaterialId: dark }), CABINET_DEFAULT_FINISH_ID, `white edges on ${dark}`);
}
// A new surface (countertop, splash, face frame) starts from a real design, never a placeholder.
assert.equal(inheritCabinetFinishId({ ...firstModule, frontMaterialId: "greenlam-woodgrains-5308" }), "greenlam-woodgrains-5308");
assert.equal(inheritCabinetFinishId({ ...firstModule, frontMaterialId: "glass", materialId: "greenlam-solids-107" }), "greenlam-solids-107");
assert.equal(inheritCabinetFinishId({ ...firstModule, frontMaterialId: "oak_veneer", materialId: "white_melamine" }), CABINET_DEFAULT_FINISH_ID);
assert.equal(inheritCabinetFinishId(undefined), CABINET_DEFAULT_FINISH_ID);

console.log(`Cabinet finish checks passed (${CABINET_FINISHES.length} real designs, ${CABINET_PRESET_OPTIONS.length} templates).`);
