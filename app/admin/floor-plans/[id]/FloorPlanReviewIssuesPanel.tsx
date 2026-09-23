import type { Dispatch, SetStateAction } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  floorPlanMvpIssueLevel,
  isFloorPlanMvpSuggestionIssue,
} from "@/lib/floor-plan-imports/types";
import {
  defaultReviewIssueResolution,
  issueTone,
} from "./floorPlanReviewModel";
import type { ReviewIssue } from "./floorPlanReviewTypes";

type RequiredActionDefinition = {
  id: string;
  codes: readonly string[];
  title: string;
  description: string;
};

const REQUIRED_ACTIONS: readonly RequiredActionDefinition[] = [
  {
    id: "scale",
    codes: ["scale_unresolved", "source_registration_incomplete"],
    title: "Set the drawing scale",
    description: "Confirm a printed measurement so the 2D plan uses real dimensions.",
  },
  {
    id: "rooms",
    codes: ["room_topology_unresolved", "canonical_room_coverage_incomplete"],
    title: "Complete the rooms and walls",
    description: "Every room needs a closed wall boundary that matches the source.",
  },
  {
    id: "structure",
    codes: ["structures_confirmation", "exterior_boundary_confirmation"],
    title: "Confirm the structural footprint",
    description: "Keep only source-supported columns, shafts, ledges and outer boundaries.",
  },
];

function friendlyIssueTitle(code: string) {
  if (code === "openings_confirmation") return "Doors and windows";
  return REQUIRED_ACTIONS.find((action) =>
    action.codes.includes(code)
  )?.title ?? code.replaceAll("_", " ");
}

function issuePrerequisite(
  issue: ReviewIssue,
  document: FloorPlanDocumentV2 | null
) {
  const floor = document?.floors[0];
  if (!floor) return "No editable floor was detected.";
  if (issue.code === "scale_unresolved" && floor.calibrations.length === 0) {
    return "Set the drawing scale from a printed dimension first.";
  }
  if (
    issue.code === "source_registration_incomplete" &&
    document.floors.some((entry) => entry.calibrations.length === 0)
  ) {
    return "Register every imported floor to its source drawing first.";
  }
  if (
    [
      "room_topology_unresolved",
      "canonical_room_coverage_incomplete",
      "exterior_boundary_confirmation",
    ].includes(issue.code) &&
    (!floor.rooms.length || !floor.walls.length)
  ) {
    return "Complete at least one closed room and its walls first.";
  }
  if (
    ["rooms_confirmation", "source_room_coverage_incomplete"].includes(
      issue.code
    )
  ) {
    const expected = issue.message.match(
      /(?:of|found) (\d+) (?:detected |indicated )?room/
    )?.[1];
    const roomCount = document.floors.reduce(
      (total, entry) => total + entry.rooms.length,
      0
    );
    if (!floor.walls.length || (expected && roomCount < Number(expected))) {
      return expected
        ? `Map all ${expected} indicated rooms first.`
        : "Map every indicated room first.";
    }
  }
  return null;
}

