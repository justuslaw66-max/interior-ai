"use client";

import { ChevronLeft } from "lucide-react";
import type { SurfaceBrowserTab, SurfaceTargetMode } from "./surfaceCatalog";

export type SurfaceBrowserHeaderProps = {
  /** Pro keeps the targets, Rooms, Brush and Summary; consumers pick for one surface (UX audit ED8). */
  pro: boolean;
  targetLabel: string;
  displayName: string;
  target: SurfaceTargetMode;
  selectedWallFaceId: string | null | undefined;
  tab: SurfaceBrowserTab;
  brush: {
    active: boolean;
    disabled: boolean;
    status: string;
    onToggle: () => void;
  };
  secondaryActionClass: string;
  metaClass: string;
  onBack: () => void;
  onOpenSummary: () => void;
  onTargetChange: (target: SurfaceTargetMode) => void;
  onTabChange: (tab: SurfaceBrowserTab) => void;
};

const TARGETS: ReadonlyArray<{ id: SurfaceTargetMode; label: string }> = [
  { id: "floor", label: "Floor" },
  { id: "walls", label: "Walls" },
  { id: "selected_wall", label: "Selected wall" },
  { id: "ceiling", label: "Ceiling" },
];
const TABS: ReadonlyArray<{ id: SurfaceBrowserTab; label: string }> = [
  { id: "tiles", label: "Materials" },
  { id: "rooms", label: "Rooms" },
];

const segmentClass = (active: boolean) =>
  active
    ? "flex min-h-9 min-w-0 items-center justify-center rounded-md bg-neutral-950 px-1.5 text-center text-xs font-semibold leading-tight text-white touch:min-h-11"
    : "flex min-h-9 min-w-0 items-center justify-center rounded-md px-1.5 text-center text-xs font-semibold leading-tight text-neutral-700 hover:bg-neutral-100 touch:min-h-11";

function SurfaceBrowserTitle(props: SurfaceBrowserHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-1">
        <button
          type="button"
          data-testid="surfaces-back"
          aria-label="Back to the room"
          title="Back to the room"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-neutral-800 hover:bg-neutral-100 touch:h-11 touch:w-11"
          onClick={props.onBack}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-neutral-900">Surfaces</div>
          <div className={props.metaClass}>
            {props.targetLabel} · {props.displayName}
          </div>
        </div>
      </div>
      {props.pro ? (
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <button
            type="button"
            data-testid="surface-brush-toggle"
            aria-pressed={props.brush.active}
            className={props.brush.active ? "rounded-lg bg-neutral-900 px-2 py-1.5 text-xs font-semibold text-white" : props.secondaryActionClass}
            disabled={props.brush.disabled}
            onClick={props.brush.onToggle}
          >
            Brush
          </button>
          <button type="button" data-testid="surface-summary-open" className={props.secondaryActionClass} onClick={props.onOpenSummary}>
            Summary
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Pro's targets (Floor, Walls, Selected wall, Ceiling), its notes, and Materials | Rooms. */
function SurfaceBrowserProControls(props: SurfaceBrowserHeaderProps) {
  return (
    <>
      <div data-testid="surface-target-bar" className="mt-2 grid grid-cols-4 gap-1 rounded-lg border border-neutral-200/70 bg-white/70 p-1">
        {TARGETS.map((target) => (
          <button
            key={target.id}
            type="button"
            data-testid={`surface-target-${target.id.replace("_", "-")}`}
            aria-pressed={props.target === target.id}
            className={`${segmentClass(props.target === target.id)} h-11`}
            onClick={() => props.onTargetChange(target.id)}
          >
            <span className="block max-w-full whitespace-normal">{target.label}</span>
          </button>
        ))}
      </div>
      {props.target === "selected_wall" && !props.selectedWallFaceId ? (
        <div className={props.metaClass}>Click a wall in 3D, or use Brush after choosing paint or a material.</div>
      ) : null}
      {props.brush.active ? <div className={props.metaClass}>Brush is on · {props.brush.status}</div> : null}
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-neutral-200/70 bg-white/70 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-testid={`surfaces-tab-${tab.id}`}
            aria-pressed={props.tab === tab.id}
            className={segmentClass(props.tab === tab.id)}
            onClick={() => props.onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * The top of the Surfaces picker in Plan (UX audit ED8, phase 4f): Back to the room, what is being
 * changed, and for Pro the targets, Materials | Rooms, Brush and Summary. A consumer reaches it from
 * a room's Floor, Walls or Ceiling row, the canvas's Surfaces chip or the inspector's Change…, so
 * the target is already chosen. Extracted from `DesignControlsPlanPanel`, which can't grow.
 */
export function SurfaceBrowserHeader(props: SurfaceBrowserHeaderProps) {
  return (
    <>
      <SurfaceBrowserTitle {...props} />
      {props.pro ? <SurfaceBrowserProControls {...props} /> : null}
    </>
  );
}
