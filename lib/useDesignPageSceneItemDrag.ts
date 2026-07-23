"use client";

import { useRef, type MutableRefObject } from "react";

import { trackProductEvent } from "@/lib/analytics";
import { CATALOG_ITEMS } from "@/lib/catalog";
import {
  findCatalogSurfacePlacement,
  getCeilingMountedItemBaseY,
  isCeilingOnlyCatalogItem,
  isSurfaceOnlyCatalogItem,
} from "@/lib/catalog-placement";
import { evaluateConstraints, type ConstraintResult } from "@/lib/constraints/evaluate";
import { aabbIntersects, type AABB } from "@/lib/design-page-geometry";
import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import {
  applyDesignItemTransformPatches,
  SCENE_ITEM_DRAG_COMMAND_ID,
  type DesignItemTransformPatch,
} from "@/lib/design-page-item-commands";
import type { HistoryCommand } from "@/lib/historyManager";
import type {
  SceneItemDragEndContext,
  SceneItemMoveContext,
} from "@/components/editor/design-page/SceneItemsLayer";
import type {
  DesignItem,
  RoomPlanPolygonPoint,
  RoomPlanShape,
  RoomSnapshot,
} from "@/lib/room-types";

type CrossRoomDragTarget = {
  roomId: string;
  label: string;
  valid: boolean;
  kind: "item";
};

type PlanningDimensions = { w: number; d: number; h: number };

type SceneDragHistory = {
  beginContinuousCommand: (command: {
    id: string;
    description: string;
  }) => void;
  updateContinuousCommand: <TInput, TResult>(
    command: HistoryCommand<TInput, TResult>
  ) => TResult;
  commitContinuousCommand: (commandId: string) => void;
  rollbackContinuousCommand: (commandId: string) => void;
};

type SceneItemDragOptions = {
  state: {
    hasWholeHousePlan: boolean;
    designerMode: boolean;
    activeRoom: RoomSnapshot | null;
    roomWidth: number;
    roomDepth: number;
    wallThickness: number;
    roomSnapshotById: ReadonlyMap<string, RoomSnapshot>;
  };
  refs: {
    items: MutableRefObject<DesignItem[]>;
    selectedIds: MutableRefObject<Set<string>>;
    dragCommit: MutableRefObject<boolean>;
  };
  actions: {
    findPlanRoomAtWorldPoint: (
      x: number,
      z: number
    ) => { id: string; x: number; z: number } | null;
    setCrossRoomDragTarget: (target: CrossRoomDragTarget | null) => void;
    findPlacementBlocker: (
      room: RoomSnapshot,
      productId: string,
      position: [number, number, number],
      rotationY: number,
      dimensions: PlanningDimensions,
      excludedIds?: string | string[]
    ) => DesignItem | null;
    isPlacementContained: (
      room: RoomSnapshot,
      position: [number, number, number],
      rotationY: number,
      dimensions: PlanningDimensions
    ) => boolean;
    clampToRoom: (
      x: number,
      z: number,
      width: number,
      depth: number,
      roomWidth: number,
      roomDepth: number,
      wallThickness: number,
      rotationY?: number,
      planShape?: RoomPlanShape,
      planPolygon?: RoomPlanPolygonPoint[],
      planHoles?: RoomPlanPolygonPoint[][]
    ) => [number, number];
    getItemBounds: (item: DesignItem) => AABB | null;
    getItemDisplayName: (item: DesignItem | null | undefined) => string | null;
    setItems: (
      next: DesignItem[] | ((previous: DesignItem[]) => DesignItem[])
    ) => void;
    previewItems: (
      next: DesignItem[] | ((previous: DesignItem[]) => DesignItem[])
    ) => DesignItem[];
    history: SceneDragHistory;
    trackFirstInteraction: () => void;
    showToast: (message: string) => void;
    moveSelectionToRoom: (roomId: string) => void;
    transferItemToRoom: (
      itemId: string,
      sourceRoomId: string,
      targetRoom: RoomSnapshot,
      worldPosition: [number, number, number]
    ) => boolean;
    showConstraints: (results: ConstraintResult[]) => void;
    showConfidence: (results: ConstraintResult[]) => void;
  };
};

