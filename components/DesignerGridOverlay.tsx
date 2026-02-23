"use client";

import { useEffect, useState } from "react";

export default function DesignerGridOverlay({
  enabled,
  pulse,
}: {
  enabled: boolean;
  pulse?: boolean;
}) {
  const [pulseActive, setPulseActive] = useState(false);

  useEffect(() => {
    if (!pulse) return;
    setPulseActive(true);
    const t = window.setTimeout(() => setPulseActive(false), 240);
    return () => window.clearTimeout(t);
  }, [pulse]);

  if (!enabled) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className={`designer-grid-mask absolute inset-0 ${
          pulseActive ? "designer-grid-pulse" : ""
        }`}
        style={{
          transform: "perspective(900px) rotateX(55deg)",
          transformOrigin: "center",
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "32px 32px, 32px 32px, 160px 160px, 160px 160px",
          opacity: 0.55,
        }}
      />
    </div>
  );
}
