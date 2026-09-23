"use client";

import { useCallback, useMemo, useRef } from "react";

import { track, trackProductEvent } from "@/lib/analytics";
import { CATALOG_ITEMS } from "@/lib/catalog";
import {
  findCatalogSurfacePlacement,
  isSurfaceOnlyCatalogItem,
} from "@/lib/catalog-placement";
import type { CatalogItemSchema, DimensionsMm } from "@/lib/catalog-schema";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { evaluateConstraints, type ConstraintResult } from "@/lib/constraints/evaluate";
import {
  aabbIntersects,
  getFurnitureWallInset,
  type AABB,
} from "@/lib/design-page-geometry";
import {
  getRotatedFootprint,
  normalizeRotationDegrees,
  snapRotationRadians,
} from "@/lib/design-page-utils";
import { applyMoveItemsBetweenRoomsCommand } from "@/lib/design-page-item-commands";
import { buildNearbyDuplicateOffsets } from "@/lib/design-page-object-placement";
import type { HistoryCommand } from "@/lib/historyManager";
import { buildAlignedSelectionItems } from "@/lib/design-page-zone-layout";
import type { DesignItem, DesignSnapshot, RoomSnapshot } from "@/lib/room-types";

type ItemPosition = [number, number, number];
type ItemUpdater = DesignItem[] | ((previous: DesignItem[]) => DesignItem[]);

type SelectionBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
};

type RotationSource = "keyboard" | "handle" | "inspector" | "canvas";

export type ApplySelectionRotationOptions = {
  snap?: boolean;
  actionLabel?: string;
  source?: RotationSource;
};

export type DesignPageSelectionTransformState = {
  selectedItem: DesignItem | null;
  selectedProduct: CatalogItemSchema | null;
  selectedIds: Set<string>;
  selectedItemPlanningDimensionsMm: DimensionsMm | null;
  selectedItemDeleteLabel: string;
  activeRoom: RoomSnapshot | null;
  activeRoomShoppingItems: Array<{
    instanceId: string;
    commerceMode: string;
    hasValidCommerce: boolean;
  }>;
  rotationInputValue: string;
};

export type DesignPageSelectionTransformConfiguration = {
  canEdit: boolean;
  isDesigner: boolean;
  roomWidth: number;
  roomDepth: number;
  wallThickness: number;
  rotationSnapEnabled: boolean;
  rotationSnapStepRadians: number;
  activeRoomPlanOffset: { x: number; z: number };
  roomSnapshotById: ReadonlyMap<string, RoomSnapshot>;
};

export type DesignPageSelectionTransformRefs = {
  getItems: () => DesignItem[];
  getSelectedIds: () => Set<string>;
  getPrimaryId: () => string | null;
  getDesignSnapshot: () => DesignSnapshot;
  replaceActiveItemsSnapshot: (items: DesignItem[]) => void;
};

type ClampToRoom = (
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  roomWidth: number,
  roomDepth: number,
  wallThickness: number,
  rotationY?: number
) => [number, number];

type ClampToCatalogPlacementRoom = (
  room: RoomSnapshot,
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  rotationY?: number
) => [number, number];

type FindCatalogPlacementBlocker = (
  room: RoomSnapshot,
  productId: string,
  position: ItemPosition,
  rotationY: number,
  dimensionsMm: DimensionsMm,
  excludedInstanceId?: string | string[]
) => DesignItem | null;

type IsCatalogPlacementContained = (
  room: RoomSnapshot,
  position: ItemPosition,
  rotationY: number,
  dimensionsMm: DimensionsMm
) => boolean;

export type DesignPageSelectionTransformActions = {
  commitItems: (updater: ItemUpdater, actionName?: string) => void;
  updateSelection: (next: Set<string>, primaryId: string | null) => void;
  createInstanceId: () => string;
  clampToActiveRoom: ClampToRoom;
  clampToCatalogPlacementRoom: ClampToCatalogPlacementRoom;
  getItemAABB: (
    item: DesignItem,
    positionOverride?: ItemPosition,
    rotationOverride?: number
  ) => AABB | null;
  getSelectionBounds: (items: DesignItem[]) => SelectionBounds | null;
  getPlanningDimensions: (
    item: DesignItem,
    product: CatalogItemSchema
  ) => DimensionsMm;
  findCatalogPlacementBlockerInRoom: FindCatalogPlacementBlocker;
  isCatalogPlacementContainedInRoom: IsCatalogPlacementContained;
  getItemDisplayName: (item: DesignItem | null | undefined) => string | null;
  transferItemToRoom: (
    instanceId: string,
    sourceRoomId: string,
    targetRoom: RoomSnapshot,
    worldPosition: ItemPosition
  ) => boolean;
  setDesignSnapshot: (snapshot: DesignSnapshot) => void;
  history: {
    executeCommand: <TInput, TResult>(
      command: HistoryCommand<TInput, TResult>
    ) => TResult;
  };
  showToast: (message: string) => void;
  showConstraintsForMoment: (results: ConstraintResult[]) => void;
  showConfidenceSummary: (results: ConstraintResult[]) => void;
  trackFirstInteraction: () => void;
  setRotationInputValue: (value: string) => void;
};

