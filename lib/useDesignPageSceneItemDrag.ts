"use client";

import type { MutableRefObject } from "react";

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
  begin: (name: string) => void;
  commit: () => void;
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
    setItems,
    history,
    trackFirstInteraction,
    showToast,
    moveSelectionToRoom,
    transferItemToRoom,
    showConstraints,
    showConfidence,
  } = actions;

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
        if (!mover) return false;
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
          if (!surfacePlacement) return false;
          const moverRoom = roomSnapshotById.get(sceneEntry.roomId) ?? activeRoom;
          if (!moverRoom) return false;
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
          if (blocker) return false;
          const update = (previous: DesignItem[]) =>
            previous.map((item) =>
              item.instanceId === id
                ? {
                    ...item,
                    position: surfacePlacement.position,
                    rotationY: surfacePlacement.rotationY,
                    supportInstanceId: surfacePlacement.supportInstanceId,
                  }
                : item
            );
          if (!dragCommitRef.current) {
            history.begin("Move item");
            setItems(update(itemsRef.current));
            dragCommitRef.current = true;
          } else {
            setItems(update);
          }
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
              showToast("Overlapping item — move blocked");
              return false;
            }
          }
        }
        const update = (previous: DesignItem[]) =>
          previous.map((item) =>
            item.instanceId === id ? { ...item, position: localPosition } : item
          );
        if (!dragCommitRef.current) {
          history.begin("Move item");
          setItems(update(itemsRef.current));
          dragCommitRef.current = true;
        } else {
          setItems(update);
        }
        return true;
      }

      const currentItems = itemsRef.current;
      const mover = currentItems.find((item) => item.instanceId === id);
      if (!mover) return false;
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
      if (!movable.length) return false;
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
          if (blockerBounds && aabbIntersects(movedBounds, blockerBounds)) return false;
        }
      }

      if (!dragCommitRef.current) {
        history.begin("Move group");
        setItems(nextItems);
        dragCommitRef.current = true;
      } else {
        setItems(nextItems);
      }
      return true;
    } catch (error) {
      console.error("[Editor] onMove handler failed", { id, pos: position, error });
      return false;
    }
  };

  const handleDragEnd = ({
    sceneEntry,
    id,
    position,
  }: SceneItemDragEndContext): void => {
    if (!sceneEntry.isActiveRoom) return;
    try {
      const pointerRoom = hasWholeHousePlan
        ? findPlanRoomAtWorldPoint(position[0], position[2])
        : null;
      if (hasWholeHousePlan) {
        setCrossRoomDragTarget(null);
        if (!pointerRoom) return;
        const targetRoom = roomSnapshotById.get(pointerRoom.id);
        if (targetRoom && pointerRoom.id !== sceneEntry.roomId) {
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
      console.error("[Editor] onDragEnd handler failed", { id, pos: position, error });
    } finally {
      if (dragCommitRef.current) {
        history.commit();
        dragCommitRef.current = false;
      }
    }
  };

  return { actions: { handleMove, handleDragEnd } };
}
