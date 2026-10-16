"use client";
import { Button } from "@/components/ui/Button";

type EmptyPlanCanvasPromptProps = {
  actions: {
    startRoom: () => void;
  };
};

export function EmptyPlanCanvasPrompt({ actions }: EmptyPlanCanvasPromptProps) {
  return (
    <div
      data-testid="empty-plan-canvas-prompt"
      className="absolute left-1/2 top-1/2 z-20 w-[min(90vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white/95 p-4 text-center shadow-2xl backdrop-blur"
    >
      <div className="text-base font-semibold text-neutral-950">Create your first room</div>
      <div className="mt-1 text-sm text-neutral-500">
        Start with a room size, then add doors, windows, and furniture.
      </div>
      <Button
        variant="primary" size="touch" className="mt-4"
        onClick={actions.startRoom}
      >
        Start room
      </Button>
    </div>
  );
}
