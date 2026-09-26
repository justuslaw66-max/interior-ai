"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { track } from "@/lib/analytics";
import { copyFallbackShareLinkWithFeedback } from "@/lib/copy-fallback-share-link";
import { designApi } from "@/lib/design-api-client";
import { EDITOR_FEEDBACK_DURATION_MS } from "@/lib/editor-feedback-tone";
import { userFacingErrorMessage } from "@/lib/user-facing-error";

/** A link the clipboard refused. Standalone ones came from the Share button, not Present & export. */
type ShareLinkFallback = { designId: string; url: string; standalone?: boolean };

export type ShareLinkUpdates = {
  setShareToken: Dispatch<SetStateAction<string | null>>;
  setShareEnabled: Dispatch<SetStateAction<boolean>>;
  setSharingDesign: (sharing: boolean) => void;
  setShareSuccessToast: (visible: boolean) => void;
  setShareErrorToast: (message: string | null) => void;
  setShareLinkFallback: (fallback: ShareLinkFallback | null) => void;
};

/**
 * Creates the design's share link and copies it. When the clipboard refuses, the link goes to the
 * fallback dialog instead.
 */
export async function createAndCopyShareLink(designId: string, updates: ShareLinkUpdates) {
  updates.setSharingDesign(true);
  try {
    const data = await designApi.share(designId);

    updates.setShareToken(data.shareToken);
    updates.setShareEnabled(true);
    const shareUrl = `${window.location.origin}/share/${data.shareToken}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      updates.setShareSuccessToast(true);
      setTimeout(() => updates.setShareSuccessToast(false), EDITOR_FEEDBACK_DURATION_MS.success);
      track("share_link_copied", { design_id: designId, shared_context: true });
    } catch (clipboardError) {
      console.warn("Clipboard access denied, showing fallback modal:", clipboardError);
      updates.setShareLinkFallback({ designId, url: shareUrl });
      track("share_link_created_fallback", {
        design_id: designId,
        shared_context: true,
        error: clipboardError instanceof Error ? clipboardError.name : String(clipboardError),
      });
    }
  } catch (error) {
    const errorMessage = userFacingErrorMessage(error, "Try again.");
    updates.setShareErrorToast(`Failed to create share link: ${errorMessage}`);
    setTimeout(() => updates.setShareErrorToast(null), EDITOR_FEEDBACK_DURATION_MS.error);
  } finally {
    updates.setSharingDesign(false);
  }
}

/** The Share button shares the cloud copy, so a design that has none is saved first. */
export async function shareDesignSavingFirst(
  designId: string | null,
  saveFirst: () => Promise<string | null | undefined>,
  share: (id: string) => Promise<void>,
) {
  const targetId = designId ?? (await saveFirst());
  if (targetId) await share(targetId);
}

function useShareLinkState(designId: string | null) {
  const [sharingDesign, setSharingDesign] = useState(false);
  const [shareSuccessToast, setShareSuccessToast] = useState(false);
  const [shareErrorToast, setShareErrorToast] = useState<string | null>(null);
  const [shareLinkFallback, setShareLinkFallback] = useState<ShareLinkFallback | null>(null);
  // Another design's fallback link retires when the design changes (adjusted while rendering).
  const [fallbackDesignId, setFallbackDesignId] = useState(designId);
  if (fallbackDesignId !== designId) {
    setFallbackDesignId(designId);
    setShareLinkFallback((current) => current?.designId === designId ? current : null);
  }
  const fallback = shareLinkFallback?.designId === designId ? shareLinkFallback : null;
  return {
    state: {
      sharingDesign,
      shareSuccessToast,
      shareErrorToast,
      shareLinkFallback: fallback?.url ?? null,
      shareLinkFallbackStandalone: fallback?.standalone === true,
    },
    setters: { setSharingDesign, setShareSuccessToast, setShareErrorToast, setShareLinkFallback },
  };
}

/** The design's share link: creating and copying it, its feedback, and the fallback dialog. */
export function useDesignPageShareLink({
  designId,
  setShareToken,
  setShareEnabled,
}: {
  designId: string | null;
  setShareToken: Dispatch<SetStateAction<string | null>>;
  setShareEnabled: Dispatch<SetStateAction<boolean>>;
}) {
  const { state, setters } = useShareLinkState(designId);
  const { setSharingDesign, setShareSuccessToast, setShareErrorToast, setShareLinkFallback } = setters;
  const updates: ShareLinkUpdates = { setShareToken, setShareEnabled, ...setters };

  const createShareLinkAndCopy = useCallback(async () => {
    if (!designId) return;
    await createAndCopyShareLink(designId, {
      setShareToken, setShareEnabled, setSharingDesign, setShareSuccessToast, setShareErrorToast,
      setShareLinkFallback,
    });
  }, [designId, setShareEnabled, setShareErrorToast, setShareLinkFallback, setShareSuccessToast, setShareToken, setSharingDesign]);
  // The Share button: busy from the first save to the copied link, with its own fallback dialog.
  const shareFromCommandBar = async (saveFirst: () => Promise<string | null | undefined>) => {
    setSharingDesign(true);
    try {
      await shareDesignSavingFirst(designId, saveFirst, (id) => createAndCopyShareLink(id, {
        ...updates,
        setShareLinkFallback: (fallback) => setShareLinkFallback(fallback && { ...fallback, standalone: true }),
      }));
    } finally {
      setSharingDesign(false);
    }
  };
  const fallbackActions = useShareLinkFallbackActions(setters);
  return { state, actions: { createShareLinkAndCopy, shareFromCommandBar, ...fallbackActions } };
}

function useShareLinkFallbackActions({
  setShareSuccessToast, setShareErrorToast, setShareLinkFallback, setSharingDesign,
}: ReturnType<typeof useShareLinkState>["setters"]) {
  const closeShareLinkFallback = useCallback(() => setShareLinkFallback(null), [setShareLinkFallback]);
  const copyFallbackShareLink = useCallback((url: string, signal: AbortSignal) =>
    copyFallbackShareLinkWithFeedback(url, signal, setShareSuccessToast, setShareErrorToast),
  [setShareErrorToast, setShareSuccessToast]);
  const openFallbackShareLink = useCallback((url: string) => {
    window.open(url, "_blank");
    setShareLinkFallback(null);
  }, [setShareLinkFallback]);
  // A new draft starts with no share link in flight and no share feedback.
  const resetShareLink = useCallback(() => {
    setSharingDesign(false);
    setShareSuccessToast(false);
    setShareErrorToast(null);
    setShareLinkFallback(null);
  }, [setShareErrorToast, setShareLinkFallback, setShareSuccessToast, setSharingDesign]);
  return { closeShareLinkFallback, copyFallbackShareLink, openFallbackShareLink, resetShareLink };
}
