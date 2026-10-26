"use client";

import { PublicShareFallbackStateReporter } from "@/components/public-share/PublicShareRootLifecycle";
import { Button } from "@/components/ui/Button";

export default function PublicShareError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-grouped p-8">
      <PublicShareFallbackStateReporter state="error" />
      <div className="rounded-xl border border-box-border bg-surface-secondary p-6">
        <h1 className="text-lg font-semibold">Shared design could not load</h1>
        <p className="mt-1 text-sm text-label-secondary">
          The link may still work. Try loading this design again.
        </p>
        <Button
          variant="primary"
          size="touch"
          data-testid="public-share-error-retry"
          className="mt-4"
          data-share-touch-target="true"
          onClick={reset}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
