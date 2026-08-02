import {
  findCatalogSurfacePlacement,
  getCeilingMountedItemBaseY,
  isSurfaceOnlyCatalogItem,
  type PendingCatalogPlacement,
} from "@/lib/catalog-placement";
import type { CatalogItemSchema, DimensionsMm } from "@/lib/catalog-schema";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { mapToTopCategory } from "@/lib/catalog/view-builders";
import { getFurnitureWallInset } from "@/lib/design-page-geometry";
import {
  ROOM_DIMENSION_DEFAULTS,
} from "@/lib/design-page-house-plan";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import type { RoomOpening2D } from "@/lib/editorScene";
import {
  scoreManualPlacement,
  type ManualPlacementScore,
} from "@/lib/manual-placement-scoring";
import type { DesignItem, RoomSnapshot, ZoneMin } from "@/lib/room-types";

export const CATALOG_PLACEMENT_MIN_SCORE_DELTA = 4;
export const CATALOG_PLACEMENT_POSITION_EPSILON_METERS = 0.08;
export const CATALOG_PLACEMENT_ROTATION_EPSILON_RADIANS = 0.01;

export type CatalogPlacementCatalog = Record<
  string,
  CatalogItemSchema | undefined
>;
export type CatalogPlacementDimensions = Pick<DimensionsMm, "w" | "d">;
export type CatalogPlacementExcludedItems = string | string[] | undefined;

export type CatalogPlacementRoomCollisionQuery = (
  room: RoomSnapshot,
  productId: string,
  position: [number, number, number],
  rotationY: number,
  dimsMm: CatalogPlacementDimensions,
  excludedInstanceId?: CatalogPlacementExcludedItems
) => boolean;

export type CatalogPlacementRoomContainmentQuery = (
  room: RoomSnapshot,
  position: [number, number, number],
  rotationY: number,
  dimsMm: CatalogPlacementDimensions
) => boolean;

export type CatalogPlacementRoomClampQuery = (
  room: RoomSnapshot,
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  rotationY?: number
) => [number, number];

export type CatalogPlacementGeometryQueries = {
  clampToRoom: CatalogPlacementRoomClampQuery;
  collidesInRoom: CatalogPlacementRoomCollisionQuery;
  isContainedInRoom: CatalogPlacementRoomContainmentQuery;
};

export type CatalogPlacementQuality = {
  label: string;
  tone: "good" | "warn" | "bad";
};

export type CatalogPlacementImprovement = {
  placement: PendingCatalogPlacement;
  score: number;
  scoreDelta: number;
};

export type CatalogBestRoomPlacement = CatalogPlacementImprovement & {
  roomName: string;
};

export type CatalogBestVariantPlacement = CatalogPlacementImprovement & {
  variantLabel: string;
};

export type CatalogPlacementPreviewTarget = {
  roomId: string;
  label: string;
  valid: boolean;
  kind: "preview";
};

export type FindSmartCatalogPlacement = (
  productId: string,
  variantId: string | undefined,
  purchaseOptionId: string | undefined,
  room: RoomSnapshot
) => PendingCatalogPlacement | null;

export type ScoreCatalogPlacement = (
  placement: PendingCatalogPlacement,
  room: RoomSnapshot,
  instanceId: string,
  blocker?: DesignItem | null
) => ManualPlacementScore | null;

type ScoreCatalogPlacementCandidateOptions = {
  placement: PendingCatalogPlacement;
  room: RoomSnapshot;
  instanceId: string;
  catalogItems: CatalogPlacementCatalog;
  openings: RoomOpening2D[];
  blocker?: DesignItem | null;
};

