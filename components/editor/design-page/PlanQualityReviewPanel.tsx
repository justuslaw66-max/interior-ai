"use client";

import { createPortal } from "react-dom";
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
  dark: boolean;
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
      className={
        configuration.dark
          ? "designer-dock pointer-events-auto z-30 hidden shrink-0 rounded-lg p-3 text-xs text-neutral-100 md:block"
          : "pointer-events-auto z-30 hidden shrink-0 rounded-lg border border-neutral-200 bg-white/95 p-3 text-xs text-neutral-800 shadow-xl backdrop-blur md:block"
      }
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
            <div className={configuration.dark ? "mt-0.5 text-neutral-400" : "mt-0.5 text-neutral-500"}>
              {state.report.label} · {state.report.score}/100
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={configuration.dark ? "rounded-full bg-white/10 px-2 py-1 font-semibold text-neutral-200" : "rounded-full bg-neutral-100 px-2 py-1 font-semibold text-neutral-700"}>
            {state.report.issues.length}
          </span>
          <button
            type="button"
            data-testid="plan-quality-review-collapse"
            aria-expanded={!state.collapsed}
            aria-label={state.collapsed ? "Expand plan review" : "Collapse plan review"}
            title={state.collapsed ? "Expand" : "Collapse"}
            className={
              configuration.dark
                ? "grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/5 text-[13px] font-semibold text-neutral-200 hover:bg-white/10"
                : "grid h-7 w-7 place-items-center rounded-full border border-neutral-200 bg-white text-[13px] font-semibold text-neutral-600 hover:bg-neutral-50"
            }
            onClick={actions.toggleCollapsed}
          >
            {state.collapsed ? "+" : "-"}
          </button>
        </div>
      </div>
      {!state.collapsed ? (
        <div className="mt-3 space-y-2">
          {state.report.issues.slice(0, 3).map((issue) => (
            <button
              key={issue.id}
              type="button"
              data-testid={`plan-quality-review-issue-${issue.id}`}
              className={
                configuration.dark
                  ? "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10"
                  : "w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-left hover:bg-white"
              }
              onClick={() => actions.activateIssue(issue.action, issue)}
            >
              <span className="block font-semibold">{issue.title}</span>
              <span className={configuration.dark ? "mt-0.5 block text-neutral-400" : "mt-0.5 block text-neutral-500"}>
                {issue.suggestedFix}
              </span>
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
