"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { openFloorPlanUploadWorkspace } from "@/lib/open-floor-plan-upload-workspace";

type FloorPlanWorkspaceOpenerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "id" | "onClick" | "type"
> & {
  semanticId: string;
  isDesigner: boolean;
  onSelectUploadMode: () => void;
  children: ReactNode;
};

export function FloorPlanWorkspaceOpener({
  semanticId,
  isDesigner,
  onSelectUploadMode,
  children,
  ...buttonProps
}: FloorPlanWorkspaceOpenerProps) {
  return (
    <button
      {...buttonProps}
      id={semanticId}
      type="button"
      onClick={() =>
        openFloorPlanUploadWorkspace(
          semanticId,
          isDesigner,
          onSelectUploadMode
        )
      }
    >
      {children}
    </button>
  );
}