export function scoreCatalogPlacementCandidate({
  placement,
  room,
  instanceId,
  catalogItems,
  openings,
  blocker = null,
}: ScoreCatalogPlacementCandidateOptions): ManualPlacementScore | null {
  const product = catalogItems[placement.productId];
  if (!product) return null;
  const resolved = resolveCatalogVariant(product, placement.variantId);
  return scoreManualPlacement({
    room,
    item: {
      instanceId,
      productId: placement.productId,
      variantId: resolved.variantId,
      position: placement.position,
      rotationY: placement.rotationY,
    },
    dimsMm: resolved.dimsMm,
    catalogItems,
    openings,
    blocker,
    variant: resolved.variant,
    existingItems: room.items,
  });
}

export function isCatalogPlacementScoreHardInvalid(
  score: ManualPlacementScore | null
): boolean {
  return score?.kind === "blocks_path" || score?.kind === "cramped";
}

type IsCatalogPlacementTargetAcceptableOptions = {
  placement: PendingCatalogPlacement;
  targetRoom: RoomSnapshot;
  catalogItems: CatalogPlacementCatalog;
  geometry: Pick<
    CatalogPlacementGeometryQueries,
    "collidesInRoom" | "isContainedInRoom"
  >;
  scorePlacement: ScoreCatalogPlacement;
};

export function isCatalogPlacementTargetAcceptable({
  placement,
  targetRoom,
  catalogItems,
  geometry,
  scorePlacement,
}: IsCatalogPlacementTargetAcceptableOptions): boolean {
  const product = catalogItems[placement.productId];
  if (!product) return false;
  const resolved = resolveCatalogVariant(product, placement.variantId);
  if (
    !geometry.isContainedInRoom(
      targetRoom,
      placement.position,
      placement.rotationY,
      resolved.dimsMm
    )
  ) {
    return false;
  }
  if (
    geometry.collidesInRoom(
      targetRoom,
      placement.productId,
      placement.position,
      placement.rotationY,
      resolved.dimsMm,
      placement.supportInstanceId
    )
  ) {
    return false;
  }
  const score = scorePlacement(
    placement,
    targetRoom,
    "catalog-placement-target-check"
  );
  return Boolean(score && !isCatalogPlacementScoreHardInvalid(score));
}

type FindSmartCatalogPlacementOptions = {
  productId: string;
  variantId?: string;
  purchaseOptionId?: string;
  targetRoom: RoomSnapshot | null;
  catalogItems: CatalogPlacementCatalog;
  openings: RoomOpening2D[];
  geometry: CatalogPlacementGeometryQueries;
};

