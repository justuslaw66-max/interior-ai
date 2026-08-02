"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type {
  RendererSurfaceTarget,
  SelectedWallSurfaceTarget,
  SurfaceBrushPaint,
  SurfaceTargetMode,
} from "@/lib/useDesignPageSurfaceActions";

export type DesignPageSurfaceState = {
  floorFinishPanelOpenSignal: number;
  activeSurfaceTarget: SurfaceTargetMode;
  selectedWallSurfaceTarget: SelectedWallSurfaceTarget | null;
  selectedRendererSurfaceTarget: RendererSurfaceTarget | null;
  surfaceBrushActive: boolean;
  surfaceBrushMaterialId: string | null;
  surfaceBrushPaint: SurfaceBrushPaint | null;
};

export type DesignPageSurfaceStateActions = {
  requestFinishPanelOpen: () => void;
  setActiveSurfaceTarget: Dispatch<SetStateAction<SurfaceTargetMode>>;
  setSelectedWallSurfaceTarget: Dispatch<
    SetStateAction<SelectedWallSurfaceTarget | null>
  >;
  setSelectedRendererSurfaceTarget: Dispatch<
    SetStateAction<RendererSurfaceTarget | null>
  >;
  setSurfaceBrushActive: Dispatch<SetStateAction<boolean>>;
  setSurfaceBrushMaterialId: Dispatch<SetStateAction<string | null>>;
  setSurfaceBrushPaint: Dispatch<SetStateAction<SurfaceBrushPaint | null>>;
};

/** Owns the small, shared state surface used by scene targeting and inspectors. */
export function useDesignPageSurfaceStateController(): {
  state: DesignPageSurfaceState;
  actions: DesignPageSurfaceStateActions;
} {
  const [floorFinishPanelOpenSignal, setFloorFinishPanelOpenSignal] =
    useState(0);
  const [activeSurfaceTarget, setActiveSurfaceTarget] =
    useState<SurfaceTargetMode>("floor");
  const [selectedWallSurfaceTarget, setSelectedWallSurfaceTarget] =
    useState<SelectedWallSurfaceTarget | null>(null);
  const [selectedRendererSurfaceTarget, setSelectedRendererSurfaceTarget] =
    useState<RendererSurfaceTarget | null>(null);
  const [surfaceBrushActive, setSurfaceBrushActive] = useState(false);
  const [surfaceBrushMaterialId, setSurfaceBrushMaterialId] = useState<
    string | null
  >(null);
  const [surfaceBrushPaint, setSurfaceBrushPaint] =
    useState<SurfaceBrushPaint | null>(null);

  const requestFinishPanelOpen = useCallback(() => {
    setFloorFinishPanelOpenSignal((signal) => signal + 1);
  }, []);

  return {
    state: {
      floorFinishPanelOpenSignal,
      activeSurfaceTarget,
      selectedWallSurfaceTarget,
      selectedRendererSurfaceTarget,
      surfaceBrushActive,
      surfaceBrushMaterialId,
      surfaceBrushPaint,
    },
    actions: {
      requestFinishPanelOpen,
      setActiveSurfaceTarget,
      setSelectedWallSurfaceTarget,
      setSelectedRendererSurfaceTarget,
      setSurfaceBrushActive,
      setSurfaceBrushMaterialId,
      setSurfaceBrushPaint,
    },
  };
}
