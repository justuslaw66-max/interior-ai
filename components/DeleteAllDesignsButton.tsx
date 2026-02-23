"use client";

import { useState } from "react";

export default function DeleteAllDesignsButton({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      className="rounded-lg border px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled || busy}
      onClick={async () => {
        if (busy || disabled) return;
        const ok = window.confirm(
          "Delete all designs? This cannot be undone."
        );
        if (!ok) return;
        setBusy(true);
        try {
          const res = await fetch("/api/designs", { method: "DELETE" });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert(data?.error ?? "Delete failed");
            return;
          }
          window.location.reload();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Deleting..." : "Delete All"}
    </button>
  );
}
