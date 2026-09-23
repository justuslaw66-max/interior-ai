export const DESIGN_PAGE_REFRESH_ZOOM_EPSILON = 0.01;

type InitialVisualViewport = {
  scale: number;
  offsetLeft: number;
  offsetTop: number;
};

export type DesignPageRefreshZoomTransform = {
  inverseScale: number;
  transform: string;
};

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Counterbalances a pinch-zoom level retained by the browser across refreshes.
 * The transform is intentionally calculated once on mount: zoom gestures made
 * after the refreshed page loads remain available to the user.
 */
export function resolveDesignPageRefreshZoomTransform(
  viewport: InitialVisualViewport | null | undefined
): DesignPageRefreshZoomTransform | null {
  if (
    !viewport ||
    !Number.isFinite(viewport.scale) ||
    viewport.scale <= 1 + DESIGN_PAGE_REFRESH_ZOOM_EPSILON
  ) {
    return null;
  }

  const inverseScale = 1 / viewport.scale;
  const offsetLeft = finiteOrZero(viewport.offsetLeft);
  const offsetTop = finiteOrZero(viewport.offsetTop);

  return {
    inverseScale,
    transform: `translate3d(${offsetLeft}px, ${offsetTop}px, 0) scale(${inverseScale})`,
  };
}
