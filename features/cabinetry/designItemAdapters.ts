import type { DesignItem } from "@/lib/room-types";
import { buildMillworkAssetManifest } from "@/features/millwork/buildMillworkAssetManifest";
import { createCabinetMillworkDefinition } from "@/features/millwork/createCabinetMillworkDefinition";
import { generateCabinetBOM } from "./generateCabinetBOM";
import { generateCabinetDocumentation } from "./generateCabinetDocumentation";
import type { CabinetDefinition, PlacedCabinetAsset } from "./types";

export type ParametricCabinetDesignItem = DesignItem & {
  assetType: "parametric_cabinet";
  cabinetDefinition: CabinetDefinition;
};

export function isParametricCabinetItem(
  item: Pick<DesignItem, "assetType" | "cabinetDefinition"> | null | undefined
): item is ParametricCabinetDesignItem {
  return item?.assetType === "parametric_cabinet" && Boolean(item.cabinetDefinition);
}

export function getCabinetPlanningDimsMm(
  item: DesignItem
): { w: number; d: number; h: number } | null {
  if (!isParametricCabinetItem(item)) return null;
  return {
    w: item.cabinetDefinition.totalWidth,
    d: item.cabinetDefinition.depth,
    h: item.cabinetDefinition.height,
  };
}

export function getCabinetRotationY(
  item: Pick<DesignItem, "rotationY" | "transform">
): number {
  if (typeof item.rotationY === "number" && Number.isFinite(item.rotationY)) {
    return item.rotationY;
  }
  if (
    typeof item.transform?.rotationY === "number" &&
    Number.isFinite(item.transform.rotationY)
  ) {
    return item.transform.rotationY;
  }
  const transformRotationY = item.transform?.rotation?.[1];
  return typeof transformRotationY === "number" && Number.isFinite(transformRotationY)
    ? transformRotationY
    : 0;
}

export function buildCabinetTransformMetadata(
  position: [number, number, number],
  rotationY: number,
  scale: [number, number, number] = [1, 1, 1]
): NonNullable<DesignItem["transform"]> {
  return {
    position,
    rotationY,
    rotation: [0, rotationY, 0],
    scale,
  };
}

export function buildCabinetAssetManifest({
  definition,
  instanceId,
  roomId,
  position,
  rotationY,
  scale = [1, 1, 1],
  glbAssetUrl,
  createdAt,
  updatedAt,
}: {
  definition: CabinetDefinition;
  instanceId: string;
  roomId?: string;
  position: [number, number, number];
  rotationY: number;
  scale?: [number, number, number];
  glbAssetUrl?: string;
  createdAt: string;
  updatedAt: string;
}): NonNullable<DesignItem["millworkAssetManifest"]> {
  return buildMillworkAssetManifest({
    assetId: instanceId,
    assetType: "parametric_cabinet",
    millworkDefinition: createCabinetMillworkDefinition(definition),
    sourceDefinition: definition,
    roomId,
    transform: {
      position,
      rotation: [0, rotationY, 0],
      scale,
    },
    glbAssetUrl,
    createdAt,
    updatedAt,
  });
}

export function buildCabinetMillworkMetadata(
  definition: CabinetDefinition,
  roomId?: string
): Pick<
  DesignItem,
  | "assemblyType"
  | "millworkDefinition"
  | "millworkDefinitionVersion"
  | "millworkMaterials"
  | "millworkHardware"
  | "roomId"
> {
  const millworkDefinition = createCabinetMillworkDefinition(definition);
  return {
    assemblyType: millworkDefinition.assemblyType,
    millworkDefinition,
    millworkDefinitionVersion: millworkDefinition.version,
    millworkMaterials: millworkDefinition.materials,
    millworkHardware: millworkDefinition.hardware,
    roomId,
  };
}

