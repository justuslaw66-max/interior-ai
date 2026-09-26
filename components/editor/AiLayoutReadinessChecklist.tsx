"use client";

import type { AiLayoutReadinessCheck } from "@/lib/ai-layout-readiness";

const READY_CLASS = "rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700";
const TODO_CLASS = "rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800";
const DARK_READY_CLASS = "rounded-full bg-emerald-500/20 px-2 py-0.5 font-semibold text-emerald-100";
const DARK_TODO_CLASS = "rounded-full bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-100";

function checkClass(dark: boolean, ready: boolean) {
  if (dark) return ready ? DARK_READY_CLASS : DARK_TODO_CLASS;
  return ready ? READY_CLASS : TODO_CLASS;
}

/** Suggest a layout's "Ready to generate" list (lib/ai-layout-readiness.ts). */
export function AiLayoutReadinessChecklist({ dark, checks }: { dark: boolean; checks: AiLayoutReadinessCheck[] }) {
  return (
    <div
      className={dark ? "designer-recessed mt-4 rounded-xl p-3" : "mt-4 rounded-xl border border-neutral-200 bg-white p-3"}
      data-testid="ai-layout-readiness"
    >
      <div className={dark ? "text-xs font-semibold uppercase tracking-wide text-neutral-400" : "text-xs font-semibold uppercase tracking-wide text-neutral-500"}>
        Ready to generate
      </div>
      <div className="mt-2 grid gap-2">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center justify-between gap-3 text-xs">
            <span className={dark ? "text-neutral-200" : "text-neutral-800"}>{check.label}</span>
            <span className={checkClass(dark, check.ready)}>{check.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
