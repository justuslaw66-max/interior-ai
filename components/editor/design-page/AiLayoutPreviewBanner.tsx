"use client";

type AiLayoutPreviewBannerProps = {
  state: {
    itemCount: number;
    itemNames: string[];
    toneText: string;
  };
  configuration: {
    dark: boolean;
  };
  actions: {
    apply: () => void;
    dismiss: () => void;
  };
};

export function AiLayoutPreviewBanner({
  state,
  configuration,
  actions,
}: AiLayoutPreviewBannerProps) {
  return (
    <div
      data-testid="ai-layout-preview-banner"
      className={
        configuration.dark
          ? "designer-dock absolute left-1/2 top-36 z-30 flex w-[min(92vw,620px)] -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm text-neutral-100"
          : "absolute left-1/2 top-36 z-30 flex w-[min(92vw,620px)] -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-white/95 px-4 py-3 text-sm text-neutral-800 shadow-xl backdrop-blur"
      }
    >
      <div className="min-w-0">
        <div className="font-semibold">
          Previewing AI proposal
          <span className={configuration.dark ? "ml-2 text-emerald-200" : "ml-2 text-emerald-700"}>
            {state.toneText}
          </span>
        </div>
        <div className={configuration.dark ? "mt-0.5 truncate text-xs text-neutral-300" : "mt-0.5 truncate text-xs text-neutral-600"}>
          {state.itemCount} item{state.itemCount === 1 ? "" : "s"} shown on canvas
          {state.itemNames.length > 0
            ? `: ${state.itemNames.slice(0, 3).join(", ")}`
            : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          data-testid="ai-layout-preview-apply"
          className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
          onClick={actions.apply}
        >
          Apply
        </button>
        <button
          type="button"
          data-testid="ai-layout-preview-dismiss"
          className={
            configuration.dark
              ? "rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-neutral-100 hover:bg-white/10"
              : "rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          }
          onClick={actions.dismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