export function normalizeCabinetDesignItem(
  item: DesignItem,
  options: { dropTemporaryGlbUrls?: boolean; roomId?: string } = {}
): DesignItem {
  if (!isParametricCabinetItem(item)) return item;

  const now = new Date().toISOString();
  const position = item.position ?? item.transform?.position ?? [0, 0, 0];
  const rotationY = getCabinetRotationY(item);
  const scale = item.transform?.scale ?? [1, 1, 1];
  const roomId = options.roomId ?? item.roomId;
  const documentationSnapshot = generateCabinetDocumentation(item.cabinetDefinition);
  const glbAssetUrl =
    options.dropTemporaryGlbUrls && item.glbAssetUrl?.startsWith("blob:")
      ? undefined
      : item.glbAssetUrl;
  const createdAt = item.createdAt ?? item.cabinetDefinition.createdAt ?? now;
  const updatedAt =
    item.updatedAt ?? item.cabinetUpdatedAt ?? item.cabinetDefinition.updatedAt ?? now;
  const cabinetUpdatedAt =
    item.cabinetUpdatedAt ?? item.updatedAt ?? item.cabinetDefinition.updatedAt ?? now;

  return {
    ...item,
    id: item.id ?? item.instanceId,
    ...buildCabinetMillworkMetadata(item.cabinetDefinition, roomId),
    productId: "parametric-cabinet",
    variantId: item.variantId || item.cabinetDefinition.id,
    name: item.name ?? item.cabinetDefinition.name,
    glbAssetUrl,
    millworkAssetManifest: buildCabinetAssetManifest({
      definition: item.cabinetDefinition,
      instanceId: item.instanceId,
      roomId,
      position,
      rotationY,
      scale,
      glbAssetUrl,
      createdAt,
      updatedAt,
    }),
    bomSnapshot: item.bomSnapshot ?? generateCabinetBOM(item.cabinetDefinition),
    materialScheduleSnapshot:
      item.materialScheduleSnapshot ?? documentationSnapshot.materialSchedule,
    hardwareScheduleSnapshot:
      item.hardwareScheduleSnapshot ?? documentationSnapshot.hardwareSchedule,
    edgeBandingScheduleSnapshot:
      item.edgeBandingScheduleSnapshot ?? documentationSnapshot.edgeBandingSchedule,
    cutListSnapshot: item.cutListSnapshot ?? documentationSnapshot.cutList,
    dimensionScheduleSnapshot:
      item.dimensionScheduleSnapshot ?? documentationSnapshot.dimensionSchedule,
    drawingViewScheduleSnapshot:
      item.drawingViewScheduleSnapshot ?? documentationSnapshot.drawingViewSchedule,
    installerNotesSnapshot:
      item.installerNotesSnapshot ?? documentationSnapshot.installerNotes,
    releaseChecklistSnapshot:
      item.releaseChecklistSnapshot ?? documentationSnapshot.releaseChecklist,
    quoteSummarySnapshot: item.quoteSummarySnapshot ?? documentationSnapshot.quoteSummary,
    supplierSkuMappingsSnapshot:
      item.supplierSkuMappingsSnapshot ?? documentationSnapshot.supplierSkuMappings,
    supplierReadinessSnapshot:
      item.supplierReadinessSnapshot ?? documentationSnapshot.supplierReadiness,
    fabricationReleaseReadinessSnapshot:
      item.fabricationReleaseReadinessSnapshot ??
      documentationSnapshot.fabricationReleaseReadiness,
    createdAt,
    updatedAt,
    cabinetUpdatedAt,
    position,
    rotationY,
    transform: buildCabinetTransformMetadata(position, rotationY, scale),
    qty: typeof item.qty === "number" && item.qty > 0 ? item.qty : 1,
    includeInCheckout: false,
    locked: Boolean(item.locked),
  };
}

export function updateCabinetPlacementMetadata(
  item: DesignItem,
  position: [number, number, number],
  rotationY: number,
  roomId?: string
): DesignItem {
  if (!isParametricCabinetItem(item)) {
    return {
      ...item,
      position,
      rotationY,
    };
  }

  const now = new Date().toISOString();
  const scale = item.transform?.scale ?? [1, 1, 1];
  const createdAt = item.createdAt ?? item.cabinetDefinition.createdAt ?? now;

  return {
    ...item,
    position,
    rotationY,
    transform: buildCabinetTransformMetadata(position, rotationY, scale),
    millworkAssetManifest: buildCabinetAssetManifest({
      definition: item.cabinetDefinition,
      instanceId: item.instanceId,
      roomId: roomId ?? item.roomId,
      position,
      rotationY,
      scale,
      glbAssetUrl: item.glbAssetUrl,
      createdAt,
      updatedAt: now,
    }),
    cabinetUpdatedAt: now,
    createdAt,
    updatedAt: now,
  };
}

