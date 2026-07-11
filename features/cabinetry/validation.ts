import type { CabinetDefinition, CabinetValidationIssueDraft, CabinetValidationResult } from "./types";
import { finalizeCabinetValidationIssues } from "./validationIssues";
import { resolveCabinetHardwareCompatibility } from "./hardwareCompatibility";
import {
  getCabinetMillworkAssemblyType,
  getCabinetMillworkFamily,
} from "@/features/millwork/createCabinetMillworkDefinition";
import { getMillworkAssemblyProfile } from "@/features/millwork/assemblyProfiles";
import {
  getCabinetHangingRodCenterHeights,
  getCabinetHangingRodCount,
  getCabinetHangingRodHeight,
  getCabinetHangingRodSpacing,
} from "./hangingRodLayout";
import {
  getCabinetSlatCount,
  getCabinetSlatDepth,
  getCabinetSlatLocalXPositions,
  getCabinetSlatWidth,
} from "./slatLayout";
import {
  getCabinetPanelColumnCount,
  getCabinetPanelFrameDepth,
  getCabinetPanelFrameWidth,
  getCabinetPanelOpeningHeight,
  getCabinetPanelOpeningWidth,
  getCabinetPanelRowCount,
  hasCabinetPanelFrame,
} from "./panelLayout";
import {
  getCabinetCeilingBeamArraySpan,
  getCabinetCeilingBeamCount,
  getCabinetCeilingBeamDepth,
  getCabinetCeilingBeamWidth,
  getCabinetCeilingGridColumnCount,
  getCabinetCeilingGridOpeningDepth,
  getCabinetCeilingGridOpeningWidth,
  getCabinetCeilingGridRowCount,
  isCabinetCeilingBeamArray,
  isCabinetCeilingComponent,
  isCabinetCofferedCeilingGrid,
} from "./ceilingBeamLayout";
import {
  getCabinetFireplaceFrameOuterWidth,
  getCabinetFireplaceHeaderHeight,
  getCabinetFireplaceLegWidth,
  getCabinetFireplaceMantelDepth,
  getCabinetFireplaceMantelHeight,
  getCabinetFireplaceOpeningHeight,
  getCabinetFireplaceOpeningWidth,
  getCabinetFireplaceTrimStackHeight,
  getCabinetTrimLeftEndTreatment,
  getCabinetTrimMemberCount,
  getCabinetTrimMiterAngle,
  getCabinetTrimPlacement,
  getCabinetTrimProfileDepth,
  getCabinetTrimProfileWidth,
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
  CABINET_WALL_BED_MATTRESS_DIMENSIONS,
  getCabinetConvertibleHingeHeight,
  getCabinetConvertibleOpenDepth,
  getCabinetConvertiblePanelHeight,
  getCabinetConvertiblePanelThickness,
  getCabinetConvertibleSupportLegCount,
  getCabinetConvertibleSupportLegDepth,
  getCabinetConvertibleSupportLegWidth,
  getCabinetWallBedMattressSize,
  getCabinetWallBedOrientation,
  isCabinetConvertibleComponent,
  isCabinetFoldDownWorksurface,
  isCabinetWallBedPanel,
} from "./convertibleLayout";
import {
  getCabinetPlatformDeckDepth,
  getCabinetPlatformDeckThickness,
  getCabinetPlatformSupportRibCount,
  getCabinetPlatformSupportRibHeight,
  getCabinetPlatformSupportRibWidth,
  hasCabinetPlatformDeck,
} from "./platformBedLayout";
import {
  getCabinetStairScribeDepth,
  getCabinetStairScribeHighHeight,
  getCabinetStairScribeLowHeight,
  getCabinetStairScribeStepCount,
  hasCabinetStairScribe,
} from "./stairScribeLayout";
import {
  getCabinetRoomDividerBackPanelCount,
  getCabinetRoomDividerBackPanelThickness,
  getCabinetRoomDividerStabilizerFootCount,
  getCabinetRoomDividerStabilizerFootDepth,
  getCabinetRoomDividerStabilizerFootWidth,
  hasCabinetRoomDividerDetails,
} from "./roomDividerLayout";
import {
  getCabinetLifestyleInsertCount,
  getCabinetLifestyleInsertDeckHeight,
  getCabinetLifestyleInsertDepth,
  getCabinetLifestyleInsertKind,
  getCabinetLifestyleInsertLipHeight,
  hasCabinetLifestyleInsert,
} from "./lifestyleInsertLayout";
import {
  getCabinetWineRackBayHeight,
  getCabinetWineRackBayWidth,
  getCabinetWineRackColumnCount,
  getCabinetWineRackDepth,
  getCabinetWineRackDividerThickness,
  getCabinetWineRackOpeningHeight,
  getCabinetWineRackOpeningWidth,
  getCabinetWineRackRowCount,
  hasCabinetWineRack,
} from "./wineRackLayout";
import {
  getCabinetSeatBackHeight,
  getCabinetSeatBackThickness,
  getCabinetSeatCushionDepth,
  getCabinetSeatCushionOverhangFront,
  getCabinetSeatCushionThickness,
  getCabinetSeatDeckThickness,
  getCabinetSeatFinishedHeight,
  hasCabinetSeatBack,
  hasCabinetSeatingDetails,
} from "./seatingLayout";
import {
  CABINET_MUDROOM_HOOK_RAIL_HEIGHT,
  CABINET_MUDROOM_HOOK_WIDTH,
  getCabinetMudroomHookCount,
  getCabinetMudroomHookProjection,
  getCabinetMudroomHookRailHeight,
  getCabinetShoeCubbyBayWidth,
  getCabinetShoeCubbyCount,
  getCabinetShoeCubbyDepth,
  getCabinetShoeCubbyDividerThickness,
  getCabinetShoeCubbyHeight,
  getCabinetShoeCubbyOpeningWidth,
  getCabinetShoeCubbyOpeningY,
  hasCabinetMudroomHooks,
  hasCabinetShoeCubbies,
} from "./mudroomLayout";
import {
  CABINET_DEFAULT_BACKSPLASH_HEIGHT,
  CABINET_DEFAULT_BACKSPLASH_THICKNESS,
  CABINET_DEFAULT_END_PANEL_THICKNESS,
  CABINET_DEFAULT_COUNTERTOP_FRONT_OVERHANG,
  CABINET_DEFAULT_COUNTERTOP_SIDE_OVERHANG,
  CABINET_DEFAULT_COUNTERTOP_THICKNESS,
  CABINET_MIN_TOE_KICK_DEPTH,
  getCabinetCountertopOverhangBack,
  getCabinetCountertopOverhangFront,
  getCabinetCountertopOverhangLeft,
  getCabinetCountertopOverhangRight,
  getCabinetCountertopThickness,
  getCabinetBacksplashHeight,
  getCabinetBacksplashThickness,
  getCabinetLeftEndPanelThickness,
  getCabinetLeftFillerScribeAllowance,
  getCabinetLeftFillerWidth,
  getCabinetOverallDepth,
  getCabinetOverallHeight,
  getCabinetOverallWidth,
  getCabinetRightEndPanelThickness,
  getCabinetRightFillerScribeAllowance,
  getCabinetRightFillerWidth,
  getCabinetToeKickDepth,
  getCabinetToeKickSetback,
} from "./layout";
import {
  getCabinetPlumbingChaseDepth,
  getCabinetPlumbingChaseHeight,
  getCabinetPlumbingChaseLocalX,
  getCabinetPlumbingChaseLocalZ,
  getCabinetPlumbingChaseWidth,
  getCabinetSinkCutoutDepth,
  getCabinetSinkCutoutLocalX,
  getCabinetSinkCutoutLocalZ,
  getCabinetSinkCutoutWidth,
  hasCabinetPlumbingChase,
  hasCabinetSinkCutout,
} from "./vanityServiceLayout";
import {
  getCabinetLaundryApplianceBackClearance,
  getCabinetLaundryApplianceCount,
  getCabinetLaundryApplianceDepth,
  getCabinetLaundryApplianceHeight,
  getCabinetLaundryApplianceRequiredDepth,
  getCabinetLaundryApplianceRequiredHeight,
  getCabinetLaundryApplianceRequiredWidth,
  getCabinetLaundryApplianceSideClearance,
  getCabinetLaundryApplianceTopClearance,
  getCabinetLaundryApplianceWidth,
  getCabinetLaundryUtilityChaseDepth,
  getCabinetLaundryUtilityChaseHeight,
  hasCabinetLaundryApplianceBay,
} from "./laundryApplianceLayout";
import { getCabinetShelfSpacingMode } from "./shelfLayout";
import {
  getCabinetCableGrommetCount,
  getCabinetCableGrommetDiameter,
  getCabinetCableGrommetLocalXPositions,
  getCabinetCableGrommetLocalZ,
  getCabinetCableGrommetOffsetFromBack,
  getCabinetDeskPowerChaseDepth,
  getCabinetDeskPowerChaseHeight,
  getCabinetOfficeWorksurfaceDepth,
  getCabinetOfficeWorksurfaceOverhangFront,
  getCabinetOfficeWorksurfaceThickness,
  hasCabinetOfficeWorkstation,
} from "./officeWorkstationLayout";
import {
  getCabinetIslandSeatingOverhangDepth,
  getCabinetIslandSupportPanelCount,
  getCabinetIslandSupportPanelDepth,
  getCabinetIslandSupportPanelEndInset,
  getCabinetIslandSupportPanelLocalXPositions,
  getCabinetIslandSupportPanelThickness,
  hasCabinetIslandSeating,
} from "./islandSeatingLayout";
import {
  getCabinetPantryPullOutOpeningHeight,
  getCabinetPantryPullOutOpeningWidth,
  getCabinetPantryPullOutRequiredHeight,
  getCabinetPantryPullOutSlideClearance,
  getCabinetPantryPullOutTrayCount,
  getCabinetPantryPullOutTrayDepth,
  getCabinetPantryPullOutTrayFrontHeight,
  hasCabinetPantryPullOuts,
} from "./pantryPullOutLayout";
import {
  getCabinetMediaCableChaseDepth,
  getCabinetMediaCableChaseHeight,
  getCabinetMediaCableChaseLocalX,
  getCabinetMediaCableChaseLocalY,
  getCabinetMediaCableChaseLocalZ,
  getCabinetMediaCableChaseWidth,
  getCabinetMediaTvBlockingLocalX,
  getCabinetMediaTvBlockingLocalY,
  getCabinetMediaTvBlockingLocalZ,
  getCabinetMediaTvBlockingThickness,
  getCabinetMediaTvMountHeight,
  getCabinetMediaTvOpeningHeight,
  getCabinetMediaTvOpeningWidth,
  getCabinetMediaVentSlotCount,
  getCabinetMediaVentSlotHeight,
  getCabinetMediaVentSlotSpacing,
  getCabinetMediaVentSlotTotalWidth,
  getCabinetMediaVentSlotWidth,
  hasCabinetMediaWallDetails,
} from "./mediaWallLayout";
import {
  getCabinetLibraryLadderRailDiameter,
  getCabinetLibraryLadderRailHeight,
  getCabinetLibraryLadderRailProjection,
  getCabinetLibraryLadderStandoffCount,
  getCabinetLibraryLadderStandoffDiameter,
  getCabinetLibraryLadderStandoffLocalXPositions,
  hasCabinetLibraryLadderRail,
} from "./libraryLadderLayout";
import {
  CABINET_DEFAULT_STEMWARE_RACK_RAIL_HEIGHT,
  getCabinetStemwareRackDepth,
  getCabinetStemwareRackLaneCount,
  getCabinetStemwareRackLaneSpacing,
  getCabinetStemwareRackMountHeight,
  getCabinetStemwareRackRailLocalXPositions,
  getCabinetStemwareRackRailWidth,
  getCabinetStemwareRackTotalWidth,
  hasCabinetStemwareRack,
} from "./stemwareRackLayout";
import {
  getCabinetLightingChannelCount,
  getCabinetLightingChannelDepth,
  getCabinetLightingChannelHeight,
  getCabinetLightingChannelInsetFromFront,
  getCabinetLightingChannelLocalYPositions,
  getCabinetLightingChannelLocalZ,
  getCabinetLightingChannelWidth,
  hasCabinetLightingChannels,
} from "./lightingLayout";
import {
  getCabinetHamperBasketCount,
  getCabinetHamperBasketDepth,
  getCabinetHamperBasketHeight,
  getCabinetHamperBasketLayouts,
  getCabinetHamperOpeningHeight,
  getCabinetHamperOpeningWidth,
  getCabinetHamperSlideClearance,
  hasCabinetHamperPullOut,
} from "./hamperPullOutLayout";
import {
  CABINET_SHELF_PIN_ROW_MARKER_DEPTH,
  getCabinetShelfPinHoleCount,
  getCabinetShelfPinHoleSpacing,
  getCabinetShelfPinInsetFromFront,
  getCabinetShelfPinRowHeight,
  getCabinetShelfPinRowLayouts,
  getCabinetShelfPinRowPairCount,
  getCabinetShelfPinStartHeight,
  hasCabinetShelfPinRows,
} from "./shelfPinLayout";
import {
  CABINET_DOOR_HINGE_MARKER_HEIGHT,
  getCabinetDoorFrontLayouts,
  getCabinetDoorHingeCountPerDoor,
  getCabinetDoorHingeInsetFromTopBottom,
  getCabinetDoorHingeLayouts,
  hasCabinetDoorHinges,
} from "./doorHingeLayout";
import {
  getCabinetDrawerFrontLayouts,
  getCabinetDrawerSlideClearance,
  getCabinetDrawerSlideLength,
  getCabinetDrawerSlideLayouts,
  hasCabinetDrawerSlides,
} from "./drawerSlideLayout";
import {
  getCabinetDrawerHeightMode,
  getCabinetEffectiveDoorCount,
  getCabinetHandleLocalPlacement,
  getCabinetHandlePlacementMode,
  isCabinetFrontHandleType,
} from "./frontBehavior";
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
  getCabinetInstallationCleatLayout,
  getCabinetInstallationCleatThickness,
  hasCabinetInstallationCleat,
} from "./installationCleatLayout";
import {
  CABINET_ANTI_TIP_ANCHOR_HEIGHT,
  CABINET_ANTI_TIP_ANCHOR_WIDTH,
  getCabinetAntiTipAnchorCount,
  getCabinetAntiTipAnchorHeight,
  getCabinetAntiTipAnchorInsetFromSides,
  getCabinetAntiTipAnchorLayouts,
  hasCabinetAntiTipAnchors,
} from "./antiTipAnchorLayout";
import {
  CABINET_DEFAULT_LEVELING_FOOT_COUNT,
  CABINET_DEFAULT_LEVELING_FOOT_DIAMETER,
  CABINET_DEFAULT_LEVELING_FOOT_HEIGHT,
  CABINET_DEFAULT_LEVELING_FOOT_INSET_FROM_FRONT_BACK,
  CABINET_DEFAULT_LEVELING_FOOT_INSET_FROM_SIDES,
  getCabinetLevelingFootCount,
  getCabinetLevelingFootDiameter,
  getCabinetLevelingFootHeight,
  getCabinetLevelingFootInsetFromFrontBack,
  getCabinetLevelingFootInsetFromSides,
  hasCabinetLevelingFeet,
  isCabinetLevelingFootEligibleModule,
} from "./levelingFootLayout";
import {
  CABINET_DEFAULT_FACE_FRAME_DEPTH,
  CABINET_DEFAULT_FACE_FRAME_RAIL_HEIGHT,
  CABINET_DEFAULT_FACE_FRAME_STILE_WIDTH,
  getCabinetFaceFrameDepth,
  getCabinetFaceFrameRailHeight,
  getCabinetFaceFrameStileWidth,
  hasCabinetFaceFrame,
  isCabinetFaceFrameEligibleModule,
} from "./faceFrameLayout";

const addWarning = (
  issues: CabinetValidationIssueDraft[],
  field: string,
  message: string
) => {
  issues.push({ severity: "warning", field, message });
};

const rangeWarning = (
  issues: CabinetValidationIssueDraft[],
  value: number,
  min: number,
  max: number,
  field: string,
  label: string
) => {
  if (value < min || value > max) {
    issues.push({
      severity: "warning",
      field,
      message: `${label} is unusual for cabinetry (${min}-${max} mm is typical).`,
    });
  }
};

