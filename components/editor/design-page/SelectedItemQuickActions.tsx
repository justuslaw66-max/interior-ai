"use client";

import { ChevronRight, Copy, RotateCw, Trash2 } from "lucide-react";
import type { SelectedItemSwap } from "@/lib/selected-item-summary";

const ACTION_CLASS =
  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[10px] border bg-white text-xs font-bold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:cursor-not-allowed disabled:opacity-50";

type SelectedItemActionRowProps = {
  rotationOpen: boolean;
  canRotate: boolean;
  /** No edits (a guest's read-only view, or a locked product in Pro). */
  disabled: boolean;
  onRotate: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

/**
 * Rotate, Duplicate and Remove, as in the Furnish mockup: the one Remove for a product (UX audit
 * ED3; "Delete" is gone), recorded as "Remove <product>" with Undo in the toast.
 */
export function SelectedItemActionRow({ rotationOpen, canRotate, disabled, onRotate, onDuplicate, onRemove }: SelectedItemActionRowProps) {
  return (
    <div data-testid="selected-item-actions" className="grid grid-cols-3 gap-2">
      <button
        type="button"
        data-testid="rotation-controls-toggle"
        aria-expanded={rotationOpen}
        disabled={!canRotate}
        onClick={onRotate}
        className={`${ACTION_CLASS} ${rotationOpen ? "border-neutral-900" : "border-neutral-200"}`}
      >
        <RotateCw className="h-[18px] w-[18px]" aria-hidden="true" />
        Rotate
      </button>
      <button
        type="button"
        data-testid="selected-item-duplicate"
        title="Duplicate (Cmd/Ctrl+D)"
        disabled={disabled}
        onClick={onDuplicate}
        className={`${ACTION_CLASS} border-neutral-200`}
      >
        <Copy className="h-[18px] w-[18px]" aria-hidden="true" />
        Duplicate
      </button>
      <button
        type="button"
        data-testid="selected-item-delete"
        title="Remove from the design (Delete)"
        disabled={disabled}
        onClick={onRemove}
        className={`${ACTION_CLASS} border-neutral-200`}
      >
        <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
        Remove
      </button>
    </div>
  );
}

function SelectedItemSwapButton({
  testId,
  label,
  swap,
  disabled,
  onSwap,
}: {
  testId: string;
  label: string;
  swap: SelectedItemSwap;
  disabled: boolean;
  onSwap: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onSwap}
      className="flex min-h-[52px] items-center gap-2.5 rounded-[10px] border border-neutral-200 bg-white py-2 pl-3 pr-2.5 text-left text-neutral-900 hover:bg-neutral-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-bold">{label}</span>
        {/* A long name gives way; the price always shows. */}
        <span className="flex min-w-0 gap-1 text-xs text-neutral-600">
          <span className="truncate">{swap.title}</span>
          <span className="shrink-0">· {swap.priceLabel}</span>
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
    </button>
  );
}

type SelectedItemSwapsProps = {
  cheaper: SelectedItemSwap | null;
  pricier: SelectedItemSwap | null;
  disabled: boolean;
  onSwapToCheaper: () => void;
  onSwapToPricier: () => void;
};

/**
 * Named swaps (UX audit FU10, FU12): each says what it swaps to and what that costs, and shows only
 * when there is one. Free and Pro both get them (J, Q10).
 */
export function SelectedItemSwaps({ cheaper, pricier, disabled, onSwapToCheaper, onSwapToPricier }: SelectedItemSwapsProps) {
  if (!cheaper && !pricier) return null;
  return (
    <div data-testid="selected-item-swaps" className="flex flex-col gap-2">
      <span className="text-[13px] font-bold text-neutral-900">Swap</span>
      {cheaper ? (
        <SelectedItemSwapButton
          testId="selected-item-swap-cheaper"
          label="Swap for cheaper"
          swap={cheaper}
          disabled={disabled}
          onSwap={onSwapToCheaper}
        />
      ) : null}
      {pricier ? (
        <SelectedItemSwapButton
          testId="selected-item-swap-pricier"
          label="Swap for pricier"
          swap={pricier}
          disabled={disabled}
          onSwap={onSwapToPricier}
        />
      ) : null}
    </div>
  );
}