export function findSmartCatalogPlacement({
  productId,
  variantId,
  purchaseOptionId,
  targetRoom,
  catalogItems,
  openings,
  geometry,
}: FindSmartCatalogPlacementOptions): PendingCatalogPlacement | null {
  const product = catalogItems[productId];
  if (!product || !targetRoom) return null;
  if (isSurfaceOnlyCatalogItem(product)) {
    return findCatalogSurfacePlacement({
      productId,
      variantId,
      purchaseOptionId,
      roomId: targetRoom.id,
      items: targetRoom.items,
    });
  }

  const resolved = resolveCatalogVariant(
    product,
    variantId ?? product.defaultVariantId
  );
  const widthMeters = resolved.dimsMm.w / 1000;
  const depthMeters = resolved.dimsMm.d / 1000;
  const targetWidth = targetRoom.geometry.width;
  const targetDepth = targetRoom.geometry.depth;
  const targetWallThickness =
    targetRoom.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness;
  const [effectiveWidth, effectiveDepth] = getRotatedFootprint(
    widthMeters,
    depthMeters,
    0
  );
  const wallInset = getFurnitureWallInset(targetWallThickness);
  const maxX = Math.max(0, targetWidth / 2 - effectiveWidth / 2 - wallInset);
  const maxZ = Math.max(0, targetDepth / 2 - effectiveDepth / 2 - wallInset);
  const topCategory = mapToTopCategory(product.category, product);
  const wallFirst = new Set([
    "sofa",
    "tv_console",
    "sideboard",
    "floor_lamp",
    "dining_bench",
  ]);
  const preferredZoneTypes: ZoneMin["type"][] =
    topCategory === "dining_table" ||
    topCategory === "dining_bench" ||
    topCategory === "sideboard" ||
    topCategory === "ceiling_light"
      ? ["dining"]
      : topCategory === "tv_console"
        ? ["tv"]
        : topCategory === "floor_lamp" ||
            topCategory === "accent_chair" ||
            topCategory === "side_table"
          ? ["seating", "reading"]
          : topCategory === "sofa" ||
              topCategory === "coffee_table" ||
              topCategory === "rug"
            ? ["seating"]
            : [];
  const zoneCandidates = targetRoom.zones
    .filter((zone) => preferredZoneTypes.includes(zone.type) && zone.anchor)
    .map((zone) => ({
      x: zone.anchor?.[0] ?? 0,
      z: zone.anchor?.[2] ?? 0,
      rotationY: 0,
      reason:
        zone.type === "dining"
          ? "Auto placed in dining zone"
          : zone.type === "tv"
            ? "Auto placed in TV zone"
            : zone.type === "reading"
              ? "Auto placed in reading zone"
              : "Auto placed in seating zone",
    }));
  const candidates: Array<{
    x: number;
    z: number;
    rotationY: number;
    reason: string;
  }> = [
    ...zoneCandidates,
    { x: 0, z: 0, rotationY: 0, reason: "Auto placed at room center" },
    { x: 0, z: -maxZ, rotationY: 0, reason: "Auto placed near back wall" },
    {
      x: 0,
      z: maxZ,
      rotationY: Math.PI,
      reason: "Auto placed near front wall",
    },
    {
      x: -maxX,
      z: 0,
      rotationY: Math.PI / 2,
      reason: "Auto placed near left wall",
    },
    {
      x: maxX,
      z: 0,
      rotationY: -Math.PI / 2,
      reason: "Auto placed near right wall",
    },
  ];

  const gridSteps = 5;
  for (let xIndex = 0; xIndex < gridSteps; xIndex += 1) {
    for (let zIndex = 0; zIndex < gridSteps; zIndex += 1) {
      const x =
        maxX === 0 ? 0 : -maxX + (maxX * 2 * xIndex) / (gridSteps - 1);
      const z =
        maxZ === 0 ? 0 : -maxZ + (maxZ * 2 * zIndex) / (gridSteps - 1);
      candidates.push({
        x,
        z,
        rotationY: 0,
        reason: "Auto found open floor space",
      });
      candidates.push({
        x,
        z,
        rotationY: Math.PI / 2,
        reason: "Auto found open rotated space",
      });
    }
  }

  const orderedCandidates = wallFirst.has(topCategory)
    ? [...candidates.slice(1, 5), candidates[0], ...candidates.slice(5)]
    : candidates;

  let bestPlacement: PendingCatalogPlacement | null = null;
  let bestScore = -Infinity;
  for (const candidate of orderedCandidates) {
    const [safeX, safeZ] = geometry.clampToRoom(
      targetRoom,
      candidate.x,
      candidate.z,
      widthMeters,
      depthMeters,
      candidate.rotationY
    );
    const position: [number, number, number] = [
      safeX,
      getCeilingMountedItemBaseY({
        product,
        dimsMm: resolved.dimsMm,
        roomHeight:
          targetRoom.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight,
      }),
      safeZ,
    ];
    if (
      !geometry.isContainedInRoom(
        targetRoom,
        position,
        candidate.rotationY,
        resolved.dimsMm
      )
    ) {
      continue;
    }
    if (
      geometry.collidesInRoom(
        targetRoom,
        productId,
        position,
        candidate.rotationY,
        resolved.dimsMm
      )
    ) {
      continue;
    }
    const placement: PendingCatalogPlacement = {
      productId,
      variantId: resolved.variantId,
      purchaseOptionId,
      roomId: targetRoom.id,
      position,
      rotationY: candidate.rotationY,
      reason: candidate.reason,
    };
    const score = scoreCatalogPlacementCandidate({
      placement,
      room: targetRoom,
      instanceId: "smart-catalog-placement",
      catalogItems,
      openings,
    })?.score;
    if (score !== undefined && score > bestScore) {
      bestScore = score;
      bestPlacement = placement;
    }
  }

  return bestPlacement;
}

