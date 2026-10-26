"use client";

import { Button } from "@/components/ui/Button";
import { formatTimeAgo } from "@/lib/design-page-utils";
import { compareLayoutVersion, summarizeLayoutVersionComparison } from "@/lib/layout-versions";
import type { LayoutVersion, RoomSnapshot } from "@/lib/room-types";

export type LayoutVersionsSectionProps = {
  activeRoom: RoomSnapshot | null;
  nameInput: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onRestore: (versionId: string) => void;
  onDelete: (versionId: string) => void;
};

const SOURCE_LABEL: Record<LayoutVersion["source"], string> = {
  make_space: "Make space",
  auto_place: "Auto",
  ai: "AI",
  manual: "Manual",
};

/** The version saved just before the last manual change ("Before …"), else the latest manual one. */
function latestManualLayoutVersionOf(versions: readonly LayoutVersion[]) {
  return (
    versions.find((version) => version.source === "manual" && version.name.toLowerCase().startsWith("before")) ??
    versions.find((version) => version.source === "manual") ??
    null
  );
}

function CountTile({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-md bg-tile px-2 py-1.5">
      <div className="text-xs font-semibold text-label-secondary">{label}</div>
      <div className="text-xs font-semibold text-label">
        {count} item{count === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function LayoutVersionRow({ room, version, onRestore, onDelete }: {
  room: RoomSnapshot;
  version: LayoutVersion;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const comparison = compareLayoutVersion(room, version);
  const comparisonSummary = summarizeLayoutVersionComparison(comparison);
  return (
    <li className="rounded-lg border border-box-border bg-surface-secondary px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-label">{version.name}</div>
          <div className="mt-0.5 text-xs text-label-secondary">
            {SOURCE_LABEL[version.source]} · {formatTimeAgo(version.timestamp)}
          </div>
          <div data-testid="layout-version-comparison" className="mt-2 grid grid-cols-2 gap-1.5">
            <CountTile label="Saved" count={comparison.savedItemCount} />
            <CountTile label="Current" count={comparison.currentItemCount} />
          </div>
          <div className="mt-2 text-xs text-label-secondary">
            {comparisonSummary.itemDeltaLabel} · {comparisonSummary.movementLabel}
          </div>
          <div className="mt-0.5 text-xs text-label-secondary">{comparisonSummary.zoneDeltaLabel}</div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button size="compact" variant="quiet" data-testid={`layout-version-restore-${version.id}`} onClick={onRestore}>
            {comparisonSummary.restoreLabel}
          </Button>
          <Button size="compact" variant="quiet" data-testid={`layout-version-delete-${version.id}`} aria-label={`Delete ${version.name}`} onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </li>
  );
}

/**
 * Layout versions of the active room (Pro; UX audit SX4, phase 4e, J's Q5): save the furniture as
 * it is, compare a version with the room now, restore it or delete it. Suggest a layout, Make space
 * and AI save one before they change the room.
 */
export function LayoutVersionsSection({ activeRoom, nameInput, onNameChange, onSave, onRestore, onDelete }: LayoutVersionsSectionProps) {
  const versions = activeRoom?.layoutVersions ?? [];
  const latestManualLayoutVersion = latestManualLayoutVersionOf(versions);
  return (
    <section aria-labelledby="layout-versions-heading" data-testid="layout-versions-panel" className="rounded-xl border border-box-border bg-surface-band p-3">
      <h3 id="layout-versions-heading" className="mb-2 text-sm font-semibold text-label">
        Layout versions
      </h3>
      <form
        className="grid grid-cols-[1fr_auto] gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <label htmlFor="layout-version-name" className="sr-only">
          Version name
        </label>
        <input
          id="layout-version-name"
          data-testid="layout-version-name-input"
          value={nameInput}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={`Layout ${versions.length + 1}`}
          className="min-h-10 min-w-0 rounded-lg border border-control-secondary-border bg-field px-3 text-sm text-label placeholder:text-label-tertiary touch:min-h-11"
        />
        <Button type="submit" variant="primary" size="compact" data-testid="save-layout-version" className="h-10 touch:h-11">
          Save
        </Button>
      </form>
      {latestManualLayoutVersion ? (
        <Button
          size="compact"
          data-testid="layout-version-restore-latest-manual"
          className="mt-3 w-full justify-between"
          onClick={() => onRestore(latestManualLayoutVersion.id)}
        >
          <span className="min-w-0 truncate">Restore previous manual layout</span>
          <span className="shrink-0 font-normal text-label-secondary">{formatTimeAgo(latestManualLayoutVersion.timestamp)}</span>
        </Button>
      ) : null}
      {versions.length > 0 && activeRoom ? (
        <ul className="mt-3 space-y-2" data-testid="layout-version-list">
          {versions.map((version) => (
            <LayoutVersionRow
              key={version.id}
              room={activeRoom}
              version={version}
              onRestore={() => onRestore(version.id)}
              onDelete={() => onDelete(version.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-label-secondary">No saved layouts yet.</p>
      )}
    </section>
  );
}
