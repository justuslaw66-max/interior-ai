"use client";

import { useEffect } from "react";
import { buttonClassName, Button } from "@/components/ui/Button";

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
      <section className="max-w-md rounded-2xl border border-box-border bg-surface-secondary p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-label">Something went wrong</h1>
        <p className="mt-2 text-sm text-label-secondary">
          Your saved design data has not been removed. Retry this screen; if the
          problem continues, return to My designs and reopen the design.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="primary" onClick={reset}>
            Retry
          </Button>
          <a href="/dashboard" className={buttonClassName()}>
            My designs
          </a>
        </div>
      </section>
    </main>
  );
}
