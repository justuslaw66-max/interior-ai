"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { EditorCommandPaletteAction } from "@/components/editor/design-page/EditorCommandPalette";
import { isActionable } from "@/components/editor/design-system/editorDialogFocus";
import { hasActiveEditorModal } from "@/components/editor/design-system/editorDialogRegistry";
import {
  cancelCommandPaletteSession,
  captureCommandPaletteSemanticOpener,
  createCommandPaletteSession,
  executeCommandPaletteAction,
  prepareCommandPaletteReturnTarget,
  type CommandPaletteSession,
} from "@/lib/command-palette-session";
import type { PlanLayerPresetId } from "@/lib/design-page-types";
import type { RoomOpening2D } from "@/lib/editorScene";

export type DesignPageCommandPaletteState = {
  isClientPreview: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoName: string | null;
  redoName: string | null;
  viewMode: EditorViewMode;
  planRoomCount: number;
  designRoomCount: number;
  selectedPlanOverlayId: string | null;
  selectedPlanRoomId: string | null;
  hasSelectedItem: boolean;
  planLayerPreset: PlanLayerPresetId;
};

export type DesignPageCommandPaletteActions = {
  undo: () => void;
  redo: () => void;
  fitPlanView: () => void;
  changeViewMode: (viewMode: EditorViewMode) => void;
  addFloorPlanOpening: (kind: RoomOpening2D["kind"]) => void;
  runHistoryTransaction: (name: string, action: () => void) => void;
  setPlanOpenings: (
    next: RoomOpening2D[] | ((previous: RoomOpening2D[]) => RoomOpening2D[])
  ) => void;
  selectPlanOverlay: (id: string | null) => void;
  deletePlanOverlay: (id: string) => void;
  duplicateRoom: (roomId: string) => void;
  deleteRoom: (roomId: string) => void;
  duplicateItem: () => void;
  deleteItem: () => void;
  runPlanPreset: (preset: "presentation" | "technical") => void;
};

export type UseDesignPageCommandPaletteOptions = {
  scopeKey: string;
  state: DesignPageCommandPaletteState;
  actions: DesignPageCommandPaletteActions;
};

function buildPaletteActions(
  state: DesignPageCommandPaletteState,
  actions: DesignPageCommandPaletteActions,
  insertDefaultDoor: () => void,
  query: string
) {
  const {
    canUndo, canRedo, undoName, redoName, viewMode, planRoomCount,
    designRoomCount, selectedPlanOverlayId, selectedPlanRoomId,
    hasSelectedItem, planLayerPreset,
  } = state;
  const {
    undo, redo, fitPlanView, changeViewMode, addFloorPlanOpening,
    deletePlanOverlay, duplicateRoom, deleteRoom, duplicateItem, deleteItem,
    runPlanPreset,
  } = actions;
  const commandActions: EditorCommandPaletteAction[] = [
    {
      id: "undo", label: undoName ? `Undo ${undoName}` : "Undo",
      hint: "Revert the last edit", enabled: canUndo, run: undo,
    },
    {
      id: "redo", label: redoName ? `Redo ${redoName}` : "Redo",
      hint: "Restore the last undone edit", enabled: canRedo, run: redo,
    },
    {
      id: "fit-plan", label: viewMode === "2d" ? "Fit plan" : "Fit view",
      hint: "Reset the current camera framing", enabled: true, run: fitPlanView,
    },
    {
      id: "toggle-view",
      label: viewMode === "2d" ? "Switch to 3D" : "Switch to 2D plan",
      hint: "Toggle the main editor view", enabled: true,
      run: () => changeViewMode(viewMode === "2d" ? "3d" : "2d"),
    },
    {
      id: "add-door", label: "Add door", hint: "Place a doorway on a wall",
      enabled: planRoomCount > 0, run: () => addFloorPlanOpening("door"),
    },
    {
      id: "insert-default-door", label: "Insert default door",
      hint: "Add a centered south-wall door immediately", enabled: true,
      run: insertDefaultDoor,
    },
    {
      id: "add-window", label: "Add window", hint: "Place a window on a wall",
      enabled: planRoomCount > 0, run: () => addFloorPlanOpening("window"),
    },
    {
      id: "delete-overlay", label: "Delete selected plan item",
      hint: "Remove the selected door, window, note, or fixture",
      enabled: Boolean(selectedPlanOverlayId),
      run: () => {
        if (selectedPlanOverlayId) deletePlanOverlay(selectedPlanOverlayId);
      },
    },
    {
      id: "duplicate-room", label: "Duplicate selected room",
      hint: "Copy the selected room beside the plan",
      enabled: Boolean(selectedPlanRoomId),
      run: () => {
        if (selectedPlanRoomId) duplicateRoom(selectedPlanRoomId);
      },
    },
    {
      id: "delete-room", label: "Delete selected room",
      hint: "Remove the selected room",
      enabled: Boolean(selectedPlanRoomId) && designRoomCount > 1,
      run: () => {
        if (selectedPlanRoomId) deleteRoom(selectedPlanRoomId);
      },
    },
    {
      id: "duplicate-item", label: "Duplicate selected furniture",
      hint: "Copy the currently selected item", enabled: hasSelectedItem,
      run: duplicateItem,
    },
    {
      id: "delete-item", label: "Delete selected furniture",
      hint: "Remove the currently selected item", enabled: hasSelectedItem,
      run: deleteItem,
    },
    {
      id: "preset-presentation", label: "Use presentation preset",
      hint: "Switch plan layers to presentation",
      enabled: planLayerPreset !== "presentation",
      run: () => runPlanPreset("presentation"),
    },
    {
      id: "preset-technical", label: "Use technical preset",
      hint: "Switch plan layers to technical",
      enabled: planLayerPreset !== "technical",
      run: () => runPlanPreset("technical"),
    },
  ];
  const normalizedQuery = query.trim().toLowerCase();
  return normalizedQuery
    ? commandActions.filter((action) =>
        `${action.label} ${action.hint}`.toLowerCase().includes(normalizedQuery)
      )
    : commandActions;
}

