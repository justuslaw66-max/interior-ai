import type { CabinetDefinition, CabinetHardwareRef, CabinetModuleDefinition, CabinetPart } from "./types";
import { getCabinetShelfCenterHeights } from "./shelfLayout";
import {
  CABINET_HANGING_ROD_DIAMETER,
  CABINET_HANGING_ROD_SKU_ID,
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
  getCabinetPanelRailLocalYPositions,
  getCabinetPanelRowCount,
  getCabinetPanelStileLocalXPositions,
} from "./panelLayout";
import {
  getCabinetCeilingBeamArrayLocalPositions,
  getCabinetCeilingBeamDepth,
  getCabinetCeilingBeamOrientation,
  getCabinetCeilingBeamWidth,
  getCabinetCeilingGridColumnBeamXPositions,
  getCabinetCeilingGridColumnCount,
  getCabinetCeilingGridRowBeamZPositions,
  getCabinetCeilingGridRowCount,
  isCabinetCeilingBeamArray,
  isCabinetCeilingComponent,
  isCabinetCofferedCeilingGrid,
} from "./ceilingBeamLayout";
import {
  getCabinetFireplaceFrameOuterWidth,
  getCabinetFireplaceFrameStartX,
  getCabinetFireplaceHeaderHeight,
  getCabinetFireplaceLegWidth,
  getCabinetFireplaceMantelDepth,
  getCabinetFireplaceMantelHeight,
  getCabinetFireplaceOpeningHeight,
  getCabinetFireplaceOpeningWidth,
  getCabinetTrimMemberCount,
  getCabinetTrimOrientation,
  getCabinetTrimPlacement,
  getCabinetTrimProfileDepth,
  getCabinetTrimProfileWidth,
  getCabinetTrimRevealStripDepth,
  getCabinetTrimRevealStripHeight,
  getCabinetTrimRevealStripInsetFromTop,
  getCabinetTrimRevealStripLayouts,
  getCabinetTrimReturnLayouts,
  getCabinetTrimSetoutHeight,
  hasCabinetTrimRevealStrip,
  isCabinetFireplaceSurroundFrame,
  isCabinetTrimComponent,
  isCabinetTrimRun,
} from "./trimLayout";
import {
  CABINET_DEFAULT_HINGE_RAIL_DEPTH,
  CABINET_DEFAULT_HINGE_RAIL_HEIGHT,
  getCabinetConvertibleHingeHeight,
  getCabinetConvertibleOpenDepth,
  getCabinetConvertiblePanelHeight,
  getCabinetConvertiblePanelThickness,
  getCabinetConvertibleSupportLegCount,
  getCabinetConvertibleSupportLegDepth,
  getCabinetConvertibleSupportLegWidth,
  isCabinetConvertibleComponent,
  isCabinetFoldDownWorksurface,
  isCabinetWallBedPanel,
} from "./convertibleLayout";
import {
  getCabinetPlatformDeckDepth,
  getCabinetPlatformDeckOverhangFront,
  getCabinetPlatformDeckThickness,
  getCabinetPlatformSupportRibCount,
  getCabinetPlatformSupportRibHeight,
  getCabinetPlatformSupportRibLocalZPositions,
  getCabinetPlatformSupportRibWidth,
  hasCabinetPlatformDeck,
} from "./platformBedLayout";
import {
  getCabinetStairScribeDepth,
  getCabinetStairScribeDirection,
  getCabinetStairScribeHighHeight,
  getCabinetStairScribeLowHeight,
  getCabinetStairScribePanelLayouts,
  getCabinetStairScribeStepCount,
  hasCabinetStairScribe,
} from "./stairScribeLayout";
import {
  getCabinetRoomDividerBackPanelCount,
  getCabinetRoomDividerBackPanelLayouts,
  getCabinetRoomDividerBackPanelThickness,
  getCabinetRoomDividerStabilizerFootCount,
  getCabinetRoomDividerStabilizerFootDepth,
  getCabinetRoomDividerStabilizerFootHeight,
  getCabinetRoomDividerStabilizerFootLayouts,
  getCabinetRoomDividerStabilizerFootWidth,
  hasCabinetRoomDividerDetails,
} from "./roomDividerLayout";
import {
  getCabinetLifestyleInsertCount,
  getCabinetLifestyleInsertDeckHeight,
  getCabinetLifestyleInsertDepth,
  getCabinetLifestyleInsertKind,
  getCabinetLifestyleInsertLayouts,
  getCabinetLifestyleInsertLipHeight,
  hasCabinetLifestyleInsert,
} from "./lifestyleInsertLayout";
import {
  getCabinetWineRackColumnCount,
  getCabinetWineRackDepth,
  getCabinetWineRackDividerThickness,
  getCabinetWineRackHorizontalRailLocalYPositions,
  getCabinetWineRackOpeningHeight,
  getCabinetWineRackOpeningWidth,
  getCabinetWineRackRowCount,
  getCabinetWineRackVerticalDividerLocalXPositions,
  hasCabinetWineRack,
} from "./wineRackLayout";
import {
  CABINET_SEAT_CUSHION_MATERIAL_ID,
  getCabinetSeatBackHeight,
  getCabinetSeatBackThickness,
  getCabinetSeatCushionDepth,
  getCabinetSeatCushionOverhangFront,
  getCabinetSeatCushionThickness,
  getCabinetSeatDeckThickness,
  hasCabinetSeatBack,
  hasCabinetSeatingDetails,
} from "./seatingLayout";
import {
  CABINET_MUDROOM_HOOK_HEIGHT,
  CABINET_MUDROOM_HOOK_RAIL_DEPTH,
  CABINET_MUDROOM_HOOK_RAIL_HEIGHT,
  CABINET_MUDROOM_HOOK_SKU_ID,
  CABINET_MUDROOM_HOOK_WIDTH,
  getCabinetMudroomHookCount,
  getCabinetMudroomHookLocalXPositions,
  getCabinetMudroomHookProjection,
  getCabinetMudroomHookRailHeight,
  getCabinetShoeCubbyDepth,
  getCabinetShoeCubbyDividerThickness,
  getCabinetShoeCubbyHeight,
  getCabinetShoeCubbyOpeningWidth,
  getCabinetShoeCubbyOpeningX,
  getCabinetShoeCubbyOpeningY,
  getCabinetShoeCubbyVerticalDividerLocalXPositions,
  hasCabinetMudroomHooks,
  hasCabinetShoeCubbies,
} from "./mudroomLayout";
import {
  CABINET_FRONT_THICKNESS,
  getCabinetBacksplashHeight,
  getCabinetBacksplashThickness,
  getCabinetLeftEndPanelThickness,
  getCabinetLeftFillerScribeAllowance,
  getCabinetLeftFillerWidth,
  getCabinetCountertopOverhangBack,
  getCabinetCountertopOverhangFront,
  getCabinetCountertopOverhangLeft,
  getCabinetCountertopOverhangRight,
  getCabinetCountertopThickness,
  getCabinetModuleFrontOffset,
  getCabinetModuleRunDepth,
  getCabinetModuleRunWidth,
  getCabinetModuleStartOffset,
  getCabinetModuleRunHeight,
  getCabinetOverallWidth,
  getCabinetRightEndPanelThickness,
  getCabinetRightFillerScribeAllowance,
  getCabinetRightFillerWidth,
  getCabinetToeKickDepth,
  getCabinetToeKickSetback,
} from "./layout";
import {
  CABINET_SERVICE_ZONE_MATERIAL_ID,
  CABINET_SINK_CUTOUT_MARKER_THICKNESS,
  getCabinetPlumbingChaseDepth,
  getCabinetPlumbingChaseHeight,
  getCabinetPlumbingChaseLocalX,
  getCabinetPlumbingChaseLocalZ,
  getCabinetPlumbingChaseWidth,
  getCabinetSinkCutoutDepth,
  getCabinetSinkCutoutLocalX,
  getCabinetSinkCutoutLocalZ,
  getCabinetSinkCutoutOffsetX,
  getCabinetSinkCutoutOffsetZ,
  getCabinetSinkCutoutWidth,
  hasCabinetPlumbingChase,
  hasCabinetSinkCutout,
} from "./vanityServiceLayout";
import {
  getCabinetLaundryApplianceBackClearance,
  getCabinetLaundryApplianceCount,
  getCabinetLaundryApplianceDepth,
  getCabinetLaundryApplianceHeight,
  getCabinetLaundryApplianceKind,
  getCabinetLaundryApplianceLocalXPositions,
  getCabinetLaundryApplianceSideClearance,
  getCabinetLaundryApplianceTopClearance,
  getCabinetLaundryApplianceWidth,
  getCabinetLaundryUtilityChaseDepth,
  getCabinetLaundryUtilityChaseHeight,
  getCabinetLaundryUtilityChaseLocalZ,
  hasCabinetLaundryApplianceBay,
} from "./laundryApplianceLayout";
import {
  CABINET_CABLE_GROMMET_MARKER_THICKNESS,
  getCabinetCableGrommetCount,
  getCabinetCableGrommetDiameter,
  getCabinetCableGrommetLocalXPositions,
  getCabinetCableGrommetLocalZ,
  getCabinetCableGrommetOffsetFromBack,
  getCabinetDeskPowerChaseDepth,
  getCabinetDeskPowerChaseHeight,
  getCabinetDeskPowerChaseLocalZ,
  getCabinetOfficeWorksurfaceDepth,
  getCabinetOfficeWorksurfaceOverhangFront,
  getCabinetOfficeWorksurfaceThickness,
  hasCabinetOfficeWorkstation,
} from "./officeWorkstationLayout";
import {
  getCabinetIslandSeatingOverhangDepth,
  getCabinetIslandSupportPanelDepth,
  getCabinetIslandSupportPanelLocalXPositions,
  getCabinetIslandSupportPanelThickness,
  hasCabinetIslandSeating,
} from "./islandSeatingLayout";
import {
  CABINET_PANTRY_PULL_OUT_SLIDE_HARDWARE_ID,
  CABINET_PANTRY_PULL_OUT_SLIDE_PAIR_HEIGHT,
  CABINET_PANTRY_PULL_OUT_SLIDE_SKU_ID,
  getCabinetPantryPullOutOpeningWidth,
  getCabinetPantryPullOutOpeningX,
  getCabinetPantryPullOutSlideClearance,
  getCabinetPantryPullOutTrayCount,
  getCabinetPantryPullOutTrayDepth,
  getCabinetPantryPullOutTrayFrontHeight,
  getCabinetPantryPullOutTrayLocalYPositions,
  hasCabinetPantryPullOuts,
} from "./pantryPullOutLayout";
import {
  CABINET_MEDIA_VENT_SLOT_MARKER_THICKNESS,
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
  getCabinetMediaVentSlotLocalXPositions,
  getCabinetMediaVentSlotLocalY,
  getCabinetMediaVentSlotSpacing,
  getCabinetMediaVentSlotWidth,
  hasCabinetMediaWallDetails,
} from "./mediaWallLayout";
import {
  CABINET_LIBRARY_LADDER_RAIL_SKU_ID,
  getCabinetLibraryLadderRailDiameter,
  getCabinetLibraryLadderRailLocalY,
  getCabinetLibraryLadderRailLocalZ,
  getCabinetLibraryLadderRailProjection,
  getCabinetLibraryLadderStandoffCount,
  getCabinetLibraryLadderStandoffDiameter,
  getCabinetLibraryLadderStandoffLocalXPositions,
  hasCabinetLibraryLadderRail,
} from "./libraryLadderLayout";
import {
  CABINET_DEFAULT_STEMWARE_RACK_RAIL_HEIGHT,
  CABINET_STEMWARE_RACK_SKU_ID,
  getCabinetStemwareRackDepth,
  getCabinetStemwareRackLaneCount,
  getCabinetStemwareRackLaneSpacing,
  getCabinetStemwareRackLocalY,
  getCabinetStemwareRackLocalZ,
  getCabinetStemwareRackRailLocalXPositions,
  getCabinetStemwareRackRailWidth,
  hasCabinetStemwareRack,
} from "./stemwareRackLayout";
import {
  CABINET_LIGHTING_CHANNEL_SKU_ID,
  getCabinetLightingChannelDepth,
  getCabinetLightingChannelHeight,
  getCabinetLightingChannelInsetFromFront,
  getCabinetLightingChannelLocalX,
  getCabinetLightingChannelLocalYPositions,
  getCabinetLightingChannelLocalZ,
  getCabinetLightingChannelWidth,
  hasCabinetLightingChannels,
} from "./lightingLayout";
import {
  CABINET_HAMPER_BASKET_SKU_ID,
  CABINET_HAMPER_SLIDE_PAIR_HEIGHT,
  CABINET_HAMPER_SLIDE_SKU_ID,
  getCabinetHamperBasketDepth,
  getCabinetHamperBasketHeight,
  getCabinetHamperBasketLayouts,
  getCabinetHamperOpeningY,
  getCabinetHamperSlideClearance,
  hasCabinetHamperPullOut,
} from "./hamperPullOutLayout";
import {
  CABINET_SHELF_PIN_ROW_MARKER_DEPTH,
  CABINET_SHELF_PIN_ROW_MARKER_WIDTH,
  CABINET_SHELF_PIN_SKU_ID,
  getCabinetShelfPinHoleCount,
  getCabinetShelfPinHoleSpacing,
  getCabinetShelfPinRowHeight,
  getCabinetShelfPinRowLayouts,
  getCabinetShelfPinStartHeight,
  hasCabinetShelfPinRows,
} from "./shelfPinLayout";
import {
  CABINET_DOOR_HINGE_MARKER_DEPTH,
  CABINET_DOOR_HINGE_MARKER_HEIGHT,
  CABINET_DOOR_HINGE_MARKER_WIDTH,
  CABINET_DOOR_HINGE_SKU_ID,
  getCabinetDoorHingeInsetFromTopBottom,
  getCabinetDoorHingeLayouts,
  hasCabinetDoorHinges,
} from "./doorHingeLayout";
import {
  CABINET_DRAWER_SLIDE_PAIR_HEIGHT,
  CABINET_DRAWER_SLIDE_SKU_ID,
  getCabinetDrawerSlideClearance,
  getCabinetDrawerSlideLayouts,
  getCabinetDrawerSlideLength,
  hasCabinetDrawerSlides,
} from "./drawerSlideLayout";
import {
  getCabinetDrawerHeightProportions,
  getCabinetEffectiveDoorCount,
  getCabinetHandleLocalPlacement,
  getCabinetHandlePlacementMode,
} from "./frontBehavior";
import {
  getCabinetDrawerBoxLayouts,
  hasCabinetDrawerBoxes,
} from "./drawerBoxLayout";
import {
  getCabinetInstallationCleatLayout,
  hasCabinetInstallationCleat,
} from "./installationCleatLayout";
import {
  CABINET_ANTI_TIP_ANCHOR_DEPTH,
  CABINET_ANTI_TIP_ANCHOR_HEIGHT,
  CABINET_ANTI_TIP_ANCHOR_SKU_ID,
  CABINET_ANTI_TIP_ANCHOR_WIDTH,
  getCabinetAntiTipAnchorCount,
  getCabinetAntiTipAnchorHeight,
  getCabinetAntiTipAnchorInsetFromSides,
  getCabinetAntiTipAnchorLayouts,
  hasCabinetAntiTipAnchors,
} from "./antiTipAnchorLayout";
import {
  CABINET_LEVELING_FOOT_SKU_ID,
  getCabinetLevelingFootDiameter,
  getCabinetLevelingFootHeight,
  getCabinetLevelingFootLayouts,
  hasCabinetLevelingFeet,
} from "./levelingFootLayout";
import {
  getCabinetFaceFrameDepth,
  getCabinetFaceFrameLayouts,
  getCabinetFaceFrameRailHeight,
  getCabinetFaceFrameStileWidth,
  hasCabinetFaceFrame,
} from "./faceFrameLayout";