export function useDesignPageSceneItemDrag({
  state,
  refs,
  actions,
}: SceneItemDragOptions) {
  const {
    hasWholeHousePlan,
    designerMode,
    activeRoom,
    roomWidth,
    roomDepth,
    wallThickness,
    roomSnapshotById,
  } = state;
  const { items: itemsRef, selectedIds: selectedIdsRef, dragCommit: dragCommitRef } = refs;
  const {
    findPlanRoomAtWorldPoint,
    setCrossRoomDragTarget,
    findPlacementBlocker,
    isPlacementContained,
    clampToRoom,
    getItemBounds,
    getItemDisplayName,
    previewItems,
    setItems,
    history,
    trackFirstInteraction,
    showToast,
    moveSelectionToRoom,
    transferItemToRoom,
    showConstraints,
    showConfidence,
  } = actions;
  const dragOriginalItemsRef = useRef<DesignItem[] | null>(null);
  const dragDescriptionRef = useRef("Move item");
  const dragRejectionRef = useRef<{ message: string; shownAt: number } | null>(null);

  const showDragRejection = (message: string): void => {
    const now = Date.now();
    const previous = dragRejectionRef.current;
    if (previous && previous.message === message && now - previous.shownAt < 1_500) {
      return;
    }
    dragRejectionRef.current = { message, shownAt: now };
    showToast(message);
  };

  const applyDragPatches = (
    description: string,
    patches: DesignItemTransformPatch[],
    publishAllMovedItems = false
  ): void => {
    if (!dragCommitRef.current) {
      dragOriginalItemsRef.current = itemsRef.current;
      dragDescriptionRef.current = description;
      history.beginContinuousCommand({
        id: SCENE_ITEM_DRAG_COMMAND_ID,
        description,
      });
    }

    try {
      history.updateContinuousCommand({
        id: SCENE_ITEM_DRAG_COMMAND_ID,
        description,
        input: patches,
        execute: (input) => {
          const update = (previous: DesignItem[]) =>
            applyDesignItemTransformPatches(previous, input);
          if (publishAllMovedItems) {
            setItems(update);
          } else {
            previewItems(update);
          }
        },
      });
      dragCommitRef.current = true;
    } catch (error) {
      dragCommitRef.current = false;
      if (dragOriginalItemsRef.current) {
        previewItems(dragOriginalItemsRef.current);
      }
      dragOriginalItemsRef.current = null;
      throw error;
    }
  };

  const rollbackActiveDrag = (): void => {
    if (!dragCommitRef.current) return;
    history.rollbackContinuousCommand(SCENE_ITEM_DRAG_COMMAND_ID);
    if (dragOriginalItemsRef.current) {
      previewItems(dragOriginalItemsRef.current);
    }
    dragCommitRef.current = false;
    dragOriginalItemsRef.current = null;
  };

  const commitActiveDrag = (): void => {
    if (!dragCommitRef.current) return;
    try {
      history.updateContinuousCommand({
        id: SCENE_ITEM_DRAG_COMMAND_ID,
        description: dragDescriptionRef.current,
        input: itemsRef.current,
        execute: (input) => setItems(input),
      });
      history.commitContinuousCommand(SCENE_ITEM_DRAG_COMMAND_ID);
      trackProductEvent("object_transformed", {
        operation: "move",
        source: "scene_drag",
        itemCount: Math.max(1, selectedIdsRef.current.size),
        result: "success",
      });
      dragCommitRef.current = false;
      dragOriginalItemsRef.current = null;
    } catch (error) {
      if (dragOriginalItemsRef.current) {
        previewItems(dragOriginalItemsRef.current);
      }
      dragCommitRef.current = false;
      dragOriginalItemsRef.current = null;
      throw error;
    }
  };

  const handleMove = ({
    sceneEntry,
    configuredPlanningDimsMm: configuredPlanningDims,
    id,
    position,
  }: SceneItemMoveContext): boolean => {
    if (!sceneEntry.isActiveRoom) return false;

    try {
      trackFirstInteraction();
      const pointerRoom = hasWholeHousePlan
        ? findPlanRoomAtWorldPoint(position[0], position[2])
        : null;
      if (hasWholeHousePlan && !pointerRoom) {
        setCrossRoomDragTarget({
          roomId: sceneEntry.roomId,
          label: "Place inside a room",
          valid: false,
          kind: "item",
        });
        showDragRejection("Drop the item fully inside a room.");
        return false;
      }

      const localPosition: [number, number, number] = [
        position[0] - sceneEntry.roomOffset.x,
        position[1] ?? 0,
        position[2] - sceneEntry.roomOffset.z,
      ];
      const selectedIds = selectedIdsRef.current;
      const groupMove = selectedIds.size > 1 && selectedIds.has(id);

      if (!groupMove) {
        const currentItems = itemsRef.current;
        const mover = currentItems.find((item) => item.instanceId === id);
        if (!mover) {
          showDragRejection("This item is no longer available.");
          return false;
        }
        const product = CATALOG_ITEMS[mover.productId];
        if (product?.category === "rug") return true;

        if (
          isSurfaceOnlyCatalogItem(product) &&
          !(pointerRoom && pointerRoom.id !== sceneEntry.roomId && hasWholeHousePlan)
        ) {
          const surfacePlacement = findCatalogSurfacePlacement({
            productId: mover.productId,
            variantId: mover.variantId,
            purchaseOptionId: mover.purchaseOptionId,
            roomId: sceneEntry.roomId,
            items: currentItems,
            nearPosition: localPosition,
          });
          if (!surfacePlacement) {
            showDragRejection("Place this item on a clear supported surface.");
            return false;
          }
          const moverRoom = roomSnapshotById.get(sceneEntry.roomId) ?? activeRoom;
          if (!moverRoom) {
            showDragRejection("Choose a room before moving this item.");
            return false;
          }
          const candidate = {
            ...mover,
            position: surfacePlacement.position,
            rotationY: surfacePlacement.rotationY,
            supportInstanceId: surfacePlacement.supportInstanceId,
          };
          if (
            !isPlacementContained(
              moverRoom,
              candidate.position,
              candidate.rotationY ?? 0,
              configuredPlanningDims
            )
          ) {
            showDragRejection(`Place the whole item inside ${moverRoom.name}.`);
            return false;
          }
          const blocker = findPlacementBlocker(
            moverRoom,
            mover.productId,
            candidate.position,
            candidate.rotationY ?? 0,
            configuredPlanningDims,
            [mover.instanceId, surfacePlacement.supportInstanceId ?? ""].filter(Boolean)
          );
          if (blocker) {
            showDragRejection(
              `Move blocked by ${getItemDisplayName(blocker) ?? "another item"}.`
            );
            return false;
          }
          applyDragPatches("Move item", [
            {
              instanceId: id,
              changes: {
                position: surfacePlacement.position,
                rotationY: surfacePlacement.rotationY,
                supportInstanceId: surfacePlacement.supportInstanceId,
              },
            },
          ]);
          return true;
        }

        if (pointerRoom && pointerRoom.id !== sceneEntry.roomId && hasWholeHousePlan) {
          const targetRoom = roomSnapshotById.get(pointerRoom.id);
          if (!targetRoom) {
            setCrossRoomDragTarget(null);
            return true;
          }
          const targetLocalPosition: [number, number, number] = [
            position[0] - pointerRoom.x,
            position[1] ?? 0,
            position[2] - pointerRoom.z,
          ];
          const surfacePlacement = isSurfaceOnlyCatalogItem(product)
            ? findCatalogSurfacePlacement({
                productId: mover.productId,
                variantId: mover.variantId,
                purchaseOptionId: mover.purchaseOptionId,
                roomId: targetRoom.id,
                items: targetRoom.items,
                nearPosition: targetLocalPosition,
              })
            : null;
          const [safeX, safeZ] = surfacePlacement
            ? [surfacePlacement.position[0], surfacePlacement.position[2]]
            : clampToRoom(
                targetLocalPosition[0],
                targetLocalPosition[2],
                configuredPlanningDims.w / 1000,
                configuredPlanningDims.d / 1000,
                targetRoom.geometry.width,
                targetRoom.geometry.depth,
                targetRoom.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness,
                mover.rotationY ?? 0,
                targetRoom.planShape,
                targetRoom.planPolygon,
                targetRoom.planHoles
              );
          const targetPosition: [number, number, number] = surfacePlacement
            ? surfacePlacement.position
            : [
                safeX,
                isCeilingOnlyCatalogItem(product)
                  ? getCeilingMountedItemBaseY({
                      product,
                      dimsMm: configuredPlanningDims,
                      roomHeight:
                        targetRoom.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight,
                    })
                  : targetLocalPosition[1],
                safeZ,
              ];
          const blocker = findPlacementBlocker(
            targetRoom,
            mover.productId,
            targetPosition,
            surfacePlacement?.rotationY ?? mover.rotationY ?? 0,
            configuredPlanningDims,
            [mover.instanceId, surfacePlacement?.supportInstanceId ?? ""].filter(Boolean)
          );
          const contained = isPlacementContained(
            targetRoom,
            targetPosition,
            surfacePlacement?.rotationY ?? mover.rotationY ?? 0,
            configuredPlanningDims
          );
          setCrossRoomDragTarget({
            roomId: targetRoom.id,
            label:
              isSurfaceOnlyCatalogItem(product) && !surfacePlacement
                ? `Add a table in ${targetRoom.name}`
                : !contained
                  ? `Place fully inside ${targetRoom.name}`
                  : blocker
                    ? getItemDisplayName(blocker) ?? targetRoom.name
                    : targetRoom.name,
            valid: Boolean(
              (!isSurfaceOnlyCatalogItem(product) || surfacePlacement) && contained && !blocker
            ),
            kind: "item",
          });
          return true;
        }

        if (hasWholeHousePlan) {
          setCrossRoomDragTarget({
            roomId: sceneEntry.roomId,
            label: roomSnapshotById.get(sceneEntry.roomId)?.name ?? "Current room",
            valid: true,
            kind: "item",
          });
        }

        const moverRoom = roomSnapshotById.get(sceneEntry.roomId) ?? activeRoom;
        if (
          moverRoom &&
          !isPlacementContained(
            moverRoom,
            localPosition,
            mover.rotationY ?? 0,
            configuredPlanningDims
          )
        ) {
          showDragRejection(
            `Move blocked by a wall. Keep the whole item inside ${moverRoom.name}.`
          );
          return false;
        }

        const moverBounds = getItemBounds({ ...mover, position: localPosition });
        if (moverBounds) {
          for (const blocker of currentItems) {
            if (blocker.instanceId === id) continue;
            const blockerProduct = CATALOG_ITEMS[blocker.productId];
            if (blockerProduct?.category === "rug") continue;
            if (
              isCeilingOnlyCatalogItem(product) !==
              isCeilingOnlyCatalogItem(blockerProduct)
            ) {
              continue;
            }
            const blockerBounds = getItemBounds(blocker);
            if (blockerBounds && aabbIntersects(moverBounds, blockerBounds)) {
              showDragRejection(
                `Move blocked by ${getItemDisplayName(blocker) ?? "another item"}.`
              );
              return false;
            }
          }
        }
        applyDragPatches("Move item", [
          { instanceId: id, changes: { position: localPosition } },
        ]);
        return true;
      }

      const currentItems = itemsRef.current;
      const mover = currentItems.find((item) => item.instanceId === id);
      if (!mover) {
        showDragRejection("This item is no longer available.");
        return false;
      }
      if (pointerRoom && pointerRoom.id !== sceneEntry.roomId && hasWholeHousePlan) {
        const targetRoom = roomSnapshotById.get(pointerRoom.id);
        setCrossRoomDragTarget({
          roomId: pointerRoom.id,
          label: targetRoom?.name ?? "Target room",
          valid: Boolean(targetRoom),
          kind: "item",
        });
        return true;
      }

      const deltaX = localPosition[0] - mover.position[0];
      const deltaZ = localPosition[2] - mover.position[2];
      const movable = currentItems.filter(
        (item) => selectedIds.has(item.instanceId) && !(designerMode && item.locked)
      );
      if (!movable.length) {
        showDragRejection("Unlock at least one selected item to move the group.");
        return false;
      }
      const movableIds = new Set(movable.map((item) => item.instanceId));
      const blockers = currentItems.filter((item) => !movableIds.has(item.instanceId));
      const nextItems = currentItems.map((item) => {
        if (!movableIds.has(item.instanceId)) return item;
        const product = CATALOG_ITEMS[item.productId];
        if (!product) return item;
        const [safeX, safeZ] = clampToRoom(
          item.position[0] + deltaX,
          item.position[2] + deltaZ,
          product.dimsMm.w / 1000,
          product.dimsMm.d / 1000,
          roomWidth,
          roomDepth,
          wallThickness,
          item.rotationY ?? 0,
          activeRoom?.planShape,
          activeRoom?.planPolygon,
          activeRoom?.planHoles
        );
        return {
          ...item,
          position: [safeX, item.position[1] ?? 0, safeZ] as [number, number, number],
        };
      });

      for (const moved of nextItems) {
        if (!movableIds.has(moved.instanceId)) continue;
        const movedProduct = CATALOG_ITEMS[moved.productId];
        if (movedProduct?.category === "rug") continue;
        const movedBounds = getItemBounds(moved);
        if (!movedBounds) continue;
        for (const blocker of blockers) {
          const blockerProduct = CATALOG_ITEMS[blocker.productId];
          if (blockerProduct?.category === "rug") continue;
          if (
            isCeilingOnlyCatalogItem(movedProduct) !==
            isCeilingOnlyCatalogItem(blockerProduct)
          ) {
            continue;
          }
          const blockerBounds = getItemBounds(blocker);
          if (blockerBounds && aabbIntersects(movedBounds, blockerBounds)) {
            showDragRejection(
              `Move blocked by ${getItemDisplayName(blocker) ?? "another item"}.`
            );
            return false;
          }
        }
      }

      applyDragPatches(
        "Move group",
        nextItems
          .filter((item) => movableIds.has(item.instanceId))
          .map((item) => ({
            instanceId: item.instanceId,
            changes: { position: item.position },
          })),
        true
      );
      return true;
    } catch (error) {
      if (dragCommitRef.current) {
        try {
          rollbackActiveDrag();
        } catch (rollbackError) {
          console.error("[Editor] failed to rollback item drag", rollbackError);
        }
      }
      console.error("[Editor] onMove handler failed", { id, pos: position, error });
      showDragRejection("Could not move the item. Try again.");
      return false;
    }
  };

  const handleDragEnd = ({
    sceneEntry,
    id,
    position,
  }: SceneItemDragEndContext): void => {
    if (!sceneEntry.isActiveRoom) return;
    let failed = false;
    try {
      const pointerRoom = hasWholeHousePlan
        ? findPlanRoomAtWorldPoint(position[0], position[2])
        : null;
      if (hasWholeHousePlan) {
        setCrossRoomDragTarget(null);
        if (!pointerRoom) return;
        const targetRoom = roomSnapshotById.get(pointerRoom.id);
        if (targetRoom && pointerRoom.id !== sceneEntry.roomId) {
          // The cross-room command owns the final history entry. Discard any
          // same-room preview so one pointer gesture cannot create two entries.
          rollbackActiveDrag();
          const selectedIds = selectedIdsRef.current;
          if (selectedIds.size > 1 && selectedIds.has(id)) {
            moveSelectionToRoom(targetRoom.id);
            return;
          }
          transferItemToRoom(id, sceneEntry.roomId, targetRoom, position);
          return;
        }
      }

      const localPosition: [number, number, number] = [
        position[0] - sceneEntry.roomOffset.x,
        position[1] ?? 0,
        position[2] - sceneEntry.roomOffset.z,
      ];
      const nextItems = itemsRef.current.map((item) =>
        item.instanceId === id ? { ...item, position: localPosition } : item
      );
      const results = evaluateConstraints({
        design: { items: nextItems },
        movedItemId: id,
        room: { width: roomWidth, depth: roomDepth, wallThickness },
      });
      showConstraints(results);
      showConfidence(results);
    } catch (error) {
      failed = true;
      console.error("[Editor] onDragEnd handler failed", { id, pos: position, error });
    } finally {
      if (dragCommitRef.current) {
        if (failed) {
          rollbackActiveDrag();
        } else {
          commitActiveDrag();
        }
      }
      dragRejectionRef.current = null;
    }
  };

  return { actions: { handleMove, handleDragEnd } };
}
