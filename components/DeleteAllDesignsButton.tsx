"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function DeleteAllDesignsButton({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deleteAllDesigns = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/designs", { method: "DELETE" });
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
        className="rounded-lg border px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled || busy}
        onClick={() => {
          setMessage(null);
          setConfirmOpen(true);
        }}
      >
        {busy ? "Deleting..." : "Delete All"}
      </button>
      {message && (
        <span className="text-xs text-red-600" role="alert">
          {message}
        </span>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete all designs?"
        description="Every design in your dashboard will be permanently removed."
        confirmLabel="Delete all"
        busy={busy}
        destructive
        onCancel={() => setConfirmOpen(false)}
        onConfirm={deleteAllDesigns}
      />
    </>
  );
}
