"use client";

import { Html, useProgress } from "@react-three/drei";

export function LoadingOverlay() {
  const { active, progress, item, loaded, total } = useProgress();

  if (!active) return null;

  return (
    <Html fullscreen style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "color-mix(in oklab, var(--bg-canvas) 92%, transparent)",
          backdropFilter: "blur(10px)",
          color: "var(--text-primary)",
        }}
      >
        <div className="panel" style={{ width: 360, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            Preparing your editor...
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
            Loading assets {loaded}/{total}
          </div>

          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.round(progress))}%`,
                height: "100%",
                background: "var(--accent)",
                transition: "width 180ms ease",
              }}
            />
          </div>

          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 10 }}>
            {item ? `Loading: ${item}` : "Loading..."}
          </div>
        </div>
      </div>
    </Html>
  );
}
