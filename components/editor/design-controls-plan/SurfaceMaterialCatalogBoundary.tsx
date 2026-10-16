"use client";

import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/Button";

type SurfaceMaterialCatalogBoundaryProps = ComponentPropsWithoutRef<"div"> & {
  open: boolean;
  status: "idle" | "loading" | "success" | "error";
  onRetry: () => Promise<unknown>;
  children: ReactNode;
};

export const SurfaceMaterialCatalogBoundary = forwardRef<
  HTMLDivElement,
  SurfaceMaterialCatalogBoundaryProps
>(function SurfaceMaterialCatalogBoundary(
  { open, status, onRetry, children, ...divProps },
  ref
) {
  if (!open) return null;
  return (
    <div ref={ref} {...divProps} data-surface-catalog-status={status}>
      {status === "success" ? (
        children
      ) : (
        <>
          <div
            role="status"
            className="text-xs text-neutral-600"
          >
            {status === "error"
              ? "Surface materials could not be loaded. Your current room finishes are unchanged."
              : "Loading surface materials…"}
          </div>
          {status === "error" ? (
            <Button
              size="compact"
              data-testid="surface-catalog-retry"
              className="mt-2"
              onClick={() => void onRetry().catch(() => undefined)}
            >
              Try again
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
});
