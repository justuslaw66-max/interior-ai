"use client";

import { useRef, useState, type RefObject } from "react";
import { Html } from "@react-three/drei/web/Html";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import { useCanvasPalette } from "@/lib/canvas-colours";
import { PLAN_HTML_PASS_THROUGH } from "@/lib/plan-html-overlay";
import { usePlanHandleSizes } from "@/lib/plan-handle-sizes";
import {
  chipsCheckDue,
  chipsFitAbove,
  chipsGapPx,
  chipsTransform,
  unsetChipsCheckMark,
  type ChipsCheckMark,
  type ChipsFitInput,
  type ChipsSide,
} from "@/lib/selected-chips-placement";

export type SelectedFurnitureChip = { id: "rotate" | "copy" | "delete"; label: string; disabled: boolean; action: () => void };

const anchorOnScreen = new Vector3();

/**
 * The plan's own area: the nearest element holding both the canvas and the chips. drei puts every
 * plan label there, beside the canvas's own wrapper, so a label (or the chips) there isn't a
 * control covering the spot; the page's controls (the 2D/3D switch, the toolbar) sit outside it.
 */
function planRegionOf(chips: HTMLElement, canvas: HTMLCanvasElement): Element | null {
  let node = chips.parentElement;
  while (node && !node.contains(canvas)) node = node.parentElement;
  return node;
}

/**
 * Above the item while that spot shows the plan, otherwise below it. The spot is checked only when
 * the item has moved on screen (chipsCheckDue), state changes only when the side does, and the
 * frame callback reuses its objects, so it allocates nothing.
 */
function useChipsSide(anchorRef: RefObject<Group | null>, chipsRef: RefObject<HTMLDivElement | null>, gapAbove: number): ChipsSide {
  const { camera, gl } = useThree();
  const [side, setSide] = useState<ChipsSide>("above");
  const region = useRef<Element | null>(null);
  const mark = useRef<ChipsCheckMark>(unsetChipsCheckMark());
  const input = useRef<ChipsFitInput>({
    anchorX: 0, anchorY: 0, gap: 0, width: 0, height: 0, regionTop: 0,
    isClear: (x, y) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && Boolean(region.current?.contains(hit));
    },
  });
  useFrame(() => {
    const anchor = anchorRef.current;
    const chips = chipsRef.current;
    if (!anchor || !chips) return;
    anchor.getWorldPosition(anchorOnScreen).project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    const check = input.current;
    check.anchorX = rect.left + ((anchorOnScreen.x + 1) / 2) * rect.width;
    check.anchorY = rect.top + ((1 - anchorOnScreen.y) / 2) * rect.height;
    check.gap = gapAbove;
    check.width = chips.offsetWidth;
    check.height = chips.offsetHeight;
    check.regionTop = rect.top;
    if (!chipsCheckDue(mark.current, check)) return;
    region.current ??= planRegionOf(chips, gl.domElement);
    const next: ChipsSide = chipsFitAbove(check) ? "above" : "below";
    if (next !== side) setSide(next);
  });
  return side;
}

function ChipButton({ chip }: { chip: SelectedFurnitureChip }) {
  const { colour } = useCanvasPalette();
  return (
    <button
      type="button"
      data-testid={`selected-furniture-${chip.id}`}
      aria-label={`${chip.label} selected furniture`}
      title={`${chip.label} selected furniture`}
      disabled={chip.disabled}
      onClick={(event) => {
        event.stopPropagation();
        chip.action();
      }}
      style={{
        border: "none",
        borderRadius: 999,
        background: colour(chip.id === "delete" ? "#fee2e2" : "#f3f4f6"),
        color: colour(chip.id === "delete" ? "#991b1b" : "#111827"),
        cursor: chip.disabled ? "not-allowed" : "pointer",
        fontSize: 12,
        fontWeight: 800,
        opacity: chip.disabled ? 0.45 : 1,
        minWidth: chip.id === "delete" ? 46 : 42,
        padding: "5px 8px",
      }}
    >
      {chip.label}
    </button>
  );
}

/** A selected item's Rotate / Copy / Delete chips on the 2D plan, kept clear of its handles. */
export function SelectedFurnitureChips2D({ depth, chips }: { depth: number; chips: readonly SelectedFurnitureChip[] }) {
  const { colour } = useCanvasPalette();
  const sizes = usePlanHandleSizes();
  const anchorRef = useRef<Group>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const side = useChipsSide(anchorRef, chipsRef, chipsGapPx("above", sizes));
  return (
    <>
      <group ref={anchorRef} position={[0, 0.08, -depth / 2]} />
      {/* Over the plan's door and window labels (20), under the page's own controls (40 and up). */}
      <Html
        zIndexRange={[22, 0]}
        position={[0, 0.08, side === "above" ? -depth / 2 : depth / 2]}
        center
        transform={false}
        style={PLAN_HTML_PASS_THROUGH}
      >
        <div
          ref={chipsRef}
          data-testid="selected-furniture-action-chips"
          data-side={side}
          style={{
            transform: chipsTransform(side, chipsGapPx(side, sizes)),
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: 4,
            border: colour("1px solid rgba(37,99,235,0.24)"),
            borderRadius: 999,
            background: colour("rgba(255,255,255,0.96)"),
            boxShadow: "0 8px 22px rgba(15,23,42,0.14)",
            pointerEvents: "auto",
            whiteSpace: "nowrap",
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {chips.map((chip) => (
            <ChipButton key={chip.id} chip={chip} />
          ))}
        </div>
      </Html>
    </>
  );
}
