import assert from "assert";
import {
  buildCabinetFabricationDxf,
} from "@/features/cabinetry/exportCabinetFabricationDxf";
import {
  buildCabinetShopDrawingSvg,
} from "@/features/cabinetry/exportCabinetShopDrawingSvg";
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
  getCabinetVisiblePreviewParts,
} from "@/features/cabinetry/previewParts";
import {
  createCabinetPreset,
} from "@/features/cabinetry/presets";
import {
  validateCabinetDefinition,
} from "@/features/cabinetry/validation";
import {
  clone,
} from "./helpers";

export function runSpecialtyPresetContractTests(): void {
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
    { x: 18, y: 605, z: 45 },
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
    { width: 18, height: 2058, depth: 420 },
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
  assert.strictEqual(wineRackHorizontalRails[0]?.position.y, 349, "first wine rack horizontal rail should split rack rows evenly");
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
  tightWineRack.modules[1].wineRackRowCount = 21;
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
    { x: 621, y: 191, z: 0 },
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
}
