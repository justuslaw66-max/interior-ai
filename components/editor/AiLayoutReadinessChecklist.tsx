"use client";

import type { AiLayoutReadinessCheck } from "@/lib/ai-layout-readiness";

const READY_CLASS = "rounded-full bg-success-tint px-2 py-0.5 font-semibold text-on-success-tint";
const TODO_CLASS = "rounded-full bg-warning-tint px-2 py-0.5 font-semibold text-on-warning-tint";

function checkClass(ready: boolean) {
  return ready ? READY_CLASS : TODO_CLASS;
}

/** Suggest a layout's "Ready to generate" list (lib/ai-layout-readiness.ts). */
export function AiLayoutReadinessChecklist({ checks }: { checks: AiLayoutReadinessCheck[] }) {
  return (
    <div
      className="mt-4 rounded-xl border border-box-border bg-field p-3"
      data-testid="ai-layout-readiness"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-label-secondary">
        Ready to generate
      </div>
      <div className="mt-2 grid gap-2">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-control-label">{check.label}</span>
            <span className={checkClass(check.ready)}>{check.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
