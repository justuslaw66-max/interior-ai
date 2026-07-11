import type { CabinetDefinition, CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_LIGHTING_CHANNEL_COUNT = 3;
export const CABINET_DEFAULT_LIGHTING_CHANNEL_DEPTH = 18;
export const CABINET_DEFAULT_LIGHTING_CHANNEL_HEIGHT = 8;
export const CABINET_DEFAULT_LIGHTING_CHANNEL_INSET_FROM_FRONT = 45;
export const CABINET_LIGHTING_CHANNEL_HARDWARE_ID = "led_strip_channel";
export const CABINET_LIGHTING_CHANNEL_SKU_ID = "CAB-HW-LED-STRIP-CHANNEL";

export function hasCabinetLightingChannels(module: CabinetModuleDefinition): boolean {
  if (module.lightingChannelEnabled === false) return false;
  return (
    Boolean(module.lightingChannelEnabled) ||
    typeof module.lightingChannelCount === "number" ||
    typeof module.lightingChannelDepth === "number" ||
    typeof module.lightingChannelHeight === "number" ||
    typeof module.lightingChannelInsetFromFront === "number"
  );
}

export function getCabinetLightingChannelCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetLightingChannels(module)) return 0;
  return Math.max(0, module.lightingChannelCount ?? CABINET_DEFAULT_LIGHTING_CHANNEL_COUNT);
}

export function getCabinetLightingChannelDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetLightingChannels(module)) return 0;
  return Math.max(0, module.lightingChannelDepth ?? CABINET_DEFAULT_LIGHTING_CHANNEL_DEPTH);
}

export function getCabinetLightingChannelHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetLightingChannels(module)) return 0;
  return Math.max(0, module.lightingChannelHeight ?? CABINET_DEFAULT_LIGHTING_CHANNEL_HEIGHT);
}

export function getCabinetLightingChannelInsetFromFront(module: CabinetModuleDefinition): number {
  if (!hasCabinetLightingChannels(module)) return 0;
  return Math.max(0, module.lightingChannelInsetFromFront ?? CABINET_DEFAULT_LIGHTING_CHANNEL_INSET_FROM_FRONT);
}

export function getCabinetLightingChannelWidth(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  return Math.max(0, module.width - definition.boardThickness * 2);
}

export function getCabinetLightingChannelLocalX(definition: CabinetDefinition): number {
  return definition.boardThickness;
}

export function getCabinetLightingChannelLocalZ(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  const channelDepth = getCabinetLightingChannelDepth(module);
  const maxZ = Math.max(0, module.depth - definition.backPanelThickness - channelDepth);
  return Math.min(getCabinetLightingChannelInsetFromFront(module), maxZ);
}

export function getCabinetLightingChannelLocalYPositions(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number[] {
  const count = getCabinetLightingChannelCount(module);
  const channelHeight = getCabinetLightingChannelHeight(module);
  if (count <= 0 || channelHeight <= 0) return [];

  const toeKickHeight = Math.min(definition.toeKickHeight, Math.max(0, module.height - definition.boardThickness * 2));
  const interiorBottom = toeKickHeight + definition.boardThickness;
  const interiorHeight = Math.max(0, module.height - toeKickHeight - definition.boardThickness * 2);
  if (interiorHeight <= 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const centerY = interiorBottom + ((index + 1) * interiorHeight) / (count + 1);
    return Math.max(interiorBottom, centerY - channelHeight / 2);
  });
}
