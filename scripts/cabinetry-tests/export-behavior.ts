import assert from "assert";
import {
  exportCabinetAsGlb,
} from "@/features/cabinetry/exportCabinetGlb";
import {
  generateCabinetBOM,
} from "@/features/cabinetry/generateCabinetBOM";
import {
  buildCabinetPlacedAssetInstallerWorkOrder,
  buildCabinetPlacedAssetInstallerWorkOrderFileName,
  buildCabinetPlacedAssetInstallerWorkOrderJson,
  buildCabinetPlacedAssetPackage,
  buildCabinetPlacedAssetPackageFileName,
  buildCabinetPlacedAssetPackageJson,
  buildCabinetProjectSchedulePackage,
  buildCabinetProjectSchedulePackageJson,
  buildCabinetProjectScheduleCsv,
  buildCabinetProjectScheduleCsvFileName,
  buildCabinetProjectScopePackage,
  buildCabinetProjectScopePackageFileName,
  buildCabinetProjectScopePackageJson,
  buildCabinetProjectApprovalPackage,
  buildCabinetProjectApprovalPackageFileName,
  buildCabinetProjectApprovalPackageJson,
  buildCabinetProjectCncBatchPackage,
  buildCabinetProjectCncBatchPackageFileName,
  buildCabinetProjectCncBatchPackageJson,
  buildCabinetProjectCutListPackage,
  buildCabinetProjectCutListPackageFileName,
  buildCabinetProjectCutListPackageJson,
  buildCabinetProjectDrawingSetPackage,
  buildCabinetProjectDrawingSetPackageFileName,
  buildCabinetProjectDrawingSetPackageJson,
  buildCabinetProjectFabricationQuoteRequest,
  buildCabinetProjectFabricationQuoteRequestFileName,
  buildCabinetProjectFabricationQuoteRequestJson,
  buildCabinetProjectFabricationReleasePackage,
  buildCabinetProjectFabricationReleasePackageFileName,
  buildCabinetProjectFabricationReleasePackageJson,
  buildCabinetProjectFieldVerificationPackage,
  buildCabinetProjectFieldVerificationPackageFileName,
  buildCabinetProjectFieldVerificationPackageJson,
  buildCabinetProjectFinishSchedulePackage,
  buildCabinetProjectFinishSchedulePackageFileName,
  buildCabinetProjectFinishSchedulePackageJson,
  buildCabinetProjectHandoffPackage,
  buildCabinetProjectHandoffPackageFileName,
  buildCabinetProjectHandoffPackageJson,
  buildCabinetProjectInstallationPlanPackage,
  buildCabinetProjectInstallationPlanPackageFileName,
  buildCabinetProjectInstallationPlanPackageJson,
  buildCabinetProjectProcurementPackage,
  buildCabinetProjectProcurementPackageFileName,
  buildCabinetProjectProcurementPackageJson,
  buildCabinetProjectPurchaseReadinessPackage,
  buildCabinetProjectPurchaseReadinessPackageFileName,
  buildCabinetProjectPurchaseReadinessPackageJson,
  buildCabinetProjectQuotePackage,
  buildCabinetProjectQuotePackageFileName,
  buildCabinetProjectQuotePackageJson,
  buildCabinetProjectRevisionPackage,
  buildCabinetProjectRevisionPackageFileName,
  buildCabinetProjectRevisionPackageJson,
  buildCabinetSourceDefinitionFingerprint,
  generateCabinetDocumentation,
} from "@/features/cabinetry/generateCabinetDocumentation";
import {
  generateCabinetParts,
} from "@/features/cabinetry/generateCabinetParts";
import {
  createCabinetPreset,
} from "@/features/cabinetry/presets";
import {
  buildMillworkAssetManifest,
} from "@/features/millwork/buildMillworkAssetManifest";
import {
  createCabinetMillworkDefinition,
} from "@/features/millwork/createCabinetMillworkDefinition";
import type {
  PlacedCabinetAsset,
} from "@/features/cabinetry/types";
import {
  resolveRoomShoppingItems,
  summarizeShoppingRooms,
  summarizeWholeHomeShopping,
} from "@/lib/room-shopping";
import {
  snapshotToStored,
  storedToSnapshot,
} from "@/lib/room-persistence";
import {
  createRoom,
  type DesignItem,
  type DesignSnapshot,
} from "@/lib/room-types";
import {
  clone,
} from "./helpers";

class NodeFileReader {
  result: string | ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  onerror: ((error: Error) => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then(
      (result) => this.complete(result),
      (error: unknown) => this.fail(error)
    );
  }

  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then(
      (result) => {
        const mimeType = blob.type || "application/octet-stream";
        this.complete(`data:${mimeType};base64,${Buffer.from(result).toString("base64")}`);
      },
      (error: unknown) => this.fail(error)
    );
  }

  private complete(result: string | ArrayBuffer): void {
    this.result = result;
    this.onloadend?.();
  }

  private fail(error: unknown): void {
    this.onerror?.(error instanceof Error ? error : new Error(String(error)));
  }
}

function installNodeFileReader(): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "FileReader");
  Object.defineProperty(globalThis, "FileReader", {
    configurable: true,
    value: NodeFileReader,
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, "FileReader", previous);
    else Reflect.deleteProperty(globalThis, "FileReader");
  };
}

