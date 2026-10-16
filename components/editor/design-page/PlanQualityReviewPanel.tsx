"use client";

import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import type {
  FloorPlanQualityAction,
  FloorPlanQualityIssue,
  FloorPlanQualityReport,
} from "@/lib/floor-plan-quality";

type PlanQualityReviewPanelState = {
  report: FloorPlanQualityReport;
  collapsed: boolean;
};

type PlanQualityReviewPanelConfiguration = {
  portalTarget: HTMLDivElement | null;
  dockedWidthPx: number;
  floatingRightPx: number;
  floatingTopPx: number;
  floatingWidthPx: number;
};

type PlanQualityReviewPanelReferences = {
  setPanel: (panel: HTMLDivElement | null) => void;
};

type PlanQualityReviewPanelActions = {
  toggleCollapsed: () => void;
  activateIssue: (action: FloorPlanQualityAction, issue: FloorPlanQualityIssue) => void;
};

type PlanQualityReviewPanelProps = {
  state: PlanQualityReviewPanelState;
  configuration: PlanQualityReviewPanelConfiguration;
  references: PlanQualityReviewPanelReferences;
  actions: PlanQualityReviewPanelActions;
};

export function PlanQualityReviewPanel({
  state,
  configuration,
  references: { setPanel },
  actions,
}: PlanQualityReviewPanelProps) {
  const reviewPanel = (
    <div
      ref={setPanel}
      data-testid="plan-quality-review-panel"
      data-collapsed={state.collapsed ? "true" : "false"}
      className="pointer-events-auto z-30 hidden shrink-0 rounded-lg border border-neutral-200 bg-white/95 p-3 text-xs text-neutral-800 shadow-xl backdrop-blur md:block"
      style={
        configuration.portalTarget
          ? { position: "relative", width: `${configuration.dockedWidthPx}px` }
          : {
              position: "absolute",
              right: configuration.floatingRightPx,
              top: configuration.floatingTopPx,
              width: configuration.floatingWidthPx,
            }
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Plan review</div>
          {!state.collapsed ? (
            <div className="mt-0.5 text-neutral-500">
              {state.report.label} · {state.report.score}/100
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-neutral-100 px-2 py-1 font-semibold text-neutral-700">
            {state.report.issues.length}
          </span>
          <Button
            size="icon"
            data-testid="plan-quality-review-collapse"
            aria-expanded={!state.collapsed}
            aria-label={state.collapsed ? "Expand plan review" : "Collapse plan review"}
            title={state.collapsed ? "Expand" : "Collapse"}
            onClick={actions.toggleCollapsed}
          >
            {state.collapsed ? "+" : "-"}
          </Button>
        </div>
      </div>
      {!state.collapsed ? (
        <div className="mt-3 space-y-2">
          {state.report.issues.slice(0, 3).map((issue) => (
            <button
              key={issue.id}
              type="button"
              data-testid={`plan-quality-review-issue-${issue.id}`}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-left hover:bg-white"
              onClick={() => actions.activateIssue(issue.action, issue)}
            >
              <span className="block font-semibold">{issue.title}</span>
              <span className="mt-0.5 block text-neutral-500">{issue.detail}</span>
              <span className="mt-1 block text-neutral-600">{issue.suggestedFix}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return configuration.portalTarget
    ? createPortal(reviewPanel, configuration.portalTarget)
    : reviewPanel;
}
