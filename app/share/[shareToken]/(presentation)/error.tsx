"use client";

import { PublicShareFallbackStateReporter } from "@/components/public-share/PublicShareRootLifecycle";

export default function PublicShareError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-8">
      <PublicShareFallbackStateReporter state="error" />
      <div className="rounded-xl border bg-white p-6">
        <h1 className="text-lg font-semibold">Shared design could not load</h1>
        <p className="mt-1 text-sm text-neutral-600">
          The link may still be valid. Try loading the public presentation again.
        </p>
        <button
          type="button"
          data-testid="public-share-error-retry"
          className="mt-4 min-h-11 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white outline-offset-2 focus-visible:outline-2"
          data-share-touch-target="true"
          onClick={reset}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
