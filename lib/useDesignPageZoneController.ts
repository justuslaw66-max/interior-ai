"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { track } from "@/lib/analytics";
import type { CATALOG_ITEMS } from "@/lib/catalog";
import { aabbIntersects } from "@/lib/design-page-geometry";
import {
  buildAutoLayoutZoneItems,
  buildPlanZones2D,
  buildRotatedZoneItems,
  getZoneBounds as resolveZoneBounds,
  type SelectionBounds,
  zonesEqual,
} from "@/lib/design-page-zone-layout";
import {
  buildAutoSeatingZone,
  buildManualZoneFromSelection,
  canAutoCreateSeatingZoneForEditor,
  reconcileZonesForItems,
  type AutoSeatingZoneCreationRequest,
  updateActiveRoomZones,
} from "@/lib/design-page-zone-orchestration";
import {
  type DesignItem,
  type DesignSnapshot,
  type ZoneMin,
} from "@/lib/room-types";
import type { AABB } from "@/lib/snapGuides";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

type ZoneHistory = {
  begin: (name: string) => void;
  commit: () => void;
};

type SetDesignSnapshot = (
  next: DesignSnapshot | ((previous: DesignSnapshot) => DesignSnapshot)
) => void;

type CommitItems = (
  updater: DesignItem[] | ((previous: DesignItem[]) => DesignItem[]),
  actionName?: string
) => void;

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

type GetSelectionBounds = (selected: DesignItem[]) => SelectionBounds | null;
type GetItemAABB = (item: DesignItem) => AABB | null;

export type DesignPageZoneControllerState = {
  items: DesignItem[];
  zones: ZoneMin[];
  selectedZoneId: string | null;
};

export type DesignPageZoneControllerConfiguration = {
  editorMode: DesignPageEditorMode;
  isClientPreview: boolean;
  isDesigner: boolean;
  catalogItems: typeof CATALOG_ITEMS;
  roomWidth: number;
  roomDepth: number;
  wallThickness: number;
};

export type DesignPageZoneControllerRefs = {
  selectedIds: MutableRefObject<Set<string>>;
  items: MutableRefObject<DesignItem[]>;
  zones: MutableRefObject<ZoneMin[]>;
  seatingZoneAutoDisabled: MutableRefObject<boolean>;
};

export type DesignPageZoneControllerActions = {
  setDesignSnapshot: SetDesignSnapshot;
  setSelectedZoneId: Dispatch<SetStateAction<string | null>>;
  clearSelection: () => void;
  commitItems: CommitItems;
  history: ZoneHistory;
  clampToRoom: ClampToRoom;
  getSelectionBounds: GetSelectionBounds;
  getItemAABB: GetItemAABB;
};

export type UseDesignPageZoneControllerInput = {
  state: DesignPageZoneControllerState;
  configuration: DesignPageZoneControllerConfiguration;
  refs: DesignPageZoneControllerRefs;
  actions: DesignPageZoneControllerActions;
};

