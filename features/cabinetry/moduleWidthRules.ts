import { getCabinetLaundryApplianceRequiredWidth } from "./laundryApplianceLayout";
import {
  getCabinetMediaCableChaseWidth,
  getCabinetMediaTvOpeningWidth,
  getCabinetMediaVentSlotTotalWidth,
} from "./mediaWallLayout";
import { getCabinetStemwareRackTotalWidth } from "./stemwareRackLayout";
import {
  getCabinetFireplaceFrameOuterWidth,
  isCabinetFireplaceSurroundFrame,
} from "./trimLayout";
import {
  CABINET_MUDROOM_HOOK_WIDTH,
  getCabinetMudroomHookCount,
  getCabinetShoeCubbyCount,
  getCabinetShoeCubbyDividerThickness,
  hasCabinetShoeCubbies,
} from "./mudroomLayout";
import {
  CABINET_WALL_BED_MATTRESS_DIMENSIONS,
  getCabinetConvertibleSupportLegCount,
  getCabinetConvertibleSupportLegWidth,
  getCabinetWallBedMattressSize,
  getCabinetWallBedOrientation,
  isCabinetWallBedPanel,
} from "./convertibleLayout";
import {
  CABINET_ANTI_TIP_ANCHOR_WIDTH,
  getCabinetAntiTipAnchorInsetFromSides,
  hasCabinetAntiTipAnchors,
} from "./antiTipAnchorLayout";
import {
  getCabinetPlumbingChaseWidth,
  getCabinetSinkCutoutOffsetX,
  getCabinetSinkCutoutWidth,
  hasCabinetPlumbingChase,
  hasCabinetSinkCutout,
} from "./vanityServiceLayout";
import {
  getCabinetCableGrommetCount,
  getCabinetCableGrommetDiameter,
  hasCabinetOfficeWorkstation,
} from "./officeWorkstationLayout";
import {
  getCabinetRoomDividerStabilizerFootCount,
  getCabinetRoomDividerStabilizerFootWidth,
} from "./roomDividerLayout";
import {
  getCabinetSlatCount,
  getCabinetSlatSpacing,
  getCabinetSlatWidth,
} from "./slatLayout";
import {
  getCabinetCeilingBeamCount,
  getCabinetCeilingBeamOrientation,
  getCabinetCeilingBeamWidth,
  getCabinetCeilingGridColumnCount,
  isCabinetCeilingBeamArray,
  isCabinetCofferedCeilingGrid,
} from "./ceilingBeamLayout";
import {
  getCabinetFaceFrameStileWidth,
  hasCabinetFaceFrame,
  isCabinetFaceFrameEligibleModule,
} from "./faceFrameLayout";
import {
  getCabinetLevelingFootDiameter,
  getCabinetLevelingFootInsetFromSides,
  hasCabinetLevelingFeet,
  isCabinetLevelingFootEligibleModule,
} from "./levelingFootLayout";
import {
  getCabinetHamperBasketCount,
  getCabinetHamperSlideClearance,
  hasCabinetHamperPullOut,
} from "./hamperPullOutLayout";
import {
  getCabinetWineRackColumnCount,
  getCabinetWineRackDividerThickness,
  hasCabinetWineRack,
} from "./wineRackLayout";
import {
  getCabinetLibraryLadderStandoffCount,
  getCabinetLibraryLadderStandoffDiameter,
  hasCabinetLibraryLadderRail,
} from "./libraryLadderLayout";
import {
  CABINET_FRONT_HARDWARE_MINIMUM_FRONT_SIZE_MM,
} from "./hardwareCompatibility";
import { isCabinetFrontHardwareType } from "./catalog/hardware";
import type { CabinetDefinition, CabinetModuleDefinition } from "./types";

export const CABINET_MIN_MODULE_WIDTH_MM = 120;
export const CABINET_MAX_MODULE_WIDTH_MM = 4000;

