import assert from "assert";
import {
  buildCabinetSourceDefinitionJson,
  generateCabinetDocumentation,
  parseCabinetSourceDefinitionJson,
} from "@/features/cabinetry/generateCabinetDocumentation";
import {
  generateCabinetParts,
} from "@/features/cabinetry/generateCabinetParts";
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
import {
  reconcileCabinetModuleSizing,
} from "@/features/cabinetry/moduleSizingReconciliation";
import {
  getCabinetModuleRunWidth,
  getCabinetOverallHeight,
  getCabinetOverallWidth,
} from "@/features/cabinetry/layout";
import {
  getCabinetOverallWidthLimits,
} from "@/features/cabinetry/moduleWidthConstraints";
import {
  getCabinetMinimumModuleWidthMm,
} from "@/features/cabinetry/moduleWidthRules";
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
} from "@/features/cabinetry/presets";
import {
  CABINET_PROPERTY_REGISTRY,
  filterCabinetProperties,
} from "@/features/cabinetry/propertyRegistry";
import {
  validateCabinetDefinition,
} from "@/features/cabinetry/validation";
import {
  clone,
  round1,
} from "./helpers";

export function runLayoutAndValidationTests(): void {
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
    assert.strictEqual(
      preset.toeKickHeight,
      0,
      `${option.id} should default to a flush base without a toe kick`
    );
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
