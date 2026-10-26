"use client";

import { useMemo } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  inspectFloorPlanOptionalConfigurations,
  type FloorPlanAuthoredConfigurationGroup,
  type FloorPlanAuthoredConfigurationVariant,
} from "@/lib/floor-plan-optional-configurations";
import type { PublicFloorPlanAuthoredVariantGroup } from "@/lib/floor-plan-authored-variant-links";
import { Button } from "@/components/ui/Button";

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
  compact = false,
}: FloorPlanOptionalConfigurationPanelProps) {
  const suggestions = useMemo(
    () => inspectFloorPlanOptionalConfigurations(document, groups),
    [document, groups]
  );
  if (!suggestions.length && !publicGroups.length) return null;

  const subtle = "text-label-secondary";
  return (
    <section
      aria-label="Source-supported floor-plan options"
      data-testid="floor-plan-optional-configurations"
      className="mt-3 rounded-lg border border-accent-tint-border bg-accent-tint p-3" data-surface="floating"
    >
      <div className="text-xs font-semibold">Options shown in the source</div>
      <p className={`mt-1 text-xs leading-4 ${subtle}`}>
        These marks stay non-physical unless you explicitly choose a complete,
        reviewed layout. A label or dashed outline never creates a room or wall.
      </p>
      {publicGroups.length > 0 ? (
        <div className="mt-2 grid gap-2" data-testid="floor-plan-authored-variant-groups">
          {publicGroups.map((group) => (
            <fieldset
              key={group.groupId}
              className="rounded-md border border-accent-tint-border bg-surface-floating p-2"
            >
              <legend className="px-1 text-xs font-semibold">{group.label}</legend>
              <div className="mt-1 grid gap-1.5">
                {group.options.map((option) => {
                  const selected = option.revisionId === selectedRevisionId;
                  return (
                    <button
                      key={option.optionId}
                      type="button"
                      aria-pressed={selected}
                      className={selected
                        ? "rounded-md border border-blue-600 bg-accent-tint px-2 py-1.5 text-left text-xs font-semibold text-on-accent-tint"
                        : "rounded-md border border-box-border px-2 py-1.5 text-left text-xs font-semibold disabled:opacity-50"}
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
              className="rounded-md border border-accent-tint-border bg-surface-floating p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">
                    {suggestion.label}
                  </div>
                  <div className={`mt-0.5 text-xs ${subtle}`}>
                    {suggestion.kind === "suggested_room"
                      ? "Suggested room arrangement"
                      : "Optional partition"}
                    {suggestion.sourcePages.length
                      ? ` · source page ${suggestion.sourcePages.join(", ")}`
                      : ""}
                  </div>
                </div>
                <span className={suggestion.sourceSupported
                  ? "shrink-0 rounded-full bg-accent-tint px-2 py-0.5 text-xs font-semibold text-on-accent-tint"
                  : "shrink-0 rounded-full bg-warning-tint px-2 py-0.5 text-xs font-semibold text-on-warning-tint"}
                >
                  {suggestion.sourceSupported ? "Source mark" : "Needs review"}
                </span>
              </div>
              {hasSelectableVariant ? (
                <Button
                  variant="primary" size="compact" className="mt-2 w-full"
                  disabled={disabled}
                  onClick={() => onChooseVariant!(suggestion.variant!)}
                >
                  Use reviewed {suggestion.variant!.label}
                </Button>
              ) : (
                <p className={`mt-1 text-xs leading-4 ${subtle}`}>
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
