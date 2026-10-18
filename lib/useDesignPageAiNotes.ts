"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { applyAISuggestionAction, type AISuggestionAction } from "@/lib/ai/applySuggestion";
import { createAiSuggestionEditor, type AiNotesEditorActions } from "@/lib/ai/design-notes-editor";
import { buildDesignNotesRequest } from "@/lib/ai/design-notes-request";
import { buildDesignNotesRoom, hasDesignNotesFinish } from "@/lib/ai/design-notes-room";
import { track } from "@/lib/analytics";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { AINotesResponse } from "@/lib/design-page-types";
import type { RoomWithSurfaces } from "@/lib/floor-plan-surface-checks";
import type { DesignItem } from "@/lib/room-types";
import { UserFacingError, userFacingErrorMessage } from "@/lib/user-facing-error";

type UseDesignPageAiNotesOptions = {
  state: {
    items: DesignItem[];
    designId: string | null;
    designerMode: boolean;
    authenticated: boolean;
    /** The active room: AI notes covers its products and its floor and walls (18 Oct 2026). */
    room: RoomWithSurfaces | null;
  };
  actions: AiNotesEditorActions;
};

export function useDesignPageAiNotes({ state, actions }: UseDesignPageAiNotesOptions) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AINotesResponse | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestEpochRef = useRef(0);
  const { items, designId, designerMode, authenticated, room } = state;
  const {
    getItems,
    resizeRugToSofa,
    makeRoomCheaper,
    addItem,
    commitItems,
    showToast,
    applyFloorMaterialToRoom,
  } = actions;

  const generate = useCallback(async () => {
    requestRef.current?.abort();
    const requestEpoch = ++requestEpochRef.current;
    const notesRoom = buildDesignNotesRoom(room);
    if (!items.length && !hasDesignNotesFinish(notesRoom)) {
      showToast("Add products or a floor or wall finish to the room first");
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    const startedAt = Date.now();
    const timeoutId = window.setTimeout(() => {
      setLoading(false);
      showToast(
        "AI generation is taking longer than expected. Please try again."
      );
      controller.abort();
    }, 45_000);

    try {
      const response = await fetch("/api/ai/design-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildDesignNotesRequest({ designId, items, room: notesRoom, catalog: CATALOG_ITEMS, designerMode })),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new UserFacingError(error?.error || "AI notes aren't available right now. Try again.");
      }

      const nextData = (await response.json()) as AINotesResponse & { error?: string };
      if (nextData.error) throw new Error(nextData.error);
      const elapsedMs = Date.now() - startedAt;
      if (nextData.cached) {
        track("ai_notes_cached_hit", { design_id: designId, ms: elapsedMs });
      } else {
        track("ai_notes_generated", {
          design_id: designId,
          mode: designerMode ? "designer" : "homeowner",
          item_count: items.length,
          ms: elapsedMs,
        });
      }
      if (requestEpoch !== requestEpochRef.current) return;
      setData(nextData);
      setOpen(true);
    } catch (error) {
      window.clearTimeout(timeoutId);
      if (controller.signal.aborted) return;
      const message = userFacingErrorMessage(error, "AI notes aren't available right now. Try again.");
      if (message.includes("Too many AI requests")) {
        track("ai_rate_limited", { keyType: authenticated ? "user" : "anon" });
      }
      showToast(message);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [authenticated, designId, designerMode, items, room, showToast]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const applySuggestion = useCallback(
    async (suggestion: AISuggestionAction) => {
      try {
        const editor = createAiSuggestionEditor(
          { getItems, resizeRugToSofa, makeRoomCheaper, addItem, commitItems, showToast, applyFloorMaterialToRoom },
          room
        );
        await applyAISuggestionAction({ action: suggestion, editor });
        track("ai_suggestion_applied", { action_type: suggestion.type });
      } catch (error) {
        showToast(userFacingErrorMessage(error, "Could not apply suggestion"));
      }
    },
    [addItem, applyFloorMaterialToRoom, commitItems, getItems, makeRoomCheaper, resizeRugToSofa, room, showToast]
  );

  return {
    state: { open, loading, data },
    actions: {
      generate,
      applySuggestion,
      close: () => setOpen(false),
    },
  };
}
