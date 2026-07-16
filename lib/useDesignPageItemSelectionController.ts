"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";
import type { DesignItem } from "@/lib/room-types";

export type DesignPageItemSelectionControllerState = {
  items: DesignItem[];
  editorMode: DesignPageEditorMode;
  selectedZoneId: string | null;
};

export type DesignPageItemSelectionControllerActions = {
  setEditorMode: Dispatch<SetStateAction<DesignPageEditorMode>>;
  setSelectedZoneId: Dispatch<SetStateAction<string | null>>;
};

export type UseDesignPageItemSelectionControllerInput = {
  state: DesignPageItemSelectionControllerState;
  actions: DesignPageItemSelectionControllerActions;
};

export type DesignPageItemSelectionControllerRefs = {
  selectedIds: MutableRefObject<Set<string>>;
  primaryId: MutableRefObject<string | null>;
};

export function useDesignPageItemSelectionController({
  state,
  actions,
}: UseDesignPageItemSelectionControllerInput) {
  const { items, editorMode, selectedZoneId } = state;
  const { setEditorMode, setSelectedZoneId } = actions;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  const primaryIdRef = useRef(primaryId);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    primaryIdRef.current = primaryId;
  }, [primaryId]);

  const resetSelectionState = useCallback(() => {
    setSelectedIds(new Set());
    setPrimaryId(null);
    setSelectedZoneId(null);
  }, [setSelectedZoneId]);

  const updateSelection = useCallback(
    (next: Set<string>, nextPrimary: string | null) => {
      setSelectedIds(next);
      setPrimaryId(nextPrimary);

      if (next.size > 0 && editorMode === "design") {
        setEditorMode("adjust");
      } else if (next.size === 0 && editorMode === "adjust") {
        setEditorMode("design");
      }
    },
    [editorMode, setEditorMode]
  );

  const clearSelection = useCallback(() => {
    updateSelection(new Set(), null);
  }, [updateSelection]);

  const selectItem = useCallback(
    (id: string, additive: boolean) => {
      if (selectedZoneId) setSelectedZoneId(null);
      const current = new Set(selectedIdsRef.current);
      if (additive) {
        if (current.has(id)) {
          current.delete(id);
          const nextPrimary =
            primaryIdRef.current === id
              ? current.size
                ? Array.from(current)[current.size - 1]
                : null
              : primaryIdRef.current;
          updateSelection(current, nextPrimary);
          return;
        }
        current.add(id);
        updateSelection(current, id);
        return;
      }
      updateSelection(new Set([id]), id);
    },
    [selectedZoneId, setSelectedZoneId, updateSelection]
  );

  useEffect(() => {
    const existing = new Set(items.map((item) => item.instanceId));
    setSelectedIds((previous) => {
      const next = new Set([...previous].filter((id) => existing.has(id)));
      const currentPrimaryId = primaryIdRef.current;
      const hasPrimary = currentPrimaryId
        ? next.has(currentPrimaryId)
        : false;
      if (!hasPrimary) {
        setPrimaryId(next.size ? Array.from(next)[0] : null);
      }
      if (next.size !== previous.size) return next;
      return previous;
    });
  }, [items]);

  const selectedInstanceId = primaryId;
  const selectedItem = selectedInstanceId
    ? items.find((item) => item.instanceId === selectedInstanceId) ?? null
    : null;

  return {
    state: {
      selectedIds,
      primaryId,
      selectedInstanceId,
      selectedItem,
    },
    refs: {
      selectedIds: selectedIdsRef,
      primaryId: primaryIdRef,
    } satisfies DesignPageItemSelectionControllerRefs,
    actions: {
      resetSelectionState,
      updateSelection,
      clearSelection,
      selectItem,
    },
  };
}
