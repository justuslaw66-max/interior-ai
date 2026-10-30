"use client";
import { Button } from "@/components/ui/Button";

type AiLayoutPreviewBannerProps = {
  state: {
    itemCount: number;
    itemNames: string[];
    toneText: string;
  };
  actions: {
    apply: () => void;
    dismiss: () => void;
  };
};

export function AiLayoutPreviewBanner({
  state,
  actions,
}: AiLayoutPreviewBannerProps) {
  return (
    <div
      data-testid="ai-layout-preview-banner" data-surface="floating"
      className="absolute left-1/2 md:left-[var(--canvas-centre-x,50%)] top-36 z-30 md:top-bar-41 flex w-[min(92vw,620px)] md:max-w-[var(--canvas-overlay-max-width,100%)] -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-lg border border-success-tint-border bg-surface-floating/95 ring-1 ring-surface-floating-edge px-4 py-3 text-sm text-control-label shadow-xl backdrop-blur"
    >
      <div className="min-w-0">
        <div className="font-semibold">
          Previewing AI proposal
          <span className="ml-2 text-on-success-tint">
            {state.toneText}
          </span>
        </div>
        <div className="mt-0.5 truncate text-xs text-label-secondary">
          {state.itemCount} item{state.itemCount === 1 ? "" : "s"} shown on canvas
          {state.itemNames.length > 0
            ? `: ${state.itemNames.slice(0, 3).join(", ")}`
            : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          data-testid="ai-layout-preview-apply"
          variant="primary" size="compact"
          onClick={actions.apply}
        >
          Apply
        </Button>
        <Button
          data-testid="ai-layout-preview-dismiss"
          variant="secondary" size="compact"
          onClick={actions.dismiss}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
