"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import type { ThreeEvent } from "@react-three/fiber";

import { CATALOG_ITEMS } from "@/lib/catalog";
import {
  buildCatalogFallbackPlacement,
  buildCatalogPlacementPreview as resolveCatalogPlacementPreview,
  buildCatalogSupportSurfaceHighlight,
  buildPendingCatalogPlacementScene,
  doesCatalogPlacementCollide,
  findCatalogSurfacePlacement,
  getCeilingMountedItemBaseY,
  isCeilingOnlyCatalogItem,
  isSurfaceOnlyCatalogItem,
  updatePendingCatalogPlacementDraft as resolvePendingCatalogPlacementDraft,
  type CatalogPlacementRoomClamp,
  type PendingCatalogPlacement,
} from "@/lib/catalog-placement";
import type { CatalogItemSchema, DimensionsMm } from "@/lib/catalog-schema";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { mapToTopCategory } from "@/lib/catalog/view-builders";
import { computeCirculationAnalysis } from "@/lib/circulation-analysis";
import {
  getFurnitureWallInset,
  type AABB,
} from "@/lib/design-page-geometry";
import {
  ROOM_DIMENSION_DEFAULTS,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import type { RoomOpening2D } from "@/lib/editorScene";
import {
  scoreManualPlacement,
  type ManualPlacementScore,
} from "@/lib/manual-placement-scoring";
import { createLayoutVersion } from "@/lib/layout-versions";
import type {
  DesignItem,
  LayoutVersion,
  RoomSnapshot,
  ZoneMin,
} from "@/lib/room-types";

type CatalogPlacementDimensions = { w: number; d: number };
type CatalogPlacementExcludedItems = string | string[] | undefined;
type CatalogPlacementDragIntent = {
  productId: string;
  variantId?: string;
  purchaseOptionId?: string;
};
type CatalogPlacementPlanRoomTarget = { id: string };

type CatalogPlacementCollisionQuery = (
  productId: string,
  position: [number, number, number],
  rotationY: number,
  dimsMm: CatalogPlacementDimensions,
  excludedInstanceId?: CatalogPlacementExcludedItems
) => boolean;

type CatalogPlacementCollisionAgainstQuery = (
  productId: string,
  position: [number, number, number],
  rotationY: number,
  dimsMm: CatalogPlacementDimensions,
  candidateItems: DesignItem[]
) => boolean;

type CatalogPlacementRoomCollisionQuery = (
  room: RoomSnapshot,
  productId: string,
  position: [number, number, number],
  rotationY: number,
  dimsMm: CatalogPlacementDimensions,
  excludedInstanceId?: CatalogPlacementExcludedItems
) => boolean;

type CatalogPlacementRoomBlockerQuery = (
  room: RoomSnapshot,
  productId: string,
  position: [number, number, number],
  rotationY: number,
  dimsMm: CatalogPlacementDimensions,
  excludedInstanceId?: CatalogPlacementExcludedItems
) => DesignItem | null;

type CatalogPlacementRoomContainmentQuery = (
  room: RoomSnapshot,
  position: [number, number, number],
  rotationY: number,
  dimsMm: CatalogPlacementDimensions
) => boolean;

type CatalogPlacementRoomClampQuery = (
  room: RoomSnapshot,
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  rotationY?: number
) => [number, number];

export type DesignPageCatalogPlacementState = {
  pendingPlacement: PendingCatalogPlacement | null;
  hoverPlacement: PendingCatalogPlacement | null;
  lastValidPlacement: PendingCatalogPlacement | null;
  dragIntent: CatalogPlacementDragIntent | null;
  dragging: boolean;
};

export type DesignPageCatalogPlacementConfiguration = {
  activeRoom: RoomSnapshot | null;
  activeRoomId: string;
  rooms: RoomSnapshot[];
  roomSnapshotById: ReadonlyMap<string, RoomSnapshot>;
  houseRoomById: ReadonlyMap<string, HousePlanRoom2D>;
  planOpenings: RoomOpening2D[];
  roomWidth: number;
  roomDepth: number;
  wallThickness: number;
  placementAddMode: "preview" | "auto";
  hasWholeHousePlan: boolean;
  catalogCanvasDragDisabled: boolean;
};

type CommitItemsToRoomOptions = {
  activateRoom?: boolean;
  beforeLayoutVersion?: LayoutVersion;
};

type CommitCatalogPlacementItems = (
  roomId: string,
  updater: DesignItem[] | ((previous: DesignItem[]) => DesignItem[]),
  actionName?: string,
  options?: CommitItemsToRoomOptions
) => DesignItem[] | null;

export type CatalogPlacementPreviewTarget = {
  roomId: string;
  label: string;
  valid: boolean;
  kind: "preview";
};

export type CatalogPlacementTargetResult = {
  handled: true;
  target: CatalogPlacementPreviewTarget | null;
};

export type DesignPageCatalogPlacementAdapters = {
  getActiveItems: () => DesignItem[];
  getActiveRoomId: () => string;
  getRooms: () => RoomSnapshot[];
  getItemAABB: (item: DesignItem) => AABB | null;
  getItemDisplayName: (item: DesignItem | null | undefined) => string | null;
  getPlanningDimensions: (
    item: DesignItem,
    product: CatalogItemSchema
  ) => DimensionsMm;
  commitItemsToRoom: CommitCatalogPlacementItems;
  selectItems: (selection: {
    roomId: string;
    instanceIds: string[];
    primaryInstanceId: string;
  }) => void;
  createInstanceId: () => string;
  showToast: (message: string) => void;
  clampToActiveRoom: CatalogPlacementRoomClamp;
  clampToCatalogPlacementRoom: CatalogPlacementRoomClampQuery;
  catalogPlacementCollidesInRoom: CatalogPlacementRoomCollisionQuery;
  findCatalogPlacementBlockerInRoom: CatalogPlacementRoomBlockerQuery;
  isCatalogPlacementContainedInRoom: CatalogPlacementRoomContainmentQuery;
  resolveGroundPointFromClient: (
    clientX: number,
    clientY: number
  ) => [number, number, number] | null;
  findPlanRoomAtWorldPoint: (
    x: number,
    z: number
  ) => CatalogPlacementPlanRoomTarget | null;
  nudgeCameraForDrag: (event: ThreeEvent<PointerEvent>) => void;
  setCanvasObjectDragging: (dragging: boolean) => void;
  setPreviewTarget: (target: CatalogPlacementPreviewTarget | null) => void;
};

export type UseDesignPageCatalogPlacementOptions = {
  configuration: DesignPageCatalogPlacementConfiguration;
  adapters: DesignPageCatalogPlacementAdapters;
};

type PlacementQuality = {
  label: string;
  tone: "good" | "warn" | "bad";
};

type PlacementImprovement = {
  placement: PendingCatalogPlacement;
  score: number;
  scoreDelta: number;
};

type BestRoomPlacement = PlacementImprovement & {
  roomName: string;
};

type BestVariantPlacement = PlacementImprovement & {
  variantLabel: string;
};

export function useDesignPageCatalogPlacement({
  configuration,
  adapters,
}: UseDesignPageCatalogPlacementOptions) {
  const [pendingPlacement, setPendingPlacement] =
    useState<PendingCatalogPlacement | null>(null);
  const [lastValidPlacement, setLastValidPlacement] =
    useState<PendingCatalogPlacement | null>(null);
  const [hoverPlacement, setHoverPlacement] =
    useState<PendingCatalogPlacement | null>(null);
  const [dragIntent, setDragIntent] =
    useState<CatalogPlacementDragIntent | null>(null);
  const [dragging, setDragging] = useState(false);
  const pendingPlacementRef = useRef<PendingCatalogPlacement | null>(null);
  const dragOffsetRef = useRef<{ x: number; z: number } | null>(null);
  const dragMoveFrameRef = useRef<number | null>(null);
  const dragLatestClientRef = useRef<{
    clientX: number;
    clientY: number;
  } | null>(null);
  const dragLastWorldRef = useRef<{
    x: number;
    z: number;
    roomId: string;
  } | null>(null);
  const {
    activeRoom,
    activeRoomId,
    rooms,
    roomSnapshotById,
    houseRoomById,
    planOpenings,
    roomWidth,
    roomDepth,
    wallThickness,
    placementAddMode,
    hasWholeHousePlan,
    catalogCanvasDragDisabled,
  } = configuration;
  const {
    getActiveItems,
    getActiveRoomId,
    getRooms,
    getItemAABB,
    getItemDisplayName,
    getPlanningDimensions,
    commitItemsToRoom,
    selectItems,
    createInstanceId,
    showToast,
    clampToActiveRoom,
    clampToCatalogPlacementRoom,
    catalogPlacementCollidesInRoom,
    findCatalogPlacementBlockerInRoom,
    isCatalogPlacementContainedInRoom,
    resolveGroundPointFromClient,
    findPlanRoomAtWorldPoint,
    nudgeCameraForDrag,
    setCanvasObjectDragging,
    setPreviewTarget,
  } = adapters;

  const catalogPlacementCollides = useCallback<CatalogPlacementCollisionQuery>(
    (productId, position, rotationY, dimsMm, excludedInstanceId) =>
      doesCatalogPlacementCollide({
        productId,
        position,
        rotationY,
        dimsMm,
        items: getActiveItems(),
        getItemAABB,
        excludedInstanceId:
          typeof excludedInstanceId === "string" ? excludedInstanceId : undefined,
        excludedInstanceIds: Array.isArray(excludedInstanceId)
          ? excludedInstanceId
          : undefined,
      }),
    [getActiveItems, getItemAABB]
  );

  const catalogPlacementCollidesAgainst =
    useCallback<CatalogPlacementCollisionAgainstQuery>(
      (productId, position, rotationY, dimsMm, candidateItems) =>
        doesCatalogPlacementCollide({
          productId,
          position,
          rotationY,
          dimsMm,
          items: candidateItems,
          getItemAABB,
        }),
      [getItemAABB]
    );

  const pendingCatalogPlacementScene = useMemo(() => {
    const planRoom = houseRoomById.get(pendingPlacement?.roomId ?? activeRoomId);
    return buildPendingCatalogPlacementScene({
      placement: pendingPlacement,
      roomOffset: { x: planRoom?.x ?? 0, z: planRoom?.z ?? 0 },
    });
  }, [activeRoomId, houseRoomById, pendingPlacement]);

  const hoverCatalogPlacementScene = useMemo(() => {
    if (pendingPlacement) return null;
    const planRoom = houseRoomById.get(hoverPlacement?.roomId ?? activeRoomId);
    return buildPendingCatalogPlacementScene({
      placement: hoverPlacement,
      roomOffset: { x: planRoom?.x ?? 0, z: planRoom?.z ?? 0 },
    });
  }, [activeRoomId, hoverPlacement, houseRoomById, pendingPlacement]);

  const activeCatalogPlacementSurfaceHighlight = useMemo(() => {
    const placement = pendingPlacement ?? hoverPlacement;
    if (!placement) return null;
    const roomId = placement.roomId ?? activeRoomId;
    const placementRoom = roomSnapshotById.get(roomId) ?? activeRoom;
    if (!placementRoom) return null;
    const planRoom = houseRoomById.get(roomId);
    return buildCatalogSupportSurfaceHighlight({
      placement,
      items: placementRoom.items,
      roomOffset: { x: planRoom?.x ?? 0, z: planRoom?.z ?? 0 },
    });
  }, [
    activeRoom,
    activeRoomId,
    houseRoomById,
    hoverPlacement,
    pendingPlacement,
    roomSnapshotById,
  ]);

  const pendingCatalogPlacementRoom = useMemo(
    () =>
      pendingPlacement?.roomId
        ? roomSnapshotById.get(pendingPlacement.roomId) ?? activeRoom
        : activeRoom,
    [activeRoom, pendingPlacement, roomSnapshotById]
  );

  const pendingCatalogPlacementBlocked = useMemo(() => {
    if (!pendingPlacement) return false;
    const product = CATALOG_ITEMS[pendingPlacement.productId];
    if (!product) return true;
    const targetRoom = pendingPlacement.roomId
      ? roomSnapshotById.get(pendingPlacement.roomId)
      : activeRoom;
    if (!targetRoom) return true;
    const resolved = resolveCatalogVariant(product, pendingPlacement.variantId);
    if (
      !isCatalogPlacementContainedInRoom(
        targetRoom,
        pendingPlacement.position,
        pendingPlacement.rotationY,
        resolved.dimsMm
      )
    ) {
      return true;
    }
    return catalogPlacementCollidesInRoom(
      targetRoom,
      pendingPlacement.productId,
      pendingPlacement.position,
      pendingPlacement.rotationY,
      resolved.dimsMm,
      pendingPlacement.supportInstanceId
    );
  }, [
    activeRoom,
    catalogPlacementCollidesInRoom,
    isCatalogPlacementContainedInRoom,
    pendingPlacement,
    roomSnapshotById,
  ]);

  const pendingCatalogPlacementBlocker = useMemo(() => {
    if (!pendingPlacement) return null;
    const product = CATALOG_ITEMS[pendingPlacement.productId];
    const targetRoom = pendingPlacement.roomId
      ? roomSnapshotById.get(pendingPlacement.roomId)
      : activeRoom;
    if (!product || !targetRoom) return null;
    const resolved = resolveCatalogVariant(product, pendingPlacement.variantId);
    return findCatalogPlacementBlockerInRoom(
      targetRoom,
      pendingPlacement.productId,
      pendingPlacement.position,
      pendingPlacement.rotationY,
      resolved.dimsMm,
      pendingPlacement.supportInstanceId
    );
  }, [
    activeRoom,
    findCatalogPlacementBlockerInRoom,
    pendingPlacement,
    roomSnapshotById,
  ]);

  const pendingCatalogPlacementBlockerLabel = useMemo(
    () => getItemDisplayName(pendingCatalogPlacementBlocker),
    [getItemDisplayName, pendingCatalogPlacementBlocker]
  );

  const restorableCatalogPlacement = useMemo(() => {
    if (!pendingPlacement || !lastValidPlacement) return null;
    if (pendingPlacement.productId !== lastValidPlacement.productId) return null;
    if (pendingPlacement.variantId !== lastValidPlacement.variantId) return null;
    if (pendingPlacement.purchaseOptionId !== lastValidPlacement.purchaseOptionId) return null;
    const distance = Math.hypot(
      pendingPlacement.position[0] - lastValidPlacement.position[0],
      pendingPlacement.position[2] - lastValidPlacement.position[2]
    );
    const rotationDelta = Math.abs(
      pendingPlacement.rotationY - lastValidPlacement.rotationY
    );
    if (distance < 0.08 && rotationDelta < 0.01) return null;
    return lastValidPlacement;
  }, [lastValidPlacement, pendingPlacement]);

  const pendingCatalogPlacementScore = useMemo<ManualPlacementScore | null>(() => {
    if (!pendingPlacement || dragging) return null;
    const product = CATALOG_ITEMS[pendingPlacement.productId];
    const targetRoom = pendingPlacement.roomId
      ? roomSnapshotById.get(pendingPlacement.roomId)
      : activeRoom;
    if (!product || !targetRoom) return null;
    const resolved = resolveCatalogVariant(product, pendingPlacement.variantId);
    return scoreManualPlacement({
      room: targetRoom,
      item: {
        instanceId: "pending-catalog-placement",
        productId: pendingPlacement.productId,
        variantId: resolved.variantId,
        position: pendingPlacement.position,
        rotationY: pendingPlacement.rotationY,
      },
      dimsMm: resolved.dimsMm,
      catalogItems: CATALOG_ITEMS,
      openings: planOpenings,
      blocker: pendingCatalogPlacementBlocker,
      variant: resolved.variant,
      existingItems: targetRoom.items,
    });
  }, [
    activeRoom,
    dragging,
    pendingPlacement,
    pendingCatalogPlacementBlocker,
    planOpenings,
    roomSnapshotById,
  ]);

  const isCatalogPlacementTargetAcceptable = useCallback(
    (placement: PendingCatalogPlacement, targetRoom: RoomSnapshot): boolean => {
      const product = CATALOG_ITEMS[placement.productId];
      if (!product) return false;
      const resolved = resolveCatalogVariant(product, placement.variantId);
      if (
        !isCatalogPlacementContainedInRoom(
          targetRoom,
          placement.position,
          placement.rotationY,
          resolved.dimsMm
        )
      ) {
        return false;
      }
      if (
        catalogPlacementCollidesInRoom(
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
      const score = scoreManualPlacement({
        room: targetRoom,
        item: {
          instanceId: "catalog-placement-target-check",
          productId: placement.productId,
          variantId: resolved.variantId,
          position: placement.position,
          rotationY: placement.rotationY,
        },
        dimsMm: resolved.dimsMm,
        catalogItems: CATALOG_ITEMS,
        openings: planOpenings,
        variant: resolved.variant,
        existingItems: targetRoom.items,
      });
      return score.kind !== "blocks_path" && score.kind !== "cramped";
    },
    [catalogPlacementCollidesInRoom, isCatalogPlacementContainedInRoom, planOpenings]
  );

  const hoverCatalogPlacementScore = useMemo<ManualPlacementScore | null>(() => {
    if (!hoverPlacement || pendingPlacement) return null;
    const product = CATALOG_ITEMS[hoverPlacement.productId];
    const targetRoom = hoverPlacement.roomId
      ? roomSnapshotById.get(hoverPlacement.roomId)
      : activeRoom;
    if (!product || !targetRoom) return null;
    const resolved = resolveCatalogVariant(product, hoverPlacement.variantId);
    const blocker = findCatalogPlacementBlockerInRoom(
      targetRoom,
      hoverPlacement.productId,
      hoverPlacement.position,
      hoverPlacement.rotationY,
      resolved.dimsMm
    );
    return scoreManualPlacement({
      room: targetRoom,
      item: {
        instanceId: "hover-catalog-placement",
        productId: hoverPlacement.productId,
        variantId: resolved.variantId,
        position: hoverPlacement.position,
        rotationY: hoverPlacement.rotationY,
      },
      dimsMm: resolved.dimsMm,
      catalogItems: CATALOG_ITEMS,
      openings: planOpenings,
      blocker,
      variant: resolved.variant,
      existingItems: targetRoom.items,
    });
  }, [
    activeRoom,
    findCatalogPlacementBlockerInRoom,
    hoverPlacement,
    pendingPlacement,
    planOpenings,
    roomSnapshotById,
  ]);

  const activePlacementCompatibleZoneIds = useMemo(
    () =>
      new Set(
        pendingCatalogPlacementScore?.compatibleZoneIds ??
          hoverCatalogPlacementScore?.compatibleZoneIds ??
          []
      ),
    [hoverCatalogPlacementScore, pendingCatalogPlacementScore]
  );

  const circulationHeatmap = useMemo(() => {
    const placement = pendingPlacement ?? hoverPlacement;
    if (!placement) return null;
    const targetRoom = placement.roomId
      ? roomSnapshotById.get(placement.roomId)
      : activeRoom;
    const planRoom = placement.roomId ? houseRoomById.get(placement.roomId) : null;
    if (!targetRoom) return null;
    const product = CATALOG_ITEMS[placement.productId];
    if (!product) return null;
    const resolved = resolveCatalogVariant(product, placement.variantId);
    const analysis = computeCirculationAnalysis({
      room: targetRoom,
      items: [
        ...targetRoom.items,
        {
          instanceId: "placement-circulation-preview",
          productId: placement.productId,
          variantId: resolved.variantId,
          position: placement.position,
          rotationY: placement.rotationY,
        } as DesignItem,
      ],
      catalogItems: CATALOG_ITEMS,
      openings: planOpenings,
      zones: targetRoom.zones,
    });
    const shouldShow =
      pendingCatalogPlacementScore?.kind === "blocks_path" ||
      hoverCatalogPlacementScore?.kind === "blocks_path" ||
      analysis.warnings.length > 0;
    if (!shouldShow) return null;
    return {
      roomOffset: { x: planRoom?.x ?? 0, z: planRoom?.z ?? 0 },
      analysis,
    };
  }, [
    activeRoom,
    hoverPlacement,
    hoverCatalogPlacementScore?.kind,
    houseRoomById,
    pendingPlacement,
    pendingCatalogPlacementScore?.kind,
    planOpenings,
    roomSnapshotById,
  ]);

  const pendingCatalogPlacementQuality = useMemo<PlacementQuality | null>(() => {
    if (!pendingPlacement) return null;
    if (pendingCatalogPlacementScore) {
      return {
        label: `${pendingCatalogPlacementScore.label} (${pendingCatalogPlacementScore.score})`,
        tone:
          pendingCatalogPlacementScore.kind === "great"
            ? "good"
            : pendingCatalogPlacementScore.kind === "okay"
              ? "warn"
              : "bad",
      };
    }
    if (pendingCatalogPlacementBlocked) {
      return {
        label: pendingCatalogPlacementBlockerLabel
          ? `Blocked by ${pendingCatalogPlacementBlockerLabel}`
          : "Blocked",
        tone: "bad",
      };
    }
    const targetRoom = pendingPlacement.roomId
      ? roomSnapshotById.get(pendingPlacement.roomId)
      : activeRoom;
    const product = CATALOG_ITEMS[pendingPlacement.productId];
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
  }, [
    activeRoom,
    pendingPlacement,
    pendingCatalogPlacementBlocked,
    pendingCatalogPlacementBlockerLabel,
    pendingCatalogPlacementScore,
    roomSnapshotById,
  ]);

  const buildCatalogPlacementPreview = useCallback(
    (
      productId: string,
      variantId?: string,
      purchaseOptionId?: string
    ): PendingCatalogPlacement | null =>
      resolveCatalogPlacementPreview({
        productId,
        variantId,
        purchaseOptionId,
        canPlace: Boolean(activeRoom),
        surfaceItems: activeRoom?.items,
        roomId: activeRoom?.id ?? getActiveRoomId(),
        roomWidth,
        roomDepth,
        roomHeight: activeRoom?.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight,
        wallThickness,
        clampToActiveRoom,
        collides: catalogPlacementCollides,
      }),
    [
      activeRoom,
      catalogPlacementCollides,
      clampToActiveRoom,
      getActiveRoomId,
      roomDepth,
      roomWidth,
      wallThickness,
    ]
  );

  const findSmartCatalogPlacement = useCallback(
    (
      productId: string,
      variantId?: string,
      purchaseOptionId?: string,
      targetRoom: RoomSnapshot | null = activeRoom
    ): PendingCatalogPlacement | null => {
      const product = CATALOG_ITEMS[productId];
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
        { x: 0, z: maxZ, rotationY: Math.PI, reason: "Auto placed near front wall" },
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
        const [safeX, safeZ] = clampToCatalogPlacementRoom(
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
          !isCatalogPlacementContainedInRoom(
            targetRoom,
            position,
            candidate.rotationY,
            resolved.dimsMm
          )
        ) {
          continue;
        }
        if (
          catalogPlacementCollidesInRoom(
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
        const score = scoreManualPlacement({
          room: targetRoom,
          item: {
            instanceId: "smart-catalog-placement",
            productId,
            variantId: resolved.variantId,
            position,
            rotationY: candidate.rotationY,
          },
          dimsMm: resolved.dimsMm,
          catalogItems: CATALOG_ITEMS,
          openings: planOpenings,
          variant: resolved.variant,
          existingItems: targetRoom.items,
        }).score;
        if (score > bestScore) {
          bestScore = score;
          bestPlacement = placement;
        }
      }

      return bestPlacement;
    },
    [
      activeRoom,
      catalogPlacementCollidesInRoom,
      clampToCatalogPlacementRoom,
      isCatalogPlacementContainedInRoom,
      planOpenings,
    ]
  );

  const pendingCatalogPlacementImprovement = useMemo<PlacementImprovement | null>(() => {
    if (!pendingPlacement || !pendingCatalogPlacementScore) return null;
    const targetRoom =
      roomSnapshotById.get(pendingPlacement.roomId ?? getActiveRoomId()) ?? activeRoom;
    if (!targetRoom) return null;
    const product = CATALOG_ITEMS[pendingPlacement.productId];
    if (!product) return null;
    const bestPlacement = findSmartCatalogPlacement(
      pendingPlacement.productId,
      pendingPlacement.variantId,
      pendingPlacement.purchaseOptionId,
      targetRoom
    );
    if (!bestPlacement) return null;
    const resolved = resolveCatalogVariant(product, bestPlacement.variantId);
    const bestScore = scoreManualPlacement({
      room: targetRoom,
      item: {
        instanceId: "pending-catalog-placement-improvement",
        productId: bestPlacement.productId,
        variantId: resolved.variantId,
        position: bestPlacement.position,
        rotationY: bestPlacement.rotationY,
      },
      dimsMm: resolved.dimsMm,
      catalogItems: CATALOG_ITEMS,
      openings: planOpenings,
      variant: resolved.variant,
      existingItems: targetRoom.items,
    }).score;
    const positionDelta = Math.hypot(
      bestPlacement.position[0] - pendingPlacement.position[0],
      bestPlacement.position[2] - pendingPlacement.position[2]
    );
    const rotationDelta = Math.abs(
      bestPlacement.rotationY - pendingPlacement.rotationY
    );
    const scoreDelta = bestScore - pendingCatalogPlacementScore.score;
    if (scoreDelta < 4 || (positionDelta < 0.08 && rotationDelta < 0.01)) {
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
  }, [
    activeRoom,
    findSmartCatalogPlacement,
    getActiveRoomId,
    pendingPlacement,
    pendingCatalogPlacementScore,
    planOpenings,
    roomSnapshotById,
  ]);

  const pendingCatalogBestRoomPlacement = useMemo<BestRoomPlacement | null>(() => {
    if (!pendingPlacement || !pendingCatalogPlacementScore || rooms.length < 2) {
      return null;
    }
    const product = CATALOG_ITEMS[pendingPlacement.productId];
    if (!product) return null;
    const currentRoomId = pendingPlacement.roomId ?? activeRoom?.id ?? activeRoomId;
    let best: BestRoomPlacement | null = null;

    for (const room of rooms) {
      if (room.id === currentRoomId) continue;
      const placement = findSmartCatalogPlacement(
        pendingPlacement.productId,
        pendingPlacement.variantId,
        pendingPlacement.purchaseOptionId,
        room
      );
      if (!placement) continue;
      const resolved = resolveCatalogVariant(product, placement.variantId);
      const score = scoreManualPlacement({
        room,
        item: {
          instanceId: "pending-catalog-best-room",
          productId: placement.productId,
          variantId: resolved.variantId,
          position: placement.position,
          rotationY: placement.rotationY,
        },
        dimsMm: resolved.dimsMm,
        catalogItems: CATALOG_ITEMS,
        openings: planOpenings,
        variant: resolved.variant,
        existingItems: room.items,
      });
      if (score.kind === "blocks_path" || score.kind === "cramped") continue;
      const scoreDelta = score.score - pendingCatalogPlacementScore.score;
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

    if (!best || best.scoreDelta < 4) return null;
    return best;
  }, [
    activeRoom?.id,
    activeRoomId,
    findSmartCatalogPlacement,
    pendingPlacement,
    pendingCatalogPlacementScore,
    planOpenings,
    rooms,
  ]);

  const pendingCatalogBestVariantPlacement = useMemo<BestVariantPlacement | null>(() => {
    if (!pendingPlacement || !pendingCatalogPlacementScore) return null;
    const targetRoom =
      roomSnapshotById.get(pendingPlacement.roomId ?? getActiveRoomId()) ??
      activeRoom;
    const product = CATALOG_ITEMS[pendingPlacement.productId];
    if (!targetRoom || !product || product.variants.length < 2) return null;
    const currentVariant = resolveCatalogVariant(product, pendingPlacement.variantId);
    let best: BestVariantPlacement | null = null;

    for (const variant of product.variants) {
      if (variant.id === currentVariant.variantId) continue;
      const placement = findSmartCatalogPlacement(
        pendingPlacement.productId,
        variant.id,
        pendingPlacement.purchaseOptionId,
        targetRoom
      );
      if (!placement) continue;
      const resolved = resolveCatalogVariant(product, variant.id);
      const score = scoreManualPlacement({
        room: targetRoom,
        item: {
          instanceId: "pending-catalog-best-option",
          productId: placement.productId,
          variantId: resolved.variantId,
          position: placement.position,
          rotationY: placement.rotationY,
        },
        dimsMm: resolved.dimsMm,
        catalogItems: CATALOG_ITEMS,
        openings: planOpenings,
        variant: resolved.variant,
        existingItems: targetRoom.items,
      });
      if (score.kind === "blocks_path" || score.kind === "cramped") continue;
      const scoreDelta = score.score - pendingCatalogPlacementScore.score;
      if (!best || score.score > best.score) {
        best = {
          placement: {
            ...placement,
            reason: `Best option: ${resolved.variant.label} (${score.score}/100)`,
          },
          variantLabel: resolved.variant.label,
          score: score.score,
          scoreDelta,
        };
      }
    }

    if (!best || best.scoreDelta < 4) return null;
    return best;
  }, [
    activeRoom,
    findSmartCatalogPlacement,
    getActiveRoomId,
    pendingPlacement,
    pendingCatalogPlacementScore,
    planOpenings,
    roomSnapshotById,
  ]);

  const pendingCatalogPlacementScoreHardInvalid =
    pendingCatalogPlacementScore?.kind === "blocks_path" ||
    pendingCatalogPlacementScore?.kind === "cramped";
  const pendingCatalogPlacementHardInvalid = Boolean(
    pendingPlacement &&
      (pendingCatalogPlacementBlocked || pendingCatalogPlacementScoreHardInvalid)
  );
  const pendingCatalogPlacementStatusLabel = pendingCatalogPlacementBlocked
    ? pendingCatalogPlacementBlockerLabel
      ? `Blocked by ${pendingCatalogPlacementBlockerLabel}`
      : `Blocked in ${pendingCatalogPlacementRoom?.name ?? "target room"}`
    : pendingCatalogPlacementScore?.kind === "blocks_path"
      ? "Blocks walking path"
      : pendingCatalogPlacementScore?.kind === "cramped"
        ? "Cramped placement"
        : "Valid placement";
  const shouldConfirmImprovedCatalogPlacement = Boolean(
    pendingCatalogPlacementImprovement && pendingCatalogPlacementHardInvalid
  );
  const shouldConfirmRestoredCatalogPlacement = Boolean(
    !shouldConfirmImprovedCatalogPlacement &&
      pendingCatalogPlacementHardInvalid &&
      restorableCatalogPlacement
  );

  const updatePendingCatalogPlacementDraft = useCallback(
    (
      placement: PendingCatalogPlacement,
      rawPosition: [number, number, number],
      rotationY: number,
      fallbackReason: string,
      targetRoom?: RoomSnapshot | null
    ): PendingCatalogPlacement | null => {
      const placementRoom =
        targetRoom ??
        roomSnapshotById.get(placement.roomId ?? getActiveRoomId()) ??
        activeRoom;
      if (!placementRoom) return null;

      const product = CATALOG_ITEMS[placement.productId];
      if (isSurfaceOnlyCatalogItem(product)) {
        return findCatalogSurfacePlacement({
          productId: placement.productId,
          variantId: placement.variantId,
          purchaseOptionId: placement.purchaseOptionId,
          roomId: placementRoom.id,
          items: placementRoom.items,
          nearPosition: rawPosition,
        });
      }

      return resolvePendingCatalogPlacementDraft({
        placement: {
          ...placement,
          roomId: placementRoom.id,
        },
        rawPosition,
        rotationY,
        fallbackReason,
        roomWidth: placementRoom.geometry.width,
        roomDepth: placementRoom.geometry.depth,
        roomHeight:
          placementRoom.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight,
        wallThickness:
          placementRoom.geometry.wallThickness ??
          ROOM_DIMENSION_DEFAULTS.wallThickness,
        clampToActiveRoom: (
          x,
          z,
          itemWidth,
          itemDepth,
          _targetRoomWidth,
          _targetRoomDepth,
          _targetWallThickness,
          nextRotationY
        ) =>
          clampToCatalogPlacementRoom(
            placementRoom,
            x,
            z,
            itemWidth,
            itemDepth,
            nextRotationY
          ),
      });
    },
    [
      activeRoom,
      clampToCatalogPlacementRoom,
      getActiveRoomId,
      roomSnapshotById,
    ]
  );

  const findBundleCompanionPlacement = useCallback(
    (
      targetRoom: RoomSnapshot,
      productId: string,
      variantId: string,
      position: [number, number, number],
      rotationY: number,
      candidateItems: DesignItem[]
    ): [number, number, number] | null => {
      const product = CATALOG_ITEMS[productId];
      if (!product) return null;
      const resolved = resolveCatalogVariant(product, variantId);
      const widthMeters = resolved.dimsMm.w / 1000;
      const depthMeters = resolved.dimsMm.d / 1000;
      const spacing = Math.max(
        0.75,
        Math.max(widthMeters, depthMeters) + 0.3
      );
      const side: [number, number] = [
        Math.cos(rotationY),
        -Math.sin(rotationY),
      ];
      const front: [number, number] = [
        Math.sin(rotationY),
        Math.cos(rotationY),
      ];
      const offsets: [number, number][] = [
        [side[0] * spacing, side[1] * spacing],
        [-side[0] * spacing, -side[1] * spacing],
        [front[0] * spacing, front[1] * spacing],
        [-front[0] * spacing, -front[1] * spacing],
      ];

      for (const [offsetX, offsetZ] of offsets) {
        const [safeX, safeZ] = clampToCatalogPlacementRoom(
          targetRoom,
          position[0] + offsetX,
          position[2] + offsetZ,
          widthMeters,
          depthMeters,
          rotationY
        );
        const candidatePosition: [number, number, number] = [
          safeX,
          position[1],
          safeZ,
        ];
        if (
          isCatalogPlacementContainedInRoom(
            targetRoom,
            candidatePosition,
            rotationY,
            resolved.dimsMm
          ) &&
          !catalogPlacementCollidesAgainst(
            productId,
            candidatePosition,
            rotationY,
            resolved.dimsMm,
            candidateItems
          )
        ) {
          return candidatePosition;
        }
      }

      return null;
    },
    [
      catalogPlacementCollidesAgainst,
      clampToCatalogPlacementRoom,
      isCatalogPlacementContainedInRoom,
    ]
  );

  const addCatalogPlacementToRoom = useCallback(
    (placement: PendingCatalogPlacement): boolean => {
      const product = CATALOG_ITEMS[placement.productId];
      if (!product) return false;
      const targetRoomId = placement.roomId ?? getActiveRoomId();
      const targetRoom = getRooms().find((room) => room.id === targetRoomId);
      if (!targetRoom) return false;
      const resolved = resolveCatalogVariant(product, placement.variantId);
      const purchaseOption = placement.purchaseOptionId
        ? resolved.variant.purchaseOptions?.find(
            (option) => option.id === placement.purchaseOptionId
          ) ?? null
        : null;
      const bundleQuantity = purchaseOption?.quantity ?? 1;

      if (bundleQuantity <= 1) {
        if (isSurfaceOnlyCatalogItem(product)) {
          const support = placement.supportInstanceId
            ? targetRoom.items.find(
                (item) => item.instanceId === placement.supportInstanceId
              )
            : null;
          if (!support) {
            showToast(
              "Add a table first, then place this lamp on its surface."
            );
            return false;
          }
        }
        const instanceId = createInstanceId();
        const [safeX, safeZ] = clampToCatalogPlacementRoom(
          targetRoom,
          placement.position[0],
          placement.position[2],
          resolved.dimsMm.w / 1000,
          resolved.dimsMm.d / 1000,
          placement.rotationY
        );
        const safePosition: [number, number, number] = [
          safeX,
          isCeilingOnlyCatalogItem(product)
            ? getCeilingMountedItemBaseY({
                product,
                dimsMm: resolved.dimsMm,
                roomHeight:
                  targetRoom.geometry.height ??
                  ROOM_DIMENSION_DEFAULTS.roomHeight,
              })
            : placement.position[1],
          safeZ,
        ];
        if (
          !isCatalogPlacementContainedInRoom(
            targetRoom,
            safePosition,
            placement.rotationY,
            resolved.dimsMm
          )
        ) {
          showToast(`Place fully inside ${targetRoom.name}`);
          return false;
        }
        const nextItem: DesignItem = {
          instanceId,
          productId: placement.productId,
          variantId: resolved.variantId,
          position: safePosition,
          rotationY: placement.rotationY,
          qty: 1,
          includeInCheckout: true,
          purchaseOptionId: purchaseOption?.id,
          supportInstanceId: placement.supportInstanceId,
        };
        const nextItems = commitItemsToRoom(
          targetRoom.id,
          (previous) => [...previous, nextItem],
          `Add ${product.title || "Item"}`,
          { activateRoom: true }
        );
        if (!nextItems) return false;
        selectItems({
          roomId: targetRoom.id,
          instanceIds: [instanceId],
          primaryInstanceId: instanceId,
        });
        return true;
      }

      const bundleGroupId = createInstanceId();
      const primaryId = createInstanceId();
      const companionId = createInstanceId();
      const primaryItem: DesignItem = {
        instanceId: primaryId,
        productId: placement.productId,
        variantId: resolved.variantId,
        position: placement.position,
        rotationY: placement.rotationY,
        qty: 1,
        includeInCheckout: true,
        purchaseOptionId: purchaseOption?.id,
        bundleGroupId,
        bundleRole: "primary",
        bundleQuantity,
      };
      if (
        !isCatalogPlacementContainedInRoom(
          targetRoom,
          primaryItem.position,
          primaryItem.rotationY ?? 0,
          resolved.dimsMm
        )
      ) {
        showToast(`Place fully inside ${targetRoom.name}`);
        return false;
      }
      const companionPosition = findBundleCompanionPlacement(
        targetRoom,
        placement.productId,
        resolved.variantId,
        placement.position,
        placement.rotationY,
        [...targetRoom.items, primaryItem]
      );
      if (!companionPosition) {
        showToast(
          `Set of ${bundleQuantity} needs space for both chairs. Move an item or choose Single.`
        );
        return false;
      }

      const companionItem: DesignItem = {
        ...primaryItem,
        instanceId: companionId,
        position: companionPosition,
        includeInCheckout: false,
        bundleRole: "component",
      };
      const nextItems = commitItemsToRoom(
        targetRoom.id,
        (previous) => [...previous, primaryItem, companionItem],
        `Add ${product.title} set`,
        { activateRoom: true }
      );
      if (!nextItems) return false;
      selectItems({
        roomId: targetRoom.id,
        instanceIds: [primaryId, companionId],
        primaryInstanceId: primaryId,
      });
      showToast(
        `Added official ${
          purchaseOption?.label ?? `set of ${bundleQuantity}`
        } to room`
      );
      return true;
    },
    [
      clampToCatalogPlacementRoom,
      commitItemsToRoom,
      createInstanceId,
      findBundleCompanionPlacement,
      getActiveRoomId,
      getRooms,
      isCatalogPlacementContainedInRoom,
      selectItems,
      showToast,
    ]
  );

  const rotatePendingCatalogPlacement = useCallback(
    (direction: "left" | "right") => {
      setPendingPlacement((previous) => {
        if (!previous) return previous;
        const delta = direction === "left" ? Math.PI / 2 : -Math.PI / 2;
        const fullTurn = Math.PI * 2;
        const nextRotation =
          ((previous.rotationY + delta) % fullTurn + fullTurn) % fullTurn;
        return updatePendingCatalogPlacementDraft(
          previous,
          previous.position,
          nextRotation,
          "Rotated preview"
        );
      });
    },
    [setPendingPlacement, updatePendingCatalogPlacementDraft]
  );

  const targetPendingCatalogPlacementToRoom = useCallback(
    (
      roomId: string,
      options: {
        source: "room" | "zone";
        localPosition?: [number, number, number];
        zoneLabel?: string;
      }
    ): CatalogPlacementTargetResult | null => {
      if (!pendingPlacement) return null;
      const targetRoom = roomSnapshotById.get(roomId);
      if (!targetRoom) return null;

      const smartPlacement =
        options.localPosition === undefined
          ? findSmartCatalogPlacement(
              pendingPlacement.productId,
              pendingPlacement.variantId,
              pendingPlacement.purchaseOptionId,
              targetRoom
            )
          : null;
      const nextPlacement =
        smartPlacement ??
        updatePendingCatalogPlacementDraft(
          {
            ...pendingPlacement,
            roomId: targetRoom.id,
          },
          options.localPosition ?? [0, 0, 0],
          pendingPlacement.rotationY,
          options.source === "zone" && options.zoneLabel
            ? `Tapped ${options.zoneLabel}`
            : `Tapped ${targetRoom.name}`,
          targetRoom
        );

      if (!nextPlacement) {
        showToast(`Could not place in ${targetRoom.name}`);
        return { handled: true, target: null };
      }

      const acceptable = isCatalogPlacementTargetAcceptable(
        nextPlacement,
        targetRoom
      );
      setPendingPlacement({
        ...nextPlacement,
        roomId: targetRoom.id,
        reason:
          options.source === "zone" && options.zoneLabel
            ? `Tapped ${options.zoneLabel}`
            : nextPlacement.reason,
      });
      showToast(
        options.source === "zone" && options.zoneLabel
          ? `Moved preview to ${options.zoneLabel}`
          : `Moved preview to ${targetRoom.name}`
      );
      const target: CatalogPlacementPreviewTarget = {
        roomId: targetRoom.id,
        label: targetRoom.name,
        valid: acceptable,
        kind: "preview",
      };
      setPreviewTarget(target);
      return {
        handled: true,
        target,
      };
    },
    [
      findSmartCatalogPlacement,
      isCatalogPlacementTargetAcceptable,
      pendingPlacement,
      roomSnapshotById,
      setPendingPlacement,
      setPreviewTarget,
      showToast,
      updatePendingCatalogPlacementDraft,
    ]
  );

  const nudgePendingCatalogPlacement = useCallback(
    (deltaX: number, deltaZ: number) => {
      setPendingPlacement((previous) => {
        if (!previous) return previous;
        return (
          updatePendingCatalogPlacementDraft(
            previous,
            [
              previous.position[0] + deltaX,
              previous.position[1] ?? 0,
              previous.position[2] + deltaZ,
            ],
            previous.rotationY,
            "Adjusted placement"
          ) ?? previous
        );
      });
    },
    [setPendingPlacement, updatePendingCatalogPlacementDraft]
  );

  const centerPendingCatalogPlacement = useCallback(() => {
    setPendingPlacement((previous) => {
      if (!previous) return previous;
      return (
        updatePendingCatalogPlacementDraft(
          previous,
          [0, 0, 0],
          previous.rotationY,
          "Centered in room"
        ) ?? previous
      );
    });
  }, [setPendingPlacement, updatePendingCatalogPlacementDraft]);

  const autoPlacePendingCatalogPlacement = useCallback(() => {
    setPendingPlacement((previous) => {
      if (!previous) return previous;
      const targetRoom =
        roomSnapshotById.get(previous.roomId ?? getActiveRoomId()) ?? activeRoom;
      const next = findSmartCatalogPlacement(
        previous.productId,
        previous.variantId,
        previous.purchaseOptionId,
        targetRoom
      );
      if (!next) {
        showToast("No open auto placement found in this room.");
        return previous;
      }
      return next;
    });
  }, [
    activeRoom,
    findSmartCatalogPlacement,
    getActiveRoomId,
    roomSnapshotById,
    setPendingPlacement,
    showToast,
  ]);

  const improvePendingCatalogPlacement = useCallback(() => {
    if (!pendingCatalogPlacementImprovement) {
      showToast("This is already the best scored spot nearby.");
      return;
    }
    setPendingPlacement(pendingCatalogPlacementImprovement.placement);
    showToast(
      `Improved placement to ${pendingCatalogPlacementImprovement.score}/100`
    );
  }, [pendingCatalogPlacementImprovement, setPendingPlacement, showToast]);

  const restoreLastValidCatalogPlacement = useCallback(() => {
    if (!restorableCatalogPlacement) {
      showToast("No earlier valid spot to restore.");
      return;
    }
    setPendingPlacement({
      ...restorableCatalogPlacement,
      reason: "Restored last valid spot",
    });
    showToast("Restored last valid placement");
  }, [restorableCatalogPlacement, setPendingPlacement, showToast]);

  const movePendingCatalogPlacementToBestRoom = useCallback(
    (): CatalogPlacementPreviewTarget | null => {
      if (!pendingCatalogBestRoomPlacement) {
        showToast("No better room found for this item.");
        return null;
      }
      setPendingPlacement(pendingCatalogBestRoomPlacement.placement);
      showToast(
        `Moved preview to ${pendingCatalogBestRoomPlacement.roomName} (${pendingCatalogBestRoomPlacement.score}/100)`
      );
      const target: CatalogPlacementPreviewTarget = {
        roomId:
          pendingCatalogBestRoomPlacement.placement.roomId ?? getActiveRoomId(),
        label: pendingCatalogBestRoomPlacement.roomName,
        valid: true,
        kind: "preview",
      };
      setPreviewTarget(target);
      return target;
    },
    [
      getActiveRoomId,
      pendingCatalogBestRoomPlacement,
      setPendingPlacement,
      setPreviewTarget,
      showToast,
    ]
  );

  const switchPendingCatalogPlacementToBestOption = useCallback(() => {
    if (!pendingCatalogBestVariantPlacement) {
      showToast("No better option found for this spot.");
      return;
    }
    setPendingPlacement(pendingCatalogBestVariantPlacement.placement);
    showToast(
      `Switched to ${pendingCatalogBestVariantPlacement.variantLabel} (${pendingCatalogBestVariantPlacement.score}/100)`
    );
  }, [pendingCatalogBestVariantPlacement, setPendingPlacement, showToast]);

  const addCatalogItemDirectlyToRoom = useCallback(
    (productId: string, variantId?: string, purchaseOptionId?: string) => {
      const placement = buildCatalogPlacementPreview(
        productId,
        variantId,
        purchaseOptionId
      );
      if (placement) {
        return addCatalogPlacementToRoom({
          ...placement,
          roomId: activeRoom?.id ?? getActiveRoomId(),
        });
      }

      const fallback = buildCatalogFallbackPlacement({
        productId,
        variantId,
        purchaseOptionId,
        itemCount: getActiveItems().length,
        surfaceItems: activeRoom?.items,
        roomId: activeRoom?.id ?? getActiveRoomId(),
        roomWidth,
        roomDepth,
        roomHeight:
          activeRoom?.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight,
        wallThickness,
        clampToActiveRoom,
        collides: catalogPlacementCollides,
      });
      if (!fallback) return false;
      return addCatalogPlacementToRoom({
        ...fallback,
        roomId: activeRoom?.id ?? getActiveRoomId(),
      });
    },
    [
      activeRoom,
      addCatalogPlacementToRoom,
      buildCatalogPlacementPreview,
      catalogPlacementCollides,
      clampToActiveRoom,
      getActiveItems,
      getActiveRoomId,
      roomDepth,
      roomWidth,
      wallThickness,
    ]
  );

  const addCatalogItemToRoom = useCallback(
    (productId: string, variantId?: string, purchaseOptionId?: string) => {
      if (placementAddMode === "auto") {
        const placement = findSmartCatalogPlacement(
          productId,
          variantId,
          purchaseOptionId
        );
        if (!placement) {
          showToast("No open auto placement found in this room.");
          return;
        }
        if (addCatalogPlacementToRoom(placement)) {
          showToast(`Added to ${activeRoom?.name ?? "room"}`);
        }
        return;
      }
      const placement = buildCatalogPlacementPreview(
        productId,
        variantId,
        purchaseOptionId
      );
      if (!placement) {
        showToast(
          "No clear placement found in this room. Move an item or choose another spot."
        );
        return;
      }
      setPendingPlacement({
        ...placement,
        roomId: activeRoom?.id ?? getActiveRoomId(),
      });
      showToast(`Previewing placement in ${activeRoom?.name ?? "room"}`);
    },
    [
      activeRoom,
      addCatalogPlacementToRoom,
      buildCatalogPlacementPreview,
      findSmartCatalogPlacement,
      getActiveRoomId,
      placementAddMode,
      setPendingPlacement,
      showToast,
    ]
  );

  const autoPlaceCatalogItemInRoom = useCallback(
    (productId: string, variantId?: string, purchaseOptionId?: string) => {
      const placement = findSmartCatalogPlacement(
        productId,
        variantId,
        purchaseOptionId
      );
      if (!placement) {
        showToast("No open auto placement found in this room.");
        return;
      }
      setPendingPlacement(placement);
      setHoverPlacement(null);
      showToast(`Auto placement ready in ${activeRoom?.name ?? "room"}`);
    },
    [
      activeRoom?.name,
      findSmartCatalogPlacement,
      setHoverPlacement,
      setPendingPlacement,
      showToast,
    ]
  );

  const previewCatalogPlacementIntent = useCallback(
    (productId: string | null, variantId?: string) => {
      if (!productId || pendingPlacement) {
        setHoverPlacement(null);
        return;
      }
      setHoverPlacement(findSmartCatalogPlacement(productId, variantId));
    },
    [
      findSmartCatalogPlacement,
      pendingPlacement,
      setHoverPlacement,
    ]
  );

  const selectPendingCatalogPlacementBlocker = useCallback(() => {
    if (!pendingPlacement) return;
    const targetRoom =
      roomSnapshotById.get(pendingPlacement.roomId ?? getActiveRoomId()) ??
      activeRoom;
    const product = CATALOG_ITEMS[pendingPlacement.productId];
    if (!targetRoom || !product) return;
    const resolved = resolveCatalogVariant(product, pendingPlacement.variantId);
    const blocker = findCatalogPlacementBlockerInRoom(
      targetRoom,
      pendingPlacement.productId,
      pendingPlacement.position,
      pendingPlacement.rotationY,
      resolved.dimsMm,
      pendingPlacement.supportInstanceId
    );
    if (!blocker) return;
    selectItems({
      roomId: targetRoom.id,
      instanceIds: [blocker.instanceId],
      primaryInstanceId: blocker.instanceId,
    });
    showToast(`Selected ${getItemDisplayName(blocker) ?? "blocking item"}`);
  }, [
    activeRoom,
    findCatalogPlacementBlockerInRoom,
    getActiveRoomId,
    getItemDisplayName,
    pendingPlacement,
    roomSnapshotById,
    selectItems,
    showToast,
  ]);

  const placePendingCatalogBesideBlocker = useCallback(() => {
    if (!pendingPlacement || !pendingCatalogPlacementBlocker) return;
    const targetRoom =
      roomSnapshotById.get(pendingPlacement.roomId ?? getActiveRoomId()) ??
      activeRoom;
    const product = CATALOG_ITEMS[pendingPlacement.productId];
    if (!targetRoom || !product) return;
    const resolved = resolveCatalogVariant(product, pendingPlacement.variantId);
    const blockerProduct = CATALOG_ITEMS[pendingCatalogPlacementBlocker.productId];
    const blockerDims = blockerProduct
      ? getPlanningDimensions(pendingCatalogPlacementBlocker, blockerProduct)
      : { w: 800, d: 800, h: 500 };
    const spacing =
      Math.max(
        resolved.dimsMm.w,
        resolved.dimsMm.d,
        blockerDims.w,
        blockerDims.d
      ) /
        1000 /
        2 +
      0.35;
    const offsets: Array<[number, number]> = [
      [spacing, 0],
      [-spacing, 0],
      [0, spacing],
      [0, -spacing],
    ];

    for (const [deltaX, deltaZ] of offsets) {
      const next = updatePendingCatalogPlacementDraft(
        pendingPlacement,
        [
          pendingCatalogPlacementBlocker.position[0] + deltaX,
          0,
          pendingCatalogPlacementBlocker.position[2] + deltaZ,
        ],
        pendingPlacement.rotationY,
        "Placed beside blocker",
        targetRoom
      );
      if (
        next &&
        !catalogPlacementCollidesInRoom(
          targetRoom,
          next.productId,
          next.position,
          next.rotationY,
          resolved.dimsMm
        )
      ) {
        setPendingPlacement(next);
        showToast("Placed beside blocker");
        return;
      }
    }
    showToast("No open spot beside blocker.");
  }, [
    activeRoom,
    catalogPlacementCollidesInRoom,
    getActiveRoomId,
    getPlanningDimensions,
    pendingCatalogPlacementBlocker,
    pendingPlacement,
    roomSnapshotById,
    setPendingPlacement,
    showToast,
    updatePendingCatalogPlacementDraft,
  ]);

  const trySmallerPendingCatalogVariant = useCallback(() => {
    if (!pendingPlacement) return;
    const product = CATALOG_ITEMS[pendingPlacement.productId];
    if (!product) return;
    const current = resolveCatalogVariant(product, pendingPlacement.variantId);
    const currentArea = current.dimsMm.w * current.dimsMm.d;
    const smaller = product.variants
      .map((variant) => ({
        variant,
        dims: variant.dimensionsMm ?? product.dimsMm,
      }))
      .filter(
        ({ variant, dims }) =>
          variant.id !== current.variantId && dims.w * dims.d < currentArea
      )
      .sort((first, second) =>
        second.dims.w * second.dims.d - first.dims.w * first.dims.d
      )[0];
    if (!smaller) {
      showToast("No smaller variant available.");
      return;
    }
    const next = updatePendingCatalogPlacementDraft(
      {
        ...pendingPlacement,
        variantId: smaller.variant.id,
      },
      pendingPlacement.position,
      pendingPlacement.rotationY,
      "Smaller variant preview"
    );
    if (next) {
      setPendingPlacement(next);
      showToast(`Trying smaller variant: ${smaller.variant.label}`);
    }
  }, [
    pendingPlacement,
    setPendingPlacement,
    showToast,
    updatePendingCatalogPlacementDraft,
  ]);

  const movePendingCatalogBlockerAside = useCallback(() => {
    if (!pendingCatalogPlacementBlocker || !pendingPlacement) return;
    const targetRoom =
      roomSnapshotById.get(pendingPlacement.roomId ?? getActiveRoomId()) ??
      activeRoom;
    if (!targetRoom) return;
    const placement = findSmartCatalogPlacement(
      pendingCatalogPlacementBlocker.productId,
      pendingCatalogPlacementBlocker.variantId,
      pendingCatalogPlacementBlocker.purchaseOptionId,
      targetRoom
    );
    if (!placement) {
      showToast("No open spot found for blocker.");
      return;
    }
    const blockerName =
      getItemDisplayName(pendingCatalogPlacementBlocker) ?? "blocker";
    const beforeLayoutVersion = createLayoutVersion(targetRoom, {
      name: `Before moving ${blockerName}`,
      source: "make_space",
    });
    commitItemsToRoom(
      targetRoom.id,
      (previous) =>
        previous.map((item) =>
          item.instanceId === pendingCatalogPlacementBlocker.instanceId
            ? {
                ...item,
                position: placement.position,
                rotationY: placement.rotationY,
              }
            : item
        ),
      `Move ${blockerName} aside`,
      { activateRoom: true, beforeLayoutVersion }
    );
    showToast(`Moved ${blockerName} aside`);
  }, [
    activeRoom,
    commitItemsToRoom,
    findSmartCatalogPlacement,
    getActiveRoomId,
    getItemDisplayName,
    pendingCatalogPlacementBlocker,
    pendingPlacement,
    roomSnapshotById,
    showToast,
  ]);

  const swapPendingCatalogWithBlocker = useCallback(() => {
    if (!pendingPlacement || !pendingCatalogPlacementBlocker) return;
    const targetRoom =
      roomSnapshotById.get(pendingPlacement.roomId ?? getActiveRoomId()) ??
      activeRoom;
    if (!targetRoom) return;
    const blockerName =
      getItemDisplayName(pendingCatalogPlacementBlocker) ?? "blocker";
    const blockerPosition = pendingCatalogPlacementBlocker.position;
    const previewPosition = pendingPlacement.position;
    const beforeLayoutVersion = createLayoutVersion(targetRoom, {
      name: `Before swapping ${blockerName}`,
      source: "make_space",
    });
    commitItemsToRoom(
      targetRoom.id,
      (previous) =>
        previous.map((item) =>
          item.instanceId === pendingCatalogPlacementBlocker.instanceId
            ? { ...item, position: previewPosition }
            : item
        ),
      `Swap with ${blockerName}`,
      { activateRoom: true, beforeLayoutVersion }
    );
    setPendingPlacement((previous) =>
      previous
        ? {
            ...previous,
            position: [
              blockerPosition[0],
              blockerPosition[1] ?? 0,
              blockerPosition[2],
            ],
            reason: `Swapped with ${blockerName}`,
          }
        : previous
    );
    showToast(`Swapped with ${blockerName}`);
  }, [
    activeRoom,
    commitItemsToRoom,
    getActiveRoomId,
    getItemDisplayName,
    pendingCatalogPlacementBlocker,
    pendingPlacement,
    roomSnapshotById,
    setPendingPlacement,
    showToast,
  ]);

  const clearCatalogPlacementDragRefs = useCallback(() => {
    dragOffsetRef.current = null;
    dragLatestClientRef.current = null;
    dragLastWorldRef.current = null;
    if (dragMoveFrameRef.current !== null) {
      window.cancelAnimationFrame(dragMoveFrameRef.current);
      dragMoveFrameRef.current = null;
    }
  }, []);

  const stopCatalogPlacementDragging = useCallback(() => {
    setDragging(false);
    setCanvasObjectDragging(false);
    clearCatalogPlacementDragRefs();
  }, [clearCatalogPlacementDragRefs, setCanvasObjectDragging]);

  const confirmPendingCatalogPlacement = useCallback((): boolean => {
    if (!pendingPlacement) return false;
    const placementToConfirm =
      shouldConfirmImprovedCatalogPlacement &&
      pendingCatalogPlacementImprovement
        ? pendingCatalogPlacementImprovement.placement
        : shouldConfirmRestoredCatalogPlacement && restorableCatalogPlacement
          ? restorableCatalogPlacement
          : pendingPlacement;
    const product = CATALOG_ITEMS[placementToConfirm.productId];
    if (!product) {
      setPendingPlacement(null);
      return false;
    }
    if (
      pendingCatalogPlacementHardInvalid &&
      !shouldConfirmImprovedCatalogPlacement &&
      !shouldConfirmRestoredCatalogPlacement
    ) {
      showToast(
        pendingCatalogPlacementScoreHardInvalid &&
          pendingCatalogPlacementScore?.summary
          ? pendingCatalogPlacementScore.summary
          : pendingCatalogPlacementBlockerLabel
            ? `Blocked by ${pendingCatalogPlacementBlockerLabel}`
            : "Placement blocked by another item. Move it or choose a different item."
      );
      return false;
    }

    if (!addCatalogPlacementToRoom(placementToConfirm)) return false;
    if (
      shouldConfirmImprovedCatalogPlacement &&
      pendingCatalogPlacementImprovement
    ) {
      showToast(
        `Added improved placement (${pendingCatalogPlacementImprovement.score}/100)`
      );
    } else if (shouldConfirmRestoredCatalogPlacement) {
      showToast("Added last valid placement");
    }
    setPendingPlacement(null);
    stopCatalogPlacementDragging();
    setPreviewTarget(null);
    return true;
  }, [
    addCatalogPlacementToRoom,
    pendingCatalogPlacementBlockerLabel,
    pendingCatalogPlacementHardInvalid,
    pendingCatalogPlacementImprovement,
    pendingCatalogPlacementScore,
    pendingCatalogPlacementScoreHardInvalid,
    pendingPlacement,
    restorableCatalogPlacement,
    setPendingPlacement,
    setPreviewTarget,
    shouldConfirmImprovedCatalogPlacement,
    shouldConfirmRestoredCatalogPlacement,
    showToast,
    stopCatalogPlacementDragging,
  ]);

  const handleCatalogPlacementPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!pendingPlacement) return;
      event.stopPropagation();
      (event.target as unknown as HTMLElement).setPointerCapture?.(
        event.pointerId
      );
      pendingPlacementRef.current = pendingPlacement;
      const nativeEvent = event.nativeEvent as PointerEvent | undefined;
      const targetRoomId = pendingPlacement.roomId ?? getActiveRoomId();
      const planRoom = houseRoomById.get(targetRoomId);
      const previewWorldX = pendingPlacement.position[0] + (planRoom?.x ?? 0);
      const previewWorldZ = pendingPlacement.position[2] + (planRoom?.z ?? 0);
      const pointerWorld = nativeEvent
        ? resolveGroundPointFromClient(
            nativeEvent.clientX,
            nativeEvent.clientY
          )
        : null;
      dragOffsetRef.current = pointerWorld
        ? {
            x: previewWorldX - pointerWorld[0],
            z: previewWorldZ - pointerWorld[2],
          }
        : { x: 0, z: 0 };
      dragLastWorldRef.current = {
        x: previewWorldX,
        z: previewWorldZ,
        roomId: targetRoomId,
      };
      setDragging(true);
      setCanvasObjectDragging(true);
    },
    [
      getActiveRoomId,
      houseRoomById,
      pendingPlacement,
      resolveGroundPointFromClient,
      setCanvasObjectDragging,
    ]
  );

  const movePendingCatalogPlacementToClientPoint = useCallback(
    (clientX: number, clientY: number): boolean => {
      const placement = pendingPlacementRef.current;
      if (!placement) return false;
      const worldPoint = resolveGroundPointFromClient(clientX, clientY);
      if (!worldPoint) return false;
      const dragOffset = dragOffsetRef.current ?? { x: 0, z: 0 };
      const draggedWorldX = worldPoint[0] + dragOffset.x;
      const draggedWorldZ = worldPoint[2] + dragOffset.z;
      const pointerRoom = hasWholeHousePlan
        ? findPlanRoomAtWorldPoint(draggedWorldX, draggedWorldZ)
        : null;
      if (hasWholeHousePlan && !pointerRoom) return false;
      const targetRoomId =
        pointerRoom?.id ?? placement.roomId ?? getActiveRoomId();
      const lastWorld = dragLastWorldRef.current;
      if (
        lastWorld &&
        lastWorld.roomId === targetRoomId &&
        Math.hypot(
          lastWorld.x - draggedWorldX,
          lastWorld.z - draggedWorldZ
        ) < 0.015
      ) {
        return true;
      }
      const planRoom = houseRoomById.get(targetRoomId);
      const targetRoom = roomSnapshotById.get(targetRoomId) ?? activeRoom;
      if (!targetRoom) return false;
      const nextPlacement = updatePendingCatalogPlacementDraft(
        {
          ...placement,
          roomId: targetRoom.id,
        },
        [
          draggedWorldX - (planRoom?.x ?? 0),
          0,
          draggedWorldZ - (planRoom?.z ?? 0),
        ],
        placement.rotationY,
        pointerRoom && pointerRoom.id !== placement.roomId
          ? `Moved to ${targetRoom.name}`
          : "Custom placement",
        targetRoom
      );
      if (!nextPlacement) return false;

      pendingPlacementRef.current = nextPlacement;
      dragLastWorldRef.current = {
        x: nextPlacement.position[0] + (planRoom?.x ?? 0),
        z: nextPlacement.position[2] + (planRoom?.z ?? 0),
        roomId: targetRoom.id,
      };
      setPendingPlacement(nextPlacement);
      const product = CATALOG_ITEMS[nextPlacement.productId];
      const resolved = product
        ? resolveCatalogVariant(product, nextPlacement.variantId)
        : null;
      const acceptable = Boolean(
        resolved &&
          isCatalogPlacementContainedInRoom(
            targetRoom,
            nextPlacement.position,
            nextPlacement.rotationY,
            resolved.dimsMm
          ) &&
          !catalogPlacementCollidesInRoom(
            targetRoom,
            nextPlacement.productId,
            nextPlacement.position,
            nextPlacement.rotationY,
            resolved.dimsMm,
            nextPlacement.supportInstanceId
          )
      );
      setPreviewTarget({
        roomId: targetRoom.id,
        label: targetRoom.name,
        valid: acceptable,
        kind: "preview",
      });
      return true;
    },
    [
      activeRoom,
      catalogPlacementCollidesInRoom,
      findPlanRoomAtWorldPoint,
      getActiveRoomId,
      hasWholeHousePlan,
      houseRoomById,
      isCatalogPlacementContainedInRoom,
      resolveGroundPointFromClient,
      roomSnapshotById,
      setPreviewTarget,
      updatePendingCatalogPlacementDraft,
    ]
  );

  const schedulePendingCatalogPlacementMove = useCallback(
    (clientX: number, clientY: number) => {
      dragLatestClientRef.current = { clientX, clientY };
      if (dragMoveFrameRef.current !== null) return;
      dragMoveFrameRef.current = window.requestAnimationFrame(() => {
        dragMoveFrameRef.current = null;
        const latest = dragLatestClientRef.current;
        if (!latest) return;
        movePendingCatalogPlacementToClientPoint(
          latest.clientX,
          latest.clientY
        );
      });
    },
    [movePendingCatalogPlacementToClientPoint]
  );

  const handleCatalogPlacementPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!dragging || !pendingPlacementRef.current) return;
      event.stopPropagation();
      nudgeCameraForDrag(event);
    },
    [dragging, nudgeCameraForDrag]
  );

  const handleCatalogPlacementPointerUp = useCallback(
    (event?: ThreeEvent<PointerEvent>) => {
      event?.stopPropagation();
      if (event?.target) {
        (event.target as unknown as HTMLElement).releasePointerCapture?.(
          event.pointerId
        );
      }
      stopCatalogPlacementDragging();
    },
    [stopCatalogPlacementDragging]
  );

  const resolveCatalogDragPlacement = useCallback(
    (
      intent: CatalogPlacementDragIntent,
      clientX: number,
      clientY: number
    ): PendingCatalogPlacement | null => {
      const worldPoint = resolveGroundPointFromClient(clientX, clientY);
      if (!worldPoint) return null;
      const pointerPlanRoom = hasWholeHousePlan
        ? findPlanRoomAtWorldPoint(worldPoint[0], worldPoint[2])
        : null;
      const targetRoomId =
        pointerPlanRoom?.id ?? activeRoom?.id ?? getActiveRoomId();
      const targetRoom = roomSnapshotById.get(targetRoomId) ?? activeRoom;
      if (!targetRoom) return null;
      const targetPlanRoom = houseRoomById.get(targetRoom.id);
      const product = CATALOG_ITEMS[intent.productId];
      if (!product) return null;
      const resolved = resolveCatalogVariant(
        product,
        intent.variantId ?? product.defaultVariantId
      );
      const smartPlacement = findSmartCatalogPlacement(
        intent.productId,
        resolved.variantId,
        intent.purchaseOptionId,
        targetRoom
      );
      const basePlacement: PendingCatalogPlacement = {
        productId: intent.productId,
        variantId: resolved.variantId,
        purchaseOptionId: intent.purchaseOptionId,
        roomId: targetRoom.id,
        position: smartPlacement?.position ?? [0, 0, 0],
        rotationY: smartPlacement?.rotationY ?? 0,
        reason: "Dropped from catalog",
      };
      return updatePendingCatalogPlacementDraft(
        basePlacement,
        [
          worldPoint[0] - (targetPlanRoom?.x ?? 0),
          0,
          worldPoint[2] - (targetPlanRoom?.z ?? 0),
        ],
        basePlacement.rotationY,
        `Dropped in ${targetRoom.name}`,
        targetRoom
      );
    },
    [
      activeRoom,
      findPlanRoomAtWorldPoint,
      findSmartCatalogPlacement,
      getActiveRoomId,
      hasWholeHousePlan,
      houseRoomById,
      resolveGroundPointFromClient,
      roomSnapshotById,
      updatePendingCatalogPlacementDraft,
    ]
  );

  const handleCatalogDragStart = useCallback(
    (productId: string, variantId?: string) => {
      setDragIntent({ productId, variantId });
      setHoverPlacement(findSmartCatalogPlacement(productId, variantId));
    },
    [findSmartCatalogPlacement]
  );

  const handleCatalogDragEnd = useCallback(() => {
    setDragIntent(null);
    setHoverPlacement(null);
    setPreviewTarget(null);
  }, [setPreviewTarget]);

  const handleCatalogCanvasDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!dragIntent || catalogCanvasDragDisabled) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      const placement = resolveCatalogDragPlacement(
        dragIntent,
        event.clientX,
        event.clientY
      );
      if (!placement) return;
      setHoverPlacement(placement);
      const targetRoom =
        roomSnapshotById.get(placement.roomId ?? "") ?? activeRoom;
      if (!targetRoom) return;
      setPreviewTarget({
        roomId: targetRoom.id,
        label: targetRoom.name,
        valid: isCatalogPlacementTargetAcceptable(placement, targetRoom),
        kind: "preview",
      });
    },
    [
      activeRoom,
      catalogCanvasDragDisabled,
      dragIntent,
      isCatalogPlacementTargetAcceptable,
      resolveCatalogDragPlacement,
      roomSnapshotById,
      setPreviewTarget,
    ]
  );

  const handleCatalogCanvasDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!dragIntent || catalogCanvasDragDisabled) return;
      event.preventDefault();
      const placement = resolveCatalogDragPlacement(
        dragIntent,
        event.clientX,
        event.clientY
      );
      setDragIntent(null);
      setHoverPlacement(null);
      setPreviewTarget(null);
      if (!placement) {
        showToast("Drop over a room to place this item.");
        return;
      }
      if (placementAddMode === "auto") {
        const targetRoom =
          roomSnapshotById.get(placement.roomId ?? "") ?? activeRoom;
        const smartPlacement =
          findSmartCatalogPlacement(
            placement.productId,
            placement.variantId,
            placement.purchaseOptionId,
            targetRoom
          ) ?? placement;
        if (!addCatalogPlacementToRoom(smartPlacement)) {
          setPendingPlacement(smartPlacement);
        }
        return;
      }
      setPendingPlacement(placement);
      showToast(
        `Drop preview ready in ${
          roomSnapshotById.get(placement.roomId ?? "")?.name ?? "room"
        }`
      );
    },
    [
      activeRoom,
      addCatalogPlacementToRoom,
      catalogCanvasDragDisabled,
      dragIntent,
      findSmartCatalogPlacement,
      placementAddMode,
      resolveCatalogDragPlacement,
      roomSnapshotById,
      setPreviewTarget,
      showToast,
    ]
  );

  const handleCatalogCanvasDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (
        event.currentTarget.contains(event.relatedTarget as Node | null) ||
        !dragIntent
      ) {
        return;
      }
      setHoverPlacement(null);
      setPreviewTarget(null);
    },
    [dragIntent, setPreviewTarget]
  );

  const cancelPendingCatalogPlacement = useCallback(() => {
    setPendingPlacement(null);
    setLastValidPlacement(null);
    setHoverPlacement(null);
    stopCatalogPlacementDragging();
    setPreviewTarget(null);
  }, [setPreviewTarget, stopCatalogPlacementDragging]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPendingPlacement(null);
      setLastValidPlacement(null);
      setHoverPlacement(null);
      setPreviewTarget(null);
    });
    return () => {
      cancelled = true;
    };
  }, [activeRoomId, setPreviewTarget]);

  useEffect(() => {
    pendingPlacementRef.current = pendingPlacement;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (pendingPlacement) {
        if (!pendingCatalogPlacementHardInvalid) {
          setLastValidPlacement(pendingPlacement);
        }
        return;
      }
      setLastValidPlacement(null);
      stopCatalogPlacementDragging();
      setPreviewTarget(null);
    });
    return () => {
      cancelled = true;
    };
  }, [
    pendingCatalogPlacementHardInvalid,
    pendingPlacement,
    setPreviewTarget,
    stopCatalogPlacementDragging,
  ]);

  useEffect(() => {
    if (!dragging) return;
    const moveDragging = (event: PointerEvent) => {
      schedulePendingCatalogPlacementMove(event.clientX, event.clientY);
    };
    const stopDragging = () => {
      stopCatalogPlacementDragging();
    };
    window.addEventListener("pointermove", moveDragging);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", moveDragging);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [
    dragging,
    schedulePendingCatalogPlacementMove,
    stopCatalogPlacementDragging,
  ]);

  useEffect(
    () => () => {
      if (dragMoveFrameRef.current !== null) {
        window.cancelAnimationFrame(dragMoveFrameRef.current);
        dragMoveFrameRef.current = null;
      }
    },
    []
  );

  return {
    state: {
      pendingPlacement,
      hoverPlacement,
      lastValidPlacement,
      dragIntent,
      dragging,
    },
    geometry: {
      catalogPlacementCollides,
      catalogPlacementCollidesAgainst,
    },
    scene: {
      pendingCatalogPlacementScene,
      hoverCatalogPlacementScene,
      activeCatalogPlacementSurfaceHighlight,
      pendingCatalogPlacementRoom,
      activePlacementCompatibleZoneIds,
      circulationHeatmap,
    },
    assessment: {
      pendingCatalogPlacementBlocked,
      pendingCatalogPlacementBlocker,
      pendingCatalogPlacementBlockerLabel,
      restorableCatalogPlacement,
      pendingCatalogPlacementScore,
      pendingCatalogPlacementQuality,
      pendingCatalogPlacementImprovement,
      pendingCatalogBestRoomPlacement,
      pendingCatalogBestVariantPlacement,
      pendingCatalogPlacementScoreHardInvalid,
      pendingCatalogPlacementHardInvalid,
      pendingCatalogPlacementStatusLabel,
      shouldConfirmImprovedCatalogPlacement,
      shouldConfirmRestoredCatalogPlacement,
    },
    queries: {
      isCatalogPlacementTargetAcceptable,
      buildCatalogPlacementPreview,
      findSmartCatalogPlacement,
    },
    actions: {
      updatePendingCatalogPlacementDraft,
      targetPendingCatalogPlacementToRoom,
      rotatePendingCatalogPlacement,
      nudgePendingCatalogPlacement,
      centerPendingCatalogPlacement,
      autoPlacePendingCatalogPlacement,
      improvePendingCatalogPlacement,
      restoreLastValidCatalogPlacement,
      movePendingCatalogPlacementToBestRoom,
      switchPendingCatalogPlacementToBestOption,
      addCatalogPlacementToRoom,
      addCatalogItemDirectlyToRoom,
      addCatalogItemToRoom,
      autoPlaceCatalogItemInRoom,
      previewCatalogPlacementIntent,
      selectPendingCatalogPlacementBlocker,
      placePendingCatalogBesideBlocker,
      trySmallerPendingCatalogVariant,
      movePendingCatalogBlockerAside,
      swapPendingCatalogWithBlocker,
      confirmPendingCatalogPlacement,
      cancelPendingCatalogPlacement,
      handleCatalogPlacementPointerDown,
      handleCatalogPlacementPointerMove,
      handleCatalogPlacementPointerUp,
      handleCatalogDragStart,
      handleCatalogDragEnd,
      handleCatalogCanvasDragOver,
      handleCatalogCanvasDrop,
      handleCatalogCanvasDragLeave,
    },
  };
}