type FindCatalogPlacementImprovementOptions = {
  pendingPlacement: PendingCatalogPlacement | null;
  currentScore: ManualPlacementScore | null;
  targetRoom: RoomSnapshot | null;
  findPlacement: FindSmartCatalogPlacement;
  scorePlacement: ScoreCatalogPlacement;
};

export function findCatalogPlacementImprovement({
  pendingPlacement,
  currentScore,
  targetRoom,
  findPlacement,
  scorePlacement,
}: FindCatalogPlacementImprovementOptions): CatalogPlacementImprovement | null {
  if (!pendingPlacement || !currentScore || !targetRoom) return null;
  const bestPlacement = findPlacement(
    pendingPlacement.productId,
    pendingPlacement.variantId,
    pendingPlacement.purchaseOptionId,
    targetRoom
  );
  if (!bestPlacement) return null;
  const bestScore = scorePlacement(
    bestPlacement,
    targetRoom,
    "pending-catalog-placement-improvement"
  )?.score;
  if (bestScore === undefined) return null;
  const positionDelta = Math.hypot(
    bestPlacement.position[0] - pendingPlacement.position[0],
    bestPlacement.position[2] - pendingPlacement.position[2]
  );
  const rotationDelta = Math.abs(
    bestPlacement.rotationY - pendingPlacement.rotationY
  );
  const scoreDelta = bestScore - currentScore.score;
  if (
    scoreDelta < CATALOG_PLACEMENT_MIN_SCORE_DELTA ||
    (positionDelta < CATALOG_PLACEMENT_POSITION_EPSILON_METERS &&
      rotationDelta < CATALOG_PLACEMENT_ROTATION_EPSILON_RADIANS)
  ) {
    return null;
  }
  return {
    placement: {
      ...bestPlacement,
      reason: `Improved placement (${bestScore}/100)`,
    },
    score: bestScore,
    scoreDelta,
  };
}

type FindBestCatalogRoomPlacementOptions = {
  pendingPlacement: PendingCatalogPlacement | null;
  currentScore: ManualPlacementScore | null;
  rooms: RoomSnapshot[];
  currentRoomId: string;
  findPlacement: FindSmartCatalogPlacement;
  scorePlacement: ScoreCatalogPlacement;
};

export function findBestCatalogRoomPlacement({
  pendingPlacement,
  currentScore,
  rooms,
  currentRoomId,
  findPlacement,
  scorePlacement,
}: FindBestCatalogRoomPlacementOptions): CatalogBestRoomPlacement | null {
  if (!pendingPlacement || !currentScore || rooms.length < 2) return null;
  let best: CatalogBestRoomPlacement | null = null;

  for (const room of rooms) {
    if (room.id === currentRoomId) continue;
    const placement = findPlacement(
      pendingPlacement.productId,
      pendingPlacement.variantId,
      pendingPlacement.purchaseOptionId,
      room
    );
    if (!placement) continue;
    const score = scorePlacement(
      placement,
      room,
      "pending-catalog-best-room"
    );
    if (!score || isCatalogPlacementScoreHardInvalid(score)) continue;
    const scoreDelta = score.score - currentScore.score;
    if (!best || score.score > best.score) {
      best = {
        placement: {
          ...placement,
          reason: `Best room: ${room.name} (${score.score}/100)`,
        },
        roomName: room.name,
        score: score.score,
        scoreDelta,
      };
    }
  }

  if (!best || best.scoreDelta < CATALOG_PLACEMENT_MIN_SCORE_DELTA) return null;
  return best;
}

type FindBestCatalogVariantPlacementOptions = {
  pendingPlacement: PendingCatalogPlacement | null;
  currentScore: ManualPlacementScore | null;
  targetRoom: RoomSnapshot | null;
  product: CatalogItemSchema | null;
  findPlacement: FindSmartCatalogPlacement;
  scorePlacement: ScoreCatalogPlacement;
};