export function buildPlacedCabinetAssetPackageInput(
  item: ParametricCabinetDesignItem,
  roomId?: string
): PlacedCabinetAsset {
  const documentationSnapshot = generateCabinetDocumentation(item.cabinetDefinition);
  const rotationY = getCabinetRotationY(item);
  const position = item.position ?? item.transform?.position ?? [0, 0, 0];
  const scale = item.transform?.scale ?? [1, 1, 1];
  const millworkDefinition = createCabinetMillworkDefinition(item.cabinetDefinition);
  const now = new Date().toISOString();
  const createdAt = item.createdAt ?? item.cabinetDefinition.createdAt ?? now;
  const updatedAt =
    item.updatedAt ?? item.cabinetUpdatedAt ?? item.cabinetDefinition.updatedAt ?? now;

  return {
    id: item.instanceId,
    assetType: "parametric_cabinet",
    assetManifest: buildCabinetAssetManifest({
      definition: item.cabinetDefinition,
      instanceId: item.instanceId,
      roomId: roomId ?? item.roomId,
      position,
      rotationY,
      scale,
      glbAssetUrl: item.glbAssetUrl,
      createdAt,
      updatedAt,
    }),
    assemblyType: item.assemblyType ?? millworkDefinition.assemblyType,
    cabinetDefinitionId: item.cabinetDefinition.id,
    cabinetDefinition: item.cabinetDefinition,
    millworkDefinition,
    millworkDefinitionVersion: item.millworkDefinitionVersion ?? millworkDefinition.version,
    glbAssetUrl: item.glbAssetUrl,
    transform: {
      position,
      rotation: item.transform?.rotation ?? [0, rotationY, 0],
      scale,
    },
    roomId: roomId ?? item.roomId,
    materials: item.cabinetDefinition.materials,
    hardware: item.cabinetDefinition.hardware,
    bomSnapshot: item.bomSnapshot ?? generateCabinetBOM(item.cabinetDefinition),
    materialScheduleSnapshot:
      item.materialScheduleSnapshot ?? documentationSnapshot.materialSchedule,
    hardwareScheduleSnapshot:
      item.hardwareScheduleSnapshot ?? documentationSnapshot.hardwareSchedule,
    edgeBandingScheduleSnapshot:
      item.edgeBandingScheduleSnapshot ?? documentationSnapshot.edgeBandingSchedule,
    cutListSnapshot: item.cutListSnapshot ?? documentationSnapshot.cutList,
    dimensionScheduleSnapshot:
      item.dimensionScheduleSnapshot ?? documentationSnapshot.dimensionSchedule,
    drawingViewScheduleSnapshot:
      item.drawingViewScheduleSnapshot ?? documentationSnapshot.drawingViewSchedule,
    installerNotesSnapshot:
      item.installerNotesSnapshot ?? documentationSnapshot.installerNotes,
    releaseChecklistSnapshot:
      item.releaseChecklistSnapshot ?? documentationSnapshot.releaseChecklist,
    quoteSummarySnapshot: item.quoteSummarySnapshot ?? documentationSnapshot.quoteSummary,
    supplierSkuMappingsSnapshot:
      item.supplierSkuMappingsSnapshot ?? documentationSnapshot.supplierSkuMappings,
    supplierReadinessSnapshot:
      item.supplierReadinessSnapshot ?? documentationSnapshot.supplierReadiness,
    fabricationReleaseReadinessSnapshot:
      item.fabricationReleaseReadinessSnapshot ??
      documentationSnapshot.fabricationReleaseReadiness,
    createdAt,
    updatedAt,
  };
}
