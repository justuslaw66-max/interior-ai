import type { CabinetDefinition } from "./types";
import { getCabinetHangingRodCenterHeights } from "./hangingRodLayout";
import { getCabinetSlatLocalXPositions, getCabinetSlatWidth } from "./slatLayout";
import {
  getCabinetPanelFrameWidth,
  getCabinetPanelRailLocalYPositions,
  getCabinetPanelStileLocalXPositions,
} from "./panelLayout";
import {
  getCabinetCeilingBeamArrayLocalPositions,
  getCabinetCeilingBeamOrientation,
  getCabinetCeilingBeamWidth,
  getCabinetCeilingGridColumnBeamXPositions,
  getCabinetCeilingGridRowBeamZPositions,
  isCabinetCeilingBeamArray,
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
  isCabinetTrimRun,
} from "./trimLayout";
import {
  CABINET_DEFAULT_HINGE_RAIL_HEIGHT,
  getCabinetConvertibleHingeHeight,
  getCabinetConvertibleOpenDepth,
  getCabinetConvertiblePanelHeight,
  getCabinetConvertiblePanelThickness,
  isCabinetConvertibleComponent,
} from "./convertibleLayout";
import {
  getCabinetPlatformDeckDepth,
  getCabinetPlatformDeckOverhangFront,
  getCabinetPlatformSupportRibLocalZPositions,
  getCabinetPlatformSupportRibWidth,
  hasCabinetPlatformDeck,
} from "./platformBedLayout";
import {
  getCabinetStairScribeDepth,
  getCabinetStairScribePanelLayouts,
  hasCabinetStairScribe,
} from "./stairScribeLayout";
import {
  getCabinetRoomDividerBackPanelLayouts,
  getCabinetRoomDividerBackPanelThickness,
  getCabinetRoomDividerStabilizerFootDepth,
  getCabinetRoomDividerStabilizerFootHeight,
  getCabinetRoomDividerStabilizerFootLayouts,
  hasCabinetRoomDividerDetails,
} from "./roomDividerLayout";
import {
  getCabinetLifestyleInsertDeckHeight,
  getCabinetLifestyleInsertDepth,
  getCabinetLifestyleInsertLayouts,
  getCabinetLifestyleInsertLipHeight,
  hasCabinetLifestyleInsert,
} from "./lifestyleInsertLayout";
import {
  getCabinetWineRackDepth,
  getCabinetWineRackDividerThickness,
  getCabinetWineRackHorizontalRailLocalYPositions,
  getCabinetWineRackOpeningHeight,
  getCabinetWineRackOpeningWidth,
  getCabinetWineRackVerticalDividerLocalXPositions,
  hasCabinetWineRack,
} from "./wineRackLayout";
import {
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
  CABINET_MUDROOM_HOOK_WIDTH,
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
  getCabinetCountertopThickness,
  getCabinetModuleFrontOffset,
  getCabinetModuleRunDepth,
  getCabinetModuleRunHeight,
  getCabinetOverallWidth,
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
  getCabinetLaundryApplianceDepth,
  getCabinetLaundryApplianceHeight,
  getCabinetLaundryApplianceLocalXPositions,
  getCabinetLaundryApplianceWidth,
  getCabinetLaundryUtilityChaseDepth,
  getCabinetLaundryUtilityChaseHeight,
  getCabinetLaundryUtilityChaseLocalZ,
  hasCabinetLaundryApplianceBay,
} from "./laundryApplianceLayout";
import {
  getCabinetCableGrommetDiameter,
  getCabinetCableGrommetLocalXPositions,
  getCabinetCableGrommetLocalZ,
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
  getCabinetPantryPullOutOpeningWidth,
  getCabinetPantryPullOutOpeningX,
  getCabinetPantryPullOutTrayDepth,
  getCabinetPantryPullOutTrayFrontHeight,
  getCabinetPantryPullOutTrayLocalYPositions,
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
  getCabinetMediaTvOpeningHeight,
  getCabinetMediaTvOpeningWidth,
  getCabinetMediaVentSlotHeight,
  getCabinetMediaVentSlotLocalXPositions,
  getCabinetMediaVentSlotLocalY,
  getCabinetMediaVentSlotWidth,
  hasCabinetMediaWallDetails,
} from "./mediaWallLayout";
import {
  getCabinetLibraryLadderRailDiameter,
  getCabinetLibraryLadderRailHeight,
  getCabinetLibraryLadderRailProjection,
  getCabinetLibraryLadderStandoffDiameter,
  getCabinetLibraryLadderStandoffLocalXPositions,
  hasCabinetLibraryLadderRail,
} from "./libraryLadderLayout";
import {
  CABINET_DEFAULT_STEMWARE_RACK_RAIL_HEIGHT,
  getCabinetStemwareRackDepth,
  getCabinetStemwareRackLocalY,
  getCabinetStemwareRackLocalZ,
  getCabinetStemwareRackRailLocalXPositions,
  getCabinetStemwareRackRailWidth,
  hasCabinetStemwareRack,
} from "./stemwareRackLayout";
import {
  getCabinetLightingChannelDepth,
  getCabinetLightingChannelHeight,
  getCabinetLightingChannelLocalX,
  getCabinetLightingChannelLocalYPositions,
  getCabinetLightingChannelLocalZ,
  getCabinetLightingChannelWidth,
  hasCabinetLightingChannels,
} from "./lightingLayout";
import {
  getCabinetHamperBasketDepth,
  getCabinetHamperBasketHeight,
  getCabinetHamperBasketLayouts,
  getCabinetHamperOpeningY,
  hasCabinetHamperPullOut,
} from "./hamperPullOutLayout";
import {
  CABINET_SHELF_PIN_ROW_MARKER_DEPTH,
  CABINET_SHELF_PIN_ROW_MARKER_WIDTH,
  getCabinetShelfPinRowHeight,
  getCabinetShelfPinRowLayouts,
  getCabinetShelfPinStartHeight,
  hasCabinetShelfPinRows,
} from "./shelfPinLayout";
import {
  CABINET_DOOR_HINGE_MARKER_DEPTH,
  CABINET_DOOR_HINGE_MARKER_HEIGHT,
  CABINET_DOOR_HINGE_MARKER_WIDTH,
  getCabinetDoorHingeLayouts,
  hasCabinetDoorHinges,
} from "./doorHingeLayout";
import {
  CABINET_DRAWER_SLIDE_PAIR_HEIGHT,
  getCabinetDrawerSlideLayouts,
  getCabinetDrawerSlideLength,
  hasCabinetDrawerSlides,
} from "./drawerSlideLayout";
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
  CABINET_ANTI_TIP_ANCHOR_WIDTH,
  getCabinetAntiTipAnchorLayouts,
  hasCabinetAntiTipAnchors,
} from "./antiTipAnchorLayout";
import {
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

const SHEET_WIDTH = 1400;
const SHEET_HEIGHT = 1000;
const MARGIN = 48;

function fileSafeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "millwork";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  className: string,
  extra = ""
): string {
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" class="${className}" ${extra}/>`;
}

function line(x1: number, y1: number, x2: number, y2: number, className: string): string {
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${className}"/>`;
}

