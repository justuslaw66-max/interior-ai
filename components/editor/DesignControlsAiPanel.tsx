"use client";

import { useMemo, useState } from "react";
import { STYLES, type AiLayoutProposal, type Style } from "@/lib/design-page-types";

type Budget = "$" | "$$" | "$$$";

type DesignControlsAiPanelProps = {
  dark: boolean;
  style: Style;
  budget: Budget;
  aiLayoutProposal: AiLayoutProposal | null;
  onStyleChange: (style: Style) => void;
  onBudgetChange: (budget: Budget) => void;
  onRunAiLayout: () => void;
  onApplyAiLayoutProposal: () => void;
  onTryAiLayoutAgain: () => void;
  onClearAiLayoutProposal: () => void;
};

export default function DesignControlsAiPanel({
  dark,
  style,
  budget,
  aiLayoutProposal,
  onStyleChange,
  onBudgetChange,
  onRunAiLayout,
  onApplyAiLayoutProposal,
  onTryAiLayoutAgain,
  onClearAiLayoutProposal,
}: DesignControlsAiPanelProps) {
  const [aiMustHaves, setAiMustHaves] = useState<string[]>(["Sofa", "Rug", "Coffee table"]);
  const aiMustHaveOptions = useMemo(
    () => ["Sofa", "Rug", "Coffee table", "TV console", "Arm chair", "Lamp"],
    []
  );
  const titleClass = dark
    ? "designer-text-primary text-sm font-semibold"
    : "text-sm font-semibold text-neutral-800";
  const selectedButtonClass = dark ? "bg-[#1b2030] text-white" : "bg-neutral-900 text-white";
  const idleButtonClass = dark ? "bg-[#151820] text-neutral-200" : "bg-neutral-100 text-neutral-900";

  const toggleAiMustHave = (label: string) => {
    setAiMustHaves((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  };

  return (
    <div>
      <div
        className={
          dark
            ? "rounded-xl border border-white/10 bg-[#151820] p-4"
            : "rounded-xl border border-neutral-200 bg-neutral-50 p-4"
        }
      >
        <div className={titleClass}>AI Design Brief</div>
        <div className={dark ? "mt-1 text-xs text-neutral-400" : "mt-1 text-xs text-neutral-500"}>
          Generate a starter layout for the current room, then review and adjust it.
        </div>

        <div className={dark ? "mt-4 designer-text-primary text-sm font-semibold" : "mt-4 text-sm font-semibold text-neutral-800"}>
          Style
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {STYLES.map((candidate) => (
            <button
              key={candidate}
              className={`rounded-lg px-2 py-2 text-xs ${
                style === candidate ? selectedButtonClass : idleButtonClass
              }`}
              onClick={() => onStyleChange(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className={titleClass}>Budget</div>
          <div className="flex gap-2">
            {(["$", "$$", "$$$"] as const).map((candidate) => (
              <button
                key={candidate}
                className={`rounded-lg px-3 py-1 text-sm ${
                  budget === candidate ? selectedButtonClass : idleButtonClass
                }`}
                onClick={() => onBudgetChange(candidate)}
              >
                {candidate}
              </button>
            ))}
          </div>
        </div>

        <div className={dark ? "mt-4 designer-text-primary text-sm font-semibold" : "mt-4 text-sm font-semibold text-neutral-800"}>
          Must-have items
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {aiMustHaveOptions.map((label) => {
            const selected = aiMustHaves.includes(label);
            return (
              <button
                key={label}
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  selected ? selectedButtonClass : idleButtonClass
                }`}
                onClick={() => toggleAiMustHave(label)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <button
          className={
            dark
              ? "mt-4 w-full rounded-lg bg-[#1b2030] px-4 py-3 text-sm font-medium text-white"
              : "mt-4 w-full rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white"
          }
          onClick={onRunAiLayout}
        >
          {aiLayoutProposal ? "Generate another" : "Generate layout"}
        </button>
        <div className={dark ? "mt-2 text-xs text-neutral-400" : "mt-2 text-xs text-neutral-500"}>
          Review the result before saving, exporting, or shopping.
        </div>
      </div>

      {aiLayoutProposal && (
        <div
          className={
            dark
              ? "mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4"
              : "mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
          }
        >
          <div className={dark ? "text-sm font-semibold text-emerald-100" : "text-sm font-semibold text-emerald-900"}>
            Layout proposal ready
          </div>
          <div className={dark ? "mt-1 text-xs text-emerald-100/80" : "mt-1 text-xs text-emerald-800"}>
            {aiLayoutProposal.sourceLabel}
            {aiLayoutProposal.fitRisk ? ` • Fit risk: ${aiLayoutProposal.fitRisk}` : ""}
          </div>

          <ul className={dark ? "mt-3 space-y-1 text-xs text-neutral-200" : "mt-3 space-y-1 text-xs text-neutral-700"}>
            {aiLayoutProposal.itemNames.slice(0, 5).map((name) => (
              <li key={name} className="truncate">
                {name}
              </li>
            ))}
            {aiLayoutProposal.itemNames.length > 5 && (
              <li>
                +{aiLayoutProposal.itemNames.length - 5} more item
                {aiLayoutProposal.itemNames.length - 5 === 1 ? "" : "s"}
              </li>
            )}
          </ul>

          {aiLayoutProposal.warnings.length > 0 && (
            <div className={dark ? "mt-3 rounded-lg bg-black/20 p-2 text-xs text-amber-100" : "mt-3 rounded-lg bg-white/80 p-2 text-xs text-amber-800"}>
              {aiLayoutProposal.warnings[0]}
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={dark ? "rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white" : "rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"}
              onClick={onApplyAiLayoutProposal}
            >
              Apply layout
            </button>
            <button
              type="button"
              className={dark ? "rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-neutral-100" : "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-800"}
              onClick={onTryAiLayoutAgain}
            >
              Try again
            </button>
          </div>
          <button
            type="button"
            className={dark ? "mt-2 text-xs font-semibold text-neutral-300" : "mt-2 text-xs font-semibold text-neutral-600"}
            onClick={onClearAiLayoutProposal}
          >
            Dismiss proposal
          </button>
        </div>
      )}
    </div>
  );
}
