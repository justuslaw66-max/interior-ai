"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function DeleteDesignButton({ designId }: { designId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deleteDesign = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/designs/${designId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data?.error ?? "Delete failed");
        setConfirmOpen(false);
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="rounded-lg border px-3 py-2 text-sm text-red-600 hover:bg-red-50"
        disabled={busy}
        onClick={() => {
          setMessage(null);
          setConfirmOpen(true);
        }}
      >
        {busy ? "Deleting..." : "Delete"}
      </button>
      {message && (
        <span className="text-xs text-red-600" role="alert">
          {message}
        </span>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete design?"
        description="This design will be permanently removed from your dashboard."
        confirmLabel="Delete"
        busy={busy}
        destructive
        onCancel={() => setConfirmOpen(false)}
        onConfirm={deleteDesign}
      />
    </>
  );
}
