"use client";

import { useSearchParams } from "next/navigation";

export function useEditorMode(
  canUseDesignerWorkspace: boolean,
  clientPreviewEnabled?: boolean
) {
  const sp = useSearchParams();
  const mode = sp.get("mode");

  const isDesigner = canUseDesignerWorkspace && mode === "designer";
  const isClientPreview = Boolean(isDesigner && clientPreviewEnabled);

  return { isDesigner, isClientPreview };
}
