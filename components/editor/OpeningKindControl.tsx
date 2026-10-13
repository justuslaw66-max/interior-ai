"use client";

import { useState } from "react";
import {
  planDesignPageOpeningKindMutation,
  type DesignPageOpeningKindMutationPlan,
  type DesignPageOpeningMetricsPatch,
} from "@/lib/design-page-opening-metrics";
import type { RoomOpening2D } from "@/lib/editorScene";

type OpeningKindControlProps = {
  opening: Pick<
    RoomOpening2D,
    "id" | "kind" | "widthMm" | "heightMm" | "bottomMm" | "evidence"
  >;
  canEdit: boolean;
  proMode: boolean;
  testId: string;
  onChange: (patch: DesignPageOpeningMetricsPatch) => void;
};

function BlockedKindPlan({
  plan, proMode, testId, approve,
}: {
  plan: DesignPageOpeningKindMutationPlan; proMode: boolean;
  testId: string; approve: (patch: DesignPageOpeningMetricsPatch) => void;
}) {
  return (
    <div
      data-testid={`${testId}-blocked`}
      className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
    >
      <div>{plan.explanation}</div>
      {proMode && plan.approvedOverridePatch ? (
        <button
          type="button"
          data-testid={`${testId}-approve-override`}
          className="mt-2 rounded-md bg-amber-900 px-2 py-1 font-semibold text-white"
          onClick={() => approve(plan.approvedOverridePatch!)}
        >
          Approve reviewed override
        </button>
      ) : <div className="mt-1">Open Pro tools to review an evidence override.</div>}
    </div>
  );
}

export function OpeningKindControl({
  opening,
  canEdit,
  proMode,
  testId,
  onChange,
}: OpeningKindControlProps) {
  const [blockedPlan, setBlockedPlan] =
    useState<DesignPageOpeningKindMutationPlan | null>(null);
  const labelClass = "text-xs font-medium text-gray-600";
  const controlClass = "mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-xs text-gray-900 focus:border-teal-500";

  const selectKind = (newKind: RoomOpening2D["kind"]) => {
    const plan = planDesignPageOpeningKindMutation(opening, newKind);
    if (plan.status === "blocked") {
      setBlockedPlan(plan);
      return;
    }
    setBlockedPlan(null);
    if (plan.patch) onChange(plan.patch);
  };

  return (
    <div className={labelClass}>
      <label htmlFor={testId}>Type</label>
      <select
        id={testId}
        data-testid={testId}
        className={controlClass}
        value={opening.kind}
        disabled={!canEdit}
        onChange={(event) =>
          selectKind(event.currentTarget.value as RoomOpening2D["kind"])
        }
      >
        <option value="door">Door</option>
        <option value="window">Window</option>
      </select>
      {blockedPlan ? <BlockedKindPlan
        plan={blockedPlan} proMode={proMode} testId={testId}
        approve={(patch) => { onChange(patch); setBlockedPlan(null); }}
      /> : null}
    </div>
  );
}
