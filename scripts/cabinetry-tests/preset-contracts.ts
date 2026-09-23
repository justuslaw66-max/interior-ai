import assert from "assert";
import {
  buildCabinetFabricationDxf,
  buildCabinetFabricationDxfFileName,
} from "@/features/cabinetry/exportCabinetFabricationDxf";
import {
  buildCabinetShopDrawingSvg,
  buildCabinetShopDrawingSvgFileName,
} from "@/features/cabinetry/exportCabinetShopDrawingSvg";
import {
  buildCabinetFabricationQuoteRequest,
  buildCabinetFabricationQuoteRequestJson,
  buildCabinetSupplierSkuMappings,
  buildCabinetDocumentationPackage,
  buildCabinetDocumentationPackageJson,
  buildCabinetDocumentationCsv,
  buildCabinetSourceDefinitionExport,
  buildCabinetSourceDefinitionFileName,
  buildCabinetSourceDefinitionFingerprint,
  buildCabinetSourceDefinitionJson,
  generateCabinetDocumentation,
  parseCabinetSourceDefinitionJson,
} from "@/features/cabinetry/generateCabinetDocumentation";
import {
  generateCabinetParts,
} from "@/features/cabinetry/generateCabinetParts";
import {
  CABINET_PRESET_OPTIONS,
  createCabinetPreset,
  type CabinetPresetId,
} from "@/features/cabinetry/presets";
import {
  validateCabinetDefinition,
} from "@/features/cabinetry/validation";
import {
  createCabinetMillworkDefinition,
} from "@/features/millwork/createCabinetMillworkDefinition";
import type {
  MillworkAssemblyType,
  MillworkFamily,
} from "@/features/millwork/types";
import {
  clone,
} from "./helpers";

export function runPresetContractTests(): void {
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
  assert.strictEqual(cabinetRunDocumentation.cutList.length, 27, "cabinet run should produce a fabrication cut list");
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
    27.36,
    "cabinet run should total edge-banding length from the cut list"
  );
  assert(
    cabinetRunDocumentation.edgeBandingSchedule.some((item) => item.materialId === "white_melamine" && item.partCount === 16),
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
}