export function getCabinetMinimumModuleWidthMm(
  module: CabinetModuleDefinition,
  definition?: CabinetDefinition
): number {
  const sinkOffsetMm = Math.abs(getCabinetSinkCutoutOffsetX(module));
  const explicitSlatSpacingMm = getCabinetSlatSpacing(module);
  const moduleMinimumMm = Math.max(
    CABINET_MIN_MODULE_WIDTH_MM,
    getCabinetLaundryApplianceRequiredWidth(module),
    getCabinetMediaTvOpeningWidth(module),
    getCabinetMediaCableChaseWidth(module),
    getCabinetMediaVentSlotTotalWidth(module),
    getCabinetStemwareRackTotalWidth(module),
    isCabinetFireplaceSurroundFrame(module)
      ? getCabinetFireplaceFrameOuterWidth(module)
      : 0,
    getCabinetMudroomHookCount(module) * CABINET_MUDROOM_HOOK_WIDTH,
    getCabinetConvertibleSupportLegCount(module) *
      getCabinetConvertibleSupportLegWidth(module),
    isCabinetWallBedPanel(module)
      ? getCabinetWallBedOrientation(module) === "vertical"
        ? CABINET_WALL_BED_MATTRESS_DIMENSIONS[
            getCabinetWallBedMattressSize(module)
          ].widthMm
        : CABINET_WALL_BED_MATTRESS_DIMENSIONS[
            getCabinetWallBedMattressSize(module)
          ].lengthMm
      : 0,
    hasCabinetAntiTipAnchors(module)
      ? getCabinetAntiTipAnchorInsetFromSides(module) * 2 +
          CABINET_ANTI_TIP_ANCHOR_WIDTH
      : 0,
    hasCabinetSinkCutout(module)
      ? getCabinetSinkCutoutWidth(module) + sinkOffsetMm * 2
      : 0,
    hasCabinetPlumbingChase(module)
      ? getCabinetPlumbingChaseWidth(module) + sinkOffsetMm * 2
      : 0,
    hasCabinetOfficeWorkstation(module)
      ? getCabinetCableGrommetCount(module) *
          getCabinetCableGrommetDiameter(module) +
        1
      : 0,
    getCabinetRoomDividerStabilizerFootCount(module) *
      getCabinetRoomDividerStabilizerFootWidth(module),
    getCabinetSlatCount(module) > 0
      ? getCabinetSlatCount(module) * getCabinetSlatWidth(module) +
        Math.max(0, getCabinetSlatCount(module) - 1) *
          (explicitSlatSpacingMm ?? 0)
      : 0,
    isCabinetCeilingBeamArray(module) &&
      getCabinetCeilingBeamOrientation(module) === "z"
      ? getCabinetCeilingBeamCount(module) * getCabinetCeilingBeamWidth(module)
      : 0,
    isCabinetCofferedCeilingGrid(module)
      ? getCabinetCeilingBeamWidth(module) *
          (getCabinetCeilingGridColumnCount(module) + 1) +
        1
      : 0,
    hasCabinetLibraryLadderRail(module)
      ? Math.ceil(
          (getCabinetLibraryLadderStandoffDiameter(module) *
            (getCabinetLibraryLadderStandoffCount(module) + 1)) /
            2
        )
      : 0
  );

  if (!definition) return Math.ceil(moduleMinimumMm);

  const selectedHardware = definition.hardware.find(
    (hardware) => hardware.id === module.hardwareId
  );
  const hardwareMinimum =
    selectedHardware && isCabinetFrontHardwareType(selectedHardware.type)
      ? CABINET_FRONT_HARDWARE_MINIMUM_FRONT_SIZE_MM[selectedHardware.type]
      : null;
  const usesRecommendedDoorLayout =
    (module.doorLayoutMode ?? definition.automation?.frontLayoutMode ?? "recommended") ===
    "recommended";
  const recommendedDoorCount =
    module.frontType === "open" || module.frontType === "drawer_stack"
      ? 0
      : module.frontType === "single_door"
        ? 1
        : module.frontType === "slab_panel"
          ? Math.max(1, Math.floor(module.doorCount || 1))
        : Math.max(
            module.frontType === "double_door" ||
              (module.frontType === "door_and_drawer" && module.hingeSide === "double")
              ? 2
              : 1,
            Math.ceil(
              Math.max(
                1,
                module.width - definition.boardThickness * 2 - definition.revealGap * 2
              ) / 600
            )
          );
  const hardwareFrontColumns =
    module.frontType === "double_door"
      ? usesRecommendedDoorLayout
        ? recommendedDoorCount
        : Math.max(2, Math.floor(module.doorCount))
      : module.frontType === "single_door" || module.frontType === "slab_panel"
        ? usesRecommendedDoorLayout
          ? recommendedDoorCount
          : Math.max(1, Math.floor(module.doorCount || 1))
        : module.frontType === "door_and_drawer"
          ? usesRecommendedDoorLayout
            ? recommendedDoorCount
            : Math.max(1, Math.floor(module.doorCount))
          : 1;

  const definitionMinimums = [
    definition.boardThickness * 2 + 1,
    hasCabinetLevelingFeet(definition) &&
    isCabinetLevelingFootEligibleModule(module)
      ? getCabinetLevelingFootInsetFromSides(definition) * 2 +
        getCabinetLevelingFootDiameter(definition)
      : 0,
    hasCabinetFaceFrame(definition) && isCabinetFaceFrameEligibleModule(module)
      ? getCabinetFaceFrameStileWidth(definition) * 2 + 1
      : 0,
    hasCabinetHamperPullOut(module)
      ? definition.boardThickness * 2 +
        definition.revealGap * 2 +
        getCabinetHamperSlideClearance(module) * 2 +
        Math.max(0, getCabinetHamperBasketCount(module) - 1) *
          definition.revealGap +
        1
      : 0,
    hasCabinetWineRack(module)
      ? definition.boardThickness * 2 +
        definition.revealGap * 2 +
        Math.max(0, getCabinetWineRackColumnCount(module) - 1) *
          getCabinetWineRackDividerThickness(module) +
        1
      : 0,
    hasCabinetShoeCubbies(module)
      ? definition.boardThickness * 2 +
        definition.revealGap * 2 +
        Math.max(0, getCabinetShoeCubbyCount(module) - 1) *
          getCabinetShoeCubbyDividerThickness(module) +
        1
      : 0,
    hardwareMinimum ? hardwareMinimum.widthMm * hardwareFrontColumns : 0,
  ];

  return Math.ceil(Math.max(moduleMinimumMm, ...definitionMinimums));
}
