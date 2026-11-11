"use client";

import { Html } from "@react-three/drei/web/Html";
import { useMemo, type CSSProperties } from "react";
import { useCanvasPalette } from "@/lib/canvas-colours";
import { resolvePlanSymbolKind } from "@/lib/plan-symbols/plan-symbol-match";

// Whole class names in plain strings, so Tailwind's scanner (and the route CSS checks) find them.
const NAME_CLASSES =
  "transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
const UNSEEN_NAME_CLASSES = "opacity-0 hover:opacity-100 focus-visible:opacity-100";

type PlanItemName2DProps = {
  label: string;
  category: string;
  selected: boolean;
  hovered: boolean;
  interactive: boolean;
  onSelect?: (additive: boolean) => void;
  zIndexRange: [number, number];
};

/**
 * A placed product's name in the 2D plan. The symbol already says what the item is, so the
 * name shows only while the item is pointed at, selected or keyboard-focused, and always on
 * a plain box (no symbol yet). The keyboard target stays in place, unseen, so Tab still
 * reaches every item.
 */
export default function PlanItemName2D({
  label,
  category,
  selected,
  hovered,
  interactive,
  onSelect,
  zIndexRange,
}: PlanItemName2DProps) {
  const { colour } = useCanvasPalette();
  const hasSymbol = useMemo(() => resolvePlanSymbolKind(category, label) !== null, [category, label]);
  const nameShown = selected || hovered || !hasSymbol;
  const style: CSSProperties = {
    fontSize: 12,
    padding: "2px 6px",
    borderRadius: 6,
    background: colour("rgba(255,255,255,0.9)"),
    color: colour("#1f2937"),
    whiteSpace: "nowrap",
  };

  if (!interactive || !onSelect) {
    if (!nameShown) return null;
    return (
      <Html zIndexRange={zIndexRange} position={[0, 0.01, 0]} center transform={false}>
        <div style={{ ...style, border: colour("1px solid rgba(120,120,120,0.35)"), pointerEvents: "none" }}>
          {label}
        </div>
      </Html>
    );
  }

  return (
    <Html zIndexRange={zIndexRange} position={[0, 0.01, 0]} center transform={false}>
      <button
        type="button"
        data-testid="plan-item-keyboard-target"
        aria-label={`Select ${label} in 2D`}
        aria-pressed={selected}
        className={nameShown ? NAME_CLASSES : `${NAME_CLASSES} ${UNSEEN_NAME_CLASSES}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(event.shiftKey);
        }}
        style={{
          ...style,
          appearance: "none",
          border: colour(selected ? "1px solid rgba(37,99,235,0.62)" : "1px solid rgba(120,120,120,0.35)"),
          cursor: "pointer",
          pointerEvents: "auto",
        }}
      >
        {label}
      </button>
    </Html>
  );
}
