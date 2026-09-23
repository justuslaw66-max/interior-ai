"use client";

import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";

import { isParametricCabinetItem } from "@/features/cabinetry/designItemAdapters";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogPlacementPreviewTarget } from "@/lib/catalog-placement-policy";
import type { DesignItem } from "@/lib/room-types";
import {
  useDesignPageCatalogPlacement,
  type DesignPageCatalogPlacementAdapters,
  type DesignPageCatalogPlacementConfiguration,
} from "@/lib/useDesignPageCatalogPlacement";
import { useDesignPageCrossRoomItemTransfer } from "@/lib/useDesignPageCrossRoomItemTransfer";
import { useDesignPagePlacementRoomQueries } from "@/lib/useDesignPagePlacementRoomQueries";

type CrossRoomTransferInput = Parameters<
  typeof useDesignPageCrossRoomItemTransfer
>[0];

export type DesignPageCatalogPlacementTarget =
  | CatalogPlacementPreviewTarget
  | {
      roomId: string;
      label: string;
      valid: boolean;
      kind: "item";
    };

type GeneratedCatalogPlacementAdapter =
  | "getItemDisplayName"
  | "clampToCatalogPlacementRoom"
  | "catalogPlacementCollidesInRoom"
  | "findCatalogPlacementBlockerInRoom"
  | "isCatalogPlacementContainedInRoom"
  | "setPreviewTarget";

export type UseDesignPageCatalogPlacementRegistrationFacadeInput = {
  state: {
    crossRoomDragTarget: DesignPageCatalogPlacementTarget | null;
  };
  configuration: DesignPageCatalogPlacementConfiguration;
  refs: CrossRoomTransferInput["refs"];
  actions: Omit<
    DesignPageCatalogPlacementAdapters,
    GeneratedCatalogPlacementAdapter
  > &
    Pick<
      CrossRoomTransferInput["actions"],
      "setDesignSnapshot" | "updateSelection" | "history"
    > & {
      setCrossRoomDragTarget: Dispatch<
        SetStateAction<DesignPageCatalogPlacementTarget | null>
      >;
    };
};

export function getCatalogPlacementItemDisplayName(
  item: DesignItem | null | undefined
): string | null {
  if (!item) return null;
  if (isParametricCabinetItem(item)) {
    return item.name ?? item.cabinetDefinition.name;
  }
  return CATALOG_ITEMS[item.productId]?.title ?? "another item";
}

export function resolveCatalogPlacementPreviewTarget(
  current: DesignPageCatalogPlacementTarget | null,
  target: CatalogPlacementPreviewTarget | null
): DesignPageCatalogPlacementTarget | null {
  if (target) return target;
  return current?.kind === "preview" ? null : current;
}

export function resolveCatalogPlacementTargetRoomId(
  pendingPlacementRoomId: string | null | undefined,
  crossRoomDragTarget: DesignPageCatalogPlacementTarget | null
): string | null {
  return pendingPlacementRoomId ?? crossRoomDragTarget?.roomId ?? null;
}

export function useDesignPageCatalogPlacementRegistrationFacade({
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageCatalogPlacementRegistrationFacadeInput) {
  const {
    getItemAABB,
    setCrossRoomDragTarget,
    setDesignSnapshot,
    updateSelection,
    history,
    ...catalogAdapters
  } = actions;
  const { houseRoomById, roomSnapshotById } = configuration;

  const placementRoomQueries = useDesignPagePlacementRoomQueries({
    configuration: { houseRoomById },
    actions: { getItemAABB },
  });
  const {
    clampToCatalogPlacementRoom,
    catalogPlacementCollidesInRoom,
    findCatalogPlacementBlockerInRoom,
    isCatalogPlacementContainedInRoom,
  } = placementRoomQueries.queries;

  const getItemDisplayName = useCallback(
    (item: DesignItem | null | undefined) =>
      getCatalogPlacementItemDisplayName(item),
    []
  );

  const setCatalogPlacementPreviewTarget = useCallback(
    (target: CatalogPlacementPreviewTarget | null) => {
      setCrossRoomDragTarget((current) =>
        resolveCatalogPlacementPreviewTarget(current, target)
      );
    },
    [setCrossRoomDragTarget]
  );

  const catalogPlacementController = useDesignPageCatalogPlacement({
    configuration,
    adapters: {
      ...catalogAdapters,
      getItemAABB,
      getItemDisplayName,
      clampToCatalogPlacementRoom,
      catalogPlacementCollidesInRoom,
      findCatalogPlacementBlockerInRoom,
      isCatalogPlacementContainedInRoom,
      setPreviewTarget: setCatalogPlacementPreviewTarget,
    },
  });

  const placementTargetRoomId = resolveCatalogPlacementTargetRoomId(
    catalogPlacementController.state.pendingPlacement?.roomId,
    state.crossRoomDragTarget
  );
  const placementTargetPlanRoom = useMemo(
    () =>
      placementTargetRoomId
        ? houseRoomById.get(placementTargetRoomId) ?? null
        : null,
    [houseRoomById, placementTargetRoomId]
  );
  const placementTargetRoom = placementTargetRoomId
    ? roomSnapshotById.get(placementTargetRoomId) ?? null
    : null;

  const crossRoomTransferController = useDesignPageCrossRoomItemTransfer({
    configuration: { houseRoomById },
    refs,
    actions: {
      getPlanningDimensions: catalogAdapters.getPlanningDimensions,
      clampToCatalogPlacementRoom,
      isCatalogPlacementContainedInRoom,
      findCatalogPlacementBlockerInRoom,
      getItemDisplayName,
      setDesignSnapshot,
      updateSelection,
      history,
      showToast: catalogAdapters.showToast,
    },
  });

  return {
    boundaries: {
      roomQueries: placementRoomQueries,
      catalogPlacement: catalogPlacementController,
      crossRoomTransfer: crossRoomTransferController,
    },
    state: {
      pendingCatalogPlacement:
        catalogPlacementController.state.pendingPlacement,
      hoverCatalogPlacement: catalogPlacementController.state.hoverPlacement,
    },
    derived: {
      ...catalogPlacementController.scene,
      ...catalogPlacementController.assessment,
      placementTargetRoomId,
      placementTargetPlanRoom,
      placementTargetRoom,
    },
    actions: {
      ...placementRoomQueries.queries,
      ...catalogPlacementController.actions,
      getItemDisplayName,
      transferItemToRoom:
        crossRoomTransferController.actions.transferItemToRoom,
    },
    refs,
  };
}
