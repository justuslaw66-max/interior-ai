import assert from "assert";
import {
  buildCabinetFabricationDxf,
  buildCabinetFabricationDxfFileName,
} from "@/features/cabinetry/exportCabinetFabricationDxf";
import {
  buildCabinetShopDrawingSvg,
  buildCabinetShopDrawingSvgFileName,
} from "@/features/cabinetry/exportCabinetShopDrawingSvg";
import { exportCabinetAsGlb } from "@/features/cabinetry/exportCabinetGlb";
import { generateCabinetBOM } from "@/features/cabinetry/generateCabinetBOM";
import {
  CABINET_PLANNING_ESTIMATE_DISCLAIMER,
  buildCabinetFabricationQuoteRequest,
  buildCabinetFabricationQuoteRequestJson,
  buildCabinetSupplierSkuMappings,
  buildCabinetDocumentationPackage,
  buildCabinetDocumentationPackageJson,
  buildCabinetDocumentationCsv,
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
  buildCabinetSourceDefinitionExport,
  buildCabinetSourceDefinitionFileName,
  buildCabinetSourceDefinitionFingerprint,
  buildCabinetSourceDefinitionJson,
  generateCabinetDocumentation,
  parseCabinetSourceDefinitionJson,
} from "@/features/cabinetry/generateCabinetDocumentation";
import { generateCabinetParts } from "@/features/cabinetry/generateCabinetParts";
import { CABINET_HARDWARE } from "@/features/cabinetry/catalog/hardware";
import { resolveCabinetPartFabricationSpec } from "@/features/cabinetry/fabricationSemantics";
import {
  getCompatibleCabinetFrontHardware,
  resolveCabinetHardwareCompatibility,
} from "@/features/cabinetry/hardwareCompatibility";
import {
  CABINET_EQUAL_MODULE_WIDTHS_PARAMETER_PATH,
  cabinetModuleParameterPath,
  cabinetModuleWidthParameterPath,
  distributeCabinetModuleWidths,
  getCabinetParameterState,
  isCabinetOverallWidthLocked,
  isCabinetModuleWidthLocked,
  resizeCabinetToOverallWidth,
  setCabinetEqualModuleSizing,
  setCabinetModuleWidth,
  setCabinetModuleWidthLocked,
  setCabinetOverallWidthLocked,
  setCabinetParameterState,
  syncCabinetDefinitionDimensions,
} from "@/features/cabinetry/automation";
import {
  fitCabinetToSpace,
  getCabinetAvailableSegments,
  getCabinetFitPlacement,
} from "@/features/cabinetry/fitToSpace";
import { reconcileCabinetModuleSizing } from "@/features/cabinetry/moduleSizingReconciliation";
import {
  getCabinetModuleRunWidth,
  getCabinetOverallDepth,
  getCabinetOverallHeight,
  getCabinetOverallWidth,
} from "@/features/cabinetry/layout";
import { getCabinetOverallWidthLimits } from "@/features/cabinetry/moduleWidthConstraints";
import { getCabinetMinimumModuleWidthMm } from "@/features/cabinetry/moduleWidthRules";
import { getCabinetVisiblePreviewParts } from "@/features/cabinetry/previewParts";
import {
  getCabinetDrawerHeightProportions,
  getCabinetEffectiveDoorCount,
  setCabinetDoorLayoutMode,
  setCabinetDrawerHeightMode,
  setCabinetHandlePlacementMode,
} from "@/features/cabinetry/frontBehavior";
import {
  CABINET_PRESET_OPTIONS,
  createCabinetPreset,
  type CabinetPresetId,
} from "@/features/cabinetry/presets";
import {
  CABINET_PROPERTY_REGISTRY,
  filterCabinetProperties,
} from "@/features/cabinetry/propertyRegistry";
import { validateCabinetDefinition } from "@/features/cabinetry/validation";
import { buildMillworkAssetManifest } from "@/features/millwork/buildMillworkAssetManifest";
import { createCabinetMillworkDefinition } from "@/features/millwork/createCabinetMillworkDefinition";
import type { MillworkAssemblyType, MillworkFamily } from "@/features/millwork/types";
import type { PlacedCabinetAsset } from "@/features/cabinetry/types";
import {
  resolveRoomShoppingItems,
  summarizeShoppingRooms,
  summarizeWholeHomeShopping,
} from "@/lib/room-shopping";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { createRoom, type DesignItem, type DesignSnapshot } from "@/lib/room-types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function testAutomationFitAndStructuredValidation(): void {
  const base = createCabinetPreset("base", "cabinet-test-base");
  const baseValidation = validateCabinetDefinition(base);
  assert.strictEqual(baseValidation.valid, true, "valid base cabinet should pass");
  assert.strictEqual(
    base.automation?.moduleSizingMode,
    "automatic",
    "presets should start with automatic module sizing"
  );
  assert.strictEqual(
    getCabinetParameterState(base, cabinetModuleWidthParameterPath(base.modules[0].id)).source,
    "template_defined",
    "preset module widths should retain template provenance"
  );
  for (const field of [
    "boardThickness",
    "backPanelThickness",
    "toeKickHeight",
    "revealGap",
  ]) {
    assert.strictEqual(
      getCabinetParameterState(base, field).source,
      "template_defined",
      `${field} should retain template provenance`
    );
  }

  const nonParameterDefinitionFields = new Set([
    "id",
    "name",
    "version",
    "units",
    "millworkFamily",
    "millworkAssemblyType",
    "sourcePresetId",
    "requiredHostType",
    "automation",
    "fitState",
    "modules",
    "materials",
    "hardware",
    "createdAt",
    "updatedAt",
  ]);
  const automaticModuleFields = new Set([
    "doorLayoutMode",
    "drawerHeightMode",
    "drawerHeightProportions",
    "handlePlacementMode",
    "handleOffsetX",
    "handleOffsetY",
  ]);
  for (const option of CABINET_PRESET_OPTIONS) {
    const preset = createCabinetPreset(option.id, `cabinet-provenance-${option.id}`);
    for (const [field, value] of Object.entries(preset)) {
      if (value === undefined || nonParameterDefinitionFields.has(field)) continue;
      const path = field === "totalWidth"
        ? "overall.width"
        : field === "height"
          ? "overall.height"
          : field === "depth"
            ? "overall.depth"
            : field;
      assert.strictEqual(
        getCabinetParameterState(preset, path).source,
        "template_defined",
        `${option.id} definition field ${field} should retain template provenance`
      );
    }
    for (const cabinetModule of preset.modules) {
      for (const [field, value] of Object.entries(cabinetModule)) {
        if (field === "id" || value === undefined) continue;
        assert.strictEqual(
          getCabinetParameterState(
            preset,
            cabinetModuleParameterPath(cabinetModule.id, field)
          ).source,
          automaticModuleFields.has(field) ? "automatic" : "template_defined",
          `${option.id} module field ${field} should have initialized provenance`
        );
      }
    }
  }

  const mediaWall = createCabinetPreset("media_wall", "cabinet-provenance-media-wall");
  const mediaModule = mediaWall.modules.find((module) => module.mediaWallEnabled);
  assert(mediaModule, "media wall preset should expose its specialty module");
  assert.strictEqual(
    getCabinetParameterState(
      mediaWall,
      cabinetModuleParameterPath(mediaModule.id, "mediaTvBlockingThickness")
    ).source,
    "template_defined",
    "specialty construction values should retain template provenance"
  );
  const legacyMediaWall = clone(mediaWall);
  const mediaBlockingPath = cabinetModuleParameterPath(
    mediaModule.id,
    "mediaTvBlockingThickness"
  );
  if (legacyMediaWall.automation) {
    delete legacyMediaWall.automation.parameters.boardThickness;
    delete legacyMediaWall.automation.parameters[mediaBlockingPath];
  }
  assert.strictEqual(
    getCabinetParameterState(legacyMediaWall, "boardThickness").source,
    "template_defined",
    "older definitions without explicit construction provenance should infer the preset source"
  );
  assert.strictEqual(
    getCabinetParameterState(legacyMediaWall, mediaBlockingPath).source,
    "template_defined",
    "older definitions without explicit specialty provenance should infer the preset source"
  );
  assert.strictEqual(
    new Set(CABINET_PROPERTY_REGISTRY.map((property) => property.id)).size,
    CABINET_PROPERTY_REGISTRY.length,
    "contextual property registry IDs should remain unique"
  );
  const friendlyFirstProperties: ReadonlyArray<{
    field: string;
    label: string;
    professionalTerm: string;
  }> = [
    {
      field: "materialId",
      label: "Cabinet structure material",
      professionalTerm: "carcass material",
    },
    {
      field: "stairScribeStepCount",
      label: "Under-stair profile steps",
      professionalTerm: "stair scribe",
    },
    {
      field: "leftFillerWidth",
      label: "Left wall fitting panel",
      professionalTerm: "left filler",
    },
    {
      field: "rightFillerWidth",
      label: "Right wall fitting panel",
      professionalTerm: "right filler",
    },
    {
      field: "leftFillerScribeAllowance",
      label: "Left wall-fit trimming allowance",
      professionalTerm: "left scribe allowance",
    },
    {
      field: "rightFillerScribeAllowance",
      label: "Right wall-fit trimming allowance",
      professionalTerm: "right scribe allowance",
    },
    {
      field: "toeKickSetback",
      label: "Floor-base setback",
      professionalTerm: "toe-kick setback",
    },
    {
      field: "toeKickDepth",
      label: "Floor-base depth",
      professionalTerm: "plinth depth",
    },
  ];
  for (const expected of friendlyFirstProperties) {
    const property = CABINET_PROPERTY_REGISTRY.find(
      (candidate) => candidate.field === expected.field
    );
    assert(property, `${expected.field} should remain searchable`);
    assert.strictEqual(
      property.label,
      expected.label,
      `${expected.field} should lead with a friendly label`
    );
    assert(
      [property.description, ...property.searchTerms]
        .join(" ")
        .toLowerCase()
        .includes(expected.professionalTerm),
      `${expected.field} should preserve ${expected.professionalTerm} as secondary terminology`
    );
  }
  const plinthResults = filterCabinetProperties("plinth", {
    activeModule: base.modules[0],
    assemblyType: base.millworkAssemblyType,
  });
  assert(
    plinthResults.some((property) => property.field === "toeKickSetback"),
    "property search should resolve professional plinth terminology to friendly toe-kick controls"
  );
  const highValuePropertyQueries: ReadonlyArray<{
    query: string;
    field: string;
    controlTestId: string;
  }> = [
    {
      query: "door spacing",
      field: "revealGap",
      controlTestId: "cabinet-input-reveal-gap",
    },
    {
      query: "reveal",
      field: "revealGap",
      controlTestId: "cabinet-input-reveal-gap",
    },
    {
      query: "carcass thickness",
      field: "boardThickness",
      controlTestId: "cabinet-input-board-thickness",
    },
    {
      query: "carcass material",
      field: "materialId",
      controlTestId: "cabinet-input-material",
    },
    {
      query: "cabinet structure thickness",
      field: "boardThickness",
      controlTestId: "cabinet-input-board-thickness",
    },
    {
      query: "rear panel thickness",
      field: "backPanelThickness",
      controlTestId: "cabinet-input-back-panel-thickness",
    },
    {
      query: "plinth height",
      field: "toeKickHeight",
      controlTestId: "cabinet-input-toe-kick-height",
    },
    {
      query: "toe kick setback",
      field: "toeKickSetback",
      controlTestId: "cabinet-input-toe-kick-setback",
    },
    {
      query: "plinth depth",
      field: "toeKickDepth",
      controlTestId: "cabinet-input-toe-kick-depth",
    },
    {
      query: "left scribe allowance",
      field: "leftFillerScribeAllowance",
      controlTestId: "cabinet-input-left-filler-scribe-allowance",
    },
    {
      query: "right scribe allowance",
      field: "rightFillerScribeAllowance",
      controlTestId: "cabinet-input-right-filler-scribe-allowance",
    },
    {
      query: "left applied end thickness",
      field: "leftEndPanelThickness",
      controlTestId: "cabinet-input-left-end-panel-thickness",
    },
    {
      query: "right finished side thickness",
      field: "rightEndPanelThickness",
      controlTestId: "cabinet-input-right-end-panel-thickness",
    },
  ];
  for (const expected of highValuePropertyQueries) {
    const result = filterCabinetProperties(expected.query, {
      activeModule: base.modules[0],
      assemblyType: base.millworkAssemblyType,
    }).find((property) => property.field === expected.field);
    assert(result, `property search should resolve ${expected.query} to ${expected.field}`);
    assert.strictEqual(
      result.controlTestId,
      expected.controlTestId,
      `${expected.field} should retain a stable inspector focus target`
    );
  }
  const beamPreset = createCabinetPreset("ceiling_beams", "cabinet-test-property-beams");
  const beamResults = filterCabinetProperties("beam", {
    activeModule: beamPreset.modules[0],
    assemblyType: beamPreset.millworkAssemblyType,
  });
  assert(
    beamResults.some((property) => property.field === "ceilingBeamCount"),
    "property search should expose component-specific beam controls"
  );
  assert(
    !beamResults.some((property) => property.field === "drawerCount"),
    "contextual property search should not leak cabinet-front controls into ceiling beams"
  );

  const customShelfCabinet = createCabinetPreset(
    "wall",
    "cabinet-test-custom-shelf-spacing"
  );
  customShelfCabinet.modules[0].shelfCount = 2;
  customShelfCabinet.modules[0].shelfSpacingMode = "custom";
  customShelfCabinet.modules[0].shelfPositionsMm = [260, 510];
  if (!customShelfCabinet.automation) throw new Error("Preset automation state is required");
  customShelfCabinet.automation.shelfSpacingMode = "custom";
  assert(
    validateCabinetDefinition(customShelfCabinet).valid,
    "ordered custom shelf heights should validate"
  );
  assert.deepStrictEqual(
    generateCabinetParts(customShelfCabinet)
      .filter((part) => part.type === "shelf")
      .map((part) => part.position.y),
    [260, 510],
    "custom shelf heights should drive generated shelf geometry"
  );
  const malformedCustomShelves = clone(customShelfCabinet);
  malformedCustomShelves.modules[0].shelfPositionsMm = [510, 260];
  assert.strictEqual(
    validateCabinetDefinition(malformedCustomShelves).valid,
    false,
    "overlapping or unordered custom shelves should be rejected"
  );
  const customShelfRoundTrip = parseCabinetSourceDefinitionJson(
    buildCabinetSourceDefinitionJson(customShelfCabinet)
  );
  assert.deepStrictEqual(
    customShelfRoundTrip.modules[0].shelfPositionsMm,
    [260, 510],
    "source definitions should preserve custom shelf spacing"
  );

  let recommendedDoors = createCabinetPreset(
    "wall",
    "cabinet-test-recommended-door-layout"
  );
  recommendedDoors.modules[0].width = 1500;
  recommendedDoors = syncCabinetDefinitionDimensions(recommendedDoors);
  recommendedDoors = setCabinetDoorLayoutMode(
    recommendedDoors,
    recommendedDoors.modules[0].id,
    "recommended"
  );
  assert.strictEqual(
    getCabinetEffectiveDoorCount(recommendedDoors, recommendedDoors.modules[0]),
    3,
    "recommended door layout should split wide double-door bays into safe leaf widths"
  );
  assert.strictEqual(
    generateCabinetParts(recommendedDoors).filter((part) => part.type === "door_front").length,
    3,
    "recommended door count should drive generated front geometry"
  );
  let manualDoors = setCabinetDoorLayoutMode(
    recommendedDoors,
    recommendedDoors.modules[0].id,
    "manual"
  );
  assert.strictEqual(
    manualDoors.modules[0].doorCount,
    3,
    "entering manual door mode should preserve the currently generated recommendation"
  );
  manualDoors.modules[0].width = 700;
  manualDoors = syncCabinetDefinitionDimensions(manualDoors);
  assert.strictEqual(
    getCabinetEffectiveDoorCount(manualDoors, manualDoors.modules[0]),
    3,
    "manual door count should survive later width changes"
  );
  const restoredRecommendedDoors = setCabinetDoorLayoutMode(
    manualDoors,
    manualDoors.modules[0].id,
    "recommended"
  );
  assert.strictEqual(
    restoredRecommendedDoors.modules[0].doorCount,
    2,
    "returning to recommended door mode should clearly replace the manual override"
  );
  assert.strictEqual(
    getCabinetParameterState(
      restoredRecommendedDoors,
      `modules.${restoredRecommendedDoors.modules[0].id}.doorCount`
    ).source,
    "automatic",
    "restored recommended door counts should retain automatic provenance"
  );

  let smartDrawers = createCabinetPreset(
    "base",
    "cabinet-test-smart-drawer-heights"
  );
  smartDrawers = setCabinetDrawerHeightMode(
    smartDrawers,
    smartDrawers.modules[0].id,
    "recommended"
  );
  const recommendedDrawerProportions = getCabinetDrawerHeightProportions(
    smartDrawers,
    smartDrawers.modules[0]
  );
  assert(
    recommendedDrawerProportions[0] > recommendedDrawerProportions[2],
    "recommended drawer proportions should create a deeper lower drawer and a smaller top drawer"
  );
  smartDrawers = setCabinetDrawerHeightMode(
    smartDrawers,
    smartDrawers.modules[0].id,
    "custom"
  );
  assert.deepStrictEqual(
    smartDrawers.modules[0].drawerHeightProportions,
    recommendedDrawerProportions,
    "entering custom drawer mode should preserve the currently generated proportions"
  );
  smartDrawers.modules[0].drawerHeightProportions = [0.2, 0.3, 0.5];
  const customDrawerParts = generateCabinetParts(smartDrawers);
  const customDrawerFronts = customDrawerParts.filter(
    (part) => part.type === "drawer_front"
  );
  assert(
    customDrawerFronts[0].size.height < customDrawerFronts[1].size.height &&
      customDrawerFronts[1].size.height < customDrawerFronts[2].size.height,
    "custom bottom-to-top proportions should drive drawer-front geometry"
  );
  const customDrawerBoxSideHeights = customDrawerParts
    .filter(
      (part) =>
        part.type === "drawer_box_side" &&
        part.metadata?.role === "drawer_box_left_side"
    )
    .map((part) => part.size.height);
  assert(
    customDrawerBoxSideHeights[0] < customDrawerBoxSideHeights[1] &&
      customDrawerBoxSideHeights[1] < customDrawerBoxSideHeights[2],
    "custom drawer-front proportions should flow through generated drawer boxes"
  );
  assert.deepStrictEqual(
    customDrawerParts
      .filter((part) => part.type === "drawer_slide_pair")
      .map((part) => part.metadata?.frontPartId),
    customDrawerFronts.map((part) => part.id),
    "custom drawer layouts should keep one aligned slide pair linked to every generated front"
  );

  const automaticHandleParts = generateCabinetParts(smartDrawers).filter(
    (part) => part.type === "handle"
  );
  const customHandles = setCabinetHandlePlacementMode(
    smartDrawers,
    smartDrawers.modules[0].id,
    "custom"
  );
  customHandles.modules[0].handleOffsetX = 35;
  customHandles.modules[0].handleOffsetY = -20;
  const customHandleParts = generateCabinetParts(customHandles).filter(
    (part) => part.type === "handle"
  );
  assert.strictEqual(
    round1(customHandleParts[0].position.x - automaticHandleParts[0].position.x),
    35,
    "custom horizontal handle offset should drive generated handle geometry"
  );
  assert.strictEqual(
    round1(customHandleParts[0].position.y - automaticHandleParts[0].position.y),
    -20,
    "custom vertical handle offset should drive generated handle geometry"
  );
  assert(
    validateCabinetDefinition(customHandles).valid,
    "in-bounds custom handle offsets and drawer proportions should validate"
  );
  const smartFrontDocumentation = generateCabinetDocumentation(customHandles);
  assert(
    smartFrontDocumentation.dimensionSchedule.some(
      (item) =>
        item.moduleId === customHandles.modules[0].id &&
        item.notes?.includes("custom drawer heights") &&
        item.notes.includes("custom handle placement")
    ),
    "professional schedules should document custom drawer and handle behavior"
  );
  const smartFrontRoundTrip = parseCabinetSourceDefinitionJson(
    buildCabinetSourceDefinitionJson(customHandles)
  );
  assert.deepStrictEqual(
    {
      drawerHeightMode: smartFrontRoundTrip.modules[0].drawerHeightMode,
      drawerHeightProportions: smartFrontRoundTrip.modules[0].drawerHeightProportions,
      handlePlacementMode: smartFrontRoundTrip.modules[0].handlePlacementMode,
      handleOffsetX: smartFrontRoundTrip.modules[0].handleOffsetX,
      handleOffsetY: smartFrontRoundTrip.modules[0].handleOffsetY,
    },
    {
      drawerHeightMode: "custom",
      drawerHeightProportions: [0.2, 0.3, 0.5],
      handlePlacementMode: "custom",
      handleOffsetX: 35,
      handleOffsetY: -20,
    },
    "source definitions should preserve smart/manual front behavior"
  );
  const invalidHandleOffset = clone(customHandles);
  invalidHandleOffset.modules[0].handleOffsetX = 5000;
  const invalidHandleValidation = validateCabinetDefinition(invalidHandleOffset);
  assert.strictEqual(
    invalidHandleValidation.valid,
    false,
    "custom handle offsets that move hardware outside a front should be rejected"
  );
  assert.strictEqual(
    invalidHandleValidation.issues.find(
      (issue) => issue.code === "front.handle.offset_invalid"
    )?.fixes?.[0]?.action.type,
    "patch_module",
    "out-of-bounds handle offsets should offer a reversible automatic-placement fix"
  );
  const restoredAutomaticHandles = setCabinetHandlePlacementMode(
    customHandles,
    customHandles.modules[0].id,
    "automatic"
  );
  assert.strictEqual(
    restoredAutomaticHandles.modules[0].handleOffsetX,
    undefined,
    "returning to automatic handle placement should clear the horizontal override"
  );
  assert.strictEqual(
    restoredAutomaticHandles.modules[0].handleOffsetY,
    undefined,
    "returning to automatic handle placement should clear the vertical override"
  );

  let automatedRun = createCabinetPreset("cabinet_run", "cabinet-test-automated-run");
  const lockedModuleId = automatedRun.modules[0].id;
  const lockedModuleWidth = automatedRun.modules[0].width;
  automatedRun = setCabinetModuleWidthLocked(automatedRun, lockedModuleId, true);
  assert(isCabinetModuleWidthLocked(automatedRun, lockedModuleId), "module width lock should persist");
  const distributedRun = distributeCabinetModuleWidths(automatedRun, 2800);
  assert(distributedRun.ok, "automatic distribution should fit unlocked modules around locked widths");
  assert.strictEqual(
    distributedRun.definition.modules.find((module) => module.id === lockedModuleId)?.width,
    lockedModuleWidth,
    "automatic distribution should preserve locked module widths"
  );
  assert.strictEqual(
    distributedRun.definition.modules.reduce((sum, module) => sum + module.width, 0),
    2800,
    "automatic distribution should allocate the exact requested module run width"
  );
  assert(
    distributedRun.adjustments.every((adjustment) => adjustment.moduleId !== lockedModuleId),
    "automatic distribution should not report a locked module adjustment"
  );
  const directLockedBayEdit = setCabinetModuleWidth(
    automatedRun,
    lockedModuleId,
    lockedModuleWidth + 100
  );
  assert.strictEqual(
    directLockedBayEdit.modules.find((module) => module.id === lockedModuleId)?.width,
    lockedModuleWidth,
    "the automation boundary should reject direct edits to an individually locked bay"
  );

  let overallLockedRun = createCabinetPreset("cabinet_run", "cabinet-test-overall-lock");
  overallLockedRun = setCabinetOverallWidthLocked(overallLockedRun, true);
  assert(isCabinetOverallWidthLocked(overallLockedRun), "overall width lock should persist");
  const overallLockedResize = resizeCabinetToOverallWidth(
    overallLockedRun,
    getCabinetOverallWidth(overallLockedRun) + 500
  );
  assert.strictEqual(overallLockedResize.ok, false, "overall lock should prevent automatic run resizing");
  assert.strictEqual(
    overallLockedResize.issues[0]?.code,
    "overall_width_locked",
    "overall lock failure should explain the locked assembly dimension"
  );
  const originalLockedModuleWidth = overallLockedRun.modules[0].width;
  const lockedBayEdit = setCabinetModuleWidth(
    overallLockedRun,
    overallLockedRun.modules[0].id,
    originalLockedModuleWidth + 200
  );
  assert.strictEqual(
    lockedBayEdit.modules[0].width,
    originalLockedModuleWidth,
    "overall width lock should also protect direct bay-width edits"
  );

  const mediaWidthSource = createCabinetPreset("media_wall", "cabinet-test-media-width-limits");
  const mediaWidthLimits = getCabinetOverallWidthLimits(mediaWidthSource);
  assert(
    mediaWidthLimits.minMm >=
      mediaWidthSource.modules.reduce(
        (sum, module) => sum + getCabinetMinimumModuleWidthMm(module, mediaWidthSource),
        0
      ),
    "overall width controls should include specialty-dependent module minimums"
  );
  const constrainedMediaModule = mediaWidthSource.modules.reduce((widest, module) =>
    getCabinetMinimumModuleWidthMm(module, mediaWidthSource) > getCabinetMinimumModuleWidthMm(widest, mediaWidthSource)
      ? module
      : widest
  );
  const clampedMediaModule = setCabinetModuleWidth(
    mediaWidthSource,
    constrainedMediaModule.id,
    120
  );
  assert(
    (clampedMediaModule.modules.find((module) => module.id === constrainedMediaModule.id)?.width ?? 0) >=
      getCabinetMinimumModuleWidthMm(constrainedMediaModule, mediaWidthSource),
    "direct module edits should clamp to the same specialty-aware minimum used by Fit"
  );
  for (const preset of CABINET_PRESET_OPTIONS) {
    const presetDefinition = createCabinetPreset(
      preset.id,
      `cabinet-test-minimum-${preset.id}`
    );
    const limits = getCabinetOverallWidthLimits(presetDefinition);
    const minimumResize = resizeCabinetToOverallWidth(
      presetDefinition,
      limits.minMm
    );
    assert(
      minimumResize.ok,
      `${preset.id} should accept the overall minimum advertised by the editor`
    );
    assert(
      validateCabinetDefinition(minimumResize.definition).valid,
      `${preset.id} should remain validator-safe at its advertised overall minimum`
    );
    presetDefinition.modules.forEach((module) => {
      const minimumModuleCandidate = syncCabinetDefinitionDimensions({
        ...presetDefinition,
        modules: presetDefinition.modules.map((candidate) =>
          candidate.id === module.id
            ? {
                ...candidate,
                width: getCabinetMinimumModuleWidthMm(candidate, presetDefinition),
              }
            : candidate
        ),
      });
      assert(
        validateCabinetDefinition(minimumModuleCandidate).valid,
        `${preset.id}/${module.id} should validate at its reported module minimum`
      );
    });
  }

  let equalRun = createCabinetPreset("cabinet_run", "cabinet-test-equal-run");
  equalRun = setCabinetEqualModuleSizing(equalRun, true);
  const equalResult = resizeCabinetToOverallWidth(
    equalRun,
    getCabinetOverallWidth(equalRun),
    { source: "user_overridden" }
  );
  assert(equalResult.ok, "equal module sizing should redistribute an unlocked run");
  const equalWidths = equalResult.definition.modules.map((module) => module.width);
  assert(
    Math.max(...equalWidths) - Math.min(...equalWidths) <= 1,
    "equal module sizing should keep every bay equal within integer rounding"
  );
  assert.strictEqual(
    getCabinetParameterState(equalResult.definition, CABINET_EQUAL_MODULE_WIDTHS_PARAMETER_PATH).locked,
    true,
    "equal module sizing should persist its visible group lock"
  );
  const equalGroupDirectEdit = setCabinetModuleWidth(
    equalResult.definition,
    equalResult.definition.modules[0].id,
    equalResult.definition.modules[0].width + 100
  );
  assert.strictEqual(
    equalGroupDirectEdit.modules[0].width,
    equalResult.definition.modules[0].width,
    "the automation boundary should reject one-bay edits while equal sizing is active"
  );

  let fullyLockedRun = createCabinetPreset("cabinet_run", "cabinet-test-fully-locked-run");
  fullyLockedRun.modules.forEach((module) => {
    fullyLockedRun = setCabinetModuleWidthLocked(fullyLockedRun, module.id, true);
  });
  const lockedFailure = distributeCabinetModuleWidths(fullyLockedRun, 3100);
  assert.strictEqual(lockedFailure.ok, false, "an all-locked layout should refuse an incompatible target width");
  assert.strictEqual(
    lockedFailure.issues[0]?.code,
    "no_unlocked_modules",
    "locked distribution failure should explain that no modules can absorb the width"
  );

  const wardrobeSeed = createCabinetPreset(
    "wardrobe",
    "cabinet-test-module-reconciliation"
  );
  const wardrobeSeedModule = wardrobeSeed.modules[0];
  let fittedWardrobe = syncCabinetDefinitionDimensions({
    ...wardrobeSeed,
    leftFillerWidth: 50,
    rightFillerWidth: 50,
    includeLeftEndPanel: true,
    includeRightEndPanel: true,
    leftEndPanelThickness: 18,
    rightEndPanelThickness: 18,
    includeCountertop: true,
    countertopThickness: 38,
    countertopOverhangLeft: 20,
    countertopOverhangRight: 20,
    countertopMaterialId: wardrobeSeed.materials[0].id,
    modules: [
      { ...wardrobeSeedModule, id: "wardrobe-a", width: 600 },
      { ...wardrobeSeedModule, id: "wardrobe-b", width: 1324 },
      { ...wardrobeSeedModule, id: "wardrobe-c", width: 900 },
    ],
    fitState: {
      host: {
        id: "wardrobe-wall",
        kind: "wall",
        label: "Wardrobe wall",
        availableWidthMm: 3000,
        availableHeightMm: 2600,
        openings: [],
      },
      mode: "fit_width",
      alignment: "center",
      segment: {
        startMm: -1500,
        endMm: 1500,
        widthMm: 3000,
        centerOffsetMm: 0,
      },
      appliedAt: new Date().toISOString(),
    },
  });
  fittedWardrobe = setCabinetModuleWidthLocked(
    setCabinetModuleWidthLocked(fittedWardrobe, "wardrobe-a", true),
    "wardrobe-c",
    true
  );
  assert.strictEqual(
    getCabinetOverallWidth(fittedWardrobe),
    3000,
    "the reconciliation fixture should begin fitted to an exact 3000 mm target"
  );
  assert.strictEqual(
    getCabinetOverallWidth(fittedWardrobe) -
      getCabinetModuleRunWidth(fittedWardrobe),
    176,
    "the fitted target should include fillers, end panels, and worktop side overhangs"
  );
  assert(
    validateCabinetDefinition(fittedWardrobe).valid,
    "the mixed-lock fitted wardrobe reconciliation fixture should start valid"
  );

  const addedWardrobeModule = {
    ...fittedWardrobe.modules[1],
    id: "wardrobe-d",
    width: 500,
  };
  const automaticAdd = reconcileCabinetModuleSizing(fittedWardrobe, {
    operation: "add",
    modules: [...fittedWardrobe.modules, addedWardrobeModule],
  });
  assert(automaticAdd.ok, "automatic add should reconcile unlocked wardrobe bays");
  assert.strictEqual(
    getCabinetOverallWidth(automaticAdd.definition),
    3000,
    "automatic add should preserve the fitted overall target including fixed fitting parts"
  );
  assert.strictEqual(
    automaticAdd.definition.modules.find((module) => module.id === "wardrobe-a")?.width,
    600,
    "automatic add should preserve the first locked wardrobe bay"
  );
  assert.strictEqual(
    automaticAdd.definition.modules.find((module) => module.id === "wardrobe-c")?.width,
    900,
    "automatic add should preserve the second locked wardrobe bay"
  );
  assert.strictEqual(
    getCabinetParameterState(
      automaticAdd.definition,
      cabinetModuleWidthParameterPath("wardrobe-d")
    ).source,
    "automatic",
    "automatic add should mark the new bay width with automatic provenance"
  );
  assert(
    validateCabinetDefinition(automaticAdd.definition).valid,
    "automatic add must not report success with an invalid generated wardrobe"
  );

  const duplicatedWardrobeModule = {
    ...fittedWardrobe.modules[1],
    id: "wardrobe-copy",
  };
  const automaticDuplicate = reconcileCabinetModuleSizing(fittedWardrobe, {
    operation: "duplicate",
    modules: [...fittedWardrobe.modules, duplicatedWardrobeModule],
  });
  assert(automaticDuplicate.ok, "automatic duplicate should reconcile the copied bay");
  assert.strictEqual(
    getCabinetOverallWidth(automaticDuplicate.definition),
    3000,
    "automatic duplicate should preserve the prior fitted width"
  );

  const automaticDelete = reconcileCabinetModuleSizing(fittedWardrobe, {
    operation: "delete",
    modules: fittedWardrobe.modules.filter((module) => module.id !== "wardrobe-c"),
  });
  assert(automaticDelete.ok, "automatic delete should let an unlocked bay absorb released space");
  assert.strictEqual(
    automaticDelete.definition.modules.find((module) => module.id === "wardrobe-a")?.width,
    600,
    "automatic delete should preserve remaining locked widths"
  );
  assert.strictEqual(
    automaticDelete.definition.modules.find((module) => module.id === "wardrobe-b")?.width,
    2224,
    "automatic delete should allocate the exact remaining fitted run to the unlocked bay"
  );
  assert.strictEqual(
    getCabinetOverallWidth(automaticDelete.definition),
    3000,
    "automatic delete should preserve the prior fitted width"
  );
  assert.strictEqual(
    automaticDelete.definition.automation?.parameters[
      cabinetModuleWidthParameterPath("wardrobe-c")
    ],
    undefined,
    "automatic delete should remove stale lock and provenance state for the deleted bay"
  );

  const automaticReorder = reconcileCabinetModuleSizing(fittedWardrobe, {
    operation: "reorder",
    modules: [
      fittedWardrobe.modules[2],
      fittedWardrobe.modules[0],
      fittedWardrobe.modules[1],
    ],
  });
  assert(automaticReorder.ok, "automatic reorder should preserve a feasible mixed-lock layout");
  assert.deepStrictEqual(
    automaticReorder.definition.modules.map((module) => module.id),
    ["wardrobe-c", "wardrobe-a", "wardrobe-b"],
    "automatic reorder should retain the requested semantic module order"
  );
  assert.deepStrictEqual(
    automaticReorder.definition.modules.map((module) => module.width),
    [900, 600, 1324],
    "automatic reorder should not perturb already feasible mixed-lock widths"
  );

  const overallLockedAutomaticAdd = reconcileCabinetModuleSizing(
    setCabinetOverallWidthLocked(fittedWardrobe, true),
    {
      operation: "add",
      modules: [...fittedWardrobe.modules, addedWardrobeModule],
    }
  );
  assert(
    overallLockedAutomaticAdd.ok,
    "an overall lock should allow internal automatic reconciliation when its dimension stays exact"
  );
  assert.strictEqual(
    getCabinetOverallWidth(overallLockedAutomaticAdd.definition),
    3000,
    "internal reconciliation must not move the locked overall target"
  );

  const equalLockedAutomaticAdd = reconcileCabinetModuleSizing(
    setCabinetEqualModuleSizing(fittedWardrobe, true),
    {
      operation: "add",
      modules: [...fittedWardrobe.modules, addedWardrobeModule],
    }
  );
  assert.strictEqual(
    equalLockedAutomaticAdd.ok,
    false,
    "an equal-width group lock should refuse an incompatible mixed-lock add"
  );
  assert.strictEqual(
    equalLockedAutomaticAdd.issues[0]?.code,
    "equal_widths_conflict",
    "the equal-width refusal should identify the conflicting group lock"
  );

  const impossibleAutomaticDelete = reconcileCabinetModuleSizing(fittedWardrobe, {
    operation: "delete",
    modules: fittedWardrobe.modules.filter((module) => module.id !== "wardrobe-b"),
  });
  assert.strictEqual(
    impossibleAutomaticDelete.ok,
    false,
    "automatic delete should refuse when only undersized locked coverage remains"
  );
  assert.strictEqual(
    impossibleAutomaticDelete.issues[0]?.code,
    "no_unlocked_modules",
    "an impossible delete should explain that no unlocked bay can absorb the remainder"
  );
  assert.strictEqual(
    impossibleAutomaticDelete.definition,
    fittedWardrobe,
    "a refused reconciliation should transactionally return the original definition"
  );

  const manualTransition = reconcileCabinetModuleSizing(
    automaticReorder.definition,
    { operation: "set_mode", mode: "manual" }
  );
  assert(manualTransition.ok, "automatic to manual transition should succeed for a valid layout");
  assert.deepStrictEqual(
    manualTransition.definition.modules.map((module) => module.width),
    automaticReorder.definition.modules.map((module) => module.width),
    "entering manual mode should preserve every generated width as a starting point"
  );
  assert.strictEqual(
    getCabinetParameterState(
      manualTransition.definition,
      cabinetModuleWidthParameterPath("wardrobe-b")
    ).source,
    "automatic",
    "entering manual mode should preserve the generated width provenance until it is edited"
  );

  const manualDelete = reconcileCabinetModuleSizing(manualTransition.definition, {
    operation: "delete",
    modules: manualTransition.definition.modules.filter(
      (module) => module.id !== "wardrobe-c"
    ),
  });
  assert(manualDelete.ok, "manual delete should preserve the remaining entered widths");
  assert.deepStrictEqual(
    manualDelete.definition.modules.map((module) => module.width),
    [600, 1324],
    "manual delete should not redistribute individual module widths"
  );
  assert.strictEqual(
    getCabinetOverallWidth(manualDelete.definition),
    2100,
    "manual delete should derive total width from modules and fixed fitting contributions"
  );

  let manuallyEditedWardrobe = syncCabinetDefinitionDimensions({
    ...manualTransition.definition,
    modules: manualTransition.definition.modules.map((module) =>
      module.id === "wardrobe-b" ? { ...module, width: 1124 } : module
    ),
  });
  manuallyEditedWardrobe = setCabinetParameterState(
    manuallyEditedWardrobe,
    cabinetModuleWidthParameterPath("wardrobe-b"),
    { source: "user_overridden" }
  );
  const automaticTransition = reconcileCabinetModuleSizing(
    manuallyEditedWardrobe,
    { operation: "set_mode", mode: "automatic" }
  );
  assert(automaticTransition.ok, "manual to automatic transition should restore a feasible target");
  assert.strictEqual(
    getCabinetOverallWidth(automaticTransition.definition),
    3000,
    "returning to automatic mode should redistribute within the current fitted target"
  );
  assert.strictEqual(
    automaticTransition.definition.modules.find((module) => module.id === "wardrobe-b")?.width,
    1324,
    "returning to automatic mode should replace an unlocked manual override when needed"
  );
  assert.strictEqual(
    getCabinetParameterState(
      automaticTransition.definition,
      cabinetModuleWidthParameterPath("wardrobe-b")
    ).source,
    "automatic",
    "returning to automatic mode should mark redistributed widths with automatic provenance"
  );
  assert.strictEqual(
    automaticTransition.replacedUserOverrides,
    true,
    "the transition result should disclose that manual provenance was replaced"
  );

  const lockedManualTransition = reconcileCabinetModuleSizing(
    setCabinetOverallWidthLocked(fittedWardrobe, true),
    { operation: "set_mode", mode: "manual" }
  );
  assert(lockedManualTransition.ok, "changing modes alone should preserve a locked overall width");
  const lockedManualDelete = reconcileCabinetModuleSizing(
    lockedManualTransition.definition,
    {
      operation: "delete",
      modules: lockedManualTransition.definition.modules.filter(
        (module) => module.id !== "wardrobe-c"
      ),
    }
  );
  assert.strictEqual(
    lockedManualDelete.ok,
    false,
    "manual structural edits should refuse to derive a different locked overall width"
  );
  assert.strictEqual(
    lockedManualDelete.issues[0]?.code,
    "overall_width_locked",
    "the manual refusal should identify the locked overall dependency"
  );

  const invalidAutomaticAdd = reconcileCabinetModuleSizing(fittedWardrobe, {
    operation: "add",
    modules: [
      ...fittedWardrobe.modules,
      { ...addedWardrobeModule, id: "wardrobe-invalid", height: 0 },
    ],
  });
  assert.strictEqual(
    invalidAutomaticAdd.ok,
    false,
    "reconciliation must never report success for a candidate with blocking validation errors"
  );
  assert.strictEqual(
    invalidAutomaticAdd.issues[0]?.code,
    "candidate_validation_failed",
    "invalid candidates should return a structured validation refusal"
  );
  assert(
    invalidAutomaticAdd.validationIssues.some(
      (issue) => issue.severity === "error"
    ),
    "the structured refusal should expose the blocking validation details"
  );

  const splitWallSpace = {
    id: "room-1:north",
    kind: "wall" as const,
    label: "North wall",
    roomId: "room-1",
    roomName: "Bedroom",
    wallId: "north",
    wall: "north" as const,
    availableWidthMm: 4000,
    availableHeightMm: 2600,
    installationClearanceLeftMm: 10,
    installationClearanceRightMm: 10,
    installationClearanceTopMm: 20,
    baseboardOffsetMm: 18,
    openings: [{
      id: "door-1",
      kind: "door" as const,
      offsetMm: 0,
      widthMm: 1000,
      heightMm: 2100,
    }],
  };
  const splitSegments = getCabinetAvailableSegments(splitWallSpace, 2400);
  assert.strictEqual(splitSegments.length, 2, "a centered doorway should split a wall into two fit segments");
  assert.strictEqual(splitSegments[0].widthMm, 1490, "left segment should account for installation clearance");
  assert.strictEqual(splitSegments[1].widthMm, 1490, "right segment should account for installation clearance");

  const lockedFitSource = setCabinetOverallWidthLocked(
    createCabinetPreset("base", "cabinet-test-locked-fit"),
    true
  );
  const lockedFitRefusal = fitCabinetToSpace(
    lockedFitSource,
    { ...splitWallSpace, openings: [], availableWidthMm: 960 },
    { mode: "fit_width", alignment: "center" }
  );
  assert.strictEqual(
    lockedFitRefusal.ok,
    false,
    "Fit must not bypass an overall-width lock by adding automatic fillers first"
  );
  assert.strictEqual(
    getCabinetOverallWidth(lockedFitRefusal.definition),
    getCabinetOverallWidth(lockedFitSource),
    "a refused locked fit should preserve the original overall width"
  );
  assert(
    isCabinetOverallWidthLocked(lockedFitRefusal.definition),
    "a refused fit should preserve the overall-width lock"
  );
  const lockedSameWidthFit = fitCabinetToSpace(
    lockedFitSource,
    { ...splitWallSpace, openings: [], availableWidthMm: 920 },
    { mode: "fit_width", alignment: "center" }
  );
  assert(lockedSameWidthFit.ok, "Fit may redistribute unlocked internals when the locked total width is unchanged");
  assert.strictEqual(
    getCabinetOverallWidth(lockedSameWidthFit.definition),
    getCabinetOverallWidth(lockedFitSource),
    "a same-width Fit should preserve the locked total"
  );
  assert(
    isCabinetOverallWidthLocked(lockedSameWidthFit.definition),
    "a successful same-width Fit should restore the overall-width lock"
  );

  const closetForFit = createCabinetPreset("closet_system", "cabinet-test-fit-closet");
  const fittedCloset = fitCabinetToSpace(
    closetForFit,
    { ...splitWallSpace, openings: [], availableWidthMm: 3000 },
    { mode: "fit_both", alignment: "center" }
  );
  assert(fittedCloset.ok, "a closet should fit a clear measured wall");
  assert.strictEqual(
    getCabinetOverallWidth(fittedCloset.definition),
    2980,
    "fit width should subtract left and right installation clearances"
  );
  assert.strictEqual(
    getCabinetOverallHeight(fittedCloset.definition),
    2580,
    "fit height should subtract top installation clearance"
  );
  assert.strictEqual(fittedCloset.definition.leftFillerWidth, 20, "fit should add an automatic left filler");
  assert.strictEqual(fittedCloset.definition.rightFillerWidth, 20, "fit should add an automatic right filler");
  assert.strictEqual(fittedCloset.definition.fitState?.host.wall, "north", "fit should persist its host wall");
  assert.strictEqual(
    validateCabinetDefinition(fittedCloset.definition).valid,
    true,
    "a fitted closet should remain a valid parametric definition"
  );
  let userFillerSource = createCabinetPreset(
    "closet_system",
    "cabinet-test-user-filler-provenance"
  );
  userFillerSource.leftFillerWidth = 73;
  userFillerSource = setCabinetParameterState(
    userFillerSource,
    "leftFillerWidth",
    { source: "user_overridden" }
  );
  const userFillerFit = fitCabinetToSpace(
    userFillerSource,
    { ...splitWallSpace, openings: [], availableWidthMm: 3000 },
    { mode: "fit_width", alignment: "center" }
  );
  assert(userFillerFit.ok, "a user-overridden filler should remain compatible with Fit");
  assert.strictEqual(
    userFillerFit.definition.leftFillerWidth,
    73,
    "Fit should preserve a user-overridden filler width"
  );
  assert.strictEqual(
    getCabinetParameterState(userFillerFit.definition, "leftFillerWidth").source,
    "user_overridden",
    "Fit should preserve the filler provenance alongside its value"
  );
  const overgrownFittedCloset = clone(fittedCloset.definition);
  overgrownFittedCloset.modules[0].width += 500;
  overgrownFittedCloset.totalWidth = getCabinetOverallWidth(overgrownFittedCloset);
  const overgrownFitValidation = validateCabinetDefinition(overgrownFittedCloset);
  const fitWidthIssue = overgrownFitValidation.issues.find(
    (issue) => issue.code === "fit.width.exceeded"
  );
  assert(fitWidthIssue, "validation should detect a design that outgrows its fitted wall segment");
  assert.strictEqual(
    fitWidthIssue?.target.scope,
    "fit",
    "fit validation should navigate back to the Space workflow"
  );
  assert.strictEqual(
    fitWidthIssue?.fixes?.[0]?.action.type,
    "resize_overall_width",
    "fit width overflow should offer to refit unlocked modules"
  );
  const fittedPlacement = getCabinetFitPlacement(fittedCloset.definition, 3, 4);
  assert(fittedPlacement, "a cardinal wall fit should resolve a plan placement");
  assert.strictEqual(fittedPlacement?.rotationY, 0, "north-wall millwork should face into the room");
  assert(
    (fittedPlacement?.position[2] ?? 0) < 0,
    "north-wall millwork should be positioned against the north side of the room"
  );
  const mountedWallFit = fitCabinetToSpace(
    createCabinetPreset("wall", "cabinet-test-mounted-wall-fit"),
    {
      ...splitWallSpace,
      openings: [],
      availableWidthMm: 1800,
      mountingHeightMm: 1400,
    },
    { mode: "fit_both", alignment: "center" }
  );
  assert(mountedWallFit.ok, "wall cabinetry should fit within the height above its mounting datum");
  assert.strictEqual(
    getCabinetOverallHeight(mountedWallFit.definition),
    1180,
    "mounted fit height should subtract both bottom elevation and top installation clearance"
  );
  assert.strictEqual(
    getCabinetFitPlacement(mountedWallFit.definition, 3, 4)?.position[1],
    1.4,
    "fit placement should preserve the wall-cabinet mounting elevation"
  );
  const wideBaseFit = fitCabinetToSpace(
    createCabinetPreset("base", "cabinet-test-wide-base-fit"),
    { ...splitWallSpace, openings: [], availableWidthMm: 5000 },
    { mode: "fit_width", alignment: "center" }
  );
  assert(wideBaseFit.ok, "automatic fitting should expand a simple cabinet across a wide wall");
  assert(
    wideBaseFit.definition.modules.length >= 4,
    "automatic fitting should add modules instead of creating one implausibly wide bay"
  );
  assert(
    wideBaseFit.definition.modules.every((module) => module.width <= 1200),
    "automatically added fit modules should keep bay widths professionally sensible"
  );

  const negativeWidth = clone(base);
  negativeWidth.modules[0].width = -1;
  const negativeWidthValidation = validateCabinetDefinition(negativeWidth);
  assert.strictEqual(negativeWidthValidation.valid, false, "negative module width should fail");
  const negativeWidthIssue = negativeWidthValidation.issues.find(
    (issue) => issue.code === "module.width.invalid"
  );
  assert(negativeWidthIssue?.id, "validation issues should include deterministic IDs");
  assert.strictEqual(
    negativeWidthIssue?.target.moduleIds?.[0],
    negativeWidth.modules[0].id,
    "module validation should target a stable module ID"
  );
  assert(
    negativeWidthIssue?.resolution.length,
    "validation issues should explain how to recover"
  );
  assert.strictEqual(
    negativeWidthIssue?.fixes?.[0]?.action.type,
    "patch_module",
    "invalid module width should offer a declarative auto-fix"
  );

  const noDrawers = clone(base);
  noDrawers.modules[0].drawerCount = 0;
  const noDrawersValidation = validateCabinetDefinition(noDrawers);
  assert.strictEqual(
    noDrawersValidation.valid,
    false,
    "drawer stack with zero drawers should fail"
  );
  const drawerCountIssue = noDrawersValidation.issues.find(
    (issue) => issue.code === "front.drawer.count_required"
  );
  assert.strictEqual(
    drawerCountIssue?.fixes?.[0]?.action.type,
    "patch_module",
    "missing drawer count should offer a reversible module patch"
  );
  if (drawerCountIssue?.fixes?.[0]?.action.type === "patch_module") {
    assert.strictEqual(
      drawerCountIssue.fixes[0].action.patch.drawerCount,
      3,
      "drawer recovery should propose a practical three-drawer starting layout"
    );
  }

  const heightOnlyFit = fitCabinetToSpace(
    createCabinetPreset("base", "cabinet-test-height-only-fit"),
    { ...splitWallSpace, openings: [], availableWidthMm: 500 },
    { mode: "fit_height", alignment: "center" }
  );
  assert(heightOnlyFit.ok, "height-only fit should not require the cabinet to fit the wall width");
  assert(
    !validateCabinetDefinition(heightOnlyFit.definition).issues.some(
      (issue) => issue.code === "fit.width.exceeded"
    ),
    "height-only fit should not persist a width-fit error"
  );

  const widthOnlyFit = fitCabinetToSpace(
    createCabinetPreset("base", "cabinet-test-width-only-fit"),
    { ...splitWallSpace, openings: [], availableHeightMm: 600 },
    { mode: "fit_width", alignment: "center" }
  );
  assert(widthOnlyFit.ok, "width-only fit should not require the cabinet to fit the room height");
  assert(
    !validateCabinetDefinition(widthOnlyFit.definition).issues.some(
      (issue) => issue.code === "fit.height.exceeded"
    ),
    "width-only fit should not persist a height-fit error"
  );

  const highWindowFit = fitCabinetToSpace(
    createCabinetPreset("base", "cabinet-test-high-window-fit"),
    {
      ...splitWallSpace,
      openings: [{
        id: "window-high",
        kind: "window",
        offsetMm: 0,
        widthMm: 1000,
        bottomMm: 1800,
        heightMm: 500,
      }],
    },
    { mode: "fit_both", alignment: "center" }
  );
  assert(highWindowFit.ok, "fit-both should choose a segment using the final fitted height");
  assert.strictEqual(
    Math.round(highWindowFit.segment?.widthMm ?? 0),
    1490,
    "a high window intersecting the final height should split the selected fit segment"
  );
  assert(
    !validateCabinetDefinition(highWindowFit.definition).issues.some(
      (issue) => issue.code === "fit.opening_conflict"
    ),
    "a fit-both result should not immediately conflict with the opening it considered"
  );

  const servicedFit = fitCabinetToSpace(
    createCabinetPreset("base", "cabinet-test-serviced-fit"),
    {
      ...splitWallSpace,
      openings: [{ id: "outlet-1", kind: "outlet", offsetMm: 0, widthMm: 80 }],
      availableDepthMm: 300,
      baseboardOffsetMm: 18,
    },
    { mode: "fit_width", alignment: "center" }
  );
  assert(servicedFit.ok, "service constraints should remain reviewable warnings, not block fitting");
  const servicedFitCodes = new Set(
    validateCabinetDefinition(servicedFit.definition).issues.map((issue) => issue.code)
  );
  assert(servicedFitCodes.has("fit.depth.exceeded"), "persisted validation should retain depth review");
  assert(servicedFitCodes.has("fit.outlet.review"), "persisted validation should retain outlet review");
  assert(servicedFitCodes.has("fit.baseboard.clearance"), "persisted validation should retain baseboard information");

  const manualFitSource = createCabinetPreset("cabinet_run", "cabinet-test-manual-fit");
  if (!manualFitSource.automation) throw new Error("Preset automation state is required");
  manualFitSource.automation.moduleSizingMode = "manual";
  const manualFit = fitCabinetToSpace(
    manualFitSource,
    { ...splitWallSpace, openings: [], availableWidthMm: 3200 },
    { mode: "fit_width", alignment: "center" }
  );
  assert(manualFit.ok, "an explicit fit action may resize unlocked modules in manual mode");
  assert.strictEqual(
    manualFit.definition.automation?.moduleSizingMode,
    "manual",
    "Fit to Space should preserve the user's ongoing module-sizing preference"
  );

  for (const preset of CABINET_PRESET_OPTIONS) {
    for (const availableWidthMm of [1800, 3000]) {
      for (const availableHeightMm of [2200, 2600]) {
        for (const fitMode of ["fit_width", "fit_both"] as const) {
          const fitResult = fitCabinetToSpace(
            createCabinetPreset(
              preset.id,
              `cabinet-fit-postcondition-${preset.id}-${availableWidthMm}-${availableHeightMm}-${fitMode}`
            ),
            {
              ...splitWallSpace,
              openings: [],
              availableWidthMm,
              availableHeightMm,
              baseboardOffsetMm: 0,
            },
            { mode: fitMode, alignment: "center" }
          );
          if (fitResult.ok) {
            const finalValidation = validateCabinetDefinition(fitResult.definition);
            assert(
              finalValidation.valid,
              `${preset.id} ${fitMode} ${availableWidthMm}×${availableHeightMm} must not report success with invalid dependent parameters`
            );
          } else {
            assert.strictEqual(
              fitResult.definition.id.includes("cabinet-fit-postcondition"),
              true,
              "a refused fit should preserve the original definition"
            );
          }
        }
      }
    }
  }

}

