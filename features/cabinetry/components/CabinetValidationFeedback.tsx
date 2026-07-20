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
      ? "border-red-200 bg-red-50 text-red-950"
      : issue.severity === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-blue-200 bg-blue-50 text-blue-950";
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
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2"
        onClick={() => onFocus(issue)}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            {issue.severity}
          </span>
          <span className="font-semibold">{formatFeedback(issue.title)}</span>
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            {issue.target.scope}
          </span>
          {issue.target.moduleIds?.length ? (
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium">
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
            <button
              key={fix.id}
              type="button"
              data-testid="cabinet-validation-fix"
              data-validation-fix-id={fix.id}
              className="rounded-lg bg-white px-2.5 py-1.5 font-semibold text-neutral-900 shadow-sm ring-1 ring-black/10 hover:bg-neutral-50"
              onClick={() => onRequestFix(issue, fix)}
            >
              {formatFeedback(fix.label)}
            </button>
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
        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">
          {errorCount}E
        </span>
      ) : null}
      {warningCount ? (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
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
      className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950 shadow-sm"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">
        Preview change
      </p>
      <h4 className="mt-1 text-sm font-semibold">{formatFeedback(pending.fix.label)}</h4>
      <p className="mt-1 text-xs leading-5 text-blue-900">
        {formatFeedback(pending.fix.description)}
      </p>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl bg-white/70 p-3">
          <span className="font-semibold">Before</span>
          <span className="mt-1 block">
            {formatMeasurement(current.totalWidth)} × {formatMeasurement(current.height)} ×{" "}
            {formatMeasurement(current.depth)} · {current.modules.length}{" "}
            {current.modules.length === 1 ? "module" : "modules"}
          </span>
        </div>
        <div className="rounded-xl bg-white/70 p-3">
          <span className="font-semibold">After</span>
          <span className="mt-1 block">
            {formatMeasurement(pending.candidate.totalWidth)} ×{" "}
            {formatMeasurement(pending.candidate.height)} ×{" "}
            {formatMeasurement(pending.candidate.depth)} · {pending.candidate.modules.length}{" "}
            {pending.candidate.modules.length === 1 ? "module" : "modules"}
          </span>
          <span className="mt-1 block text-blue-700">
            {candidateErrorCount} errors · {candidateWarningCount} recommendations
          </span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          data-testid="cabinet-fix-preview-cancel"
          className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="cabinet-fix-preview-apply"
          className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          onClick={onApply}
        >
          Apply change
        </button>
      </div>
    </div>
  );
}
