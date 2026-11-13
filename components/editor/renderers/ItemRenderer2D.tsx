"use client";

import { useRef, useState } from "react";
import { Line } from "@react-three/drei/core/Line";
import type { ThreeEvent } from "@react-three/fiber";
import type { Group } from "three";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import { formatDisplayLength } from "@/lib/display-units";
import { useCanvasPalette } from "@/lib/canvas-colours";
import type { LayoutBlockFootprint } from "@/lib/layout-block-resize";
import { PLAN_SYMBOL_BASE_Y, PLAN_SYMBOL_OVERLAY_Y } from "@/lib/plan-symbols/plan-symbol-item";
import type { PlanSymbolKind } from "@/lib/plan-symbols/plan-symbol-types";
import LayoutBlockResizeHandles2D from "./LayoutBlockResizeHandles2D";
import PlanItemName2D from "./PlanItemName2D";
import { PLAN_ITEM_HTML_Z_INDEX, PlanItemCorners2D, PlanItemDimensionLabels2D, PlanItemRotateHandle2D } from "./PlanItemSelection2D";
import PlanSymbol2D from "./PlanSymbol2D";

type ItemRenderer2DProps = {
  width: number;
  depth: number;
  category: string;
  /** A layout block's own symbol; products are matched from their category and name. */
  symbolKind?: PlanSymbolKind | null;
  selected: boolean;
  hovered?: boolean;
  dragging: boolean;
  snapped: boolean;
  invalidPlacement: boolean;
  showLabels: boolean;
  showDimensions: boolean;
  label: string;
  measurementUnit?: PlanMeasurementUnit;
  rotationHudLabel?: string | null;
  interactive?: boolean;
  /** A locked item shows only its corners: no resize or rotate handles, as in Canva and Live Home 3D. */
  locked?: boolean;
  onSelect?: (additive: boolean) => void;
  onRotateHandlePointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onRotateHandlePointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onRotateHandlePointerUp?: (e: ThreeEvent<PointerEvent>) => void;
  /** The item, for a layout block's resize from its outline (J, 13 Nov 2026). */
  instanceId?: string;
  onResizeLayoutBlock?: (id: string, footprint: LayoutBlockFootprint) => boolean;
  onResizeDraggingChange?: (dragging: boolean) => void;
};

function borderColour(props: Pick<ItemRenderer2DProps, "invalidPlacement" | "selected" | "hovered">) {
  if (props.invalidPlacement) return "#d91f1f";
  if (props.selected) return "#2a66ff";
  return props.hovered ? "#0f766e" : "#4ea81f";
}

/** The symbol is the item's outline; a coloured border shows only what is happening to it. */
function showsBorder(props: ItemRenderer2DProps) {
  return props.selected || props.hovered === true || props.invalidPlacement || (props.snapped && props.dragging);
}

/** The item to resize from its outline: a selected, editable, unlocked layout block; undefined otherwise. */
function resizableId(props: ItemRenderer2DProps) {
  return props.selected && props.interactive && !props.locked && props.symbolKind && props.onResizeLayoutBlock ? props.instanceId : undefined;
}

/** The rotate knob: on a selected item that can be edited and isn't locked. */
function showsRotateHandle(props: ItemRenderer2DProps) {
  return props.selected && props.interactive === true && !props.locked;
}

/** The footprint drawn: the resize preview while one is dragged, else the saved size. */
function drawnFootprint(preview: LayoutBlockFootprint | null, width: number, depth: number): LayoutBlockFootprint {
  return preview ?? { width, depth, offsetX: 0, offsetZ: 0 };
}

export default function ItemRenderer2D(props: ItemRenderer2DProps) {
  const { category, selected, dragging, invalidPlacement, label, onResizeLayoutBlock } = props;
  const frameRef = useRef<Group>(null);
  // A layout block's resize while it is dragged; the saved size takes over when it is let go.
  const [preview, setPreview] = useState<LayoutBlockFootprint | null>(null);
  const { width, depth, offsetX, offsetZ } = drawnFootprint(preview, props.width, props.depth);
  const { colour } = useCanvasPalette();
  const resizeId = resizableId(props);
  const markY = PLAN_SYMBOL_OVERLAY_Y;
  const formatDimension = (meters: number) => formatDisplayLength(meters * 1000, props.measurementUnit ?? "mm");

  return (
    <group ref={frameRef}>
      <group position={[offsetX, 0, offsetZ]}>
        {/* The pick target: the whole footprint, drawn invisibly under the symbol. */}
        <mesh rotation-x={-Math.PI / 2} position={[0, PLAN_SYMBOL_BASE_Y, 0]}>
          <planeGeometry args={[width, depth]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        <PlanSymbol2D category={category} label={label} kind={props.symbolKind ?? null} width={width} depth={depth} />

        {invalidPlacement && (
          <mesh rotation-x={-Math.PI / 2} position={[0, markY, 0]}>
            <planeGeometry args={[width, depth]} />
            <meshBasicMaterial color={colour("#f8b6b6")} transparent opacity={0.45} depthWrite={false} />
          </mesh>
        )}

        {showsBorder(props) && (
          <Line
            points={[
              [-width / 2, markY, -depth / 2],
              [width / 2, markY, -depth / 2],
              [width / 2, markY, depth / 2],
              [-width / 2, markY, depth / 2],
              [-width / 2, markY, -depth / 2],
            ]}
            color={colour(borderColour(props))}
            lineWidth={selected ? 2.4 : 2}
          />
        )}

        {resizeId && onResizeLayoutBlock ? (
          <LayoutBlockResizeHandles2D
            frameRef={frameRef}
            footprint={{ width, depth, offsetX: 0, offsetZ: 0 }}
            startWidth={props.width}
            startDepth={props.depth}
            markY={markY}
            onPreview={setPreview}
            onCommit={(footprint) => onResizeLayoutBlock(resizeId, footprint)}
            onDraggingChange={props.onResizeDraggingChange}
          />
        ) : (
          selected && <PlanItemCorners2D width={width} depth={depth} markY={markY} />
        )}

        {showsRotateHandle(props) && (
          <PlanItemRotateHandle2D
            depth={depth}
            markY={markY}
            hudLabel={props.rotationHudLabel ?? null}
            onPointerDown={props.onRotateHandlePointerDown}
            onPointerMove={props.onRotateHandlePointerMove}
            onPointerUp={props.onRotateHandlePointerUp}
          />
        )}

        {props.showLabels && (selected || props.hovered || !dragging) && (
          <PlanItemName2D
            label={label}
            category={category}
            selected={selected}
            hovered={props.hovered ?? false}
            interactive={props.interactive ?? false}
            onSelect={props.onSelect}
            zIndexRange={PLAN_ITEM_HTML_Z_INDEX}
          />
        )}

        {props.showDimensions && selected && (
          <PlanItemDimensionLabels2D width={width} depth={depth} widthLabel={formatDimension(width)} depthLabel={formatDimension(depth)} />
        )}
      </group>
    </group>
  );
}
