type SceneReadyVeilProps = {
  configuration: {
    dark: boolean;
    backgroundColor: string;
  };
};

export function SceneReadyVeil({ configuration }: SceneReadyVeilProps) {
  return (
    <div
      data-testid="scene-ready-veil"
      className={
        configuration.dark
          ? "absolute inset-0 z-20 flex items-end justify-center px-4 pb-8 text-neutral-950"
          : "absolute inset-0 z-20 flex items-end justify-center bg-white px-4 pb-8 text-neutral-950"
      }
      style={
        configuration.dark
          ? { backgroundColor: configuration.backgroundColor }
          : undefined
      }
    >
      <div className="w-[min(340px,calc(100vw-2rem))] rounded-lg border border-neutral-200 bg-white/95 px-4 py-3 text-sm font-semibold shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <span>Preparing room</span>
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full w-2/3 rounded-full bg-neutral-950/80 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
