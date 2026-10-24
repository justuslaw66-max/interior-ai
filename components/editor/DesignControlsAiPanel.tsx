"use client";

import { useMemo, useState } from "react";
import type { AiLayoutRole } from "@/lib/ai/layout-planner";
import { GUEST_AI_LAYOUT_OPENER_ID } from "@/lib/guest-save-prompt";
import { STYLES, type AiLayoutProposal, type Style } from "@/lib/design-page-types";
import type { RoomType } from "@/lib/room-types";
import { formatDisplayArea, type DisplayUnit } from "@/lib/display-units";
import { formatPlanDimensionsLabel } from "@/lib/plan-room-summary";
import { aiLayoutReadinessChecks } from "@/lib/ai-layout-readiness";
import { AiLayoutReadinessChecklist } from "./AiLayoutReadinessChecklist";
import { AiLayoutRoomLimit } from "./AiLayoutRoomLimit";
import { Button } from "@/components/ui/Button";
import { ChoiceTile } from "@/components/ui/ChoiceTile";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

type Budget = "$" | "$$" | "$$$";
type AiLayoutGoal = "balanced" | "conversation" | "media" | "compact";

type DesignControlsAiPanelProps = {
  style: Style;
  budget: Budget;
  activeRoomName: string;
  activeRoomType: RoomType;
  activeRoomTypeLabel: string;
  roomWidth: number;
  roomDepth: number;
  /** The active room's polygon-aware floor area (lib/room-floor-area). */
  roomFloorAreaSqm: number;
  measurementUnit: DisplayUnit;
  /** The first visit's room, untouched: its size is the default one (FR2). */
  roomIsDraft?: boolean;
  activeRoomItemCount: number;
  aiLayoutProposal: AiLayoutProposal | null;
  onStyleChange: (style: Style) => void;
  onBudgetChange: (budget: Budget) => void;
  onRunAiLayout: (requestedRoles?: AiLayoutRole[]) => void;
  onApplyAiLayoutProposal: () => void;
  onTryAiLayoutAgain: (requestedRoles?: AiLayoutRole[]) => void;
  onClearAiLayoutProposal: () => void;
};

const BUDGET_OPTIONS: ReadonlyArray<{ value: Budget; label: string }> = [
  { value: "$", label: "$" },
  { value: "$$", label: "$$" },
  { value: "$$$", label: "$$$" },
];

const AI_MUST_HAVE_OPTIONS: Array<{ label: string; role: AiLayoutRole }> = [
  { label: "Sofa", role: "sofa" },
  { label: "Rug", role: "rug" },
  { label: "Coffee table", role: "coffee_table" },
  { label: "TV console", role: "tv_console" },
  { label: "Arm chair", role: "accent_chair" },
  { label: "Lamp", role: "floor_lamp" },
];

