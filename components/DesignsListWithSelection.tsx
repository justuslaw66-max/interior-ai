"use client";

import Link from "next/link";
import { useState } from "react";
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
    const ok = window.confirm(
      `Delete ${selectedIds.length} design${
        selectedIds.length === 1 ? "" : "s"
      }? This cannot be undone.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/designs/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error ?? "Delete failed");
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
            onClick={handleDeleteSelected}
          >
            {busy ? "Deleting..." : "Delete Selected"}
          </button>
        </div>
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
    </div>
  );
}