export function useDesignPageZoneController({
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageZoneControllerInput) {
  const { items, zones, selectedZoneId } = state;
  const {
    editorMode,
    isClientPreview,
    isDesigner,
    catalogItems,
    roomWidth,
    roomDepth,
    wallThickness,
  } = configuration;
  const {
    selectedIds: selectedIdsRef,
    items: itemsRef,
    zones: zonesRef,
    seatingZoneAutoDisabled: seatingZoneAutoDisabledRef,
  } = refs;
  const {
    setDesignSnapshot,
    setSelectedZoneId,
    clearSelection,
    commitItems,
    history,
    clampToRoom,
    getSelectionBounds,
    getItemAABB,
  } = actions;

  const [pendingZoneType, setPendingZoneType] = useState<ZoneMin["type"]>(
    "seating"
  );

  const selectedZone = selectedZoneId
    ? zones.find((zone) => zone.id === selectedZoneId) ?? null
    : null;

  useEffect(() => {
    if (!selectedZoneId) return;
    if (!zones.some((zone) => zone.id === selectedZoneId)) {
      setSelectedZoneId(null);
    }
  }, [selectedZoneId, setSelectedZoneId, zones]);

  useEffect(() => {
    const currentZones = zonesRef.current ?? [];
    const nextZones = reconcileZonesForItems({
      zones: currentZones,
      allItems: items,
      catalogItems,
    });
    if (zonesEqual(nextZones, currentZones)) return;

    setDesignSnapshot((previous) =>
      updateActiveRoomZones(previous, nextZones)
    );
  }, [catalogItems, items, setDesignSnapshot, zonesRef]);

  const createZoneFromSelection = useCallback(() => {
    const selectedSet = selectedIdsRef.current;
    if (!selectedSet.size) return;

    const selectedItems = itemsRef.current.filter((item) =>
      selectedSet.has(item.instanceId)
    );
    if (!selectedItems.length) return;

    const next = buildManualZoneFromSelection({
      selectedSet,
      selectedItems,
      pendingZoneType,
      existingZones: zonesRef.current ?? [],
    });
    if (!next) return;
    const nextZones = reconcileZonesForItems({
      zones: next.manualZones,
      allItems: itemsRef.current,
      catalogItems,
    });

    history.begin("Create zone");
    setDesignSnapshot((previous) =>
      updateActiveRoomZones(previous, nextZones)
    );
    history.commit();
    setSelectedZoneId(next.zoneId);
    clearSelection();
  }, [
    clearSelection,
    catalogItems,
    history,
    itemsRef,
    pendingZoneType,
    selectedIdsRef,
    setDesignSnapshot,
    setSelectedZoneId,
    zonesRef,
  ]);

  const autoCreateSeatingZone = useCallback(
    (
      sofaItem: DesignItem,
      request: AutoSeatingZoneCreationRequest
    ): boolean => {
      if (
        !canAutoCreateSeatingZoneForEditor({
          editorMode,
          isClientPreview,
          source: request.source,
        })
      ) {
        return false;
      }

      const existingZones = zonesRef.current ?? [];
      if (existingZones.some((zone) => zone.type === "seating")) {
        return true;
      }
      if (seatingZoneAutoDisabledRef.current) return false;

      const next = buildAutoSeatingZone({
        sofaItem,
        existingZones,
      });
      if (!next) return false;
      const nextZones = reconcileZonesForItems({
        zones: next.manualZones,
        allItems: itemsRef.current,
        catalogItems,
      });

      history.begin("auto_create_seating_zone");

      setDesignSnapshot((previous) =>
        updateActiveRoomZones(previous, nextZones)
      );

      history.commit();
      setSelectedZoneId(next.zoneId);
      track("seating_zone_auto_created", {
        zoneId: next.zoneId,
        trigger: "first_sofa",
      });
      return true;
    },
    [
      catalogItems,
      editorMode,
      history,
      isClientPreview,
      itemsRef,
      seatingZoneAutoDisabledRef,
      setDesignSnapshot,
      setSelectedZoneId,
      zonesRef,
    ]
  );

  const autoLayoutZone = useCallback(
    (zoneId: string) => {
      try {
        const autoLayout = buildAutoLayoutZoneItems({
          zoneId,
          zones: zonesRef.current,
          currentItems: itemsRef.current,
          isDesigner,
          catalogItems,
          roomWidth,
          roomDepth,
          wallThickness,
          clampToRoom,
        });
        if (!autoLayout) return;

        commitItems(
          autoLayout.nextItems,
          `Auto-layout ${autoLayout.zoneType} zone`
        );
      } catch (error) {
        console.error("[Zone] Auto-layout failed", { zoneId, error });
      }
    },
    [
      catalogItems,
      clampToRoom,
      commitItems,
      isDesigner,
      itemsRef,
      roomDepth,
      roomWidth,
      wallThickness,
      zonesRef,
    ]
  );

  const rotateZone = useCallback(
    (zoneId: string, deltaRot: number) => {
      try {
        const nextItems = buildRotatedZoneItems({
          zoneId,
          deltaRot,
          zones: zonesRef.current,
          currentItems: itemsRef.current,
          isDesigner,
          catalogItems,
          roomWidth,
          roomDepth,
          wallThickness,
          clampToRoom,
          getSelectionBounds,
          getItemAABB,
          aabbIntersects,
        });
        if (!nextItems) return;

        commitItems(nextItems, "Rotate zone");
      } catch (error) {
        console.error("[Zone] Rotate failed", { zoneId, deltaRot, error });
      }
    },
    [
      catalogItems,
      clampToRoom,
      commitItems,
      getItemAABB,
      getSelectionBounds,
      isDesigner,
      itemsRef,
      roomDepth,
      roomWidth,
      wallThickness,
      zonesRef,
    ]
  );

  const ungroupZone = useCallback(
    (zoneId: string) => {
      const zoneToRemove = (zonesRef.current ?? []).find(
        (zone) => zone.id === zoneId
      );
      if (zoneToRemove?.type === "seating") {
        seatingZoneAutoDisabledRef.current = true;
        try {
          localStorage.setItem("seating_zone_auto_disabled", "1");
        } catch {
          // Ignore storage errors.
        }
      }

      const nextZones = (zonesRef.current ?? []).filter(
        (zone) => zone.id !== zoneId
      );
      history.begin("Ungroup zone");
      setDesignSnapshot((previous) =>
        updateActiveRoomZones(previous, nextZones)
      );
      history.commit();
      setSelectedZoneId(null);
    },
    [
      history,
      seatingZoneAutoDisabledRef,
      setDesignSnapshot,
      setSelectedZoneId,
      zonesRef,
    ]
  );

  const getZoneBounds = useCallback(
    (zone: ZoneMin) => resolveZoneBounds(zone, items, getSelectionBounds),
    [getSelectionBounds, items]
  );

  const planZones2D = useMemo(
    () => buildPlanZones2D(zones, items, getSelectionBounds),
    [getSelectionBounds, items, zones]
  );

  return {
    state: {
      selectedZone,
      pendingZoneType,
      planZones2D,
    },
    actions: {
      setPendingZoneType,
      createZoneFromSelection,
      autoCreateSeatingZone,
      autoLayoutZone,
      rotateZone,
      ungroupZone,
    },
    resolvers: {
      getZoneBounds,
    },
  };
}