export async function runExportBehaviorTests(): Promise<void> {
  const base = createCabinetPreset("base", "cabinet-test-export-base");
  const run = clone(base);
  run.modules.push({ ...run.modules[0], id: "module-2", width: 600, drawerCount: 2 });
  run.totalWidth = 1500;
  const runParts = generateCabinetParts(run);
  const secondModulePart = runParts.find((part) => part.moduleId === "module-2" && part.type === "left_side_panel");
  assert(secondModulePart, "multi-module cabinet should generate second module parts");
  assert.strictEqual(secondModulePart?.position.x, 900, "second module should be offset by first module width");

  const bom = generateCabinetBOM(base);
  const documentation = generateCabinetDocumentation(base);
  assert(
    bom.some((item) => item.type === "drawer_front" && item.quantity === 3),
    "BOM should group repeated drawer fronts"
  );
  assert(bom.some((item) => item.type === "handle" && item.quantity === 3), "BOM should include handle quantities");

  const baseMillworkDefinition = createCabinetMillworkDefinition(base);
  assert.strictEqual(
    baseMillworkDefinition.schema,
    "custom_millwork.definition.v1",
    "cabinet millwork wrapper should use the custom millwork schema"
  );
  assert.strictEqual(
    baseMillworkDefinition.sourceDefinition.id,
    base.id,
    "cabinet millwork wrapper should retain the cabinet definition as its source"
  );
  assert.deepStrictEqual(
    baseMillworkDefinition.dimensions,
    { width: base.totalWidth, height: base.height, depth: base.depth, units: "mm" },
    "cabinet millwork wrapper should expose normalized millwork dimensions"
  );
  assert.strictEqual(
    baseMillworkDefinition.assemblyProfile.projectPhase,
    "mvp",
    "base cabinet millwork wrapper should include MVP assembly profile metadata"
  );
  assert(
    baseMillworkDefinition.capabilities.includes("house_plan_smart_asset") &&
      baseMillworkDefinition.capabilities.includes("edit_after_placement") &&
      baseMillworkDefinition.capabilities.includes("bom"),
    "cabinet millwork wrapper should advertise MVP smart-asset capabilities"
  );
  const cabinetAssetManifest = buildMillworkAssetManifest({
    assetId: "cabinet-instance-1",
    assetType: "parametric_cabinet",
    millworkDefinition: baseMillworkDefinition,
    sourceDefinition: base,
    roomId: "room-1",
    transform: {
      position: [1.25, 0, -0.5],
      rotation: [0, Math.PI / 4, 0],
      scale: [1, 1, 1],
    },
    glbAssetUrl: "blob:local-test-glb",
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
  });
  assert.strictEqual(
    cabinetAssetManifest.schema,
    "custom_millwork.asset_manifest.v1",
    "placed cabinet should expose a versioned asset manifest"
  );
  assert.strictEqual(
    cabinetAssetManifest.sourceDefinitionId,
    base.id,
    "asset manifest should point to the editable source definition"
  );
  assert.strictEqual(
    cabinetAssetManifest.sourceDefinitionVersion,
    base.version,
    "asset manifest should preserve the source definition version"
  );
  assert.strictEqual(
    cabinetAssetManifest.generatedOutput.durable,
    false,
    "blob GLB URLs should be marked as session-local generated output"
  );
  const cabinetItem: DesignItem = {
    id: "cabinet-instance-1",
    instanceId: "cabinet-instance-1",
    productId: "parametric-cabinet",
    variantId: base.id,
    assetType: "parametric_cabinet",
    roomId: "room-1",
    assemblyType: baseMillworkDefinition.assemblyType,
    millworkAssetManifest: cabinetAssetManifest,
    millworkDefinition: baseMillworkDefinition,
    millworkDefinitionVersion: baseMillworkDefinition.version,
    millworkMaterials: baseMillworkDefinition.materials,
    millworkHardware: baseMillworkDefinition.hardware,
    name: base.name,
    cabinetDefinition: base,
    glbAssetUrl: "blob:local-test-glb",
    bomSnapshot: bom,
    materialScheduleSnapshot: documentation.materialSchedule,
    hardwareScheduleSnapshot: documentation.hardwareSchedule,
    edgeBandingScheduleSnapshot: documentation.edgeBandingSchedule,
    cutListSnapshot: documentation.cutList,
    dimensionScheduleSnapshot: documentation.dimensionSchedule,
    drawingViewScheduleSnapshot: documentation.drawingViewSchedule,
    installerNotesSnapshot: documentation.installerNotes,
    releaseChecklistSnapshot: documentation.releaseChecklist,
    quoteSummarySnapshot: documentation.quoteSummary,
    supplierSkuMappingsSnapshot: documentation.supplierSkuMappings,
    supplierReadinessSnapshot: documentation.supplierReadiness,
    fabricationReleaseReadinessSnapshot: documentation.fabricationReleaseReadiness,
    position: [1.25, 0, -0.5],
    rotationY: Math.PI / 4,
    transform: {
      position: [1.25, 0, -0.5],
      rotationY: Math.PI / 4,
      rotation: [0, Math.PI / 4, 0],
      scale: [1, 1, 1],
    },
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    includeInCheckout: false,
  };
  const placedCabinetAsset: PlacedCabinetAsset = {
    id: cabinetItem.instanceId,
    assetType: "parametric_cabinet",
    assetManifest: cabinetAssetManifest,
    assemblyType: baseMillworkDefinition.assemblyType,
    cabinetDefinitionId: base.id,
    cabinetDefinition: base,
    millworkDefinition: baseMillworkDefinition,
    millworkDefinitionVersion: baseMillworkDefinition.version,
    glbAssetUrl: "blob:local-test-glb",
    transform: {
      position: cabinetItem.position,
      rotation: [0, cabinetItem.rotationY ?? 0, 0],
      scale: [1, 1, 1],
    },
    roomId: cabinetItem.roomId,
    materials: base.materials,
    hardware: base.hardware,
    bomSnapshot: bom,
    materialScheduleSnapshot: documentation.materialSchedule,
    hardwareScheduleSnapshot: documentation.hardwareSchedule,
    edgeBandingScheduleSnapshot: documentation.edgeBandingSchedule,
    cutListSnapshot: documentation.cutList,
    dimensionScheduleSnapshot: documentation.dimensionSchedule,
    drawingViewScheduleSnapshot: documentation.drawingViewSchedule,
    installerNotesSnapshot: documentation.installerNotes,
    releaseChecklistSnapshot: documentation.releaseChecklist,
    quoteSummarySnapshot: documentation.quoteSummary,
    supplierSkuMappingsSnapshot: documentation.supplierSkuMappings,
    supplierReadinessSnapshot: documentation.supplierReadiness,
    fabricationReleaseReadinessSnapshot: documentation.fabricationReleaseReadiness,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
  };
  const placedCabinetPackage = buildCabinetPlacedAssetPackage(placedCabinetAsset);
  const baseFingerprint = buildCabinetSourceDefinitionFingerprint(base);
  assert.strictEqual(
    buildCabinetPlacedAssetPackageFileName(placedCabinetAsset),
    "base-cabinet-cabinet-instance-1-placed-package.json",
    "placed cabinet package filename should include cabinet name and instance id"
  );
  assert.strictEqual(
    placedCabinetPackage.schema,
    "custom_millwork.placed_asset_package.v1",
    "placed cabinet package should expose the placed asset package schema"
  );
  assert.strictEqual(
    placedCabinetPackage.sourceType,
    "placed_parametric_cabinet",
    "placed cabinet package should identify placed parametric cabinets"
  );
  assert.strictEqual(
    placedCabinetPackage.assetManifest.schema,
    "custom_millwork.asset_manifest.v1",
    "placed cabinet package should expose a placed asset manifest"
  );
  assert.strictEqual(
    placedCabinetPackage.assetManifest.sourceDefinitionId,
    base.id,
    "placed cabinet package manifest should point to the source definition"
  );
  assert.strictEqual(
    placedCabinetPackage.assetManifest.generatedOutput.durable,
    false,
    "placed cabinet package manifest should mark blob GLB output as non-durable"
  );
  assert.strictEqual(
    placedCabinetPackage.placedAsset.id,
    cabinetItem.instanceId,
    "placed cabinet package should preserve the placed instance id"
  );
  assert.strictEqual(
    placedCabinetPackage.placedAsset.assetManifest?.schema,
    "custom_millwork.asset_manifest.v1",
    "placed cabinet package should preserve the manifest on the placed asset"
  );
  assert.strictEqual(
    placedCabinetPackage.placedAsset.roomId,
    cabinetItem.roomId,
    "placed cabinet package should preserve room id"
  );
  assert.deepStrictEqual(
    placedCabinetPackage.placedAsset.transform.position,
    cabinetItem.position,
    "placed cabinet package should preserve transform position"
  );
  assert.strictEqual(
    placedCabinetPackage.millworkDefinition.sourceDefinition.id,
    base.id,
    "placed cabinet package should keep the editable source definition aligned"
  );
  assert.strictEqual(
    placedCabinetPackage.sourceDefinitionFingerprint,
    baseFingerprint,
    "placed cabinet package should include the editable source definition fingerprint"
  );
  assert.strictEqual(
    placedCabinetPackage.bom.length,
    bom.length,
    "placed cabinet package should include BOM rows"
  );
  assert.strictEqual(
    placedCabinetPackage.documentation.supplierReadiness.status,
    documentation.supplierReadiness.status,
    "placed cabinet package should include supplier readiness"
  );
  assert.strictEqual(
    placedCabinetPackage.documentation.edgeBandingSchedule.length,
    documentation.edgeBandingSchedule.length,
    "placed cabinet package should include edge-banding schedule"
  );
  assert.strictEqual(
    placedCabinetPackage.documentation.fabricationReleaseReadiness.status,
    documentation.fabricationReleaseReadiness.status,
    "placed cabinet package should include fabrication release readiness"
  );
  assert.strictEqual(
    placedCabinetPackage.quoteRequest.schema,
    "custom_millwork.rfq.v1",
    "placed cabinet package should embed RFQ data"
  );
  assert.strictEqual(
    placedCabinetPackage.installerWorkOrder.schema,
    "custom_millwork.installer_work_order.v1",
    "placed cabinet package should embed installer work order data"
  );
  assert.strictEqual(
    placedCabinetPackage.installerWorkOrder.sourceDefinitionFingerprint,
    baseFingerprint,
    "installer work order should include the editable source definition fingerprint"
  );
  assert.strictEqual(
    buildCabinetPlacedAssetInstallerWorkOrderFileName(placedCabinetAsset),
    "base-cabinet-cabinet-instance-1-installer-work-order.json",
    "installer work order filename should be stable and user-readable"
  );
  const installerWorkOrder = buildCabinetPlacedAssetInstallerWorkOrder(placedCabinetAsset, {
    roomName: "Kitchen",
  });
  assert.strictEqual(
    installerWorkOrder.schema,
    "custom_millwork.installer_work_order.v1",
    "installer work order should expose the installer schema"
  );
  assert.strictEqual(
    installerWorkOrder.roomName,
    "Kitchen",
    "installer work order should preserve room display name"
  );
  assert.strictEqual(
    installerWorkOrder.placedAsset.id,
    cabinetItem.instanceId,
    "installer work order should preserve the placed instance id"
  );
  assert.deepStrictEqual(
    installerWorkOrder.siteTransform.position,
    cabinetItem.position,
    "installer work order should preserve placement position"
  );
  assert.strictEqual(
    installerWorkOrder.dimensions.width,
    base.totalWidth,
    "installer work order should carry source dimensions"
  );
  assert.strictEqual(
    installerWorkOrder.installationScope.releaseStatus,
    documentation.fabricationReleaseReadiness.status,
    "installer work order should carry release readiness"
  );
  assert.strictEqual(
    installerWorkOrder.documentation.installerNotes.length,
    documentation.installerNotes.length,
    "installer work order should include installer notes"
  );
  assert(
    installerWorkOrder.artifacts.some((item) => item.type === "installer_work_order_json"),
    "installer work order should reference itself as an artifact"
  );
  assert(
    installerWorkOrder.artifacts.some((item) => item.type === "package_json"),
    "installer work order should reference the full placed package artifact"
  );
  assert(
    installerWorkOrder.artifacts.some((item) => item.type === "glb" && item.durable === false),
    "installer work order should mark blob GLB output as non-durable"
  );
  const installerWorkOrderJson = JSON.parse(
    buildCabinetPlacedAssetInstallerWorkOrderJson(placedCabinetAsset, { roomName: "Kitchen" })
  );
  assert.strictEqual(
    installerWorkOrderJson.schema,
    "custom_millwork.installer_work_order.v1",
    "installer work order JSON should be parseable and preserve the schema"
  );
  const placedCabinetPackageJson = JSON.parse(buildCabinetPlacedAssetPackageJson(placedCabinetAsset));
  assert.strictEqual(
    placedCabinetPackageJson.schema,
    "custom_millwork.placed_asset_package.v1",
    "placed cabinet package JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    placedCabinetPackageJson.assetManifest.schema,
    "custom_millwork.asset_manifest.v1",
    "placed cabinet package JSON should preserve the asset manifest"
  );
  const projectSchedulePackage = buildCabinetProjectSchedulePackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectSchedulePackage.schema,
    "custom_millwork.project_schedule.v1",
    "project schedule should expose the project schedule schema"
  );
  assert.strictEqual(
    projectSchedulePackage.totals.assetCount,
    1,
    "project schedule should count placed millwork assets"
  );
  assert.strictEqual(
    projectSchedulePackage.totals.roomCount,
    1,
    "project schedule should count rooms containing millwork"
  );
  assert.strictEqual(
    projectSchedulePackage.rooms[0]?.roomName,
    "Kitchen",
    "project schedule should use room display names"
  );
  assert.strictEqual(
    projectSchedulePackage.totals.edgeBandingScheduleCount,
    documentation.edgeBandingSchedule.length,
    "project schedule should aggregate edge-banding schedule rows"
  );
  assert.strictEqual(
    projectSchedulePackage.assetManifests[0]?.schema,
    "custom_millwork.asset_manifest.v1",
    "project schedule should include placed asset manifests"
  );
  assert.strictEqual(
    projectSchedulePackage.placedAssets[0]?.cabinetDefinition.id,
    base.id,
    "project schedule should preserve placed editable cabinet definitions"
  );
  assert.strictEqual(
    projectSchedulePackage.assets[0]?.sourceDefinitionFingerprint,
    baseFingerprint,
    "project schedule should expose source definition fingerprints for placed assets"
  );
  const projectScheduleJson = JSON.parse(
    buildCabinetProjectSchedulePackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectScheduleJson.schema,
    "custom_millwork.project_schedule.v1",
    "project schedule JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    projectScheduleJson.assets[0]?.sourceDefinitionFingerprint,
    baseFingerprint,
    "project schedule JSON should preserve source definition fingerprints"
  );
  assert.strictEqual(
    buildCabinetProjectScheduleCsvFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-millwork-schedule.csv",
    "project schedule CSV filename should be stable and user-readable"
  );
  const projectScheduleCsv = buildCabinetProjectScheduleCsv({
    assets: [placedCabinetAsset],
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert(
    projectScheduleCsv.includes("Custom Millwork Project Schedule"),
    "project schedule CSV should include the package heading"
  );
  assert(
    projectScheduleCsv.includes("Project Totals"),
    "project schedule CSV should include project totals"
  );
  assert(
    projectScheduleCsv.includes("Rooms"),
    "project schedule CSV should include room summaries"
  );
  assert(
    projectScheduleCsv.includes("Placed Millwork Assets"),
    "project schedule CSV should include placed asset rows"
  );
  assert(
    projectScheduleCsv.includes("Kitchen"),
    "project schedule CSV should include room display names"
  );
  assert.strictEqual(
    buildCabinetProjectScopePackageFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-scope.json",
    "project scope filename should be stable and user-readable"
  );
  const projectScopePackage = buildCabinetProjectScopePackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectScopePackage.schema,
    "custom_millwork.project_scope.v1",
    "project scope should expose the project scope schema"
  );
  assert.strictEqual(
    projectScopePackage.schedule.schema,
    "custom_millwork.project_schedule.v1",
    "project scope should embed the project schedule"
  );
  assert.strictEqual(projectScopePackage.totals.assetCount, 1, "project scope should count placed assets");
  assert.strictEqual(projectScopePackage.totals.roomCount, 1, "project scope should count rooms");
  assert.strictEqual(projectScopePackage.totals.familyCount, 1, "project scope should count represented families");
  assert.strictEqual(
    projectScopePackage.totals.assemblyTypeCount,
    1,
    "project scope should count represented assembly types"
  );
  assert.strictEqual(
    projectScopePackage.totals.cabinetryAssetCount,
    1,
    "project scope should count cabinetry assets separately"
  );
  assert.strictEqual(
    projectScopePackage.totals.broaderBuiltInAssetCount,
    0,
    "project scope should keep broader built-ins separate from cabinetry"
  );
  assert.strictEqual(
    projectScopePackage.totals.sourceDefinitionFingerprintCount,
    1,
    "project scope should count distinct editable source fingerprints"
  );
  assert.strictEqual(
    projectScopePackage.families[0]?.family,
    "cabinetry",
    "project scope should summarize represented families"
  );
  assert(
    projectScopePackage.families[0]?.sourceDefinitionFingerprints.includes(baseFingerprint),
    "project scope family summary should preserve source definition fingerprints"
  );
  assert.strictEqual(
    projectScopePackage.assemblies[0]?.assemblyType,
    "base",
    "project scope should summarize represented assembly types"
  );
  assert(
    projectScopePackage.assemblies[0]?.sourceDefinitionFingerprints.includes(baseFingerprint),
    "project scope assembly summary should preserve source definition fingerprints"
  );
  assert(
    projectScopePackage.coverage.some((item) => item.scopeId === "mvp" && item.status === "partially_represented"),
    "project scope should mark MVP coverage as partial for a single base cabinet"
  );
  assert(
    projectScopePackage.coverage.some((item) => item.scopeId === "phase_5" && item.status === "represented"),
    "project scope should mark documentation workflows represented when assets exist"
  );
  assert(
    projectScopePackage.coverage.some((item) => item.scopeId === "phase_6" && item.status === "represented"),
    "project scope should mark commerce/fabrication workflows represented when assets exist"
  );
  assert.strictEqual(
    projectScopePackage.scopePolicy.sourceOfTruth,
    "cabinet_definition",
    "project scope should preserve CabinetDefinition as the source of truth"
  );
  assert(
    projectScopePackage.artifacts.some((item) => item.type === "project_scope_json"),
    "project scope should reference itself as an artifact"
  );
  assert(
    projectScopePackage.artifacts.some((item) => item.type === "project_schedule_json"),
    "project scope should reference the project schedule artifact"
  );
  assert(
    projectScopePackage.artifacts.some((item) => item.type === "project_handoff_package_json"),
    "project scope should reference the handoff package artifact"
  );
  assert(
    projectScopePackage.artifacts.some((item) => item.type === "package_json"),
    "project scope should reference placed asset packages"
  );
  const projectScopeJson = JSON.parse(
    buildCabinetProjectScopePackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectScopeJson.schema,
    "custom_millwork.project_scope.v1",
    "project scope JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    projectScopeJson.totals.sourceDefinitionFingerprintCount,
    1,
    "project scope JSON should preserve source fingerprint totals"
  );
  assert.strictEqual(
    buildCabinetProjectProcurementPackageFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-procurement.json",
    "project procurement filename should be stable and user-readable"
  );
  const projectProcurement = buildCabinetProjectProcurementPackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectProcurement.schema,
    "custom_millwork.project_procurement.v1",
    "project procurement package should expose the procurement schema"
  );
  assert.strictEqual(
    projectProcurement.schedule.schema,
    "custom_millwork.project_schedule.v1",
    "project procurement package should embed the project schedule"
  );
  assert.strictEqual(
    projectProcurement.checkoutPolicy.includeInCheckout,
    false,
    "project procurement package should keep custom millwork out of normal checkout"
  );
  assert.strictEqual(
    projectProcurement.totals.lineCount,
    documentation.supplierSkuMappings.length,
    "project procurement package should aggregate supplier SKU mapping rows"
  );
  assert.strictEqual(
    projectProcurement.totals.mappedSkuCount,
    documentation.supplierReadiness.mappedSkuCount,
    "project procurement package should count mapped SKU rows"
  );
  assert.strictEqual(
    projectProcurement.totals.customQuoteRequiredCount,
    documentation.supplierReadiness.customQuoteRequiredCount,
    "project procurement package should count custom quote rows"
  );
  assert.strictEqual(
    projectProcurement.totals.estimatedTotal,
    documentation.quoteSummary.materialCost +
      documentation.quoteSummary.hardwareCost +
      documentation.quoteSummary.fabricationCost +
      documentation.quoteSummary.installationAllowance,
    "project procurement package should total purchasable and custom-quote rows before contingency"
  );
  assert(
    projectProcurement.lineItems.some((item) => item.sourceType === "material" && item.status === "mapped"),
    "project procurement package should include mapped material rows"
  );
  assert(
    projectProcurement.lineItems.some(
      (item) => item.sourceType === "fabrication_service" && item.status === "custom_quote_required"
    ),
    "project procurement package should include fabricator custom quote rows"
  );
  assert(
    projectProcurement.lineItems.every((item) => item.assetIds.includes(placedCabinetAsset.id)),
    "project procurement package should relate rows back to placed asset ids"
  );
  assert(
    projectProcurement.artifacts.some((item) => item.type === "project_procurement_json"),
    "project procurement package should reference itself as an artifact"
  );
  assert(
    projectProcurement.artifacts.some((item) => item.type === "project_finish_schedule_json"),
    "project procurement package should reference the project finish schedule artifact"
  );
  const projectProcurementJson = JSON.parse(
    buildCabinetProjectProcurementPackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectProcurementJson.schema,
    "custom_millwork.project_procurement.v1",
    "project procurement JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    buildCabinetProjectFinishSchedulePackageFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-finish-schedule.json",
    "project finish schedule filename should be stable and user-readable"
  );
  const projectFinishSchedule = buildCabinetProjectFinishSchedulePackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectFinishSchedule.schema,
    "custom_millwork.project_finish_schedule.v1",
    "project finish schedule should expose the finish schedule schema"
  );
  assert.strictEqual(
    projectFinishSchedule.schedule.schema,
    "custom_millwork.project_schedule.v1",
    "project finish schedule should embed project schedule context"
  );
  assert.strictEqual(
    projectFinishSchedule.procurementPackage.schema,
    "custom_millwork.project_procurement.v1",
    "project finish schedule should embed procurement context"
  );
  assert.strictEqual(
    projectFinishSchedule.totals.assetCount,
    1,
    "project finish schedule should count placed assets"
  );
  assert.strictEqual(
    projectFinishSchedule.totals.roomCount,
    1,
    "project finish schedule should count rooms"
  );
  assert.strictEqual(
    projectFinishSchedule.totals.materialCount,
    documentation.materialSchedule.length,
    "project finish schedule should aggregate material schedule rows"
  );
  assert.strictEqual(
    projectFinishSchedule.totals.hardwareCount,
    documentation.hardwareSchedule.length,
    "project finish schedule should aggregate hardware schedule rows"
  );
  assert.strictEqual(
    projectFinishSchedule.totals.edgeBandingCount,
    documentation.edgeBandingSchedule.length,
    "project finish schedule should aggregate edge-banding schedule rows"
  );
  assert.strictEqual(
    projectFinishSchedule.totals.edgeBandingTotalM,
    projectSchedulePackage.totals.edgeBandingTotalM,
    "project finish schedule should preserve edge-banding totals"
  );
  assert.strictEqual(
    projectFinishSchedule.totals.mappedSkuCount,
    projectProcurement.totals.mappedSkuCount,
    "project finish schedule should preserve mapped SKU counts"
  );
  assert.strictEqual(
    projectFinishSchedule.totals.customQuoteRequiredCount,
    projectProcurement.totals.customQuoteRequiredCount,
    "project finish schedule should preserve custom quote counts"
  );
  assert(
    projectFinishSchedule.materials.every((item) => item.assetIds.includes(placedCabinetAsset.id)),
    "project finish schedule material rows should relate to placed assets"
  );
  assert(
    projectFinishSchedule.hardware.every((item) => item.assetIds.includes(placedCabinetAsset.id)),
    "project finish schedule hardware rows should relate to placed assets"
  );
  assert(
    projectFinishSchedule.edgeBanding.every((item) => item.assetIds.includes(placedCabinetAsset.id)),
    "project finish schedule edge-banding rows should relate to placed assets"
  );
  assert(
    projectFinishSchedule.materials.some((item) => item.supplierStatus === "mapped"),
    "project finish schedule should carry supplier mapping status for materials"
  );
  assert.strictEqual(
    projectFinishSchedule.finishReviewPolicy.requiresDesignerApproval,
    true,
    "project finish schedule should require designer approval"
  );
  assert.strictEqual(
    projectFinishSchedule.finishReviewPolicy.requiresClientApproval,
    true,
    "project finish schedule should require client approval"
  );
  assert.strictEqual(
    projectFinishSchedule.finishReviewPolicy.requiresSupplierConfirmation,
    true,
    "project finish schedule should require supplier confirmation"
  );
  assert(
    projectFinishSchedule.artifacts.some((item) => item.type === "project_finish_schedule_json"),
    "project finish schedule should reference itself as an artifact"
  );
  assert(
    projectFinishSchedule.artifacts.some((item) => item.type === "project_procurement_json"),
    "project finish schedule should reference the procurement artifact"
  );
  assert(
    projectFinishSchedule.artifacts.some((item) => item.type === "project_rfq_json"),
    "project finish schedule should reference the project RFQ artifact"
  );
  const projectFinishScheduleJson = JSON.parse(
    buildCabinetProjectFinishSchedulePackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectFinishScheduleJson.schema,
    "custom_millwork.project_finish_schedule.v1",
    "project finish schedule JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    buildCabinetProjectRevisionPackageFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-revision-package.json",
    "project revision package filename should be stable and user-readable"
  );
  const projectRevisionBaseline = buildCabinetProjectRevisionPackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectRevisionBaseline.schema,
    "custom_millwork.project_revision_package.v1",
    "project revision package should expose the revision package schema"
  );
  assert.strictEqual(
    projectRevisionBaseline.revisionPolicy.baselineComparisonAvailable,
    false,
    "project revision package should mark missing comparison baseline"
  );
  assert.strictEqual(
    projectRevisionBaseline.totals.currentAssetCount,
    1,
    "project revision package should count current assets"
  );
  assert.strictEqual(
    projectRevisionBaseline.totals.previousAssetCount,
    0,
    "project revision package should count missing previous assets"
  );
  assert.strictEqual(
    projectRevisionBaseline.totals.changeItemCount,
    0,
    "project revision package should not invent changes without a baseline"
  );
  assert.strictEqual(
    projectRevisionBaseline.assets[0]?.revisionStatus,
    "baseline",
    "project revision package should mark current assets as baseline when no previous set is supplied"
  );
  assert.strictEqual(
    projectRevisionBaseline.assets[0]?.sourceDefinitionFingerprint,
    baseFingerprint,
    "project revision package should snapshot source definition fingerprints"
  );
  assert(
    projectRevisionBaseline.artifacts.some((item) => item.type === "project_revision_package_json"),
    "project revision package should reference itself as an artifact"
  );
  assert(
    projectRevisionBaseline.artifacts.some((item) => item.type === "project_finish_schedule_json"),
    "project revision package should reference the finish schedule artifact"
  );
  const projectRevisionBaselineJson = JSON.parse(
    buildCabinetProjectRevisionPackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectRevisionBaselineJson.schema,
    "custom_millwork.project_revision_package.v1",
    "project revision package JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    buildCabinetProjectDrawingSetPackageFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-drawing-set.json",
    "project drawing set filename should be stable and user-readable"
  );
  const projectDrawingSet = buildCabinetProjectDrawingSetPackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  const expectedDrawingSheetCount = new Set(documentation.drawingViewSchedule.map((item) => item.sheetRef)).size;
  assert.strictEqual(
    projectDrawingSet.schema,
    "custom_millwork.project_drawing_set.v1",
    "project drawing set should expose the drawing set schema"
  );
  assert.strictEqual(
    projectDrawingSet.schedule.schema,
    "custom_millwork.project_schedule.v1",
    "project drawing set should embed project schedule context"
  );
  assert.strictEqual(
    projectDrawingSet.revisionPackage.schema,
    "custom_millwork.project_revision_package.v1",
    "project drawing set should embed revision context"
  );
  assert.strictEqual(
    projectDrawingSet.approvalPackage.schema,
    "custom_millwork.project_approval_package.v1",
    "project drawing set should embed approval context"
  );
  assert.strictEqual(
    projectDrawingSet.totals.assetCount,
    1,
    "project drawing set should count placed assets"
  );
  assert.strictEqual(
    projectDrawingSet.totals.sheetCount,
    expectedDrawingSheetCount,
    "project drawing set should aggregate drawing sheets by sheet reference"
  );
  assert.strictEqual(
    projectDrawingSet.totals.drawingViewCount,
    documentation.drawingViewSchedule.length,
    "project drawing set should aggregate drawing view rows"
  );
  assert.strictEqual(
    projectDrawingSet.totals.dimensionRowCount,
    documentation.dimensionSchedule.length,
    "project drawing set should aggregate dimension rows"
  );
  assert.strictEqual(
    projectDrawingSet.totals.frontElevationCount,
    documentation.drawingViewSchedule.filter((item) => item.viewType === "front_elevation").length,
    "project drawing set should count front elevation views"
  );
  assert.strictEqual(
    projectDrawingSet.totals.sideSectionCount,
    documentation.drawingViewSchedule.filter((item) => item.viewType === "side_section").length,
    "project drawing set should count side section views"
  );
  assert.strictEqual(
    projectDrawingSet.totals.planFootprintCount,
    documentation.drawingViewSchedule.filter((item) => item.viewType === "plan_footprint").length,
    "project drawing set should count plan footprint views"
  );
  assert.strictEqual(
    projectDrawingSet.assets[0]?.shopDrawingFileName,
    "base-cabinet-shop-drawing.svg",
    "project drawing set should reference generated shop drawing filenames"
  );
  assert(
    projectDrawingSet.sheets.every((item) => item.assetId === placedCabinetAsset.id),
    "project drawing set sheets should relate back to placed asset ids"
  );
  assert(
    projectDrawingSet.sheets.some((item) => item.viewTypes.includes("front_elevation")),
    "project drawing set should include front elevation sheets"
  );
  assert(
    projectDrawingSet.sheets.some((item) => item.viewTypes.includes("side_section")),
    "project drawing set should include side section sheets"
  );
  assert(
    projectDrawingSet.sheets.some((item) => item.viewTypes.includes("plan_footprint")),
    "project drawing set should include plan footprint sheets"
  );
  assert(
    projectDrawingSet.drawingReviewPolicy.requiresFabricatorReview,
    "project drawing set should require fabricator drawing review"
  );
  assert(
    projectDrawingSet.artifacts.some((item) => item.type === "project_drawing_set_json"),
    "project drawing set should reference itself as an artifact"
  );
  assert(
    projectDrawingSet.artifacts.some((item) => item.type === "shop_drawing_svg"),
    "project drawing set should reference generated shop drawing SVG artifacts"
  );
  assert(
    projectDrawingSet.artifacts.some((item) => item.type === "project_revision_package_json"),
    "project drawing set should reference the project revision package artifact"
  );
  assert(
    projectDrawingSet.artifacts.some((item) => item.type === "project_cut_list_json"),
    "project drawing set should reference the project cut-list artifact"
  );
  const projectDrawingSetJson = JSON.parse(
    buildCabinetProjectDrawingSetPackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectDrawingSetJson.schema,
    "custom_millwork.project_drawing_set.v1",
    "project drawing set JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    buildCabinetProjectCutListPackageFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-cut-list.json",
    "project cut-list filename should be stable and user-readable"
  );
  const projectCutList = buildCabinetProjectCutListPackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectCutList.schema,
    "custom_millwork.project_cut_list.v1",
    "project cut-list should expose the cut-list schema"
  );
  assert.strictEqual(
    projectCutList.schedule.schema,
    "custom_millwork.project_schedule.v1",
    "project cut-list should embed project schedule context"
  );
  assert.strictEqual(
    projectCutList.drawingSetPackage.schema,
    "custom_millwork.project_drawing_set.v1",
    "project cut-list should embed drawing set context"
  );
  assert.strictEqual(
    projectCutList.revisionPackage.schema,
    "custom_millwork.project_revision_package.v1",
    "project cut-list should embed revision context"
  );
  assert.strictEqual(projectCutList.totals.assetCount, 1, "project cut-list should count placed assets");
  assert.strictEqual(
    projectCutList.totals.partRowCount,
    documentation.cutList.length,
    "project cut-list should aggregate every generated cut-list row"
  );
  assert.strictEqual(
    projectCutList.totals.totalQuantity,
    documentation.cutList.reduce((sum, item) => sum + item.quantity, 0),
    "project cut-list should preserve generated part quantities"
  );
  assert.strictEqual(
    projectCutList.totals.edgeBandingTotalM,
    projectSchedulePackage.totals.edgeBandingTotalM,
    "project cut-list should aggregate edge-banding totals without row-rounding drift"
  );
  assert.strictEqual(
    projectCutList.assets[0]?.fabricationDxfFileName,
    "base-cabinet-cut-layout.dxf",
    "project cut-list should reference generated DXF filenames"
  );
  assert.strictEqual(
    projectCutList.assets[0]?.shopDrawingFileName,
    "base-cabinet-shop-drawing.svg",
    "project cut-list should reference generated shop drawing filenames"
  );
  assert(
    projectCutList.parts.every((item) => item.assetId === placedCabinetAsset.id),
    "project cut-list parts should relate back to placed asset ids"
  );
  assert(
    projectCutList.parts.some((item) => item.edgeBandingM > 0),
    "project cut-list parts should expose edge-banding lengths"
  );
  assert(
    projectCutList.materials.every((item) => item.assetIds.includes(placedCabinetAsset.id)),
    "project cut-list material summaries should relate back to placed asset ids"
  );
  assert(
    projectCutList.cutListReviewPolicy.requiresCncReview,
    "project cut-list should require CNC review"
  );
  assert(
    projectCutList.artifacts.some((item) => item.type === "project_cut_list_json"),
    "project cut-list should reference itself as an artifact"
  );
  assert(
    projectCutList.artifacts.some((item) => item.type === "project_cnc_batch_json"),
    "project cut-list should reference the project CNC batch artifact"
  );
  assert(
    projectCutList.artifacts.some((item) => item.type === "fabrication_dxf" && item.durable === false),
    "project cut-list should reference generated non-durable DXF artifacts"
  );
  assert(
    projectCutList.artifacts.some((item) => item.type === "shop_drawing_svg"),
    "project cut-list should reference generated shop drawing artifacts"
  );
  const projectCutListJson = JSON.parse(
    buildCabinetProjectCutListPackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectCutListJson.schema,
    "custom_millwork.project_cut_list.v1",
    "project cut-list JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    buildCabinetProjectQuotePackageFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-project-quote.json",
    "project quote filename should be stable and user-readable"
  );
  const projectQuotePackage = buildCabinetProjectQuotePackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectQuotePackage.schema,
    "custom_millwork.project_quote.v1",
    "project quote package should expose the quote schema"
  );
  assert.strictEqual(
    projectQuotePackage.quoteStatus,
    "needs_supplier_quote",
    "project quote package should require supplier quotes while custom quote rows remain"
  );
  assert.strictEqual(
    projectQuotePackage.schedule.schema,
    "custom_millwork.project_schedule.v1",
    "project quote package should embed the project schedule"
  );
  assert.strictEqual(
    projectQuotePackage.procurementPackage.schema,
    "custom_millwork.project_procurement.v1",
    "project quote package should embed procurement context"
  );
  assert.strictEqual(
    projectQuotePackage.approvalPackage.schema,
    "custom_millwork.project_approval_package.v1",
    "project quote package should embed approval context"
  );
  assert.strictEqual(
    projectQuotePackage.fabricationReleasePackage.schema,
    "custom_millwork.project_fabrication_release.v1",
    "project quote package should embed release context"
  );
  assert.strictEqual(
    projectQuotePackage.totals.assetCount,
    1,
    "project quote package should count placed assets"
  );
  assert.strictEqual(
    projectQuotePackage.totals.estimatedTotal,
    documentation.quoteSummary.estimatedTotal,
    "project quote package should preserve quote totals from documentation"
  );
  assert.strictEqual(
    projectQuotePackage.totals.customQuoteRequiredCount,
    documentation.supplierReadiness.customQuoteRequiredCount,
    "project quote package should preserve custom quote readiness"
  );
  assert.strictEqual(
    projectQuotePackage.totals.currency,
    "USD",
    "project quote package should preserve quote currency"
  );
  for (const category of ["materials", "hardware", "fabrication", "installation", "contingency"]) {
    assert(
      projectQuotePackage.categoryTotals.some((item) => item.category === category),
      `project quote package should include ${category} category totals`
    );
  }
  assert.strictEqual(
    projectQuotePackage.assets[0]?.id,
    placedCabinetAsset.id,
    "project quote package should relate asset summaries to placed ids"
  );
  assert.strictEqual(
    projectQuotePackage.assets[0]?.estimatedTotal,
    documentation.quoteSummary.estimatedTotal,
    "project quote package should preserve asset quote totals"
  );
  assert.strictEqual(
    projectQuotePackage.rooms[0]?.roomName,
    "Kitchen",
    "project quote package should include room display names"
  );
  assert(
    projectQuotePackage.disclaimer.includes("not a purchase order"),
    "project quote package should include a preliminary pricing disclaimer"
  );
  assert(
    projectQuotePackage.artifacts.some((item) => item.type === "project_quote_package_json"),
    "project quote package should reference itself as an artifact"
  );
  assert(
    projectQuotePackage.artifacts.some((item) => item.type === "project_procurement_json"),
    "project quote package should reference the project procurement artifact"
  );
  assert(
    projectQuotePackage.artifacts.some((item) => item.type === "project_finish_schedule_json"),
    "project quote package should reference the project finish schedule artifact"
  );
  assert(
    projectQuotePackage.artifacts.some((item) => item.type === "project_drawing_set_json"),
    "project quote package should reference the project drawing set artifact"
  );
  assert(
    projectQuotePackage.artifacts.some((item) => item.type === "project_cut_list_json"),
    "project quote package should reference the project cut-list artifact"
  );
  assert(
    projectQuotePackage.artifacts.some((item) => item.type === "project_approval_package_json"),
    "project quote package should reference the project approval artifact"
  );
  assert(
    projectQuotePackage.artifacts.some((item) => item.type === "project_rfq_json"),
    "project quote package should reference the project RFQ artifact"
  );
  const projectQuoteJson = JSON.parse(
    buildCabinetProjectQuotePackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectQuoteJson.schema,
    "custom_millwork.project_quote.v1",
    "project quote JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    buildCabinetProjectPurchaseReadinessPackageFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-purchase-readiness.json",
    "project purchase readiness filename should be stable and user-readable"
  );
  const projectPurchaseReadiness = buildCabinetProjectPurchaseReadinessPackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectPurchaseReadiness.schema,
    "custom_millwork.project_purchase_readiness.v1",
    "project purchase readiness package should expose the purchase readiness schema"
  );
  assert.strictEqual(
    projectPurchaseReadiness.purchaseReadiness,
    "needs_quote",
    "project purchase readiness should require quotes while custom quote rows remain"
  );
  assert.strictEqual(
    projectPurchaseReadiness.canCreateCheckout,
    false,
    "project purchase readiness should not create checkout for custom millwork MVP"
  );
  assert.strictEqual(
    projectPurchaseReadiness.canIssuePurchaseOrder,
    false,
    "project purchase readiness should not issue purchase orders before quote and approval gates clear"
  );
  assert.strictEqual(
    projectPurchaseReadiness.procurementPackage.schema,
    "custom_millwork.project_procurement.v1",
    "project purchase readiness should embed procurement context"
  );
  assert.strictEqual(
    projectPurchaseReadiness.quotePackage.schema,
    "custom_millwork.project_quote.v1",
    "project purchase readiness should embed quote context"
  );
  assert.strictEqual(
    projectPurchaseReadiness.checkoutPolicy.includeInCheckout,
    false,
    "project purchase readiness should keep custom millwork out of normal checkout"
  );
  assert.strictEqual(
    projectPurchaseReadiness.totals.lineCount,
    projectProcurement.totals.lineCount,
    "project purchase readiness should classify each procurement row"
  );
  assert.strictEqual(
    projectPurchaseReadiness.totals.checkoutCandidateCount,
    projectProcurement.totals.mappedSkuCount,
    "project purchase readiness should expose mapped SKU rows as future checkout candidates"
  );
  assert.strictEqual(
    projectPurchaseReadiness.totals.customQuoteRequiredCount,
    projectProcurement.totals.customQuoteRequiredCount,
    "project purchase readiness should preserve custom quote row count"
  );
  assert.strictEqual(
    projectPurchaseReadiness.totals.estimatedPurchaseSubtotal,
    projectProcurement.totals.estimatedTotal,
    "project purchase readiness should preserve procurement subtotal"
  );
  assert.strictEqual(
    projectPurchaseReadiness.totals.estimatedProjectQuoteTotal,
    projectQuotePackage.totals.estimatedTotal,
    "project purchase readiness should preserve project quote total with contingency"
  );
  assert(
    projectPurchaseReadiness.lineItems.some(
      (item) => item.purchaseAction === "supplier_catalog_candidate" && !item.checkoutEligible
    ),
    "project purchase readiness should mark mapped SKUs as non-checkout purchase candidates"
  );
  assert(
    projectPurchaseReadiness.lineItems.some((item) => item.purchaseAction === "requires_custom_quote"),
    "project purchase readiness should preserve custom quote requirements"
  );
  assert.strictEqual(
    projectPurchaseReadiness.assets[0]?.id,
    placedCabinetAsset.id,
    "project purchase readiness should relate asset summaries to placed ids"
  );
  assert(
    projectPurchaseReadiness.nextActions.some((item) => item.toLowerCase().includes("custom")),
    "project purchase readiness should include next actions for custom quote rows"
  );
  assert(
    projectPurchaseReadiness.artifacts.some((item) => item.type === "project_purchase_readiness_json"),
    "project purchase readiness should reference itself as an artifact"
  );
  assert(
    projectPurchaseReadiness.artifacts.some((item) => item.type === "project_procurement_json"),
    "project purchase readiness should reference the project procurement artifact"
  );
  assert(
    projectPurchaseReadiness.artifacts.some((item) => item.type === "project_finish_schedule_json"),
    "project purchase readiness should reference the project finish schedule artifact"
  );
  assert(
    projectPurchaseReadiness.artifacts.some((item) => item.type === "project_cut_list_json"),
    "project purchase readiness should reference the project cut-list artifact"
  );
  assert(
    projectPurchaseReadiness.artifacts.some((item) => item.type === "project_quote_package_json"),
    "project purchase readiness should reference the project quote artifact"
  );
  const projectPurchaseReadinessJson = JSON.parse(
    buildCabinetProjectPurchaseReadinessPackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectPurchaseReadinessJson.schema,
    "custom_millwork.project_purchase_readiness.v1",
    "project purchase readiness JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    buildCabinetProjectFabricationReleasePackageFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-fabrication-release.json",
    "project fabrication release filename should be stable and user-readable"
  );
  const projectFabricationRelease = buildCabinetProjectFabricationReleasePackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectFabricationRelease.schema,
    "custom_millwork.project_fabrication_release.v1",
    "project fabrication release should expose the release schema"
  );
  assert.strictEqual(
    projectFabricationRelease.status,
    "needs_review",
    "project fabrication release should require review while generated gates remain open"
  );
  assert.strictEqual(
    projectFabricationRelease.canReleaseToFabrication,
    false,
    "project fabrication release should not auto-release generated assets"
  );
  assert.strictEqual(
    projectFabricationRelease.canIssuePurchaseOrder,
    false,
    "project fabrication release should not issue purchase orders with custom quote rows"
  );
  assert.strictEqual(
    projectFabricationRelease.schedule.schema,
    "custom_millwork.project_schedule.v1",
    "project fabrication release should embed the project schedule"
  );
  assert.strictEqual(
    projectFabricationRelease.procurementPackage.schema,
    "custom_millwork.project_procurement.v1",
    "project fabrication release should embed procurement readiness"
  );
  assert.strictEqual(
    projectFabricationRelease.quoteRequest.schema,
    "custom_millwork.project_rfq.v1",
    "project fabrication release should embed the project RFQ"
  );
  assert.strictEqual(
    projectFabricationRelease.totals.assetCount,
    1,
    "project fabrication release should count placed assets"
  );
  assert.strictEqual(
    projectFabricationRelease.totals.needsReviewCount,
    1,
    "project fabrication release should count assets needing review"
  );
  assert.strictEqual(
    projectFabricationRelease.totals.cutListCount,
    documentation.cutList.length,
    "project fabrication release should aggregate cut-list counts"
  );
  assert.strictEqual(
    projectFabricationRelease.assets[0]?.fabricationDxfFileName,
    "base-cabinet-cut-layout.dxf",
    "project fabrication release should reference generated DXF files"
  );
  assert(
    projectFabricationRelease.assets[0]?.placedPackageFileName.endsWith("placed-package.json"),
    "project fabrication release should reference placed source packages"
  );
  assert(
    projectFabricationRelease.assets[0]?.installerWorkOrderFileName.endsWith("installer-work-order.json"),
    "project fabrication release should reference installer work orders"
  );
  assert(
    projectFabricationRelease.releaseDecision.nextActions.some((item) =>
      item.toLowerCase().includes("required")
    ),
    "project fabrication release should include next actions for required gates"
  );
  assert(
    projectFabricationRelease.artifacts.some((item) => item.type === "project_fabrication_release_json"),
    "project fabrication release should reference itself as an artifact"
  );
  assert(
    projectFabricationRelease.artifacts.some((item) => item.type === "project_finish_schedule_json"),
    "project fabrication release should reference the project finish schedule artifact"
  );
  assert(
    projectFabricationRelease.artifacts.some((item) => item.type === "project_drawing_set_json"),
    "project fabrication release should reference the project drawing set artifact"
  );
  assert(
    projectFabricationRelease.artifacts.some((item) => item.type === "project_cut_list_json"),
    "project fabrication release should reference the project cut-list artifact"
  );
  assert(
    projectFabricationRelease.artifacts.some((item) => item.type === "project_installation_plan_json"),
    "project fabrication release should reference the project installation plan artifact"
  );
  assert(
    projectFabricationRelease.artifacts.some((item) => item.type === "project_field_verification_json"),
    "project fabrication release should reference the project field verification artifact"
  );
  assert(
    projectFabricationRelease.artifacts.some((item) => item.type === "project_cnc_batch_json"),
    "project fabrication release should reference the project CNC batch artifact"
  );
  assert(
    projectFabricationRelease.artifacts.some((item) => item.type === "project_approval_package_json"),
    "project fabrication release should reference the project approval package artifact"
  );
  assert(
    projectFabricationRelease.artifacts.some((item) => item.type === "fabrication_dxf" && item.durable === false),
    "project fabrication release should reference generated DXF review artifacts"
  );
  const projectFabricationReleaseJson = JSON.parse(
    buildCabinetProjectFabricationReleasePackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectFabricationReleaseJson.schema,
    "custom_millwork.project_fabrication_release.v1",
    "project fabrication release JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    buildCabinetProjectApprovalPackageFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-approval-package.json",
    "project approval package filename should be stable and user-readable"
  );
  const projectApprovalPackage = buildCabinetProjectApprovalPackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectApprovalPackage.schema,
    "custom_millwork.project_approval_package.v1",
    "project approval package should expose the approval package schema"
  );
  assert.strictEqual(
    projectApprovalPackage.approvalStatus,
    "needs_review",
    "project approval package should require review while signoff gates remain open"
  );
  assert.strictEqual(
    projectApprovalPackage.canSubmitForClientApproval,
    true,
    "project approval package should allow client submittal when there are no blockers"
  );
  assert.strictEqual(
    projectApprovalPackage.canSubmitForFabricatorReview,
    true,
    "project approval package should allow fabricator review when supplier mappings are present"
  );
  assert.strictEqual(
    projectApprovalPackage.canReleaseAfterSignoff,
    false,
    "project approval package should not release fabrication before gates are closed"
  );
  assert.strictEqual(
    projectApprovalPackage.fabricationReleasePackage.schema,
    "custom_millwork.project_fabrication_release.v1",
    "project approval package should embed fabrication release context"
  );
  assert.strictEqual(
    projectApprovalPackage.procurementPackage.schema,
    "custom_millwork.project_procurement.v1",
    "project approval package should embed procurement context"
  );
  assert.strictEqual(
    projectApprovalPackage.totals.approvalItemCount,
    documentation.releaseChecklist.length,
    "project approval package should aggregate release checklist gates"
  );
  assert.strictEqual(
    projectApprovalPackage.totals.clientApprovalCount,
    2,
    "project approval package should count client signoff gates"
  );
  assert.strictEqual(
    projectApprovalPackage.totals.fabricatorApprovalCount,
    2,
    "project approval package should count fabricator review gates"
  );
  assert.strictEqual(
    projectApprovalPackage.totals.installationGateCount,
    1,
    "project approval package should count installation gates"
  );
  assert(
    projectApprovalPackage.approvalItems.every((item) => item.assetId === placedCabinetAsset.id),
    "project approval package should relate approval items to placed assets"
  );
  assert(
    projectApprovalPackage.signoffPolicy.requiresClientApproval,
    "project approval package should require client approval"
  );
  assert(
    projectApprovalPackage.artifacts.some((item) => item.type === "project_approval_package_json"),
    "project approval package should reference itself as an artifact"
  );
  assert(
    projectApprovalPackage.artifacts.some((item) => item.type === "project_finish_schedule_json"),
    "project approval package should reference the project finish schedule artifact"
  );
  assert(
    projectApprovalPackage.artifacts.some((item) => item.type === "project_drawing_set_json"),
    "project approval package should reference the project drawing set artifact"
  );
  assert(
    projectApprovalPackage.artifacts.some((item) => item.type === "project_cut_list_json"),
    "project approval package should reference the project cut-list artifact"
  );
  const projectApprovalPackageJson = JSON.parse(
    buildCabinetProjectApprovalPackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectApprovalPackageJson.schema,
    "custom_millwork.project_approval_package.v1",
    "project approval package JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    buildCabinetProjectInstallationPlanPackageFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-installation-plan.json",
    "project installation plan filename should be stable and user-readable"
  );
  const projectInstallationPlan = buildCabinetProjectInstallationPlanPackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectInstallationPlan.schema,
    "custom_millwork.project_installation_plan.v1",
    "project installation plan should expose the installation plan schema"
  );
  assert.strictEqual(
    projectInstallationPlan.installationReadiness,
    "needs_review",
    "project installation plan should require review until fabrication release gates close"
  );
  assert.strictEqual(
    projectInstallationPlan.schedule.schema,
    "custom_millwork.project_schedule.v1",
    "project installation plan should embed the project schedule"
  );
  assert.strictEqual(
    projectInstallationPlan.fabricationReleasePackage.schema,
    "custom_millwork.project_fabrication_release.v1",
    "project installation plan should embed fabrication release context"
  );
  assert.strictEqual(
    projectInstallationPlan.totals.assetCount,
    1,
    "project installation plan should count placed assets"
  );
  assert.strictEqual(
    projectInstallationPlan.totals.roomCount,
    1,
    "project installation plan should count rooms"
  );
  assert.strictEqual(
    projectInstallationPlan.totals.installerWorkOrderCount,
    1,
    "project installation plan should count installer work orders"
  );
  assert.strictEqual(
    projectInstallationPlan.rooms[0]?.roomName,
    "Kitchen",
    "project installation plan should use room display names"
  );
  assert.strictEqual(
    projectInstallationPlan.assets[0]?.installSequence,
    1,
    "project installation plan should assign install sequencing"
  );
  assert.deepStrictEqual(
    projectInstallationPlan.assets[0]?.siteTransform.position,
    placedCabinetAsset.transform.position,
    "project installation plan should preserve placed asset transforms"
  );
  assert(
    projectInstallationPlan.assets[0]?.installerWorkOrderFileName.endsWith("installer-work-order.json"),
    "project installation plan should reference installer work orders"
  );
  assert(
    projectInstallationPlan.assets[0]?.estimatedInstallHours > 0,
    "project installation plan should include installation effort estimates"
  );
  assert(
    projectInstallationPlan.artifacts.some((item) => item.type === "project_installation_plan_json"),
    "project installation plan should reference itself as an artifact"
  );
  assert(
    projectInstallationPlan.artifacts.some((item) => item.type === "project_finish_schedule_json"),
    "project installation plan should reference the project finish schedule artifact"
  );
  assert(
    projectInstallationPlan.artifacts.some((item) => item.type === "installer_work_order_json"),
    "project installation plan should reference installer work order artifacts"
  );
  assert(
    projectInstallationPlan.artifacts.some((item) => item.type === "project_field_verification_json"),
    "project installation plan should reference the field verification artifact"
  );
  const projectInstallationPlanJson = JSON.parse(
    buildCabinetProjectInstallationPlanPackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectInstallationPlanJson.schema,
    "custom_millwork.project_installation_plan.v1",
    "project installation plan JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    buildCabinetProjectFieldVerificationPackageFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-field-verification.json",
    "project field verification filename should be stable and user-readable"
  );
  const projectFieldVerification = buildCabinetProjectFieldVerificationPackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectFieldVerification.schema,
    "custom_millwork.project_field_verification.v1",
    "project field verification should expose the field verification schema"
  );
  assert.strictEqual(
    projectFieldVerification.verificationStatus,
    "field_verification_required",
    "project field verification should require field verification before release"
  );
  assert.strictEqual(
    projectFieldVerification.canReleaseWithoutFieldVerification,
    false,
    "project field verification should not allow release without human field verification"
  );
  assert.strictEqual(
    projectFieldVerification.fabricationReleasePackage.schema,
    "custom_millwork.project_fabrication_release.v1",
    "project field verification should embed fabrication release context"
  );
  assert.strictEqual(
    projectFieldVerification.installationPlanPackage.schema,
    "custom_millwork.project_installation_plan.v1",
    "project field verification should embed installation plan context"
  );
  assert.strictEqual(
    projectFieldVerification.totals.assetCount,
    1,
    "project field verification should count placed assets"
  );
  assert.strictEqual(
    projectFieldVerification.totals.roomCount,
    1,
    "project field verification should count rooms"
  );
  assert(
    projectFieldVerification.totals.checklistCount >= documentation.releaseChecklist.length,
    "project field verification should include generated release and field checks"
  );
  assert(
    projectFieldVerification.totals.requiredCheckCount > 0,
    "project field verification should include required checks"
  );
  assert.strictEqual(
    projectFieldVerification.totals.fieldVerifyNoteCount,
    documentation.installerNotes.filter((item) => item.severity === "field_verify").length,
    "project field verification should count field-verification notes"
  );
  assert.strictEqual(
    projectFieldVerification.assets[0]?.id,
    placedCabinetAsset.id,
    "project field verification should relate asset summaries to placed ids"
  );
  assert.deepStrictEqual(
    projectFieldVerification.assets[0]?.siteTransform.position,
    placedCabinetAsset.transform.position,
    "project field verification should preserve placed transforms"
  );
  assert.strictEqual(
    projectFieldVerification.rooms[0]?.roomName,
    "Kitchen",
    "project field verification should include room display names"
  );
  assert(
    projectFieldVerification.rooms[0]?.assetIds.includes(placedCabinetAsset.id),
    "project field verification should relate room summaries to placed assets"
  );
  assert(
    projectFieldVerification.checklist.some((item) => item.scope === "site_measurement"),
    "project field verification should include site measurement checks"
  );
  assert(
    projectFieldVerification.checklist.some((item) => item.scope === "placement"),
    "project field verification should include placement checks"
  );
  assert(
    projectFieldVerification.fieldVerificationPolicy.requiresHumanVerification,
    "project field verification should require human field verification"
  );
  assert(
    projectFieldVerification.artifacts.some((item) => item.type === "project_field_verification_json"),
    "project field verification should reference itself as an artifact"
  );
  assert(
    projectFieldVerification.artifacts.some((item) => item.type === "project_finish_schedule_json"),
    "project field verification should reference the project finish schedule artifact"
  );
  assert(
    projectFieldVerification.artifacts.some((item) => item.type === "project_installation_plan_json"),
    "project field verification should reference the installation plan artifact"
  );
  assert(
    projectFieldVerification.artifacts.some((item) => item.type === "installer_work_order_json"),
    "project field verification should reference installer work order artifacts"
  );
  const projectFieldVerificationJson = JSON.parse(
    buildCabinetProjectFieldVerificationPackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectFieldVerificationJson.schema,
    "custom_millwork.project_field_verification.v1",
    "project field verification JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    buildCabinetProjectCncBatchPackageFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-cnc-batch.json",
    "project CNC batch filename should be stable and user-readable"
  );
  const projectCncBatch = buildCabinetProjectCncBatchPackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectCncBatch.schema,
    "custom_millwork.project_cnc_batch.v1",
    "project CNC batch should expose the CNC batch schema"
  );
  assert.strictEqual(
    projectCncBatch.cncReadiness,
    "needs_review",
    "project CNC batch should require machining review for generated DXFs"
  );
  assert.strictEqual(
    projectCncBatch.fabricationReleasePackage.schema,
    "custom_millwork.project_fabrication_release.v1",
    "project CNC batch should embed fabrication release context"
  );
  assert.strictEqual(
    projectCncBatch.totals.assetCount,
    1,
    "project CNC batch should count placed assets"
  );
  assert.strictEqual(
    projectCncBatch.totals.dxfFileCount,
    1,
    "project CNC batch should count generated DXF files"
  );
  assert.strictEqual(
    projectCncBatch.totals.cutListCount,
    documentation.cutList.length,
    "project CNC batch should aggregate cut-list rows"
  );
  assert.strictEqual(
    projectCncBatch.materials.length,
    documentation.materialSchedule.length,
    "project CNC batch should aggregate material schedule rows"
  );
  assert.strictEqual(
    projectCncBatch.assets[0]?.dxfFileName,
    "base-cabinet-cut-layout.dxf",
    "project CNC batch should reference generated DXF filenames"
  );
  assert.strictEqual(
    projectCncBatch.assets[0]?.machiningReviewRequired,
    true,
    "project CNC batch should flag machining review"
  );
  assert(
    projectCncBatch.materials.every((item) => item.assetIds.includes(placedCabinetAsset.id)),
    "project CNC batch should relate material rows back to placed asset ids"
  );
  assert(
    projectCncBatch.artifacts.some((item) => item.type === "project_cnc_batch_json"),
    "project CNC batch should reference itself as an artifact"
  );
  assert(
    projectCncBatch.artifacts.some((item) => item.type === "project_finish_schedule_json"),
    "project CNC batch should reference the project finish schedule artifact"
  );
  assert(
    projectCncBatch.artifacts.some((item) => item.type === "project_cut_list_json"),
    "project CNC batch should reference the project cut-list artifact"
  );
  assert(
    projectCncBatch.artifacts.some((item) => item.type === "fabrication_dxf" && item.durable === false),
    "project CNC batch should reference generated non-durable DXF artifacts"
  );
  const projectCncBatchJson = JSON.parse(
    buildCabinetProjectCncBatchPackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectCncBatchJson.schema,
    "custom_millwork.project_cnc_batch.v1",
    "project CNC batch JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    buildCabinetProjectFabricationQuoteRequestFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-project-rfq.json",
    "project RFQ filename should be stable and user-readable"
  );
  const projectRfq = buildCabinetProjectFabricationQuoteRequest({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectRfq.schema,
    "custom_millwork.project_rfq.v1",
    "project RFQ should expose the project RFQ schema"
  );
  assert.strictEqual(
    projectRfq.schedule.schema,
    "custom_millwork.project_schedule.v1",
    "project RFQ should embed the project schedule"
  );
  assert.strictEqual(
    projectRfq.totals.assetCount,
    1,
    "project RFQ should carry project totals"
  );
  assert.strictEqual(
    projectRfq.assetQuoteRequests.length,
    1,
    "project RFQ should include per-asset quote requests"
  );
  assert.strictEqual(
    projectRfq.assetQuoteRequests[0]?.schema,
    "custom_millwork.rfq.v1",
    "project RFQ should include asset RFQ packages"
  );
  assert(
    projectRfq.artifacts.some((item) => item.type === "project_schedule_json"),
    "project RFQ should reference the project schedule JSON artifact"
  );
  assert(
    projectRfq.artifacts.some((item) => item.type === "project_schedule_csv"),
    "project RFQ should reference the project schedule CSV artifact"
  );
  assert(
    projectRfq.artifacts.some((item) => item.type === "project_procurement_json"),
    "project RFQ should reference the project procurement artifact"
  );
  assert(
    projectRfq.artifacts.some((item) => item.type === "project_finish_schedule_json"),
    "project RFQ should reference the project finish schedule artifact"
  );
  assert(
    projectRfq.artifacts.some((item) => item.type === "project_drawing_set_json"),
    "project RFQ should reference the project drawing set artifact"
  );
  assert(
    projectRfq.artifacts.some((item) => item.type === "project_cut_list_json"),
    "project RFQ should reference the project cut-list artifact"
  );
  assert(
    projectRfq.artifacts.some((item) => item.type === "project_quote_package_json"),
    "project RFQ should reference the project quote package artifact"
  );
  assert(
    projectRfq.artifacts.some((item) => item.type === "project_purchase_readiness_json"),
    "project RFQ should reference the project purchase readiness artifact"
  );
  assert(
    projectRfq.artifacts.some((item) => item.type === "project_field_verification_json"),
    "project RFQ should reference the project field verification artifact"
  );
  assert(
    projectRfq.artifacts.some((item) => item.type === "project_fabrication_release_json"),
    "project RFQ should reference the project fabrication release artifact"
  );
  assert(
    projectRfq.artifacts.some((item) => item.type === "project_installation_plan_json"),
    "project RFQ should reference the project installation plan artifact"
  );
  assert(
    projectRfq.artifacts.some((item) => item.type === "project_cnc_batch_json"),
    "project RFQ should reference the project CNC batch artifact"
  );
  assert(
    projectRfq.artifacts.some((item) => item.type === "project_approval_package_json"),
    "project RFQ should reference the project approval package artifact"
  );
  assert(
    projectRfq.artifacts.some((item) => item.type === "installer_work_order_json"),
    "project RFQ should reference placed installer work order artifacts"
  );
  assert(
    projectRfq.requestedDeliverables.some((item) => item.toLowerCase().includes("project-level")),
    "project RFQ should request project-level pricing"
  );
  const projectRfqJson = JSON.parse(
    buildCabinetProjectFabricationQuoteRequestJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectRfqJson.schema,
    "custom_millwork.project_rfq.v1",
    "project RFQ JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    buildCabinetProjectHandoffPackageFileName({ projectName: "Whole home millwork" }),
    "whole-home-millwork-project-handoff.json",
    "project handoff filename should be stable and user-readable"
  );
  const projectHandoff = buildCabinetProjectHandoffPackage({
    assets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectHandoff.schema,
    "custom_millwork.project_handoff_package.v1",
    "project handoff should expose the handoff package schema"
  );
  assert.strictEqual(
    projectHandoff.handoffStatus,
    "needs_review",
    "project handoff should require review while release and quote gates remain open"
  );
  assert.strictEqual(projectHandoff.canIssueToClient, true, "project handoff should allow client issue when not blocked");
  assert.strictEqual(
    projectHandoff.canIssueToFabricator,
    true,
    "project handoff should allow fabricator review when not blocked"
  );
  assert.strictEqual(
    projectHandoff.canIssueToInstaller,
    true,
    "project handoff should allow installer review when not blocked"
  );
  assert.strictEqual(
    projectHandoff.canIssueForPurchaseReview,
    true,
    "project handoff should allow purchase review when not blocked"
  );
  assert.strictEqual(
    projectHandoff.packages.schedule.schema,
    "custom_millwork.project_schedule.v1",
    "project handoff should embed the schedule package"
  );
  assert.strictEqual(
    projectHandoff.packages.scopePackage.schema,
    "custom_millwork.project_scope.v1",
    "project handoff should embed the scope package"
  );
  assert.strictEqual(
    projectHandoff.packages.procurementPackage.schema,
    "custom_millwork.project_procurement.v1",
    "project handoff should embed the procurement package"
  );
  assert.strictEqual(
    projectHandoff.packages.drawingSetPackage.schema,
    "custom_millwork.project_drawing_set.v1",
    "project handoff should embed the drawing set package"
  );
  assert.strictEqual(
    projectHandoff.packages.cutListPackage.schema,
    "custom_millwork.project_cut_list.v1",
    "project handoff should embed the cut-list package"
  );
  assert.strictEqual(
    projectHandoff.packages.cncBatchPackage.schema,
    "custom_millwork.project_cnc_batch.v1",
    "project handoff should embed the CNC batch package"
  );
  assert.strictEqual(
    projectHandoff.packages.rfqPackage.schema,
    "custom_millwork.project_rfq.v1",
    "project handoff should embed the project RFQ package"
  );
  assert.strictEqual(projectHandoff.totals.assetCount, 1, "project handoff should count placed assets");
  assert.strictEqual(projectHandoff.totals.packageCount, 15, "project handoff should count embedded packages");
  assert.strictEqual(
    projectHandoff.totals.cutListCount,
    documentation.cutList.length,
    "project handoff should preserve project cut-list totals"
  );
  assert.strictEqual(
    projectHandoff.totals.edgeBandingTotalM,
    projectSchedulePackage.totals.edgeBandingTotalM,
    "project handoff should preserve project edge-banding totals"
  );
  assert.strictEqual(
    projectHandoff.totals.estimatedTotal,
    projectQuotePackage.totals.estimatedTotal,
    "project handoff should preserve project quote totals"
  );
  assert.strictEqual(
    projectHandoff.assets[0]?.id,
    placedCabinetAsset.id,
    "project handoff should relate asset summaries to placed ids"
  );
  assert.strictEqual(
    projectHandoff.assets[0]?.sourceDefinitionFingerprint,
    baseFingerprint,
    "project handoff should expose source definition fingerprints for asset reconciliation"
  );
  assert(
    projectHandoff.handoffChecklist.some((item) => item.id === "handoff:fabrication-release" && item.status === "required"),
    "project handoff should surface required fabrication release review"
  );
  assert(
    projectHandoff.handoffChecklist.some((item) => item.id === "handoff:checkout-exclusion" && item.status === "ready"),
    "project handoff should preserve custom millwork checkout exclusion"
  );
  assert(
    projectHandoff.artifacts.some((item) => item.type === "project_handoff_package_json"),
    "project handoff should reference itself as an artifact"
  );
  assert(
    projectHandoff.artifacts.some((item) => item.type === "project_cut_list_json"),
    "project handoff should reference the project cut-list artifact"
  );
  assert(
    projectHandoff.artifacts.some((item) => item.type === "project_scope_json"),
    "project handoff should reference the project scope artifact"
  );
  assert(
    projectHandoff.artifacts.some((item) => item.type === "project_cnc_batch_json"),
    "project handoff should reference the project CNC batch artifact"
  );
  assert(
    projectHandoff.artifacts.some((item) => item.type === "project_rfq_json"),
    "project handoff should reference the project RFQ artifact"
  );
  assert(
    projectHandoff.artifacts.some((item) => item.type === "installer_work_order_json"),
    "project handoff should reference installer work order artifacts"
  );
  const projectHandoffJson = JSON.parse(
    buildCabinetProjectHandoffPackageJson({
      assets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectHandoffJson.schema,
    "custom_millwork.project_handoff_package.v1",
    "project handoff JSON should be parseable and preserve the schema"
  );
  const room = createRoom("room-1", "Kitchen", "kitchen");
  const snapshot: DesignSnapshot = {
    version: 3,
    activeRoomId: room.id,
    rooms: [{ ...room, items: [cabinetItem] }],
  };
  const restored = storedToSnapshot(snapshotToStored(snapshot));
  const restoredCabinet = restored.rooms[0]?.items[0];
  assert.strictEqual(restoredCabinet?.assetType, "parametric_cabinet", "stored snapshot should preserve cabinet asset type");
  assert.strictEqual(restoredCabinet?.roomId, "room-1", "stored snapshot should preserve millwork room id");
  assert.strictEqual(restoredCabinet?.assemblyType, base.modules[0].type, "stored snapshot should preserve assembly type");
  assert(restoredCabinet?.cabinetDefinition, "stored snapshot should preserve cabinet definition");
  assert(restoredCabinet?.millworkDefinition, "stored snapshot should preserve millwork definition");
  assert.strictEqual(
    restoredCabinet?.millworkDefinition?.schema,
    "custom_millwork.definition.v1",
    "stored snapshot should preserve millwork schema"
  );
  assert.strictEqual(
    restoredCabinet?.millworkDefinition?.sourceType,
    "cabinet_definition",
    "stored snapshot should preserve millwork source type"
  );
  assert.strictEqual(
    restoredCabinet?.millworkDefinition?.sourceDefinition.id,
    base.id,
    "stored snapshot should preserve source cabinet definition"
  );
  assert.strictEqual(
    restoredCabinet?.millworkDefinitionVersion,
    baseMillworkDefinition.version,
    "stored snapshot should preserve millwork definition version"
  );
  assert.strictEqual(
    restoredCabinet?.millworkAssetManifest?.schema,
    "custom_millwork.asset_manifest.v1",
    "stored snapshot should preserve the placed asset manifest"
  );
  assert.strictEqual(
    restoredCabinet?.millworkAssetManifest?.sourceDefinitionId,
    base.id,
    "stored snapshot should preserve the manifest source definition id"
  );
  assert.strictEqual(
    restoredCabinet?.millworkAssetManifest?.generatedOutput.durable,
    false,
    "stored snapshot should preserve generated GLB durability metadata"
  );
  assert.strictEqual(
    restoredCabinet?.glbAssetUrl,
    undefined,
    "stored snapshot should drop session-local blob GLB URLs"
  );
  assert.strictEqual(
    restoredCabinet?.millworkAssetManifest?.generatedOutput.url,
    undefined,
    "stored snapshot should drop session-local manifest GLB URLs"
  );
  assert.deepStrictEqual(
    restoredCabinet?.millworkAssetManifest?.transform.position,
    cabinetItem.position,
    "stored snapshot should preserve manifest transform position"
  );
  assert.strictEqual(
    restoredCabinet?.millworkAssetManifest?.transform.rotation[1],
    cabinetItem.rotationY,
    "stored snapshot should preserve manifest transform rotation"
  );
  assert.strictEqual(
    restoredCabinet?.millworkMaterials?.length,
    base.materials.length,
    "stored snapshot should preserve material refs"
  );
  assert.strictEqual(
    restoredCabinet?.millworkHardware?.length,
    base.hardware.length,
    "stored snapshot should preserve hardware refs"
  );
  assert.strictEqual(restoredCabinet?.bomSnapshot?.length, bom.length, "stored snapshot should preserve BOM snapshot");
  assert.strictEqual(
    restoredCabinet?.materialScheduleSnapshot?.length,
    documentation.materialSchedule.length,
    "stored snapshot should preserve material schedule snapshot"
  );
  assert.strictEqual(
    restoredCabinet?.hardwareScheduleSnapshot?.length,
    documentation.hardwareSchedule.length,
    "stored snapshot should preserve hardware schedule snapshot"
  );
  assert.strictEqual(
    restoredCabinet?.edgeBandingScheduleSnapshot?.length,
    documentation.edgeBandingSchedule.length,
    "stored snapshot should preserve edge-banding schedule snapshot"
  );
  assert.strictEqual(
    restoredCabinet?.cutListSnapshot?.length,
    documentation.cutList.length,
    "stored snapshot should preserve cut list snapshot"
  );
  assert.strictEqual(
    restoredCabinet?.dimensionScheduleSnapshot?.length,
    documentation.dimensionSchedule.length,
    "stored snapshot should preserve dimension schedule snapshot"
  );
  assert.strictEqual(
    restoredCabinet?.drawingViewScheduleSnapshot?.length,
    documentation.drawingViewSchedule.length,
    "stored snapshot should preserve drawing view schedule snapshot"
  );
  assert.strictEqual(
    restoredCabinet?.installerNotesSnapshot?.length,
    documentation.installerNotes.length,
    "stored snapshot should preserve installer notes snapshot"
  );
  assert.strictEqual(
    restoredCabinet?.releaseChecklistSnapshot?.length,
    documentation.releaseChecklist.length,
    "stored snapshot should preserve release checklist snapshot"
  );
  assert.strictEqual(
    restoredCabinet?.quoteSummarySnapshot?.estimatedTotal,
    documentation.quoteSummary.estimatedTotal,
    "stored snapshot should preserve quote summary snapshot"
  );
  assert.strictEqual(
    restoredCabinet?.supplierSkuMappingsSnapshot?.length,
    documentation.supplierSkuMappings.length,
    "stored snapshot should preserve supplier SKU mapping snapshot"
  );
  assert.strictEqual(
    restoredCabinet?.supplierReadinessSnapshot?.status,
    documentation.supplierReadiness.status,
    "stored snapshot should preserve supplier readiness snapshot"
  );
  assert.strictEqual(
    restoredCabinet?.fabricationReleaseReadinessSnapshot?.status,
    documentation.fabricationReleaseReadiness.status,
    "stored snapshot should preserve fabrication release readiness snapshot"
  );
  assert.deepStrictEqual(restoredCabinet?.position, cabinetItem.position, "stored snapshot should preserve cabinet position");
  assert.strictEqual(restoredCabinet?.rotationY, cabinetItem.rotationY, "stored snapshot should preserve cabinet rotation");
  assert.deepStrictEqual(
    restoredCabinet?.transform?.position,
    cabinetItem.transform?.position,
    "stored snapshot should preserve cabinet transform position"
  );
  const restoredShoppingRows = resolveRoomShoppingItems(restored.rooms[0]);
  const restoredShoppingRooms = summarizeShoppingRooms(restored.rooms, restored.activeRoomId);
  const restoredWholeHomeShopping = summarizeWholeHomeShopping(restoredShoppingRooms);
  assert.strictEqual(
    restoredShoppingRows.length,
    0,
    "parametric cabinet should not produce active room shopping rows"
  );
  assert.strictEqual(
    restoredShoppingRooms[0]?.itemCount,
    0,
    "parametric cabinet should not count as a shopping room item"
  );
  assert.strictEqual(
    restoredWholeHomeShopping.needsReviewCount,
    0,
    "parametric cabinet should not create commerce review work"
  );

  const wider = clone(base);
  wider.modules[0].width = 1100;
  wider.totalWidth = 1100;
  wider.updatedAt = new Date("2026-01-01T00:00:00.000Z").toISOString();
  const updatedBom = generateCabinetBOM(wider);
  const updatedDocumentation = generateCabinetDocumentation(wider);
  const widerMillworkDefinition = createCabinetMillworkDefinition(wider);
  const updatedCabinetAssetManifest = buildMillworkAssetManifest({
    assetId: cabinetItem.instanceId,
    assetType: "parametric_cabinet",
    millworkDefinition: widerMillworkDefinition,
    sourceDefinition: wider,
    roomId: cabinetItem.roomId,
    transform: {
      position: cabinetItem.position,
      rotation: [0, cabinetItem.rotationY ?? 0, 0],
      scale: [1, 1, 1],
    },
    glbAssetUrl: cabinetItem.glbAssetUrl,
    createdAt: cabinetItem.createdAt ?? base.createdAt,
    updatedAt: wider.updatedAt,
  });
  const updatedCabinet: DesignItem = {
    ...cabinetItem,
    variantId: wider.id,
    assemblyType: widerMillworkDefinition.assemblyType,
    millworkAssetManifest: updatedCabinetAssetManifest,
    cabinetDefinition: wider,
    millworkDefinition: widerMillworkDefinition,
    millworkDefinitionVersion: widerMillworkDefinition.version,
    millworkMaterials: widerMillworkDefinition.materials,
    millworkHardware: widerMillworkDefinition.hardware,
    bomSnapshot: updatedBom,
    materialScheduleSnapshot: updatedDocumentation.materialSchedule,
    hardwareScheduleSnapshot: updatedDocumentation.hardwareSchedule,
    edgeBandingScheduleSnapshot: updatedDocumentation.edgeBandingSchedule,
    cutListSnapshot: updatedDocumentation.cutList,
    dimensionScheduleSnapshot: updatedDocumentation.dimensionSchedule,
    drawingViewScheduleSnapshot: updatedDocumentation.drawingViewSchedule,
    installerNotesSnapshot: updatedDocumentation.installerNotes,
    releaseChecklistSnapshot: updatedDocumentation.releaseChecklist,
    quoteSummarySnapshot: updatedDocumentation.quoteSummary,
    supplierSkuMappingsSnapshot: updatedDocumentation.supplierSkuMappings,
    supplierReadinessSnapshot: updatedDocumentation.supplierReadiness,
    fabricationReleaseReadinessSnapshot: updatedDocumentation.fabricationReleaseReadiness,
    updatedAt: wider.updatedAt,
    cabinetUpdatedAt: wider.updatedAt,
    transform: {
      ...cabinetItem.transform!,
      position: cabinetItem.position,
      rotationY: cabinetItem.rotationY,
      rotation: [0, cabinetItem.rotationY ?? 0, 0],
    },
  };
  assert.deepStrictEqual(
    updatedCabinet.position,
    cabinetItem.position,
    "editing cabinet definition should preserve placed position"
  );
  assert.strictEqual(
    updatedCabinet.rotationY,
    cabinetItem.rotationY,
    "editing cabinet definition should preserve placed rotation"
  );
  assert(updatedCabinet.cabinetDefinition, "updated cabinet should keep cabinet definition");
  assert.strictEqual(updatedCabinet.cabinetDefinition.totalWidth, 1100, "edited cabinet should store new width");
  assert.strictEqual(
    updatedCabinet.millworkAssetManifest?.assetId,
    cabinetItem.instanceId,
    "editing cabinet definition should preserve the placed asset manifest id"
  );
  assert.strictEqual(
    updatedCabinet.millworkAssetManifest?.sourceDefinitionId,
    wider.id,
    "editing cabinet definition should keep the manifest pointed at the edited source definition"
  );
  assert.strictEqual(
    updatedCabinet.millworkAssetManifest?.updatedAt,
    wider.updatedAt,
    "editing cabinet definition should refresh the manifest update timestamp"
  );
  assert.deepStrictEqual(
    updatedCabinet.millworkAssetManifest?.transform.position,
    cabinetItem.position,
    "editing cabinet definition should preserve the manifest transform position"
  );
  assert.strictEqual(
    updatedCabinet.millworkAssetManifest?.transform.rotation[1],
    cabinetItem.rotationY,
    "editing cabinet definition should preserve the manifest transform rotation"
  );
  const updatedPlacedCabinetAsset: PlacedCabinetAsset = {
    ...placedCabinetAsset,
    assetManifest: updatedCabinetAssetManifest,
    assemblyType: widerMillworkDefinition.assemblyType,
    cabinetDefinition: wider,
    millworkDefinition: widerMillworkDefinition,
    millworkDefinitionVersion: widerMillworkDefinition.version,
    materials: wider.materials,
    hardware: wider.hardware,
    bomSnapshot: updatedBom,
    materialScheduleSnapshot: updatedDocumentation.materialSchedule,
    hardwareScheduleSnapshot: updatedDocumentation.hardwareSchedule,
    edgeBandingScheduleSnapshot: updatedDocumentation.edgeBandingSchedule,
    cutListSnapshot: updatedDocumentation.cutList,
    dimensionScheduleSnapshot: updatedDocumentation.dimensionSchedule,
    drawingViewScheduleSnapshot: updatedDocumentation.drawingViewSchedule,
    installerNotesSnapshot: updatedDocumentation.installerNotes,
    releaseChecklistSnapshot: updatedDocumentation.releaseChecklist,
    quoteSummarySnapshot: updatedDocumentation.quoteSummary,
    supplierSkuMappingsSnapshot: updatedDocumentation.supplierSkuMappings,
    supplierReadinessSnapshot: updatedDocumentation.supplierReadiness,
    fabricationReleaseReadinessSnapshot: updatedDocumentation.fabricationReleaseReadiness,
    updatedAt: wider.updatedAt,
  };
  const projectRevisionComparison = buildCabinetProjectRevisionPackage({
    assets: [updatedPlacedCabinetAsset],
    previousAssets: [placedCabinetAsset],
    projectId: "design-test-1",
    projectName: "Whole home millwork",
    roomNamesById: { "room-1": "Kitchen" },
  });
  assert.strictEqual(
    projectRevisionComparison.revisionPolicy.baselineComparisonAvailable,
    true,
    "project revision package should compare against a supplied baseline"
  );
  assert.strictEqual(
    projectRevisionComparison.previousSchedule?.schema,
    "custom_millwork.project_schedule.v1",
    "project revision package should include previous schedule context when a baseline is supplied"
  );
  assert.strictEqual(
    projectRevisionComparison.totals.currentAssetCount,
    1,
    "project revision comparison should count current assets"
  );
  assert.strictEqual(
    projectRevisionComparison.totals.previousAssetCount,
    1,
    "project revision comparison should count previous assets"
  );
  assert.strictEqual(
    projectRevisionComparison.totals.changedAssetCount,
    1,
    "project revision comparison should detect changed assets"
  );
  assert.strictEqual(
    projectRevisionComparison.totals.dimensionChangeCount,
    1,
    "project revision comparison should detect dimension changes"
  );
  assert(
    projectRevisionComparison.totals.edgeBandingDeltaM > 0,
    "project revision comparison should expose edge-banding quantity deltas"
  );
  assert(
    projectRevisionComparison.totals.quoteDelta > 0,
    "project revision comparison should expose quote deltas"
  );
  assert(
    projectRevisionComparison.changes.some((item) => item.scope === "dimension"),
    "project revision comparison should include dimension change items"
  );
  assert(
    projectRevisionComparison.changes.some((item) => item.scope === "source_fingerprint"),
    "project revision comparison should include source fingerprint change items"
  );
  assert(
    projectRevisionComparison.changes.some((item) => item.scope === "edge_banding"),
    "project revision comparison should include edge-banding change items"
  );
  assert(
    projectRevisionComparison.changes.some((item) => item.scope === "quote"),
    "project revision comparison should include quote change items"
  );
  assert(
    projectRevisionComparison.revisionPolicy.requiresDesignerReview,
    "project revision comparison should require designer review for changed assets"
  );
  assert(
    projectRevisionComparison.revisionPolicy.requiresClientReview,
    "project revision comparison should require client review for changed dimensions or quote totals"
  );
  assert(
    projectRevisionComparison.revisionPolicy.requiresFabricatorNotification,
    "project revision comparison should require fabricator notification for changed fabrication assumptions"
  );
  const projectRevisionComparisonJson = JSON.parse(
    buildCabinetProjectRevisionPackageJson({
      assets: [updatedPlacedCabinetAsset],
      previousAssets: [placedCabinetAsset],
      projectName: "Whole home millwork",
      roomNamesById: { "room-1": "Kitchen" },
    })
  );
  assert.strictEqual(
    projectRevisionComparisonJson.schema,
    "custom_millwork.project_revision_package.v1",
    "project revision comparison JSON should be parseable and preserve the schema"
  );

  const restoreFileReader = installNodeFileReader();
  try {
    const blob = await exportCabinetAsGlb(base);
    assert(blob.size > 0, "GLB export should return a non-empty Blob");
  } finally {
    restoreFileReader();
  }
}
