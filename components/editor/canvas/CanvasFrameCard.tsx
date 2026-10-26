import { useLayoutEffect, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import { CanvasErrorBoundary } from "@/components/CanvasErrorBoundary";
import { requestSceneDemandFrame } from "@/components/scene/sceneDemandDiagnostics";
import type { CanvasFrameBox } from "@/lib/editor-canvas-insets";

/**
 * The canvas's card in the rounded inset frame (lib/editor-canvas-insets): its place in the
 * editor and, from md, its 12px corners. The scene sizes itself to the card, and the 2D fit and
 * 3D's lens (`CanvasLensShift`) keep the plan and the room clear of what floats over it; if the
 * scene fails, the error shows in the card. On phones and in Client Preview the card is the whole
 * editor. The card is the canvas's own colour: while a room prepares the scene fades out and the
 * card shows, keeping its shape in the frame (J, 25 Oct).
 */
export function CanvasFrameCard({ frame, children }: { frame: CanvasFrameBox; children: ReactNode }) {
  const framed = frame.leftPx + frame.topPx + frame.rightPx + frame.bottomPx > 0;
  return (
    <div
      data-testid="canvas-frame-card"
      data-canvas-framed={framed ? "true" : "false"}
      className={framed ? "absolute overflow-hidden rounded-xl bg-surface-canvas" : "absolute overflow-hidden bg-surface-canvas"}
      style={{ left: frame.leftPx, top: frame.topPx, right: frame.rightPx, bottom: frame.bottomPx }}
    >
      <CanvasErrorBoundary>{children}</CanvasErrorBoundary>
    </div>
  );
}

/**
 * Puts a perspective camera's picture centre `shiftPx` left of the canvas's middle, or back in it
 * for 0: the lens shifts (`setViewOffset`) and the camera stays put. Says whether the picture moved.
 */
export function applyCanvasLensShift(camera: THREE.Camera, widthPx: number, heightPx: number, shiftPx: number) {
  if (!(camera instanceof THREE.PerspectiveCamera)) return false;
  if (shiftPx === 0 || widthPx <= 0 || heightPx <= 0) {
    if (!camera.view?.enabled) return false;
    camera.clearViewOffset();
    return true;
  }
  camera.setViewOffset(widthPx, heightPx, shiftPx, 0, widthPx, heightPx);
  return true;
}

/**
 * 3D's lens in the card (`resolveCanvasLensShiftPx`): every 3D view, the default, a fit, a saved
 * view or one the user orbits to, centres in the card's free part, left of the right rail, from
 * the angle it was set at. 2D's camera is orthographic and fits itself.
 */
export function CanvasLensShift({ shiftPx }: { shiftPx: number }) {
  const camera = useThree((state) => state.camera);
  const widthPx = useThree((state) => state.size.width);
  const heightPx = useThree((state) => state.size.height);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    if (applyCanvasLensShift(camera, widthPx, heightPx, shiftPx)) requestSceneDemandFrame(invalidate);
  }, [camera, heightPx, invalidate, shiftPx, widthPx]);
  return null;
}
