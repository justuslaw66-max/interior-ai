import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA,
  SURFACE_MATERIAL_CATALOG_GENERATED_MARKER,
} from "../lib/generated/surface-material-catalog.generated";
import {
  PRODUCTION_SURFACE_MATERIAL_RENDER_TUPLES,
  SURFACE_MATERIAL_RENDER_GENERATED_MARKER,
} from "../lib/generated/surface-material-render.generated";
import {
  createSurfaceMaterialCatalogLoader,
  type SurfaceMaterialCatalogModule,
} from "../lib/surface-material-catalog-loader";
import {
  SURFACE_MATERIAL_RENDER_REGISTRY,
  getRuntimeSurfaceMaterialById,
} from "../lib/surface-material-runtime";

const read = (filePath: string) => fs.readFileSync(filePath, "utf8");

function findProductionTypeScriptFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) return findProductionTypeScriptFiles(filePath);
    return /\.tsx?$/.test(entry.name) ? [filePath] : [];
  });
}

function assertSurfaceCatalogChunkBoundary(): void {
  const nextRoot = path.join(process.cwd(), ".next");
  const routeManifestPath = path.join(
    nextRoot,
    "server/app/design/page_client-reference-manifest.js"
  );
  if (!fs.existsSync(routeManifestPath)) return;

  const buildManifest = JSON.parse(
    read(path.join(nextRoot, "build-manifest.json"))
  ) as { polyfillFiles?: string[]; rootMainFiles?: string[] };
  const routeManifest = read(routeManifestPath);
  const initialChunks = new Set(
    Array.from(
      routeManifest.matchAll(/(static\/chunks\/[^"\\]+\.(?:js|css))/g),
      (match) => match[1]
    )
  );
  for (const chunk of [
    ...(buildManifest.polyfillFiles ?? []),
    ...(buildManifest.rootMainFiles ?? []),
  ]) {
    initialChunks.add(chunk);
  }

  const staticChunkRoot = path.join(nextRoot, "static", "chunks");
  const javascriptChunks = fs
    .readdirSync(staticChunkRoot)
    .filter((name) => name.endsWith(".js"))
    .map((name) => `static/chunks/${name}`);
  const chunksContaining = (marker: string) =>
    javascriptChunks.filter((chunk) => read(path.join(nextRoot, chunk)).includes(marker));
  const catalogChunks = chunksContaining(SURFACE_MATERIAL_CATALOG_GENERATED_MARKER);
  const catalogOnlySourceUrl = PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA.find(
    (record) => record.material_id === "goodrich-geff-novaclick-gnv-018-grand-marble"
  )?.source.source_url;
  assert.ok(catalogOnlySourceUrl);
  const catalogOnlyValueChunks = chunksContaining(catalogOnlySourceUrl);
  const renderChunks = chunksContaining("goodrich-geff-novaclick-gnv-018-grand-marble");
  const nipponPaintChunks = chunksContaining("nippon-1162-angel-pink");

  assert.ok(catalogChunks.length > 0, "the full surface catalog must have a measurable lazy chunk");
  assert.ok(
    catalogChunks.every((chunk) => !initialChunks.has(chunk)),
    "the full surface catalog must be absent from /design initial chunks"
  );
  assert.ok(catalogOnlyValueChunks.length > 0, "lazy-only surface metadata must be measurable");
  assert.ok(
    catalogOnlyValueChunks.every((chunk) => !initialChunks.has(chunk)),
    "surface source/sample metadata must not be copied into /design initial chunks"
  );
  assert.ok(
    renderChunks.some((chunk) => initialChunks.has(chunk)),
    "the synchronous render registry must remain on the /design initial path"
  );
  assert.ok(nipponPaintChunks.length > 0, "the Nippon paint catalog must have a measurable lazy chunk");
  assert.ok(
    nipponPaintChunks.every((chunk) => !initialChunks.has(chunk)),
    "the Nippon paint catalog must be absent from /design initial chunks"
  );
  assert.equal(
    chunksContaining("test-only-published-flooring").length,
    0,
    "test-only surface fixtures must be absent from production chunks"
  );
}

async function assertSurfaceMaterialRuntimeBoundary(): Promise<void> {
  assert.equal(SURFACE_MATERIAL_RENDER_GENERATED_MARKER, "surface_render_registry_v1");
  assert.equal(SURFACE_MATERIAL_CATALOG_GENERATED_MARKER, "surface_catalog_metadata_v1");
  assert.equal(PRODUCTION_SURFACE_MATERIAL_RENDER_TUPLES.length, 980);
  assert.equal(PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA.length, 980);
  assert.equal(SURFACE_MATERIAL_RENDER_REGISTRY.length, 980);

  const renderIds = SURFACE_MATERIAL_RENDER_REGISTRY.map(
    (record) => record.surface_material.material_id
  );
  const catalogIds = PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA.map(
    (record) => record.material_id
  );
  assert.deepEqual(catalogIds, renderIds);
  assert.equal(new Set(renderIds).size, renderIds.length);
  assert.ok(!renderIds.includes("test-only-published-flooring"));

  const renderRecord = getRuntimeSurfaceMaterialById(
    "goodrich-geff-novaclick-gnv-018-grand-marble"
  );
  assert.ok(renderRecord);
  assert.equal(renderRecord.physical_specs.tile_width_mm, 457.2);
  assert.equal(renderRecord.physical_specs.tile_length_mm, 914.4);
  assert.deepEqual(renderRecord.texture_assets.texture_repeat_size_cm, {
    width: 365.76,
    height: 365.76,
  });
  assert.equal(renderRecord.rendering.roughness, 0.7);
  assert.equal(renderRecord.rendering.metalness, 0);

  const metadataRecord = PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA.find(
    (record) => record.material_id === renderRecord.surface_material.material_id
  );
  assert.ok(metadataRecord);
  assert.ok(metadataRecord.source.source_url.length > 0);
  assert.ok(Array.isArray(metadataRecord.classification.room_suitability));
  assert.ok("sample_available" in metadataRecord.commerce);
  assert.ok("tileable" in renderRecord.texture_assets);

  let importCalls = 0;
  const moduleFixture: SurfaceMaterialCatalogModule = {
    PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA,
    NIPPON_PAINT_COLOURS: [
      {
        id: "nippon-test",
        code: "TEST",
        name: "Test paint",
        hex: "#AABBCC",
        family: "accent",
        sourcePath: "test/test-paint",
      },
    ],
  };
  const loader = createSurfaceMaterialCatalogLoader(async () => {
    importCalls += 1;
    return moduleFixture;
  });
  const firstPromise = loader.load();
  const secondPromise = loader.load();
  assert.equal(firstPromise, secondPromise);
  const firstCatalog = await firstPromise;
  const secondCatalog = await loader.load();
  assert.equal(importCalls, 1);
  assert.equal(firstCatalog, secondCatalog);
  assert.equal(firstCatalog.length, SURFACE_MATERIAL_RENDER_REGISTRY.length);
  const loadedSnapshot = loader.getSnapshot();
  assert.equal(loadedSnapshot.status, "success");
  assert.equal(loadedSnapshot.wallPaintSwatches.length, 1);
  assert.equal(loadedSnapshot.wallPaintSwatches[0]?.brand, "Nippon Paint");
  const fullGrandMarble = firstCatalog.find(
    (record) => record.surface_material.material_id === renderRecord.surface_material.material_id
  );
  assert.ok(fullGrandMarble);
  assert.equal(fullGrandMarble.source.source_url, metadataRecord.source.source_url);
  assert.equal(fullGrandMarble.physical_specs.tile_width_mm, 457.2);

  let failureCalls = 0;
  const failedLoader = createSurfaceMaterialCatalogLoader(async () => {
    failureCalls += 1;
    if (failureCalls === 1) throw new Error("catalog unavailable");
    return moduleFixture;
  });
  await assert.rejects(failedLoader.load(), /catalog unavailable/);
  await assert.rejects(failedLoader.load(), /catalog unavailable/);
  assert.equal(failureCalls, 1);
  assert.equal(failedLoader.getSnapshot().status, "error");
  const recoveredCatalog = await failedLoader.retry();
  assert.equal(failureCalls, 2);
  assert.equal(recoveredCatalog.length, SURFACE_MATERIAL_RENDER_REGISTRY.length);
  assert.equal(failedLoader.getSnapshot().status, "success");

  const loaderSource = read("lib/surface-material-catalog-loader.ts");
  assert.match(
    loaderSource,
    /import\("\.\/generated\/surface-material-catalog\.generated"\)/
  );
  assert.match(loaderSource, /import\("\.\/nippon-paint-colours"\)/);
  for (const sourcePath of ["app", "components", "features", "hooks", "lib"].flatMap(
    findProductionTypeScriptFiles
  )) {
    if (
      sourcePath === "lib/surface-material-catalog-loader.ts" ||
      sourcePath === "lib/generated/surface-material-catalog.generated.ts"
    ) {
      continue;
    }
    assert.doesNotMatch(
      read(sourcePath),
      /surface-material-catalog\.generated/,
      `${sourcePath} must not statically import or re-export the full generated catalog`
    );
    if (sourcePath !== "lib/nippon-paint-colours.ts") {
      assert.doesNotMatch(
        read(sourcePath),
        /from ["']\.\/nippon-paint-colours["']|from ["']@\/lib\/nippon-paint-colours["']/,
        `${sourcePath} must not statically import the Nippon paint catalog`
      );
    }
  }
  assert.doesNotMatch(
    read("lib/generated/surface-material-render.generated.ts"),
    /source_url|sample_request_url|room_suitability|test-only-published-flooring/
  );

  const panelSource = read("components/editor/DesignControlsPlanPanel.tsx");
  assert.match(
    panelSource,
    /const \[roomFinishPanelOpen, setRoomFinishPanelOpen\] = useState\(false\)/
  );
  assert.match(panelSource, /useSurfaceMaterialCatalog\(roomFinishPanelOpen\)/);
  assert.doesNotMatch(panelSource, /useSurfaceMaterialCatalog\(true\)/);
  assert.match(
    panelSource,
    /showStandaloneFloorFinishPanel[\s\S]*?setRoomFinishPanelOpen\(\(open\) => !open\)[\s\S]*?renderSurfaceMaterialBrowser\(\)/
  );
  const hookSource = read("lib/useSurfaceMaterialCatalog.ts");
  assert.match(hookSource, /if \(!enabled \|\| snapshot\.status !== "idle"\) return/);
  const boundarySource = read(
    "components/editor/design-controls-plan/SurfaceMaterialCatalogBoundary.tsx"
  );
  assert.match(boundarySource, /if \(!open\) return null/);
  assert.match(boundarySource, /status === "success"/);
  assert.match(boundarySource, /current room finishes are unchanged/i);
  assert.match(boundarySource, /onRetry/);
}

async function main(): Promise<void> {
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

  await assertSurfaceMaterialRuntimeBoundary();
  assertSurfaceCatalogChunkBoundary();
  console.log("Phase 8 performance boundary checks passed.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
