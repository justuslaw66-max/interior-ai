"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Plane, Quaternion, Vector3, type Group } from "three";
import {
  resizeLayoutBlockFootprint,
  type LayoutBlockFootprint,
  type LayoutBlockResizeHandle,
} from "@/lib/layout-block-resize";
import { planResizeCursor } from "@/lib/plan-cursors";

export type LayoutBlockResizeDragInput = {
  frameRef: RefObject<Group | null>;
  startWidth: number;
  startDepth: number;
  onPreview: (footprint: LayoutBlockFootprint | null) => void;
  onCommit: (footprint: LayoutBlockFootprint) => boolean;
  onDraggingChange?: (dragging: boolean) => void;
};

type ActiveDrag = { handle: LayoutBlockResizeHandle; pointerId: number; target: Element; last: LayoutBlockFootprint };

const floorPlane = new Plane(new Vector3(0, 1, 0), 0);

/** The pointer on the block's floor, in the block's own frame; the plan camera looks straight down. */
function pointerInFrame(frame: Group | null, e: ThreeEvent<PointerEvent>) {
  if (!frame) return null;
  floorPlane.constant = -frame.getWorldPosition(new Vector3()).y;
  const hit = e.ray.intersectPlane(floorPlane, new Vector3());
  return hit ? frame.worldToLocal(hit) : null;
}

function cursorFor(frame: Group | null, handle: LayoutBlockResizeHandle) {
  const direction = new Vector3(handle.sx, 0, handle.sz);
  if (frame) direction.applyQuaternion(frame.getWorldQuaternion(new Quaternion()));
  return planResizeCursor(direction.x, direction.z);
}

function releaseCapture({ target, pointerId }: ActiveDrag) {
  try {
    target.releasePointerCapture(pointerId);
  } catch {
    // Already released: the pointer left the page or the canvas went away mid-drag.
  }
}

/** Escape while a drag is on cancels it, as it does for turning an item. */
function useEscapeWhile(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onEscape();
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  });
}

/**
 * Dragging a layout block's corner or edge on the plan: the pointer is captured, each move previews
 * the new footprint, Escape cancels, and letting go commits it (the commit decides if it stays).
 */
export function useLayoutBlockResizeDrag({ frameRef, startWidth, startDepth, onPreview, onCommit, onDraggingChange }: LayoutBlockResizeDragInput) {
  const drag = useRef<ActiveDrag | null>(null);
  const [dragging, setDragging] = useState(false);

  const finish = (commit: boolean) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    releaseCapture(active);
    setDragging(false);
    onDraggingChange?.(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    const moved = Math.abs(active.last.width - startWidth) > 1e-6 || Math.abs(active.last.depth - startDepth) > 1e-6;
    // The commit and the cleared preview land in the same render, so the block never jumps back.
    if (commit && moved) onCommit(active.last);
    onPreview(null);
  };

  useEscapeWhile(dragging, () => finish(false));

  return (handle: LayoutBlockResizeHandle) => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      document.body.style.cursor = cursorFor(frameRef.current, handle);
    },
    onPointerOut: () => {
      if (!drag.current) document.body.style.cursor = "";
    },
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      const target = e.target as unknown as Element; // the capture target, as the rotate handle uses it (FurnitureItem)
      target.setPointerCapture(e.pointerId);
      drag.current = { handle, pointerId: e.pointerId, target, last: { width: startWidth, depth: startDepth, offsetX: 0, offsetZ: 0 } };
      document.body.style.userSelect = "none"; // the drag would otherwise select the labels' text
      document.body.style.cursor = cursorFor(frameRef.current, handle);
      setDragging(true);
      onDraggingChange?.(true);
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      const active = drag.current;
      if (!active || active.pointerId !== e.pointerId) return;
      e.stopPropagation();
      const pointer = pointerInFrame(frameRef.current, e);
      if (!pointer) return;
      const input = { handle: active.handle, startWidth, startDepth, pointerX: pointer.x, pointerZ: pointer.z, snap: !e.altKey };
      active.last = resizeLayoutBlockFootprint(input);
      onPreview(active.last);
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      if (!drag.current) return;
      e.stopPropagation();
      finish(true);
    },
    onPointerCancel: () => finish(false),
  });
}
