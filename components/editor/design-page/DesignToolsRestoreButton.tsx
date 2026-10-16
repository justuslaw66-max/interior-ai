"use client";

import { Button } from "@/components/ui/Button";

type DesignToolsRestoreButtonProps = {
  state: {
    label: string;
  };
  actions: {
    restore: () => void;
  };
};

export function DesignToolsRestoreButton({
  state,
  actions,
}: DesignToolsRestoreButtonProps) {
  return (
    <Button
      size="compact"
      data-testid="design-tools-restore"
      className="pointer-events-auto absolute bottom-4 left-4 z-30 shadow-xl"
      aria-label={`Show ${state.label.toLowerCase()}`}
      onClick={actions.restore}
    >
      {state.label}
    </Button>
  );
}
