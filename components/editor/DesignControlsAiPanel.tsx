"use client";

import { useMemo, useState } from "react";
import type { AiLayoutRole } from "@/lib/ai/layout-planner";
import { GUEST_AI_LAYOUT_OPENER_ID } from "@/lib/guest-save-prompt";
import { STYLES, type AiLayoutProposal, type Style } from "@/lib/design-page-types";
import type { RoomType } from "@/lib/room-types";

type Budget = "$" | "$$" | "$$$";
type AiLayoutGoal = "balanced" | "conversation" | "media" | "compact";

type DesignControlsAiPanelProps = {
  dark: boolean;
  style: Style;
  budget: Budget;
  activeRoomName: string;
  activeRoomType: RoomType;
  activeRoomTypeLabel: string;
  roomWidth: number;
  roomDepth: number;
  activeRoomItemCount: number;
  aiLayoutProposal: AiLayoutProposal | null;
  onStyleChange: (style: Style) => void;
  onBudgetChange: (budget: Budget) => void;
  onRunAiLayout: (requestedRoles?: AiLayoutRole[]) => void;
  onApplyAiLayoutProposal: () => void;
  onTryAiLayoutAgain: (requestedRoles?: AiLayoutRole[]) => void;
  onClearAiLayoutProposal: () => void;
};

const AI_MUST_HAVE_OPTIONS: Array<{ label: string; role: AiLayoutRole }> = [
  { label: "Sofa", role: "sofa" },
  { label: "Rug", role: "rug" },
  { label: "Coffee table", role: "coffee_table" },
  { label: "TV console", role: "tv_console" },
  { label: "Arm chair", role: "accent_chair" },
  { label: "Lamp", role: "floor_lamp" },
];

const AI_ROLE_LABELS: Record<AiLayoutRole, string> = AI_MUST_HAVE_OPTIONS.reduce(
  (labels, option) => ({
    ...labels,
    [option.role]: option.label,
  }),
  {} as Record<AiLayoutRole, string>
);

const AI_LAYOUT_GOALS: Array<{
  id: AiLayoutGoal;
  label: string;
  description: string;
  roles: AiLayoutRole[];
}> = [
  {
    id: "balanced",
    label: "Balanced room",
    description: "Starter seating, surface, and soft zone.",
    roles: ["sofa", "rug", "coffee_table"],
  },
  {
    id: "conversation",
    label: "Conversation",
    description: "More seating around a central table.",
    roles: ["sofa", "accent_chair", "coffee_table", "rug"],
  },
  {
    id: "media",
    label: "TV lounge",
    description: "Sofa, table, rug, and media wall.",
    roles: ["sofa", "coffee_table", "rug", "tv_console"],
  },
  {
    id: "compact",
    label: "Small space",
    description: "Lean essentials with fewer pieces.",
    roles: ["sofa", "coffee_table"],
  },
];

