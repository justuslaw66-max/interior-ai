"use client";

import { Suspense } from "react";
import { DesignPageWorkspace } from "@/components/editor/design-page/DesignPageWorkspace";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white" data-testid="design-page-loading">
          <p className="text-sm text-neutral-500" role="status">Opening your design…</p>
        </div>
      }
    >
      <DesignPageWorkspace />
    </Suspense>
  );
}
