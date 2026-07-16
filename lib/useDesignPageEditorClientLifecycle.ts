"use client";

import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { signIn } from "next-auth/react";

import {
  parseDesignPagePlacementAddMode,
  type DesignPagePlacementAddMode,
} from "@/lib/design-page-editor-client-preferences";
import { preloadCoreAssets } from "@/lib/preloadAssets";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

export type UseDesignPageEditorClientLifecycleInput = {
  state: {
    placementAddMode: DesignPagePlacementAddMode;
    placementPreferencesLoaded: boolean;
    editorMode: DesignPageEditorMode;
  };
  refs: {
    seatingZoneAutoDisabled: MutableRefObject<boolean>;
    resetSelectionState: MutableRefObject<() => void>;
  };
  actions: {
    setPlacementAddMode: Dispatch<
      SetStateAction<DesignPagePlacementAddMode>
    >;
    setPlacementPreferencesLoaded: Dispatch<SetStateAction<boolean>>;
    setShowPresentModal: Dispatch<SetStateAction<boolean>>;
    setPresentModeRoomId: Dispatch<SetStateAction<string | null>>;
  };
};

/** Owns browser-only editor hydration and transitions at their original slot. */
export function useDesignPageEditorClientLifecycle({
  state,
  refs,
  actions,
}: UseDesignPageEditorClientLifecycleInput) {
  const { seatingZoneAutoDisabled, resetSelectionState } = refs;
  const {
    setPlacementAddMode,
    setPlacementPreferencesLoaded,
    setShowPresentModal,
    setPresentModeRoomId,
  } = actions;
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seatingDisabled = localStorage.getItem(
        "seating_zone_auto_disabled"
      );
      seatingZoneAutoDisabled.current = seatingDisabled === "1";
      const storedPlacementAddMode = parseDesignPagePlacementAddMode(
        localStorage.getItem("placement_add_mode")
      );
      if (storedPlacementAddMode) {
        setPlacementAddMode(storedPlacementAddMode);
      }
    } catch {
      // Ignore storage errors and continue with in-memory defaults.
    } finally {
      setPlacementPreferencesLoaded(true);
    }
  }, [
    seatingZoneAutoDisabled,
    setPlacementAddMode,
    setPlacementPreferencesLoaded,
  ]);

  useEffect(() => {
    if (!state.placementPreferencesLoaded || typeof window === "undefined") {
      return;
    }
    try {
      localStorage.setItem("placement_add_mode", state.placementAddMode);
    } catch {
      // Ignore storage errors and preserve the current in-memory preference.
    }
  }, [state.placementAddMode, state.placementPreferencesLoaded]);

  useEffect(() => {
    preloadCoreAssets();
  }, []);

  useEffect(() => {
    if (state.editorMode === "present") {
      setShowPresentModal(true);
      setPresentModeRoomId(null);
    } else if (state.editorMode === "buy") {
      resetSelectionState.current();
    }
  }, [
    resetSelectionState,
    setPresentModeRoomId,
    setShowPresentModal,
    state.editorMode,
  ]);

  const signInWithReturn = useCallback(() => {
    const callbackUrl =
      typeof window !== "undefined" ? window.location.href : "/design";
    signIn("google", { callbackUrl });
  }, []);

  return { actions: { signInWithReturn } };
}
