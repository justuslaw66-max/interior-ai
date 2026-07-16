"use client";

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { getDeletedDoorwaySuggestionKeys } from "@/lib/design-page-floor-plan-utils";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type {
  EditorAnnotation2D,
  FixedElement2D,
  RoomOpening2D,
} from "@/lib/editorScene";
import type { DesignItem } from "@/lib/room-types";
import {
  useDesignPageDeleteSelectionShortcut,
} from "@/lib/useDesignPageSelectionKeyboard";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";
import type { RendererSurfaceTarget } from "@/lib/useDesignPageSurfaceActions";

type DesignPageSelectionHistory = {
  begin: (name: string) => void;
  commit: () => void;
};

type CommitDesignPageItems = (
  updater: DesignItem[] | ((previous: DesignItem[]) => DesignItem[]),
  actionName?: string
) => void;

export type DesignPageSelectionCoordinatorState = {
  editorMode: DesignPageEditorMode;
  housePlanRooms: HousePlanRoom2D[];
  isClientPreview: boolean;
  items: readonly DesignItem[];
  selectedPlanOverlayId: string | null;
};

export type DesignPageSelectionCoordinatorConfiguration = {
  catalogItems: Readonly<
    Record<string, Pick<CatalogItemSchema, "title">>
  >;
};

export type DesignPageSelectionCoordinatorRefs = {
  planAnnotations: MutableRefObject<EditorAnnotation2D[]>;
  planFixedElements: MutableRefObject<FixedElement2D[]>;
  planOpenings: MutableRefObject<RoomOpening2D[]>;
  selectedIds: MutableRefObject<Set<string>>;
};

export type DesignPageSelectionCoordinatorActionAdapters = {
  clearSelection: () => void;
  commitItems: CommitDesignPageItems;
  history: DesignPageSelectionHistory;
  preserveCameraAfterPlanOverlaySelection: () => void;
  setEditorMode: Dispatch<SetStateAction<DesignPageEditorMode>>;
  setPlanAnnotations: Dispatch<SetStateAction<EditorAnnotation2D[]>>;
  setPlanFixedElements: Dispatch<SetStateAction<FixedElement2D[]>>;
  setPlanOpenings: Dispatch<SetStateAction<RoomOpening2D[]>>;
  setSelectedPlanOverlayId: Dispatch<SetStateAction<string | null>>;
  setSelectedPlanRoomId: Dispatch<SetStateAction<string | null>>;
  setSelectedRendererSurfaceTarget: Dispatch<
    SetStateAction<RendererSurfaceTarget | null>
  >;
  setSelectedZoneId: Dispatch<SetStateAction<string | null>>;
  setSuppressedDoorwaySuggestionKeys: Dispatch<SetStateAction<string[]>>;
};

export type UseDesignPageSelectionCoordinatorInput = {
  state: DesignPageSelectionCoordinatorState;
  configuration: DesignPageSelectionCoordinatorConfiguration;
  refs: DesignPageSelectionCoordinatorRefs;
  actions: DesignPageSelectionCoordinatorActionAdapters;
};

export type DesignPageSelectionCoordinatorActions = {
  clearZoneSelection: () => void;
  clearNonRoomSelection: () => void;
  clearAllSelection: () => void;
  suppressDoorwaySuggestionKeys: (keys: string[]) => void;
  deletePlanOverlayById: (overlayId: string | null) => boolean;
  handleSelectPlanOverlay: (id: string | null) => void;
};

export type DesignPageSelectionCoordinatorResult = {
  actions: DesignPageSelectionCoordinatorActions;
};