function part(
  moduleId: string,
  type: CabinetPart["type"],
  index: string,
  position: CabinetPart["position"],
  size: CabinetPart["size"],
  materialId: string,
  metadata?: Record<string, unknown>,
  skuId?: string
): CabinetPart {
  return {
    id: `${moduleId}:${type}:${index}`,
    moduleId,
    type,
    position,
    size,
    materialId,
    skuId,
    metadata,
  };
}

function hardwareFor(definition: CabinetDefinition, module: CabinetModuleDefinition): CabinetHardwareRef | undefined {
  return definition.hardware.find((item) => item.id === module.hardwareId);
}

function addHandle(
  parts: CabinetPart[],
  definition: CabinetDefinition,
  module: CabinetModuleDefinition,
  front: CabinetPart,
  index: string,
  kind: "door" | "drawer"
) {
  const hardware = hardwareFor(definition, module);
  if (!hardware) return;
  const placement = getCabinetHandleLocalPlacement(
    module,
    hardware.type,
    front.size.width,
    front.size.height
  );
  if (!placement) return;
  const materialId = hardware.id.includes("black") ? "matte_black_laminate" : "hardware_metal";
  parts.push(
    part(
      module.id,
      "handle",
      index,
      {
        x: front.position.x + placement.x,
        y: front.position.y + placement.y,
        z: front.position.z - (hardware.type === "edge_pull" ? 8 : placement.depth),
      },
      { width: placement.width, height: placement.height, depth: placement.depth },
      materialId,
      {
        hardwareType: hardware.type,
        frontPartId: front.id,
        kind,
        placementMode: getCabinetHandlePlacementMode(module),
        offsetX: getCabinetHandlePlacementMode(module) === "custom" ? module.handleOffsetX ?? 0 : 0,
        offsetY: getCabinetHandlePlacementMode(module) === "custom" ? module.handleOffsetY ?? 0 : 0,
      },
      hardware.skuId
    )
  );
}

function generateCeilingComponentParts(
  module: CabinetModuleDefinition,
  offsetX: number,
  offsetZ: number
): CabinetPart[] {
  const parts: CabinetPart[] = [];
  const x = (value: number) => offsetX + value;
  const z = (value: number) => offsetZ + value;
  const materialId = module.frontMaterialId ?? module.materialId;
  const beamWidth = getCabinetCeilingBeamWidth(module);
  const beamDepth = getCabinetCeilingBeamDepth(module);

  if (isCabinetCeilingBeamArray(module)) {
    const orientation = getCabinetCeilingBeamOrientation(module);
    for (const [index, localPosition] of getCabinetCeilingBeamArrayLocalPositions(module).entries()) {
      const beamSize =
        orientation === "z"
          ? { width: beamWidth, height: beamDepth, depth: module.depth }
          : { width: module.width, height: beamDepth, depth: beamWidth };
      const beamPosition =
        orientation === "z"
          ? { x: x(localPosition), y: 0, z: z(0) }
          : { x: x(0), y: 0, z: z(localPosition) };

      parts.push(
        part(
          module.id,
          "ceiling_beam",
          `${orientation}-${index + 1}`,
          beamPosition,
          beamSize,
          materialId,
          {
            beamIndex: index,
            orientation,
            beamCount: getCabinetCeilingBeamArrayLocalPositions(module).length,
            beamWidth,
            beamDepth,
            role: "ceiling_beam_array",
          }
        )
      );
    }
  }

  if (isCabinetCofferedCeilingGrid(module)) {
    const columnCount = getCabinetCeilingGridColumnCount(module);
    const rowCount = getCabinetCeilingGridRowCount(module);

    for (const [index, localX] of getCabinetCeilingGridColumnBeamXPositions(module).entries()) {
      parts.push(
        part(
          module.id,
          "ceiling_beam",
          `grid-z-${index + 1}`,
          { x: x(localX), y: 0, z: z(0) },
          { width: beamWidth, height: beamDepth, depth: module.depth },
          materialId,
          {
            beamIndex: index,
            orientation: "z",
            gridColumnCount: columnCount,
            gridRowCount: rowCount,
            beamWidth,
            beamDepth,
            role: index === 0 || index === columnCount ? "perimeter_beam" : "intermediate_beam",
          }
        )
      );
    }

    for (const [index, localZ] of getCabinetCeilingGridRowBeamZPositions(module).entries()) {
      parts.push(
        part(
          module.id,
          "ceiling_beam",
          `grid-x-${index + 1}`,
          { x: x(0), y: 0, z: z(localZ) },
          { width: module.width, height: beamDepth, depth: beamWidth },
          materialId,
          {
            beamIndex: index,
            orientation: "x",
            gridColumnCount: columnCount,
            gridRowCount: rowCount,
            beamWidth,
            beamDepth,
            role: index === 0 || index === rowCount ? "perimeter_beam" : "intermediate_beam",
          }
        )
      );
    }
  }

  return parts.filter((candidate) =>
    candidate.size.width > 0 && candidate.size.height > 0 && candidate.size.depth > 0
  );
}

