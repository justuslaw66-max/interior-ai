import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { floorPlanPropertyEvidenceIsEditable } from "@/lib/floor-plan-measured-property-mutations";
import FloorPlanVisualReviewTools from "@/components/editor/floor-plan-import-review/FloorPlanVisualReviewTools";
import type { AdminJob, RenderedPage, RoomRow } from "./floorPlanReviewTypes";

export function FloorPlanCandidateReviewPanel({
  candidateText,
  correctionNote,
  document,
  hasUnsavedChanges,
  job,
  missingResolution,
  onCandidateTextChange,
  onCorrectionNoteChange,
  onRoomChange,
  onSave,
  pages,
  pending,
  reviewable,
  rooms,
}: {
  candidateText: string;
  correctionNote: string;
  document: FloorPlanDocumentV2 | null;
  hasUnsavedChanges: boolean;
  job: AdminJob;
  missingResolution: boolean;
  onCandidateTextChange: (value: string) => void;
  onCorrectionNoteChange: (value: string) => void;
  onRoomChange: (
    floorIndex: number,
    roomIndex: number,
    field: "name" | "roomType",
    value: string
  ) => void;
  onSave: () => void;
  pages: RenderedPage[];
  pending: string | null;
  reviewable: boolean;
  rooms: RoomRow[];
}) {
  const updateDocument = (next: FloorPlanDocumentV2) =>
    onCandidateTextChange(JSON.stringify(next, null, 2));

  const updateHeight = (
    key: "storeyHeightMm" | keyof FloorPlanDocumentV2["floors"][number]["defaults"],
    value: number
  ) => {
    if (!document || !Number.isFinite(value)) return;
    const next = structuredClone(document);
    const floor = next.floors[0];
    if (!floor) return;
    if (key === "storeyHeightMm") {
      floor.storeyHeightMm = Math.max(100, Math.round(value));
    } else {
      floor.defaults[key].valueMm = Math.max(
        key === "windowSillHeight" ? 0 : 100,
        Math.round(value)
      );
    }
    updateDocument(next);
  };

  const floor = document?.floors[0] ?? null;
  const roomTypeOptions = [
    ["other", "Room"],
    ["living", "Living room"],
    ["bedroom", "Bedroom"],
    ["dining", "Dining room"],
    ["kitchen", "Kitchen"],
    ["toilet", "Bathroom"],
    ["study", "Study"],
    ["shelter", "Household shelter"],
    ["service_yard", "Service yard"],
  ] as const;

  const sidebarFooter = (
    <div
      className="mt-3 scroll-mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3"
      id="floor-plan-save-check"
    >
      <div className="text-sm font-semibold">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs text-white">
          4
        </span>
        Save and check
      </div>
      <p className="mt-2 text-[10px] leading-4 text-neutral-600">
        When the room outlines and visible openings match the drawing, save
        them. The app will check the plan automatically.
      </p>

      {floor ? (
        <details className="mt-3 rounded-md border bg-white p-2">
          <summary className="cursor-pointer text-[10px] font-semibold text-neutral-700">
            3D heights (optional)
          </summary>
          <p className="mt-2 text-[10px] leading-4 text-neutral-500">
            These do not affect the 2D plan. Keep the defaults unless the source
            gives exact heights.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[10px] text-neutral-600">
              Storey
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-xs"
                disabled={!reviewable || Boolean(pending)}
                min={100}
                onChange={(event) =>
                  updateHeight("storeyHeightMm", Number(event.target.value))
                }
                step={10}
                type="number"
                value={floor.storeyHeightMm}
              />
            </label>
            {(
              [
                ["wallHeight", "Wall"],
                ["doorHeight", "Door"],
                ["windowHeight", "Window"],
                ["windowSillHeight", "Window sill"],
              ] as const
            ).map(([key, label]) => (
              <label className="text-[10px] text-neutral-600" key={key}>
                {label}
                <input
                  className="mt-1 w-full rounded border px-2 py-1.5 text-xs disabled:opacity-60"
                  disabled={
                    !reviewable ||
                    Boolean(pending) ||
                    !floorPlanPropertyEvidenceIsEditable(
                      floor.defaults[key].evidence
                    )
                  }
                  min={key === "windowSillHeight" ? 0 : 100}
                  onChange={(event) =>
                    updateHeight(key, Number(event.target.value))
                  }
                  step={10}
                  type="number"
                  value={floor.defaults[key].valueMm}
                />
              </label>
            ))}
          </div>
          <p className="mt-1 text-[9px] text-neutral-500">All values are millimetres.</p>
        </details>
      ) : null}

      {rooms.length ? (
        <details className="mt-2 rounded-md border bg-white p-2">
          <summary className="cursor-pointer text-[10px] font-semibold text-neutral-700">
            Room names (optional) · {rooms.length}
          </summary>
          <div className="mt-2 space-y-2">
            {rooms.map(({ floor: roomFloor, floorIndex, room, roomIndex }) => (
              <div className="rounded border p-2" key={`${roomFloor.id}-${room.id}`}>
                <div className="text-[9px] text-neutral-500">{roomFloor.name}</div>
                <input
                  aria-label={`Name ${room.id}`}
                  className="mt-1 w-full rounded border px-2 py-1 text-xs"
                  disabled={!reviewable || Boolean(pending)}
                  onChange={(event) =>
                    onRoomChange(
                      floorIndex,
                      roomIndex,
                      "name",
                      event.target.value
                    )
                  }
                  value={room.name}
                />
                <select
                  aria-label={`Type ${room.id}`}
                  className="mt-1 w-full rounded border bg-white px-2 py-1 text-xs"
                  disabled={!reviewable || Boolean(pending)}
                  onChange={(event) =>
                    onRoomChange(
                      floorIndex,
                      roomIndex,
                      "roomType",
                      event.target.value
                    )
                  }
                  value={room.roomType}
                >
                  {roomTypeOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <details className="mt-2 rounded-md border bg-white p-2">
        <summary className="cursor-pointer text-[10px] font-semibold text-neutral-700">
          Add a review note (optional)
        </summary>
        <textarea
          className="mt-2 min-h-16 w-full rounded border p-2 text-xs disabled:opacity-60"
          disabled={!reviewable || Boolean(pending)}
          onChange={(event) => onCorrectionNoteChange(event.target.value)}
          placeholder="What did you correct?"
          value={correctionNote}
        />
      </details>

      <button
        className="mt-3 w-full rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        disabled={!reviewable || Boolean(pending) || missingResolution}
        onClick={onSave}
        type="button"
      >
        {pending === "save" ? "Checking plan…" : "Save and check plan"}
      </button>
      <div className="mt-2 text-[10px] text-neutral-500">
        {hasUnsavedChanges
          ? "You have unsaved changes."
          : `Saved draft v${job.candidateVersion}.`}
      </div>
    </div>
  );

  return (
    <section className="rounded-xl border bg-white p-4">
      <h2 className="text-base font-semibold">Build the 2D plan</h2>
      <p className="mt-1 text-xs text-neutral-600">
        Work from left to right: select directly on the drawing and use the
        guided steps beside it. Scale and closed rooms are required; add doors
        and windows wherever the source shows them.
      </p>
      {document ? (
        <FloorPlanVisualReviewTools
          assetRoutePrefix={`/api/admin/floor-plan-imports/${encodeURIComponent(job.id)}/assets`}
          disabled={!reviewable || Boolean(pending)}
          document={document}
          focusedIssueEntityIds={[]}
          guidedLayout
          job={{
            id: job.id,
            adapterId: job.adapterId,
            renderedPagesJson: pages,
          }}
          onChange={updateDocument}
          sidebarFooter={sidebarFooter}
        />
      ) : (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No valid FloorPlanDocumentV2 candidate is available.
        </div>
      )}
      <details className="mt-4 rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Developer tools — raw plan data
        </summary>
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          Only record geometry supported by the source. Source IDs and
          verification state cannot be promoted here.
        </div>
        <textarea
          className="mt-3 min-h-[30rem] w-full rounded-lg border p-3 font-mono text-[11px] disabled:opacity-60"
          disabled={!reviewable || Boolean(pending)}
          onChange={(event) => onCandidateTextChange(event.target.value)}
          spellCheck={false}
          value={candidateText}
        />
      </details>
    </section>
  );
}
