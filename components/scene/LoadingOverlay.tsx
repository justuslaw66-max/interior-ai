"use client";

import { useProgress } from "@react-three/drei/core/Progress";
import { Html } from "@react-three/drei/web/Html";

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
          alignItems: "flex-end",
          justifyContent: "center",
          paddingBottom: 24,
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