export type UseDesignPageSelectionTransformsInput = {
  state: DesignPageSelectionTransformState;
  configuration: DesignPageSelectionTransformConfiguration;
  refs: DesignPageSelectionTransformRefs;
  actions: DesignPageSelectionTransformActions;
};

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function useDesignPageSelectionTransforms({
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageSelectionTransformsInput) {
  const {
    selectedItem,
    selectedProduct,
    selectedIds,
    selectedItemPlanningDimensionsMm,
    selectedItemDeleteLabel,
    activeRoom,
    activeRoomShoppingItems,
    rotationInputValue,
  } = state;
  const {
    canEdit,
    isDesigner,
    roomWidth,
    roomDepth,
    wallThickness,
    rotationSnapEnabled,
    rotationSnapStepRadians,
    activeRoomPlanOffset,
    roomSnapshotById,
  } = configuration;
  const {
    getItems,
    getSelectedIds,
    getPrimaryId,
    getDesignSnapshot,
    replaceActiveItemsSnapshot,
  } = refs;
  const {
    commitItems,
    updateSelection,
    createInstanceId,
    clampToActiveRoom,
    clampToCatalogPlacementRoom,
    getItemAABB,
    getSelectionBounds,
    getPlanningDimensions,
    findCatalogPlacementBlockerInRoom,
    isCatalogPlacementContainedInRoom,
    getItemDisplayName,
    transferItemToRoom,
    setDesignSnapshot,
    history,
    showToast,
    showConstraintsForMoment,
    showConfidenceSummary,
    trackFirstInteraction,
    setRotationInputValue,
  } = actions;

  const selectedRotationDegrees = useMemo(() => {
    if (!selectedItem) return 0;
    return normalizeRotationDegrees(radiansToDegrees(selectedItem.rotationY ?? 0));
  }, [selectedItem]);

  const rotateControlsDisabled =
    !canEdit || (isDesigner && selectedIds.size <= 1 && Boolean(selectedItem?.locked));
  const transformRejectionRef = useRef<{ message: string; shownAt: number } | null>(null);
  const reportTransformRejection = useCallback(
    (
      operation: "rotate" | "duplicate" | "move" | "delete",
      message: string,
      selectionType: "single" | "group" = "single"
    ) => {
      const now = Date.now();
      const previous = transformRejectionRef.current;
      if (!previous || previous.message !== message || now - previous.shownAt >= 1_500) {
        transformRejectionRef.current = { message, shownAt: now };
        showToast(message);
        track("editor_item_transform_rejected", { operation, selectionType });
        trackProductEvent("validation_warning_shown", {
          operation,
          warningCode: "transform_rejected",
          result: "blocked",
        });
      }
    },
    [showToast]
  );

  const alignSelectionX = useCallback(() => {
    const nextItems = buildAlignedSelectionItems({
      axis: "x",
      currentItems: getItems(),
      selectedIds: getSelectedIds(),
      isDesigner,
      catalogItems: CATALOG_ITEMS,
      roomWidth,
      roomDepth,
      wallThickness,
      clampToRoom: clampToActiveRoom,
      getSelectionBounds,
      getItemAABB,
      aabbIntersects,
    });
    if (nextItems) commitItems(nextItems, "Align X center");
  }, [
    clampToActiveRoom,
    commitItems,
    getItemAABB,
    getItems,
    getSelectedIds,
    getSelectionBounds,
    isDesigner,
    roomDepth,
    roomWidth,
    wallThickness,
  ]);

  const alignSelectionZ = useCallback(() => {
    const nextItems = buildAlignedSelectionItems({
      axis: "z",
      currentItems: getItems(),
      selectedIds: getSelectedIds(),
      isDesigner,
      catalogItems: CATALOG_ITEMS,
      roomWidth,
      roomDepth,
      wallThickness,
      clampToRoom: clampToActiveRoom,
      getSelectionBounds,
      getItemAABB,
      aabbIntersects,
    });
    if (nextItems) commitItems(nextItems, "Align Z center");
  }, [
    clampToActiveRoom,
    commitItems,
    getItemAABB,
    getItems,
    getSelectedIds,
    getSelectionBounds,
    isDesigner,
    roomDepth,
    roomWidth,
    wallThickness,
  ]);

  const applyItemRotation = useCallback(
    (
      id: string,
      targetRotationY: number,
      options?: ApplySelectionRotationOptions
    ) => {
      try {
        trackFirstInteraction();
        const shouldSnap = options?.snap ?? true;
        const resolvedRotationY =
          shouldSnap && rotationSnapEnabled
            ? snapRotationRadians(targetRotationY, rotationSnapStepRadians)
            : targetRotationY;
        const selectedSet = getSelectedIds();
        const isGroupRotate = selectedSet.size > 1 && selectedSet.has(id);
        const source = options?.source ?? "canvas";

        if (!isGroupRotate) {
          const currentItem = getItems().find((item) => item.instanceId === id);
          if (!currentItem) {
            reportTransformRejection("rotate", "This item is no longer available.");
            return false;
          }
          if (isDesigner && currentItem.locked) {
            reportTransformRejection("rotate", "Unlock this item to rotate it.");
            return false;
          }
          const previous = currentItem?.rotationY ?? 0;
          const product = CATALOG_ITEMS[currentItem.productId];
          if (!product) {
            reportTransformRejection("rotate", "Rotation is unavailable for this item.");
            return false;
          }
          const dimensionsMm = getPlanningDimensions(currentItem, product);
          const [safeX, safeZ] = clampToActiveRoom(
            currentItem.position[0],
            currentItem.position[2],
            dimensionsMm.w / 1000,
            dimensionsMm.d / 1000,
            roomWidth,
            roomDepth,
            wallThickness,
            resolvedRotationY
          );
          const candidatePosition: ItemPosition = [
            safeX,
            currentItem.position[1] ?? 0,
            safeZ,
          ];
          if (
            activeRoom &&
            !isCatalogPlacementContainedInRoom(
              activeRoom,
              candidatePosition,
              resolvedRotationY,
              dimensionsMm
            )
          ) {
            reportTransformRejection(
              "rotate",
              `Rotation would place part of the item outside ${activeRoom.name}.`
            );
            return false;
          }
          const blocker = activeRoom
            ? findCatalogPlacementBlockerInRoom(
                activeRoom,
                currentItem.productId,
                candidatePosition,
                resolvedRotationY,
                dimensionsMm,
                [currentItem.instanceId, currentItem.supportInstanceId ?? ""].filter(Boolean)
              )
            : null;
          if (blocker) {
            reportTransformRejection(
              "rotate",
              `Rotation blocked by ${getItemDisplayName(blocker) ?? "another item"}.`
            );
            return false;
          }
          if (
            Math.abs(resolvedRotationY - previous) < 1e-9 &&
            Math.abs(safeX - currentItem.position[0]) < 1e-9 &&
            Math.abs(safeZ - currentItem.position[2]) < 1e-9
          ) {
            return true;
          }
          commitItems(
            (previousItems) =>
              previousItems.map((item) =>
                item.instanceId === id
                  ? {
                      ...item,
                      position: candidatePosition,
                      rotationY: resolvedRotationY,
                    }
                  : item
              ),
            options?.actionLabel ?? "Rotate item"
          );
          track("editor_item_rotated", {
            source,
            snapped: shouldSnap,
            selectionType: "single",
            deltaDeg: Number(radiansToDegrees(resolvedRotationY - previous).toFixed(2)),
          });
          trackProductEvent("object_transformed", {
            operation: "rotate",
            source,
            itemCount: 1,
            result: "success",
          });
          const results = evaluateConstraints({
            design: { items: getItems() },
            movedItemId: id,
            room: { width: roomWidth, depth: roomDepth, wallThickness },
          });
          showConstraintsForMoment(results);
          showConfidenceSummary(results);
          return true;
        }

        const currentItems = getItems();
        const mover = currentItems.find((item) => item.instanceId === id);
        if (!mover) {
          reportTransformRejection("rotate", "This item is no longer available.", "group");
          return false;
        }
        const deltaRotation = resolvedRotationY - (mover.rotationY ?? 0);
        const movableItems = currentItems.filter(
          (item) => selectedSet.has(item.instanceId) && !(isDesigner && item.locked)
        );
        if (!movableItems.length) {
          reportTransformRejection(
            "rotate",
            "Unlock at least one selected item to rotate the group.",
            "group"
          );
          return false;
        }

        const movableIds = new Set(movableItems.map((item) => item.instanceId));
        const blockers = currentItems.filter((item) => !movableIds.has(item.instanceId));
        const bounds = getSelectionBounds(movableItems);
        if (!bounds) {
          reportTransformRejection("rotate", "The selected group cannot be rotated.", "group");
          return false;
        }

        const cosine = Math.cos(deltaRotation);
        const sine = Math.sin(deltaRotation);
        const nextItems = currentItems.map((item) => {
          if (!movableIds.has(item.instanceId)) return item;
          const product = CATALOG_ITEMS[item.productId];
          if (!product) return item;
          const offsetX = item.position[0] - bounds.centerX;
          const offsetZ = item.position[2] - bounds.centerZ;
          const nextRotationY = (item.rotationY ?? 0) + deltaRotation;
          const [safeX, safeZ] = clampToActiveRoom(
            bounds.centerX + offsetX * cosine - offsetZ * sine,
            bounds.centerZ + offsetX * sine + offsetZ * cosine,
            product.dimsMm.w / 1000,
            product.dimsMm.d / 1000,
            roomWidth,
            roomDepth,
            wallThickness,
            nextRotationY
          );
          return {
            ...item,
            position: [safeX, item.position[1] ?? 0, safeZ] as ItemPosition,
            rotationY: nextRotationY,
          };
        });

        const collision = nextItems.some((movedItem) => {
          if (!movableIds.has(movedItem.instanceId)) return false;
          if (CATALOG_ITEMS[movedItem.productId]?.category === "rug") return false;
          const movedBounds = getItemAABB(movedItem);
          if (!movedBounds) return false;
          return blockers.some((blocker) => {
            if (CATALOG_ITEMS[blocker.productId]?.category === "rug") return false;
            const blockerBounds = getItemAABB(blocker);
            return Boolean(blockerBounds && aabbIntersects(movedBounds, blockerBounds));
          });
        });
        if (collision) {
          reportTransformRejection(
            "rotate",
            "Rotation blocked because the selection would overlap another item.",
            "group"
          );
          return false;
        }

        commitItems(nextItems, options?.actionLabel ?? "Rotate group");
        track("editor_item_rotated", {
          source,
          snapped: shouldSnap,
          selectionType: "group",
          selectionSize: movableIds.size,
          deltaDeg: Number(radiansToDegrees(deltaRotation).toFixed(2)),
        });
        trackProductEvent("object_transformed", {
          operation: "group",
          source,
          itemCount: movableIds.size,
          result: "success",
        });
        const results = evaluateConstraints({
          design: { items: getItems() },
          movedItemId: id,
          room: { width: roomWidth, depth: roomDepth, wallThickness },
        });
        showConstraintsForMoment(results);
        showConfidenceSummary(results);
        return true;
      } catch (error) {
        console.error("[Editor] applyItemRotation failed", {
          id,
          targetRotationY,
          options,
          error,
        });
        reportTransformRejection("rotate", "Could not rotate the selection. Try again.");
        return false;
      }
    },
    [
      clampToActiveRoom,
      commitItems,
      getItemAABB,
      getItemDisplayName,
      getItems,
      getPlanningDimensions,
      getSelectedIds,
      getSelectionBounds,
      activeRoom,
      findCatalogPlacementBlockerInRoom,
      isCatalogPlacementContainedInRoom,
      isDesigner,
      reportTransformRejection,
      roomDepth,
      roomWidth,
      rotationSnapEnabled,
      rotationSnapStepRadians,
      showConfidenceSummary,
      showConstraintsForMoment,
      trackFirstInteraction,
      wallThickness,
    ]
  );

  const rotateSelectedByDegrees = useCallback(
    (deltaDegrees: number, options?: ApplySelectionRotationOptions) => {
      const selectedId = getPrimaryId();
      const currentItem = getItems().find((item) => item.instanceId === selectedId);
      if (!currentItem) return;
      applyItemRotation(currentItem.instanceId,
        (currentItem.rotationY ?? 0) + (deltaDegrees * Math.PI) / 180,
        {
          ...options,
          actionLabel: `Rotate ${deltaDegrees > 0 ? "+" : ""}${deltaDegrees}°`,
          source: options?.source ?? "inspector",
        });
    },
    [applyItemRotation, getItems, getPrimaryId]
  );

  const resetSelectedRotation = useCallback(
    (options?: ApplySelectionRotationOptions) => {
      const selectedId = getPrimaryId();
      if (!selectedId) return;
      applyItemRotation(selectedId, 0, { ...options, actionLabel: "Reset rotation",
        source: options?.source ?? "inspector" });
    }, [applyItemRotation, getPrimaryId]);
  const setSelectedRotationDegrees = useCallback(
    (degrees: number, snap: boolean, actionLabel: string) => {
      if (!selectedItem) return;
      const accepted = applyItemRotation(
        selectedItem.instanceId,
        (degrees * Math.PI) / 180,
        { snap, actionLabel, source: "inspector" }
      );
      if (accepted !== false) {
        setRotationInputValue(String(normalizeRotationDegrees(degrees)));
      }
    },
    [applyItemRotation, selectedItem, setRotationInputValue]
  );

  const applyRotationInputValue = useCallback(() => {
    if (!selectedItem) return;
    const parsed = Number(rotationInputValue);
    if (!Number.isFinite(parsed)) {
      setRotationInputValue(String(selectedRotationDegrees));
      return;
    }
    setSelectedRotationDegrees(parsed, false, `Set rotation to ${parsed}°`);
  }, [
    rotationInputValue,
    selectedItem,
    selectedRotationDegrees,
    setRotationInputValue,
    setSelectedRotationDegrees,
  ]);

  const commitSelectedItemPosition = useCallback(
    (
      targetX: number,
      targetZ: number,
      actionLabel: string,
      alreadyThereMessage?: string
    ): boolean => {
      if (!selectedItem || !selectedProduct || !activeRoom || !canEdit) return false;
      if (isDesigner && selectedItem.locked) {
        reportTransformRejection("move", "Unlock this item to move it.");
        return false;
      }
      const dimensionsMm =
        selectedItemPlanningDimensionsMm ??
        resolveCatalogVariant(selectedProduct, selectedItem.variantId).dimsMm;
      const [safeX, safeZ] = clampToActiveRoom(
        targetX,
        targetZ,
        dimensionsMm.w / 1000,
        dimensionsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        selectedItem.rotationY ?? 0
      );
      const nextPosition: ItemPosition = [
        safeX,
        selectedItem.position[1] ?? 0,
        safeZ,
      ];
      if (
        !isCatalogPlacementContainedInRoom(
          activeRoom,
          nextPosition,
          selectedItem.rotationY ?? 0,
          dimensionsMm
        )
      ) {
        reportTransformRejection(
          "move",
          `Place the whole item inside ${activeRoom.name}.`
        );
        return false;
      }
      const blocker = findCatalogPlacementBlockerInRoom(
        activeRoom,
        selectedItem.productId,
        nextPosition,
        selectedItem.rotationY ?? 0,
        dimensionsMm,
        [selectedItem.instanceId, selectedItem.supportInstanceId ?? ""].filter(Boolean)
      );
      if (blocker) {
        reportTransformRejection(
          "move",
          `Blocked by ${getItemDisplayName(blocker) ?? "another item"}.`
        );
        return false;
      }
      if (
        Math.abs(safeX - selectedItem.position[0]) < 1e-9 &&
        Math.abs(safeZ - selectedItem.position[2]) < 1e-9
      ) {
        if (alreadyThereMessage) showToast(alreadyThereMessage);
        return true;
      }
      commitItems(
        (previousItems) =>
          previousItems.map((item) =>
            item.instanceId === selectedItem.instanceId
              ? { ...item, position: nextPosition }
              : item
          ),
        actionLabel
      );
      return true;
    },
    [
      activeRoom,
      canEdit,
      clampToActiveRoom,
      commitItems,
      findCatalogPlacementBlockerInRoom,
      getItemDisplayName,
      isCatalogPlacementContainedInRoom,
      isDesigner,
      reportTransformRejection,
      roomDepth,
      roomWidth,
      selectedItem,
      selectedItemPlanningDimensionsMm,
      selectedProduct,
      showToast,
      wallThickness,
    ]
  );

  const duplicateSelectedItem = useCallback(() => {
    if (!selectedItem || !selectedProduct || !activeRoom || !canEdit) return;
    if (isDesigner && selectedItem.locked) {
      reportTransformRejection("duplicate", "Unlock this item to duplicate it.");
      return;
    }

    const resolved = resolveCatalogVariant(selectedProduct, selectedItem.variantId);
    const [effectiveWidth, effectiveDepth] = getRotatedFootprint(
      resolved.dimsMm.w / 1000,
      resolved.dimsMm.d / 1000,
      selectedItem.rotationY ?? 0
    );
    let candidate:
      | {
          position: ItemPosition;
          rotationY: number;
          supportInstanceId?: string;
        }
      | undefined;
    const seenPositions = new Set<string>();

    for (const [deltaX, deltaZ] of buildNearbyDuplicateOffsets({
      widthMeters: effectiveWidth,
      depthMeters: effectiveDepth,
    })) {
      const requestedPosition: ItemPosition = [
        selectedItem.position[0] + deltaX,
        selectedItem.position[1] ?? 0,
        selectedItem.position[2] + deltaZ,
      ];
      const surfacePlacement = isSurfaceOnlyCatalogItem(selectedProduct)
        ? findCatalogSurfacePlacement({
            productId: selectedItem.productId,
            variantId: selectedItem.variantId,
            purchaseOptionId: selectedItem.purchaseOptionId,
            roomId: activeRoom.id,
            items: getItems(),
            nearPosition: requestedPosition,
          })
        : null;
      const candidateRotationY =
        surfacePlacement?.rotationY ?? selectedItem.rotationY ?? 0;
      const candidatePosition: ItemPosition = surfacePlacement
        ? surfacePlacement.position
        : (() => {
            const [safeX, safeZ] = clampToActiveRoom(
              requestedPosition[0],
              requestedPosition[2],
              resolved.dimsMm.w / 1000,
              resolved.dimsMm.d / 1000,
              roomWidth,
              roomDepth,
              wallThickness,
              candidateRotationY
            );
            return [safeX, requestedPosition[1], safeZ];
          })();
      const positionKey = candidatePosition.map((value) => value.toFixed(4)).join(":");
      if (seenPositions.has(positionKey)) continue;
      seenPositions.add(positionKey);
      if (
        Math.abs(candidatePosition[0] - selectedItem.position[0]) < 1e-9 &&
        Math.abs(candidatePosition[2] - selectedItem.position[2]) < 1e-9
      ) {
        continue;
      }
      if (
        !isCatalogPlacementContainedInRoom(
          activeRoom,
          candidatePosition,
          candidateRotationY,
          resolved.dimsMm
        )
      ) {
        continue;
      }
      const blocker = findCatalogPlacementBlockerInRoom(
        activeRoom,
        selectedItem.productId,
        candidatePosition,
        candidateRotationY,
        resolved.dimsMm,
        surfacePlacement?.supportInstanceId ?? selectedItem.supportInstanceId
      );
      if (blocker) continue;
      candidate = {
        position: candidatePosition,
        rotationY: candidateRotationY,
        supportInstanceId:
          surfacePlacement?.supportInstanceId ?? selectedItem.supportInstanceId,
      };
      break;
    }

    if (!candidate) {
      reportTransformRejection(
        "duplicate",
        isSurfaceOnlyCatalogItem(selectedProduct)
          ? "No clear supported surface is available for a duplicate."
          : "No clear nearby space is available for a duplicate."
      );
      return;
    }

    const instanceId = createInstanceId();
    const duplicate: DesignItem = {
      ...selectedItem,
      instanceId,
      position: candidate.position,
      rotationY: candidate.rotationY,
      supportInstanceId: candidate.supportInstanceId,
    };
    commitItems(
      (previousItems) => [...previousItems, duplicate],
      `Duplicate ${selectedProduct.title}`
    );
    updateSelection(new Set([instanceId]), instanceId);
  }, [
    activeRoom,
    canEdit,
    clampToActiveRoom,
    commitItems,
    createInstanceId,
    findCatalogPlacementBlockerInRoom,
    getItems,
    isCatalogPlacementContainedInRoom,
    isDesigner,
    reportTransformRejection,
    roomDepth,
    roomWidth,
    selectedItem,
    selectedProduct,
    updateSelection,
    wallThickness,
  ]);

  const deleteSelectedItem = useCallback(() => {
    if (!selectedItem || !canEdit) return;
    if (isDesigner && selectedItem.locked) {
      reportTransformRejection("delete", "Unlock this item to delete it.");
      return;
    }
    commitItems(
      (previousItems) =>
        previousItems.filter((item) => item.instanceId !== selectedItem.instanceId),
      `Delete ${selectedItemDeleteLabel}`
    );

    const currentSelection = getSelectedIds();
    if (!currentSelection.has(selectedItem.instanceId)) return;
    const nextSelection = new Set(currentSelection);
    nextSelection.delete(selectedItem.instanceId);
    const currentPrimaryId = getPrimaryId();
    const nextPrimaryId =
      currentPrimaryId === selectedItem.instanceId
        ? nextSelection.size
          ? Array.from(nextSelection)[nextSelection.size - 1]
          : null
        : currentPrimaryId;
    updateSelection(nextSelection, nextPrimaryId);
  }, [
    canEdit,
    commitItems,
    getPrimaryId,
    getSelectedIds,
    isDesigner,
    reportTransformRejection,
    selectedItem,
    selectedItemDeleteLabel,
    updateSelection,
  ]);

  const centerSelectedItemInRoom = useCallback(() => {
    commitSelectedItemPosition(
      0,
      0,
      "Center item",
      "This item is already centered."
    );
  }, [commitSelectedItemPosition]);

  const snapSelectedItemToNearestWall = useCallback(() => {
    if (!selectedItem || !selectedProduct || !canEdit) return;
    const resolved = resolveCatalogVariant(selectedProduct, selectedItem.variantId);
    const [effectiveWidth, effectiveDepth] = getRotatedFootprint(
      resolved.dimsMm.w / 1000,
      resolved.dimsMm.d / 1000,
      selectedItem.rotationY ?? 0
    );
    const wallInset = getFurnitureWallInset(wallThickness);
    const wallX = Math.max(0, roomWidth / 2 - wallInset - effectiveWidth / 2);
    const wallZ = Math.max(0, roomDepth / 2 - wallInset - effectiveDepth / 2);
    const candidates: Array<[number, number]> = [
      [-wallX, selectedItem.position[2]],
      [wallX, selectedItem.position[2]],
      [selectedItem.position[0], -wallZ],
      [selectedItem.position[0], wallZ],
    ];
    const [targetX, targetZ] = candidates.reduce((best, candidate) =>
      Math.hypot(
        candidate[0] - selectedItem.position[0],
        candidate[1] - selectedItem.position[2]
      ) <
      Math.hypot(
        best[0] - selectedItem.position[0],
        best[1] - selectedItem.position[2]
      )
        ? candidate
        : best
    );
    const [safeX, safeZ] = clampToActiveRoom(
      targetX,
      targetZ,
      resolved.dimsMm.w / 1000,
      resolved.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness,
      selectedItem.rotationY ?? 0
    );
    commitSelectedItemPosition(
      safeX,
      safeZ,
      "Snap item to wall",
      "This item is already snapped to the nearest wall."
    );
  }, [
    canEdit,
    clampToActiveRoom,
    commitSelectedItemPosition,
    roomDepth,
    roomWidth,
    selectedItem,
    selectedProduct,
    wallThickness,
  ]);

  const moveSelectedItemToRoom = useCallback(
    (targetRoomId: string) => {
      if (!selectedItem || !activeRoom || !canEdit) return;
      if (isDesigner && selectedItem.locked) return;
      if (targetRoomId === activeRoom.id) return;
      const targetRoom = roomSnapshotById.get(targetRoomId);
      if (!targetRoom) return;

      const currentSelectedIds = getSelectedIds();
      const movableSelectedItems = activeRoom.items.filter(
        (item) =>
          currentSelectedIds.has(item.instanceId) && !(isDesigner && item.locked)
      );
      if (movableSelectedItems.length > 1) {
        const groupCenter = movableSelectedItems.reduce(
          (sum, item) => ({
            x: sum.x + item.position[0],
            z: sum.z + item.position[2],
          }),
          { x: 0, z: 0 }
        );
        groupCenter.x /= movableSelectedItems.length;
        groupCenter.z /= movableSelectedItems.length;

        const movedItems: DesignItem[] = [];
        for (const item of movableSelectedItems) {
          const product = CATALOG_ITEMS[item.productId];
          if (!product) continue;
          const dimensionsMm = getPlanningDimensions(item, product);
          const [safeX, safeZ] = clampToCatalogPlacementRoom(
            targetRoom,
            item.position[0] - groupCenter.x,
            item.position[2] - groupCenter.z,
            dimensionsMm.w / 1000,
            dimensionsMm.d / 1000,
            item.rotationY ?? 0
          );
          const nextItem: DesignItem = {
            ...item,
            position: [safeX, item.position[1] ?? 0, safeZ],
          };
          if (
            !isCatalogPlacementContainedInRoom(
              targetRoom,
              nextItem.position,
              nextItem.rotationY ?? 0,
              dimensionsMm
            )
          ) {
            showToast(`Place fully inside ${targetRoom.name}`);
            return;
          }
          const blocker = findCatalogPlacementBlockerInRoom(
            targetRoom,
            nextItem.productId,
            nextItem.position,
            nextItem.rotationY ?? 0,
            dimensionsMm,
            nextItem.supportInstanceId
          );
          if (blocker) {
            showToast(`Blocked by ${getItemDisplayName(blocker) ?? "another item"}`);
            return;
          }
          movedItems.push(nextItem);
        }

        for (let firstIndex = 0; firstIndex < movedItems.length; firstIndex += 1) {
          const firstBounds = getItemAABB(movedItems[firstIndex]);
          if (!firstBounds) continue;
          for (
            let secondIndex = firstIndex + 1;
            secondIndex < movedItems.length;
            secondIndex += 1
          ) {
            const secondBounds = getItemAABB(movedItems[secondIndex]);
            if (secondBounds && aabbIntersects(firstBounds, secondBounds)) {
              showToast("Selected items overlap in the target room.");
              return;
            }
          }
        }

        const movedIds = new Set(movedItems.map((item) => item.instanceId));
        history.executeCommand({
          id: "move-items-between-rooms",
          description: `Move ${movedItems.length} items to ${targetRoom.name}`,
          input: {
            sourceRoomId: activeRoom.id,
            targetRoomId: targetRoom.id,
            movedItems,
            activateTargetRoom: true,
          },
          execute: (input) => {
            const nextSnapshot = applyMoveItemsBetweenRoomsCommand(
              getDesignSnapshot(),
              input
            );
            setDesignSnapshot(nextSnapshot);
            replaceActiveItemsSnapshot(
              nextSnapshot.rooms.find((room) => room.id === targetRoom.id)
                ?.items ?? []
            );
          },
        });
        updateSelection(movedIds, movedItems[0]?.instanceId ?? null);
        showToast(`Moved ${movedItems.length} items to ${targetRoom.name}`);
        return;
      }

      transferItemToRoom(selectedItem.instanceId, activeRoom.id, targetRoom, [
        selectedItem.position[0] + activeRoomPlanOffset.x,
        selectedItem.position[1] ?? 0,
        selectedItem.position[2] + activeRoomPlanOffset.z,
      ]);
    },
    [
      activeRoom,
      activeRoomPlanOffset.x,
      activeRoomPlanOffset.z,
      canEdit,
      clampToCatalogPlacementRoom,
      findCatalogPlacementBlockerInRoom,
      getDesignSnapshot,
      getItemAABB,
      getItemDisplayName,
      getPlanningDimensions,
      getSelectedIds,
      history,
      isCatalogPlacementContainedInRoom,
      isDesigner,
      replaceActiveItemsSnapshot,
      roomSnapshotById,
      selectedItem,
      setDesignSnapshot,
      showToast,
      transferItemToRoom,
      updateSelection,
    ]
  );

  const moveSelectedItemToPosition = useCallback(
    (targetX: number, targetZ: number, actionLabel = "Move item") => {
      commitSelectedItemPosition(targetX, targetZ, actionLabel);
    },
    [commitSelectedItemPosition]
  );

  const nudgeSelectedItem = useCallback(
    (deltaX: number, deltaZ: number) => {
      if (!selectedItem) return;
      moveSelectedItemToPosition(
        selectedItem.position[0] + deltaX,
        selectedItem.position[2] + deltaZ,
        "Nudge item"
      );
    },
    [moveSelectedItemToPosition, selectedItem]
  );

  const setSelectedItemQuantity = useCallback(
    (instanceId: string, quantity: number) => {
      commitItems(
        (previousItems) =>
          previousItems.map((item) =>
            item.instanceId === instanceId ? { ...item, qty: quantity } : item
          ),
        "Change quantity"
      );
    },
    [commitItems]
  );

  const setShoppingItemInclude = useCallback(
    (instanceId: string, includeInCheckout: boolean) => {
      commitItems(
        (previousItems) =>
          previousItems.map((item) =>
            item.instanceId === instanceId ? { ...item, includeInCheckout } : item
          ),
        includeInCheckout ? "Include in checkout" : "Exclude from checkout"
      );
      showToast(includeInCheckout ? "Added to checkout" : "Excluded from checkout");
    },
    [commitItems, showToast]
  );

  const addActiveRoomCartReadyItems = useCallback(() => {
    const readyInstanceIds = new Set(
      activeRoomShoppingItems
        .filter((item) => item.commerceMode === "shopify" && item.hasValidCommerce)
        .map((item) => item.instanceId)
    );
    if (readyInstanceIds.size === 0) {
      showToast("No cart-ready checkout items in this room yet.");
      return;
    }

    let changedCount = 0;
    commitItems(
      (previousItems) =>
        previousItems.map((item) => {
          if (!readyInstanceIds.has(item.instanceId)) return item;
          if (item.includeInCheckout ?? true) return item;
          changedCount += 1;
          return { ...item, includeInCheckout: true };
        }),
      "Add room cart-ready items"
    );
    showToast(
      changedCount > 0
        ? `${changedCount} cart-ready item${changedCount === 1 ? "" : "s"} added to checkout.`
        : "All cart-ready items in this room are already included."
    );
  }, [activeRoomShoppingItems, commitItems, showToast]);

  const selectProductVariant = useCallback(
    (variantId: string) => {
      if (!selectedItem) return;
      commitItems((previousItems) =>
        previousItems.map((item) =>
          item.instanceId === selectedItem.instanceId ? { ...item, variantId } : item
        )
      );
    },
    [commitItems, selectedItem]
  );

  return {
    state: {
      selectedRotationDegrees,
      rotateControlsDisabled,
    },
    actions: {
      alignSelectionX,
      alignSelectionZ,
      applyItemRotation,
      rotateSelectedByDegrees,
      resetSelectedRotation,
      applyRotationInputValue,
      duplicateSelectedItem,
      deleteSelectedItem,
      centerSelectedItemInRoom,
      snapSelectedItemToNearestWall,
      moveSelectedItemToRoom,
      moveSelectedItemToPosition,
      nudgeSelectedItem,
      setSelectedItemQuantity,
      setShoppingItemInclude,
      addActiveRoomCartReadyItems,
      selectProductVariant,
    },
  };
}
