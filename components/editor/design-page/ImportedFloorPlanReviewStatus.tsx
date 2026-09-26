"use client";

import { useMemo } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { floorPlanReviewStatusLabel } from "@/lib/floor-plan-planning-review";

export function ImportedFloorPlanReviewStatus({ document, isLocalFork, editingEnabled, subtle }: {
  document: FloorPlanDocumentV2; isLocalFork: boolean; editingEnabled: boolean; subtle: string;
}) {
  const label = useMemo(() => floorPlanReviewStatusLabel(document), [document]);
  return <div className="flex items-start justify-between gap-2">
    <div>
      <div className="font-semibold">Imported plan geometry</div>
      <div className={`mt-0.5 text-[10px] ${subtle}`}>
        {isLocalFork ? "Local needs-review copy" : "Source plan locked"}
      </div>
      <p data-testid="floor-plan-review-status" className={`mt-0.5 text-[10px] ${subtle}`}>{label}</p>
    </div>
    <span className={editingEnabled
      ? "rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800"
      : "rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-800"}>
      {editingEnabled ? "Editing" : "Locked"}
    </span>
  </div>;
}