export function useDesignPageCommandPalette({
  scopeKey,
  state,
  actions,
}: UseDesignPageCommandPaletteOptions) {
  const [session, setSession] = useState<CommandPaletteSession | null>(null);
  const sessionRef = useRef<CommandPaletteSession | null>(null);
  const generationRef = useRef(0);
  const actionRestoreFrameRef = useRef<number | null>(null);
  const unmountedRef = useRef(false);
  const scopeKeyRef = useRef(scopeKey);
  const focusRestorationEnabledRef = useRef(true);
  scopeKeyRef.current = scopeKey;
  const { isClientPreview } = state;

  const sessionIsCurrent =
    Boolean(session) &&
    session?.scopeKey === scopeKey &&
    !isClientPreview &&
    !session.cancelled;
  if (session && !sessionIsCurrent) {
    focusRestorationEnabledRef.current = false;
  }
  const activeSession = sessionIsCurrent ? session : null;
  const query = activeSession?.query ?? "";

  useEffect(() => {
    const handleCommandPaletteHotkey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (isClientPreview) return;
      if (sessionRef.current || hasActiveEditorModal()) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      generationRef.current += 1;
      const nextSession = createCommandPaletteSession(
        generationRef.current,
        scopeKeyRef.current,
        captureCommandPaletteSemanticOpener()
      );
      focusRestorationEnabledRef.current = true;
      sessionRef.current = nextSession;
      setSession(nextSession);
    };

    window.addEventListener("keydown", handleCommandPaletteHotkey);
    return () => window.removeEventListener("keydown", handleCommandPaletteHotkey);
  }, [isClientPreview]);

  useEffect(() => {
    const current = sessionRef.current;
    if (
      !current ||
      (!isClientPreview && current.scopeKey === scopeKey)
    ) {
      return;
    }
    focusRestorationEnabledRef.current = false;
    cancelCommandPaletteSession(current);
    sessionRef.current = null;
    setSession(null);
  }, [isClientPreview, scopeKey]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true; generationRef.current += 1; focusRestorationEnabledRef.current = false;
      if (actionRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(actionRestoreFrameRef.current); actionRestoreFrameRef.current = null;
      }
      if (sessionRef.current) cancelCommandPaletteSession(sessionRef.current);
      sessionRef.current = null;
    };
  }, []);

  const close = useCallback(() => {
    const current = sessionRef.current;
    if (!current || current.cancelled) return;
    prepareCommandPaletteReturnTarget(current);
    focusRestorationEnabledRef.current = true;
    cancelCommandPaletteSession(current);
    sessionRef.current = null;
    setSession(null);
  }, []);

  const setQuery = useCallback((nextQuery: string) => {
    const current = sessionRef.current;
    if (!current || current.cancelled || current.actionConsumed) return;
    const nextSession = { ...current, query: nextQuery };
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  const insertDefaultDoor = useCallback(() => {
    const id = `opening-${Date.now()}`;
    actions.runHistoryTransaction("Add door", () =>
      actions.setPlanOpenings((previous) => [
        ...previous,
        {
          id,
          wall: "south",
          kind: "door",
          offsetMm: 0,
          widthMm: 900,
        },
      ])
    );
    actions.selectPlanOverlay(id);
  }, [actions]);

  const paletteActions = useMemo(
    () => buildPaletteActions(state, actions, insertDefaultDoor, query),
    [actions, insertDefaultDoor, query, state]
  );

  const scheduleActionFocusReturn = useCallback(
    (consumedSession: CommandPaletteSession) => {
      if (actionRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(actionRestoreFrameRef.current);
      }
      actionRestoreFrameRef.current = window.requestAnimationFrame(() => {
        actionRestoreFrameRef.current = null;
        if (
          unmountedRef.current ||
          generationRef.current !== consumedSession.generation ||
          scopeKeyRef.current !== consumedSession.scopeKey ||
          hasActiveEditorModal()
        ) {
          return;
        }
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          active !== document.body &&
          active !== document.documentElement &&
          isActionable(active)
        ) {
          return;
        }
        prepareCommandPaletteReturnTarget(consumedSession);
        const target = consumedSession.returnFocusIds
          .map((id) => document.getElementById(id))
          .find(
            (candidate): candidate is HTMLElement =>
              candidate instanceof HTMLElement && isActionable(candidate)
          );
        target?.focus({ preventScroll: true });
      });
    },
    []
  );

  const runAction = useCallback(
    (requestedAction: EditorCommandPaletteAction) => {
      const current = sessionRef.current;
      const action = paletteActions.find((entry) => entry.id === requestedAction.id);
      if (!current || current.scopeKey !== scopeKeyRef.current || !action?.enabled)
        return;
      executeCommandPaletteAction(
        current,
        () => {
          focusRestorationEnabledRef.current = false;
          sessionRef.current = null;
          flushSync(() => setSession(null));
        },
        () => {
          try {
            action.run();
          } finally {
            scheduleActionFocusReturn(current);
          }
        }
      );
    },
    [paletteActions, scheduleActionFocusReturn]
  );

  return {
    state: {
      open: Boolean(activeSession),
      query,
      actions: paletteActions,
      returnFocusIds: activeSession?.returnFocusIds ?? [],
      focusRestorationEnabledRef,
    },
    actions: { close, setQuery, runAction },
  };
}