export function findBestCatalogVariantPlacement({
  pendingPlacement,
  currentScore,
  targetRoom,
  product,
  findPlacement,
  scorePlacement,
}: FindBestCatalogVariantPlacementOptions): CatalogBestVariantPlacement | null {
  if (
    !pendingPlacement ||
    !currentScore ||
    !targetRoom ||
    !product ||
    product.variants.length < 2
  ) {
    return null;
  }
  const currentVariant = resolveCatalogVariant(
    product,
    pendingPlacement.variantId
  );
  let best: CatalogBestVariantPlacement | null = null;

  for (const variant of product.variants) {
    if (variant.id === currentVariant.variantId) continue;
    const placement = findPlacement(
      pendingPlacement.productId,
      variant.id,
      pendingPlacement.purchaseOptionId,
      targetRoom
    );
    if (!placement) continue;
    const score = scorePlacement(
      placement,
      targetRoom,
      "pending-catalog-best-option"
    );
    if (!score || isCatalogPlacementScoreHardInvalid(score)) continue;
    const scoreDelta = score.score - currentScore.score;
    if (!best || score.score > best.score) {
      best = {
        placement: {
          ...placement,
          reason: `Best option: ${variant.label} (${score.score}/100)`,
        },
        variantLabel: variant.label,
        score: score.score,
        scoreDelta,
      };
    }
  }

  if (!best || best.scoreDelta < CATALOG_PLACEMENT_MIN_SCORE_DELTA) return null;
  return best;
}

export function findRestorableCatalogPlacement(
  pendingPlacement: PendingCatalogPlacement | null,
  lastValidPlacement: PendingCatalogPlacement | null
): PendingCatalogPlacement | null {
  if (!pendingPlacement || !lastValidPlacement) return null;
  if (pendingPlacement.productId !== lastValidPlacement.productId) return null;
  if (pendingPlacement.variantId !== lastValidPlacement.variantId) return null;
  if (pendingPlacement.purchaseOptionId !== lastValidPlacement.purchaseOptionId) {
    return null;
  }
  const distance = Math.hypot(
    pendingPlacement.position[0] - lastValidPlacement.position[0],
    pendingPlacement.position[2] - lastValidPlacement.position[2]
  );
  const rotationDelta = Math.abs(
    pendingPlacement.rotationY - lastValidPlacement.rotationY
  );
  if (
    distance < CATALOG_PLACEMENT_POSITION_EPSILON_METERS &&
    rotationDelta < CATALOG_PLACEMENT_ROTATION_EPSILON_RADIANS
  ) {
    return null;
  }
  return lastValidPlacement;
}

type ResolveNextLastValidCatalogPlacementOptions = {
  currentLastValidPlacement: PendingCatalogPlacement | null;
  pendingPlacement: PendingCatalogPlacement | null;
  hardInvalid: boolean;
};

export function resolveNextLastValidCatalogPlacement({
  currentLastValidPlacement,
  pendingPlacement,
  hardInvalid,
}: ResolveNextLastValidCatalogPlacementOptions): PendingCatalogPlacement | null {
  if (!pendingPlacement) return null;
  if (hardInvalid) return currentLastValidPlacement;
  return pendingPlacement;
}

type ResolveCatalogPlacementQualityOptions = {
  pendingPlacement: PendingCatalogPlacement | null;
  score: ManualPlacementScore | null;
  blocked: boolean;
  blockerLabel: string | null;
  targetRoom: RoomSnapshot | null;
  catalogItems: CatalogPlacementCatalog;
};

