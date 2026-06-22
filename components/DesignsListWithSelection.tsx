"use client";

import Link from "next/link";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import DeleteDesignButton from "@/components/DeleteDesignButton";
import DuplicateDesignButton from "@/components/DuplicateDesignButton";

type DesignListItem = {
  id: string;
  title: string;
  updatedAt: string;
};

export default function DesignsListWithSelection({
  designs,
}: {
  designs: DesignListItem[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDeleteSelectedOpen, setConfirmDeleteSelectedOpen] = useState(false);

  const allSelected = designs.length > 0 && selectedIds.length === designs.length;

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : designs.map((design) => design.id));
  };

  const handleDeleteSelected = async () => {
    if (busy || selectedIds.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/designs/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data?.error ?? "Delete failed");
        setConfirmDeleteSelectedOpen(false);
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow">
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
          />
          Select all
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-500">
            {selectedIds.length} selected
          </span>
          <button
            className="rounded-lg border px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy || selectedIds.length === 0}
            onClick={() => {
              setMessage(null);
              setConfirmDeleteSelectedOpen(true);
            }}
          >
            {busy ? "Deleting..." : "Delete Selected"}
          </button>
        </div>
        {message && (
          <div className="basis-full text-sm text-red-600" role="alert">
            {message}
          </div>
        )}
      </div>

      {designs.map((design) => {
        const isSelected = selectedIds.includes(design.id);
        return (
          <div
            key={design.id}
            className="flex items-center justify-between rounded-xl bg-white p-4 shadow"
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelection(design.id)}
              />
              <div>
                <div className="font-semibold">{design.title}</div>
                <div className="text-sm text-neutral-500" suppressHydrationWarning>
                  Updated {new Date(design.updatedAt).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Link
                href={`/design/${design.id}`}
                className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white"
              >
                Open
              </Link>
              <DuplicateDesignButton
                sourceDesignId={design.id}
                className="rounded-lg border px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Duplicate
              </DuplicateDesignButton>
              <DeleteDesignButton designId={design.id} />
            </div>
          </div>
        );
      })}
      <ConfirmDialog
        open={confirmDeleteSelectedOpen}
        title={`Delete ${selectedIds.length} selected design${selectedIds.length === 1 ? "" : "s"}?`}
        description="Selected designs will be permanently removed from your dashboard."
        confirmLabel="Delete selected"
        busy={busy}
        destructive
        onCancel={() => setConfirmDeleteSelectedOpen(false)}
        onConfirm={handleDeleteSelected}
      />
    </div>
  );
}
