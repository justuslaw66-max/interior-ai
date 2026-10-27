"use client";

import type { generateCabinetDocumentation } from "../generateCabinetDocumentation";
import type {
  CabinetDefinition,
  CabinetValidationAutoFix,
  CabinetValidationIssue,
} from "../types";
import { CabinetContextualOnboarding } from "./CabinetContextualOnboarding";
import {
  ValidationFixPreview,
  ValidationIssueCard,
} from "./CabinetValidationFeedback";

type QuoteSummary = ReturnType<typeof generateCabinetDocumentation>["quoteSummary"];

export interface CabinetGuidedReviewPanelProps {
  showOnboarding: boolean;
  isProWorkspace: boolean;
  templateLabel: string;
  overallSizeLabel: string;
  moduleCount: number;
  finishLabel: string;
  quoteSummary: QuoteSummary;
  definition: CabinetDefinition;
  errors: readonly CabinetValidationIssue[];
  warnings: readonly CabinetValidationIssue[];
  issues: readonly CabinetValidationIssue[];
  bomCount: number;
  pendingValidationFix: {
    issue: CabinetValidationIssue;
    fix: CabinetValidationAutoFix;
    candidate: CabinetDefinition;
  } | null;
  onDismissOnboarding: () => void;
  onShowOnboarding: () => void;
  onFocusIssue: (issue: CabinetValidationIssue) => void;
  onRequestFix: (
    issue: CabinetValidationIssue,
    fix: CabinetValidationAutoFix
  ) => void;
  onCancelFix: () => void;
  onApplyFix: () => void;
}

export function CabinetGuidedReviewPanel({
  showOnboarding,
  isProWorkspace,
  templateLabel,
  overallSizeLabel,
  moduleCount,
  finishLabel,
  quoteSummary,
  definition,
  errors,
  warnings,
  issues,
  bomCount,
  pendingValidationFix,
  onDismissOnboarding,
  onShowOnboarding,
  onFocusIssue,
  onRequestFix,
  onCancelFix,
  onApplyFix,
}: CabinetGuidedReviewPanelProps) {
  const formatEstimate = (value: number) =>
    value.toLocaleString("en-US", {
      style: "currency",
      currency: quoteSummary.currency,
      maximumFractionDigits: 0,
    });

  return (
    <div className="grid gap-5" data-testid="cabinet-guided-review-panel">
      <CabinetContextualOnboarding
        step="review"
        visible={showOnboarding}
        onDismiss={onDismissOnboarding}
        onShow={onShowOnboarding}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Template", templateLabel],
          ["Overall size", overallSizeLabel],
          ["Layout", `${moduleCount} ${moduleCount === 1 ? "bay" : "bays"}`],
          ["Finish", finishLabel],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-box-border bg-surface-secondary p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-label-secondary">
              {label}
            </p>
            <p className="mt-2 text-sm font-semibold text-label">{value}</p>
          </div>
        ))}
      </div>

      {!isProWorkspace ? (
        <div
          data-testid="cabinet-consumer-estimate"
          data-currency={quoteSummary.currency}
          data-estimated-total={String(quoteSummary.estimatedTotal)}
          className="rounded-2xl border border-accent-tint-border bg-accent-tint p-5 text-on-accent-tint"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-on-accent-tint">
                Preliminary estimate
              </p>
              <p
                data-testid="cabinet-consumer-estimate-total"
                className="mt-1 text-3xl font-semibold tracking-tight"
              >
                {formatEstimate(quoteSummary.estimatedTotal)}
              </p>
            </div>
            <span className="rounded-full bg-surface-secondary/80 px-3 py-1 text-xs font-semibold text-on-accent-tint">
              Updates with your design
            </span>
          </div>
          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-4">
            {[
              ["Materials", quoteSummary.materialCost],
              ["Hardware", quoteSummary.hardwareCost],
              [
                "Build & installation",
                quoteSummary.fabricationCost + quoteSummary.installationAllowance,
              ],
              ["Planning allowance", quoteSummary.contingency],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-surface-secondary/75 p-3">
                <p className="text-on-accent-tint">{label}</p>
                <p className="mt-1 font-semibold text-on-accent-tint">
                  {formatEstimate(Number(value))}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-on-accent-tint">
            {quoteSummary.assumptions[0]} Final materials, site conditions,
            delivery, and local services can change the price.
          </p>
        </div>
      ) : null}

      <div
        className={`rounded-2xl border p-5 ${
          errors.length
            ? "border-danger-tint-border bg-danger-tint"
            : warnings.length
              ? "border-warning-tint-border bg-warning-tint"
              : "border-success-tint-border bg-success-tint"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3
              className={`text-base font-semibold ${
                errors.length
                  ? "text-on-danger-tint"
                  : warnings.length
                    ? "text-on-warning-tint"
                    : "text-on-success-tint"
              }`}
            >
              {errors.length
                ? `${errors.length} ${
                    errors.length === 1 ? "issue needs" : "issues need"
                  } attention`
                : warnings.length
                  ? "Ready with recommendations"
                  : "Ready to place"}
            </h3>
            <p
              className={`mt-1 text-sm ${
                errors.length
                  ? "text-on-danger-tint"
                  : warnings.length
                    ? "text-on-warning-tint"
                    : "text-on-success-tint"
              }`}
            >
              {errors.length
                ? isProWorkspace
                  ? "Open the affected step or Detailed editor to make the suggested correction."
                  : "Open the affected step or apply the suggested correction."
                : warnings.length
                  ? isProWorkspace
                    ? "The design is valid. Review these recommendations before fabrication."
                    : "The design is valid. Review these recommendations before placing it."
                  : isProWorkspace
                    ? "The geometry, materials, hardware, and project data are valid."
                    : "The size, layout, finish, and hardware are ready."}
            </p>
          </div>
          {isProWorkspace ? (
            <span className="shrink-0 rounded-full bg-surface-secondary/70 px-3 py-1 text-xs font-semibold">
              {bomCount} BOM rows
            </span>
          ) : null}
        </div>
        {issues.length ? (
          <div className="mt-4 grid gap-2">
            {issues.map((issue) => (
              <ValidationIssueCard
                key={issue.id}
                issue={issue}
                onFocus={onFocusIssue}
                onRequestFix={onRequestFix}
              />
            ))}
          </div>
        ) : null}
      </div>

      {pendingValidationFix ? (
        <ValidationFixPreview
          pending={pendingValidationFix}
          current={definition}
          onCancel={onCancelFix}
          onApply={onApplyFix}
        />
      ) : null}

      <div className="rounded-2xl border border-box-border bg-surface-secondary p-5">
        <h3 className="text-base font-semibold">What happens next</h3>
        <div className="mt-4 grid gap-3 text-sm text-label-secondary sm:grid-cols-3">
          <div className="rounded-xl bg-tile p-3">
            <span className="font-semibold text-label">1. Place</span>
            <br />
            Add this intelligent assembly to the current room.
          </div>
          <div className="rounded-xl bg-tile p-3">
            <span className="font-semibold text-label">2. Position</span>
            <br />
            Move, rotate, or snap the completed asset to a wall.
          </div>
          <div className="rounded-xl bg-tile p-3">
            <span className="font-semibold text-label">3. Reopen</span>
            <br />
            Edit it later without losing its plan position.
          </div>
        </div>
      </div>
    </div>
  );
}
