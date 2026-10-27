import { Button } from "@/components/ui/Button";
import {
  formatCabinetMeasurement,
  formatCabinetMeasurementTokens,
} from "../measurementUnits";
import type {
  CabinetDefinition,
  CabinetValidationAutoFix,
  CabinetValidationIssue,
} from "../types";
import { validateCabinetDefinition } from "../validation";
import { useCabinetMeasurementUnit } from "./CabinetMeasurementUnitContext";

export function ValidationIssueCard({
  issue,
  onFocus,
  onRequestFix,
}: {
  issue: CabinetValidationIssue;
  onFocus: (issue: CabinetValidationIssue) => void;
  onRequestFix: (issue: CabinetValidationIssue, fix: CabinetValidationAutoFix) => void;
}) {
  const measurementUnit = useCabinetMeasurementUnit();
  const formatFeedback = (message: string) =>
    formatCabinetMeasurementTokens(message, measurementUnit);
  const tone =
    issue.severity === "error"
      ? "border-danger-tint-border bg-danger-tint text-on-danger-tint"
      : issue.severity === "warning"
        ? "border-warning-tint-border bg-warning-tint text-on-warning-tint"
        : "border-accent-tint-border bg-accent-tint text-on-accent-tint";
  const testId =
    issue.severity === "error"
      ? "cabinet-validation-error"
      : issue.severity === "warning"
        ? "cabinet-validation-warning"
        : "cabinet-validation-info";

  return (
    <div
      data-testid={testId}
      data-validation-code={issue.code}
      data-validation-scope={issue.target.scope}
      className={`rounded-xl border p-3 text-xs ${tone}`}
    >
      <button
        type="button"
        className="block w-full text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2"
        onClick={() => onFocus(issue)}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-surface-secondary/80 px-2 py-0.5 text-xs font-bold uppercase tracking-wide">
            {issue.severity}
          </span>
          <span className="font-semibold">{formatFeedback(issue.title)}</span>
          <span className="rounded-full bg-surface-secondary/80 px-2 py-0.5 text-xs font-bold uppercase tracking-wide">
            {issue.target.scope}
          </span>
          {issue.target.moduleIds?.length ? (
            <span className="rounded-full bg-surface-secondary/80 px-2 py-0.5 text-xs font-medium">
              {issue.target.moduleIds.length === 1
                ? issue.target.moduleIds[0]
                : `${issue.target.moduleIds.length} modules`}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block leading-5 opacity-90">{formatFeedback(issue.message)}</span>
        <span className="mt-1 block font-medium leading-5">
          {formatFeedback(issue.resolution)}
        </span>
      </button>
      {issue.fixes?.length ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-current/10 pt-3">
          {issue.fixes.map((fix) => (
            <Button
              key={fix.id}
              data-testid="cabinet-validation-fix"
              data-validation-fix-id={fix.id}
              size="compact"
              onClick={() => onRequestFix(issue, fix)}
            >
              {formatFeedback(fix.label)}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ModuleIssueBadges({ issues }: { issues: CabinetValidationIssue[] }) {
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  if (!errorCount && !warningCount) return null;

  return (
    <span
      className="ml-auto flex shrink-0 items-center gap-1"
      aria-label={`${errorCount} errors and ${warningCount} warnings`}
    >
      {errorCount ? (
        <span className="rounded-full bg-danger-tint px-1.5 py-0.5 text-xs font-bold text-on-danger-tint">
          {errorCount}E
        </span>
      ) : null}
      {warningCount ? (
        <span className="rounded-full bg-warning-tint px-1.5 py-0.5 text-xs font-bold text-on-warning-tint">
          {warningCount}W
        </span>
      ) : null}
    </span>
  );
}

export function ValidationFixPreview({
  pending,
  current,
  onCancel,
  onApply,
}: {
  pending: {
    issue: CabinetValidationIssue;
    fix: CabinetValidationAutoFix;
    candidate: CabinetDefinition;
  };
  current: CabinetDefinition;
  onCancel: () => void;
  onApply: () => void;
}) {
  const measurementUnit = useCabinetMeasurementUnit();
  const formatMeasurement = (valueMm: number) =>
    formatCabinetMeasurement(valueMm, measurementUnit, {
      includeMillimetreReference: measurementUnit !== "mm",
    });
  const formatFeedback = (message: string) =>
    formatCabinetMeasurementTokens(message, measurementUnit);
  const candidateValidation = validateCabinetDefinition(pending.candidate);
  const candidateErrorCount = candidateValidation.issues.filter(
    (issue) => issue.severity === "error"
  ).length;
  const candidateWarningCount = candidateValidation.issues.filter(
    (issue) => issue.severity === "warning"
  ).length;

  return (
    <div
      role="dialog"
      aria-label={`Preview fix: ${formatFeedback(pending.fix.label)}`}
      data-testid="cabinet-fix-preview"
      className="rounded-2xl border border-accent-tint-border bg-accent-tint p-4 text-on-accent-tint shadow-sm"
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-on-accent-tint">
        Preview change
      </p>
      <h4 className="mt-1 text-sm font-semibold">{formatFeedback(pending.fix.label)}</h4>
      <p className="mt-1 text-xs leading-5 text-on-accent-tint">
        {formatFeedback(pending.fix.description)}
      </p>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl bg-surface-secondary/80 p-3">
          <span className="font-semibold">Before</span>
          <span className="mt-1 block">
            {formatMeasurement(current.totalWidth)} × {formatMeasurement(current.height)} ×{" "}
            {formatMeasurement(current.depth)} · {current.modules.length}{" "}
            {current.modules.length === 1 ? "module" : "modules"}
          </span>
        </div>
        <div className="rounded-xl bg-surface-secondary/80 p-3">
          <span className="font-semibold">After</span>
          <span className="mt-1 block">
            {formatMeasurement(pending.candidate.totalWidth)} ×{" "}
            {formatMeasurement(pending.candidate.height)} ×{" "}
            {formatMeasurement(pending.candidate.depth)} · {pending.candidate.modules.length}{" "}
            {pending.candidate.modules.length === 1 ? "module" : "modules"}
          </span>
          <span className="mt-1 block text-on-accent-tint">
            {candidateErrorCount} errors · {candidateWarningCount} recommendations
          </span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          data-testid="cabinet-fix-preview-cancel"
          size="compact"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          data-testid="cabinet-fix-preview-apply"
          variant="primary" size="compact"
          onClick={onApply}
        >
          Apply change
        </Button>
      </div>
    </div>
  );
}