function testProfessionalFabricationSemantics(): void {
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

async function main() {
  const base = createCabinetPreset("base", "cabinet-test-base");
  const baseValidation = validateCabinetDefinition(base);
  assert.strictEqual(baseValidation.valid, true, "valid base cabinet should pass");
  testAutomationFitAndStructuredValidation();
  testProfessionalFabricationSemantics();

  const unusual = clone(base);
  unusual.boardThickness = 30;
  const unusualValidation = validateCabinetDefinition(unusual);
  assert.strictEqual(unusualValidation.valid, true, "unusual but possible board thickness should warn only");
  assert(
    unusualValidation.issues.some((issue) => issue.severity === "warning"),
    "unusual dimensions should produce a warning"
  );

  const ceilingWithToeKick = createCabinetPreset("ceiling_beams", "cabinet-test-ceiling-validation");
  ceilingWithToeKick.toeKickHeight = 60;
  const ceilingWithToeKickValidation = validateCabinetDefinition(ceilingWithToeKick);
  assert.strictEqual(
    ceilingWithToeKickValidation.valid,
    true,
    "ceiling-mounted warning-only profile issues should not block valid geometry"
  );
  assert(
    ceilingWithToeKickValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "toeKickHeight"
    ),
    "ceiling-mounted millwork should warn about toe kicks"
  );

  const weakMurphyBed = createCabinetPreset("murphy_bed", "cabinet-test-convertible-validation");
  weakMurphyBed.boardThickness = 15;
  const weakMurphyBedValidation = validateCabinetDefinition(weakMurphyBed);
  assert.strictEqual(
    weakMurphyBedValidation.valid,
    true,
    "convertible built-in reinforcement warnings should not block valid geometry"
  );
  assert(
    weakMurphyBedValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "boardThickness"
    ),
    "convertible built-ins should warn about thin board thickness for operable hardware"
  );

  const impossible = clone(base);
  impossible.boardThickness = 500;
  assert.strictEqual(validateCabinetDefinition(impossible).valid, false, "impossible internal width should fail");

  const negativeFiller = clone(base);
  negativeFiller.leftFillerWidth = -10;
  assert.strictEqual(validateCabinetDefinition(negativeFiller).valid, false, "negative filler width should fail");

  const negativeFillerScribe = clone(base);
  negativeFillerScribe.leftFillerWidth = 50;
  negativeFillerScribe.leftFillerScribeAllowance = -10;
  assert.strictEqual(
    validateCabinetDefinition(negativeFillerScribe).valid,
    false,
    "negative filler scribe allowance should fail"
  );

  const negativeDivider = clone(base);
  negativeDivider.modules[0].verticalDividerCount = -1;
  assert.strictEqual(validateCabinetDefinition(negativeDivider).valid, false, "negative vertical divider count should fail");

  const negativeRod = clone(base);
  negativeRod.modules[0].hangingRodCount = -1;
  assert.strictEqual(validateCabinetDefinition(negativeRod).valid, false, "negative hanging rod count should fail");

  const negativeSlat = clone(base);
  negativeSlat.modules[0].slatCount = -1;
  assert.strictEqual(validateCabinetDefinition(negativeSlat).valid, false, "negative slat count should fail");

  const negativePanelColumn = clone(base);
  negativePanelColumn.modules[0].panelColumnCount = -1;
  assert.strictEqual(validateCabinetDefinition(negativePanelColumn).valid, false, "negative panel column count should fail");

  const negativeCeilingBeam = clone(base);
  negativeCeilingBeam.modules[0].ceilingBeamCount = -1;
  assert.strictEqual(validateCabinetDefinition(negativeCeilingBeam).valid, false, "negative ceiling beam count should fail");

  const parts = generateCabinetParts(base);
  for (const required of ["left_side_panel", "right_side_panel", "bottom_panel", "top_panel", "back_panel", "toe_kick"]) {
    assert(parts.some((part) => part.type === required), `base cabinet should include ${required}`);
  }
  const baseToeKickPart = parts.find((part) => part.type === "toe_kick");
  assert.strictEqual(baseToeKickPart?.position.z, 40, "default toe kick should preserve legacy 40 mm front setback");
  assert.deepStrictEqual(
    baseToeKickPart?.size,
    { width: 900, height: 100, depth: 460 },
    "default toe kick should preserve legacy generated dimensions"
  );
  assert.strictEqual(baseToeKickPart?.metadata?.setback, 40, "toe kick metadata should expose default setback");
  assert.strictEqual(baseToeKickPart?.metadata?.depth, 460, "toe kick metadata should expose default depth");
  assert.strictEqual(parts.filter((part) => part.type === "shelf").length, 1, "shelf count should be honored");
  assert.strictEqual(parts.filter((part) => part.type === "drawer_front").length, 3, "drawer count should be honored");
  const baseDrawerBoxBottoms = parts.filter((part) => part.type === "drawer_box_bottom");
  const baseDrawerBoxSides = parts.filter((part) => part.type === "drawer_box_side");
  const baseDrawerBoxBacks = parts.filter((part) => part.type === "drawer_box_back");
  assert.strictEqual(baseDrawerBoxBottoms.length, 3, "base drawer stack should generate one drawer box bottom per drawer");
  assert.strictEqual(baseDrawerBoxSides.length, 6, "base drawer stack should generate two drawer box sides per drawer");
  assert.strictEqual(baseDrawerBoxBacks.length, 3, "base drawer stack should generate one drawer box back per drawer");
  assert.deepStrictEqual(
    baseDrawerBoxBottoms.map((part) => part.id),
    [
      "module-1:drawer_box_bottom:drawer-1",
      "module-1:drawer_box_bottom:drawer-2",
      "module-1:drawer_box_bottom:drawer-3",
    ],
    "drawer box bottom IDs should be stable"
  );
  assert.deepStrictEqual(
    {
      width: round1(baseDrawerBoxBottoms[0]?.size.width ?? 0),
      height: round1(baseDrawerBoxBottoms[0]?.size.height ?? 0),
      depth: round1(baseDrawerBoxBottoms[0]?.size.depth ?? 0),
    },
    { width: 832, height: 6, depth: 480 },
    "drawer box bottom dimensions should follow slide clearance, bottom thickness, and back clearance"
  );
  assert.deepStrictEqual(
    {
      x: round1(baseDrawerBoxBottoms[0]?.position.x ?? 0),
      y: round1(baseDrawerBoxBottoms[0]?.position.y ?? 0),
      z: round1(baseDrawerBoxBottoms[0]?.position.z ?? 0),
    },
    { x: 34, y: 143.5, z: 18 },
    "first drawer box should sit behind the lower drawer front with slide side clearance"
  );
  assert.deepStrictEqual(
    {
      width: round1(baseDrawerBoxSides[0]?.size.width ?? 0),
      height: round1(baseDrawerBoxSides[0]?.size.height ?? 0),
      depth: round1(baseDrawerBoxSides[0]?.size.depth ?? 0),
    },
    { width: 12, height: 139.7, depth: 480 },
    "drawer box side dimensions should follow side thickness, usable height, and box depth"
  );
  const baseDrawerSlides = parts.filter((part) => part.type === "drawer_slide_pair");
  assert.strictEqual(baseDrawerSlides.length, 3, "base drawer stack should generate one slide pair per drawer");
  assert.deepStrictEqual(
    baseDrawerSlides.map((part) => part.id),
    [
      "module-1:drawer_slide_pair:drawer-1",
      "module-1:drawer_slide_pair:drawer-2",
      "module-1:drawer_slide_pair:drawer-3",
    ],
    "drawer slide pair IDs should be stable"
  );
  assert.deepStrictEqual(
    baseDrawerSlides[0]?.size,
    { width: 858, height: 24, depth: 500 },
    "drawer slide pair marker dimensions should follow source settings"
  );
  assert.deepStrictEqual(
    baseDrawerSlides[0]?.position,
    { x: 21, y: 166, z: -18 },
    "first drawer slide pair should sit behind the lower drawer front"
  );
  assert.strictEqual(baseDrawerSlides[0]?.skuId, "CAB-HW-DRAWER-SLIDE-PAIR", "drawer slides should carry a hardware SKU");
  assert(parts.every((part) => part.size.width > 0 && part.size.height > 0 && part.size.depth > 0), "all parts should have positive sizes");
  assert.deepStrictEqual(
    generateCabinetParts(base).map((part) => part.id),
    parts.map((part) => part.id),
    "part IDs should be stable"
  );
  const baseBOM = generateCabinetBOM(base);
  assert(
    baseBOM.some((item) => item.type === "drawer_box_side" && item.quantity === 6),
    "BOM should group matching drawer box sides"
  );
  assert(
    baseBOM.some((item) => item.type === "drawer_box_bottom" && item.quantity === 3),
    "BOM should group matching drawer box bottoms"
  );
  assert(
    baseBOM.some((item) => item.type === "drawer_slide_pair" && item.quantity === 3),
    "BOM should group soft-close drawer slide pairs"
  );
  const baseDocumentation = generateCabinetDocumentation(base);
  assert(
    baseDocumentation.cutList.every((item) => item.type !== "drawer_slide_pair"),
    "board cut list should exclude drawer slide hardware"
  );
  assert(
    baseDocumentation.cutList.some((item) => item.type === "drawer_box_side"),
    "board cut list should include drawer box side parts"
  );
  assert(
    baseDocumentation.cutList.some((item) => item.type === "drawer_box_bottom"),
    "board cut list should include drawer box bottom parts"
  );
  assert(
    baseDocumentation.cutList.some((item) => item.type === "toe_kick" && item.notes?.includes("40 mm front setback")),
    "cut list should describe default toe kick setback"
  );
  assert(
    baseDocumentation.hardwareSchedule.some(
      (item) =>
        item.hardwareId === "soft_close_drawer_slide_pair" &&
        item.hardwareType === "drawer_slide_pair" &&
        item.quantity === 3
    ),
    "hardware schedule should include soft-close drawer slide pairs"
  );
  assert(
    baseDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("drawer boxes 12 mm sides, 6 mm bottoms, 45 mm height clearance, 20 mm back clearance")
    ),
    "dimension schedule should describe drawer box settings"
  );
  assert(
    baseDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("drawer slides 500d with 13 side clearance")
    ),
    "dimension schedule should describe drawer slide settings"
  );
  assert(
    baseDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("toe kick 100h x 460d with 40 front setback")
    ),
    "dimension schedule should describe default toe kick setout"
  );
  assert(
    baseDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("drawer boxes 3 boxes with 12 mm sides and 6 mm bottoms")
    ),
    "drawing view schedule should describe drawer box settings"
  );
  assert(
    baseDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("soft-close drawer slides 500 mm deep with 13 mm side clearance")
    ),
    "drawing view schedule should describe drawer slide settings"
  );
  assert(
    baseDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("Toe kick 100 mm high x 460 mm deep with 40 mm front setback")
    ),
    "drawing view schedule should describe default toe kick setout"
  );
  assert(
    baseDocumentation.installerNotes.some((item) => item.id === "note:toe-kick-setout"),
    "installer notes should include toe kick setout"
  );
  assert(
    baseDocumentation.installerNotes.some((item) => item.id === "note:drawer-box-construction"),
    "installer notes should include drawer box construction coordination"
  );
  assert(
    baseDocumentation.installerNotes.some((item) => item.id === "note:drawer-slide-hardware"),
    "installer notes should include drawer slide coordination"
  );
  assert(
    !buildCabinetFabricationDxf(base).includes("drawer_slide_pair"),
    "fabrication DXF should keep drawer slide hardware out of board layouts"
  );
  assert(
    buildCabinetFabricationDxf(base).includes("drawer_box_bottom"),
    "fabrication DXF should include generated drawer box board layouts"
  );
  const baseSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(base));
  assert.strictEqual(
    baseSourceRoundTrip.modules[0].drawerBoxEnabled,
    true,
    "source definition should preserve drawer box enablement"
  );
  assert.strictEqual(
    baseSourceRoundTrip.modules[0].drawerBoxSideThickness,
    12,
    "source definition should preserve drawer box side thickness"
  );
  assert.strictEqual(
    baseSourceRoundTrip.modules[0].drawerSlideHardwareEnabled,
    true,
    "source definition should preserve drawer slide enablement"
  );
  assert.strictEqual(
    baseSourceRoundTrip.modules[0].drawerSlideLength,
    500,
    "source definition should preserve drawer slide length"
  );

  const customToeKickCabinet = clone(base);
  customToeKickCabinet.toeKickSetback = 75;
  customToeKickCabinet.toeKickDepth = 360;
  const customToeKickValidation = validateCabinetDefinition(customToeKickCabinet);
  assert.strictEqual(customToeKickValidation.valid, true, "custom toe kick setback and depth should validate");
  const customToeKickParts = generateCabinetParts(customToeKickCabinet);
  const customToeKickPart = customToeKickParts.find((part) => part.type === "toe_kick");
  assert.strictEqual(customToeKickPart?.position.z, 75, "custom toe kick should use configured front setback");
  assert.deepStrictEqual(
    customToeKickPart?.size,
    { width: 900, height: 100, depth: 360 },
    "custom toe kick should use configured cut depth"
  );
  assert.strictEqual(customToeKickPart?.metadata?.setback, 75, "custom toe kick metadata should keep setback");
  assert.strictEqual(customToeKickPart?.metadata?.depth, 360, "custom toe kick metadata should keep depth");
  assert(
    generateCabinetBOM(customToeKickCabinet).some(
      (item) => item.type === "toe_kick" && item.depth === 360 && item.notes?.includes("setback")
    ),
    "BOM should describe custom toe kick setout"
  );
  const customToeKickDocumentation = generateCabinetDocumentation(customToeKickCabinet);
  assert(
    customToeKickDocumentation.cutList.some((item) =>
      item.type === "toe_kick" &&
      item.depth === 360 &&
      item.notes?.includes("75 mm front setback") &&
      item.edgeBandingMm === 900
    ),
    "cut list should describe custom toe kick setback, depth, and visible edge"
  );
  assert(
    customToeKickDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("toe kick 100h x 360d with 75 front setback")
    ),
    "dimension schedule should describe custom toe kick setout"
  );
  assert(
    customToeKickDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("Toe kick 100 mm high x 360 mm deep with 75 mm front setback")
    ),
    "drawing view schedule should describe custom toe kick setout"
  );
  assert(
    customToeKickDocumentation.installerNotes.some((item) =>
      item.id === "note:toe-kick-setout" && item.message.includes("front setback 75 mm")
    ),
    "installer notes should describe custom toe kick setout"
  );
  assert(
    buildCabinetShopDrawingSvg(customToeKickCabinet).includes("setback 75 mm / depth 360 mm"),
    "shop drawing side section should label custom toe kick setback and depth"
  );
  const customToeKickSourceRoundTrip = parseCabinetSourceDefinitionJson(
    buildCabinetSourceDefinitionJson(customToeKickCabinet)
  );
  assert.strictEqual(customToeKickSourceRoundTrip.toeKickSetback, 75, "source definition should preserve toe kick setback");
  assert.strictEqual(customToeKickSourceRoundTrip.toeKickDepth, 360, "source definition should preserve toe kick depth");

  const shallowToeKickCabinet = clone(customToeKickCabinet);
  shallowToeKickCabinet.toeKickDepth = 25;
  const shallowToeKickValidation = validateCabinetDefinition(shallowToeKickCabinet);
  assert.strictEqual(shallowToeKickValidation.valid, true, "shallow toe kick depth should warn without blocking export");
  assert(
    shallowToeKickValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "toeKickDepth"
    ),
    "shallow toe kick depth should produce a plinth fastening warning"
  );

  const impossibleToeKickCabinet = clone(customToeKickCabinet);
  impossibleToeKickCabinet.toeKickDepth = 520;
  assert.strictEqual(
    validateCabinetDefinition(impossibleToeKickCabinet).valid,
    false,
    "toe kick setback plus depth beyond module depth should fail"
  );

  const levelingFootCabinet = clone(base);
  levelingFootCabinet.levelingFeetEnabled = true;
  levelingFootCabinet.levelingFootCount = 4;
  levelingFootCabinet.levelingFootHeight = 90;
  levelingFootCabinet.levelingFootDiameter = 35;
  levelingFootCabinet.levelingFootInsetFromSides = 80;
  levelingFootCabinet.levelingFootInsetFromFrontBack = 70;
  const levelingFootValidation = validateCabinetDefinition(levelingFootCabinet);
  assert.strictEqual(levelingFootValidation.valid, true, "leveling foot settings should validate for base cabinets");
  const levelingFootParts = generateCabinetParts(levelingFootCabinet).filter((part) => part.type === "leveling_foot");
  assert.strictEqual(levelingFootParts.length, 4, "leveling feet should generate per eligible floor module");
  assert.deepStrictEqual(
    levelingFootParts.map((part) => part.id),
    [
      "module-1:leveling_foot:1",
      "module-1:leveling_foot:2",
      "module-1:leveling_foot:3",
      "module-1:leveling_foot:4",
    ],
    "leveling foot IDs should be stable"
  );
  assert.deepStrictEqual(
    levelingFootParts[0]?.size,
    { width: 35, height: 90, depth: 35 },
    "leveling foot markers should use configured size"
  );
  assert.deepStrictEqual(
    levelingFootParts[0]?.position,
    { x: 62.5, y: 0, z: 52.5 },
    "front leveling foot should use configured side and front/back insets"
  );
  assert.deepStrictEqual(
    levelingFootParts[3]?.position,
    { x: 802.5, y: 0, z: 492.5 },
    "rear leveling foot should use configured rear inset"
  );
  assert.strictEqual(levelingFootParts[0]?.metadata?.footHeight, 90, "leveling foot metadata should preserve height");
  assert.strictEqual(levelingFootParts[0]?.metadata?.footDiameter, 35, "leveling foot metadata should preserve diameter");
  assert(
    generateCabinetBOM(levelingFootCabinet).some(
      (item) => item.type === "leveling_foot" && item.quantity === 4 && item.skuId === "CAB-HW-LEVELING-FOOT"
    ),
    "BOM should group leveling feet as hardware markers"
  );
  const levelingFootDocumentation = generateCabinetDocumentation(levelingFootCabinet);
  assert(
    !levelingFootDocumentation.cutList.some((item) => item.type === "leveling_foot"),
    "leveling feet should stay out of board cut lists"
  );
  assert(
    levelingFootDocumentation.hardwareSchedule.some(
      (item) => item.hardwareType === "leveling_foot" && item.quantity === 4
    ),
    "hardware schedule should include leveling feet"
  );
  assert(
    levelingFootDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("4 leveling feet 90h x 35 dia")
    ),
    "dimension schedule should describe leveling foot count and size"
  );
  assert(
    levelingFootDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("Leveling feet 4 per eligible floor module")
    ),
    "drawing view schedule should describe leveling foot setout"
  );
  assert(
    levelingFootDocumentation.installerNotes.some(
      (item) => item.id === "note:leveling-foot-setout" && item.message.includes("height 90 mm")
    ),
    "installer notes should describe leveling foot setout"
  );
  const levelingFootSvg = buildCabinetShopDrawingSvg(levelingFootCabinet);
  assert(
    levelingFootSvg.includes('data-leveling-foot-height="90"') &&
      levelingFootSvg.includes('data-leveling-foot-diameter="35"'),
    "shop drawing SVG should expose leveling foot markers"
  );
  const levelingFootSourceRoundTrip = parseCabinetSourceDefinitionJson(
    buildCabinetSourceDefinitionJson(levelingFootCabinet)
  );
  assert.strictEqual(levelingFootSourceRoundTrip.levelingFeetEnabled, true, "source definition should preserve leveling foot flag");
  assert.strictEqual(levelingFootSourceRoundTrip.levelingFootCount, 4, "source definition should preserve leveling foot count");
  assert.strictEqual(levelingFootSourceRoundTrip.levelingFootHeight, 90, "source definition should preserve leveling foot height");
  assert.strictEqual(levelingFootSourceRoundTrip.levelingFootDiameter, 35, "source definition should preserve leveling foot diameter");

  const wallWithLevelingFeet = createCabinetPreset("wall", "cabinet-test-wall-leveling-feet");
  wallWithLevelingFeet.levelingFeetEnabled = true;
  assert.strictEqual(
    validateCabinetDefinition(wallWithLevelingFeet).valid,
    false,
    "wall-only assemblies with leveling feet should fail"
  );

  const unsupportedLevelingFootCabinet = clone(levelingFootCabinet);
  unsupportedLevelingFootCabinet.levelingFootCount = 2;
  const unsupportedLevelingFootValidation = validateCabinetDefinition(unsupportedLevelingFootCabinet);
  assert.strictEqual(unsupportedLevelingFootValidation.valid, true, "low leveling foot counts should warn without blocking export");
  assert(
    unsupportedLevelingFootValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "levelingFootCount"
    ),
    "low leveling foot counts should produce a support warning"
  );

  const impossibleLevelingFootCabinet = clone(levelingFootCabinet);
  impossibleLevelingFootCabinet.levelingFootInsetFromFrontBack = 300;
  assert.strictEqual(
    validateCabinetDefinition(impossibleLevelingFootCabinet).valid,
    false,
    "leveling foot insets that exceed module depth should fail"
  );

  const faceFrameCabinet = clone(base);
  faceFrameCabinet.faceFrameEnabled = true;
  faceFrameCabinet.faceFrameStileWidth = 42;
  faceFrameCabinet.faceFrameRailHeight = 50;
  faceFrameCabinet.faceFrameDepth = 20;
  faceFrameCabinet.faceFrameMaterialId = "walnut_veneer";
  const faceFrameValidation = validateCabinetDefinition(faceFrameCabinet);
  assert.strictEqual(faceFrameValidation.valid, true, "face frame settings should validate for cabinet modules");
  const faceFrameParts = generateCabinetParts(faceFrameCabinet).filter(
    (part) => part.type === "face_frame_stile" || part.type === "face_frame_rail"
  );
  assert.strictEqual(faceFrameParts.length, 4, "face frame should generate two stiles and two rails");
  assert.deepStrictEqual(
    faceFrameParts.map((part) => part.id),
    [
      "module-1:face_frame_stile:left-stile",
      "module-1:face_frame_stile:right-stile",
      "module-1:face_frame_rail:bottom-rail",
      "module-1:face_frame_rail:top-rail",
    ],
    "face frame part IDs should be stable"
  );
  assert.deepStrictEqual(
    faceFrameParts[0]?.size,
    { width: 42, height: 620, depth: 20 },
    "face frame stiles should use configured width, frame height, and depth"
  );
  assert.deepStrictEqual(
    faceFrameParts[0]?.position,
    { x: 0, y: 100, z: -20 },
    "face frame stiles should sit at the front above the toe-kick zone"
  );
  assert.deepStrictEqual(
    faceFrameParts[3]?.position,
    { x: 0, y: 670, z: -20 },
    "top face-frame rail should sit at the top of the module"
  );
  assert.strictEqual(faceFrameParts[0]?.materialId, "walnut_veneer", "face frame should use explicit source material");
  assert(
    generateCabinetBOM(faceFrameCabinet).some(
      (item) => item.type === "face_frame_stile" && item.quantity === 2 && item.materialId === "walnut_veneer"
    ),
    "BOM should group face frame stiles"
  );
  const faceFrameDocumentation = generateCabinetDocumentation(faceFrameCabinet);
  assert.strictEqual(
    faceFrameDocumentation.cutList.filter((item) => item.type === "face_frame_stile").length,
    2,
    "cut list should include face-frame stiles"
  );
  assert.strictEqual(
    faceFrameDocumentation.cutList.filter((item) => item.type === "face_frame_rail").length,
    2,
    "cut list should include face-frame rails"
  );
  assert(
    faceFrameDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":face_frame_stile:") || partId.includes(":face_frame_rail:"))
    ),
    "edge-banding schedule should include face-frame parts"
  );
  assert(
    faceFrameDocumentation.materialSchedule.some((item) => item.materialId === "walnut_veneer"),
    "material schedule should include face-frame material"
  );
  assert(
    faceFrameDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("face frame 42w stiles x 50h rails x 20d")
    ),
    "dimension schedule should describe face-frame construction"
  );
  assert(
    faceFrameDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("Face frame 42 mm stiles x 50 mm rails x 20 mm deep")
    ),
    "drawing view schedule should describe face-frame construction"
  );
  assert(
    faceFrameDocumentation.installerNotes.some(
      (item) => item.id === "note:face-frame-construction" && item.message.includes("42 mm stiles")
    ),
    "installer notes should include face-frame coordination"
  );
  const faceFrameSvg = buildCabinetShopDrawingSvg(faceFrameCabinet);
  assert(
    faceFrameSvg.includes('data-face-frame-stile-width="42"') &&
      faceFrameSvg.includes('data-face-frame-depth="20"'),
    "shop drawing SVG should expose face-frame markers"
  );
  assert(
    buildCabinetFabricationDxf(faceFrameCabinet).includes("face_frame_stile"),
    "fabrication DXF should include face-frame board parts"
  );
  const faceFrameSourceRoundTrip = parseCabinetSourceDefinitionJson(
    buildCabinetSourceDefinitionJson(faceFrameCabinet)
  );
  assert.strictEqual(faceFrameSourceRoundTrip.faceFrameEnabled, true, "source definition should preserve face-frame flag");
  assert.strictEqual(faceFrameSourceRoundTrip.faceFrameStileWidth, 42, "source definition should preserve face-frame stile width");
  assert.strictEqual(faceFrameSourceRoundTrip.faceFrameRailHeight, 50, "source definition should preserve face-frame rail height");
  assert.strictEqual(faceFrameSourceRoundTrip.faceFrameDepth, 20, "source definition should preserve face-frame depth");
  assert.strictEqual(faceFrameSourceRoundTrip.faceFrameMaterialId, "walnut_veneer", "source definition should preserve face-frame material");

  const impossibleFaceFrame = clone(faceFrameCabinet);
  impossibleFaceFrame.faceFrameStileWidth = 500;
  assert.strictEqual(
    validateCabinetDefinition(impossibleFaceFrame).valid,
    false,
    "face-frame stiles that consume the module opening should fail"
  );

  const thinFaceFrame = clone(faceFrameCabinet);
  thinFaceFrame.faceFrameRailHeight = 20;
  const thinFaceFrameValidation = validateCabinetDefinition(thinFaceFrame);
  assert.strictEqual(thinFaceFrameValidation.valid, true, "thin face-frame rails should warn without blocking export");
  assert(
    thinFaceFrameValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "faceFrameRailHeight"
    ),
    "thin face-frame rails should produce a joinery warning"
  );

  const thinDrawerBoxes = clone(base);
  thinDrawerBoxes.modules[0].drawerBoxSideThickness = 8;
  const thinDrawerBoxesValidation = validateCabinetDefinition(thinDrawerBoxes);
  assert.strictEqual(thinDrawerBoxesValidation.valid, true, "thin drawer box sides should warn without blocking export");
  assert(
    thinDrawerBoxesValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.drawerBoxSideThickness"
    ),
    "thin drawer box sides should produce a joinery warning"
  );
  const impossibleDrawerBoxes = clone(base);
  impossibleDrawerBoxes.modules[0].drawerBoxHeightClearance = 170;
  assert.strictEqual(
    validateCabinetDefinition(impossibleDrawerBoxes).valid,
    false,
    "drawer boxes with too little usable height should fail"
  );
  const shortDrawerSlides = clone(base);
  shortDrawerSlides.modules[0].drawerSlideLength = 320;
  const shortDrawerSlidesValidation = validateCabinetDefinition(shortDrawerSlides);
  assert.strictEqual(shortDrawerSlidesValidation.valid, true, "short drawer slides should warn without blocking export");
  assert(
    shortDrawerSlidesValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.drawerSlideLength"
    ),
    "short drawer slides should produce a storage-depth warning"
  );
  const tightDrawerSlideClearance = clone(base);
  tightDrawerSlideClearance.modules[0].drawerSlideClearance = 8;
  const tightDrawerSlideClearanceValidation = validateCabinetDefinition(tightDrawerSlideClearance);
  assert.strictEqual(tightDrawerSlideClearanceValidation.valid, true, "tight drawer slide clearances should warn without blocking export");
  assert(
    tightDrawerSlideClearanceValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.drawerSlideClearance"
    ),
    "tight drawer slide clearances should produce an installation tolerance warning"
  );
  const impossibleDrawerSlides = clone(base);
  impossibleDrawerSlides.modules[0].drawerSlideLength = 700;
  assert.strictEqual(
    validateCabinetDefinition(impossibleDrawerSlides).valid,
    false,
    "drawer slide lengths deeper than the cabinet interior should fail"
  );
  const noDrawerSlides = clone(base);
  noDrawerSlides.modules[0].frontType = "open";
  noDrawerSlides.modules[0].drawerCount = 0;
  assert.strictEqual(
    validateCabinetDefinition(noDrawerSlides).valid,
    false,
    "enabled drawer slide hardware without drawer fronts should fail"
  );

  const dividedCabinet = clone(base);
  dividedCabinet.modules[0].frontType = "open";
  dividedCabinet.modules[0].doorCount = 0;
  dividedCabinet.modules[0].drawerCount = 0;
  dividedCabinet.modules[0].drawerBoxEnabled = false;
  dividedCabinet.modules[0].drawerSlideHardwareEnabled = false;
  dividedCabinet.modules[0].hardwareId = "none";
  dividedCabinet.modules[0].verticalDividerCount = 2;
  const dividedValidation = validateCabinetDefinition(dividedCabinet);
  assert.strictEqual(dividedValidation.valid, true, "vertical dividers should preserve valid geometry");
  const dividedParts = generateCabinetParts(dividedCabinet);
  const dividerParts = dividedParts.filter((part) => part.type === "vertical_divider");
  assert.strictEqual(dividerParts.length, 2, "divider count should generate vertical divider parts");
  assert.deepStrictEqual(
    dividerParts.map((part) => part.id),
    ["module-1:vertical_divider:1", "module-1:vertical_divider:2"],
    "vertical divider part IDs should be stable"
  );
  assert.strictEqual(dividerParts[0]?.position.x, 297, "first divider should split the module into equal bays");
  assert.strictEqual(dividerParts[1]?.position.x, 585, "second divider should split the module into equal bays");
  assert(
    generateCabinetBOM(dividedCabinet).some((item) => item.type === "vertical_divider" && item.quantity === 2),
    "BOM should group matching vertical dividers"
  );
  const dividedDocumentation = generateCabinetDocumentation(dividedCabinet);
  assert(
    dividedDocumentation.cutList.some((item) => item.type === "vertical_divider"),
    "cut list should include vertical divider parts"
  );
  assert(
    dividedDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":vertical_divider:"))
    ),
    "edge-banding schedule should include vertical divider front edges"
  );
  assert(
    dividedDocumentation.dimensionSchedule.some((item) => item.notes?.includes("2 dividers")),
    "dimension schedule should describe divider count"
  );
  const dividedSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(dividedCabinet));
  assert.strictEqual(
    dividedSourceRoundTrip.modules[0].verticalDividerCount,
    2,
    "source definition should preserve vertical divider count"
  );
  const crampedDividerCabinet = clone(base);
  crampedDividerCabinet.modules[0].width = 600;
  crampedDividerCabinet.modules[0].verticalDividerCount = 3;
  crampedDividerCabinet.modules[0].drawerSlideHardwareEnabled = false;
  crampedDividerCabinet.totalWidth = crampedDividerCabinet.modules[0].width;
  const crampedDividerValidation = validateCabinetDefinition(crampedDividerCabinet);
  assert.strictEqual(crampedDividerValidation.valid, true, "cramped divider bays should warn without blocking export");
  assert(
    crampedDividerValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.verticalDividerCount"
    ),
    "cramped divider bays should produce a divider warning"
  );

  const tallWithAnchors = createCabinetPreset("tall", "cabinet-test-tall-anti-tip");
  const tallParts = generateCabinetParts(tallWithAnchors);
  const antiTipAnchors = tallParts.filter((part) => part.type === "anti_tip_anchor_bracket");
  assert.strictEqual(antiTipAnchors.length, 2, "tall preset should generate anti-tip anchor brackets");
  assert.deepStrictEqual(
    antiTipAnchors.map((part) => part.id),
    ["module-1:anti_tip_anchor_bracket:1", "module-1:anti_tip_anchor_bracket:2"],
    "anti-tip anchor bracket IDs should be stable"
  );
  assert.deepStrictEqual(
    antiTipAnchors[0]?.size,
    { width: 48, height: 64, depth: 12 },
    "anti-tip anchor marker dimensions should follow hardware defaults"
  );
  assert.deepStrictEqual(
    antiTipAnchors[0]?.position,
    { x: 66, y: 1988, z: 568 },
    "first anti-tip anchor should sit at the rear high mounting point"
  );
  assert.strictEqual(
    antiTipAnchors[0]?.materialId,
    "hardware_metal",
    "anti-tip anchors should use the hardware material"
  );
  assert.strictEqual(
    antiTipAnchors[0]?.skuId,
    "CAB-HW-ANTI-TIP-BRACKET",
    "anti-tip anchors should carry a hardware SKU"
  );
  assert.strictEqual(
    antiTipAnchors[0]?.metadata?.requiresFieldVerification,
    true,
    "anti-tip anchors should flag field verification"
  );
  assert(
    generateCabinetBOM(tallWithAnchors).some((item) => item.type === "anti_tip_anchor_bracket" && item.quantity === 2),
    "BOM should group anti-tip anchor brackets"
  );
  const tallDocumentation = generateCabinetDocumentation(tallWithAnchors);
  assert(
    tallDocumentation.cutList.every((item) => item.type !== "anti_tip_anchor_bracket"),
    "board cut list should exclude anti-tip anchor hardware"
  );
  assert(
    tallDocumentation.hardwareSchedule.some(
      (item) =>
        item.hardwareId === "anti_tip_anchor_bracket" &&
        item.hardwareType === "anti_tip_anchor_bracket" &&
        item.quantity === 2
    ),
    "hardware schedule should include anti-tip anchor brackets"
  );
  assert(
    tallDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("anti-tip anchors 2 at 2020h with 90 side inset")
    ),
    "dimension schedule should describe anti-tip anchor setout"
  );
  assert(
    tallDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("anti-tip anchor brackets 2 at 2020 mm high with 90 mm side inset")
    ),
    "drawing view schedule should describe anti-tip anchor setout"
  );
  assert(
    tallDocumentation.installerNotes.some((item) => item.id === "note:anti-tip-anchor-brackets"),
    "installer notes should include anti-tip anchor field verification"
  );
  assert(
    !buildCabinetFabricationDxf(tallWithAnchors).includes("anti_tip_anchor_bracket"),
    "fabrication DXF should keep anti-tip anchor hardware out of board layouts"
  );
  const tallSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(tallWithAnchors));
  assert.strictEqual(
    tallSourceRoundTrip.modules[0].antiTipAnchorEnabled,
    true,
    "source definition should preserve anti-tip anchor enablement"
  );
  assert.strictEqual(
    tallSourceRoundTrip.modules[0].antiTipAnchorCount,
    2,
    "source definition should preserve anti-tip anchor count"
  );
  assert.strictEqual(
    tallSourceRoundTrip.modules[0].antiTipAnchorHeight,
    2020,
    "source definition should preserve anti-tip anchor height"
  );
  assert.strictEqual(
    tallSourceRoundTrip.modules[0].antiTipAnchorInsetFromSides,
    90,
    "source definition should preserve anti-tip anchor side inset"
  );
  const singleWardrobeAnchor = createCabinetPreset("wardrobe", "cabinet-test-wardrobe-single-anchor");
  singleWardrobeAnchor.modules[0].antiTipAnchorCount = 1;
  const singleWardrobeAnchorValidation = validateCabinetDefinition(singleWardrobeAnchor);
  assert.strictEqual(singleWardrobeAnchorValidation.valid, true, "single wardrobe anchor should warn without blocking export");
  assert(
    singleWardrobeAnchorValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.antiTipAnchorCount"
    ),
    "single wardrobe anchor should produce a wide-module warning"
  );
  const lowTallAnchor = clone(tallWithAnchors);
  lowTallAnchor.modules[0].antiTipAnchorHeight = 1400;
  const lowTallAnchorValidation = validateCabinetDefinition(lowTallAnchor);
  assert.strictEqual(lowTallAnchorValidation.valid, true, "low anti-tip anchors should warn without blocking export");
  assert(
    lowTallAnchorValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.antiTipAnchorHeight"
    ),
    "low anti-tip anchors should produce a leverage warning"
  );
  const impossibleTallAnchorInset = clone(tallWithAnchors);
  impossibleTallAnchorInset.modules[0].antiTipAnchorInsetFromSides = 290;
  assert.strictEqual(
    validateCabinetDefinition(impossibleTallAnchorInset).valid,
    false,
    "anti-tip anchor side insets that collide should fail"
  );
  const impossibleTallAnchorHeight = clone(tallWithAnchors);
  impossibleTallAnchorHeight.modules[0].antiTipAnchorHeight = 2190;
  assert.strictEqual(
    validateCabinetDefinition(impossibleTallAnchorHeight).valid,
    false,
    "anti-tip anchor heights outside the module should fail"
  );

  const wardrobeWithRod = createCabinetPreset("wardrobe", "cabinet-test-wardrobe-rods");
  const wardrobeParts = generateCabinetParts(wardrobeWithRod);
  const hangingRod = wardrobeParts.find((part) => part.type === "hanging_rod");
  const hamperBaskets = wardrobeParts.filter((part) => part.type === "hamper_pullout_basket");
  const hamperSlidePairs = wardrobeParts.filter((part) => part.type === "hamper_pullout_slide_pair");
  assert(hangingRod, "wardrobe preset should generate a hanging rod");
  assert.strictEqual(hangingRod?.materialId, "hardware_metal", "hanging rods should use hardware metal material");
  assert.strictEqual(hangingRod?.skuId, "CAB-HW-CLOSET-ROD", "hanging rods should carry a hardware SKU");
  assert.strictEqual(hangingRod?.metadata?.rodCenterHeight, 1700, "hanging rod metadata should preserve rod height");
  assert.strictEqual(hangingRod?.size.width, 1104, "hanging rods should span the wardrobe interior");
  assert.strictEqual(hamperBaskets.length, 2, "wardrobe preset should generate pull-out hamper baskets");
  assert.strictEqual(hamperSlidePairs.length, 2, "wardrobe preset should generate pull-out hamper slide pairs");
  assert.deepStrictEqual(
    hamperBaskets.map((part) => part.id),
    ["module-1:hamper_pullout_basket:1", "module-1:hamper_pullout_basket:2"],
    "hamper basket IDs should be stable"
  );
  assert.deepStrictEqual(
    hamperBaskets[0]?.size,
    { width: 542.5, height: 360, depth: 520 },
    "hamper basket dimensions should follow source settings and clear opening"
  );
  assert.deepStrictEqual(
    hamperBaskets[0]?.position,
    { x: 56, y: 101, z: 0 },
    "hamper baskets should sit in the lower wardrobe opening with slide clearance"
  );
  assert.deepStrictEqual(
    hamperSlidePairs[0]?.size,
    { width: 612.5, height: 24, depth: 520 },
    "hamper slide-pair envelope should include slide clearances"
  );
  const wardrobeDocumentation = generateCabinetDocumentation(wardrobeWithRod);
  assert(
    wardrobeDocumentation.hardwareSchedule.some(
      (item) => item.hardwareId === "closet_hanging_rod" && item.hardwareType === "hanging_rod" && item.quantity === 1
    ),
    "hardware schedule should include hanging rod accessories"
  );
  assert(
    generateCabinetBOM(wardrobeWithRod).some((item) => item.type === "hanging_rod" && item.quantity === 1),
    "BOM should include hanging rod accessories"
  );
  assert(
    generateCabinetBOM(wardrobeWithRod).some((item) => item.type === "hamper_pullout_basket" && item.quantity === 2),
    "BOM should include pull-out hamper basket hardware"
  );
  assert(
    wardrobeDocumentation.hardwareSchedule.some(
      (item) => item.hardwareId === "pullout_hamper_basket" && item.hardwareType === "hamper_basket" && item.quantity === 2
    ),
    "hardware schedule should include pull-out hamper baskets"
  );
  assert(
    wardrobeDocumentation.hardwareSchedule.some(
      (item) => item.hardwareId === "pullout_hamper_slide_pair" && item.hardwareType === "hamper_slide_pair" && item.quantity === 2
    ),
    "hardware schedule should include pull-out hamper slide pairs"
  );
  assert(
    wardrobeDocumentation.cutList.every(
      (item) =>
        item.type !== "hanging_rod" &&
        item.type !== "hamper_pullout_basket" &&
        item.type !== "hamper_pullout_slide_pair"
    ),
    "board cut list should exclude hanging rod and hamper hardware"
  );
  assert(
    wardrobeDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("2 pull-out hamper baskets 520d x 360h with 35 slide clearance")
    ),
    "dimension schedule should describe pull-out hamper basket settings"
  );
  assert(
    wardrobeDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("pull-out hamper 2 baskets 520 mm deep x 360 mm high with 35 mm slide clearance")
    ),
    "drawing view schedule should describe pull-out hamper settings"
  );
  assert(
    wardrobeDocumentation.installerNotes.some((item) => item.id === "note:pullout-hamper-hardware"),
    "installer notes should include pull-out hamper coordination"
  );
  const wardrobeSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(wardrobeWithRod));
  assert.strictEqual(
    wardrobeSourceRoundTrip.modules[0].hangingRodHeight,
    1700,
    "source definition should preserve hanging rod height"
  );
  assert.strictEqual(
    wardrobeSourceRoundTrip.modules[0].hamperPullOutEnabled,
    true,
    "source definition should preserve pull-out hamper enablement"
  );
  assert.strictEqual(
    wardrobeSourceRoundTrip.modules[0].hamperBasketCount,
    2,
    "source definition should preserve pull-out hamper basket count"
  );
  const tightRodSpacing = clone(wardrobeWithRod);
  tightRodSpacing.modules[0].hangingRodCount = 2;
  tightRodSpacing.modules[0].hangingRodSpacing = 500;
  const tightRodSpacingValidation = validateCabinetDefinition(tightRodSpacing);
  assert.strictEqual(tightRodSpacingValidation.valid, true, "tight hanging rod spacing should warn without blocking export");
  assert(
    tightRodSpacingValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.hangingRodSpacing"
    ),
    "tight hanging rod spacing should produce a rod spacing warning"
  );
  const narrowHamperBaskets = clone(wardrobeWithRod);
  narrowHamperBaskets.modules[0].hamperBasketCount = 5;
  const narrowHamperValidation = validateCabinetDefinition(narrowHamperBaskets);
  assert.strictEqual(narrowHamperValidation.valid, true, "narrow hamper baskets should warn without blocking export");
  assert(
    narrowHamperValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.hamperBasketCount"
    ),
    "narrow hamper baskets should produce a capacity warning"
  );
  const shallowHamper = clone(wardrobeWithRod);
  shallowHamper.modules[0].hamperBasketDepth = 360;
  const shallowHamperValidation = validateCabinetDefinition(shallowHamper);
  assert.strictEqual(shallowHamperValidation.valid, true, "shallow hamper baskets should warn without blocking export");
  assert(
    shallowHamperValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.hamperBasketDepth"
    ),
    "shallow hamper baskets should produce a capacity warning"
  );
  const impossibleHamperDepth = clone(wardrobeWithRod);
  impossibleHamperDepth.modules[0].hamperBasketDepth = 700;
  assert.strictEqual(
    validateCabinetDefinition(impossibleHamperDepth).valid,
    false,
    "hamper baskets deeper than the wardrobe interior should fail"
  );
  const impossibleHamperHeight = clone(wardrobeWithRod);
  impossibleHamperHeight.modules[0].hamperBasketHeight = 2400;
  assert.strictEqual(
    validateCabinetDefinition(impossibleHamperHeight).valid,
    false,
    "hamper baskets taller than the lower opening should fail"
  );

  const wallPaneling = createCabinetPreset("wall_paneling", "cabinet-test-wall-paneling");
  const wallPanelingValidation = validateCabinetDefinition(wallPaneling);
  assert.strictEqual(wallPanelingValidation.valid, true, "wall paneling preset should validate");
  const wallPanelingParts = generateCabinetParts(wallPaneling);
  const panelStiles = wallPanelingParts.filter((part) => part.type === "panel_stile");
  const panelRails = wallPanelingParts.filter((part) => part.type === "panel_rail");
  assert.strictEqual(panelStiles.length, 8, "wall paneling should generate panel stiles for each module");
  assert.strictEqual(panelRails.length, 12, "wall paneling should generate panel rails for each module");
  assert.deepStrictEqual(
    panelStiles.slice(0, 2).map((part) => part.id),
    ["module-1:panel_stile:1", "module-1:panel_stile:2"],
    "panel stile part IDs should be stable"
  );
  assert.deepStrictEqual(
    panelRails.slice(0, 3).map((part) => part.id),
    ["module-1:panel_rail:1", "module-1:panel_rail:2", "module-1:panel_rail:3"],
    "panel rail part IDs should be stable"
  );
  assert.strictEqual(panelStiles[0]?.size.width, 55, "panel stile width should follow the module source definition");
  assert.strictEqual(panelStiles[0]?.size.depth, 18, "panel stile projection should follow the module source definition");
  assert.strictEqual(panelStiles[0]?.position.z, -36, "panel stiles should project in front of the slab face");
  assert.strictEqual(panelRails[1]?.position.y, 572.5, "middle panel rail should split the module into equal rows");
  assert(
    generateCabinetBOM(wallPaneling).some((item) => item.type === "panel_stile" && item.quantity === 8),
    "BOM should group matching panel stiles"
  );
  assert(
    generateCabinetBOM(wallPaneling).some((item) => item.type === "panel_rail" && item.quantity === 12),
    "BOM should group matching panel rails"
  );
  const wallPanelingDocumentation = generateCabinetDocumentation(wallPaneling);
  assert.strictEqual(
    wallPanelingDocumentation.cutList.filter((item) => item.type === "panel_stile").length,
    8,
    "cut list should include generated panel stiles"
  );
  assert.strictEqual(
    wallPanelingDocumentation.cutList.filter((item) => item.type === "panel_rail").length,
    12,
    "cut list should include generated panel rails"
  );
  assert(
    wallPanelingDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":panel_stile:") || partId.includes(":panel_rail:"))
    ),
    "edge-banding schedule should include panel rail/stile edges"
  );
  assert(
    wallPanelingDocumentation.dimensionSchedule.some((item) => item.notes?.includes("1 panel column x 2 rows")),
    "dimension schedule should describe panel frame grids"
  );
  const wallPanelingSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(wallPaneling));
  assert.strictEqual(
    wallPanelingSourceRoundTrip.modules[0].panelFrameWidth,
    55,
    "source definition should preserve panel frame width"
  );
  assert.strictEqual(
    wallPanelingSourceRoundTrip.modules[0].panelRowCount,
    2,
    "source definition should preserve panel row count"
  );
  const wallPanelingShopDrawingSvg = buildCabinetShopDrawingSvg(wallPaneling);
  assert(
    wallPanelingShopDrawingSvg.includes("A-601 Overall Front Elevation"),
    "wall paneling shop drawing should include a front elevation"
  );
  const crampedPaneling = clone(wallPaneling);
  crampedPaneling.modules[0].width = 260;
  const crampedPanelingValidation = validateCabinetDefinition(crampedPaneling);
  assert.strictEqual(crampedPanelingValidation.valid, true, "cramped panel openings should warn without blocking export");
  assert(
    crampedPanelingValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.panelColumnCount"
    ),
    "cramped panel openings should produce a panel proportion warning"
  );
  const impossiblePaneling = clone(wallPaneling);
  impossiblePaneling.modules[0].panelFrameWidth = 400;
  assert.strictEqual(
    validateCabinetDefinition(impossiblePaneling).valid,
    false,
    "panel rail/stile layouts that exceed module size should fail"
  );

  const ceilingBeams = createCabinetPreset("ceiling_beams", "cabinet-test-ceiling-beams-generated");
  const ceilingBeamsValidation = validateCabinetDefinition(ceilingBeams);
  assert.strictEqual(ceilingBeamsValidation.valid, true, "ceiling beam preset should validate");
  const ceilingBeamParts = generateCabinetParts(ceilingBeams);
  assert.strictEqual(ceilingBeamParts.length, 4, "ceiling beams should generate beam parts without cabinet carcasses");
  assert.strictEqual(
    ceilingBeamParts.filter((part) => part.type === "left_side_panel").length,
    0,
    "ceiling beam components should skip cabinet side panels"
  );
  assert.deepStrictEqual(
    ceilingBeamParts.map((part) => part.id),
    [
      "module-1:ceiling_beam:z-1",
      "module-1:ceiling_beam:z-2",
      "module-1:ceiling_beam:z-3",
      "module-1:ceiling_beam:z-4",
    ],
    "ceiling beam part IDs should be stable"
  );
  assert.deepStrictEqual(
    ceilingBeamParts[0]?.size,
    { width: 160, height: 180, depth: 2400 },
    "ceiling beam dimensions should follow the module source definition"
  );
  assert.strictEqual(
    ceilingBeamParts[0]?.position.x,
    472,
    "ceiling beam layout should distribute beams across the module span"
  );
  assert(
    generateCabinetBOM(ceilingBeams).some((item) => item.type === "ceiling_beam" && item.quantity === 4),
    "BOM should group matching ceiling beams"
  );
  const ceilingBeamsDocumentation = generateCabinetDocumentation(ceilingBeams);
  assert.strictEqual(
    ceilingBeamsDocumentation.cutList.filter((item) => item.type === "ceiling_beam").length,
    4,
    "cut list should include generated ceiling beams"
  );
  assert(
    ceilingBeamsDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":ceiling_beam:"))
    ),
    "edge-banding schedule should include ceiling beam bottom-face perimeters"
  );
  assert(
    ceilingBeamsDocumentation.dimensionSchedule.some((item) => item.notes?.includes("4 ceiling beams")),
    "dimension schedule should describe ceiling beam counts"
  );
  const ceilingBeamsDxf = buildCabinetFabricationDxf(ceilingBeams);
  assert(
    ceilingBeamsDxf.includes("module-1:ceiling_beam:z-1"),
    "fabrication DXF should label generated ceiling beam source part IDs"
  );
  const ceilingBeamsSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(ceilingBeams));
  assert.strictEqual(
    ceilingBeamsSourceRoundTrip.modules[0].millworkComponentType,
    "ceiling_beam_array",
    "source definition should preserve ceiling beam component type"
  );
  assert.strictEqual(
    ceilingBeamsSourceRoundTrip.modules[0].ceilingBeamCount,
    4,
    "source definition should preserve ceiling beam count"
  );

  const cofferedCeiling = createCabinetPreset("coffered_ceiling", "cabinet-test-coffered-ceiling-generated");
  const cofferedCeilingValidation = validateCabinetDefinition(cofferedCeiling);
  assert.strictEqual(cofferedCeilingValidation.valid, true, "coffered ceiling preset should validate");
  const cofferedCeilingParts = generateCabinetParts(cofferedCeiling);
  assert.strictEqual(cofferedCeilingParts.length, 8, "coffered ceilings should generate a two-axis beam grid");
  assert.deepStrictEqual(
    cofferedCeilingParts.slice(0, 4).map((part) => part.id),
    [
      "module-1:ceiling_beam:grid-z-1",
      "module-1:ceiling_beam:grid-z-2",
      "module-1:ceiling_beam:grid-z-3",
      "module-1:ceiling_beam:grid-z-4",
    ],
    "coffered ceiling column beam IDs should be stable"
  );
  assert.deepStrictEqual(
    cofferedCeilingParts.slice(4).map((part) => part.id),
    [
      "module-1:ceiling_beam:grid-x-1",
      "module-1:ceiling_beam:grid-x-2",
      "module-1:ceiling_beam:grid-x-3",
      "module-1:ceiling_beam:grid-x-4",
    ],
    "coffered ceiling row beam IDs should be stable"
  );
  assert(
    generateCabinetBOM(cofferedCeiling).filter((item) => item.type === "ceiling_beam").length === 2,
    "BOM should group coffer beams by generated orientation dimensions"
  );
  const cofferedDocumentation = generateCabinetDocumentation(cofferedCeiling);
  assert(
    cofferedDocumentation.dimensionSchedule.some((item) => item.notes?.includes("coffer grid 3 columns x 3 rows")),
    "dimension schedule should describe coffered ceiling grid counts"
  );
  const cofferedSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(cofferedCeiling));
  assert.strictEqual(
    cofferedSourceRoundTrip.modules[0].ceilingGridColumnCount,
    3,
    "source definition should preserve coffered ceiling column count"
  );
  const crampedCofferedCeiling = clone(cofferedCeiling);
  crampedCofferedCeiling.modules[0].ceilingGridColumnCount = 8;
  const crampedCofferedValidation = validateCabinetDefinition(crampedCofferedCeiling);
  assert.strictEqual(crampedCofferedValidation.valid, true, "cramped coffer openings should warn without blocking export");
  assert(
    crampedCofferedValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.ceilingGridColumnCount"
    ),
    "cramped coffer openings should produce a column proportion warning"
  );
  const impossibleCofferedCeiling = clone(cofferedCeiling);
  impossibleCofferedCeiling.modules[0].ceilingBeamWidth = 900;
  assert.strictEqual(
    validateCabinetDefinition(impossibleCofferedCeiling).valid,
    false,
    "coffered ceiling grids that exceed module size should fail"
  );

  const trimPackage = createCabinetPreset("trim_package", "cabinet-test-trim-package-generated");
  const trimPackageValidation = validateCabinetDefinition(trimPackage);
  assert.strictEqual(trimPackageValidation.valid, true, "trim package preset should validate");
  const trimPackageParts = generateCabinetParts(trimPackage);
  assert.strictEqual(trimPackageParts.length, 4, "trim package should generate trim members without cabinet carcasses");
  assert.deepStrictEqual(
    trimPackageParts.map((part) => part.id),
    [
      "module-1:trim_member:run-x-1",
      "module-1:trim_member:run-x-2",
      "module-1:trim_member:run-x-3",
      "module-1:trim_member:run-x-4",
    ],
    "trim member part IDs should be stable"
  );
  assert.deepStrictEqual(
    trimPackageParts[0]?.size,
    { width: 800, height: 160, depth: 24 },
    "trim member dimensions should follow the trim package source definition"
  );
  assert.deepStrictEqual(
    trimPackageParts[0]?.position,
    { x: 0, y: 0, z: 0 },
    "baseboard trim members should default to the floor setout"
  );
  assert.strictEqual(
    trimPackageParts[0]?.metadata?.trimPlacement,
    "baseboard",
    "trim member metadata should preserve semantic placement"
  );
  assert.strictEqual(
    trimPackageParts[0]?.metadata?.trimSetoutHeight,
    0,
    "trim member metadata should preserve setout height"
  );
  assert(
    generateCabinetBOM(trimPackage).some((item) => item.type === "trim_member" && item.quantity === 4),
    "BOM should group matching trim members"
  );
  const trimPackageDocumentation = generateCabinetDocumentation(trimPackage);
  assert.strictEqual(
    trimPackageDocumentation.cutList.filter((item) => item.type === "trim_member").length,
    4,
    "cut list should include trim package members"
  );
  assert(
    trimPackageDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":trim_member:"))
    ),
    "edge-banding schedule should include trim member visible edges"
  );
  assert(
    trimPackageDocumentation.dimensionSchedule.some((item) => item.notes?.includes("4 baseboard trim members at 0h")),
    "dimension schedule should describe trim placement and setout"
  );
  assert(
    trimPackageDocumentation.drawingViewSchedule.some((item) => item.notes?.includes("4 baseboard trim members at 0 mm setout")),
    "drawing view schedule should describe trim placement and setout"
  );
  const trimPackageShopDrawingSvg = buildCabinetShopDrawingSvg(trimPackage);
  assert(
    trimPackageShopDrawingSvg.includes("baseboard trim setout 0 mm"),
    "shop drawing SVG should label baseboard trim setout"
  );
  assert(
    trimPackageShopDrawingSvg.includes('data-trim-placement="baseboard"'),
    "shop drawing SVG should preserve trim placement metadata"
  );
  const trimSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(trimPackage));
  assert.strictEqual(
    trimSourceRoundTrip.modules[0].millworkComponentType,
    "trim_run",
    "source definition should preserve trim run component type"
  );
  assert.strictEqual(
    trimSourceRoundTrip.modules[0].trimMemberCount,
    4,
    "source definition should preserve trim member count"
  );
  assert.strictEqual(
    trimSourceRoundTrip.modules[0].trimPlacement,
    "baseboard",
    "source definition should preserve trim placement"
  );
  assert.strictEqual(
    trimSourceRoundTrip.modules[0].trimSetoutHeight,
    0,
    "source definition should preserve trim setout height"
  );
  const crownTrimPackage = clone(trimPackage);
  crownTrimPackage.height = 2400;
  crownTrimPackage.modules[0].height = 2400;
  crownTrimPackage.modules[0].trimPlacement = "crown_moulding";
  crownTrimPackage.modules[0].trimSetoutHeight = 2240;
  const crownTrimParts = generateCabinetParts(crownTrimPackage);
  assert.strictEqual(
    crownTrimParts[0]?.position.y,
    2240,
    "crown moulding should generate at the configured setout height"
  );
  assert(
    generateCabinetDocumentation(crownTrimPackage).dimensionSchedule.some((item) =>
      item.notes?.includes("4 crown moulding trim members at 2240h")
    ),
    "dimension schedule should describe crown moulding setout"
  );
  assert(
    buildCabinetShopDrawingSvg(crownTrimPackage).includes("crown moulding trim setout 2240 mm"),
    "shop drawing SVG should label crown moulding setout"
  );
  const returnedTrimPackage = clone(trimPackage);
  returnedTrimPackage.modules[0].trimLeftEndTreatment = "mitered_return";
  returnedTrimPackage.modules[0].trimRightEndTreatment = "mitered_return";
  returnedTrimPackage.modules[0].trimReturnDepth = 120;
  returnedTrimPackage.modules[0].trimMiterAngle = 45;
  const returnedTrimParts = generateCabinetParts(returnedTrimPackage);
  const trimReturns = returnedTrimParts.filter((part) => part.type === "trim_return");
  assert.strictEqual(trimReturns.length, 2, "mitered trim ends should generate return pieces");
  assert.deepStrictEqual(
    trimReturns.map((part) => part.id),
    ["module-1:trim_return:left", "module-1:trim_return:right"],
    "trim return part IDs should be stable"
  );
  assert.deepStrictEqual(
    trimReturns[0]?.size,
    { width: 24, height: 160, depth: 120 },
    "trim return dimensions should follow profile depth, profile width, and return depth"
  );
  assert.deepStrictEqual(
    trimReturns[1]?.position,
    { x: 3176, y: 0, z: 0 },
    "right trim return should sit at the right end of the trim run"
  );
  assert.strictEqual(
    trimReturns[0]?.metadata?.trimMiterAngle,
    45,
    "trim return metadata should preserve miter angle"
  );
  assert(
    generateCabinetBOM(returnedTrimPackage).some((item) => item.type === "trim_return" && item.quantity === 2),
    "BOM should group trim return pieces"
  );
  const returnedTrimDocumentation = generateCabinetDocumentation(returnedTrimPackage);
  assert.strictEqual(
    returnedTrimDocumentation.cutList.filter((item) => item.type === "trim_return").length,
    2,
    "cut list should include trim return pieces"
  );
  assert(
    returnedTrimDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("ends mitered return/mitered return returns 120d at 45 deg")
    ),
    "dimension schedule should describe trim return end treatments"
  );
  assert(
    returnedTrimDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("ends mitered return/mitered return with 120 mm returns at 45 deg")
    ),
    "drawing schedule should describe trim return end treatments"
  );
  assert(
    buildCabinetFabricationDxf(returnedTrimPackage).includes("trim_return"),
    "fabrication DXF should include trim return pieces"
  );
  const returnedTrimShopDrawingSvg = buildCabinetShopDrawingSvg(returnedTrimPackage);
  assert(
    returnedTrimShopDrawingSvg.includes('data-trim-return-side="left"'),
    "shop drawing SVG should mark trim return side"
  );
  assert(
    returnedTrimShopDrawingSvg.includes('data-trim-end-treatment="mitered_return"'),
    "shop drawing SVG should mark trim return end treatment"
  );
  const returnedTrimSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(returnedTrimPackage));
  assert.strictEqual(
    returnedTrimSourceRoundTrip.modules[0].trimLeftEndTreatment,
    "mitered_return",
    "source definition should preserve left trim end treatment"
  );
  assert.strictEqual(
    returnedTrimSourceRoundTrip.modules[0].trimReturnDepth,
    120,
    "source definition should preserve trim return depth"
  );
  const revealTrimPackage = clone(trimPackage);
  revealTrimPackage.modules[0].trimRevealStripEnabled = true;
  revealTrimPackage.modules[0].trimRevealStripHeight = 22;
  revealTrimPackage.modules[0].trimRevealStripDepth = 14;
  revealTrimPackage.modules[0].trimRevealStripInsetFromTop = 8;
  const revealTrimValidation = validateCabinetDefinition(revealTrimPackage);
  assert.strictEqual(revealTrimValidation.valid, true, "trim reveal/backing strips should validate inside the trim profile");
  const revealTrimParts = generateCabinetParts(revealTrimPackage).filter((part) => part.type === "trim_reveal_strip");
  assert.strictEqual(revealTrimParts.length, 4, "trim reveal/backing strips should follow trim member segmentation");
  assert.deepStrictEqual(
    revealTrimParts.map((part) => part.id),
    [
      "module-1:trim_reveal_strip:run-x-1",
      "module-1:trim_reveal_strip:run-x-2",
      "module-1:trim_reveal_strip:run-x-3",
      "module-1:trim_reveal_strip:run-x-4",
    ],
    "trim reveal strip part IDs should be stable"
  );
  assert.deepStrictEqual(
    revealTrimParts[0]?.size,
    { width: 800, height: 22, depth: 14 },
    "trim reveal strip dimensions should follow the source definition"
  );
  assert.deepStrictEqual(
    revealTrimParts[0]?.position,
    { x: 0, y: 130, z: 24 },
    "trim reveal strip should sit near the top of the primary profile and behind its face depth"
  );
  assert.strictEqual(
    revealTrimParts[0]?.metadata?.trimRevealStripInsetFromTop,
    8,
    "trim reveal strip metadata should preserve the top inset"
  );
  assert(
    generateCabinetBOM(revealTrimPackage).some((item) => item.type === "trim_reveal_strip" && item.quantity === 4),
    "BOM should group trim reveal/backing strips"
  );
  const revealTrimDocumentation = generateCabinetDocumentation(revealTrimPackage);
  assert.strictEqual(
    revealTrimDocumentation.cutList.filter((item) => item.type === "trim_reveal_strip").length,
    4,
    "cut list should include trim reveal/backing strips"
  );
  assert(
    revealTrimDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":trim_reveal_strip:"))
    ),
    "edge-banding schedule should include trim reveal/backing strips"
  );
  assert(
    revealTrimDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("reveal/backing strip 22h x 14d inset 8 from top")
    ),
    "dimension schedule should describe trim reveal/backing strips"
  );
  assert(
    revealTrimDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("22 mm x 14 mm reveal/backing strips inset 8 mm from top behind 24 mm profile")
    ),
    "drawing schedule should describe trim reveal/backing strips"
  );
  const revealTrimShopDrawingSvg = buildCabinetShopDrawingSvg(revealTrimPackage);
  assert(
    revealTrimShopDrawingSvg.includes('data-trim-reveal-strip="true"') &&
      revealTrimShopDrawingSvg.includes('data-trim-reveal-height="22"') &&
      revealTrimShopDrawingSvg.includes('data-trim-reveal-depth="14"'),
    "shop drawing SVG should mark trim reveal/backing strips"
  );
  assert(
    buildCabinetFabricationDxf(revealTrimPackage).includes("trim_reveal_strip"),
    "fabrication DXF should include trim reveal/backing strips"
  );
  const revealTrimSourceRoundTrip = parseCabinetSourceDefinitionJson(
    buildCabinetSourceDefinitionJson(revealTrimPackage)
  );
  assert.strictEqual(
    revealTrimSourceRoundTrip.modules[0].trimRevealStripEnabled,
    true,
    "source definition should preserve trim reveal strip enablement"
  );
  assert.strictEqual(
    revealTrimSourceRoundTrip.modules[0].trimRevealStripHeight,
    22,
    "source definition should preserve trim reveal strip height"
  );
  assert.strictEqual(
    revealTrimSourceRoundTrip.modules[0].trimRevealStripDepth,
    14,
    "source definition should preserve trim reveal strip depth"
  );
  assert.strictEqual(
    revealTrimSourceRoundTrip.modules[0].trimRevealStripInsetFromTop,
    8,
    "source definition should preserve trim reveal strip top inset"
  );
  const longTrimPackage = clone(trimPackage);
  longTrimPackage.modules[0].trimMemberCount = 1;
  const longTrimValidation = validateCabinetDefinition(longTrimPackage);
  assert.strictEqual(longTrimValidation.valid, true, "long trim stock should warn without blocking export");
  assert(
    longTrimValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.trimMemberCount"
    ),
    "long trim runs should produce a stock-length warning"
  );
  const highBaseboardTrim = clone(trimPackage);
  highBaseboardTrim.height = 600;
  highBaseboardTrim.modules[0].height = 600;
  highBaseboardTrim.modules[0].trimSetoutHeight = 220;
  const highBaseboardValidation = validateCabinetDefinition(highBaseboardTrim);
  assert.strictEqual(highBaseboardValidation.valid, true, "high baseboard trim should warn without blocking export");
  assert(
    highBaseboardValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.trimSetoutHeight"
    ),
    "high baseboard trim should produce a setout warning"
  );
  const shallowReturnedTrim = clone(returnedTrimPackage);
  shallowReturnedTrim.modules[0].trimReturnDepth = 30;
  const shallowReturnedTrimValidation = validateCabinetDefinition(shallowReturnedTrim);
  assert.strictEqual(shallowReturnedTrimValidation.valid, true, "shallow trim returns should warn without blocking export");
  assert(
    shallowReturnedTrimValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.trimReturnDepth"
    ),
    "shallow trim returns should produce a miter glue-area warning"
  );
  const unusualMiterTrim = clone(returnedTrimPackage);
  unusualMiterTrim.modules[0].trimMiterAngle = 70;
  const unusualMiterTrimValidation = validateCabinetDefinition(unusualMiterTrim);
  assert.strictEqual(unusualMiterTrimValidation.valid, true, "unusual trim miters should warn without blocking export");
  assert(
    unusualMiterTrimValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.trimMiterAngle"
    ),
    "unusual trim miters should produce a field-verification warning"
  );
  const hairlineRevealTrim = clone(revealTrimPackage);
  hairlineRevealTrim.modules[0].trimRevealStripHeight = 8;
  const hairlineRevealValidation = validateCabinetDefinition(hairlineRevealTrim);
  assert.strictEqual(hairlineRevealValidation.valid, true, "hairline trim reveal strips should warn without blocking export");
  assert(
    hairlineRevealValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.trimRevealStripHeight"
    ),
    "hairline trim reveal strips should produce a fabrication warning"
  );
  const deepRevealTrim = clone(revealTrimPackage);
  deepRevealTrim.modules[0].trimRevealStripDepth = 45;
  const deepRevealValidation = validateCabinetDefinition(deepRevealTrim);
  assert.strictEqual(deepRevealValidation.valid, true, "deep trim reveal strips should warn without blocking export");
  assert(
    deepRevealValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.trimRevealStripDepth"
    ),
    "deep trim reveal strips should produce a backing clearance warning"
  );
  const impossibleTrimMiter = clone(returnedTrimPackage);
  impossibleTrimMiter.modules[0].trimMiterAngle = 95;
  assert.strictEqual(
    validateCabinetDefinition(impossibleTrimMiter).valid,
    false,
    "trim miter angles outside fabrication range should fail"
  );
  const impossibleTrimSetout = clone(trimPackage);
  impossibleTrimSetout.modules[0].trimSetoutHeight = 40;
  assert.strictEqual(
    validateCabinetDefinition(impossibleTrimSetout).valid,
    false,
    "trim setout plus profile width beyond the module height should fail"
  );
  const impossibleRevealTrim = clone(revealTrimPackage);
  impossibleRevealTrim.modules[0].trimRevealStripDepth = 80;
  assert.strictEqual(
    validateCabinetDefinition(impossibleRevealTrim).valid,
    false,
    "trim reveal strips deeper than the trim module depth should fail"
  );

  const fireplaceSurround = createCabinetPreset("fireplace_surround", "cabinet-test-fireplace-surround-generated");
  const fireplaceSurroundValidation = validateCabinetDefinition(fireplaceSurround);
  assert.strictEqual(fireplaceSurroundValidation.valid, true, "fireplace surround preset should validate");
  const fireplaceParts = generateCabinetParts(fireplaceSurround);
  assert.strictEqual(fireplaceParts.length, 4, "fireplace surrounds should generate legs, header, and mantel members");
  assert.deepStrictEqual(
    fireplaceParts.map((part) => part.id),
    [
      "module-1:trim_member:fireplace-left-leg",
      "module-1:trim_member:fireplace-right-leg",
      "module-1:trim_member:fireplace-header",
      "module-1:trim_member:fireplace-mantel",
    ],
    "fireplace trim member IDs should be stable"
  );
  assert.deepStrictEqual(
    fireplaceParts[0]?.position,
    { x: 470, y: 0, z: 0 },
    "fireplace left leg should be positioned from the centered opening and leg width"
  );
  assert.deepStrictEqual(
    fireplaceParts[2]?.size,
    { width: 1460, height: 220, depth: 220 },
    "fireplace header should span the opening plus both legs"
  );
  assert.strictEqual(
    fireplaceParts[3]?.position.z,
    -40,
    "mantel shelf should project forward beyond the surround frame depth"
  );
  assert(
    generateCabinetBOM(fireplaceSurround).some((item) => item.type === "trim_member" && item.quantity === 2),
    "BOM should group matching fireplace legs"
  );
  const fireplaceDocumentation = generateCabinetDocumentation(fireplaceSurround);
  assert.strictEqual(
    fireplaceDocumentation.cutList.filter((item) => item.type === "trim_member").length,
    4,
    "cut list should include fireplace trim and mantel members"
  );
  assert(
    fireplaceDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("fireplace surround 1100w x 900h opening")
    ),
    "dimension schedule should describe fireplace opening dimensions"
  );
  const fireplaceSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(fireplaceSurround));
  assert.strictEqual(
    fireplaceSourceRoundTrip.modules[0].millworkComponentType,
    "fireplace_surround_frame",
    "source definition should preserve fireplace surround component type"
  );
  assert.strictEqual(
    fireplaceSourceRoundTrip.modules[0].fireplaceMantelDepth,
    300,
    "source definition should preserve fireplace mantel depth"
  );
  const narrowLegFireplace = clone(fireplaceSurround);
  narrowLegFireplace.modules[0].fireplaceLegWidth = 60;
  const narrowLegValidation = validateCabinetDefinition(narrowLegFireplace);
  assert.strictEqual(narrowLegValidation.valid, true, "narrow fireplace legs should warn without blocking export");
  assert(
    narrowLegValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.fireplaceLegWidth"
    ),
    "narrow fireplace legs should produce a proportion warning"
  );
  const impossibleFireplace = clone(fireplaceSurround);
  impossibleFireplace.modules[0].fireplaceOpeningHeight = 1900;
  assert.strictEqual(
    validateCabinetDefinition(impossibleFireplace).valid,
    false,
    "fireplace trim stacks that exceed surround height should fail"
  );

  const murphyBed = createCabinetPreset("murphy_bed", "cabinet-test-murphy-generated");
  const murphyBedValidation = validateCabinetDefinition(murphyBed);
  assert.strictEqual(murphyBedValidation.valid, true, "murphy bed preset should validate");
  const murphyParts = generateCabinetParts(murphyBed);
  const murphyConvertibleParts = murphyParts.filter((part) => part.moduleId === "module-2");
  assert.strictEqual(
    murphyConvertibleParts.filter((part) => part.type === "convertible_panel").length,
    2,
    "murphy bed center module should generate closed and deployed convertible panels"
  );
  assert(
    murphyConvertibleParts.some((part) => part.type === "hinge_rail"),
    "murphy bed center module should generate a hinge/mechanism rail"
  );
  assert.strictEqual(
    murphyConvertibleParts.filter((part) => part.type === "support_leg").length,
    2,
    "murphy bed center module should generate deployed support legs"
  );
  assert(
    !murphyConvertibleParts.some((part) => part.type === "left_side_panel"),
    "murphy bed convertible module should skip cabinet carcass generation"
  );
  assert.deepStrictEqual(
    murphyConvertibleParts.filter((part) => part.type === "convertible_panel").map((part) => part.id),
    ["module-2:convertible_panel:closed-front", "module-2:convertible_panel:deployed-sleep-platform"],
    "murphy bed convertible panel IDs should be stable"
  );
  assert.deepStrictEqual(
    murphyConvertibleParts.find((part) => part.id === "module-2:convertible_panel:deployed-sleep-platform")?.size,
    { width: 1450, height: 42, depth: 2050 },
    "murphy bed deployed platform should follow source dimensions"
  );
  assert(
    generateCabinetBOM(murphyBed).some((item) => item.type === "convertible_panel" && item.quantity === 1),
    "BOM should include murphy bed convertible panels"
  );
  const murphyDocumentation = generateCabinetDocumentation(murphyBed);
  assert(
    murphyDocumentation.cutList.some((item) => item.type === "convertible_panel"),
    "cut list should include murphy bed convertible panels"
  );
  assert(
    murphyDocumentation.cutList.every((item) => item.type !== "hinge_rail"),
    "board cut list should exclude convertible hinge rails"
  );
  assert(
    murphyDocumentation.dimensionSchedule.some((item) => item.notes?.includes("double mattress vertical opening")),
    "dimension schedule should describe murphy bed deployed geometry"
  );
  const murphySourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(murphyBed));
  assert.strictEqual(
    murphySourceRoundTrip.modules[1].millworkComponentType,
    "wall_bed_panel",
    "source definition should preserve wall bed component type"
  );
  assert.strictEqual(
    murphySourceRoundTrip.modules[1].convertibleOpenDepth,
    2050,
    "source definition should preserve wall bed open depth"
  );
  assert.strictEqual(murphySourceRoundTrip.modules[1].wallBedMattressSize, "double", "source definition should preserve wall-bed mattress size");
  assert.strictEqual(murphySourceRoundTrip.modules[1].wallBedOrientation, "vertical", "source definition should preserve wall-bed orientation");
  assert.deepStrictEqual(
    getCabinetVisiblePreviewParts(murphyBed)
      .filter((part) => part.moduleId === "module-2" && part.type === "convertible_panel")
      .map((part) => part.metadata?.state),
    ["closed"],
    "closed wall-bed preview state should hide the deployed panel"
  );
  const openMurphyBed = clone(murphyBed);
  openMurphyBed.modules[1].wallBedDisplayState = "open";
  assert.deepStrictEqual(
    getCabinetVisiblePreviewParts(openMurphyBed)
      .filter((part) => part.moduleId === "module-2" && part.type === "convertible_panel")
      .map((part) => part.metadata?.state),
    ["deployed"],
    "open wall-bed preview state should hide the closed panel"
  );
  const shallowMurphyBed = clone(murphyBed);
  shallowMurphyBed.modules[1].convertibleOpenDepth = 1600;
  const shallowMurphyValidation = validateCabinetDefinition(shallowMurphyBed);
  assert.strictEqual(shallowMurphyValidation.valid, false, "wall-bed depth shorter than the selected mattress should block export");
  assert(
    shallowMurphyValidation.issues.some(
      (issue) => issue.severity === "error" && issue.field === "modules.1.convertibleOpenDepth"
    ),
    "short wall-bed depth should produce an actionable mattress-clearance error"
  );
  const impossibleMurphyBed = clone(murphyBed);
  impossibleMurphyBed.modules[1].convertiblePanelHeight = 2600;
  assert.strictEqual(
    validateCabinetDefinition(impossibleMurphyBed).valid,
    false,
    "convertible panels taller than the module should fail"
  );

  const foldDownDesk = createCabinetPreset("fold_down_desk", "cabinet-test-fold-down-desk-generated");
  const foldDownValidation = validateCabinetDefinition(foldDownDesk);
  assert.strictEqual(foldDownValidation.valid, true, "fold-down desk preset should validate");
  const foldDownParts = generateCabinetParts(foldDownDesk);
  assert.deepStrictEqual(
    foldDownParts.filter((part) => part.type === "convertible_panel").map((part) => part.id),
    ["module-1:convertible_panel:closed-front", "module-1:convertible_panel:deployed-work-surface"],
    "fold-down desk convertible panel IDs should be stable"
  );
  assert.deepStrictEqual(
    foldDownParts.find((part) => part.id === "module-1:convertible_panel:deployed-work-surface")?.size,
    { width: 1200, height: 30, depth: 650 },
    "fold-down desk deployed work surface should follow source dimensions"
  );
  assert.strictEqual(
    foldDownParts.filter((part) => part.type === "support_leg").length,
    2,
    "fold-down desk should generate deployed support legs"
  );
  assert(
    generateCabinetBOM(foldDownDesk).some((item) => item.type === "hinge_rail" && item.quantity === 1),
    "BOM should include fold-down hinge/mechanism rail"
  );
  const foldDownDocumentation = generateCabinetDocumentation(foldDownDesk);
  assert(
    foldDownDocumentation.dimensionSchedule.some((item) => item.notes?.includes("fold-down desk panel 720h x 650d open")),
    "dimension schedule should describe fold-down desk deployed geometry"
  );
  const foldDownSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(foldDownDesk));
  assert.strictEqual(
    foldDownSourceRoundTrip.modules[0].millworkComponentType,
    "fold_down_worksurface",
    "source definition should preserve fold-down worksurface component type"
  );
  const tallDesk = clone(foldDownDesk);
  tallDesk.modules[0].convertibleHingeHeight = 900;
  const tallDeskValidation = validateCabinetDefinition(tallDesk);
  assert.strictEqual(tallDeskValidation.valid, true, "non-ergonomic desk heights should warn without blocking export");
  assert(
    tallDeskValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.convertibleHingeHeight"
    ),
    "non-ergonomic desk heights should produce an ergonomics warning"
  );

  const platformBed = createCabinetPreset("platform_storage_bed", "cabinet-test-platform-storage-bed-generated");
  const platformBedValidation = validateCabinetDefinition(platformBed);
  assert.strictEqual(platformBedValidation.valid, true, "platform storage bed preset should validate");
  const platformParts = generateCabinetParts(platformBed);
  const platformDeckParts = platformParts.filter((part) => part.type === "platform_deck");
  const platformRibParts = platformParts.filter((part) => part.type === "platform_support_rib");
  assert.strictEqual(platformDeckParts.length, 2, "platform storage bed should generate one deck panel per storage module");
  assert.strictEqual(platformRibParts.length, 6, "platform storage bed should generate support ribs per storage module");
  assert.strictEqual(
    platformParts.filter((part) => part.type === "drawer_front").length,
    4,
    "platform storage bed should preserve drawer storage fronts"
  );
  assert.deepStrictEqual(
    platformDeckParts.map((part) => part.id),
    ["module-1:platform_deck:0", "module-2:platform_deck:0"],
    "platform deck part IDs should be stable"
  );
  assert.deepStrictEqual(
    platformRibParts.slice(0, 3).map((part) => part.id),
    [
      "module-1:platform_support_rib:1",
      "module-1:platform_support_rib:2",
      "module-1:platform_support_rib:3",
    ],
    "platform support rib part IDs should be stable"
  );
  assert.deepStrictEqual(
    platformDeckParts[0]?.size,
    { width: 1200, height: 24, depth: 1040 },
    "platform deck size should include front and back overhangs"
  );
  assert.strictEqual(platformDeckParts[0]?.position.z, 0, "platform deck should align to the overall front footprint");
  assert.strictEqual(platformRibParts[0]?.position.z, 207.5, "platform rib spacing should be evenly distributed below the deck");
  const platformBOM = generateCabinetBOM(platformBed);
  assert(
    platformBOM.some((item) => item.type === "platform_deck" && item.quantity === 2),
    "BOM should group platform deck panels"
  );
  assert(
    platformBOM.some((item) => item.type === "platform_support_rib" && item.quantity === 6),
    "BOM should group platform support ribs"
  );
  const platformDocumentation = generateCabinetDocumentation(platformBed);
  assert.strictEqual(
    platformDocumentation.cutList.filter((item) => item.type === "platform_deck").length,
    2,
    "cut list should include platform deck panels"
  );
  assert.strictEqual(
    platformDocumentation.cutList.filter((item) => item.type === "platform_support_rib").length,
    6,
    "cut list should include platform support ribs"
  );
  assert(
    platformDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":platform_deck:"))
    ),
    "edge-banding schedule should include platform deck edges"
  );
  assert(
    platformDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":platform_support_rib:"))
    ),
    "edge-banding schedule should include platform support rib edges"
  );
  assert(
    platformDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("platform deck 24 thick with 3 support ribs")
    ),
    "dimension schedule should describe platform deck thickness and support ribs"
  );
  assert(
    platformDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("platform deck 1040 mm deep with 3 support ribs")
    ),
    "drawing view schedule should describe platform deck depth"
  );
  const platformSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(platformBed));
  assert.strictEqual(
    platformSourceRoundTrip.modules[0].platformDeckThickness,
    24,
    "source definition should preserve platform deck thickness"
  );
  assert.strictEqual(
    platformSourceRoundTrip.modules[0].platformSupportRibCount,
    3,
    "source definition should preserve platform support rib count"
  );
  const unsupportedPlatformBed = clone(platformBed);
  unsupportedPlatformBed.modules[0].platformSupportRibCount = 0;
  const unsupportedPlatformValidation = validateCabinetDefinition(unsupportedPlatformBed);
  assert.strictEqual(
    unsupportedPlatformValidation.valid,
    true,
    "platform decks without ribs should warn without blocking export"
  );
  assert(
    unsupportedPlatformValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.platformSupportRibCount"
    ),
    "unsupported platform decks should produce a support rib warning"
  );
  const crowdedPlatformBed = clone(platformBed);
  crowdedPlatformBed.modules[0].platformSupportRibCount = 20;
  assert.strictEqual(
    validateCabinetDefinition(crowdedPlatformBed).valid,
    false,
    "platform rib layouts that exceed deck depth should fail"
  );
  const tallRibPlatformBed = clone(platformBed);
  tallRibPlatformBed.modules[0].platformSupportRibHeight = 420;
  assert.strictEqual(
    validateCabinetDefinition(tallRibPlatformBed).valid,
    false,
    "platform ribs as tall as the module should fail"
  );

  const underStair = createCabinetPreset("under_stair_storage", "cabinet-test-under-stair-generated");
  const underStairValidation = validateCabinetDefinition(underStair);
  assert.strictEqual(underStairValidation.valid, true, "under-stair storage preset should validate");
  const underStairParts = generateCabinetParts(underStair);
  const stairScribeParts = underStairParts.filter((part) => part.type === "stair_scribe_panel");
  assert.strictEqual(stairScribeParts.length, 6, "under-stair storage should generate stepped scribe panels");
  assert.deepStrictEqual(
    stairScribeParts.slice(0, 3).map((part) => part.id),
    [
      "module-2:stair_scribe_panel:1",
      "module-2:stair_scribe_panel:2",
      "module-2:stair_scribe_panel:3",
    ],
    "under-stair scribe panel IDs should be stable"
  );
  assert.deepStrictEqual(
    stairScribeParts[0]?.size,
    { width: 200, height: 450, depth: 24 },
    "under-stair high-side scribe panel should follow source stair heights"
  );
  assert.strictEqual(stairScribeParts[0]?.position.y, 1350, "under-stair scribe panels should sit above module tops");
  assert.strictEqual(
    underStairParts.filter((part) => part.type === "drawer_front").length,
    3,
    "under-stair drawer module should preserve drawer fronts"
  );
  assert(
    generateCabinetBOM(underStair)
      .filter((item) => item.type === "stair_scribe_panel")
      .reduce((sum, item) => sum + item.quantity, 0) === 6,
    "BOM should include all under-stair scribe panels"
  );
  const underStairDocumentation = generateCabinetDocumentation(underStair);
  assert.strictEqual(
    underStairDocumentation.cutList.filter((item) => item.type === "stair_scribe_panel").length,
    6,
    "cut list should include under-stair scribe panels"
  );
  assert(
    underStairDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":stair_scribe_panel:"))
    ),
    "edge-banding schedule should include under-stair scribe panel edges"
  );
  assert(
    underStairDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("stair scribe 3 steps 1500-1800h rises left")
    ),
    "dimension schedule should describe under-stair scribe geometry"
  );
  assert(
    underStairDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("stair scribe 3 steps from 1500 to 1800 mm")
    ),
    "drawing view schedule should describe under-stair scribe heights"
  );
  assert(
    buildCabinetShopDrawingSvg(underStair).includes("A-601 Overall Front Elevation"),
    "shop drawing should render an under-stair front elevation"
  );
  const underStairSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(underStair));
  assert.strictEqual(
    underStairSourceRoundTrip.modules[1].stairScribeStepCount,
    3,
    "source definition should preserve under-stair scribe step count"
  );
  assert.strictEqual(
    underStairSourceRoundTrip.modules[1].stairScribeDirection,
    "rises_left",
    "source definition should preserve under-stair scribe direction"
  );
  const denseUnderStair = clone(underStair);
  denseUnderStair.modules[1].stairScribeStepCount = 6;
  const denseUnderStairValidation = validateCabinetDefinition(denseUnderStair);
  assert.strictEqual(denseUnderStairValidation.valid, true, "narrow under-stair scribe steps should warn without blocking export");
  assert(
    denseUnderStairValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.1.stairScribeStepCount"
    ),
    "narrow under-stair scribe steps should produce a templating warning"
  );
  const impossibleUnderStairLow = clone(underStair);
  impossibleUnderStairLow.modules[1].stairScribeLowHeight = 1200;
  assert.strictEqual(
    validateCabinetDefinition(impossibleUnderStairLow).valid,
    false,
    "under-stair scribe low height below the module top should fail"
  );
  const impossibleUnderStairOrder = clone(underStair);
  impossibleUnderStairOrder.modules[1].stairScribeHighHeight = 1450;
  impossibleUnderStairOrder.modules[1].stairScribeLowHeight = 1500;
  assert.strictEqual(
    validateCabinetDefinition(impossibleUnderStairOrder).valid,
    false,
    "under-stair scribe high height below low height should fail"
  );

  const roomDivider = createCabinetPreset("room_divider_storage", "cabinet-test-room-divider-generated");
  const roomDividerValidation = validateCabinetDefinition(roomDivider);
  assert.strictEqual(roomDividerValidation.valid, true, "room divider storage preset should validate");
  const roomDividerParts = generateCabinetParts(roomDivider);
  const roomDividerBackPanels = roomDividerParts.filter((part) => part.type === "room_divider_back_panel");
  const roomDividerFeet = roomDividerParts.filter((part) => part.type === "room_divider_stabilizer_foot");
  assert.strictEqual(roomDividerBackPanels.length, 6, "room divider should generate two rear panels per module");
  assert.strictEqual(roomDividerFeet.length, 6, "room divider should generate stabilizer feet per module");
  assert.deepStrictEqual(
    roomDividerBackPanels.slice(0, 2).map((part) => part.id),
    ["module-1:room_divider_back_panel:1", "module-1:room_divider_back_panel:2"],
    "room divider rear panel IDs should be stable"
  );
  assert.deepStrictEqual(
    roomDividerFeet.slice(0, 2).map((part) => part.id),
    ["module-1:room_divider_stabilizer_foot:1", "module-1:room_divider_stabilizer_foot:2"],
    "room divider stabilizer foot IDs should be stable"
  );
  assert.deepStrictEqual(
    roomDividerBackPanels[0]?.size,
    { width: 400, height: 1800, depth: 18 },
    "room divider rear panel size should follow source panel count and thickness"
  );
  assert.deepStrictEqual(
    roomDividerFeet[0]?.size,
    { width: 90, height: 45, depth: 360 },
    "room divider stabilizer foot size should follow source dimensions"
  );
  const roomDividerBOM = generateCabinetBOM(roomDivider);
  assert(
    roomDividerBOM.some((item) => item.type === "room_divider_back_panel" && item.quantity === 4),
    "BOM should group matching room divider rear panels"
  );
  assert(
    roomDividerBOM.some((item) => item.type === "room_divider_stabilizer_foot" && item.quantity === 6),
    "BOM should group room divider stabilizer feet"
  );
  const roomDividerDocumentation = generateCabinetDocumentation(roomDivider);
  assert.strictEqual(
    roomDividerDocumentation.cutList.filter((item) => item.type === "room_divider_back_panel").length,
    6,
    "cut list should include room divider rear panels"
  );
  assert.strictEqual(
    roomDividerDocumentation.cutList.filter((item) => item.type === "room_divider_stabilizer_foot").length,
    6,
    "cut list should include room divider stabilizer feet"
  );
  assert(
    roomDividerDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":room_divider_back_panel:"))
    ),
    "edge-banding schedule should include room divider rear panel edges"
  );
  assert(
    roomDividerDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("room divider 2 rear panels with 2 stabilizer feet")
    ),
    "dimension schedule should describe room divider rear finish and stabilizers"
  );
  assert(
    roomDividerDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("two-sided divider with 2 rear panels and 2 stabilizer feet")
    ),
    "drawing view schedule should describe two-sided room divider details"
  );
  const roomDividerSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(roomDivider));
  assert.strictEqual(
    roomDividerSourceRoundTrip.modules[0].roomDividerFinishedBack,
    true,
    "source definition should preserve room divider finished back flag"
  );
  assert.strictEqual(
    roomDividerSourceRoundTrip.modules[0].roomDividerStabilizerFootCount,
    2,
    "source definition should preserve room divider stabilizer foot count"
  );
  const unanchoredRoomDivider = clone(roomDivider);
  unanchoredRoomDivider.modules[0].roomDividerStabilizerFootCount = 0;
  const unanchoredRoomDividerValidation = validateCabinetDefinition(unanchoredRoomDivider);
  assert.strictEqual(
    unanchoredRoomDividerValidation.valid,
    true,
    "room divider modules without stabilizer feet should warn without blocking export"
  );
  assert(
    unanchoredRoomDividerValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.roomDividerStabilizerFootCount"
    ),
    "room divider modules without stabilizer feet should produce an anchoring warning"
  );
  const impossibleRoomDividerFeet = clone(roomDivider);
  impossibleRoomDividerFeet.modules[0].roomDividerStabilizerFootCount = 10;
  impossibleRoomDividerFeet.modules[0].roomDividerStabilizerFootWidth = 100;
  assert.strictEqual(
    validateCabinetDefinition(impossibleRoomDividerFeet).valid,
    false,
    "room divider stabilizer feet that exceed module width should fail"
  );
  const impossibleRoomDividerDepth = clone(roomDivider);
  impossibleRoomDividerDepth.modules[0].roomDividerStabilizerFootDepth = 500;
  assert.strictEqual(
    validateCabinetDefinition(impossibleRoomDividerDepth).valid,
    false,
    "room divider stabilizer feet deeper than the module should fail"
  );

  const petBuiltIn = createCabinetPreset("pet_built_in", "cabinet-test-pet-built-in-generated");
  const petBuiltInValidation = validateCabinetDefinition(petBuiltIn);
  assert.strictEqual(petBuiltInValidation.valid, true, "pet built-in preset should validate");
  const petBuiltInParts = generateCabinetParts(petBuiltIn);
  assert.strictEqual(
    petBuiltInParts.filter((part) => part.type === "lifestyle_insert_deck").length,
    1,
    "pet built-in should generate a pet insert deck"
  );
  assert.strictEqual(
    petBuiltInParts.filter((part) => part.type === "lifestyle_insert_lip").length,
    1,
    "pet built-in should generate a pet insert lip"
  );
  assert.deepStrictEqual(
    petBuiltInParts.find((part) => part.id === "module-2:lifestyle_insert_deck:1")?.size,
    { width: 558, height: 24, depth: 460 },
    "pet insert deck should follow source dimensions"
  );
  assert(
    generateCabinetBOM(petBuiltIn).some((item) => item.type === "lifestyle_insert_deck" && item.quantity === 1),
    "BOM should include pet insert deck"
  );
  const petDocumentation = generateCabinetDocumentation(petBuiltIn);
  assert(
    petDocumentation.cutList.some((item) => item.type === "lifestyle_insert_lip"),
    "cut list should include pet insert lip"
  );
  assert(
    petDocumentation.dimensionSchedule.some((item) => item.notes?.includes("1 pet bed insert")),
    "dimension schedule should describe pet insert intent"
  );
  const petSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(petBuiltIn));
  assert.strictEqual(
    petSourceRoundTrip.modules[1].lifestyleInsertKind,
    "pet_bed",
    "source definition should preserve pet insert kind"
  );

  const kidsStorage = createCabinetPreset("kids_storage", "cabinet-test-kids-storage-generated");
  const kidsStorageValidation = validateCabinetDefinition(kidsStorage);
  assert.strictEqual(kidsStorageValidation.valid, true, "kids storage preset should validate");
  const kidsParts = generateCabinetParts(kidsStorage);
  assert.strictEqual(
    kidsParts.filter((part) => part.type === "lifestyle_insert_deck").length,
    4,
    "kids storage should generate toy-bin decks"
  );
  assert.strictEqual(
    kidsParts.filter((part) => part.type === "lifestyle_insert_lip").length,
    4,
    "kids storage should generate toy-bin lips"
  );
  assert(
    generateCabinetDocumentation(kidsStorage).drawingViewSchedule.some((item) =>
      item.notes?.includes("toy bin organizer with 2 inserts")
    ),
    "drawing schedule should describe kids toy-bin inserts"
  );

  const hobbyStorage = createCabinetPreset("hobby_storage", "cabinet-test-hobby-storage-generated");
  const hobbyStorageValidation = validateCabinetDefinition(hobbyStorage);
  assert.strictEqual(hobbyStorageValidation.valid, true, "hobby storage preset should validate");
  const hobbyParts = generateCabinetParts(hobbyStorage);
  assert.strictEqual(
    hobbyParts.filter((part) => part.type === "lifestyle_insert_deck").length,
    3,
    "hobby storage should generate hobby tray decks"
  );
  assert(
    generateCabinetBOM(hobbyStorage).some((item) => item.type === "lifestyle_insert_lip" && item.quantity === 3),
    "BOM should group hobby tray lips"
  );
  const narrowLifestyle = clone(hobbyStorage);
  narrowLifestyle.modules[2].lifestyleInsertCount = 6;
  const narrowLifestyleValidation = validateCabinetDefinition(narrowLifestyle);
  assert.strictEqual(narrowLifestyleValidation.valid, true, "narrow lifestyle inserts should warn without blocking export");
  assert(
    narrowLifestyleValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.2.lifestyleInsertCount"
    ),
    "narrow lifestyle inserts should produce a usability warning"
  );
  const impossibleLifestyle = clone(petBuiltIn);
  impossibleLifestyle.modules[1].lifestyleInsertDepth = 900;
  assert.strictEqual(
    validateCabinetDefinition(impossibleLifestyle).valid,
    false,
    "lifestyle inserts deeper than the module should fail"
  );

  const libraryWall = createCabinetPreset("library_wall", "cabinet-test-library-ladder-rail");
  const libraryValidation = validateCabinetDefinition(libraryWall);
  assert.strictEqual(libraryValidation.valid, true, "library ladder rail preset should validate");
  const libraryParts = generateCabinetParts(libraryWall);
  const libraryRails = libraryParts.filter((part) => part.type === "library_ladder_rail");
  const libraryStandoffs = libraryParts.filter((part) => part.type === "library_ladder_standoff");
  const libraryLightingChannels = libraryParts.filter((part) => part.type === "led_lighting_channel");
  const libraryShelfPinRows = libraryParts.filter((part) => part.type === "shelf_pin_hole_row");
  assert.strictEqual(libraryRails.length, 3, "library wall should generate a rail segment for each bay");
  assert.strictEqual(libraryStandoffs.length, 9, "library wall should generate ladder rail standoffs");
  assert.strictEqual(libraryLightingChannels.length, 9, "library wall should generate three LED channels per bay");
  assert.strictEqual(libraryShelfPinRows.length, 12, "library wall should generate adjustable shelf pin rows for each bay");
  assert.deepStrictEqual(
    libraryRails.map((part) => part.id),
    [
      "module-1:library_ladder_rail:0",
      "module-2:library_ladder_rail:0",
      "module-3:library_ladder_rail:0",
    ],
    "library rail segment IDs should be stable"
  );
  assert.deepStrictEqual(
    libraryStandoffs.slice(0, 3).map((part) => part.id),
    [
      "module-1:library_ladder_standoff:1",
      "module-1:library_ladder_standoff:2",
      "module-1:library_ladder_standoff:3",
    ],
    "library rail standoff IDs should be stable"
  );
  assert.deepStrictEqual(
    libraryRails[0]?.size,
    { width: 1000, height: 32, depth: 32 },
    "library rail segment dimensions should follow source diameter and bay width"
  );
  assert.deepStrictEqual(
    libraryRails[0]?.position,
    { x: 0, y: 2124, z: -55 },
    "library rail segment should sit at configured height and projection"
  );
  assert.deepStrictEqual(
    libraryStandoffs[0]?.size,
    { width: 28, height: 28, depth: 55 },
    "library rail standoff dimensions should follow source settings"
  );
  assert.deepStrictEqual(
    libraryStandoffs[0]?.position,
    { x: 236, y: 2126, z: -55 },
    "library rail standoffs should divide the module width evenly"
  );
  assert.deepStrictEqual(
    libraryLightingChannels.slice(0, 3).map((part) => part.id),
    [
      "module-1:led_lighting_channel:1",
      "module-1:led_lighting_channel:2",
      "module-1:led_lighting_channel:3",
    ],
    "library lighting channel IDs should be stable"
  );
  assert.deepStrictEqual(
    libraryLightingChannels[0]?.size,
    { width: 964, height: 8, depth: 18 },
    "library lighting channel dimensions should follow source settings and interior width"
  );
  assert.deepStrictEqual(
    libraryLightingChannels[0]?.position,
    { x: 18, y: 650, z: 45 },
    "library lighting channels should sit inside the module with configured front inset"
  );
  assert.deepStrictEqual(
    libraryShelfPinRows.slice(0, 4).map((part) => part.id),
    [
      "module-1:shelf_pin_hole_row:1-left",
      "module-1:shelf_pin_hole_row:1-right",
      "module-1:shelf_pin_hole_row:2-left",
      "module-1:shelf_pin_hole_row:2-right",
    ],
    "library shelf pin row IDs should be stable"
  );
  assert.deepStrictEqual(
    libraryShelfPinRows[0]?.size,
    { width: 6, height: 358, depth: 6 },
    "shelf pin row marker dimensions should follow source settings"
  );
  assert.deepStrictEqual(
    libraryShelfPinRows[0]?.position,
    { x: 15, y: 300, z: 55 },
    "first shelf pin row should sit on the left side at the configured front inset and start height"
  );
  const libraryBOM = generateCabinetBOM(libraryWall);
  assert(
    libraryBOM.some((item) => item.type === "library_ladder_rail" && item.quantity === 3),
    "BOM should group library ladder rail segments"
  );
  assert(
    libraryBOM.some((item) => item.type === "library_ladder_standoff" && item.quantity === 9),
    "BOM should group library ladder rail standoffs"
  );
  assert(
    libraryBOM.some((item) => item.type === "led_lighting_channel" && item.quantity === 9),
    "BOM should group integrated LED lighting channels"
  );
  assert(
    libraryBOM.some((item) => item.type === "shelf_pin_hole_row" && item.quantity === 12),
    "BOM should group adjustable shelf pin rows"
  );
  const libraryDocumentation = generateCabinetDocumentation(libraryWall);
  assert(
    libraryDocumentation.cutList.every(
      (item) =>
        item.type !== "library_ladder_rail" &&
        item.type !== "library_ladder_standoff" &&
        item.type !== "led_lighting_channel" &&
        item.type !== "shelf_pin_hole_row"
    ),
    "board cut list should exclude library ladder rail, lighting, and shelf-pin hardware"
  );
  assert(
    libraryDocumentation.hardwareSchedule.some(
      (item) =>
        item.hardwareId === "library_ladder_rail" &&
        item.hardwareType === "library_ladder_rail" &&
        item.quantity === 12
    ),
    "hardware schedule should include library ladder rail components"
  );
  assert(
    libraryDocumentation.hardwareSchedule.some(
      (item) =>
        item.hardwareId === "led_strip_channel" &&
        item.hardwareType === "led_strip_channel" &&
        item.quantity === 9
    ),
    "hardware schedule should include integrated LED lighting channels"
  );
  assert(
    libraryDocumentation.hardwareSchedule.some(
      (item) =>
        item.hardwareId === "adjustable_shelf_pin_set" &&
        item.hardwareType === "shelf_pin_set" &&
        item.quantity === 12
    ),
    "hardware schedule should include adjustable shelf pin sets"
  );
  assert(
    libraryDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("library ladder rail at 2140h with 3 standoffs")
    ),
    "dimension schedule should describe library ladder rail setout"
  );
  assert(
    libraryDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("3 LED lighting channels 18d x 8h at 45 front inset")
    ),
    "dimension schedule should describe integrated lighting channel setout"
  );
  assert(
    libraryDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("shelf pin rows 2 pairs x 12 holes at 32 spacing from 300h")
    ),
    "dimension schedule should describe adjustable shelf pin row setout"
  );
  assert(
    libraryDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("library ladder rail 32 mm dia at 2140 mm high") &&
      item.notes.includes("55 mm projection")
    ),
    "drawing view schedule should describe library ladder rail projection"
  );
  assert(
    libraryDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("LED lighting 3 channels 18 mm deep x 8 mm high at 45 mm front inset")
    ),
    "drawing view schedule should describe integrated lighting channels"
  );
  assert(
    libraryDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("adjustable shelf pins 2 row pairs x 12 holes at 32 mm spacing starting 300 mm high")
    ),
    "drawing view schedule should describe adjustable shelf pin rows"
  );
  assert(
    libraryDocumentation.installerNotes.some((item) => item.id === "note:library-ladder-rail"),
    "installer notes should include library ladder rail field verification"
  );
  assert(
    libraryDocumentation.installerNotes.some((item) => item.id === "note:integrated-lighting"),
    "installer notes should include integrated lighting coordination"
  );
  assert(
    libraryDocumentation.installerNotes.some((item) => item.id === "note:adjustable-shelf-pin-rows"),
    "installer notes should include adjustable shelf pin coordination"
  );
  assert(
    buildCabinetShopDrawingSvg(libraryWall).includes("A-603 Plan Footprint"),
    "shop drawing should render library ladder rail plan markers"
  );
  assert(
      !buildCabinetFabricationDxf(libraryWall).includes("library_ladder_rail") &&
      !buildCabinetFabricationDxf(libraryWall).includes("library_ladder_standoff") &&
      !buildCabinetFabricationDxf(libraryWall).includes("led_lighting_channel") &&
      !buildCabinetFabricationDxf(libraryWall).includes("shelf_pin_hole_row"),
    "fabrication DXF should keep library hardware, lighting channels, and shelf pin rows out of the board cut list"
  );
  const librarySourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(libraryWall));
  assert.strictEqual(
    librarySourceRoundTrip.modules[0].libraryLadderRailEnabled,
    true,
    "source definition should preserve library ladder rail enablement"
  );
  assert.strictEqual(
    librarySourceRoundTrip.modules[0].libraryLadderRailHeight,
    2140,
    "source definition should preserve library ladder rail height"
  );
  assert.strictEqual(
    librarySourceRoundTrip.modules[0].lightingChannelEnabled,
    true,
    "source definition should preserve integrated lighting enablement"
  );
  assert.strictEqual(
    librarySourceRoundTrip.modules[0].lightingChannelCount,
    3,
    "source definition should preserve integrated lighting channel count"
  );
  assert.strictEqual(
    librarySourceRoundTrip.modules[0].shelfPinRowsEnabled,
    true,
    "source definition should preserve adjustable shelf pin row enablement"
  );
  assert.strictEqual(
    librarySourceRoundTrip.modules[0].shelfPinHoleSpacing,
    32,
    "source definition should preserve adjustable shelf pin spacing"
  );
  const lowLibraryRail = clone(libraryWall);
  lowLibraryRail.modules[0].libraryLadderRailHeight = 1850;
  const lowLibraryRailValidation = validateCabinetDefinition(lowLibraryRail);
  assert.strictEqual(lowLibraryRailValidation.valid, true, "low library rails should warn without blocking export");
  assert(
    lowLibraryRailValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.libraryLadderRailHeight"
    ),
    "low library rails should produce a head-clearance warning"
  );
  const crowdedLibraryStandoffs = clone(libraryWall);
  crowdedLibraryStandoffs.modules[0].libraryLadderStandoffCount = 5;
  const crowdedLibraryStandoffValidation = validateCabinetDefinition(crowdedLibraryStandoffs);
  assert.strictEqual(crowdedLibraryStandoffValidation.valid, true, "crowded library standoffs should warn without blocking export");
  assert(
    crowdedLibraryStandoffValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.libraryLadderStandoffCount"
    ),
    "crowded library standoffs should produce a hardware-crowding warning"
  );
  const impossibleLibraryRailHeight = clone(libraryWall);
  impossibleLibraryRailHeight.modules[0].libraryLadderRailHeight = 2500;
  assert.strictEqual(
    validateCabinetDefinition(impossibleLibraryRailHeight).valid,
    false,
    "library ladder rails above the module height should fail"
  );
  const impossibleLibraryStandoffs = clone(libraryWall);
  impossibleLibraryStandoffs.modules[0].libraryLadderStandoffCount = 0;
  assert.strictEqual(
    validateCabinetDefinition(impossibleLibraryStandoffs).valid,
    false,
    "library ladder rails without standoffs should fail"
  );
  const shallowLightingInset = clone(libraryWall);
  shallowLightingInset.modules[0].lightingChannelInsetFromFront = 15;
  const shallowLightingInsetValidation = validateCabinetDefinition(shallowLightingInset);
  assert.strictEqual(shallowLightingInsetValidation.valid, true, "shallow lighting front insets should warn without blocking export");
  assert(
    shallowLightingInsetValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.lightingChannelInsetFromFront"
    ),
    "shallow lighting front insets should produce a glare/detailing warning"
  );
  const tallLightingChannel = clone(libraryWall);
  tallLightingChannel.modules[0].lightingChannelHeight = 20;
  const tallLightingChannelValidation = validateCabinetDefinition(tallLightingChannel);
  assert.strictEqual(tallLightingChannelValidation.valid, true, "tall lighting channels should warn without blocking export");
  assert(
    tallLightingChannelValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.lightingChannelHeight"
    ),
    "tall lighting channels should produce a diffuser/profile warning"
  );
  const impossibleLightingDepth = clone(libraryWall);
  impossibleLightingDepth.modules[0].lightingChannelDepth = 400;
  assert.strictEqual(
    validateCabinetDefinition(impossibleLightingDepth).valid,
    false,
    "lighting channels deeper than the cabinet interior should fail"
  );
  const impossibleLightingInset = clone(libraryWall);
  impossibleLightingInset.modules[0].lightingChannelInsetFromFront = 340;
  assert.strictEqual(
    validateCabinetDefinition(impossibleLightingInset).valid,
    false,
    "lighting channel front inset plus depth beyond the back panel should fail"
  );
  const tightShelfPinSpacing = clone(libraryWall);
  tightShelfPinSpacing.modules[0].shelfPinHoleSpacing = 20;
  const tightShelfPinSpacingValidation = validateCabinetDefinition(tightShelfPinSpacing);
  assert.strictEqual(tightShelfPinSpacingValidation.valid, true, "tight shelf pin spacing should warn without blocking export");
  assert(
    tightShelfPinSpacingValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.shelfPinHoleSpacing"
    ),
    "tight shelf pin spacing should produce a drilling template warning"
  );
  const sparseShelfPinRows = clone(libraryWall);
  sparseShelfPinRows.modules[0].shelfPinHoleCount = 3;
  const sparseShelfPinRowsValidation = validateCabinetDefinition(sparseShelfPinRows);
  assert.strictEqual(sparseShelfPinRowsValidation.valid, true, "short shelf pin rows should warn without blocking export");
  assert(
    sparseShelfPinRowsValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.shelfPinHoleCount"
    ),
    "short shelf pin rows should produce an adjustment-range warning"
  );
  const impossibleShelfPinInset = clone(libraryWall);
  impossibleShelfPinInset.modules[0].shelfPinInsetFromFront = 400;
  assert.strictEqual(
    validateCabinetDefinition(impossibleShelfPinInset).valid,
    false,
    "shelf pin rows beyond the cabinet interior depth should fail"
  );
  const impossibleShelfPinStartHeight = clone(libraryWall);
  impossibleShelfPinStartHeight.modules[0].shelfPinStartHeight = 2200;
  assert.strictEqual(
    validateCabinetDefinition(impossibleShelfPinStartHeight).valid,
    false,
    "shelf pin rows taller than the module opening should fail"
  );

  const wineStorage = createCabinetPreset("wine_storage", "cabinet-test-wine-storage-generated");
  const wineStorageValidation = validateCabinetDefinition(wineStorage);
  assert.strictEqual(wineStorageValidation.valid, true, "wine storage preset should validate");
  const wineStorageParts = generateCabinetParts(wineStorage);
  const wineRackVerticalDividers = wineStorageParts.filter((part) => part.type === "wine_rack_vertical_divider");
  const wineRackHorizontalRails = wineStorageParts.filter((part) => part.type === "wine_rack_horizontal_rail");
  assert.strictEqual(wineRackVerticalDividers.length, 2, "wine storage should generate two vertical rack dividers");
  assert.strictEqual(wineRackHorizontalRails.length, 5, "wine storage should generate five horizontal rack rails");
  assert.deepStrictEqual(
    wineRackVerticalDividers.map((part) => part.id),
    ["module-2:wine_rack_vertical_divider:1", "module-2:wine_rack_vertical_divider:2"],
    "wine rack vertical divider part IDs should be stable"
  );
  assert.deepStrictEqual(
    wineRackHorizontalRails.slice(0, 2).map((part) => part.id),
    ["module-2:wine_rack_horizontal_rail:1", "module-2:wine_rack_horizontal_rail:2"],
    "wine rack horizontal rail part IDs should be stable"
  );
  assert.deepStrictEqual(
    wineRackVerticalDividers[0]?.size,
    { width: 18, height: 1998, depth: 420 },
    "wine rack vertical divider dimensions should follow source opening geometry"
  );
  assert.deepStrictEqual(
    wineRackHorizontalRails[0]?.size,
    { width: 558, height: 18, depth: 420 },
    "wine rack horizontal rail dimensions should follow source opening geometry"
  );
  assert.strictEqual(
    wineRackVerticalDividers[0]?.position.x,
    795,
    "first wine rack vertical divider should include module offset plus local bay width"
  );
  assert.strictEqual(
    wineRackHorizontalRails[0]?.position.x,
    621,
    "wine rack horizontal rails should start inside the module opening after the run offset"
  );
  assert.strictEqual(wineRackHorizontalRails[0]?.position.y, 399, "first wine rack horizontal rail should split rack rows evenly");
  const wineStorageBOM = generateCabinetBOM(wineStorage);
  assert(
    wineStorageBOM.some((item) => item.type === "wine_rack_vertical_divider" && item.quantity === 2),
    "BOM should group wine rack vertical dividers"
  );
  assert(
    wineStorageBOM.some((item) => item.type === "wine_rack_horizontal_rail" && item.quantity === 5),
    "BOM should group wine rack horizontal rails"
  );
  const wineStorageDocumentation = generateCabinetDocumentation(wineStorage);
  assert.strictEqual(
    wineStorageDocumentation.cutList.filter((item) => item.type === "wine_rack_vertical_divider").length,
    2,
    "cut list should include wine rack vertical dividers"
  );
  assert.strictEqual(
    wineStorageDocumentation.cutList.filter((item) => item.type === "wine_rack_horizontal_rail").length,
    5,
    "cut list should include wine rack horizontal rails"
  );
  assert(
    wineStorageDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":wine_rack_vertical_divider:") || partId.includes(":wine_rack_horizontal_rail:"))
    ),
    "edge-banding schedule should include wine rack divider and rail edges"
  );
  assert(
    wineStorageDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("wine rack 3 columns x 6 rows")
    ),
    "dimension schedule should describe wine rack grid counts"
  );
  assert(
    wineStorageDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("wine rack 3 columns x 6 rows")
    ),
    "drawing view schedule should describe wine rack grid counts"
  );
  assert(
    buildCabinetShopDrawingSvg(wineStorage).includes("A-603 Plan Footprint"),
    "shop drawing should render a wine storage plan footprint"
  );
  assert(
    buildCabinetFabricationDxf(wineStorage).includes("module-2:wine_rack_vertical_divider:1"),
    "fabrication DXF should label wine rack source part IDs"
  );
  const wineSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(wineStorage));
  assert.strictEqual(
    wineSourceRoundTrip.modules[1].wineRackColumnCount,
    3,
    "source definition should preserve wine rack column count"
  );
  assert.strictEqual(
    wineSourceRoundTrip.modules[1].wineRackDividerThickness,
    18,
    "source definition should preserve wine rack divider thickness"
  );
  const tightWineRack = clone(wineStorage);
  tightWineRack.modules[1].wineRackColumnCount = 8;
  tightWineRack.modules[1].wineRackRowCount = 20;
  const tightWineRackValidation = validateCabinetDefinition(tightWineRack);
  assert.strictEqual(tightWineRackValidation.valid, true, "tight wine rack bays should warn without blocking export");
  assert(
    tightWineRackValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.1.wineRackColumnCount"
    ),
    "tight wine rack columns should produce a bottle-clearance warning"
  );
  assert(
    tightWineRackValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.1.wineRackRowCount"
    ),
    "tight wine rack rows should produce a bottle-clearance warning"
  );
  const impossibleWineDepth = clone(wineStorage);
  impossibleWineDepth.modules[1].wineRackDepth = 900;
  assert.strictEqual(
    validateCabinetDefinition(impossibleWineDepth).valid,
    false,
    "wine racks deeper than the module should fail"
  );
  const impossibleWineColumns = clone(wineStorage);
  impossibleWineColumns.modules[1].wineRackColumnCount = 40;
  assert.strictEqual(
    validateCabinetDefinition(impossibleWineColumns).valid,
    false,
    "wine rack dividers that exceed opening width should fail"
  );

  const homeBar = createCabinetPreset("home_bar", "cabinet-test-home-bar-wine-rack");
  const homeBarValidation = validateCabinetDefinition(homeBar);
  assert.strictEqual(homeBarValidation.valid, true, "home bar preset should validate with wine rack detailing");
  const homeBarParts = generateCabinetParts(homeBar);
  assert.strictEqual(
    homeBarParts.filter((part) => part.type === "wine_rack_vertical_divider").length,
    1,
    "home bar rack should generate one vertical divider"
  );
  assert.strictEqual(
    homeBarParts.filter((part) => part.type === "wine_rack_horizontal_rail").length,
    3,
    "home bar rack should generate three horizontal rails"
  );
  const homeBarStemwareRails = homeBarParts.filter((part) => part.type === "stemware_rack_rail");
  assert.strictEqual(homeBarStemwareRails.length, 6, "home bar stemware rack should generate two rails per lane");
  assert.deepStrictEqual(
    homeBarStemwareRails.map((part) => part.id),
    [
      "module-1:stemware_rack_rail:1-1",
      "module-1:stemware_rack_rail:1-2",
      "module-1:stemware_rack_rail:2-1",
      "module-1:stemware_rack_rail:2-2",
      "module-1:stemware_rack_rail:3-1",
      "module-1:stemware_rack_rail:3-2",
    ],
    "stemware rack rail part IDs should be stable"
  );
  assert.deepStrictEqual(
    homeBarStemwareRails[0]?.size,
    { width: 14, height: 12, depth: 360 },
    "stemware rack rail dimensions should follow source settings"
  );
  assert.deepStrictEqual(
    homeBarStemwareRails[0]?.position,
    { x: 183, y: 1754, z: 80 },
    "first stemware rack rail should be centered in the module at the requested mount height"
  );
  const homeBarBOM = generateCabinetBOM(homeBar);
  assert(
    homeBarBOM.some((item) => item.type === "stemware_rack_rail" && item.quantity === 6),
    "BOM should group stemware rack rails"
  );
  const homeBarDocumentation = generateCabinetDocumentation(homeBar);
  assert(
    homeBarDocumentation.cutList.every((item) => item.type !== "stemware_rack_rail"),
    "board cut list should exclude stemware rack hardware rails"
  );
  assert(
    homeBarDocumentation.hardwareSchedule.some(
      (item) => item.hardwareId === "stemware_rack" && item.hardwareType === "stemware_rack" && item.quantity === 6
    ),
    "hardware schedule should group stemware rack rail hardware"
  );
  assert(
    homeBarDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("stemware rack 3 lanes 360d at 1760h")
    ),
    "dimension schedule should describe stemware rack placement"
  );
  assert(
    homeBarDocumentation.drawingViewSchedule.some(
      (item) =>
        item.notes?.includes("stemware rack 3 lanes x 360 mm deep") &&
        item.notes.includes("14 mm rails at 70 mm lane spacing")
    ),
    "drawing view schedule should describe stemware rack rails and spacing"
  );
  assert(
    homeBarDocumentation.installerNotes.some((note) => note.id === "note:stemware-rack-hardware"),
    "installer notes should include stemware rack coordination"
  );
  assert(
    buildCabinetShopDrawingSvg(homeBar).includes("A-603 Plan Footprint"),
    "shop drawing should render a home bar plan footprint"
  );
  assert(
    !buildCabinetFabricationDxf(homeBar).includes("stemware_rack_rail"),
    "fabrication DXF should exclude stemware rack hardware rails from board layouts"
  );
  const homeBarSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(homeBar));
  assert.strictEqual(
    homeBarSourceRoundTrip.modules[0].stemwareRackEnabled,
    true,
    "source definition should preserve stemware rack enabled state"
  );
  assert.strictEqual(
    homeBarSourceRoundTrip.modules[0].stemwareRackLaneCount,
    3,
    "source definition should preserve stemware rack lane count"
  );
  const tightStemwareSpacing = clone(homeBar);
  tightStemwareSpacing.modules[0].stemwareRackLaneSpacing = 45;
  const tightStemwareSpacingValidation = validateCabinetDefinition(tightStemwareSpacing);
  assert.strictEqual(tightStemwareSpacingValidation.valid, true, "tight stemware lane spacing should warn without blocking export");
  assert(
    tightStemwareSpacingValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.stemwareRackLaneSpacing"
    ),
    "tight stemware lane spacing should produce a clearance warning"
  );
  const shallowStemwareRack = clone(homeBar);
  shallowStemwareRack.modules[0].stemwareRackDepth = 220;
  const shallowStemwareRackValidation = validateCabinetDefinition(shallowStemwareRack);
  assert.strictEqual(shallowStemwareRackValidation.valid, true, "shallow stemware racks should warn without blocking export");
  assert(
    shallowStemwareRackValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.stemwareRackDepth"
    ),
    "shallow stemware rack depth should produce a capacity warning"
  );
  const impossibleStemwareDepth = clone(homeBar);
  impossibleStemwareDepth.modules[0].stemwareRackDepth = 700;
  assert.strictEqual(
    validateCabinetDefinition(impossibleStemwareDepth).valid,
    false,
    "stemware rack depth deeper than the module should fail"
  );
  const impossibleStemwareLanes = clone(homeBar);
  impossibleStemwareLanes.modules[0].stemwareRackLaneCount = 8;
  assert.strictEqual(
    validateCabinetDefinition(impossibleStemwareLanes).valid,
    false,
    "stemware rack lanes wider than the module should fail"
  );

  const windowSeat = createCabinetPreset("window_seat", "cabinet-test-window-seat-generated");
  const windowSeatValidation = validateCabinetDefinition(windowSeat);
  assert.strictEqual(windowSeatValidation.valid, true, "window seat preset should validate");
  const windowSeatParts = generateCabinetParts(windowSeat);
  const windowSeatDecks = windowSeatParts.filter((part) => part.type === "seat_deck_panel");
  const windowSeatCushions = windowSeatParts.filter((part) => part.type === "seat_cushion");
  assert.strictEqual(windowSeatDecks.length, 2, "window seat should generate one seat deck per module");
  assert.strictEqual(windowSeatCushions.length, 2, "window seat should generate one cushion placeholder per module");
  assert.strictEqual(
    windowSeatParts.filter((part) => part.type === "seat_back_panel").length,
    0,
    "window seat preset should not generate back panels unless configured"
  );
  assert.deepStrictEqual(
    windowSeatDecks.map((part) => part.id),
    ["module-1:seat_deck_panel:0", "module-2:seat_deck_panel:0"],
    "window seat deck part IDs should be stable"
  );
  assert.deepStrictEqual(
    windowSeatDecks[0]?.size,
    { width: 900, height: 24, depth: 540 },
    "window seat deck should include the front overhang"
  );
  assert.deepStrictEqual(
    windowSeatDecks[0]?.position,
    { x: 0, y: 380, z: -20 },
    "window seat deck should sit on top of the base carcass with front overhang"
  );
  assert.deepStrictEqual(
    windowSeatCushions[0]?.size,
    { width: 900, height: 75, depth: 540 },
    "window seat cushion should follow the source cushion dimensions"
  );
  assert.strictEqual(
    windowSeatCushions[0]?.materialId,
    "upholstery_neutral",
    "seat cushions should use the upholstery placeholder material"
  );
  const windowSeatBOM = generateCabinetBOM(windowSeat);
  assert(
    windowSeatBOM.some((item) => item.type === "seat_deck_panel" && item.quantity === 2),
    "BOM should group window seat deck panels"
  );
  assert(
    windowSeatBOM.some((item) => item.type === "seat_cushion" && item.quantity === 2),
    "BOM should group window seat cushion placeholders"
  );
  const windowSeatDocumentation = generateCabinetDocumentation(windowSeat);
  assert.strictEqual(
    windowSeatDocumentation.cutList.filter((item) => item.type === "seat_deck_panel").length,
    2,
    "cut list should include window seat deck panels"
  );
  assert(
    windowSeatDocumentation.cutList.every((item) => item.type !== "seat_cushion"),
    "board cut list should exclude upholstery cushion placeholders"
  );
  assert(
    windowSeatDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":seat_deck_panel:"))
    ),
    "edge-banding schedule should include seat deck edges"
  );
  assert(
    windowSeatDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("seat deck 24 mm with 75 mm cushion")
    ),
    "dimension schedule should describe window seat deck and cushion"
  );
  assert(
    windowSeatDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("seating deck 24 mm with 75 mm cushion")
    ),
    "drawing view schedule should describe window seat cushion geometry"
  );
  assert(
    buildCabinetShopDrawingSvg(windowSeat).includes("A-601 Overall Front Elevation"),
    "shop drawing should render a window seat front elevation"
  );
  assert(
    buildCabinetFabricationDxf(windowSeat).includes("module-1:seat_deck_panel:0"),
    "fabrication DXF should label window seat deck source part IDs"
  );
  const windowSeatSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(windowSeat));
  assert.strictEqual(
    windowSeatSourceRoundTrip.modules[0].seatCushionThickness,
    75,
    "source definition should preserve seat cushion thickness"
  );
  assert.strictEqual(
    windowSeatSourceRoundTrip.modules[0].seatCushionOverhangFront,
    20,
    "source definition should preserve seat cushion overhang"
  );

  const banquette = createCabinetPreset("banquette", "cabinet-test-banquette-generated");
  const banquetteValidation = validateCabinetDefinition(banquette);
  assert.strictEqual(banquetteValidation.valid, true, "banquette preset should validate");
  const banquetteParts = generateCabinetParts(banquette);
  const banquetteDecks = banquetteParts.filter((part) => part.type === "seat_deck_panel");
  const banquetteCushions = banquetteParts.filter((part) => part.type === "seat_cushion");
  const banquetteBacks = banquetteParts.filter((part) => part.type === "seat_back_panel");
  assert.strictEqual(banquetteDecks.length, 2, "banquette should generate seat deck panels");
  assert.strictEqual(banquetteCushions.length, 2, "banquette should generate cushion placeholders");
  assert.strictEqual(banquetteBacks.length, 2, "banquette should generate seat back panels");
  assert.deepStrictEqual(
    banquetteDecks[0]?.size,
    { width: 1100, height: 24, depth: 610 },
    "banquette seat deck should include the larger front overhang"
  );
  assert.deepStrictEqual(
    banquetteCushions[0]?.size,
    { width: 1100, height: 80, depth: 610 },
    "banquette cushion should follow source dimensions"
  );
  assert.deepStrictEqual(
    banquetteBacks[0]?.size,
    { width: 1100, height: 420, depth: 24 },
    "banquette back panel should follow source dimensions"
  );
  assert.deepStrictEqual(
    banquetteBacks[0]?.position,
    { x: 0, y: 384, z: 556 },
    "banquette back panel should sit on the deck at the rear of the module"
  );
  const banquetteBOM = generateCabinetBOM(banquette);
  assert(
    banquetteBOM.some((item) => item.type === "seat_deck_panel" && item.quantity === 2),
    "BOM should group banquette seat decks"
  );
  assert(
    banquetteBOM.some((item) => item.type === "seat_back_panel" && item.quantity === 2),
    "BOM should group banquette back panels"
  );
  const banquetteDocumentation = generateCabinetDocumentation(banquette);
  assert.strictEqual(
    banquetteDocumentation.cutList.filter((item) => item.type === "seat_back_panel").length,
    2,
    "cut list should include banquette back panels"
  );
  assert(
    banquetteDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":seat_back_panel:"))
    ),
    "edge-banding schedule should include banquette back panel edges"
  );
  assert(
    banquetteDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("seat deck 24 mm with 80 mm cushion and 420h back")
    ),
    "dimension schedule should describe banquette seat back geometry"
  );
  assert(
    banquetteDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("seat back 420h")
    ),
    "drawing view schedule should describe banquette seat back geometry"
  );
  const banquetteSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(banquette));
  assert.strictEqual(
    banquetteSourceRoundTrip.modules[0].seatBackHeight,
    420,
    "source definition should preserve banquette back height"
  );
  assert.strictEqual(
    banquetteSourceRoundTrip.modules[0].seatBackThickness,
    24,
    "source definition should preserve banquette back thickness"
  );
  const tallSeat = clone(windowSeat);
  tallSeat.modules[0].height = 500;
  const tallSeatValidation = validateCabinetDefinition(tallSeat);
  assert.strictEqual(tallSeatValidation.valid, true, "unusual finished seat heights should warn without blocking export");
  assert(
    tallSeatValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.seatCushionThickness"
    ),
    "unusual finished seat heights should produce a seating comfort warning"
  );
  const unsupportedSeat = clone(windowSeat);
  unsupportedSeat.modules[0].seatDeckThickness = 0;
  assert.strictEqual(
    validateCabinetDefinition(unsupportedSeat).valid,
    false,
    "seating details without a positive deck thickness should fail"
  );
  const negativeSeatOverhang = clone(windowSeat);
  negativeSeatOverhang.modules[0].seatCushionOverhangFront = -10;
  assert.strictEqual(
    validateCabinetDefinition(negativeSeatOverhang).valid,
    false,
    "negative seating overhangs should fail"
  );
  const thinSeatBack = clone(banquette);
  thinSeatBack.modules[0].seatBackThickness = 8;
  const thinSeatBackValidation = validateCabinetDefinition(thinSeatBack);
  assert.strictEqual(thinSeatBackValidation.valid, true, "thin seat backs should warn without blocking export");
  assert(
    thinSeatBackValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.seatBackThickness"
    ),
    "thin seat backs should produce an anchoring/stiffness warning"
  );

  const mudroomStorage = createCabinetPreset("mudroom_storage", "cabinet-test-mudroom-generated");
  const mudroomValidation = validateCabinetDefinition(mudroomStorage);
  assert.strictEqual(mudroomValidation.valid, true, "mudroom storage preset should validate");
  const mudroomParts = generateCabinetParts(mudroomStorage);
  const mudroomHookRails = mudroomParts.filter((part) => part.type === "mudroom_hook_rail");
  const mudroomHooks = mudroomParts.filter((part) => part.type === "mudroom_hook");
  const shoeCubbyDividers = mudroomParts.filter((part) => part.type === "shoe_cubby_vertical_divider");
  const shoeCubbyShelves = mudroomParts.filter((part) => part.type === "shoe_cubby_shelf");
  assert.strictEqual(mudroomHookRails.length, 1, "mudroom bench should generate one hook rail");
  assert.strictEqual(mudroomHooks.length, 4, "mudroom bench should generate hook hardware");
  assert.strictEqual(shoeCubbyDividers.length, 3, "mudroom bench should generate shoe cubby dividers");
  assert.strictEqual(shoeCubbyShelves.length, 1, "mudroom bench should generate a shoe cubby shelf");
  assert.deepStrictEqual(
    mudroomHookRails[0]?.size,
    { width: 1200, height: 120, depth: 18 },
    "mudroom hook rail should span the center bench module"
  );
  assert.deepStrictEqual(
    mudroomHookRails[0]?.position,
    { x: 600, y: 1390, z: 426 },
    "mudroom hook rail should sit at the configured rail height on the back plane"
  );
  assert.deepStrictEqual(
    mudroomHooks.slice(0, 2).map((part) => part.id),
    ["module-2:mudroom_hook:1", "module-2:mudroom_hook:2"],
    "mudroom hook IDs should be stable"
  );
  assert.deepStrictEqual(
    mudroomHooks[0]?.size,
    { width: 28, height: 72, depth: 55 },
    "mudroom hook size should follow the generated hardware placeholder dimensions"
  );
  assert.deepStrictEqual(
    mudroomHooks[0]?.position,
    { x: 826, y: 1414, z: 389 },
    "first mudroom hook should be evenly spaced on the hook rail"
  );
  assert.strictEqual(mudroomHooks[0]?.skuId, "CAB-HW-MUD-HOOK", "mudroom hooks should carry a hardware SKU");
  assert.deepStrictEqual(
    shoeCubbyDividers.map((part) => part.id),
    [
      "module-2:shoe_cubby_vertical_divider:1",
      "module-2:shoe_cubby_vertical_divider:2",
      "module-2:shoe_cubby_vertical_divider:3",
    ],
    "shoe cubby divider IDs should be stable"
  );
  assert.deepStrictEqual(
    shoeCubbyDividers[0]?.size,
    { width: 18, height: 170, depth: 360 },
    "shoe cubby vertical divider should follow source cubby dimensions"
  );
  assert.strictEqual(
    shoeCubbyDividers[0]?.position.x,
    897,
    "shoe cubby dividers should include module offset and equal bay spacing"
  );
  assert.deepStrictEqual(
    shoeCubbyShelves[0]?.size,
    { width: 1158, height: 18, depth: 360 },
    "shoe cubby shelf should span the interior opening"
  );
  assert.deepStrictEqual(
    shoeCubbyShelves[0]?.position,
    { x: 621, y: 251, z: 0 },
    "shoe cubby shelf should sit above the configured shoe opening"
  );
  const mudroomBOM = generateCabinetBOM(mudroomStorage);
  assert(
    mudroomBOM.some((item) => item.type === "mudroom_hook" && item.quantity === 4),
    "BOM should group mudroom hook hardware"
  );
  assert(
    mudroomBOM.some((item) => item.type === "shoe_cubby_vertical_divider" && item.quantity === 3),
    "BOM should group shoe cubby dividers"
  );
  const mudroomDocumentation = generateCabinetDocumentation(mudroomStorage);
  assert.strictEqual(
    mudroomDocumentation.cutList.filter((item) => item.type === "mudroom_hook_rail").length,
    1,
    "cut list should include the mudroom hook rail"
  );
  assert.strictEqual(
    mudroomDocumentation.cutList.filter((item) => item.type === "shoe_cubby_vertical_divider").length,
    3,
    "cut list should include shoe cubby dividers"
  );
  assert(
    mudroomDocumentation.cutList.every((item) => item.type !== "mudroom_hook"),
    "board cut list should exclude mudroom hook hardware"
  );
  assert(
    mudroomDocumentation.hardwareSchedule.some(
      (item) => item.hardwareId === "mudroom_wall_hook" && item.hardwareType === "mudroom_hook" && item.quantity === 4
    ),
    "hardware schedule should include generated mudroom hooks"
  );
  assert(
    mudroomDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":mudroom_hook_rail:") || partId.includes(":shoe_cubby_"))
    ),
    "edge-banding schedule should include mudroom rail and shoe cubby board edges"
  );
  assert(
    mudroomDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("4 mudroom hooks at 1450h") && item.notes.includes("4 shoe cubbies 170h x 360d")
    ),
    "dimension schedule should describe mudroom hooks and shoe cubbies"
  );
  assert(
    mudroomDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("4 mudroom hooks on rail at 1450 mm")
    ),
    "drawing view schedule should describe mudroom hook rail placement"
  );
  assert(
    buildCabinetShopDrawingSvg(mudroomStorage).includes("A-603 Plan Footprint"),
    "shop drawing should render a mudroom plan footprint"
  );
  assert(
    buildCabinetFabricationDxf(mudroomStorage).includes("module-2:shoe_cubby_vertical_divider:1"),
    "fabrication DXF should label shoe cubby source part IDs"
  );
  const mudroomSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(mudroomStorage));
  assert.strictEqual(
    mudroomSourceRoundTrip.modules[1].mudroomHookCount,
    4,
    "source definition should preserve mudroom hook count"
  );
  assert.strictEqual(
    mudroomSourceRoundTrip.modules[1].shoeCubbyDepth,
    360,
    "source definition should preserve shoe cubby depth"
  );
  const crowdedMudroom = clone(mudroomStorage);
  crowdedMudroom.modules[1].mudroomHookCount = 8;
  crowdedMudroom.modules[1].shoeCubbyCount = 8;
  const crowdedMudroomValidation = validateCabinetDefinition(crowdedMudroom);
  assert.strictEqual(crowdedMudroomValidation.valid, true, "crowded mudroom details should warn without blocking export");
  assert(
    crowdedMudroomValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.1.mudroomHookCount"
    ),
    "crowded mudroom hooks should produce a spacing warning"
  );
  assert(
    crowdedMudroomValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.1.shoeCubbyCount"
    ),
    "crowded shoe cubbies should produce a footwear clearance warning"
  );
  const impossibleMudroomHookHeight = clone(mudroomStorage);
  impossibleMudroomHookHeight.modules[1].mudroomHookRailHeight = 2100;
  assert.strictEqual(
    validateCabinetDefinition(impossibleMudroomHookHeight).valid,
    false,
    "mudroom hook rails above the assembly height should fail"
  );
  const impossibleShoeDepth = clone(mudroomStorage);
  impossibleShoeDepth.modules[1].shoeCubbyDepth = 600;
  assert.strictEqual(
    validateCabinetDefinition(impossibleShoeDepth).valid,
    false,
    "shoe cubbies deeper than the module should fail"
  );

  const slatWall = createCabinetPreset("slat_wall", "cabinet-test-slat-wall");
  const slatWallValidation = validateCabinetDefinition(slatWall);
  assert.strictEqual(slatWallValidation.valid, true, "slat wall preset should validate");
  const slatWallParts = generateCabinetParts(slatWall);
  const slatParts = slatWallParts.filter((part) => part.type === "slat");
  assert.strictEqual(slatParts.length, 24, "slat wall should generate slat parts for each module");
  assert.deepStrictEqual(
    slatParts.slice(0, 4).map((part) => part.id),
    ["module-1:slat:1", "module-1:slat:2", "module-1:slat:3", "module-1:slat:4"],
    "slat part IDs should be stable"
  );
  assert.strictEqual(slatParts[0]?.size.width, 32, "slat width should follow the module source definition");
  assert.strictEqual(slatParts[0]?.size.depth, 38, "slat depth should follow the module source definition");
  assert(
    generateCabinetBOM(slatWall).some((item) => item.type === "slat" && item.quantity === 24),
    "BOM should group matching slat wall strips"
  );
  const slatWallDocumentation = generateCabinetDocumentation(slatWall);
  assert(
    slatWallDocumentation.cutList.filter((item) => item.type === "slat").length === 24,
    "cut list should include generated slat strips"
  );
  assert(
    slatWallDocumentation.materialSchedule.some((item) => item.materialId === "walnut_veneer"),
    "material schedule should include slat material"
  );
  assert(
    slatWallDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":slat:"))
    ),
    "edge-banding schedule should include slat strip edges"
  );
  assert(
    slatWallDocumentation.dimensionSchedule.some((item) => item.notes?.includes("4 slats")),
    "dimension schedule should describe slat counts"
  );
  const slatWallSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(slatWall));
  assert.strictEqual(
    slatWallSourceRoundTrip.modules[0].slatCount,
    4,
    "source definition should preserve slat count"
  );
  const tightSlatWall = clone(slatWall);
  tightSlatWall.modules[0].slatSpacing = 4;
  const tightSlatWallValidation = validateCabinetDefinition(tightSlatWall);
  assert.strictEqual(tightSlatWallValidation.valid, true, "tight slat spacing should warn without blocking export");
  assert(
    tightSlatWallValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.slatSpacing"
    ),
    "tight slat spacing should produce a spacing warning"
  );

  const fitCabinet = clone(base);
  fitCabinet.leftFillerWidth = 50;
  fitCabinet.rightFillerWidth = 75;
  fitCabinet.leftFillerScribeAllowance = 12;
  fitCabinet.rightFillerScribeAllowance = 18;
  fitCabinet.includeLeftEndPanel = true;
  fitCabinet.includeRightEndPanel = true;
  fitCabinet.totalWidth = getCabinetOverallWidth(fitCabinet);
  const fitValidation = validateCabinetDefinition(fitCabinet);
  assert.strictEqual(fitValidation.valid, true, "fillers and end panels should preserve valid geometry");
  const fitParts = generateCabinetParts(fitCabinet);
  const leftFillerPart = fitParts.find((part) => part.type === "filler" && part.metadata?.side === "left");
  const rightFillerPart = fitParts.find((part) => part.type === "filler" && part.metadata?.side === "right");
  assert.strictEqual(fitCabinet.totalWidth, 1061, "overall width should include fillers and finished end panels");
  assert.strictEqual(fitParts.filter((part) => part.type === "filler").length, 2, "fit cabinet should generate two filler parts");
  assert.strictEqual(fitParts.filter((part) => part.type === "end_panel").length, 2, "fit cabinet should generate two finished end panels");
  assert(leftFillerPart, "left filler should be generated");
  assert(rightFillerPart, "right filler should be generated");
  assert.strictEqual(leftFillerPart?.position.x, -12, "left filler cut part should extend into scribe allowance outside installed footprint");
  assert.strictEqual(leftFillerPart?.size.width, 62, "left filler cut width should include scribe allowance");
  assert.strictEqual(rightFillerPart?.size.width, 93, "right filler cut width should include scribe allowance");
  assert.strictEqual(leftFillerPart?.metadata?.installedWidth, 50, "left filler metadata should keep installed width");
  assert.strictEqual(leftFillerPart?.metadata?.scribeAllowance, 12, "left filler metadata should keep scribe allowance");
  assert.strictEqual(leftFillerPart?.metadata?.cutWidth, 62, "left filler metadata should keep cut width");
  assert.strictEqual(rightFillerPart?.metadata?.installedWidth, 75, "right filler metadata should keep installed width");
  assert.strictEqual(rightFillerPart?.metadata?.scribeAllowance, 18, "right filler metadata should keep scribe allowance");
  assert.strictEqual(rightFillerPart?.metadata?.cutWidth, 93, "right filler metadata should keep cut width");
  assert.strictEqual(
    fitParts.find((part) => part.type === "left_side_panel")?.position.x,
    68,
    "module geometry should start after left filler and left end panel"
  );
  assert(
    generateCabinetBOM(fitCabinet).filter((item) => item.type === "filler").reduce((sum, item) => sum + item.quantity, 0) === 2,
    "BOM should include generated filler quantities"
  );
  assert(
    generateCabinetBOM(fitCabinet).some((item) => item.type === "end_panel" && item.quantity === 2),
    "BOM should group matching finished end panels"
  );
  const fitDocumentation = generateCabinetDocumentation(fitCabinet);
  assert(
    fitDocumentation.cutList.some((item) => item.type === "filler"),
    "cut list should include generated filler parts"
  );
  assert(
    fitDocumentation.cutList.some((item) => item.type === "filler" && item.width === 62 && item.notes?.includes("12 mm field-scribe allowance")),
    "cut list should describe left filler cut width and scribe allowance"
  );
  assert(
    fitDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("left filler 50w plus 12 scribe allowance")
    ),
    "dimension schedule should describe filler scribe allowances"
  );
  assert(
    fitDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("Left filler installed 50 mm, cut 62 mm")
    ),
    "drawing view schedule should describe installed and cut filler widths"
  );
  assert(
    fitDocumentation.installerNotes.some((item) => item.id === "note:filler-scribe-allowance"),
    "installer notes should include filler scribe field verification"
  );
  assert(
    fitDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":filler:"))
    ),
    "edge-banding schedule should include visible filler edges"
  );
  const fitSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(fitCabinet));
  assert.strictEqual(fitSourceRoundTrip.leftFillerWidth, 50, "source definition should preserve left filler width");
  assert.strictEqual(fitSourceRoundTrip.leftFillerScribeAllowance, 12, "source definition should preserve left filler scribe allowance");
  assert.strictEqual(fitSourceRoundTrip.rightFillerScribeAllowance, 18, "source definition should preserve right filler scribe allowance");
  assert.strictEqual(fitSourceRoundTrip.includeRightEndPanel, true, "source definition should preserve right end panel flag");

  const wideScribeCabinet = clone(fitCabinet);
  wideScribeCabinet.leftFillerScribeAllowance = 40;
  const wideScribeValidation = validateCabinetDefinition(wideScribeCabinet);
  assert.strictEqual(wideScribeValidation.valid, true, "wide filler scribe allowance should warn without blocking export");
  assert(
    wideScribeValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "leftFillerScribeAllowance"
    ),
    "wide filler scribe allowance should produce a field-verification warning"
  );

  const orphanScribeCabinet = clone(base);
  orphanScribeCabinet.leftFillerScribeAllowance = 12;
  assert.strictEqual(
    validateCabinetDefinition(orphanScribeCabinet).valid,
    false,
    "filler scribe allowance without a filler width should fail"
  );

  const customEndPanelCabinet = clone(base);
  customEndPanelCabinet.includeLeftEndPanel = true;
  customEndPanelCabinet.includeRightEndPanel = true;
  customEndPanelCabinet.leftEndPanelThickness = 24;
  customEndPanelCabinet.rightEndPanelThickness = 30;
  customEndPanelCabinet.totalWidth = getCabinetOverallWidth(customEndPanelCabinet);
  const customEndPanelValidation = validateCabinetDefinition(customEndPanelCabinet);
  assert.strictEqual(customEndPanelValidation.valid, true, "custom finished end panel thickness should validate");
  assert.strictEqual(customEndPanelCabinet.totalWidth, 954, "overall width should include custom finished end panel thickness");
  const customEndPanelParts = generateCabinetParts(customEndPanelCabinet);
  const leftEndPanelPart = customEndPanelParts.find((part) => part.type === "end_panel" && part.metadata?.side === "left");
  const rightEndPanelPart = customEndPanelParts.find((part) => part.type === "end_panel" && part.metadata?.side === "right");
  assert.strictEqual(leftEndPanelPart?.size.width, 24, "left finished end panel width should use custom thickness");
  assert.strictEqual(rightEndPanelPart?.size.width, 30, "right finished end panel width should use custom thickness");
  assert.strictEqual(leftEndPanelPart?.metadata?.thickness, 24, "left end panel metadata should keep custom thickness");
  assert.strictEqual(rightEndPanelPart?.metadata?.thickness, 30, "right end panel metadata should keep custom thickness");
  assert.strictEqual(
    customEndPanelParts.find((part) => part.type === "left_side_panel")?.position.x,
    24,
    "module geometry should start after custom left end panel thickness"
  );
  assert(
    generateCabinetBOM(customEndPanelCabinet).filter((item) => item.type === "end_panel").reduce((sum, item) => sum + item.quantity, 0) === 2,
    "BOM should include custom finished end panel quantities"
  );
  const customEndPanelDocumentation = generateCabinetDocumentation(customEndPanelCabinet);
  assert(
    customEndPanelDocumentation.cutList.some((item) =>
      item.type === "end_panel" && item.width === 24 && item.notes?.includes("24 mm thick visible end")
    ),
    "cut list should describe custom finished end panel thickness"
  );
  assert(
    customEndPanelDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("left finished end panel 24 thick")
    ),
    "dimension schedule should describe custom finished end panel thickness"
  );
  assert(
    customEndPanelDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("Left finished end panel 24 mm thick")
    ),
    "drawing view schedule should describe custom finished end panel thickness"
  );
  const customEndPanelSourceRoundTrip = parseCabinetSourceDefinitionJson(
    buildCabinetSourceDefinitionJson(customEndPanelCabinet)
  );
  assert.strictEqual(
    customEndPanelSourceRoundTrip.leftEndPanelThickness,
    24,
    "source definition should preserve left finished end panel thickness"
  );
  assert.strictEqual(
    customEndPanelSourceRoundTrip.rightEndPanelThickness,
    30,
    "source definition should preserve right finished end panel thickness"
  );

  const thinEndPanelCabinet = clone(customEndPanelCabinet);
  thinEndPanelCabinet.leftEndPanelThickness = 8;
  thinEndPanelCabinet.totalWidth = getCabinetOverallWidth(thinEndPanelCabinet);
  const thinEndPanelValidation = validateCabinetDefinition(thinEndPanelCabinet);
  assert.strictEqual(thinEndPanelValidation.valid, true, "thin end panels should warn without blocking export");
  assert(
    thinEndPanelValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "leftEndPanelThickness"
    ),
    "thin end panels should produce a review warning"
  );

  const invalidEndPanelCabinet = clone(base);
  invalidEndPanelCabinet.includeLeftEndPanel = true;
  invalidEndPanelCabinet.leftEndPanelThickness = 0;
  assert.strictEqual(
    validateCabinetDefinition(invalidEndPanelCabinet).valid,
    false,
    "enabled finished end panel with zero thickness should fail"
  );

  const countertopCabinet = clone(base);
  countertopCabinet.includeCountertop = true;
  countertopCabinet.countertopThickness = 40;
  countertopCabinet.countertopOverhangLeft = 30;
  countertopCabinet.countertopOverhangRight = 30;
  countertopCabinet.countertopOverhangFront = 35;
  countertopCabinet.countertopOverhangBack = 5;
  countertopCabinet.countertopMaterialId = "walnut_veneer";
  countertopCabinet.totalWidth = getCabinetOverallWidth(countertopCabinet);
  countertopCabinet.height = getCabinetOverallHeight(countertopCabinet);
  countertopCabinet.depth = getCabinetOverallDepth(countertopCabinet);
  const countertopValidation = validateCabinetDefinition(countertopCabinet);
  assert.strictEqual(countertopValidation.valid, true, "countertop settings should preserve valid geometry");
  assert.strictEqual(countertopCabinet.totalWidth, 960, "overall width should include countertop side overhangs");
  assert.strictEqual(countertopCabinet.height, 760, "overall height should include countertop thickness");
  assert.strictEqual(countertopCabinet.depth, 620, "overall depth should include countertop front/back overhangs");
  const countertopParts = generateCabinetParts(countertopCabinet);
  const countertopPart = countertopParts.find((part) => part.type === "countertop");
  assert(countertopPart, "countertop-enabled cabinet should generate a countertop part");
  assert.deepStrictEqual(
    countertopPart?.size,
    { width: 960, height: 40, depth: 620 },
    "countertop part should span the generated footprint"
  );
  assert.strictEqual(
    countertopParts.find((part) => part.type === "left_side_panel")?.position.x,
    30,
    "casework should start after countertop left overhang"
  );
  assert.strictEqual(
    countertopParts.find((part) => part.type === "left_side_panel")?.position.z,
    35,
    "casework should start after countertop front overhang"
  );
  assert(
    generateCabinetBOM(countertopCabinet).some((item) => item.type === "countertop" && item.materialId === "walnut_veneer"),
    "BOM should include countertop material"
  );
  const countertopDocumentation = generateCabinetDocumentation(countertopCabinet);
  assert(
    countertopDocumentation.cutList.some((item) => item.type === "countertop" && item.edgeBandingMm === 3160),
    "cut list should include countertop perimeter edge details"
  );
  assert(
    countertopDocumentation.materialSchedule.some((item) => item.materialId === "walnut_veneer"),
    "material schedule should include countertop material"
  );
  const countertopSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(countertopCabinet));
  assert.strictEqual(countertopSourceRoundTrip.includeCountertop, true, "source definition should preserve countertop flag");
  assert.strictEqual(countertopSourceRoundTrip.countertopMaterialId, "walnut_veneer", "source definition should preserve countertop material");

  const backsplashCabinet = clone(countertopCabinet);
  backsplashCabinet.includeBacksplash = true;
  backsplashCabinet.backsplashHeight = 120;
  backsplashCabinet.backsplashThickness = 16;
  backsplashCabinet.backsplashMaterialId = "painted_shaker_white";
  backsplashCabinet.totalWidth = getCabinetOverallWidth(backsplashCabinet);
  backsplashCabinet.height = getCabinetOverallHeight(backsplashCabinet);
  backsplashCabinet.depth = getCabinetOverallDepth(backsplashCabinet);
  const backsplashValidation = validateCabinetDefinition(backsplashCabinet);
  assert.strictEqual(backsplashValidation.valid, true, "backsplash settings should preserve valid worktop geometry");
  assert.strictEqual(backsplashCabinet.height, 880, "overall height should include countertop and backsplash");
  const backsplashParts = generateCabinetParts(backsplashCabinet);
  const backsplashPart = backsplashParts.find((part) => part.type === "backsplash");
  assert(backsplashPart, "backsplash-enabled cabinet should generate a rear upstand part");
  assert.deepStrictEqual(
    backsplashPart?.size,
    { width: 960, height: 120, depth: 16 },
    "backsplash part should span the worktop width with configured height and thickness"
  );
  assert.deepStrictEqual(
    backsplashPart?.position,
    { x: 0, y: 760, z: 604 },
    "backsplash part should sit on the countertop at the rear edge"
  );
  assert.strictEqual(backsplashPart?.materialId, "painted_shaker_white", "backsplash material should use its explicit source material");
  assert(
    generateCabinetBOM(backsplashCabinet).some(
      (item) => item.type === "backsplash" && item.materialId === "painted_shaker_white"
    ),
    "BOM should include backsplash material"
  );
  const backsplashDocumentation = generateCabinetDocumentation(backsplashCabinet);
  assert(
    backsplashDocumentation.cutList.some(
      (item) => item.type === "backsplash" && item.edgeBandingMm === 1200
    ),
    "cut list should include backsplash exposed top/end edge details"
  );
  assert(
    backsplashDocumentation.materialSchedule.some((item) => item.materialId === "painted_shaker_white"),
    "material schedule should include backsplash material"
  );
  assert(
    backsplashDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("backsplash/upstand 120h x 16 thick")
    ),
    "dimension schedule should describe backsplash setout"
  );
  assert(
    backsplashDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("Backsplash/upstand 120 mm high x 16 mm thick")
    ),
    "drawing view schedule should describe backsplash setout"
  );
  assert(
    backsplashDocumentation.installerNotes.some(
      (item) => item.id === "note:backsplash-upstand" && item.message.includes("height 120 mm")
    ),
    "installer notes should include backsplash field verification"
  );
  const backsplashSvg = buildCabinetShopDrawingSvg(backsplashCabinet);
  assert(
    backsplashSvg.includes('data-backsplash-height="120"') &&
      backsplashSvg.includes("backsplash/upstand 120 mm high"),
    "shop drawing SVG should label backsplash height"
  );
  const backsplashSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(backsplashCabinet));
  assert.strictEqual(backsplashSourceRoundTrip.includeBacksplash, true, "source definition should preserve backsplash flag");
  assert.strictEqual(backsplashSourceRoundTrip.backsplashHeight, 120, "source definition should preserve backsplash height");
  assert.strictEqual(backsplashSourceRoundTrip.backsplashThickness, 16, "source definition should preserve backsplash thickness");
  assert.strictEqual(backsplashSourceRoundTrip.backsplashMaterialId, "painted_shaker_white", "source definition should preserve backsplash material");

  const backsplashWithoutTop = clone(base);
  backsplashWithoutTop.includeBacksplash = true;
  backsplashWithoutTop.backsplashHeight = 100;
  backsplashWithoutTop.backsplashThickness = 18;
  assert.strictEqual(
    validateCabinetDefinition(backsplashWithoutTop).valid,
    false,
    "backsplash without an enabled countertop should fail"
  );

  const tallBacksplash = clone(backsplashCabinet);
  tallBacksplash.backsplashHeight = 480;
  tallBacksplash.height = getCabinetOverallHeight(tallBacksplash);
  const tallBacksplashValidation = validateCabinetDefinition(tallBacksplash);
  assert.strictEqual(tallBacksplashValidation.valid, true, "tall backsplash should warn without blocking export");
  assert(
    tallBacksplashValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "backsplashHeight"
    ),
    "tall backsplash should produce a review warning"
  );

  const kitchenIsland = createCabinetPreset("kitchen_island", "cabinet-test-kitchen-island-seating");
  const kitchenIslandValidation = validateCabinetDefinition(kitchenIsland);
  assert.strictEqual(kitchenIslandValidation.valid, true, "kitchen island seating-overhang preset should validate");
  assert.strictEqual(kitchenIsland.totalWidth, 2440, "kitchen island width should include countertop side overhangs");
  assert.strictEqual(kitchenIsland.height, 900, "kitchen island finished height should include the countertop");
  assert.strictEqual(kitchenIsland.depth, 1245, "kitchen island depth should include seating-side overhang");
  const kitchenIslandParts = generateCabinetParts(kitchenIsland);
  const kitchenIslandCountertop = kitchenIslandParts.find((part) => part.type === "countertop");
  const islandSupportPanels = kitchenIslandParts.filter((part) => part.type === "island_overhang_support_panel");
  assert(kitchenIslandCountertop, "kitchen island should generate an island countertop");
  assert.strictEqual(islandSupportPanels.length, 3, "kitchen island should generate seating-overhang support panels");
  assert.deepStrictEqual(
    kitchenIslandCountertop?.size,
    { width: 2440, height: 38, depth: 1245 },
    "kitchen island countertop should span the seating-overhang footprint"
  );
  assert.deepStrictEqual(
    islandSupportPanels.map((part) => part.id),
    [
      "module-1:island_overhang_support_panel:1",
      "module-1:island_overhang_support_panel:2",
      "module-1:island_overhang_support_panel:3",
    ],
    "island support panel IDs should be stable"
  );
  assert.deepStrictEqual(
    islandSupportPanels[0]?.size,
    { width: 36, height: 862, depth: 260 },
    "island support panels should follow source dimensions"
  );
  assert.deepStrictEqual(
    islandSupportPanels[0]?.position,
    { x: 162, y: 0, z: 955 },
    "island support panels should sit under the rear seating overhang"
  );
  assert(
    generateCabinetBOM(kitchenIsland).some((item) => item.type === "island_overhang_support_panel" && item.quantity === 3),
    "BOM should group island seating-overhang support panels"
  );
  const kitchenIslandDocumentation = generateCabinetDocumentation(kitchenIsland);
  assert(
    kitchenIslandDocumentation.cutList.filter((item) => item.type === "island_overhang_support_panel").length === 3,
    "cut list should include island support panel board parts"
  );
  assert(
    kitchenIslandDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":island_overhang_support_panel:"))
    ),
    "edge-banding schedule should include island support panel edges"
  );
  assert(
    kitchenIslandDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("island seating overhang 320d with 3 support panels")
    ),
    "dimension schedule should describe island seating overhang"
  );
  assert(
    kitchenIslandDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("Seating-side overhang 320 mm with 3 support panels 36 mm thick x 260 mm deep")
    ),
    "drawing view schedule should describe island seating support panels"
  );
  assert(
    kitchenIslandDocumentation.installerNotes.some((item) => item.id === "note:island-seating-overhang"),
    "installer notes should include island seating-overhang coordination"
  );
  assert(
    buildCabinetShopDrawingSvg(kitchenIsland).includes("A-603 Plan Footprint"),
    "shop drawing should render kitchen island plan footprint"
  );
  assert(
    buildCabinetFabricationDxf(kitchenIsland).includes("module-1:island_overhang_support_panel:1"),
    "fabrication DXF should include island support panel board parts"
  );
  const kitchenIslandSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(kitchenIsland));
  assert.strictEqual(
    kitchenIslandSourceRoundTrip.islandSeatingOverhangEnabled,
    true,
    "source definition should preserve island seating-overhang enablement"
  );
  assert.strictEqual(
    kitchenIslandSourceRoundTrip.islandSupportPanelCount,
    3,
    "source definition should preserve island support panel count"
  );
  const unsupportedIsland = clone(kitchenIsland);
  unsupportedIsland.islandSupportPanelCount = 0;
  const unsupportedIslandValidation = validateCabinetDefinition(unsupportedIsland);
  assert.strictEqual(unsupportedIslandValidation.valid, true, "hidden island overhang support should warn without blocking export");
  assert(
    unsupportedIslandValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "islandSupportPanelCount"
    ),
    "unsupported island overhangs should produce a support-panel warning"
  );
  const impossibleIslandTop = clone(kitchenIsland);
  impossibleIslandTop.countertopOverhangBack = 200;
  assert.strictEqual(
    validateCabinetDefinition(impossibleIslandTop).valid,
    false,
    "island seating overhangs deeper than the countertop back overhang should fail"
  );
  const impossibleIslandSupport = clone(kitchenIsland);
  impossibleIslandSupport.islandSupportPanelDepth = 400;
  assert.strictEqual(
    validateCabinetDefinition(impossibleIslandSupport).valid,
    false,
    "island support panels deeper than the seating overhang should fail"
  );

  const pantrySystem = createCabinetPreset("pantry_system", "cabinet-test-pantry-pullouts");
  const pantryValidation = validateCabinetDefinition(pantrySystem);
  assert.strictEqual(pantryValidation.valid, true, "pantry pull-out tray preset should validate");
  const pantryParts = generateCabinetParts(pantrySystem);
  const pantryTrayDecks = pantryParts.filter((part) => part.type === "pantry_pullout_tray_deck");
  const pantryTrayFronts = pantryParts.filter((part) => part.type === "pantry_pullout_tray_front");
  const pantrySlidePairs = pantryParts.filter((part) => part.type === "pantry_pullout_slide_pair");
  assert.strictEqual(pantryTrayDecks.length, 4, "pantry system should generate pull-out tray decks");
  assert.strictEqual(pantryTrayFronts.length, 4, "pantry system should generate pull-out tray fronts");
  assert.strictEqual(pantrySlidePairs.length, 4, "pantry system should generate pull-out slide-pair hardware markers");
  assert.deepStrictEqual(
    pantryTrayDecks.map((part) => part.id),
    [
      "module-1:pantry_pullout_tray_deck:1",
      "module-1:pantry_pullout_tray_deck:2",
      "module-1:pantry_pullout_tray_deck:3",
      "module-1:pantry_pullout_tray_deck:4",
    ],
    "pantry tray deck IDs should be stable"
  );
  assert.deepStrictEqual(
    pantryTrayDecks[0]?.size,
    { width: 488, height: 18, depth: 520 },
    "pantry tray decks should follow source dimensions and slide clearances"
  );
  assert.deepStrictEqual(
    pantryTrayDecks[0]?.position,
    { x: 56, y: 101, z: 0 },
    "pantry tray decks should sit inside the cabinet opening"
  );
  assert.deepStrictEqual(
    pantryTrayFronts[0]?.size,
    { width: 488, height: 70, depth: 18 },
    "pantry tray fronts should follow the configured lip height"
  );
  assert.deepStrictEqual(
    pantryTrayFronts[0]?.position,
    { x: 56, y: 119, z: 0 },
    "pantry tray fronts should sit on the front of each pull-out tray"
  );
  assert.deepStrictEqual(
    pantrySlidePairs[0]?.size,
    { width: 558, height: 24, depth: 520 },
    "pantry slide-pair marker should span the slide envelope"
  );
  assert.strictEqual(
    pantrySlidePairs[0]?.skuId,
    "CAB-HW-PANTRY-SLIDE-PAIR",
    "pantry slide pairs should carry a hardware SKU"
  );
  const pantryBOM = generateCabinetBOM(pantrySystem);
  assert(
    pantryBOM.some((item) => item.type === "pantry_pullout_tray_deck" && item.quantity === 4),
    "BOM should group pantry pull-out tray decks"
  );
  assert(
    pantryBOM.some((item) => item.type === "pantry_pullout_slide_pair" && item.quantity === 4),
    "BOM should group pantry slide-pair hardware"
  );
  const pantryDocumentation = generateCabinetDocumentation(pantrySystem);
  assert.strictEqual(
    pantryDocumentation.cutList.filter((item) => item.type === "pantry_pullout_tray_deck").length,
    4,
    "cut list should include pantry tray decks"
  );
  assert.strictEqual(
    pantryDocumentation.cutList.filter((item) => item.type === "pantry_pullout_tray_front").length,
    4,
    "cut list should include pantry tray fronts"
  );
  assert(
    pantryDocumentation.cutList.every((item) => item.type !== "pantry_pullout_slide_pair"),
    "board cut list should exclude pantry slide-pair hardware"
  );
  assert(
    pantryDocumentation.hardwareSchedule.some(
      (item) =>
        item.hardwareId === "pantry_pullout_slide_pair" &&
        item.hardwareType === "pantry_slide_pair" &&
        item.quantity === 4
    ),
    "hardware schedule should include pantry slide pairs"
  );
  assert(
    pantryDocumentation.edgeBandingSchedule.some((item) =>
      item.partIds.some((partId) => partId.includes(":pantry_pullout_tray_"))
    ),
    "edge-banding schedule should include pantry tray board edges"
  );
  assert(
    pantryDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("4 pantry pull-out trays 520d with 70h fronts")
    ),
    "dimension schedule should describe pantry pull-out trays"
  );
  assert(
    pantryDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("pantry pull-outs 4 trays 520 mm deep with slide pairs")
    ),
    "drawing view schedule should describe pantry slide pairs"
  );
  assert(
    pantryDocumentation.installerNotes.some((item) => item.id === "note:pantry-pullout-hardware"),
    "installer notes should include pantry pull-out hardware coordination"
  );
  assert(
    buildCabinetShopDrawingSvg(pantrySystem).includes("A-603 Plan Footprint"),
    "shop drawing should render pantry pull-out markers"
  );
  assert(
    buildCabinetFabricationDxf(pantrySystem).includes("module-1:pantry_pullout_tray_deck:1"),
    "fabrication DXF should include pantry tray board parts"
  );
  assert(
    !buildCabinetFabricationDxf(pantrySystem).includes("pantry_pullout_slide_pair"),
    "fabrication DXF should keep pantry slide-pair hardware out of the board cut list"
  );
  const pantrySourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(pantrySystem));
  assert.strictEqual(
    pantrySourceRoundTrip.modules[0].pantryPullOutTrayEnabled,
    true,
    "source definition should preserve pantry pull-out enablement"
  );
  assert.strictEqual(
    pantrySourceRoundTrip.modules[0].pantryPullOutTrayCount,
    4,
    "source definition should preserve pantry pull-out tray count"
  );
  const tightPantrySlides = clone(pantrySystem);
  tightPantrySlides.modules[0].pantryPullOutSlideClearance = 20;
  const tightPantrySlidesValidation = validateCabinetDefinition(tightPantrySlides);
  assert.strictEqual(tightPantrySlidesValidation.valid, true, "tight pantry slide clearance should warn without blocking export");
  assert(
    tightPantrySlidesValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.pantryPullOutSlideClearance"
    ),
    "tight pantry slide clearance should produce a warning"
  );
  const shallowPantryTrays = clone(pantrySystem);
  shallowPantryTrays.modules[0].pantryPullOutTrayDepth = 320;
  const shallowPantryValidation = validateCabinetDefinition(shallowPantryTrays);
  assert.strictEqual(shallowPantryValidation.valid, true, "shallow pantry trays should warn without blocking export");
  assert(
    shallowPantryValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.pantryPullOutTrayDepth"
    ),
    "shallow pantry trays should produce a usefulness warning"
  );
  const impossiblePantryDepth = clone(pantrySystem);
  impossiblePantryDepth.modules[0].pantryPullOutTrayDepth = 700;
  assert.strictEqual(
    validateCabinetDefinition(impossiblePantryDepth).valid,
    false,
    "pantry trays deeper than usable cabinet depth should fail"
  );
  const impossiblePantryCount = clone(pantrySystem);
  impossiblePantryCount.modules[0].pantryPullOutTrayCount = 10;
  assert.strictEqual(
    validateCabinetDefinition(impossiblePantryCount).valid,
    false,
    "too many pantry trays for the module height should fail"
  );

  const vanity = createCabinetPreset("vanity", "cabinet-test-vanity-service-zone");
  const vanityValidation = validateCabinetDefinition(vanity);
  assert.strictEqual(vanityValidation.valid, true, "vanity sink service-zone preset should validate");
  assert(
    vanityValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.sinkCutoutEnabled"
    ),
    "vanity drawers under a sink should warn without blocking export"
  );
  const vanityParts = generateCabinetParts(vanity);
  const sinkCutoutTemplate = vanityParts.find((part) => part.type === "sink_cutout_template");
  const plumbingChaseVoid = vanityParts.find((part) => part.type === "plumbing_chase_void");
  assert(sinkCutoutTemplate, "vanity should generate a sink cutout coordination marker");
  assert(plumbingChaseVoid, "vanity should generate a plumbing chase clearance marker");
  assert.deepStrictEqual(
    sinkCutoutTemplate?.size,
    { width: 480, height: 4, depth: 340 },
    "sink cutout marker should follow the vanity source dimensions"
  );
  assert.deepStrictEqual(
    sinkCutoutTemplate?.position,
    { x: 155, y: 658, z: 105 },
    "sink cutout marker should sit on the countertop at the configured setout"
  );
  assert.deepStrictEqual(
    plumbingChaseVoid?.size,
    { width: 360, height: 420, depth: 90 },
    "plumbing chase marker should follow the vanity source dimensions"
  );
  assert.deepStrictEqual(
    plumbingChaseVoid?.position,
    { x: 215, y: 80, z: 435 },
    "plumbing chase marker should align under the sink at the cabinet back"
  );
  const vanityBOM = generateCabinetBOM(vanity);
  assert(
    vanityBOM.some((item) => item.type === "sink_cutout_template" && item.quantity === 1),
    "BOM should include the sink cutout coordination marker"
  );
  assert(
    vanityBOM.some((item) => item.type === "plumbing_chase_void" && item.quantity === 1),
    "BOM should include the plumbing chase coordination marker"
  );
  const vanityDocumentation = generateCabinetDocumentation(vanity);
  assert(
    vanityDocumentation.cutList.every(
      (item) => item.type !== "sink_cutout_template" && item.type !== "plumbing_chase_void"
    ),
    "board cut list should exclude vanity service-zone coordination markers"
  );
  assert(
    vanityDocumentation.materialSchedule.every((item) => item.materialId !== "service_zone_marker"),
    "material schedule should exclude coordination-only service markers"
  );
  assert(
    vanityDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("sink cutout 480w x 340d at 250 from front") &&
      item.notes.includes("plumbing chase 360w x 420h x 90d")
    ),
    "dimension schedule should describe sink cutout and plumbing chase setouts"
  );
  assert(
    vanityDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("sink cutout 480w x 340d") &&
      item.notes.includes("plumbing chase 360w x 420h x 90d")
    ),
    "drawing view schedule should describe sink cutout and plumbing chase markers"
  );
  assert(
    vanityDocumentation.installerNotes.some((item) => item.id === "note:sink-service-zone"),
    "installer notes should include sink service-zone field verification"
  );
  assert(
    buildCabinetShopDrawingSvg(vanity).includes("A-603 Plan Footprint"),
    "shop drawing should render vanity plan markers"
  );
  assert(
    !buildCabinetFabricationDxf(vanity).includes("sink_cutout_template"),
    "fabrication DXF should keep coordination-only sink markers out of the board cut list"
  );
  const vanitySourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(vanity));
  assert.strictEqual(
    vanitySourceRoundTrip.modules[0].sinkCutoutEnabled,
    true,
    "source definition should preserve sink cutout enablement"
  );
  assert.strictEqual(
    vanitySourceRoundTrip.modules[0].plumbingChaseDepth,
    90,
    "source definition should preserve plumbing chase depth"
  );
  const impossibleVanityNoTop = clone(vanity);
  impossibleVanityNoTop.includeCountertop = false;
  impossibleVanityNoTop.height = getCabinetOverallHeight(impossibleVanityNoTop);
  impossibleVanityNoTop.depth = getCabinetOverallDepth(impossibleVanityNoTop);
  impossibleVanityNoTop.totalWidth = getCabinetOverallWidth(impossibleVanityNoTop);
  assert.strictEqual(
    validateCabinetDefinition(impossibleVanityNoTop).valid,
    false,
    "sink cutouts without an enabled countertop should fail"
  );
  const impossibleVanityCutout = clone(vanity);
  impossibleVanityCutout.modules[0].sinkCutoutWidth = 900;
  assert.strictEqual(
    validateCabinetDefinition(impossibleVanityCutout).valid,
    false,
    "sink cutouts wider than the vanity module should fail"
  );

  const laundryRoom = createCabinetPreset("laundry_room", "cabinet-test-laundry-appliance-bay");
  const laundryValidation = validateCabinetDefinition(laundryRoom);
  assert.strictEqual(laundryValidation.valid, true, "laundry appliance bay preset should validate");
  const laundryParts = generateCabinetParts(laundryRoom);
  const laundryApplianceClearances = laundryParts.filter((part) => part.type === "laundry_appliance_clearance");
  const laundryUtilityChase = laundryParts.find((part) => part.type === "laundry_utility_chase");
  assert.strictEqual(laundryApplianceClearances.length, 2, "laundry room should generate two appliance clearance markers");
  assert(laundryUtilityChase, "laundry room should generate a utility chase marker");
  assert.deepStrictEqual(
    laundryApplianceClearances.map((part) => part.id),
    ["module-2:laundry_appliance_clearance:1", "module-2:laundry_appliance_clearance:2"],
    "laundry appliance clearance IDs should be stable"
  );
  assert.deepStrictEqual(
    laundryApplianceClearances[0]?.size,
    { width: 570, height: 850, depth: 560 },
    "laundry appliance marker size should follow source dimensions"
  );
  assert.deepStrictEqual(
    laundryApplianceClearances[0]?.position,
    { x: 620, y: 0, z: 0 },
    "first laundry appliance marker should include module offset and side clearance"
  );
  assert.deepStrictEqual(
    laundryApplianceClearances[1]?.position,
    { x: 1210, y: 0, z: 0 },
    "second laundry appliance marker should be spaced by appliance width and side clearance"
  );
  assert.deepStrictEqual(
    laundryUtilityChase?.size,
    { width: 1200, height: 180, depth: 80 },
    "laundry utility chase should span the appliance bay back zone"
  );
  assert.deepStrictEqual(
    laundryUtilityChase?.position,
    { x: 600, y: 720, z: 520 },
    "laundry utility chase should sit at the rear upper service zone"
  );
  const laundryBOM = generateCabinetBOM(laundryRoom);
  assert(
    laundryBOM.some((item) => item.type === "laundry_appliance_clearance" && item.quantity === 2),
    "BOM should group laundry appliance clearance markers"
  );
  assert(
    laundryBOM.some((item) => item.type === "laundry_utility_chase" && item.quantity === 1),
    "BOM should include the laundry utility chase marker"
  );
  const laundryDocumentation = generateCabinetDocumentation(laundryRoom);
  assert(
    laundryDocumentation.cutList.every(
      (item) => item.type !== "laundry_appliance_clearance" && item.type !== "laundry_utility_chase"
    ),
    "board cut list should exclude laundry coordination markers"
  );
  assert(
    laundryDocumentation.materialSchedule.every((item) => item.materialId !== "service_zone_marker"),
    "material schedule should exclude laundry coordination-only markers"
  );
  assert(
    laundryDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("2 washer dryer appliance clearances 570w x 850h x 560d") &&
      item.notes.includes("utility chase 180h x 80d")
    ),
    "dimension schedule should describe laundry appliance and utility clearances"
  );
  assert(
    laundryDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("2 washer dryer appliance clearances requiring 1200w x 890h x 600d")
    ),
    "drawing view schedule should describe the required appliance clearance envelope"
  );
  assert(
    laundryDocumentation.installerNotes.some((item) => item.id === "note:laundry-appliance-service-zone"),
    "installer notes should include laundry appliance service-zone field verification"
  );
  assert(
    buildCabinetShopDrawingSvg(laundryRoom).includes("A-603 Plan Footprint"),
    "shop drawing should render laundry appliance plan markers"
  );
  assert(
    !buildCabinetFabricationDxf(laundryRoom).includes("laundry_appliance_clearance"),
    "fabrication DXF should keep laundry coordination markers out of the board cut list"
  );
  const laundrySourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(laundryRoom));
  assert.strictEqual(
    laundrySourceRoundTrip.modules[1].laundryApplianceBayEnabled,
    true,
    "source definition should preserve laundry appliance bay enablement"
  );
  assert.strictEqual(
    laundrySourceRoundTrip.modules[1].laundryUtilityChaseDepth,
    80,
    "source definition should preserve laundry utility chase depth"
  );
  const tightLaundry = clone(laundryRoom);
  tightLaundry.modules[1].laundryApplianceSideClearance = 10;
  tightLaundry.modules[1].laundryApplianceTopClearance = 20;
  tightLaundry.modules[1].laundryApplianceBackClearance = 20;
  tightLaundry.modules[1].laundryUtilityChaseDepth = 50;
  const tightLaundryValidation = validateCabinetDefinition(tightLaundry);
  assert.strictEqual(tightLaundryValidation.valid, true, "tight laundry appliance clearances should warn without blocking export");
  assert(
    tightLaundryValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.1.laundryApplianceSideClearance"
    ),
    "tight laundry appliance side clearances should warn"
  );
  assert(
    tightLaundryValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.1.laundryUtilityChaseDepth"
    ),
    "tight laundry utility chase depths should warn"
  );
  const impossibleLaundryWidth = clone(laundryRoom);
  impossibleLaundryWidth.modules[1].laundryApplianceWidth = 650;
  assert.strictEqual(
    validateCabinetDefinition(impossibleLaundryWidth).valid,
    false,
    "laundry appliance clearances wider than the module should fail"
  );
  const impossibleLaundryFront = clone(laundryRoom);
  impossibleLaundryFront.modules[1].frontType = "double_door";
  assert.strictEqual(
    validateCabinetDefinition(impossibleLaundryFront).valid,
    false,
    "laundry appliance bays behind closed fronts should fail"
  );

  const homeOffice = createCabinetPreset("home_office_built_in", "cabinet-test-office-workstation");
  const homeOfficeValidation = validateCabinetDefinition(homeOffice);
  assert.strictEqual(homeOfficeValidation.valid, true, "home office workstation preset should validate");
  assert.strictEqual(homeOffice.depth, 650, "home office overall depth should include the workstation overhang");
  const homeOfficeParts = generateCabinetParts(homeOffice);
  const officeWorksurface = homeOfficeParts.find((part) => part.type === "office_worksurface");
  const cableGrommets = homeOfficeParts.filter((part) => part.type === "cable_grommet_template");
  const deskPowerChase = homeOfficeParts.find((part) => part.type === "desk_power_chase");
  assert(officeWorksurface, "home office should generate an office work surface");
  assert.strictEqual(cableGrommets.length, 3, "home office should generate cable grommet coordination markers");
  assert(deskPowerChase, "home office should generate a desk power chase marker");
  assert.deepStrictEqual(
    officeWorksurface?.size,
    { width: 1600, height: 36, depth: 650 },
    "office work surface should follow source dimensions"
  );
  assert.deepStrictEqual(
    officeWorksurface?.position,
    { x: 700, y: 720, z: 0 },
    "office work surface should include module offset and front overhang"
  );
  assert.deepStrictEqual(
    cableGrommets.map((part) => part.id),
    [
      "module-2:cable_grommet_template:1",
      "module-2:cable_grommet_template:2",
      "module-2:cable_grommet_template:3",
    ],
    "cable grommet marker IDs should be stable"
  );
  assert.deepStrictEqual(
    cableGrommets[0]?.position,
    { x: 1060, y: 756, z: 500 },
    "first cable grommet marker should sit on the work surface at the configured back offset"
  );
  assert.deepStrictEqual(
    deskPowerChase?.size,
    { width: 1600, height: 120, depth: 60 },
    "desk power chase should span the workstation rear service zone"
  );
  assert.deepStrictEqual(
    deskPowerChase?.position,
    { x: 700, y: 600, z: 590 },
    "desk power chase should sit at the rear upper service zone"
  );
  const homeOfficeBOM = generateCabinetBOM(homeOffice);
  assert(
    homeOfficeBOM.some((item) => item.type === "office_worksurface" && item.quantity === 1),
    "BOM should include the office work surface"
  );
  assert(
    homeOfficeBOM.some((item) => item.type === "cable_grommet_template" && item.quantity === 3),
    "BOM should group cable grommet coordination markers"
  );
  const homeOfficeDocumentation = generateCabinetDocumentation(homeOffice);
  assert(
    homeOfficeDocumentation.cutList.some((item) => item.type === "office_worksurface" && item.edgeBandingMm === 4500),
    "cut list should include office work surface edge details"
  );
  assert(
    homeOfficeDocumentation.cutList.every(
      (item) => item.type !== "cable_grommet_template" && item.type !== "desk_power_chase"
    ),
    "board cut list should exclude office service-zone coordination markers"
  );
  assert(
    homeOfficeDocumentation.materialSchedule.some((item) => item.materialId === "walnut_veneer"),
    "material schedule should include the office work surface material"
  );
  assert(
    homeOfficeDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("office work surface 650d x 36 thick with 3 cable grommets") &&
      item.notes.includes("desk power chase 120h x 60d")
    ),
    "dimension schedule should describe office workstation details"
  );
  assert(
    homeOfficeDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("3 80 mm grommets 110 mm from back") &&
      item.notes.includes("desk power chase 120h x 60d")
    ),
    "drawing view schedule should describe cable grommet and power chase setouts"
  );
  assert(
    homeOfficeDocumentation.installerNotes.some((item) => item.id === "note:office-workstation-services"),
    "installer notes should include office workstation service coordination"
  );
  assert(
    buildCabinetShopDrawingSvg(homeOffice).includes("A-603 Plan Footprint"),
    "shop drawing should render office workstation plan markers"
  );
  assert(
    buildCabinetFabricationDxf(homeOffice).includes("module-2:office_worksurface:0"),
    "fabrication DXF should include the office work surface board"
  );
  assert(
    !buildCabinetFabricationDxf(homeOffice).includes("cable_grommet_template"),
    "fabrication DXF should keep cable grommet markers out of the board cut list"
  );
  const homeOfficeSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(homeOffice));
  assert.strictEqual(
    homeOfficeSourceRoundTrip.modules[1].officeWorksurfaceEnabled,
    true,
    "source definition should preserve office workstation enablement"
  );
  assert.strictEqual(
    homeOfficeSourceRoundTrip.modules[1].cableGrommetCount,
    3,
    "source definition should preserve cable grommet count"
  );
  const crampedGrommets = clone(homeOffice);
  crampedGrommets.modules[1].cableGrommetCount = 8;
  const crampedGrommetValidation = validateCabinetDefinition(crampedGrommets);
  assert.strictEqual(crampedGrommetValidation.valid, true, "crowded cable grommets should warn without blocking export");
  assert(
    crampedGrommetValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.1.cableGrommetCount"
    ),
    "crowded cable grommets should produce a spacing warning"
  );
  const impossibleOfficeDepth = clone(homeOffice);
  impossibleOfficeDepth.modules[1].officeWorksurfaceDepth = 600;
  assert.strictEqual(
    validateCabinetDefinition(impossibleOfficeDepth).valid,
    false,
    "office work surfaces that do not cover the cabinet body should fail"
  );
  const impossibleOfficeChase = clone(homeOffice);
  impossibleOfficeChase.modules[1].deskPowerChaseDepth = 700;
  assert.strictEqual(
    validateCabinetDefinition(impossibleOfficeChase).valid,
    false,
    "desk power chases deeper than the module should fail"
  );

  const mediaWall = createCabinetPreset("media_wall", "cabinet-test-media-wall-services");
  const mediaValidation = validateCabinetDefinition(mediaWall);
  assert.strictEqual(mediaValidation.valid, true, "media wall service-zone preset should validate");
  const mediaParts = generateCabinetParts(mediaWall);
  const mediaTvBlocking = mediaParts.find((part) => part.type === "media_tv_blocking_panel");
  const mediaCableChase = mediaParts.find((part) => part.type === "media_cable_chase");
  const mediaVentSlots = mediaParts.filter((part) => part.type === "media_vent_slot_template");
  assert(mediaTvBlocking, "media wall should generate a TV blocking panel");
  assert(mediaCableChase, "media wall should generate a cable chase marker");
  assert.strictEqual(mediaVentSlots.length, 4, "media wall should generate ventilation slot templates");
  assert.deepStrictEqual(
    mediaVentSlots.map((part) => part.id),
    [
      "module-2:media_vent_slot_template:1",
      "module-2:media_vent_slot_template:2",
      "module-2:media_vent_slot_template:3",
      "module-2:media_vent_slot_template:4",
    ],
    "media vent slot IDs should be stable"
  );
  assert.deepStrictEqual(
    mediaTvBlocking?.size,
    { width: 1400, height: 850, depth: 18 },
    "media TV blocking panel should follow source dimensions"
  );
  assert.deepStrictEqual(
    mediaTvBlocking?.position,
    { x: 800, y: 775, z: 402 },
    "media TV blocking should center in the TV module and sit at the rear wall"
  );
  assert.deepStrictEqual(
    mediaCableChase?.size,
    { width: 120, height: 700, depth: 60 },
    "media cable chase should follow source dimensions"
  );
  assert.deepStrictEqual(
    mediaCableChase?.position,
    { x: 1440, y: 850, z: 360 },
    "media cable chase should center behind the TV blocking zone"
  );
  assert.deepStrictEqual(
    mediaVentSlots[0]?.position,
    { x: 1024, y: 177, z: -18 },
    "first media vent slot should center across the console front"
  );
  const mediaBOM = generateCabinetBOM(mediaWall);
  assert(
    mediaBOM.some((item) => item.type === "media_tv_blocking_panel" && item.quantity === 1),
    "BOM should include the media TV blocking panel"
  );
  assert(
    mediaBOM.some((item) => item.type === "media_vent_slot_template" && item.quantity === 4),
    "BOM should group media vent slot templates"
  );
  const mediaDocumentation = generateCabinetDocumentation(mediaWall);
  assert(
    mediaDocumentation.cutList.some((item) => item.type === "media_tv_blocking_panel" && item.edgeBandingMm === 4500),
    "cut list should include media TV blocking board edges"
  );
  assert(
    mediaDocumentation.cutList.every(
      (item) => item.type !== "media_cable_chase" && item.type !== "media_vent_slot_template"
    ),
    "board cut list should exclude media coordination templates"
  );
  assert(
    mediaDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("media wall TV opening 1400w x 850h at 1200h") &&
      item.notes.includes("cable chase 120w x 700h x 60d")
    ),
    "dimension schedule should describe media wall TV and cable details"
  );
  assert(
    mediaDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("media wall TV blocking 1400w x 850h centered at 1200 mm") &&
      item.notes.includes("4 220w x 24h vent slots")
    ),
    "drawing view schedule should describe media wall vent and blocking details"
  );
  assert(
    mediaDocumentation.installerNotes.some((item) => item.id === "note:media-wall-services"),
    "installer notes should include media wall service field verification"
  );
  assert(
    buildCabinetShopDrawingSvg(mediaWall).includes("A-603 Plan Footprint"),
    "shop drawing should render media wall plan markers"
  );
  assert(
    buildCabinetFabricationDxf(mediaWall).includes("module-2:media_tv_blocking_panel:0"),
    "fabrication DXF should include media TV blocking board parts"
  );
  assert(
    !buildCabinetFabricationDxf(mediaWall).includes("media_cable_chase") &&
      !buildCabinetFabricationDxf(mediaWall).includes("media_vent_slot_template"),
    "fabrication DXF should keep media coordination templates out of the board cut list"
  );
  const mediaSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(mediaWall));
  assert.strictEqual(
    mediaSourceRoundTrip.modules[1].mediaWallEnabled,
    true,
    "source definition should preserve media wall enablement"
  );
  assert.strictEqual(
    mediaSourceRoundTrip.modules[1].mediaTvOpeningWidth,
    1400,
    "source definition should preserve media TV opening width"
  );
  const shallowMediaChase = clone(mediaWall);
  shallowMediaChase.modules[1].mediaCableChaseDepth = 30;
  const shallowMediaValidation = validateCabinetDefinition(shallowMediaChase);
  assert.strictEqual(shallowMediaValidation.valid, true, "shallow media cable chases should warn without blocking export");
  assert(
    shallowMediaValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.1.mediaCableChaseDepth"
    ),
    "shallow media cable chases should produce a warning"
  );
  const noMediaVents = clone(mediaWall);
  noMediaVents.modules[1].mediaVentSlotCount = 0;
  const noMediaVentValidation = validateCabinetDefinition(noMediaVents);
  assert.strictEqual(noMediaVentValidation.valid, true, "media walls with no vents should warn without blocking export");
  assert(
    noMediaVentValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.1.mediaVentSlotCount"
    ),
    "media walls with no vents should produce an airflow warning"
  );
  const impossibleMediaWidth = clone(mediaWall);
  impossibleMediaWidth.modules[1].mediaTvOpeningWidth = 1900;
  assert.strictEqual(
    validateCabinetDefinition(impossibleMediaWidth).valid,
    false,
    "media TV blocking wider than the module should fail"
  );
  const impossibleMediaDepth = clone(mediaWall);
  impossibleMediaDepth.modules[1].mediaCableChaseDepth = 500;
  assert.strictEqual(
    validateCabinetDefinition(impossibleMediaDepth).valid,
    false,
    "media cable chases deeper than the module should fail"
  );
  const impossibleMediaVents = clone(mediaWall);
  impossibleMediaVents.modules[1].mediaVentSlotCount = 8;
  impossibleMediaVents.modules[1].mediaVentSlotWidth = 240;
  assert.strictEqual(
    validateCabinetDefinition(impossibleMediaVents).valid,
    false,
    "media vent slots wider than the module should fail"
  );

  const wall = createCabinetPreset("wall", "cabinet-test-wall");
  const wallParts = generateCabinetParts(wall);
  assert.strictEqual(wallParts.filter((part) => part.type === "door_front").length, 2, "double door should generate two fronts");
  const wallInstallationCleats = wallParts.filter((part) => part.type === "installation_cleat");
  assert.strictEqual(wallInstallationCleats.length, 1, "wall cabinet should generate a wall-mount installation cleat");
  assert.deepStrictEqual(
    wallInstallationCleats[0]?.size,
    { width: 864, height: 80, depth: 18 },
    "installation cleat dimensions should follow module width and source settings"
  );
  assert.deepStrictEqual(
    wallInstallationCleats[0]?.position,
    { x: 18, y: 552, z: 326 },
    "installation cleat should sit inside the top-back of the wall cabinet"
  );
  const wallHingePairs = wallParts.filter((part) => part.type === "door_hinge_pair");
  assert.strictEqual(wallHingePairs.length, 4, "wall cabinet should generate concealed hinge pairs for each door");
  assert.deepStrictEqual(
    wallHingePairs.map((part) => part.id),
    [
      "module-1:door_hinge_pair:door-1-1",
      "module-1:door_hinge_pair:door-1-2",
      "module-1:door_hinge_pair:door-2-1",
      "module-1:door_hinge_pair:door-2-2",
    ],
    "door hinge pair IDs should be stable"
  );
  assert.deepStrictEqual(
    wallHingePairs[0]?.size,
    { width: 14, height: 70, depth: 8 },
    "door hinge pair marker dimensions should follow source settings"
  );
  assert.deepStrictEqual(
    wallHingePairs[0]?.position,
    { x: 25, y: 111, z: -26 },
    "first concealed hinge pair should sit near the lower hinge-side edge"
  );
  assert.strictEqual(wallHingePairs[0]?.skuId, "CAB-HW-DOOR-HINGE-PAIR", "door hinge pairs should carry a hardware SKU");
  assert(
    generateCabinetBOM(wall).some((item) => item.type === "door_hinge_pair" && item.quantity === 4),
    "BOM should group concealed door hinge pairs"
  );
  assert(
    generateCabinetBOM(wall).some((item) => item.type === "installation_cleat" && item.quantity === 1),
    "BOM should include the wall-mount installation cleat"
  );
  const wallDocumentation = generateCabinetDocumentation(wall);
  assert(
    wallDocumentation.cutList.every((item) => item.type !== "door_hinge_pair"),
    "board cut list should exclude concealed hinge hardware"
  );
  assert(
    wallDocumentation.cutList.some((item) => item.type === "installation_cleat"),
    "board cut list should include installation cleat parts"
  );
  assert(
    wallDocumentation.hardwareSchedule.some(
      (item) =>
        item.hardwareId === "concealed_door_hinge_pair" &&
        item.hardwareType === "door_hinge_pair" &&
        item.quantity === 4
    ),
    "hardware schedule should include concealed door hinge pairs"
  );
  assert(
    wallDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("installation cleat 80h x 18d inset 70 from top")
    ),
    "dimension schedule should describe installation cleat setout"
  );
  assert(
    wallDocumentation.dimensionSchedule.some((item) =>
      item.notes?.includes("door hinges 2 per door at 90 inset")
    ),
    "dimension schedule should describe concealed hinge setout"
  );
  assert(
    wallDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("installation cleat 80 mm high x 18 mm deep inset 70 mm from top")
    ),
    "drawing view schedule should describe installation cleat setout"
  );
  assert(
    wallDocumentation.drawingViewSchedule.some((item) =>
      item.notes?.includes("concealed hinges 2 pairs per door at 90 mm top/bottom inset")
    ),
    "drawing view schedule should describe concealed hinge setout"
  );
  assert(
    wallDocumentation.installerNotes.some((item) => item.id === "note:installation-cleat-anchoring"),
    "installer notes should include installation cleat anchoring review"
  );
  assert(
    wallDocumentation.installerNotes.some((item) => item.id === "note:concealed-door-hinges"),
    "installer notes should include concealed hinge coordination"
  );
  assert(
    !buildCabinetFabricationDxf(wall).includes("door_hinge_pair"),
    "fabrication DXF should keep concealed hinge hardware out of board layouts"
  );
  assert(
    buildCabinetFabricationDxf(wall).includes("installation_cleat"),
    "fabrication DXF should include installation cleat board layouts"
  );
  const wallSourceRoundTrip = parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(wall));
  assert.strictEqual(
    wallSourceRoundTrip.modules[0].installationCleatEnabled,
    true,
    "source definition should preserve installation cleat enablement"
  );
  assert.strictEqual(
    wallSourceRoundTrip.modules[0].installationCleatInsetFromTop,
    70,
    "source definition should preserve installation cleat inset"
  );
  assert.strictEqual(
    wallSourceRoundTrip.modules[0].doorHingeHardwareEnabled,
    true,
    "source definition should preserve concealed hinge enablement"
  );
  assert.strictEqual(
    wallSourceRoundTrip.modules[0].doorHingeInsetFromTopBottom,
    90,
    "source definition should preserve concealed hinge inset"
  );
  const thinCleatWall = clone(wall);
  thinCleatWall.modules[0].installationCleatThickness = 10;
  const thinCleatWallValidation = validateCabinetDefinition(thinCleatWall);
  assert.strictEqual(thinCleatWallValidation.valid, true, "thin installation cleats should warn without blocking export");
  assert(
    thinCleatWallValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.installationCleatThickness"
    ),
    "thin installation cleats should produce a fastener-bite warning"
  );
  const impossibleCleatWall = clone(wall);
  impossibleCleatWall.modules[0].installationCleatInsetFromTop = 680;
  assert.strictEqual(
    validateCabinetDefinition(impossibleCleatWall).valid,
    false,
    "installation cleats that do not fit below the top panel should fail"
  );
  const singleHingeWall = clone(wall);
  singleHingeWall.modules[0].doorHingeCountPerDoor = 1;
  const singleHingeWallValidation = validateCabinetDefinition(singleHingeWall);
  assert.strictEqual(singleHingeWallValidation.valid, true, "single hinge pairs should warn without blocking export");
  assert(
    singleHingeWallValidation.issues.some(
      (issue) => issue.severity === "warning" && issue.field === "modules.0.doorHingeCountPerDoor"
    ),
    "single hinge pairs should produce a sag-risk warning"
  );
  const impossibleHingeInset = clone(wall);
  impossibleHingeInset.modules[0].doorHingeInsetFromTopBottom = 320;
  assert.strictEqual(
    validateCabinetDefinition(impossibleHingeInset).valid,
    false,
    "concealed hinge top/bottom insets that exceed the shortest door should fail"
  );
  const noDoorHinges = clone(wall);
  noDoorHinges.modules[0].frontType = "drawer_stack";
  noDoorHinges.modules[0].drawerCount = 3;
  noDoorHinges.modules[0].doorCount = 0;
  assert.strictEqual(
    validateCabinetDefinition(noDoorHinges).valid,
    false,
    "enabled concealed hinge hardware without door fronts should fail"
  );
  const rightHingedWall = clone(wall);
  rightHingedWall.modules[0].frontType = "single_door";
  rightHingedWall.modules[0].doorCount = 1;
  rightHingedWall.modules[0].hingeSide = "right";
  const rightHingedDoor = generateCabinetParts(rightHingedWall).find((part) => part.type === "door_front");
  assert.strictEqual(
    rightHingedDoor?.metadata?.swingSide,
    "right",
    "single-door hinge side should affect generated door swing metadata"
  );
  assert.strictEqual(
    generateCabinetDocumentation(rightHingedWall).drawingViewSchedule.find((item) => item.moduleId === "module-1" && item.viewType === "side_section")?.cutPlane,
    "right",
    "single-door hinge side should affect section drawing cut plane"
  );

  const cabinetRun = createCabinetPreset("cabinet_run", "cabinet-test-run");
  const cabinetRunFingerprint = buildCabinetSourceDefinitionFingerprint(cabinetRun);
  const cabinetRunValidation = validateCabinetDefinition(cabinetRun);
  assert.strictEqual(cabinetRunValidation.valid, true, "cabinet run preset should validate");
  assert.strictEqual(cabinetRun.modules.length, 3, "cabinet run preset should include three modules");
  assert.strictEqual(cabinetRun.totalWidth, 2400, "cabinet run preset should expose total run width");
  assert.strictEqual(
    createCabinetMillworkDefinition(cabinetRun).assemblyType,
    "cabinet_run",
    "multi-module base cabinets should persist as a cabinet run assembly"
  );
  const cabinetRunParts = generateCabinetParts(cabinetRun);
  const thirdModulePart = cabinetRunParts.find((part) => part.moduleId === "module-3" && part.type === "left_side_panel");
  assert(thirdModulePart, "cabinet run should generate third module parts");
  assert.strictEqual(thirdModulePart?.position.x, 1600, "third cabinet-run module should be offset by the first two modules");
  const reorderedCabinetRun = clone(cabinetRun);
  reorderedCabinetRun.modules[0].width = 700;
  reorderedCabinetRun.modules[1].width = 900;
  reorderedCabinetRun.modules[2].width = 800;
  reorderedCabinetRun.modules = [
    reorderedCabinetRun.modules[0],
    reorderedCabinetRun.modules[2],
    reorderedCabinetRun.modules[1],
  ];
  reorderedCabinetRun.totalWidth = reorderedCabinetRun.modules.reduce((sum, module) => sum + module.width, 0);
  const reorderedValidation = validateCabinetDefinition(reorderedCabinetRun);
  assert.strictEqual(reorderedValidation.valid, true, "reordered cabinet run should remain valid");
  const reorderedThirdModulePart = generateCabinetParts(reorderedCabinetRun).find(
    (part) => part.moduleId === "module-3" && part.type === "left_side_panel"
  );
  assert(reorderedThirdModulePart, "reordered cabinet run should keep module IDs");
  assert.strictEqual(
    reorderedThirdModulePart?.position.x,
    700,
    "reordered module offsets should follow layout order rather than module ID order"
  );
  assert.strictEqual(
    generateCabinetDocumentation(reorderedCabinetRun).dimensionSchedule.find((item) => item.moduleId === "module-2")?.frontOffsetX,
    1500,
    "reordered dimension schedule should preserve final layout offsets"
  );
  const cabinetRunDocumentation = generateCabinetDocumentation(cabinetRun);
  assert.strictEqual(
    cabinetRunDocumentation.dimensionSchedule.length,
    4,
    "cabinet run should include overall and module dimension rows"
  );
  assert.strictEqual(
    cabinetRunDocumentation.drawingViewSchedule.length,
    9,
    "cabinet run should include overall and module drawing-view rows"
  );
  assert(
    cabinetRunDocumentation.drawingViewSchedule.some((item) => item.viewType === "front_elevation"),
    "drawing schedule should include front elevation views"
  );
  assert(
    cabinetRunDocumentation.drawingViewSchedule.some((item) => item.viewType === "side_section"),
    "drawing schedule should include side section views"
  );
  assert(
    cabinetRunDocumentation.drawingViewSchedule.some((item) => item.viewType === "plan_footprint"),
    "drawing schedule should include a plan footprint view"
  );
  assert.strictEqual(cabinetRunDocumentation.cutList.length, 30, "cabinet run should produce a fabrication cut list");
  assert.strictEqual(
    cabinetRunDocumentation.hardwareSchedule.length,
    3,
    "cabinet run should produce hardware schedule rows"
  );
  assert.strictEqual(
    cabinetRunDocumentation.edgeBandingSchedule.length,
    4,
    "cabinet run should produce edge-banding schedule rows"
  );
  assert.strictEqual(
    Math.round(cabinetRunDocumentation.edgeBandingSchedule.reduce((sum, item) => sum + item.totalLengthM, 0) * 100) / 100,
    28.23,
    "cabinet run should total edge-banding length from the cut list"
  );
  assert(
    cabinetRunDocumentation.edgeBandingSchedule.some((item) => item.materialId === "white_melamine" && item.partCount === 19),
    "edge-banding schedule should group carcass edges by material"
  );
  assert(
    cabinetRunDocumentation.materialSchedule.some((item) => item.materialId === "white_melamine"),
    "cabinet run should include carcass material in the material schedule"
  );
  assert(
    cabinetRunDocumentation.materialSchedule.every((item) => item.areaSqM > 0),
    "material schedule should include measurable material areas"
  );
  assert(
    cabinetRunDocumentation.installerNotes.some((item) => item.severity === "field_verify"),
    "documentation should include field-verification installer notes"
  );
  assert.strictEqual(
    cabinetRunDocumentation.releaseChecklist.length,
    7,
    "cabinet run should include fabrication release checklist rows"
  );
  assert.strictEqual(
    cabinetRunDocumentation.assemblyProfile.schema,
    "custom_millwork.assembly_profile.v1",
    "documentation should include the assembly profile schema"
  );
  assert.strictEqual(
    cabinetRunDocumentation.assemblyProfile.assemblyType,
    "cabinet_run",
    "documentation should include the cabinet-run assembly profile"
  );
  assert.strictEqual(
    cabinetRunDocumentation.assemblyProfile.fabricationComplexity,
    "moderate",
    "cabinet runs should carry moderate fabrication complexity"
  );
  assert(
    cabinetRunDocumentation.installerNotes.some((item) => item.id.startsWith("note:profile-field-")),
    "installer notes should include assembly profile field measurements"
  );
  assert(
    cabinetRunDocumentation.releaseChecklist.some((item) => item.id === "release:cut-list-and-dxf-review"),
    "release checklist should include DXF/cut-list review"
  );
  assert.strictEqual(
    cabinetRunDocumentation.releaseChecklist.filter((item) => item.status === "blocked").length,
    0,
    "cabinet run should not have release blockers when material and hardware SKUs are mapped"
  );
  assert(
    cabinetRunDocumentation.quoteSummary.estimatedTotal > 0,
    "documentation should include a preliminary quote total"
  );
  assert(
    cabinetRunDocumentation.quoteSummary.lineItems.some((item) => item.category === "fabrication"),
    "quote summary should include fabrication line items"
  );
  assert.strictEqual(
    cabinetRunDocumentation.supplierSkuMappings.length,
    10,
    "documentation should include material, hardware, fabrication, and installation supplier mapping rows"
  );
  assert.strictEqual(
    cabinetRunDocumentation.supplierReadiness.status,
    "ready_for_fabricator_review",
    "documentation should expose supplier readiness status"
  );
  assert.strictEqual(
    cabinetRunDocumentation.supplierReadiness.mappedSkuCount,
    7,
    "documentation should count mapped material and hardware SKUs"
  );
  assert.strictEqual(
    cabinetRunDocumentation.supplierReadiness.missingSkuCount,
    0,
    "documentation should count missing material and hardware SKUs"
  );
  assert.strictEqual(
    cabinetRunDocumentation.supplierReadiness.customQuoteRequiredCount,
    3,
    "documentation should count fabrication and installation quote rows"
  );
  assert.strictEqual(
    cabinetRunDocumentation.fabricationReleaseReadiness.status,
    "needs_review",
    "documentation should distinguish RFQ readiness from fabrication release readiness"
  );
  assert.strictEqual(
    cabinetRunDocumentation.fabricationReleaseReadiness.requiredGateCount,
    7,
    "documentation should count required fabrication release gates"
  );
  assert.strictEqual(
    cabinetRunDocumentation.fabricationReleaseReadiness.blockerCount,
    0,
    "documentation should report no fabrication release blockers for mapped cabinet run"
  );
  assert.strictEqual(
    cabinetRunDocumentation.fabricationReleaseReadiness.fabricationReleaseGateCount,
    5,
    "documentation should count gates due before fabrication release"
  );
  assert.strictEqual(
    cabinetRunDocumentation.fabricationReleaseReadiness.installationGateCount,
    1,
    "documentation should count installation gates separately"
  );
  const cabinetRunDocumentationCsv = buildCabinetDocumentationCsv(cabinetRun);
  assert(
    cabinetRunDocumentationCsv.includes("Custom Millwork Documentation"),
    "documentation CSV should include package heading"
  );
  assert(cabinetRunDocumentationCsv.includes("BOM"), "documentation CSV should include BOM section");
  assert(
    cabinetRunDocumentationCsv.includes("Preliminary Quote Summary"),
    "documentation CSV should include quote summary section"
  );
  assert(
    cabinetRunDocumentationCsv.includes("Assembly Profile"),
    "documentation CSV should include assembly profile section"
  );
  assert(
    cabinetRunDocumentationCsv.includes("Cabinet run"),
    "documentation CSV should include the assembly profile label"
  );
  assert(
    cabinetRunDocumentationCsv.includes("Dimension Schedule"),
    "documentation CSV should include dimension schedule section"
  );
  assert(
    cabinetRunDocumentationCsv.includes("Drawing Views"),
    "documentation CSV should include drawing view section"
  );
  assert(
    cabinetRunDocumentationCsv.includes("Material Schedule"),
    "documentation CSV should include material schedule section"
  );
  assert(
    cabinetRunDocumentationCsv.includes("Hardware Schedule"),
    "documentation CSV should include hardware schedule section"
  );
  assert(
    cabinetRunDocumentationCsv.includes("Edge Banding Schedule"),
    "documentation CSV should include edge-banding schedule section"
  );
  assert(
    cabinetRunDocumentationCsv.includes("Supplier Readiness"),
    "documentation CSV should include supplier readiness section"
  );
  assert(
    cabinetRunDocumentationCsv.includes("Fabrication Release Readiness"),
    "documentation CSV should include fabrication release readiness section"
  );
  assert(
    cabinetRunDocumentationCsv.includes("Supplier SKU Mappings"),
    "documentation CSV should include supplier SKU mapping section"
  );
  assert(cabinetRunDocumentationCsv.includes("Cut List"), "documentation CSV should include cut list section");
  assert(
    cabinetRunDocumentationCsv.includes("Installer Notes"),
    "documentation CSV should include installer notes section"
  );
  assert(
    cabinetRunDocumentationCsv.includes("Release Checklist"),
    "documentation CSV should include release checklist section"
  );
  assert(
    cabinetRunDocumentationCsv.includes("Cabinet run"),
    "documentation CSV should include the millwork name"
  );
  const cabinetRunShopDrawingSvg = buildCabinetShopDrawingSvg(cabinetRun);
  assert.strictEqual(
    buildCabinetShopDrawingSvgFileName(cabinetRun),
    "cabinet-run-shop-drawing.svg",
    "shop drawing SVG filename should be stable and user-readable"
  );
  assert(
    cabinetRunShopDrawingSvg.startsWith("<?xml"),
    "shop drawing SVG should include an XML declaration"
  );
  assert(
    cabinetRunShopDrawingSvg.includes("A-601 Overall Front Elevation"),
    "shop drawing SVG should include the front elevation view"
  );
  assert(
    cabinetRunShopDrawingSvg.includes("A-602 Typical Side Section"),
    "shop drawing SVG should include the side section view"
  );
  assert(
    cabinetRunShopDrawingSvg.includes("A-603 Plan Footprint"),
    "shop drawing SVG should include the plan footprint view"
  );
  const cabinetRunDxf = buildCabinetFabricationDxf(cabinetRun);
  assert.strictEqual(
    buildCabinetFabricationDxfFileName(cabinetRun),
    "cabinet-run-cut-layout.dxf",
    "fabrication DXF filename should be stable and user-readable"
  );
  assert(cabinetRunDxf.includes("$INSUNITS"), "fabrication DXF should declare drawing units");
  assert(cabinetRunDxf.includes("SECTION\n2\nENTITIES"), "fabrication DXF should include an entities section");
  assert(cabinetRunDxf.includes("CUT"), "fabrication DXF should include a cut layer");
  assert(cabinetRunDxf.includes("module-1:left_side_panel:0"), "fabrication DXF should label source part IDs");
  assert(
    (cabinetRunDxf.match(/\nLINE\n/g) ?? []).length >= cabinetRunDocumentation.cutList.length * 4,
    "fabrication DXF should draw a rectangle for each cut-list part"
  );
  const cabinetRunSkuMappings = buildCabinetSupplierSkuMappings(cabinetRun);
  assert.strictEqual(
    cabinetRunSkuMappings.length,
    cabinetRunDocumentation.supplierSkuMappings.length,
    "supplier mapping helper should match documentation snapshot rows"
  );
  assert(
    cabinetRunSkuMappings.some((item) => item.sourceType === "material" && item.status === "mapped"),
    "supplier mapping should include mapped material SKUs"
  );
  assert(
    cabinetRunSkuMappings.some((item) => item.sourceType === "hardware" && item.status === "mapped"),
    "supplier mapping should include mapped hardware SKUs"
  );
  assert(
    cabinetRunSkuMappings.some((item) => item.sourceType === "fabrication_service" && item.status === "custom_quote_required"),
    "supplier mapping should include custom fabrication quote rows"
  );
  const cabinetRunRfq = buildCabinetFabricationQuoteRequest(cabinetRun);
  assert.strictEqual(cabinetRunRfq.schema, "custom_millwork.rfq.v1", "RFQ should expose its schema");
  assert.strictEqual(
    cabinetRunRfq.sourceDefinitionFingerprint,
    cabinetRunFingerprint,
    "RFQ should include the source definition fingerprint for quote traceability"
  );
  assert.strictEqual(
    cabinetRunRfq.readiness.status,
    "ready_for_fabricator_review",
    "mapped material and hardware rows should make RFQ ready for fabricator review"
  );
  assert(cabinetRunRfq.readiness.mappedSkuCount > 0, "RFQ should count mapped SKU rows");
  assert(
    cabinetRunRfq.readiness.customQuoteRequiredCount > 0,
    "RFQ should count custom quote service rows"
  );
  assert.strictEqual(
    cabinetRunRfq.readiness.releaseChecklistCount,
    cabinetRunDocumentation.releaseChecklist.length,
    "RFQ should count release checklist rows"
  );
  assert.strictEqual(
    cabinetRunRfq.readiness.releaseBlockerCount,
    0,
    "RFQ should report no release blockers for mapped cabinet run"
  );
  assert.strictEqual(
    cabinetRunRfq.fabricationReleaseReadiness.status,
    "needs_review",
    "RFQ should include fabrication release readiness"
  );
  assert(
    cabinetRunRfq.artifacts.some((item) => item.type === "shop_drawing_svg" && item.fileName.endsWith("shop-drawing.svg")),
    "RFQ should reference the shop drawing SVG artifact"
  );
  assert(
    cabinetRunRfq.artifacts.some((item) => item.type === "source_definition" && item.fileName === "cabinet-run-source-definition.json"),
    "RFQ should reference the editable source definition artifact"
  );
  assert(
    cabinetRunRfq.artifacts.some((item) => item.type === "fabrication_dxf" && item.fileName.endsWith("cut-layout.dxf")),
    "RFQ should reference the fabrication DXF artifact"
  );
  assert.strictEqual(
    cabinetRunRfq.documentation.cutList.length,
    cabinetRunDocumentation.cutList.length,
    "RFQ should include fabrication cut-list rows"
  );
  assert.strictEqual(
    cabinetRunRfq.documentation.edgeBandingSchedule.length,
    cabinetRunDocumentation.edgeBandingSchedule.length,
    "RFQ should include edge-banding schedule rows"
  );
  assert.strictEqual(
    cabinetRunRfq.documentation.releaseChecklist.length,
    cabinetRunDocumentation.releaseChecklist.length,
    "RFQ should include release checklist rows"
  );
  const cabinetRunRfqJson = JSON.parse(buildCabinetFabricationQuoteRequestJson(cabinetRun));
  assert.strictEqual(
    cabinetRunRfqJson.schema,
    "custom_millwork.rfq.v1",
    "RFQ JSON should be parseable and preserve the schema"
  );
  const cabinetRunSourceDefinition = buildCabinetSourceDefinitionExport(cabinetRun);
  const timestampOnlyCabinetRun = {
    ...cabinetRun,
    createdAt: "1999-01-01T00:00:00.000Z",
    updatedAt: "2099-01-01T00:00:00.000Z",
  };
  assert.strictEqual(
    buildCabinetSourceDefinitionFingerprint(timestampOnlyCabinetRun),
    cabinetRunFingerprint,
    "source fingerprint should ignore volatile timestamp fields"
  );
  const changedSourceCabinetRun = clone(cabinetRun);
  changedSourceCabinetRun.modules[0].width += 1;
  assert.notStrictEqual(
    buildCabinetSourceDefinitionFingerprint(changedSourceCabinetRun),
    cabinetRunFingerprint,
    "source fingerprint should change when editable parametric content changes"
  );
  assert.strictEqual(
    buildCabinetSourceDefinitionFileName(cabinetRun),
    "cabinet-run-source-definition.json",
    "source definition filename should be stable and user-readable"
  );
  assert.strictEqual(
    cabinetRunSourceDefinition.schema,
    "custom_millwork.source_definition.v1",
    "source definition export should expose the source schema"
  );
  assert.strictEqual(
    cabinetRunSourceDefinition.sourceType,
    "cabinet_definition",
    "source definition export should identify cabinet definitions"
  );
  assert.strictEqual(
    cabinetRunSourceDefinition.cabinetDefinition.id,
    cabinetRun.id,
    "source definition export should include the editable cabinet definition"
  );
  assert.strictEqual(
    cabinetRunSourceDefinition.sourceDefinitionFingerprint,
    cabinetRunFingerprint,
    "source definition export should include a deterministic source fingerprint"
  );
  assert.strictEqual(
    cabinetRunSourceDefinition.millworkDefinition.sourceDefinition.id,
    cabinetRun.id,
    "source definition export should align the millwork wrapper"
  );
  assert(
    cabinetRunSourceDefinition.notes.some((note) => note.includes("source of truth")),
    "source definition export should explain source-of-truth behavior"
  );
  const cabinetRunSourceDefinitionJson = JSON.parse(buildCabinetSourceDefinitionJson(cabinetRun));
  assert.strictEqual(
    cabinetRunSourceDefinitionJson.schema,
    "custom_millwork.source_definition.v1",
    "source definition JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    cabinetRunSourceDefinitionJson.cabinetDefinition.modules.length,
    3,
    "source definition JSON should preserve cabinet modules"
  );
  assert.strictEqual(
    parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(cabinetRun)).id,
    cabinetRun.id,
    "source definition JSON should round-trip into an editable cabinet definition"
  );
  const tamperedSourceDefinition = JSON.parse(buildCabinetSourceDefinitionJson(cabinetRun));
  tamperedSourceDefinition.cabinetDefinition.modules[0].width += 1;
  assert.throws(
    () => parseCabinetSourceDefinitionJson(JSON.stringify(tamperedSourceDefinition)),
    /fingerprint/i,
    "source definition JSON should reject tampered source definitions when fingerprint is present"
  );
  assert.strictEqual(
    parseCabinetSourceDefinitionJson(JSON.stringify(cabinetRun)).id,
    cabinetRun.id,
    "raw cabinet definition JSON should import for flexibility"
  );
  const warningOnlySource = clone(cabinetRun);
  warningOnlySource.boardThickness = 30;
  assert.strictEqual(
    parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(warningOnlySource)).boardThickness,
    30,
    "source import should allow warning-only definitions"
  );
  const invalidSource = clone(cabinetRun);
  invalidSource.modules[0].width = -1;
  assert.throws(
    () => parseCabinetSourceDefinitionJson(buildCabinetSourceDefinitionJson(invalidSource)),
    /validation errors/i,
    "source import should reject definitions with validation errors"
  );
  assert.throws(
    () => parseCabinetSourceDefinitionJson("{not-json"),
    /not valid JSON/i,
    "source import should reject malformed JSON"
  );
  const cabinetRunPackage = buildCabinetDocumentationPackage(cabinetRun);
  assert.strictEqual(
    cabinetRunPackage.schema,
    "custom_millwork.package.v1",
    "documentation package should expose the millwork package schema"
  );
  assert.strictEqual(
    cabinetRunPackage.cabinetDefinition.id,
    cabinetRun.id,
    "documentation package should include the editable cabinet definition"
  );
  assert.strictEqual(
    cabinetRunPackage.millworkDefinition.sourceDefinition.id,
    cabinetRun.id,
    "documentation package should keep the millwork source definition aligned"
  );
  assert.strictEqual(
    cabinetRunPackage.sourceDefinitionFingerprint,
    cabinetRunFingerprint,
    "documentation package should include the source definition fingerprint"
  );
  assert.strictEqual(
    cabinetRunPackage.documentation.quoteSummary.estimatedTotal,
    cabinetRunDocumentation.quoteSummary.estimatedTotal,
    "documentation package should include the generated quote summary"
  );
  assert.strictEqual(
    cabinetRunPackage.documentation.drawingViewSchedule.length,
    cabinetRunDocumentation.drawingViewSchedule.length,
    "documentation package should include drawing view rows"
  );
  assert.strictEqual(
    cabinetRunPackage.documentation.edgeBandingSchedule.length,
    cabinetRunDocumentation.edgeBandingSchedule.length,
    "documentation package should include edge-banding schedule rows"
  );
  assert.strictEqual(
    cabinetRunPackage.documentation.supplierSkuMappings.length,
    cabinetRunDocumentation.supplierSkuMappings.length,
    "documentation package should include supplier SKU mapping rows"
  );
  assert.strictEqual(
    cabinetRunPackage.documentation.supplierReadiness.status,
    cabinetRunDocumentation.supplierReadiness.status,
    "documentation package should include supplier readiness"
  );
  assert.strictEqual(
    cabinetRunPackage.documentation.fabricationReleaseReadiness.status,
    cabinetRunDocumentation.fabricationReleaseReadiness.status,
    "documentation package should include fabrication release readiness"
  );
  assert.strictEqual(
    cabinetRunPackage.quoteRequest.schema,
    "custom_millwork.rfq.v1",
    "documentation package should embed the fabrication RFQ request"
  );
  assert.strictEqual(
    cabinetRunPackage.quoteRequest.documentation.releaseChecklist.length,
    cabinetRunDocumentation.releaseChecklist.length,
    "documentation package RFQ should embed release checklist rows"
  );
  assert.strictEqual(
    cabinetRunPackage.quoteRequest.documentation.edgeBandingSchedule.length,
    cabinetRunDocumentation.edgeBandingSchedule.length,
    "documentation package RFQ should embed edge-banding schedule rows"
  );
  assert(
    cabinetRunPackage.quoteRequest.artifacts.some((item) => item.type === "shop_drawing_svg"),
    "documentation package RFQ should reference the shop drawing SVG artifact"
  );
  const cabinetRunPackageJson = JSON.parse(buildCabinetDocumentationPackageJson(cabinetRun));
  assert.strictEqual(
    cabinetRunPackageJson.schema,
    "custom_millwork.package.v1",
    "documentation package JSON should be parseable and preserve the schema"
  );
  assert.strictEqual(
    parseCabinetSourceDefinitionJson(buildCabinetDocumentationPackageJson(cabinetRun)).id,
    cabinetRun.id,
    "documentation package JSON should import through its embedded cabinet definition"
  );
  const semanticPresetExpectations: Array<{
    id: CabinetPresetId;
    family: MillworkFamily;
    assemblyType: MillworkAssemblyType;
  }> = [
    { id: "closet_system", family: "closet", assemblyType: "closet_system" },
    { id: "media_wall", family: "media_wall", assemblyType: "media_wall" },
    { id: "mudroom_storage", family: "mudroom", assemblyType: "mudroom_storage" },
    { id: "laundry_room", family: "laundry_room", assemblyType: "laundry_room_cabinetry" },
    { id: "home_office_built_in", family: "home_office", assemblyType: "home_office_built_in" },
    { id: "library_wall", family: "library", assemblyType: "library_wall" },
    { id: "window_seat", family: "window_seat", assemblyType: "window_seat" },
    { id: "banquette", family: "banquette", assemblyType: "banquette" },
    { id: "murphy_bed", family: "murphy_bed", assemblyType: "murphy_bed" },
    { id: "fold_down_desk", family: "home_office", assemblyType: "fold_down_desk" },
    { id: "platform_storage_bed", family: "storage_bed", assemblyType: "platform_storage_bed" },
    {
      id: "under_stair_storage",
      family: "under_stair_storage",
      assemblyType: "under_stair_storage",
    },
    {
      id: "room_divider_storage",
      family: "room_divider_storage",
      assemblyType: "room_divider_storage",
    },
    { id: "home_bar", family: "bar", assemblyType: "home_bar" },
    { id: "kitchen_island", family: "island", assemblyType: "kitchen_island" },
    { id: "pantry_system", family: "pantry", assemblyType: "pantry_system" },
    { id: "wine_storage", family: "wine_storage", assemblyType: "wine_storage" },
    { id: "pet_built_in", family: "lifestyle_built_in", assemblyType: "pet_built_in" },
    { id: "kids_storage", family: "lifestyle_built_in", assemblyType: "kids_storage" },
    { id: "hobby_storage", family: "lifestyle_built_in", assemblyType: "hobby_storage" },
    { id: "wall_paneling", family: "paneling", assemblyType: "wall_paneling" },
    { id: "slat_wall", family: "paneling", assemblyType: "slat_wall" },
    { id: "ceiling_beams", family: "ceiling_woodwork", assemblyType: "ceiling_beams" },
    { id: "coffered_ceiling", family: "ceiling_woodwork", assemblyType: "coffered_ceiling" },
    { id: "fireplace_surround", family: "trim", assemblyType: "fireplace_surround" },
    { id: "trim_package", family: "trim", assemblyType: "trim_package" },
  ];
  const exposedPresetIds = new Set(CABINET_PRESET_OPTIONS.map((option) => option.id));
  assert(
    CABINET_PRESET_OPTIONS.every(
      (option) =>
        option.category.length > 0 &&
        option.description.length >= 24 &&
        option.estimatedMinutes > 0 &&
        option.keywords.length > 0
    ),
    "every Studio template should include searchable Quick Start metadata"
  );
  assert(
    new Set(CABINET_PRESET_OPTIONS.map((option) => option.category)).size >= 8,
    "Studio templates should span the primary room and millwork categories"
  );
  assert(
    CABINET_PRESET_OPTIONS.filter((option) => option.featured).length >= 6,
    "Quick Start should expose a curated recommended template set"
  );
  for (const expected of semanticPresetExpectations) {
    assert(exposedPresetIds.has(expected.id), `${expected.id} should be exposed in Studio options`);
    const semanticPreset = createCabinetPreset(expected.id, `cabinet-test-${expected.id}`);
    const semanticValidation = validateCabinetDefinition(semanticPreset);
    assert.strictEqual(semanticValidation.valid, true, `${expected.id} preset should validate`);
    const semanticMillwork = createCabinetMillworkDefinition(semanticPreset);
    assert.strictEqual(semanticMillwork.family, expected.family, `${expected.id} should store millwork family`);
    assert.strictEqual(
      semanticMillwork.assemblyType,
      expected.assemblyType,
      `${expected.id} should store millwork assembly type`
    );
    assert.strictEqual(
      semanticMillwork.assemblyProfile.schema,
      "custom_millwork.assembly_profile.v1",
      `${expected.id} should store the assembly profile schema`
    );
    assert.strictEqual(
      semanticMillwork.assemblyProfile.assemblyType,
      expected.assemblyType,
      `${expected.id} assembly profile should match its assembly type`
    );
    assert.strictEqual(
      semanticMillwork.assemblyProfile.family,
      expected.family,
      `${expected.id} assembly profile should match its family`
    );
    assert(
      semanticMillwork.assemblyProfile.fieldMeasurementRequirements.length > 0,
      `${expected.id} assembly profile should include field measurement requirements`
    );
    const semanticDocumentation = generateCabinetDocumentation(semanticPreset);
    assert.strictEqual(
      semanticDocumentation.assemblyProfile.assemblyType,
      expected.assemblyType,
      `${expected.id} documentation should include its assembly profile`
    );
    assert(semanticDocumentation.cutList.length > 0, `${expected.id} should produce a cut list`);
    assert(semanticDocumentation.edgeBandingSchedule.length > 0, `${expected.id} should produce an edge-banding schedule`);
    assert(
      semanticDocumentation.drawingViewSchedule.length > semanticPreset.modules.length,
      `${expected.id} should produce elevation and section drawing views`
    );
    assert(semanticDocumentation.releaseChecklist.length > 0, `${expected.id} should produce release gates`);
    assert(
      buildCabinetDocumentationCsv(semanticPreset).includes(semanticPreset.name),
      `${expected.id} documentation CSV should include its display name`
    );
  }
  const ceilingBeamDocumentation = generateCabinetDocumentation(
    createCabinetPreset("ceiling_beams", "cabinet-test-ceiling-beams")
  );
  assert.strictEqual(
    ceilingBeamDocumentation.assemblyProfile.placementKind,
    "ceiling_mounted",
    "ceiling beams should carry ceiling-mounted placement metadata"
  );
  assert(
    ceilingBeamDocumentation.releaseChecklist.some(
      (item) => item.id === "release:ceiling-structure-and-overhead-access"
    ),
    "ceiling-mounted millwork should require ceiling structure and overhead access review"
  );
  const murphyBedDocumentation = generateCabinetDocumentation(
    createCabinetPreset("murphy_bed", "cabinet-test-murphy-profile")
  );
  assert(
    murphyBedDocumentation.releaseChecklist.some(
      (item) => item.id === "release:operable-hardware-and-safety-review"
    ),
    "convertible millwork should require operable hardware and safety review"
  );

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
    projectQuotePackage.disclaimer.includes(CABINET_PLANNING_ESTIMATE_DISCLAIMER),
    "project quote package should include the canonical planning-estimate disclaimer"
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

  try {
    const blob = await exportCabinetAsGlb(base);
    assert(blob.size > 0, "GLB export should return a non-empty Blob");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/FileReader|document|window|self/i.test(message)) {
      throw error;
    }
    console.warn(`Skipping GLB export assertion in this runtime: ${message}`);
  }

  console.log("Cabinetry tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
