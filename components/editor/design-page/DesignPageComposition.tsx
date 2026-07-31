"use client";

import { useCallback, type ReactNode } from "react";
import { resolveDesignPageRefreshZoomTransform } from "@/lib/design-page-refresh-zoom";

type DesignPageCompositionProps = {
  configuration: {
    designerTheme: boolean;
  };
  children: ReactNode;
};

export function DesignPageComposition({
  configuration,
  children,
}: DesignPageCompositionProps) {
  const resetRetainedRefreshZoom = useCallback((shell: HTMLElement | null) => {
    if (!shell) return;

    const refreshZoom = resolveDesignPageRefreshZoomTransform(
      window.visualViewport
    );
    if (!refreshZoom) return;

    shell.style.transform = refreshZoom.transform;
    shell.style.transformOrigin = "top left";
    shell.dataset.refreshZoomReset = refreshZoom.inverseScale.toFixed(6);
  }, []);

  return (
    <main
      ref={resetRetainedRefreshZoom}
      className="appShell relative min-h-screen w-screen"
      data-theme={configuration.designerTheme ? "designer" : "default"}
      style={{ transition: "background 200ms ease, color 200ms ease" }}
    >
      {children}
    </main>
  );
}
