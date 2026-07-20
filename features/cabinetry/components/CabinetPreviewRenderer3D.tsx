"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

import type { CabinetPreviewView } from "./CabinetPreviewCameraController";

type CabinetPreviewReadySignalProps = {
  previewKey: string;
  onReady: (previewKey: string) => void;
};

function CabinetPreviewReadySignal({
  previewKey,
  onReady,
}: CabinetPreviewReadySignalProps) {
  const invalidate = useThree((state) => state.invalidate);
  const frameCountRef = useRef(0);
  const reportedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    frameCountRef.current = 0;
    reportedKeyRef.current = null;
    invalidate();
  }, [invalidate, previewKey]);

  useFrame(() => {
    if (reportedKeyRef.current === previewKey) return;
    frameCountRef.current += 1;
    if (frameCountRef.current < 3) return;
    reportedKeyRef.current = previewKey;
    onReady(previewKey);
  });

  return null;
}

export type CabinetPreviewRenderer3DProps = {
  definitionId: string;
  presetId?: string;
  view: CabinetPreviewView;
  previewRenderKey: string;
  initialCameraPosition: [number, number, number];
  children: ReactNode;
};

/** Owns the preview Canvas, WebGL policy, and frame-backed readiness lifecycle. */
export function CabinetPreviewRenderer3D({
  definitionId,
  presetId,
  view,
  previewRenderKey,
  initialCameraPosition,
  children,
}: CabinetPreviewRenderer3DProps) {
  const [renderedPreviewKey, setRenderedPreviewKey] = useState<string | null>(null);
  const previewReady = renderedPreviewKey === previewRenderKey;
  const handlePreviewReady = useCallback((readyKey: string) => {
    setRenderedPreviewKey((current) => (current === readyKey ? current : readyKey));
  }, []);

  return (
    <Canvas
      data-cabinet-preview-renderer="rc5"
      data-shadow-maps-enabled="false"
      data-front-axis="negative-z"
      data-render-color-space="srgb"
      data-tone-mapping="aces-filmic"
      data-preview-definition-id={definitionId}
      data-preview-preset-id={presetId ?? ""}
      data-preview-view={view}
      data-preview-ready={previewReady ? "true" : "false"}
      data-preview-ready-key={previewReady ? previewRenderKey : ""}
      shadows={false}
      gl={{
        antialias: true,
        outputColorSpace: THREE.SRGBColorSpace,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.96,
      }}
      camera={{
        position: initialCameraPosition,
        fov: 42,
        near: 0.01,
        far: 50,
      }}
    >
      <CabinetPreviewReadySignal
        previewKey={previewRenderKey}
        onReady={handlePreviewReady}
      />
      {children}
    </Canvas>
  );
}
