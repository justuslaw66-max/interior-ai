"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

/** Takes `floorPlanImport` off the address, so the note doesn't come back on a reload. */
function forgetArrival() {
  const url = new URL(window.location.href);
  url.searchParams.delete("floorPlanImport");
  window.history.replaceState(window.history.state, "", url);
}

/**
 * A design made from an uploaded floor plan opens in Plan with `floorPlanImport=<job>` in the
 * address (audit finding ST5). This note says what to check before furnishing, until dismissed.
 */
export function FloorPlanImportArrivalNote({ dark }: { dark: boolean }) {
  const importId = useSearchParams().get("floorPlanImport");
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  if (!importId || importId === dismissedId) return null;
  return (
    <div role="status" data-testid="floor-plan-import-arrival"
      className={dark
        ? "designer-raised mb-2 flex items-start gap-3 rounded-sm p-3 text-neutral-100"
        : "mb-2 flex items-start gap-3 rounded-sm border border-emerald-200 bg-emerald-50 p-3 text-neutral-900"}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Made from your floor plan</p>
        <p className={`mt-1 text-xs leading-5 ${dark ? "text-neutral-300" : "text-neutral-700"}`}>
          Check the walls and each room against your plan, and fix anything we missed. Then continue
          to Furnish.
        </p>
      </div>
      <button type="button" data-testid="floor-plan-import-arrival-dismiss"
        className={`min-h-11 shrink-0 rounded-lg px-3 text-xs font-bold ${dark ? "designer-control border" : "border border-emerald-300 bg-white hover:bg-emerald-100"}`}
        onClick={() => {
          setDismissedId(importId);
          forgetArrival();
        }}>
        Got it
      </button>
    </div>
  );
}