export function useDesignPageSelectionCoordinator({
  state: {
    editorMode,
    housePlanRooms,
    isClientPreview,
    items,
    selectedPlanOverlayId,
  },
  configuration: { catalogItems },
  refs: {
    planAnnotations: planAnnotationsRef,
    planFixedElements: planFixedElementsRef,
    planOpenings: planOpeningsRef,
    selectedIds: selectedIdsRef,
  },
  actions: {
    clearSelection,
    commitItems,
    history,
    preserveCameraAfterPlanOverlaySelection,
    setEditorMode,
    setPlanAnnotations,
    setPlanFixedElements,
    setPlanOpenings,
    setSelectedPlanOverlayId,
    setSelectedPlanRoomId,
    setSelectedRendererSurfaceTarget,
    setSelectedZoneId,
    setSuppressedDoorwaySuggestionKeys,
  },
}: UseDesignPageSelectionCoordinatorInput): DesignPageSelectionCoordinatorResult {
  const clearZoneSelection = useCallback(() => {
    setSelectedZoneId(null);
  }, [setSelectedZoneId]);

  const clearNonRoomSelection = useCallback(() => {
    clearSelection();
    clearZoneSelection();
    setSelectedPlanOverlayId(null);
    setSelectedRendererSurfaceTarget(null);
  }, [
    clearSelection,
    clearZoneSelection,
    setSelectedPlanOverlayId,
    setSelectedRendererSurfaceTarget,
  ]);

  const clearAllSelection = useCallback(() => {
    clearNonRoomSelection();
    setSelectedPlanRoomId(null);
  }, [clearNonRoomSelection, setSelectedPlanRoomId]);

  const suppressDoorwaySuggestionKeys = useCallback(
    (keys: string[]) => {
      if (keys.length === 0) return;
      setSuppressedDoorwaySuggestionKeys((current) => {
        const next = new Set(current);
        keys.forEach((key) => next.add(key));
        return next.size === current.length ? current : Array.from(next);
      });
    },
    [setSuppressedDoorwaySuggestionKeys]
  );

  const deletePlanOverlayById = useCallback(
    (overlayId: string | null) => {
      if (!overlayId) return false;

      const deletedOpening = planOpeningsRef.current.find(
        (entry) => entry.id === overlayId
      );
      const overlayExists =
        Boolean(deletedOpening) ||
        planFixedElementsRef.current.some((entry) => entry.id === overlayId) ||
        planAnnotationsRef.current.some((entry) => entry.id === overlayId);
      if (!overlayExists) return false;

      history.begin("Delete plan overlay");
      setPlanOpenings((previous) => {
        const next = previous.filter((entry) => entry.id !== overlayId);
        if (next.length !== previous.length && deletedOpening) {
          suppressDoorwaySuggestionKeys(
            getDeletedDoorwaySuggestionKeys(deletedOpening, housePlanRooms)
          );
        }
        return next;
      });
      setPlanFixedElements((previous) =>
        previous.filter((entry) => entry.id !== overlayId)
      );
      setPlanAnnotations((previous) =>
        previous.filter((entry) => entry.id !== overlayId)
      );
      history.commit();
      setSelectedPlanOverlayId(null);
      return true;
    },
    [
      history,
      housePlanRooms,
      planAnnotationsRef,
      planFixedElementsRef,
      planOpeningsRef,
      setPlanAnnotations,
      setPlanFixedElements,
      setPlanOpenings,
      setSelectedPlanOverlayId,
      suppressDoorwaySuggestionKeys,
    ]
  );

  useDesignPageDeleteSelectionShortcut({
    state: {
      isClientPreview,
      items,
      selectedPlanOverlayId,
    },
    configuration: { catalogItems },
    refs: { selectedIds: selectedIdsRef },
    actions: {
      clearSelection,
      commitItems,
      deletePlanOverlay: deletePlanOverlayById,
    },
  });

  const handleSelectPlanOverlay = useCallback(
    (id: string | null) => {
      if (id) {
        preserveCameraAfterPlanOverlaySelection();
      }
      setSelectedPlanOverlayId(id);
      if (id) {
        clearSelection();
        clearZoneSelection();
        setSelectedPlanRoomId(null);
        setSelectedRendererSurfaceTarget(null);
        if (editorMode !== "present") setEditorMode("design");
      }
    },
    [
      clearSelection,
      clearZoneSelection,
      editorMode,
      preserveCameraAfterPlanOverlaySelection,
      setEditorMode,
      setSelectedPlanOverlayId,
      setSelectedPlanRoomId,
      setSelectedRendererSurfaceTarget,
    ]
  );

  return {
    actions: {
      clearZoneSelection,
      clearNonRoomSelection,
      clearAllSelection,
      suppressDoorwaySuggestionKeys,
      deletePlanOverlayById,
      handleSelectPlanOverlay,
    },
  };
}
