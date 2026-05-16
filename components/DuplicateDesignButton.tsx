"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { track } from "@/lib/analytics";

type DuplicateDesignButtonProps = {
  sourceDesignId?: string;
  shareToken?: string;
  className?: string;
  children?: React.ReactNode;
};

export default function DuplicateDesignButton({
  sourceDesignId,
  shareToken,
  className,
  children,
}: DuplicateDesignButtonProps) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { status } = useSession();
  const source = shareToken ? "share_page" : "dashboard";

  const handleDuplicate = async () => {
    if (busy) return;

    track("duplicate_design_clicked", {
      source,
      source_design_id: sourceDesignId ?? null,
      share_token: shareToken ?? null,
    });

    if (status !== "authenticated") {
      track("duplicate_design_auth_required", {
        source,
        share_token: shareToken ?? null,
      });
      await signIn("google", { callbackUrl: window.location.href });
      return;
    }

    const endpoint = shareToken
      ? `/api/share/${encodeURIComponent(shareToken)}/duplicate`
      : sourceDesignId
        ? `/api/designs/${encodeURIComponent(sourceDesignId)}/duplicate`
        : null;

    if (!endpoint) {
      alert("Unable to duplicate this design.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMessage = data?.error ?? "Duplication failed";
        track("duplicate_design_failed", {
          source,
          status: res.status,
          error: errorMessage,
        });
        alert(errorMessage);
        return;
      }

      const newDesignId = typeof data?.id === "string" ? data.id : null;
      if (!newDesignId) {
        track("duplicate_design_failed", {
          source,
          status: 200,
          error: "Missing id in duplicate response",
        });
        alert("Duplication failed: invalid response");
        return;
      }

      track("duplicate_design_succeeded", {
        source,
        source_design_id: sourceDesignId ?? null,
        share_token: shareToken ?? null,
        new_design_id: newDesignId,
      });

      router.push(`/design/${newDesignId}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className={
        className ??
        "rounded-lg border px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
      }
      onClick={handleDuplicate}
      disabled={busy}
    >
      {busy ? "Duplicating..." : (children ?? "Duplicate")}
    </button>
  );
}
