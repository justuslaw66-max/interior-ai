export function SceneReadyVeil() {
  return (
    <div
      data-testid="scene-ready-veil"
      className="absolute inset-0 z-20 flex items-end justify-center px-4 pb-8 text-label"
    >
      <div data-surface="floating" className="w-[min(340px,calc(100vw-2rem))] rounded-lg border border-separator bg-surface-floating/95 px-4 py-3 text-sm font-semibold shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <span>Preparing room</span>
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-control-track">
          <div className="h-full w-2/3 rounded-full bg-control-primary/80 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