export function resolveCatalogPlacementQuality({
  pendingPlacement,
  score,
  blocked,
  blockerLabel,
  targetRoom,
  catalogItems,
}: ResolveCatalogPlacementQualityOptions): CatalogPlacementQuality | null {
  if (!pendingPlacement) return null;
  if (score) {
    return {
      label: `${score.label} (${score.score})`,
      tone:
        score.kind === "great"
          ? "good"
          : score.kind === "okay"
            ? "warn"
            : "bad",
    };
  }
  if (blocked) {
    return {
      label: blockerLabel ? `Blocked by ${blockerLabel}` : "Blocked",
      tone: "bad",
    };
  }
  const product = catalogItems[pendingPlacement.productId];
  if (!targetRoom || !product) return null;
  const resolved = resolveCatalogVariant(product, pendingPlacement.variantId);
  const [effectiveWidth, effectiveDepth] = getRotatedFootprint(
    resolved.dimsMm.w / 1000,
    resolved.dimsMm.d / 1000,
    pendingPlacement.rotationY
  );
  const targetWallThickness =
    targetRoom.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness;
  const clearX =
    targetRoom.geometry.width / 2 -
    targetWallThickness -
    effectiveWidth / 2 -
    Math.abs(pendingPlacement.position[0]);
  const clearZ =
    targetRoom.geometry.depth / 2 -
    targetWallThickness -
    effectiveDepth / 2 -
    Math.abs(pendingPlacement.position[2]);
  const nearestClearance = Math.min(clearX, clearZ);
  const topCategory = mapToTopCategory(product.category, product);
  const zoneFit =
    targetRoom.zones.length === 0 ||
    (topCategory === "dining_table" || topCategory === "dining_bench"
      ? targetRoom.zones.some((zone) => zone.type === "dining")
      : topCategory === "tv_console"
        ? targetRoom.zones.some((zone) => zone.type === "tv")
        : true);
  if (nearestClearance < 0.12) {
    return { label: "Tight to wall", tone: "warn" };
  }
  if (!zoneFit) {
    return { label: "No matching zone", tone: "warn" };
  }
  return {
    label: nearestClearance > 0.55 ? "Good spacing" : "Usable spacing",
    tone: "good",
  };
}

export type CatalogPlacementAssessment = {
  scoreHardInvalid: boolean;
  hardInvalid: boolean;
  statusLabel: string;
  shouldConfirmImproved: boolean;
  shouldConfirmRestored: boolean;
};

type ResolveCatalogPlacementAssessmentOptions = {
  pendingPlacement: PendingCatalogPlacement | null;
  blocked: boolean;
  blockerLabel: string | null;
  targetRoomName: string | null;
  score: ManualPlacementScore | null;
  improvement: CatalogPlacementImprovement | null;
  restorablePlacement: PendingCatalogPlacement | null;
};

export function resolveCatalogPlacementAssessment({
  pendingPlacement,
  blocked,
  blockerLabel,
  targetRoomName,
  score,
  improvement,
  restorablePlacement,
}: ResolveCatalogPlacementAssessmentOptions): CatalogPlacementAssessment {
  const scoreHardInvalid = isCatalogPlacementScoreHardInvalid(score);
  const hardInvalid = Boolean(
    pendingPlacement && (blocked || scoreHardInvalid)
  );
  const statusLabel = blocked
    ? blockerLabel
      ? `Blocked by ${blockerLabel}`
      : `Blocked in ${targetRoomName ?? "target room"}`
    : score?.kind === "blocks_path"
      ? "Blocks walking path"
      : score?.kind === "cramped"
        ? "Cramped placement"
        : "Valid placement";
  const shouldConfirmImproved = Boolean(improvement && hardInvalid);
  const shouldConfirmRestored = Boolean(
    !shouldConfirmImproved && hardInvalid && restorablePlacement
  );
  return {
    scoreHardInvalid,
    hardInvalid,
    statusLabel,
    shouldConfirmImproved,
    shouldConfirmRestored,
  };
}

export type CatalogPlacementConfirmationDecision = {
  placement: PendingCatalogPlacement | null;
  source: "none" | "current" | "improved" | "restored" | "blocked";
  blockedMessage: string | null;
};

