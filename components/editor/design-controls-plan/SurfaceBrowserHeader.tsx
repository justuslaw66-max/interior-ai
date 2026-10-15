"use client";

import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
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
  metaClass: string;
  onBack: () => void;
  onOpenSummary: () => void;
  onTargetChange: (target: SurfaceTargetMode) => void;
  onTabChange: (tab: SurfaceBrowserTab) => void;
};

const TARGETS: ReadonlyArray<{ value: SurfaceTargetMode; label: string; testId: string }> = [
  { value: "floor", label: "Floor", testId: "surface-target-floor" },
  { value: "walls", label: "Walls", testId: "surface-target-walls" },
  { value: "selected_wall", label: "Selected wall", testId: "surface-target-selected-wall" },
  { value: "ceiling", label: "Ceiling", testId: "surface-target-ceiling" },
];
const TABS: ReadonlyArray<{ value: SurfaceBrowserTab; label: string; testId: string }> = [
  { value: "tiles", label: "Materials", testId: "surfaces-tab-tiles" },
  { value: "rooms", label: "Rooms", testId: "surfaces-tab-rooms" },
];

// When Pro's Brush and Summary leave the title too little room, they move under it, so what's
// being changed reads on one line.
function SurfaceBrowserTitle(props: SurfaceBrowserHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-start gap-1">
        <Button
          variant="quiet"
          size="icon"
          data-testid="surfaces-back"
          aria-label="Back to the room"
          title="Back to the room"
          onClick={props.onBack}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-neutral-900">Surfaces</div>
          <div className={props.metaClass}>
            {props.targetLabel} · {props.displayName}
          </div>
        </div>
      </div>
      {props.pro ? (
        <div className="ml-auto flex shrink-0 justify-end gap-1">
          <Button
            data-testid="surface-brush-toggle"
            size="compact"
            pressed={props.brush.active}
            disabled={props.brush.disabled}
            onClick={props.brush.onToggle}
          >
            Brush
          </Button>
          <Button data-testid="surface-summary-open" size="compact" onClick={props.onOpenSummary}>
            Summary
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Pro's targets (Floor, Walls, Selected wall, Ceiling), its notes, and Materials | Rooms. */
function SurfaceBrowserProControls(props: SurfaceBrowserHeaderProps) {
  return (
    <>
      <SegmentedControl
        label="Surface"
        testId="surface-target-bar"
        className="mt-2"
        size="compact"
        fill
        value={props.target}
        onChange={props.onTargetChange}
        options={TARGETS}
      />
      {props.target === "selected_wall" && !props.selectedWallFaceId ? (
        <div className={props.metaClass}>Click a wall in 3D, or use Brush after choosing paint or a material.</div>
      ) : null}
      {props.brush.active ? <div className={props.metaClass}>Brush is on · {props.brush.status}</div> : null}
      <SegmentedControl
        label="Browse"
        className="mt-2"
        fill
        value={props.tab}
        onChange={props.onTabChange}
        options={TABS}
      />
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