export function validateCabinetDefinition(definition: CabinetDefinition): CabinetValidationResult {
  const issues: CabinetValidationIssueDraft[] = [];
  const assemblyType = getCabinetMillworkAssemblyType(definition);
  const family = getCabinetMillworkFamily(definition);
  const assemblyProfile = getMillworkAssemblyProfile(assemblyType, family);

  if (definition.units !== "mm") {
    issues.push({ severity: "error", field: "units", message: "Cabinet dimensions must use millimeters." });
  }
  if (
    definition.requiredHostType !== undefined &&
    !["Floor", "Wall", "Ceiling", "Flexible"].includes(
      String(definition.requiredHostType)
    )
  ) {
    issues.push({
      severity: "error",
      field: "requiredHostType",
      message: "Required host type must be Floor, Wall, Ceiling, or Flexible.",
    });
  }
  if (
    definition.sourcePresetId !== undefined &&
    (typeof definition.sourcePresetId !== "string" ||
      !definition.sourcePresetId.trim())
  ) {
    issues.push({
      severity: "error",
      field: "sourcePresetId",
      message: "Source preset identity must be a non-empty string when provided.",
    });
  }

  if (definition.totalWidth <= 0) issues.push({ severity: "error", field: "totalWidth", message: "Width must be positive." });
  if (definition.height <= 0) issues.push({ severity: "error", field: "height", message: "Height must be positive." });
  if (definition.depth <= 0) issues.push({ severity: "error", field: "depth", message: "Depth must be positive." });
  if (definition.boardThickness <= 0) {
    issues.push({ severity: "error", field: "boardThickness", message: "Board thickness must be positive." });
  }
  if (definition.backPanelThickness <= 0) {
    issues.push({ severity: "error", field: "backPanelThickness", message: "Back panel thickness must be positive." });
  }
  if (definition.toeKickHeight < 0) {
    issues.push({ severity: "error", field: "toeKickHeight", message: "Toe kick height cannot be negative." });
  }
  if ((definition.toeKickSetback ?? 0) < 0) {
    issues.push({ severity: "error", field: "toeKickSetback", message: "Toe kick setback cannot be negative." });
  }
  if ((definition.toeKickDepth ?? 0) < 0) {
    issues.push({ severity: "error", field: "toeKickDepth", message: "Toe kick depth cannot be negative." });
  }
  if (definition.revealGap < 0) {
    issues.push({ severity: "error", field: "revealGap", message: "Reveal gap cannot be negative." });
  }

  rangeWarning(issues, definition.boardThickness, 12, 25, "boardThickness", "Board thickness");
  rangeWarning(issues, definition.backPanelThickness, 3, 12, "backPanelThickness", "Back panel thickness");
  rangeWarning(issues, definition.toeKickHeight, 0, 180, "toeKickHeight", "Toe kick height");
  rangeWarning(issues, definition.revealGap, 1, 6, "revealGap", "Reveal gap");

  if (!definition.modules.length) {
    issues.push({ severity: "error", field: "modules", message: "Cabinet must include at least one module." });
  }

  const leftFillerWidth = getCabinetLeftFillerWidth(definition);
  const rightFillerWidth = getCabinetRightFillerWidth(definition);
  const leftFillerScribeAllowance = getCabinetLeftFillerScribeAllowance(definition);
  const rightFillerScribeAllowance = getCabinetRightFillerScribeAllowance(definition);
  const leftEndPanelThickness = getCabinetLeftEndPanelThickness(definition);
  const rightEndPanelThickness = getCabinetRightEndPanelThickness(definition);
  const countertopThickness = getCabinetCountertopThickness(definition);
  const countertopOverhangLeft = getCabinetCountertopOverhangLeft(definition);
  const countertopOverhangRight = getCabinetCountertopOverhangRight(definition);
  const countertopOverhangFront = getCabinetCountertopOverhangFront(definition);
  const countertopOverhangBack = getCabinetCountertopOverhangBack(definition);
  const backsplashHeight = getCabinetBacksplashHeight(definition);
  const backsplashThickness = getCabinetBacksplashThickness(definition);
  const levelingFootCount = getCabinetLevelingFootCount(definition);
  const levelingFootHeight = getCabinetLevelingFootHeight(definition);
  const levelingFootDiameter = getCabinetLevelingFootDiameter(definition);
  const levelingFootInsetFromSides = getCabinetLevelingFootInsetFromSides(definition);
  const levelingFootInsetFromFrontBack = getCabinetLevelingFootInsetFromFrontBack(definition);
  const faceFrameStileWidth = getCabinetFaceFrameStileWidth(definition);
  const faceFrameRailHeight = getCabinetFaceFrameRailHeight(definition);
  const faceFrameDepth = getCabinetFaceFrameDepth(definition);

  if ((definition.leftFillerWidth ?? 0) < 0) {
    issues.push({ severity: "error", field: "leftFillerWidth", message: "Left filler width cannot be negative." });
  }
  if ((definition.rightFillerWidth ?? 0) < 0) {
    issues.push({ severity: "error", field: "rightFillerWidth", message: "Right filler width cannot be negative." });
  }
  if ((definition.leftFillerScribeAllowance ?? 0) < 0) {
    issues.push({ severity: "error", field: "leftFillerScribeAllowance", message: "Left filler scribe allowance cannot be negative." });
  }
  if ((definition.rightFillerScribeAllowance ?? 0) < 0) {
    issues.push({ severity: "error", field: "rightFillerScribeAllowance", message: "Right filler scribe allowance cannot be negative." });
  }
  if (leftFillerScribeAllowance > 0 && leftFillerWidth <= 0) {
    issues.push({ severity: "error", field: "leftFillerScribeAllowance", message: "Left filler scribe allowance needs a left filler width." });
  }
  if (rightFillerScribeAllowance > 0 && rightFillerWidth <= 0) {
    issues.push({ severity: "error", field: "rightFillerScribeAllowance", message: "Right filler scribe allowance needs a right filler width." });
  }
  if (leftFillerWidth > 150) {
    addWarning(
      issues,
      "leftFillerWidth",
      "Left fillers wider than 150 mm should be split, scribed, or reviewed as a custom return panel."
    );
  }
  if (rightFillerWidth > 150) {
    addWarning(
      issues,
      "rightFillerWidth",
      "Right fillers wider than 150 mm should be split, scribed, or reviewed as a custom return panel."
    );
  }
  if (leftFillerScribeAllowance > 25) {
    addWarning(
      issues,
      "leftFillerScribeAllowance",
      "Left filler scribe allowance over 25 mm should be field-verified against wall plumb and final site measurements."
    );
  }
  if (rightFillerScribeAllowance > 25) {
    addWarning(
      issues,
      "rightFillerScribeAllowance",
      "Right filler scribe allowance over 25 mm should be field-verified against wall plumb and final site measurements."
    );
  }
  if (definition.includeLeftEndPanel && (definition.leftEndPanelThickness ?? CABINET_DEFAULT_END_PANEL_THICKNESS) <= 0) {
    issues.push({ severity: "error", field: "leftEndPanelThickness", message: "Left finished end panel thickness must be positive." });
  }
  if (definition.includeRightEndPanel && (definition.rightEndPanelThickness ?? CABINET_DEFAULT_END_PANEL_THICKNESS) <= 0) {
    issues.push({ severity: "error", field: "rightEndPanelThickness", message: "Right finished end panel thickness must be positive." });
  }
  if (!definition.includeLeftEndPanel && (definition.leftEndPanelThickness ?? 0) < 0) {
    issues.push({ severity: "error", field: "leftEndPanelThickness", message: "Left finished end panel thickness cannot be negative." });
  }
  if (!definition.includeRightEndPanel && (definition.rightEndPanelThickness ?? 0) < 0) {
    issues.push({ severity: "error", field: "rightEndPanelThickness", message: "Right finished end panel thickness cannot be negative." });
  }
  if (leftEndPanelThickness > 0 && leftEndPanelThickness < 12) {
    addWarning(
      issues,
      "leftEndPanelThickness",
      "Left finished end panels under 12 mm should be reviewed for stiffness, fastening, and finish durability."
    );
  }
  if (rightEndPanelThickness > 0 && rightEndPanelThickness < 12) {
    addWarning(
      issues,
      "rightEndPanelThickness",
      "Right finished end panels under 12 mm should be reviewed for stiffness, fastening, and finish durability."
    );
  }
  if (leftEndPanelThickness > 30) {
    addWarning(
      issues,
      "leftEndPanelThickness",
      "Left finished end panels over 30 mm should be reviewed for weight, reveal alignment, and adjacent clearances."
    );
  }
  if (rightEndPanelThickness > 30) {
    addWarning(
      issues,
      "rightEndPanelThickness",
      "Right finished end panels over 30 mm should be reviewed for weight, reveal alignment, and adjacent clearances."
    );
  }

  if (definition.includeCountertop) {
    if ((definition.countertopThickness ?? CABINET_DEFAULT_COUNTERTOP_THICKNESS) <= 0) {
      issues.push({ severity: "error", field: "countertopThickness", message: "Countertop thickness must be positive." });
    }
    if ((definition.countertopOverhangLeft ?? CABINET_DEFAULT_COUNTERTOP_SIDE_OVERHANG) < 0) {
      issues.push({ severity: "error", field: "countertopOverhangLeft", message: "Left countertop overhang cannot be negative." });
    }
    if ((definition.countertopOverhangRight ?? CABINET_DEFAULT_COUNTERTOP_SIDE_OVERHANG) < 0) {
      issues.push({ severity: "error", field: "countertopOverhangRight", message: "Right countertop overhang cannot be negative." });
    }
    if ((definition.countertopOverhangFront ?? CABINET_DEFAULT_COUNTERTOP_FRONT_OVERHANG) < 0) {
      issues.push({ severity: "error", field: "countertopOverhangFront", message: "Front countertop overhang cannot be negative." });
    }
    if ((definition.countertopOverhangBack ?? 0) < 0) {
      issues.push({ severity: "error", field: "countertopOverhangBack", message: "Back countertop overhang cannot be negative." });
    }
    if (countertopThickness > 80) {
      addWarning(
        issues,
        "countertopThickness",
        "Countertops thicker than 80 mm should be reviewed for fabrication build-up, weight, and appliance clearances."
      );
    }
    if (countertopOverhangLeft > 300 || countertopOverhangRight > 300 || countertopOverhangFront > 300 || countertopOverhangBack > 300) {
      addWarning(
        issues,
        "countertopOverhangFront",
        "Countertop overhangs over 300 mm may need brackets, hidden steel, legs, or specialty engineering."
      );
    }
  }

  if (definition.includeBacksplash) {
    if (!definition.includeCountertop) {
      issues.push({
        severity: "error",
        field: "includeBacksplash",
        message: "Backsplash/upstand details require an enabled countertop/worktop.",
      });
    }
    if ((definition.backsplashHeight ?? CABINET_DEFAULT_BACKSPLASH_HEIGHT) <= 0) {
      issues.push({ severity: "error", field: "backsplashHeight", message: "Backsplash/upstand height must be positive." });
    }
    if ((definition.backsplashThickness ?? CABINET_DEFAULT_BACKSPLASH_THICKNESS) <= 0) {
      issues.push({ severity: "error", field: "backsplashThickness", message: "Backsplash/upstand thickness must be positive." });
    }
    if (backsplashHeight > 450) {
      addWarning(
        issues,
        "backsplashHeight",
        "Backsplashes/upstands over 450 mm should be reviewed for outlet conflicts, wall fixing, seams, and splash-panel intent."
      );
    }
    if (backsplashThickness > 40) {
      addWarning(
        issues,
        "backsplashThickness",
        "Backsplashes/upstands thicker than 40 mm should be reviewed for countertop seam buildup and outlet clearances."
      );
    }
    if (backsplashThickness > 0 && backsplashThickness < 10) {
      addWarning(
        issues,
        "backsplashThickness",
        "Backsplashes/upstands under 10 mm should be reviewed for stiffness, adhesive support, and exposed edge durability."
      );
    }
  }

  if (hasCabinetLevelingFeet(definition)) {
    const eligibleModules = definition.modules.filter(isCabinetLevelingFootEligibleModule);
    if (eligibleModules.length === 0) {
      issues.push({
        severity: "error",
        field: "levelingFeetEnabled",
        message: "Leveling feet require at least one floor-supported cabinet module.",
      });
    }
    if ((definition.levelingFootCount ?? CABINET_DEFAULT_LEVELING_FOOT_COUNT) <= 0) {
      issues.push({ severity: "error", field: "levelingFootCount", message: "Leveling feet need at least one foot per eligible module." });
    }
    if ((definition.levelingFootHeight ?? CABINET_DEFAULT_LEVELING_FOOT_HEIGHT) <= 0) {
      issues.push({ severity: "error", field: "levelingFootHeight", message: "Leveling foot height must be positive." });
    }
    if ((definition.levelingFootDiameter ?? CABINET_DEFAULT_LEVELING_FOOT_DIAMETER) <= 0) {
      issues.push({ severity: "error", field: "levelingFootDiameter", message: "Leveling foot diameter must be positive." });
    }
    if ((definition.levelingFootInsetFromSides ?? CABINET_DEFAULT_LEVELING_FOOT_INSET_FROM_SIDES) < 0) {
      issues.push({ severity: "error", field: "levelingFootInsetFromSides", message: "Leveling foot side inset cannot be negative." });
    }
    if ((definition.levelingFootInsetFromFrontBack ?? CABINET_DEFAULT_LEVELING_FOOT_INSET_FROM_FRONT_BACK) < 0) {
      issues.push({ severity: "error", field: "levelingFootInsetFromFrontBack", message: "Leveling foot front/back inset cannot be negative." });
    }
    for (const eligibleModule of eligibleModules) {
      if (levelingFootInsetFromSides * 2 + levelingFootDiameter > eligibleModule.width) {
        issues.push({
          severity: "error",
          field: "levelingFootInsetFromSides",
          message: `Leveling foot side insets and diameter must fit within ${eligibleModule.id} width.`,
        });
      }
      if (levelingFootInsetFromFrontBack * 2 + levelingFootDiameter > eligibleModule.depth) {
        issues.push({
          severity: "error",
          field: "levelingFootInsetFromFrontBack",
          message: `Leveling foot front/back insets and diameter must fit within ${eligibleModule.id} depth.`,
        });
      }
    }
    if (definition.toeKickHeight > 0 && levelingFootHeight > definition.toeKickHeight) {
      addWarning(
        issues,
        "levelingFootHeight",
        "Leveling feet taller than the toe-kick height should be reviewed for plinth coverage and final cabinet elevation."
      );
    }
    if (levelingFootCount < 4 && eligibleModules.some((module) => module.width > 700 || module.depth > 450)) {
      addWarning(
        issues,
        "levelingFootCount",
        "Wide or deep floor-supported modules with fewer than four leveling feet should be reviewed for load support and sag."
      );
    }
    if (levelingFootDiameter < 25) {
      addWarning(
        issues,
        "levelingFootDiameter",
        "Leveling feet under 25 mm diameter should be reviewed for load rating, floor protection, and adjustment access."
      );
    }
  }

  if (hasCabinetFaceFrame(definition)) {
    const eligibleModules = definition.modules.filter(isCabinetFaceFrameEligibleModule);
    if (eligibleModules.length === 0) {
      issues.push({
        severity: "error",
        field: "faceFrameEnabled",
        message: "Face frames require at least one cabinet module.",
      });
    }
    if ((definition.faceFrameStileWidth ?? CABINET_DEFAULT_FACE_FRAME_STILE_WIDTH) <= 0) {
      issues.push({ severity: "error", field: "faceFrameStileWidth", message: "Face frame stile width must be positive." });
    }
    if ((definition.faceFrameRailHeight ?? CABINET_DEFAULT_FACE_FRAME_RAIL_HEIGHT) <= 0) {
      issues.push({ severity: "error", field: "faceFrameRailHeight", message: "Face frame rail height must be positive." });
    }
    if ((definition.faceFrameDepth ?? CABINET_DEFAULT_FACE_FRAME_DEPTH) <= 0) {
      issues.push({ severity: "error", field: "faceFrameDepth", message: "Face frame depth must be positive." });
    }
    for (const eligibleModule of eligibleModules) {
      const frameHeight = eligibleModule.height - Math.min(definition.toeKickHeight, Math.max(0, eligibleModule.height));
      if (faceFrameStileWidth * 2 >= eligibleModule.width) {
        issues.push({
          severity: "error",
          field: "faceFrameStileWidth",
          message: `Face frame stiles must leave a usable opening within ${eligibleModule.id}.`,
        });
      }
      if (faceFrameRailHeight * 2 >= frameHeight) {
        issues.push({
          severity: "error",
          field: "faceFrameRailHeight",
          message: `Face frame rails must fit within ${eligibleModule.id} front height.`,
        });
      }
    }
    if (faceFrameStileWidth > 0 && faceFrameStileWidth < 25) {
      addWarning(
        issues,
        "faceFrameStileWidth",
        "Face frame stiles under 25 mm should be reviewed for joinery, hinge fixing, and finish durability."
      );
    }
    if (faceFrameRailHeight > 0 && faceFrameRailHeight < 25) {
      addWarning(
        issues,
        "faceFrameRailHeight",
        "Face frame rails under 25 mm should be reviewed for joinery, drawer clearances, and reveal consistency."
      );
    }
    if (faceFrameDepth > 30) {
      addWarning(
        issues,
        "faceFrameDepth",
        "Face frames deeper than 30 mm should be reviewed against door overlay, drawer projection, and hinge geometry."
      );
    }
  }

  if ((definition.islandSeatingOverhangDepth ?? 0) < 0) {
    issues.push({ severity: "error", field: "islandSeatingOverhangDepth", message: "Island seating overhang depth cannot be negative." });
  }
  if ((definition.islandSupportPanelCount ?? 0) < 0) {
    issues.push({ severity: "error", field: "islandSupportPanelCount", message: "Island support panel count cannot be negative." });
  }
  if (typeof definition.islandSupportPanelThickness === "number" && definition.islandSupportPanelThickness <= 0) {
    issues.push({ severity: "error", field: "islandSupportPanelThickness", message: "Island support panel thickness must be positive." });
  }
  if (typeof definition.islandSupportPanelDepth === "number" && definition.islandSupportPanelDepth <= 0) {
    issues.push({ severity: "error", field: "islandSupportPanelDepth", message: "Island support panel depth must be positive." });
  }
  if ((definition.islandSupportPanelEndInset ?? 0) < 0) {
    issues.push({ severity: "error", field: "islandSupportPanelEndInset", message: "Island support panel end inset cannot be negative." });
  }

  if (hasCabinetIslandSeating(definition)) {
    const islandSeatingOverhangDepth = getCabinetIslandSeatingOverhangDepth(definition);
    const islandSupportPanelCount = getCabinetIslandSupportPanelCount(definition);
    const islandSupportPanelThickness = getCabinetIslandSupportPanelThickness(definition);
    const islandSupportPanelDepth = getCabinetIslandSupportPanelDepth(definition);
    const islandSupportPanelEndInset = getCabinetIslandSupportPanelEndInset(definition);
    const overallWidth = getCabinetOverallWidth(definition);
    const supportPanelPositions = getCabinetIslandSupportPanelLocalXPositions(definition, overallWidth);

    if (!definition.includeCountertop) {
      issues.push({ severity: "error", field: "includeCountertop", message: "Island seating overhangs require a countertop/worktop." });
    }
    if (islandSeatingOverhangDepth <= 0) {
      issues.push({ severity: "error", field: "islandSeatingOverhangDepth", message: "Island seating overhang depth must be positive." });
    }
    if (definition.includeCountertop && islandSeatingOverhangDepth > countertopOverhangBack) {
      issues.push({
        severity: "error",
        field: "countertopOverhangBack",
        message: "Back countertop overhang must cover the configured island seating overhang.",
      });
    }
    if (islandSupportPanelDepth > islandSeatingOverhangDepth) {
      issues.push({
        severity: "error",
        field: "islandSupportPanelDepth",
        message: "Island support panel depth cannot exceed the seating overhang depth.",
      });
    }
    if (islandSupportPanelCount > 0 && islandSupportPanelCount * islandSupportPanelThickness >= overallWidth) {
      issues.push({
        severity: "error",
        field: "islandSupportPanelCount",
        message: "Island support panels exceed the available countertop width.",
      });
    }
    if (islandSupportPanelCount > 1 && islandSupportPanelEndInset * 2 >= overallWidth) {
      issues.push({
        severity: "error",
        field: "islandSupportPanelEndInset",
        message: "Island support panel end inset leaves no span for intermediate panels.",
      });
    }
    if (islandSeatingOverhangDepth > 350) {
      addWarning(
        issues,
        "islandSeatingOverhangDepth",
        "Island seating overhangs over 350 mm should be reviewed with the countertop fabricator for brackets, hidden steel, legs, or support panels."
      );
    }
    if (islandSupportPanelCount === 0 && islandSeatingOverhangDepth > 250) {
      addWarning(
        issues,
        "islandSupportPanelCount",
        "Island seating overhangs over 250 mm without visible support panels need hidden support or engineering review."
      );
    }
    if (supportPanelPositions.length > 1) {
      const maxSupportSpacing = supportPanelPositions.slice(1).reduce((max, position, index) => {
        return Math.max(max, position - supportPanelPositions[index]);
      }, 0);
      if (maxSupportSpacing > 900) {
        addWarning(
          issues,
          "islandSupportPanelCount",
          "Island support panels spaced over 900 mm should be reviewed for countertop support and knee clearance."
        );
      }
    }
    if (islandSupportPanelThickness < 24 && islandSupportPanelCount > 0) {
      addWarning(
        issues,
        "islandSupportPanelThickness",
        "Island support panels thinner than 24 mm should be reviewed for stiffness, anchoring, and visible edge treatment."
      );
    }
  }

  for (const [index, module] of definition.modules.entries()) {
    const prefix = `modules.${index}`;

    const validGrainDirections = ["vertical", "horizontal", "none"];
    const validEdgeTreatments = [
      "matching_edge_band",
      "contrasting_edge_band",
      "solid_lipping",
      "painted_edge",
      "none",
    ];
    const validExposedFaces = ["front", "back", "left", "right", "top", "bottom"];
    if (
      typeof module.grainDirection !== "undefined" &&
      !validGrainDirections.includes(module.grainDirection)
    ) {
      issues.push({
        severity: "error",
        field: `${prefix}.grainDirection`,
        message: "Choose vertical, horizontal, or no grain direction.",
      });
    }
    if (
      typeof module.edgeTreatment !== "undefined" &&
      !validEdgeTreatments.includes(module.edgeTreatment)
    ) {
      issues.push({
        severity: "error",
        field: `${prefix}.edgeTreatment`,
        message: "Choose a supported edge treatment.",
      });
    }
    if (
      module.exposedFaces &&
      (module.exposedFaces.some((face) => !validExposedFaces.includes(face)) ||
        new Set(module.exposedFaces).size !== module.exposedFaces.length)
    ) {
      issues.push({
        severity: "error",
        field: `${prefix}.exposedFaces`,
        message: "Exposed faces must use unique front, back, left, right, top, or bottom selections.",
      });
    }

    const moduleMaterial = definition.materials.find((material) => material.id === module.materialId);
    const frontMaterial = definition.materials.find(
      (material) => material.id === (module.frontMaterialId ?? module.materialId)
    );
    if (!moduleMaterial) {
      issues.push({
        severity: "error",
        field: `${prefix}.materialId`,
        message: "Select a carcass material that is available in this design.",
      });
    }
    if (!frontMaterial) {
      issues.push({
        severity: "error",
        field: `${prefix}.frontMaterialId`,
        message: "Select a front material that is available in this design.",
      });
    }
    if (
      module.edgeTreatment === "contrasting_edge_band" &&
      (!module.edgeMaterialId ||
        !definition.materials.some((material) => material.id === module.edgeMaterialId))
    ) {
      issues.push({
        severity: "error",
        field: `${prefix}.edgeMaterialId`,
        message: "Contrasting edge banding needs an edge material from this design.",
      });
    }
    if (
      module.edgeTreatment === "contrasting_edge_band" &&
      module.edgeMaterialId &&
      module.edgeMaterialId === module.materialId &&
      module.edgeMaterialId === (module.frontMaterialId ?? module.materialId)
    ) {
      issues.push({
        severity: "warning",
        field: `${prefix}.edgeMaterialId`,
        message: "The selected contrasting edge matches the panel finish; choose another material or use matching edge banding.",
      });
    }
    if (module.edgeTreatment && module.edgeTreatment !== "none") {
      const unsupportedMaterial = [moduleMaterial, frontMaterial].find(
        (material) =>
          material?.supportedEdgeTreatments?.length &&
          !material.supportedEdgeTreatments.includes(module.edgeTreatment!)
      );
      if (unsupportedMaterial) {
        issues.push({
          severity: "error",
          field: `${prefix}.edgeTreatment`,
          message: `${unsupportedMaterial.name} does not support the selected edge treatment. Choose a compatible treatment or material.`,
        });
      }
    }
    if (
      module.grainDirection &&
      module.grainDirection !== "none" &&
      [moduleMaterial, frontMaterial].every(
        (material) => material?.grainBehavior === "non_directional"
      )
    ) {
      issues.push({
        severity: "warning",
        field: `${prefix}.grainDirection`,
        message: "These finishes are non-directional, so the grain override will not change fabrication orientation.",
      });
    }

    const selectedHardware = module.hardwareId
      ? definition.hardware.find((hardware) => hardware.id === module.hardwareId)
      : undefined;
    if (module.hardwareId && !selectedHardware) {
      issues.push({
        code: "front.hardware.unavailable",
        severity: "error",
        field: `${prefix}.hardwareId`,
        message:
          "The selected opening hardware is not available in this design. Choose another opening method.",
      });
    } else if (selectedHardware && (module.millworkComponentType ?? "cabinet") === "cabinet") {
      const compatibility = resolveCabinetHardwareCompatibility(selectedHardware, module);
      const compatibilityMessage = compatibility.reasons
        .filter((reason) => reason.code !== "compatible")
        .map((reason) => reason.message)
        .join(" ");
      if (compatibility.status === "incompatible") {
        issues.push({
          code: "front.hardware.incompatible",
          severity: "error",
          field: `${prefix}.hardwareId`,
          message: compatibilityMessage || "The selected hardware is not compatible with this front layout.",
        });
      } else if (compatibility.status === "review_required") {
        issues.push({
          code: "front.hardware.review_required",
          severity: "warning",
          field: `${prefix}.hardwareId`,
          message: compatibilityMessage || "Review this hardware against the selected front before fabrication.",
        });
      }
    }

    if (
      module.doorLayoutMode !== undefined &&
      module.doorLayoutMode !== "recommended" &&
      module.doorLayoutMode !== "manual"
    ) {
      issues.push({
        severity: "error",
        field: `${prefix}.doorLayoutMode`,
        message: "Choose Recommended or Manual for the door layout.",
      });
    }
    if (
      module.drawerHeightMode !== undefined &&
      !["equal", "recommended", "custom"].includes(module.drawerHeightMode)
    ) {
      issues.push({
        severity: "error",
        field: `${prefix}.drawerHeightMode`,
        message: "Choose Equal, Recommended, or Custom for drawer heights.",
      });
    }
    if (getCabinetDrawerHeightMode(module) === "custom") {
      if (
        !Array.isArray(module.drawerHeightProportions) ||
        module.drawerHeightProportions.length !== Math.max(0, Math.floor(module.drawerCount))
      ) {
        issues.push({
          severity: "error",
          field: `${prefix}.drawerHeightProportions`,
          message: "Custom drawer heights need one positive proportion for every drawer. Reset the proportions or change the drawer count.",
        });
      } else if (
        module.drawerHeightProportions.some(
          (proportion) => !Number.isFinite(proportion) || proportion <= 0
        )
      ) {
        issues.push({
          severity: "error",
          field: `${prefix}.drawerHeightProportions`,
          message: "Every custom drawer proportion must be greater than zero.",
        });
      }
    }

    if (
      module.handlePlacementMode !== undefined &&
      module.handlePlacementMode !== "automatic" &&
      module.handlePlacementMode !== "custom"
    ) {
      issues.push({
        severity: "error",
        field: `${prefix}.handlePlacementMode`,
        message: "Choose Automatic or Custom for handle placement.",
      });
    }
    if (getCabinetHandlePlacementMode(module) === "custom") {
      if (
        typeof module.handleOffsetX !== "number" ||
        !Number.isFinite(module.handleOffsetX) ||
        typeof module.handleOffsetY !== "number" ||
        !Number.isFinite(module.handleOffsetY)
      ) {
        issues.push({
          severity: "error",
          field: `${prefix}.handlePlacementMode`,
          message: "Custom handle placement needs valid horizontal and vertical offsets.",
        });
      } else if (selectedHardware && isCabinetFrontHandleType(selectedHardware.type)) {
        const frontLayouts = [
          ...getCabinetDoorFrontLayouts(definition, module),
          ...getCabinetDrawerFrontLayouts(definition, module),
        ];
        const outOfBounds = frontLayouts.some((front) => {
          const placement = getCabinetHandleLocalPlacement(
            module,
            selectedHardware.type,
            front.width,
            front.height
          );
          return Boolean(
            placement &&
              (placement.x < 0 ||
                placement.y < 0 ||
                placement.x + placement.width > front.width ||
                placement.y + placement.height > front.height)
          );
        });
        if (outOfBounds) {
          issues.push({
            severity: "error",
            field: `${prefix}.handlePlacementMode`,
            message: "The custom handle offset moves at least one handle outside its front. Reduce the horizontal or vertical shift.",
          });
        }
      } else {
        issues.push({
          severity: "warning",
          field: `${prefix}.handlePlacementMode`,
          message: "Custom handle offsets apply only to a knob, bar pull, or edge pull. Choose front hardware or return to Automatic.",
        });
      }
    }

    if (module.width <= 0) issues.push({ severity: "error", field: `${prefix}.width`, message: "Module width must be positive." });
    if (module.height <= 0) issues.push({ severity: "error", field: `${prefix}.height`, message: "Module height must be positive." });
    if (module.depth <= 0) issues.push({ severity: "error", field: `${prefix}.depth`, message: "Module depth must be positive." });
    if (module.drawerCount < 0) issues.push({ severity: "error", field: `${prefix}.drawerCount`, message: "Drawer count cannot be negative." });
    if (module.doorCount < 0) issues.push({ severity: "error", field: `${prefix}.doorCount`, message: "Door count cannot be negative." });
    if (module.shelfCount < 0) issues.push({ severity: "error", field: `${prefix}.shelfCount`, message: "Shelf count cannot be negative." });
    if ((module.verticalDividerCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.verticalDividerCount`, message: "Vertical divider count cannot be negative." });
    }
    if ((module.hangingRodCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.hangingRodCount`, message: "Hanging rod count cannot be negative." });
    }
    if (typeof module.hangingRodHeight === "number" && module.hangingRodHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.hangingRodHeight`, message: "Hanging rod height must be positive." });
    }
    if (typeof module.hangingRodSpacing === "number" && module.hangingRodSpacing < 0) {
      issues.push({ severity: "error", field: `${prefix}.hangingRodSpacing`, message: "Hanging rod spacing cannot be negative." });
    }
    if ((module.slatCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.slatCount`, message: "Slat count cannot be negative." });
    }
    if (typeof module.slatWidth === "number" && module.slatWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.slatWidth`, message: "Slat width must be positive." });
    }
    if (typeof module.slatDepth === "number" && module.slatDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.slatDepth`, message: "Slat depth must be positive." });
    }
    if (typeof module.slatSpacing === "number" && module.slatSpacing < 0) {
      issues.push({ severity: "error", field: `${prefix}.slatSpacing`, message: "Slat spacing cannot be negative." });
    }
    if ((module.panelColumnCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.panelColumnCount`, message: "Panel column count cannot be negative." });
    }
    if ((module.panelRowCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.panelRowCount`, message: "Panel row count cannot be negative." });
    }
    if (typeof module.panelFrameWidth === "number" && module.panelFrameWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.panelFrameWidth`, message: "Panel rail/stile width must be positive." });
    }
    if (typeof module.panelFrameDepth === "number" && module.panelFrameDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.panelFrameDepth`, message: "Panel rail/stile projection must be positive." });
    }
    if (typeof module.millworkComponentType === "string") {
      const validComponentTypes = [
        "cabinet",
        "ceiling_beam_array",
        "coffered_ceiling_grid",
        "trim_run",
        "fireplace_surround_frame",
        "wall_bed_panel",
        "fold_down_worksurface",
      ];
      if (!validComponentTypes.includes(module.millworkComponentType)) {
        issues.push({ severity: "error", field: `${prefix}.millworkComponentType`, message: "Millwork component type is not supported." });
      }
    }
    if ((module.ceilingBeamCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.ceilingBeamCount`, message: "Ceiling beam count cannot be negative." });
    }
    if (typeof module.ceilingBeamWidth === "number" && module.ceilingBeamWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.ceilingBeamWidth`, message: "Ceiling beam width must be positive." });
    }
    if (typeof module.ceilingBeamDepth === "number" && module.ceilingBeamDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.ceilingBeamDepth`, message: "Ceiling beam depth must be positive." });
    }
    if (
      typeof module.ceilingBeamOrientation !== "undefined" &&
      module.ceilingBeamOrientation !== "x" &&
      module.ceilingBeamOrientation !== "z"
    ) {
      issues.push({ severity: "error", field: `${prefix}.ceilingBeamOrientation`, message: "Ceiling beam orientation must be x or z." });
    }
    if ((module.ceilingGridColumnCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.ceilingGridColumnCount`, message: "Ceiling grid column count cannot be negative." });
    }
    if ((module.ceilingGridRowCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.ceilingGridRowCount`, message: "Ceiling grid row count cannot be negative." });
    }
    if ((module.trimMemberCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.trimMemberCount`, message: "Trim member count cannot be negative." });
    }
    if (typeof module.trimProfileWidth === "number" && module.trimProfileWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.trimProfileWidth`, message: "Trim profile width must be positive." });
    }
    if (typeof module.trimProfileDepth === "number" && module.trimProfileDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.trimProfileDepth`, message: "Trim profile depth must be positive." });
    }
    if (
      typeof module.trimOrientation !== "undefined" &&
      module.trimOrientation !== "x" &&
      module.trimOrientation !== "z"
    ) {
      issues.push({ severity: "error", field: `${prefix}.trimOrientation`, message: "Trim orientation must be x or z." });
    }
    if (
      typeof module.trimPlacement !== "undefined" &&
      module.trimPlacement !== "baseboard" &&
      module.trimPlacement !== "crown_moulding" &&
      module.trimPlacement !== "casing" &&
      module.trimPlacement !== "chair_rail" &&
      module.trimPlacement !== "picture_rail" &&
      module.trimPlacement !== "generic_trim"
    ) {
      issues.push({ severity: "error", field: `${prefix}.trimPlacement`, message: "Trim placement must be a supported trim type." });
    }
    if (typeof module.trimSetoutHeight === "number" && module.trimSetoutHeight < 0) {
      issues.push({ severity: "error", field: `${prefix}.trimSetoutHeight`, message: "Trim setout height cannot be negative." });
    }
    for (const field of ["trimLeftEndTreatment", "trimRightEndTreatment"] as const) {
      const treatment = module[field];
      if (
        typeof treatment !== "undefined" &&
        treatment !== "butt" &&
        treatment !== "mitered_return" &&
        treatment !== "coped" &&
        treatment !== "scribed"
      ) {
        issues.push({ severity: "error", field: `${prefix}.${field}`, message: "Trim end treatment must be butt, mitered return, coped, or scribed." });
      }
    }
    if (typeof module.trimReturnDepth === "number" && module.trimReturnDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.trimReturnDepth`, message: "Trim return depth must be positive." });
    }
    if (typeof module.trimMiterAngle === "number" && (module.trimMiterAngle <= 0 || module.trimMiterAngle >= 90)) {
      issues.push({ severity: "error", field: `${prefix}.trimMiterAngle`, message: "Trim miter angle must be between 0 and 90 degrees." });
    }
    if (typeof module.trimRevealStripEnabled !== "undefined" && typeof module.trimRevealStripEnabled !== "boolean") {
      issues.push({ severity: "error", field: `${prefix}.trimRevealStripEnabled`, message: "Trim reveal strip enablement must be true or false." });
    }
    if (typeof module.trimRevealStripHeight === "number" && module.trimRevealStripHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.trimRevealStripHeight`, message: "Trim reveal strip height must be positive." });
    }
    if (typeof module.trimRevealStripDepth === "number" && module.trimRevealStripDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.trimRevealStripDepth`, message: "Trim reveal strip depth must be positive." });
    }
    if (typeof module.trimRevealStripInsetFromTop === "number" && module.trimRevealStripInsetFromTop < 0) {
      issues.push({ severity: "error", field: `${prefix}.trimRevealStripInsetFromTop`, message: "Trim reveal strip inset cannot be negative." });
    }
    if (typeof module.fireplaceOpeningWidth === "number" && module.fireplaceOpeningWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.fireplaceOpeningWidth`, message: "Fireplace opening width must be positive." });
    }
    if (typeof module.fireplaceOpeningHeight === "number" && module.fireplaceOpeningHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.fireplaceOpeningHeight`, message: "Fireplace opening height must be positive." });
    }
    if (typeof module.fireplaceLegWidth === "number" && module.fireplaceLegWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.fireplaceLegWidth`, message: "Fireplace leg width must be positive." });
    }
    if (typeof module.fireplaceHeaderHeight === "number" && module.fireplaceHeaderHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.fireplaceHeaderHeight`, message: "Fireplace header height must be positive." });
    }
    if (typeof module.fireplaceMantelHeight === "number" && module.fireplaceMantelHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.fireplaceMantelHeight`, message: "Fireplace mantel height must be positive." });
    }
    if (typeof module.fireplaceMantelDepth === "number" && module.fireplaceMantelDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.fireplaceMantelDepth`, message: "Fireplace mantel depth must be positive." });
    }
    if (typeof module.convertiblePanelThickness === "number" && module.convertiblePanelThickness <= 0) {
      issues.push({ severity: "error", field: `${prefix}.convertiblePanelThickness`, message: "Convertible panel thickness must be positive." });
    }
    if (typeof module.convertiblePanelHeight === "number" && module.convertiblePanelHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.convertiblePanelHeight`, message: "Convertible panel height must be positive." });
    }
    if (typeof module.convertibleOpenDepth === "number" && module.convertibleOpenDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.convertibleOpenDepth`, message: "Convertible open depth must be positive." });
    }
    if (typeof module.convertibleHingeHeight === "number" && module.convertibleHingeHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.convertibleHingeHeight`, message: "Convertible hinge height must be positive." });
    }
    if ((module.convertibleSupportLegCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.convertibleSupportLegCount`, message: "Support leg count cannot be negative." });
    }
    if (typeof module.convertibleSupportLegWidth === "number" && module.convertibleSupportLegWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.convertibleSupportLegWidth`, message: "Support leg width must be positive." });
    }
    if (typeof module.convertibleSupportLegDepth === "number" && module.convertibleSupportLegDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.convertibleSupportLegDepth`, message: "Support leg depth must be positive." });
    }
    if (typeof module.platformDeckThickness === "number" && module.platformDeckThickness <= 0) {
      issues.push({ severity: "error", field: `${prefix}.platformDeckThickness`, message: "Platform deck thickness must be positive." });
    }
    if (typeof module.platformDeckOverhangFront === "number" && module.platformDeckOverhangFront < 0) {
      issues.push({ severity: "error", field: `${prefix}.platformDeckOverhangFront`, message: "Front platform deck overhang cannot be negative." });
    }
    if (typeof module.platformDeckOverhangBack === "number" && module.platformDeckOverhangBack < 0) {
      issues.push({ severity: "error", field: `${prefix}.platformDeckOverhangBack`, message: "Back platform deck overhang cannot be negative." });
    }
    if ((module.platformSupportRibCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.platformSupportRibCount`, message: "Platform support rib count cannot be negative." });
    }
    if (typeof module.platformSupportRibWidth === "number" && module.platformSupportRibWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.platformSupportRibWidth`, message: "Platform support rib width must be positive." });
    }
    if (typeof module.platformSupportRibHeight === "number" && module.platformSupportRibHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.platformSupportRibHeight`, message: "Platform support rib height must be positive." });
    }
    if ((module.stairScribeStepCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.stairScribeStepCount`, message: "Stair scribe step count cannot be negative." });
    }
    if (typeof module.stairScribeHighHeight === "number" && module.stairScribeHighHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.stairScribeHighHeight`, message: "Stair scribe high height must be positive." });
    }
    if (typeof module.stairScribeLowHeight === "number" && module.stairScribeLowHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.stairScribeLowHeight`, message: "Stair scribe low height must be positive." });
    }
    if (typeof module.stairScribeHighHeight === "number" && module.stairScribeHighHeight < module.height) {
      issues.push({ severity: "error", field: `${prefix}.stairScribeHighHeight`, message: "Stair scribe high height must sit above the module top." });
    }
    if (typeof module.stairScribeLowHeight === "number" && module.stairScribeLowHeight < module.height) {
      issues.push({ severity: "error", field: `${prefix}.stairScribeLowHeight`, message: "Stair scribe low height must sit above the module top." });
    }
    if (typeof module.stairScribeDepth === "number" && module.stairScribeDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.stairScribeDepth`, message: "Stair scribe depth must be positive." });
    }
    if (
      typeof module.stairScribeDirection !== "undefined" &&
      module.stairScribeDirection !== "rises_left" &&
      module.stairScribeDirection !== "rises_right"
    ) {
      issues.push({ severity: "error", field: `${prefix}.stairScribeDirection`, message: "Stair scribe direction is not supported." });
    }
    if ((module.roomDividerBackPanelCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.roomDividerBackPanelCount`, message: "Room divider back panel count cannot be negative." });
    }
    if (typeof module.roomDividerBackPanelThickness === "number" && module.roomDividerBackPanelThickness <= 0) {
      issues.push({ severity: "error", field: `${prefix}.roomDividerBackPanelThickness`, message: "Room divider back panel thickness must be positive." });
    }
    if ((module.roomDividerStabilizerFootCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.roomDividerStabilizerFootCount`, message: "Room divider stabilizer foot count cannot be negative." });
    }
    if (typeof module.roomDividerStabilizerFootWidth === "number" && module.roomDividerStabilizerFootWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.roomDividerStabilizerFootWidth`, message: "Room divider stabilizer foot width must be positive." });
    }
    if (typeof module.roomDividerStabilizerFootHeight === "number" && module.roomDividerStabilizerFootHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.roomDividerStabilizerFootHeight`, message: "Room divider stabilizer foot height must be positive." });
    }
    if (typeof module.roomDividerStabilizerFootDepth === "number" && module.roomDividerStabilizerFootDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.roomDividerStabilizerFootDepth`, message: "Room divider stabilizer foot depth must be positive." });
    }
    if (
      typeof module.lifestyleInsertKind !== "undefined" &&
      module.lifestyleInsertKind !== "pet_bed" &&
      module.lifestyleInsertKind !== "toy_bin" &&
      module.lifestyleInsertKind !== "hobby_tray"
    ) {
      issues.push({ severity: "error", field: `${prefix}.lifestyleInsertKind`, message: "Lifestyle insert kind is not supported." });
    }
    if ((module.lifestyleInsertCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.lifestyleInsertCount`, message: "Lifestyle insert count cannot be negative." });
    }
    if (typeof module.lifestyleInsertDepth === "number" && module.lifestyleInsertDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.lifestyleInsertDepth`, message: "Lifestyle insert depth must be positive." });
    }
    if (typeof module.lifestyleInsertDeckHeight === "number" && module.lifestyleInsertDeckHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.lifestyleInsertDeckHeight`, message: "Lifestyle insert deck height must be positive." });
    }
    if (typeof module.lifestyleInsertLipHeight === "number" && module.lifestyleInsertLipHeight < 0) {
      issues.push({ severity: "error", field: `${prefix}.lifestyleInsertLipHeight`, message: "Lifestyle insert lip height cannot be negative." });
    }
    if ((module.wineRackColumnCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.wineRackColumnCount`, message: "Wine rack column count cannot be negative." });
    }
    if ((module.wineRackRowCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.wineRackRowCount`, message: "Wine rack row count cannot be negative." });
    }
    if (typeof module.wineRackDepth === "number" && module.wineRackDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.wineRackDepth`, message: "Wine rack depth must be positive." });
    }
    if (typeof module.wineRackDividerThickness === "number" && module.wineRackDividerThickness <= 0) {
      issues.push({ severity: "error", field: `${prefix}.wineRackDividerThickness`, message: "Wine rack divider thickness must be positive." });
    }
    if (typeof module.seatDeckThickness === "number" && module.seatDeckThickness <= 0) {
      issues.push({ severity: "error", field: `${prefix}.seatDeckThickness`, message: "Seat deck thickness must be positive." });
    }
    if (typeof module.seatCushionThickness === "number" && module.seatCushionThickness < 0) {
      issues.push({ severity: "error", field: `${prefix}.seatCushionThickness`, message: "Seat cushion thickness cannot be negative." });
    }
    if (typeof module.seatCushionDepth === "number" && module.seatCushionDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.seatCushionDepth`, message: "Seat cushion depth must be positive." });
    }
    if (typeof module.seatCushionOverhangFront === "number" && module.seatCushionOverhangFront < 0) {
      issues.push({ severity: "error", field: `${prefix}.seatCushionOverhangFront`, message: "Seat cushion front overhang cannot be negative." });
    }
    if (typeof module.seatBackHeight === "number" && module.seatBackHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.seatBackHeight`, message: "Seat back height must be positive." });
    }
    if (typeof module.seatBackThickness === "number" && module.seatBackThickness <= 0) {
      issues.push({ severity: "error", field: `${prefix}.seatBackThickness`, message: "Seat back thickness must be positive." });
    }
    if ((module.mudroomHookCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.mudroomHookCount`, message: "Mudroom hook count cannot be negative." });
    }
    if (typeof module.mudroomHookRailHeight === "number" && module.mudroomHookRailHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.mudroomHookRailHeight`, message: "Mudroom hook rail height must be positive." });
    }
    if (typeof module.mudroomHookProjection === "number" && module.mudroomHookProjection <= 0) {
      issues.push({ severity: "error", field: `${prefix}.mudroomHookProjection`, message: "Mudroom hook projection must be positive." });
    }
    if ((module.shoeCubbyCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.shoeCubbyCount`, message: "Shoe cubby count cannot be negative." });
    }
    if (typeof module.shoeCubbyHeight === "number" && module.shoeCubbyHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.shoeCubbyHeight`, message: "Shoe cubby height must be positive." });
    }
    if (typeof module.shoeCubbyDepth === "number" && module.shoeCubbyDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.shoeCubbyDepth`, message: "Shoe cubby depth must be positive." });
    }
    if (typeof module.shoeCubbyDividerThickness === "number" && module.shoeCubbyDividerThickness <= 0) {
      issues.push({ severity: "error", field: `${prefix}.shoeCubbyDividerThickness`, message: "Shoe cubby divider thickness must be positive." });
    }
    if (typeof module.sinkCutoutWidth === "number" && module.sinkCutoutWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.sinkCutoutWidth`, message: "Sink cutout width must be positive." });
    }
    if (typeof module.sinkCutoutDepth === "number" && module.sinkCutoutDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.sinkCutoutDepth`, message: "Sink cutout depth must be positive." });
    }
    if (typeof module.sinkCutoutOffsetZ === "number" && module.sinkCutoutOffsetZ < 0) {
      issues.push({ severity: "error", field: `${prefix}.sinkCutoutOffsetZ`, message: "Sink cutout front setout cannot be negative." });
    }
    if (typeof module.plumbingChaseWidth === "number" && module.plumbingChaseWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.plumbingChaseWidth`, message: "Plumbing chase width must be positive." });
    }
    if (typeof module.plumbingChaseHeight === "number" && module.plumbingChaseHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.plumbingChaseHeight`, message: "Plumbing chase height must be positive." });
    }
    if (typeof module.plumbingChaseDepth === "number" && module.plumbingChaseDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.plumbingChaseDepth`, message: "Plumbing chase depth must be positive." });
    }
    if ((module.laundryApplianceCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.laundryApplianceCount`, message: "Laundry appliance count cannot be negative." });
    }
    if (typeof module.laundryApplianceWidth === "number" && module.laundryApplianceWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.laundryApplianceWidth`, message: "Laundry appliance width must be positive." });
    }
    if (typeof module.laundryApplianceHeight === "number" && module.laundryApplianceHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.laundryApplianceHeight`, message: "Laundry appliance height must be positive." });
    }
    if (typeof module.laundryApplianceDepth === "number" && module.laundryApplianceDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.laundryApplianceDepth`, message: "Laundry appliance depth must be positive." });
    }
    if (typeof module.laundryApplianceSideClearance === "number" && module.laundryApplianceSideClearance < 0) {
      issues.push({ severity: "error", field: `${prefix}.laundryApplianceSideClearance`, message: "Laundry appliance side clearance cannot be negative." });
    }
    if (typeof module.laundryApplianceTopClearance === "number" && module.laundryApplianceTopClearance < 0) {
      issues.push({ severity: "error", field: `${prefix}.laundryApplianceTopClearance`, message: "Laundry appliance top clearance cannot be negative." });
    }
    if (typeof module.laundryApplianceBackClearance === "number" && module.laundryApplianceBackClearance < 0) {
      issues.push({ severity: "error", field: `${prefix}.laundryApplianceBackClearance`, message: "Laundry appliance back clearance cannot be negative." });
    }
    if (typeof module.laundryUtilityChaseHeight === "number" && module.laundryUtilityChaseHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.laundryUtilityChaseHeight`, message: "Laundry utility chase height must be positive." });
    }
    if (typeof module.laundryUtilityChaseDepth === "number" && module.laundryUtilityChaseDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.laundryUtilityChaseDepth`, message: "Laundry utility chase depth must be positive." });
    }
    if (typeof module.officeWorksurfaceThickness === "number" && module.officeWorksurfaceThickness <= 0) {
      issues.push({ severity: "error", field: `${prefix}.officeWorksurfaceThickness`, message: "Office work surface thickness must be positive." });
    }
    if (typeof module.officeWorksurfaceDepth === "number" && module.officeWorksurfaceDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.officeWorksurfaceDepth`, message: "Office work surface depth must be positive." });
    }
    if (typeof module.officeWorksurfaceOverhangFront === "number" && module.officeWorksurfaceOverhangFront < 0) {
      issues.push({ severity: "error", field: `${prefix}.officeWorksurfaceOverhangFront`, message: "Office work surface front overhang cannot be negative." });
    }
    if ((module.cableGrommetCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.cableGrommetCount`, message: "Cable grommet count cannot be negative." });
    }
    if (typeof module.cableGrommetDiameter === "number" && module.cableGrommetDiameter <= 0) {
      issues.push({ severity: "error", field: `${prefix}.cableGrommetDiameter`, message: "Cable grommet diameter must be positive." });
    }
    if (typeof module.cableGrommetOffsetFromBack === "number" && module.cableGrommetOffsetFromBack < 0) {
      issues.push({ severity: "error", field: `${prefix}.cableGrommetOffsetFromBack`, message: "Cable grommet back offset cannot be negative." });
    }
    if (typeof module.deskPowerChaseHeight === "number" && module.deskPowerChaseHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.deskPowerChaseHeight`, message: "Desk power chase height must be positive." });
    }
    if (typeof module.deskPowerChaseDepth === "number" && module.deskPowerChaseDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.deskPowerChaseDepth`, message: "Desk power chase depth must be positive." });
    }
    if ((module.pantryPullOutTrayCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.pantryPullOutTrayCount`, message: "Pantry pull-out tray count cannot be negative." });
    }
    if (typeof module.pantryPullOutTrayDepth === "number" && module.pantryPullOutTrayDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.pantryPullOutTrayDepth`, message: "Pantry pull-out tray depth must be positive." });
    }
    if (typeof module.pantryPullOutTrayFrontHeight === "number" && module.pantryPullOutTrayFrontHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.pantryPullOutTrayFrontHeight`, message: "Pantry pull-out tray front height must be positive." });
    }
    if (typeof module.pantryPullOutSlideClearance === "number" && module.pantryPullOutSlideClearance < 0) {
      issues.push({ severity: "error", field: `${prefix}.pantryPullOutSlideClearance`, message: "Pantry pull-out slide clearance cannot be negative." });
    }
    if (typeof module.mediaTvOpeningWidth === "number" && module.mediaTvOpeningWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.mediaTvOpeningWidth`, message: "Media TV opening width must be positive." });
    }
    if (typeof module.mediaTvOpeningHeight === "number" && module.mediaTvOpeningHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.mediaTvOpeningHeight`, message: "Media TV opening height must be positive." });
    }
    if (typeof module.mediaTvMountHeight === "number" && module.mediaTvMountHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.mediaTvMountHeight`, message: "Media TV mount height must be positive." });
    }
    if (typeof module.mediaTvBlockingThickness === "number" && module.mediaTvBlockingThickness <= 0) {
      issues.push({ severity: "error", field: `${prefix}.mediaTvBlockingThickness`, message: "Media TV blocking thickness must be positive." });
    }
    if (typeof module.mediaCableChaseWidth === "number" && module.mediaCableChaseWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.mediaCableChaseWidth`, message: "Media cable chase width must be positive." });
    }
    if (typeof module.mediaCableChaseDepth === "number" && module.mediaCableChaseDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.mediaCableChaseDepth`, message: "Media cable chase depth must be positive." });
    }
    if (typeof module.mediaCableChaseHeight === "number" && module.mediaCableChaseHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.mediaCableChaseHeight`, message: "Media cable chase height must be positive." });
    }
    if ((module.mediaVentSlotCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.mediaVentSlotCount`, message: "Media vent slot count cannot be negative." });
    }
    if (typeof module.mediaVentSlotWidth === "number" && module.mediaVentSlotWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.mediaVentSlotWidth`, message: "Media vent slot width must be positive." });
    }
    if (typeof module.mediaVentSlotHeight === "number" && module.mediaVentSlotHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.mediaVentSlotHeight`, message: "Media vent slot height must be positive." });
    }
    if (typeof module.mediaVentSlotSpacing === "number" && module.mediaVentSlotSpacing < 0) {
      issues.push({ severity: "error", field: `${prefix}.mediaVentSlotSpacing`, message: "Media vent slot spacing cannot be negative." });
    }
    if (typeof module.libraryLadderRailHeight === "number" && module.libraryLadderRailHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.libraryLadderRailHeight`, message: "Library ladder rail height must be positive." });
    }
    if (typeof module.libraryLadderRailDiameter === "number" && module.libraryLadderRailDiameter <= 0) {
      issues.push({ severity: "error", field: `${prefix}.libraryLadderRailDiameter`, message: "Library ladder rail diameter must be positive." });
    }
    if (typeof module.libraryLadderRailProjection === "number" && module.libraryLadderRailProjection <= 0) {
      issues.push({ severity: "error", field: `${prefix}.libraryLadderRailProjection`, message: "Library ladder rail projection must be positive." });
    }
    if ((module.libraryLadderStandoffCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.libraryLadderStandoffCount`, message: "Library ladder standoff count cannot be negative." });
    }
    if (typeof module.libraryLadderStandoffDiameter === "number" && module.libraryLadderStandoffDiameter <= 0) {
      issues.push({ severity: "error", field: `${prefix}.libraryLadderStandoffDiameter`, message: "Library ladder standoff diameter must be positive." });
    }
    if ((module.stemwareRackLaneCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.stemwareRackLaneCount`, message: "Stemware rack lane count cannot be negative." });
    }
    if (typeof module.stemwareRackDepth === "number" && module.stemwareRackDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.stemwareRackDepth`, message: "Stemware rack depth must be positive." });
    }
    if (typeof module.stemwareRackRailWidth === "number" && module.stemwareRackRailWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.stemwareRackRailWidth`, message: "Stemware rack rail width must be positive." });
    }
    if (typeof module.stemwareRackLaneSpacing === "number" && module.stemwareRackLaneSpacing < 0) {
      issues.push({ severity: "error", field: `${prefix}.stemwareRackLaneSpacing`, message: "Stemware rack lane spacing cannot be negative." });
    }
    if (typeof module.stemwareRackMountHeight === "number" && module.stemwareRackMountHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.stemwareRackMountHeight`, message: "Stemware rack mount height must be positive." });
    }
    if ((module.lightingChannelCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.lightingChannelCount`, message: "Lighting channel count cannot be negative." });
    }
    if (typeof module.lightingChannelDepth === "number" && module.lightingChannelDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.lightingChannelDepth`, message: "Lighting channel depth must be positive." });
    }
    if (typeof module.lightingChannelHeight === "number" && module.lightingChannelHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.lightingChannelHeight`, message: "Lighting channel height must be positive." });
    }
    if (typeof module.lightingChannelInsetFromFront === "number" && module.lightingChannelInsetFromFront < 0) {
      issues.push({ severity: "error", field: `${prefix}.lightingChannelInsetFromFront`, message: "Lighting channel front inset cannot be negative." });
    }
    if ((module.hamperBasketCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.hamperBasketCount`, message: "Hamper basket count cannot be negative." });
    }
    if (typeof module.hamperBasketDepth === "number" && module.hamperBasketDepth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.hamperBasketDepth`, message: "Hamper basket depth must be positive." });
    }
    if (typeof module.hamperBasketHeight === "number" && module.hamperBasketHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.hamperBasketHeight`, message: "Hamper basket height must be positive." });
    }
    if (typeof module.hamperSlideClearance === "number" && module.hamperSlideClearance < 0) {
      issues.push({ severity: "error", field: `${prefix}.hamperSlideClearance`, message: "Hamper slide clearance cannot be negative." });
    }
    if ((module.shelfPinRowPairCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.shelfPinRowPairCount`, message: "Shelf pin row pair count cannot be negative." });
    }
    if ((module.shelfPinHoleCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.shelfPinHoleCount`, message: "Shelf pin hole count cannot be negative." });
    }
    if (typeof module.shelfPinHoleSpacing === "number" && module.shelfPinHoleSpacing <= 0) {
      issues.push({ severity: "error", field: `${prefix}.shelfPinHoleSpacing`, message: "Shelf pin hole spacing must be positive." });
    }
    if (typeof module.shelfPinInsetFromFront === "number" && module.shelfPinInsetFromFront < 0) {
      issues.push({ severity: "error", field: `${prefix}.shelfPinInsetFromFront`, message: "Shelf pin front inset cannot be negative." });
    }
    if (typeof module.shelfPinStartHeight === "number" && module.shelfPinStartHeight < 0) {
      issues.push({ severity: "error", field: `${prefix}.shelfPinStartHeight`, message: "Shelf pin start height cannot be negative." });
    }
    if ((module.doorHingeCountPerDoor ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.doorHingeCountPerDoor`, message: "Door hinge count cannot be negative." });
    }
    if (typeof module.doorHingeInsetFromTopBottom === "number" && module.doorHingeInsetFromTopBottom < 0) {
      issues.push({ severity: "error", field: `${prefix}.doorHingeInsetFromTopBottom`, message: "Door hinge top/bottom inset cannot be negative." });
    }
    if (typeof module.installationCleatHeight === "number" && module.installationCleatHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.installationCleatHeight`, message: "Installation cleat height must be positive." });
    }
    if (typeof module.installationCleatThickness === "number" && module.installationCleatThickness <= 0) {
      issues.push({ severity: "error", field: `${prefix}.installationCleatThickness`, message: "Installation cleat thickness must be positive." });
    }
    if (typeof module.installationCleatInsetFromTop === "number" && module.installationCleatInsetFromTop < 0) {
      issues.push({ severity: "error", field: `${prefix}.installationCleatInsetFromTop`, message: "Installation cleat top inset cannot be negative." });
    }
    if ((module.antiTipAnchorCount ?? 0) < 0) {
      issues.push({ severity: "error", field: `${prefix}.antiTipAnchorCount`, message: "Anti-tip anchor count cannot be negative." });
    }
    if (typeof module.antiTipAnchorHeight === "number" && module.antiTipAnchorHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.antiTipAnchorHeight`, message: "Anti-tip anchor height must be positive." });
    }
    if (typeof module.antiTipAnchorInsetFromSides === "number" && module.antiTipAnchorInsetFromSides < 0) {
      issues.push({ severity: "error", field: `${prefix}.antiTipAnchorInsetFromSides`, message: "Anti-tip anchor side inset cannot be negative." });
    }
    if (typeof module.drawerBoxSideThickness === "number" && module.drawerBoxSideThickness <= 0) {
      issues.push({ severity: "error", field: `${prefix}.drawerBoxSideThickness`, message: "Drawer box side thickness must be positive." });
    }
    if (typeof module.drawerBoxBottomThickness === "number" && module.drawerBoxBottomThickness <= 0) {
      issues.push({ severity: "error", field: `${prefix}.drawerBoxBottomThickness`, message: "Drawer box bottom thickness must be positive." });
    }
    if (typeof module.drawerBoxHeightClearance === "number" && module.drawerBoxHeightClearance < 0) {
      issues.push({ severity: "error", field: `${prefix}.drawerBoxHeightClearance`, message: "Drawer box height clearance cannot be negative." });
    }
    if (typeof module.drawerBoxBackClearance === "number" && module.drawerBoxBackClearance < 0) {
      issues.push({ severity: "error", field: `${prefix}.drawerBoxBackClearance`, message: "Drawer box back clearance cannot be negative." });
    }
    if (typeof module.drawerSlideLength === "number" && module.drawerSlideLength <= 0) {
      issues.push({ severity: "error", field: `${prefix}.drawerSlideLength`, message: "Drawer slide length must be positive." });
    }
    if (typeof module.drawerSlideClearance === "number" && module.drawerSlideClearance < 0) {
      issues.push({ severity: "error", field: `${prefix}.drawerSlideClearance`, message: "Drawer slide side clearance cannot be negative." });
    }

    const internalWidth = module.width - definition.boardThickness * 2;
    const internalHeight = module.height - definition.boardThickness * 2 - definition.toeKickHeight;
    if (internalWidth <= 0) {
      issues.push({ severity: "error", field: `${prefix}.width`, message: "Module internal width must be greater than zero." });
    }
    if (internalHeight <= 0) {
      issues.push({ severity: "error", field: `${prefix}.height`, message: "Module internal height must be greater than zero." });
    }

    if (getCabinetShelfSpacingMode(definition, module) === "custom") {
      const shelfPositions = module.shelfPositionsMm ?? [];
      const minimumShelfCenter = definition.toeKickHeight + definition.boardThickness;
      const maximumShelfCenter = module.height - definition.boardThickness;
      if (shelfPositions.length !== Math.max(0, Math.floor(module.shelfCount))) {
        issues.push({
          severity: "error",
          field: `${prefix}.shelfPositionsMm`,
          message: "Custom shelf spacing needs one height for every shelf.",
        });
      } else if (
        shelfPositions.some(
          (position, index) =>
            !Number.isFinite(position) ||
            position < minimumShelfCenter ||
            position > maximumShelfCenter ||
            (index > 0 &&
              position - shelfPositions[index - 1] < definition.boardThickness)
        )
      ) {
        issues.push({
          severity: "error",
          field: `${prefix}.shelfPositionsMm`,
          message: "Custom shelf heights must stay inside the cabinet and remain ordered without overlapping.",
        });
      }
    }

    if (
      definition.toeKickHeight > 0 &&
      !isCabinetCeilingComponent(module) &&
      !isCabinetTrimComponent(module) &&
      !isCabinetConvertibleComponent(module)
    ) {
      const toeKickSetback = getCabinetToeKickSetback(definition);
      const toeKickDepth = getCabinetToeKickDepth(definition, module);
      if (toeKickDepth <= 0) {
        issues.push({ severity: "error", field: "toeKickDepth", message: "Toe kick depth must be positive when toe kick height is enabled." });
      }
      if (toeKickSetback >= module.depth) {
        issues.push({ severity: "error", field: "toeKickSetback", message: `Toe kick setback must be less than ${module.id} depth.` });
      }
      if (toeKickSetback + toeKickDepth > module.depth) {
        issues.push({
          severity: "error",
          field: "toeKickDepth",
          message: `Toe kick setback plus depth must fit within ${module.id} depth.`,
        });
      }
      if (toeKickDepth > 0 && toeKickDepth < CABINET_MIN_TOE_KICK_DEPTH) {
        addWarning(
          issues,
          "toeKickDepth",
          "Toe kick depths under 40 mm should be reviewed for cabinet support, leveling feet, and plinth fastening."
        );
      }
      if (toeKickSetback > 100) {
        addWarning(
          issues,
          "toeKickSetback",
          "Toe kick setbacks over 100 mm should be reviewed for cabinet support, usable storage depth, and installation blocking."
        );
      }
      if (toeKickSetback > 0 && toeKickSetback < 25) {
        addWarning(
          issues,
          "toeKickSetback",
          "Toe kick setbacks under 25 mm may not provide comfortable foot clearance."
        );
      }
    }

    if (module.frontType === "drawer_stack" && module.drawerCount === 0) {
      issues.push({ severity: "error", field: `${prefix}.drawerCount`, message: "Drawer stack cabinets need at least one drawer." });
    }
    const effectiveDoorCount = getCabinetEffectiveDoorCount(definition, module);
    if (module.frontType === "single_door" && effectiveDoorCount < 1) {
      issues.push({ severity: "error", field: `${prefix}.doorCount`, message: "Single door cabinets need at least one door." });
    }
    if (module.frontType === "double_door" && effectiveDoorCount < 2) {
      issues.push({ severity: "error", field: `${prefix}.doorCount`, message: "Double door cabinets need at least two doors." });
    }
    if (module.frontType === "door_and_drawer" && effectiveDoorCount < 1 && module.drawerCount < 1) {
      issues.push({ severity: "error", field: `${prefix}.frontType`, message: "Door and drawer cabinets need at least one front." });
    }

    if (effectiveDoorCount > 0) {
      const widestDoor = getCabinetDoorFrontLayouts(definition, module).reduce(
        (widest, front) => Math.max(widest, front.width),
        0
      );
      if (widestDoor > 650) {
        addWarning(
          issues,
          `${prefix}.doorCount`,
          "Door leaves wider than 650 mm may need specialty hinges, thicker fronts, or a revised split."
        );
      }
    }

    if (module.drawerCount > 0) {
      const drawerFrontHeights = getCabinetDrawerFrontLayouts(definition, module).map(
        (front) => front.height
      );
      if (drawerFrontHeights.some((height) => height > 380)) {
        addWarning(
          issues,
          `${prefix}.${getCabinetDrawerHeightMode(module) === "custom" ? "drawerHeightProportions" : "drawerCount"}`,
          "Very tall drawer fronts may need heavy-duty slides or a revised drawer split."
        );
      }
      if (drawerFrontHeights.some((height) => height > 0 && height < 90)) {
        addWarning(
          issues,
          `${prefix}.${getCabinetDrawerHeightMode(module) === "custom" ? "drawerHeightProportions" : "drawerCount"}`,
          "Very short drawer fronts can be hard to fabricate and adjust cleanly."
        );
      }
    }

    if (module.shelfCount > 0 && module.width > 1000) {
      addWarning(
        issues,
        `${prefix}.width`,
        "Wide shelves over 1000 mm should be reviewed for sag, intermediate supports, or thicker material."
      );
    }

    if ((module.verticalDividerCount ?? 0) > 0) {
      const bayWidth = internalWidth / ((module.verticalDividerCount ?? 0) + 1);
      if (bayWidth < 220) {
        addWarning(
          issues,
          `${prefix}.verticalDividerCount`,
          "Very narrow divider bays under 220 mm should be reviewed for usable storage and fabrication access."
        );
      }
    }

    if (getCabinetHangingRodCount(module) > 0) {
      const rodHeight = getCabinetHangingRodHeight(definition, module);
      const rodSpacing = getCabinetHangingRodSpacing(module);
      const rodHeights = getCabinetHangingRodCenterHeights(definition, module);
      if (rodHeight > module.height - definition.boardThickness - 80) {
        addWarning(
          issues,
          `${prefix}.hangingRodHeight`,
          "Hanging rods very near the top panel may need lowered placement for hangers and installation clearance."
        );
      }
      if (rodHeights.some((height) => height < definition.toeKickHeight + 900)) {
        addWarning(
          issues,
          `${prefix}.hangingRodHeight`,
          "Low hanging rods should be reviewed for garment length, drawers, shelves, and usable access."
        );
      }
      if (getCabinetHangingRodCount(module) > 1 && rodSpacing < 650) {
        addWarning(
          issues,
          `${prefix}.hangingRodSpacing`,
          "Double-hang rod spacing under 650 mm can be too tight for garments."
        );
      }
      if (getCabinetHangingRodCount(module) > 2) {
        addWarning(
          issues,
          `${prefix}.hangingRodCount`,
          "More than two hanging rods in one module should be reviewed for garment clearance and user access."
        );
      }
    }

    if (getCabinetSlatCount(module) > 0) {
      const slatWidth = getCabinetSlatWidth(module);
      const slatDepth = getCabinetSlatDepth(module);
      const positions = getCabinetSlatLocalXPositions(module);
      const finalSlatEnd = positions.length ? positions[positions.length - 1] + slatWidth : 0;
      if (finalSlatEnd > module.width + 0.5) {
        issues.push({
          severity: "error",
          field: `${prefix}.slatCount`,
          message: "Slat layout exceeds module width.",
        });
      }
      if (slatWidth < 15) {
        addWarning(
          issues,
          `${prefix}.slatWidth`,
          "Very narrow slats under 15 mm should be reviewed for milling, sanding, and finish durability."
        );
      }
      if (slatDepth > 80) {
        addWarning(
          issues,
          `${prefix}.slatDepth`,
          "Slats deeper than 80 mm should be reviewed for anchoring, weight, and shadow-line intent."
        );
      }
      if (positions.length > 1) {
        const spacing = positions[1] - positions[0] - slatWidth;
        if (spacing < 8) {
          addWarning(
            issues,
            `${prefix}.slatSpacing`,
            "Slat spacing under 8 mm can be difficult to finish, clean, and install consistently."
          );
        }
      }
    }

    if (hasCabinetWineRack(module)) {
      const columnCount = getCabinetWineRackColumnCount(module);
      const rowCount = getCabinetWineRackRowCount(module);
      const dividerThickness = getCabinetWineRackDividerThickness(module);
      const rackDepth = getCabinetWineRackDepth(module, definition.backPanelThickness);
      const openingWidth = getCabinetWineRackOpeningWidth(module, definition.boardThickness, definition.revealGap);
      const openingHeight = getCabinetWineRackOpeningHeight(
        module,
        definition.boardThickness,
        definition.toeKickHeight,
        definition.revealGap
      );
      const bayWidth = getCabinetWineRackBayWidth(module, definition.boardThickness, definition.revealGap);
      const bayHeight = getCabinetWineRackBayHeight(
        module,
        definition.boardThickness,
        definition.toeKickHeight,
        definition.revealGap
      );

      if (columnCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.wineRackColumnCount`, message: "Wine racks need at least one column." });
      }
      if (rowCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.wineRackRowCount`, message: "Wine racks need at least one row." });
      }
      if (rackDepth > module.depth) {
        issues.push({ severity: "error", field: `${prefix}.wineRackDepth`, message: "Wine rack depth cannot exceed module depth." });
      }
      if (Math.max(0, columnCount - 1) * dividerThickness >= openingWidth) {
        issues.push({
          severity: "error",
          field: `${prefix}.wineRackColumnCount`,
          message: "Wine rack vertical dividers exceed the available opening width.",
        });
      }
      if (Math.max(0, rowCount - 1) * dividerThickness >= openingHeight) {
        issues.push({
          severity: "error",
          field: `${prefix}.wineRackRowCount`,
          message: "Wine rack horizontal rails exceed the available opening height.",
        });
      }
      if (bayWidth > 0 && bayWidth < 85) {
        addWarning(
          issues,
          `${prefix}.wineRackColumnCount`,
          "Wine rack bay widths under 85 mm should be reviewed for bottle diameter and label clearance."
        );
      }
      if (bayHeight > 0 && bayHeight < 85) {
        addWarning(
          issues,
          `${prefix}.wineRackRowCount`,
          "Wine rack bay heights under 85 mm should be reviewed for bottle diameter and hand clearance."
        );
      }
      if (rackDepth > 0 && rackDepth < 300) {
        addWarning(
          issues,
          `${prefix}.wineRackDepth`,
          "Wine rack depths under 300 mm should be reviewed for bottle support and fall protection."
        );
      }
    }

    if (hasCabinetSeatingDetails(module)) {
      const deckThickness = getCabinetSeatDeckThickness(module);
      const cushionThickness = getCabinetSeatCushionThickness(module);
      const cushionDepth = getCabinetSeatCushionDepth(module);
      const cushionOverhang = getCabinetSeatCushionOverhangFront(module);
      const finishedSeatHeight = getCabinetSeatFinishedHeight(module);

      if (deckThickness <= 0) {
        issues.push({ severity: "error", field: `${prefix}.seatDeckThickness`, message: "Seating details need a positive seat deck thickness." });
      }
      if (cushionDepth > module.depth + cushionOverhang + 150) {
        addWarning(
          issues,
          `${prefix}.seatCushionDepth`,
          "Seat cushions much deeper than the cabinet should be reviewed for support, seams, and upholstery fit."
        );
      }
      if (cushionThickness > 0 && cushionThickness < 40) {
        addWarning(
          issues,
          `${prefix}.seatCushionThickness`,
          "Seat cushions under 40 mm should be reviewed for comfort and upholstery construction."
        );
      }
      if (cushionThickness > 125) {
        addWarning(
          issues,
          `${prefix}.seatCushionThickness`,
          "Seat cushions over 125 mm should be coordinated with finished seat height and adjacent clearances."
        );
      }
      if (cushionOverhang > 80) {
        addWarning(
          issues,
          `${prefix}.seatCushionOverhangFront`,
          "Seat overhangs over 80 mm may need support, reinforced decking, or a revised cushion profile."
        );
      }
      if (finishedSeatHeight < 380 || finishedSeatHeight > 520) {
        addWarning(
          issues,
          `${prefix}.seatCushionThickness`,
          "Finished seat height outside 380-520 mm should be reviewed for comfort, cushion allowance, and table/window clearances."
        );
      }

      if (hasCabinetSeatBack(module)) {
        const backHeight = getCabinetSeatBackHeight(module);
        const backThickness = getCabinetSeatBackThickness(module);
        if (backHeight <= 0) {
          issues.push({ severity: "error", field: `${prefix}.seatBackHeight`, message: "Seat backs need a positive height." });
        }
        if (backThickness <= 0) {
          issues.push({ severity: "error", field: `${prefix}.seatBackThickness`, message: "Seat backs need a positive thickness." });
        }
        if (backThickness < 12) {
          addWarning(
            issues,
            `${prefix}.seatBackThickness`,
            "Seat backs under 12 mm should be reviewed for stiffness, fastening, and upholstery attachment."
          );
        }
        if (backHeight > 800) {
          addWarning(
            issues,
            `${prefix}.seatBackHeight`,
            "Seat backs over 800 mm should be reviewed for wall anchoring, comfort, and visual proportion."
          );
        }
      }
    }

    if (hasCabinetMudroomHooks(module)) {
      const hookCount = getCabinetMudroomHookCount(module);
      const railHeight = getCabinetMudroomHookRailHeight(module);
      const projection = getCabinetMudroomHookProjection(module);
      if (hookCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.mudroomHookCount`, message: "Mudroom hook rails need at least one hook." });
      }
      if (hookCount * CABINET_MUDROOM_HOOK_WIDTH > module.width) {
        issues.push({ severity: "error", field: `${prefix}.mudroomHookCount`, message: "Mudroom hook layout exceeds module width." });
      }
      if (railHeight + CABINET_MUDROOM_HOOK_RAIL_HEIGHT / 2 > definition.height) {
        issues.push({ severity: "error", field: `${prefix}.mudroomHookRailHeight`, message: "Mudroom hook rail exceeds the overall assembly height." });
      }
      if (hookCount > 1) {
        const spacing = module.width / (hookCount + 1);
        if (spacing < 180) {
          addWarning(
            issues,
            `${prefix}.mudroomHookCount`,
            "Mudroom hook spacing under 180 mm should be reviewed for coats, bags, and hand clearance."
          );
        }
      }
      if (railHeight < 900 || railHeight > 1800) {
        addWarning(
          issues,
          `${prefix}.mudroomHookRailHeight`,
          "Mudroom hook rail heights outside 900-1800 mm should be reviewed for the intended users."
        );
      }
      if (projection > 100) {
        addWarning(
          issues,
          `${prefix}.mudroomHookProjection`,
          "Mudroom hooks projecting over 100 mm should be reviewed for circulation clearance."
        );
      }
    }

    if (hasCabinetShoeCubbies(module)) {
      const cubbyCount = getCabinetShoeCubbyCount(module);
      const cubbyHeight = getCabinetShoeCubbyHeight(module);
      const cubbyDepth = getCabinetShoeCubbyDepth(module);
      const dividerThickness = getCabinetShoeCubbyDividerThickness(module);
      const openingWidth = getCabinetShoeCubbyOpeningWidth(definition, module);
      const bayWidth = getCabinetShoeCubbyBayWidth(definition, module);
      const shelfTop = getCabinetShoeCubbyOpeningY(definition) + cubbyHeight + dividerThickness;

      if (cubbyCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.shoeCubbyCount`, message: "Shoe cubby layouts need at least one cubby." });
      }
      if (cubbyDepth > module.depth) {
        issues.push({ severity: "error", field: `${prefix}.shoeCubbyDepth`, message: "Shoe cubby depth cannot exceed module depth." });
      }
      if (Math.max(0, cubbyCount - 1) * dividerThickness >= openingWidth) {
        issues.push({ severity: "error", field: `${prefix}.shoeCubbyCount`, message: "Shoe cubby dividers exceed the available opening width." });
      }
      if (shelfTop > module.height - definition.boardThickness) {
        issues.push({ severity: "error", field: `${prefix}.shoeCubbyHeight`, message: "Shoe cubby shelf exceeds the module interior height." });
      }
      if (bayWidth > 0 && bayWidth < 180) {
        addWarning(
          issues,
          `${prefix}.shoeCubbyCount`,
          "Shoe cubbies under 180 mm wide should be reviewed for adult footwear and cleaning access."
        );
      }
      if (cubbyHeight > 0 && cubbyHeight < 120) {
        addWarning(
          issues,
          `${prefix}.shoeCubbyHeight`,
          "Shoe cubbies under 120 mm high should be reviewed for boots, sneakers, and cleaning access."
        );
      }
      if (cubbyDepth > 0 && cubbyDepth < 250) {
        addWarning(
          issues,
          `${prefix}.shoeCubbyDepth`,
          "Shoe cubby depths under 250 mm should be reviewed for adult footwear."
        );
      }
    }

    if (hasCabinetSinkCutout(module)) {
      const cutoutWidth = getCabinetSinkCutoutWidth(module);
      const cutoutDepth = getCabinetSinkCutoutDepth(module);
      const cutoutX = getCabinetSinkCutoutLocalX(module);
      const cutoutZ = getCabinetSinkCutoutLocalZ(module);

      if (!definition.includeCountertop) {
        issues.push({ severity: "error", field: `${prefix}.sinkCutoutEnabled`, message: "Sink cutouts require an enabled countertop/worktop." });
      }
      if (cutoutWidth <= 0 || cutoutDepth <= 0) {
        issues.push({ severity: "error", field: `${prefix}.sinkCutoutWidth`, message: "Sink cutouts need positive width and depth." });
      }
      if (cutoutX < 0 || cutoutX + cutoutWidth > module.width) {
        issues.push({ severity: "error", field: `${prefix}.sinkCutoutOffsetX`, message: "Sink cutout must fit within the module width." });
      }
      if (cutoutZ < 0 || cutoutZ + cutoutDepth > module.depth) {
        issues.push({ severity: "error", field: `${prefix}.sinkCutoutOffsetZ`, message: "Sink cutout must fit within the module depth." });
      }
      if (cutoutWidth > module.width * 0.75) {
        addWarning(
          issues,
          `${prefix}.sinkCutoutWidth`,
          "Sink cutouts wider than 75% of the module should be reviewed for rail strength, faucet deck, and countertop support."
        );
      }
      if (cutoutDepth > module.depth * 0.75) {
        addWarning(
          issues,
          `${prefix}.sinkCutoutDepth`,
          "Deep sink cutouts should be reviewed for faucet deck, front rail strength, and backsplash clearance."
        );
      }
      if (module.drawerCount > 0 || module.frontType === "drawer_stack" || module.frontType === "door_and_drawer") {
        addWarning(
          issues,
          `${prefix}.sinkCutoutEnabled`,
          "Sink service zones with drawers should be reviewed for false fronts, U-shaped drawers, trap clearance, and shutoff access."
        );
      }
    }

    if (hasCabinetPlumbingChase(module)) {
      const chaseWidth = getCabinetPlumbingChaseWidth(module);
      const chaseHeight = getCabinetPlumbingChaseHeight(definition, module);
      const chaseDepth = getCabinetPlumbingChaseDepth(module);
      const chaseX = getCabinetPlumbingChaseLocalX(module);
      const chaseZ = getCabinetPlumbingChaseLocalZ(module);

      if (chaseWidth <= 0 || chaseHeight <= 0 || chaseDepth <= 0) {
        issues.push({ severity: "error", field: `${prefix}.plumbingChaseWidth`, message: "Plumbing chase clearance needs positive width, height, and depth." });
      }
      if (chaseX < 0 || chaseX + chaseWidth > module.width) {
        issues.push({ severity: "error", field: `${prefix}.plumbingChaseWidth`, message: "Plumbing chase must fit within the module width." });
      }
      if (chaseZ < 0 || chaseZ + chaseDepth > module.depth) {
        issues.push({ severity: "error", field: `${prefix}.plumbingChaseDepth`, message: "Plumbing chase must fit within the module depth." });
      }
      if (typeof module.plumbingChaseHeight === "number" && module.plumbingChaseHeight > module.height - definition.toeKickHeight) {
        issues.push({ severity: "error", field: `${prefix}.plumbingChaseHeight`, message: "Plumbing chase height cannot exceed the usable module interior." });
      }
      if (chaseWidth < 300) {
        addWarning(
          issues,
          `${prefix}.plumbingChaseWidth`,
          "Plumbing chases under 300 mm wide should be reviewed for trap, supply, shutoff, and maintenance access."
        );
      }
      if (chaseDepth < 75) {
        addWarning(
          issues,
          `${prefix}.plumbingChaseDepth`,
          "Plumbing chases under 75 mm deep should be reviewed against trap and shutoff projection."
        );
      }
    }

    if (hasCabinetLaundryApplianceBay(module)) {
      const applianceCount = getCabinetLaundryApplianceCount(module);
      const applianceWidth = getCabinetLaundryApplianceWidth(module);
      const applianceHeight = getCabinetLaundryApplianceHeight(module);
      const applianceDepth = getCabinetLaundryApplianceDepth(module);
      const sideClearance = getCabinetLaundryApplianceSideClearance(module);
      const topClearance = getCabinetLaundryApplianceTopClearance(module);
      const backClearance = getCabinetLaundryApplianceBackClearance(module);
      const requiredWidth = getCabinetLaundryApplianceRequiredWidth(module);
      const requiredHeight = getCabinetLaundryApplianceRequiredHeight(module);
      const requiredDepth = getCabinetLaundryApplianceRequiredDepth(module);
      const utilityChaseHeight = getCabinetLaundryUtilityChaseHeight(module);
      const utilityChaseDepth = getCabinetLaundryUtilityChaseDepth(module);

      if (module.frontType !== "open") {
        issues.push({ severity: "error", field: `${prefix}.frontType`, message: "Laundry appliance bays require an open front." });
      }
      if (applianceCount <= 0 || applianceWidth <= 0 || applianceHeight <= 0 || applianceDepth <= 0) {
        issues.push({ severity: "error", field: `${prefix}.laundryApplianceCount`, message: "Laundry appliance bays need positive appliance count and dimensions." });
      }
      if (requiredWidth > module.width) {
        issues.push({ severity: "error", field: `${prefix}.laundryApplianceWidth`, message: "Laundry appliances and side clearances exceed the module width." });
      }
      if (requiredHeight > module.height) {
        issues.push({ severity: "error", field: `${prefix}.laundryApplianceHeight`, message: "Laundry appliances and top clearance exceed the module height." });
      }
      if (requiredDepth > module.depth) {
        issues.push({ severity: "error", field: `${prefix}.laundryApplianceDepth`, message: "Laundry appliances and back clearance exceed the module depth." });
      }
      if (utilityChaseHeight > module.height) {
        issues.push({ severity: "error", field: `${prefix}.laundryUtilityChaseHeight`, message: "Laundry utility chase height cannot exceed the module height." });
      }
      if (utilityChaseDepth > module.depth) {
        issues.push({ severity: "error", field: `${prefix}.laundryUtilityChaseDepth`, message: "Laundry utility chase depth cannot exceed the module depth." });
      }
      if (sideClearance < 20) {
        addWarning(
          issues,
          `${prefix}.laundryApplianceSideClearance`,
          "Laundry appliance side clearances under 20 mm should be reviewed for vibration, leveling, and service access."
        );
      }
      if (topClearance < 30) {
        addWarning(
          issues,
          `${prefix}.laundryApplianceTopClearance`,
          "Laundry appliance top clearances under 30 mm should be reviewed for installation tolerances and counter/worktop clearance."
        );
      }
      if (backClearance < 30) {
        addWarning(
          issues,
          `${prefix}.laundryApplianceBackClearance`,
          "Laundry appliance back clearances under 30 mm should be reviewed for hose, dryer vent, outlet, and shutoff projection."
        );
      }
      if (utilityChaseDepth < 60) {
        addWarning(
          issues,
          `${prefix}.laundryUtilityChaseDepth`,
          "Laundry utility chases under 60 mm deep should be reviewed against plumbing, electrical, and dryer vent projections."
        );
      }
    }

    if (hasCabinetOfficeWorkstation(module)) {
      const worksurfaceThickness = getCabinetOfficeWorksurfaceThickness(module);
      const worksurfaceDepth = getCabinetOfficeWorksurfaceDepth(module);
      const worksurfaceOverhangFront = getCabinetOfficeWorksurfaceOverhangFront(module);
      const cableGrommetCount = getCabinetCableGrommetCount(module);
      const cableGrommetDiameter = getCabinetCableGrommetDiameter(module);
      const cableGrommetLocalZ = getCabinetCableGrommetLocalZ(module);
      const cableGrommetOffsetFromBack = getCabinetCableGrommetOffsetFromBack(module);
      const deskPowerChaseHeight = getCabinetDeskPowerChaseHeight(module);
      const deskPowerChaseDepth = getCabinetDeskPowerChaseDepth(module);
      const finishedWorkHeight = module.height + worksurfaceThickness;

      if (worksurfaceThickness <= 0 || worksurfaceDepth <= 0) {
        issues.push({ severity: "error", field: `${prefix}.officeWorksurfaceThickness`, message: "Office workstations need a positive work surface thickness and depth." });
      }
      if (worksurfaceDepth - worksurfaceOverhangFront < module.depth) {
        issues.push({ severity: "error", field: `${prefix}.officeWorksurfaceDepth`, message: "Office work surface depth must cover the cabinet body after front overhang." });
      }
      if (deskPowerChaseHeight > module.height) {
        issues.push({ severity: "error", field: `${prefix}.deskPowerChaseHeight`, message: "Desk power chase height cannot exceed the module height." });
      }
      if (deskPowerChaseDepth > module.depth) {
        issues.push({ severity: "error", field: `${prefix}.deskPowerChaseDepth`, message: "Desk power chase depth cannot exceed the module depth." });
      }
      if (cableGrommetCount > 0) {
        if (cableGrommetDiameter <= 0) {
          issues.push({ severity: "error", field: `${prefix}.cableGrommetDiameter`, message: "Cable grommets need a positive diameter." });
        }
        if (cableGrommetCount * cableGrommetDiameter >= module.width) {
          issues.push({ severity: "error", field: `${prefix}.cableGrommetCount`, message: "Cable grommets exceed the available work-surface width." });
        }
        const grommetSurfaceStart = -worksurfaceOverhangFront;
        const grommetSurfaceEnd = worksurfaceDepth - worksurfaceOverhangFront;
        if (cableGrommetLocalZ < grommetSurfaceStart || cableGrommetLocalZ + cableGrommetDiameter > grommetSurfaceEnd) {
          issues.push({ severity: "error", field: `${prefix}.cableGrommetOffsetFromBack`, message: "Cable grommets must fit within the office work surface depth." });
        }
        const minGrommetSpacing = getCabinetCableGrommetLocalXPositions(module).length > 1
          ? module.width / (getCabinetCableGrommetLocalXPositions(module).length + 1)
          : module.width;
        if (minGrommetSpacing < 250) {
          addWarning(
            issues,
            `${prefix}.cableGrommetCount`,
            "Cable grommets spaced under 250 mm should be reviewed for device access, structural openings, and desktop clutter."
          );
        }
      }
      if (finishedWorkHeight < 680 || finishedWorkHeight > 780) {
        addWarning(
          issues,
          `${prefix}.officeWorksurfaceThickness`,
          "Finished office work-surface heights outside 680-780 mm should be reviewed for chair clearance and ergonomics."
        );
      }
      if (worksurfaceOverhangFront > 250) {
        addWarning(
          issues,
          `${prefix}.officeWorksurfaceOverhangFront`,
          "Office work-surface overhangs over 250 mm may need legs, brackets, or hidden steel support."
        );
      }
      if (worksurfaceThickness < 24) {
        addWarning(
          issues,
          `${prefix}.officeWorksurfaceThickness`,
          "Office work surfaces under 24 mm should be reviewed for span stiffness and edge durability."
        );
      }
      if (deskPowerChaseDepth < 40) {
        addWarning(
          issues,
          `${prefix}.deskPowerChaseDepth`,
          "Desk power chases under 40 mm deep should be reviewed against plug, data, and cable bend-radius requirements."
        );
      }
      if (cableGrommetOffsetFromBack < 70) {
        addWarning(
          issues,
          `${prefix}.cableGrommetOffsetFromBack`,
          "Cable grommets closer than 70 mm to the back edge should be reviewed for backsplash, wall, and outlet clearance."
        );
      }
    }

    if (hasCabinetPantryPullOuts(module)) {
      const trayCount = getCabinetPantryPullOutTrayCount(module);
      const trayDepth = getCabinetPantryPullOutTrayDepth(module);
      const trayFrontHeight = getCabinetPantryPullOutTrayFrontHeight(module);
      const slideClearance = getCabinetPantryPullOutSlideClearance(module);
      const trayOpeningWidth = getCabinetPantryPullOutOpeningWidth(definition, module);
      const trayOpeningHeight = getCabinetPantryPullOutOpeningHeight(definition, module);
      const trayRequiredHeight = getCabinetPantryPullOutRequiredHeight(definition, module);

      if (trayCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.pantryPullOutTrayCount`, message: "Pantry pull-outs need at least one tray." });
      }
      if (trayOpeningWidth <= 0) {
        issues.push({ severity: "error", field: `${prefix}.pantryPullOutSlideClearance`, message: "Pantry pull-out slide clearances leave no usable tray width." });
      }
      if (trayDepth > module.depth - definition.backPanelThickness) {
        issues.push({ severity: "error", field: `${prefix}.pantryPullOutTrayDepth`, message: "Pantry pull-out tray depth cannot exceed the usable cabinet depth." });
      }
      if (trayRequiredHeight > trayOpeningHeight) {
        issues.push({ severity: "error", field: `${prefix}.pantryPullOutTrayCount`, message: "Pantry pull-out trays exceed the available module height." });
      }
      if (module.frontType === "drawer_stack") {
        addWarning(
          issues,
          `${prefix}.frontType`,
          "Pantry pull-out trays behind drawer-stack fronts should be reviewed to avoid duplicate drawer hardware and front conflicts."
        );
      }
      if (trayOpeningWidth < 360) {
        addWarning(
          issues,
          `${prefix}.pantryPullOutSlideClearance`,
          "Pantry pull-out tray clear widths under 360 mm should be reviewed for stored-goods access and slide hardware."
        );
      }
      if (trayDepth < 350) {
        addWarning(
          issues,
          `${prefix}.pantryPullOutTrayDepth`,
          "Pantry pull-out trays under 350 mm deep should be reviewed for pantry storage usefulness."
        );
      }
      if (slideClearance < 25) {
        addWarning(
          issues,
          `${prefix}.pantryPullOutSlideClearance`,
          "Pantry pull-out slide clearances under 25 mm should be checked against the chosen slide hardware."
        );
      }
      if (trayFrontHeight > 140) {
        addWarning(
          issues,
          `${prefix}.pantryPullOutTrayFrontHeight`,
          "Tall pantry tray fronts over 140 mm should be reviewed for access, labeling, and stored-goods visibility."
        );
      }
    }

    if (hasCabinetMediaWallDetails(module)) {
      const tvOpeningWidth = getCabinetMediaTvOpeningWidth(module);
      const tvOpeningHeight = getCabinetMediaTvOpeningHeight(module);
      const tvMountHeight = getCabinetMediaTvMountHeight(module);
      const tvBlockingThickness = getCabinetMediaTvBlockingThickness(module);
      const tvBlockingX = getCabinetMediaTvBlockingLocalX(module);
      const tvBlockingY = getCabinetMediaTvBlockingLocalY(definition, module);
      const tvBlockingZ = getCabinetMediaTvBlockingLocalZ(module);
      const cableChaseWidth = getCabinetMediaCableChaseWidth(module);
      const cableChaseHeight = getCabinetMediaCableChaseHeight(module);
      const cableChaseDepth = getCabinetMediaCableChaseDepth(module);
      const cableChaseX = getCabinetMediaCableChaseLocalX(module);
      const cableChaseY = getCabinetMediaCableChaseLocalY(definition, module);
      const cableChaseZ = getCabinetMediaCableChaseLocalZ(module);
      const ventSlotCount = getCabinetMediaVentSlotCount(module);
      const ventSlotWidth = getCabinetMediaVentSlotWidth(module);
      const ventSlotHeight = getCabinetMediaVentSlotHeight(module);
      const ventSlotSpacing = getCabinetMediaVentSlotSpacing(module);
      const ventSlotTotalWidth = getCabinetMediaVentSlotTotalWidth(module);

      if (tvOpeningWidth <= 0 || tvOpeningHeight <= 0 || tvBlockingThickness <= 0) {
        issues.push({ severity: "error", field: `${prefix}.mediaTvOpeningWidth`, message: "Media walls need positive TV blocking width, height, and thickness." });
      }
      if (tvBlockingX < 0 || tvBlockingX + tvOpeningWidth > module.width) {
        issues.push({ severity: "error", field: `${prefix}.mediaTvOpeningWidth`, message: "Media TV blocking must fit within the selected module width." });
      }
      if (tvBlockingY < 0 || tvBlockingY + tvOpeningHeight > definition.height) {
        issues.push({ severity: "error", field: `${prefix}.mediaTvMountHeight`, message: "Media TV blocking must fit within the overall media wall height." });
      }
      if (tvBlockingZ + tvBlockingThickness > module.depth) {
        issues.push({ severity: "error", field: `${prefix}.mediaTvBlockingThickness`, message: "Media TV blocking thickness cannot exceed the module depth." });
      }
      if (cableChaseWidth <= 0 || cableChaseHeight <= 0 || cableChaseDepth <= 0) {
        issues.push({ severity: "error", field: `${prefix}.mediaCableChaseWidth`, message: "Media cable chases need positive width, height, and depth." });
      }
      if (cableChaseX < 0 || cableChaseX + cableChaseWidth > module.width) {
        issues.push({ severity: "error", field: `${prefix}.mediaCableChaseWidth`, message: "Media cable chase must fit within the selected module width." });
      }
      if (cableChaseY < 0 || cableChaseY + cableChaseHeight > definition.height) {
        issues.push({ severity: "error", field: `${prefix}.mediaCableChaseHeight`, message: "Media cable chase must fit within the overall media wall height." });
      }
      if (cableChaseZ + cableChaseDepth > module.depth) {
        issues.push({ severity: "error", field: `${prefix}.mediaCableChaseDepth`, message: "Media cable chase depth cannot exceed the module depth." });
      }
      if (ventSlotCount <= 0) {
        addWarning(
          issues,
          `${prefix}.mediaVentSlotCount`,
          "Media walls without ventilation slots should be reviewed against equipment heat-load and grille requirements."
        );
      }
      if (ventSlotCount > 0) {
        if (ventSlotWidth <= 0 || ventSlotHeight <= 0) {
          issues.push({ severity: "error", field: `${prefix}.mediaVentSlotWidth`, message: "Media vent slots need positive width and height." });
        }
        if (ventSlotTotalWidth > module.width) {
          issues.push({ severity: "error", field: `${prefix}.mediaVentSlotCount`, message: "Media vent slots exceed the selected module width." });
        }
      }
      if (tvOpeningWidth < 900 || tvOpeningWidth > 2200) {
        addWarning(
          issues,
          `${prefix}.mediaTvOpeningWidth`,
          "Media TV openings outside 900-2200 mm should be reviewed against TV size, sight lines, and bracket reach."
        );
      }
      if (tvMountHeight < 900 || tvMountHeight > 1700) {
        addWarning(
          issues,
          `${prefix}.mediaTvMountHeight`,
          "Media TV mount heights outside 900-1700 mm should be reviewed for viewing ergonomics."
        );
      }
      if (cableChaseDepth < 40) {
        addWarning(
          issues,
          `${prefix}.mediaCableChaseDepth`,
          "Media cable chases under 40 mm deep should be reviewed for plugs, conduit, cable bend radius, and access."
        );
      }
      if (ventSlotCount > 0 && ventSlotHeight < 16) {
        addWarning(
          issues,
          `${prefix}.mediaVentSlotHeight`,
          "Media vent slots under 16 mm high should be reviewed for airflow and grille fabrication tolerance."
        );
      }
      if (ventSlotCount > 1 && ventSlotSpacing < 16) {
        addWarning(
          issues,
          `${prefix}.mediaVentSlotSpacing`,
          "Media vent slot spacing under 16 mm should be reviewed for fragile webs and finish durability."
        );
      }
    }

    if (hasCabinetLibraryLadderRail(module)) {
      const railHeight = getCabinetLibraryLadderRailHeight(module);
      const railDiameter = getCabinetLibraryLadderRailDiameter(module);
      const railProjection = getCabinetLibraryLadderRailProjection(module);
      const standoffCount = getCabinetLibraryLadderStandoffCount(module);
      const standoffDiameter = getCabinetLibraryLadderStandoffDiameter(module);
      const standoffPositions = getCabinetLibraryLadderStandoffLocalXPositions(module);

      if (railHeight <= 0 || railDiameter <= 0 || railProjection <= 0) {
        issues.push({ severity: "error", field: `${prefix}.libraryLadderRailHeight`, message: "Library ladder rails need positive height, diameter, and projection." });
      }
      if (railHeight - railDiameter / 2 < 0 || railHeight + railDiameter / 2 > module.height) {
        issues.push({ severity: "error", field: `${prefix}.libraryLadderRailHeight`, message: "Library ladder rail must fit within the module height." });
      }
      if (standoffCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.libraryLadderStandoffCount`, message: "Library ladder rails need at least one standoff per enabled module." });
      }
      if (standoffDiameter > railProjection) {
        issues.push({ severity: "error", field: `${prefix}.libraryLadderStandoffDiameter`, message: "Library ladder standoff diameter cannot exceed the rail projection." });
      }
      if (standoffPositions.some((localX) => localX < 0 || localX + standoffDiameter > module.width)) {
        issues.push({ severity: "error", field: `${prefix}.libraryLadderStandoffCount`, message: "Library ladder standoffs must fit within the module width." });
      }
      if (railHeight < 1900) {
        addWarning(
          issues,
          `${prefix}.libraryLadderRailHeight`,
          "Library ladder rails under 1900 mm high should be reviewed for head clearance, shelf access, and ladder hardware compatibility."
        );
      }
      if (railProjection < 40) {
        addWarning(
          issues,
          `${prefix}.libraryLadderRailProjection`,
          "Library ladder rail projections under 40 mm should be reviewed for ladder hook clearance and shelf-front interference."
        );
      }
      if (railProjection > 140) {
        addWarning(
          issues,
          `${prefix}.libraryLadderRailProjection`,
          "Library ladder rail projections over 140 mm should be reviewed for circulation clearance and ladder stability."
        );
      }
      const standoffSpacing = standoffCount > 1 ? module.width / (standoffCount + 1) : module.width;
      if (standoffSpacing < 240) {
        addWarning(
          issues,
          `${prefix}.libraryLadderStandoffCount`,
          "Library ladder standoffs spaced under 240 mm should be reviewed for hardware crowding and fastener access."
        );
      }
    }

    if (hasCabinetStemwareRack(module)) {
      const laneCount = getCabinetStemwareRackLaneCount(module);
      const rackDepth = getCabinetStemwareRackDepth(module);
      const railWidth = getCabinetStemwareRackRailWidth(module);
      const laneSpacing = getCabinetStemwareRackLaneSpacing(module);
      const mountHeight = getCabinetStemwareRackMountHeight(module);
      const rackTotalWidth = getCabinetStemwareRackTotalWidth(module);
      const railPositions = getCabinetStemwareRackRailLocalXPositions(module);

      if (laneCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.stemwareRackLaneCount`, message: "Stemware racks need at least one lane." });
      }
      if (rackDepth <= 0 || railWidth <= 0) {
        issues.push({ severity: "error", field: `${prefix}.stemwareRackDepth`, message: "Stemware racks need positive rail width and depth." });
      }
      if (rackDepth > module.depth) {
        issues.push({ severity: "error", field: `${prefix}.stemwareRackDepth`, message: "Stemware rack depth cannot exceed the module depth." });
      }
      if (rackTotalWidth > module.width) {
        issues.push({ severity: "error", field: `${prefix}.stemwareRackLaneCount`, message: "Stemware rack lanes exceed the module width." });
      }
      if (railPositions.some((localX) => localX < 0 || localX + railWidth > module.width)) {
        issues.push({ severity: "error", field: `${prefix}.stemwareRackLaneCount`, message: "Stemware rack rails must fit within the module width." });
      }
      if (mountHeight - CABINET_DEFAULT_STEMWARE_RACK_RAIL_HEIGHT / 2 < 0 || mountHeight + CABINET_DEFAULT_STEMWARE_RACK_RAIL_HEIGHT / 2 > module.height) {
        issues.push({ severity: "error", field: `${prefix}.stemwareRackMountHeight`, message: "Stemware rack mount height must fit within the module height." });
      }
      if (laneSpacing < 55) {
        addWarning(
          issues,
          `${prefix}.stemwareRackLaneSpacing`,
          "Stemware rack lane spacing under 55 mm should be reviewed against glass base diameter and loading clearance."
        );
      }
      if (rackDepth < 250) {
        addWarning(
          issues,
          `${prefix}.stemwareRackDepth`,
          "Stemware rack depths under 250 mm should be reviewed for glass storage capacity."
        );
      }
      if (mountHeight < 1300 || mountHeight > module.height - 120) {
        addWarning(
          issues,
          `${prefix}.stemwareRackMountHeight`,
          "Stemware rack mount heights near the top or bottom of a bay should be reviewed for reach, shelf clearance, and glass drop."
        );
      }
      if (module.frontType !== "open" && module.doorStyle !== "glass") {
        addWarning(
          issues,
          `${prefix}.frontType`,
          "Stemware racks behind solid fronts should be reviewed for visibility, access, and glass clearance."
        );
      }
    }

    if (hasCabinetLightingChannels(module)) {
      const channelCount = getCabinetLightingChannelCount(module);
      const channelDepth = getCabinetLightingChannelDepth(module);
      const channelHeight = getCabinetLightingChannelHeight(module);
      const channelWidth = getCabinetLightingChannelWidth(definition, module);
      const channelInset = getCabinetLightingChannelInsetFromFront(module);
      const channelLocalZ = getCabinetLightingChannelLocalZ(definition, module);
      const channelYPositions = getCabinetLightingChannelLocalYPositions(definition, module);

      if (channelCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.lightingChannelCount`, message: "Integrated lighting needs at least one channel." });
      }
      if (channelDepth <= 0 || channelHeight <= 0) {
        issues.push({ severity: "error", field: `${prefix}.lightingChannelDepth`, message: "Integrated lighting channels need positive depth and height." });
      }
      if (channelWidth <= 0) {
        issues.push({ severity: "error", field: `${prefix}.lightingChannelCount`, message: "Integrated lighting needs a positive interior module width." });
      }
      if (channelDepth > module.depth - definition.backPanelThickness) {
        issues.push({ severity: "error", field: `${prefix}.lightingChannelDepth`, message: "Lighting channel depth cannot exceed the cabinet interior depth." });
      }
      if (channelInset + channelDepth > module.depth - definition.backPanelThickness) {
        issues.push({ severity: "error", field: `${prefix}.lightingChannelInsetFromFront`, message: "Lighting channel inset and depth must fit before the back panel." });
      }
      if (
        channelYPositions.length !== channelCount ||
        channelYPositions.some((localY) => localY < 0 || localY + channelHeight > module.height)
      ) {
        issues.push({ severity: "error", field: `${prefix}.lightingChannelCount`, message: "Lighting channel vertical layout must fit within the module." });
      }
      if (channelLocalZ < 0 || channelLocalZ + channelDepth > module.depth - definition.backPanelThickness) {
        issues.push({ severity: "error", field: `${prefix}.lightingChannelInsetFromFront`, message: "Lighting channel depth must stay inside the cabinet interior." });
      }
      if (channelInset < 25) {
        addWarning(
          issues,
          `${prefix}.lightingChannelInsetFromFront`,
          "Lighting channel inset under 25 mm should be reviewed for glare, diffuser visibility, and front-edge milling."
        );
      }
      if (channelHeight > 16) {
        addWarning(
          issues,
          `${prefix}.lightingChannelHeight`,
          "Lighting channels over 16 mm high should be reviewed against shelf thickness, diffuser profile, and visible shadow lines."
        );
      }
      if (module.shelfCount > 0 && channelCount > module.shelfCount) {
        addWarning(
          issues,
          `${prefix}.lightingChannelCount`,
          "More lighting channels than shelves should be reviewed for driver capacity, cable routing, and installation access."
        );
      }
      if (module.frontType !== "open" && module.doorStyle !== "glass") {
        addWarning(
          issues,
          `${prefix}.frontType`,
          "Integrated lighting behind solid fronts should be reviewed for usefulness, switching, and service access."
        );
      }
    }

    if (hasCabinetShelfPinRows(module)) {
      const rowPairCount = getCabinetShelfPinRowPairCount(module);
      const holeCount = getCabinetShelfPinHoleCount(module);
      const holeSpacing = getCabinetShelfPinHoleSpacing(module);
      const inset = getCabinetShelfPinInsetFromFront(module);
      const startHeight = getCabinetShelfPinStartHeight(module);
      const rowHeight = getCabinetShelfPinRowHeight(module);
      const rowLayouts = getCabinetShelfPinRowLayouts(definition, module);
      const interiorDepth = module.depth - definition.backPanelThickness;

      if (rowPairCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.shelfPinRowPairCount`, message: "Adjustable shelf pins need at least one row pair." });
      }
      if (holeCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.shelfPinHoleCount`, message: "Adjustable shelf pins need at least one hole per row." });
      }
      if (holeSpacing <= 0) {
        issues.push({ severity: "error", field: `${prefix}.shelfPinHoleSpacing`, message: "Adjustable shelf pin spacing must be positive." });
      }
      if (rowLayouts.length !== rowPairCount * 2) {
        issues.push({ severity: "error", field: `${prefix}.shelfPinRowPairCount`, message: "Shelf pin row pair layout must generate left and right rows for each pair." });
      }
      if (inset + CABINET_SHELF_PIN_ROW_MARKER_DEPTH > interiorDepth) {
        issues.push({ severity: "error", field: `${prefix}.shelfPinInsetFromFront`, message: "Shelf pin front inset must fit within the cabinet interior depth." });
      }
      if (
        rowLayouts.some(
          (layout) =>
            layout.localZ < 0 ||
            layout.localZ + CABINET_SHELF_PIN_ROW_MARKER_DEPTH > interiorDepth
        )
      ) {
        issues.push({ severity: "error", field: `${prefix}.shelfPinInsetFromFront`, message: "Shelf pin rows must stay inside the cabinet interior depth." });
      }
      if (startHeight + rowHeight > module.height - definition.boardThickness) {
        issues.push({ severity: "error", field: `${prefix}.shelfPinStartHeight`, message: "Shelf pin rows must fit below the module top panel." });
      }
      if (module.shelfCount <= 0) {
        addWarning(
          issues,
          `${prefix}.shelfPinRowsEnabled`,
          "Shelf pin rows without adjustable shelves should be reviewed for fabrication intent."
        );
      }
      if (holeSpacing < 25) {
        addWarning(
          issues,
          `${prefix}.shelfPinHoleSpacing`,
          "Shelf pin spacing under 25 mm should be reviewed against drilling templates and shelf adjustment usefulness."
        );
      }
      if (holeSpacing > 64) {
        addWarning(
          issues,
          `${prefix}.shelfPinHoleSpacing`,
          "Shelf pin spacing over 64 mm should be reviewed for usable shelf adjustability."
        );
      }
      if (holeCount < Math.max(4, module.shelfCount)) {
        addWarning(
          issues,
          `${prefix}.shelfPinHoleCount`,
          "Shelf pin rows with few holes should be reviewed against shelf count and adjustment range."
        );
      }
      if (startHeight < definition.toeKickHeight + definition.boardThickness) {
        addWarning(
          issues,
          `${prefix}.shelfPinStartHeight`,
          "Shelf pin rows starting below the usable cabinet opening should be reviewed against toe-kick and bottom-panel clearances."
        );
      }
    }

    if (hasCabinetDoorHinges(module)) {
      const hingeCount = getCabinetDoorHingeCountPerDoor(module);
      const hingeInset = getCabinetDoorHingeInsetFromTopBottom(module);
      const doorFrontLayouts = getCabinetDoorFrontLayouts(definition, module);
      const hingeLayouts = getCabinetDoorHingeLayouts(definition, module);
      const shortestDoorHeight = Math.min(
        ...doorFrontLayouts.map((front) => front.height)
      );
      const widestDoorWidth = Math.max(
        ...doorFrontLayouts.map((front) => front.width)
      );

      if (doorFrontLayouts.length <= 0) {
        issues.push({ severity: "error", field: `${prefix}.frontType`, message: "Door hinges require door fronts." });
      }
      if (hingeCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.doorHingeCountPerDoor`, message: "Door hinge hardware needs at least one hinge pair per door." });
      }
      if (doorFrontLayouts.length > 0 && hingeLayouts.length !== doorFrontLayouts.length * hingeCount) {
        issues.push({ severity: "error", field: `${prefix}.doorHingeCountPerDoor`, message: "Door hinge layout must generate the requested hinge pairs for every door." });
      }
      if (Number.isFinite(shortestDoorHeight) && hingeInset * 2 + CABINET_DOOR_HINGE_MARKER_HEIGHT > shortestDoorHeight) {
        issues.push({ severity: "error", field: `${prefix}.doorHingeInsetFromTopBottom`, message: "Door hinge top/bottom insets must fit within the shortest door." });
      }
      if (hingeCount < 2) {
        addWarning(
          issues,
          `${prefix}.doorHingeCountPerDoor`,
          "Single hinge pairs per door should be reviewed for door weight, alignment, and sag risk."
        );
      }
      if (Number.isFinite(widestDoorWidth) && widestDoorWidth > 600 && hingeCount < 3) {
        addWarning(
          issues,
          `${prefix}.doorHingeCountPerDoor`,
          "Wide doors should be reviewed for a third hinge pair or revised door split."
        );
      }
      if (Number.isFinite(shortestDoorHeight) && shortestDoorHeight > 1500 && hingeCount < 3) {
        addWarning(
          issues,
          `${prefix}.doorHingeCountPerDoor`,
          "Tall doors should be reviewed for a third hinge pair and load-rated hardware."
        );
      }
      if (hingeCount > 4) {
        addWarning(
          issues,
          `${prefix}.doorHingeCountPerDoor`,
          "More than four hinge pairs per door should be reviewed for drilling conflict and adjustment access."
        );
      }
      if (hingeInset < 50) {
        addWarning(
          issues,
          `${prefix}.doorHingeInsetFromTopBottom`,
          "Door hinge insets under 50 mm should be reviewed against cup drilling, rails, and edge stability."
        );
      }
      if (hingeInset > 200) {
        addWarning(
          issues,
          `${prefix}.doorHingeInsetFromTopBottom`,
          "Door hinge insets over 200 mm should be reviewed for door alignment and sag control."
        );
      }
    }

    if (hasCabinetInstallationCleat(module)) {
      const cleatHeight = getCabinetInstallationCleatHeight(module);
      const cleatThickness = getCabinetInstallationCleatThickness(module);
      const cleatInset = getCabinetInstallationCleatInsetFromTop(module);
      const cleatLayout = getCabinetInstallationCleatLayout(definition, module);
      const availableHeight = module.height - definition.boardThickness - definition.toeKickHeight;
      const availableDepth = module.depth - definition.backPanelThickness;

      if (!cleatLayout) {
        issues.push({ severity: "error", field: `${prefix}.installationCleatEnabled`, message: "Installation cleat must generate a positive board part." });
      }
      if (cleatInset + cleatHeight > availableHeight) {
        issues.push({ severity: "error", field: `${prefix}.installationCleatInsetFromTop`, message: "Installation cleat must fit below the top panel and above the toe/service zone." });
      }
      if (cleatThickness > availableDepth) {
        issues.push({ severity: "error", field: `${prefix}.installationCleatThickness`, message: "Installation cleat thickness cannot exceed the usable cabinet depth." });
      }
      if (cleatThickness < 12) {
        addWarning(
          issues,
          `${prefix}.installationCleatThickness`,
          "Installation cleats under 12 mm thick should be reviewed for fastener bite and anti-tip strength."
        );
      }
      if (cleatHeight < 50) {
        addWarning(
          issues,
          `${prefix}.installationCleatHeight`,
          "Installation cleats under 50 mm high should be reviewed for anchoring access and load distribution."
        );
      }
      if (cleatInset < 40) {
        addWarning(
          issues,
          `${prefix}.installationCleatInsetFromTop`,
          "Installation cleats very close to the top panel may limit fastener access."
        );
      }
      if (!["wall", "tall", "wardrobe"].includes(module.type)) {
        addWarning(
          issues,
          `${prefix}.installationCleatEnabled`,
          "Installation cleats on base modules should be reviewed against countertop, backsplash, and wall fixing strategy."
        );
      }
    }

    if (hasCabinetAntiTipAnchors(module)) {
      const anchorCount = getCabinetAntiTipAnchorCount(module);
      const anchorHeight = getCabinetAntiTipAnchorHeight(module);
      const anchorInset = getCabinetAntiTipAnchorInsetFromSides(module);
      const anchorLayouts = getCabinetAntiTipAnchorLayouts(module);

      if (anchorCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.antiTipAnchorCount`, message: "Anti-tip anchoring needs at least one bracket." });
      }
      if (anchorLayouts.length !== anchorCount) {
        issues.push({ severity: "error", field: `${prefix}.antiTipAnchorCount`, message: "Anti-tip anchor layout must generate the requested bracket count." });
      }
      if (anchorHeight < CABINET_ANTI_TIP_ANCHOR_HEIGHT / 2 || anchorHeight > module.height - CABINET_ANTI_TIP_ANCHOR_HEIGHT / 2) {
        issues.push({ severity: "error", field: `${prefix}.antiTipAnchorHeight`, message: "Anti-tip anchor height must fit within the module height." });
      }
      if (anchorInset * 2 + CABINET_ANTI_TIP_ANCHOR_WIDTH > module.width) {
        issues.push({ severity: "error", field: `${prefix}.antiTipAnchorInsetFromSides`, message: "Anti-tip anchor side insets must leave room for bracket placement." });
      }
      if (anchorCount < 2 && module.width > 700) {
        addWarning(
          issues,
          `${prefix}.antiTipAnchorCount`,
          "Wide tall modules should usually use two anti-tip anchor brackets or a continuous anchoring rail."
        );
      }
      if (anchorHeight < module.height * 0.72) {
        addWarning(
          issues,
          `${prefix}.antiTipAnchorHeight`,
          "Low anti-tip anchor brackets should be reviewed for leverage and tip resistance."
        );
      }
      if (anchorInset < 60) {
        addWarning(
          issues,
          `${prefix}.antiTipAnchorInsetFromSides`,
          "Anti-tip anchor brackets close to side panels should be reviewed for fastener access and splitting."
        );
      }
      if (!["tall", "wardrobe", "wall"].includes(module.type)) {
        addWarning(
          issues,
          `${prefix}.antiTipAnchorEnabled`,
          "Anti-tip brackets on base-height modules should be reviewed against actual tip risk and wall fixing strategy."
        );
      }
    }

    if (hasCabinetDrawerBoxes(module)) {
      const drawerFrontLayouts = getCabinetDrawerFrontLayouts(definition, module);
      const drawerBoxLayouts = getCabinetDrawerBoxLayouts(definition, module);
      const sideThickness = getCabinetDrawerBoxSideThickness(module);
      const bottomThickness = getCabinetDrawerBoxBottomThickness(module);
      const heightClearance = getCabinetDrawerBoxHeightClearance(module);
      const backClearance = getCabinetDrawerBoxBackClearance(module);
      const narrowestBoxWidth = Math.min(...drawerBoxLayouts.map((box) => box.width));
      const shortestBoxHeight = Math.min(...drawerBoxLayouts.map((box) => box.height));
      const shallowestBoxDepth = Math.min(...drawerBoxLayouts.map((box) => box.depth));

      if (drawerFrontLayouts.length <= 0) {
        issues.push({ severity: "error", field: `${prefix}.frontType`, message: "Drawer boxes require drawer fronts." });
      }
      if (drawerFrontLayouts.length > 0 && drawerBoxLayouts.length !== drawerFrontLayouts.length) {
        issues.push({ severity: "error", field: `${prefix}.drawerBoxEnabled`, message: "Drawer box layout must generate one box for every drawer front." });
      }
      if (Number.isFinite(narrowestBoxWidth) && narrowestBoxWidth <= sideThickness * 2) {
        issues.push({ severity: "error", field: `${prefix}.drawerBoxSideThickness`, message: "Drawer box side thickness must leave a positive internal drawer width." });
      }
      if (Number.isFinite(shortestBoxHeight) && shortestBoxHeight <= bottomThickness + 25) {
        issues.push({ severity: "error", field: `${prefix}.drawerBoxHeightClearance`, message: "Drawer box height clearance leaves too little usable box height." });
      }
      if (Number.isFinite(shallowestBoxDepth) && shallowestBoxDepth <= sideThickness * 2) {
        issues.push({ severity: "error", field: `${prefix}.drawerBoxBackClearance`, message: "Drawer box depth must leave room for the back panel and usable storage." });
      }
      if (sideThickness < 10) {
        addWarning(
          issues,
          `${prefix}.drawerBoxSideThickness`,
          "Drawer box sides under 10 mm should be reviewed for joinery strength and slide fixing."
        );
      }
      if (bottomThickness < 6) {
        addWarning(
          issues,
          `${prefix}.drawerBoxBottomThickness`,
          "Drawer box bottoms under 6 mm should be reviewed for load rating and capture detail."
        );
      }
      if (heightClearance < 30) {
        addWarning(
          issues,
          `${prefix}.drawerBoxHeightClearance`,
          "Drawer box height clearance under 30 mm should be reviewed against front reveals and adjustment tolerance."
        );
      }
      if (backClearance < 12) {
        addWarning(
          issues,
          `${prefix}.drawerBoxBackClearance`,
          "Drawer box back clearance under 12 mm should be reviewed against back panels, wall irregularity, and slide stops."
        );
      }
      if (Number.isFinite(shallowestBoxDepth) && shallowestBoxDepth < 300) {
        addWarning(
          issues,
          `${prefix}.drawerBoxBackClearance`,
          "Drawer box depths under 300 mm should be reviewed for useful storage and slide stability."
        );
      }
      if (Number.isFinite(narrowestBoxWidth) && narrowestBoxWidth > 800) {
        addWarning(
          issues,
          `${prefix}.drawerBoxSideThickness`,
          "Wide drawer boxes should be reviewed for heavier bottoms, stronger joinery, and slide load rating."
        );
      }
    }

    if (hasCabinetDrawerSlides(module)) {
      const drawerSlideLength = getCabinetDrawerSlideLength(module);
      const drawerSlideClearance = getCabinetDrawerSlideClearance(module);
      const drawerFrontLayouts = getCabinetDrawerFrontLayouts(definition, module);
      const drawerSlideLayouts = getCabinetDrawerSlideLayouts(definition, module);
      const narrowestDrawerWidth = Math.min(...drawerFrontLayouts.map((front) => front.width));
      const interiorDepth = module.depth - definition.backPanelThickness;

      if (drawerFrontLayouts.length <= 0) {
        issues.push({ severity: "error", field: `${prefix}.frontType`, message: "Drawer slide hardware requires drawer fronts." });
      }
      if (drawerSlideLength <= 0) {
        issues.push({ severity: "error", field: `${prefix}.drawerSlideLength`, message: "Drawer slide length must be positive." });
      }
      if (drawerSlideLength > interiorDepth) {
        issues.push({ severity: "error", field: `${prefix}.drawerSlideLength`, message: "Drawer slide length cannot exceed the cabinet interior depth." });
      }
      if (Number.isFinite(narrowestDrawerWidth) && drawerSlideClearance * 2 >= narrowestDrawerWidth) {
        issues.push({ severity: "error", field: `${prefix}.drawerSlideClearance`, message: "Drawer slide side clearances must leave a positive drawer-box width." });
      }
      if (drawerFrontLayouts.length > 0 && drawerSlideLayouts.length !== drawerFrontLayouts.length) {
        issues.push({ severity: "error", field: `${prefix}.drawerSlideLength`, message: "Drawer slide layout must generate one slide pair for every drawer front." });
      }
      if (drawerSlideLength < 350) {
        addWarning(
          issues,
          `${prefix}.drawerSlideLength`,
          "Drawer slides under 350 mm long should be reviewed for storage depth and drawer stability."
        );
      }
      if (drawerSlideLength > interiorDepth - 50) {
        addWarning(
          issues,
          `${prefix}.drawerSlideLength`,
          "Drawer slides close to the cabinet back should be reviewed against back panels, wiring, and wall irregularities."
        );
      }
      if (drawerSlideClearance < 10) {
        addWarning(
          issues,
          `${prefix}.drawerSlideClearance`,
          "Drawer slide side clearances under 10 mm should be reviewed against the selected hardware and installation tolerance."
        );
      }
      if (drawerSlideClearance > 25) {
        addWarning(
          issues,
          `${prefix}.drawerSlideClearance`,
          "Drawer slide side clearances over 25 mm should be reviewed for wasted drawer width and spacer requirements."
        );
      }
    }

    if (hasCabinetHamperPullOut(module)) {
      const basketCount = getCabinetHamperBasketCount(module);
      const basketDepth = getCabinetHamperBasketDepth(module);
      const basketHeight = getCabinetHamperBasketHeight(module);
      const slideClearance = getCabinetHamperSlideClearance(module);
      const openingWidth = getCabinetHamperOpeningWidth(definition, module);
      const openingHeight = getCabinetHamperOpeningHeight(definition, module);
      const basketLayouts = getCabinetHamperBasketLayouts(definition, module);

      if (basketCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.hamperBasketCount`, message: "Pull-out hampers need at least one basket." });
      }
      if (basketDepth <= 0 || basketHeight <= 0) {
        issues.push({ severity: "error", field: `${prefix}.hamperBasketDepth`, message: "Pull-out hamper baskets need positive depth and height." });
      }
      if (module.type === "wall") {
        issues.push({ severity: "error", field: `${prefix}.type`, message: "Pull-out hampers need base, tall, or wardrobe support." });
      }
      if (basketDepth > module.depth - definition.backPanelThickness) {
        issues.push({ severity: "error", field: `${prefix}.hamperBasketDepth`, message: "Pull-out hamper basket depth cannot exceed the cabinet interior depth." });
      }
      if (basketHeight > openingHeight) {
        issues.push({ severity: "error", field: `${prefix}.hamperBasketHeight`, message: "Pull-out hamper basket height must fit within the lower cabinet opening." });
      }
      if (openingWidth <= 0 || basketLayouts.length !== basketCount) {
        issues.push({ severity: "error", field: `${prefix}.hamperBasketCount`, message: "Pull-out hamper baskets must fit within the module width and slide clearances." });
      }
      if (basketLayouts.some((layout) => layout.width < 300)) {
        addWarning(
          issues,
          `${prefix}.hamperBasketCount`,
          "Pull-out hamper baskets under 300 mm wide should be reviewed for usable laundry capacity and removable liner access."
        );
      }
      if (basketDepth < 400) {
        addWarning(
          issues,
          `${prefix}.hamperBasketDepth`,
          "Pull-out hamper baskets under 400 mm deep should be reviewed for laundry capacity and liner fit."
        );
      }
      if (basketHeight < 280) {
        addWarning(
          issues,
          `${prefix}.hamperBasketHeight`,
          "Pull-out hamper baskets under 280 mm high should be reviewed for laundry capacity and tipping risk."
        );
      }
      if (slideClearance < 25) {
        addWarning(
          issues,
          `${prefix}.hamperSlideClearance`,
          "Hamper slide clearance under 25 mm should be reviewed against slide hardware, fixing screws, and basket side frames."
        );
      }
      if (module.frontType === "open") {
        addWarning(
          issues,
          `${prefix}.frontType`,
          "Open-front pull-out hampers should be reviewed for visible laundry, ventilation, and removable liner requirements."
        );
      }
    }

    if (hasCabinetPanelFrame(module)) {
      const panelColumnCount = getCabinetPanelColumnCount(module);
      const panelRowCount = getCabinetPanelRowCount(module);
      const panelFrameWidth = getCabinetPanelFrameWidth(module);
      const panelFrameDepth = getCabinetPanelFrameDepth(module);
      const panelOpeningWidth = getCabinetPanelOpeningWidth(module);
      const panelOpeningHeight = getCabinetPanelOpeningHeight(module);

      if (panelColumnCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.panelColumnCount`, message: "Panel frames need at least one column." });
      }
      if (panelRowCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.panelRowCount`, message: "Panel frames need at least one row." });
      }
      if (panelOpeningWidth <= 0) {
        issues.push({
          severity: "error",
          field: `${prefix}.panelColumnCount`,
          message: "Panel stile layout exceeds module width.",
        });
      }
      if (panelOpeningHeight <= 0) {
        issues.push({
          severity: "error",
          field: `${prefix}.panelRowCount`,
          message: "Panel rail layout exceeds module height.",
        });
      }
      if (panelFrameWidth < 25) {
        addWarning(
          issues,
          `${prefix}.panelFrameWidth`,
          "Very narrow rails or stiles under 25 mm should be reviewed for milling, finishing, and installation tolerance."
        );
      }
      if (panelFrameDepth > 60) {
        addWarning(
          issues,
          `${prefix}.panelFrameDepth`,
          "Panel frames projecting over 60 mm should be reviewed for anchoring, reveals, and shadow-line intent."
        );
      }
      if (panelOpeningWidth > 0 && panelOpeningWidth < 220) {
        addWarning(
          issues,
          `${prefix}.panelColumnCount`,
          "Very narrow panel openings under 220 mm should be reviewed for proportions, finish quality, and installation access."
        );
      }
      if (panelOpeningHeight > 0 && panelOpeningHeight < 220) {
        addWarning(
          issues,
          `${prefix}.panelRowCount`,
          "Very short panel openings under 220 mm should be reviewed for proportions, finish quality, and installation access."
        );
      }
    }

    if (isCabinetCeilingComponent(module)) {
      const beamWidth = getCabinetCeilingBeamWidth(module);
      const beamDepth = getCabinetCeilingBeamDepth(module);
      if (beamWidth < 75) {
        addWarning(
          issues,
          `${prefix}.ceilingBeamWidth`,
          "Ceiling beams under 75 mm wide should be reviewed for fastening, finishing, and visual proportion."
        );
      }
      if (beamDepth > 350) {
        addWarning(
          issues,
          `${prefix}.ceilingBeamDepth`,
          "Ceiling beams deeper than 350 mm should be reviewed for head clearance, weight, and structural anchoring."
        );
      }
    }

    if (isCabinetCeilingBeamArray(module)) {
      const beamCount = getCabinetCeilingBeamCount(module);
      const beamWidth = getCabinetCeilingBeamWidth(module);
      const span = getCabinetCeilingBeamArraySpan(module);
      if (beamWidth > span) {
        issues.push({
          severity: "error",
          field: `${prefix}.ceilingBeamWidth`,
          message: "Ceiling beam width exceeds the available beam array span.",
        });
      }
      if (beamCount * beamWidth > span) {
        issues.push({
          severity: "error",
          field: `${prefix}.ceilingBeamCount`,
          message: "Ceiling beam array exceeds the available span.",
        });
      }
      if (beamCount > 1) {
        const clearSpacing = (span - beamCount * beamWidth) / (beamCount + 1);
        if (clearSpacing > 0 && clearSpacing < 300) {
          addWarning(
            issues,
            `${prefix}.ceilingBeamCount`,
            "Ceiling beam spacing under 300 mm should be reviewed for visual density, installation access, and lighting coordination."
          );
        }
      }
    }

    if (isCabinetCofferedCeilingGrid(module)) {
      const columnCount = getCabinetCeilingGridColumnCount(module);
      const rowCount = getCabinetCeilingGridRowCount(module);
      const openingWidth = getCabinetCeilingGridOpeningWidth(module);
      const openingDepth = getCabinetCeilingGridOpeningDepth(module);
      if (columnCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.ceilingGridColumnCount`, message: "Coffered ceiling grids need at least one column." });
      }
      if (rowCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.ceilingGridRowCount`, message: "Coffered ceiling grids need at least one row." });
      }
      if (openingWidth <= 0) {
        issues.push({
          severity: "error",
          field: `${prefix}.ceilingGridColumnCount`,
          message: "Coffered ceiling column beams exceed the module width.",
        });
      }
      if (openingDepth <= 0) {
        issues.push({
          severity: "error",
          field: `${prefix}.ceilingGridRowCount`,
          message: "Coffered ceiling row beams exceed the module depth.",
        });
      }
      if (openingWidth > 0 && openingWidth < 450) {
        addWarning(
          issues,
          `${prefix}.ceilingGridColumnCount`,
          "Coffered ceiling openings under 450 mm wide should be reviewed for proportion, finishing, and fixture coordination."
        );
      }
      if (openingDepth > 0 && openingDepth < 450) {
        addWarning(
          issues,
          `${prefix}.ceilingGridRowCount`,
          "Coffered ceiling openings under 450 mm deep should be reviewed for proportion, finishing, and fixture coordination."
        );
      }
    }

    if (isCabinetTrimComponent(module)) {
      const trimProfileWidth = getCabinetTrimProfileWidth(module);
      const trimProfileDepth = getCabinetTrimProfileDepth(module);
      if (trimProfileWidth < 25) {
        addWarning(
          issues,
          `${prefix}.trimProfileWidth`,
          "Trim profiles under 25 mm wide should be reviewed for milling, finish durability, and installation tolerance."
        );
      }
      if (trimProfileDepth > 120) {
        addWarning(
          issues,
          `${prefix}.trimProfileDepth`,
          "Trim profiles deeper than 120 mm should be reviewed for projection, fastening, and adjacent clearance."
        );
      }
    }

    if (isCabinetTrimRun(module)) {
      const memberCount = getCabinetTrimMemberCount(module);
      const runSpan = module.trimOrientation === "z" ? module.depth : module.width;
      const trimProfileWidth = getCabinetTrimProfileWidth(module);
      const trimProfileDepth = getCabinetTrimProfileDepth(module);
      const trimPlacement = getCabinetTrimPlacement(module);
      const trimSetoutHeight = getCabinetTrimSetoutHeight(module);
      const leftEndTreatment = getCabinetTrimLeftEndTreatment(module);
      const rightEndTreatment = getCabinetTrimRightEndTreatment(module);
      const returnDepth = getCabinetTrimReturnDepth(module);
      const miterAngle = getCabinetTrimMiterAngle(module);
      const revealStripHeight = getCabinetTrimRevealStripHeight(module);
      const revealStripDepth = getCabinetTrimRevealStripDepth(module);
      const revealStripInsetFromTop = getCabinetTrimRevealStripInsetFromTop(module);
      if (memberCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.trimMemberCount`, message: "Trim runs need at least one member." });
      }
      if (trimSetoutHeight + trimProfileWidth > module.height) {
        issues.push({ severity: "error", field: `${prefix}.trimSetoutHeight`, message: "Trim setout height plus profile width must fit within the module height." });
      }
      if (hasCabinetTrimRevealStrip(module)) {
        if (revealStripHeight <= 0) {
          issues.push({ severity: "error", field: `${prefix}.trimRevealStripHeight`, message: "Trim reveal strip height must be positive." });
        }
        if (revealStripDepth <= 0) {
          issues.push({ severity: "error", field: `${prefix}.trimRevealStripDepth`, message: "Trim reveal strip depth must be positive." });
        }
        if (revealStripHeight + revealStripInsetFromTop > trimProfileWidth) {
          issues.push({
            severity: "error",
            field: `${prefix}.trimRevealStripHeight`,
            message: "Trim reveal strip height and top inset must fit within the primary trim profile.",
          });
        }
        if (trimProfileDepth + revealStripDepth > module.depth) {
          issues.push({
            severity: "error",
            field: `${prefix}.trimRevealStripDepth`,
            message: "Trim reveal strip depth must fit behind the primary trim profile within the module depth.",
          });
        }
        if (revealStripHeight > 0 && revealStripHeight < 10) {
          addWarning(
            issues,
            `${prefix}.trimRevealStripHeight`,
            "Trim reveal strips under 10 mm high should be reviewed for milling, fastening, and visible shadow consistency."
          );
        }
        if (revealStripDepth > 40) {
          addWarning(
            issues,
            `${prefix}.trimRevealStripDepth`,
            "Deep trim reveal backing strips should be reviewed against wall flatness, fastener access, and adjacent clearances."
          );
        }
        if (revealStripInsetFromTop > trimProfileWidth * 0.4) {
          addWarning(
            issues,
            `${prefix}.trimRevealStripInsetFromTop`,
            "Large trim reveal strip top insets should be reviewed against the intended shadow line and profile proportions."
          );
        }
      }
      if (runSpan / Math.max(1, memberCount) > 3000) {
        addWarning(
          issues,
          `${prefix}.trimMemberCount`,
          "Trim members longer than 3000 mm should be reviewed for stock lengths, seams, transport, and field-fit cuts."
        );
      }
      if (trimPlacement === "baseboard" && trimSetoutHeight > 150) {
        addWarning(
          issues,
          `${prefix}.trimSetoutHeight`,
          "Baseboard trim set above 150 mm should be reviewed against floor datum, plinths, and reveal alignment."
        );
      }
      if (trimPlacement === "crown_moulding" && trimSetoutHeight < module.height - trimProfileWidth - 120) {
        addWarning(
          issues,
          `${prefix}.trimSetoutHeight`,
          "Crown moulding set well below the ceiling should be reviewed against ceiling datum, shadow gaps, and backing."
        );
      }
      if ((trimPlacement === "chair_rail" || trimPlacement === "picture_rail") && (trimSetoutHeight < 600 || trimSetoutHeight > module.height - trimProfileWidth - 100)) {
        addWarning(
          issues,
          `${prefix}.trimSetoutHeight`,
          "Rail trim setouts should be reviewed against furniture heights, artwork sightlines, and switch/outlet conflicts."
        );
      }
      if ((leftEndTreatment === "mitered_return" || rightEndTreatment === "mitered_return") && returnDepth < trimProfileDepth * 2) {
        addWarning(
          issues,
          `${prefix}.trimReturnDepth`,
          "Very shallow trim returns should be reviewed for miter glue area, wall out-of-square conditions, and finish durability."
        );
      }
      if ((leftEndTreatment === "mitered_return" || rightEndTreatment === "mitered_return") && Math.abs(miterAngle - 45) > 10) {
        addWarning(
          issues,
          `${prefix}.trimMiterAngle`,
          "Trim miter angles far from 45 degrees should be field-verified against corner conditions before fabrication."
        );
      }
      if ((leftEndTreatment === "coped" || rightEndTreatment === "coped") && trimPlacement !== "crown_moulding" && trimPlacement !== "casing") {
        addWarning(
          issues,
          `${prefix}.trimLeftEndTreatment`,
          "Coped trim ends outside crown or casing details should be reviewed with the installer and finish carpenter."
        );
      }
    }

    if (isCabinetFireplaceSurroundFrame(module)) {
      const openingWidth = getCabinetFireplaceOpeningWidth(module);
      const openingHeight = getCabinetFireplaceOpeningHeight(module);
      const legWidth = getCabinetFireplaceLegWidth(module);
      const headerHeight = getCabinetFireplaceHeaderHeight(module);
      const mantelHeight = getCabinetFireplaceMantelHeight(module);
      const mantelDepth = getCabinetFireplaceMantelDepth(module);
      const frameOuterWidth = getCabinetFireplaceFrameOuterWidth(module);
      const trimStackHeight = getCabinetFireplaceTrimStackHeight(module);

      if (openingWidth >= module.width) {
        issues.push({
          severity: "error",
          field: `${prefix}.fireplaceOpeningWidth`,
          message: "Fireplace opening width must fit inside the surround width.",
        });
      }
      if (frameOuterWidth > module.width) {
        issues.push({
          severity: "error",
          field: `${prefix}.fireplaceLegWidth`,
          message: "Fireplace legs plus opening exceed the surround width.",
        });
      }
      if (trimStackHeight > module.height) {
        issues.push({
          severity: "error",
          field: `${prefix}.fireplaceOpeningHeight`,
          message: "Fireplace opening, header, and mantel exceed the surround height.",
        });
      }
      if (legWidth < 90) {
        addWarning(
          issues,
          `${prefix}.fireplaceLegWidth`,
          "Fireplace legs under 90 mm wide should be reviewed for proportion, fastening, and field-fit scribing."
        );
      }
      if (headerHeight < 90) {
        addWarning(
          issues,
          `${prefix}.fireplaceHeaderHeight`,
          "Fireplace headers under 90 mm high should be reviewed for proportion and finish detailing."
        );
      }
      if (mantelDepth > 350) {
        addWarning(
          issues,
          `${prefix}.fireplaceMantelDepth`,
          "Mantel shelves deeper than 350 mm should be reviewed for support brackets, combustibility clearances, and wall anchoring."
        );
      }
      if (openingHeight > 0 && openingHeight < 500) {
        addWarning(
          issues,
          `${prefix}.fireplaceOpeningHeight`,
          "Short fireplace openings should be reviewed against appliance/firebox clearances and code requirements."
        );
      }
      if (mantelHeight > 220) {
        addWarning(
          issues,
          `${prefix}.fireplaceMantelHeight`,
          "Tall mantel shelves should be reviewed for weight, build-up method, and anchoring."
        );
      }
    }

    if (isCabinetConvertibleComponent(module)) {
      const panelThickness = getCabinetConvertiblePanelThickness(module);
      const panelHeight = getCabinetConvertiblePanelHeight(module);
      const openDepth = getCabinetConvertibleOpenDepth(module);
      const hingeHeight = getCabinetConvertibleHingeHeight(module);
      const supportLegCount = getCabinetConvertibleSupportLegCount(module);
      const supportLegWidth = getCabinetConvertibleSupportLegWidth(module);
      const supportLegDepth = getCabinetConvertibleSupportLegDepth(module);

      if (panelHeight > module.height) {
        issues.push({
          severity: "error",
          field: `${prefix}.convertiblePanelHeight`,
          message: "Convertible panel height cannot exceed module height.",
        });
      }
      if (hingeHeight >= module.height) {
        issues.push({
          severity: "error",
          field: `${prefix}.convertibleHingeHeight`,
          message: "Convertible hinge height must sit below the module top.",
        });
      }
      if (supportLegCount > 0 && supportLegCount * supportLegWidth > module.width) {
        issues.push({
          severity: "error",
          field: `${prefix}.convertibleSupportLegCount`,
          message: "Support legs exceed the convertible panel width.",
        });
      }
      if (panelThickness < 18) {
        addWarning(
          issues,
          `${prefix}.convertiblePanelThickness`,
          "Convertible panels thinner than 18 mm should be reviewed for stiffness, hardware fasteners, and safety loads."
        );
      }
      if (supportLegCount > 4) {
        addWarning(
          issues,
          `${prefix}.convertibleSupportLegCount`,
          "More than four support legs should be reviewed for usability, folding sequence, and hardware coordination."
        );
      }
      if (supportLegDepth < 30 || supportLegWidth < 30) {
        addWarning(
          issues,
          `${prefix}.convertibleSupportLegWidth`,
          "Small support legs under 30 mm should be reviewed for stiffness, hardware fasteners, and floor contact."
        );
      }

      if (isCabinetWallBedPanel(module)) {
        const mattress = CABINET_WALL_BED_MATTRESS_DIMENSIONS[
          getCabinetWallBedMattressSize(module)
        ];
        const orientation = getCabinetWallBedOrientation(module);
        const requiredWidth =
          orientation === "vertical" ? mattress.widthMm : mattress.lengthMm;
        const requiredPanelHeight =
          orientation === "vertical" ? mattress.lengthMm : mattress.widthMm;
        const requiredOpenDepth = requiredPanelHeight;
        if (module.width < requiredWidth) {
          issues.push({
            severity: "error",
            field: `${prefix}.wallBedMattressSize`,
            message: "The selected mattress does not fit the wall-bed cabinet width in this orientation.",
          });
        }
        if (panelHeight < requiredPanelHeight) {
          issues.push({
            severity: "error",
            field: `${prefix}.convertiblePanelHeight`,
            message: "The wall-bed panel is too short for the selected mattress orientation.",
          });
        }
        if (openDepth < requiredOpenDepth) {
          issues.push({
            severity: "error",
            field: `${prefix}.convertibleOpenDepth`,
            message: "The deployed wall-bed depth is too short for the selected mattress.",
          });
        }
        if (openDepth < 1800) {
          addWarning(
            issues,
            `${prefix}.convertibleOpenDepth`,
            "Wall bed open depth under 1800 mm should be reviewed against mattress length and sleeping clearance."
          );
        }
        if (hingeHeight > 180) {
          addWarning(
            issues,
            `${prefix}.convertibleHingeHeight`,
            "Wall bed hinge height over 180 mm should be reviewed for mattress platform height and mechanism geometry."
          );
        }
      }

      if (isCabinetFoldDownWorksurface(module)) {
        if (hingeHeight < 680 || hingeHeight > 780) {
          addWarning(
            issues,
            `${prefix}.convertibleHingeHeight`,
            "Fold-down desk hinge heights outside 680-780 mm should be reviewed for ergonomic work-surface height."
          );
        }
        if (openDepth > 900) {
          addWarning(
            issues,
            `${prefix}.convertibleOpenDepth`,
            "Fold-down work surfaces deeper than 900 mm should be reviewed for support brackets and room clearance."
          );
        }
      }
    }

    if (hasCabinetPlatformDeck(module)) {
      const deckThickness = getCabinetPlatformDeckThickness(module);
      const deckDepth = getCabinetPlatformDeckDepth(module);
      const ribCount = getCabinetPlatformSupportRibCount(module);
      const ribWidth = getCabinetPlatformSupportRibWidth(module);
      const ribHeight = getCabinetPlatformSupportRibHeight(module);

      if (ribHeight >= module.height) {
        issues.push({
          severity: "error",
          field: `${prefix}.platformSupportRibHeight`,
          message: "Platform support rib height must fit below the module deck.",
        });
      }
      if (ribCount * ribWidth > deckDepth) {
        issues.push({
          severity: "error",
          field: `${prefix}.platformSupportRibCount`,
          message: "Platform support ribs exceed the deck depth.",
        });
      }
      if (deckThickness > 60) {
        addWarning(
          issues,
          `${prefix}.platformDeckThickness`,
          "Platform decks thicker than 60 mm should be reviewed for weight, mattress height, and build-up method."
        );
      }
      if (ribCount === 0) {
        addWarning(
          issues,
          `${prefix}.platformSupportRibCount`,
          "Storage bed platform decks without support ribs should be reviewed for mattress support and panel sag."
        );
      }
      if (ribCount > 0) {
        const clearSpan = (deckDepth - ribCount * ribWidth) / Math.max(1, ribCount + 1);
        if (clearSpan > 500) {
          addWarning(
            issues,
            `${prefix}.platformSupportRibCount`,
            "Platform support rib spacing over 500 mm should be reviewed for mattress support and deck deflection."
          );
        }
      }
    }

    if (hasCabinetStairScribe(module)) {
      const stepCount = getCabinetStairScribeStepCount(module);
      const highHeight = getCabinetStairScribeHighHeight(module);
      const lowHeight = getCabinetStairScribeLowHeight(module);
      const scribeDepth = getCabinetStairScribeDepth(module);

      if (stepCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.stairScribeStepCount`, message: "Stair scribes need at least one step." });
      }
      if (highHeight < lowHeight) {
        issues.push({
          severity: "error",
          field: `${prefix}.stairScribeHighHeight`,
          message: "Stair scribe high height must be greater than or equal to low height.",
        });
      }
      if (lowHeight < module.height) {
        issues.push({
          severity: "error",
          field: `${prefix}.stairScribeLowHeight`,
          message: "Stair scribe low height must sit above the module top.",
        });
      }
      if (highHeight > definition.height) {
        issues.push({
          severity: "error",
          field: `${prefix}.stairScribeHighHeight`,
          message: "Stair scribe high height cannot exceed the overall assembly height.",
        });
      }
      if (scribeDepth > module.depth) {
        issues.push({
          severity: "error",
          field: `${prefix}.stairScribeDepth`,
          message: "Stair scribe depth cannot exceed the module depth.",
        });
      }
      if (stepCount > 0) {
        const stepWidth = module.width / stepCount;
        if (stepWidth < 120) {
          addWarning(
            issues,
            `${prefix}.stairScribeStepCount`,
            "Under-stair scribe steps under 120 mm wide should be reviewed for templating, finishing, and installation access."
          );
        }
      }
      if (highHeight - lowHeight > 900) {
        addWarning(
          issues,
          `${prefix}.stairScribeHighHeight`,
          "Large under-stair scribe height changes should be field templated against the stair stringer before fabrication."
        );
      }
    }

    if (hasCabinetRoomDividerDetails(module)) {
      const backPanelCount = getCabinetRoomDividerBackPanelCount(module);
      const backPanelThickness = getCabinetRoomDividerBackPanelThickness(module);
      const stabilizerFootCount = getCabinetRoomDividerStabilizerFootCount(module);
      const stabilizerFootWidth = getCabinetRoomDividerStabilizerFootWidth(module);
      const stabilizerFootDepth = getCabinetRoomDividerStabilizerFootDepth(module);

      if (module.roomDividerFinishedBack && backPanelCount <= 0) {
        issues.push({
          severity: "error",
          field: `${prefix}.roomDividerBackPanelCount`,
          message: "Finished room divider backs need at least one rear panel.",
        });
      }
      if (backPanelThickness > module.depth) {
        issues.push({
          severity: "error",
          field: `${prefix}.roomDividerBackPanelThickness`,
          message: "Room divider back panel thickness cannot exceed module depth.",
        });
      }
      if (stabilizerFootCount * stabilizerFootWidth > module.width) {
        issues.push({
          severity: "error",
          field: `${prefix}.roomDividerStabilizerFootCount`,
          message: "Room divider stabilizer feet exceed the module width.",
        });
      }
      if (stabilizerFootDepth > module.depth) {
        issues.push({
          severity: "error",
          field: `${prefix}.roomDividerStabilizerFootDepth`,
          message: "Room divider stabilizer foot depth cannot exceed module depth.",
        });
      }
      if (backPanelCount > 0) {
        const panelWidth = module.width / backPanelCount;
        if (panelWidth < 180) {
          addWarning(
            issues,
            `${prefix}.roomDividerBackPanelCount`,
            "Narrow rear divider panels under 180 mm should be reviewed for finish quality and installation access."
          );
        }
      }
      if (stabilizerFootCount === 0) {
        addWarning(
          issues,
          `${prefix}.roomDividerStabilizerFootCount`,
          "Freestanding room divider modules without stabilizer feet need alternate anchoring or engineering review."
        );
      }
    }

    if (hasCabinetLifestyleInsert(module)) {
      const insertKind = getCabinetLifestyleInsertKind(module);
      const insertCount = getCabinetLifestyleInsertCount(module);
      const insertDepth = getCabinetLifestyleInsertDepth(module);
      const deckHeight = getCabinetLifestyleInsertDeckHeight(module);
      const lipHeight = getCabinetLifestyleInsertLipHeight(module);

      if (insertCount <= 0) {
        issues.push({ severity: "error", field: `${prefix}.lifestyleInsertCount`, message: "Lifestyle inserts need at least one insert." });
      }
      if (insertDepth > module.depth) {
        issues.push({
          severity: "error",
          field: `${prefix}.lifestyleInsertDepth`,
          message: "Lifestyle insert depth cannot exceed module depth.",
        });
      }
      if (deckHeight + lipHeight > internalHeight) {
        issues.push({
          severity: "error",
          field: `${prefix}.lifestyleInsertLipHeight`,
          message: "Lifestyle insert deck and lip must fit within the module opening.",
        });
      }
      if (insertCount > 0) {
        const insertWidth = Math.max(0, (module.width - definition.boardThickness * 2 - definition.revealGap * (insertCount + 1)) / insertCount);
        if (insertWidth < 220) {
          addWarning(
            issues,
            `${prefix}.lifestyleInsertCount`,
            "Lifestyle inserts under 220 mm wide should be reviewed for usable access, removable bins, and cleaning."
          );
        }
      }
      if (insertKind === "pet_bed" && insertDepth < 350) {
        addWarning(
          issues,
          `${prefix}.lifestyleInsertDepth`,
          "Pet bed inserts under 350 mm deep should be reviewed against pet size and bedding clearance."
        );
      }
      if (insertKind === "toy_bin" && lipHeight > 160) {
        addWarning(
          issues,
          `${prefix}.lifestyleInsertLipHeight`,
          "Tall toy-bin lips over 160 mm should be reviewed for child access and pinch-safe edges."
        );
      }
    }

    if (module.type === "base") rangeWarning(issues, module.depth, 450, 700, `${prefix}.depth`, "Base cabinet depth");
    if (module.type === "wall") rangeWarning(issues, module.depth, 250, 450, `${prefix}.depth`, "Wall cabinet depth");
    if (module.type === "tall") rangeWarning(issues, module.height, 1800, 2600, `${prefix}.height`, "Tall cabinet height");
  }

  if (Math.abs(getCabinetOverallWidth(definition) - definition.totalWidth) > 0.5) {
    issues.push({
      severity: "warning",
      field: "totalWidth",
      message: "Total width differs from the sum of module widths, fillers, finished end panels, and countertop overhangs.",
    });
  }

  if (Math.abs(getCabinetOverallHeight(definition) - definition.height) > 0.5) {
    issues.push({
      severity: "warning",
      field: "height",
      message: "Overall height differs from the tallest module plus countertop thickness.",
    });
  }

  if (Math.abs(getCabinetOverallDepth(definition) - definition.depth) > 0.5) {
    issues.push({
      severity: "warning",
      field: "depth",
      message: "Overall depth differs from the deepest module plus countertop or platform deck overhangs.",
    });
  }

  if (assemblyProfile.placementKind === "ceiling_mounted") {
    if (definition.toeKickHeight > 0) {
      addWarning(
        issues,
        "toeKickHeight",
        "Ceiling-mounted millwork usually should not include a toe kick; confirm this is an intentional dropped-base detail."
      );
    }
    if (definition.height > 350 || definition.depth > 350) {
      addWarning(
        issues,
        "height",
        "Large ceiling-mounted profiles need structural blocking, lift access, and fixture coordination before release."
      );
    }
    if (definition.modules.some((module) => module.type !== "wall")) {
      addWarning(
        issues,
        "modules",
        "Ceiling-mounted assemblies should generally use wall-style modules so overhead clearances and mounting rules stay predictable."
      );
    }
  }

  if (assemblyProfile.placementKind === "convertible_built_in") {
    if (definition.boardThickness < 18) {
      addWarning(
        issues,
        "boardThickness",
        "Convertible built-ins should confirm board thickness and reinforcement for operable hardware loads."
      );
    }
    if (!definition.modules.some((module) => module.type === "wall" || module.type === "tall" || module.type === "wardrobe")) {
      addWarning(
        issues,
        "modules",
        "Convertible built-ins usually need wall/tall anchoring modules for hardware, safety, and deployment loads."
      );
    }
  }

  if (assemblyProfile.placementKind === "freestanding_island") {
    if (definition.depth < 600) {
      addWarning(
        issues,
        "depth",
        "Freestanding island or divider storage under 600 mm deep should be checked for stability, anchoring, and two-sided use."
      );
    }
    if (!definition.modules.some((module) => hasCabinetRoomDividerDetails(module)) && !hasCabinetIslandSeating(definition)) {
      addWarning(
        issues,
        "modules",
        "Freestanding divider storage should define two-sided finish panels, stabilizer feet, or alternate anchoring details."
      );
    }
  }

  if (assemblyProfile.fabricationComplexity === "advanced" && definition.modules.length === 1) {
    addWarning(
      issues,
      "modules",
      "Advanced built-ins often need separate modules or access panels for fabrication, service, and installation sequencing."
    );
  }

  const finalizedIssues = finalizeCabinetValidationIssues(definition, issues);
  return {
    valid: !finalizedIssues.some((issue) => issue.severity === "error"),
    issues: finalizedIssues,
  };
}
