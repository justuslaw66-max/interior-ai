"use client";

import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import { buildDesignEditorUrl } from "@/lib/design-editor-url";
import { UserFacingError } from "@/lib/user-facing-error";
import type { MyDesignCard } from "@/lib/my-designs";

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const data: unknown = await response.json().catch(() => ({}));
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  // The design routes answer with sentences meant for people (the plan's limit, sign in, not found).
  if (!response.ok) {
    throw new UserFacingError(typeof record.error === "string" ? record.error : "That didn't work. Try again.", response.status);
  }
  return record;
}

const designPath = (card: MyDesignCard) => `/api/designs/${encodeURIComponent(card.id)}`;

/** What the My designs cards do, through the same routes the editor uses. */
export function useMyDesignActions() {
  const router = useRouter();
  return {
    rename: async (card: MyDesignCard, title: string) => {
      await requestJson(designPath(card), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      router.refresh();
    },
    remove: async (card: MyDesignCard) => {
      await requestJson(designPath(card), { method: "DELETE" });
      router.refresh();
    },
    /** Opens the copy in the editor, as Make a copy always has. */
    duplicate: async (card: MyDesignCard) => {
      track("duplicate_design_clicked", { source: "dashboard", source_design_id: card.id, shared_context: false });
      const data = await requestJson(`${designPath(card)}/duplicate`, { method: "POST" }).catch((cause: unknown) => {
        track("duplicate_design_failed", { source: "dashboard", status: cause instanceof UserFacingError ? cause.status : null });
        throw cause;
      });
      if (typeof data.id !== "string") throw new UserFacingError("Couldn't make a copy. Try again.");
      track("duplicate_design_succeeded", { source: "dashboard", source_design_id: card.id, new_design_id: data.id });
      router.push(buildDesignEditorUrl({ designId: data.id }));
    },
    /** Turns sharing on (or keeps the existing link) and returns the link. */
    share: async (card: MyDesignCard) => {
      const data = await requestJson(`${designPath(card)}/share`, { method: "POST" });
      if (typeof data.shareToken !== "string") throw new UserFacingError("Couldn't make a link. Try again.");
      router.refresh();
      return `${window.location.origin}/share/${encodeURIComponent(data.shareToken)}`;
    },
  };
}
