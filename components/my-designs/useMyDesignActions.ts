"use client";

import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import { designApi, DesignApiError } from "@/lib/design-api-client";
import { buildDesignEditorUrl } from "@/lib/design-editor-url";
import type { MyDesignCard } from "@/lib/my-designs";

/**
 * What the My designs cards do, through the design API client the editor uses. Its errors carry
 * the routes' sentences for people (the plan's limit, sign in, not found).
 */
export function useMyDesignActions() {
  const router = useRouter();
  return {
    rename: async (card: MyDesignCard, title: string) => {
      await designApi.update(card.id, { title });
      router.refresh();
    },
    remove: async (card: MyDesignCard) => {
      await designApi.delete(card.id);
      router.refresh();
    },
    /** Opens the copy in the editor, as Make a copy always has. */
    duplicate: async (card: MyDesignCard) => {
      track("duplicate_design_clicked", { source: "dashboard", source_design_id: card.id, shared_context: false });
      const copy = await designApi.duplicate(card.id).catch((cause: unknown) => {
        track("duplicate_design_failed", { source: "dashboard", status: cause instanceof DesignApiError ? cause.status : null });
        throw cause;
      });
      track("duplicate_design_succeeded", { source: "dashboard", source_design_id: card.id, new_design_id: copy.id });
      router.push(buildDesignEditorUrl({ designId: copy.id }));
    },
    /** Turns sharing on (or keeps the existing link) and returns the link. */
    share: async (card: MyDesignCard) => {
      const { shareToken } = await designApi.share(card.id);
      router.refresh();
      return `${window.location.origin}/share/${encodeURIComponent(shareToken)}`;
    },
  };
}