function generateTrimComponentParts(
  module: CabinetModuleDefinition,
  offsetX: number,
  offsetZ: number
): CabinetPart[] {
  const parts: CabinetPart[] = [];
  const x = (value: number) => offsetX + value;
  const z = (value: number) => offsetZ + value;
  const materialId = module.frontMaterialId ?? module.materialId;

  if (isCabinetTrimRun(module)) {
    const memberCount = getCabinetTrimMemberCount(module);
    const profileWidth = getCabinetTrimProfileWidth(module);
    const profileDepth = getCabinetTrimProfileDepth(module);
    const orientation = getCabinetTrimOrientation(module);
    const placement = getCabinetTrimPlacement(module);
    const setoutHeight = getCabinetTrimSetoutHeight(module);
    const memberLength = (orientation === "x" ? module.width : module.depth) / memberCount;

    for (let index = 0; index < memberCount; index += 1) {
      parts.push(
        part(
          module.id,
          "trim_member",
          `run-${orientation}-${index + 1}`,
          orientation === "x"
            ? { x: x(index * memberLength), y: setoutHeight, z: z(0) }
            : { x: x(0), y: setoutHeight, z: z(index * memberLength) },
          orientation === "x"
            ? { width: memberLength, height: profileWidth, depth: profileDepth }
            : { width: profileDepth, height: profileWidth, depth: memberLength },
          materialId,
          {
            trimIndex: index,
            trimMemberCount: memberCount,
            trimOrientation: orientation,
            trimPlacement: placement,
            trimSetoutHeight: setoutHeight,
            trimProfileWidth: profileWidth,
            trimProfileDepth: profileDepth,
            role: "trim_run",
          }
        )
      );
    }

    for (const trimReturn of getCabinetTrimReturnLayouts(module)) {
      parts.push(
        part(
          module.id,
          "trim_return",
          trimReturn.side,
          {
            x: x(trimReturn.localX),
            y: trimReturn.localY,
            z: z(trimReturn.localZ),
          },
          {
            width: trimReturn.width,
            height: trimReturn.height,
            depth: trimReturn.depth,
          },
          materialId,
          {
            role: "trim_return",
            trimReturnSide: trimReturn.side,
            trimEndTreatment: trimReturn.endTreatment,
            trimReturnDepth: trimReturn.returnDepth,
            trimMiterAngle: trimReturn.miterAngle,
            trimPlacement: placement,
            trimSetoutHeight: setoutHeight,
            trimProfileWidth: profileWidth,
            trimProfileDepth: profileDepth,
          }
        )
      );
    }

    if (hasCabinetTrimRevealStrip(module)) {
      const revealStripHeight = getCabinetTrimRevealStripHeight(module);
      const revealStripDepth = getCabinetTrimRevealStripDepth(module);
      const revealStripInsetFromTop = getCabinetTrimRevealStripInsetFromTop(module);

      for (const strip of getCabinetTrimRevealStripLayouts(module)) {
        parts.push(
          part(
            module.id,
            "trim_reveal_strip",
            `run-${strip.orientation}-${strip.index + 1}`,
            {
              x: x(strip.localX),
              y: strip.localY,
              z: z(strip.localZ),
            },
            {
              width: strip.width,
              height: strip.height,
              depth: strip.depth,
            },
            materialId,
            {
              role: "trim_reveal_backing_strip",
              trimIndex: strip.index,
              trimMemberCount: memberCount,
              trimOrientation: strip.orientation,
              trimPlacement: strip.placement,
              trimSetoutHeight: setoutHeight,
              trimProfileWidth: profileWidth,
              trimProfileDepth: profileDepth,
              trimRevealStripHeight: revealStripHeight,
              trimRevealStripDepth: revealStripDepth,
              trimRevealStripInsetFromTop: revealStripInsetFromTop,
            }
          )
        );
      }
    }
  }

  if (isCabinetFireplaceSurroundFrame(module)) {
    const openingWidth = getCabinetFireplaceOpeningWidth(module);
    const openingHeight = getCabinetFireplaceOpeningHeight(module);
    const legWidth = getCabinetFireplaceLegWidth(module);
    const headerHeight = getCabinetFireplaceHeaderHeight(module);
    const mantelHeight = getCabinetFireplaceMantelHeight(module);
    const mantelDepth = getCabinetFireplaceMantelDepth(module);
    const frameStartX = getCabinetFireplaceFrameStartX(module);
    const frameOuterWidth = getCabinetFireplaceFrameOuterWidth(module);
    const openingX = frameStartX + legWidth;
    const frameDepth = Math.max(1, module.depth);

    parts.push(
      part(
        module.id,
        "trim_member",
        "fireplace-left-leg",
        { x: x(frameStartX), y: 0, z: z(0) },
        { width: legWidth, height: openingHeight, depth: frameDepth },
        materialId,
        { role: "fireplace_left_leg", openingWidth, openingHeight, legWidth, frameDepth }
      )
    );
    parts.push(
      part(
        module.id,
        "trim_member",
        "fireplace-right-leg",
        { x: x(openingX + openingWidth), y: 0, z: z(0) },
        { width: legWidth, height: openingHeight, depth: frameDepth },
        materialId,
        { role: "fireplace_right_leg", openingWidth, openingHeight, legWidth, frameDepth }
      )
    );
    parts.push(
      part(
        module.id,
        "trim_member",
        "fireplace-header",
        { x: x(frameStartX), y: openingHeight, z: z(0) },
        { width: frameOuterWidth, height: headerHeight, depth: frameDepth },
        materialId,
        { role: "fireplace_header", openingWidth, openingHeight, legWidth, headerHeight, frameDepth }
      )
    );
    parts.push(
      part(
        module.id,
        "trim_member",
        "fireplace-mantel",
        { x: x(0), y: openingHeight + headerHeight, z: z(-Math.max(0, mantelDepth - frameDepth) / 2) },
        { width: module.width, height: mantelHeight, depth: mantelDepth },
        materialId,
        { role: "fireplace_mantel_shelf", openingWidth, openingHeight, mantelHeight, mantelDepth }
      )
    );
  }

  return parts.filter((candidate) =>
    candidate.size.width > 0 && candidate.size.height > 0 && candidate.size.depth > 0
  );
}

function generateConvertibleComponentParts(
  module: CabinetModuleDefinition,
  offsetX: number,
  offsetZ: number
): CabinetPart[] {
  const parts: CabinetPart[] = [];
  const x = (value: number) => offsetX + value;
  const z = (value: number) => offsetZ + value;
  const materialId = module.frontMaterialId ?? module.materialId;
  const panelThickness = getCabinetConvertiblePanelThickness(module);
  const panelHeight = getCabinetConvertiblePanelHeight(module);
  const openDepth = getCabinetConvertibleOpenDepth(module);
  const hingeHeight = getCabinetConvertibleHingeHeight(module);
  const supportLegCount = getCabinetConvertibleSupportLegCount(module);
  const supportLegWidth = getCabinetConvertibleSupportLegWidth(module);
  const supportLegDepth = getCabinetConvertibleSupportLegDepth(module);
  const role = isCabinetWallBedPanel(module) ? "wall_bed" : "fold_down_worksurface";
  const closedPanelY = isCabinetWallBedPanel(module)
    ? 0
    : Math.max(0, hingeHeight - panelHeight * 0.5);

  parts.push(
    part(
      module.id,
      "convertible_panel",
      "closed-front",
      { x: x(0), y: closedPanelY, z: z(-panelThickness) },
      { width: module.width, height: panelHeight, depth: panelThickness },
      materialId,
      {
        role,
        state: "closed",
        panelThickness,
        panelHeight,
        openDepth,
        hingeHeight,
      }
    )
  );

  parts.push(
    part(
      module.id,
      "convertible_panel",
      isCabinetFoldDownWorksurface(module) ? "deployed-work-surface" : "deployed-sleep-platform",
      { x: x(0), y: hingeHeight, z: z(-openDepth) },
      { width: module.width, height: panelThickness, depth: openDepth },
      materialId,
      {
        role,
        state: "deployed",
        panelThickness,
        panelHeight,
        openDepth,
        hingeHeight,
      }
    )
  );

  parts.push(
    part(
      module.id,
      "hinge_rail",
      "0",
      {
        x: x(0),
        y: Math.max(0, hingeHeight - CABINET_DEFAULT_HINGE_RAIL_HEIGHT / 2),
        z: z(-CABINET_DEFAULT_HINGE_RAIL_DEPTH),
      },
      {
        width: module.width,
        height: CABINET_DEFAULT_HINGE_RAIL_HEIGHT,
        depth: CABINET_DEFAULT_HINGE_RAIL_DEPTH,
      },
      "hardware_metal",
      {
        role,
        hingeHeight,
        openDepth,
        hardwareType: isCabinetWallBedPanel(module) ? "wall_bed_mechanism" : "drop_flap_hinge",
      }
    )
  );

  for (let index = 0; index < supportLegCount; index += 1) {
    const xPosition =
      supportLegCount === 1
        ? module.width / 2 - supportLegWidth / 2
        : 80 + (index * Math.max(0, module.width - supportLegWidth - 160)) / Math.max(1, supportLegCount - 1);
    parts.push(
      part(
        module.id,
        "support_leg",
        String(index + 1),
        {
          x: x(xPosition),
          y: 0,
          z: z(-openDepth),
        },
        {
          width: supportLegWidth,
          height: hingeHeight,
          depth: supportLegDepth,
        },
        materialId,
        {
          role,
          supportLegIndex: index,
          supportLegCount,
          hingeHeight,
          openDepth,
        }
      )
    );
  }

  return parts.filter((candidate) =>
    candidate.size.width > 0 && candidate.size.height > 0 && candidate.size.depth > 0
  );
}

