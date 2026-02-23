"use client";

import { useSearchParams } from "next/navigation";

export function useEditorMode(userPlan?: string, clientPreviewEnabled?: boolean) {
  const sp = useSearchParams();
  const mode = sp.get("mode");

  const isDesigner = userPlan === "pro" && mode === "designer";
  const isClientPreview = Boolean(isDesigner && clientPreviewEnabled);

  return { isDesigner, isClientPreview };
}
