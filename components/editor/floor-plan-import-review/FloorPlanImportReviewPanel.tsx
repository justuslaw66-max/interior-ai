"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  floorPlanMvpIssueLevel,
  isFloorPlanMvpBlockingIssue,
  type FloorPlanReviewIssue,
} from "@/lib/floor-plan-imports/types";
import {
  applyFloorPlanMeasuredPropertyMutationV2,
  floorPlanPropertyEvidenceIsEditable,
  type FloorPlanConsumerMeasurementEvidenceV2,
} from "@/lib/floor-plan-measured-property-mutations";
import type { ConsumerFloorPlanImportJob } from "../floor-plan-import-ui-types";
import FloorPlanPropertyEvidenceControl from "../FloorPlanPropertyEvidenceControl";
import FloorPlanOptionalConfigurationPanel from "../FloorPlanOptionalConfigurationPanel";
import FloorPlanVisualReviewTools from "./FloorPlanVisualReviewTools";

type FloorPlanImportReviewPanelProps = {
  candidate: FloorPlanDocumentV2;
  job: ConsumerFloorPlanImportJob;
  issues: FloorPlanReviewIssue[];
  setCandidate: Dispatch<SetStateAction<FloorPlanDocumentV2 | null>>;
  setIssues: Dispatch<SetStateAction<FloorPlanReviewIssue[]>>;
  entranceOpeningId: string;
  setEntranceOpeningId: (value: string) => void;
  cannotFinishReason: string | null;
  onSubmit: () => void;
  submitting: boolean;
  disabled?: boolean;
  dark?: boolean;
};

function issuePrerequisite(
  issue: FloorPlanReviewIssue,
  document: FloorPlanDocumentV2,
  entranceId: string
) {
  const floor = document.floors[0];
  if (!floor) return "No editable floor was detected.";
  if (issue.code === "scale_unresolved" && floor.calibrations.length === 0) {
    return "Register origin, orientation and scale with the tracing tools first.";
  }
  if (
    issue.code === "source_registration_incomplete" &&
    document.floors.some((entry) => entry.calibrations.length === 0)
  ) {
    return "Register every imported floor to its source and millimetre scale first.";
  }
  if (
    [
      "room_topology_unresolved",
      "exterior_boundary_confirmation",
      "canonical_room_coverage_incomplete",
    ].includes(issue.code) &&
    (!floor.rooms.length || !floor.walls.length)
  ) {
    return "Trace at least one closed room before confirming this item.";
  }
  if (
    ["rooms_confirmation", "source_room_coverage_incomplete"].includes(
      issue.code
    )
  ) {
    const expected = issue.message.match(/(?:of|found) (\d+) (?:detected |indicated )?room/)?.[1];
    const roomCount = document.floors.reduce(
      (total, entry) => total + entry.rooms.length,
      0
    );
    if (!floor.walls.length || (expected && roomCount < Number(expected))) {
      return expected
        ? `Map all ${expected} indicated rooms before confirming this item.`
        : "Trace every indicated room before confirming this item.";
    }
  }
  if (issue.code === "entrance_confirmation" && !entranceId) {
    return "Choose the main entrance below.";
  }
  if (
    issue.code === "assumed_heights_confirmation" &&
    (Object.values(floor.defaults).some((property) => property.evidence === "assumed") ||
      !floor.verticalEvidence ||
      Object.values(floor.verticalEvidence).some(
        (property) => property.evidence === "assumed"
      ))
  ) {
    return "Confirm or replace every assumed height above first.";
  }
  if (
    ["dimensions_confirmation", "source_dimension_coverage_incomplete"].includes(
      issue.code
    )
  ) {
    const expected = issue.message.match(/(?:of|found) (\d+) (?:detected )?printed dimensions/)?.[1];
    const dimensionCount = document.floors.reduce(
      (total, entry) => total + entry.dimensions.length,
      0
    );
    if (expected && dimensionCount < Number(expected)) {
      return `Map all ${expected} detected printed dimensions before confirming this item.`;
    }
  }
  return null;
}

function createImportReviewMutationMetadata(
  floorId: string,
  property: string,
  note: string
) {
  const timestamp = Date.now().toString(36);
  return {
    mutationId: `import-review:${floorId}:${property}:${timestamp}`,
    nextRevisionId: `import-review-revision:${timestamp}:${property}`,
    actorId: "consumer-import-review",
    mutatedAt: new Date().toISOString(),
    note,
  };
}