function generateModuleParts(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition,
  offsetX: number,
  offsetZ: number
): CabinetPart[] {
  const parts: CabinetPart[] = [];
  const W = module.width;
  const H = module.height;
  const D = module.depth;
  const T = definition.boardThickness;
  const B = definition.backPanelThickness;
  const K = Math.min(definition.toeKickHeight, Math.max(0, H - T * 2));
  const toeKickSetback = getCabinetToeKickSetback(definition);
  const toeKickDepth = getCabinetToeKickDepth(definition, module);
  const G = definition.revealGap;
  const bodyHeight = H - K;
  const bodyY = K;
  const x = (value: number) => offsetX + value;
  const z = (value: number) => offsetZ + value;
  const materialId = module.materialId;
  const frontMaterialId = module.frontMaterialId ?? module.materialId;

  if (isCabinetCeilingComponent(module)) {
    return generateCeilingComponentParts(module, offsetX, offsetZ);
  }

  if (isCabinetTrimComponent(module)) {
    return generateTrimComponentParts(module, offsetX, offsetZ);
  }

  if (isCabinetConvertibleComponent(module)) {
    return generateConvertibleComponentParts(module, offsetX, offsetZ);
  }

  parts.push(part(module.id, "left_side_panel", "0", { x: x(0), y: bodyY, z: z(0) }, { width: T, height: bodyHeight, depth: D }, materialId));
  parts.push(part(module.id, "right_side_panel", "0", { x: x(W - T), y: bodyY, z: z(0) }, { width: T, height: bodyHeight, depth: D }, materialId));
  parts.push(part(module.id, "bottom_panel", "0", { x: x(T), y: bodyY, z: z(0) }, { width: W - 2 * T, height: T, depth: D }, materialId));
  parts.push(part(module.id, "top_panel", "0", { x: x(T), y: H - T, z: z(0) }, { width: W - 2 * T, height: T, depth: D }, materialId));
  parts.push(part(module.id, "back_panel", "0", { x: x(0), y: bodyY, z: z(D - B) }, { width: W, height: bodyHeight, depth: B }, materialId));

  if (K > 0 && toeKickDepth > 0) {
    parts.push(
      part(
        module.id,
        "toe_kick",
        "0",
        { x: x(0), y: 0, z: z(toeKickSetback) },
        { width: W, height: K, depth: Math.min(toeKickDepth, Math.max(0, D - toeKickSetback)) },
        materialId,
        {
          role: "recessed_toe_kick",
          setback: toeKickSetback,
          depth: toeKickDepth,
          height: K,
        }
      )
    );
  }

  if (hasCabinetLevelingFeet(definition)) {
    const footHeight = getCabinetLevelingFootHeight(definition);
    const footDiameter = getCabinetLevelingFootDiameter(definition);
    const footLayouts = getCabinetLevelingFootLayouts(definition, module);
    for (const foot of footLayouts) {
      parts.push(
        part(
          module.id,
          "leveling_foot",
          String(foot.footIndex + 1),
          {
            x: x(foot.localX),
            y: 0,
            z: z(foot.localZ),
          },
          {
            width: footDiameter,
            height: footHeight,
            depth: footDiameter,
          },
          "hardware_metal",
          {
            role: "adjustable_leveling_foot",
            footIndex: foot.footIndex + 1,
            footCount: footLayouts.length,
            footHeight,
            footDiameter,
          },
          CABINET_LEVELING_FOOT_SKU_ID
        )
      );
    }
  }

  if (hasCabinetInstallationCleat(module)) {
    const cleat = getCabinetInstallationCleatLayout(definition, module);
    if (cleat) {
      parts.push(
        part(
          module.id,
          "installation_cleat",
          "top-back",
          {
            x: x(cleat.localX),
            y: cleat.localY,
            z: z(cleat.localZ),
          },
          {
            width: cleat.width,
            height: cleat.height,
            depth: cleat.depth,
          },
          materialId,
          {
            role: "wall_mount_installation_cleat",
            cleatHeight: cleat.height,
            cleatThickness: cleat.depth,
            cleatInsetFromTop: cleat.insetFromTop,
            requiresAnchoringReview: true,
          }
        )
      );
    }
  }

  if (hasCabinetAntiTipAnchors(module)) {
    for (const anchor of getCabinetAntiTipAnchorLayouts(module)) {
      parts.push(
        part(
          module.id,
          "anti_tip_anchor_bracket",
          String(anchor.anchorIndex + 1),
          {
            x: x(anchor.localX),
            y: anchor.localY,
            z: z(anchor.localZ),
          },
          {
            width: CABINET_ANTI_TIP_ANCHOR_WIDTH,
            height: CABINET_ANTI_TIP_ANCHOR_HEIGHT,
            depth: CABINET_ANTI_TIP_ANCHOR_DEPTH,
          },
          "hardware_metal",
          {
            role: "anti_tip_anchor_bracket",
            anchorIndex: anchor.anchorIndex + 1,
            anchorCount: getCabinetAntiTipAnchorCount(module),
            anchorHeight: getCabinetAntiTipAnchorHeight(module),
            anchorInsetFromSides: getCabinetAntiTipAnchorInsetFromSides(module),
            requiresFieldVerification: true,
          },
          CABINET_ANTI_TIP_ANCHOR_SKU_ID
        )
      );
    }
  }

  const dividerUsableWidth = Math.max(0, W - 2 * T);
  const dividerHeight = Math.max(0, H - K - 2 * T);
  const dividerDepth = Math.max(0, D - B);
  const verticalDividerCount = Math.max(0, module.verticalDividerCount ?? 0);
  const hangingRodWidth = Math.max(1, W - 2 * T - 60);
  const hangingRodDepth = Math.max(0, Math.min(D - B, D * 0.48));
  const slatCount = getCabinetSlatCount(module);
  const slatWidth = getCabinetSlatWidth(module);
  const slatDepth = getCabinetSlatDepth(module);
  const panelColumnCount = getCabinetPanelColumnCount(module);
  const panelRowCount = getCabinetPanelRowCount(module);
  const panelFrameWidth = getCabinetPanelFrameWidth(module);
  const panelFrameDepth = getCabinetPanelFrameDepth(module);
  const platformDeckThickness = getCabinetPlatformDeckThickness(module);
  const platformDeckDepth = getCabinetPlatformDeckDepth(module);
  const platformDeckOverhangFront = getCabinetPlatformDeckOverhangFront(module);
  const platformSupportRibCount = getCabinetPlatformSupportRibCount(module);
  const platformSupportRibWidth = getCabinetPlatformSupportRibWidth(module);
  const platformSupportRibHeight = getCabinetPlatformSupportRibHeight(module);
  const stairScribeDepth = getCabinetStairScribeDepth(module);
  const stairScribeStepCount = getCabinetStairScribeStepCount(module);
  const stairScribeDirection = getCabinetStairScribeDirection(module);
  const stairScribeHighHeight = getCabinetStairScribeHighHeight(module);
  const stairScribeLowHeight = getCabinetStairScribeLowHeight(module);
  const roomDividerBackPanelThickness = getCabinetRoomDividerBackPanelThickness(module);
  const roomDividerBackPanelCount = getCabinetRoomDividerBackPanelCount(module);
  const roomDividerStabilizerFootCount = getCabinetRoomDividerStabilizerFootCount(module);
  const roomDividerStabilizerFootWidth = getCabinetRoomDividerStabilizerFootWidth(module);
  const roomDividerStabilizerFootHeight = getCabinetRoomDividerStabilizerFootHeight(module);
  const roomDividerStabilizerFootDepth = getCabinetRoomDividerStabilizerFootDepth(module);
  const lifestyleInsertKind = getCabinetLifestyleInsertKind(module);
  const lifestyleInsertCount = getCabinetLifestyleInsertCount(module);
  const lifestyleInsertDepth = getCabinetLifestyleInsertDepth(module);
  const lifestyleInsertDeckHeight = getCabinetLifestyleInsertDeckHeight(module);
  const lifestyleInsertLipHeight = getCabinetLifestyleInsertLipHeight(module);
  const wineRackColumnCount = getCabinetWineRackColumnCount(module);
  const wineRackRowCount = getCabinetWineRackRowCount(module);
  const wineRackDepth = getCabinetWineRackDepth(module, B);
  const wineRackDividerThickness = getCabinetWineRackDividerThickness(module);
  const seatDeckThickness = getCabinetSeatDeckThickness(module);
  const seatCushionThickness = getCabinetSeatCushionThickness(module);
  const seatCushionDepth = getCabinetSeatCushionDepth(module);
  const seatCushionOverhangFront = getCabinetSeatCushionOverhangFront(module);
  const seatBackHeight = getCabinetSeatBackHeight(module);
  const seatBackThickness = getCabinetSeatBackThickness(module);
  const mudroomHookCount = getCabinetMudroomHookCount(module);
  const mudroomHookRailHeight = getCabinetMudroomHookRailHeight(module);
  const mudroomHookProjection = getCabinetMudroomHookProjection(module);
  const shoeCubbyHeight = getCabinetShoeCubbyHeight(module);
  const shoeCubbyDepth = getCabinetShoeCubbyDepth(module);
  const shoeCubbyDividerThickness = getCabinetShoeCubbyDividerThickness(module);
  const sinkCutoutWidth = getCabinetSinkCutoutWidth(module);
  const sinkCutoutDepth = getCabinetSinkCutoutDepth(module);
  const plumbingChaseWidth = getCabinetPlumbingChaseWidth(module);
  const plumbingChaseHeight = getCabinetPlumbingChaseHeight(definition, module);
  const plumbingChaseDepth = getCabinetPlumbingChaseDepth(module);
  const laundryApplianceCount = getCabinetLaundryApplianceCount(module);
  const laundryApplianceWidth = getCabinetLaundryApplianceWidth(module);
  const laundryApplianceHeight = getCabinetLaundryApplianceHeight(module);
  const laundryApplianceDepth = getCabinetLaundryApplianceDepth(module);
  const laundryUtilityChaseHeight = getCabinetLaundryUtilityChaseHeight(module);
  const laundryUtilityChaseDepth = getCabinetLaundryUtilityChaseDepth(module);
  const officeWorksurfaceThickness = getCabinetOfficeWorksurfaceThickness(module);
  const officeWorksurfaceDepth = getCabinetOfficeWorksurfaceDepth(module);
  const officeWorksurfaceOverhangFront = getCabinetOfficeWorksurfaceOverhangFront(module);
  const cableGrommetCount = getCabinetCableGrommetCount(module);
  const cableGrommetDiameter = getCabinetCableGrommetDiameter(module);
  const deskPowerChaseHeight = getCabinetDeskPowerChaseHeight(module);
  const deskPowerChaseDepth = getCabinetDeskPowerChaseDepth(module);
  const pantryPullOutTrayCount = getCabinetPantryPullOutTrayCount(module);
  const pantryPullOutTrayDepth = getCabinetPantryPullOutTrayDepth(module);
  const pantryPullOutTrayFrontHeight = getCabinetPantryPullOutTrayFrontHeight(module);
  const pantryPullOutSlideClearance = getCabinetPantryPullOutSlideClearance(module);
  const mediaTvOpeningWidth = getCabinetMediaTvOpeningWidth(module);
  const mediaTvOpeningHeight = getCabinetMediaTvOpeningHeight(module);
  const mediaTvBlockingThickness = getCabinetMediaTvBlockingThickness(module);
  const mediaCableChaseWidth = getCabinetMediaCableChaseWidth(module);
  const mediaCableChaseHeight = getCabinetMediaCableChaseHeight(module);
  const mediaCableChaseDepth = getCabinetMediaCableChaseDepth(module);
  const mediaVentSlotCount = getCabinetMediaVentSlotCount(module);
  const mediaVentSlotWidth = getCabinetMediaVentSlotWidth(module);
  const mediaVentSlotHeight = getCabinetMediaVentSlotHeight(module);
  const libraryLadderRailDiameter = getCabinetLibraryLadderRailDiameter(module);
  const libraryLadderRailProjection = getCabinetLibraryLadderRailProjection(module);
  const libraryLadderStandoffCount = getCabinetLibraryLadderStandoffCount(module);
  const libraryLadderStandoffDiameter = getCabinetLibraryLadderStandoffDiameter(module);
  const stemwareRackLaneCount = getCabinetStemwareRackLaneCount(module);
  const stemwareRackDepth = getCabinetStemwareRackDepth(module);
  const stemwareRackRailWidth = getCabinetStemwareRackRailWidth(module);
  const lightingChannelDepth = getCabinetLightingChannelDepth(module);
  const lightingChannelHeight = getCabinetLightingChannelHeight(module);
  const lightingChannelWidth = getCabinetLightingChannelWidth(definition, module);
  const hamperBasketDepth = getCabinetHamperBasketDepth(module);
  const hamperBasketHeight = getCabinetHamperBasketHeight(module);
  const hamperSlideClearance = getCabinetHamperSlideClearance(module);
  const shelfPinRowHeight = getCabinetShelfPinRowHeight(module);
  const shelfPinStartHeight = getCabinetShelfPinStartHeight(module);

  for (let i = 0; i < verticalDividerCount; i += 1) {
    const dividerCenterX = T + ((i + 1) * dividerUsableWidth) / (verticalDividerCount + 1);
    parts.push(
      part(
        module.id,
        "vertical_divider",
        String(i + 1),
        { x: x(dividerCenterX - T / 2), y: K + T, z: z(0) },
        { width: T, height: dividerHeight, depth: dividerDepth },
        materialId,
        { dividerIndex: i, bayCount: verticalDividerCount + 1 }
      )
    );
  }

  for (const [index, centerY] of getCabinetHangingRodCenterHeights(definition, module).entries()) {
    parts.push(
      part(
        module.id,
        "hanging_rod",
        String(index + 1),
        {
          x: x(T + 30),
          y: centerY - CABINET_HANGING_ROD_DIAMETER / 2,
          z: z(hangingRodDepth - CABINET_HANGING_ROD_DIAMETER / 2),
        },
        {
          width: hangingRodWidth,
          height: CABINET_HANGING_ROD_DIAMETER,
          depth: CABINET_HANGING_ROD_DIAMETER,
        },
        "hardware_metal",
        {
          rodIndex: index,
          rodCenterHeight: centerY,
          rodCount: getCabinetHangingRodCount(module),
          rodHeight: getCabinetHangingRodHeight(definition, module),
          rodSpacing: getCabinetHangingRodSpacing(module),
        },
        CABINET_HANGING_ROD_SKU_ID
      )
    );
  }

  for (const [i, y] of getCabinetShelfCenterHeights(definition, module).entries()) {
    parts.push(
      part(
        module.id,
        "shelf",
        String(i + 1),
        { x: x(T), y, z: z(0) },
        { width: W - 2 * T, height: T, depth: D - B },
        materialId,
        { shelfIndex: i }
      )
    );
  }

  if (hasCabinetShelfPinRows(module) && shelfPinRowHeight > 0) {
    for (const row of getCabinetShelfPinRowLayouts(definition, module)) {
      parts.push(
        part(
          module.id,
          "shelf_pin_hole_row",
          `${row.pairIndex + 1}-${row.side}`,
          {
            x: x(row.localX),
            y: shelfPinStartHeight,
            z: z(row.localZ),
          },
          {
            width: CABINET_SHELF_PIN_ROW_MARKER_WIDTH,
            height: shelfPinRowHeight,
            depth: CABINET_SHELF_PIN_ROW_MARKER_DEPTH,
          },
          "hardware_metal",
          {
            role: "shelf_pin_hole_row",
            rowPairIndex: row.pairIndex + 1,
            side: row.side,
            holeCount: getCabinetShelfPinHoleCount(module),
            holeSpacing: getCabinetShelfPinHoleSpacing(module),
            startHeight: shelfPinStartHeight,
          },
          CABINET_SHELF_PIN_SKU_ID
        )
      );
    }
  }

  if (
    hasCabinetLightingChannels(module) &&
    lightingChannelWidth > 0 &&
    lightingChannelDepth > 0 &&
    lightingChannelHeight > 0
  ) {
    const lightingChannelYPositions = getCabinetLightingChannelLocalYPositions(definition, module);
    for (const [index, localY] of lightingChannelYPositions.entries()) {
      parts.push(
        part(
          module.id,
          "led_lighting_channel",
          String(index + 1),
          {
            x: x(getCabinetLightingChannelLocalX(definition)),
            y: localY,
            z: z(getCabinetLightingChannelLocalZ(definition, module)),
          },
          {
            width: lightingChannelWidth,
            height: lightingChannelHeight,
            depth: lightingChannelDepth,
          },
          "hardware_metal",
          {
            role: "led_lighting_channel",
            channelIndex: index + 1,
            channelCount: lightingChannelYPositions.length,
            insetFromFront: getCabinetLightingChannelInsetFromFront(module),
          },
          CABINET_LIGHTING_CHANNEL_SKU_ID
        )
      );
    }
  }

  if (hasCabinetHamperPullOut(module) && hamperBasketDepth > 0 && hamperBasketHeight > 0) {
    const hamperY = getCabinetHamperOpeningY(definition);
    for (const basket of getCabinetHamperBasketLayouts(definition, module)) {
      parts.push(
        part(
          module.id,
          "hamper_pullout_basket",
          String(basket.index + 1),
          {
            x: x(basket.localX),
            y: hamperY,
            z: z(0),
          },
          {
            width: basket.width,
            height: hamperBasketHeight,
            depth: hamperBasketDepth,
          },
          "hardware_metal",
          {
            role: "hamper_pullout_basket",
            basketIndex: basket.index + 1,
            basketDepth: hamperBasketDepth,
            basketHeight: hamperBasketHeight,
            slideClearance: hamperSlideClearance,
          },
          CABINET_HAMPER_BASKET_SKU_ID
        )
      );
      parts.push(
        part(
          module.id,
          "hamper_pullout_slide_pair",
          String(basket.index + 1),
          {
            x: x(Math.max(0, basket.localX - hamperSlideClearance)),
            y: hamperY + Math.max(0, (hamperBasketHeight - CABINET_HAMPER_SLIDE_PAIR_HEIGHT) / 2),
            z: z(0),
          },
          {
            width: basket.width + hamperSlideClearance * 2,
            height: CABINET_HAMPER_SLIDE_PAIR_HEIGHT,
            depth: hamperBasketDepth,
          },
          "hardware_metal",
          {
            role: "hamper_pullout_slide_pair",
            basketIndex: basket.index + 1,
            basketDepth: hamperBasketDepth,
            slideClearance: hamperSlideClearance,
          },
          CABINET_HAMPER_SLIDE_SKU_ID
        )
      );
    }
  }

  if (
    hasCabinetPantryPullOuts(module) &&
    pantryPullOutTrayCount > 0 &&
    pantryPullOutTrayDepth > 0 &&
    pantryPullOutTrayFrontHeight > 0
  ) {
    const trayOpeningX = getCabinetPantryPullOutOpeningX(definition, module);
    const trayOpeningW = getCabinetPantryPullOutOpeningWidth(definition, module);
    const slideEnvelopeW = Math.max(0, trayOpeningW + 2 * pantryPullOutSlideClearance);

    for (const [index, localY] of getCabinetPantryPullOutTrayLocalYPositions(definition, module).entries()) {
      parts.push(
        part(
          module.id,
          "pantry_pullout_tray_deck",
          String(index + 1),
          { x: x(trayOpeningX), y: localY, z: z(0) },
          {
            width: trayOpeningW,
            height: T,
            depth: pantryPullOutTrayDepth,
          },
          frontMaterialId,
          {
            role: "pantry_pullout_tray_deck",
            trayIndex: index + 1,
            trayCount: pantryPullOutTrayCount,
            trayDepth: pantryPullOutTrayDepth,
            slideClearance: pantryPullOutSlideClearance,
          }
        )
      );
      parts.push(
        part(
          module.id,
          "pantry_pullout_tray_front",
          String(index + 1),
          { x: x(trayOpeningX), y: localY + T, z: z(0) },
          {
            width: trayOpeningW,
            height: pantryPullOutTrayFrontHeight,
            depth: CABINET_FRONT_THICKNESS,
          },
          frontMaterialId,
          {
            role: "pantry_pullout_tray_front_lip",
            trayIndex: index + 1,
            trayCount: pantryPullOutTrayCount,
            trayFrontHeight: pantryPullOutTrayFrontHeight,
          }
        )
      );
      parts.push(
        part(
          module.id,
          "pantry_pullout_slide_pair",
          String(index + 1),
          { x: x(T + G), y: localY, z: z(0) },
          {
            width: slideEnvelopeW,
            height: CABINET_PANTRY_PULL_OUT_SLIDE_PAIR_HEIGHT,
            depth: pantryPullOutTrayDepth,
          },
          "hardware_metal",
          {
            role: "pantry_pullout_slide_pair",
            hardwareId: CABINET_PANTRY_PULL_OUT_SLIDE_HARDWARE_ID,
            trayIndex: index + 1,
            trayCount: pantryPullOutTrayCount,
            coordinationOnly: true,
          },
          CABINET_PANTRY_PULL_OUT_SLIDE_SKU_ID
        )
      );
    }
  }

  if (hasCabinetWineRack(module) && wineRackDepth > 0 && wineRackDividerThickness > 0) {
    const wineOpeningX = T + G;
    const wineOpeningY = K + T + G;
    const wineOpeningW = getCabinetWineRackOpeningWidth(module, T, G);
    const wineOpeningH = getCabinetWineRackOpeningHeight(module, T, K, G);
    const verticalDividerPositions = getCabinetWineRackVerticalDividerLocalXPositions(module, T, G);
    const horizontalRailPositions = getCabinetWineRackHorizontalRailLocalYPositions(module, T, K, G);

    for (const [index, localX] of verticalDividerPositions.entries()) {
      parts.push(
        part(
          module.id,
          "wine_rack_vertical_divider",
          String(index + 1),
          {
            x: x(localX),
            y: wineOpeningY,
            z: z(0),
          },
          {
            width: wineRackDividerThickness,
            height: wineOpeningH,
            depth: wineRackDepth,
          },
          frontMaterialId,
          {
            role: "wine_rack_column_divider",
            columnIndex: index + 1,
            columnCount: wineRackColumnCount,
            rowCount: wineRackRowCount,
            rackDepth: wineRackDepth,
            dividerThickness: wineRackDividerThickness,
          }
        )
      );
    }

    for (const [index, localY] of horizontalRailPositions.entries()) {
      parts.push(
        part(
          module.id,
          "wine_rack_horizontal_rail",
          String(index + 1),
          {
            x: x(wineOpeningX),
            y: localY,
            z: z(0),
          },
          {
            width: wineOpeningW,
            height: wineRackDividerThickness,
            depth: wineRackDepth,
          },
          frontMaterialId,
          {
            role: "wine_rack_row_rail",
            rowIndex: index + 1,
            columnCount: wineRackColumnCount,
            rowCount: wineRackRowCount,
            rackDepth: wineRackDepth,
            dividerThickness: wineRackDividerThickness,
          }
        )
      );
    }
  }

  if (hasCabinetSeatingDetails(module)) {
    const seatDepth = Math.max(0, D + seatCushionOverhangFront);
    if (seatDeckThickness > 0 && seatDepth > 0) {
      parts.push(
        part(
          module.id,
          "seat_deck_panel",
          "0",
          {
            x: x(0),
            y: H,
            z: z(-seatCushionOverhangFront),
          },
          {
            width: W,
            height: seatDeckThickness,
            depth: seatDepth,
          },
          frontMaterialId,
          {
            role: "seat_deck",
            deckThickness: seatDeckThickness,
            frontOverhang: seatCushionOverhangFront,
          }
        )
      );
    }

    if (seatCushionThickness > 0 && seatCushionDepth > 0) {
      parts.push(
        part(
          module.id,
          "seat_cushion",
          "0",
          {
            x: x(0),
            y: H + seatDeckThickness,
            z: z(-seatCushionOverhangFront),
          },
          {
            width: W,
            height: seatCushionThickness,
            depth: seatCushionDepth,
          },
          CABINET_SEAT_CUSHION_MATERIAL_ID,
          {
            role: "seat_cushion",
            cushionThickness: seatCushionThickness,
            cushionDepth: seatCushionDepth,
            frontOverhang: seatCushionOverhangFront,
          }
        )
      );
    }

    if (hasCabinetSeatBack(module) && seatBackHeight > 0 && seatBackThickness > 0) {
      parts.push(
        part(
          module.id,
          "seat_back_panel",
          "0",
          {
            x: x(0),
            y: H + seatDeckThickness,
            z: z(Math.max(0, D - seatBackThickness)),
          },
          {
            width: W,
            height: seatBackHeight,
            depth: seatBackThickness,
          },
          frontMaterialId,
          {
            role: "seat_back_panel",
            backHeight: seatBackHeight,
            backThickness: seatBackThickness,
          }
        )
      );
    }
  }

  if (hasCabinetMudroomHooks(module) && mudroomHookCount > 0) {
    const railY = Math.max(0, mudroomHookRailHeight - CABINET_MUDROOM_HOOK_RAIL_HEIGHT / 2);
    const railZ = Math.max(0, D - B - CABINET_MUDROOM_HOOK_RAIL_DEPTH);
    parts.push(
      part(
        module.id,
        "mudroom_hook_rail",
        "0",
        {
          x: x(0),
          y: railY,
          z: z(railZ),
        },
        {
          width: W,
          height: CABINET_MUDROOM_HOOK_RAIL_HEIGHT,
          depth: CABINET_MUDROOM_HOOK_RAIL_DEPTH,
        },
        frontMaterialId,
        {
          role: "mudroom_hook_rail",
          hookCount: mudroomHookCount,
          railCenterHeight: mudroomHookRailHeight,
        }
      )
    );

    for (const [index, localX] of getCabinetMudroomHookLocalXPositions(module).entries()) {
      parts.push(
        part(
          module.id,
          "mudroom_hook",
          String(index + 1),
          {
            x: x(localX),
            y: mudroomHookRailHeight - CABINET_MUDROOM_HOOK_HEIGHT / 2,
            z: z(Math.max(0, D - B - mudroomHookProjection)),
          },
          {
            width: CABINET_MUDROOM_HOOK_WIDTH,
            height: CABINET_MUDROOM_HOOK_HEIGHT,
            depth: mudroomHookProjection,
          },
          "hardware_metal",
          {
            role: "mudroom_hook",
            hookIndex: index + 1,
            hookCount: mudroomHookCount,
            railCenterHeight: mudroomHookRailHeight,
            hookProjection: mudroomHookProjection,
          },
          CABINET_MUDROOM_HOOK_SKU_ID
        )
      );
    }
  }

  if (hasCabinetShoeCubbies(module) && shoeCubbyHeight > 0 && shoeCubbyDepth > 0 && shoeCubbyDividerThickness > 0) {
    const openingX = getCabinetShoeCubbyOpeningX(definition);
    const openingY = getCabinetShoeCubbyOpeningY(definition);
    const openingWidth = getCabinetShoeCubbyOpeningWidth(definition, module);
    for (const [index, localX] of getCabinetShoeCubbyVerticalDividerLocalXPositions(definition, module).entries()) {
      parts.push(
        part(
          module.id,
          "shoe_cubby_vertical_divider",
          String(index + 1),
          {
            x: x(localX),
            y: openingY,
            z: z(0),
          },
          {
            width: shoeCubbyDividerThickness,
            height: shoeCubbyHeight,
            depth: shoeCubbyDepth,
          },
          materialId,
          {
            role: "shoe_cubby_vertical_divider",
            dividerIndex: index + 1,
            cubbyHeight: shoeCubbyHeight,
            cubbyDepth: shoeCubbyDepth,
          }
        )
      );
    }

    parts.push(
      part(
        module.id,
        "shoe_cubby_shelf",
        "0",
        {
          x: x(openingX),
          y: openingY + shoeCubbyHeight,
          z: z(0),
        },
        {
          width: openingWidth,
          height: shoeCubbyDividerThickness,
          depth: shoeCubbyDepth,
        },
        materialId,
        {
          role: "shoe_cubby_shelf",
          cubbyHeight: shoeCubbyHeight,
          cubbyDepth: shoeCubbyDepth,
        }
      )
    );
  }

  if (hasCabinetSinkCutout(module) && definition.includeCountertop && sinkCutoutWidth > 0 && sinkCutoutDepth > 0) {
    parts.push(
      part(
        module.id,
        "sink_cutout_template",
        "0",
        {
          x: x(getCabinetSinkCutoutLocalX(module)),
          y: getCabinetModuleRunHeight(definition) + getCabinetCountertopThickness(definition),
          z: z(getCabinetSinkCutoutLocalZ(module)),
        },
        {
          width: sinkCutoutWidth,
          height: CABINET_SINK_CUTOUT_MARKER_THICKNESS,
          depth: sinkCutoutDepth,
        },
        CABINET_SERVICE_ZONE_MATERIAL_ID,
        {
          role: "sink_cutout_template",
          offsetX: getCabinetSinkCutoutOffsetX(module),
          offsetZ: getCabinetSinkCutoutOffsetZ(module),
          coordinationOnly: true,
        }
      )
    );
  }

  if (hasCabinetPlumbingChase(module) && plumbingChaseWidth > 0 && plumbingChaseHeight > 0 && plumbingChaseDepth > 0) {
    parts.push(
      part(
        module.id,
        "plumbing_chase_void",
        "0",
        {
          x: x(getCabinetPlumbingChaseLocalX(module)),
          y: definition.toeKickHeight,
          z: z(getCabinetPlumbingChaseLocalZ(module)),
        },
        {
          width: plumbingChaseWidth,
          height: plumbingChaseHeight,
          depth: plumbingChaseDepth,
        },
        CABINET_SERVICE_ZONE_MATERIAL_ID,
        {
          role: "plumbing_chase_void",
          sinkAligned: hasCabinetSinkCutout(module),
          coordinationOnly: true,
        }
      )
    );
  }

  if (
    hasCabinetLaundryApplianceBay(module) &&
    laundryApplianceCount > 0 &&
    laundryApplianceWidth > 0 &&
    laundryApplianceHeight > 0 &&
    laundryApplianceDepth > 0
  ) {
    for (const [index, localX] of getCabinetLaundryApplianceLocalXPositions(module).entries()) {
      parts.push(
        part(
          module.id,
          "laundry_appliance_clearance",
          String(index + 1),
          {
            x: x(localX),
            y: 0,
            z: z(0),
          },
          {
            width: laundryApplianceWidth,
            height: laundryApplianceHeight,
            depth: laundryApplianceDepth,
          },
          CABINET_SERVICE_ZONE_MATERIAL_ID,
          {
            role: "laundry_appliance_clearance",
            applianceIndex: index + 1,
            applianceCount: laundryApplianceCount,
            applianceKind: getCabinetLaundryApplianceKind(module),
            sideClearance: getCabinetLaundryApplianceSideClearance(module),
            topClearance: getCabinetLaundryApplianceTopClearance(module),
            backClearance: getCabinetLaundryApplianceBackClearance(module),
            coordinationOnly: true,
          }
        )
      );
    }
  }

  if (hasCabinetLaundryApplianceBay(module) && laundryUtilityChaseHeight > 0 && laundryUtilityChaseDepth > 0) {
    parts.push(
      part(
        module.id,
        "laundry_utility_chase",
        "0",
        {
          x: x(0),
          y: Math.max(0, H - laundryUtilityChaseHeight),
          z: z(getCabinetLaundryUtilityChaseLocalZ(module)),
        },
        {
          width: W,
          height: laundryUtilityChaseHeight,
          depth: laundryUtilityChaseDepth,
        },
        CABINET_SERVICE_ZONE_MATERIAL_ID,
        {
          role: "laundry_utility_chase",
          applianceKind: getCabinetLaundryApplianceKind(module),
          coordinationOnly: true,
        }
      )
    );
  }

  if (hasCabinetOfficeWorkstation(module) && officeWorksurfaceThickness > 0 && officeWorksurfaceDepth > 0) {
    parts.push(
      part(
        module.id,
        "office_worksurface",
        "0",
        {
          x: x(0),
          y: H,
          z: z(-officeWorksurfaceOverhangFront),
        },
        {
          width: W,
          height: officeWorksurfaceThickness,
          depth: officeWorksurfaceDepth,
        },
        frontMaterialId,
        {
          role: "office_worksurface",
          overhangFront: officeWorksurfaceOverhangFront,
        }
      )
    );
  }

  if (hasCabinetOfficeWorkstation(module) && cableGrommetCount > 0 && cableGrommetDiameter > 0) {
    for (const [index, localX] of getCabinetCableGrommetLocalXPositions(module).entries()) {
      parts.push(
        part(
          module.id,
          "cable_grommet_template",
          String(index + 1),
          {
            x: x(localX),
            y: H + officeWorksurfaceThickness,
            z: z(getCabinetCableGrommetLocalZ(module)),
          },
          {
            width: cableGrommetDiameter,
            height: CABINET_CABLE_GROMMET_MARKER_THICKNESS,
            depth: cableGrommetDiameter,
          },
          CABINET_SERVICE_ZONE_MATERIAL_ID,
          {
            role: "cable_grommet_template",
            grommetIndex: index + 1,
            grommetCount: cableGrommetCount,
            offsetFromBack: getCabinetCableGrommetOffsetFromBack(module),
            coordinationOnly: true,
          }
        )
      );
    }
  }

  if (hasCabinetOfficeWorkstation(module) && deskPowerChaseHeight > 0 && deskPowerChaseDepth > 0) {
    parts.push(
      part(
        module.id,
        "desk_power_chase",
        "0",
        {
          x: x(0),
          y: Math.max(0, H - deskPowerChaseHeight),
          z: z(getCabinetDeskPowerChaseLocalZ(module)),
        },
        {
          width: W,
          height: deskPowerChaseHeight,
          depth: deskPowerChaseDepth,
        },
        CABINET_SERVICE_ZONE_MATERIAL_ID,
        {
          role: "desk_power_chase",
          coordinationOnly: true,
        }
      )
    );
  }

  if (hasCabinetMediaWallDetails(module)) {
    if (mediaTvOpeningWidth > 0 && mediaTvOpeningHeight > 0 && mediaTvBlockingThickness > 0) {
      parts.push(
        part(
          module.id,
          "media_tv_blocking_panel",
          "0",
          {
            x: x(getCabinetMediaTvBlockingLocalX(module)),
            y: getCabinetMediaTvBlockingLocalY(definition, module),
            z: z(getCabinetMediaTvBlockingLocalZ(module)),
          },
          {
            width: mediaTvOpeningWidth,
            height: mediaTvOpeningHeight,
            depth: mediaTvBlockingThickness,
          },
          frontMaterialId,
          {
            role: "media_tv_blocking_panel",
            tvMountHeight: getCabinetMediaTvMountHeight(module),
          }
        )
      );
    }

    if (mediaCableChaseWidth > 0 && mediaCableChaseHeight > 0 && mediaCableChaseDepth > 0) {
      parts.push(
        part(
          module.id,
          "media_cable_chase",
          "0",
          {
            x: x(getCabinetMediaCableChaseLocalX(module)),
            y: getCabinetMediaCableChaseLocalY(definition, module),
            z: z(getCabinetMediaCableChaseLocalZ(module)),
          },
          {
            width: mediaCableChaseWidth,
            height: mediaCableChaseHeight,
            depth: mediaCableChaseDepth,
          },
          CABINET_SERVICE_ZONE_MATERIAL_ID,
          {
            role: "media_cable_chase",
            tvMountHeight: getCabinetMediaTvMountHeight(module),
            coordinationOnly: true,
          }
        )
      );
    }

    if (mediaVentSlotCount > 0 && mediaVentSlotWidth > 0 && mediaVentSlotHeight > 0) {
      for (const [index, localX] of getCabinetMediaVentSlotLocalXPositions(module).entries()) {
        parts.push(
          part(
            module.id,
            "media_vent_slot_template",
            String(index + 1),
            {
              x: x(localX),
              y: getCabinetMediaVentSlotLocalY(definition, module),
              z: z(-CABINET_FRONT_THICKNESS),
            },
            {
              width: mediaVentSlotWidth,
              height: mediaVentSlotHeight,
              depth: CABINET_MEDIA_VENT_SLOT_MARKER_THICKNESS,
            },
            CABINET_SERVICE_ZONE_MATERIAL_ID,
            {
              role: "media_vent_slot_template",
              ventSlotIndex: index + 1,
              ventSlotCount: mediaVentSlotCount,
              ventSlotSpacing: getCabinetMediaVentSlotSpacing(module),
              coordinationOnly: true,
            }
          )
        );
      }
    }
  }

  if (hasCabinetLibraryLadderRail(module) && libraryLadderRailDiameter > 0) {
    parts.push(
      part(
        module.id,
        "library_ladder_rail",
        "0",
        {
          x: x(0),
          y: getCabinetLibraryLadderRailLocalY(module),
          z: z(getCabinetLibraryLadderRailLocalZ(module)),
        },
        {
          width: W,
          height: libraryLadderRailDiameter,
          depth: libraryLadderRailDiameter,
        },
        "hardware_metal",
        {
          role: "library_ladder_rail",
          railProjection: libraryLadderRailProjection,
          standoffCount: libraryLadderStandoffCount,
        },
        CABINET_LIBRARY_LADDER_RAIL_SKU_ID
      )
    );

    if (libraryLadderStandoffCount > 0 && libraryLadderStandoffDiameter > 0) {
      for (const [index, localX] of getCabinetLibraryLadderStandoffLocalXPositions(module).entries()) {
        parts.push(
          part(
            module.id,
            "library_ladder_standoff",
            String(index + 1),
            {
              x: x(localX),
              y: getCabinetLibraryLadderRailLocalY(module) + (libraryLadderRailDiameter - libraryLadderStandoffDiameter) / 2,
              z: z(getCabinetLibraryLadderRailLocalZ(module)),
            },
            {
              width: libraryLadderStandoffDiameter,
              height: libraryLadderStandoffDiameter,
              depth: libraryLadderRailProjection,
            },
            "hardware_metal",
            {
              role: "library_ladder_standoff",
              standoffIndex: index + 1,
              standoffCount: libraryLadderStandoffCount,
              railProjection: libraryLadderRailProjection,
            },
            CABINET_LIBRARY_LADDER_RAIL_SKU_ID
          )
        );
      }
    }
  }

  if (hasCabinetStemwareRack(module) && stemwareRackLaneCount > 0 && stemwareRackDepth > 0 && stemwareRackRailWidth > 0) {
    for (const [index, localX] of getCabinetStemwareRackRailLocalXPositions(module).entries()) {
      const laneIndex = Math.floor(index / 2) + 1;
      const railIndex = (index % 2) + 1;
      parts.push(
        part(
          module.id,
          "stemware_rack_rail",
          `${laneIndex}-${railIndex}`,
          {
            x: x(localX),
            y: getCabinetStemwareRackLocalY(module),
            z: z(getCabinetStemwareRackLocalZ(module)),
          },
          {
            width: stemwareRackRailWidth,
            height: CABINET_DEFAULT_STEMWARE_RACK_RAIL_HEIGHT,
            depth: stemwareRackDepth,
          },
          "hardware_metal",
          {
            role: "stemware_rack_rail",
            laneIndex,
            railIndex,
            laneCount: stemwareRackLaneCount,
            laneSpacing: getCabinetStemwareRackLaneSpacing(module),
          },
          CABINET_STEMWARE_RACK_SKU_ID
        )
      );
    }
  }

  for (const [index, localX] of getCabinetSlatLocalXPositions(module).entries()) {
    parts.push(
      part(
        module.id,
        "slat",
        String(index + 1),
        {
          x: x(localX),
          y: 0,
          z: z(-slatDepth),
        },
        {
          width: slatWidth,
          height: H,
          depth: slatDepth,
        },
        frontMaterialId,
        {
          slatIndex: index,
          slatCount,
          slatWidth,
          slatDepth,
        }
      )
    );
  }

  for (const [index, localX] of getCabinetPanelStileLocalXPositions(module).entries()) {
    parts.push(
      part(
        module.id,
        "panel_stile",
        String(index + 1),
        {
          x: x(localX),
          y: 0,
          z: z(-CABINET_FRONT_THICKNESS - panelFrameDepth),
        },
        {
          width: panelFrameWidth,
          height: H,
          depth: panelFrameDepth,
        },
        frontMaterialId,
        {
          stileIndex: index,
          panelColumnCount,
          panelRowCount,
          panelFrameWidth,
          panelFrameDepth,
          role: index === 0 || index === panelColumnCount ? "end_stile" : "intermediate_stile",
        }
      )
    );
  }

  for (const [index, localY] of getCabinetPanelRailLocalYPositions(module).entries()) {
    parts.push(
      part(
        module.id,
        "panel_rail",
        String(index + 1),
        {
          x: x(0),
          y: localY,
          z: z(-CABINET_FRONT_THICKNESS - panelFrameDepth),
        },
        {
          width: W,
          height: panelFrameWidth,
          depth: panelFrameDepth,
        },
        frontMaterialId,
        {
          railIndex: index,
          panelColumnCount,
          panelRowCount,
          panelFrameWidth,
          panelFrameDepth,
          role: index === 0 || index === panelRowCount ? "end_rail" : "intermediate_rail",
        }
      )
    );
  }

  if (hasCabinetPlatformDeck(module) && platformDeckThickness > 0) {
    parts.push(
      part(
        module.id,
        "platform_deck",
        "0",
        {
          x: x(0),
          y: H,
          z: z(-platformDeckOverhangFront),
        },
        {
          width: W,
          height: platformDeckThickness,
          depth: platformDeckDepth,
        },
        frontMaterialId,
        {
          role: "storage_bed_deck",
          deckThickness: platformDeckThickness,
          deckDepth: platformDeckDepth,
          overhangFront: platformDeckOverhangFront,
        }
      )
    );
  }

  for (const [index, localZ] of getCabinetPlatformSupportRibLocalZPositions(module).entries()) {
    parts.push(
      part(
        module.id,
        "platform_support_rib",
        String(index + 1),
        {
          x: x(0),
          y: Math.max(0, H - platformSupportRibHeight),
          z: z(-platformDeckOverhangFront + localZ),
        },
        {
          width: W,
          height: platformSupportRibHeight,
          depth: platformSupportRibWidth,
        },
        materialId,
        {
          role: "storage_bed_support_rib",
          ribIndex: index,
          ribCount: platformSupportRibCount,
          ribWidth: platformSupportRibWidth,
          ribHeight: platformSupportRibHeight,
        }
      )
    );
  }

  if (hasCabinetStairScribe(module) && stairScribeDepth > 0) {
    for (const panel of getCabinetStairScribePanelLayouts(module)) {
      parts.push(
        part(
          module.id,
          "stair_scribe_panel",
          String(panel.index + 1),
          {
            x: x(panel.localX),
            y: H,
            z: z(-stairScribeDepth),
          },
          {
            width: panel.width,
            height: panel.height,
            depth: stairScribeDepth,
          },
          frontMaterialId,
          {
            role: "under_stair_stepped_scribe",
            stepIndex: panel.index,
            stepCount: stairScribeStepCount,
            direction: stairScribeDirection,
            topHeight: panel.topHeight,
            highHeight: stairScribeHighHeight,
            lowHeight: stairScribeLowHeight,
            scribeDepth: stairScribeDepth,
          }
        )
      );
    }
  }

  if (hasCabinetRoomDividerDetails(module)) {
    for (const panel of getCabinetRoomDividerBackPanelLayouts(module)) {
      parts.push(
        part(
          module.id,
          "room_divider_back_panel",
          String(panel.index + 1),
          {
            x: x(panel.localX),
            y: 0,
            z: z(Math.max(0, D - roomDividerBackPanelThickness)),
          },
          {
            width: panel.width,
            height: H,
            depth: roomDividerBackPanelThickness,
          },
          frontMaterialId,
          {
            role: "two_sided_finished_back",
            panelIndex: panel.index,
            panelCount: roomDividerBackPanelCount,
            panelThickness: roomDividerBackPanelThickness,
          }
        )
      );
    }

    for (const foot of getCabinetRoomDividerStabilizerFootLayouts(module)) {
      parts.push(
        part(
          module.id,
          "room_divider_stabilizer_foot",
          String(foot.index + 1),
          {
            x: x(foot.localX),
            y: 0,
            z: z(Math.max(0, (D - roomDividerStabilizerFootDepth) / 2)),
          },
          {
            width: foot.width,
            height: roomDividerStabilizerFootHeight,
            depth: roomDividerStabilizerFootDepth,
          },
          materialId,
          {
            role: "freestanding_stabilizer_foot",
            footIndex: foot.index,
            footCount: roomDividerStabilizerFootCount,
            footWidth: roomDividerStabilizerFootWidth,
            footHeight: roomDividerStabilizerFootHeight,
            footDepth: roomDividerStabilizerFootDepth,
          }
        )
      );
    }
  }

  if (hasCabinetLifestyleInsert(module) && lifestyleInsertDepth > 0 && lifestyleInsertDeckHeight > 0) {
    for (const insert of getCabinetLifestyleInsertLayouts(module, T, G)) {
      const baseY = K + T;
      parts.push(
        part(
          module.id,
          "lifestyle_insert_deck",
          String(insert.index + 1),
          {
            x: x(insert.localX),
            y: baseY,
            z: z(0),
          },
          {
            width: insert.width,
            height: lifestyleInsertDeckHeight,
            depth: lifestyleInsertDepth,
          },
          frontMaterialId,
          {
            role: lifestyleInsertKind,
            insertKind: lifestyleInsertKind,
            insertIndex: insert.index,
            insertCount: lifestyleInsertCount,
            insertDepth: lifestyleInsertDepth,
          }
        )
      );

      if (lifestyleInsertLipHeight > 0) {
        parts.push(
          part(
            module.id,
            "lifestyle_insert_lip",
            String(insert.index + 1),
            {
              x: x(insert.localX),
              y: baseY + lifestyleInsertDeckHeight,
              z: z(-CABINET_FRONT_THICKNESS),
            },
            {
              width: insert.width,
              height: lifestyleInsertLipHeight,
              depth: CABINET_FRONT_THICKNESS,
            },
            frontMaterialId,
            {
              role: `${lifestyleInsertKind}_front_lip`,
              insertKind: lifestyleInsertKind,
              insertIndex: insert.index,
              insertCount: lifestyleInsertCount,
              lipHeight: lifestyleInsertLipHeight,
            }
          )
        );
      }
    }
  }

  if (hasCabinetFaceFrame(definition)) {
    const faceFrameMaterialId = definition.faceFrameMaterialId ?? frontMaterialId;
    for (const frame of getCabinetFaceFrameLayouts(definition, module)) {
      parts.push(
        part(
          module.id,
          frame.type === "stile" ? "face_frame_stile" : "face_frame_rail",
          frame.index,
          {
            x: x(frame.localX),
            y: frame.localY,
            z: z(frame.localZ),
          },
          {
            width: frame.width,
            height: frame.height,
            depth: frame.depth,
          },
          faceFrameMaterialId,
          {
            role: frame.role,
            faceFrameStileWidth: getCabinetFaceFrameStileWidth(definition),
            faceFrameRailHeight: getCabinetFaceFrameRailHeight(definition),
            faceFrameDepth: getCabinetFaceFrameDepth(definition),
          }
        )
      );
    }
  }

  const frontZ = z(-CABINET_FRONT_THICKNESS);
  const openingX = T + G;
  const openingY = K + T + G;
  const openingW = Math.max(1, W - 2 * T - 2 * G);
  const openingH = Math.max(1, H - K - 2 * T - 2 * G);
  const effectiveDoorCount = getCabinetEffectiveDoorCount(definition, module);

  const addDoorFronts = (doorCount: number, y: number, height: number, indexPrefix = "door") => {
    if (doorCount <= 0) return;
    const frontCount = Math.max(1, doorCount);
    const doorW = (openingW - G * (frontCount - 1)) / frontCount;
    for (let i = 0; i < frontCount; i += 1) {
      const front = part(
        module.id,
        "door_front",
        `${indexPrefix}-${i + 1}`,
        { x: x(openingX + i * (doorW + G)), y, z: frontZ },
        { width: doorW, height, depth: CABINET_FRONT_THICKNESS },
        frontMaterialId,
        {
          doorIndex: i,
          doorStyle: module.doorStyle,
          swingSide: frontCount === 1 ? module.hingeSide ?? "left" : i === 0 ? "left" : "right",
        }
      );
      parts.push(front);
      addHandle(parts, definition, module, front, `${indexPrefix}-${i + 1}`, "door");
    }
  };

  const addDrawerFronts = (drawerCount: number, y: number, height: number, indexPrefix = "drawer") => {
    if (drawerCount <= 0) return;
    const proportions = getCabinetDrawerHeightProportions(
      definition,
      drawerCount === module.drawerCount ? module : { ...module, drawerCount }
    );
    const availableFrontHeight = Math.max(1, height - G * (drawerCount - 1));
    let nextY = y;
    for (let i = 0; i < drawerCount; i += 1) {
      const drawerH = availableFrontHeight * (proportions[i] ?? 1 / drawerCount);
      const front = part(
        module.id,
        "drawer_front",
        `${indexPrefix}-${i + 1}`,
        { x: x(openingX), y: nextY, z: frontZ },
        { width: openingW, height: drawerH, depth: CABINET_FRONT_THICKNESS },
        frontMaterialId,
        { drawerIndex: i }
      );
      parts.push(front);
      addHandle(parts, definition, module, front, `${indexPrefix}-${i + 1}`, "drawer");
      nextY += drawerH + G;
    }
  };

  if (module.frontType === "single_door") addDoorFronts(effectiveDoorCount, openingY, openingH);
  if (module.frontType === "double_door") addDoorFronts(effectiveDoorCount, openingY, openingH);
  if (module.frontType === "slab_panel") addDoorFronts(effectiveDoorCount, openingY, openingH, "slab");
  if (module.frontType === "drawer_stack") addDrawerFronts(module.drawerCount, openingY, openingH);
  if (module.frontType === "door_and_drawer") {
    const drawerBand = Math.min(220, openingH * 0.32);
    addDrawerFronts(Math.max(1, module.drawerCount), openingY + openingH - drawerBand, drawerBand, "top-drawer");
    addDoorFronts(effectiveDoorCount, openingY, Math.max(1, openingH - drawerBand - G), "lower-door");
  }

  if (hasCabinetDrawerBoxes(module)) {
    for (const box of getCabinetDrawerBoxLayouts(definition, module)) {
      parts.push(
        part(
          module.id,
          "drawer_box_bottom",
          box.frontKey,
          {
            x: x(box.localX),
            y: box.localY,
            z: z(box.localZ),
          },
          {
            width: box.width,
            height: box.bottomThickness,
            depth: box.depth,
          },
          materialId,
          {
            role: "drawer_box_bottom",
            frontPartId: box.frontPartId,
            drawerIndex: box.drawerIndex + 1,
            drawerBoxWidth: box.width,
            drawerBoxHeight: box.height,
            drawerBoxDepth: box.depth,
            drawerBoxBottomThickness: box.bottomThickness,
            drawerBoxBackClearance: box.backClearance,
          }
        )
      );
      parts.push(
        part(
          module.id,
          "drawer_box_side",
          `${box.frontKey}-left`,
          {
            x: x(box.localX),
            y: box.localY + box.bottomThickness,
            z: z(box.localZ),
          },
          {
            width: box.sideThickness,
            height: Math.max(1, box.height - box.bottomThickness),
            depth: box.depth,
          },
          materialId,
          {
            role: "drawer_box_left_side",
            frontPartId: box.frontPartId,
            drawerIndex: box.drawerIndex + 1,
            drawerBoxWidth: box.width,
            drawerBoxHeight: box.height,
            drawerBoxDepth: box.depth,
            drawerBoxSideThickness: box.sideThickness,
            drawerBoxHeightClearance: box.heightClearance,
          }
        )
      );
      parts.push(
        part(
          module.id,
          "drawer_box_side",
          `${box.frontKey}-right`,
          {
            x: x(box.localX + box.width - box.sideThickness),
            y: box.localY + box.bottomThickness,
            z: z(box.localZ),
          },
          {
            width: box.sideThickness,
            height: Math.max(1, box.height - box.bottomThickness),
            depth: box.depth,
          },
          materialId,
          {
            role: "drawer_box_right_side",
            frontPartId: box.frontPartId,
            drawerIndex: box.drawerIndex + 1,
            drawerBoxWidth: box.width,
            drawerBoxHeight: box.height,
            drawerBoxDepth: box.depth,
            drawerBoxSideThickness: box.sideThickness,
            drawerBoxHeightClearance: box.heightClearance,
          }
        )
      );
      parts.push(
        part(
          module.id,
          "drawer_box_back",
          box.frontKey,
          {
            x: x(box.localX + box.sideThickness),
            y: box.localY + box.bottomThickness,
            z: z(box.localZ + box.depth - box.sideThickness),
          },
          {
            width: Math.max(1, box.width - box.sideThickness * 2),
            height: Math.max(1, box.height - box.bottomThickness),
            depth: box.sideThickness,
          },
          materialId,
          {
            role: "drawer_box_back",
            frontPartId: box.frontPartId,
            drawerIndex: box.drawerIndex + 1,
            drawerBoxWidth: box.width,
            drawerBoxHeight: box.height,
            drawerBoxDepth: box.depth,
            drawerBoxSideThickness: box.sideThickness,
          }
        )
      );
    }
  }

  if (hasCabinetDoorHinges(module)) {
    for (const hinge of getCabinetDoorHingeLayouts(definition, module)) {
      parts.push(
        part(
          module.id,
          "door_hinge_pair",
          `${hinge.frontKey}-${hinge.hingeIndex + 1}`,
          {
            x: x(hinge.localX),
            y: hinge.localY,
            z: z(hinge.localZ),
          },
          {
            width: CABINET_DOOR_HINGE_MARKER_WIDTH,
            height: CABINET_DOOR_HINGE_MARKER_HEIGHT,
            depth: CABINET_DOOR_HINGE_MARKER_DEPTH,
          },
          "hardware_metal",
          {
            role: "door_hinge_pair",
            frontPartId: hinge.frontPartId,
            doorIndex: hinge.doorIndex + 1,
            hingeIndex: hinge.hingeIndex + 1,
            hingeCountPerDoor: hinge.hingeCountPerDoor,
            hingeInsetFromTopBottom: getCabinetDoorHingeInsetFromTopBottom(module),
            swingSide: hinge.swingSide,
          },
          CABINET_DOOR_HINGE_SKU_ID
        )
      );
    }
  }

  if (hasCabinetDrawerSlides(module)) {
    const drawerSlideLength = getCabinetDrawerSlideLength(module);
    const drawerSlideClearance = getCabinetDrawerSlideClearance(module);
    for (const slide of getCabinetDrawerSlideLayouts(definition, module)) {
      parts.push(
        part(
          module.id,
          "drawer_slide_pair",
          slide.frontKey,
          {
            x: x(slide.localX),
            y: slide.localY,
            z: z(slide.localZ),
          },
          {
            width: slide.width,
            height: CABINET_DRAWER_SLIDE_PAIR_HEIGHT,
            depth: drawerSlideLength,
          },
          "hardware_metal",
          {
            role: "drawer_slide_pair",
            frontPartId: slide.frontPartId,
            drawerIndex: slide.drawerIndex + 1,
            drawerSlideLength,
            drawerSlideClearance,
          },
          CABINET_DRAWER_SLIDE_SKU_ID
        )
      );
    }
  }

  return parts.filter((candidate) =>
    candidate.size.width > 0 && candidate.size.height > 0 && candidate.size.depth > 0
  );
}

