import type { ReactNode } from "react";

import { CanvasErrorBoundary } from "@/components/CanvasErrorBoundary";
import type { CanvasFrameBox } from "@/lib/editor-canvas-insets";

/**
 * The canvas's card in the rounded inset frame (lib/editor-canvas-insets): its place in the
 * editor and, from md, its 12px corners. The scene sizes itself to the card, so the 2D plan and
 * the 3D room centre in it; if the scene fails, the error shows in the card. On phones and in
 * Client Preview the card is the whole editor.
 */
export function CanvasFrameCard({ frame, children }: { frame: CanvasFrameBox; children: ReactNode }) {
  const framed = frame.leftPx + frame.topPx + frame.rightPx + frame.bottomPx > 0;
  return (
    <div
      data-testid="canvas-frame-card"
      data-canvas-framed={framed ? "true" : "false"}
      className={framed ? "absolute overflow-hidden rounded-xl" : "absolute overflow-hidden"}
      style={{ left: frame.leftPx, top: frame.topPx, right: frame.rightPx, bottom: frame.bottomPx }}
    >
      <CanvasErrorBoundary>{children}</CanvasErrorBoundary>
    </div>
  );
}