export default function FloorPlanImportReviewPanel({
  candidate,
  job,
  issues,
  setCandidate,
  setIssues,
  entranceOpeningId,
  setEntranceOpeningId,
  cannotFinishReason,
  onSubmit,
  submitting,
  disabled = false,
  dark = false,
}: FloorPlanImportReviewPanelProps) {
  const floor = candidate.floors[0];
  const [focusedIssueId, setFocusedIssueId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>(
    () => Object.fromEntries(issues.map((issue) => [issue.id, issue.resolution ?? ""]))
  );
  if (!floor) return null;

  const subtle = dark ? "text-neutral-400" : "text-neutral-600";
  const control = dark
    ? "designer-control rounded-md border px-2 py-1.5 text-xs"
    : "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs";
  const unresolvedCritical = issues.filter(isFloorPlanMvpBlockingIssue);
  const focusedIssueEntityIds =
    issues.find((issue) => issue.id === focusedIssueId)?.entityIds ?? [];

  const changeHeight = (
    key: keyof typeof floor.defaults,
    value: number
  ) => {
    if (!Number.isFinite(value)) return;
    try {
      const result = applyFloorPlanMeasuredPropertyMutationV2(
        candidate,
        {
          target: { kind: "floor_default", floorId: floor.id, property: key },
          valueMm: Math.max(key === "windowSillHeight" ? 0 : 100, Math.round(value)),
          evidence: "user_confirmed",
        },
        createImportReviewMutationMetadata(
          floor.id,
          key,
          `Consumer edited and confirmed the displayed ${key}.`
        )
      );
      setCandidate(result.document);
    } catch {
      // Locked or invalid values stay unchanged and remain reviewable.
    }
  };

  const changeVerticalValue = (
    property: "storeyHeight" | "slabThickness",
    value: number
  ) => {
    if (!Number.isFinite(value)) return;
    const next = structuredClone(candidate);
    const nextFloor = next.floors[0];
    if (!nextFloor) return;
    if (property === "storeyHeight") {
      nextFloor.storeyHeightMm = Math.max(100, Math.round(value));
    } else {
      nextFloor.slabThicknessMm = Math.max(0, Math.round(value));
    }
    // Editing the number alone deliberately preserves its current evidence.
    setCandidate(next);
  };

  const confirmVerticalValue = (
    property: "storeyHeight" | "slabThickness",
    evidence: FloorPlanConsumerMeasurementEvidenceV2,
    note?: string
  ) => {
    const target = property === "storeyHeight"
      ? { kind: "floor_storey_height" as const, floorId: floor.id }
      : { kind: "floor_slab_thickness" as const, floorId: floor.id };
    try {
      const result = applyFloorPlanMeasuredPropertyMutationV2(
        candidate,
        {
          target,
          valueMm:
            property === "storeyHeight"
              ? floor.storeyHeightMm
              : floor.slabThicknessMm,
          evidence,
        },
        createImportReviewMutationMetadata(
          floor.id,
          property,
          note?.trim() ||
            `Consumer explicitly confirmed the displayed ${property === "storeyHeight" ? "storey height" : "slab thickness"}.`
        )
      );
      setCandidate(result.document);
    } catch {
      // The mutation engine remains the source of truth; invalid measurements
      // are left unchanged and the review issue stays unresolved.
    }
  };

  const confirmDisplayedHeightDefaults = () => {
    let next = candidate;
    const timestamp = Date.now().toString(36);
    for (const [index, key] of (
      Object.keys(floor.defaults) as Array<keyof typeof floor.defaults>
    ).entries()) {
      const property = next.floors[0]?.defaults[key];
      if (!property || property.evidence !== "assumed") continue;
      try {
        next = applyFloorPlanMeasuredPropertyMutationV2(
          next,
          {
            target: { kind: "floor_default", floorId: floor.id, property: key },
            valueMm: property.valueMm,
            evidence: "user_confirmed",
          },
          {
            mutationId: `import-review:${floor.id}:${key}:${timestamp}:${index}`,
            nextRevisionId: `import-review-revision:${timestamp}:${key}:${index}`,
            actorId: "consumer-import-review",
            mutatedAt: new Date().toISOString(),
            note: `Consumer explicitly confirmed the displayed ${key}.`,
          }
        ).document;
      } catch {
        return;
      }
    }
    setCandidate(next);
  };

  const changeRoomName = (id: string, name: string) => {
    const next = structuredClone(candidate);
    const room = next.floors[0]?.rooms.find((entry) => entry.id === id);
    if (room) room.name = name.slice(0, 120);
    setCandidate(next);
  };

  const resolveIssue = (id: string, resolved: boolean) => {
    const issue = issues.find((entry) => entry.id === id);
    if (
      !issue ||
      (resolved && issuePrerequisite(issue, candidate, entranceOpeningId))
    ) {
      return;
    }
    const resolution = resolutionNotes[id]?.trim() ?? "";
    if (resolved && isFloorPlanMvpBlockingIssue(issue) && resolution.length < 12) return;
    setIssues((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              resolved,
              ...(resolved
                ? {
                    resolution:
                      resolution,
                  }
                : { resolution: undefined }),
            }
          : entry
      )
    );
  };

  return (
    <>
      <div className="text-xs font-semibold">Source accuracy review</div>
      <p className={`mt-1 text-xs leading-4 ${subtle}`}>
        Required items protect the measured wall geometry used by 2D and 3D.
        Room names, entrance labels, and extra opening details are suggestions
        that can be completed later.
      </p>
      <FloorPlanVisualReviewTools
        key={job.id}
        document={candidate}
        job={job}
        focusedIssueEntityIds={focusedIssueEntityIds}
        onChange={(next) => setCandidate(next)}
        dark={dark}
        disabled={disabled}
      />
      <FloorPlanOptionalConfigurationPanel
        document={candidate}
        dark={dark}
        disabled={disabled}
        compact
      />
      {cannotFinishReason ? (
        <div
          className={
            dark
              ? "mt-2 rounded-md bg-amber-400/10 p-2 text-xs text-amber-100"
              : "mt-2 rounded-md bg-amber-100 p-2 text-xs text-amber-900"
          }
        >
          {cannotFinishReason}
          {/(dxf|ifc|dwg)/i.test(job.adapterId ?? "") ? (
            <span className="mt-1 block text-[10px]">
              Ask an administrator to map reviewed CAD topology, or keep the
              underlay and use guided calibration and tracing.
            </span>
          ) : null}
        </div>
      ) : null}
      {floor.rooms.length > 0 ? (
        <details className="mt-3" open>
          <summary className="cursor-pointer text-xs font-semibold">
            Room names
          </summary>
          <div className="mt-2 grid gap-2">
            {floor.rooms.map((room) => (
              <label
                key={room.id}
                className={`grid grid-cols-[1fr_1.4fr] items-center gap-2 text-[11px] ${subtle}`}
              >
                <span className="truncate">{room.roomType}</span>
                <input
                  className={control}
                  value={room.name}
                  onChange={(event) =>
                    changeRoomName(room.id, event.target.value)
                  }
                />
              </label>
            ))}
          </div>
        </details>
      ) : null}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold">
          Optional 3D assumptions (does not change 2D accuracy)
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              ["storeyHeight", "Storey height", floor.storeyHeightMm],
              ["slabThickness", "Slab thickness", floor.slabThicknessMm],
            ] as const
          ).map(([property, label, valueMm]) => {
            const evidence =
              floor.verticalEvidence?.[property]?.evidence ?? "assumed";
            return (
              <div key={property} className="min-w-0">
                <label className={`text-[10px] ${subtle}`}>
                  {label} (mm)
                  <input
                    className={`${control} mt-1 w-full`}
                    min={property === "slabThickness" ? 0 : 100}
                    step={10}
                    type="number"
                    value={valueMm}
                    disabled={
                      disabled || !floorPlanPropertyEvidenceIsEditable(evidence)
                    }
                    onChange={(event) =>
                      changeVerticalValue(property, Number(event.target.value))
                    }
                  />
                </label>
                <FloorPlanPropertyEvidenceControl
                  evidence={evidence}
                  dark={dark}
                  disabled={disabled}
                  testId={`import-review-${property}-evidence`}
                  onConfirm={(nextEvidence, note) =>
                    confirmVerticalValue(property, nextEvidence, note)
                  }
                />
              </div>
            );
          })}
          {(
            [
              ["wallHeight", "Wall"],
              ["doorHeight", "Door"],
              ["windowHeight", "Window"],
              ["windowSillHeight", "Window sill"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className={`text-[10px] ${subtle}`}>
              {label} (mm)
              <input
                className={`${control} mt-1 w-full`}
                min={key === "windowSillHeight" ? 0 : 100}
                step={10}
                type="number"
                value={floor.defaults[key].valueMm}
                disabled={
                  disabled ||
                  !floorPlanPropertyEvidenceIsEditable(
                    floor.defaults[key].evidence
                  )
                }
                onChange={(event) =>
                  changeHeight(key, Number(event.target.value))
                }
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          className={`${control} mt-2 w-full font-semibold`}
          disabled={
            disabled ||
            !Object.values(floor.defaults).some(
              (property) => property.evidence === "assumed"
            )
          }
          onClick={confirmDisplayedHeightDefaults}
        >
          Confirm all displayed defaults
        </button>
        <p className={`mt-1 text-[10px] ${subtle}`}>
          This records your confirmation only; it does not make the heights
          source-verified or site-measured.
        </p>
      </details>
      {floor.openings.length > 0 ? (
        <label className={`mt-3 block text-[11px] ${subtle}`}>
          Main entrance
          <select
            className={`${control} mt-1 w-full`}
            value={entranceOpeningId}
            onChange={(event) => setEntranceOpeningId(event.target.value)}
          >
            <option value="">Choose an opening…</option>
            {floor.openings
              .filter(
                (opening) =>
                  opening.kind === "door" || opening.kind === "gate"
              )
              .map((opening) => (
                <option key={opening.id} value={opening.id}>
                  {opening.id} · {opening.widthMm} mm · {opening.operation}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      <div className="mt-3 grid gap-2">
        {issues.map((issue) => {
          const level = floorPlanMvpIssueLevel(issue);
          const blocked = issuePrerequisite(
            issue,
            candidate,
            entranceOpeningId
          );
          const resolution = resolutionNotes[issue.id] ?? "";
          return (
            <div
              key={issue.id}
              className={
                dark
                  ? "flex gap-2 rounded-md bg-white/5 p-2 text-xs"
                  : "flex gap-2 rounded-md bg-white p-2 text-xs"
              }
            >
              <input
                aria-label={`Resolve ${issue.message}`}
                checked={issue.resolved}
                className="mt-0.5"
                disabled={
                  disabled ||
                  Boolean(blocked) ||
                  (level === "blocking" &&
                    !issue.resolved &&
                    resolution.trim().length < 12)
                }
                type="checkbox"
                onChange={(event) =>
                  resolveIssue(issue.id, event.target.checked)
                }
              />
              <div className="min-w-0 flex-1">
                <span className={`mb-0.5 block text-[9px] font-semibold uppercase tracking-wide ${
                  level === "blocking" ? "text-red-600" : subtle
                }`}>
                  {level === "blocking" ? "Required" : level === "resolved" ? "Reviewed" : "Suggestion"}
                </span>
                <span className="block font-semibold">{issue.message}</span>
                {issue.code === "openings_confirmation" ? (
                  <span className={`mt-1 block text-[10px] leading-4 ${subtle}`}>
                    Use Step 3 above to select both ends of each visible opening
                    on the plan. If none are shown, mark this suggestion reviewed.
                  </span>
                ) : null}
                {blocked ? (
                  <span className={`mt-0.5 block text-[10px] ${subtle}`}>
                    {blocked}
                  </span>
                ) : null}
                {level === "blocking" ? (
                  <label className={`mt-1 block text-[10px] ${subtle}`}>
                    What did you verify or correct?
                    <textarea
                      className={`${control} mt-1 min-h-14 w-full resize-y`}
                      maxLength={2000}
                      value={resolution}
                      onChange={(event) =>
                        setResolutionNotes((current) => ({
                          ...current,
                          [issue.id]: event.target.value,
                        }))
                      }
                      placeholder="Example: Added the missing kitchen window and checked its span against the source."
                    />
                  </label>
                ) : null}
                {issue.entityIds?.length ? (
                  <button
                    type="button"
                    className="mt-1 text-[10px] font-semibold text-blue-600"
                    aria-pressed={focusedIssueId === issue.id}
                    onClick={() =>
                      setFocusedIssueId((current) =>
                        current === issue.id ? null : issue.id
                      )
                    }
                  >
                    {focusedIssueId === issue.id
                      ? "Clear source focus"
                      : `Show ${issue.entityIds.length} affected item${
                          issue.entityIds.length === 1 ? "" : "s"
                        }`}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="mt-3 w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={
          disabled ||
          submitting ||
          Boolean(cannotFinishReason) ||
          unresolvedCritical.length > 0
        }
        onClick={onSubmit}
      >
        {submitting ? "Checking…" : "Confirm and validate"}
      </button>
    </>
  );
}
