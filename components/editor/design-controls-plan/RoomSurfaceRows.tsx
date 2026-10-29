"use client";

import { ChevronRight } from "lucide-react";
import type { SurfaceSummaryRow, SurfaceTargetMode } from "./surfaceCatalog";
import { useReportStepPanelRoomCard } from "@/lib/tablet-panel-policy";

export type RoomSurfaceTarget = "floor" | "walls" | "ceiling";
export type RoomSurfaceRow = { target: RoomSurfaceTarget; label: string; value: string };

/**
 * A room's three surfaces, as its rows read (UX audit ED8): the floor's finish, the walls' paint or
 * material ("Mixed" when they differ, "Plain walls" when none is set), and the ceiling's paint.
 */
export function roomSurfaceRowsOf(
  rows: ReadonlyArray<Pick<SurfaceSummaryRow, "target" | "materialName"> & { room: { id: string } }>,
  roomId: string | null | undefined
): RoomSurfaceRow[] {
  const own = rows.filter((row) => row.room.id === roomId);
  const wallNames = [...new Set(own.filter((row) => row.target === "walls" || row.target === "selected_wall").map((row) => row.materialName))];
  return [
    { target: "floor", label: "Floor", value: own.find((row) => row.target === "floor")?.materialName ?? "Starter finish" },
    { target: "walls", label: "Walls", value: wallNames.length === 0 ? "Plain walls" : wallNames.length === 1 ? wallNames[0] : "Mixed" },
    { target: "ceiling", label: "Ceiling", value: own.find((row) => row.target === "ceiling")?.materialName ?? "No ceiling paint" },
  ];
}

/** Which row's picker is open: a selected wall counts as Walls. */
export function openRoomSurfaceTarget(pickerOpen: boolean, target: SurfaceTargetMode): RoomSurfaceTarget | null {
  if (!pickerOpen) return null;
  return target === "selected_wall" ? "walls" : target;
}

/**
 * Which card holds Pro's one Surfaces browser (30 Oct 2026; the Plan panel showed two): the selected
 * room's, or Floor finish while that card can't show it (a door or window is selected, or it's folded).
 */
export const surfaceBrowserHolderOf = (openingSelected: boolean, roomCardFolded: boolean) =>
  openingSelected || roomCardFolded ? "floorFinish" : "room";

/**
 * The room card's Floor, Walls and Ceiling rows (UX audit ED8, phase 4f). A row opens the Surfaces
 * picker in the panel for that surface: flooring for Floor, Paint | Materials for Walls (on Paint),
 * paint for Ceiling. With the canvas's Surfaces chip and the inspector's Change…, every surface
 * change is two clicks. Mounted only in the room card, they say the card is on screen, which keeps
 * a tablet's room inspector from floating beside it (lib/tablet-panel-policy).
 */
export function RoomSurfaceRows({ rows, openTarget, disabled, hidden = false, onOpen }: {
  rows: readonly RoomSurfaceRow[];
  openTarget: RoomSurfaceTarget | null;
  disabled: boolean;
  /** A door or window selected in the room card: its inspector shows instead. */
  hidden?: boolean;
  onOpen: (target: RoomSurfaceTarget) => void;
}) {
  useReportStepPanelRoomCard();
  if (hidden) return null;
  return (
    <ul data-testid="room-surface-rows" aria-label="Surfaces" className="mt-3 divide-y divide-separator rounded-lg border border-box-border bg-field">
      {rows.map((row) => (
        <li key={row.target}>
          <button
            type="button"
            data-testid={`room-surface-row-${row.target}`}
            aria-expanded={openTarget === row.target}
            disabled={disabled}
            className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm hover:bg-control-secondary-hover disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => onOpen(row.target)}
          >
            <span className="w-14 shrink-0 font-semibold text-label">{row.label}</span>
            <span className="min-w-0 flex-1 truncate text-control-label-idle">{row.value}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-label-secondary" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
