import { generateCabinetParts } from "./generateCabinetParts";
import { generateCabinetBOM } from "./generateCabinetBOM";
import { resolveCabinetPartFabricationSpec } from "./fabricationSemantics";
import { resolveCabinetHardwareCompatibility } from "./hardwareCompatibility";
import {
  getCabinetDoorLayoutMode,
  getCabinetDrawerHeightMode,
  getCabinetDrawerHeightProportions,
  getCabinetEffectiveDoorCount,
  getCabinetHandlePlacementMode,
} from "./frontBehavior";
import { createCabinetMillworkDefinition } from "@/features/millwork/createCabinetMillworkDefinition";
import { buildMillworkAssetManifest } from "@/features/millwork/buildMillworkAssetManifest";
import { validateCabinetDefinition } from "./validation";
import {
  CABINET_HANGING_ROD_HARDWARE_ID,
  CABINET_HANGING_ROD_SKU_ID,
} from "./hangingRodLayout";
import {
  getCabinetPanelColumnCount,
  getCabinetPanelRowCount,
  hasCabinetPanelFrame,
} from "./panelLayout";
import {
  getCabinetCeilingBeamCount,
  getCabinetCeilingGridColumnCount,
  getCabinetCeilingGridRowCount,
  isCabinetCeilingBeamArray,
  isCabinetCeilingComponent,
  isCabinetCofferedCeilingGrid,
} from "./ceilingBeamLayout";
import {
  getCabinetFireplaceFrameOuterWidth,
  getCabinetFireplaceOpeningHeight,
  getCabinetFireplaceOpeningWidth,
  getCabinetTrimLeftEndTreatment,
  getCabinetTrimMemberCount,
  getCabinetTrimMiterAngle,
  getCabinetTrimPlacement,
  getCabinetTrimProfileDepth,
  getCabinetTrimRevealStripDepth,
  getCabinetTrimRevealStripHeight,
  getCabinetTrimRevealStripInsetFromTop,
  getCabinetTrimReturnDepth,
  getCabinetTrimRightEndTreatment,
  getCabinetTrimSetoutHeight,
  hasCabinetTrimRevealStrip,
  isCabinetFireplaceSurroundFrame,
  isCabinetTrimComponent,
  isCabinetTrimRun,
} from "./trimLayout";
import {
  getCabinetConvertibleHingeHeight,
  getCabinetConvertibleOpenDepth,
  getCabinetConvertiblePanelHeight,
  getCabinetConvertibleSupportLegCount,
  getCabinetWallBedDisplayState,
  getCabinetWallBedMattressSize,
  getCabinetWallBedOrientation,
  getCabinetWallBedSideStorage,
  isCabinetConvertibleComponent,
  isCabinetFoldDownWorksurface,
  isCabinetWallBedPanel,
} from "./convertibleLayout";
import {
  getCabinetPlatformDeckDepth,
  getCabinetPlatformDeckThickness,
  getCabinetPlatformSupportRibCount,
  hasCabinetPlatformDeck,
} from "./platformBedLayout";
import {
  getCabinetStairScribeDirection,
  getCabinetStairScribeHighHeight,
  getCabinetStairScribeLowHeight,
  getCabinetStairScribeStepCount,
  hasCabinetStairScribe,
} from "./stairScribeLayout";
import {
  getCabinetRoomDividerBackPanelCount,
  getCabinetRoomDividerStabilizerFootCount,
  hasCabinetRoomDividerDetails,
} from "./roomDividerLayout";
import {
  getCabinetLifestyleInsertCount,
  getCabinetLifestyleInsertKind,
  hasCabinetLifestyleInsert,
} from "./lifestyleInsertLayout";
import {
  getCabinetWineRackColumnCount,
  getCabinetWineRackRowCount,
  hasCabinetWineRack,
} from "./wineRackLayout";
import {
  getCabinetSeatBackHeight,
  getCabinetSeatCushionThickness,
  getCabinetSeatDeckThickness,
  hasCabinetSeatBack,
  hasCabinetSeatingDetails,
} from "./seatingLayout";
import {
  CABINET_MUDROOM_HOOK_HARDWARE_ID,
  CABINET_MUDROOM_HOOK_SKU_ID,
  getCabinetMudroomHookCount,
  getCabinetMudroomHookRailHeight,
  getCabinetShoeCubbyCount,
  getCabinetShoeCubbyDepth,
  getCabinetShoeCubbyHeight,
  hasCabinetMudroomHooks,
  hasCabinetShoeCubbies,
} from "./mudroomLayout";
import {
  getCabinetPlumbingChaseDepth,
  getCabinetPlumbingChaseHeight,
  getCabinetPlumbingChaseWidth,
  getCabinetSinkCutoutDepth,
  getCabinetSinkCutoutOffsetZ,
  getCabinetSinkCutoutWidth,
  hasCabinetPlumbingChase,
  hasCabinetSinkCutout,
} from "./vanityServiceLayout";
import {
  getCabinetLaundryApplianceCount,
  getCabinetLaundryApplianceDepth,
  getCabinetLaundryApplianceHeight,
  getCabinetLaundryApplianceKind,
  getCabinetLaundryApplianceRequiredDepth,
  getCabinetLaundryApplianceRequiredHeight,
  getCabinetLaundryApplianceRequiredWidth,
  getCabinetLaundryApplianceWidth,
  getCabinetLaundryUtilityChaseDepth,
  getCabinetLaundryUtilityChaseHeight,
  hasCabinetLaundryApplianceBay,
} from "./laundryApplianceLayout";
import {
  getCabinetCableGrommetCount,
  getCabinetCableGrommetDiameter,
  getCabinetCableGrommetOffsetFromBack,
  getCabinetDeskPowerChaseDepth,
  getCabinetDeskPowerChaseHeight,
  getCabinetOfficeWorksurfaceDepth,
  getCabinetOfficeWorksurfaceThickness,
  hasCabinetOfficeWorkstation,
} from "./officeWorkstationLayout";
import {
  getCabinetIslandSeatingOverhangDepth,
  getCabinetIslandSupportPanelCount,
  getCabinetIslandSupportPanelDepth,
  getCabinetIslandSupportPanelThickness,
  hasCabinetIslandSeating,
} from "./islandSeatingLayout";
import {
  CABINET_PANTRY_PULL_OUT_SLIDE_HARDWARE_ID,
  CABINET_PANTRY_PULL_OUT_SLIDE_SKU_ID,
  getCabinetPantryPullOutTrayCount,
  getCabinetPantryPullOutTrayDepth,
  getCabinetPantryPullOutTrayFrontHeight,
  hasCabinetPantryPullOuts,
} from "./pantryPullOutLayout";
import {
  getCabinetMediaCableChaseDepth,
  getCabinetMediaCableChaseHeight,
  getCabinetMediaCableChaseWidth,
  getCabinetMediaTvBlockingThickness,
  getCabinetMediaTvMountHeight,
  getCabinetMediaTvOpeningHeight,
  getCabinetMediaTvOpeningWidth,
  getCabinetMediaVentSlotCount,
  getCabinetMediaVentSlotHeight,
  getCabinetMediaVentSlotSpacing,
  getCabinetMediaVentSlotWidth,
  hasCabinetMediaWallDetails,
} from "./mediaWallLayout";
import {
  CABINET_LIBRARY_LADDER_RAIL_HARDWARE_ID,
  CABINET_LIBRARY_LADDER_RAIL_SKU_ID,
  getCabinetLibraryLadderRailDiameter,
  getCabinetLibraryLadderRailHeight,
  getCabinetLibraryLadderRailProjection,
  getCabinetLibraryLadderStandoffCount,
  hasCabinetLibraryLadderRail,
} from "./libraryLadderLayout";
import {
  CABINET_STEMWARE_RACK_HARDWARE_ID,
  CABINET_STEMWARE_RACK_SKU_ID,
  getCabinetStemwareRackDepth,
  getCabinetStemwareRackLaneCount,
  getCabinetStemwareRackLaneSpacing,
  getCabinetStemwareRackMountHeight,
  getCabinetStemwareRackRailWidth,
  hasCabinetStemwareRack,
} from "./stemwareRackLayout";
import {
  CABINET_LIGHTING_CHANNEL_HARDWARE_ID,
  CABINET_LIGHTING_CHANNEL_SKU_ID,
  getCabinetLightingChannelCount,
  getCabinetLightingChannelDepth,
  getCabinetLightingChannelHeight,
  getCabinetLightingChannelInsetFromFront,
  hasCabinetLightingChannels,
} from "./lightingLayout";
import {
  CABINET_HAMPER_BASKET_HARDWARE_ID,
  CABINET_HAMPER_BASKET_SKU_ID,
  CABINET_HAMPER_SLIDE_HARDWARE_ID,
  CABINET_HAMPER_SLIDE_SKU_ID,
  getCabinetHamperBasketCount,
  getCabinetHamperBasketDepth,
  getCabinetHamperBasketHeight,
  getCabinetHamperSlideClearance,
  hasCabinetHamperPullOut,
} from "./hamperPullOutLayout";
import {
  CABINET_SHELF_PIN_HARDWARE_ID,
  CABINET_SHELF_PIN_SKU_ID,
  getCabinetShelfPinHoleCount,
  getCabinetShelfPinHoleSpacing,
  getCabinetShelfPinRowPairCount,
  getCabinetShelfPinStartHeight,
  hasCabinetShelfPinRows,
} from "./shelfPinLayout";
import {
  CABINET_DOOR_HINGE_HARDWARE_ID,
  CABINET_DOOR_HINGE_SKU_ID,
  getCabinetDoorHingeCountPerDoor,
  getCabinetDoorHingeInsetFromTopBottom,
  hasCabinetDoorHinges,
} from "./doorHingeLayout";
import {
  CABINET_DRAWER_SLIDE_HARDWARE_ID,
  CABINET_DRAWER_SLIDE_SKU_ID,
  getCabinetDrawerSlideClearance,
  getCabinetDrawerSlideLength,
  hasCabinetDrawerSlides,
} from "./drawerSlideLayout";
import {
  getCabinetDrawerBoxBackClearance,
  getCabinetDrawerBoxBottomThickness,
  getCabinetDrawerBoxHeightClearance,
  getCabinetDrawerBoxLayouts,
  getCabinetDrawerBoxSideThickness,
  hasCabinetDrawerBoxes,
} from "./drawerBoxLayout";
import {
  getCabinetInstallationCleatHeight,
  getCabinetInstallationCleatInsetFromTop,
  getCabinetInstallationCleatThickness,
  hasCabinetInstallationCleat,
} from "./installationCleatLayout";
import {
  CABINET_ANTI_TIP_ANCHOR_HARDWARE_ID,
  CABINET_ANTI_TIP_ANCHOR_SKU_ID,
  getCabinetAntiTipAnchorCount,
  getCabinetAntiTipAnchorHeight,
  getCabinetAntiTipAnchorInsetFromSides,
  hasCabinetAntiTipAnchors,
} from "./antiTipAnchorLayout";
import {
  CABINET_LEVELING_FOOT_HARDWARE_ID,
  CABINET_LEVELING_FOOT_SKU_ID,
  getCabinetLevelingFootCount,
  getCabinetLevelingFootDiameter,
  getCabinetLevelingFootHeight,
  getCabinetLevelingFootInsetFromFrontBack,
  getCabinetLevelingFootInsetFromSides,
  hasCabinetLevelingFeet,
  isCabinetLevelingFootEligibleModule,
} from "./levelingFootLayout";
import {
  getCabinetFaceFrameDepth,
  getCabinetFaceFrameRailHeight,
  getCabinetFaceFrameStileWidth,
  hasCabinetFaceFrame,
  isCabinetFaceFrameEligibleModule,
} from "./faceFrameLayout";
import {
  getCabinetBacksplashHeight,
  getCabinetBacksplashThickness,
  getCabinetLeftEndPanelThickness,
  getCabinetLeftFillerScribeAllowance,
  getCabinetLeftFillerWidth,
  getCabinetRightEndPanelThickness,
  getCabinetRightFillerScribeAllowance,
  getCabinetRightFillerWidth,
  getCabinetToeKickDepth,
  getCabinetToeKickSetback,
} from "./layout";
import type { MillworkAssemblyType } from "@/features/millwork/types";
import type { MillworkFamily } from "@/features/millwork/types";
import type {
  CabinetCutListItem,
  CabinetDefinition,
  CabinetDimensionScheduleItem,
  CabinetDocumentationSnapshot,
  CabinetDocumentationPackage,
  CabinetDrawingViewScheduleItem,
  CabinetEdgeBandingScheduleItem,
  CabinetFabricationArtifact,
  CabinetFabricationQuoteRequest,
  CabinetFabricationReleaseReadinessSnapshot,
  CabinetHardwareScheduleItem,
  CabinetInstallerNote,
  CabinetMaterialRef,
  CabinetMaterialScheduleItem,
  CabinetPart,
  CabinetPlacedAssetPackage,
  CabinetPlacedAssetInstallerWorkOrder,
  CabinetProjectApprovalItem,
  CabinetProjectApprovalPackage,
  CabinetProjectApprovalTotals,
  CabinetProjectCncBatchAssetSummary,
  CabinetProjectCncBatchMaterialSummary,
  CabinetProjectCncBatchPackage,
  CabinetProjectCncBatchTotals,
  CabinetProjectCutListAssetSummary,
  CabinetProjectCutListMaterialSummary,
  CabinetProjectCutListPackage,
  CabinetProjectCutListPartItem,
  CabinetProjectCutListTotals,
  CabinetProjectDrawingSetAssetSummary,
  CabinetProjectDrawingSetPackage,
  CabinetProjectDrawingSetSheetSummary,
  CabinetProjectDrawingSetTotals,
  CabinetProjectFabricationQuoteRequest,
  CabinetProjectFabricationReleaseAssetSummary,
  CabinetProjectFabricationReleasePackage,
  CabinetProjectFabricationReleaseTotals,
  CabinetProjectFieldVerificationAssetSummary,
  CabinetProjectFieldVerificationChecklistItem,
  CabinetProjectFieldVerificationPackage,
  CabinetProjectFieldVerificationRoomSummary,
  CabinetProjectFieldVerificationTotals,
  CabinetProjectFinishAssetSummary,
  CabinetProjectFinishEdgeBandingSummary,
  CabinetProjectFinishHardwareSummary,
  CabinetProjectFinishMaterialSummary,
  CabinetProjectFinishSchedulePackage,
  CabinetProjectFinishScheduleTotals,
  CabinetProjectHandoffAssetSummary,
  CabinetProjectHandoffChecklistItem,
  CabinetProjectHandoffPackage,
  CabinetProjectHandoffTotals,
  CabinetProjectInstallationAssetPlan,
  CabinetProjectInstallationPlanPackage,
  CabinetProjectInstallationRoomPlan,
  CabinetProjectInstallationTotals,
  CabinetProjectProcurementLineItem,
  CabinetProjectProcurementPackage,
  CabinetProjectProcurementTotals,
  CabinetProjectPurchaseReadinessAssetSummary,
  CabinetProjectPurchaseReadinessLineItem,
  CabinetProjectPurchaseReadinessPackage,
  CabinetProjectPurchaseReadinessTotals,
  CabinetProjectQuoteAssetSummary,
  CabinetProjectQuoteCategorySummary,
  CabinetProjectQuotePackage,
  CabinetProjectQuoteRoomSummary,
  CabinetProjectQuoteTotals,
  CabinetProjectRevisionAssetSnapshot,
  CabinetProjectRevisionChangeItem,
  CabinetProjectRevisionPackage,
  CabinetProjectRevisionTotals,
  CabinetProjectSchedulePackage,
  CabinetProjectScheduleRoomSummary,
  CabinetProjectScheduleTotals,
  CabinetProjectScopeAssemblySummary,
  CabinetProjectScopeCoverageItem,
  CabinetProjectScopeFamilySummary,
  CabinetProjectScopePackage,
  CabinetProjectScopeTotals,
  CabinetQuoteLineItem,
  CabinetQuoteSummary,
  CabinetReleaseChecklistItem,
  CabinetSourceDefinitionExport,
  CabinetSupplierReadinessSnapshot,
  CabinetSupplierSkuMappingItem,
  PlacedCabinetAsset,
} from "./types";

/**
 * Optional immutable inputs for callers that already generated cabinetry parts
 * or documentation schedules during the same update. Any omitted value is
 * derived with the same public generator used by the one-argument APIs.
 */
export const CABINET_PLANNING_ESTIMATE_DISCLAIMER =
  "Planning estimate only—not a supplier quote, checkout total, purchase order, or fabrication authorization.";

export interface CabinetDocumentationGenerationInputs {
  readonly parts?: readonly CabinetPart[];
  readonly cutList?: readonly CabinetCutListItem[];
  readonly materialSchedule?: readonly CabinetMaterialScheduleItem[];
  readonly hardwareSchedule?: readonly CabinetHardwareScheduleItem[];
  readonly edgeBandingSchedule?: readonly CabinetEdgeBandingScheduleItem[];
  readonly drawingViewSchedule?: readonly CabinetDrawingViewScheduleItem[];
}

const PART_NAMES: Record<CabinetPart["type"], string> = {
  left_side_panel: "Left side panel",
  right_side_panel: "Right side panel",
  bottom_panel: "Bottom panel",
  top_panel: "Top panel",
  back_panel: "Back panel",
  shelf: "Shelf",
  vertical_divider: "Vertical divider",
  door_front: "Door front",
  drawer_front: "Drawer front",
  face_frame_stile: "Face frame stile",
  face_frame_rail: "Face frame rail",
  drawer_box_side: "Drawer box side",
  drawer_box_back: "Drawer box back",
  drawer_box_bottom: "Drawer box bottom",
  installation_cleat: "Installation cleat",
  anti_tip_anchor_bracket: "Anti-tip anchor bracket",
  leveling_foot: "Adjustable leveling foot",
  toe_kick: "Toe kick",
  handle: "Handle",
  hanging_rod: "Hanging rod",
  slat: "Slat",
  panel_stile: "Panel stile",
  panel_rail: "Panel rail",
  ceiling_beam: "Ceiling beam",
  trim_member: "Trim member",
  trim_return: "Trim return",
  trim_reveal_strip: "Trim reveal/backing strip",
  convertible_panel: "Convertible panel",
  support_leg: "Support leg",
  hinge_rail: "Hinge rail",
  platform_deck: "Platform deck",
  platform_support_rib: "Platform support rib",
  stair_scribe_panel: "Stair scribe panel",
  room_divider_back_panel: "Room divider back panel",
  room_divider_stabilizer_foot: "Room divider stabilizer foot",
  lifestyle_insert_deck: "Lifestyle insert deck",
  lifestyle_insert_lip: "Lifestyle insert lip",
  wine_rack_vertical_divider: "Wine rack vertical divider",
  wine_rack_horizontal_rail: "Wine rack horizontal rail",
  seat_deck_panel: "Seat deck panel",
  seat_cushion: "Seat cushion",
  seat_back_panel: "Seat back panel",
  mudroom_hook_rail: "Mudroom hook rail",
  mudroom_hook: "Mudroom hook",
  shoe_cubby_vertical_divider: "Shoe cubby vertical divider",
  shoe_cubby_shelf: "Shoe cubby shelf",
  sink_cutout_template: "Sink cutout template",
  plumbing_chase_void: "Plumbing chase clearance",
  laundry_appliance_clearance: "Laundry appliance clearance",
  laundry_utility_chase: "Laundry utility chase",
  office_worksurface: "Office work surface",
  cable_grommet_template: "Cable grommet template",
  desk_power_chase: "Desk power chase",
  island_overhang_support_panel: "Island overhang support panel",
  pantry_pullout_tray_deck: "Pantry pull-out tray deck",
  pantry_pullout_tray_front: "Pantry pull-out tray front",
  pantry_pullout_slide_pair: "Pantry pull-out slide pair",
  media_tv_blocking_panel: "Media TV blocking panel",
  media_cable_chase: "Media cable chase",
  media_vent_slot_template: "Media vent slot template",
  library_ladder_rail: "Library ladder rail",
  library_ladder_standoff: "Library ladder rail standoff",
  stemware_rack_rail: "Stemware rack rail",
  led_lighting_channel: "LED lighting channel",
  hamper_pullout_basket: "Pull-out hamper basket",
  hamper_pullout_slide_pair: "Pull-out hamper slide pair",
  shelf_pin_hole_row: "Adjustable shelf pin row",
  door_hinge_pair: "Concealed door hinge pair",
  drawer_slide_pair: "Soft-close drawer slide pair",
  countertop: "Countertop",
  backsplash: "Backsplash",
  filler: "Filler",
  end_panel: "End panel",
};

const roundMm = (value: number) => Math.round(value * 10) / 10;
const roundSqM = (value: number) => Math.round(value * 1000) / 1000;
const roundM = (value: number) => Math.round(value * 100) / 100;
const roundMoney = (value: number) => Math.round(value);
const metadataNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const SOURCE_FINGERPRINT_OMITTED_KEYS = new Set(["createdAt", "updatedAt"]);
const QUOTE_CATEGORIES: CabinetQuoteLineItem["category"][] = [
  "materials",
  "hardware",
  "fabrication",
  "installation",
  "contingency",
];
const QUOTE_CATEGORY_LABELS: Record<CabinetQuoteLineItem["category"], string> = {
  materials: "Materials",
  hardware: "Hardware",
  fabrication: "Fabrication",
  installation: "Installation",
  contingency: "Contingency",
};

function fileSafeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "millwork";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function canonicalizeForSourceFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeForSourceFingerprint(item));
  }
  if (!isRecord(value)) return value;

  return Object.keys(value)
    .filter((key) => !SOURCE_FINGERPRINT_OMITTED_KEYS.has(key))
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = canonicalizeForSourceFingerprint(value[key]);
      return acc;
    }, {});
}

function hashStringToBase36(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(36).padStart(10, "0");
}

export function buildCabinetSourceDefinitionFingerprint(definition: CabinetDefinition): string {
  const canonical = JSON.stringify(canonicalizeForSourceFingerprint(definition));
  return `cabdef-v1-${hashStringToBase36(canonical)}`;
}

function materialById(definition: CabinetDefinition): Map<string, CabinetMaterialRef> {
  return new Map(definition.materials.map((material) => [material.id, material]));
}

function largestFaceAreaSqM(part: CabinetPart): number {
  const { width, height, depth } = part.size;
  return Math.max(width * height, width * depth, height * depth) / 1_000_000;
}

function fillerCutListNote(part: CabinetPart): string {
  const installedWidth = metadataNumber(part.metadata?.installedWidth) ?? part.size.width;
  const scribeAllowance = metadataNumber(part.metadata?.scribeAllowance) ?? 0;
  const cutWidth = metadataNumber(part.metadata?.cutWidth) ?? part.size.width;
  const side = typeof part.metadata?.side === "string" ? part.metadata.side : "field";
  const allowanceSummary =
    scribeAllowance > 0
      ? `, including ${roundMm(scribeAllowance)} mm field-scribe allowance`
      : "";

  return `Filler/scribe strip (${side}); installed width ${roundMm(installedWidth)} mm, cut width ${roundMm(cutWidth)} mm${allowanceSummary}; confirm wall plumb, reveal, and field-fit trimming before finishing.`;
}

function endPanelCutListNote(part: CabinetPart): string {
  const thickness = metadataNumber(part.metadata?.thickness) ?? part.size.width;
  const side = typeof part.metadata?.side === "string" ? part.metadata.side : "field";

  return `Finished end panel (${side}); ${roundMm(thickness)} mm thick visible end, confirm finished face, grain direction, reveal alignment, and adjacent clearance before fabrication.`;
}

function toeKickCutListNote(part: CabinetPart): string {
  const height = metadataNumber(part.metadata?.height) ?? part.size.height;
  const setback = metadataNumber(part.metadata?.setback) ?? part.position.z;
  const depth = metadataNumber(part.metadata?.depth) ?? part.size.depth;

  return `Recessed toe kick; ${roundMm(height)} mm high, ${roundMm(setback)} mm front setback, ${roundMm(depth)} mm cut depth; confirm leveling feet, plinth fastening, floor clearance, and finish return before installation.`;
}

function backsplashCutListNote(part: CabinetPart): string {
  const height = metadataNumber(part.metadata?.height) ?? part.size.height;
  const thickness = metadataNumber(part.metadata?.thickness) ?? part.size.depth;

  return `Backsplash/upstand; ${roundMm(height)} mm high x ${roundMm(thickness)} mm thick; confirm wall scribe, sealant line, countertop seam, outlet clearances, and exposed end-edge treatment before fabrication.`;
}

export function generateCabinetCutList(
  definition: CabinetDefinition,
  precomputedParts?: readonly CabinetPart[]
): CabinetCutListItem[] {
  const materials = materialById(definition);

  return (precomputedParts ?? generateCabinetParts(definition))
    .filter((part) => part.type !== "handle" && part.type !== "hanging_rod" && part.type !== "hinge_rail" && part.type !== "seat_cushion" && part.type !== "mudroom_hook" && part.type !== "sink_cutout_template" && part.type !== "plumbing_chase_void" && part.type !== "laundry_appliance_clearance" && part.type !== "laundry_utility_chase" && part.type !== "cable_grommet_template" && part.type !== "desk_power_chase" && part.type !== "pantry_pullout_slide_pair" && part.type !== "media_cable_chase" && part.type !== "media_vent_slot_template" && part.type !== "library_ladder_rail" && part.type !== "library_ladder_standoff" && part.type !== "stemware_rack_rail" && part.type !== "led_lighting_channel" && part.type !== "hamper_pullout_basket" && part.type !== "hamper_pullout_slide_pair" && part.type !== "shelf_pin_hole_row" && part.type !== "door_hinge_pair" && part.type !== "drawer_slide_pair" && part.type !== "anti_tip_anchor_bracket" && part.type !== "leveling_foot")
    .map((part) => {
      const material = materials.get(part.materialId);
      const fabrication = resolveCabinetPartFabricationSpec(definition, part);
      return {
        id: `cut:${part.id}`,
        partId: part.id,
        moduleId: part.moduleId,
        name: PART_NAMES[part.type],
        type: part.type,
        quantity: 1,
        width: roundMm(part.size.width),
        height: roundMm(part.size.height),
        depth: roundMm(part.size.depth),
        materialId: part.materialId,
        materialName: material?.name ?? part.materialId,
        edgeBandingMm: roundMm(fabrication.treatedLengthMm),
        grainDirection: fabrication.grainDirection,
        grainAxis: fabrication.grainAxis,
        edgeTreatment: fabrication.edgeTreatment,
        edgeMaterialId: fabrication.edgeMaterialId,
        treatedEdges: fabrication.treatedEdges,
        exposedFaces: fabrication.exposedFaces,
        cutFace: fabrication.cutFace,
        notes:
          part.type === "back_panel"
            ? "Back panel; confirm service openings before fabrication."
            : part.type === "face_frame_stile" || part.type === "face_frame_rail"
              ? "Face frame rail/stile; confirm pocket screw, dowel, or mortise/tenon joinery, overlay clearances, grain direction, and finished reveal before fabrication."
            : part.type === "slat"
              ? "Slat wall strip; confirm spacing, backing, reveals, and finish continuity."
            : part.type === "panel_stile" || part.type === "panel_rail"
              ? "Wall panel rail/stile trim; confirm backing, field-fit scribing, reveals, and finish continuity."
            : part.type === "ceiling_beam"
              ? "Ceiling beam/coffer member; confirm blocking, fasteners, field-fit length, lighting, and ceiling substrate."
            : part.type === "trim_member"
              ? `Trim/moulding/mantel member; confirm ${String(part.metadata?.trimPlacement ?? "trim")} placement, setout, field-fit length, miters, returns, reveal alignment, and finish continuity.`
            : part.type === "trim_return"
              ? `Trim return piece; confirm ${String(part.metadata?.trimReturnSide ?? "end")} ${String(part.metadata?.trimEndTreatment ?? "return")} at ${String(part.metadata?.trimMiterAngle ?? "field")} degree miter before cutting.`
            : part.type === "trim_reveal_strip"
              ? `Trim shadow reveal/backing strip; confirm ${String(part.metadata?.trimPlacement ?? "trim")} setout, fastener access, wall straightness, shadow reveal consistency, and finish continuity before fabrication.`
            : part.type === "filler"
              ? fillerCutListNote(part)
            : part.type === "end_panel"
              ? endPanelCutListNote(part)
            : part.type === "toe_kick"
              ? toeKickCutListNote(part)
            : part.type === "backsplash"
              ? backsplashCutListNote(part)
            : part.type === "convertible_panel"
              ? "Convertible panel; confirm deployed clearance, hinge hardware, lock stops, and safety loads."
            : part.type === "support_leg"
              ? "Convertible support leg; confirm folding hardware, floor contact, and deployed height."
            : part.type === "platform_deck"
              ? "Storage bed deck panel; confirm mattress support, seams, ventilation, and deck fastening."
            : part.type === "platform_support_rib"
              ? "Storage bed platform support rib; confirm spacing, screw pattern, and drawer clearances."
            : part.type === "stair_scribe_panel"
              ? "Under-stair stepped scribe panel; confirm stair rake template, stringer clearance, and field-fit trimming."
            : part.type === "room_divider_back_panel"
              ? "Two-sided room divider finished back panel; confirm rear-facing finish, sight lines, and service access."
            : part.type === "room_divider_stabilizer_foot"
              ? "Room divider stabilizer foot; confirm anchoring, lateral stability, circulation clearance, and floor protection."
            : part.type === "lifestyle_insert_deck"
              ? "Lifestyle built-in insert deck; confirm intended pet, toy, hobby, or small-space organizer use."
            : part.type === "lifestyle_insert_lip"
              ? "Lifestyle built-in insert lip; confirm clear access, removable bins, cleaning, and safety edges."
            : part.type === "wine_rack_vertical_divider" || part.type === "wine_rack_horizontal_rail"
              ? "Wine rack divider/rail; confirm bottle clearances, finish durability, and field-fit tolerance before fabrication."
            : part.type === "seat_deck_panel"
              ? "Seat deck/lid panel; confirm support span, access-panel intent, cushion allowance, and visible edge treatment."
            : part.type === "seat_back_panel"
              ? "Seat back panel; confirm wall anchoring, finish, comfort angle, and cleanable inside corners."
            : part.type === "mudroom_hook_rail"
              ? "Mudroom hook rail; confirm wall blocking, load path, hook spacing, and durable finish."
            : part.type === "shoe_cubby_vertical_divider" || part.type === "shoe_cubby_shelf"
              ? "Shoe cubby component; confirm footwear clearance, washable finish, and moisture-resistant edge treatment."
            : part.type === "countertop"
              ? "Countertop/worktop; confirm substrate, overhang support, seams, cutouts, and installation sequencing."
            : part.type === "office_worksurface"
              ? "Office work surface; confirm span support, cable grommet cutouts, edge treatment, and finish durability."
            : part.type === "island_overhang_support_panel"
              ? "Kitchen island seating-overhang support panel; confirm knee clearance, anchoring, and countertop support requirements."
            : part.type === "pantry_pullout_tray_deck" || part.type === "pantry_pullout_tray_front"
              ? "Pantry pull-out tray component; confirm slide clearances, load rating, clear opening, and removable-tray access."
            : part.type === "drawer_box_side" || part.type === "drawer_box_back" || part.type === "drawer_box_bottom"
              ? "Drawer box component; confirm joinery, bottom capture, slide fixing pattern, squareness, and clear internal storage dimensions."
            : part.type === "installation_cleat"
              ? "Installation cleat; confirm wall substrate, blocking, fasteners, anti-tip requirements, and field-fit scribing."
            : part.type === "media_tv_blocking_panel"
              ? "Media wall TV blocking panel; confirm bracket model, stud/blocking substrate, fastener schedule, and cable/service penetrations."
            : undefined,
      };
    })
    .sort((a, b) => a.moduleId.localeCompare(b.moduleId) || a.name.localeCompare(b.name));
}

export function generateCabinetMaterialSchedule(
  definition: CabinetDefinition,
  precomputedCutList?: readonly CabinetCutListItem[]
): CabinetMaterialScheduleItem[] {
  const materials = materialById(definition);
  const grouped = new Map<string, CabinetMaterialScheduleItem>();

  for (const item of precomputedCutList ?? generateCabinetCutList(definition)) {
    const material = materials.get(item.materialId);
    const existing =
      grouped.get(item.materialId) ??
      {
        id: `mat:${item.materialId}`,
        materialId: item.materialId,
        materialName: material?.name ?? item.materialName,
        skuId: material?.skuId,
        partCount: 0,
        areaSqM: 0,
        edgeBandingM: 0,
      };

    existing.partCount += item.quantity;
    existing.areaSqM += largestFaceAreaSqM({
      id: item.partId,
      moduleId: item.moduleId,
      type: item.type,
      position: { x: 0, y: 0, z: 0 },
      size: { width: item.width, height: item.height, depth: item.depth },
      materialId: item.materialId,
    });
    existing.edgeBandingM += item.edgeBandingMm / 1000;
    grouped.set(item.materialId, existing);
  }

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      areaSqM: roundSqM(item.areaSqM),
      edgeBandingM: roundM(item.edgeBandingM),
      notes: item.edgeBandingM > 0 ? "Edge banding estimate for visible/front edges." : undefined,
    }))
    .sort((a, b) => a.materialName.localeCompare(b.materialName));
}

export function generateCabinetEdgeBandingSchedule(
  definition: CabinetDefinition,
  precomputedCutList?: readonly CabinetCutListItem[]
): CabinetEdgeBandingScheduleItem[] {
  const materials = materialById(definition);
  const grouped = new Map<string, CabinetEdgeBandingScheduleItem>();

  for (const item of precomputedCutList ?? generateCabinetCutList(definition)) {
    if (item.edgeBandingMm <= 0) continue;
    const material = materials.get(item.materialId);
    const edgeTreatment = item.edgeTreatment ?? "matching_edge_band";
    const edgeMaterialId = item.edgeMaterialId;
    const edgeMaterial = edgeMaterialId ? materials.get(edgeMaterialId) : undefined;
    const defaultMatchingEdge =
      edgeTreatment === "matching_edge_band" &&
      (!edgeMaterialId || edgeMaterialId === item.materialId);
    const groupKey = defaultMatchingEdge
      ? item.materialId
      : `${item.materialId}|${edgeTreatment}|${edgeMaterialId ?? ""}`;
    const edgeMaterialName =
      edgeTreatment === "contrasting_edge_band"
        ? `${edgeMaterial?.name ?? edgeMaterialId ?? "Selected finish"} contrasting edge band`
        : edgeTreatment === "solid_lipping"
          ? `${edgeMaterial?.name ?? material?.name ?? item.materialName} solid lipping`
          : edgeTreatment === "painted_edge"
            ? `${material?.name ?? item.materialName} painted edge`
            : `${material?.name ?? item.materialName} matching edge band`;
    const edgeSkuId =
      edgeTreatment === "matching_edge_band"
        ? material?.matchingEdgeSkuId ?? (material?.skuId ? `${material.skuId}-EDGE` : undefined)
        : edgeTreatment === "contrasting_edge_band"
          ? edgeMaterial?.matchingEdgeSkuId ?? edgeMaterial?.skuId
          : edgeMaterial?.skuId;
    const existing =
      grouped.get(groupKey) ??
      {
        id: defaultMatchingEdge
          ? `edge:${item.materialId}`
          : `edge:${item.materialId}:${edgeTreatment}:${edgeMaterialId ?? "none"}`,
        materialId: item.materialId,
        materialName: material?.name ?? item.materialName,
        edgeMaterialName,
        skuId: edgeSkuId,
        totalLengthM: 0,
        partCount: 0,
        moduleIds: [],
        partIds: [],
        edgeTreatment,
        edgeMaterialId,
        notes: "Verify edge thickness, visible edge rules, adhesive, grain direction, and finish match before fabrication.",
      };

    existing.totalLengthM += (item.edgeBandingMm * item.quantity) / 1000;
    existing.partCount += item.quantity;
    if (!existing.moduleIds.includes(item.moduleId)) existing.moduleIds.push(item.moduleId);
    existing.partIds.push(item.partId);
    grouped.set(groupKey, existing);
  }

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      totalLengthM: roundM(item.totalLengthM),
      moduleIds: [...item.moduleIds].sort(),
      partIds: [...item.partIds].sort(),
    }))
    .sort((a, b) => a.materialName.localeCompare(b.materialName));
}

export function generateCabinetHardwareSchedule(
  definition: CabinetDefinition,
  precomputedParts?: readonly CabinetPart[]
): CabinetHardwareScheduleItem[] {
  const parts = precomputedParts ?? generateCabinetParts(definition);
  const grouped = new Map<string, CabinetHardwareScheduleItem>();

  for (const cabinetModule of definition.modules) {
    const hardware = definition.hardware.find((item) => item.id === cabinetModule.hardwareId);
    if (!hardware || hardware.type === "none") continue;
    if ((cabinetModule.millworkComponentType ?? "cabinet") !== "cabinet") continue;
    const compatibility = resolveCabinetHardwareCompatibility(hardware, cabinetModule);

    const moduleParts = parts.filter((part) => part.moduleId === cabinetModule.id);
    const frontCount = moduleParts.filter(
      (part) => part.type === "door_front" || part.type === "drawer_front"
    ).length;
    const handleCount = moduleParts.filter((part) => part.type === "handle").length;
    const quantity = hardware.type === "push_to_open" ? frontCount : handleCount;
    if (quantity <= 0 && compatibility.status === "compatible") continue;

    const existing =
      grouped.get(hardware.id) ??
      {
        id: `hw:${hardware.id}`,
        hardwareId: hardware.id,
        hardwareName: hardware.name,
        hardwareType: hardware.type,
        skuId: hardware.skuId,
        quantity: 0,
        moduleIds: [],
        compatibilityStatus: compatibility.status,
        compatibilityReasons: [],
        notes:
          hardware.type === "push_to_open"
            ? "Push-to-open hardware is scheduled even though no visible handle mesh is generated."
            : undefined,
      };

    existing.quantity += quantity;
    if (!existing.moduleIds.includes(cabinetModule.id)) existing.moduleIds.push(cabinetModule.id);
    const statusRank = { compatible: 0, review_required: 1, incompatible: 2 } as const;
    if (
      statusRank[compatibility.status] >
      statusRank[existing.compatibilityStatus ?? "compatible"]
    ) {
      existing.compatibilityStatus = compatibility.status;
    }
    for (const reason of compatibility.reasons) {
      if (
        reason.code !== "compatible" &&
        !existing.compatibilityReasons?.includes(reason.message)
      ) {
        existing.compatibilityReasons?.push(reason.message);
      }
    }
    if (existing.compatibilityReasons?.length) {
      existing.notes = existing.compatibilityReasons.join(" ");
    }
    grouped.set(hardware.id, existing);
  }

  for (const cabinetModule of definition.modules) {
    const rodCount = parts.filter((part) => part.moduleId === cabinetModule.id && part.type === "hanging_rod").length;
    if (rodCount <= 0) continue;

    const existing =
      grouped.get(CABINET_HANGING_ROD_HARDWARE_ID) ??
      {
        id: `hw:${CABINET_HANGING_ROD_HARDWARE_ID}`,
        hardwareId: CABINET_HANGING_ROD_HARDWARE_ID,
        hardwareName: "Closet hanging rod",
        hardwareType: "hanging_rod",
        skuId: CABINET_HANGING_ROD_SKU_ID,
        quantity: 0,
        moduleIds: [],
        notes: "Hanging rods require end sockets, load confirmation, and anchoring review.",
      };

    existing.quantity += rodCount;
    existing.moduleIds.push(cabinetModule.id);
    grouped.set(CABINET_HANGING_ROD_HARDWARE_ID, existing);
  }

  for (const cabinetModule of definition.modules) {
    const hingePairCount = parts.filter((part) => part.moduleId === cabinetModule.id && part.type === "door_hinge_pair").length;
    if (hingePairCount <= 0) continue;

    const existing =
      grouped.get(CABINET_DOOR_HINGE_HARDWARE_ID) ??
      {
        id: `hw:${CABINET_DOOR_HINGE_HARDWARE_ID}`,
        hardwareId: CABINET_DOOR_HINGE_HARDWARE_ID,
        hardwareName: "Concealed door hinge pair",
        hardwareType: "door_hinge_pair",
        skuId: CABINET_DOOR_HINGE_SKU_ID,
        quantity: 0,
        moduleIds: [],
        notes: "Concealed hinges require cup drilling pattern, overlay, opening angle, soft-close selection, and door load rating review.",
      };

    existing.quantity += hingePairCount;
    existing.moduleIds.push(cabinetModule.id);
    grouped.set(CABINET_DOOR_HINGE_HARDWARE_ID, existing);
  }

  for (const cabinetModule of definition.modules) {
    const anchorCount = parts.filter((part) => part.moduleId === cabinetModule.id && part.type === "anti_tip_anchor_bracket").length;
    if (anchorCount <= 0) continue;

    const existing =
      grouped.get(CABINET_ANTI_TIP_ANCHOR_HARDWARE_ID) ??
      {
        id: `hw:${CABINET_ANTI_TIP_ANCHOR_HARDWARE_ID}`,
        hardwareId: CABINET_ANTI_TIP_ANCHOR_HARDWARE_ID,
        hardwareName: "Anti-tip anchor bracket",
        hardwareType: "anti_tip_anchor_bracket",
        skuId: CABINET_ANTI_TIP_ANCHOR_SKU_ID,
        quantity: 0,
        moduleIds: [],
        notes: "Anti-tip anchors require field-verified substrate, blocking, fastener schedule, bracket access, and installer approval.",
      };

    existing.quantity += anchorCount;
    existing.moduleIds.push(cabinetModule.id);
    grouped.set(CABINET_ANTI_TIP_ANCHOR_HARDWARE_ID, existing);
  }

  for (const cabinetModule of definition.modules) {
    const levelingFootCount = parts.filter((part) => part.moduleId === cabinetModule.id && part.type === "leveling_foot").length;
    if (levelingFootCount <= 0) continue;

    const existing =
      grouped.get(CABINET_LEVELING_FOOT_HARDWARE_ID) ??
      {
        id: `hw:${CABINET_LEVELING_FOOT_HARDWARE_ID}`,
        hardwareId: CABINET_LEVELING_FOOT_HARDWARE_ID,
        hardwareName: "Adjustable leveling foot",
        hardwareType: "leveling_foot",
        skuId: CABINET_LEVELING_FOOT_SKU_ID,
        quantity: 0,
        moduleIds: [],
        notes: "Adjustable leveling feet require load-rating confirmation, floor-level allowance, plinth access, and final height adjustment review.",
      };

    existing.quantity += levelingFootCount;
    existing.moduleIds.push(cabinetModule.id);
    grouped.set(CABINET_LEVELING_FOOT_HARDWARE_ID, existing);
  }

  for (const cabinetModule of definition.modules) {
    const drawerSlidePairCount = parts.filter((part) => part.moduleId === cabinetModule.id && part.type === "drawer_slide_pair").length;
    if (drawerSlidePairCount <= 0) continue;

    const existing =
      grouped.get(CABINET_DRAWER_SLIDE_HARDWARE_ID) ??
      {
        id: `hw:${CABINET_DRAWER_SLIDE_HARDWARE_ID}`,
        hardwareId: CABINET_DRAWER_SLIDE_HARDWARE_ID,
        hardwareName: "Soft-close drawer slide pair",
        hardwareType: "drawer_slide_pair",
        skuId: CABINET_DRAWER_SLIDE_SKU_ID,
        quantity: 0,
        moduleIds: [],
        notes: "Drawer slides require length, load rating, side clearance, fixing pattern, and drawer-box compatibility review.",
      };

    existing.quantity += drawerSlidePairCount;
    existing.moduleIds.push(cabinetModule.id);
    grouped.set(CABINET_DRAWER_SLIDE_HARDWARE_ID, existing);
  }

  for (const cabinetModule of definition.modules) {
    const hookCount = parts.filter((part) => part.moduleId === cabinetModule.id && part.type === "mudroom_hook").length;
    if (hookCount <= 0) continue;

    const existing =
      grouped.get(CABINET_MUDROOM_HOOK_HARDWARE_ID) ??
      {
        id: `hw:${CABINET_MUDROOM_HOOK_HARDWARE_ID}`,
        hardwareId: CABINET_MUDROOM_HOOK_HARDWARE_ID,
        hardwareName: "Mudroom wall hook",
        hardwareType: "mudroom_hook",
        skuId: CABINET_MUDROOM_HOOK_SKU_ID,
        quantity: 0,
        moduleIds: [],
        notes: "Mudroom hooks require wall blocking, load confirmation, finish selection, and field spacing review.",
      };

    existing.quantity += hookCount;
    existing.moduleIds.push(cabinetModule.id);
    grouped.set(CABINET_MUDROOM_HOOK_HARDWARE_ID, existing);
  }

  for (const cabinetModule of definition.modules) {
    const slidePairCount = parts.filter(
      (part) => part.moduleId === cabinetModule.id && part.type === "pantry_pullout_slide_pair"
    ).length;
    if (slidePairCount <= 0) continue;

    const existing =
      grouped.get(CABINET_PANTRY_PULL_OUT_SLIDE_HARDWARE_ID) ??
      {
        id: `hw:${CABINET_PANTRY_PULL_OUT_SLIDE_HARDWARE_ID}`,
        hardwareId: CABINET_PANTRY_PULL_OUT_SLIDE_HARDWARE_ID,
        hardwareName: "Pantry pull-out slide pair",
        hardwareType: "pantry_slide_pair",
        skuId: CABINET_PANTRY_PULL_OUT_SLIDE_SKU_ID,
        quantity: 0,
        moduleIds: [],
        notes: "Pantry pull-out trays require slide load ratings, extension length confirmation, fixing pattern review, and clear opening checks.",
      };

    existing.quantity += slidePairCount;
    existing.moduleIds.push(cabinetModule.id);
    grouped.set(CABINET_PANTRY_PULL_OUT_SLIDE_HARDWARE_ID, existing);
  }

  for (const cabinetModule of definition.modules) {
    const railHardwareCount = parts.filter(
      (part) => part.moduleId === cabinetModule.id && (part.type === "library_ladder_rail" || part.type === "library_ladder_standoff")
    ).length;
    if (railHardwareCount <= 0) continue;

    const existing =
      grouped.get(CABINET_LIBRARY_LADDER_RAIL_HARDWARE_ID) ??
      {
        id: `hw:${CABINET_LIBRARY_LADDER_RAIL_HARDWARE_ID}`,
        hardwareId: CABINET_LIBRARY_LADDER_RAIL_HARDWARE_ID,
        hardwareName: "Library ladder rail system",
        hardwareType: "library_ladder_rail",
        skuId: CABINET_LIBRARY_LADDER_RAIL_SKU_ID,
        quantity: 0,
        moduleIds: [],
        notes: "Library ladder rails require continuous blocking, rail splice review, rolling ladder hardware confirmation, and field load verification.",
      };

    existing.quantity += railHardwareCount;
    existing.moduleIds.push(cabinetModule.id);
    grouped.set(CABINET_LIBRARY_LADDER_RAIL_HARDWARE_ID, existing);
  }

  for (const cabinetModule of definition.modules) {
    const stemwareRailCount = parts.filter(
      (part) => part.moduleId === cabinetModule.id && part.type === "stemware_rack_rail"
    ).length;
    if (stemwareRailCount <= 0) continue;

    const existing =
      grouped.get(CABINET_STEMWARE_RACK_HARDWARE_ID) ??
      {
        id: `hw:${CABINET_STEMWARE_RACK_HARDWARE_ID}`,
        hardwareId: CABINET_STEMWARE_RACK_HARDWARE_ID,
        hardwareName: "Stemware rack rail set",
        hardwareType: "stemware_rack",
        skuId: CABINET_STEMWARE_RACK_SKU_ID,
        quantity: 0,
        moduleIds: [],
        notes: "Stemware rack rails require glass base clearance, lane spacing review, mounting substrate confirmation, and finish selection.",
      };

    existing.quantity += stemwareRailCount;
    existing.moduleIds.push(cabinetModule.id);
    grouped.set(CABINET_STEMWARE_RACK_HARDWARE_ID, existing);
  }

  for (const cabinetModule of definition.modules) {
    const lightingChannelCount = parts.filter(
      (part) => part.moduleId === cabinetModule.id && part.type === "led_lighting_channel"
    ).length;
    if (lightingChannelCount <= 0) continue;

    const existing =
      grouped.get(CABINET_LIGHTING_CHANNEL_HARDWARE_ID) ??
      {
        id: `hw:${CABINET_LIGHTING_CHANNEL_HARDWARE_ID}`,
        hardwareId: CABINET_LIGHTING_CHANNEL_HARDWARE_ID,
        hardwareName: "LED strip channel",
        hardwareType: "led_strip_channel",
        skuId: CABINET_LIGHTING_CHANNEL_SKU_ID,
        quantity: 0,
        moduleIds: [],
        notes: "LED channels require driver location, switching, diffuser, color temperature, service access, and low-voltage routing review.",
      };

    existing.quantity += lightingChannelCount;
    existing.moduleIds.push(cabinetModule.id);
    grouped.set(CABINET_LIGHTING_CHANNEL_HARDWARE_ID, existing);
  }

  for (const cabinetModule of definition.modules) {
    const hamperBasketCount = parts.filter(
      (part) => part.moduleId === cabinetModule.id && part.type === "hamper_pullout_basket"
    ).length;
    if (hamperBasketCount > 0) {
      const existing =
        grouped.get(CABINET_HAMPER_BASKET_HARDWARE_ID) ??
        {
          id: `hw:${CABINET_HAMPER_BASKET_HARDWARE_ID}`,
          hardwareId: CABINET_HAMPER_BASKET_HARDWARE_ID,
          hardwareName: "Pull-out hamper basket",
          hardwareType: "hamper_basket",
          skuId: CABINET_HAMPER_BASKET_SKU_ID,
          quantity: 0,
          moduleIds: [],
          notes: "Pull-out hamper baskets require removable liner review, ventilation, clear opening, and basket finish confirmation.",
        };

      existing.quantity += hamperBasketCount;
      existing.moduleIds.push(cabinetModule.id);
      grouped.set(CABINET_HAMPER_BASKET_HARDWARE_ID, existing);
    }

    const hamperSlideCount = parts.filter(
      (part) => part.moduleId === cabinetModule.id && part.type === "hamper_pullout_slide_pair"
    ).length;
    if (hamperSlideCount <= 0) continue;

    const existing =
      grouped.get(CABINET_HAMPER_SLIDE_HARDWARE_ID) ??
      {
        id: `hw:${CABINET_HAMPER_SLIDE_HARDWARE_ID}`,
        hardwareId: CABINET_HAMPER_SLIDE_HARDWARE_ID,
        hardwareName: "Pull-out hamper slide pair",
        hardwareType: "hamper_slide_pair",
        skuId: CABINET_HAMPER_SLIDE_SKU_ID,
        quantity: 0,
        moduleIds: [],
        notes: "Pull-out hamper slides require load rating, extension length, fixing pattern, and basket compatibility review.",
      };

    existing.quantity += hamperSlideCount;
    existing.moduleIds.push(cabinetModule.id);
    grouped.set(CABINET_HAMPER_SLIDE_HARDWARE_ID, existing);
  }

  for (const cabinetModule of definition.modules) {
    const shelfPinRowCount = parts.filter(
      (part) => part.moduleId === cabinetModule.id && part.type === "shelf_pin_hole_row"
    ).length;
    if (shelfPinRowCount <= 0) continue;

    const existing =
      grouped.get(CABINET_SHELF_PIN_HARDWARE_ID) ??
      {
        id: `hw:${CABINET_SHELF_PIN_HARDWARE_ID}`,
        hardwareId: CABINET_SHELF_PIN_HARDWARE_ID,
        hardwareName: "Adjustable shelf pin set",
        hardwareType: "shelf_pin_set",
        skuId: CABINET_SHELF_PIN_SKU_ID,
        quantity: 0,
        moduleIds: [],
        notes: "Adjustable shelf pins require drilling template review, shelf load confirmation, hole spacing, and side-panel thickness verification.",
      };

    existing.quantity += shelfPinRowCount;
    existing.moduleIds.push(cabinetModule.id);
    grouped.set(CABINET_SHELF_PIN_HARDWARE_ID, existing);
  }

  return Array.from(grouped.values()).sort((a, b) => a.hardwareName.localeCompare(b.hardwareName));
}

function getDocumentationAssemblyType(definition: CabinetDefinition): string {
  if (definition.millworkAssemblyType) return definition.millworkAssemblyType;
  if (
    definition.modules.length > 1 &&
    definition.modules.every((module) => module.type === "base")
  ) {
    return "cabinet_run";
  }
  return definition.modules[0]?.type ?? "base";
}

function getDocumentationAssemblyProfile(definition: CabinetDefinition) {
  return createCabinetMillworkDefinition(definition).assemblyProfile;
}

export function generateCabinetDimensionSchedule(
  definition: CabinetDefinition
): CabinetDimensionScheduleItem[] {
  let offsetX = 0;
  const leftFillerWidth = getCabinetLeftFillerWidth(definition);
  const rightFillerWidth = getCabinetRightFillerWidth(definition);
  const leftFillerScribeAllowance = getCabinetLeftFillerScribeAllowance(definition);
  const rightFillerScribeAllowance = getCabinetRightFillerScribeAllowance(definition);
  const leftEndPanelThickness = getCabinetLeftEndPanelThickness(definition);
  const rightEndPanelThickness = getCabinetRightEndPanelThickness(definition);
  const fitDetails = [
    leftFillerWidth > 0
      ? `left filler ${leftFillerWidth}w${leftFillerScribeAllowance > 0 ? ` plus ${leftFillerScribeAllowance} scribe allowance` : ""}`
      : "",
    rightFillerWidth > 0
      ? `right filler ${rightFillerWidth}w${rightFillerScribeAllowance > 0 ? ` plus ${rightFillerScribeAllowance} scribe allowance` : ""}`
      : "",
    leftEndPanelThickness > 0 ? `left finished end panel ${leftEndPanelThickness} thick` : "",
    rightEndPanelThickness > 0 ? `right finished end panel ${rightEndPanelThickness} thick` : "",
  ].filter(Boolean);
  const fitSummary = fitDetails.length > 0 ? `; field-fit details ${fitDetails.join(", ")}` : "";
  const islandSummary = hasCabinetIslandSeating(definition)
    ? `; island seating overhang ${getCabinetIslandSeatingOverhangDepth(definition)}d with ${getCabinetIslandSupportPanelCount(definition)} support panel${getCabinetIslandSupportPanelCount(definition) === 1 ? "" : "s"}`
    : "";
  const backsplashSummary = definition.includeBacksplash
    ? `; backsplash/upstand ${getCabinetBacksplashHeight(definition)}h x ${getCabinetBacksplashThickness(definition)} thick`
    : "";
  const rows: CabinetDimensionScheduleItem[] = [
    {
      id: "dim:overall",
      scope: "overall",
      label: "Overall assembly",
      width: roundMm(definition.totalWidth),
      height: roundMm(definition.height),
      depth: roundMm(definition.depth),
      notes: `${definition.modules.length} module${definition.modules.length === 1 ? "" : "s"}${islandSummary}${backsplashSummary}${fitSummary}; verify final site clearances before fabrication.`,
    },
  ];

  for (const [index, module] of definition.modules.entries()) {
    const panelSummary = hasCabinetPanelFrame(module)
      ? `, ${getCabinetPanelColumnCount(module)} panel column${getCabinetPanelColumnCount(module) === 1 ? "" : "s"} x ${getCabinetPanelRowCount(module)} row${getCabinetPanelRowCount(module) === 1 ? "" : "s"}`
      : "";
    const ceilingSummary = isCabinetCeilingBeamArray(module)
      ? `, ${getCabinetCeilingBeamCount(module)} ceiling beam${getCabinetCeilingBeamCount(module) === 1 ? "" : "s"}`
      : isCabinetCofferedCeilingGrid(module)
        ? `, coffer grid ${getCabinetCeilingGridColumnCount(module)} column${getCabinetCeilingGridColumnCount(module) === 1 ? "" : "s"} x ${getCabinetCeilingGridRowCount(module)} row${getCabinetCeilingGridRowCount(module) === 1 ? "" : "s"}`
        : "";
    const trimSummary = isCabinetTrimRun(module)
      ? `, ${getCabinetTrimMemberCount(module)} ${getCabinetTrimPlacement(module).replace(/_/g, " ")} trim member${getCabinetTrimMemberCount(module) === 1 ? "" : "s"} at ${getCabinetTrimSetoutHeight(module)}h, ends ${getCabinetTrimLeftEndTreatment(module).replace(/_/g, " ")}/${getCabinetTrimRightEndTreatment(module).replace(/_/g, " ")} returns ${getCabinetTrimReturnDepth(module)}d at ${getCabinetTrimMiterAngle(module)} deg${hasCabinetTrimRevealStrip(module) ? `, reveal/backing strip ${getCabinetTrimRevealStripHeight(module)}h x ${getCabinetTrimRevealStripDepth(module)}d inset ${getCabinetTrimRevealStripInsetFromTop(module)} from top` : ""}`
      : isCabinetFireplaceSurroundFrame(module)
        ? `, fireplace surround ${getCabinetFireplaceOpeningWidth(module)}w x ${getCabinetFireplaceOpeningHeight(module)}h opening`
        : "";
    const convertibleSummary = isCabinetConvertibleComponent(module)
      ? `, ${isCabinetWallBedPanel(module) ? `wall bed ${getCabinetWallBedMattressSize(module).replace(/_/g, " ")} mattress ${getCabinetWallBedOrientation(module)} opening, ${getCabinetWallBedDisplayState(module)} preview, ${getCabinetWallBedSideStorage(module).replace(/_/g, " ")} side storage` : "fold-down desk"} panel ${getCabinetConvertiblePanelHeight(module)}h x ${getCabinetConvertibleOpenDepth(module)}d open`
      : "";
    const platformSummary = hasCabinetPlatformDeck(module)
      ? `, platform deck ${getCabinetPlatformDeckThickness(module)} thick with ${getCabinetPlatformSupportRibCount(module)} support rib${getCabinetPlatformSupportRibCount(module) === 1 ? "" : "s"}`
      : "";
    const stairSummary = hasCabinetStairScribe(module)
      ? `, stair scribe ${getCabinetStairScribeStepCount(module)} step${getCabinetStairScribeStepCount(module) === 1 ? "" : "s"} ${getCabinetStairScribeLowHeight(module)}-${getCabinetStairScribeHighHeight(module)}h ${getCabinetStairScribeDirection(module).replace(/_/g, " ")}`
      : "";
    const roomDividerSummary = hasCabinetRoomDividerDetails(module)
      ? `, room divider ${getCabinetRoomDividerBackPanelCount(module)} rear panel${getCabinetRoomDividerBackPanelCount(module) === 1 ? "" : "s"} with ${getCabinetRoomDividerStabilizerFootCount(module)} stabilizer ${getCabinetRoomDividerStabilizerFootCount(module) === 1 ? "foot" : "feet"}`
      : "";
    const lifestyleSummary = hasCabinetLifestyleInsert(module)
      ? `, ${getCabinetLifestyleInsertCount(module)} ${getCabinetLifestyleInsertKind(module).replace(/_/g, " ")} insert${getCabinetLifestyleInsertCount(module) === 1 ? "" : "s"}`
      : "";
    const wineRackSummary = hasCabinetWineRack(module)
      ? `, wine rack ${getCabinetWineRackColumnCount(module)} column${getCabinetWineRackColumnCount(module) === 1 ? "" : "s"} x ${getCabinetWineRackRowCount(module)} row${getCabinetWineRackRowCount(module) === 1 ? "" : "s"}`
      : "";
    const pantryPullOutSummary = hasCabinetPantryPullOuts(module)
      ? `, ${getCabinetPantryPullOutTrayCount(module)} pantry pull-out tray${getCabinetPantryPullOutTrayCount(module) === 1 ? "" : "s"} ${getCabinetPantryPullOutTrayDepth(module)}d with ${getCabinetPantryPullOutTrayFrontHeight(module)}h fronts`
      : "";
    const seatingSummary = hasCabinetSeatingDetails(module)
      ? `, seat deck ${getCabinetSeatDeckThickness(module)} mm with ${getCabinetSeatCushionThickness(module)} mm cushion${hasCabinetSeatBack(module) ? ` and ${getCabinetSeatBackHeight(module)}h back` : ""}`
      : "";
    const mudroomSummary = hasCabinetMudroomHooks(module)
      ? `, ${getCabinetMudroomHookCount(module)} mudroom hook${getCabinetMudroomHookCount(module) === 1 ? "" : "s"} at ${getCabinetMudroomHookRailHeight(module)}h`
      : "";
    const shoeCubbySummary = hasCabinetShoeCubbies(module)
      ? `, ${getCabinetShoeCubbyCount(module)} shoe cubb${getCabinetShoeCubbyCount(module) === 1 ? "y" : "ies"} ${getCabinetShoeCubbyHeight(module)}h x ${getCabinetShoeCubbyDepth(module)}d`
      : "";
    const sinkSummary = hasCabinetSinkCutout(module)
      ? `, sink cutout ${getCabinetSinkCutoutWidth(module)}w x ${getCabinetSinkCutoutDepth(module)}d at ${getCabinetSinkCutoutOffsetZ(module)} from front`
      : "";
    const plumbingSummary = hasCabinetPlumbingChase(module)
      ? `, plumbing chase ${getCabinetPlumbingChaseWidth(module)}w x ${getCabinetPlumbingChaseHeight(definition, module)}h x ${getCabinetPlumbingChaseDepth(module)}d`
      : "";
    const laundryApplianceSummary = hasCabinetLaundryApplianceBay(module)
      ? `, ${getCabinetLaundryApplianceCount(module)} ${getCabinetLaundryApplianceKind(module).replace(/_/g, " ")} appliance clearance${getCabinetLaundryApplianceCount(module) === 1 ? "" : "s"} ${getCabinetLaundryApplianceWidth(module)}w x ${getCabinetLaundryApplianceHeight(module)}h x ${getCabinetLaundryApplianceDepth(module)}d`
      : "";
    const laundryUtilitySummary = hasCabinetLaundryApplianceBay(module)
      ? `, utility chase ${getCabinetLaundryUtilityChaseHeight(module)}h x ${getCabinetLaundryUtilityChaseDepth(module)}d`
      : "";
    const officeSummary = hasCabinetOfficeWorkstation(module)
      ? `, office work surface ${getCabinetOfficeWorksurfaceDepth(module)}d x ${getCabinetOfficeWorksurfaceThickness(module)} thick with ${getCabinetCableGrommetCount(module)} cable grommet${getCabinetCableGrommetCount(module) === 1 ? "" : "s"}`
      : "";
    const deskPowerSummary = hasCabinetOfficeWorkstation(module)
      ? `, desk power chase ${getCabinetDeskPowerChaseHeight(module)}h x ${getCabinetDeskPowerChaseDepth(module)}d`
      : "";
    const mediaWallSummary = hasCabinetMediaWallDetails(module)
      ? `, media wall TV opening ${getCabinetMediaTvOpeningWidth(module)}w x ${getCabinetMediaTvOpeningHeight(module)}h at ${getCabinetMediaTvMountHeight(module)}h, ${getCabinetMediaTvBlockingThickness(module)} thick blocking, cable chase ${getCabinetMediaCableChaseWidth(module)}w x ${getCabinetMediaCableChaseHeight(module)}h x ${getCabinetMediaCableChaseDepth(module)}d, ${getCabinetMediaVentSlotCount(module)} vent slot${getCabinetMediaVentSlotCount(module) === 1 ? "" : "s"}`
      : "";
    const libraryLadderSummary = hasCabinetLibraryLadderRail(module)
      ? `, library ladder rail at ${getCabinetLibraryLadderRailHeight(module)}h with ${getCabinetLibraryLadderStandoffCount(module)} standoff${getCabinetLibraryLadderStandoffCount(module) === 1 ? "" : "s"}`
      : "";
    const stemwareRackSummary = hasCabinetStemwareRack(module)
      ? `, stemware rack ${getCabinetStemwareRackLaneCount(module)} lane${getCabinetStemwareRackLaneCount(module) === 1 ? "" : "s"} ${getCabinetStemwareRackDepth(module)}d at ${getCabinetStemwareRackMountHeight(module)}h`
      : "";
    const lightingSummary = hasCabinetLightingChannels(module)
      ? `, ${getCabinetLightingChannelCount(module)} LED lighting channel${getCabinetLightingChannelCount(module) === 1 ? "" : "s"} ${getCabinetLightingChannelDepth(module)}d x ${getCabinetLightingChannelHeight(module)}h at ${getCabinetLightingChannelInsetFromFront(module)} front inset`
      : "";
    const hamperSummary = hasCabinetHamperPullOut(module)
      ? `, ${getCabinetHamperBasketCount(module)} pull-out hamper basket${getCabinetHamperBasketCount(module) === 1 ? "" : "s"} ${getCabinetHamperBasketDepth(module)}d x ${getCabinetHamperBasketHeight(module)}h with ${getCabinetHamperSlideClearance(module)} slide clearance`
      : "";
    const shelfPinSummary = hasCabinetShelfPinRows(module)
      ? `, shelf pin rows ${getCabinetShelfPinRowPairCount(module)} pair${getCabinetShelfPinRowPairCount(module) === 1 ? "" : "s"} x ${getCabinetShelfPinHoleCount(module)} holes at ${getCabinetShelfPinHoleSpacing(module)} spacing from ${getCabinetShelfPinStartHeight(module)}h`
      : "";
    const doorHingeSummary = hasCabinetDoorHinges(module)
      ? `, door hinges ${getCabinetDoorHingeCountPerDoor(module)} per door at ${getCabinetDoorHingeInsetFromTopBottom(module)} inset`
      : "";
    const installationCleatSummary = hasCabinetInstallationCleat(module)
      ? `, installation cleat ${getCabinetInstallationCleatHeight(module)}h x ${getCabinetInstallationCleatThickness(module)}d inset ${getCabinetInstallationCleatInsetFromTop(module)} from top`
      : "";
    const antiTipSummary = hasCabinetAntiTipAnchors(module)
      ? `, anti-tip anchors ${getCabinetAntiTipAnchorCount(module)} at ${getCabinetAntiTipAnchorHeight(module)}h with ${getCabinetAntiTipAnchorInsetFromSides(module)} side inset`
      : "";
    const drawerBoxSummary = hasCabinetDrawerBoxes(module)
      ? `, drawer boxes ${getCabinetDrawerBoxSideThickness(module)} mm sides, ${getCabinetDrawerBoxBottomThickness(module)} mm bottoms, ${getCabinetDrawerBoxHeightClearance(module)} mm height clearance, ${getCabinetDrawerBoxBackClearance(module)} mm back clearance`
      : "";
    const drawerSlideSummary = hasCabinetDrawerSlides(module)
      ? `, drawer slides ${getCabinetDrawerSlideLength(module)}d with ${getCabinetDrawerSlideClearance(module)} side clearance`
      : "";
    const faceFrameSummary =
      hasCabinetFaceFrame(definition) && isCabinetFaceFrameEligibleModule(module)
        ? `, face frame ${getCabinetFaceFrameStileWidth(definition)}w stiles x ${getCabinetFaceFrameRailHeight(definition)}h rails x ${getCabinetFaceFrameDepth(definition)}d`
        : "";
    const toeKickSummary =
      definition.toeKickHeight > 0 &&
      !isCabinetCeilingComponent(module) &&
      !isCabinetTrimComponent(module) &&
      !isCabinetConvertibleComponent(module)
        ? `, toe kick ${definition.toeKickHeight}h x ${getCabinetToeKickDepth(definition, module)}d with ${getCabinetToeKickSetback(definition)} front setback`
        : "";
    const levelingFootSummary =
      hasCabinetLevelingFeet(definition) && isCabinetLevelingFootEligibleModule(module)
        ? `, ${getCabinetLevelingFootCount(definition)} leveling feet ${getCabinetLevelingFootHeight(definition)}h x ${getCabinetLevelingFootDiameter(definition)} dia`
        : "";
    const effectiveDoorCount = getCabinetEffectiveDoorCount(definition, module);
    const drawerHeightSummary =
      module.drawerCount > 0
        ? `, ${getCabinetDrawerHeightMode(module)} drawer heights ${getCabinetDrawerHeightProportions(definition, module)
            .map((proportion) => `${Math.round(proportion * 100)}%`)
            .join("/")} bottom-to-top`
        : "";
    const handlePlacementSummary = module.hardwareId
      ? `, ${getCabinetHandlePlacementMode(module)} handle placement${
          getCabinetHandlePlacementMode(module) === "custom"
            ? ` shifted ${module.handleOffsetX ?? 0} mm X / ${module.handleOffsetY ?? 0} mm Y`
            : ""
        }`
      : "";
    rows.push({
      id: `dim:${module.id}`,
      scope: "module",
      label: `Module ${index + 1}`,
      moduleId: module.id,
      width: roundMm(module.width),
      height: roundMm(module.height),
      depth: roundMm(module.depth),
      frontOffsetX: roundMm(offsetX),
      notes: `${module.type.replace(/_/g, " ")} module with ${module.shelfCount} shelf${module.shelfCount === 1 ? "" : "s"}, ${module.verticalDividerCount ?? 0} divider${(module.verticalDividerCount ?? 0) === 1 ? "" : "s"}, ${module.hangingRodCount ?? 0} hanging rod${(module.hangingRodCount ?? 0) === 1 ? "" : "s"}, ${module.slatCount ?? 0} slat${(module.slatCount ?? 0) === 1 ? "" : "s"}${panelSummary}${ceilingSummary}${trimSummary}${convertibleSummary}${platformSummary}${stairSummary}${roomDividerSummary}${lifestyleSummary}${wineRackSummary}${pantryPullOutSummary}${seatingSummary}${mudroomSummary}${shoeCubbySummary}${sinkSummary}${plumbingSummary}${laundryApplianceSummary}${laundryUtilitySummary}${officeSummary}${deskPowerSummary}${mediaWallSummary}${libraryLadderSummary}${stemwareRackSummary}${lightingSummary}${hamperSummary}${shelfPinSummary}${doorHingeSummary}${installationCleatSummary}${antiTipSummary}${drawerBoxSummary}${drawerSlideSummary}${faceFrameSummary}${toeKickSummary}${levelingFootSummary}, ${effectiveDoorCount} door${effectiveDoorCount === 1 ? "" : "s"} (${getCabinetDoorLayoutMode(definition, module)}), ${module.drawerCount} drawer${module.drawerCount === 1 ? "" : "s"}${drawerHeightSummary}${handlePlacementSummary}.`,
    });
    offsetX += module.width;
  }

  return rows;
}

export function generateCabinetDrawingViewSchedule(
  definition: CabinetDefinition
): CabinetDrawingViewScheduleItem[] {
  const assemblyType = getDocumentationAssemblyType(definition).replace(/_/g, " ");
  const leftFillerWidth = getCabinetLeftFillerWidth(definition);
  const rightFillerWidth = getCabinetRightFillerWidth(definition);
  const leftFillerScribeAllowance = getCabinetLeftFillerScribeAllowance(definition);
  const rightFillerScribeAllowance = getCabinetRightFillerScribeAllowance(definition);
  const leftEndPanelThickness = getCabinetLeftEndPanelThickness(definition);
  const rightEndPanelThickness = getCabinetRightEndPanelThickness(definition);
  const fitDetails = [
    leftFillerWidth > 0
      ? `Left filler installed ${leftFillerWidth} mm, cut ${leftFillerWidth + leftFillerScribeAllowance} mm.`
      : "",
    rightFillerWidth > 0
      ? `Right filler installed ${rightFillerWidth} mm, cut ${rightFillerWidth + rightFillerScribeAllowance} mm.`
      : "",
    leftEndPanelThickness > 0
      ? `Left finished end panel ${leftEndPanelThickness} mm thick.`
      : "",
    rightEndPanelThickness > 0
      ? `Right finished end panel ${rightEndPanelThickness} mm thick.`
      : "",
  ].filter(Boolean);
  const fitPlanSummary =
    fitDetails.length > 0
      ? ` Field-fit filler/scribe strips: ${fitDetails.join(" ")}`
      : "";
  const typicalToeKickModule = definition.modules.find(
    (module) =>
      definition.toeKickHeight > 0 &&
      !isCabinetCeilingComponent(module) &&
      !isCabinetTrimComponent(module) &&
      !isCabinetConvertibleComponent(module)
  );
  const toeKickDrawingSummary = typicalToeKickModule
    ? ` Toe kick ${definition.toeKickHeight} mm high x ${getCabinetToeKickDepth(definition, typicalToeKickModule)} mm deep with ${getCabinetToeKickSetback(definition)} mm front setback.`
    : "";
  const islandPlanSummary = hasCabinetIslandSeating(definition)
    ? ` Seating-side overhang ${getCabinetIslandSeatingOverhangDepth(definition)} mm with ${getCabinetIslandSupportPanelCount(definition)} support panel${getCabinetIslandSupportPanelCount(definition) === 1 ? "" : "s"} ${getCabinetIslandSupportPanelThickness(definition)} mm thick x ${getCabinetIslandSupportPanelDepth(definition)} mm deep.`
    : "";
  const backsplashDrawingSummary = definition.includeBacksplash
    ? ` Backsplash/upstand ${getCabinetBacksplashHeight(definition)} mm high x ${getCabinetBacksplashThickness(definition)} mm thick at rear worktop edge.`
    : "";
  const levelingFootDrawingSummary = hasCabinetLevelingFeet(definition)
    ? ` Leveling feet ${getCabinetLevelingFootCount(definition)} per eligible floor module, ${getCabinetLevelingFootHeight(definition)} mm high x ${getCabinetLevelingFootDiameter(definition)} mm dia, side inset ${getCabinetLevelingFootInsetFromSides(definition)} mm and front/back inset ${getCabinetLevelingFootInsetFromFrontBack(definition)} mm.`
    : "";
  const faceFrameDrawingSummary = hasCabinetFaceFrame(definition)
    ? ` Face frame ${getCabinetFaceFrameStileWidth(definition)} mm stiles x ${getCabinetFaceFrameRailHeight(definition)} mm rails x ${getCabinetFaceFrameDepth(definition)} mm deep on eligible cabinet fronts.`
    : "";
  const rows: CabinetDrawingViewScheduleItem[] = [
    {
      id: "view:front-elevation",
      viewType: "front_elevation",
      sheetRef: "A-601",
      label: "Overall front elevation",
      scale: "1:20",
      width: roundMm(definition.totalWidth),
      height: roundMm(definition.height),
      depth: roundMm(definition.depth),
      offsetX: 0,
      notes: `Primary ${assemblyType} elevation for client review, field verification, and fabricator layout.${faceFrameDrawingSummary}${backsplashDrawingSummary}${fitPlanSummary}`,
    },
    {
      id: "view:side-section",
      viewType: "side_section",
      sheetRef: "A-602",
      label: "Typical side section",
      scale: "1:10",
      width: roundMm(definition.depth),
      height: roundMm(definition.height),
      depth: roundMm(definition.depth),
      cutPlane: "right",
      notes: `Shows carcass depth, toe kick, back panel, shelf depth, front overlay, and wall/floor clearance assumptions.${toeKickDrawingSummary}${backsplashDrawingSummary}${levelingFootDrawingSummary}`,
    },
    {
      id: "view:plan-footprint",
      viewType: "plan_footprint",
      sheetRef: "A-603",
      label: "Plan footprint",
      scale: "1:20",
      width: roundMm(definition.totalWidth),
      depth: roundMm(definition.depth),
      offsetX: 0,
      offsetZ: 0,
      cutPlane: "top",
      notes: `Use with house-plan placement to coordinate clearances, snap position, doors, drawers, and adjacent circulation.${islandPlanSummary}${backsplashDrawingSummary}${levelingFootDrawingSummary}${fitPlanSummary}`,
    },
  ];

  let offsetX = 0;
  for (const [index, module] of definition.modules.entries()) {
    const panelSummary = hasCabinetPanelFrame(module)
      ? `, ${getCabinetPanelColumnCount(module)} panel column${getCabinetPanelColumnCount(module) === 1 ? "" : "s"} x ${getCabinetPanelRowCount(module)} row${getCabinetPanelRowCount(module) === 1 ? "" : "s"}`
      : "";
    const ceilingSummary = isCabinetCeilingBeamArray(module)
      ? `, ${getCabinetCeilingBeamCount(module)} ceiling beam${getCabinetCeilingBeamCount(module) === 1 ? "" : "s"}`
      : isCabinetCofferedCeilingGrid(module)
        ? `, coffer grid ${getCabinetCeilingGridColumnCount(module)} column${getCabinetCeilingGridColumnCount(module) === 1 ? "" : "s"} x ${getCabinetCeilingGridRowCount(module)} row${getCabinetCeilingGridRowCount(module) === 1 ? "" : "s"}`
        : "";
    const trimSummary = isCabinetTrimRun(module)
      ? `, ${getCabinetTrimMemberCount(module)} ${getCabinetTrimPlacement(module).replace(/_/g, " ")} trim member${getCabinetTrimMemberCount(module) === 1 ? "" : "s"} at ${getCabinetTrimSetoutHeight(module)} mm setout, ends ${getCabinetTrimLeftEndTreatment(module).replace(/_/g, " ")}/${getCabinetTrimRightEndTreatment(module).replace(/_/g, " ")} with ${getCabinetTrimReturnDepth(module)} mm returns at ${getCabinetTrimMiterAngle(module)} deg${hasCabinetTrimRevealStrip(module) ? ` and ${getCabinetTrimRevealStripHeight(module)} mm x ${getCabinetTrimRevealStripDepth(module)} mm reveal/backing strips inset ${getCabinetTrimRevealStripInsetFromTop(module)} mm from top behind ${getCabinetTrimProfileDepth(module)} mm profile` : ""}`
      : isCabinetFireplaceSurroundFrame(module)
        ? `, fireplace surround ${getCabinetFireplaceFrameOuterWidth(module)} mm frame`
        : "";
    const convertibleSummary = isCabinetConvertibleComponent(module)
      ? `, ${isCabinetFoldDownWorksurface(module) ? "fold-down worksurface" : `wall bed panel for ${getCabinetWallBedMattressSize(module)} mattress, ${getCabinetWallBedOrientation(module)} opening, ${getCabinetWallBedDisplayState(module)} preview`} with ${getCabinetConvertibleSupportLegCount(module)} support leg${getCabinetConvertibleSupportLegCount(module) === 1 ? "" : "s"} at ${getCabinetConvertibleHingeHeight(module)} mm hinge height`
      : "";
    const platformSummary = hasCabinetPlatformDeck(module)
      ? `, platform deck ${getCabinetPlatformDeckDepth(module)} mm deep with ${getCabinetPlatformSupportRibCount(module)} support rib${getCabinetPlatformSupportRibCount(module) === 1 ? "" : "s"}`
      : "";
    const stairSummary = hasCabinetStairScribe(module)
      ? `, stair scribe ${getCabinetStairScribeStepCount(module)} step${getCabinetStairScribeStepCount(module) === 1 ? "" : "s"} from ${getCabinetStairScribeLowHeight(module)} to ${getCabinetStairScribeHighHeight(module)} mm`
      : "";
    const roomDividerSummary = hasCabinetRoomDividerDetails(module)
      ? `, two-sided divider with ${getCabinetRoomDividerBackPanelCount(module)} rear panel${getCabinetRoomDividerBackPanelCount(module) === 1 ? "" : "s"} and ${getCabinetRoomDividerStabilizerFootCount(module)} stabilizer ${getCabinetRoomDividerStabilizerFootCount(module) === 1 ? "foot" : "feet"}`
      : "";
    const lifestyleSummary = hasCabinetLifestyleInsert(module)
      ? `, ${getCabinetLifestyleInsertKind(module).replace(/_/g, " ")} organizer with ${getCabinetLifestyleInsertCount(module)} insert${getCabinetLifestyleInsertCount(module) === 1 ? "" : "s"}`
      : "";
    const wineRackSummary = hasCabinetWineRack(module)
      ? `, wine rack ${getCabinetWineRackColumnCount(module)} column${getCabinetWineRackColumnCount(module) === 1 ? "" : "s"} x ${getCabinetWineRackRowCount(module)} row${getCabinetWineRackRowCount(module) === 1 ? "" : "s"}`
      : "";
    const pantryPullOutSummary = hasCabinetPantryPullOuts(module)
      ? `, pantry pull-outs ${getCabinetPantryPullOutTrayCount(module)} tray${getCabinetPantryPullOutTrayCount(module) === 1 ? "" : "s"} ${getCabinetPantryPullOutTrayDepth(module)} mm deep with slide pairs`
      : "";
    const seatingSummary = hasCabinetSeatingDetails(module)
      ? `, seating deck ${getCabinetSeatDeckThickness(module)} mm with ${getCabinetSeatCushionThickness(module)} mm cushion${hasCabinetSeatBack(module) ? ` and seat back ${getCabinetSeatBackHeight(module)}h` : ""}`
      : "";
    const mudroomSummary = hasCabinetMudroomHooks(module)
      ? `, ${getCabinetMudroomHookCount(module)} mudroom hook${getCabinetMudroomHookCount(module) === 1 ? "" : "s"} on rail at ${getCabinetMudroomHookRailHeight(module)} mm`
      : "";
    const shoeCubbySummary = hasCabinetShoeCubbies(module)
      ? `, ${getCabinetShoeCubbyCount(module)} shoe cubb${getCabinetShoeCubbyCount(module) === 1 ? "y" : "ies"} ${getCabinetShoeCubbyHeight(module)}h x ${getCabinetShoeCubbyDepth(module)}d`
      : "";
    const sinkSummary = hasCabinetSinkCutout(module)
      ? `, sink cutout ${getCabinetSinkCutoutWidth(module)}w x ${getCabinetSinkCutoutDepth(module)}d`
      : "";
    const plumbingSummary = hasCabinetPlumbingChase(module)
      ? `, plumbing chase ${getCabinetPlumbingChaseWidth(module)}w x ${getCabinetPlumbingChaseHeight(definition, module)}h x ${getCabinetPlumbingChaseDepth(module)}d`
      : "";
    const laundryApplianceSummary = hasCabinetLaundryApplianceBay(module)
      ? `, ${getCabinetLaundryApplianceCount(module)} ${getCabinetLaundryApplianceKind(module).replace(/_/g, " ")} appliance clearance${getCabinetLaundryApplianceCount(module) === 1 ? "" : "s"} requiring ${getCabinetLaundryApplianceRequiredWidth(module)}w x ${getCabinetLaundryApplianceRequiredHeight(module)}h x ${getCabinetLaundryApplianceRequiredDepth(module)}d`
      : "";
    const laundryUtilitySummary = hasCabinetLaundryApplianceBay(module)
      ? `, utility chase ${getCabinetLaundryUtilityChaseHeight(module)}h x ${getCabinetLaundryUtilityChaseDepth(module)}d`
      : "";
    const officeSummary = hasCabinetOfficeWorkstation(module)
      ? `, office work surface ${getCabinetOfficeWorksurfaceDepth(module)}d x ${getCabinetOfficeWorksurfaceThickness(module)} thick with ${getCabinetCableGrommetCount(module)} ${getCabinetCableGrommetDiameter(module)} mm grommet${getCabinetCableGrommetCount(module) === 1 ? "" : "s"} ${getCabinetCableGrommetOffsetFromBack(module)} mm from back`
      : "";
    const deskPowerSummary = hasCabinetOfficeWorkstation(module)
      ? `, desk power chase ${getCabinetDeskPowerChaseHeight(module)}h x ${getCabinetDeskPowerChaseDepth(module)}d`
      : "";
    const mediaWallSummary = hasCabinetMediaWallDetails(module)
      ? `, media wall TV blocking ${getCabinetMediaTvOpeningWidth(module)}w x ${getCabinetMediaTvOpeningHeight(module)}h centered at ${getCabinetMediaTvMountHeight(module)} mm, cable chase ${getCabinetMediaCableChaseWidth(module)}w x ${getCabinetMediaCableChaseHeight(module)}h x ${getCabinetMediaCableChaseDepth(module)}d, ${getCabinetMediaVentSlotCount(module)} ${getCabinetMediaVentSlotWidth(module)}w x ${getCabinetMediaVentSlotHeight(module)}h vent slot${getCabinetMediaVentSlotCount(module) === 1 ? "" : "s"} at ${getCabinetMediaVentSlotSpacing(module)} mm spacing`
      : "";
    const libraryLadderSummary = hasCabinetLibraryLadderRail(module)
      ? `, library ladder rail ${getCabinetLibraryLadderRailDiameter(module)} mm dia at ${getCabinetLibraryLadderRailHeight(module)} mm high, ${getCabinetLibraryLadderRailProjection(module)} mm projection, ${getCabinetLibraryLadderStandoffCount(module)} standoff${getCabinetLibraryLadderStandoffCount(module) === 1 ? "" : "s"}`
      : "";
    const stemwareRackSummary = hasCabinetStemwareRack(module)
      ? `, stemware rack ${getCabinetStemwareRackLaneCount(module)} lane${getCabinetStemwareRackLaneCount(module) === 1 ? "" : "s"} x ${getCabinetStemwareRackDepth(module)} mm deep, ${getCabinetStemwareRackRailWidth(module)} mm rails at ${getCabinetStemwareRackLaneSpacing(module)} mm lane spacing`
      : "";
    const lightingSummary = hasCabinetLightingChannels(module)
      ? `, LED lighting ${getCabinetLightingChannelCount(module)} channel${getCabinetLightingChannelCount(module) === 1 ? "" : "s"} ${getCabinetLightingChannelDepth(module)} mm deep x ${getCabinetLightingChannelHeight(module)} mm high at ${getCabinetLightingChannelInsetFromFront(module)} mm front inset`
      : "";
    const hamperSummary = hasCabinetHamperPullOut(module)
      ? `, pull-out hamper ${getCabinetHamperBasketCount(module)} basket${getCabinetHamperBasketCount(module) === 1 ? "" : "s"} ${getCabinetHamperBasketDepth(module)} mm deep x ${getCabinetHamperBasketHeight(module)} mm high with ${getCabinetHamperSlideClearance(module)} mm slide clearance`
      : "";
    const shelfPinSummary = hasCabinetShelfPinRows(module)
      ? `, adjustable shelf pins ${getCabinetShelfPinRowPairCount(module)} row pair${getCabinetShelfPinRowPairCount(module) === 1 ? "" : "s"} x ${getCabinetShelfPinHoleCount(module)} holes at ${getCabinetShelfPinHoleSpacing(module)} mm spacing starting ${getCabinetShelfPinStartHeight(module)} mm high`
      : "";
    const doorHingeSummary = hasCabinetDoorHinges(module)
      ? `, concealed hinges ${getCabinetDoorHingeCountPerDoor(module)} pair${getCabinetDoorHingeCountPerDoor(module) === 1 ? "" : "s"} per door at ${getCabinetDoorHingeInsetFromTopBottom(module)} mm top/bottom inset`
      : "";
    const installationCleatSummary = hasCabinetInstallationCleat(module)
      ? `, installation cleat ${getCabinetInstallationCleatHeight(module)} mm high x ${getCabinetInstallationCleatThickness(module)} mm deep inset ${getCabinetInstallationCleatInsetFromTop(module)} mm from top`
      : "";
    const antiTipSummary = hasCabinetAntiTipAnchors(module)
      ? `, anti-tip anchor brackets ${getCabinetAntiTipAnchorCount(module)} at ${getCabinetAntiTipAnchorHeight(module)} mm high with ${getCabinetAntiTipAnchorInsetFromSides(module)} mm side inset`
      : "";
    const drawerBoxCount = getCabinetDrawerBoxLayouts(definition, module).length;
    const drawerBoxSummary = hasCabinetDrawerBoxes(module)
      ? `, drawer boxes ${drawerBoxCount} box${drawerBoxCount === 1 ? "" : "es"} with ${getCabinetDrawerBoxSideThickness(module)} mm sides and ${getCabinetDrawerBoxBottomThickness(module)} mm bottoms`
      : "";
    const drawerSlideSummary = hasCabinetDrawerSlides(module)
      ? `, soft-close drawer slides ${getCabinetDrawerSlideLength(module)} mm deep with ${getCabinetDrawerSlideClearance(module)} mm side clearance`
      : "";
    const effectiveDoorCount = getCabinetEffectiveDoorCount(definition, module);
    const frontBehaviorSummary = `, door layout ${getCabinetDoorLayoutMode(definition, module)}, drawer heights ${getCabinetDrawerHeightMode(module)}, handle placement ${getCabinetHandlePlacementMode(module)}${
      getCabinetHandlePlacementMode(module) === "custom"
        ? ` (${module.handleOffsetX ?? 0} mm X / ${module.handleOffsetY ?? 0} mm Y)`
        : ""
    }`;
    rows.push({
      id: `view:${module.id}:front-elevation`,
      viewType: "front_elevation",
      sheetRef: "A-611",
      label: `Module ${index + 1} front elevation`,
      moduleId: module.id,
      scale: "1:10",
      width: roundMm(module.width),
      height: roundMm(module.height),
      depth: roundMm(module.depth),
      offsetX: roundMm(offsetX),
      notes: `${module.frontType.replace(/_/g, " ")} front with ${effectiveDoorCount} door${effectiveDoorCount === 1 ? "" : "s"}, ${module.drawerCount} drawer${module.drawerCount === 1 ? "" : "s"}, ${module.shelfCount} shelf${module.shelfCount === 1 ? "" : "s"}, ${module.verticalDividerCount ?? 0} divider${(module.verticalDividerCount ?? 0) === 1 ? "" : "s"}, ${module.hangingRodCount ?? 0} hanging rod${(module.hangingRodCount ?? 0) === 1 ? "" : "s"}, ${module.slatCount ?? 0} slat${(module.slatCount ?? 0) === 1 ? "" : "s"}${panelSummary}${ceilingSummary}${trimSummary}${convertibleSummary}${platformSummary}${stairSummary}${roomDividerSummary}${lifestyleSummary}${wineRackSummary}${pantryPullOutSummary}${seatingSummary}${mudroomSummary}${shoeCubbySummary}${sinkSummary}${plumbingSummary}${laundryApplianceSummary}${laundryUtilitySummary}${officeSummary}${deskPowerSummary}${mediaWallSummary}${libraryLadderSummary}${stemwareRackSummary}${lightingSummary}${hamperSummary}${shelfPinSummary}${doorHingeSummary}${installationCleatSummary}${antiTipSummary}${drawerBoxSummary}${drawerSlideSummary}${frontBehaviorSummary}.`,
    });
    rows.push({
      id: `view:${module.id}:section`,
      viewType: "side_section",
      sheetRef: "A-612",
      label: `Module ${index + 1} side section`,
      moduleId: module.id,
      scale: "1:10",
      width: roundMm(module.depth),
      height: roundMm(module.height),
      depth: roundMm(module.depth),
      offsetX: roundMm(offsetX),
      cutPlane: module.hingeSide === "left" ? "left" : "right",
      notes: `Verify ${roundMm(module.depth)} mm depth, ${roundMm(definition.boardThickness)} mm board thickness, ${roundMm(definition.backPanelThickness)} mm back panel, and ${roundMm(definition.toeKickHeight)} mm toe kick against site conditions.`,
    });
    offsetX += module.width;
  }

  return rows;
}

export function generateCabinetInstallerNotes(definition: CabinetDefinition): CabinetInstallerNote[] {
  const assemblyType = getDocumentationAssemblyType(definition);
  const assemblyProfile = getDocumentationAssemblyProfile(definition);
  const leftFillerScribeAllowance = getCabinetLeftFillerScribeAllowance(definition);
  const rightFillerScribeAllowance = getCabinetRightFillerScribeAllowance(definition);
  const notes: CabinetInstallerNote[] = [
    {
      id: "note:field-verify",
      severity: "field_verify",
      category: "Site verification",
      message: "Field-verify finished wall width, floor level, ceiling height, and out-of-square corners before fabrication release.",
    },
    {
      id: "note:services",
      severity: "coordination",
      category: "Services",
      message: "Confirm outlet, plumbing, low-voltage, and HVAC conflicts before cutting backs or installing fixed panels.",
    },
    {
      id: "note:clearances",
      severity: "coordination",
      category: "Clearances",
      message: "Verify door, drawer, appliance, and circulation clearances after final placement in the plan.",
    },
  ];

  assemblyProfile.fieldMeasurementRequirements.forEach((message, index) => {
    notes.push({
      id: `note:profile-field-${index + 1}`,
      severity: "field_verify",
      category: `${assemblyProfile.label} field measurements`,
      message,
    });
  });

  assemblyProfile.serviceCoordination.forEach((message, index) => {
    notes.push({
      id: `note:profile-service-${index + 1}`,
      severity: "coordination",
      category: `${assemblyProfile.label} services`,
      message,
    });
  });

  assemblyProfile.installationConstraints.forEach((message, index) => {
    notes.push({
      id: `note:profile-install-${index + 1}`,
      severity: "coordination",
      category: `${assemblyProfile.label} installation`,
      message,
    });
  });

  const needsWallAnchoring =
    definition.height >= 1800 ||
    definition.modules.some((module) => module.type === "wall" || module.type === "tall") ||
    ["closet_system", "media_wall", "mudroom_storage", "home_office_built_in", "library_wall"].includes(assemblyType);
  if (needsWallAnchoring) {
    notes.push({
      id: "note:anchoring",
      severity: "coordination",
      category: "Anchoring",
      message: "Coordinate blocking, wall substrate, and anti-tip anchoring for tall or wall-mounted millwork.",
    });
  }

  const toeKickModule = definition.modules.find(
    (module) =>
      definition.toeKickHeight > 0 &&
      !isCabinetCeilingComponent(module) &&
      !isCabinetTrimComponent(module) &&
      !isCabinetConvertibleComponent(module)
  );
  if (toeKickModule) {
    notes.push({
      id: "note:toe-kick-setout",
      severity: "field_verify",
      category: "Toe kick setout",
      message: `Field-verify toe kick height ${definition.toeKickHeight} mm, front setback ${getCabinetToeKickSetback(definition)} mm, and cut depth ${getCabinetToeKickDepth(definition, toeKickModule)} mm against floor level, leveling feet, and plinth fastening.`,
    });
  }

  if (hasCabinetLevelingFeet(definition)) {
    notes.push({
      id: "note:leveling-foot-setout",
      severity: "field_verify",
      category: "Leveling feet",
      message: `Field-verify adjustable leveling feet ${getCabinetLevelingFootCount(definition)} per eligible floor module, height ${getCabinetLevelingFootHeight(definition)} mm, diameter ${getCabinetLevelingFootDiameter(definition)} mm, side inset ${getCabinetLevelingFootInsetFromSides(definition)} mm, and front/back inset ${getCabinetLevelingFootInsetFromFrontBack(definition)} mm against floor level, load rating, plinth access, and final cabinet height.`,
    });
  }

  if (hasCabinetFaceFrame(definition)) {
    notes.push({
      id: "note:face-frame-construction",
      severity: "coordination",
      category: "Face frame construction",
      message: `Coordinate face-frame ${getCabinetFaceFrameStileWidth(definition)} mm stiles, ${getCabinetFaceFrameRailHeight(definition)} mm rails, and ${getCabinetFaceFrameDepth(definition)} mm depth with door overlay, hinge setout, drawer reveal, joinery method, grain direction, and finish before fabrication.`,
    });
  }

  if (definition.includeBacksplash) {
    notes.push({
      id: "note:backsplash-upstand",
      severity: "field_verify",
      category: "Backsplash/upstand",
      message: `Field-verify backsplash/upstand height ${getCabinetBacksplashHeight(definition)} mm and thickness ${getCabinetBacksplashThickness(definition)} mm against wall flatness, outlets, sealant lines, countertop seams, and adjacent splash returns before fabrication.`,
    });
  }

  if (leftFillerScribeAllowance > 0 || rightFillerScribeAllowance > 0) {
    notes.push({
      id: "note:filler-scribe-allowance",
      severity: "field_verify",
      category: "Filler scribe allowance",
      message: `Field-scribe fillers before final finishing; allowances are left ${leftFillerScribeAllowance} mm and right ${rightFillerScribeAllowance} mm, while installed filler widths still define the plan footprint.`,
    });
  }

  if (["vanity", "laundry_room_cabinetry"].includes(assemblyType)) {
    notes.push({
      id: "note:plumbing-appliances",
      severity: "coordination",
      category: "Plumbing and appliances",
      message: "Confirm sink, trap, washer/dryer, and appliance service zones before approving drawer and shelf layouts.",
    });
  }

  if (definition.modules.some((module) => hasCabinetSinkCutout(module) || hasCabinetPlumbingChase(module))) {
    notes.push({
      id: "note:sink-service-zone",
      severity: "field_verify",
      category: "Sink service zone",
      message: "Field-verify sink template, faucet setout, trap depth, shutoff locations, and drawer/shelf interference before countertop and cabinet fabrication.",
    });
  }

  if (definition.modules.some((module) => hasCabinetLaundryApplianceBay(module))) {
    notes.push({
      id: "note:laundry-appliance-service-zone",
      severity: "field_verify",
      category: "Laundry appliance service zone",
      message: "Field-verify washer/dryer model dimensions, vibration clearances, dryer vent route, water/drain/power locations, shutoff access, and appliance door swings before fabrication.",
    });
  }

  if (definition.modules.some((module) => hasCabinetOfficeWorkstation(module))) {
    notes.push({
      id: "note:office-workstation-services",
      severity: "coordination",
      category: "Office workstation services",
      message: "Coordinate work-surface span support, cable grommet templates, outlet/data locations, power chase access, task lighting, and chair clearance before fabrication.",
    });
  }

  if (hasCabinetIslandSeating(definition)) {
    notes.push({
      id: "note:island-seating-overhang",
      severity: "coordination",
      category: "Island seating overhang",
      message: "Coordinate seating-side countertop support, support-panel spacing, knee clearance, stool clearance, anchoring, and final countertop fabricator requirements before fabrication.",
    });
  }

  if (definition.modules.some((module) => hasCabinetPantryPullOuts(module))) {
    notes.push({
      id: "note:pantry-pullout-hardware",
      severity: "coordination",
      category: "Pantry pull-out hardware",
      message: "Coordinate pull-out tray clear openings, slide pair load ratings, extension length, fixing pattern, tray removability, stored-goods clearance, and door swing before fabrication.",
    });
  }

  if (definition.modules.some((module) => hasCabinetMediaWallDetails(module))) {
    notes.push({
      id: "note:media-wall-services",
      severity: "field_verify",
      category: "Media wall services",
      message: "Field-verify TV bracket blocking, outlet and low-voltage locations, conduit/cable chase access, ventilation slots, soundbar/speaker clearances, and equipment service access before panel fabrication.",
    });
  }

  if (definition.modules.some((module) => hasCabinetLibraryLadderRail(module))) {
    notes.push({
      id: "note:library-ladder-rail",
      severity: "field_verify",
      category: "Library ladder rail",
      message: "Field-verify continuous wall blocking, rail height, standoff projection, splice locations, ladder travel clearance, floor condition, and hardware load rating before fabrication and installation.",
    });
  }

  if (definition.modules.some((module) => hasCabinetStemwareRack(module))) {
    notes.push({
      id: "note:stemware-rack-hardware",
      severity: "coordination",
      category: "Stemware rack hardware",
      message: "Coordinate stemware rack rail spacing, glass base diameter, mounting substrate, shelf clearance, lighting conflicts, and finish before fabrication.",
    });
  }

  if (definition.modules.some((module) => hasCabinetLightingChannels(module))) {
    notes.push({
      id: "note:integrated-lighting",
      severity: "coordination",
      category: "Integrated lighting",
      message: "Coordinate LED channel placement, driver location, switching, diffuser type, color temperature, low-voltage routing, and service access before fabrication.",
    });
  }

  if (definition.modules.some((module) => hasCabinetShelfPinRows(module))) {
    notes.push({
      id: "note:adjustable-shelf-pin-rows",
      severity: "coordination",
      category: "Adjustable shelf pins",
      message: "Coordinate shelf-pin drilling template, hole spacing, shelf load, side-panel thickness, and exposed-hole finish before fabrication.",
    });
  }

  if (definition.modules.some((module) => hasCabinetDoorHinges(module))) {
    notes.push({
      id: "note:concealed-door-hinges",
      severity: "coordination",
      category: "Concealed door hinges",
      message: "Coordinate hinge cup drilling pattern, overlay, opening angle, soft-close selection, door weight, and adjacent clearance before fabrication.",
    });
  }

  if (definition.modules.some((module) => hasCabinetInstallationCleat(module))) {
    notes.push({
      id: "note:installation-cleat-anchoring",
      severity: "field_verify",
      category: "Installation cleat anchoring",
      message: "Field-verify wall substrate, blocking, stud or masonry fixing points, fastener schedule, anti-tip requirements, and cleat access before fabrication and installation.",
    });
  }

  if (definition.modules.some((module) => hasCabinetAntiTipAnchors(module))) {
    notes.push({
      id: "note:anti-tip-anchor-brackets",
      severity: "field_verify",
      category: "Anti-tip anchor brackets",
      message: "Field-verify anti-tip anchor bracket locations, substrate, blocking, fastener type, access after placement, and installer approval before fabrication and installation.",
    });
  }

  if (definition.modules.some((module) => hasCabinetDrawerBoxes(module))) {
    notes.push({
      id: "note:drawer-box-construction",
      severity: "coordination",
      category: "Drawer box construction",
      message: "Coordinate drawer box side thickness, bottom capture, back clearance, squareness, joinery, finished internal dimensions, and slide fixing pattern before fabrication.",
    });
  }

  if (definition.modules.some((module) => hasCabinetDrawerSlides(module))) {
    notes.push({
      id: "note:drawer-slide-hardware",
      severity: "coordination",
      category: "Drawer slide hardware",
      message: "Coordinate drawer slide length, side clearance, load rating, fixing pattern, drawer-box construction, and soft-close hardware before fabrication.",
    });
  }

  if (assemblyType === "media_wall") {
    notes.push({
      id: "note:media-services",
      severity: "coordination",
      category: "Media services",
      message: "Coordinate cable routing, outlet locations, ventilation, TV bracket blocking, access panels, and equipment heat load before panel fabrication.",
    });
  }

  if (["window_seat", "banquette"].includes(assemblyType)) {
    notes.push({
      id: "note:seating",
      severity: "field_verify",
      category: "Seating",
      message: "Verify finished seat height, cushion allowance, toe space, and adjacent table/window clearances.",
    });
  }

  if (["closet_system", "wardrobe"].includes(assemblyType)) {
    notes.push({
      id: "note:closet-load",
      severity: "coordination",
      category: "Closet loading",
      message: "Confirm hanging loads, shelf spans, and wall anchoring before installation.",
    });
  }

  if (definition.modules.some((module) => hasCabinetHamperPullOut(module))) {
    notes.push({
      id: "note:pullout-hamper-hardware",
      severity: "coordination",
      category: "Pull-out hamper hardware",
      message: "Coordinate hamper basket clear opening, slide load rating, removable liner, ventilation, door swing, and cleaning access before fabrication.",
    });
  }

  return notes;
}

export function generateCabinetReleaseChecklist(
  definition: CabinetDefinition,
  precomputed: CabinetDocumentationGenerationInputs = {}
): CabinetReleaseChecklistItem[] {
  let parts = precomputed.parts;
  const getParts = () => parts ?? (parts = generateCabinetParts(definition));
  const cutList = precomputed.cutList ?? generateCabinetCutList(definition, getParts());
  const materialSchedule =
    precomputed.materialSchedule ?? generateCabinetMaterialSchedule(definition, cutList);
  const hardwareSchedule =
    precomputed.hardwareSchedule ?? generateCabinetHardwareSchedule(definition, getParts());
  const drawingViewSchedule =
    precomputed.drawingViewSchedule ?? generateCabinetDrawingViewSchedule(definition);
  const assemblyType = getDocumentationAssemblyType(definition);
  const assemblyProfile = getDocumentationAssemblyProfile(definition);
  const missingSkuCount =
    materialSchedule.filter((item) => !item.skuId).length +
    hardwareSchedule.filter((item) => !item.skuId).length;
  const hasTallOrWallModules =
    definition.height >= 1800 ||
    definition.modules.some((module) => module.type === "wall" || module.type === "tall" || module.type === "wardrobe");
  const checklist: CabinetReleaseChecklistItem[] = [
    {
      id: "release:field-verify-site",
      phase: "site_verification",
      label: "Field-verify site conditions",
      owner: "designer",
      status: "required",
      dueBefore: "fabrication_release",
      relatedArtifactTypes: ["documentation_csv", "package_json"],
      notes: "Confirm finished wall width, ceiling/floor level, room clearances, and out-of-square conditions against the placed plan asset.",
    },
    {
      id: "release:client-approve-parametric-definition",
      phase: "design_approval",
      label: "Client approves editable definition",
      owner: "client",
      status: "required",
      dueBefore: "fabrication_release",
      relatedArtifactTypes: ["source_definition", "glb"],
      notes: "Approve CabinetDefinition dimensions, module count, fronts, materials, hardware, and generated 3D preview before fabrication release.",
    },
    {
      id: "release:supplier-sku-confirmation",
      phase: "supplier_procurement",
      label: "Confirm material and hardware SKU availability",
      owner: "supplier",
      status: missingSkuCount > 0 ? "blocked" : "required",
      dueBefore: "quote_request",
      relatedArtifactTypes: ["package_json"],
      notes:
        missingSkuCount > 0
          ? `${missingSkuCount} material or hardware row${missingSkuCount === 1 ? "" : "s"} need supplier SKU mapping before purchasing.`
          : "Material and hardware rows have SKU mappings/placeholders ready for supplier confirmation.",
    },
    {
      id: "release:shop-drawing-review",
      phase: "fabrication_review",
      label: "Review elevations, sections, and dimensions",
      owner: "fabricator",
      status: "required",
      dueBefore: "fabrication_release",
      relatedArtifactTypes: ["documentation_csv", "package_json"],
      notes: `Review ${drawingViewSchedule.length} generated drawing view${drawingViewSchedule.length === 1 ? "" : "s"} and ${definition.modules.length} module dimension row${definition.modules.length === 1 ? "" : "s"} before shop drawing approval.`,
    },
    {
      id: "release:cut-list-and-dxf-review",
      phase: "fabrication_review",
      label: "Review cut list and DXF cut layout",
      owner: "fabricator",
      status: "required",
      dueBefore: "fabrication_release",
      relatedArtifactTypes: ["documentation_csv", "fabrication_dxf"],
      notes: `Confirm ${cutList.length} cut-list part${cutList.length === 1 ? "" : "s"}, edge-banding assumptions, grain direction, nesting, joinery, and machining before CNC release.`,
    },
    {
      id: "release:final-quote-approval",
      phase: "design_approval",
      label: "Approve final fabricator quote",
      owner: "client",
      status: "required",
      dueBefore: "fabrication_release",
      relatedArtifactTypes: ["package_json"],
      notes: "Replace placeholder quote totals with confirmed supplier/fabricator pricing before purchase order or fabrication release.",
    },
    {
      id: "release:install-access-and-sequencing",
      phase: "installation_coordination",
      label: "Confirm installation access and sequencing",
      owner: "installer",
      status: "required",
      dueBefore: "installation",
      relatedArtifactTypes: ["documentation_csv"],
      notes: "Confirm delivery path, lift/stair constraints, wall substrate, protection, install sequence, and required on-site tools.",
    },
  ];

  if (hasTallOrWallModules) {
    checklist.push({
      id: "release:wall-anchoring-blocking",
      phase: "installation_coordination",
      label: "Verify wall anchoring and blocking",
      owner: "installer",
      status: "required",
      dueBefore: "installation",
      relatedArtifactTypes: ["documentation_csv"],
      notes: "Tall, wardrobe, or wall-mounted millwork needs confirmed substrate, blocking, anti-tip hardware, and anchoring method.",
    });
  }

  if (assemblyProfile.placementKind === "ceiling_mounted") {
    checklist.push({
      id: "release:ceiling-structure-and-overhead-access",
      phase: "site_verification",
      label: "Verify ceiling structure and overhead access",
      owner: "installer",
      status: "required",
      dueBefore: "fabrication_release",
      relatedArtifactTypes: ["documentation_csv", "package_json"],
      notes: "Ceiling-mounted millwork needs confirmed joist/blocking locations, overhead fastening method, lift/access plan, and service conflicts before fabrication release.",
    });
  }

  if (assemblyProfile.placementKind === "convertible_built_in") {
    checklist.push({
      id: "release:operable-hardware-and-safety-review",
      phase: "fabrication_review",
      label: "Review operable hardware and safety clearances",
      owner: "fabricator",
      status: "required",
      dueBefore: "fabrication_release",
      relatedArtifactTypes: ["documentation_csv", "package_json"],
      notes: "Convertible millwork needs hardware specification, deployed clearance, pinch-point review, anchoring method, and installer signoff before release.",
    });
  }

  if (assemblyProfile.fabricationComplexity === "advanced") {
    checklist.push({
      id: "release:advanced-assembly-profile-review",
      phase: "fabrication_review",
      label: `Review ${assemblyProfile.label.toLowerCase()} fabrication profile`,
      owner: "fabricator",
      status: "required",
      dueBefore: "fabrication_release",
      relatedArtifactTypes: ["documentation_csv", "package_json"],
      notes: `Advanced ${assemblyProfile.label.toLowerCase()} work should confirm profile-specific quote drivers: ${assemblyProfile.quoteDrivers.join(", ")}.`,
    });
  }

  if (["vanity", "laundry_room_cabinetry", "media_wall", "home_bar"].includes(assemblyType)) {
    checklist.push({
      id: "release:services-coordination",
      phase: "site_verification",
      label: "Coordinate services and penetrations",
      owner: "designer",
      status: "required",
      dueBefore: "fabrication_release",
      relatedArtifactTypes: ["documentation_csv", "package_json"],
      notes: "Confirm plumbing, electrical, low-voltage, appliance, ventilation, and back-panel cutout requirements before production.",
    });
  }

  return checklist;
}

function materialRate(materialId: string): number {
  if (materialId.includes("glass")) return 140;
  if (materialId.includes("walnut")) return 115;
  if (materialId.includes("oak")) return 95;
  if (materialId.includes("laminate")) return 80;
  if (materialId.includes("painted")) return 70;
  return 55;
}

function hardwareRate(hardwareType: string): number {
  if (hardwareType === "knob") return 8;
  if (hardwareType === "bar_pull") return 18;
  if (hardwareType === "edge_pull") return 22;
  if (hardwareType === "push_to_open") return 14;
  if (hardwareType === "mudroom_hook") return 16;
  if (hardwareType === "pantry_slide_pair") return 55;
  if (hardwareType === "library_ladder_rail") return 85;
  if (hardwareType === "stemware_rack") return 28;
  if (hardwareType === "led_strip_channel") return 42;
  if (hardwareType === "hamper_basket") return 95;
  if (hardwareType === "hamper_slide_pair") return 60;
  if (hardwareType === "shelf_pin_set") return 12;
  if (hardwareType === "door_hinge_pair") return 18;
  if (hardwareType === "drawer_slide_pair") return 42;
  if (hardwareType === "anti_tip_anchor_bracket") return 16;
  if (hardwareType === "leveling_foot") return 8;
  return 0;
}

export function generateCabinetQuoteSummary(
  definition: CabinetDefinition,
  precomputed: CabinetDocumentationGenerationInputs = {}
): CabinetQuoteSummary {
  let parts = precomputed.parts;
  const getParts = () => parts ?? (parts = generateCabinetParts(definition));
  const cutList = precomputed.cutList ?? generateCabinetCutList(definition, getParts());
  const materialSchedule =
    precomputed.materialSchedule ?? generateCabinetMaterialSchedule(definition, cutList);
  const hardwareSchedule =
    precomputed.hardwareSchedule ?? generateCabinetHardwareSchedule(definition, getParts());
  const assemblyType = getDocumentationAssemblyType(definition);
  const assemblyProfile = getDocumentationAssemblyProfile(definition);
  const quoteLines: CabinetQuoteLineItem[] = [];

  for (const material of materialSchedule) {
    const unitCost = materialRate(material.materialId);
    quoteLines.push({
      id: `quote:mat:${material.materialId}`,
      category: "materials",
      label: material.materialName,
      quantity: material.areaSqM,
      unit: "sq m",
      unitCost,
      totalCost: roundMoney(material.areaSqM * unitCost),
      notes: material.notes,
    });
  }

  for (const hardware of hardwareSchedule) {
    const unitCost = hardwareRate(hardware.hardwareType);
    quoteLines.push({
      id: `quote:hw:${hardware.hardwareId}`,
      category: "hardware",
      label: hardware.hardwareName,
      quantity: hardware.quantity,
      unit: "ea",
      unitCost,
      totalCost: roundMoney(hardware.quantity * unitCost),
      notes: hardware.notes,
    });
  }

  const cutPartCount = cutList.reduce((sum, item) => sum + item.quantity, 0);
  const edgeBandingM = cutList.reduce((sum, item) => sum + item.edgeBandingMm / 1000, 0);
  quoteLines.push({
    id: "quote:fabrication:parts",
    category: "fabrication",
    label: "Panel cutting and assembly labor",
    quantity: cutPartCount,
    unit: "parts",
    unitCost: 32,
    totalCost: roundMoney(cutPartCount * 32),
    notes: "Placeholder labor allowance based on generated panel count.",
  });
  if (edgeBandingM > 0) {
    quoteLines.push({
      id: "quote:fabrication:edge-banding",
      category: "fabrication",
      label: "Edge banding allowance",
      quantity: roundM(edgeBandingM),
      unit: "m",
      unitCost: 9,
      totalCost: roundMoney(edgeBandingM * 9),
      notes: "Estimate from visible/front edges in the cut list.",
    });
  }

  const tallOrWallModuleCount = definition.modules.filter(
    (module) => module.type === "tall" || module.type === "wall" || module.type === "wardrobe"
  ).length;
  const complexityMultiplier =
    assemblyProfile.fabricationComplexity === "advanced"
      ? 1.35
      : assemblyProfile.fabricationComplexity === "moderate"
        ? 1.15
        : 1;
  const placementPremium =
    assemblyProfile.placementKind === "ceiling_mounted"
      ? 350
      : assemblyProfile.placementKind === "convertible_built_in"
        ? 300
        : assemblyProfile.placementKind === "freestanding_island"
          ? 220
          : assemblyProfile.placementKind === "wall_mounted"
            ? 160
            : 0;
  const baseInstallationAllowance =
    250 +
    definition.modules.length * 90 +
    tallOrWallModuleCount * 125 +
    (["media_wall", "library_wall", "closet_system", "mudroom_storage"].includes(assemblyType) ? 250 : 0);
  const installationAllowance = roundMoney(baseInstallationAllowance * complexityMultiplier + placementPremium);
  quoteLines.push({
    id: "quote:installation:allowance",
    category: "installation",
    label: "Installation allowance",
    quantity: 1,
    unit: "allowance",
    unitCost: installationAllowance,
    totalCost: roundMoney(installationAllowance),
    notes: "Placeholder install allowance; field conditions and wall substrate can change this.",
  });

  const materialCost = quoteLines
    .filter((item) => item.category === "materials")
    .reduce((sum, item) => sum + item.totalCost, 0);
  const hardwareCost = quoteLines
    .filter((item) => item.category === "hardware")
    .reduce((sum, item) => sum + item.totalCost, 0);
  const fabricationCost = quoteLines
    .filter((item) => item.category === "fabrication")
    .reduce((sum, item) => sum + item.totalCost, 0);
  const installCost = quoteLines
    .filter((item) => item.category === "installation")
    .reduce((sum, item) => sum + item.totalCost, 0);
  const subtotal = materialCost + hardwareCost + fabricationCost + installCost;
  const contingency = roundMoney(subtotal * 0.15);
  quoteLines.push({
    id: "quote:contingency",
    category: "contingency",
    label: "Design/fabrication contingency",
    quantity: 15,
    unit: "%",
    unitCost: subtotal,
    totalCost: contingency,
    notes: "Preliminary allowance for supplier pricing, waste, site conditions, and final detailing.",
  });

  return {
    currency: "USD",
    materialCost: roundMoney(materialCost),
    hardwareCost: roundMoney(hardwareCost),
    fabricationCost: roundMoney(fabricationCost),
    installationAllowance: roundMoney(installCost),
    contingency,
    estimatedTotal: roundMoney(subtotal + contingency),
    lineItems: quoteLines,
    assumptions: [
      CABINET_PLANNING_ESTIMATE_DISCLAIMER,
      "Pricing uses placeholder rates until supplier SKU mapping and fabricator quoting are connected.",
      `${assemblyProfile.label} profile quote drivers: ${assemblyProfile.quoteDrivers.join("; ")}.`,
      "Taxes, delivery, demolition, countertop, appliances, plumbing, electrical, and permitting are excluded unless modeled separately.",
    ],
  };
}

export function generateCabinetDocumentation(
  definition: CabinetDefinition,
  precomputed: CabinetDocumentationGenerationInputs = {}
): CabinetDocumentationSnapshot {
  let parts = precomputed.parts;
  const getParts = () => parts ?? (parts = generateCabinetParts(definition));
  const assemblyProfile = getDocumentationAssemblyProfile(definition);
  const dimensionSchedule = generateCabinetDimensionSchedule(definition);
  const drawingViewSchedule = precomputed.drawingViewSchedule
    ? [...precomputed.drawingViewSchedule]
    : generateCabinetDrawingViewSchedule(definition);
  const cutList = precomputed.cutList
    ? [...precomputed.cutList]
    : generateCabinetCutList(definition, getParts());
  const materialSchedule = precomputed.materialSchedule
    ? [...precomputed.materialSchedule]
    : generateCabinetMaterialSchedule(definition, cutList);
  const hardwareSchedule = precomputed.hardwareSchedule
    ? [...precomputed.hardwareSchedule]
    : generateCabinetHardwareSchedule(definition, getParts());
  const edgeBandingSchedule = precomputed.edgeBandingSchedule
    ? [...precomputed.edgeBandingSchedule]
    : generateCabinetEdgeBandingSchedule(definition, cutList);
  const installerNotes = generateCabinetInstallerNotes(definition);
  const sharedSchedules: CabinetDocumentationGenerationInputs = {
    parts,
    cutList,
    materialSchedule,
    hardwareSchedule,
    edgeBandingSchedule,
    drawingViewSchedule,
  };
  const releaseChecklist = generateCabinetReleaseChecklist(definition, sharedSchedules);
  const quoteSummary = generateCabinetQuoteSummary(definition, sharedSchedules);
  const supplierSkuMappings = buildCabinetSupplierSkuMappings(definition, {
    materialSchedule,
    hardwareSchedule,
    cutList,
    quoteSummary,
  });
  const supplierReadiness = buildCabinetSupplierReadiness(supplierSkuMappings, releaseChecklist);

  return {
    assemblyProfile,
    dimensionSchedule,
    drawingViewSchedule,
    materialSchedule,
    hardwareSchedule,
    edgeBandingSchedule,
    cutList,
    installerNotes,
    releaseChecklist,
    quoteSummary,
    supplierSkuMappings,
    supplierReadiness,
    fabricationReleaseReadiness: buildCabinetFabricationReleaseReadiness(
      releaseChecklist,
      supplierReadiness
    ),
  };
}

export function buildCabinetSupplierSkuMappings(
  definition: CabinetDefinition,
  documentation: Pick<
    CabinetDocumentationSnapshot,
    "materialSchedule" | "hardwareSchedule" | "cutList" | "quoteSummary"
  > = {
    materialSchedule: generateCabinetMaterialSchedule(definition),
    hardwareSchedule: generateCabinetHardwareSchedule(definition),
    cutList: generateCabinetCutList(definition),
    quoteSummary: generateCabinetQuoteSummary(definition),
  }
): CabinetSupplierSkuMappingItem[] {
  const mappings: CabinetSupplierSkuMappingItem[] = [];

  for (const material of documentation.materialSchedule) {
    mappings.push({
      id: `sku:material:${material.materialId}`,
      sourceType: "material",
      sourceId: material.materialId,
      displayName: material.materialName,
      supplierName: "Internal millwork material catalog",
      skuId: material.skuId,
      status: material.skuId ? "mapped" : "placeholder",
      quantity: material.areaSqM,
      unit: "sq m",
      estimatedCost: documentation.quoteSummary.lineItems.find(
        (item) => item.id === `quote:mat:${material.materialId}`
      )?.totalCost,
      notes: material.notes ?? "Confirm availability, finish, sheet size, and grain direction before release.",
    });
  }

  for (const hardware of documentation.hardwareSchedule) {
    mappings.push({
      id: `sku:hardware:${hardware.hardwareId}`,
      sourceType: "hardware",
      sourceId: hardware.hardwareId,
      displayName: hardware.hardwareName,
      supplierName: "Internal millwork hardware catalog",
      skuId: hardware.skuId,
      status: hardware.skuId ? "mapped" : "placeholder",
      quantity: hardware.quantity,
      unit: "ea",
      estimatedCost: documentation.quoteSummary.lineItems.find(
        (item) => item.id === `quote:hw:${hardware.hardwareId}`
      )?.totalCost,
      notes: hardware.notes ?? "Confirm finish, projection, mounting pattern, and supplier lead time.",
    });
  }

  const panelCutting = documentation.quoteSummary.lineItems.find(
    (item) => item.id === "quote:fabrication:parts"
  );
  mappings.push({
    id: "sku:fabrication:panel-cutting-assembly",
    sourceType: "fabrication_service",
    sourceId: "panel-cutting-assembly",
    displayName: "Panel cutting and assembly labor",
    supplierName: "Fabricator quote required",
    status: "custom_quote_required",
    quantity: panelCutting?.quantity ?? documentation.cutList.length,
    unit: panelCutting?.unit ?? "parts",
    estimatedCost: panelCutting?.totalCost,
    notes: "Requires fabricator review of cut layout, joinery, finishing, tolerances, and shop standards.",
  });

  const edgeBanding = documentation.quoteSummary.lineItems.find(
    (item) => item.id === "quote:fabrication:edge-banding"
  );
  if (edgeBanding) {
    mappings.push({
      id: "sku:fabrication:edge-banding",
      sourceType: "fabrication_service",
      sourceId: "edge-banding",
      displayName: "Edge banding allowance",
      supplierName: "Fabricator quote required",
      status: "custom_quote_required",
      quantity: edgeBanding.quantity,
      unit: edgeBanding.unit,
      estimatedCost: edgeBanding.totalCost,
      notes: "Confirm visible edge rules, edge thickness, adhesive, and color match before production.",
    });
  }

  const installation = documentation.quoteSummary.lineItems.find(
    (item) => item.id === "quote:installation:allowance"
  );
  mappings.push({
    id: "sku:installation:site-install",
    sourceType: "installation_service",
    sourceId: "site-install",
    displayName: "Site installation allowance",
    supplierName: "Installer quote required",
    status: "custom_quote_required",
    quantity: installation?.quantity ?? 1,
    unit: installation?.unit ?? "allowance",
    estimatedCost: installation?.totalCost,
    notes: "Requires site verification, access review, wall substrate coordination, and installer scheduling.",
  });

  return mappings;
}

export function buildCabinetSupplierReadiness(
  supplierSkuMappings: CabinetSupplierSkuMappingItem[],
  releaseChecklist: CabinetReleaseChecklistItem[]
): CabinetSupplierReadinessSnapshot {
  const missingSkuCount = supplierSkuMappings.filter(
    (item) =>
      (item.sourceType === "material" || item.sourceType === "hardware") &&
      !item.skuId
  ).length;
  const mappedSkuCount = supplierSkuMappings.filter((item) => item.status === "mapped").length;
  const customQuoteRequiredCount = supplierSkuMappings.filter(
    (item) => item.status === "custom_quote_required"
  ).length;
  const releaseBlockerCount = releaseChecklist.filter((item) => item.status === "blocked").length;

  return {
    status: missingSkuCount > 0 ? "needs_supplier_mapping" : "ready_for_fabricator_review",
    mappedSkuCount,
    missingSkuCount,
    customQuoteRequiredCount,
    releaseChecklistCount: releaseChecklist.length,
    releaseBlockerCount,
    notes: [
      missingSkuCount > 0
        ? "Some material or hardware rows need supplier SKU mapping before purchasing."
        : "Material and hardware rows have supplier SKU placeholders/mappings.",
      "Fabrication and installation services still require supplier/fabricator quote confirmation.",
      "CabinetDefinition remains the editable source of truth; GLB and DXF are generated outputs.",
    ],
  };
}

export function buildCabinetFabricationReleaseReadiness(
  releaseChecklist: CabinetReleaseChecklistItem[],
  supplierReadiness: CabinetSupplierReadinessSnapshot
): CabinetFabricationReleaseReadinessSnapshot {
  const requiredGateCount = releaseChecklist.filter((item) => item.status === "required").length;
  const recommendedGateCount = releaseChecklist.filter((item) => item.status === "recommended").length;
  const blockerCount = releaseChecklist.filter((item) => item.status === "blocked").length;
  const fabricationReleaseGateCount = releaseChecklist.filter(
    (item) => item.dueBefore === "fabrication_release"
  ).length;
  const installationGateCount = releaseChecklist.filter(
    (item) => item.dueBefore === "installation"
  ).length;
  const status =
    blockerCount > 0 || supplierReadiness.missingSkuCount > 0
      ? "blocked"
      : requiredGateCount > 0 || supplierReadiness.customQuoteRequiredCount > 0
        ? "needs_review"
        : "ready_for_release";

  return {
    status,
    requiredGateCount,
    recommendedGateCount,
    blockerCount,
    fabricationReleaseGateCount,
    installationGateCount,
    supplierMissingSkuCount: supplierReadiness.missingSkuCount,
    customQuoteRequiredCount: supplierReadiness.customQuoteRequiredCount,
    notes: [
      status === "blocked"
        ? "Resolve blocked release gates or missing supplier SKU mappings before fabrication release."
        : status === "needs_review"
          ? "Review and sign off required gates before purchase order or fabrication release."
          : "No generated blockers remain before fabrication release.",
      "Supplier/fabricator pricing, site verification, client approval, and installer coordination remain human approval steps.",
    ],
  };
}

export function buildCabinetFabricationQuoteRequest(
  definition: CabinetDefinition
): CabinetFabricationQuoteRequest {
  const documentation = generateCabinetDocumentation(definition);
  const millworkDefinition = createCabinetMillworkDefinition(definition);
  const bom = generateCabinetBOM(definition);
  const supplierSkuMappings = documentation.supplierSkuMappings;
  const baseName = fileSafeName(definition.name);

  return {
    schema: "custom_millwork.rfq.v1",
    requestVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "cabinet_definition",
    cabinetDefinitionId: definition.id,
    millworkDefinition,
    displayName: definition.name,
    assemblyType: millworkDefinition.assemblyType,
    dimensions: {
      width: definition.totalWidth,
      height: definition.height,
      depth: definition.depth,
      units: definition.units,
    },
    sourceDefinitionFingerprint: buildCabinetSourceDefinitionFingerprint(definition),
    readiness: documentation.supplierReadiness,
    fabricationReleaseReadiness: documentation.fabricationReleaseReadiness,
    requestedDeliverables: [
    "Confirm material and hardware availability, lead time, finish, and pricing.",
      "Review cut list, edge-banding schedule, DXF cut layout, joinery, tolerances, and shop standards.",
      "Return fabrication labor, finishing, delivery, installation, and revision pricing.",
      "Flag site-verification blockers before fabrication release.",
    ],
    supplierSkuMappings,
    artifacts: [
      {
        type: "source_definition",
        fileName: `${baseName}-source-definition.json`,
        durable: true,
        notes: "Editable parametric source of truth.",
      },
      {
        type: "package_json",
        fileName: `${baseName}-package.json`,
        durable: true,
        notes: "Machine-readable design-to-build package.",
      },
      {
        type: "documentation_csv",
        fileName: `${baseName}-documentation.csv`,
        durable: true,
        notes: "Quote, BOM, schedules, cut list, and installer notes.",
      },
      {
        type: "shop_drawing_svg",
        fileName: `${baseName}-shop-drawing.svg`,
        durable: true,
        notes: "Generated front elevation, side section, plan footprint, dimensions, and title block.",
      },
      {
        type: "fabrication_dxf",
        fileName: `${baseName}-cut-layout.dxf`,
        durable: false,
        notes: "Generated cut-layout aid; fabricator must confirm nesting, machining, grain, and joinery.",
      },
      {
        type: "glb",
        fileName: `${baseName}.glb`,
        durable: false,
        notes: "Generated 3D visualization output, not the editable source.",
      },
    ],
    bom,
    documentation: {
      dimensionSchedule: documentation.dimensionSchedule,
      drawingViewSchedule: documentation.drawingViewSchedule,
      materialSchedule: documentation.materialSchedule,
      hardwareSchedule: documentation.hardwareSchedule,
      edgeBandingSchedule: documentation.edgeBandingSchedule,
      cutList: documentation.cutList,
      installerNotes: documentation.installerNotes,
      releaseChecklist: documentation.releaseChecklist,
    },
    quoteSummary: documentation.quoteSummary,
    assumptions: [
      "This RFQ package is a preliminary request for quote, not a purchase order or fabrication release.",
      "Pricing uses placeholder rates until supplier catalogs, SKU availability, and fabricator quotes are connected.",
      "Field verification, final shop drawings, site conditions, code requirements, and client approvals remain required.",
    ],
  };
}

export function buildCabinetFabricationQuoteRequestJson(definition: CabinetDefinition): string {
  return `${JSON.stringify(buildCabinetFabricationQuoteRequest(definition), null, 2)}\n`;
}

export function buildCabinetSourceDefinitionFileName(definition: CabinetDefinition): string {
  return `${fileSafeName(definition.name)}-source-definition.json`;
}

export function buildCabinetSourceDefinitionExport(
  definition: CabinetDefinition
): CabinetSourceDefinitionExport {
  return {
    schema: "custom_millwork.source_definition.v1",
    exportVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "cabinet_definition",
    cabinetDefinition: definition,
    millworkDefinition: createCabinetMillworkDefinition(definition),
    sourceDefinitionFingerprint: buildCabinetSourceDefinitionFingerprint(definition),
    notes: [
      "CabinetDefinition is the editable parametric source of truth.",
      "sourceDefinitionFingerprint is derived from the editable source content with volatile timestamps omitted.",
      "Generated GLB, SVG, and DXF files are outputs and should be regenerated from this definition.",
      "Keep placement transform, room ID, BOM, and quote snapshots with the placed smart asset.",
    ],
  };
}

export function buildCabinetSourceDefinitionJson(definition: CabinetDefinition): string {
  return `${JSON.stringify(buildCabinetSourceDefinitionExport(definition), null, 2)}\n`;
}

function assertCabinetDefinitionLike(value: unknown): CabinetDefinition {
  if (!isRecord(value)) {
    throw new Error("Source definition JSON must contain a cabinet definition object.");
  }

  const requiredNumberFields = [
    "version",
    "totalWidth",
    "height",
    "depth",
    "boardThickness",
    "backPanelThickness",
    "toeKickHeight",
    "revealGap",
  ];
  const missingNumberField = requiredNumberFields.find((field) => typeof value[field] !== "number");
  if (missingNumberField) {
    throw new Error(`Cabinet definition is missing numeric field '${missingNumberField}'.`);
  }

  for (const field of ["id", "name", "createdAt", "updatedAt"]) {
    if (typeof value[field] !== "string") {
      throw new Error(`Cabinet definition is missing string field '${field}'.`);
    }
  }

  if (
    typeof value.sourcePresetId !== "undefined" &&
    (typeof value.sourcePresetId !== "string" || !value.sourcePresetId.trim())
  ) {
    throw new Error("Cabinet definition sourcePresetId must be a non-empty string when provided.");
  }
  if (
    typeof value.requiredHostType !== "undefined" &&
    !["Floor", "Wall", "Ceiling", "Flexible"].includes(String(value.requiredHostType))
  ) {
    throw new Error(
      "Cabinet definition requiredHostType must be Floor, Wall, Ceiling, or Flexible."
    );
  }

  if (value.units !== "mm") {
    throw new Error("Cabinet definition units must be 'mm'.");
  }

  if (!Array.isArray(value.modules) || value.modules.length === 0) {
    throw new Error("Cabinet definition must include at least one module.");
  }

  if (!Array.isArray(value.materials)) {
    throw new Error("Cabinet definition must include material references.");
  }

  const validEdgeTreatments = [
    "matching_edge_band",
    "contrasting_edge_band",
    "solid_lipping",
    "painted_edge",
    "none",
  ];
  const invalidMaterialIndex = value.materials.findIndex((material) => {
    if (!isRecord(material)) return true;
    return (
      typeof material.id !== "string" ||
      typeof material.name !== "string" ||
      (typeof material.grainBehavior !== "undefined" &&
        material.grainBehavior !== "directional" &&
        material.grainBehavior !== "non_directional") ||
      (typeof material.matchingEdgeSkuId !== "undefined" &&
        typeof material.matchingEdgeSkuId !== "string") ||
      (typeof material.supportedEdgeTreatments !== "undefined" &&
        (!Array.isArray(material.supportedEdgeTreatments) ||
          material.supportedEdgeTreatments.some(
            (treatment) =>
              typeof treatment !== "string" || !validEdgeTreatments.includes(treatment)
          )))
    );
  });
  if (invalidMaterialIndex >= 0) {
    throw new Error(`Cabinet definition material ${invalidMaterialIndex + 1} is malformed.`);
  }

  if (!Array.isArray(value.hardware)) {
    throw new Error("Cabinet definition must include hardware references.");
  }

  if (
    (typeof value.leftFillerWidth !== "undefined" && typeof value.leftFillerWidth !== "number") ||
    (typeof value.rightFillerWidth !== "undefined" && typeof value.rightFillerWidth !== "number") ||
    (typeof value.leftFillerScribeAllowance !== "undefined" && typeof value.leftFillerScribeAllowance !== "number") ||
    (typeof value.rightFillerScribeAllowance !== "undefined" && typeof value.rightFillerScribeAllowance !== "number") ||
    (typeof value.toeKickSetback !== "undefined" && typeof value.toeKickSetback !== "number") ||
    (typeof value.toeKickDepth !== "undefined" && typeof value.toeKickDepth !== "number") ||
    (typeof value.includeLeftEndPanel !== "undefined" && typeof value.includeLeftEndPanel !== "boolean") ||
    (typeof value.includeRightEndPanel !== "undefined" && typeof value.includeRightEndPanel !== "boolean") ||
    (typeof value.leftEndPanelThickness !== "undefined" && typeof value.leftEndPanelThickness !== "number") ||
    (typeof value.rightEndPanelThickness !== "undefined" && typeof value.rightEndPanelThickness !== "number") ||
    (typeof value.includeCountertop !== "undefined" && typeof value.includeCountertop !== "boolean") ||
    (typeof value.countertopThickness !== "undefined" && typeof value.countertopThickness !== "number") ||
    (typeof value.countertopOverhangLeft !== "undefined" && typeof value.countertopOverhangLeft !== "number") ||
    (typeof value.countertopOverhangRight !== "undefined" && typeof value.countertopOverhangRight !== "number") ||
    (typeof value.countertopOverhangFront !== "undefined" && typeof value.countertopOverhangFront !== "number") ||
    (typeof value.countertopOverhangBack !== "undefined" && typeof value.countertopOverhangBack !== "number") ||
    (typeof value.countertopMaterialId !== "undefined" && typeof value.countertopMaterialId !== "string") ||
    (typeof value.includeBacksplash !== "undefined" && typeof value.includeBacksplash !== "boolean") ||
    (typeof value.backsplashHeight !== "undefined" && typeof value.backsplashHeight !== "number") ||
    (typeof value.backsplashThickness !== "undefined" && typeof value.backsplashThickness !== "number") ||
    (typeof value.backsplashMaterialId !== "undefined" && typeof value.backsplashMaterialId !== "string") ||
    (typeof value.levelingFeetEnabled !== "undefined" && typeof value.levelingFeetEnabled !== "boolean") ||
    (typeof value.levelingFootCount !== "undefined" && typeof value.levelingFootCount !== "number") ||
    (typeof value.levelingFootHeight !== "undefined" && typeof value.levelingFootHeight !== "number") ||
    (typeof value.levelingFootDiameter !== "undefined" && typeof value.levelingFootDiameter !== "number") ||
    (typeof value.levelingFootInsetFromSides !== "undefined" && typeof value.levelingFootInsetFromSides !== "number") ||
    (typeof value.levelingFootInsetFromFrontBack !== "undefined" &&
      typeof value.levelingFootInsetFromFrontBack !== "number") ||
    (typeof value.faceFrameEnabled !== "undefined" && typeof value.faceFrameEnabled !== "boolean") ||
    (typeof value.faceFrameStileWidth !== "undefined" && typeof value.faceFrameStileWidth !== "number") ||
    (typeof value.faceFrameRailHeight !== "undefined" && typeof value.faceFrameRailHeight !== "number") ||
    (typeof value.faceFrameDepth !== "undefined" && typeof value.faceFrameDepth !== "number") ||
    (typeof value.faceFrameMaterialId !== "undefined" && typeof value.faceFrameMaterialId !== "string")
  ) {
    throw new Error("Cabinet definition field-fit fields are malformed.");
  }

  if (
    (typeof value.islandSeatingOverhangEnabled !== "undefined" &&
      typeof value.islandSeatingOverhangEnabled !== "boolean") ||
    (typeof value.islandSeatingOverhangDepth !== "undefined" &&
      typeof value.islandSeatingOverhangDepth !== "number") ||
    (typeof value.islandSupportPanelCount !== "undefined" &&
      typeof value.islandSupportPanelCount !== "number") ||
    (typeof value.islandSupportPanelThickness !== "undefined" &&
      typeof value.islandSupportPanelThickness !== "number") ||
    (typeof value.islandSupportPanelDepth !== "undefined" &&
      typeof value.islandSupportPanelDepth !== "number") ||
    (typeof value.islandSupportPanelEndInset !== "undefined" &&
      typeof value.islandSupportPanelEndInset !== "number")
  ) {
    throw new Error("Cabinet definition island seating fields are malformed.");
  }

  const invalidModuleIndex = value.modules.findIndex((module) => {
    if (!isRecord(module)) return true;
    return (
      typeof module.id !== "string" ||
      typeof module.type !== "string" ||
      typeof module.width !== "number" ||
      typeof module.height !== "number" ||
      typeof module.depth !== "number" ||
      typeof module.frontType !== "string" ||
      typeof module.doorStyle !== "string" ||
      typeof module.doorCount !== "number" ||
      (typeof module.doorLayoutMode !== "undefined" &&
        module.doorLayoutMode !== "recommended" &&
        module.doorLayoutMode !== "manual") ||
      typeof module.drawerCount !== "number" ||
      (typeof module.drawerHeightMode !== "undefined" &&
        !["equal", "recommended", "custom"].includes(String(module.drawerHeightMode))) ||
      (typeof module.drawerHeightProportions !== "undefined" &&
        (!Array.isArray(module.drawerHeightProportions) ||
          module.drawerHeightProportions.some(
            (proportion) => typeof proportion !== "number" || !Number.isFinite(proportion)
          ))) ||
      typeof module.shelfCount !== "number" ||
      (typeof module.shelfSpacingMode !== "undefined" &&
        module.shelfSpacingMode !== "even" &&
        module.shelfSpacingMode !== "custom") ||
      (typeof module.shelfPositionsMm !== "undefined" &&
        (!Array.isArray(module.shelfPositionsMm) ||
          module.shelfPositionsMm.some((position) => typeof position !== "number"))) ||
      (typeof module.verticalDividerCount !== "undefined" && typeof module.verticalDividerCount !== "number") ||
      (typeof module.hangingRodCount !== "undefined" && typeof module.hangingRodCount !== "number") ||
      (typeof module.hangingRodHeight !== "undefined" && typeof module.hangingRodHeight !== "number") ||
      (typeof module.hangingRodSpacing !== "undefined" && typeof module.hangingRodSpacing !== "number") ||
      (typeof module.slatCount !== "undefined" && typeof module.slatCount !== "number") ||
      (typeof module.slatWidth !== "undefined" && typeof module.slatWidth !== "number") ||
      (typeof module.slatDepth !== "undefined" && typeof module.slatDepth !== "number") ||
      (typeof module.slatSpacing !== "undefined" && typeof module.slatSpacing !== "number") ||
      (typeof module.panelColumnCount !== "undefined" && typeof module.panelColumnCount !== "number") ||
      (typeof module.panelRowCount !== "undefined" && typeof module.panelRowCount !== "number") ||
      (typeof module.panelFrameWidth !== "undefined" && typeof module.panelFrameWidth !== "number") ||
      (typeof module.panelFrameDepth !== "undefined" && typeof module.panelFrameDepth !== "number") ||
      (typeof module.millworkComponentType !== "undefined" && typeof module.millworkComponentType !== "string") ||
      (typeof module.ceilingBeamCount !== "undefined" && typeof module.ceilingBeamCount !== "number") ||
      (typeof module.ceilingBeamWidth !== "undefined" && typeof module.ceilingBeamWidth !== "number") ||
      (typeof module.ceilingBeamDepth !== "undefined" && typeof module.ceilingBeamDepth !== "number") ||
      (typeof module.ceilingBeamOrientation !== "undefined" && typeof module.ceilingBeamOrientation !== "string") ||
      (typeof module.ceilingGridColumnCount !== "undefined" && typeof module.ceilingGridColumnCount !== "number") ||
      (typeof module.ceilingGridRowCount !== "undefined" && typeof module.ceilingGridRowCount !== "number") ||
      (typeof module.trimMemberCount !== "undefined" && typeof module.trimMemberCount !== "number") ||
      (typeof module.trimProfileWidth !== "undefined" && typeof module.trimProfileWidth !== "number") ||
      (typeof module.trimProfileDepth !== "undefined" && typeof module.trimProfileDepth !== "number") ||
      (typeof module.trimOrientation !== "undefined" && typeof module.trimOrientation !== "string") ||
      (typeof module.trimPlacement !== "undefined" && typeof module.trimPlacement !== "string") ||
      (typeof module.trimSetoutHeight !== "undefined" && typeof module.trimSetoutHeight !== "number") ||
      (typeof module.trimLeftEndTreatment !== "undefined" && typeof module.trimLeftEndTreatment !== "string") ||
      (typeof module.trimRightEndTreatment !== "undefined" && typeof module.trimRightEndTreatment !== "string") ||
      (typeof module.trimReturnDepth !== "undefined" && typeof module.trimReturnDepth !== "number") ||
      (typeof module.trimMiterAngle !== "undefined" && typeof module.trimMiterAngle !== "number") ||
      (typeof module.trimRevealStripEnabled !== "undefined" && typeof module.trimRevealStripEnabled !== "boolean") ||
      (typeof module.trimRevealStripHeight !== "undefined" && typeof module.trimRevealStripHeight !== "number") ||
      (typeof module.trimRevealStripDepth !== "undefined" && typeof module.trimRevealStripDepth !== "number") ||
      (typeof module.trimRevealStripInsetFromTop !== "undefined" &&
        typeof module.trimRevealStripInsetFromTop !== "number") ||
      (typeof module.fireplaceOpeningWidth !== "undefined" && typeof module.fireplaceOpeningWidth !== "number") ||
      (typeof module.fireplaceOpeningHeight !== "undefined" && typeof module.fireplaceOpeningHeight !== "number") ||
      (typeof module.fireplaceLegWidth !== "undefined" && typeof module.fireplaceLegWidth !== "number") ||
      (typeof module.fireplaceHeaderHeight !== "undefined" && typeof module.fireplaceHeaderHeight !== "number") ||
      (typeof module.fireplaceMantelHeight !== "undefined" && typeof module.fireplaceMantelHeight !== "number") ||
      (typeof module.fireplaceMantelDepth !== "undefined" && typeof module.fireplaceMantelDepth !== "number") ||
      (typeof module.convertiblePanelThickness !== "undefined" && typeof module.convertiblePanelThickness !== "number") ||
      (typeof module.convertiblePanelHeight !== "undefined" && typeof module.convertiblePanelHeight !== "number") ||
      (typeof module.convertibleOpenDepth !== "undefined" && typeof module.convertibleOpenDepth !== "number") ||
      (typeof module.convertibleHingeHeight !== "undefined" && typeof module.convertibleHingeHeight !== "number") ||
      (typeof module.convertibleSupportLegCount !== "undefined" && typeof module.convertibleSupportLegCount !== "number") ||
      (typeof module.convertibleSupportLegWidth !== "undefined" && typeof module.convertibleSupportLegWidth !== "number") ||
      (typeof module.convertibleSupportLegDepth !== "undefined" && typeof module.convertibleSupportLegDepth !== "number") ||
      (typeof module.wallBedMattressSize !== "undefined" &&
        !["single", "double", "queen", "king"].includes(String(module.wallBedMattressSize))) ||
      (typeof module.wallBedOrientation !== "undefined" &&
        module.wallBedOrientation !== "vertical" && module.wallBedOrientation !== "horizontal") ||
      (typeof module.wallBedDisplayState !== "undefined" &&
        module.wallBedDisplayState !== "closed" && module.wallBedDisplayState !== "open") ||
      (typeof module.wallBedClearanceVisible !== "undefined" && typeof module.wallBedClearanceVisible !== "boolean") ||
      (typeof module.wallBedSideStorage !== "undefined" &&
        !["none", "left", "right", "both"].includes(String(module.wallBedSideStorage))) ||
      (typeof module.platformDeckThickness !== "undefined" && typeof module.platformDeckThickness !== "number") ||
      (typeof module.platformDeckOverhangFront !== "undefined" && typeof module.platformDeckOverhangFront !== "number") ||
      (typeof module.platformDeckOverhangBack !== "undefined" && typeof module.platformDeckOverhangBack !== "number") ||
      (typeof module.platformSupportRibCount !== "undefined" && typeof module.platformSupportRibCount !== "number") ||
      (typeof module.platformSupportRibWidth !== "undefined" && typeof module.platformSupportRibWidth !== "number") ||
      (typeof module.platformSupportRibHeight !== "undefined" && typeof module.platformSupportRibHeight !== "number") ||
      (typeof module.stairScribeStepCount !== "undefined" && typeof module.stairScribeStepCount !== "number") ||
      (typeof module.stairScribeHighHeight !== "undefined" && typeof module.stairScribeHighHeight !== "number") ||
      (typeof module.stairScribeLowHeight !== "undefined" && typeof module.stairScribeLowHeight !== "number") ||
      (typeof module.stairScribeDepth !== "undefined" && typeof module.stairScribeDepth !== "number") ||
      (typeof module.stairScribeDirection !== "undefined" && typeof module.stairScribeDirection !== "string") ||
      (typeof module.roomDividerFinishedBack !== "undefined" && typeof module.roomDividerFinishedBack !== "boolean") ||
      (typeof module.roomDividerBackPanelCount !== "undefined" && typeof module.roomDividerBackPanelCount !== "number") ||
      (typeof module.roomDividerBackPanelThickness !== "undefined" && typeof module.roomDividerBackPanelThickness !== "number") ||
      (typeof module.roomDividerStabilizerFootCount !== "undefined" && typeof module.roomDividerStabilizerFootCount !== "number") ||
      (typeof module.roomDividerStabilizerFootWidth !== "undefined" && typeof module.roomDividerStabilizerFootWidth !== "number") ||
      (typeof module.roomDividerStabilizerFootHeight !== "undefined" && typeof module.roomDividerStabilizerFootHeight !== "number") ||
      (typeof module.roomDividerStabilizerFootDepth !== "undefined" && typeof module.roomDividerStabilizerFootDepth !== "number") ||
      (typeof module.lifestyleInsertKind !== "undefined" && typeof module.lifestyleInsertKind !== "string") ||
      (typeof module.lifestyleInsertCount !== "undefined" && typeof module.lifestyleInsertCount !== "number") ||
      (typeof module.lifestyleInsertDepth !== "undefined" && typeof module.lifestyleInsertDepth !== "number") ||
      (typeof module.lifestyleInsertDeckHeight !== "undefined" && typeof module.lifestyleInsertDeckHeight !== "number") ||
      (typeof module.lifestyleInsertLipHeight !== "undefined" && typeof module.lifestyleInsertLipHeight !== "number") ||
      (typeof module.wineRackColumnCount !== "undefined" && typeof module.wineRackColumnCount !== "number") ||
      (typeof module.wineRackRowCount !== "undefined" && typeof module.wineRackRowCount !== "number") ||
      (typeof module.wineRackDepth !== "undefined" && typeof module.wineRackDepth !== "number") ||
      (typeof module.wineRackDividerThickness !== "undefined" && typeof module.wineRackDividerThickness !== "number") ||
      (typeof module.seatDeckThickness !== "undefined" && typeof module.seatDeckThickness !== "number") ||
      (typeof module.seatCushionThickness !== "undefined" && typeof module.seatCushionThickness !== "number") ||
      (typeof module.seatCushionDepth !== "undefined" && typeof module.seatCushionDepth !== "number") ||
      (typeof module.seatCushionOverhangFront !== "undefined" && typeof module.seatCushionOverhangFront !== "number") ||
      (typeof module.seatBackHeight !== "undefined" && typeof module.seatBackHeight !== "number") ||
      (typeof module.seatBackThickness !== "undefined" && typeof module.seatBackThickness !== "number") ||
      (typeof module.mudroomHookCount !== "undefined" && typeof module.mudroomHookCount !== "number") ||
      (typeof module.mudroomHookRailHeight !== "undefined" && typeof module.mudroomHookRailHeight !== "number") ||
      (typeof module.mudroomHookProjection !== "undefined" && typeof module.mudroomHookProjection !== "number") ||
      (typeof module.shoeCubbyCount !== "undefined" && typeof module.shoeCubbyCount !== "number") ||
      (typeof module.shoeCubbyHeight !== "undefined" && typeof module.shoeCubbyHeight !== "number") ||
      (typeof module.shoeCubbyDepth !== "undefined" && typeof module.shoeCubbyDepth !== "number") ||
      (typeof module.shoeCubbyDividerThickness !== "undefined" && typeof module.shoeCubbyDividerThickness !== "number") ||
      (typeof module.sinkCutoutEnabled !== "undefined" && typeof module.sinkCutoutEnabled !== "boolean") ||
      (typeof module.sinkCutoutWidth !== "undefined" && typeof module.sinkCutoutWidth !== "number") ||
      (typeof module.sinkCutoutDepth !== "undefined" && typeof module.sinkCutoutDepth !== "number") ||
      (typeof module.sinkCutoutOffsetX !== "undefined" && typeof module.sinkCutoutOffsetX !== "number") ||
      (typeof module.sinkCutoutOffsetZ !== "undefined" && typeof module.sinkCutoutOffsetZ !== "number") ||
      (typeof module.plumbingChaseWidth !== "undefined" && typeof module.plumbingChaseWidth !== "number") ||
      (typeof module.plumbingChaseHeight !== "undefined" && typeof module.plumbingChaseHeight !== "number") ||
      (typeof module.plumbingChaseDepth !== "undefined" && typeof module.plumbingChaseDepth !== "number") ||
      (typeof module.laundryApplianceBayEnabled !== "undefined" && typeof module.laundryApplianceBayEnabled !== "boolean") ||
      (typeof module.laundryApplianceKind !== "undefined" && typeof module.laundryApplianceKind !== "string") ||
      (typeof module.laundryApplianceCount !== "undefined" && typeof module.laundryApplianceCount !== "number") ||
      (typeof module.laundryApplianceWidth !== "undefined" && typeof module.laundryApplianceWidth !== "number") ||
      (typeof module.laundryApplianceHeight !== "undefined" && typeof module.laundryApplianceHeight !== "number") ||
      (typeof module.laundryApplianceDepth !== "undefined" && typeof module.laundryApplianceDepth !== "number") ||
      (typeof module.laundryApplianceSideClearance !== "undefined" && typeof module.laundryApplianceSideClearance !== "number") ||
      (typeof module.laundryApplianceTopClearance !== "undefined" && typeof module.laundryApplianceTopClearance !== "number") ||
      (typeof module.laundryApplianceBackClearance !== "undefined" && typeof module.laundryApplianceBackClearance !== "number") ||
      (typeof module.laundryUtilityChaseHeight !== "undefined" && typeof module.laundryUtilityChaseHeight !== "number") ||
      (typeof module.laundryUtilityChaseDepth !== "undefined" && typeof module.laundryUtilityChaseDepth !== "number") ||
      (typeof module.officeWorksurfaceEnabled !== "undefined" && typeof module.officeWorksurfaceEnabled !== "boolean") ||
      (typeof module.officeWorksurfaceThickness !== "undefined" && typeof module.officeWorksurfaceThickness !== "number") ||
      (typeof module.officeWorksurfaceDepth !== "undefined" && typeof module.officeWorksurfaceDepth !== "number") ||
      (typeof module.officeWorksurfaceOverhangFront !== "undefined" && typeof module.officeWorksurfaceOverhangFront !== "number") ||
      (typeof module.cableGrommetCount !== "undefined" && typeof module.cableGrommetCount !== "number") ||
      (typeof module.cableGrommetDiameter !== "undefined" && typeof module.cableGrommetDiameter !== "number") ||
      (typeof module.cableGrommetOffsetFromBack !== "undefined" && typeof module.cableGrommetOffsetFromBack !== "number") ||
      (typeof module.deskPowerChaseHeight !== "undefined" && typeof module.deskPowerChaseHeight !== "number") ||
      (typeof module.deskPowerChaseDepth !== "undefined" && typeof module.deskPowerChaseDepth !== "number") ||
      (typeof module.pantryPullOutTrayEnabled !== "undefined" && typeof module.pantryPullOutTrayEnabled !== "boolean") ||
      (typeof module.pantryPullOutTrayCount !== "undefined" && typeof module.pantryPullOutTrayCount !== "number") ||
      (typeof module.pantryPullOutTrayDepth !== "undefined" && typeof module.pantryPullOutTrayDepth !== "number") ||
      (typeof module.pantryPullOutTrayFrontHeight !== "undefined" && typeof module.pantryPullOutTrayFrontHeight !== "number") ||
      (typeof module.pantryPullOutSlideClearance !== "undefined" && typeof module.pantryPullOutSlideClearance !== "number") ||
      (typeof module.mediaWallEnabled !== "undefined" && typeof module.mediaWallEnabled !== "boolean") ||
      (typeof module.mediaTvOpeningWidth !== "undefined" && typeof module.mediaTvOpeningWidth !== "number") ||
      (typeof module.mediaTvOpeningHeight !== "undefined" && typeof module.mediaTvOpeningHeight !== "number") ||
      (typeof module.mediaTvMountHeight !== "undefined" && typeof module.mediaTvMountHeight !== "number") ||
      (typeof module.mediaTvBlockingThickness !== "undefined" && typeof module.mediaTvBlockingThickness !== "number") ||
      (typeof module.mediaCableChaseWidth !== "undefined" && typeof module.mediaCableChaseWidth !== "number") ||
      (typeof module.mediaCableChaseDepth !== "undefined" && typeof module.mediaCableChaseDepth !== "number") ||
      (typeof module.mediaCableChaseHeight !== "undefined" && typeof module.mediaCableChaseHeight !== "number") ||
      (typeof module.mediaVentSlotCount !== "undefined" && typeof module.mediaVentSlotCount !== "number") ||
      (typeof module.mediaVentSlotWidth !== "undefined" && typeof module.mediaVentSlotWidth !== "number") ||
      (typeof module.mediaVentSlotHeight !== "undefined" && typeof module.mediaVentSlotHeight !== "number") ||
      (typeof module.mediaVentSlotSpacing !== "undefined" && typeof module.mediaVentSlotSpacing !== "number") ||
      (typeof module.libraryLadderRailEnabled !== "undefined" && typeof module.libraryLadderRailEnabled !== "boolean") ||
      (typeof module.libraryLadderRailHeight !== "undefined" && typeof module.libraryLadderRailHeight !== "number") ||
      (typeof module.libraryLadderRailDiameter !== "undefined" && typeof module.libraryLadderRailDiameter !== "number") ||
      (typeof module.libraryLadderRailProjection !== "undefined" && typeof module.libraryLadderRailProjection !== "number") ||
      (typeof module.libraryLadderStandoffCount !== "undefined" && typeof module.libraryLadderStandoffCount !== "number") ||
      (typeof module.libraryLadderStandoffDiameter !== "undefined" && typeof module.libraryLadderStandoffDiameter !== "number") ||
      (typeof module.stemwareRackEnabled !== "undefined" && typeof module.stemwareRackEnabled !== "boolean") ||
      (typeof module.stemwareRackLaneCount !== "undefined" && typeof module.stemwareRackLaneCount !== "number") ||
      (typeof module.stemwareRackDepth !== "undefined" && typeof module.stemwareRackDepth !== "number") ||
      (typeof module.stemwareRackRailWidth !== "undefined" && typeof module.stemwareRackRailWidth !== "number") ||
      (typeof module.stemwareRackLaneSpacing !== "undefined" && typeof module.stemwareRackLaneSpacing !== "number") ||
      (typeof module.stemwareRackMountHeight !== "undefined" && typeof module.stemwareRackMountHeight !== "number") ||
      (typeof module.lightingChannelEnabled !== "undefined" && typeof module.lightingChannelEnabled !== "boolean") ||
      (typeof module.lightingChannelCount !== "undefined" && typeof module.lightingChannelCount !== "number") ||
      (typeof module.lightingChannelDepth !== "undefined" && typeof module.lightingChannelDepth !== "number") ||
      (typeof module.lightingChannelHeight !== "undefined" && typeof module.lightingChannelHeight !== "number") ||
      (typeof module.lightingChannelInsetFromFront !== "undefined" && typeof module.lightingChannelInsetFromFront !== "number") ||
      (typeof module.hamperPullOutEnabled !== "undefined" && typeof module.hamperPullOutEnabled !== "boolean") ||
      (typeof module.hamperBasketCount !== "undefined" && typeof module.hamperBasketCount !== "number") ||
      (typeof module.hamperBasketDepth !== "undefined" && typeof module.hamperBasketDepth !== "number") ||
      (typeof module.hamperBasketHeight !== "undefined" && typeof module.hamperBasketHeight !== "number") ||
      (typeof module.hamperSlideClearance !== "undefined" && typeof module.hamperSlideClearance !== "number") ||
      (typeof module.shelfPinRowsEnabled !== "undefined" && typeof module.shelfPinRowsEnabled !== "boolean") ||
      (typeof module.shelfPinRowPairCount !== "undefined" && typeof module.shelfPinRowPairCount !== "number") ||
      (typeof module.shelfPinHoleCount !== "undefined" && typeof module.shelfPinHoleCount !== "number") ||
      (typeof module.shelfPinHoleSpacing !== "undefined" && typeof module.shelfPinHoleSpacing !== "number") ||
      (typeof module.shelfPinInsetFromFront !== "undefined" && typeof module.shelfPinInsetFromFront !== "number") ||
      (typeof module.shelfPinStartHeight !== "undefined" && typeof module.shelfPinStartHeight !== "number") ||
      (typeof module.doorHingeHardwareEnabled !== "undefined" && typeof module.doorHingeHardwareEnabled !== "boolean") ||
      (typeof module.doorHingeCountPerDoor !== "undefined" && typeof module.doorHingeCountPerDoor !== "number") ||
      (typeof module.doorHingeInsetFromTopBottom !== "undefined" && typeof module.doorHingeInsetFromTopBottom !== "number") ||
      (typeof module.installationCleatEnabled !== "undefined" && typeof module.installationCleatEnabled !== "boolean") ||
      (typeof module.installationCleatHeight !== "undefined" && typeof module.installationCleatHeight !== "number") ||
      (typeof module.installationCleatThickness !== "undefined" && typeof module.installationCleatThickness !== "number") ||
      (typeof module.installationCleatInsetFromTop !== "undefined" && typeof module.installationCleatInsetFromTop !== "number") ||
      (typeof module.antiTipAnchorEnabled !== "undefined" && typeof module.antiTipAnchorEnabled !== "boolean") ||
      (typeof module.antiTipAnchorCount !== "undefined" && typeof module.antiTipAnchorCount !== "number") ||
      (typeof module.antiTipAnchorHeight !== "undefined" && typeof module.antiTipAnchorHeight !== "number") ||
      (typeof module.antiTipAnchorInsetFromSides !== "undefined" && typeof module.antiTipAnchorInsetFromSides !== "number") ||
      (typeof module.drawerBoxEnabled !== "undefined" && typeof module.drawerBoxEnabled !== "boolean") ||
      (typeof module.drawerBoxSideThickness !== "undefined" && typeof module.drawerBoxSideThickness !== "number") ||
      (typeof module.drawerBoxBottomThickness !== "undefined" && typeof module.drawerBoxBottomThickness !== "number") ||
      (typeof module.drawerBoxHeightClearance !== "undefined" && typeof module.drawerBoxHeightClearance !== "number") ||
      (typeof module.drawerBoxBackClearance !== "undefined" && typeof module.drawerBoxBackClearance !== "number") ||
      (typeof module.drawerSlideHardwareEnabled !== "undefined" && typeof module.drawerSlideHardwareEnabled !== "boolean") ||
      (typeof module.drawerSlideLength !== "undefined" && typeof module.drawerSlideLength !== "number") ||
      (typeof module.drawerSlideClearance !== "undefined" && typeof module.drawerSlideClearance !== "number") ||
      (typeof module.handlePlacementMode !== "undefined" &&
        module.handlePlacementMode !== "automatic" &&
        module.handlePlacementMode !== "custom") ||
      (typeof module.handleOffsetX !== "undefined" &&
        (typeof module.handleOffsetX !== "number" || !Number.isFinite(module.handleOffsetX))) ||
      (typeof module.handleOffsetY !== "undefined" &&
        (typeof module.handleOffsetY !== "number" || !Number.isFinite(module.handleOffsetY))) ||
      (typeof module.grainDirection !== "undefined" &&
        !["vertical", "horizontal", "none"].includes(String(module.grainDirection))) ||
      (typeof module.edgeTreatment !== "undefined" &&
        !validEdgeTreatments.includes(String(module.edgeTreatment))) ||
      (typeof module.edgeMaterialId !== "undefined" && typeof module.edgeMaterialId !== "string") ||
      (typeof module.exposedFaces !== "undefined" &&
        (!Array.isArray(module.exposedFaces) ||
          module.exposedFaces.some(
            (face) =>
              typeof face !== "string" ||
              !["front", "back", "left", "right", "top", "bottom"].includes(face)
          ) ||
          new Set(module.exposedFaces).size !== module.exposedFaces.length)) ||
      typeof module.materialId !== "string"
    );
  });
  if (invalidModuleIndex >= 0) {
    throw new Error(`Cabinet definition module ${invalidModuleIndex + 1} is malformed.`);
  }

  const definition = value as unknown as CabinetDefinition;
  const validation = validateCabinetDefinition(definition);
  const errors = validation.issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new Error(`Source definition has validation errors: ${errors.map((issue) => issue.message).join(" ")}`);
  }

  return definition;
}

export function parseCabinetSourceDefinitionJson(json: string): CabinetDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Source definition JSON is not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("Source definition JSON must contain an object.");
  }

  if (parsed.schema === "custom_millwork.source_definition.v1") {
    if (parsed.sourceType !== "cabinet_definition") {
      throw new Error("Source definition JSON must use sourceType 'cabinet_definition'.");
    }
    const definition = assertCabinetDefinitionLike(parsed.cabinetDefinition);
    if (
      typeof parsed.sourceDefinitionFingerprint === "string" &&
      parsed.sourceDefinitionFingerprint !== buildCabinetSourceDefinitionFingerprint(definition)
    ) {
      throw new Error("Source definition fingerprint does not match the embedded cabinet definition.");
    }
    return definition;
  }

  if (parsed.schema === "custom_millwork.package.v1") {
    if (parsed.sourceType !== "cabinet_definition") {
      throw new Error("Package JSON must use sourceType 'cabinet_definition'.");
    }
    const definition = assertCabinetDefinitionLike(parsed.cabinetDefinition);
    if (
      typeof parsed.sourceDefinitionFingerprint === "string" &&
      parsed.sourceDefinitionFingerprint !== buildCabinetSourceDefinitionFingerprint(definition)
    ) {
      throw new Error("Package source definition fingerprint does not match the embedded cabinet definition.");
    }
    return definition;
  }

  return assertCabinetDefinitionLike(parsed);
}

const csvCell = (value: string | number | undefined | null): string => {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csvRow = (values: Array<string | number | undefined | null>) =>
  values.map(csvCell).join(",");

export function buildCabinetDocumentationCsv(definition: CabinetDefinition): string {
  const bom = generateCabinetBOM(definition);
  const documentation = generateCabinetDocumentation(definition);
  const rows: string[] = [
    csvRow(["Custom Millwork Documentation"]),
    csvRow(["Definition ID", definition.id]),
    csvRow(["Name", definition.name]),
    csvRow(["Width mm", definition.totalWidth]),
    csvRow(["Height mm", definition.height]),
    csvRow(["Depth mm", definition.depth]),
    csvRow(["Module count", definition.modules.length]),
    csvRow(["Generated at", new Date().toISOString()]),
    "",
    csvRow(["Assembly Profile"]),
    csvRow(["Schema", documentation.assemblyProfile.schema]),
    csvRow(["Label", documentation.assemblyProfile.label]),
    csvRow(["Family", documentation.assemblyProfile.family]),
    csvRow(["Assembly type", documentation.assemblyProfile.assemblyType]),
    csvRow(["Project phase", documentation.assemblyProfile.projectPhase]),
    csvRow(["Placement kind", documentation.assemblyProfile.placementKind]),
    csvRow(["Fabrication complexity", documentation.assemblyProfile.fabricationComplexity]),
    csvRow(["Field measurements", documentation.assemblyProfile.fieldMeasurementRequirements.join(" ")]),
    csvRow(["Service coordination", documentation.assemblyProfile.serviceCoordination.join(" ")]),
    csvRow(["Installation constraints", documentation.assemblyProfile.installationConstraints.join(" ")]),
    csvRow(["Quote drivers", documentation.assemblyProfile.quoteDrivers.join(" ")]),
    "",
    csvRow(["Preliminary Quote Summary"]),
    csvRow(["Currency", documentation.quoteSummary.currency]),
    csvRow(["Material cost", documentation.quoteSummary.materialCost]),
    csvRow(["Hardware cost", documentation.quoteSummary.hardwareCost]),
    csvRow(["Fabrication cost", documentation.quoteSummary.fabricationCost]),
    csvRow(["Installation allowance", documentation.quoteSummary.installationAllowance]),
    csvRow(["Contingency", documentation.quoteSummary.contingency]),
    csvRow(["Estimated total", documentation.quoteSummary.estimatedTotal]),
    csvRow(["Assumptions", documentation.quoteSummary.assumptions.join(" ")]),
    "",
    csvRow(["Quote Line Items"]),
    csvRow(["Category", "Label", "Quantity", "Unit", "Unit cost", "Total cost", "Notes"]),
    ...documentation.quoteSummary.lineItems.map((item) =>
      csvRow([
        item.category,
        item.label,
        item.quantity,
        item.unit,
        item.unitCost,
        item.totalCost,
        item.notes,
      ])
    ),
    "",
    csvRow(["Dimension Schedule"]),
    csvRow(["Scope", "Label", "Module", "Width mm", "Height mm", "Depth mm", "Front offset X mm", "Notes"]),
    ...documentation.dimensionSchedule.map((item) =>
      csvRow([
        item.scope,
        item.label,
        item.moduleId,
        item.width,
        item.height,
        item.depth,
        item.frontOffsetX,
        item.notes,
      ])
    ),
    "",
    csvRow(["Drawing Views"]),
    csvRow(["View type", "Sheet", "Label", "Module", "Scale", "Width mm", "Height mm", "Depth mm", "Offset X mm", "Offset Z mm", "Cut plane", "Notes"]),
    ...documentation.drawingViewSchedule.map((item) =>
      csvRow([
        item.viewType,
        item.sheetRef,
        item.label,
        item.moduleId,
        item.scale,
        item.width,
        item.height,
        item.depth,
        item.offsetX,
        item.offsetZ,
        item.cutPlane,
        item.notes,
      ])
    ),
    "",
    csvRow(["BOM"]),
    csvRow(["Part", "Type", "Quantity", "Width mm", "Height mm", "Depth mm", "Material ID", "SKU", "Notes"]),
    ...bom.map((item) =>
      csvRow([
        item.name,
        item.type,
        item.quantity,
        item.width,
        item.height,
        item.depth,
        item.materialId,
        item.skuId,
        item.notes,
      ])
    ),
    "",
    csvRow(["Material Schedule"]),
    csvRow(["Material", "Material ID", "SKU", "Part count", "Area sq m", "Edge banding m", "Notes"]),
    ...documentation.materialSchedule.map((item) =>
      csvRow([
        item.materialName,
        item.materialId,
        item.skuId,
        item.partCount,
        item.areaSqM,
        item.edgeBandingM,
        item.notes,
      ])
    ),
    "",
    csvRow(["Hardware Schedule"]),
    csvRow(["Hardware", "Hardware ID", "Type", "SKU", "Quantity", "Modules", "Compatibility", "Compatibility reasons", "Notes"]),
    ...documentation.hardwareSchedule.map((item) =>
      csvRow([
        item.hardwareName,
        item.hardwareId,
        item.hardwareType,
        item.skuId,
        item.quantity,
        item.moduleIds.join(" "),
        item.compatibilityStatus,
        item.compatibilityReasons?.join(" "),
        item.notes,
      ])
    ),
    "",
    csvRow(["Edge Banding Schedule"]),
    csvRow(["Material", "Material ID", "Edge treatment", "Edge material", "Edge material ID", "SKU", "Total length m", "Part count", "Modules", "Part IDs", "Notes"]),
    ...documentation.edgeBandingSchedule.map((item) =>
      csvRow([
        item.materialName,
        item.materialId,
        item.edgeTreatment,
        item.edgeMaterialName,
        item.edgeMaterialId,
        item.skuId,
        item.totalLengthM,
        item.partCount,
        item.moduleIds.join(" "),
        item.partIds.join(" "),
        item.notes,
      ])
    ),
    "",
    csvRow(["Supplier Readiness"]),
    csvRow(["Status", documentation.supplierReadiness.status]),
    csvRow(["Mapped SKU count", documentation.supplierReadiness.mappedSkuCount]),
    csvRow(["Missing SKU count", documentation.supplierReadiness.missingSkuCount]),
    csvRow(["Custom quote required count", documentation.supplierReadiness.customQuoteRequiredCount]),
    csvRow(["Release checklist count", documentation.supplierReadiness.releaseChecklistCount]),
    csvRow(["Release blocker count", documentation.supplierReadiness.releaseBlockerCount]),
    csvRow(["Notes", documentation.supplierReadiness.notes.join(" ")]),
    "",
    csvRow(["Fabrication Release Readiness"]),
    csvRow(["Status", documentation.fabricationReleaseReadiness.status]),
    csvRow(["Required gate count", documentation.fabricationReleaseReadiness.requiredGateCount]),
    csvRow(["Recommended gate count", documentation.fabricationReleaseReadiness.recommendedGateCount]),
    csvRow(["Blocker count", documentation.fabricationReleaseReadiness.blockerCount]),
    csvRow(["Fabrication release gate count", documentation.fabricationReleaseReadiness.fabricationReleaseGateCount]),
    csvRow(["Installation gate count", documentation.fabricationReleaseReadiness.installationGateCount]),
    csvRow(["Supplier missing SKU count", documentation.fabricationReleaseReadiness.supplierMissingSkuCount]),
    csvRow(["Custom quote required count", documentation.fabricationReleaseReadiness.customQuoteRequiredCount]),
    csvRow(["Notes", documentation.fabricationReleaseReadiness.notes.join(" ")]),
    "",
    csvRow(["Supplier SKU Mappings"]),
    csvRow(["Source type", "Display name", "Supplier", "SKU", "Status", "Quantity", "Unit", "Estimated cost", "Notes"]),
    ...documentation.supplierSkuMappings.map((item) =>
      csvRow([
        item.sourceType,
        item.displayName,
        item.supplierName,
        item.skuId,
        item.status,
        item.quantity,
        item.unit,
        item.estimatedCost,
        item.notes,
      ])
    ),
    "",
    csvRow(["Cut List"]),
    csvRow(["Part", "Part ID", "Module", "Type", "Quantity", "Width mm", "Height mm", "Depth mm", "Material", "Material ID", "Grain direction", "Grain axis", "Edge treatment", "Edge material ID", "Treated edges", "Exposed faces", "Edge treatment mm", "Notes"]),
    ...documentation.cutList.map((item) =>
      csvRow([
        item.name,
        item.partId,
        item.moduleId,
        item.type,
        item.quantity,
        item.width,
        item.height,
        item.depth,
        item.materialName,
        item.materialId,
        item.grainDirection,
        item.grainAxis,
        item.edgeTreatment,
        item.edgeMaterialId,
        item.treatedEdges?.join(" "),
        item.exposedFaces?.join(" "),
        item.edgeBandingMm,
        item.notes,
      ])
    ),
    "",
    csvRow(["Installer Notes"]),
    csvRow(["Severity", "Category", "Module", "Message"]),
    ...documentation.installerNotes.map((item) =>
      csvRow([item.severity, item.category, item.moduleId, item.message])
    ),
    "",
    csvRow(["Release Checklist"]),
    csvRow(["Phase", "Label", "Owner", "Status", "Due before", "Artifacts", "Notes"]),
    ...documentation.releaseChecklist.map((item) =>
      csvRow([
        item.phase,
        item.label,
        item.owner,
        item.status,
        item.dueBefore,
        item.relatedArtifactTypes?.join(" "),
        item.notes,
      ])
    ),
  ];

  return `${rows.join("\n")}\n`;
}

export function buildCabinetDocumentationPackage(
  definition: CabinetDefinition
): CabinetDocumentationPackage {
  return {
    schema: "custom_millwork.package.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "cabinet_definition",
    cabinetDefinition: definition,
    millworkDefinition: createCabinetMillworkDefinition(definition),
    sourceDefinitionFingerprint: buildCabinetSourceDefinitionFingerprint(definition),
    bom: generateCabinetBOM(definition),
    documentation: generateCabinetDocumentation(definition),
    quoteRequest: buildCabinetFabricationQuoteRequest(definition),
    notes: [
      "CabinetDefinition is the editable source of truth.",
      "Generated GLB files are session/build outputs and should not be treated as the only editable asset.",
      "Quote totals use placeholder rates until supplier SKU mapping and fabricator quoting are connected.",
    ],
  };
}

export function buildCabinetDocumentationPackageJson(definition: CabinetDefinition): string {
  return `${JSON.stringify(buildCabinetDocumentationPackage(definition), null, 2)}\n`;
}

export function buildCabinetPlacedAssetPackageFileName(asset: PlacedCabinetAsset): string {
  return `${fileSafeName(asset.cabinetDefinition.name)}-${fileSafeName(asset.id)}-placed-package.json`;
}

export function buildCabinetPlacedAssetInstallerWorkOrderFileName(asset: PlacedCabinetAsset): string {
  return `${fileSafeName(asset.cabinetDefinition.name)}-${fileSafeName(asset.id)}-installer-work-order.json`;
}

export function buildCabinetPlacedAssetInstallerWorkOrder(
  asset: PlacedCabinetAsset,
  input: { roomName?: string } = {}
): CabinetPlacedAssetInstallerWorkOrder {
  const generatedDocumentation = generateCabinetDocumentation(asset.cabinetDefinition);
  const millworkDefinition =
    asset.millworkDefinition ?? createCabinetMillworkDefinition(asset.cabinetDefinition);
  const assetManifest =
    asset.assetManifest ??
    buildMillworkAssetManifest({
      assetId: asset.id,
      assetType: asset.assetType,
      millworkDefinition,
      sourceDefinition: asset.cabinetDefinition,
      roomId: asset.roomId,
      transform: asset.transform,
      glbAssetUrl: asset.glbAssetUrl,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    });
  const documentation: CabinetPlacedAssetInstallerWorkOrder["documentation"] = {
    dimensionSchedule:
      asset.dimensionScheduleSnapshot ?? generatedDocumentation.dimensionSchedule,
    drawingViewSchedule:
      asset.drawingViewScheduleSnapshot ?? generatedDocumentation.drawingViewSchedule,
    materialSchedule:
      asset.materialScheduleSnapshot ?? generatedDocumentation.materialSchedule,
    hardwareSchedule:
      asset.hardwareScheduleSnapshot ?? generatedDocumentation.hardwareSchedule,
    edgeBandingSchedule:
      asset.edgeBandingScheduleSnapshot ?? generatedDocumentation.edgeBandingSchedule,
    cutList: asset.cutListSnapshot ?? generatedDocumentation.cutList,
    installerNotes:
      asset.installerNotesSnapshot ?? generatedDocumentation.installerNotes,
    releaseChecklist:
      asset.releaseChecklistSnapshot ?? generatedDocumentation.releaseChecklist,
  };
  const releaseReadiness =
    asset.fabricationReleaseReadinessSnapshot ??
    generatedDocumentation.fabricationReleaseReadiness;
  const assemblyType = millworkDefinition.assemblyType;
  const wallMountedOrTall =
    asset.cabinetDefinition.height >= 1800 ||
    asset.cabinetDefinition.modules.some((module) =>
      module.type === "wall" || module.type === "tall" || module.type === "wardrobe"
    );
  const serviceCoordinationRequired =
    ["vanity", "laundry_room_cabinetry", "media_wall", "home_bar"].includes(assemblyType);
  const normalizedAsset: PlacedCabinetAsset = {
    ...asset,
    assetManifest,
    millworkDefinition,
    millworkDefinitionVersion: asset.millworkDefinitionVersion || millworkDefinition.version,
    bomSnapshot: asset.bomSnapshot.length ? asset.bomSnapshot : generateCabinetBOM(asset.cabinetDefinition),
    dimensionScheduleSnapshot: documentation.dimensionSchedule,
    drawingViewScheduleSnapshot: documentation.drawingViewSchedule,
    materialScheduleSnapshot: documentation.materialSchedule,
    hardwareScheduleSnapshot: documentation.hardwareSchedule,
    edgeBandingScheduleSnapshot: documentation.edgeBandingSchedule,
    cutListSnapshot: documentation.cutList,
    installerNotesSnapshot: documentation.installerNotes,
    releaseChecklistSnapshot: documentation.releaseChecklist,
    fabricationReleaseReadinessSnapshot: releaseReadiness,
  };

  return {
    schema: "custom_millwork.installer_work_order.v1",
    workOrderVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet",
    assetManifest,
    placedAsset: normalizedAsset,
    sourceDefinitionFingerprint: buildCabinetSourceDefinitionFingerprint(asset.cabinetDefinition),
    roomId: asset.roomId,
    roomName: input.roomName ?? asset.roomId ?? "Unassigned room",
    dimensions: {
      width: asset.cabinetDefinition.totalWidth,
      height: asset.cabinetDefinition.height,
      depth: asset.cabinetDefinition.depth,
      units: asset.cabinetDefinition.units,
    },
    siteTransform: {
      position: asset.transform.position,
      rotation: asset.transform.rotation,
      scale: asset.transform.scale,
      positionUnits: "m",
      rotationUnits: "rad",
    },
    installationScope: {
      assemblyType,
      moduleCount: asset.cabinetDefinition.modules.length,
      wallMountedOrTall,
      requiresAnchoringReview: wallMountedOrTall,
      serviceCoordinationRequired,
      releaseStatus: releaseReadiness.status,
      releaseBlockerCount: releaseReadiness.blockerCount,
    },
    documentation,
    artifacts: [
      {
        type: "installer_work_order_json",
        fileName: buildCabinetPlacedAssetInstallerWorkOrderFileName(asset),
        durable: true,
        notes: "Room, placement, release, and installer coordination package for this placed smart asset.",
      },
      {
        type: "package_json",
        fileName: buildCabinetPlacedAssetPackageFileName(asset),
        durable: true,
        notes: "Full placed smart asset package with editable source definition and documentation snapshots.",
      },
      {
        type: "shop_drawing_svg",
        fileName: `${fileSafeName(asset.cabinetDefinition.name)}-shop-drawing.svg`,
        durable: true,
        notes: "Generated elevation, section, and plan reference for installer review.",
      },
      {
        type: "documentation_csv",
        fileName: `${fileSafeName(asset.cabinetDefinition.name)}-documentation.csv`,
        durable: true,
        notes: "Human-readable schedules, notes, and release checklist.",
      },
      {
        type: "glb",
        fileName: `${fileSafeName(asset.cabinetDefinition.name)}.glb`,
        durable: Boolean(asset.glbAssetUrl && !asset.glbAssetUrl.startsWith("blob:")),
        notes: "Generated visualization output; regenerate from the source definition if the URL is session-local.",
      },
    ],
    notes: [
      "Installer work order is generated from the placed smart asset, not from a standalone GLB.",
      "Confirm field dimensions, wall substrate, services, delivery access, protection, and sequencing before installation.",
      "Use transform values with the house-plan placement; final site layout should be field-verified before fabrication release.",
    ],
  };
}

export function buildCabinetPlacedAssetInstallerWorkOrderJson(
  asset: PlacedCabinetAsset,
  input: { roomName?: string } = {}
): string {
  return `${JSON.stringify(buildCabinetPlacedAssetInstallerWorkOrder(asset, input), null, 2)}\n`;
}

export function buildCabinetPlacedAssetPackage(
  asset: PlacedCabinetAsset
): CabinetPlacedAssetPackage {
  const generatedDocumentation = generateCabinetDocumentation(asset.cabinetDefinition);
  const millworkDefinition =
    asset.millworkDefinition ?? createCabinetMillworkDefinition(asset.cabinetDefinition);
  const assetManifest = buildMillworkAssetManifest({
    assetId: asset.id,
    assetType: asset.assetType,
    millworkDefinition,
    sourceDefinition: asset.cabinetDefinition,
    roomId: asset.roomId,
    transform: asset.transform,
    glbAssetUrl: asset.glbAssetUrl,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  });
  const documentation: CabinetDocumentationSnapshot = {
    assemblyProfile: generatedDocumentation.assemblyProfile,
    dimensionSchedule:
      asset.dimensionScheduleSnapshot ?? generatedDocumentation.dimensionSchedule,
    drawingViewSchedule:
      asset.drawingViewScheduleSnapshot ?? generatedDocumentation.drawingViewSchedule,
    materialSchedule:
      asset.materialScheduleSnapshot ?? generatedDocumentation.materialSchedule,
    hardwareSchedule:
      asset.hardwareScheduleSnapshot ?? generatedDocumentation.hardwareSchedule,
    edgeBandingSchedule:
      asset.edgeBandingScheduleSnapshot ?? generatedDocumentation.edgeBandingSchedule,
    cutList: asset.cutListSnapshot ?? generatedDocumentation.cutList,
    installerNotes:
      asset.installerNotesSnapshot ?? generatedDocumentation.installerNotes,
    releaseChecklist:
      asset.releaseChecklistSnapshot ?? generatedDocumentation.releaseChecklist,
    quoteSummary: asset.quoteSummarySnapshot ?? generatedDocumentation.quoteSummary,
    supplierSkuMappings:
      asset.supplierSkuMappingsSnapshot ?? generatedDocumentation.supplierSkuMappings,
    supplierReadiness:
      asset.supplierReadinessSnapshot ?? generatedDocumentation.supplierReadiness,
    fabricationReleaseReadiness:
      asset.fabricationReleaseReadinessSnapshot ??
      generatedDocumentation.fabricationReleaseReadiness,
  };
  const normalizedAsset: PlacedCabinetAsset = {
    ...asset,
    assetManifest,
    millworkDefinition,
    bomSnapshot: asset.bomSnapshot.length ? asset.bomSnapshot : generateCabinetBOM(asset.cabinetDefinition),
    dimensionScheduleSnapshot: documentation.dimensionSchedule,
    drawingViewScheduleSnapshot: documentation.drawingViewSchedule,
    materialScheduleSnapshot: documentation.materialSchedule,
    hardwareScheduleSnapshot: documentation.hardwareSchedule,
    edgeBandingScheduleSnapshot: documentation.edgeBandingSchedule,
    cutListSnapshot: documentation.cutList,
    installerNotesSnapshot: documentation.installerNotes,
    releaseChecklistSnapshot: documentation.releaseChecklist,
    quoteSummarySnapshot: documentation.quoteSummary,
    supplierSkuMappingsSnapshot: documentation.supplierSkuMappings,
    supplierReadinessSnapshot: documentation.supplierReadiness,
    fabricationReleaseReadinessSnapshot: documentation.fabricationReleaseReadiness,
  };

  return {
    schema: "custom_millwork.placed_asset_package.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet",
    assetManifest,
    placedAsset: normalizedAsset,
    cabinetDefinition: asset.cabinetDefinition,
    millworkDefinition,
    sourceDefinitionFingerprint: buildCabinetSourceDefinitionFingerprint(asset.cabinetDefinition),
    bom: normalizedAsset.bomSnapshot,
    documentation,
    quoteRequest: buildCabinetFabricationQuoteRequest(asset.cabinetDefinition),
    installerWorkOrder: buildCabinetPlacedAssetInstallerWorkOrder(normalizedAsset),
    notes: [
      "This package preserves the placed smart asset context in addition to the editable CabinetDefinition.",
      "CabinetDefinition remains the editable source of truth; transform and room metadata describe house-plan placement.",
      "Generated GLB URLs may be session-local and should be regenerated or uploaded by durable asset storage before fabrication handoff.",
    ],
  };
}

export function buildCabinetPlacedAssetPackageJson(asset: PlacedCabinetAsset): string {
  return `${JSON.stringify(buildCabinetPlacedAssetPackage(asset), null, 2)}\n`;
}

export function buildCabinetProjectScheduleFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-millwork-schedule.json`;
}

export function buildCabinetProjectScheduleCsvFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-millwork-schedule.csv`;
}

export function buildCabinetProjectScopePackageFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-scope.json`;
}

export function buildCabinetProjectDrawingSetPackageFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-drawing-set.json`;
}

export function buildCabinetProjectCutListPackageFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-cut-list.json`;
}

export function buildCabinetProjectFinishSchedulePackageFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-finish-schedule.json`;
}

export function buildCabinetProjectFabricationQuoteRequestFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-project-rfq.json`;
}

export function buildCabinetProjectProcurementPackageFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-procurement.json`;
}

export function buildCabinetProjectQuotePackageFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-project-quote.json`;
}

export function buildCabinetProjectPurchaseReadinessPackageFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-purchase-readiness.json`;
}

export function buildCabinetProjectFabricationReleasePackageFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-fabrication-release.json`;
}

export function buildCabinetProjectFieldVerificationPackageFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-field-verification.json`;
}

export function buildCabinetProjectInstallationPlanPackageFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-installation-plan.json`;
}

export function buildCabinetProjectCncBatchPackageFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-cnc-batch.json`;
}

export function buildCabinetProjectApprovalPackageFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-approval-package.json`;
}

export function buildCabinetProjectRevisionPackageFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-revision-package.json`;
}

export function buildCabinetProjectHandoffPackageFileName(input: {
  projectName?: string;
  projectId?: string;
}): string {
  return `${fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project")}-project-handoff.json`;
}

function summarizeQuoteCategories(
  lineItems: CabinetQuoteLineItem[]
): CabinetProjectQuoteCategorySummary[] {
  return QUOTE_CATEGORIES.map((category) => {
    const categoryItems = lineItems.filter((item) => item.category === category);
    return {
      category,
      label: QUOTE_CATEGORY_LABELS[category],
      lineCount: categoryItems.length,
      estimatedTotal: roundMoney(
        categoryItems.reduce((sum, item) => sum + item.totalCost, 0)
      ),
    };
  });
}

export function buildCabinetProjectSchedulePackage(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): CabinetProjectSchedulePackage {
  const placedPackages = input.assets.map((asset) => buildCabinetPlacedAssetPackage(asset));
  const roomMap = new Map<string, CabinetProjectScheduleRoomSummary>();

  const totals: CabinetProjectScheduleTotals = {
    roomCount: 0,
    assetCount: placedPackages.length,
    moduleCount: 0,
    bomLineCount: 0,
    materialScheduleCount: 0,
    hardwareScheduleCount: 0,
    edgeBandingScheduleCount: 0,
    edgeBandingTotalM: 0,
    cutListCount: 0,
    estimatedTotal: 0,
    releaseChecklistCount: 0,
    releaseBlockerCount: 0,
    supplierMissingSkuCount: 0,
    customQuoteRequiredCount: 0,
  };

  const assets = placedPackages.map((pkg) => {
    const asset = pkg.placedAsset;
    const definition = pkg.cabinetDefinition;
    const documentation = pkg.documentation;
    const roomId = asset.roomId;
    const roomName =
      (roomId ? input.roomNamesById?.[roomId] : undefined) ??
      roomId ??
      "Unassigned room";
    const edgeBandingTotalM = roundM(
      documentation.cutList.reduce((sum, item) => sum + item.edgeBandingMm / 1000, 0)
    );
    const releaseBlockerCount = documentation.releaseChecklist.filter(
      (item) => item.status === "blocked"
    ).length;

    totals.moduleCount += definition.modules.length;
    totals.bomLineCount += pkg.bom.length;
    totals.materialScheduleCount += documentation.materialSchedule.length;
    totals.hardwareScheduleCount += documentation.hardwareSchedule.length;
    totals.edgeBandingScheduleCount += documentation.edgeBandingSchedule.length;
    totals.edgeBandingTotalM += edgeBandingTotalM;
    totals.cutListCount += documentation.cutList.length;
    totals.estimatedTotal += documentation.quoteSummary.estimatedTotal;
    totals.releaseChecklistCount += documentation.releaseChecklist.length;
    totals.releaseBlockerCount += releaseBlockerCount;
    totals.supplierMissingSkuCount += documentation.supplierReadiness.missingSkuCount;
    totals.customQuoteRequiredCount += documentation.supplierReadiness.customQuoteRequiredCount;

    const roomKey = roomId ?? "__unassigned";
    const roomSummary =
      roomMap.get(roomKey) ??
      {
        roomId,
        roomName,
        assetCount: 0,
        assemblyTypes: [],
        estimatedTotal: 0,
        edgeBandingTotalM: 0,
        releaseBlockerCount: 0,
      };
    roomSummary.assetCount += 1;
    if (!roomSummary.assemblyTypes.includes(pkg.millworkDefinition.assemblyType)) {
      roomSummary.assemblyTypes.push(pkg.millworkDefinition.assemblyType);
    }
    roomSummary.estimatedTotal += documentation.quoteSummary.estimatedTotal;
    roomSummary.edgeBandingTotalM += edgeBandingTotalM;
    roomSummary.releaseBlockerCount += releaseBlockerCount;
    roomMap.set(roomKey, roomSummary);

    return {
      id: asset.id,
      roomId,
      roomName,
      displayName: definition.name,
      assemblyType: pkg.millworkDefinition.assemblyType,
      sourceDefinitionId: definition.id,
      sourceDefinitionVersion: definition.version,
      sourceDefinitionFingerprint: pkg.sourceDefinitionFingerprint,
      width: definition.totalWidth,
      height: definition.height,
      depth: definition.depth,
      moduleCount: definition.modules.length,
      bomLineCount: pkg.bom.length,
      materialScheduleCount: documentation.materialSchedule.length,
      hardwareScheduleCount: documentation.hardwareSchedule.length,
      edgeBandingScheduleCount: documentation.edgeBandingSchedule.length,
      edgeBandingTotalM,
      cutListCount: documentation.cutList.length,
      estimatedTotal: documentation.quoteSummary.estimatedTotal,
      supplierReadinessStatus: documentation.supplierReadiness.status,
      fabricationReleaseStatus: documentation.fabricationReleaseReadiness.status,
      releaseBlockerCount,
      updatedAt: asset.updatedAt,
    };
  });

  totals.roomCount = roomMap.size;
  totals.edgeBandingTotalM = roundM(totals.edgeBandingTotalM);
  totals.estimatedTotal = roundMoney(totals.estimatedTotal);

  const rooms = Array.from(roomMap.values())
    .map((room) => ({
      ...room,
      assemblyTypes: [...room.assemblyTypes].sort(),
      estimatedTotal: roundMoney(room.estimatedTotal),
      edgeBandingTotalM: roundM(room.edgeBandingTotalM),
    }))
    .sort((a, b) => a.roomName.localeCompare(b.roomName));

  return {
    schema: "custom_millwork.project_schedule.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    rooms,
    assets,
    totals,
    assetManifests: placedPackages.map((pkg) => pkg.assetManifest),
    placedAssets: placedPackages.map((pkg) => pkg.placedAsset),
    notes: [
      "Project schedule aggregates placed smart millwork assets across rooms.",
      "Each placed asset keeps its editable CabinetDefinition and asset manifest; generated GLB URLs are outputs, not the source of truth.",
      "Totals are preliminary and should be reviewed against field measurements, supplier confirmations, and fabricator quotes.",
    ],
  };
}

export function buildCabinetProjectSchedulePackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectSchedulePackage(input), null, 2)}\n`;
}

export function buildCabinetProjectScheduleCsv(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): string {
  const schedule = buildCabinetProjectSchedulePackage(input);
  const rows: string[] = [
    csvRow(["Custom Millwork Project Schedule"]),
    csvRow(["Schema", schedule.schema]),
    csvRow(["Project ID", schedule.projectId]),
    csvRow(["Project name", schedule.projectName]),
    csvRow(["Generated at", schedule.generatedAt]),
    "",
    csvRow(["Project Totals"]),
    csvRow(["Room count", schedule.totals.roomCount]),
    csvRow(["Asset count", schedule.totals.assetCount]),
    csvRow(["Module count", schedule.totals.moduleCount]),
    csvRow(["BOM line count", schedule.totals.bomLineCount]),
    csvRow(["Material schedule count", schedule.totals.materialScheduleCount]),
    csvRow(["Hardware schedule count", schedule.totals.hardwareScheduleCount]),
    csvRow(["Edge banding schedule count", schedule.totals.edgeBandingScheduleCount]),
    csvRow(["Edge banding total m", schedule.totals.edgeBandingTotalM]),
    csvRow(["Cut-list count", schedule.totals.cutListCount]),
    csvRow(["Estimated total", schedule.totals.estimatedTotal]),
    csvRow(["Release checklist count", schedule.totals.releaseChecklistCount]),
    csvRow(["Release blocker count", schedule.totals.releaseBlockerCount]),
    csvRow(["Supplier missing SKU count", schedule.totals.supplierMissingSkuCount]),
    csvRow(["Custom quote required count", schedule.totals.customQuoteRequiredCount]),
    "",
    csvRow(["Rooms"]),
    csvRow(["Room", "Room ID", "Asset count", "Assembly types", "Estimated total", "Edge banding total m", "Release blockers"]),
    ...schedule.rooms.map((room) =>
      csvRow([
        room.roomName,
        room.roomId,
        room.assetCount,
        room.assemblyTypes.join(" "),
        room.estimatedTotal,
        room.edgeBandingTotalM,
        room.releaseBlockerCount,
      ])
    ),
    "",
    csvRow(["Placed Millwork Assets"]),
    csvRow([
      "Asset ID",
      "Room",
      "Room ID",
      "Name",
      "Assembly type",
      "Source definition ID",
      "Source version",
      "Width mm",
      "Height mm",
      "Depth mm",
      "Modules",
      "BOM lines",
      "Material rows",
      "Hardware rows",
      "Edge banding rows",
      "Edge banding total m",
      "Cut-list rows",
      "Estimated total",
      "Supplier readiness",
      "Fabrication release status",
      "Release blockers",
      "Updated at",
    ]),
    ...schedule.assets.map((asset) =>
      csvRow([
        asset.id,
        asset.roomName,
        asset.roomId,
        asset.displayName,
        asset.assemblyType,
        asset.sourceDefinitionId,
        asset.sourceDefinitionVersion,
        asset.width,
        asset.height,
        asset.depth,
        asset.moduleCount,
        asset.bomLineCount,
        asset.materialScheduleCount,
        asset.hardwareScheduleCount,
        asset.edgeBandingScheduleCount,
        asset.edgeBandingTotalM,
        asset.cutListCount,
        asset.estimatedTotal,
        asset.supplierReadinessStatus,
        asset.fabricationReleaseStatus,
        asset.releaseBlockerCount,
        asset.updatedAt,
      ])
    ),
    "",
    csvRow(["Notes"]),
    ...schedule.notes.map((note) => csvRow([note])),
  ];

  return `${rows.join("\n")}\n`;
}

const PROJECT_SCOPE_DEFINITIONS: Array<{
  scopeId: CabinetProjectScopeCoverageItem["scopeId"];
  label: string;
  families: MillworkFamily[];
  assemblyTypes: MillworkAssemblyType[];
  notes: string;
}> = [
  {
    scopeId: "mvp",
    label: "MVP cabinet and storage built-ins",
    families: ["cabinetry", "wardrobe", "vanity"],
    assemblyTypes: ["base", "wall", "tall", "wardrobe", "vanity", "tv_console", "cabinet_run"],
    notes: "First fully working scope for base, wall, tall, wardrobe, vanity, TV console, and cabinet-run smart assets.",
  },
  {
    scopeId: "phase_2",
    label: "Expanded storage and room built-ins",
    families: [
      "closet",
      "media_wall",
      "mudroom",
      "laundry_room",
      "home_office",
      "library",
      "window_seat",
      "banquette",
      "pantry",
      "wine_storage",
      "bar",
      "island",
    ],
    assemblyTypes: [
      "closet_system",
      "media_wall",
      "mudroom_storage",
      "laundry_room_cabinetry",
      "home_office_built_in",
      "library_wall",
      "window_seat",
      "banquette",
      "pantry_system",
      "wine_storage",
      "home_bar",
      "kitchen_island",
    ],
    notes: "Expansion path for closets, mudrooms, media walls, home offices, libraries, laundry rooms, banquettes, window seats, pantry systems, home bars, wine storage, and kitchen islands.",
  },
  {
    scopeId: "phase_3",
    label: "Convertible and small-space built-ins",
    families: [
      "murphy_bed",
      "home_office",
      "storage_bed",
      "under_stair_storage",
      "room_divider_storage",
      "lifestyle_built_in",
    ],
    assemblyTypes: [
      "murphy_bed",
      "fold_down_desk",
      "platform_storage_bed",
      "under_stair_storage",
      "room_divider_storage",
      "pet_built_in",
      "kids_storage",
      "hobby_storage",
    ],
    notes: "Expansion path for Murphy beds, fold-down desks, storage beds, under-stair storage, room divider storage, and lifestyle built-ins for pets, kids, hobbies, and compact spaces.",
  },
  {
    scopeId: "phase_4",
    label: "Paneling, slat walls, surrounds, and trim",
    families: ["paneling", "trim", "ceiling_woodwork"],
    assemblyTypes: [
      "wall_paneling",
      "slat_wall",
      "ceiling_beams",
      "coffered_ceiling",
      "fireplace_surround",
      "trim_package",
    ],
    notes: "Expansion path for wall paneling, slat walls, fireplace surrounds, mantels, trim, moulding, and ceiling woodwork.",
  },
  {
    scopeId: "phase_5",
    label: "Professional documentation",
    families: [],
    assemblyTypes: [],
    notes: "Documentation layer covering drawings, dimensions, BOM, material schedules, hardware schedules, cut lists, edge banding, installer notes, and quote packages.",
  },
  {
    scopeId: "phase_6",
    label: "Commerce, supplier, fabrication, CNC, and installer workflows",
    families: [],
    assemblyTypes: [],
    notes: "Workflow layer covering supplier SKU mapping, quote requests, purchase readiness, CNC/DXF handoff, approval, release, field verification, and installation planning.",
  },
];

export function buildCabinetProjectScopePackage(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): CabinetProjectScopePackage {
  const schedule = buildCabinetProjectSchedulePackage(input);
  const placedPackages = input.assets.map((asset) => buildCabinetPlacedAssetPackage(asset));
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");
  const currency = placedPackages[0]?.documentation.quoteSummary.currency ?? "USD";
  const familyMap = new Map<MillworkFamily, CabinetProjectScopeFamilySummary>();
  const assemblyMap = new Map<MillworkAssemblyType, CabinetProjectScopeAssemblySummary>();

  for (const pkg of placedPackages) {
    const asset = pkg.placedAsset;
    const definition = pkg.cabinetDefinition;
    const family = pkg.millworkDefinition.family;
    const assemblyType = pkg.millworkDefinition.assemblyType;
    const roomName =
      (asset.roomId ? input.roomNamesById?.[asset.roomId] : undefined) ??
      asset.roomId ??
      "Unassigned room";
    const fingerprint = pkg.sourceDefinitionFingerprint;
    const estimatedTotal = pkg.documentation.quoteSummary.estimatedTotal;

    const familySummary =
      familyMap.get(family) ??
      {
        family,
        assetCount: 0,
        assemblyTypes: [],
        assetIds: [],
        roomNames: [],
        sourceDefinitionFingerprints: [],
        totalWidthMm: 0,
        estimatedTotal: 0,
        currency,
      };
    familySummary.assetCount += 1;
    familySummary.totalWidthMm += definition.totalWidth;
    familySummary.estimatedTotal += estimatedTotal;
    if (!familySummary.assemblyTypes.includes(assemblyType)) familySummary.assemblyTypes.push(assemblyType);
    if (!familySummary.assetIds.includes(asset.id)) familySummary.assetIds.push(asset.id);
    if (!familySummary.roomNames.includes(roomName)) familySummary.roomNames.push(roomName);
    if (!familySummary.sourceDefinitionFingerprints.includes(fingerprint)) {
      familySummary.sourceDefinitionFingerprints.push(fingerprint);
    }
    familyMap.set(family, familySummary);

    const assemblySummary =
      assemblyMap.get(assemblyType) ??
      {
        assemblyType,
        family,
        assetCount: 0,
        assetIds: [],
        roomNames: [],
        sourceDefinitionFingerprints: [],
        moduleCount: 0,
        cutListCount: 0,
      };
    assemblySummary.assetCount += 1;
    assemblySummary.moduleCount += definition.modules.length;
    assemblySummary.cutListCount += pkg.documentation.cutList.length;
    if (!assemblySummary.assetIds.includes(asset.id)) assemblySummary.assetIds.push(asset.id);
    if (!assemblySummary.roomNames.includes(roomName)) assemblySummary.roomNames.push(roomName);
    if (!assemblySummary.sourceDefinitionFingerprints.includes(fingerprint)) {
      assemblySummary.sourceDefinitionFingerprints.push(fingerprint);
    }
    assemblyMap.set(assemblyType, assemblySummary);
  }

  const families = Array.from(familyMap.values())
    .map((item) => ({
      ...item,
      assemblyTypes: [...item.assemblyTypes].sort(),
      assetIds: [...item.assetIds].sort(),
      roomNames: [...item.roomNames].sort(),
      sourceDefinitionFingerprints: [...item.sourceDefinitionFingerprints].sort(),
      estimatedTotal: roundMoney(item.estimatedTotal),
    }))
    .sort((a, b) => a.family.localeCompare(b.family));
  const assemblies = Array.from(assemblyMap.values())
    .map((item) => ({
      ...item,
      assetIds: [...item.assetIds].sort(),
      roomNames: [...item.roomNames].sort(),
      sourceDefinitionFingerprints: [...item.sourceDefinitionFingerprints].sort(),
    }))
    .sort((a, b) => a.assemblyType.localeCompare(b.assemblyType));
  const representedFamilies = new Set(families.map((item) => item.family));
  const representedAssemblies = new Set(assemblies.map((item) => item.assemblyType));

  const coverage: CabinetProjectScopeCoverageItem[] = PROJECT_SCOPE_DEFINITIONS.map((scope) => {
    const scopeFamilies =
      scope.families.length > 0
        ? scope.families.filter((family) => representedFamilies.has(family))
        : families.map((item) => item.family);
    const scopeAssemblies =
      scope.assemblyTypes.length > 0
        ? scope.assemblyTypes.filter((assemblyType) => representedAssemblies.has(assemblyType))
        : assemblies.map((item) => item.assemblyType);
    const assetIds = new Set<string>();
    for (const family of scopeFamilies) {
      familyMap.get(family)?.assetIds.forEach((assetId) => assetIds.add(assetId));
    }
    for (const assemblyType of scopeAssemblies) {
      assemblyMap.get(assemblyType)?.assetIds.forEach((assetId) => assetIds.add(assetId));
    }
    const totalExpected =
      scope.families.length + scope.assemblyTypes.length;
    const representedCount = scopeFamilies.length + scopeAssemblies.length;
    const status: CabinetProjectScopeCoverageItem["status"] =
      scope.scopeId === "phase_5" || scope.scopeId === "phase_6"
        ? schedule.totals.assetCount > 0
          ? "represented"
          : "not_represented"
        : representedCount === 0
          ? "not_represented"
          : representedCount >= totalExpected
            ? "represented"
            : "partially_represented";

    return {
      scopeId: scope.scopeId,
      label: scope.label,
      status,
      representedFamilies: [...scopeFamilies].sort(),
      representedAssemblyTypes: [...scopeAssemblies].sort(),
      assetCount: assetIds.size,
      notes: scope.notes,
    };
  });

  const totals: CabinetProjectScopeTotals = {
    assetCount: schedule.totals.assetCount,
    roomCount: schedule.totals.roomCount,
    familyCount: families.length,
    assemblyTypeCount: assemblies.length,
    cabinetryAssetCount: families
      .filter((item) => item.family === "cabinetry")
      .reduce((sum, item) => sum + item.assetCount, 0),
    broaderBuiltInAssetCount: families
      .filter((item) => item.family !== "cabinetry")
      .reduce((sum, item) => sum + item.assetCount, 0),
    phaseRepresentedCount: coverage.filter((item) => item.status !== "not_represented").length,
    sourceDefinitionFingerprintCount: new Set(
      families.flatMap((item) => item.sourceDefinitionFingerprints)
    ).size,
    estimatedTotal: schedule.totals.estimatedTotal,
    currency,
  };

  return {
    schema: "custom_millwork.project_scope.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    schedule,
    totals,
    families,
    assemblies,
    coverage,
    scopePolicy: {
      sourceOfTruth: "cabinet_definition",
      supportsBroaderCustomBuiltIns: totals.broaderBuiltInAssetCount > 0,
      reason:
        "Current custom millwork assets are generated from CabinetDefinition source JSON while carrying family and assembly metadata for broader built-in workflows.",
    },
    artifacts: [
      {
        type: "project_scope_json",
        fileName: `${baseName}-scope.json`,
        durable: true,
        notes: "Project-level custom millwork family, assembly, and expansion-scope coverage package.",
      },
      {
        type: "project_schedule_json",
        fileName: `${baseName}-millwork-schedule.json`,
        durable: true,
        notes: "Project schedule used as the placed smart asset source for scope coverage.",
      },
      {
        type: "project_handoff_package_json",
        fileName: `${baseName}-project-handoff.json`,
        durable: true,
        notes: "Umbrella handoff bundle that includes project scope coverage.",
      },
      ...placedPackages.map((pkg) => ({
        type: "package_json" as const,
        fileName: buildCabinetPlacedAssetPackageFileName(pkg.placedAsset),
        durable: true,
        notes: `Placed source package for ${pkg.cabinetDefinition.name}.`,
      })),
    ],
    assumptions: [
      "Scope coverage describes represented source definitions and generated package capability; it does not claim specialized fabrication logic for every future built-in family.",
      "Broader built-in families currently reuse the cabinet-definition parametric pipeline until dedicated family-specific generators are added.",
      "Regenerate this package after adding, removing, importing, or editing any placed custom millwork asset.",
    ],
  };
}

export function buildCabinetProjectScopePackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectScopePackage(input), null, 2)}\n`;
}

export function buildCabinetProjectProcurementPackage(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): CabinetProjectProcurementPackage {
  const schedule = buildCabinetProjectSchedulePackage(input);
  const placedPackages = input.assets.map((asset) => buildCabinetPlacedAssetPackage(asset));
  const lineMap = new Map<string, CabinetProjectProcurementLineItem>();
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");

  for (const pkg of placedPackages) {
    const asset = pkg.placedAsset;
    const roomName =
      (asset.roomId ? input.roomNamesById?.[asset.roomId] : undefined) ??
      asset.roomId ??
      "Unassigned room";

    for (const mapping of pkg.documentation.supplierSkuMappings) {
      const key = [
        mapping.sourceType,
        mapping.sourceId,
        mapping.supplierName,
        mapping.skuId ?? "quote",
        mapping.unit,
        mapping.status,
      ].join(":");
      const existing =
        lineMap.get(key) ??
        {
          id: `procure:${key}`,
          sourceType: mapping.sourceType,
          sourceId: mapping.sourceId,
          displayName: mapping.displayName,
          supplierName: mapping.supplierName,
          skuId: mapping.skuId,
          status: mapping.status,
          quantity: 0,
          unit: mapping.unit,
          estimatedCost: 0,
          assetIds: [],
          roomNames: [],
          assemblyTypes: [],
          notes: mapping.notes,
        };

      existing.quantity += mapping.quantity;
      existing.estimatedCost += mapping.estimatedCost ?? 0;
      if (!existing.assetIds.includes(asset.id)) existing.assetIds.push(asset.id);
      if (!existing.roomNames.includes(roomName)) existing.roomNames.push(roomName);
      if (!existing.assemblyTypes.includes(pkg.millworkDefinition.assemblyType)) {
        existing.assemblyTypes.push(pkg.millworkDefinition.assemblyType);
      }
      lineMap.set(key, existing);
    }
  }

  const lineItems = Array.from(lineMap.values())
    .map((item) => ({
      ...item,
      quantity: roundSqM(item.quantity),
      estimatedCost: roundMoney(item.estimatedCost),
      assetIds: [...item.assetIds].sort(),
      roomNames: [...item.roomNames].sort(),
      assemblyTypes: [...item.assemblyTypes].sort(),
    }))
    .sort(
      (a, b) =>
        a.sourceType.localeCompare(b.sourceType) ||
        a.supplierName.localeCompare(b.supplierName) ||
        a.displayName.localeCompare(b.displayName)
    );

  const sumBySourceType = (sourceType: CabinetProjectProcurementLineItem["sourceType"]) =>
    lineItems
      .filter((item) => item.sourceType === sourceType)
      .reduce((sum, item) => sum + item.estimatedCost, 0);

  const materialCost = sumBySourceType("material");
  const hardwareCost = sumBySourceType("hardware");
  const fabricationCost = sumBySourceType("fabrication_service");
  const installationCost = sumBySourceType("installation_service");
  const totals: CabinetProjectProcurementTotals = {
    lineCount: lineItems.length,
    mappedSkuCount: lineItems.filter((item) => item.status === "mapped").length,
    placeholderSkuCount: lineItems.filter((item) => item.status === "placeholder").length,
    customQuoteRequiredCount: lineItems.filter((item) => item.status === "custom_quote_required").length,
    materialCost: roundMoney(materialCost),
    hardwareCost: roundMoney(hardwareCost),
    fabricationCost: roundMoney(fabricationCost),
    installationCost: roundMoney(installationCost),
    estimatedTotal: roundMoney(materialCost + hardwareCost + fabricationCost + installationCost),
    currency: "USD",
  };

  return {
    schema: "custom_millwork.project_procurement.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    schedule,
    totals,
    lineItems,
    rooms: schedule.rooms,
    assets: schedule.assets,
    checkoutPolicy: {
      includeInCheckout: false,
      reason:
        "Custom millwork is a smart design-to-build asset; procurement rows are supplier/fabricator handoff data until quote approval and catalog purchasing are connected.",
    },
    artifacts: [
      {
        type: "project_procurement_json",
        fileName: `${baseName}-procurement.json`,
        durable: true,
        notes: "Project-level procurement handoff with supplier SKU rows and custom quote rows.",
      },
      {
        type: "project_schedule_json",
        fileName: `${baseName}-millwork-schedule.json`,
        durable: true,
        notes: "Project schedule used as the source context for procurement grouping.",
      },
      {
        type: "project_finish_schedule_json",
        fileName: `${baseName}-finish-schedule.json`,
        durable: true,
        notes: "Project finish schedule used for material, hardware, and edge-banding review.",
      },
      {
        type: "project_revision_package_json",
        fileName: `${baseName}-revision-package.json`,
        durable: true,
        notes: "Revision package used to review changed source definitions, placement, materials, hardware, and quote impacts.",
      },
      {
        type: "project_quote_package_json",
        fileName: `${baseName}-project-quote.json`,
        durable: true,
        notes: "Project quote package summarizing preliminary estimate totals and supplier quote readiness.",
      },
      {
        type: "project_purchase_readiness_json",
        fileName: `${baseName}-purchase-readiness.json`,
        durable: true,
        notes: "Project purchase readiness package for future supplier catalog and PO review.",
      },
      {
        type: "project_rfq_json",
        fileName: `${baseName}-project-rfq.json`,
        durable: true,
        notes: "Project RFQ needed to convert custom quote rows into confirmed supplier/fabricator pricing.",
      },
      ...schedule.assets.map((asset) => ({
        type: "package_json" as const,
        fileName: `${fileSafeName(asset.displayName)}-${fileSafeName(asset.id)}-placed-package.json`,
        durable: true,
        notes: `Placed source package for ${asset.displayName} in ${asset.roomName}.`,
      })),
    ],
    assumptions: [
      "This procurement package is a planning handoff, not a purchase order or checkout payload.",
      "Mapped material and hardware SKUs can become supplier catalog rows after availability and pricing are confirmed.",
      "Fabrication and installation service rows require custom quotes before purchase approval.",
      "CabinetDefinition remains the editable source of truth; procurement rows should be regenerated after design edits.",
    ],
  };
}

export function buildCabinetProjectProcurementPackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectProcurementPackage(input), null, 2)}\n`;
}

export function buildCabinetProjectFinishSchedulePackage(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): CabinetProjectFinishSchedulePackage {
  const schedule = buildCabinetProjectSchedulePackage(input);
  const procurementPackage = buildCabinetProjectProcurementPackage(input);
  const placedPackages = input.assets.map((asset) => buildCabinetPlacedAssetPackage(asset));
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");
  const materialMap = new Map<string, CabinetProjectFinishMaterialSummary>();
  const hardwareMap = new Map<string, CabinetProjectFinishHardwareSummary>();
  const edgeBandingMap = new Map<string, CabinetProjectFinishEdgeBandingSummary>();

  const supplierStatusPriority: Record<CabinetSupplierSkuMappingItem["status"], number> = {
    custom_quote_required: 3,
    placeholder: 2,
    mapped: 1,
  };
  const supplierStatusFor = (
    mappings: CabinetSupplierSkuMappingItem[],
    sourceType: Extract<CabinetSupplierSkuMappingItem["sourceType"], "material" | "hardware">,
    sourceId: string
  ) =>
    mappings
      .filter((mapping) => mapping.sourceType === sourceType && mapping.sourceId === sourceId)
      .map((mapping) => mapping.status)
      .sort((a, b) => supplierStatusPriority[b] - supplierStatusPriority[a])[0];

  const assets: CabinetProjectFinishAssetSummary[] = placedPackages
    .map((pkg) => {
      const asset = pkg.placedAsset;
      const definition = pkg.cabinetDefinition;
      const documentation = pkg.documentation;
      const roomName =
        (asset.roomId ? input.roomNamesById?.[asset.roomId] : undefined) ??
        asset.roomId ??
        "Unassigned room";
      const assemblyType = pkg.millworkDefinition.assemblyType;
      const definitionMaterials = new Map(
        definition.materials.map((material) => [material.id, material])
      );
      const edgeBandingTotalM = roundM(
        documentation.cutList.reduce((sum, item) => sum + item.edgeBandingMm / 1000, 0)
      );

      for (const material of documentation.materialSchedule) {
        const definitionMaterial = definitionMaterials.get(material.materialId);
        const key = `${material.materialId}:${material.skuId ?? "unmapped"}`;
        const existing =
          materialMap.get(key) ??
          {
            materialId: material.materialId,
            materialName: material.materialName,
            skuId: material.skuId,
            color: definitionMaterial?.color,
            textureUrl: definitionMaterial?.textureUrl,
            partCount: 0,
            areaSqM: 0,
            edgeBandingM: 0,
            assetIds: [],
            roomNames: [],
            assemblyTypes: [],
            supplierStatus: supplierStatusFor(
              documentation.supplierSkuMappings,
              "material",
              material.materialId
            ),
            notes: material.notes,
          };
        existing.partCount += material.partCount;
        existing.areaSqM += material.areaSqM;
        existing.edgeBandingM += material.edgeBandingM;
        if (!existing.assetIds.includes(asset.id)) existing.assetIds.push(asset.id);
        if (!existing.roomNames.includes(roomName)) existing.roomNames.push(roomName);
        if (!existing.assemblyTypes.includes(assemblyType)) {
          existing.assemblyTypes.push(assemblyType);
        }
        if (!existing.supplierStatus) {
          existing.supplierStatus = supplierStatusFor(
            documentation.supplierSkuMappings,
            "material",
            material.materialId
          );
        }
        materialMap.set(key, existing);
      }

      for (const hardware of documentation.hardwareSchedule) {
        const key = `${hardware.hardwareId}:${hardware.skuId ?? "unmapped"}`;
        const existing =
          hardwareMap.get(key) ??
          {
            hardwareId: hardware.hardwareId,
            hardwareName: hardware.hardwareName,
            hardwareType: hardware.hardwareType,
            skuId: hardware.skuId,
            quantity: 0,
            assetIds: [],
            roomNames: [],
            assemblyTypes: [],
            supplierStatus: supplierStatusFor(
              documentation.supplierSkuMappings,
              "hardware",
              hardware.hardwareId
            ),
            notes: hardware.notes,
          };
        existing.quantity += hardware.quantity;
        if (!existing.assetIds.includes(asset.id)) existing.assetIds.push(asset.id);
        if (!existing.roomNames.includes(roomName)) existing.roomNames.push(roomName);
        if (!existing.assemblyTypes.includes(assemblyType)) {
          existing.assemblyTypes.push(assemblyType);
        }
        if (!existing.supplierStatus) {
          existing.supplierStatus = supplierStatusFor(
            documentation.supplierSkuMappings,
            "hardware",
            hardware.hardwareId
          );
        }
        hardwareMap.set(key, existing);
      }

      for (const edgeBanding of documentation.edgeBandingSchedule) {
        const key = `${edgeBanding.materialId}:${edgeBanding.edgeMaterialName}:${edgeBanding.skuId ?? "unmapped"}`;
        const existing =
          edgeBandingMap.get(key) ??
          {
            materialId: edgeBanding.materialId,
            materialName: edgeBanding.materialName,
            edgeMaterialName: edgeBanding.edgeMaterialName,
            skuId: edgeBanding.skuId,
            totalLengthM: 0,
            partCount: 0,
            assetIds: [],
            roomNames: [],
            assemblyTypes: [],
            notes: edgeBanding.notes,
          };
        existing.totalLengthM += edgeBanding.totalLengthM;
        existing.partCount += edgeBanding.partCount;
        if (!existing.assetIds.includes(asset.id)) existing.assetIds.push(asset.id);
        if (!existing.roomNames.includes(roomName)) existing.roomNames.push(roomName);
        if (!existing.assemblyTypes.includes(assemblyType)) {
          existing.assemblyTypes.push(assemblyType);
        }
        edgeBandingMap.set(key, existing);
      }

      return {
        id: asset.id,
        roomId: asset.roomId,
        roomName,
        displayName: definition.name,
        assemblyType,
        sourceDefinitionId: definition.id,
        sourceDefinitionVersion: definition.version,
        materialScheduleCount: documentation.materialSchedule.length,
        hardwareScheduleCount: documentation.hardwareSchedule.length,
        edgeBandingScheduleCount: documentation.edgeBandingSchedule.length,
        edgeBandingTotalM,
        supplierReadinessStatus: documentation.supplierReadiness.status,
        customQuoteRequiredCount: documentation.supplierReadiness.customQuoteRequiredCount,
        updatedAt: asset.updatedAt,
      };
    })
    .sort((a, b) => a.roomName.localeCompare(b.roomName) || a.displayName.localeCompare(b.displayName));

  const sortTraceability = <
    T extends {
      assetIds: string[];
      roomNames: string[];
      assemblyTypes: MillworkAssemblyType[];
    },
  >(
    item: T
  ): T => ({
    ...item,
    assetIds: [...item.assetIds].sort(),
    roomNames: [...item.roomNames].sort(),
    assemblyTypes: [...item.assemblyTypes].sort(),
  });

  const materials = Array.from(materialMap.values())
    .map((item) =>
      sortTraceability({
        ...item,
        areaSqM: roundSqM(item.areaSqM),
        edgeBandingM: roundM(item.edgeBandingM),
      })
    )
    .sort((a, b) => a.materialName.localeCompare(b.materialName) || (a.skuId ?? "").localeCompare(b.skuId ?? ""));
  const hardware = Array.from(hardwareMap.values())
    .map((item) => sortTraceability(item))
    .sort(
      (a, b) =>
        a.hardwareType.localeCompare(b.hardwareType) ||
        a.hardwareName.localeCompare(b.hardwareName)
    );
  const edgeBanding = Array.from(edgeBandingMap.values())
    .map((item) =>
      sortTraceability({
        ...item,
        totalLengthM: roundM(item.totalLengthM),
      })
    )
    .sort(
      (a, b) =>
        a.materialName.localeCompare(b.materialName) ||
        a.edgeMaterialName.localeCompare(b.edgeMaterialName)
    );

  const totals: CabinetProjectFinishScheduleTotals = {
    assetCount: assets.length,
    roomCount: schedule.totals.roomCount,
    materialCount: materials.length,
    hardwareCount: hardware.length,
    edgeBandingCount: edgeBanding.length,
    materialAreaSqM: roundSqM(materials.reduce((sum, material) => sum + material.areaSqM, 0)),
    edgeBandingTotalM: roundM(assets.reduce((sum, item) => sum + item.edgeBandingTotalM, 0)),
    hardwareQuantity: hardware.reduce((sum, item) => sum + item.quantity, 0),
    mappedSkuCount: procurementPackage.totals.mappedSkuCount,
    missingSkuCount: schedule.totals.supplierMissingSkuCount,
    customQuoteRequiredCount: procurementPackage.totals.customQuoteRequiredCount,
  };

  return {
    schema: "custom_millwork.project_finish_schedule.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    schedule,
    procurementPackage,
    totals,
    materials,
    hardware,
    edgeBanding,
    assets,
    finishReviewPolicy: {
      requiresDesignerApproval: true,
      requiresClientApproval: true,
      requiresSupplierConfirmation: true,
      reason:
        "Project finish, material, hardware, and edge-banding selections require designer/client review and supplier confirmation before quote, purchase, fabrication, or installation release.",
    },
    artifacts: [
      {
        type: "project_finish_schedule_json",
        fileName: `${baseName}-finish-schedule.json`,
        durable: true,
        notes: "Project-level finish, material, hardware, and edge-banding schedule.",
      },
      {
        type: "project_schedule_json",
        fileName: `${baseName}-millwork-schedule.json`,
        durable: true,
        notes: "Project schedule used for placed asset and room context.",
      },
      {
        type: "project_revision_package_json",
        fileName: `${baseName}-revision-package.json`,
        durable: true,
        notes: "Revision package used to track changes to finish, material, hardware, and placement assumptions.",
      },
      {
        type: "project_schedule_csv",
        fileName: `${baseName}-millwork-schedule.csv`,
        durable: true,
        notes: "Human-readable project schedule for estimator review.",
      },
      {
        type: "project_procurement_json",
        fileName: `${baseName}-procurement.json`,
        durable: true,
        notes: "Supplier procurement rows used to track SKU mapping and custom quote readiness.",
      },
      {
        type: "project_quote_package_json",
        fileName: `${baseName}-project-quote.json`,
        durable: true,
        notes: "Project quote package that consumes material and hardware review context.",
      },
      {
        type: "project_purchase_readiness_json",
        fileName: `${baseName}-purchase-readiness.json`,
        durable: true,
        notes: "Purchase readiness package for future catalog checkout and PO handoff.",
      },
      {
        type: "project_rfq_json",
        fileName: `${baseName}-project-rfq.json`,
        durable: true,
        notes: "Project RFQ package for supplier/fabricator confirmation.",
      },
      {
        type: "project_fabrication_release_json",
        fileName: `${baseName}-fabrication-release.json`,
        durable: true,
        notes: "Fabrication release package gated by finish, SKU, quote, and approval review.",
      },
      {
        type: "project_field_verification_json",
        fileName: `${baseName}-field-verification.json`,
        durable: true,
        notes: "Field verification package required before release.",
      },
      {
        type: "project_approval_package_json",
        fileName: `${baseName}-approval-package.json`,
        durable: true,
        notes: "Approval package for finish, material, hardware, and supplier signoff.",
      },
      {
        type: "project_cnc_batch_json",
        fileName: `${baseName}-cnc-batch.json`,
        durable: true,
        notes: "CNC batch package that uses material and edge-banding summaries.",
      },
      {
        type: "project_installation_plan_json",
        fileName: `${baseName}-installation-plan.json`,
        durable: true,
        notes: "Installation plan for room sequencing and site coordination.",
      },
      ...assets.map((asset) => ({
        type: "package_json" as const,
        fileName: `${fileSafeName(asset.displayName)}-${fileSafeName(asset.id)}-placed-package.json`,
        durable: true,
        notes: `Placed source package for ${asset.displayName} in ${asset.roomName}.`,
      })),
    ],
    assumptions: [
      "This finish schedule is a project-level planning artifact, not a supplier confirmation or purchase order.",
      "Material colors, textures, hardware SKUs, edge-banding lengths, availability, finish batches, lead times, freight, and pricing require supplier/fabricator confirmation.",
      "Regenerate this schedule after any CabinetDefinition, material, hardware, room, placement, supplier mapping, quote, or approval change.",
      "CabinetDefinition remains the editable source of truth; this package is derived documentation.",
    ],
  };
}

export function buildCabinetProjectFinishSchedulePackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectFinishSchedulePackage(input), null, 2)}\n`;
}

function formatRevisionDimensions(asset: CabinetProjectRevisionAssetSnapshot): string {
  return `${asset.dimensions.width}x${asset.dimensions.height}x${asset.dimensions.depth} mm`;
}

function formatRevisionTransform(asset: CabinetProjectRevisionAssetSnapshot): string {
  const position = asset.siteTransform.position.map((value) => roundM(value)).join(",");
  const rotation = asset.siteTransform.rotation.map((value) => roundM(value)).join(",");
  return `position:${position};rotation:${rotation}`;
}

function summarizeRevisionAsset(
  pkg: CabinetPlacedAssetPackage,
  input: {
    roomNamesById?: Record<string, string>;
    revisionStatus: CabinetProjectRevisionAssetSnapshot["revisionStatus"];
  }
): CabinetProjectRevisionAssetSnapshot {
  const asset = pkg.placedAsset;
  const definition = pkg.cabinetDefinition;
  const documentation = pkg.documentation;
  const roomName =
    (asset.roomId ? input.roomNamesById?.[asset.roomId] : undefined) ??
    asset.roomId ??
    "Unassigned room";

  return {
    id: asset.id,
    roomId: asset.roomId,
    roomName,
    displayName: definition.name,
    assemblyType: pkg.millworkDefinition.assemblyType,
    sourceDefinitionId: definition.id,
    sourceDefinitionVersion: definition.version,
    sourceDefinitionFingerprint: pkg.sourceDefinitionFingerprint,
    revisionStatus: input.revisionStatus,
    dimensions: {
      width: definition.totalWidth,
      height: definition.height,
      depth: definition.depth,
      units: "mm",
    },
    siteTransform: {
      position: asset.transform.position,
      rotation: asset.transform.rotation,
      scale: asset.transform.scale,
      positionUnits: "m",
      rotationUnits: "rad",
    },
    materialIds: documentation.materialSchedule.map((item) => item.materialId).sort(),
    hardwareIds: documentation.hardwareSchedule.map((item) => item.hardwareId).sort(),
    bomLineCount: pkg.bom.length,
    materialScheduleCount: documentation.materialSchedule.length,
    hardwareScheduleCount: documentation.hardwareSchedule.length,
    edgeBandingTotalM: roundM(
      documentation.edgeBandingSchedule.reduce((sum, item) => sum + item.totalLengthM, 0)
    ),
    quoteTotal: roundMoney(documentation.quoteSummary.estimatedTotal),
    supplierReadinessStatus: documentation.supplierReadiness.status,
    fabricationReleaseStatus: documentation.fabricationReleaseReadiness.status,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

function buildRevisionChangeItem(input: {
  asset: CabinetProjectRevisionAssetSnapshot;
  scope: CabinetProjectRevisionChangeItem["scope"];
  severity?: CabinetProjectRevisionChangeItem["severity"];
  previousValue?: string;
  currentValue?: string;
  requiresApproval?: boolean;
  notes: string;
  relatedArtifactTypes: CabinetFabricationArtifact["type"][];
}): CabinetProjectRevisionChangeItem {
  return {
    id: `revision:${input.asset.id}:${input.scope}`,
    assetId: input.asset.id,
    roomId: input.asset.roomId,
    roomName: input.asset.roomName,
    displayName: input.asset.displayName,
    scope: input.scope,
    severity: input.severity ?? "review_required",
    previousValue: input.previousValue,
    currentValue: input.currentValue,
    requiresApproval: input.requiresApproval ?? input.scope !== "supplier_readiness",
    relatedArtifactTypes: input.relatedArtifactTypes,
    notes: input.notes,
  };
}

export function buildCabinetProjectRevisionPackage(input: {
  assets: PlacedCabinetAsset[];
  previousAssets?: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
  previousRoomNamesById?: Record<string, string>;
}): CabinetProjectRevisionPackage {
  const currentSchedule = buildCabinetProjectSchedulePackage(input);
  const previousSchedule = input.previousAssets
    ? buildCabinetProjectSchedulePackage({
        assets: input.previousAssets,
        projectId: input.projectId,
        projectName: input.projectName,
        roomNamesById: input.previousRoomNamesById ?? input.roomNamesById,
      })
    : undefined;
  const currentPackages = input.assets.map((asset) => buildCabinetPlacedAssetPackage(asset));
  const previousPackages = (input.previousAssets ?? []).map((asset) =>
    buildCabinetPlacedAssetPackage(asset)
  );
  const currentById = new Map(currentPackages.map((pkg) => [pkg.placedAsset.id, pkg]));
  const previousById = new Map(previousPackages.map((pkg) => [pkg.placedAsset.id, pkg]));
  const allAssetIds = Array.from(new Set([...previousById.keys(), ...currentById.keys()])).sort();
  const assets: CabinetProjectRevisionAssetSnapshot[] = [];
  const changes: CabinetProjectRevisionChangeItem[] = [];
  const baselineComparisonAvailable = Boolean(input.previousAssets);

  for (const assetId of allAssetIds) {
    const currentPackage = currentById.get(assetId);
    const previousPackage = previousById.get(assetId);

    if (!baselineComparisonAvailable && currentPackage) {
      assets.push(
        summarizeRevisionAsset(currentPackage, {
          roomNamesById: input.roomNamesById,
          revisionStatus: "baseline",
        })
      );
      continue;
    }

    if (currentPackage && !previousPackage) {
      const current = summarizeRevisionAsset(currentPackage, {
        roomNamesById: input.roomNamesById,
        revisionStatus: "added",
      });
      assets.push(current);
      changes.push(
        buildRevisionChangeItem({
          asset: current,
          scope: "asset_added",
          currentValue: current.sourceDefinitionId,
          notes: "Placed smart millwork asset was added to the project and needs design/build review.",
          relatedArtifactTypes: ["package_json", "project_schedule_json", "project_approval_package_json"],
        })
      );
      continue;
    }

    if (previousPackage && !currentPackage) {
      const previous = summarizeRevisionAsset(previousPackage, {
        roomNamesById: input.previousRoomNamesById ?? input.roomNamesById,
        revisionStatus: "removed",
      });
      assets.push(previous);
      changes.push(
        buildRevisionChangeItem({
          asset: previous,
          scope: "asset_removed",
          previousValue: previous.sourceDefinitionId,
          notes: "Placed smart millwork asset was removed from the project; cancel related quote, fabrication, procurement, and installation rows if already issued.",
          relatedArtifactTypes: [
            "project_schedule_json",
            "project_procurement_json",
            "project_fabrication_release_json",
            "project_installation_plan_json",
          ],
        })
      );
      continue;
    }

    if (!currentPackage || !previousPackage) continue;

    const current = summarizeRevisionAsset(currentPackage, {
      roomNamesById: input.roomNamesById,
      revisionStatus: "unchanged",
    });
    const previous = summarizeRevisionAsset(previousPackage, {
      roomNamesById: input.previousRoomNamesById ?? input.roomNamesById,
      revisionStatus: "unchanged",
    });
    const assetChanges: CabinetProjectRevisionChangeItem[] = [];

    if (current.sourceDefinitionVersion !== previous.sourceDefinitionVersion) {
      assetChanges.push(
        buildRevisionChangeItem({
          asset: current,
          scope: "source_version",
          previousValue: String(previous.sourceDefinitionVersion),
          currentValue: String(current.sourceDefinitionVersion),
          notes: "Editable source definition version changed; regenerate dependent outputs and review downstream packages.",
          relatedArtifactTypes: ["source_definition", "package_json", "project_schedule_json"],
        })
      );
    }

    if (current.sourceDefinitionFingerprint !== previous.sourceDefinitionFingerprint) {
      assetChanges.push(
        buildRevisionChangeItem({
          asset: current,
          scope: "source_fingerprint",
          previousValue: previous.sourceDefinitionFingerprint,
          currentValue: current.sourceDefinitionFingerprint,
          notes:
            "Editable source definition content changed; regenerate GLB, drawings, cut lists, quotes, and release packages from the current parametric definition.",
          relatedArtifactTypes: [
            "source_definition",
            "package_json",
            "project_revision_package_json",
            "project_handoff_package_json",
          ],
        })
      );
    }

    if (formatRevisionDimensions(current) !== formatRevisionDimensions(previous)) {
      assetChanges.push(
        buildRevisionChangeItem({
          asset: current,
          scope: "dimension",
          previousValue: formatRevisionDimensions(previous),
          currentValue: formatRevisionDimensions(current),
          notes: "Overall dimensions changed; review drawings, cut lists, quote totals, field measurements, and fabrication release gates.",
          relatedArtifactTypes: [
            "shop_drawing_svg",
            "fabrication_dxf",
            "project_schedule_json",
            "project_fabrication_release_json",
          ],
        })
      );
    }

    if (formatRevisionTransform(current) !== formatRevisionTransform(previous)) {
      assetChanges.push(
        buildRevisionChangeItem({
          asset: current,
          scope: "placement",
          previousValue: formatRevisionTransform(previous),
          currentValue: formatRevisionTransform(current),
          notes: "Placed transform changed; review field verification, installer work order, and installation sequencing.",
          relatedArtifactTypes: [
            "installer_work_order_json",
            "project_field_verification_json",
            "project_installation_plan_json",
          ],
        })
      );
    }

    if (current.roomId !== previous.roomId) {
      assetChanges.push(
        buildRevisionChangeItem({
          asset: current,
          scope: "room",
          previousValue: previous.roomName,
          currentValue: current.roomName,
          notes: "Assigned room changed; review room schedule, delivery path, install sequence, and room-level quote grouping.",
          relatedArtifactTypes: ["project_schedule_json", "project_installation_plan_json"],
        })
      );
    }

    if (current.materialIds.join("|") !== previous.materialIds.join("|")) {
      assetChanges.push(
        buildRevisionChangeItem({
          asset: current,
          scope: "material",
          previousValue: previous.materialIds.join(","),
          currentValue: current.materialIds.join(","),
          notes: "Material selections changed; confirm finish schedule, SKU mappings, supplier availability, and client approval.",
          relatedArtifactTypes: [
            "project_finish_schedule_json",
            "project_procurement_json",
            "project_approval_package_json",
          ],
        })
      );
    }

    if (current.hardwareIds.join("|") !== previous.hardwareIds.join("|")) {
      assetChanges.push(
        buildRevisionChangeItem({
          asset: current,
          scope: "hardware",
          previousValue: previous.hardwareIds.join(","),
          currentValue: current.hardwareIds.join(","),
          notes: "Hardware selections changed; confirm hardware schedule, drilling assumptions, SKU availability, and client approval.",
          relatedArtifactTypes: [
            "project_finish_schedule_json",
            "project_procurement_json",
            "project_cnc_batch_json",
          ],
        })
      );
    }

    if (current.bomLineCount !== previous.bomLineCount) {
      assetChanges.push(
        buildRevisionChangeItem({
          asset: current,
          scope: "bom",
          previousValue: String(previous.bomLineCount),
          currentValue: String(current.bomLineCount),
          notes: "BOM line count changed; review procurement and fabrication package quantities.",
          relatedArtifactTypes: ["package_json", "project_procurement_json", "project_rfq_json"],
        })
      );
    }

    if (current.edgeBandingTotalM !== previous.edgeBandingTotalM) {
      assetChanges.push(
        buildRevisionChangeItem({
          asset: current,
          scope: "edge_banding",
          previousValue: String(previous.edgeBandingTotalM),
          currentValue: String(current.edgeBandingTotalM),
          notes: "Edge-banding quantity changed; update finish schedule, quote, and fabrication review.",
          relatedArtifactTypes: [
            "project_finish_schedule_json",
            "project_quote_package_json",
            "project_cnc_batch_json",
          ],
        })
      );
    }

    if (current.quoteTotal !== previous.quoteTotal) {
      assetChanges.push(
        buildRevisionChangeItem({
          asset: current,
          scope: "quote",
          previousValue: String(previous.quoteTotal),
          currentValue: String(current.quoteTotal),
          notes: "Preliminary quote total changed; send revised quote package before purchase or fabrication authorization.",
          relatedArtifactTypes: [
            "project_quote_package_json",
            "project_purchase_readiness_json",
            "project_rfq_json",
          ],
        })
      );
    }

    if (current.supplierReadinessStatus !== previous.supplierReadinessStatus) {
      assetChanges.push(
        buildRevisionChangeItem({
          asset: current,
          scope: "supplier_readiness",
          previousValue: previous.supplierReadinessStatus,
          currentValue: current.supplierReadinessStatus,
          requiresApproval: false,
          notes: "Supplier readiness changed; review SKU mapping and custom quote status before purchase handoff.",
          relatedArtifactTypes: ["project_procurement_json", "project_purchase_readiness_json"],
        })
      );
    }

    if (current.fabricationReleaseStatus !== previous.fabricationReleaseStatus) {
      assetChanges.push(
        buildRevisionChangeItem({
          asset: current,
          scope: "fabrication_release",
          severity: current.fabricationReleaseStatus === "blocked" ? "release_blocking" : "review_required",
          previousValue: previous.fabricationReleaseStatus,
          currentValue: current.fabricationReleaseStatus,
          notes: "Fabrication release readiness changed; review release package and approval gates before issuing production instructions.",
          relatedArtifactTypes: ["project_fabrication_release_json", "project_approval_package_json"],
        })
      );
    }

    assets.push({
      ...current,
      revisionStatus: assetChanges.length > 0 ? "changed" : "unchanged",
    });
    changes.push(...assetChanges);
  }

  const currentQuoteTotal = input.assets.reduce(
    (sum, asset) =>
      sum +
      (asset.quoteSummarySnapshot?.estimatedTotal ??
        generateCabinetDocumentation(asset.cabinetDefinition).quoteSummary.estimatedTotal),
    0
  );
  const previousQuoteTotal = (input.previousAssets ?? []).reduce(
    (sum, asset) =>
      sum +
      (asset.quoteSummarySnapshot?.estimatedTotal ??
        generateCabinetDocumentation(asset.cabinetDefinition).quoteSummary.estimatedTotal),
    0
  );
  const currentEdgeBandingTotal = input.assets.reduce(
    (sum, asset) =>
      sum +
      (asset.edgeBandingScheduleSnapshot ?? generateCabinetDocumentation(asset.cabinetDefinition).edgeBandingSchedule)
        .reduce((edgeSum, item) => edgeSum + item.totalLengthM, 0),
    0
  );
  const previousEdgeBandingTotal = (input.previousAssets ?? []).reduce(
    (sum, asset) =>
      sum +
      (asset.edgeBandingScheduleSnapshot ?? generateCabinetDocumentation(asset.cabinetDefinition).edgeBandingSchedule)
        .reduce((edgeSum, item) => edgeSum + item.totalLengthM, 0),
    0
  );
  const totals: CabinetProjectRevisionTotals = {
    currentAssetCount: input.assets.length,
    previousAssetCount: input.previousAssets?.length ?? 0,
    addedAssetCount: assets.filter((asset) => asset.revisionStatus === "added").length,
    removedAssetCount: assets.filter((asset) => asset.revisionStatus === "removed").length,
    changedAssetCount: assets.filter((asset) => asset.revisionStatus === "changed").length,
    unchangedAssetCount: assets.filter((asset) => asset.revisionStatus === "unchanged").length,
    changeItemCount: changes.length,
    reviewRequiredCount: changes.filter((item) => item.requiresApproval).length,
    releaseBlockingCount: changes.filter((item) => item.severity === "release_blocking").length,
    dimensionChangeCount: changes.filter((item) => item.scope === "dimension").length,
    placementChangeCount: changes.filter((item) => item.scope === "placement").length,
    materialChangeCount: changes.filter((item) => item.scope === "material").length,
    hardwareChangeCount: changes.filter((item) => item.scope === "hardware").length,
    quoteDelta: roundMoney(currentQuoteTotal - previousQuoteTotal),
    edgeBandingDeltaM: roundM(currentEdgeBandingTotal - previousEdgeBandingTotal),
  };
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");

  return {
    schema: "custom_millwork.project_revision_package.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    currentSchedule,
    previousSchedule,
    totals,
    assets: assets.sort((a, b) => a.roomName.localeCompare(b.roomName) || a.displayName.localeCompare(b.displayName)),
    changes: changes.sort(
      (a, b) =>
        a.roomName.localeCompare(b.roomName) ||
        a.displayName.localeCompare(b.displayName) ||
        a.scope.localeCompare(b.scope)
    ),
    revisionPolicy: {
      baselineComparisonAvailable,
      requiresDesignerReview: changes.some((item) => item.requiresApproval),
      requiresClientReview: changes.some((item) =>
        ["asset_added", "asset_removed", "dimension", "material", "hardware", "quote"].includes(item.scope)
      ),
      requiresFabricatorNotification: changes.some((item) =>
        ["asset_added", "asset_removed", "dimension", "bom", "edge_banding", "fabrication_release"].includes(item.scope)
      ),
      reason: baselineComparisonAvailable
        ? "Compared current placed smart millwork assets against the supplied baseline so changed design-to-build packages can be reviewed before quote, purchase, fabrication, or installation release."
        : "No previous asset baseline was supplied; this package establishes the current placed smart millwork revision baseline.",
    },
    artifacts: [
      {
        type: "project_revision_package_json",
        fileName: `${baseName}-revision-package.json`,
        durable: true,
        notes: "Project-level revision and change-control package for placed smart millwork assets.",
      },
      {
        type: "project_drawing_set_json",
        fileName: `${baseName}-drawing-set.json`,
        durable: true,
        notes: "Project drawing set index used to review revised elevations, sections, plans, and dimensions.",
      },
      {
        type: "project_schedule_json",
        fileName: `${baseName}-millwork-schedule.json`,
        durable: true,
        notes: "Current project schedule used as revision source context.",
      },
      {
        type: "project_finish_schedule_json",
        fileName: `${baseName}-finish-schedule.json`,
        durable: true,
        notes: "Finish/material/hardware schedule used to review changed selections.",
      },
      {
        type: "project_procurement_json",
        fileName: `${baseName}-procurement.json`,
        durable: true,
        notes: "Procurement package used to review changed SKU and quote rows.",
      },
      {
        type: "project_quote_package_json",
        fileName: `${baseName}-project-quote.json`,
        durable: true,
        notes: "Quote package used to review estimate changes.",
      },
      {
        type: "project_approval_package_json",
        fileName: `${baseName}-approval-package.json`,
        durable: true,
        notes: "Approval package used to re-run client/designer/fabricator signoff after revisions.",
      },
      {
        type: "project_fabrication_release_json",
        fileName: `${baseName}-fabrication-release.json`,
        durable: true,
        notes: "Fabrication release package used to gate revised production handoff.",
      },
      {
        type: "project_field_verification_json",
        fileName: `${baseName}-field-verification.json`,
        durable: true,
        notes: "Field verification package used to review placement and site-measurement changes.",
      },
      {
        type: "project_installation_plan_json",
        fileName: `${baseName}-installation-plan.json`,
        durable: true,
        notes: "Installation plan used to review room, transform, and sequencing changes.",
      },
      {
        type: "project_rfq_json",
        fileName: `${baseName}-project-rfq.json`,
        durable: true,
        notes: "RFQ package used to request revised supplier/fabricator pricing.",
      },
      ...assets.map((asset) => ({
        type: "package_json" as const,
        fileName: `${fileSafeName(asset.displayName)}-${fileSafeName(asset.id)}-placed-package.json`,
        durable: asset.revisionStatus !== "removed",
        notes:
          asset.revisionStatus === "removed"
            ? `Previous placed source package reference for removed ${asset.displayName} in ${asset.roomName}.`
            : `Current placed source package for ${asset.displayName} in ${asset.roomName}.`,
      })),
    ],
    assumptions: [
      "This package is a generated revision-control aid, not a signed change order or approval record.",
      "Designer, client, supplier, fabricator, and installer review is still required before changed millwork packages are purchased, fabricated, or installed.",
      "If no previous baseline is supplied, the package records the current design as the revision baseline for future comparisons.",
      "Regenerate this package after any CabinetDefinition, placement, room, material, hardware, quote, approval, procurement, field verification, or release change.",
    ],
  };
}

export function buildCabinetProjectRevisionPackageJson(input: {
  assets: PlacedCabinetAsset[];
  previousAssets?: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
  previousRoomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectRevisionPackage(input), null, 2)}\n`;
}

export function buildCabinetProjectDrawingSetPackage(input: {
  assets: PlacedCabinetAsset[];
  previousAssets?: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
  previousRoomNamesById?: Record<string, string>;
}): CabinetProjectDrawingSetPackage {
  const schedule = buildCabinetProjectSchedulePackage(input);
  const revisionPackage = buildCabinetProjectRevisionPackage(input);
  const approvalPackage = buildCabinetProjectApprovalPackage(input);
  const placedPackages = input.assets.map((asset) => buildCabinetPlacedAssetPackage(asset));
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");
  const sheets: CabinetProjectDrawingSetSheetSummary[] = [];

  const assets: CabinetProjectDrawingSetAssetSummary[] = placedPackages
    .map((pkg) => {
      const asset = pkg.placedAsset;
      const definition = pkg.cabinetDefinition;
      const documentation = pkg.documentation;
      const assemblyType = pkg.millworkDefinition.assemblyType;
      const roomName =
        (asset.roomId ? input.roomNamesById?.[asset.roomId] : undefined) ??
        asset.roomId ??
        "Unassigned room";
      const releaseStatus = documentation.fabricationReleaseReadiness.status;
      const releaseBlockerCount = documentation.fabricationReleaseReadiness.blockerCount;
      const shopDrawingFileName = `${fileSafeName(definition.name)}-shop-drawing.svg`;
      const placedPackageFileName = buildCabinetPlacedAssetPackageFileName(asset);
      const frontElevationCount = documentation.drawingViewSchedule.filter(
        (view) => view.viewType === "front_elevation"
      ).length;
      const sideSectionCount = documentation.drawingViewSchedule.filter(
        (view) => view.viewType === "side_section"
      ).length;
      const planFootprintCount = documentation.drawingViewSchedule.filter(
        (view) => view.viewType === "plan_footprint"
      ).length;
      const viewsBySheet = new Map<string, CabinetDrawingViewScheduleItem[]>();

      for (const view of documentation.drawingViewSchedule) {
        const existing = viewsBySheet.get(view.sheetRef) ?? [];
        existing.push(view);
        viewsBySheet.set(view.sheetRef, existing);
      }

      for (const [sheetRef, views] of viewsBySheet) {
        const moduleIds = new Set(views.map((view) => view.moduleId).filter(Boolean));
        const dimensionRows = documentation.dimensionSchedule.filter(
          (dimension) =>
            dimension.scope === "overall" ||
            (dimension.moduleId ? moduleIds.has(dimension.moduleId) : false)
        );
        const viewTypes = Array.from(new Set(views.map((view) => view.viewType))).sort();
        const reviewStatus: CabinetProjectDrawingSetSheetSummary["reviewStatus"] =
          releaseStatus === "blocked" || releaseBlockerCount > 0
            ? "blocked"
            : releaseStatus === "ready_for_release"
              ? "ready_for_submittal"
              : "needs_review";

        sheets.push({
          id: `drawing-sheet:${asset.id}:${sheetRef}`,
          assetId: asset.id,
          roomId: asset.roomId,
          roomName,
          displayName: definition.name,
          assemblyType,
          sheetRef,
          sheetTitle: `${definition.name} ${views[0]?.label ?? "drawing sheet"}`,
          shopDrawingFileName,
          viewTypes,
          viewCount: views.length,
          dimensionRowCount: dimensionRows.length,
          width: definition.totalWidth,
          height: definition.height,
          depth: definition.depth,
          units: "mm",
          reviewStatus,
          relatedArtifactTypes: [
            "shop_drawing_svg",
            "project_drawing_set_json",
            "project_approval_package_json",
            "project_fabrication_release_json",
          ],
          notes:
            reviewStatus === "ready_for_submittal"
              ? "Generated sheet is ready for human submittal review."
              : "Generated sheet requires designer/fabricator review before submittal or release.",
        });
      }

      return {
        id: asset.id,
        roomId: asset.roomId,
        roomName,
        displayName: definition.name,
        assemblyType,
        sourceDefinitionId: definition.id,
        sourceDefinitionVersion: definition.version,
        shopDrawingFileName,
        placedPackageFileName,
        drawingViewCount: documentation.drawingViewSchedule.length,
        dimensionRowCount: documentation.dimensionSchedule.length,
        frontElevationCount,
        sideSectionCount,
        planFootprintCount,
        releaseStatus,
        releaseBlockerCount,
        updatedAt: asset.updatedAt,
      };
    })
    .sort((a, b) => a.roomName.localeCompare(b.roomName) || a.displayName.localeCompare(b.displayName));

  sheets.sort(
    (a, b) =>
      a.roomName.localeCompare(b.roomName) ||
      a.displayName.localeCompare(b.displayName) ||
      a.sheetRef.localeCompare(b.sheetRef)
  );

  const totals: CabinetProjectDrawingSetTotals = {
    roomCount: schedule.totals.roomCount,
    assetCount: assets.length,
    sheetCount: sheets.length,
    drawingViewCount: assets.reduce((sum, asset) => sum + asset.drawingViewCount, 0),
    dimensionRowCount: assets.reduce((sum, asset) => sum + asset.dimensionRowCount, 0),
    frontElevationCount: assets.reduce((sum, asset) => sum + asset.frontElevationCount, 0),
    sideSectionCount: assets.reduce((sum, asset) => sum + asset.sideSectionCount, 0),
    planFootprintCount: assets.reduce((sum, asset) => sum + asset.planFootprintCount, 0),
    shopDrawingFileCount: assets.length,
    releaseBlockerCount: assets.reduce((sum, asset) => sum + asset.releaseBlockerCount, 0),
  };

  return {
    schema: "custom_millwork.project_drawing_set.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    schedule,
    revisionPackage,
    approvalPackage,
    totals,
    assets,
    sheets,
    drawingReviewPolicy: {
      requiresDesignerReview: true,
      requiresClientReview: true,
      requiresFabricatorReview: true,
      requiresFieldVerification: true,
      reason:
        "Generated elevations, sections, plan footprints, and dimension sheets are derived documentation and require designer, client, fabricator, and field verification review before fabrication or installation release.",
    },
    artifacts: [
      {
        type: "project_drawing_set_json",
        fileName: `${baseName}-drawing-set.json`,
        durable: true,
        notes: "Project-level drawing set index for generated elevations, sections, plan footprints, dimensions, and shop drawing SVG references.",
      },
      {
        type: "project_cut_list_json",
        fileName: `${baseName}-cut-list.json`,
        durable: true,
        notes: "Project cut-list package used to cross-check drawing sheets against generated fabrication part rows.",
      },
      {
        type: "project_schedule_json",
        fileName: `${baseName}-millwork-schedule.json`,
        durable: true,
        notes: "Project schedule used for room and placed asset context.",
      },
      {
        type: "project_revision_package_json",
        fileName: `${baseName}-revision-package.json`,
        durable: true,
        notes: "Revision package used to identify changed drawings before submittal.",
      },
      {
        type: "project_approval_package_json",
        fileName: `${baseName}-approval-package.json`,
        durable: true,
        notes: "Approval package used for client/designer/fabricator drawing signoff.",
      },
      {
        type: "project_fabrication_release_json",
        fileName: `${baseName}-fabrication-release.json`,
        durable: true,
        notes: "Fabrication release package used to gate drawing set release.",
      },
      {
        type: "project_field_verification_json",
        fileName: `${baseName}-field-verification.json`,
        durable: true,
        notes: "Field verification package used to confirm dimensions and site conditions before drawing approval.",
      },
      ...assets.flatMap((asset) => [
        {
          type: "shop_drawing_svg" as const,
          fileName: asset.shopDrawingFileName,
          durable: true,
          notes: `Generated shop drawing SVG for ${asset.displayName} in ${asset.roomName}.`,
        },
        {
          type: "package_json" as const,
          fileName: asset.placedPackageFileName,
          durable: true,
          notes: `Placed source package for ${asset.displayName} in ${asset.roomName}.`,
        },
      ]),
    ],
    assumptions: [
      "This package is a generated drawing index, not a signed drawing submittal or fabrication release.",
      "Generated sheet references rely on the current parametric CabinetDefinition and should be regenerated after any design, placement, material, hardware, field verification, quote, or approval change.",
      "Final dimensions, tolerances, joinery, hardware drilling, substrate, services, and site constraints require human review before fabrication.",
    ],
  };
}

export function buildCabinetProjectDrawingSetPackageJson(input: {
  assets: PlacedCabinetAsset[];
  previousAssets?: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
  previousRoomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectDrawingSetPackage(input), null, 2)}\n`;
}

export function buildCabinetProjectCutListPackage(input: {
  assets: PlacedCabinetAsset[];
  previousAssets?: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
  previousRoomNamesById?: Record<string, string>;
}): CabinetProjectCutListPackage {
  const schedule = buildCabinetProjectSchedulePackage(input);
  const drawingSetPackage = buildCabinetProjectDrawingSetPackage(input);
  const revisionPackage = buildCabinetProjectRevisionPackage(input);
  const placedPackages = input.assets.map((asset) => buildCabinetPlacedAssetPackage(asset));
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");
  const parts: CabinetProjectCutListPartItem[] = [];
  const materialMap = new Map<string, CabinetProjectCutListMaterialSummary>();

  const assets: CabinetProjectCutListAssetSummary[] = placedPackages
    .map((pkg) => {
      const asset = pkg.placedAsset;
      const definition = pkg.cabinetDefinition;
      const documentation = pkg.documentation;
      const assemblyType = pkg.millworkDefinition.assemblyType;
      const roomName =
        (asset.roomId ? input.roomNamesById?.[asset.roomId] : undefined) ??
        asset.roomId ??
        "Unassigned room";
      const shopDrawingFileName = `${fileSafeName(definition.name)}-shop-drawing.svg`;
      const fabricationDxfFileName = `${fileSafeName(definition.name)}-cut-layout.dxf`;
      const edgeBandingM = roundM(
        documentation.cutList.reduce((sum, item) => sum + item.edgeBandingMm / 1000, 0)
      );

      for (const item of documentation.cutList) {
        const areaSqM = largestFaceAreaSqM({
          id: item.partId,
          moduleId: item.moduleId,
          type: item.type,
          position: { x: 0, y: 0, z: 0 },
          size: { width: item.width, height: item.height, depth: item.depth },
          materialId: item.materialId,
        });
        const edgeM = item.edgeBandingMm / 1000;
        const materialSummary =
          materialMap.get(item.materialId) ??
          {
            materialId: item.materialId,
            materialName: item.materialName,
            partCount: 0,
            quantity: 0,
            areaSqM: 0,
            edgeBandingM: 0,
            assetIds: [],
            roomNames: [],
            assemblyTypes: [],
          };
        materialSummary.partCount += 1;
        materialSummary.quantity += item.quantity;
        materialSummary.areaSqM += areaSqM * item.quantity;
        materialSummary.edgeBandingM += edgeM * item.quantity;
        if (!materialSummary.assetIds.includes(asset.id)) materialSummary.assetIds.push(asset.id);
        if (!materialSummary.roomNames.includes(roomName)) materialSummary.roomNames.push(roomName);
        if (!materialSummary.assemblyTypes.includes(assemblyType)) {
          materialSummary.assemblyTypes.push(assemblyType);
        }
        materialMap.set(item.materialId, materialSummary);

        parts.push({
          id: `cut:${asset.id}:${item.partId}`,
          assetId: asset.id,
          roomId: asset.roomId,
          roomName,
          displayName: definition.name,
          assemblyType,
          sourceDefinitionId: definition.id,
          sourceDefinitionVersion: definition.version,
          partId: item.partId,
          moduleId: item.moduleId,
          name: item.name,
          type: item.type,
          quantity: item.quantity,
          width: item.width,
          height: item.height,
          depth: item.depth,
          units: "mm",
          materialId: item.materialId,
          materialName: item.materialName,
          edgeBandingMm: item.edgeBandingMm,
          edgeBandingM: roundM(edgeM),
          grainDirection: item.grainDirection,
          grainAxis: item.grainAxis,
          edgeTreatment: item.edgeTreatment,
          edgeMaterialId: item.edgeMaterialId,
          treatedEdges: item.treatedEdges,
          exposedFaces: item.exposedFaces,
          cutFace: item.cutFace,
          shopDrawingFileName,
          fabricationDxfFileName,
          notes: item.notes,
        });
      }

      return {
        id: asset.id,
        roomId: asset.roomId,
        roomName,
        displayName: definition.name,
        assemblyType,
        sourceDefinitionId: definition.id,
        sourceDefinitionVersion: definition.version,
        cutListCount: documentation.cutList.length,
        materialCount: new Set(documentation.cutList.map((item) => item.materialId)).size,
        edgeBandingM,
        shopDrawingFileName,
        fabricationDxfFileName,
        fabricationReleaseStatus: documentation.fabricationReleaseReadiness.status,
        releaseBlockerCount: documentation.fabricationReleaseReadiness.blockerCount,
        updatedAt: asset.updatedAt,
      };
    })
    .sort((a, b) => a.roomName.localeCompare(b.roomName) || a.displayName.localeCompare(b.displayName));

  parts.sort(
    (a, b) =>
      a.roomName.localeCompare(b.roomName) ||
      a.displayName.localeCompare(b.displayName) ||
      a.moduleId.localeCompare(b.moduleId) ||
      a.name.localeCompare(b.name)
  );

  const materials = Array.from(materialMap.values())
    .map((item) => ({
      ...item,
      areaSqM: roundSqM(item.areaSqM),
      edgeBandingM: roundM(item.edgeBandingM),
      assetIds: [...item.assetIds].sort(),
      roomNames: [...item.roomNames].sort(),
      assemblyTypes: [...item.assemblyTypes].sort(),
    }))
    .sort((a, b) => a.materialName.localeCompare(b.materialName));

  const totals: CabinetProjectCutListTotals = {
    roomCount: schedule.totals.roomCount,
    assetCount: assets.length,
    partRowCount: parts.length,
    totalQuantity: parts.reduce((sum, item) => sum + item.quantity, 0),
    materialCount: materials.length,
    materialAreaSqM: roundSqM(materials.reduce((sum, item) => sum + item.areaSqM, 0)),
    edgeBandingTotalM: roundM(
      parts.reduce((sum, item) => sum + (item.edgeBandingMm / 1000) * item.quantity, 0)
    ),
    dxfFileCount: assets.length,
    shopDrawingFileCount: assets.length,
    releaseBlockerCount: assets.reduce((sum, asset) => sum + asset.releaseBlockerCount, 0),
  };

  return {
    schema: "custom_millwork.project_cut_list.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    schedule,
    drawingSetPackage,
    revisionPackage,
    totals,
    assets,
    materials,
    parts,
    cutListReviewPolicy: {
      requiresFabricatorReview: true,
      requiresCncReview: true,
      requiresDesignerApproval: true,
      reason:
        "Generated cut-list rows, dimensions, material assignments, edge-banding, DXF layout, and shop drawing references require human fabrication review before CNC nesting or production release.",
    },
    artifacts: [
      {
        type: "project_cut_list_json",
        fileName: `${baseName}-cut-list.json`,
        durable: true,
        notes: "Project-level cut-list package with every generated fabrication part row across placed smart millwork assets.",
      },
      {
        type: "project_drawing_set_json",
        fileName: `${baseName}-drawing-set.json`,
        durable: true,
        notes: "Drawing set used to cross-check elevations, sections, plan footprints, and dimensions.",
      },
      {
        type: "project_revision_package_json",
        fileName: `${baseName}-revision-package.json`,
        durable: true,
        notes: "Revision package used to identify changed cut-list assumptions.",
      },
      {
        type: "project_cnc_batch_json",
        fileName: `${baseName}-cnc-batch.json`,
        durable: true,
        notes: "CNC batch package that uses cut-list part rows for DXF and machining review.",
      },
      {
        type: "project_fabrication_release_json",
        fileName: `${baseName}-fabrication-release.json`,
        durable: true,
        notes: "Fabrication release package that gates cut-list production readiness.",
      },
      {
        type: "project_rfq_json",
        fileName: `${baseName}-project-rfq.json`,
        durable: true,
        notes: "RFQ package used to request fabricator pricing for cut, edge, and machining work.",
      },
      ...assets.flatMap((asset) => [
        {
          type: "fabrication_dxf" as const,
          fileName: asset.fabricationDxfFileName,
          durable: false,
          notes: `Generated DXF cut-layout aid for ${asset.displayName}; fabricator review required.`,
        },
        {
          type: "shop_drawing_svg" as const,
          fileName: asset.shopDrawingFileName,
          durable: true,
          notes: `Generated shop drawing reference for ${asset.displayName}.`,
        },
        {
          type: "package_json" as const,
          fileName: `${fileSafeName(asset.displayName)}-${fileSafeName(asset.id)}-placed-package.json`,
          durable: true,
          notes: `Placed source package for ${asset.displayName} in ${asset.roomName}.`,
        },
      ]),
    ],
    assumptions: [
      "This package is a generated fabrication planning cut list, not approved CNC code or a released production order.",
      "Final nesting, grain direction, joinery, hardware drilling, tolerances, kerf, waste, sheet optimization, and machining remain fabricator responsibilities.",
      "Regenerate this cut list after any CabinetDefinition, placement, material, hardware, field verification, drawing, quote, revision, or fabrication release change.",
    ],
  };
}

export function buildCabinetProjectCutListPackageJson(input: {
  assets: PlacedCabinetAsset[];
  previousAssets?: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
  previousRoomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectCutListPackage(input), null, 2)}\n`;
}

export function buildCabinetProjectQuotePackage(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): CabinetProjectQuotePackage {
  const approvalPackage = buildCabinetProjectApprovalPackage(input);
  const schedule = approvalPackage.schedule;
  const procurementPackage = approvalPackage.procurementPackage;
  const fabricationReleasePackage = approvalPackage.fabricationReleasePackage;
  const placedPackages = input.assets.map((asset) => buildCabinetPlacedAssetPackage(asset));
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");
  const currency = placedPackages[0]?.documentation.quoteSummary.currency ?? "USD";

  const assets: CabinetProjectQuoteAssetSummary[] = placedPackages
    .map((pkg) => {
      const asset = pkg.placedAsset;
      const definition = pkg.cabinetDefinition;
      const documentation = pkg.documentation;
      const roomName =
        (asset.roomId ? input.roomNamesById?.[asset.roomId] : undefined) ??
        asset.roomId ??
        "Unassigned room";

      return {
        id: asset.id,
        roomId: asset.roomId,
        roomName,
        displayName: definition.name,
        assemblyType: pkg.millworkDefinition.assemblyType,
        sourceDefinitionId: definition.id,
        sourceDefinitionVersion: definition.version,
        categoryTotals: summarizeQuoteCategories(documentation.quoteSummary.lineItems),
        lineItemCount: documentation.quoteSummary.lineItems.length,
        estimatedTotal: roundMoney(documentation.quoteSummary.estimatedTotal),
        currency: documentation.quoteSummary.currency,
        assumptionsCount: documentation.quoteSummary.assumptions.length,
        supplierReadinessStatus: documentation.supplierReadiness.status,
        fabricationReleaseStatus: documentation.fabricationReleaseReadiness.status,
        customQuoteRequiredCount: documentation.supplierReadiness.customQuoteRequiredCount,
        updatedAt: asset.updatedAt,
      };
    })
    .sort((a, b) => a.roomName.localeCompare(b.roomName) || a.displayName.localeCompare(b.displayName));

  const roomMap = new Map<string, CabinetProjectQuoteRoomSummary>();
  for (const asset of assets) {
    const roomKey = asset.roomId ?? "__unassigned";
    const existing =
      roomMap.get(roomKey) ??
      {
        roomId: asset.roomId,
        roomName: asset.roomName,
        assetCount: 0,
        estimatedTotal: 0,
        currency: asset.currency,
      };

    existing.assetCount += 1;
    existing.estimatedTotal += asset.estimatedTotal;
    roomMap.set(roomKey, existing);
  }

  const rooms: CabinetProjectQuoteRoomSummary[] = Array.from(roomMap.values())
    .map((room) => ({
      ...room,
      estimatedTotal: roundMoney(room.estimatedTotal),
    }))
    .sort((a, b) => a.roomName.localeCompare(b.roomName));

  const allLineItems = placedPackages.flatMap((pkg) => pkg.documentation.quoteSummary.lineItems);
  const categoryTotals = summarizeQuoteCategories(allLineItems);
  const totals: CabinetProjectQuoteTotals = {
    assetCount: assets.length,
    roomCount: rooms.length,
    lineItemCount: allLineItems.length,
    materialCost: roundMoney(
      placedPackages.reduce((sum, pkg) => sum + pkg.documentation.quoteSummary.materialCost, 0)
    ),
    hardwareCost: roundMoney(
      placedPackages.reduce((sum, pkg) => sum + pkg.documentation.quoteSummary.hardwareCost, 0)
    ),
    fabricationCost: roundMoney(
      placedPackages.reduce((sum, pkg) => sum + pkg.documentation.quoteSummary.fabricationCost, 0)
    ),
    installationAllowance: roundMoney(
      placedPackages.reduce(
        (sum, pkg) => sum + pkg.documentation.quoteSummary.installationAllowance,
        0
      )
    ),
    contingency: roundMoney(
      placedPackages.reduce((sum, pkg) => sum + pkg.documentation.quoteSummary.contingency, 0)
    ),
    estimatedTotal: roundMoney(
      placedPackages.reduce((sum, pkg) => sum + pkg.documentation.quoteSummary.estimatedTotal, 0)
    ),
    customQuoteRequiredCount: schedule.totals.customQuoteRequiredCount,
    supplierMissingSkuCount: schedule.totals.supplierMissingSkuCount,
    releaseBlockerCount: schedule.totals.releaseBlockerCount,
    currency,
  };
  const quoteStatus: CabinetProjectQuotePackage["quoteStatus"] =
    totals.supplierMissingSkuCount > 0 || totals.customQuoteRequiredCount > 0
      ? "needs_supplier_quote"
      : approvalPackage.approvalStatus === "ready_for_signature" &&
          fabricationReleasePackage.status !== "blocked"
        ? "ready_for_client_review"
        : "draft_estimate";

  return {
    schema: "custom_millwork.project_quote.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    quoteStatus,
    schedule,
    procurementPackage,
    approvalPackage,
    fabricationReleasePackage,
    totals,
    categoryTotals,
    rooms,
    assets,
    artifacts: [
      {
        type: "project_quote_package_json",
        fileName: `${baseName}-project-quote.json`,
        durable: true,
        notes: "Project-level preliminary quote package with category, room, and asset totals.",
      },
      {
        type: "project_schedule_json",
        fileName: `${baseName}-millwork-schedule.json`,
        durable: true,
        notes: "Project schedule used as the quote source context.",
      },
      {
        type: "project_schedule_csv",
        fileName: `${baseName}-millwork-schedule.csv`,
        durable: true,
        notes: "Human-readable schedule for estimator review.",
      },
      {
        type: "project_finish_schedule_json",
        fileName: `${baseName}-finish-schedule.json`,
        durable: true,
        notes: "Project finish, material, hardware, and edge-banding schedule for review.",
      },
      {
        type: "project_revision_package_json",
        fileName: `${baseName}-revision-package.json`,
        durable: true,
        notes: "Revision package used to review quote deltas before client/fabricator signoff.",
      },
      {
        type: "project_drawing_set_json",
        fileName: `${baseName}-drawing-set.json`,
        durable: true,
        notes: "Project drawing set used for elevation, section, plan, and dimension review.",
      },
      {
        type: "project_cut_list_json",
        fileName: `${baseName}-cut-list.json`,
        durable: true,
        notes: "Project cut-list package used for fabrication part, material, and edge-banding review.",
      },
      {
        type: "project_procurement_json",
        fileName: `${baseName}-procurement.json`,
        durable: true,
        notes: "Supplier procurement package for mapped SKU and custom quote rows.",
      },
      {
        type: "project_purchase_readiness_json",
        fileName: `${baseName}-purchase-readiness.json`,
        durable: true,
        notes: "Purchase readiness package classifying mapped SKU candidates and quote-required rows.",
      },
      {
        type: "project_fabrication_release_json",
        fileName: `${baseName}-fabrication-release.json`,
        durable: true,
        notes: "Fabrication release controls that gate quote-to-production handoff.",
      },
      {
        type: "project_approval_package_json",
        fileName: `${baseName}-approval-package.json`,
        durable: true,
        notes: "Approval package used before client/fabricator signoff.",
      },
      {
        type: "project_rfq_json",
        fileName: `${baseName}-project-rfq.json`,
        durable: true,
        notes: "RFQ package needed to convert preliminary rows into confirmed pricing.",
      },
      {
        type: "project_cnc_batch_json",
        fileName: `${baseName}-cnc-batch.json`,
        durable: true,
        notes: "CNC/fabrication batch manifest for fabrication review.",
      },
      {
        type: "project_installation_plan_json",
        fileName: `${baseName}-installation-plan.json`,
        durable: true,
        notes: "Installation planning package for sequencing and installer handoff.",
      },
      ...assets.map((asset) => ({
        type: "package_json" as const,
        fileName: `${fileSafeName(asset.displayName)}-${fileSafeName(asset.id)}-placed-package.json`,
        durable: true,
        notes: `Placed source package for ${asset.displayName} in ${asset.roomName}.`,
      })),
    ],
    assumptions: [
      "Quote totals are preliminary estimates generated from the editable CabinetDefinition data for each placed asset.",
      "Mapped material and hardware SKUs still require supplier availability, finish, lead-time, and pricing confirmation.",
      "Fabrication, finishing, delivery, installation, field verification, and site-condition pricing require fabricator or installer quote approval.",
      "Regenerate this quote package after any design, room, transform, material, hardware, supplier, or approval change.",
    ],
    disclaimer: `${CABINET_PLANNING_ESTIMATE_DISCLAIMER} This generated project quote package is not an invoice or construction contract. Final pricing requires supplier, fabricator, installer, designer, and client approval.`,
  };
}

export function buildCabinetProjectQuotePackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectQuotePackage(input), null, 2)}\n`;
}

export function buildCabinetProjectPurchaseReadinessPackage(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): CabinetProjectPurchaseReadinessPackage {
  const quotePackage = buildCabinetProjectQuotePackage(input);
  const schedule = quotePackage.schedule;
  const procurementPackage = quotePackage.procurementPackage;
  const approvalPackage = quotePackage.approvalPackage;
  const fabricationReleasePackage = quotePackage.fabricationReleasePackage;
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");

  const lineItems: CabinetProjectPurchaseReadinessLineItem[] = procurementPackage.lineItems
    .map((item) => {
      const checkoutCandidate =
        item.status === "mapped" &&
        (item.sourceType === "material" || item.sourceType === "hardware");
      const purchaseAction: CabinetProjectPurchaseReadinessLineItem["purchaseAction"] =
        approvalPackage.approvalStatus === "blocked" ||
        fabricationReleasePackage.status === "blocked"
          ? "hold_for_approval"
          : checkoutCandidate
            ? "supplier_catalog_candidate"
            : item.status === "custom_quote_required"
              ? "requires_custom_quote"
              : "requires_supplier_mapping";

      return {
        id: `purchase:${item.id}`,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        displayName: item.displayName,
        supplierName: item.supplierName,
        skuId: item.skuId,
        procurementStatus: item.status,
        purchaseAction,
        checkoutEligible: false,
        quantity: item.quantity,
        unit: item.unit,
        estimatedCost: item.estimatedCost,
        assetIds: item.assetIds,
        roomNames: item.roomNames,
        assemblyTypes: item.assemblyTypes,
        notes:
          purchaseAction === "supplier_catalog_candidate"
            ? "Mapped SKU candidate for future supplier catalog checkout after quote and approval gates are connected."
            : item.notes,
      };
    })
    .sort(
      (a, b) =>
        a.purchaseAction.localeCompare(b.purchaseAction) ||
        a.supplierName.localeCompare(b.supplierName) ||
        a.displayName.localeCompare(b.displayName)
    );

  const assetSummaries: CabinetProjectPurchaseReadinessAssetSummary[] = schedule.assets
    .map((asset) => {
      const assetLineItems = lineItems.filter((item) => item.assetIds.includes(asset.id));
      const checkoutCandidateItems = assetLineItems.filter(
        (item) => item.purchaseAction === "supplier_catalog_candidate"
      );
      const customQuoteItems = assetLineItems.filter(
        (item) => item.purchaseAction === "requires_custom_quote"
      );

      return {
        id: asset.id,
        roomId: asset.roomId,
        roomName: asset.roomName,
        displayName: asset.displayName,
        assemblyType: asset.assemblyType,
        checkoutCandidateCount: checkoutCandidateItems.length,
        quoteRequiredCount: customQuoteItems.length,
        estimatedCatalogSubtotal: roundMoney(
          checkoutCandidateItems.reduce((sum, item) => sum + item.estimatedCost, 0)
        ),
        estimatedCustomQuoteSubtotal: roundMoney(
          customQuoteItems.reduce((sum, item) => sum + item.estimatedCost, 0)
        ),
        supplierReadinessStatus: asset.supplierReadinessStatus,
        fabricationReleaseStatus: asset.fabricationReleaseStatus,
        updatedAt: asset.updatedAt,
      };
    })
    .sort((a, b) => a.roomName.localeCompare(b.roomName) || a.displayName.localeCompare(b.displayName));

  const sumByAction = (action: CabinetProjectPurchaseReadinessLineItem["purchaseAction"]) =>
    lineItems
      .filter((item) => item.purchaseAction === action)
      .reduce((sum, item) => sum + item.estimatedCost, 0);
  const totals: CabinetProjectPurchaseReadinessTotals = {
    assetCount: schedule.totals.assetCount,
    roomCount: schedule.totals.roomCount,
    lineCount: lineItems.length,
    checkoutCandidateCount: lineItems.filter(
      (item) => item.purchaseAction === "supplier_catalog_candidate"
    ).length,
    supplierMappingRequiredCount: lineItems.filter(
      (item) => item.purchaseAction === "requires_supplier_mapping"
    ).length,
    customQuoteRequiredCount: lineItems.filter(
      (item) => item.purchaseAction === "requires_custom_quote"
    ).length,
    holdForApprovalCount: lineItems.filter(
      (item) => item.purchaseAction === "hold_for_approval"
    ).length,
    estimatedCatalogSubtotal: roundMoney(sumByAction("supplier_catalog_candidate")),
    estimatedCustomQuoteSubtotal: roundMoney(sumByAction("requires_custom_quote")),
    estimatedPurchaseSubtotal: roundMoney(procurementPackage.totals.estimatedTotal),
    estimatedProjectQuoteTotal: roundMoney(quotePackage.totals.estimatedTotal),
    currency: quotePackage.totals.currency,
  };
  const purchaseReadiness: CabinetProjectPurchaseReadinessPackage["purchaseReadiness"] =
    totals.holdForApprovalCount > 0 ||
    quotePackage.totals.releaseBlockerCount > 0 ||
    quotePackage.totals.supplierMissingSkuCount > 0
      ? "blocked"
      : totals.customQuoteRequiredCount > 0 ||
          totals.supplierMappingRequiredCount > 0 ||
          quotePackage.quoteStatus === "needs_supplier_quote"
        ? "needs_quote"
        : "ready_for_purchase_review";
  const canIssuePurchaseOrder =
    purchaseReadiness === "ready_for_purchase_review" &&
    approvalPackage.approvalStatus === "ready_for_signature" &&
    fabricationReleasePackage.canIssuePurchaseOrder;
  const nextActions = [
    totals.supplierMappingRequiredCount > 0
      ? "Complete missing supplier SKU mappings before purchase review."
      : undefined,
    totals.customQuoteRequiredCount > 0
      ? "Convert custom fabrication and installation rows into approved supplier/fabricator quote lines."
      : undefined,
    approvalPackage.approvalStatus !== "ready_for_signature"
      ? "Complete approval package signoff before issuing purchase orders."
      : undefined,
    fabricationReleasePackage.canIssuePurchaseOrder
      ? undefined
      : "Do not issue purchase orders until fabrication release and quote approval gates are cleared.",
    purchaseReadiness === "ready_for_purchase_review"
      ? "Review mapped SKU candidates with supplier availability and final pricing before checkout integration."
      : undefined,
  ].filter((item): item is string => Boolean(item));

  return {
    schema: "custom_millwork.project_purchase_readiness.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    purchaseReadiness,
    canCreateCheckout: false,
    canIssuePurchaseOrder,
    schedule,
    procurementPackage,
    quotePackage,
    approvalPackage,
    fabricationReleasePackage,
    totals,
    lineItems,
    assets: assetSummaries,
    checkoutPolicy: {
      includeInCheckout: false,
      reason:
        "Custom millwork remains a smart design-to-build asset; mapped SKU rows are purchase candidates only after supplier availability, quote approval, and signoff gates are connected.",
    },
    nextActions,
    artifacts: [
      {
        type: "project_purchase_readiness_json",
        fileName: `${baseName}-purchase-readiness.json`,
        durable: true,
        notes: "Project-level purchase readiness package for future supplier catalog and PO handoff.",
      },
      {
        type: "project_procurement_json",
        fileName: `${baseName}-procurement.json`,
        durable: true,
        notes: "Procurement rows used to classify mapped SKU and custom quote purchase actions.",
      },
      {
        type: "project_finish_schedule_json",
        fileName: `${baseName}-finish-schedule.json`,
        durable: true,
        notes: "Finish schedule used for material, hardware, SKU, and supplier review.",
      },
      {
        type: "project_cut_list_json",
        fileName: `${baseName}-cut-list.json`,
        durable: true,
        notes: "Project cut-list package used to review fabrication part rows before purchase authorization.",
      },
      {
        type: "project_revision_package_json",
        fileName: `${baseName}-revision-package.json`,
        durable: true,
        notes: "Revision package used to classify changed purchase candidates and custom quote rows.",
      },
      {
        type: "project_quote_package_json",
        fileName: `${baseName}-project-quote.json`,
        durable: true,
        notes: "Project quote package with preliminary totals and quote status.",
      },
      {
        type: "project_approval_package_json",
        fileName: `${baseName}-approval-package.json`,
        durable: true,
        notes: "Approval gates required before purchase authorization.",
      },
      {
        type: "project_field_verification_json",
        fileName: `${baseName}-field-verification.json`,
        durable: true,
        notes: "Field verification package required before purchase authorization.",
      },
      {
        type: "project_fabrication_release_json",
        fileName: `${baseName}-fabrication-release.json`,
        durable: true,
        notes: "Fabrication release controls that gate purchase order issuance.",
      },
      {
        type: "project_rfq_json",
        fileName: `${baseName}-project-rfq.json`,
        durable: true,
        notes: "RFQ package needed to confirm custom quote rows.",
      },
      ...schedule.assets.map((asset) => ({
        type: "package_json" as const,
        fileName: `${fileSafeName(asset.displayName)}-${fileSafeName(asset.id)}-placed-package.json`,
        durable: true,
        notes: `Placed source package for ${asset.displayName} in ${asset.roomName}.`,
      })),
    ],
    assumptions: [
      "Purchase readiness is a planning artifact, not an order, checkout session, or supplier authorization.",
      "Mapped SKU rows require live supplier availability, lead-time, tax, freight, finish, and pricing confirmation before checkout.",
      "Custom quote rows require approved supplier, fabricator, or installer pricing before purchase approval.",
      "Regenerate this package after any design, quote, approval, procurement, supplier mapping, or room edit.",
    ],
  };
}

export function buildCabinetProjectPurchaseReadinessPackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectPurchaseReadinessPackage(input), null, 2)}\n`;
}

export function buildCabinetProjectFabricationReleasePackage(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): CabinetProjectFabricationReleasePackage {
  const schedule = buildCabinetProjectSchedulePackage(input);
  const procurementPackage = buildCabinetProjectProcurementPackage(input);
  const quoteRequest = buildCabinetProjectFabricationQuoteRequest(input);
  const placedPackages = input.assets.map((asset) => buildCabinetPlacedAssetPackage(asset));
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");

  const assets: CabinetProjectFabricationReleaseAssetSummary[] = placedPackages
    .map((pkg) => {
      const asset = pkg.placedAsset;
      const definition = pkg.cabinetDefinition;
      const documentation = pkg.documentation;
      const roomName =
        (asset.roomId ? input.roomNamesById?.[asset.roomId] : undefined) ??
        asset.roomId ??
        "Unassigned room";
      const edgeBandingTotalM = roundM(
        documentation.edgeBandingSchedule.reduce((sum, item) => sum + item.totalLengthM, 0)
      );

      return {
        id: asset.id,
        roomId: asset.roomId,
        roomName,
        displayName: definition.name,
        assemblyType: pkg.millworkDefinition.assemblyType,
        sourceDefinitionId: definition.id,
        sourceDefinitionVersion: definition.version,
        releaseStatus: documentation.fabricationReleaseReadiness.status,
        releaseBlockerCount: documentation.fabricationReleaseReadiness.blockerCount,
        requiredGateCount: documentation.fabricationReleaseReadiness.requiredGateCount,
        fabricationReleaseGateCount:
          documentation.fabricationReleaseReadiness.fabricationReleaseGateCount,
        installationGateCount: documentation.fabricationReleaseReadiness.installationGateCount,
        supplierMissingSkuCount: documentation.fabricationReleaseReadiness.supplierMissingSkuCount,
        customQuoteRequiredCount: documentation.fabricationReleaseReadiness.customQuoteRequiredCount,
        cutListCount: documentation.cutList.length,
        edgeBandingTotalM,
        drawingViewCount: documentation.drawingViewSchedule.length,
        installerNoteCount: documentation.installerNotes.length,
        placedPackageFileName: buildCabinetPlacedAssetPackageFileName(asset),
        installerWorkOrderFileName: buildCabinetPlacedAssetInstallerWorkOrderFileName(asset),
        shopDrawingFileName: `${fileSafeName(definition.name)}-shop-drawing.svg`,
        fabricationDxfFileName: `${fileSafeName(definition.name)}-cut-layout.dxf`,
        updatedAt: asset.updatedAt,
      };
    })
    .sort((a, b) => a.roomName.localeCompare(b.roomName) || a.displayName.localeCompare(b.displayName));

  const totals: CabinetProjectFabricationReleaseTotals = {
    assetCount: assets.length,
    readyForReleaseCount: assets.filter((asset) => asset.releaseStatus === "ready_for_release").length,
    needsReviewCount: assets.filter((asset) => asset.releaseStatus === "needs_review").length,
    blockedCount: assets.filter((asset) => asset.releaseStatus === "blocked").length,
    requiredGateCount: assets.reduce((sum, asset) => sum + asset.requiredGateCount, 0),
    releaseBlockerCount: assets.reduce((sum, asset) => sum + asset.releaseBlockerCount, 0),
    fabricationReleaseGateCount: assets.reduce(
      (sum, asset) => sum + asset.fabricationReleaseGateCount,
      0
    ),
    installationGateCount: assets.reduce((sum, asset) => sum + asset.installationGateCount, 0),
    supplierMissingSkuCount: assets.reduce((sum, asset) => sum + asset.supplierMissingSkuCount, 0),
    customQuoteRequiredCount: assets.reduce((sum, asset) => sum + asset.customQuoteRequiredCount, 0),
    cutListCount: assets.reduce((sum, asset) => sum + asset.cutListCount, 0),
    edgeBandingTotalM: roundM(assets.reduce((sum, asset) => sum + asset.edgeBandingTotalM, 0)),
  };
  const status: CabinetProjectFabricationReleasePackage["status"] =
    totals.blockedCount > 0 || totals.releaseBlockerCount > 0 || totals.supplierMissingSkuCount > 0
      ? "blocked"
      : totals.needsReviewCount > 0 ||
          totals.requiredGateCount > 0 ||
          totals.customQuoteRequiredCount > 0
        ? "needs_review"
        : "ready_for_release";
  const canReleaseToFabrication = status === "ready_for_release";
  const canIssuePurchaseOrder =
    canReleaseToFabrication &&
    totals.customQuoteRequiredCount === 0 &&
    procurementPackage.totals.customQuoteRequiredCount === 0;
  const nextActions = [
    totals.supplierMissingSkuCount > 0
      ? "Resolve missing supplier SKU mappings before fabrication release."
      : undefined,
    totals.customQuoteRequiredCount > 0
      ? "Replace fabrication and installation custom quote rows with approved supplier/fabricator pricing."
      : undefined,
    totals.requiredGateCount > 0
      ? "Complete required field verification, client approval, shop drawing review, cut-list/DXF review, quote approval, and install coordination gates."
      : undefined,
    totals.releaseBlockerCount > 0
      ? "Clear generated release blockers before issuing fabrication authorization."
      : undefined,
    canReleaseToFabrication
      ? "Issue fabrication release only after human approval confirms all generated package assumptions."
      : undefined,
  ].filter((item): item is string => Boolean(item));

  return {
    schema: "custom_millwork.project_fabrication_release.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    status,
    canReleaseToFabrication,
    canIssuePurchaseOrder,
    schedule,
    procurementPackage,
    quoteRequest,
    totals,
    assets,
    releaseDecision: {
      requiresHumanApproval: true,
      reason: canReleaseToFabrication
        ? "Generated checks show no blockers, but fabrication release still requires explicit designer/client/fabricator approval."
        : "Generated release gates, custom quote rows, or supplier checks still need review before fabrication authorization.",
      nextActions,
    },
    artifacts: [
      {
        type: "project_fabrication_release_json",
        fileName: `${baseName}-fabrication-release.json`,
        durable: true,
        notes: "Project-level fabrication release control package.",
      },
      {
        type: "project_schedule_json",
        fileName: `${baseName}-millwork-schedule.json`,
        durable: true,
        notes: "Project schedule used for room and placed asset context.",
      },
      {
        type: "project_procurement_json",
        fileName: `${baseName}-procurement.json`,
        durable: true,
        notes: "Supplier procurement package used for SKU and custom quote readiness.",
      },
      {
        type: "project_finish_schedule_json",
        fileName: `${baseName}-finish-schedule.json`,
        durable: true,
        notes: "Finish schedule used to review material, hardware, and edge-banding selections before release.",
      },
      {
        type: "project_revision_package_json",
        fileName: `${baseName}-revision-package.json`,
        durable: true,
        notes: "Revision package used to review changed assets before fabrication release.",
      },
      {
        type: "project_drawing_set_json",
        fileName: `${baseName}-drawing-set.json`,
        durable: true,
        notes: "Project drawing set used for shop drawing review before fabrication release.",
      },
      {
        type: "project_cut_list_json",
        fileName: `${baseName}-cut-list.json`,
        durable: true,
        notes: "Project cut-list package used to review fabrication part rows, material summaries, and edge-banding totals before release.",
      },
      {
        type: "project_quote_package_json",
        fileName: `${baseName}-project-quote.json`,
        durable: true,
        notes: "Project quote package used for preliminary estimate review.",
      },
      {
        type: "project_purchase_readiness_json",
        fileName: `${baseName}-purchase-readiness.json`,
        durable: true,
        notes: "Purchase readiness package used to gate future checkout and purchase order handoff.",
      },
      {
        type: "project_field_verification_json",
        fileName: `${baseName}-field-verification.json`,
        durable: true,
        notes: "Field verification package required before fabrication release.",
      },
      {
        type: "project_rfq_json",
        fileName: `${baseName}-project-rfq.json`,
        durable: true,
        notes: "Project RFQ needed before final quote approval.",
      },
      {
        type: "project_installation_plan_json",
        fileName: `${baseName}-installation-plan.json`,
        durable: true,
        notes: "Project installation plan for room sequencing and installer work order references.",
      },
      {
        type: "project_cnc_batch_json",
        fileName: `${baseName}-cnc-batch.json`,
        durable: true,
        notes: "Project CNC batch manifest aggregating DXF, cut-list, material, and edge-banding data.",
      },
      {
        type: "project_approval_package_json",
        fileName: `${baseName}-approval-package.json`,
        durable: true,
        notes: "Project approval and submittal package with signoff gates by owner.",
      },
      ...assets.flatMap((asset) => [
        {
          type: "package_json" as const,
          fileName: asset.placedPackageFileName,
          durable: true,
          notes: `Placed source package for ${asset.displayName} in ${asset.roomName}.`,
        },
        {
          type: "installer_work_order_json" as const,
          fileName: asset.installerWorkOrderFileName,
          durable: true,
          notes: `Installer work order for ${asset.displayName} in ${asset.roomName}.`,
        },
        {
          type: "shop_drawing_svg" as const,
          fileName: asset.shopDrawingFileName,
          durable: true,
          notes: `Generated shop drawing reference for ${asset.displayName}.`,
        },
        {
          type: "fabrication_dxf" as const,
          fileName: asset.fabricationDxfFileName,
          durable: false,
          notes: `Generated DXF cut-layout aid for ${asset.displayName}; fabricator review is required.`,
        },
      ]),
    ],
    assumptions: [
      "This package is a fabrication release control document, not an automatic approval.",
      "Final release still requires field verification, client approval, supplier confirmation, quote approval, shop drawing review, and fabricator sign-off.",
      "Generated DXF files are layout aids; machining, nesting, grain, joinery, and tolerances remain fabricator responsibilities.",
      "CabinetDefinition remains the editable source of truth and release packages should be regenerated after any design or placement edit.",
    ],
  };
}

export function buildCabinetProjectFabricationReleasePackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectFabricationReleasePackage(input), null, 2)}\n`;
}

export function buildCabinetProjectInstallationPlanPackage(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): CabinetProjectInstallationPlanPackage {
  const schedule = buildCabinetProjectSchedulePackage(input);
  const fabricationReleasePackage = buildCabinetProjectFabricationReleasePackage(input);
  const placedPackages = input.assets.map((asset) => buildCabinetPlacedAssetPackage(asset));
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");

  const assets = placedPackages
    .map((pkg) => {
      const asset = pkg.placedAsset;
      const definition = pkg.cabinetDefinition;
      const documentation = pkg.documentation;
      const roomName =
        (asset.roomId ? input.roomNamesById?.[asset.roomId] : undefined) ??
        asset.roomId ??
        "Unassigned room";
      const installerWorkOrder = buildCabinetPlacedAssetInstallerWorkOrder(asset, { roomName });
      const installationGateCount = documentation.releaseChecklist.filter(
        (item) => item.dueBefore === "installation"
      ).length;
      const requiredGateCount = documentation.releaseChecklist.filter(
        (item) => item.status === "required"
      ).length;
      const fieldVerifyNoteCount = documentation.installerNotes.filter(
        (item) => item.severity === "field_verify"
      ).length;
      const coordinationNoteCount = documentation.installerNotes.filter(
        (item) => item.severity === "coordination"
      ).length;
      const estimatedInstallHours = roundM(
        2 +
          definition.modules.length * 0.75 +
          (installerWorkOrder.installationScope.wallMountedOrTall ? 1.5 : 0) +
          (installerWorkOrder.installationScope.serviceCoordinationRequired ? 1 : 0)
      );

      return {
        id: asset.id,
        roomId: asset.roomId,
        roomName,
        displayName: definition.name,
        assemblyType: pkg.millworkDefinition.assemblyType,
        sourceDefinitionId: definition.id,
        sourceDefinitionVersion: definition.version,
        installSequence: 0,
        dimensions: installerWorkOrder.dimensions,
        siteTransform: installerWorkOrder.siteTransform,
        wallMountedOrTall: installerWorkOrder.installationScope.wallMountedOrTall,
        requiresAnchoringReview: installerWorkOrder.installationScope.requiresAnchoringReview,
        serviceCoordinationRequired: installerWorkOrder.installationScope.serviceCoordinationRequired,
        releaseStatus: installerWorkOrder.installationScope.releaseStatus,
        releaseBlockerCount: installerWorkOrder.installationScope.releaseBlockerCount,
        requiredGateCount,
        installationGateCount,
        installerNoteCount: documentation.installerNotes.length,
        fieldVerifyNoteCount,
        coordinationNoteCount,
        estimatedInstallHours,
        placedPackageFileName: buildCabinetPlacedAssetPackageFileName(asset),
        installerWorkOrderFileName: buildCabinetPlacedAssetInstallerWorkOrderFileName(asset),
        updatedAt: asset.updatedAt,
      };
    })
    .sort((a, b) => a.roomName.localeCompare(b.roomName) || a.displayName.localeCompare(b.displayName))
    .map((asset, index) => ({
      ...asset,
      installSequence: index + 1,
    })) satisfies CabinetProjectInstallationAssetPlan[];

  const roomMap = new Map<string, CabinetProjectInstallationRoomPlan>();
  for (const asset of assets) {
    const roomKey = asset.roomId ?? "__unassigned";
    const existing =
      roomMap.get(roomKey) ??
      {
        roomId: asset.roomId,
        roomName: asset.roomName,
        installSequence: 0,
        assetCount: 0,
        assetIds: [],
        assemblyTypes: [],
        installerWorkOrderFileNames: [],
        requiredGateCount: 0,
        installationGateCount: 0,
        releaseBlockerCount: 0,
        anchoringReviewCount: 0,
        serviceCoordinationCount: 0,
        installerNoteCount: 0,
        estimatedInstallHours: 0,
      };

    existing.assetCount += 1;
    existing.assetIds.push(asset.id);
    if (!existing.assemblyTypes.includes(asset.assemblyType)) {
      existing.assemblyTypes.push(asset.assemblyType);
    }
    existing.installerWorkOrderFileNames.push(asset.installerWorkOrderFileName);
    existing.requiredGateCount += asset.requiredGateCount;
    existing.installationGateCount += asset.installationGateCount;
    existing.releaseBlockerCount += asset.releaseBlockerCount;
    existing.anchoringReviewCount += asset.requiresAnchoringReview ? 1 : 0;
    existing.serviceCoordinationCount += asset.serviceCoordinationRequired ? 1 : 0;
    existing.installerNoteCount += asset.installerNoteCount;
    existing.estimatedInstallHours += asset.estimatedInstallHours;
    roomMap.set(roomKey, existing);
  }

  const rooms = Array.from(roomMap.values())
    .sort((a, b) => a.roomName.localeCompare(b.roomName))
    .map((room, index) => ({
      ...room,
      installSequence: index + 1,
      assetIds: [...room.assetIds].sort(),
      assemblyTypes: [...room.assemblyTypes].sort(),
      installerWorkOrderFileNames: [...room.installerWorkOrderFileNames].sort(),
      estimatedInstallHours: roundM(room.estimatedInstallHours),
    }));

  const totals: CabinetProjectInstallationTotals = {
    roomCount: rooms.length,
    assetCount: assets.length,
    installerWorkOrderCount: assets.length,
    requiredGateCount: assets.reduce((sum, asset) => sum + asset.requiredGateCount, 0),
    installationGateCount: assets.reduce((sum, asset) => sum + asset.installationGateCount, 0),
    releaseBlockerCount: assets.reduce((sum, asset) => sum + asset.releaseBlockerCount, 0),
    anchoringReviewCount: assets.filter((asset) => asset.requiresAnchoringReview).length,
    serviceCoordinationCount: assets.filter((asset) => asset.serviceCoordinationRequired).length,
    fieldVerifyNoteCount: assets.reduce((sum, asset) => sum + asset.fieldVerifyNoteCount, 0),
    coordinationNoteCount: assets.reduce((sum, asset) => sum + asset.coordinationNoteCount, 0),
    estimatedInstallHours: roundM(
      assets.reduce((sum, asset) => sum + asset.estimatedInstallHours, 0)
    ),
  };
  const installationReadiness: CabinetProjectInstallationPlanPackage["installationReadiness"] =
    fabricationReleasePackage.status === "blocked" || totals.releaseBlockerCount > 0
      ? "blocked"
      : fabricationReleasePackage.status !== "ready_for_release" || totals.requiredGateCount > 0
        ? "needs_review"
        : "ready_for_install";

  return {
    schema: "custom_millwork.project_installation_plan.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    installationReadiness,
    schedule,
    fabricationReleasePackage,
    rooms,
    assets,
    totals,
    sequencingNotes: [
      "Install sequence is generated by room and asset name for planning only; confirm actual sequencing with site access, delivery path, flooring protection, and trade coordination.",
      "Wall-mounted, tall, wardrobe, and service-adjacent assemblies require anchoring or service coordination review before installation.",
      "Use each installer work order for placed transform, field verification notes, and release checklist context.",
    ],
    artifacts: [
      {
        type: "project_installation_plan_json",
        fileName: `${baseName}-installation-plan.json`,
        durable: true,
        notes: "Project-level installation plan for placed custom millwork assets.",
      },
      {
        type: "project_fabrication_release_json",
        fileName: `${baseName}-fabrication-release.json`,
        durable: true,
        notes: "Fabrication release control package used to determine installation readiness.",
      },
      {
        type: "project_schedule_json",
        fileName: `${baseName}-millwork-schedule.json`,
        durable: true,
        notes: "Project room and asset schedule.",
      },
      {
        type: "project_finish_schedule_json",
        fileName: `${baseName}-finish-schedule.json`,
        durable: true,
        notes: "Finish schedule used for material, hardware, and edge-banding installation review.",
      },
      {
        type: "project_revision_package_json",
        fileName: `${baseName}-revision-package.json`,
        durable: true,
        notes: "Revision package used to review placement, room, and installation-sequence changes.",
      },
      {
        type: "project_drawing_set_json",
        fileName: `${baseName}-drawing-set.json`,
        durable: true,
        notes: "Project drawing set used for installation dimension and placement review.",
      },
      {
        type: "project_field_verification_json",
        fileName: `${baseName}-field-verification.json`,
        durable: true,
        notes: "Field verification checklist for site measurement and placement checks.",
      },
      ...assets.flatMap((asset) => [
        {
          type: "installer_work_order_json" as const,
          fileName: asset.installerWorkOrderFileName,
          durable: true,
          notes: `Installer work order for ${asset.displayName} in ${asset.roomName}.`,
        },
        {
          type: "package_json" as const,
          fileName: asset.placedPackageFileName,
          durable: true,
          notes: `Placed source package for ${asset.displayName} in ${asset.roomName}.`,
        },
      ]),
    ],
    assumptions: [
      "This package is an installation planning handoff, not a confirmed installer schedule.",
      "Final installation sequencing requires site access review, delivery confirmation, protection plan, trade coordination, and installer approval.",
      "CabinetDefinition remains the editable source of truth and installation plans should be regenerated after design or placement edits.",
    ],
  };
}

export function buildCabinetProjectInstallationPlanPackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectInstallationPlanPackage(input), null, 2)}\n`;
}

function fieldVerificationScopeForReleasePhase(
  phase: CabinetReleaseChecklistItem["phase"]
): CabinetProjectFieldVerificationChecklistItem["scope"] {
  if (phase === "site_verification") return "site_measurement";
  if (phase === "installation_coordination") return "access";
  if (phase === "supplier_procurement") return "service_coordination";
  if (phase === "fabrication_review") return "clearance";
  return "wall_floor_ceiling";
}

export function buildCabinetProjectFieldVerificationPackage(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): CabinetProjectFieldVerificationPackage {
  const installationPlanPackage = buildCabinetProjectInstallationPlanPackage(input);
  const schedule = installationPlanPackage.schedule;
  const fabricationReleasePackage = installationPlanPackage.fabricationReleasePackage;
  const placedPackages = input.assets.map((asset) => buildCabinetPlacedAssetPackage(asset));
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");
  const checklist: CabinetProjectFieldVerificationChecklistItem[] = [];

  const assets: CabinetProjectFieldVerificationAssetSummary[] = placedPackages
    .map((pkg) => {
      const asset = pkg.placedAsset;
      const definition = pkg.cabinetDefinition;
      const documentation = pkg.documentation;
      const roomName =
        (asset.roomId ? input.roomNamesById?.[asset.roomId] : undefined) ??
        asset.roomId ??
        "Unassigned room";
      const installerWorkOrder = buildCabinetPlacedAssetInstallerWorkOrder(asset, { roomName });
      const fieldVerifyNotes = documentation.installerNotes.filter(
        (item) => item.severity === "field_verify"
      );
      const coordinationNotes = documentation.installerNotes.filter(
        (item) => item.severity === "coordination"
      );
      const releaseBlockerCount = documentation.fabricationReleaseReadiness.blockerCount;

      checklist.push(
        {
          id: `field:${asset.id}:finished-opening`,
          assetId: asset.id,
          roomId: asset.roomId,
          roomName,
          displayName: definition.name,
          scope: "site_measurement",
          owner: "designer",
          status: "required",
          dueBefore: "fabrication_release",
          label: "Measure finished opening and adjacent site conditions",
          relatedArtifactTypes: ["project_schedule_json", "installer_work_order_json"],
          notes: `Confirm finished width, height, depth, wall plumb, floor level, and ceiling clearance against ${definition.totalWidth}x${definition.height}x${definition.depth} mm source dimensions.`,
        },
        {
          id: `field:${asset.id}:placed-transform`,
          assetId: asset.id,
          roomId: asset.roomId,
          roomName,
          displayName: definition.name,
          scope: "placement",
          owner: "designer",
          status: "required",
          dueBefore: "fabrication_release",
          label: "Verify placed plan position and rotation",
          relatedArtifactTypes: ["project_schedule_json", "project_installation_plan_json"],
          notes: `Confirm house-plan placement at ${installerWorkOrder.siteTransform.position.join(", ")} m and rotation ${installerWorkOrder.siteTransform.rotation.join(", ")} rad before release.`,
        },
        {
          id: `field:${asset.id}:clearance-and-access`,
          assetId: asset.id,
          roomId: asset.roomId,
          roomName,
          displayName: definition.name,
          scope: "clearance",
          owner: "installer",
          status: "required",
          dueBefore: "installation",
          label: "Confirm delivery, installation, door/drawer, and service clearances",
          relatedArtifactTypes: ["project_installation_plan_json", "installer_work_order_json"],
          notes:
            "Confirm access path, appliance conflicts, door/drawer swing, service penetrations, flooring protection, and installation staging before fabrication release.",
        }
      );

      if (installerWorkOrder.installationScope.requiresAnchoringReview) {
        checklist.push({
          id: `field:${asset.id}:anchoring-review`,
          assetId: asset.id,
          roomId: asset.roomId,
          roomName,
          displayName: definition.name,
          scope: "anchoring",
          owner: "installer",
          status: "required",
          dueBefore: "fabrication_release",
          label: "Verify wall/floor anchoring substrate",
          relatedArtifactTypes: ["installer_work_order_json", "project_installation_plan_json"],
          notes:
            "Confirm stud, masonry, backing, floor, and anti-tip anchoring conditions before fabrication and installation.",
        });
      }

      for (const note of [...fieldVerifyNotes, ...coordinationNotes]) {
        checklist.push({
          id: `field:${asset.id}:${note.id}`,
          assetId: asset.id,
          roomId: asset.roomId,
          roomName,
          displayName: definition.name,
          scope: note.severity === "field_verify" ? "wall_floor_ceiling" : "service_coordination",
          owner: note.severity === "field_verify" ? "designer" : "installer",
          status: note.severity === "field_verify" ? "required" : "recommended",
          dueBefore: note.severity === "field_verify" ? "fabrication_release" : "installation",
          label: note.category,
          sourceNoteId: note.id,
          relatedArtifactTypes: ["installer_work_order_json", "project_field_verification_json"],
          notes: note.message,
        });
      }

      for (const item of documentation.releaseChecklist.filter(
        (releaseItem) =>
          releaseItem.phase === "site_verification" ||
          releaseItem.phase === "installation_coordination"
      )) {
        checklist.push({
          id: `field:${asset.id}:${item.id}`,
          assetId: asset.id,
          roomId: asset.roomId,
          roomName,
          displayName: definition.name,
          scope: fieldVerificationScopeForReleasePhase(item.phase),
          owner:
            item.owner === "fabricator" || item.owner === "installer"
              ? item.owner
              : item.owner === "client" || item.owner === "supplier"
                ? "designer"
                : item.owner,
          status: item.status === "recommended" ? "recommended" : "required",
          dueBefore: item.dueBefore,
          label: item.label,
          relatedArtifactTypes: item.relatedArtifactTypes ?? [
            "project_field_verification_json",
            "installer_work_order_json",
          ],
          notes: item.notes,
        });
      }

      const assetChecks = checklist.filter((item) => item.assetId === asset.id);
      return {
        id: asset.id,
        roomId: asset.roomId,
        roomName,
        displayName: definition.name,
        assemblyType: pkg.millworkDefinition.assemblyType,
        sourceDefinitionId: definition.id,
        sourceDefinitionVersion: definition.version,
        dimensions: installerWorkOrder.dimensions,
        siteTransform: installerWorkOrder.siteTransform,
        requiredCheckCount: assetChecks.filter((item) => item.status === "required").length,
        recommendedCheckCount: assetChecks.filter((item) => item.status === "recommended").length,
        fieldVerifyNoteCount: fieldVerifyNotes.length,
        coordinationNoteCount: coordinationNotes.length,
        releaseStatus: documentation.fabricationReleaseReadiness.status,
        releaseBlockerCount,
        placedPackageFileName: buildCabinetPlacedAssetPackageFileName(asset),
        installerWorkOrderFileName: buildCabinetPlacedAssetInstallerWorkOrderFileName(asset),
        updatedAt: asset.updatedAt,
      };
    })
    .sort((a, b) => a.roomName.localeCompare(b.roomName) || a.displayName.localeCompare(b.displayName));

  const roomMap = new Map<string, CabinetProjectFieldVerificationRoomSummary>();
  for (const asset of assets) {
    const roomKey = asset.roomId ?? "__unassigned";
    const existing =
      roomMap.get(roomKey) ??
      {
        roomId: asset.roomId,
        roomName: asset.roomName,
        assetCount: 0,
        assetIds: [],
        requiredCheckCount: 0,
        recommendedCheckCount: 0,
        fieldVerifyNoteCount: 0,
        coordinationNoteCount: 0,
        releaseBlockerCount: 0,
      };

    existing.assetCount += 1;
    existing.assetIds.push(asset.id);
    existing.requiredCheckCount += asset.requiredCheckCount;
    existing.recommendedCheckCount += asset.recommendedCheckCount;
    existing.fieldVerifyNoteCount += asset.fieldVerifyNoteCount;
    existing.coordinationNoteCount += asset.coordinationNoteCount;
    existing.releaseBlockerCount += asset.releaseBlockerCount;
    roomMap.set(roomKey, existing);
  }

  const rooms = Array.from(roomMap.values())
    .map((room) => ({
      ...room,
      assetIds: [...room.assetIds].sort(),
    }))
    .sort((a, b) => a.roomName.localeCompare(b.roomName));
  const totals: CabinetProjectFieldVerificationTotals = {
    roomCount: rooms.length,
    assetCount: assets.length,
    checklistCount: checklist.length,
    requiredCheckCount: checklist.filter((item) => item.status === "required").length,
    recommendedCheckCount: checklist.filter((item) => item.status === "recommended").length,
    fieldVerifyNoteCount: assets.reduce((sum, asset) => sum + asset.fieldVerifyNoteCount, 0),
    coordinationNoteCount: assets.reduce((sum, asset) => sum + asset.coordinationNoteCount, 0),
    placementCheckCount: checklist.filter((item) => item.scope === "placement").length,
    releaseBlockerCount: assets.reduce((sum, asset) => sum + asset.releaseBlockerCount, 0),
  };
  const verificationStatus: CabinetProjectFieldVerificationPackage["verificationStatus"] =
    totals.releaseBlockerCount > 0
      ? "blocked"
      : totals.requiredCheckCount > 0
        ? "field_verification_required"
        : "ready_for_release_review";

  return {
    schema: "custom_millwork.project_field_verification.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    verificationStatus,
    canReleaseWithoutFieldVerification: false,
    schedule,
    fabricationReleasePackage,
    installationPlanPackage,
    totals,
    rooms,
    assets,
    checklist: checklist.sort(
      (a, b) =>
        a.roomName.localeCompare(b.roomName) ||
        a.displayName.localeCompare(b.displayName) ||
        a.scope.localeCompare(b.scope) ||
        a.label.localeCompare(b.label)
    ),
    fieldVerificationPolicy: {
      requiresHumanVerification: true,
      reason:
        "Generated placement, dimensions, and installer notes must be field-verified before quote approval, fabrication release, purchase authorization, or installation scheduling.",
    },
    artifacts: [
      {
        type: "project_field_verification_json",
        fileName: `${baseName}-field-verification.json`,
        durable: true,
        notes: "Project-level field verification checklist for placed custom millwork assets.",
      },
      {
        type: "project_schedule_json",
        fileName: `${baseName}-millwork-schedule.json`,
        durable: true,
        notes: "Project schedule used for room, asset, and dimension context.",
      },
      {
        type: "project_finish_schedule_json",
        fileName: `${baseName}-finish-schedule.json`,
        durable: true,
        notes: "Finish schedule used for material, hardware, and edge-banding field checks.",
      },
      {
        type: "project_revision_package_json",
        fileName: `${baseName}-revision-package.json`,
        durable: true,
        notes: "Revision package used to review changed dimensions, placement, and site checks.",
      },
      {
        type: "project_drawing_set_json",
        fileName: `${baseName}-drawing-set.json`,
        durable: true,
        notes: "Project drawing set used to field-verify elevations, sections, plans, and dimensions.",
      },
      {
        type: "project_fabrication_release_json",
        fileName: `${baseName}-fabrication-release.json`,
        durable: true,
        notes: "Fabrication release package gated by field verification.",
      },
      {
        type: "project_installation_plan_json",
        fileName: `${baseName}-installation-plan.json`,
        durable: true,
        notes: "Installation plan used for room sequencing and transform checks.",
      },
      {
        type: "project_approval_package_json",
        fileName: `${baseName}-approval-package.json`,
        durable: true,
        notes: "Approval package that should include field verification signoff.",
      },
      ...assets.flatMap((asset) => [
        {
          type: "package_json" as const,
          fileName: asset.placedPackageFileName,
          durable: true,
          notes: `Placed source package for ${asset.displayName} in ${asset.roomName}.`,
        },
        {
          type: "installer_work_order_json" as const,
          fileName: asset.installerWorkOrderFileName,
          durable: true,
          notes: `Installer work order used for transform and site verification checks for ${asset.displayName}.`,
        },
      ]),
    ],
    assumptions: [
      "This package is a generated field-verification checklist, not a completed site survey.",
      "Final field measurements, wall/floor/ceiling conditions, service locations, access path, anchoring, and protection plans require human verification.",
      "Fabrication release, purchase authorization, and installation scheduling should wait for field verification signoff.",
      "Regenerate this package after any CabinetDefinition, room, placement, transform, quote, approval, or installation-plan edit.",
    ],
  };
}

export function buildCabinetProjectFieldVerificationPackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectFieldVerificationPackage(input), null, 2)}\n`;
}

export function buildCabinetProjectCncBatchPackage(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): CabinetProjectCncBatchPackage {
  const schedule = buildCabinetProjectSchedulePackage(input);
  const fabricationReleasePackage = buildCabinetProjectFabricationReleasePackage(input);
  const placedPackages = input.assets.map((asset) => buildCabinetPlacedAssetPackage(asset));
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");
  const materialMap = new Map<string, CabinetProjectCncBatchMaterialSummary>();

  const assets: CabinetProjectCncBatchAssetSummary[] = placedPackages
    .map((pkg) => {
      const asset = pkg.placedAsset;
      const definition = pkg.cabinetDefinition;
      const documentation = pkg.documentation;
      const roomName =
        (asset.roomId ? input.roomNamesById?.[asset.roomId] : undefined) ??
        asset.roomId ??
        "Unassigned room";
      const edgeBandingTotalM = roundM(
        documentation.edgeBandingSchedule.reduce((sum, item) => sum + item.totalLengthM, 0)
      );

      for (const material of documentation.materialSchedule) {
        const existing =
          materialMap.get(material.materialId) ??
          {
            materialId: material.materialId,
            materialName: material.materialName,
            skuId: material.skuId,
            partCount: 0,
            areaSqM: 0,
            edgeBandingM: 0,
            assetIds: [],
            roomNames: [],
          };
        existing.partCount += material.partCount;
        existing.areaSqM += material.areaSqM;
        existing.edgeBandingM += material.edgeBandingM;
        if (!existing.assetIds.includes(asset.id)) existing.assetIds.push(asset.id);
        if (!existing.roomNames.includes(roomName)) existing.roomNames.push(roomName);
        materialMap.set(material.materialId, existing);
      }

      return {
        id: asset.id,
        roomId: asset.roomId,
        roomName,
        displayName: definition.name,
        assemblyType: pkg.millworkDefinition.assemblyType,
        sourceDefinitionId: definition.id,
        sourceDefinitionVersion: definition.version,
        dxfFileName: `${fileSafeName(definition.name)}-cut-layout.dxf`,
        placedPackageFileName: buildCabinetPlacedAssetPackageFileName(asset),
        cutListCount: documentation.cutList.length,
        materialScheduleCount: documentation.materialSchedule.length,
        edgeBandingTotalM,
        fabricationReleaseStatus: documentation.fabricationReleaseReadiness.status,
        releaseBlockerCount: documentation.fabricationReleaseReadiness.blockerCount,
        machiningReviewRequired: true,
        updatedAt: asset.updatedAt,
      };
    })
    .sort((a, b) => a.roomName.localeCompare(b.roomName) || a.displayName.localeCompare(b.displayName));

  const materials = Array.from(materialMap.values())
    .map((item) => ({
      ...item,
      areaSqM: roundSqM(item.areaSqM),
      edgeBandingM: roundM(item.edgeBandingM),
      assetIds: [...item.assetIds].sort(),
      roomNames: [...item.roomNames].sort(),
    }))
    .sort((a, b) => a.materialName.localeCompare(b.materialName));
  const totals: CabinetProjectCncBatchTotals = {
    assetCount: assets.length,
    dxfFileCount: assets.length,
    cutListCount: assets.reduce((sum, asset) => sum + asset.cutListCount, 0),
    materialScheduleCount: materials.length,
    materialAreaSqM: roundSqM(materials.reduce((sum, material) => sum + material.areaSqM, 0)),
    edgeBandingTotalM: roundM(assets.reduce((sum, asset) => sum + asset.edgeBandingTotalM, 0)),
    machiningReviewRequiredCount: assets.filter((asset) => asset.machiningReviewRequired).length,
    releaseBlockerCount: assets.reduce((sum, asset) => sum + asset.releaseBlockerCount, 0),
  };
  const cncReadiness: CabinetProjectCncBatchPackage["cncReadiness"] =
    fabricationReleasePackage.status === "blocked" || totals.releaseBlockerCount > 0
      ? "blocked"
      : fabricationReleasePackage.status !== "ready_for_release" ||
          totals.machiningReviewRequiredCount > 0
        ? "needs_review"
        : "ready_for_fabricator_review";

  return {
    schema: "custom_millwork.project_cnc_batch.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    cncReadiness,
    schedule,
    fabricationReleasePackage,
    totals,
    materials,
    assets,
    reviewChecklist: [
      "Confirm DXF units, scale, part labels, material assignment, and one-rectangle-per-cut-list-part export before CNC nesting.",
      "Review grain direction, edge-banding rules, joinery, machining allowances, kerf, hardware drilling, and shop tolerances before production.",
      "Treat generated DXF files as cut-layout aids until a fabricator approves nesting, machining, and final shop standards.",
      "Regenerate this CNC batch after any CabinetDefinition, placement, material, or hardware edit.",
    ],
    artifacts: [
      {
        type: "project_cnc_batch_json",
        fileName: `${baseName}-cnc-batch.json`,
        durable: true,
        notes: "Project CNC batch manifest for generated DXF and cut-list review.",
      },
      {
        type: "project_fabrication_release_json",
        fileName: `${baseName}-fabrication-release.json`,
        durable: true,
        notes: "Release-control package used to decide whether the CNC batch can proceed.",
      },
      {
        type: "project_schedule_json",
        fileName: `${baseName}-millwork-schedule.json`,
        durable: true,
        notes: "Project schedule used for room and asset context.",
      },
      {
        type: "project_finish_schedule_json",
        fileName: `${baseName}-finish-schedule.json`,
        durable: true,
        notes: "Finish schedule used for material and edge-banding review before CNC planning.",
      },
      {
        type: "project_revision_package_json",
        fileName: `${baseName}-revision-package.json`,
        durable: true,
        notes: "Revision package used to review changed cut-list, material, and DXF assumptions.",
      },
      {
        type: "project_drawing_set_json",
        fileName: `${baseName}-drawing-set.json`,
        durable: true,
        notes: "Project drawing set used to cross-check CNC layout against shop drawings.",
      },
      {
        type: "project_cut_list_json",
        fileName: `${baseName}-cut-list.json`,
        durable: true,
        notes: "Project cut-list package used as the CNC part-row source for DXF and machining review.",
      },
      ...assets.flatMap((asset) => [
        {
          type: "fabrication_dxf" as const,
          fileName: asset.dxfFileName,
          durable: false,
          notes: `Generated DXF cut-layout aid for ${asset.displayName}; fabricator review required.`,
        },
        {
          type: "package_json" as const,
          fileName: asset.placedPackageFileName,
          durable: true,
          notes: `Placed source package for ${asset.displayName} in ${asset.roomName}.`,
        },
      ]),
    ],
    assumptions: [
      "This CNC batch is a machine-readable fabrication planning manifest, not approved CNC code.",
      "Final CNC nesting, toolpaths, grain direction, joinery, hardware drilling, tolerances, and machining remain fabricator responsibilities.",
      "CabinetDefinition remains the editable source of truth; generated DXF files and this batch should be regenerated after edits.",
    ],
  };
}

export function buildCabinetProjectCncBatchPackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectCncBatchPackage(input), null, 2)}\n`;
}

export function buildCabinetProjectApprovalPackage(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): CabinetProjectApprovalPackage {
  const schedule = buildCabinetProjectSchedulePackage(input);
  const fabricationReleasePackage = buildCabinetProjectFabricationReleasePackage(input);
  const procurementPackage = buildCabinetProjectProcurementPackage(input);
  const placedPackages = input.assets.map((asset) => buildCabinetPlacedAssetPackage(asset));
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");

  const approvalItems: CabinetProjectApprovalItem[] = placedPackages.flatMap((pkg) => {
    const asset = pkg.placedAsset;
    const definition = pkg.cabinetDefinition;
    const roomName =
      (asset.roomId ? input.roomNamesById?.[asset.roomId] : undefined) ??
      asset.roomId ??
      "Unassigned room";

    return pkg.documentation.releaseChecklist.map((item) => ({
      id: `approval:${asset.id}:${item.id}`,
      assetId: asset.id,
      roomId: asset.roomId,
      roomName,
      displayName: definition.name,
      phase: item.phase,
      owner: item.owner,
      status: item.status,
      dueBefore: item.dueBefore,
      label: item.label,
      relatedArtifactTypes: item.relatedArtifactTypes ?? [],
      notes: item.notes,
    }));
  }).sort(
    (a, b) =>
      a.roomName.localeCompare(b.roomName) ||
      a.displayName.localeCompare(b.displayName) ||
      a.dueBefore.localeCompare(b.dueBefore) ||
      a.owner.localeCompare(b.owner) ||
      a.label.localeCompare(b.label)
  );

  const countByOwner = (owner: CabinetProjectApprovalItem["owner"]) =>
    approvalItems.filter((item) => item.owner === owner).length;
  const totals: CabinetProjectApprovalTotals = {
    assetCount: placedPackages.length,
    approvalItemCount: approvalItems.length,
    requiredCount: approvalItems.filter((item) => item.status === "required").length,
    recommendedCount: approvalItems.filter((item) => item.status === "recommended").length,
    blockedCount: approvalItems.filter((item) => item.status === "blocked").length,
    clientApprovalCount: countByOwner("client"),
    designerApprovalCount: countByOwner("designer"),
    supplierApprovalCount: countByOwner("supplier"),
    fabricatorApprovalCount: countByOwner("fabricator"),
    installerApprovalCount: countByOwner("installer"),
    quoteRequestGateCount: approvalItems.filter((item) => item.dueBefore === "quote_request").length,
    fabricationReleaseGateCount: approvalItems.filter((item) => item.dueBefore === "fabrication_release").length,
    installationGateCount: approvalItems.filter((item) => item.dueBefore === "installation").length,
  };
  const approvalStatus: CabinetProjectApprovalPackage["approvalStatus"] =
    fabricationReleasePackage.status === "blocked" || totals.blockedCount > 0
      ? "blocked"
      : totals.requiredCount > 0 || procurementPackage.totals.customQuoteRequiredCount > 0
        ? "needs_review"
        : "ready_for_signature";

  return {
    schema: "custom_millwork.project_approval_package.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    approvalStatus,
    canSubmitForClientApproval: approvalStatus !== "blocked",
    canSubmitForFabricatorReview:
      approvalStatus !== "blocked" && fabricationReleasePackage.totals.supplierMissingSkuCount === 0,
    canReleaseAfterSignoff: fabricationReleasePackage.canReleaseToFabrication,
    schedule,
    fabricationReleasePackage,
    procurementPackage,
    totals,
    approvalItems,
    signoffPolicy: {
      requiresDesignerApproval: totals.designerApprovalCount > 0,
      requiresClientApproval: totals.clientApprovalCount > 0,
      requiresSupplierConfirmation: totals.supplierApprovalCount > 0,
      requiresFabricatorApproval: totals.fabricatorApprovalCount > 0,
      requiresInstallerCoordination: totals.installerApprovalCount > 0,
      reason:
        "Custom millwork must keep client, designer, supplier, fabricator, and installer signoffs separate from generated package creation.",
    },
    artifacts: [
      {
        type: "project_approval_package_json",
        fileName: `${baseName}-approval-package.json`,
        durable: true,
        notes: "Project approval and submittal package with signoff gates by owner.",
      },
      {
        type: "project_schedule_json",
        fileName: `${baseName}-millwork-schedule.json`,
        durable: true,
        notes: "Project asset and room schedule for approval context.",
      },
      {
        type: "project_procurement_json",
        fileName: `${baseName}-procurement.json`,
        durable: true,
        notes: "Supplier and custom quote rows for purchasing approval.",
      },
      {
        type: "project_finish_schedule_json",
        fileName: `${baseName}-finish-schedule.json`,
        durable: true,
        notes: "Finish schedule for material, hardware, edge-banding, and supplier signoff.",
      },
      {
        type: "project_revision_package_json",
        fileName: `${baseName}-revision-package.json`,
        durable: true,
        notes: "Revision package used to decide which signoff gates need to be re-run after edits.",
      },
      {
        type: "project_drawing_set_json",
        fileName: `${baseName}-drawing-set.json`,
        durable: true,
        notes: "Project drawing set for client, designer, and fabricator submittal review.",
      },
      {
        type: "project_cut_list_json",
        fileName: `${baseName}-cut-list.json`,
        durable: true,
        notes: "Project cut-list package for fabricator and designer fabrication-part signoff.",
      },
      {
        type: "project_quote_package_json",
        fileName: `${baseName}-project-quote.json`,
        durable: true,
        notes: "Preliminary quote package for client and estimator review.",
      },
      {
        type: "project_purchase_readiness_json",
        fileName: `${baseName}-purchase-readiness.json`,
        durable: true,
        notes: "Purchase readiness package for checkout and purchase authorization review.",
      },
      {
        type: "project_field_verification_json",
        fileName: `${baseName}-field-verification.json`,
        durable: true,
        notes: "Field verification checklist for release and installation approval.",
      },
      {
        type: "project_fabrication_release_json",
        fileName: `${baseName}-fabrication-release.json`,
        durable: true,
        notes: "Release-control package used to determine whether signoff can proceed to fabrication.",
      },
      {
        type: "project_cnc_batch_json",
        fileName: `${baseName}-cnc-batch.json`,
        durable: true,
        notes: "CNC batch manifest for fabricator review.",
      },
      {
        type: "project_installation_plan_json",
        fileName: `${baseName}-installation-plan.json`,
        durable: true,
        notes: "Installation plan for installer coordination approval.",
      },
      {
        type: "project_rfq_json",
        fileName: `${baseName}-project-rfq.json`,
        durable: true,
        notes: "Project RFQ package for quote review.",
      },
      ...fabricationReleasePackage.assets.flatMap((asset) => [
        {
          type: "package_json" as const,
          fileName: asset.placedPackageFileName,
          durable: true,
          notes: `Placed source package for ${asset.displayName} in ${asset.roomName}.`,
        },
        {
          type: "shop_drawing_svg" as const,
          fileName: asset.shopDrawingFileName,
          durable: true,
          notes: `Generated shop drawing for ${asset.displayName}.`,
        },
        {
          type: "installer_work_order_json" as const,
          fileName: asset.installerWorkOrderFileName,
          durable: true,
          notes: `Installer work order for ${asset.displayName} in ${asset.roomName}.`,
        },
      ]),
    ],
    assumptions: [
      "This approval package is a submittal control artifact, not a signed approval record.",
      "Generated packages can be submitted for review, but final fabrication, purchasing, and installation still require explicit human signoff.",
      "Approval items should be regenerated after any CabinetDefinition, placement, material, hardware, quote, or room edit.",
    ],
  };
}

export function buildCabinetProjectApprovalPackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectApprovalPackage(input), null, 2)}\n`;
}

export function buildCabinetProjectFabricationQuoteRequest(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): CabinetProjectFabricationQuoteRequest {
  const schedule = buildCabinetProjectSchedulePackage(input);
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");

  return {
    schema: "custom_millwork.project_rfq.v1",
    requestVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    schedule,
    totals: schedule.totals,
    rooms: schedule.rooms,
    assets: schedule.assets,
    assetQuoteRequests: schedule.placedAssets.map((asset) =>
      buildCabinetFabricationQuoteRequest(asset.cabinetDefinition)
    ),
    requestedDeliverables: [
      "Review every placed smart millwork asset, room placement, source definition, and generated 3D output before quoting.",
      "Return project-level material, hardware, fabrication, finishing, delivery, installation, and revision pricing by room and asset.",
      "Confirm supplier SKU availability, edge-banding rules, lead times, fabrication assumptions, and installation sequencing.",
      "Flag field-verification blockers, shop drawing requirements, service penetrations, anchoring, and site constraints before fabrication release.",
    ],
    artifacts: [
      {
        type: "project_rfq_json",
        fileName: `${baseName}-project-rfq.json`,
        durable: true,
        notes: "Project-level request for quote covering all placed smart millwork assets.",
      },
      {
        type: "project_schedule_json",
        fileName: `${baseName}-millwork-schedule.json`,
        durable: true,
        notes: "Machine-readable project schedule with room, asset, manifest, and total summaries.",
      },
      {
        type: "project_schedule_csv",
        fileName: `${baseName}-millwork-schedule.csv`,
        durable: true,
        notes: "Human-readable project schedule for estimator review.",
      },
      {
        type: "project_procurement_json",
        fileName: `${baseName}-procurement.json`,
        durable: true,
        notes: "Supplier procurement planning package with mapped SKU and custom quote rows.",
      },
      {
        type: "project_finish_schedule_json",
        fileName: `${baseName}-finish-schedule.json`,
        durable: true,
        notes: "Project finish, material, hardware, and edge-banding schedule for supplier/fabricator review.",
      },
      {
        type: "project_revision_package_json",
        fileName: `${baseName}-revision-package.json`,
        durable: true,
        notes: "Project revision package for changed dimensions, placement, materials, hardware, quote, and release assumptions.",
      },
      {
        type: "project_drawing_set_json",
        fileName: `${baseName}-drawing-set.json`,
        durable: true,
        notes: "Project drawing set index for elevations, sections, plans, and dimensions requested with the RFQ.",
      },
      {
        type: "project_cut_list_json",
        fileName: `${baseName}-cut-list.json`,
        durable: true,
        notes: "Project cut-list package requested for fabrication part, material, edge-banding, and CNC review.",
      },
      {
        type: "project_quote_package_json",
        fileName: `${baseName}-project-quote.json`,
        durable: true,
        notes: "Preliminary project quote package with room, asset, and category totals.",
      },
      {
        type: "project_purchase_readiness_json",
        fileName: `${baseName}-purchase-readiness.json`,
        durable: true,
        notes: "Project purchase readiness package with mapped SKU candidates and quote-required rows.",
      },
      {
        type: "project_field_verification_json",
        fileName: `${baseName}-field-verification.json`,
        durable: true,
        notes: "Project field verification checklist for site measurement, placement, and access checks.",
      },
      {
        type: "project_fabrication_release_json",
        fileName: `${baseName}-fabrication-release.json`,
        durable: true,
        notes: "Project fabrication release control package with gate and artifact readiness.",
      },
      {
        type: "project_installation_plan_json",
        fileName: `${baseName}-installation-plan.json`,
        durable: true,
        notes: "Project installation plan with room sequencing and installer work order references.",
      },
      {
        type: "project_cnc_batch_json",
        fileName: `${baseName}-cnc-batch.json`,
        durable: true,
        notes: "Project CNC batch manifest with DXF, cut-list, material, and edge-banding summaries.",
      },
      {
        type: "project_approval_package_json",
        fileName: `${baseName}-approval-package.json`,
        durable: true,
        notes: "Project approval and submittal package with client/fabricator/supplier/installer gates.",
      },
      ...schedule.assets.map((asset) => ({
        type: "package_json" as const,
        fileName: `${fileSafeName(asset.displayName)}-${fileSafeName(asset.id)}-placed-package.json`,
        durable: true,
        notes: `Placed asset package for ${asset.displayName} in ${asset.roomName}.`,
      })),
      ...schedule.assets.map((asset) => ({
        type: "installer_work_order_json" as const,
        fileName: `${fileSafeName(asset.displayName)}-${fileSafeName(asset.id)}-installer-work-order.json`,
        durable: true,
        notes: `Installer work order for ${asset.displayName} in ${asset.roomName}.`,
      })),
    ],
    assumptions: [
      "This project RFQ is preliminary and should not be treated as a purchase order or fabrication release.",
      "CabinetDefinition remains the editable source of truth for each placed asset; generated GLB URLs are visualization outputs.",
      "Project totals use placeholder rates until supplier catalogs, SKU availability, and fabricator quotes are connected.",
      "Field verification, final shop drawings, code requirements, site conditions, delivery path, and client approvals remain required.",
    ],
  };
}

export function buildCabinetProjectFabricationQuoteRequestJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectFabricationQuoteRequest(input), null, 2)}\n`;
}

export function buildCabinetProjectHandoffPackage(input: {
  assets: PlacedCabinetAsset[];
  previousAssets?: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
  previousRoomNamesById?: Record<string, string>;
}): CabinetProjectHandoffPackage {
  const schedule = buildCabinetProjectSchedulePackage(input);
  const scopePackage = buildCabinetProjectScopePackage(input);
  const finishSchedulePackage = buildCabinetProjectFinishSchedulePackage(input);
  const procurementPackage = buildCabinetProjectProcurementPackage(input);
  const revisionPackage = buildCabinetProjectRevisionPackage(input);
  const drawingSetPackage = buildCabinetProjectDrawingSetPackage(input);
  const cutListPackage = buildCabinetProjectCutListPackage(input);
  const quotePackage = buildCabinetProjectQuotePackage(input);
  const purchaseReadinessPackage = buildCabinetProjectPurchaseReadinessPackage(input);
  const fabricationReleasePackage = buildCabinetProjectFabricationReleasePackage(input);
  const installationPlanPackage = buildCabinetProjectInstallationPlanPackage(input);
  const fieldVerificationPackage = buildCabinetProjectFieldVerificationPackage(input);
  const cncBatchPackage = buildCabinetProjectCncBatchPackage(input);
  const approvalPackage = buildCabinetProjectApprovalPackage(input);
  const rfqPackage = buildCabinetProjectFabricationQuoteRequest(input);
  const baseName = fileSafeName(input.projectName ?? input.projectId ?? "custom-millwork-project");

  const quoteById = new Map(quotePackage.assets.map((asset) => [asset.id, asset]));
  const releaseById = new Map(fabricationReleasePackage.assets.map((asset) => [asset.id, asset]));
  const cutListById = new Map(cutListPackage.assets.map((asset) => [asset.id, asset]));

  const assets: CabinetProjectHandoffAssetSummary[] = schedule.assets.map((asset) => {
    const quote = quoteById.get(asset.id);
    const release = releaseById.get(asset.id);
    const cutList = cutListById.get(asset.id);

    return {
      id: asset.id,
      roomId: asset.roomId,
      roomName: asset.roomName,
      displayName: asset.displayName,
      assemblyType: asset.assemblyType,
      sourceDefinitionId: asset.sourceDefinitionId,
      sourceDefinitionVersion: asset.sourceDefinitionVersion,
      sourceDefinitionFingerprint: asset.sourceDefinitionFingerprint,
      placedPackageFileName: `${fileSafeName(asset.displayName)}-${fileSafeName(asset.id)}-placed-package.json`,
      shopDrawingFileName: cutList?.shopDrawingFileName ?? `${fileSafeName(asset.displayName)}-shop-drawing.svg`,
      fabricationDxfFileName: cutList?.fabricationDxfFileName ?? `${fileSafeName(asset.displayName)}-cut-layout.dxf`,
      installerWorkOrderFileName:
        release?.installerWorkOrderFileName ??
        `${fileSafeName(asset.displayName)}-${fileSafeName(asset.id)}-installer-work-order.json`,
      supplierReadinessStatus: asset.supplierReadinessStatus,
      fabricationReleaseStatus: release?.releaseStatus ?? asset.fabricationReleaseStatus,
      approvalStatus: approvalPackage.approvalStatus,
      purchaseReadiness: purchaseReadinessPackage.purchaseReadiness,
      cutListCount: cutList?.cutListCount ?? asset.cutListCount,
      edgeBandingTotalM: cutList?.edgeBandingM ?? asset.edgeBandingTotalM,
      estimatedTotal: quote?.estimatedTotal ?? asset.estimatedTotal,
      currency: quote?.currency ?? quotePackage.totals.currency,
      updatedAt: asset.updatedAt,
    };
  });

  const handoffChecklist: CabinetProjectHandoffChecklistItem[] = [
    {
      id: "handoff:source-definitions",
      label: "Confirm editable source definitions and generated GLB outputs",
      owner: "designer",
      status: schedule.assets.length > 0 ? "ready" : "required",
      dueBefore: "client_handoff",
      relatedArtifactTypes: ["project_schedule_json", "package_json", "glb", "source_definition"],
      notes:
        "Each placed smart millwork asset should keep its parametric source definition as the durable source of truth.",
    },
    {
      id: "handoff:field-verification",
      label: "Complete field verification before release or purchase authorization",
      owner: "designer",
      status:
        fieldVerificationPackage.verificationStatus === "ready_for_release_review"
          ? "ready"
          : "required",
      dueBefore: "fabrication_release",
      relatedArtifactTypes: ["project_field_verification_json", "installer_work_order_json"],
      notes: fieldVerificationPackage.fieldVerificationPolicy.reason,
    },
    {
      id: "handoff:approval-signoff",
      label: "Review client, designer, supplier, fabricator, and installer signoff gates",
      owner: "designer",
      status: approvalPackage.totals.blockedCount > 0
        ? "required"
        : approvalPackage.totals.requiredCount > 0
          ? "required"
          : "ready",
      dueBefore: "client_handoff",
      relatedArtifactTypes: ["project_approval_package_json", "project_drawing_set_json"],
      notes: approvalPackage.signoffPolicy.reason,
    },
    {
      id: "handoff:quote-and-purchase",
      label: "Resolve quote rows and purchase readiness",
      owner: "supplier",
      status:
        purchaseReadinessPackage.purchaseReadiness === "ready_for_purchase_review"
          ? "ready"
          : "required",
      dueBefore: "purchase_review",
      relatedArtifactTypes: [
        "project_quote_package_json",
        "project_purchase_readiness_json",
        "project_procurement_json",
        "project_rfq_json",
      ],
      notes:
        "Mapped supplier SKU rows and custom fabrication/installation quote rows require pricing, availability, lead-time, and approval checks before purchase review.",
    },
    {
      id: "handoff:cut-list-cnc-review",
      label: "Review cut list, DXF layout, and CNC batch assumptions",
      owner: "fabricator",
      status: cncBatchPackage.cncReadiness === "blocked" ? "required" : "recommended",
      dueBefore: "fabrication_release",
      relatedArtifactTypes: [
        "project_cut_list_json",
        "project_cnc_batch_json",
        "fabrication_dxf",
      ],
      notes:
        "Generated cut lists and DXF layouts are fabrication planning aids until a fabricator approves nesting, machining, grain, joinery, and tolerances.",
    },
    {
      id: "handoff:fabrication-release",
      label: "Approve fabrication release gates",
      owner: "fabricator",
      status:
        fabricationReleasePackage.status === "ready_for_release" ? "ready" : "required",
      dueBefore: "fabrication_release",
      relatedArtifactTypes: [
        "project_fabrication_release_json",
        "project_drawing_set_json",
        "project_cut_list_json",
      ],
      notes: fabricationReleasePackage.releaseDecision.reason,
    },
    {
      id: "handoff:installation",
      label: "Coordinate installation sequencing and installer work orders",
      owner: "installer",
      status:
        installationPlanPackage.installationReadiness === "ready_for_install"
          ? "ready"
          : installationPlanPackage.installationReadiness === "blocked"
            ? "required"
            : "recommended",
      dueBefore: "installation",
      relatedArtifactTypes: ["project_installation_plan_json", "installer_work_order_json"],
      notes:
        "Installation sequencing, access, anchoring, service coordination, and site protection need installer review before work is scheduled.",
    },
    {
      id: "handoff:checkout-exclusion",
      label: "Keep custom millwork excluded from standard cart checkout",
      owner: "designer",
      status: purchaseReadinessPackage.checkoutPolicy.includeInCheckout === false ? "ready" : "required",
      dueBefore: "purchase_review",
      relatedArtifactTypes: ["project_purchase_readiness_json"],
      notes: purchaseReadinessPackage.checkoutPolicy.reason,
    },
  ];

  const hasBlockedGate =
    approvalPackage.approvalStatus === "blocked" ||
    purchaseReadinessPackage.purchaseReadiness === "blocked" ||
    fabricationReleasePackage.status === "blocked" ||
    installationPlanPackage.installationReadiness === "blocked" ||
    fieldVerificationPackage.verificationStatus === "blocked" ||
    cncBatchPackage.cncReadiness === "blocked" ||
    schedule.totals.releaseBlockerCount > 0;
  const requiredChecklistCount = handoffChecklist.filter((item) => item.status === "required").length;
  const handoffStatus: CabinetProjectHandoffPackage["handoffStatus"] = hasBlockedGate
    ? "blocked"
    : requiredChecklistCount > 0 ||
        handoffChecklist.some((item) => item.status === "recommended")
      ? "needs_review"
      : "ready_for_handoff_review";

  const artifactCandidates: CabinetFabricationArtifact[] = [
    {
      type: "project_handoff_package_json",
      fileName: `${baseName}-project-handoff.json`,
      durable: true,
      notes: "Project-level custom millwork handoff bundle tying quote, purchase, fabrication, CNC, drawing, field verification, and installation packages together.",
    },
    {
      type: "project_schedule_json",
      fileName: `${baseName}-millwork-schedule.json`,
      durable: true,
      notes: "Machine-readable project schedule included in the handoff bundle.",
    },
    {
      type: "project_schedule_csv",
      fileName: `${baseName}-millwork-schedule.csv`,
      durable: true,
      notes: "Human-readable project schedule included in the handoff bundle.",
    },
    ...finishSchedulePackage.artifacts,
    ...procurementPackage.artifacts,
    ...revisionPackage.artifacts,
    ...drawingSetPackage.artifacts,
    ...cutListPackage.artifacts,
    ...quotePackage.artifacts,
    ...purchaseReadinessPackage.artifacts,
    ...scopePackage.artifacts,
    ...fabricationReleasePackage.artifacts,
    ...installationPlanPackage.artifacts,
    ...fieldVerificationPackage.artifacts,
    ...cncBatchPackage.artifacts,
    ...approvalPackage.artifacts,
    ...rfqPackage.artifacts,
  ];
  const artifacts = Array.from(
    artifactCandidates
      .reduce((map, artifact) => {
        map.set(`${artifact.type}:${artifact.fileName}`, artifact);
        return map;
      }, new Map<string, CabinetFabricationArtifact>())
      .values()
  );

  const totals: CabinetProjectHandoffTotals = {
    roomCount: schedule.totals.roomCount,
    assetCount: schedule.totals.assetCount,
    packageCount: 15,
    artifactCount: artifacts.length,
    durableArtifactCount: artifacts.filter((artifact) => artifact.durable).length,
    sessionArtifactCount: artifacts.filter((artifact) => !artifact.durable).length,
    requiredApprovalCount: approvalPackage.totals.requiredCount,
    fieldVerificationRequiredCount: fieldVerificationPackage.totals.requiredCheckCount,
    releaseBlockerCount: schedule.totals.releaseBlockerCount,
    cutListCount: cutListPackage.totals.partRowCount,
    edgeBandingTotalM: cutListPackage.totals.edgeBandingTotalM,
    estimatedTotal: quotePackage.totals.estimatedTotal,
    currency: quotePackage.totals.currency,
  };

  return {
    schema: "custom_millwork.project_handoff_package.v1",
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "placed_parametric_cabinet_project",
    projectId: input.projectId,
    projectName: input.projectName,
    handoffStatus,
    canIssueToClient: approvalPackage.canSubmitForClientApproval && !hasBlockedGate,
    canIssueToFabricator:
      approvalPackage.canSubmitForFabricatorReview && cncBatchPackage.cncReadiness !== "blocked",
    canIssueToInstaller: installationPlanPackage.installationReadiness !== "blocked",
    canIssueForPurchaseReview: purchaseReadinessPackage.purchaseReadiness !== "blocked",
    packages: {
      schedule,
      scopePackage,
      finishSchedulePackage,
      procurementPackage,
      revisionPackage,
      drawingSetPackage,
      cutListPackage,
      quotePackage,
      purchaseReadinessPackage,
      fabricationReleasePackage,
      installationPlanPackage,
      fieldVerificationPackage,
      cncBatchPackage,
      approvalPackage,
      rfqPackage,
    },
    totals,
    assets,
    handoffChecklist,
    artifacts,
    assumptions: [
      "This handoff bundle is a generated coordination manifest, not a signed contract, purchase order, fabrication release, CNC program, or installation authorization.",
      "CabinetDefinition and the wrapped custom millwork definition remain the durable editable source of truth for each placed smart asset.",
      "All generated GLB, SVG, DXF, quote, cut-list, CNC, and installation artifacts should be regenerated after any design, placement, material, hardware, supplier, field verification, approval, or room change.",
      "Final pricing, supplier availability, fabrication standards, field dimensions, code requirements, site conditions, and client/fabricator/installer signoff remain human responsibilities.",
    ],
  };
}

export function buildCabinetProjectHandoffPackageJson(input: {
  assets: PlacedCabinetAsset[];
  previousAssets?: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
  previousRoomNamesById?: Record<string, string>;
}): string {
  return `${JSON.stringify(buildCabinetProjectHandoffPackage(input), null, 2)}\n`;
}

export function downloadCabinetDocumentationCsv(definition: CabinetDefinition): void {
  const csv = buildCabinetDocumentationCsv(definition);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${
    definition.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "millwork"
  }-documentation.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetDocumentationPackageJson(definition: CabinetDefinition): void {
  const json = buildCabinetDocumentationPackageJson(definition);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${
    definition.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "millwork"
  }-package.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetPlacedAssetPackageJson(asset: PlacedCabinetAsset): void {
  const json = buildCabinetPlacedAssetPackageJson(asset);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetPlacedAssetPackageFileName(asset);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetPlacedAssetInstallerWorkOrderJson(
  asset: PlacedCabinetAsset,
  input: { roomName?: string } = {}
): void {
  const json = buildCabinetPlacedAssetInstallerWorkOrderJson(asset, input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetPlacedAssetInstallerWorkOrderFileName(asset);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectSchedulePackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectSchedulePackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectScheduleFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectScheduleCsv(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): void {
  const csv = buildCabinetProjectScheduleCsv(input);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectScheduleCsvFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectScopePackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectScopePackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectScopePackageFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectProcurementPackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectProcurementPackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectProcurementPackageFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectDrawingSetPackageJson(input: {
  assets: PlacedCabinetAsset[];
  previousAssets?: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
  previousRoomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectDrawingSetPackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectDrawingSetPackageFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectCutListPackageJson(input: {
  assets: PlacedCabinetAsset[];
  previousAssets?: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
  previousRoomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectCutListPackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectCutListPackageFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectFinishSchedulePackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectFinishSchedulePackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectFinishSchedulePackageFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectRevisionPackageJson(input: {
  assets: PlacedCabinetAsset[];
  previousAssets?: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
  previousRoomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectRevisionPackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectRevisionPackageFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectQuotePackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectQuotePackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectQuotePackageFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectPurchaseReadinessPackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectPurchaseReadinessPackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectPurchaseReadinessPackageFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectFabricationReleasePackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectFabricationReleasePackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectFabricationReleasePackageFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectInstallationPlanPackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectInstallationPlanPackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectInstallationPlanPackageFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectFieldVerificationPackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectFieldVerificationPackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectFieldVerificationPackageFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectCncBatchPackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectCncBatchPackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectCncBatchPackageFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectApprovalPackageJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectApprovalPackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectApprovalPackageFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectHandoffPackageJson(input: {
  assets: PlacedCabinetAsset[];
  previousAssets?: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
  previousRoomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectHandoffPackageJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectHandoffPackageFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetProjectFabricationQuoteRequestJson(input: {
  assets: PlacedCabinetAsset[];
  projectId?: string;
  projectName?: string;
  roomNamesById?: Record<string, string>;
}): void {
  const json = buildCabinetProjectFabricationQuoteRequestJson(input);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetProjectFabricationQuoteRequestFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetSourceDefinitionJson(definition: CabinetDefinition): void {
  const json = buildCabinetSourceDefinitionJson(definition);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetSourceDefinitionFileName(definition);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCabinetFabricationQuoteRequestJson(definition: CabinetDefinition): void {
  const json = buildCabinetFabricationQuoteRequestJson(definition);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileSafeName(definition.name)}-rfq.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
