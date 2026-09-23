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
  createCabinetPreset,
} from "@/features/cabinetry/presets";
import {
  validateCabinetDefinition,
} from "@/features/cabinetry/validation";
import {
  clone,
  round1,
} from "./helpers";

export function runCoreRenderingContractTests(): void {
  const base = createCabinetPreset("base", "cabinet-test-base");
  const baseValidation = validateCabinetDefinition(base);
  assert.strictEqual(baseValidation.valid, true, "valid base cabinet should pass");

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
  for (const required of ["left_side_panel", "right_side_panel", "bottom_panel", "top_panel", "back_panel"]) {
    assert(parts.some((part) => part.type === required), `base cabinet should include ${required}`);
  }
  assert(
    parts.every((part) => part.type !== "toe_kick"),
    "default base cabinets should not generate a recessed toe kick"
  );
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
    { x: 34, y: 43.5, z: 18 },
    "first drawer box should sit behind the lower drawer front with slide side clearance"
  );
  assert.deepStrictEqual(
    {
      width: round1(baseDrawerBoxSides[0]?.size.width ?? 0),
      height: round1(baseDrawerBoxSides[0]?.size.height ?? 0),
      depth: round1(baseDrawerBoxSides[0]?.size.depth ?? 0),
    },
    { width: 12, height: 173, depth: 480 },
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
    { x: 21, y: 66, z: 0 },
    "first drawer slide pair should start behind the lower drawer front"
  );
  for (const slide of baseDrawerSlides) {
    const linkedFront = parts.find(
      (part) => part.id === slide.metadata?.frontPartId
    );
    assert(linkedFront, `${slide.id} should reference an existing drawer front`);
    assert(
      slide.position.z >= linkedFront.position.z + linkedFront.size.depth,
      `${slide.id} must not intersect its closed drawer front`
    );
  }
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
    baseDocumentation.cutList.every((item) => item.type !== "toe_kick"),
    "default cut lists should not contain toe-kick parts"
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
    baseDocumentation.dimensionSchedule.every(
      (item) => !item.notes?.includes("toe kick")
    ),
    "default dimension schedules should not describe a toe kick"
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
    baseDocumentation.drawingViewSchedule.every(
      (item) => !item.notes?.includes("Toe kick")
    ),
    "default drawing schedules should not describe a toe kick"
  );
  assert(
    baseDocumentation.installerNotes.every((item) => item.id !== "note:toe-kick-setout"),
    "default installer notes should not include toe-kick setout"
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
  customToeKickCabinet.toeKickHeight = 100;
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
    { width: 42, height: 720, depth: 20 },
    "face frame stiles should use configured width, frame height, and depth"
  );
  assert.deepStrictEqual(
    faceFrameParts[0]?.position,
    { x: 0, y: 0, z: -20 },
    "face frame stiles should extend to the flush cabinet base"
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
  impossibleDrawerBoxes.modules[0].drawerBoxHeightClearance = 240;
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
    { x: 66, y: 1988, z: 580 },
    "first anti-tip anchor should sit outside the rear high mounting point"
  );
  const tallBackPanel = tallParts.find((part) => part.type === "back_panel");
  assert(
    tallBackPanel &&
      antiTipAnchors.every(
        (anchor) =>
          anchor.position.z >= tallBackPanel.position.z + tallBackPanel.size.depth
      ),
    "anti-tip anchors should not intersect the rear panel in 3D previews"
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
    { x: 56, y: 21, z: 0 },
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
}
