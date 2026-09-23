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
  getCabinetOverallDepth,
  getCabinetOverallHeight,
  getCabinetOverallWidth,
} from "@/features/cabinetry/layout";
import {
  createCabinetPreset,
} from "@/features/cabinetry/presets";
import {
  validateCabinetDefinition,
} from "@/features/cabinetry/validation";
import {
  clone,
} from "./helpers";

export function runArchitecturalPresetContractTests(): void {
  const base = createCabinetPreset("base", "cabinet-test-architectural-base");
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
    { x: 56, y: 21, z: 0 },
    "pantry tray decks should sit inside the cabinet opening"
  );
  assert.deepStrictEqual(
    pantryTrayFronts[0]?.size,
    { width: 488, height: 70, depth: 18 },
    "pantry tray fronts should follow the configured lip height"
  );
  assert.deepStrictEqual(
    pantryTrayFronts[0]?.position,
    { x: 56, y: 39, z: 0 },
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
    { x: 215, y: 0, z: 435 },
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
}