type ResolveCatalogPlacementConfirmationOptions = {
  pendingPlacement: PendingCatalogPlacement | null;
  improvement: CatalogPlacementImprovement | null;
  restorablePlacement: PendingCatalogPlacement | null;
  assessment: CatalogPlacementAssessment;
  score: ManualPlacementScore | null;
  blockerLabel: string | null;
};

export function resolveCatalogPlacementConfirmation({
  pendingPlacement,
  improvement,
  restorablePlacement,
  assessment,
  score,
  blockerLabel,
}: ResolveCatalogPlacementConfirmationOptions): CatalogPlacementConfirmationDecision {
  if (!pendingPlacement) {
    return { placement: null, source: "none", blockedMessage: null };
  }
  if (assessment.shouldConfirmImproved && improvement) {
    return {
      placement: improvement.placement,
      source: "improved",
      blockedMessage: null,
    };
  }
  if (assessment.shouldConfirmRestored && restorablePlacement) {
    return {
      placement: restorablePlacement,
      source: "restored",
      blockedMessage: null,
    };
  }
  if (assessment.hardInvalid) {
    return {
      placement: pendingPlacement,
      source: "blocked",
      blockedMessage:
        assessment.scoreHardInvalid && score?.summary
          ? score.summary
          : blockerLabel
            ? `Blocked by ${blockerLabel}`
            : "Placement blocked by another item. Move it or choose a different item.",
    };
  }
  return {
    placement: pendingPlacement,
    source: "current",
    blockedMessage: null,
  };
}

export type CatalogPlacementRoomTargetOptions = {
  source: "room" | "zone";
  localPosition?: [number, number, number];
  zoneLabel?: string;
};

export type CatalogPlacementRoomTargetDecision = {
  placement: PendingCatalogPlacement;
  target: CatalogPlacementPreviewTarget;
  message: string;
};

type ResolveCatalogPlacementRoomTargetOptions = {
  pendingPlacement: PendingCatalogPlacement;
  targetRoom: RoomSnapshot;
  options: CatalogPlacementRoomTargetOptions;
  findPlacement: FindSmartCatalogPlacement;
  updateDraft: (
    placement: PendingCatalogPlacement,
    rawPosition: [number, number, number],
    rotationY: number,
    fallbackReason: string,
    targetRoom: RoomSnapshot
  ) => PendingCatalogPlacement | null;
  isAcceptable: (
    placement: PendingCatalogPlacement,
    targetRoom: RoomSnapshot
  ) => boolean;
};

export function resolveCatalogPlacementRoomTarget({
  pendingPlacement,
  targetRoom,
  options,
  findPlacement,
  updateDraft,
  isAcceptable,
}: ResolveCatalogPlacementRoomTargetOptions): CatalogPlacementRoomTargetDecision | null {
  const smartPlacement =
    options.localPosition === undefined
      ? findPlacement(
          pendingPlacement.productId,
          pendingPlacement.variantId,
          pendingPlacement.purchaseOptionId,
          targetRoom
        )
      : null;
  const nextPlacement =
    smartPlacement ??
    updateDraft(
      { ...pendingPlacement, roomId: targetRoom.id },
      options.localPosition ?? [0, 0, 0],
      pendingPlacement.rotationY,
      options.source === "zone" && options.zoneLabel
        ? `Tapped ${options.zoneLabel}`
        : `Tapped ${targetRoom.name}`,
      targetRoom
    );
  if (!nextPlacement) return null;
  const placement = {
    ...nextPlacement,
    roomId: targetRoom.id,
    reason:
      options.source === "zone" && options.zoneLabel
        ? `Tapped ${options.zoneLabel}`
        : nextPlacement.reason,
  };
  return {
    placement,
    target: {
      roomId: targetRoom.id,
      label: targetRoom.name,
      valid: isAcceptable(nextPlacement, targetRoom),
      kind: "preview",
    },
    message:
      options.source === "zone" && options.zoneLabel
        ? `Moved preview to ${options.zoneLabel}`
        : `Moved preview to ${targetRoom.name}`,
  };
}
