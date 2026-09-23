"use client";

import { Suspense } from "react";
import { DesignPageWorkspace } from "@/components/editor/design-page/DesignPageWorkspace";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <DesignPageWorkspace />
    </Suspense>
  );
}