export function FloorPlanReviewIssuesPanel({
  document,
  issues,
  pending,
  reviewable,
  setIssues,
}: {
  document: FloorPlanDocumentV2 | null;
  issues: ReviewIssue[];
  pending: string | null;
  reviewable: boolean;
  setIssues: Dispatch<SetStateAction<ReviewIssue[]>>;
}) {
  const updateIssue = (
    index: number,
    change: Partial<Pick<ReviewIssue, "resolved" | "resolution">>
  ) =>
    setIssues((currentIssues) =>
      currentIssues.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...change } : entry
      )
    );
  const entries = issues.map((issue, index) => ({ issue, index }));
  const required = entries.filter(
    ({ issue }) =>
      issue.severity === "critical" && !isFloorPlanMvpSuggestionIssue(issue)
  );
  const suggestions = entries.filter(
    ({ issue }) =>
      issue.severity !== "critical" || isFloorPlanMvpSuggestionIssue(issue)
  );
  const knownRequiredCodes = new Set(
    REQUIRED_ACTIONS.flatMap((action) => [...action.codes])
  );
  const requiredActionSummaries: Array<
    RequiredActionDefinition & { matching: typeof required }
  > = REQUIRED_ACTIONS.flatMap((action) => {
    const matching = required.filter(({ issue }) =>
      action.codes.includes(issue.code)
    );
    return matching.length ? [{ ...action, matching }] : [];
  });
  const otherRequired = required.filter(
    ({ issue }) => !knownRequiredCodes.has(issue.code)
  );
  if (otherRequired.length) {
    requiredActionSummaries.push({
      id: "other",
      codes: [],
      title: "Finish the remaining 2D checks",
      description: "Review the remaining source-supported geometry items.",
      matching: otherRequired,
    });
  }

  const renderIssue = ({ issue, index }: (typeof entries)[number]) => {
    const level = floorPlanMvpIssueLevel(issue);
    const prerequisite = issuePrerequisite(issue, document);
    return (
      <div
        className={`rounded-lg border p-3 ${
          prerequisite
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : issueTone(issue)
        }`}
        key={issue.id}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold">
              {friendlyIssueTitle(issue.code)}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
              {level === "blocking" ? "Required check" : level === "resolved" ? "Resolved" : "Suggestion"}
              {" · "}{issue.code.replaceAll("_", " ")}
            </div>
            <div className="mt-1 text-sm">{issue.message}</div>
            {issue.code === "openings_confirmation" ? (
              <div className="mt-2 rounded bg-white/80 p-2 text-xs leading-5 text-neutral-700">
                Use <strong>Step 3 · Add visible doors and windows</strong>
                beside the plan. If the source shows none, simply mark this
                suggestion as Reviewed.
              </div>
            ) : null}
            {issue.entityIds?.length ? (
              <div className="mt-1 break-all font-mono text-[10px] text-neutral-500">
                {issue.entityIds.join(", ")}
              </div>
            ) : null}
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs font-medium">
            <input
              checked={issue.resolved}
              disabled={
                !reviewable ||
                Boolean(pending) ||
                Boolean(prerequisite && !issue.resolved)
              }
              onChange={(event) =>
                updateIssue(
                  index,
                  event.target.checked
                    ? {
                        resolved: true,
                        resolution:
                          issue.resolution?.trim() ||
                          defaultReviewIssueResolution(issue, document),
                      }
                    : { resolved: false }
                )
              }
              type="checkbox"
            />
            {prerequisite ? "Correct first" : level === "blocking" ? "Fixed" : "Reviewed"}
          </label>
        </div>
        {prerequisite ? (
          <p className="mt-2 rounded bg-white/70 p-2 text-xs font-medium text-amber-900">
            {issue.resolved
              ? `This was marked reviewed, but it is still incomplete: ${prerequisite} Uncheck it before continuing.`
              : prerequisite}
          </p>
        ) : null}
        {issue.resolved ? (
          <textarea
            className="mt-2 min-h-16 w-full rounded border bg-white p-2 text-xs disabled:opacity-60"
            disabled={!reviewable || Boolean(pending)}
            onChange={(event) => updateIssue(index, { resolution: event.target.value })}
            placeholder={level === "blocking" ? "Briefly describe what was corrected" : "Optional note"}
            value={issue.resolution ?? ""}
          />
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="scroll-mt-4 rounded-xl border bg-white p-4"
      id="floor-plan-2d-checklist"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">2D checklist</h2>
        <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs">
          {requiredActionSummaries.length} tasks
        </span>
      </div>
      <div className="mt-3">
        <div className="grid gap-3 md:grid-cols-3">
          {requiredActionSummaries.map((action) => {
          const remaining = action.matching.filter(
            ({ issue }) => !issue.resolved || issuePrerequisite(issue, document)
          ).length;
          const prerequisite = action.matching
            .map(({ issue }) => issuePrerequisite(issue, document))
            .find(Boolean);
          const actionIssueIds = new Set(
            action.matching.map(({ issue }) => issue.id)
          );
          return (
            <div
              className={`rounded-lg border p-3 ${
                remaining
                  ? "border-amber-200 bg-amber-50"
                  : "border-emerald-200 bg-emerald-50"
              }`}
              key={action.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">
                    {action.title}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-neutral-600">
                    {action.description}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                  remaining
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}>
                  {remaining ? `${remaining} left` : "Ready"}
                </span>
              </div>
              {remaining ? (
                <>
                  {prerequisite ? (
                    <p className="mt-2 text-[10px] font-medium text-amber-900">
                      {prerequisite}
                    </p>
                  ) : null}
                  <button
                    className="mt-3 w-full rounded-md bg-white px-3 py-2 text-xs font-semibold text-neutral-900 shadow-sm disabled:opacity-50"
                    disabled={
                      !reviewable || Boolean(pending) || Boolean(prerequisite)
                    }
                    onClick={() =>
                      setIssues((current) =>
                        current.map((issue) =>
                          actionIssueIds.has(issue.id)
                            ? {
                                ...issue,
                                resolved: true,
                                resolution:
                                  issue.resolution?.trim() ||
                                  defaultReviewIssueResolution(issue, document),
                              }
                            : issue
                        )
                      )
                    }
                    type="button"
                  >
                    Confirm complete
                  </button>
                </>
              ) : (
                <p className="mt-3 text-[10px] font-medium text-emerald-800">
                  Confirmed against the source plan.
                </p>
              )}
            </div>
          );
          })}
        </div>

        {required.length ? (
          <details className="mt-3 rounded-lg border p-3">
            <summary className="cursor-pointer text-xs font-semibold text-neutral-700">
              Required check details · {required.length}
            </summary>
            <div className="mt-3 max-h-[520px] space-y-3 overflow-auto pr-1">
              {required.map(renderIssue)}
            </div>
          </details>
        ) : null}

        {suggestions.length ? (
          <details className="mt-3 rounded-lg border p-3">
            <summary className="cursor-pointer text-xs font-semibold text-neutral-600">
              Optional improvements · {suggestions.filter(({ issue }) => !issue.resolved).length}
            </summary>
            <div className="mt-3 max-h-[520px] space-y-3 overflow-auto pr-1">
              {suggestions.map(renderIssue)}
            </div>
          </details>
        ) : null}
        {!issues.length ? (
          <div className="mt-3 rounded-lg border border-dashed p-6 text-center text-sm text-neutral-500">
            No review issues recorded.
          </div>
        ) : null}
      </div>
    </div>
  );
}
