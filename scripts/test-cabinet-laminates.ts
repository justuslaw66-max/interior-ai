import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";

import { CABINET_LAMINATES, findCabinetLaminate } from "../features/cabinetry/catalog/laminates";
import type { CabinetLaminateCatalogItem } from "../features/cabinetry/catalog/laminates";
import { CABINET_MATERIALS } from "../features/cabinetry/catalog/materials";
import { createCabinetThreeGroup } from "../features/cabinetry/createCabinetThreeGroup";
import { resolveCabinetPartFabricationSpec } from "../features/cabinetry/fabricationSemantics";
import { generateCabinetParts } from "../features/cabinetry/generateCabinetParts";
import { resolveFaceTextureAxes } from "../features/cabinetry/materialTexture";
import { createCabinetPreset } from "../features/cabinetry/presets";
import type { CabinetDefinition, CabinetGrainDirection, CabinetPart } from "../features/cabinetry/types";
import { buildCabinetLaminateRuntimeSource } from "./generate-cabinet-laminate-runtime";

const root = process.cwd();
const near = (actual: number, expected: number, message: string) =>
  assert(Math.abs(actual - expected) < 1e-4, `${message}: expected ${expected}, got ${actual}`);

/** Width and height of a WebP file (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(file: string): { width: number; height: number } {
  const data = readFileSync(file);
  assert.equal(data.toString("ascii", 0, 4), "RIFF", `${file} is not a WebP file`);
  const chunk = data.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  assert.equal(chunk, "VP8X", `${file} has an unknown WebP chunk ${chunk}`);
  return { width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1 };
}

// The generated runtime matches its JSON source.
assert.equal(
  readFileSync(path.join(root, "lib/generated/cabinet-laminates.generated.ts"), "utf8"),
  buildCabinetLaminateRuntimeSource(),
  "lib/generated/cabinet-laminates.generated.ts is out of date; run npm run generate:cabinet-laminates."
);

// The Greenlam 4'x8' catalogue: every design once, every picture present and never stretched.
assert.equal(CABINET_LAMINATES.length, 342, "Greenlam's 4'x8' HPL collection has 342 designs in the catalogue.");
assert.equal(new Set(CABINET_LAMINATES.map((laminate) => laminate.id)).size, CABINET_LAMINATES.length);
assert(CABINET_LAMINATES.every((laminate) => !CABINET_MATERIALS.some((material) => material.id === laminate.id)));
const textured = CABINET_LAMINATES.filter((laminate) => laminate.textureUrl);
assert.equal(textured.length, 234, "234 designs draw their sheet picture; the solid colours are flat.");
for (const laminate of CABINET_LAMINATES) {
  assert.match(laminate.color ?? "", /^#[0-9a-f]{6}$/, `${laminate.id} needs its mean colour.`);
  if (!laminate.textureUrl) {
    assert.equal(laminate.textureSizeMm, undefined, `${laminate.id} is a flat colour.`);
    continue;
  }
  const size = laminate.textureSizeMm;
  assert(size, `${laminate.id} needs the real size its picture covers.`);
  assert.equal(size.width, 1220, `${laminate.id}'s picture spans the sheet's 1220 mm width.`);
  for (const url of [laminate.textureUrl, laminate.swatchUrl]) {
    assert(url && existsSync(path.join(root, "public", url)), `${laminate.id} is missing ${url}.`);
  }
  const pixels = webpSize(path.join(root, "public", laminate.textureUrl));
  const stretch = size.width / pixels.width / (size.height / pixels.height);
  assert(Math.abs(stretch - 1) < 0.005, `${laminate.id}'s picture would be stretched by ${stretch}.`);
}
assert.equal(findCabinetLaminate("greenlam-woodgrains-3396"), undefined, "3396's picture is a boxed thumbnail.");
assert(findCabinetLaminate("greenlam-woodgrains-5394")?.textureUrl, "5394 uses the full picture from the 4.25'x10' collection.");
assert(findCabinetLaminate("greenlam-abstracts-5594") && findCabinetLaminate("greenlam-unicore-5594"));
const across = CABINET_LAMINATES.filter((laminate) => laminate.textureGrain === "across").map((laminate) => laminate.supplierCode);
assert.deepEqual(across.sort(), ["5517", "5518", "5519", "5520", "5523", "5524", "5527", "5528", "5529", "5530"]);

function withLaminateFronts(
  laminate: CabinetLaminateCatalogItem,
  grainDirection?: CabinetGrainDirection
): CabinetDefinition {
  const preset = createCabinetPreset("wardrobe", `laminate-${laminate.id}`);
  return {
    ...preset,
    materials: [...preset.materials, laminate],
    modules: preset.modules.map((module) => ({ ...module, frontMaterialId: laminate.id, grainDirection })),
  };
}

function frontFaceUv(definition: CabinetDefinition, part: CabinetPart) {
  const group = createCabinetThreeGroup(definition, [part]);
  const mesh = group.children[0] as THREE.Mesh;
  const uv = mesh.geometry.getAttribute("uv");
  const normal = mesh.geometry.getAttribute("normal");
  const us: number[] = [];
  const vs: number[] = [];
  for (let vertex = 0; vertex < uv.count; vertex += 1) {
    if (Math.abs(normal.getZ(vertex)) < 0.99) continue;
    us.push(uv.getX(vertex));
    vs.push(uv.getY(vertex));
  }
  return { uMin: Math.min(...us), uSpan: Math.max(...us) - Math.min(...us), vMin: Math.min(...vs), vSpan: Math.max(...vs) - Math.min(...vs) };
}

// A woodgrain door shows its own size of sheet, grain up the door, from the sheet's place in the cabinet.
const teak = findCabinetLaminate("greenlam-woodgrains-5003");
assert(teak?.textureSizeMm);
const teakWardrobe = withLaminateFronts(teak);
const teakFronts = generateCabinetParts(teakWardrobe).filter((part) => part.type === "door_front" && part.materialId === teak.id);
assert(teakFronts.length >= 2, "The wardrobe fixture needs two or more doors.");
for (const door of teakFronts) {
  assert.equal(resolveCabinetPartFabricationSpec(teakWardrobe, door).grainDirection, "vertical");
  const uv = frontFaceUv(teakWardrobe, door);
  near(uv.uSpan, door.size.width / 1220, `${door.id} shows its width of sheet`);
  near(uv.vSpan, door.size.height / teak.textureSizeMm.height, `${door.id} shows its height of sheet`);
  near(uv.uMin, door.position.x / 1220, `${door.id} continues the sheet from its neighbour`);
  near(uv.vMin, door.position.y / teak.textureSizeMm.height, `${door.id} sits at its height on the sheet`);
}

// A horizontal-grain design reads horizontal by default: the picture stays upright, its grain across the door.
const santos = findCabinetLaminate("greenlam-woodgrains-5523");
assert(santos?.textureSizeMm && santos.textureGrain === "across");
const santosWardrobe = withLaminateFronts(santos);
const santosDoor = generateCabinetParts(santosWardrobe).find((part) => part.type === "door_front" && part.materialId === santos.id);
assert(santosDoor);
assert.equal(resolveCabinetPartFabricationSpec(santosWardrobe, santosDoor).grainDirection, "horizontal");
const santosUv = frontFaceUv(santosWardrobe, santosDoor);
near(santosUv.uSpan, santosDoor.size.width / 1220, "a horizontal-grain door keeps the picture upright");
near(santosUv.vSpan, santosDoor.size.height / santos.textureSizeMm.height, "a horizontal-grain door keeps its height of sheet");

// Choosing horizontal grain for a woodgrain turns the picture a quarter turn, at the same real size.
const turnedWardrobe = withLaminateFronts(teak, "horizontal");
const turnedDoor = generateCabinetParts(turnedWardrobe).find((part) => part.type === "door_front" && part.materialId === teak.id);
assert(turnedDoor);
const turnedUv = frontFaceUv(turnedWardrobe, turnedDoor);
near(turnedUv.uSpan, turnedDoor.size.height / 1220, "a turned picture's width runs up the door");
near(turnedUv.vSpan, turnedDoor.size.width / teak.textureSizeMm.height, "a turned picture's length runs across the door");

// A door's top edge (no grain axis in its face) follows the edge's longer side.
assert.deepEqual(
  resolveFaceTextureAxes("y", { positionMm: { x: 0, y: 0, z: 0 }, sizeMm: { width: 600, height: 2000, depth: 18 }, grainAxis: "y" }, "along"),
  { heightAxis: "x", widthAxis: "z" }
);

// The eight built-in materials keep Three.js's own coordinates: one picture per face, as before.
const builtIn = createCabinetPreset("wardrobe", "laminate-built-in");
const builtInPart = generateCabinetParts(builtIn)[0];
const builtInMesh = createCabinetThreeGroup(builtIn, [builtInPart]).children[0] as THREE.Mesh;
const defaultBox = new THREE.BoxGeometry(builtInPart.size.width / 1000, builtInPart.size.height / 1000, builtInPart.size.depth / 1000);
assert.deepEqual(Array.from(builtInMesh.geometry.getAttribute("uv").array), Array.from(defaultBox.getAttribute("uv").array));

console.log(`Cabinet laminate checks passed (${CABINET_LAMINATES.length} laminates, ${textured.length} sheet pictures).`);
