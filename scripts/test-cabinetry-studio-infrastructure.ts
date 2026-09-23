import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createCabinetPreset } from "../features/cabinetry/presets";
import type { CabinetDefinition } from "../features/cabinetry/types";
import {
  emitCabinetStudioAnalytics,
  type CabinetStudioAnalyticsTracker,
} from "../features/cabinetry/infrastructure/CabinetStudioAnalytics";
import {
  createCabinetStudioCopyDefinition,
  createCabinetStudioPlacementPayload,
  downloadCabinetStudioArtifact,
  getCabinetStudioExportDescriptor,
  readCabinetStudioSourceDefinition,
  type CabinetStudioDocumentIOPorts,
  type CabinetStudioExportArtifact,
} from "../features/cabinetry/infrastructure/CabinetStudioDocumentIO";

async function main() {
  const definition = createCabinetPreset("base", "infrastructure-test");
  const artifacts: CabinetStudioExportArtifact[] = [
    "glb",
    "documentation_csv",
    "source_definition_json",
    "shop_drawing_svg",
    "fabrication_dxf",
    "fabrication_rfq_json",
    "millwork_package_json",
  ];
  const expectedDescriptors = {
    glb: ["download", "Millwork GLB exported.", "Unable to export cabinet GLB."],
    documentation_csv: [
      "docs",
      "Millwork documentation exported.",
      "Unable to export documentation.",
    ],
    source_definition_json: [
      "source",
      "Source definition exported.",
      "Unable to export source definition.",
    ],
    shop_drawing_svg: [
      "shopDrawing",
      "Shop drawing SVG exported.",
      "Unable to export shop drawing SVG.",
    ],
    fabrication_dxf: [
      "dxf",
      "Fabrication DXF exported.",
      "Unable to export fabrication DXF.",
    ],
    fabrication_rfq_json: [
      "rfq",
      "Fabrication RFQ exported.",
      "Unable to export fabrication RFQ.",
    ],
    millwork_package_json: [
      "package",
      "Millwork package exported.",
      "Unable to export millwork package.",
    ],
  } as const;

  for (const artifact of artifacts) {
    const descriptor = getCabinetStudioExportDescriptor(artifact);
    assert.equal(descriptor.artifact, artifact);
    assert.deepEqual(
      [descriptor.busyAction, descriptor.successMessage, descriptor.fallbackError],
      expectedDescriptors[artifact]
    );
  }

  const routedArtifacts: CabinetStudioExportArtifact[] = [];
  const ports: CabinetStudioDocumentIOPorts = {
    downloadGlb: () => {
      routedArtifacts.push("glb");
    },
    downloadDocumentationCsv: () => {
      routedArtifacts.push("documentation_csv");
    },
    downloadSourceDefinitionJson: () => {
      routedArtifacts.push("source_definition_json");
    },
    downloadShopDrawingSvg: () => {
      routedArtifacts.push("shop_drawing_svg");
    },
    downloadFabricationDxf: () => {
      routedArtifacts.push("fabrication_dxf");
    },
    downloadFabricationQuoteRequestJson: () => {
      routedArtifacts.push("fabrication_rfq_json");
    },
    downloadDocumentationPackageJson: () => {
      routedArtifacts.push("millwork_package_json");
    },
  };
  for (const artifact of artifacts) {
    const completed = await downloadCabinetStudioArtifact(
      definition,
      artifact,
      ports
    );
    assert.equal(completed.artifact, artifact);
  }
  assert.deepEqual(routedArtifacts, artifacts, "every export must use its exact port");

  const failingPorts: CabinetStudioDocumentIOPorts = {
    ...ports,
    downloadGlb: () => {
      throw new Error("export port failed");
    },
  };
  await assert.rejects(
    downloadCabinetStudioArtifact(definition, "glb", failingPorts),
    /export port failed/,
    "adapter errors must remain available to the Studio's existing presentation layer"
  );

  let invalidFileReadCount = 0;
  await assert.rejects(
    readCabinetStudioSourceDefinition({
      name: "cabinet.txt",
      size: 25,
      type: "application/json",
      text: async () => {
        invalidFileReadCount += 1;
        return "{}";
      },
    }),
    /Choose a \.json source definition file\./
  );
  assert.equal(
    invalidFileReadCount,
    0,
    "external file metadata must be validated before reading contents"
  );

  const definitionJson = JSON.stringify(definition);
  const imported = await readCabinetStudioSourceDefinition({
    name: "cabinet.json",
    size: Buffer.byteLength(definitionJson),
    type: "application/json",
    text: async () => definitionJson,
  });
  assert.deepEqual(imported, definition, "validated source JSON must retain its model");
  await assert.rejects(
    readCabinetStudioSourceDefinition({
      name: "cabinet.json",
      size: 9,
      type: "application/json",
      text: async () => "not-json",
    }),
    /Source definition JSON is not valid JSON\./
  );

  const exportedBlob = new Blob(["glb"], { type: "model/gltf-binary" });
  let exportedDefinition: CabinetDefinition | null = null;
  const placementPayload = await createCabinetStudioPlacementPayload(definition, {
    exportGlb: async (candidate) => {
      exportedDefinition = candidate;
      return exportedBlob;
    },
  });
  assert.equal(exportedDefinition, definition);
  assert.equal(placementPayload.definition, definition);
  assert.equal(placementPayload.glbBlob, exportedBlob);
  assert(placementPayload.bom.length > 0);
  assert.equal("placeAsCopy" in placementPayload, false);

  const copyPayload = await createCabinetStudioPlacementPayload(definition, {
    placeAsCopy: true,
    exportGlb: async () => exportedBlob,
    bom: placementPayload.bom,
  });
  assert.equal(copyPayload.placeAsCopy, true);
  assert.equal(copyPayload.bom, placementPayload.bom);

  const clockCalls: string[] = [];
  const copy = createCabinetStudioCopyDefinition(definition, {
    nowIso: () => {
      clockCalls.push("iso");
      return "2026-07-20T00:00:00.000Z";
    },
    nowMs: () => {
      clockCalls.push("ms");
      return 1_234;
    },
  });
  assert.deepEqual(clockCalls, ["iso", "ms"]);
  assert.equal(copy.id, "cabinet-1234");
  assert.equal(copy.name, `${definition.name} copy`);
  assert.equal(copy.createdAt, "2026-07-20T00:00:00.000Z");
  assert.equal(copy.updatedAt, "2026-07-20T00:00:00.000Z");
  assert.equal(definition.id, "infrastructure-test", "copying must not mutate source data");

  const tracked: Array<{
    event: string;
    details: Record<string, unknown>;
  }> = [];
  const tracker: CabinetStudioAnalyticsTracker = (event, details) => {
    tracked.push({ event, details });
  };
  emitCabinetStudioAnalytics(
    "millwork_test_event",
    { accessLevel: "pro", mode: "edit", definition },
    { artifact: "glb" },
    tracker
  );
  assert.deepEqual(tracked, [
    {
      event: "millwork_test_event",
      details: {
        access_level: "pro",
        studio_mode: "edit",
        assembly_type: definition.millworkAssemblyType ?? "cabinet",
        module_count: definition.modules.length,
        artifact: "glb",
      },
    },
  ]);
  assert.doesNotThrow(() =>
    emitCabinetStudioAnalytics(
      "millwork_test_failure",
      { accessLevel: "consumer", mode: "create", definition },
      {},
      () => {
        throw new Error("analytics unavailable");
      }
    )
  );

  const studioSource = readFileSync(
    "features/cabinetry/components/CabinetryStudio.tsx",
    "utf8"
  );
  for (const forbiddenDirectDependency of [
    "@/lib/analytics",
    "../exportCabinetGlb",
    "../exportCabinetFabricationDxf",
    "../exportCabinetShopDrawingSvg",
    "../importPolicy",
    "parseCabinetSourceDefinitionJson",
  ]) {
    assert.equal(
      studioSource.includes(forbiddenDirectDependency),
      false,
      `${forbiddenDirectDependency} must remain behind the infrastructure boundary`
    );
  }

  console.log("Cabinetry Studio infrastructure adapter tests passed.");
}

void main();
