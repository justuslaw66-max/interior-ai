"use client";

export interface BetaStartPanelProps {
  state: {
    nextStepLabel: string | null;
    progressPercent: number;
  };
  actions: {
    dismiss: () => void;
    chooseTemplate: () => void;
    drawRoom: () => void;
    uploadPlan: () => void;
    generateAiLayout: () => void;
  };
}

export function BetaStartPanel({ state, actions }: BetaStartPanelProps) {
  return (
    <div
      data-testid="beta-start-panel"
      className="fixed bottom-4 left-1/2 z-30 max-h-[calc(100vh-7rem)] w-[min(92vw,760px)] -translate-x-1/2 overflow-y-auto rounded-2xl border border-neutral-200 bg-white/95 p-4 shadow-2xl backdrop-blur"
      role="region"
      aria-label="Public beta fast start"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Public beta fast start
          </div>
          <h2 className="mt-1 text-xl font-semibold text-neutral-950">
            Start with the path that matches your room
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600">
            Pick a template, draw in measured 2D, upload a floor plan, or let AI propose the first furniture layout.
          </p>
        </div>
        <button
          type="button"
          className="self-start rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
          onClick={actions.dismiss}
        >
          Dismiss
        </button>
      </div>

      <div
        data-testid="beta-start-activation-progress"
        className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              First run progress
            </div>
            <div className="mt-0.5 text-sm font-semibold text-neutral-950">
              {state.nextStepLabel ?? "Ready to share"}
            </div>
          </div>
          <div className="text-sm font-semibold text-neutral-700">
            {state.progressPercent}%
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${state.progressPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StartPathButton
          testId="beta-start-template"
          title="Choose template"
          description="Living room now; bedroom, dining, office, and whole-home beta paths are visible in Plan."
          onClick={actions.chooseTemplate}
        />
        <StartPathButton
          testId="beta-start-draw-room"
          title="Draw room"
          description="Use measured 2D editing with snapping, dimensions, doors, and windows."
          onClick={actions.drawRoom}
        />
        <StartPathButton
          testId="beta-start-upload-plan"
          title="Upload floor plan"
          description="Import an image or PDF, calibrate scale, then trace rooms and openings."
          onClick={actions.uploadPlan}
        />
        <StartPathButton
          testId="beta-start-ai-layout"
          title="Generate AI layout"
          description="Review an AI starter proposal before anything is applied."
          accent
          onClick={actions.generateAiLayout}
        />
      </div>
    </div>
  );
}

function StartPathButton({
  testId,
  title,
  description,
  accent = false,
  onClick,
}: {
  testId: string;
  title: string;
  description: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      className={
        accent
          ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left transition hover:border-emerald-300 hover:bg-white"
          : "rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-left transition hover:border-neutral-300 hover:bg-white"
      }
      onClick={onClick}
    >
      <div className="text-sm font-semibold text-neutral-950">{title}</div>
      <div className="mt-1 text-xs text-neutral-600">{description}</div>
    </button>
  );
}
