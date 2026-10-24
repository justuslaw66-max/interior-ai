"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ChoiceTile } from "@/components/ui/ChoiceTile";
import type { CabinetLaminateCategory } from "@/lib/cabinet-laminate-runtime-types";
import {
  CABINET_FINISHES,
  CABINET_FINISH_CATEGORIES,
  cabinetFinishAccessibleName,
  cabinetFinishBadge,
  filterCabinetFinishes,
} from "../catalog/finishes";
import { findCabinetLaminate, type CabinetLaminateCatalogItem } from "../catalog/laminates";
import type { CabinetMaterialRef } from "../types";

/** How many designs a category shows before "Show all". */
const FIRST_PAGE = 24;

/** A finish's swatch: the middle of its sheet, or its colour for plain designs. */
export function CabinetFinishSwatch({
  material,
  className,
}: {
  material: Pick<CabinetMaterialRef, "color"> & { swatchUrl?: string };
  className: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`block shrink-0 rounded-md border border-separator bg-cover bg-center ${className}`}
      style={{
        backgroundColor: material.color ?? "#d6d3d1",
        backgroundImage: material.swatchUrl ? `url(${material.swatchUrl})` : undefined,
      }}
    />
  );
}

function CabinetFinishTile({
  finish,
  selected,
  disabled,
  compact,
  testId,
  onPick,
}: {
  finish: CabinetLaminateCatalogItem;
  selected: boolean;
  disabled: boolean;
  compact: boolean;
  testId: string;
  onPick: () => void;
}) {
  const badge = cabinetFinishBadge(finish);
  return (
    <ChoiceTile
      data-testid={testId}
      selected={selected}
      disabled={disabled}
      title={cabinetFinishAccessibleName(finish)}
      aria-label={cabinetFinishAccessibleName(finish)}
      className="flex min-w-0 flex-col gap-1.5 p-1.5 text-left"
      onClick={onPick}
    >
      <CabinetFinishSwatch material={finish} className={compact ? "h-16 w-full" : "h-24 w-full"} />
      <span className="text-xs font-bold text-label">{finish.supplierCode}</span>
      {compact ? null : <span className="text-xs leading-4 text-label-secondary">{finish.designName}</span>}
      {badge && !compact ? (
        <span className="self-start rounded bg-control-track px-1.5 py-0.5 text-xs font-semibold text-label-secondary">
          {badge}
        </span>
      ) : null}
    </ChoiceTile>
  );
}

function CabinetFinishCategoryChips({
  active,
  testIdPrefix,
  onPick,
}: {
  active: CabinetLaminateCategory | null;
  testIdPrefix: string;
  onPick: (category: CabinetLaminateCategory) => void;
}) {
  return (
    <div role="group" aria-label="Laminate type" className="flex flex-wrap gap-1.5">
      {CABINET_FINISH_CATEGORIES.map((category) => (
        <Chip
          key={category.id}
          data-testid={`${testIdPrefix}-category-${category.id}`}
          pressed={active === category.id}
          onClick={() => onPick(category.id)}
        >
          {category.label} <span className="font-semibold opacity-60">{category.count}</span>
        </Chip>
      ))}
    </div>
  );
}

/** The first page of designs; the chosen one takes the first place when it would be further on. */
function firstPageWithChoice(
  matches: readonly CabinetLaminateCatalogItem[],
  value: string | undefined
): readonly CabinetLaminateCatalogItem[] {
  const firstPage = matches.slice(0, FIRST_PAGE);
  const chosen = matches.find((finish) => finish.id === value);
  if (!chosen || firstPage.includes(chosen)) return firstPage;
  return [chosen, ...firstPage.slice(0, FIRST_PAGE - 1)];
}

function CabinetFinishResults({
  matches,
  limited,
  value,
  disabled,
  compact,
  testIdPrefix,
  onChange,
  onShowAll,
}: {
  matches: readonly CabinetLaminateCatalogItem[];
  limited: boolean;
  value: string | undefined;
  disabled: boolean;
  compact: boolean;
  testIdPrefix: string;
  onChange: (materialId: string) => void;
  onShowAll: () => void;
}) {
  const shown = limited ? firstPageWithChoice(matches, value) : matches;
  return (
    <>
      <div className={`grid gap-2 ${compact ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-4"}`}>
        {shown.map((finish) => (
          <CabinetFinishTile
            key={finish.id}
            finish={finish}
            selected={finish.id === value}
            disabled={disabled}
            compact={compact}
            testId={`${testIdPrefix}-${finish.id}`}
            onPick={() => onChange(finish.id)}
          />
        ))}
      </div>
      {matches.length === 0 ? (
        <p className="text-sm text-label-secondary">No design matches. Try a code like 5003, or a word like oak.</p>
      ) : null}
      {limited && matches.length > FIRST_PAGE ? (
        <Button data-testid={`${testIdPrefix}-show-all`} size="compact" className="justify-self-start" onClick={onShowAll}>
          Show all {matches.length}
        </Button>
      ) : null}
    </>
  );
}

export type CabinetFinishPickerProps = {
  /** The chosen material id; it may be a placeholder or other material from an older design. */
  value: string | undefined;
  onChange: (materialId: string) => void;
  testIdPrefix: string;
  disabled?: boolean;
  /** Smaller tiles without names, for the Detailed editor's rows. */
  compact?: boolean;
};

/** Real laminate designs by kind, with a search by code or name (docs/architecture/cabinet-laminates.md). */
export function CabinetFinishPicker({
  value,
  onChange,
  testIdPrefix,
  disabled = false,
  compact = false,
}: CabinetFinishPickerProps) {
  // The picker opens on the chosen design's kind and follows the choice when it changes (a pick,
  // undo, another module or part); a kind picked by hand lasts until then.
  const [pickedKind, setPickedKind] = useState<{ value: string | undefined; category: CabinetLaminateCategory } | null>(null);
  const [allShownFor, setAllShownFor] = useState<CabinetLaminateCategory | null>(null);
  const [query, setQuery] = useState("");
  const category =
    pickedKind && pickedKind.value === value ? pickedKind.category : findCabinetLaminate(value ?? "")?.laminateCategory ?? "woodgrains";
  const searching = query.trim().length > 0;

  return (
    <div data-testid={testIdPrefix} className="grid gap-3">
      <p className="text-xs text-label-secondary">
        {CABINET_FINISHES.length} real laminate designs, drawn at their real size.
      </p>
      <CabinetFinishCategoryChips
        active={searching ? null : category}
        testIdPrefix={testIdPrefix}
        onPick={(next) => {
          setPickedKind({ value, category: next });
          setQuery("");
        }}
      />
      <label className="grid gap-1.5 text-xs font-semibold text-label-secondary">
        Search by code or name
        <input
          type="search"
          data-testid={`${testIdPrefix}-search`}
          className="h-9 rounded-md border border-control-secondary-border bg-surface-secondary px-3 text-sm font-normal text-label focus:border-control-primary"
          placeholder="For example 5003 or walnut"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <CabinetFinishResults
        matches={filterCabinetFinishes(query, category)}
        limited={!searching && allShownFor !== category}
        value={value}
        disabled={disabled}
        compact={compact}
        testIdPrefix={testIdPrefix}
        onChange={(materialId) => {
          setPickedKind(null);
          onChange(materialId);
        }}
        onShowAll={() => setAllShownFor(category)}
      />
    </div>
  );
}
