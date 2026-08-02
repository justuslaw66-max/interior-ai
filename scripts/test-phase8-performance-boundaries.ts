import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file: string) => fs.readFileSync(file, "utf8");

const cabinetryOverlay = read("components/editor/design-page/CabinetryStudioOverlay.tsx");
assert.match(cabinetryOverlay, /dynamic<CabinetryStudioProps>/);
assert.match(cabinetryOverlay, /import\("@\/features\/cabinetry\/components\/CabinetryStudio"\)/);

const cabinetryController = read("features/cabinetry/useDesignPageCabinetry.ts");
assert.doesNotMatch(cabinetryController, /^import .*exportCabinetGlb/m);
assert.match(cabinetryController, /import\("\.\/exportCabinetGlb"\)/);

const cabinetExporter = read("features/cabinetry/exportCabinetGlb.ts");
assert.match(cabinetExporter, /import\("three\/examples\/jsm\/exporters\/GLTFExporter\.js"\)/);

const fingerprintSource = read("lib/snapshot-fingerprint.ts");
assert.match(fingerprintSource, /new WeakMap<DesignSnapshot, string>/);
assert.match(fingerprintSource, /fingerprintCache\.get\(snapshot\)/);

const sceneBridge = read("components/scene/ScenePerformanceBridge.tsx");
for (const metric of [
  "render.calls",
  "render.triangles",
  "memory.geometries",
  "memory.textures",
]) {
  assert.match(sceneBridge, new RegExp(metric.replace(".", "\\.")));
}

const assetPolicy = read("docs/architecture/3d-asset-performance-policy.md");
for (const heading of [
  "Supported formats",
  "Geometry and level of detail",
  "Textures and materials",
  "Coordinates, units, and validation",
  "Caching, CDN, and versioning",
  "Licensing and attribution",
  "Resource ownership and disposal",
]) {
  assert.match(assetPolicy, new RegExp(`## ${heading}`));
}

console.log("Phase 8 performance boundary checks passed.");
