"use client";

import { useState } from "react";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";

/**
 * The editor's 2D/3D view starts from `?view=`, and follows it when a link inside the editor
 * changes it: a design made from a floor plan opens in 2D (audit finding ST5) without a reload.
 */
export function useUrlViewMode(urlView: string | null) {
  const [viewMode, setViewMode] = useState<EditorViewMode>(urlView === "2d" ? "2d" : "3d");
  const [followedView, setFollowedView] = useState(urlView);
  if (urlView !== followedView) {
    setFollowedView(urlView);
    if (urlView === "2d" || urlView === "3d") setViewMode(urlView);
  }
  return [viewMode, setViewMode] as const;
}
