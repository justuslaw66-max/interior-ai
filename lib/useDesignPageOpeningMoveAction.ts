"use client";

import { useCallback, type MutableRefObject } from "react";
import { floorPlanPropertyEvidenceIsEditable } from "@/lib/floor-plan-measured-property-mutations";
import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import type { RoomOpening2D } from "@/lib/editorScene";

/** Canonical topology writes win when they accept the opening; legacy writes are the fallback. */
export type DesignPageOpeningTopologyWrites = {
  moveOpening: (id: string, offsetMeters: number) => boolean;
  resizeOpening: (id: string, metrics: { widthMeters: number; offsetMeters: number }) => boolean;
  updateOpeningMetrics: (id: string, metrics: DesignPageOpeningMetricsPatch) => boolean;
};

export type DesignPageOpeningMoveOptions = {
  openingsRef: MutableRefObject<RoomOpening2D[]>;
  canonicalTopology: DesignPageOpeningTopologyWrites | undefined;
  moveOpening: (id: string, offset: number) => void;
  updateMetrics: (id: string, metrics: DesignPageOpeningMetricsPatch) => void;
};

/** Pointer gestures own their history transaction; moving never writes width or height. */
export function moveDesignPageOpening(
  { openingsRef, canonicalTopology, moveOpening, updateMetrics }: DesignPageOpeningMoveOptions,
  id: string, offsetMeters: number, bottomMeters?: number
) {
  const opening = openingsRef.current.find((entry) => entry.id === id);
  const evidence = opening?.evidence?.sillHeight;
  const verticalEdit = opening?.kind === "window" && bottomMeters !== undefined &&
    Number.isFinite(bottomMeters) && (!evidence || floorPlanPropertyEvidenceIsEditable(evidence));
  if (verticalEdit) {
    const metrics: DesignPageOpeningMetricsPatch = { offsetMeters, bottomMeters };
    if (!canonicalTopology?.updateOpeningMetrics(id, metrics)) updateMetrics(id, metrics);
  } else if (!canonicalTopology?.moveOpening(id, offsetMeters)) moveOpening(id, offsetMeters);
}

export function useDesignPageOpeningMoveAction(options: DesignPageOpeningMoveOptions) {
  return useCallback((id: string, offsetMeters: number, bottomMeters?: number) => {
    moveDesignPageOpening(options, id, offsetMeters, bottomMeters);
  }, [options]);
}
