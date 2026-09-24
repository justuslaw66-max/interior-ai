"use client";

import type { RefObject } from "react";
import type { FloorPlanReviewTarget } from "@/lib/floor-plan-review-target";

function openCorrection(root: HTMLDivElement | null, target: FloorPlanReviewTarget) {
  const element = target.control === "artwork"
    ? Array.from(root?.querySelectorAll<SVGElement>("[data-review-entity-id][role=button]") ?? []).find((entry) => entry.dataset.reviewEntityId === target.entityId)
    : root?.querySelector<HTMLElement>(`[data-review-controls="${target.control}"]`);
  if (!element) return;
  for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  if (element instanceof HTMLDetailsElement) element.open = true;
  requestAnimationFrame(() => {
    if (!element.isConnected) return;
    element.scrollIntoView({ block: "center", behavior: "instant" });
    const focus = target.control === "artwork" ? element : element.querySelector<HTMLElement>("input:not([disabled]),select:not([disabled]),button:not([disabled]),summary");
    focus?.focus({ preventScroll: true });
  });
}

export function FloorPlanReviewIssueAction({ target, root, disabled }: {
  target: FloorPlanReviewTarget | null; root: RefObject<HTMLDivElement | null>; disabled: boolean;
}) {
  if (!target) return null;
  return <div className="my-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
    <p>Review the highlighted {target.label}{target.pageNumber ? ` on page ${target.pageNumber}` : ""}.</p>
    <button type="button" className="mt-1 rounded border border-blue-300 px-2 py-1 font-semibold" disabled={disabled} onClick={() => openCorrection(root.current, target)}>
      {target.control === "artwork" ? "Select marked artwork" : `Open ${target.label} controls`}
    </button>
    {target.control === "artwork" ? <p className="mt-1">Press Enter on the selected artwork to edit its text or stroke.</p> : null}
  </div>;
}