function generateAssemblyFitParts(definition: CabinetDefinition): CabinetPart[] {
  const firstModule = definition.modules[0];
  const lastModule = definition.modules[definition.modules.length - 1];
  if (!firstModule || !lastModule) return [];

  const parts: CabinetPart[] = [];
  const countertopThickness = getCabinetCountertopThickness(definition);
  const countertopOverhangLeft = getCabinetCountertopOverhangLeft(definition);
  const countertopOverhangFront = getCabinetCountertopOverhangFront(definition);
  const countertopOverhangBack = getCabinetCountertopOverhangBack(definition);
  const backsplashHeight = getCabinetBacksplashHeight(definition);
  const backsplashThickness = getCabinetBacksplashThickness(definition);
  const moduleFrontOffset = getCabinetModuleFrontOffset(definition);
  const leftFillerWidth = getCabinetLeftFillerWidth(definition);
  const rightFillerWidth = getCabinetRightFillerWidth(definition);
  const leftFillerScribeAllowance = getCabinetLeftFillerScribeAllowance(definition);
  const rightFillerScribeAllowance = getCabinetRightFillerScribeAllowance(definition);
  const leftEndPanelThickness = getCabinetLeftEndPanelThickness(definition);
  const rightEndPanelThickness = getCabinetRightEndPanelThickness(definition);
  const moduleStartX = getCabinetModuleStartOffset(definition);
  const moduleRunWidth = getCabinetModuleRunWidth(definition);
  const moduleRunDepth = getCabinetModuleRunDepth(definition);
  const rightEndPanelX = moduleStartX + moduleRunWidth;
  const rightFillerX = rightEndPanelX + rightEndPanelThickness;
  const moduleRunHeight = getCabinetModuleRunHeight(definition);
  const overallWidth = getCabinetOverallWidth(definition);

  if (definition.includeCountertop && countertopThickness > 0) {
    parts.push(
      part(
        firstModule.id,
        "countertop",
        "0",
        { x: 0, y: moduleRunHeight, z: moduleFrontOffset - countertopOverhangFront },
        {
          width: overallWidth,
          height: countertopThickness,
          depth:
            countertopOverhangFront +
            moduleRunDepth +
            countertopOverhangBack,
        },
        definition.countertopMaterialId ?? firstModule.frontMaterialId ?? firstModule.materialId,
        {
          overhangLeft: countertopOverhangLeft,
          overhangRight: getCabinetCountertopOverhangRight(definition),
          overhangFront: countertopOverhangFront,
          overhangBack: countertopOverhangBack,
          role: "worktop",
        }
      )
    );
  }

  if (definition.includeBacksplash && backsplashHeight > 0 && backsplashThickness > 0) {
    parts.push(
      part(
        firstModule.id,
        "backsplash",
        "rear",
        {
          x: 0,
          y: moduleRunHeight + countertopThickness,
          z: moduleFrontOffset + moduleRunDepth + countertopOverhangBack - backsplashThickness,
        },
        {
          width: overallWidth,
          height: backsplashHeight,
          depth: backsplashThickness,
        },
        definition.backsplashMaterialId ??
          definition.countertopMaterialId ??
          firstModule.frontMaterialId ??
          firstModule.materialId,
        {
          role: "backsplash_upstand",
          height: backsplashHeight,
          thickness: backsplashThickness,
          countertopOverhangBack,
        }
      )
    );
  }

  if (hasCabinetIslandSeating(definition)) {
    const islandSeatingOverhangDepth = getCabinetIslandSeatingOverhangDepth(definition);
    const supportPanelThickness = getCabinetIslandSupportPanelThickness(definition);
    const supportPanelDepth = getCabinetIslandSupportPanelDepth(definition);
    const supportPanelMaterialId = definition.countertopMaterialId ?? firstModule.frontMaterialId ?? firstModule.materialId;
    const supportPanelZ =
      moduleFrontOffset +
      moduleRunDepth +
      Math.max(0, (islandSeatingOverhangDepth - supportPanelDepth) / 2);

    for (const [index, supportPanelX] of getCabinetIslandSupportPanelLocalXPositions(definition, overallWidth).entries()) {
      parts.push(
        part(
          firstModule.id,
          "island_overhang_support_panel",
          String(index + 1),
          { x: supportPanelX, y: 0, z: supportPanelZ },
          {
            width: supportPanelThickness,
            height: moduleRunHeight,
            depth: supportPanelDepth,
          },
          supportPanelMaterialId,
          {
            role: "island_seating_overhang_support",
            supportPanelIndex: index + 1,
            seatingOverhangDepth: islandSeatingOverhangDepth,
          }
        )
      );
    }
  }

  if (leftFillerWidth > 0) {
    parts.push(
      part(
        firstModule.id,
        "filler",
        "left",
        { x: countertopOverhangLeft - leftFillerScribeAllowance, y: 0, z: moduleFrontOffset - CABINET_FRONT_THICKNESS },
        { width: leftFillerWidth + leftFillerScribeAllowance, height: firstModule.height, depth: CABINET_FRONT_THICKNESS },
        firstModule.frontMaterialId ?? firstModule.materialId,
        {
          side: "left",
          role: "scribe_filler",
          installedWidth: leftFillerWidth,
          scribeAllowance: leftFillerScribeAllowance,
          cutWidth: leftFillerWidth + leftFillerScribeAllowance,
        }
      )
    );
  }

  if (leftEndPanelThickness > 0) {
    parts.push(
      part(
        firstModule.id,
        "end_panel",
        "left",
        { x: countertopOverhangLeft + leftFillerWidth, y: 0, z: moduleFrontOffset },
        { width: leftEndPanelThickness, height: firstModule.height, depth: firstModule.depth },
        firstModule.frontMaterialId ?? firstModule.materialId,
        { side: "left", role: "finished_end_panel", thickness: leftEndPanelThickness }
      )
    );
  }

  if (rightEndPanelThickness > 0) {
    parts.push(
      part(
        lastModule.id,
        "end_panel",
        "right",
        { x: rightEndPanelX, y: 0, z: moduleFrontOffset },
        { width: rightEndPanelThickness, height: lastModule.height, depth: lastModule.depth },
        lastModule.frontMaterialId ?? lastModule.materialId,
        { side: "right", role: "finished_end_panel", thickness: rightEndPanelThickness }
      )
    );
  }

  if (rightFillerWidth > 0) {
    parts.push(
      part(
        lastModule.id,
        "filler",
        "right",
        { x: rightFillerX, y: 0, z: moduleFrontOffset - CABINET_FRONT_THICKNESS },
        { width: rightFillerWidth + rightFillerScribeAllowance, height: lastModule.height, depth: CABINET_FRONT_THICKNESS },
        lastModule.frontMaterialId ?? lastModule.materialId,
        {
          side: "right",
          role: "scribe_filler",
          installedWidth: rightFillerWidth,
          scribeAllowance: rightFillerScribeAllowance,
          cutWidth: rightFillerWidth + rightFillerScribeAllowance,
        }
      )
    );
  }

  return parts;
}

export function generateCabinetParts(definition: CabinetDefinition): CabinetPart[] {
  let moduleOffsetX = getCabinetModuleStartOffset(definition);
  const moduleOffsetZ = getCabinetModuleFrontOffset(definition);
  const parts: CabinetPart[] = generateAssemblyFitParts(definition);

  for (const cabinetModule of definition.modules) {
    parts.push(...generateModuleParts(definition, cabinetModule, moduleOffsetX, moduleOffsetZ));
    moduleOffsetX += cabinetModule.width;
  }

  return parts;
}
