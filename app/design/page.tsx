"use client";

import { Suspense } from "react";
import { DesignPageWorkspace } from "@/components/editor/design-page/DesignPageWorkspace";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-surface" data-testid="design-page-loading">
          <p className="text-sm text-label-secondary" role="status">Opening your design…</p>
        </div>
      }
    >
      <DesignPageWorkspace />
    </Suspense>
  );
}
