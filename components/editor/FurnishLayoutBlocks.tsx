"use client";

import { PLAN_SYMBOLS, PLAN_SYMBOL_KINDS, type PlanSymbolGroup } from "@/lib/plan-symbols/plan-symbol-library";
import type { PlanSymbolKind } from "@/lib/plan-symbols/plan-symbol-types";
import { layoutBlockTypicalSizeMm } from "@/lib/layout-blocks";
import { Button } from "@/components/ui/Button";

type FurnishLayoutBlocksProps = {
  roomName: string;
  canEdit: boolean;
  onAdd: (kind: PlanSymbolKind) => void;
};

/** The kinds in each group, in the library's order. */
function kindsByGroup(): Array<[PlanSymbolGroup, PlanSymbolKind[]]> {
  const groups = new Map<PlanSymbolGroup, PlanSymbolKind[]>();
  for (const kind of PLAN_SYMBOL_KINDS) {
    const group = PLAN_SYMBOLS[kind].group;
    groups.set(group, [...(groups.get(group) ?? []), kind]);
  }
  return [...groups.entries()];
}

const GROUPS = kindsByGroup();

/**
 * Layout blocks (J, 12 Nov 2026): every plan symbol as a piece to place at its usual size and
 * then resize, for laying out a home in 2D before choosing products. A block has no price and
 * stays out of the Shopping list.
 */
export function FurnishLayoutBlocks({ roomName, canEdit, onAdd }: FurnishLayoutBlocksProps) {
  return (
    <div data-testid="furnish-layout-blocks" className="flex flex-col gap-2">
      <p className="text-[13px] text-label-secondary">
        Plan pieces with no product yet. Add one to {roomName}, then set its size. They have no price.
      </p>
      {GROUPS.map(([group, kinds], index) => (
        <details key={group} open={index === 0} className="rounded-lg border border-box-border bg-surface-secondary">
          <summary className="cursor-pointer px-2.5 py-2 text-[13px] font-bold text-label">{group}</summary>
          <ul className="flex flex-col gap-1.5 px-2 pb-2">
            {kinds.map((kind) => {
              const size = layoutBlockTypicalSizeMm(kind);
              const label = PLAN_SYMBOLS[kind].label;
              return (
                <li key={kind}>
                  <Button
                    size="regular"
                    className="w-full"
                    data-testid={`layout-block-add-${kind}`}
                    aria-label={`Add ${label} block to ${roomName}`}
                    disabled={!canEdit}
                    onClick={() => onAdd(kind)}
                  >
                    <span className="flex w-full items-center justify-between gap-2 text-left">
                      <span className="truncate">{label}</span>
                      <span className="shrink-0 text-label-secondary">{size.w} × {size.d} mm</span>
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </div>
  );
}
