"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { applyAISuggestionAction, type AISuggestionAction } from "@/lib/ai/applySuggestion";
import { track } from "@/lib/analytics";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { AINotesResponse } from "@/lib/design-page-types";
import { getItemPrice } from "@/lib/design-page-utils";
import type { DesignItem } from "@/lib/room-types";

type UseDesignPageAiNotesOptions = {
  state: {
    items: DesignItem[];
    designId: string | null;
    designerMode: boolean;
    authenticated: boolean;
  };
  actions: {
    getItems: () => DesignItem[];
    resizeRugToSofa: (
      sofa: DesignItem,
      rug?: DesignItem
    ) => { items?: Array<{ productId: string }> } | void;
    makeRoomCheaper: () => void;
    addItem: (productId: string, position: [number, number, number]) => void;
    commitItems: (items: DesignItem[], actionName: string) => void;
    showToast: (message: string) => void;
  };
};

export function useDesignPageAiNotes({ state, actions }: UseDesignPageAiNotesOptions) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AINotesResponse | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestEpochRef = useRef(0);
  const { items, designId, designerMode, authenticated } = state;
  const {
    getItems,
    resizeRugToSofa,
    makeRoomCheaper,
    addItem,
    commitItems,
    showToast,
  } = actions;

  const generate = useCallback(async () => {
    requestRef.current?.abort();
    const requestEpoch = ++requestEpochRef.current;
    if (!items.length) {
      showToast("Add some items to your design first");
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
        body: JSON.stringify({
          design: {
            id: designId,
            items: items.map((item) => ({
              productId: item.productId,
              quantity: item.qty || 1,
              price: getItemPrice(CATALOG_ITEMS[item.productId]) || 0,
            })),
            categories: Array.from(new Set(
              items
                .map((item) => CATALOG_ITEMS[item.productId]?.category)
                .filter(
                  (category): category is Exclude<typeof category, undefined> =>
                    Boolean(category)
                )
            )),
            budget: String(items.reduce(
              (sum, item) =>
                sum + (getItemPrice(CATALOG_ITEMS[item.productId]) || 0) * (item.qty || 1),
              0
            )),
          },
          mode: designerMode ? "designer" : "homeowner",
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || `API error: ${response.statusText}`);
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
      const message =
        error instanceof Error
          ? error.message
          : "Failed to generate AI notes. See console for details.";
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
  }, [authenticated, designId, designerMode, items, showToast]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const applySuggestion = useCallback(
    async (suggestion: AISuggestionAction) => {
      try {
        await applyAISuggestionAction({
          action: suggestion,
          editor: {
            getItemById: (id) =>
              getItems().find((item) => item.instanceId === id) ?? null,
            findFirstByCategory: (category) =>
              getItems().find(
                (item) => CATALOG_ITEMS[item.productId]?.category === category
              ) ?? null,
            resizeRugToSofaRule: resizeRugToSofa,
            makeRoomCheaper,
            addLampNearReadingCorner: async () => {
              const lamp = Object.values(CATALOG_ITEMS).find(
                (item) => item.category === "floor_lamp"
              );
              if (!lamp) {
                showToast("No floor lamp is available in the catalog yet");
                return;
              }
              addItem(lamp.id, getItems().length > 0 ? [2, 0, 2] : [1.5, 0, 1.5]);
            },
            commitDesignSnapshot: (snapshot) => {
              if (!snapshot.items) return;
              commitItems(
                snapshot.items as DesignItem[],
                suggestion.type ? `AI: ${suggestion.type}` : "AI suggestion"
              );
            },
            getDesignSnapshot: () => ({ items: getItems() }),
          },
        });
        track("ai_suggestion_applied", { action_type: suggestion.type });
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not apply suggestion");
      }
    },
    [addItem, commitItems, getItems, makeRoomCheaper, resizeRugToSofa, showToast]
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