function text(x: number, y: number, value: string, className = "label"): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="${className}">${escapeXml(value)}</text>`;
}

function trimPlacementLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function dimensionLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  label: string,
  orientation: "horizontal" | "vertical"
): string {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const textTransform =
    orientation === "vertical" ? ` transform="rotate(-90 ${midX.toFixed(1)} ${midY.toFixed(1)})"` : "";

  return [
    line(x1, y1, x2, y2, "dimension"),
    orientation === "horizontal"
      ? line(x1, y1 - 5, x1, y1 + 5, "dimension")
      : line(x1 - 5, y1, x1 + 5, y1, "dimension"),
    orientation === "horizontal"
      ? line(x2, y2 - 5, x2, y2 + 5, "dimension")
      : line(x2 - 5, y2, x2 + 5, y2, "dimension"),
    `<text x="${midX.toFixed(1)}" y="${(midY - 8).toFixed(1)}" class="dimension-label"${textTransform}>${escapeXml(label)}</text>`,
  ].join("\n");
}

function titleBlock(definition: CabinetDefinition): string {
  const assembly = definition.millworkAssemblyType ?? "cabinet";
  return [
    rect(980, 830, 360, 110, "title-block"),
    text(1000, 858, "CUSTOM MILLWORK SHOP DRAWING", "title"),
    text(1000, 884, definition.name, "label strong"),
    text(1000, 908, `Definition: ${definition.id}`, "small"),
    text(1000, 928, `Assembly: ${assembly.replace(/_/g, " ")}`, "small"),
  ].join("\n");
}

function renderFrontElevation(definition: CabinetDefinition): string {
  const originX = MARGIN;
  const originY = 110;
  const maxWidth = 780;
  const maxHeight = 420;
  const scale = Math.min(maxWidth / definition.totalWidth, maxHeight / definition.height);
  const overallW = definition.totalWidth * scale;
  const overallH = definition.height * scale;
  const bottomY = originY + overallH;
  const backsplashHeight = getCabinetBacksplashHeight(definition) * scale;
  let offsetX = 0;
  const elements: string[] = [
    text(originX, originY - 34, "A-601 Overall Front Elevation", "view-title"),
    rect(originX, originY, overallW, overallH, "outline"),
  ];

  if (definition.includeBacksplash && backsplashHeight > 0) {
    elements.push(
      rect(
        originX,
        originY,
        overallW,
        backsplashHeight,
        "detail-fill",
        `data-backsplash-height="${getCabinetBacksplashHeight(definition)}" data-backsplash-thickness="${getCabinetBacksplashThickness(definition)}"`
      )
    );
    elements.push(
      text(
        originX + 6,
        originY + Math.max(14, backsplashHeight - 5),
        `backsplash/upstand ${getCabinetBacksplashHeight(definition)} mm high`,
        "small"
      )
    );
  }

  for (const [index, module] of definition.modules.entries()) {
    const x = originX + offsetX * scale;
    const w = module.width * scale;
    const h = module.height * scale;
    const y = bottomY - h;
    const innerX = x + definition.boardThickness * scale;
    const innerY = y + (definition.toeKickHeight + definition.boardThickness) * scale;
    const innerW = Math.max(1, w - definition.boardThickness * 2 * scale);
    const innerH = Math.max(1, h - (definition.toeKickHeight + definition.boardThickness * 2) * scale);
    elements.push(rect(x, y, w, h, "module"));
    elements.push(text(x + 8, y + 20, `M${index + 1}`, "small"));
    elements.push(rect(innerX, innerY, innerW, innerH, "opening"));

    if (hasCabinetFaceFrame(definition)) {
      for (const frame of getCabinetFaceFrameLayouts(definition, module)) {
        elements.push(
          rect(
            x + frame.localX * scale,
            bottomY - (frame.localY + frame.height) * scale,
            Math.max(2, frame.width * scale),
            Math.max(2, frame.height * scale),
            "detail-fill",
            `data-face-frame-role="${escapeXml(frame.role)}" data-face-frame-stile-width="${getCabinetFaceFrameStileWidth(definition)}" data-face-frame-rail-height="${getCabinetFaceFrameRailHeight(definition)}" data-face-frame-depth="${getCabinetFaceFrameDepth(definition)}"`
          )
        );
      }
    }

    if (hasCabinetInstallationCleat(module)) {
      const cleat = getCabinetInstallationCleatLayout(definition, module);
      if (cleat) {
        elements.push(
          rect(
            x + cleat.localX * scale,
            bottomY - (cleat.localY + cleat.height) * scale,
            cleat.width * scale,
            cleat.height * scale,
            "detail-fill"
          )
        );
      }
    }

    if (hasCabinetAntiTipAnchors(module)) {
      for (const anchor of getCabinetAntiTipAnchorLayouts(module)) {
        elements.push(
          rect(
            x + anchor.localX * scale,
            bottomY - (anchor.localY + CABINET_ANTI_TIP_ANCHOR_HEIGHT) * scale,
            Math.max(2, CABINET_ANTI_TIP_ANCHOR_WIDTH * scale),
            Math.max(2, CABINET_ANTI_TIP_ANCHOR_HEIGHT * scale),
            "detail"
          )
        );
      }
    }

    if (hasCabinetLevelingFeet(definition)) {
      const footDiameter = getCabinetLevelingFootDiameter(definition);
      const footHeight = getCabinetLevelingFootHeight(definition);
      for (const foot of getCabinetLevelingFootLayouts(definition, module)) {
        elements.push(
          rect(
            x + foot.localX * scale,
            bottomY - footHeight * scale,
            Math.max(2, footDiameter * scale),
            Math.max(2, footHeight * scale),
            "detail",
            `data-leveling-foot-index="${foot.footIndex + 1}" data-leveling-foot-height="${footHeight}" data-leveling-foot-diameter="${footDiameter}"`
          )
        );
      }
    }

    if (module.frontType === "drawer_stack" && module.drawerCount > 0) {
      const drawerH = innerH / module.drawerCount;
      for (let i = 1; i < module.drawerCount; i += 1) {
        elements.push(line(innerX, innerY + drawerH * i, innerX + innerW, innerY + drawerH * i, "detail"));
      }
    }

    if (hasCabinetDrawerBoxes(module)) {
      for (const box of getCabinetDrawerBoxLayouts(definition, module)) {
        elements.push(
          rect(
            x + box.localX * scale,
            bottomY - (box.localY + box.height) * scale,
            box.width * scale,
            box.height * scale,
            "detail"
          )
        );
      }
    }

    if (hasCabinetDrawerSlides(module)) {
      for (const slide of getCabinetDrawerSlideLayouts(definition, module)) {
        elements.push(
          rect(
            x + slide.localX * scale,
            bottomY - (slide.localY + CABINET_DRAWER_SLIDE_PAIR_HEIGHT) * scale,
            slide.width * scale,
            Math.max(2, CABINET_DRAWER_SLIDE_PAIR_HEIGHT * scale),
            "detail-fill"
          )
        );
      }
    }

    if (module.frontType === "double_door" || module.frontType === "door_and_drawer") {
      elements.push(line(innerX + innerW / 2, innerY, innerX + innerW / 2, innerY + innerH, "detail"));
    }

    if (hasCabinetDoorHinges(module)) {
      for (const hinge of getCabinetDoorHingeLayouts(definition, module)) {
        elements.push(
          rect(
            x + hinge.localX * scale,
            bottomY - (hinge.localY + CABINET_DOOR_HINGE_MARKER_HEIGHT) * scale,
            Math.max(2, CABINET_DOOR_HINGE_MARKER_WIDTH * scale),
            Math.max(2, CABINET_DOOR_HINGE_MARKER_HEIGHT * scale),
            "detail-fill"
          )
        );
      }
    }

    if (module.shelfCount > 0 && module.frontType === "open") {
      const shelfGap = innerH / (module.shelfCount + 1);
      for (let i = 1; i <= module.shelfCount; i += 1) {
        elements.push(line(innerX, innerY + shelfGap * i, innerX + innerW, innerY + shelfGap * i, "shelf"));
      }
    }

    if ((module.slatCount ?? 0) > 0) {
      const slatWidth = getCabinetSlatWidth(module) * scale;
      for (const localX of getCabinetSlatLocalXPositions(module)) {
        elements.push(rect(x + localX * scale, y, slatWidth, h, "detail-fill"));
      }
    }

    if (hasCabinetWineRack(module)) {
      const rackOpeningX = definition.boardThickness + definition.revealGap;
      const rackOpeningY = definition.toeKickHeight + definition.boardThickness + definition.revealGap;
      const rackOpeningWidth = getCabinetWineRackOpeningWidth(module, definition.boardThickness, definition.revealGap);
      const rackOpeningHeight = getCabinetWineRackOpeningHeight(
        module,
        definition.boardThickness,
        definition.toeKickHeight,
        definition.revealGap
      );
      const dividerThickness = getCabinetWineRackDividerThickness(module);
      const rackTopY = bottomY - (rackOpeningY + rackOpeningHeight) * scale;
      elements.push(
        rect(
          x + rackOpeningX * scale,
          rackTopY,
          rackOpeningWidth * scale,
          rackOpeningHeight * scale,
          "outline"
        )
      );
      for (const localX of getCabinetWineRackVerticalDividerLocalXPositions(module, definition.boardThickness, definition.revealGap)) {
        elements.push(
          rect(
            x + localX * scale,
            rackTopY,
            dividerThickness * scale,
            rackOpeningHeight * scale,
            "detail-fill"
          )
        );
      }
      for (const localY of getCabinetWineRackHorizontalRailLocalYPositions(module, definition.boardThickness, definition.toeKickHeight, definition.revealGap)) {
        elements.push(
          rect(
            x + rackOpeningX * scale,
            bottomY - (localY + dividerThickness) * scale,
            rackOpeningWidth * scale,
            dividerThickness * scale,
            "detail-fill"
          )
        );
      }
    }

    if (hasCabinetPantryPullOuts(module)) {
      const trayOpeningX = getCabinetPantryPullOutOpeningX(definition, module) * scale;
      const trayOpeningWidth = getCabinetPantryPullOutOpeningWidth(definition, module) * scale;
      const trayFrontHeight = getCabinetPantryPullOutTrayFrontHeight(module) * scale;
      for (const localY of getCabinetPantryPullOutTrayLocalYPositions(definition, module)) {
        elements.push(
          rect(
            x + trayOpeningX,
            bottomY - (localY + getCabinetPantryPullOutTrayFrontHeight(module)) * scale,
            trayOpeningWidth,
            trayFrontHeight,
            "detail-fill"
          )
        );
      }
    }

    if (hasCabinetSeatingDetails(module)) {
      const deckThickness = getCabinetSeatDeckThickness(module) * scale;
      const cushionThickness = getCabinetSeatCushionThickness(module) * scale;
      const deckTopY = bottomY - (module.height + getCabinetSeatDeckThickness(module)) * scale;
      const cushionTopY = bottomY - (module.height + getCabinetSeatDeckThickness(module) + getCabinetSeatCushionThickness(module)) * scale;
      if (deckThickness > 0) {
        elements.push(rect(x, deckTopY, w, deckThickness, "detail-fill"));
      }
      if (cushionThickness > 0) {
        elements.push(rect(x, cushionTopY, w, cushionThickness, "detail"));
      }
      if (hasCabinetSeatBack(module)) {
        const backHeight = getCabinetSeatBackHeight(module) * scale;
        const backTopY = bottomY - (module.height + getCabinetSeatDeckThickness(module) + getCabinetSeatBackHeight(module)) * scale;
        elements.push(rect(x, backTopY, w, backHeight, "detail-fill"));
      }
    }

    if (hasCabinetMudroomHooks(module)) {
      const railCenterHeight = getCabinetMudroomHookRailHeight(module);
      const railY = bottomY - (railCenterHeight + CABINET_MUDROOM_HOOK_RAIL_HEIGHT / 2) * scale;
      elements.push(rect(x, railY, w, CABINET_MUDROOM_HOOK_RAIL_HEIGHT * scale, "detail-fill"));
      for (const localX of getCabinetMudroomHookLocalXPositions(module)) {
        elements.push(
          rect(
            x + localX * scale,
            bottomY - (railCenterHeight + CABINET_MUDROOM_HOOK_HEIGHT / 2) * scale,
            CABINET_MUDROOM_HOOK_WIDTH * scale,
            CABINET_MUDROOM_HOOK_HEIGHT * scale,
            "detail"
          )
        );
      }
    }

    if (hasCabinetShoeCubbies(module)) {
      const openingX = getCabinetShoeCubbyOpeningX(definition);
      const openingY = getCabinetShoeCubbyOpeningY(definition);
      const cubbyHeight = getCabinetShoeCubbyHeight(module);
      const dividerThickness = getCabinetShoeCubbyDividerThickness(module);
      const openingWidth = getCabinetShoeCubbyOpeningWidth(definition, module);
      const cubbyTopY = bottomY - (openingY + cubbyHeight) * scale;
      elements.push(rect(x + openingX * scale, cubbyTopY, openingWidth * scale, cubbyHeight * scale, "outline"));
      for (const localX of getCabinetShoeCubbyVerticalDividerLocalXPositions(definition, module)) {
        elements.push(
          rect(
            x + localX * scale,
            cubbyTopY,
            dividerThickness * scale,
            cubbyHeight * scale,
            "detail-fill"
          )
        );
      }
      elements.push(
        rect(
          x + openingX * scale,
          bottomY - (openingY + cubbyHeight + dividerThickness) * scale,
          openingWidth * scale,
          dividerThickness * scale,
          "detail-fill"
        )
      );
    }

    if (hasCabinetSinkCutout(module) && definition.includeCountertop) {
      elements.push(
        rect(
          x + getCabinetSinkCutoutLocalX(module) * scale,
          bottomY - (module.height + getCabinetCountertopThickness(definition)) * scale,
          getCabinetSinkCutoutWidth(module) * scale,
          Math.max(2, getCabinetCountertopThickness(definition) * scale),
          "detail"
        )
      );
    }

    if (hasCabinetPlumbingChase(module)) {
      const chaseHeight = getCabinetPlumbingChaseHeight(definition, module);
      elements.push(
        rect(
          x + getCabinetPlumbingChaseLocalX(module) * scale,
          bottomY - (definition.toeKickHeight + chaseHeight) * scale,
          getCabinetPlumbingChaseWidth(module) * scale,
          chaseHeight * scale,
          "detail-fill"
        )
      );
    }

    if (hasCabinetLaundryApplianceBay(module)) {
      const applianceWidth = getCabinetLaundryApplianceWidth(module) * scale;
      const applianceHeight = getCabinetLaundryApplianceHeight(module) * scale;
      for (const localX of getCabinetLaundryApplianceLocalXPositions(module)) {
        elements.push(rect(x + localX * scale, bottomY - applianceHeight, applianceWidth, applianceHeight, "detail"));
      }
      elements.push(
        rect(
          x,
          bottomY - getCabinetLaundryUtilityChaseHeight(module) * scale,
          w,
          getCabinetLaundryUtilityChaseHeight(module) * scale,
          "detail-fill"
        )
      );
    }

    if (hasCabinetOfficeWorkstation(module)) {
      const worksurfaceThickness = getCabinetOfficeWorksurfaceThickness(module) * scale;
      elements.push(rect(x, bottomY - (module.height + getCabinetOfficeWorksurfaceThickness(module)) * scale, w, worksurfaceThickness, "detail-fill"));
      elements.push(
        rect(
          x,
          bottomY - getCabinetDeskPowerChaseHeight(module) * scale,
          w,
          getCabinetDeskPowerChaseHeight(module) * scale,
          "detail"
        )
      );
    }

    if (hasCabinetMediaWallDetails(module)) {
      elements.push(
        rect(
          x + getCabinetMediaTvBlockingLocalX(module) * scale,
          bottomY - (getCabinetMediaTvBlockingLocalY(definition, module) + getCabinetMediaTvOpeningHeight(module)) * scale,
          getCabinetMediaTvOpeningWidth(module) * scale,
          getCabinetMediaTvOpeningHeight(module) * scale,
          "detail-fill"
        )
      );
      elements.push(
        rect(
          x + getCabinetMediaCableChaseLocalX(module) * scale,
          bottomY - (getCabinetMediaCableChaseLocalY(definition, module) + getCabinetMediaCableChaseHeight(module)) * scale,
          getCabinetMediaCableChaseWidth(module) * scale,
          getCabinetMediaCableChaseHeight(module) * scale,
          "detail"
        )
      );
      const ventSlotY = bottomY - (getCabinetMediaVentSlotLocalY(definition, module) + getCabinetMediaVentSlotHeight(module)) * scale;
      for (const localX of getCabinetMediaVentSlotLocalXPositions(module)) {
        elements.push(
          rect(
            x + localX * scale,
            ventSlotY,
            getCabinetMediaVentSlotWidth(module) * scale,
            getCabinetMediaVentSlotHeight(module) * scale,
            "opening"
          )
        );
      }
    }

    if (hasCabinetLibraryLadderRail(module)) {
      const railDiameter = getCabinetLibraryLadderRailDiameter(module);
      const railY = bottomY - (getCabinetLibraryLadderRailHeight(module) + railDiameter / 2) * scale;
      elements.push(rect(x, railY, w, Math.max(2, railDiameter * scale), "detail-fill"));
      for (const localX of getCabinetLibraryLadderStandoffLocalXPositions(module)) {
        elements.push(
          rect(
            x + localX * scale,
            railY,
            getCabinetLibraryLadderStandoffDiameter(module) * scale,
            Math.max(2, railDiameter * scale),
            "detail"
          )
        );
      }
    }

    if (hasCabinetStemwareRack(module)) {
      const railY = bottomY - (getCabinetStemwareRackLocalY(module) + CABINET_DEFAULT_STEMWARE_RACK_RAIL_HEIGHT) * scale;
      for (const localX of getCabinetStemwareRackRailLocalXPositions(module)) {
        elements.push(
          rect(
            x + localX * scale,
            railY,
            getCabinetStemwareRackRailWidth(module) * scale,
            Math.max(2, CABINET_DEFAULT_STEMWARE_RACK_RAIL_HEIGHT * scale),
            "detail-fill"
          )
        );
      }
    }

    if (hasCabinetLightingChannels(module)) {
      const channelHeight = Math.max(2, getCabinetLightingChannelHeight(module) * scale);
      const channelX = x + getCabinetLightingChannelLocalX(definition) * scale;
      const channelWidth = getCabinetLightingChannelWidth(definition, module) * scale;
      for (const localY of getCabinetLightingChannelLocalYPositions(definition, module)) {
        elements.push(
          rect(
            channelX,
            bottomY - (localY + getCabinetLightingChannelHeight(module)) * scale,
            channelWidth,
            channelHeight,
            "detail"
          )
        );
      }
    }

    if (hasCabinetShelfPinRows(module)) {
      const rowHeight = getCabinetShelfPinRowHeight(module);
      const rowY = bottomY - (getCabinetShelfPinStartHeight(module) + rowHeight) * scale;
      for (const row of getCabinetShelfPinRowLayouts(definition, module)) {
        elements.push(
          rect(
            x + row.localX * scale,
            rowY,
            Math.max(2, CABINET_SHELF_PIN_ROW_MARKER_WIDTH * scale),
            Math.max(2, rowHeight * scale),
            "detail"
          )
        );
      }
    }

    if (hasCabinetHamperPullOut(module)) {
      const basketHeight = getCabinetHamperBasketHeight(module) * scale;
      const basketY = bottomY - (getCabinetHamperOpeningY(definition) + getCabinetHamperBasketHeight(module)) * scale;
      for (const basket of getCabinetHamperBasketLayouts(definition, module)) {
        elements.push(rect(x + basket.localX * scale, basketY, basket.width * scale, basketHeight, "detail"));
      }
    }

    if ((module.panelColumnCount ?? 0) > 0 || (module.panelRowCount ?? 0) > 0) {
      const panelFrameWidth = getCabinetPanelFrameWidth(module) * scale;
      for (const localX of getCabinetPanelStileLocalXPositions(module)) {
        elements.push(rect(x + localX * scale, y, panelFrameWidth, h, "detail-fill"));
      }
      for (const localY of getCabinetPanelRailLocalYPositions(module)) {
        elements.push(
          rect(
            x,
            y + (module.height - localY - getCabinetPanelFrameWidth(module)) * scale,
            w,
            panelFrameWidth,
            "detail-fill"
          )
        );
      }
    }

    if (isCabinetTrimRun(module)) {
      const memberCount = getCabinetTrimMemberCount(module);
      const orientation = getCabinetTrimOrientation(module);
      const profileWidthMm = getCabinetTrimProfileWidth(module);
      const profileDepthMm = getCabinetTrimProfileDepth(module);
      const setoutHeight = getCabinetTrimSetoutHeight(module);
      const placement = getCabinetTrimPlacement(module);
      const memberLength = (orientation === "x" ? module.width : module.depth) / memberCount;
      const trimTopY = bottomY - (setoutHeight + profileWidthMm) * scale;
      const trimHeight = Math.max(2, profileWidthMm * scale);
      const frontLabel = `${trimPlacementLabel(placement)} trim setout ${setoutHeight} mm`;

      if (orientation === "x") {
        for (let memberIndex = 0; memberIndex < memberCount; memberIndex += 1) {
          elements.push(
            rect(
              x + memberIndex * memberLength * scale,
              trimTopY,
              memberLength * scale,
              trimHeight,
              "detail-fill",
              `data-trim-placement="${escapeXml(placement)}" data-trim-setout="${setoutHeight}"`
            )
          );
        }
      } else {
        elements.push(
          rect(
            x,
            trimTopY,
            Math.max(2, profileDepthMm * scale),
            trimHeight,
            "detail-fill",
            `data-trim-placement="${escapeXml(placement)}" data-trim-setout="${setoutHeight}"`
          )
        );
      }

      for (const trimReturn of getCabinetTrimReturnLayouts(module)) {
        elements.push(
          rect(
            x + trimReturn.localX * scale,
            bottomY - (trimReturn.localY + trimReturn.height) * scale,
            Math.max(2, trimReturn.width * scale),
            Math.max(2, trimReturn.height * scale),
            "detail",
            `data-trim-return-side="${escapeXml(trimReturn.side)}" data-trim-end-treatment="${escapeXml(trimReturn.endTreatment)}" data-trim-miter-angle="${trimReturn.miterAngle}"`
          )
        );
      }

      if (hasCabinetTrimRevealStrip(module)) {
        const revealStripHeight = getCabinetTrimRevealStripHeight(module);
        const revealStripDepth = getCabinetTrimRevealStripDepth(module);
        const revealStripInsetFromTop = getCabinetTrimRevealStripInsetFromTop(module);
        for (const strip of getCabinetTrimRevealStripLayouts(module)) {
          elements.push(
            rect(
              x + strip.localX * scale,
              bottomY - (strip.localY + strip.height) * scale,
              Math.max(2, strip.width * scale),
              Math.max(2, strip.height * scale),
              "detail",
              `data-trim-reveal-strip="true" data-trim-reveal-height="${revealStripHeight}" data-trim-reveal-depth="${revealStripDepth}" data-trim-reveal-inset-from-top="${revealStripInsetFromTop}"`
            )
          );
        }
      }

      elements.push(text(x + 6, Math.max(originY + 12, trimTopY - 5), frontLabel, "small"));
    }

    if (isCabinetFireplaceSurroundFrame(module)) {
      const legWidth = getCabinetFireplaceLegWidth(module) * scale;
      const openingWidth = getCabinetFireplaceOpeningWidth(module) * scale;
      const openingHeight = getCabinetFireplaceOpeningHeight(module) * scale;
      const headerHeight = getCabinetFireplaceHeaderHeight(module) * scale;
      const mantelHeight = getCabinetFireplaceMantelHeight(module) * scale;
      const frameStartX = x + getCabinetFireplaceFrameStartX(module) * scale;
      const openingX = frameStartX + legWidth;
      const frameOuterWidth = getCabinetFireplaceFrameOuterWidth(module) * scale;
      const openingTopY = bottomY - openingHeight;
      const headerTopY = openingTopY - headerHeight;
      const mantelTopY = headerTopY - mantelHeight;

      elements.push(rect(frameStartX, openingTopY, legWidth, openingHeight, "detail-fill"));
      elements.push(rect(openingX + openingWidth, openingTopY, legWidth, openingHeight, "detail-fill"));
      elements.push(rect(frameStartX, headerTopY, frameOuterWidth, headerHeight, "detail-fill"));
      elements.push(rect(x, mantelTopY, w, mantelHeight, "detail-fill"));
      elements.push(rect(openingX, openingTopY, openingWidth, openingHeight, "opening"));
    }

    if (isCabinetConvertibleComponent(module)) {
      const panelHeight = getCabinetConvertiblePanelHeight(module) * scale;
      const panelThickness = getCabinetConvertiblePanelThickness(module) * scale;
      const hingeHeight = getCabinetConvertibleHingeHeight(module) * scale;
      const panelY = bottomY - panelHeight;
      const hingeY = bottomY - hingeHeight;
      elements.push(rect(x, panelY, w, panelHeight, "detail-fill"));
      elements.push(rect(x, hingeY - (CABINET_DEFAULT_HINGE_RAIL_HEIGHT * scale) / 2, w, Math.max(2, panelThickness), "detail"));
    }

    if (hasCabinetStairScribe(module)) {
      for (const panel of getCabinetStairScribePanelLayouts(module)) {
        elements.push(
          rect(
            x + panel.localX * scale,
            bottomY - panel.topHeight * scale,
            panel.width * scale,
            panel.height * scale,
            "detail-fill"
          )
        );
      }
    }

    if (hasCabinetLifestyleInsert(module)) {
      const insertDeckHeight = getCabinetLifestyleInsertDeckHeight(module) * scale;
      const insertLipHeight = getCabinetLifestyleInsertLipHeight(module) * scale;
      const insertY = bottomY - (definition.toeKickHeight + definition.boardThickness + getCabinetLifestyleInsertDeckHeight(module) + getCabinetLifestyleInsertLipHeight(module)) * scale;
      for (const insert of getCabinetLifestyleInsertLayouts(module, definition.boardThickness, definition.revealGap)) {
        elements.push(rect(x + insert.localX * scale, bottomY - (definition.toeKickHeight + definition.boardThickness + getCabinetLifestyleInsertDeckHeight(module)) * scale, insert.width * scale, Math.max(2, insertDeckHeight), "detail"));
        if (insertLipHeight > 0) {
          elements.push(rect(x + insert.localX * scale, insertY, insert.width * scale, insertLipHeight, "detail-fill"));
        }
      }
    }

    if ((module.verticalDividerCount ?? 0) > 0) {
      const dividerGap = innerW / ((module.verticalDividerCount ?? 0) + 1);
      for (let i = 1; i <= (module.verticalDividerCount ?? 0); i += 1) {
        elements.push(line(innerX + dividerGap * i, innerY, innerX + dividerGap * i, innerY + innerH, "detail"));
      }
    }

    for (const rodHeight of getCabinetHangingRodCenterHeights(definition, module)) {
      const rodY = bottomY - rodHeight * scale;
      if (rodY >= innerY && rodY <= innerY + innerH) {
        elements.push(line(innerX + 16, rodY, innerX + innerW - 16, rodY, "detail"));
      }
    }

    offsetX += module.width;
  }

  if (hasCabinetIslandSeating(definition)) {
    const supportPanelThickness = getCabinetIslandSupportPanelThickness(definition) * scale;
    const supportPanelHeight = getCabinetModuleRunHeight(definition) * scale;
    const supportPanelY = bottomY - supportPanelHeight;
    for (const localX of getCabinetIslandSupportPanelLocalXPositions(definition, getCabinetOverallWidth(definition))) {
      elements.push(
        rect(originX + localX * scale, supportPanelY, supportPanelThickness, supportPanelHeight, "detail")
      );
    }
  }

  elements.push(dimensionLine(originX, bottomY + 32, originX + overallW, bottomY + 32, `${definition.totalWidth} mm`, "horizontal"));
  elements.push(dimensionLine(originX + overallW + 32, originY, originX + overallW + 32, bottomY, `${definition.height} mm`, "vertical"));
  return elements.join("\n");
}

function renderSideSection(definition: CabinetDefinition): string {
  const originX = 930;
  const originY = 110;
  const maxWidth = 330;
  const maxHeight = 420;
  const scale = Math.min(maxWidth / definition.depth, maxHeight / definition.height);
  const w = definition.depth * scale;
  const h = definition.height * scale;
  const sectionModule = definition.modules[0];
  const toeKick = definition.toeKickHeight * scale;
  const toeKickSetback = sectionModule ? getCabinetToeKickSetback(definition) * scale : 0;
  const toeKickDepth = sectionModule ? getCabinetToeKickDepth(definition, sectionModule) * scale : 0;
  const backsplashHeight = getCabinetBacksplashHeight(definition) * scale;
  const backsplashThickness = getCabinetBacksplashThickness(definition) * scale;
  const board = definition.boardThickness * scale;
  const back = definition.backPanelThickness * scale;

  return [
    text(originX, originY - 34, "A-602 Typical Side Section", "view-title"),
    rect(originX, originY, w, h, "module"),
    definition.includeBacksplash && backsplashHeight > 0 && backsplashThickness > 0
      ? rect(
          originX + Math.max(0, w - backsplashThickness),
          originY,
          backsplashThickness,
          backsplashHeight,
          "detail-fill",
          `data-backsplash-height="${getCabinetBacksplashHeight(definition)}" data-backsplash-thickness="${getCabinetBacksplashThickness(definition)}"`
        )
      : "",
    toeKick > 0 && toeKickDepth > 0
      ? rect(originX + toeKickSetback, originY + h - toeKick, Math.min(toeKickDepth, Math.max(0, w - toeKickSetback)), toeKick, "detail-fill")
      : "",
    line(originX, originY + board, originX + w, originY + board, "detail"),
    line(originX, originY + h - toeKick - board, originX + w, originY + h - toeKick - board, "detail"),
    rect(originX + w - back, originY, back, h, "detail-fill"),
    dimensionLine(originX, originY + h + 32, originX + w, originY + h + 32, `${definition.depth} mm`, "horizontal"),
    dimensionLine(originX + w + 32, originY, originX + w + 32, originY + h, `${definition.height} mm`, "vertical"),
    text(
      originX,
      originY + h + 70,
      `Board ${definition.boardThickness} mm - Back ${definition.backPanelThickness} mm - Toe ${definition.toeKickHeight} mm / setback ${sectionModule ? getCabinetToeKickSetback(definition) : 0} mm / depth ${sectionModule ? getCabinetToeKickDepth(definition, sectionModule) : 0} mm${definition.includeBacksplash ? ` - backsplash ${getCabinetBacksplashHeight(definition)}h x ${getCabinetBacksplashThickness(definition)} thick` : ""}`,
      "small"
    ),
  ].join("\n");
}

function renderPlanFootprint(definition: CabinetDefinition): string {
  const originX = MARGIN;
  const originY = 640;
  const maxWidth = 780;
  const maxDepth = 210;
  const scale = Math.min(maxWidth / definition.totalWidth, maxDepth / definition.depth);
  const overallW = definition.totalWidth * scale;
  const overallD = definition.depth * scale;
  const moduleFrontOffset = getCabinetModuleFrontOffset(definition) * scale;
  const backsplashThickness = getCabinetBacksplashThickness(definition) * scale;
  let offsetX = 0;
  const elements: string[] = [
    text(originX, originY - 34, "A-603 Plan Footprint", "view-title"),
    rect(originX, originY, overallW, overallD, "outline"),
  ];

  if (definition.includeBacksplash && backsplashThickness > 0) {
    elements.push(
      rect(
        originX,
        originY + Math.max(0, overallD - backsplashThickness),
        overallW,
        backsplashThickness,
        "detail-fill",
        `data-backsplash-height="${getCabinetBacksplashHeight(definition)}" data-backsplash-thickness="${getCabinetBacksplashThickness(definition)}"`
      )
    );
    elements.push(text(originX + 6, Math.max(34, originY - 8), "backsplash/upstand rear edge", "small"));
  }

  for (const [index, module] of definition.modules.entries()) {
    const x = originX + offsetX * scale;
    const w = module.width * scale;
    const moduleD = module.depth * scale;
    const moduleY = originY + moduleFrontOffset;
    elements.push(rect(x, moduleY, w, moduleD, "module"));
    elements.push(text(x + 8, originY + 22, `M${index + 1}`, "small"));
    if (hasCabinetFaceFrame(definition)) {
      const frameDepth = getCabinetFaceFrameDepth(definition);
      if (frameDepth > 0 && getCabinetFaceFrameLayouts(definition, module).length > 0) {
        elements.push(
          rect(
            x,
            moduleY - frameDepth * scale,
            w,
            frameDepth * scale,
            "detail-fill",
            `data-face-frame-stile-width="${getCabinetFaceFrameStileWidth(definition)}" data-face-frame-rail-height="${getCabinetFaceFrameRailHeight(definition)}" data-face-frame-depth="${frameDepth}"`
          )
        );
      }
    }
    if (isCabinetCeilingBeamArray(module)) {
      const beamWidth = getCabinetCeilingBeamWidth(module) * scale;
      const orientation = getCabinetCeilingBeamOrientation(module);
      for (const localPosition of getCabinetCeilingBeamArrayLocalPositions(module)) {
        if (orientation === "z") {
          elements.push(rect(x + localPosition * scale, originY, beamWidth, moduleD, "detail-fill"));
        } else {
          elements.push(rect(x, originY + localPosition * scale, w, beamWidth, "detail-fill"));
        }
      }
    }
    if (isCabinetCofferedCeilingGrid(module)) {
      const beamWidth = getCabinetCeilingBeamWidth(module) * scale;
      for (const localX of getCabinetCeilingGridColumnBeamXPositions(module)) {
        elements.push(rect(x + localX * scale, originY, beamWidth, moduleD, "detail-fill"));
      }
      for (const localZ of getCabinetCeilingGridRowBeamZPositions(module)) {
        elements.push(rect(x, originY + localZ * scale, w, beamWidth, "detail-fill"));
      }
    }
    if (isCabinetTrimRun(module)) {
      const memberCount = getCabinetTrimMemberCount(module);
      const orientation = getCabinetTrimOrientation(module);
      const profileWidth = getCabinetTrimProfileWidth(module) * scale;
      const profileDepth = getCabinetTrimProfileDepth(module) * scale;
      const placement = getCabinetTrimPlacement(module);
      const setoutHeight = getCabinetTrimSetoutHeight(module);
      const memberLength = (orientation === "x" ? module.width : module.depth) / memberCount;
      const planLabel = `${trimPlacementLabel(placement)} trim setout ${setoutHeight} mm`;
      for (let memberIndex = 0; memberIndex < memberCount; memberIndex += 1) {
        if (orientation === "x") {
          elements.push(
            rect(
              x + memberIndex * memberLength * scale,
              originY,
              memberLength * scale,
              profileDepth,
              "detail-fill",
              `data-trim-placement="${escapeXml(placement)}" data-trim-setout="${setoutHeight}"`
            )
          );
        } else {
          elements.push(
            rect(
              x,
              originY + memberIndex * memberLength * scale,
              profileWidth,
              memberLength * scale,
              "detail-fill",
              `data-trim-placement="${escapeXml(placement)}" data-trim-setout="${setoutHeight}"`
            )
          );
        }
      }
      for (const trimReturn of getCabinetTrimReturnLayouts(module)) {
        elements.push(
          rect(
            x + trimReturn.localX * scale,
            originY + trimReturn.localZ * scale,
            Math.max(2, trimReturn.width * scale),
            Math.max(2, trimReturn.depth * scale),
            "detail",
            `data-trim-return-side="${escapeXml(trimReturn.side)}" data-trim-end-treatment="${escapeXml(trimReturn.endTreatment)}" data-trim-miter-angle="${trimReturn.miterAngle}"`
          )
        );
      }
      if (hasCabinetTrimRevealStrip(module)) {
        const revealStripHeight = getCabinetTrimRevealStripHeight(module);
        const revealStripDepth = getCabinetTrimRevealStripDepth(module);
        const revealStripInsetFromTop = getCabinetTrimRevealStripInsetFromTop(module);
        for (const strip of getCabinetTrimRevealStripLayouts(module)) {
          elements.push(
            rect(
              x + strip.localX * scale,
              originY + strip.localZ * scale,
              Math.max(2, strip.width * scale),
              Math.max(2, strip.depth * scale),
              "detail",
              `data-trim-reveal-strip="true" data-trim-reveal-height="${revealStripHeight}" data-trim-reveal-depth="${revealStripDepth}" data-trim-reveal-inset-from-top="${revealStripInsetFromTop}"`
            )
          );
        }
      }
      elements.push(text(x + 6, Math.max(34, originY - 8), planLabel, "small"));
    }
    if (isCabinetFireplaceSurroundFrame(module)) {
      const mantelDepth = getCabinetFireplaceMantelDepth(module) * scale;
      const frameDepth = module.depth * scale;
      elements.push(rect(x, originY, w, frameDepth, "detail-fill"));
      elements.push(rect(x, originY, w, mantelDepth, "outline"));
    }
    if (isCabinetConvertibleComponent(module)) {
      const openDepth = getCabinetConvertibleOpenDepth(module) * scale;
      const panelThickness = getCabinetConvertiblePanelThickness(module) * scale;
      elements.push(rect(x, moduleY, w, Math.max(panelThickness, module.depth * scale), "detail-fill"));
      elements.push(rect(x, moduleY - openDepth, w, openDepth, "outline"));
    }
    if (hasCabinetPlatformDeck(module)) {
      const deckOverhangFront = getCabinetPlatformDeckOverhangFront(module) * scale;
      const deckDepth = getCabinetPlatformDeckDepth(module) * scale;
      const ribWidth = getCabinetPlatformSupportRibWidth(module) * scale;
      const deckY = moduleY - deckOverhangFront;
      elements.push(rect(x, deckY, w, deckDepth, "outline"));
      for (const localZ of getCabinetPlatformSupportRibLocalZPositions(module)) {
        elements.push(rect(x, deckY + localZ * scale, w, ribWidth, "detail-fill"));
      }
    }
    if (hasCabinetStairScribe(module)) {
      const scribeDepth = getCabinetStairScribeDepth(module) * scale;
      elements.push(rect(x, moduleY - scribeDepth, w, scribeDepth, "detail-fill"));
    }
    if (hasCabinetRoomDividerDetails(module)) {
      const backPanelThickness = getCabinetRoomDividerBackPanelThickness(module) * scale;
      for (const panel of getCabinetRoomDividerBackPanelLayouts(module)) {
        elements.push(
          rect(
            x + panel.localX * scale,
            moduleY + moduleD - backPanelThickness,
            panel.width * scale,
            backPanelThickness,
            "detail-fill"
          )
        );
      }
      const footDepth = getCabinetRoomDividerStabilizerFootDepth(module) * scale;
      const footHeight = Math.max(2, getCabinetRoomDividerStabilizerFootHeight(module) * scale);
      for (const foot of getCabinetRoomDividerStabilizerFootLayouts(module)) {
        elements.push(
          rect(
            x + foot.localX * scale,
            moduleY + Math.max(0, (moduleD - footDepth) / 2),
            foot.width * scale,
            footDepth,
            "detail"
          )
        );
        elements.push(line(x + foot.localX * scale, moduleY + footHeight, x + (foot.localX + foot.width) * scale, moduleY + footHeight, "detail"));
      }
    }
    if (hasCabinetLifestyleInsert(module)) {
      const insertDepth = getCabinetLifestyleInsertDepth(module) * scale;
      for (const insert of getCabinetLifestyleInsertLayouts(module, definition.boardThickness, definition.revealGap)) {
        elements.push(rect(x + insert.localX * scale, moduleY, insert.width * scale, insertDepth, "detail-fill"));
      }
    }
    if (hasCabinetHamperPullOut(module)) {
      const basketDepth = getCabinetHamperBasketDepth(module) * scale;
      for (const basket of getCabinetHamperBasketLayouts(definition, module)) {
        elements.push(rect(x + basket.localX * scale, moduleY, basket.width * scale, basketDepth, "detail"));
      }
    }
    if (hasCabinetWineRack(module)) {
      const rackOpeningX = definition.boardThickness + definition.revealGap;
      const rackOpeningWidth = getCabinetWineRackOpeningWidth(module, definition.boardThickness, definition.revealGap);
      const rackDepth = getCabinetWineRackDepth(module, definition.backPanelThickness);
      const dividerThickness = getCabinetWineRackDividerThickness(module);
      elements.push(rect(x + rackOpeningX * scale, moduleY, rackOpeningWidth * scale, rackDepth * scale, "outline"));
      for (const localX of getCabinetWineRackVerticalDividerLocalXPositions(module, definition.boardThickness, definition.revealGap)) {
        elements.push(rect(x + localX * scale, moduleY, dividerThickness * scale, rackDepth * scale, "detail-fill"));
      }
    }
    if (hasCabinetPantryPullOuts(module)) {
      const trayOpeningX = getCabinetPantryPullOutOpeningX(definition, module) * scale;
      const trayOpeningWidth = getCabinetPantryPullOutOpeningWidth(definition, module) * scale;
      const trayDepth = getCabinetPantryPullOutTrayDepth(module) * scale;
      elements.push(rect(x + trayOpeningX, moduleY, trayOpeningWidth, trayDepth, "outline"));
      for (const localY of getCabinetPantryPullOutTrayLocalYPositions(definition, module)) {
        const trayMarkerY = moduleY + Math.min(trayDepth, Math.max(0, (localY / Math.max(1, module.height)) * trayDepth));
        elements.push(rect(x + trayOpeningX, trayMarkerY, trayOpeningWidth, Math.max(2, getCabinetPantryPullOutTrayFrontHeight(module) * scale * 0.35), "detail-fill"));
      }
    }
    if (hasCabinetSeatingDetails(module)) {
      const cushionOverhang = getCabinetSeatCushionOverhangFront(module) * scale;
      const deckDepth = (module.depth + getCabinetSeatCushionOverhangFront(module)) * scale;
      const cushionDepth = getCabinetSeatCushionDepth(module) * scale;
      elements.push(rect(x, moduleY - cushionOverhang, w, deckDepth, "outline"));
      if (getCabinetSeatCushionThickness(module) > 0) {
        elements.push(rect(x, moduleY - cushionOverhang, w, cushionDepth, "detail"));
      }
      if (hasCabinetSeatBack(module)) {
        const backThickness = getCabinetSeatBackThickness(module) * scale;
        elements.push(rect(x, moduleY + Math.max(0, moduleD - backThickness), w, backThickness, "detail-fill"));
      }
    }
    if (hasCabinetMudroomHooks(module)) {
      const hookProjection = getCabinetMudroomHookProjection(module) * scale;
      elements.push(
        rect(
          x,
          moduleY + Math.max(0, moduleD - hookProjection),
          w,
          Math.max(CABINET_MUDROOM_HOOK_RAIL_DEPTH * scale, hookProjection),
          "detail"
        )
      );
    }
    if (hasCabinetShoeCubbies(module)) {
      const openingX = getCabinetShoeCubbyOpeningX(definition);
      const openingWidth = getCabinetShoeCubbyOpeningWidth(definition, module);
      const cubbyDepth = getCabinetShoeCubbyDepth(module) * scale;
      const dividerThickness = getCabinetShoeCubbyDividerThickness(module) * scale;
      elements.push(rect(x + openingX * scale, moduleY, openingWidth * scale, cubbyDepth, "outline"));
      for (const localX of getCabinetShoeCubbyVerticalDividerLocalXPositions(definition, module)) {
        elements.push(rect(x + localX * scale, moduleY, dividerThickness, cubbyDepth, "detail-fill"));
      }
    }
    if (hasCabinetSinkCutout(module) && definition.includeCountertop) {
      elements.push(
        rect(
          x + getCabinetSinkCutoutLocalX(module) * scale,
          moduleY + getCabinetSinkCutoutLocalZ(module) * scale,
          getCabinetSinkCutoutWidth(module) * scale,
          getCabinetSinkCutoutDepth(module) * scale,
          "detail"
        )
      );
    }
    if (hasCabinetPlumbingChase(module)) {
      elements.push(
        rect(
          x + getCabinetPlumbingChaseLocalX(module) * scale,
          moduleY + getCabinetPlumbingChaseLocalZ(module) * scale,
          getCabinetPlumbingChaseWidth(module) * scale,
          getCabinetPlumbingChaseDepth(module) * scale,
          "detail-fill"
        )
      );
    }
    if (hasCabinetLaundryApplianceBay(module)) {
      const applianceDepth = getCabinetLaundryApplianceDepth(module) * scale;
      const applianceWidth = getCabinetLaundryApplianceWidth(module) * scale;
      for (const localX of getCabinetLaundryApplianceLocalXPositions(module)) {
        elements.push(rect(x + localX * scale, moduleY, applianceWidth, applianceDepth, "detail"));
      }
      elements.push(
        rect(
          x,
          moduleY + getCabinetLaundryUtilityChaseLocalZ(module) * scale,
          w,
          getCabinetLaundryUtilityChaseDepth(module) * scale,
          "detail-fill"
        )
      );
    }
    if (hasCabinetOfficeWorkstation(module)) {
      elements.push(
        rect(
          x,
          moduleY - getCabinetOfficeWorksurfaceOverhangFront(module) * scale,
          w,
          getCabinetOfficeWorksurfaceDepth(module) * scale,
          "outline"
        )
      );
      const grommetDiameter = getCabinetCableGrommetDiameter(module) * scale;
      for (const localX of getCabinetCableGrommetLocalXPositions(module)) {
        elements.push(
          rect(
            x + localX * scale,
            moduleY + getCabinetCableGrommetLocalZ(module) * scale,
            grommetDiameter,
            grommetDiameter,
            "detail"
          )
        );
      }
      elements.push(
        rect(
          x,
          moduleY + getCabinetDeskPowerChaseLocalZ(module) * scale,
          w,
          getCabinetDeskPowerChaseDepth(module) * scale,
          "detail-fill"
        )
      );
    }
    if (hasCabinetMediaWallDetails(module)) {
      elements.push(
        rect(
          x + getCabinetMediaTvBlockingLocalX(module) * scale,
          moduleY + getCabinetMediaTvBlockingLocalZ(module) * scale,
          getCabinetMediaTvOpeningWidth(module) * scale,
          Math.max(2, getCabinetMediaCableChaseDepth(module) * scale * 0.3),
          "detail-fill"
        )
      );
      elements.push(
        rect(
          x + getCabinetMediaCableChaseLocalX(module) * scale,
          moduleY + getCabinetMediaCableChaseLocalZ(module) * scale,
          getCabinetMediaCableChaseWidth(module) * scale,
          getCabinetMediaCableChaseDepth(module) * scale,
          "detail"
        )
      );
      for (const localX of getCabinetMediaVentSlotLocalXPositions(module)) {
        elements.push(
          rect(
            x + localX * scale,
            moduleY - 8,
            getCabinetMediaVentSlotWidth(module) * scale,
            6,
            "opening"
          )
        );
      }
    }
    if (hasCabinetLibraryLadderRail(module)) {
      const railProjection = getCabinetLibraryLadderRailProjection(module) * scale;
      const railDiameter = getCabinetLibraryLadderRailDiameter(module) * scale;
      elements.push(rect(x, moduleY - railProjection, w, Math.max(2, railDiameter), "detail-fill"));
      const standoffDiameter = getCabinetLibraryLadderStandoffDiameter(module) * scale;
      for (const localX of getCabinetLibraryLadderStandoffLocalXPositions(module)) {
        elements.push(rect(x + localX * scale, moduleY - railProjection, standoffDiameter, railProjection, "detail"));
      }
    }
    if (hasCabinetStemwareRack(module)) {
      const rackDepth = getCabinetStemwareRackDepth(module) * scale;
      const rackY = moduleY + getCabinetStemwareRackLocalZ(module) * scale;
      for (const localX of getCabinetStemwareRackRailLocalXPositions(module)) {
        elements.push(
          rect(
            x + localX * scale,
            rackY,
            getCabinetStemwareRackRailWidth(module) * scale,
            rackDepth,
            "detail-fill"
          )
        );
      }
    }
    if (hasCabinetLightingChannels(module)) {
      elements.push(
        rect(
          x + getCabinetLightingChannelLocalX(definition) * scale,
          moduleY + getCabinetLightingChannelLocalZ(definition, module) * scale,
          getCabinetLightingChannelWidth(definition, module) * scale,
          getCabinetLightingChannelDepth(module) * scale,
          "detail"
        )
      );
    }
    if (hasCabinetDoorHinges(module)) {
      for (const hinge of getCabinetDoorHingeLayouts(definition, module)) {
        elements.push(
          rect(
            x + hinge.localX * scale,
            moduleY - (CABINET_DOOR_HINGE_MARKER_DEPTH + CABINET_FRONT_THICKNESS) * scale,
            Math.max(2, CABINET_DOOR_HINGE_MARKER_WIDTH * scale),
            Math.max(2, CABINET_DOOR_HINGE_MARKER_DEPTH * scale),
            "detail-fill"
          )
        );
      }
    }
    if (hasCabinetInstallationCleat(module)) {
      const cleat = getCabinetInstallationCleatLayout(definition, module);
      if (cleat) {
        elements.push(
          rect(
            x + cleat.localX * scale,
            moduleY + cleat.localZ * scale,
            cleat.width * scale,
            Math.max(2, cleat.depth * scale),
            "detail-fill"
          )
        );
      }
    }
    if (hasCabinetAntiTipAnchors(module)) {
      for (const anchor of getCabinetAntiTipAnchorLayouts(module)) {
        elements.push(
          rect(
            x + anchor.localX * scale,
            moduleY + anchor.localZ * scale,
            Math.max(2, CABINET_ANTI_TIP_ANCHOR_WIDTH * scale),
            Math.max(2, CABINET_ANTI_TIP_ANCHOR_DEPTH * scale),
            "detail"
          )
        );
      }
    }
    if (hasCabinetLevelingFeet(definition)) {
      const footDiameter = getCabinetLevelingFootDiameter(definition);
      const footHeight = getCabinetLevelingFootHeight(definition);
      for (const foot of getCabinetLevelingFootLayouts(definition, module)) {
        elements.push(
          rect(
            x + foot.localX * scale,
            moduleY + foot.localZ * scale,
            Math.max(2, footDiameter * scale),
            Math.max(2, footDiameter * scale),
            "detail",
            `data-leveling-foot-index="${foot.footIndex + 1}" data-leveling-foot-height="${footHeight}" data-leveling-foot-diameter="${footDiameter}"`
          )
        );
      }
    }
    if (hasCabinetDrawerBoxes(module)) {
      for (const box of getCabinetDrawerBoxLayouts(definition, module)) {
        elements.push(
          rect(
            x + box.localX * scale,
            moduleY + box.localZ * scale,
            box.width * scale,
            box.depth * scale,
            "outline"
          )
        );
      }
    }
    if (hasCabinetDrawerSlides(module)) {
      for (const slide of getCabinetDrawerSlideLayouts(definition, module)) {
        elements.push(
          rect(
            x + slide.localX * scale,
            moduleY - CABINET_FRONT_THICKNESS * scale,
            slide.width * scale,
            Math.max(2, getCabinetDrawerSlideLength(module) * scale),
            "detail"
          )
        );
      }
    }
    if (hasCabinetShelfPinRows(module)) {
      for (const row of getCabinetShelfPinRowLayouts(definition, module)) {
        elements.push(
          rect(
            x + row.localX * scale,
            moduleY + row.localZ * scale,
            Math.max(2, CABINET_SHELF_PIN_ROW_MARKER_WIDTH * scale),
            Math.max(2, CABINET_SHELF_PIN_ROW_MARKER_DEPTH * scale),
            "detail-fill"
          )
        );
      }
    }
    offsetX += module.width;
  }

  if (hasCabinetIslandSeating(definition)) {
    const seatingOverhangDepth = getCabinetIslandSeatingOverhangDepth(definition);
    const supportPanelDepth = getCabinetIslandSupportPanelDepth(definition);
    const supportPanelThickness = getCabinetIslandSupportPanelThickness(definition);
    const supportPanelY =
      originY +
      moduleFrontOffset +
      getCabinetModuleRunDepth(definition) * scale +
      Math.max(0, (seatingOverhangDepth - supportPanelDepth) / 2) * scale;
    for (const localX of getCabinetIslandSupportPanelLocalXPositions(definition, getCabinetOverallWidth(definition))) {
      elements.push(
        rect(
          originX + localX * scale,
          supportPanelY,
          supportPanelThickness * scale,
          supportPanelDepth * scale,
          "detail-fill"
        )
      );
    }
  }

  elements.push(dimensionLine(originX, originY + overallD + 30, originX + overallW, originY + overallD + 30, `${definition.totalWidth} mm`, "horizontal"));
  elements.push(dimensionLine(originX + overallW + 30, originY, originX + overallW + 30, originY + overallD, `${definition.depth} mm`, "vertical"));
  return elements.join("\n");
}

export function buildCabinetShopDrawingSvgFileName(definition: CabinetDefinition): string {
  return `${fileSafeName(definition.name)}-shop-drawing.svg`;
}

export function buildCabinetShopDrawingSvg(definition: CabinetDefinition): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH}" height="${SHEET_HEIGHT}" viewBox="0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}" role="img" aria-label="${escapeXml(definition.name)} custom millwork shop drawing">
  <style>
    .sheet { fill: #ffffff; }
    .outline { fill: none; stroke: #111827; stroke-width: 2; }
    .module { fill: #f8fafc; stroke: #1f2937; stroke-width: 1.4; }
    .opening { fill: #ffffff; stroke: #64748b; stroke-width: 1; }
    .detail { stroke: #334155; stroke-width: 1; fill: none; }
    .shelf { stroke: #475569; stroke-width: 1; stroke-dasharray: 6 4; }
    .detail-fill { fill: #e5e7eb; stroke: #64748b; stroke-width: 1; }
    .dimension { stroke: #0f766e; stroke-width: 1; fill: none; }
    text { font-family: Arial, Helvetica, sans-serif; fill: #111827; }
    .title { font-size: 16px; font-weight: 700; }
    .view-title { font-size: 18px; font-weight: 700; }
    .label { font-size: 13px; }
    .strong { font-weight: 700; }
    .small { font-size: 11px; fill: #475569; }
    .dimension-label { font-size: 12px; fill: #0f766e; font-weight: 700; text-anchor: middle; }
    .title-block { fill: #f8fafc; stroke: #1f2937; stroke-width: 1; }
  </style>
  <rect class="sheet" x="0" y="0" width="${SHEET_WIDTH}" height="${SHEET_HEIGHT}"/>
  ${text(MARGIN, 52, "Custom Millwork Shop Drawing", "title")}
  ${text(MARGIN, 76, `${definition.name} - ${definition.totalWidth}w x ${definition.height}h x ${definition.depth}d mm`, "label")}
  ${renderFrontElevation(definition)}
  ${renderSideSection(definition)}
  ${renderPlanFootprint(definition)}
  ${titleBlock(definition)}
</svg>
`;
}

export function downloadCabinetShopDrawingSvg(definition: CabinetDefinition): void {
  const svg = buildCabinetShopDrawingSvg(definition);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetShopDrawingSvgFileName(definition);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
