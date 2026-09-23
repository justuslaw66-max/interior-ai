"use client";

import { useMemo } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  inspectFloorPlanOptionalConfigurations,
  type FloorPlanAuthoredConfigurationGroup,
  type FloorPlanAuthoredConfigurationVariant,
} from "@/lib/floor-plan-optional-configurations";
import type { PublicFloorPlanAuthoredVariantGroup } from "@/lib/floor-plan-authored-variant-links";

type FloorPlanOptionalConfigurationPanelProps = {
  document: FloorPlanDocumentV2;
  groups?: FloorPlanAuthoredConfigurationGroup[];
  onChooseVariant?: (variant: FloorPlanAuthoredConfigurationVariant) => void;
  publicGroups?: PublicFloorPlanAuthoredVariantGroup[];
  selectedRevisionId?: string;
  onChoosePublicVariant?: (
    group: PublicFloorPlanAuthoredVariantGroup,
    option: PublicFloorPlanAuthoredVariantGroup["options"][number]
  ) => void;
  disabled?: boolean;
  dark?: boolean;
  compact?: boolean;
};

export default function FloorPlanOptionalConfigurationPanel({
  document,
  groups = [],
  onChooseVariant,
  publicGroups = [],
  selectedRevisionId,
  onChoosePublicVariant,
  disabled = false,
  dark = false,
  compact = false,
}: FloorPlanOptionalConfigurationPanelProps) {
  const suggestions = useMemo(
    () => inspectFloorPlanOptionalConfigurations(document, groups),
    [document, groups]
  );
  if (!suggestions.length && !publicGroups.length) return null;

  const subtle = dark ? "text-neutral-400" : "text-neutral-600";
  return (
    <section
      aria-label="Source-supported floor-plan options"
      data-testid="floor-plan-optional-configurations"
      className={dark
        ? "mt-3 rounded-lg border border-sky-300/20 bg-sky-300/5 p-3"
        : "mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3"}
    >
      <div className="text-xs font-semibold">Options shown in the source</div>
      <p className={`mt-1 text-[10px] leading-4 ${subtle}`}>
        These marks stay non-physical unless you explicitly choose a complete,
        reviewed layout. A label or dashed outline never creates a room or wall.
      </p>
      {publicGroups.length > 0 ? (
        <div className="mt-2 grid gap-2" data-testid="floor-plan-authored-variant-groups">
          {publicGroups.map((group) => (
            <fieldset
              key={group.groupId}
              className={dark
                ? "rounded-md border border-white/10 bg-white/5 p-2"
                : "rounded-md border border-sky-100 bg-white p-2"}
            >
              <legend className="px-1 text-[11px] font-semibold">{group.label}</legend>
              <div className="mt-1 grid gap-1.5">
                {group.options.map((option) => {
                  const selected = option.revisionId === selectedRevisionId;
                  return (
                    <button
                      key={option.optionId}
                      type="button"
                      aria-pressed={selected}
                      className={selected
                        ? "rounded-md border border-sky-600 bg-sky-50 px-2 py-1.5 text-left text-[10px] font-semibold text-sky-900"
                        : "rounded-md border border-neutral-200 px-2 py-1.5 text-left text-[10px] font-semibold disabled:opacity-50"}
                      disabled={disabled || !onChoosePublicVariant || selected}
                      onClick={() => onChoosePublicVariant?.(group, option)}
                    >
                      {option.label}{option.defaultSelected ? " · source default" : ""}
                      {selected ? " · selected" : ""}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      ) : null}
      <div className={compact ? "mt-2 grid gap-1.5" : "mt-2 grid gap-2"}>
        {suggestions.map((suggestion) => {
          const hasSelectableVariant = Boolean(
            suggestion.status === "authored_variant_available" &&
            suggestion.variant &&
            onChooseVariant
          );
          return (
            <div
              key={`${suggestion.floorId}:${suggestion.annotationId}`}
              className={dark
                ? "rounded-md border border-white/10 bg-white/5 p-2"
                : "rounded-md border border-sky-100 bg-white p-2"}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold">
                    {suggestion.label}
                  </div>
                  <div className={`mt-0.5 text-[10px] ${subtle}`}>
                    {suggestion.kind === "suggested_room"
                      ? "Suggested room arrangement"
                      : "Optional partition"}
                    {suggestion.sourcePages.length
                      ? ` · source page ${suggestion.sourcePages.join(", ")}`
                      : ""}
                  </div>
                </div>
                <span className={suggestion.sourceSupported
                  ? "shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-semibold text-sky-800"
                  : "shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-800"}
                >
                  {suggestion.sourceSupported ? "Source mark" : "Needs review"}
                </span>
              </div>
              {hasSelectableVariant ? (
                <button
                  type="button"
                  className="mt-2 w-full rounded-md bg-sky-700 px-2 py-1.5 text-[10px] font-semibold text-white disabled:opacity-50"
                  disabled={disabled}
                  onClick={() => onChooseVariant!(suggestion.variant!)}
                >
                  Use reviewed {suggestion.variant!.label}
                </button>
              ) : (
                <p className={`mt-1 text-[10px] leading-4 ${subtle}`}>
                  {suggestion.status === "authored_variant_available"
                    ? "Load the exact authored revision before selecting this option."
                    : "No authored geometry variant is attached, so the current walls and rooms will stay unchanged."}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
