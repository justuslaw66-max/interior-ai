"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application boundary recovered an error", {
      errorType: error.name,
      hasDigest: Boolean(error.digest),
    });
  }, [error]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <section className="max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Your saved design data has not been removed. Retry this screen; if the
          problem continues, return to your dashboard and reopen the design.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
          <a
            href="/dashboard"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800"
          >
            Dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