export default function DesignControlsAiPanel({
  dark,
  style,
  budget,
  activeRoomName,
  activeRoomType,
  activeRoomTypeLabel,
  roomWidth,
  roomDepth,
  activeRoomItemCount,
  aiLayoutProposal,
  onStyleChange,
  onBudgetChange,
  onRunAiLayout,
  onApplyAiLayoutProposal,
  onTryAiLayoutAgain,
  onClearAiLayoutProposal,
}: DesignControlsAiPanelProps) {
  const [aiMustHaves, setAiMustHaves] = useState<string[]>(["Sofa", "Rug", "Coffee table"]);
  const [aiLayoutGoal, setAiLayoutGoal] = useState<AiLayoutGoal>("balanced");
  const aiMustHaveOptions = useMemo(() => AI_MUST_HAVE_OPTIONS, []);
  const titleClass = dark
    ? "designer-text-primary text-sm font-semibold"
    : "text-sm font-semibold text-neutral-800";
  const selectedButtonClass = dark ? "designer-control-active border" : "bg-neutral-900 text-white";
  const idleButtonClass = dark ? "designer-control border" : "bg-neutral-100 text-neutral-900";
  const cardClass = dark
    ? "designer-recessed rounded-xl p-3"
    : "rounded-xl border border-neutral-200 bg-white p-3";
  const mutedClass = dark ? "text-neutral-400" : "text-neutral-500";
  const roomArea = Math.max(0, roomWidth * roomDepth);
  const roomSizeLabel = `${roomWidth.toFixed(1)} x ${roomDepth.toFixed(1)}m`;
  const roomSupported = activeRoomType === "living";
  const briefReady = aiMustHaves.length > 0 && roomArea > 0 && roomSupported;
  const requestedRoles = useMemo(
    () =>
      aiMustHaveOptions
        .filter((option) => aiMustHaves.includes(option.label))
        .map((option) => option.role),
    [aiMustHaveOptions, aiMustHaves]
  );
  const proposalRequestedRoles = aiLayoutProposal?.requestedRoles ?? [];
  const proposalMissingRoles = aiLayoutProposal?.missingRoles ?? [];
  const proposalMatchedCount = Math.max(
    0,
    proposalRequestedRoles.length - proposalMissingRoles.length
  );
  const selectedGoal = AI_LAYOUT_GOALS.find((goal) => goal.id === aiLayoutGoal) ?? AI_LAYOUT_GOALS[0];
  const readinessChecks = [
    {
      label: "Living room",
      ready: roomSupported,
      detail: roomSupported ? "Supported" : "Living rooms first",
    },
    {
      label: "Measured room",
      ready: roomArea > 0,
      detail: roomArea > 0 ? `${roomArea.toFixed(1)} m2` : "Add dimensions",
    },
    {
      label: "Must-haves",
      ready: aiMustHaves.length > 0,
      detail: aiMustHaves.length > 0 ? `${aiMustHaves.length} selected` : "Pick at least one",
    },
  ];

  const toggleAiMustHave = (label: string) => {
    setAiMustHaves((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  };

  const applyAiLayoutGoal = (goal: (typeof AI_LAYOUT_GOALS)[number]) => {
    setAiLayoutGoal(goal.id);
    setAiMustHaves(
      aiMustHaveOptions
        .filter((option) => goal.roles.includes(option.role))
        .map((option) => option.label)
    );
  };

  return (
    <div>
      <div
        className={
          dark
            ? "designer-dock rounded-xl p-4"
            : "rounded-xl border border-neutral-200 bg-neutral-50 p-4"
        }
      >
        <div className={titleClass}>AI Design Brief</div>
        <div className={dark ? "mt-1 text-xs text-neutral-400" : "mt-1 text-xs text-neutral-500"}>
          Generate a starter layout for the current room, then review and adjust it.
        </div>

        <div className={`mt-4 ${cardClass}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={dark ? "truncate text-sm font-semibold text-neutral-100" : "truncate text-sm font-semibold text-neutral-900"}>
                {activeRoomName}
              </div>
              <div className={`mt-1 text-xs ${mutedClass}`}>
                {activeRoomTypeLabel} · {roomSizeLabel} · {roomArea.toFixed(1)} m2
              </div>
            </div>
            <div className={dark ? "shrink-0 rounded-lg bg-white/10 px-2 py-1 text-xs text-neutral-200" : "shrink-0 rounded-lg bg-neutral-100 px-2 py-1 text-xs text-neutral-700"}>
              {activeRoomItemCount} placed
            </div>
          </div>
          <div
            className={
              roomSupported
                ? dark
                  ? "mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100"
                  : "mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
                : dark
                  ? "mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100"
                  : "mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
            }
          >
            {roomSupported
              ? "AI layout ready for this room"
              : "AI layout supports living rooms first"}
          </div>
          <div className={`mt-3 grid grid-cols-3 gap-2 text-center text-xs ${mutedClass}`}>
            <div>
              <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-900"}>
                {style}
              </div>
              <div>Style</div>
            </div>
            <div>
              <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-900"}>
                {budget}
              </div>
              <div>Budget</div>
            </div>
            <div>
              <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-900"}>
                {aiMustHaves.length}
              </div>
              <div>Must-haves</div>
            </div>
          </div>
        </div>

        <div className={dark ? "mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-400" : "mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500"}>
          Step 1 · Room goal
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2" data-testid="ai-layout-goals">
          {AI_LAYOUT_GOALS.map((goal) => {
            const selected = goal.id === aiLayoutGoal;
            return (
              <button
                key={goal.id}
                type="button"
                data-testid={`ai-layout-goal-${goal.id}`}
                data-active={selected ? "true" : "false"}
                className={[
                  "rounded-xl border px-3 py-2 text-left transition",
                  selected
                    ? dark
                      ? "border-emerald-300 bg-emerald-500/20 text-emerald-50"
                      : "border-emerald-500 bg-emerald-50 text-emerald-950"
                    : dark
                      ? "designer-control border text-neutral-200"
                      : "border-neutral-200 bg-white text-neutral-800",
                ].join(" ")}
                onClick={() => applyAiLayoutGoal(goal)}
              >
                <span className="block text-xs font-semibold">{goal.label}</span>
                <span className={dark ? "mt-1 block text-[11px] text-neutral-400" : "mt-1 block text-[11px] text-neutral-500"}>
                  {goal.description}
                </span>
              </button>
            );
          })}
        </div>
        <div className={`mt-2 text-xs ${mutedClass}`}>
          Goal: {selectedGoal.label}
        </div>

        <div className={dark ? "mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-400" : "mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500"}>
          Step 2 · Style
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
          <div className={dark ? "text-xs font-semibold uppercase tracking-wide text-neutral-400" : "text-xs font-semibold uppercase tracking-wide text-neutral-500"}>
            Step 3 · Budget
          </div>
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

        <div className={dark ? "mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-400" : "mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500"}>
          Step 4 · Must-have items
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {aiMustHaveOptions.map((option) => {
            const selected = aiMustHaves.includes(option.label);
            return (
              <button
                key={option.role}
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  selected ? selectedButtonClass : idleButtonClass
                }`}
                onClick={() => toggleAiMustHave(option.label)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className={`mt-2 text-xs ${mutedClass}`}>
          Selected: {aiMustHaves.length > 0 ? aiMustHaves.join(", ") : "Choose at least one item"}
        </div>

        <div
          className={dark ? "designer-recessed mt-4 rounded-xl p-3" : "mt-4 rounded-xl border border-neutral-200 bg-white p-3"}
          data-testid="ai-layout-readiness"
        >
          <div className={dark ? "text-xs font-semibold uppercase tracking-wide text-neutral-400" : "text-xs font-semibold uppercase tracking-wide text-neutral-500"}>
            Ready to generate
          </div>
          <div className="mt-2 grid gap-2">
            {readinessChecks.map((check) => (
              <div key={check.label} className="flex items-center justify-between gap-3 text-xs">
                <span className={dark ? "text-neutral-200" : "text-neutral-800"}>{check.label}</span>
                <span
                  className={
                    check.ready
                      ? dark
                        ? "rounded-full bg-emerald-500/20 px-2 py-0.5 font-semibold text-emerald-100"
                        : "rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700"
                      : dark
                        ? "rounded-full bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-100"
                        : "rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800"
                  }
                >
                  {check.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
        <button id={GUEST_AI_LAYOUT_OPENER_ID}
          className={
            dark
              ? "designer-control-active mt-4 w-full rounded-lg border px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              : "mt-4 w-full rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          }
          disabled={!briefReady}
          onClick={() => onRunAiLayout(requestedRoles)}
        >
          {aiLayoutProposal ? "Generate another" : "Generate layout"}
        </button>
        <div className={dark ? "mt-2 text-xs text-neutral-400" : "mt-2 text-xs text-neutral-500"}>
          {briefReady
            ? "Review the result before saving, exporting, or shopping."
            : roomSupported
              ? "Add room dimensions and at least one must-have before generating."
              : "Switch to a living room to generate an AI starter layout."}
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
          <div className={dark ? "mt-3 grid grid-cols-3 gap-2 text-center text-xs text-emerald-100" : "mt-3 grid grid-cols-3 gap-2 text-center text-xs text-emerald-900"}>
            <div className={dark ? "rounded-lg bg-black/20 p-2" : "rounded-lg bg-white/80 p-2"}>
              <div className="text-sm font-semibold">{aiLayoutProposal.itemNames.length}</div>
              <div>Items</div>
            </div>
            <div className={dark ? "rounded-lg bg-black/20 p-2" : "rounded-lg bg-white/80 p-2"}>
              <div className="text-sm font-semibold">{aiLayoutProposal.warnings.length}</div>
              <div>Warnings</div>
            </div>
            <div className={dark ? "rounded-lg bg-black/20 p-2" : "rounded-lg bg-white/80 p-2"}>
              <div className="truncate text-sm font-semibold">{aiLayoutProposal.fitRisk ?? "Clear"}</div>
              <div>Fit</div>
            </div>
          </div>
          {proposalRequestedRoles.length > 0 ? (
            <div className={dark ? "mt-3 rounded-lg bg-black/20 p-2 text-xs text-emerald-100" : "mt-3 rounded-lg bg-white/80 p-2 text-xs text-emerald-900"}>
              <div className="font-semibold">
                Brief match: {proposalMatchedCount}/{proposalRequestedRoles.length}
              </div>
              <div className={dark ? "mt-1 text-emerald-100/80" : "mt-1 text-emerald-800"}>
                {proposalMissingRoles.length > 0
                  ? `Missing: ${proposalMissingRoles.map((role) => AI_ROLE_LABELS[role]).join(", ")}`
                  : "All requested must-haves are included."}
              </div>
            </div>
          ) : null}

          <div className={dark ? "mt-3 rounded-lg bg-black/20 p-2 text-xs text-emerald-100" : "mt-3 rounded-lg bg-white/80 p-2 text-xs text-emerald-900"}>
            <div className="font-semibold">Shown on canvas</div>
            <div className={dark ? "mt-1 text-emerald-100/80" : "mt-1 text-emerald-800"}>
              The translucent footprints show the proposal before it replaces the current room layout. You can still undo after applying.
            </div>
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
              onClick={() => onTryAiLayoutAgain(requestedRoles)}
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
