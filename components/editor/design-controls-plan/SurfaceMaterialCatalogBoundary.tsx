"use client";

import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

type SurfaceMaterialCatalogBoundaryProps = ComponentPropsWithoutRef<"div"> & {
  open: boolean;
  status: "idle" | "loading" | "success" | "error";
  dark: boolean;
  retryActionClass: string;
  onRetry: () => Promise<unknown>;
  children: ReactNode;
};

export const SurfaceMaterialCatalogBoundary = forwardRef<
  HTMLDivElement,
  SurfaceMaterialCatalogBoundaryProps
>(function SurfaceMaterialCatalogBoundary(
  { open, status, dark, retryActionClass, onRetry, children, ...divProps },
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
            className={dark ? "text-xs text-neutral-300" : "text-xs text-neutral-600"}
          >
            {status === "error"
              ? "Surface materials could not be loaded. Your current room finishes are unchanged."
              : "Loading surface materials…"}
          </div>
          {status === "error" ? (
            <button
              type="button"
              data-testid="surface-catalog-retry"
              className={`${retryActionClass} mt-2`}
              onClick={() => void onRetry().catch(() => undefined)}
            >
              Try again
            </button>
          ) : null}
        </>
      )}
    </div>
  );
});