const AI_ROLE_LABELS: Record<AiLayoutRole, string> = AI_MUST_HAVE_OPTIONS.reduce(
  (labels, option) => ({ ...labels, [option.role]: option.label }),
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
  style,
  budget,
  activeRoomName,
  activeRoomType,
  activeRoomTypeLabel,
  roomWidth,
  roomDepth,
  roomFloorAreaSqm: roomArea,
  measurementUnit, roomIsDraft = false,
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
  const titleClass = "text-sm font-semibold text-control-label";
  const cardClass = "rounded-xl border border-box-border bg-surface-secondary p-3";
  const mutedClass = "text-label-secondary";
  const roomSizeLabel = formatPlanDimensionsLabel(roomWidth, roomDepth, measurementUnit);
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
  const readinessChecks = aiLayoutReadinessChecks({
    roomSupported, roomArea, roomIsDraft, mustHaveCount: aiMustHaves.length, measurementUnit,
  });
  const roomSummary = `${activeRoomTypeLabel} · ${roomSizeLabel} · ${formatDisplayArea(roomArea, measurementUnit)}`;
  // ST14: in a room it can't lay out yet, the limit comes first, with no brief to fill in.
  if (!roomSupported) return <AiLayoutRoomLimit roomName={activeRoomName} roomSummary={roomSummary} />;

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
      <div className="rounded-xl border border-box-border bg-tile p-4">
        <div className={titleClass}>Layout brief</div>
        <div className="mt-1 text-xs text-label-secondary">
          Set the goal, style, budget, and must-haves for the current room.
        </div>

        <div className={`mt-4 ${cardClass}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-label">
                {activeRoomName}
              </div>
              <div className={`mt-1 text-xs ${mutedClass}`}>{roomSummary}</div>
            </div>
            <div className="shrink-0 rounded-lg bg-control-track px-2 py-1 text-xs text-control-label-idle">
              {activeRoomItemCount} placed
            </div>
          </div>
          <div className={`mt-3 grid grid-cols-3 gap-2 text-center text-xs ${mutedClass}`}>
            <div>
              <div className="text-sm font-semibold text-label">
                {style}
              </div>
              <div>Style</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-label">
                {budget}
              </div>
              <div>Budget</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-label">
                {aiMustHaves.length}
              </div>
              <div>Must-haves</div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-label-secondary">
          Step 1 · Room goal
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2" data-testid="ai-layout-goals">
          {AI_LAYOUT_GOALS.map((goal) => {
            const selected = goal.id === aiLayoutGoal;
            return (
              <ChoiceTile
                key={goal.id}
                selected={selected}
                data-testid={`ai-layout-goal-${goal.id}`}
                data-active={selected ? "true" : "false"}
                className="px-3 py-2 text-left"
                onClick={() => applyAiLayoutGoal(goal)}
              >
                <span className="block text-xs font-semibold">{goal.label}</span>
                <span className="mt-1 block text-xs text-label-secondary">
                  {goal.description}
                </span>
              </ChoiceTile>
            );
          })}
        </div>
        <div className={`mt-2 text-xs ${mutedClass}`}>
          Goal: {selectedGoal.label}
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-label-secondary">
          Step 2 · Style
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {STYLES.map((candidate) => (
            <ChoiceTile
              key={candidate}
              selected={style === candidate}
              className="px-2 py-2 text-xs font-semibold"
              onClick={() => onStyleChange(candidate)}
            >
              {candidate}
            </ChoiceTile>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-label-secondary">
            Step 3 · Budget
          </div>
          <SegmentedControl label="Budget" size="compact" value={budget} onChange={onBudgetChange} options={BUDGET_OPTIONS} />
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-label-secondary">
          Step 4 · Must-have items
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {aiMustHaveOptions.map((option) => {
            const selected = aiMustHaves.includes(option.label);
            return (
              <Button
                key={option.role}
                size="compact"
                pressed={selected}
                onClick={() => toggleAiMustHave(option.label)}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
        <div className={`mt-2 text-xs ${mutedClass}`}>
          Selected: {aiMustHaves.length > 0 ? aiMustHaves.join(", ") : "Choose at least one item"}
        </div>

        <AiLayoutReadinessChecklist checks={readinessChecks} />
        <Button
          id={GUEST_AI_LAYOUT_OPENER_ID}
          variant="primary" size="touch" className="mt-4 w-full"
          disabled={!briefReady}
          onClick={() => onRunAiLayout(requestedRoles)}
        >
          {aiLayoutProposal ? "Suggest another" : "Suggest a layout"}
        </Button>
        <div className="mt-2 text-xs text-label-secondary">
          {briefReady
            ? "Review the result before saving, exporting, or shopping."
            : "Add room dimensions and at least one must-have before generating."}
        </div>
      </div>
      {aiLayoutProposal && (
        <div className="mt-3 rounded-xl border border-success-tint-border bg-success-tint p-4">
          <div className="text-sm font-semibold text-on-success-tint">
            Layout proposal ready
          </div>
          <div className="mt-1 text-xs text-on-success-tint">
            {aiLayoutProposal.sourceLabel}
            {aiLayoutProposal.fitRisk ? ` • Fit risk: ${aiLayoutProposal.fitRisk}` : ""}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-on-success-tint">
            <div className="rounded-lg bg-surface-secondary/80 p-2">
              <div className="text-sm font-semibold">{aiLayoutProposal.itemNames.length}</div>
              <div>Items</div>
            </div>
            <div className="rounded-lg bg-surface-secondary/80 p-2">
              <div className="text-sm font-semibold">{aiLayoutProposal.warnings.length}</div>
              <div>Warnings</div>
            </div>
            <div className="rounded-lg bg-surface-secondary/80 p-2">
              <div className="truncate text-sm font-semibold">{aiLayoutProposal.fitRisk ?? "Clear"}</div>
              <div>Fit</div>
            </div>
          </div>
          {proposalRequestedRoles.length > 0 ? (
            <div className="mt-3 rounded-lg bg-surface-secondary/80 p-2 text-xs text-on-success-tint">
              <div className="font-semibold">
                Brief match: {proposalMatchedCount}/{proposalRequestedRoles.length}
              </div>
              <div className="mt-1 text-on-success-tint">
                {proposalMissingRoles.length > 0
                  ? `Missing: ${proposalMissingRoles.map((role) => AI_ROLE_LABELS[role]).join(", ")}`
                  : "All requested must-haves are included."}
              </div>
            </div>
          ) : null}

          <div className="mt-3 rounded-lg bg-surface-secondary/80 p-2 text-xs text-on-success-tint">
            <div className="font-semibold">Shown on canvas</div>
            <div className="mt-1 text-on-success-tint">
              The translucent footprints show the proposal before it replaces the current room layout. You can still undo after applying.
            </div>
          </div>

          <ul className="mt-3 space-y-1 text-xs text-control-label-idle">
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
            <div className="mt-3 rounded-lg bg-surface-secondary/80 p-2 text-xs text-on-warning-tint">
              {aiLayoutProposal.warnings[0]}
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              variant="primary" size="regular"
              onClick={onApplyAiLayoutProposal}
            >
              Apply layout
            </Button>
            <Button
              variant="secondary" size="regular"
              onClick={() => onTryAiLayoutAgain(requestedRoles)}
            >
              Try again
            </Button>
          </div>
          <Button
            variant="quiet" size="compact" className="mt-2"
            onClick={onClearAiLayoutProposal}
          >
            Dismiss proposal
          </Button>
        </div>
      )}
    </div>
  );
}
