import type { ReactNode } from "react";

/**
 * Holds an internal page light whatever the device: the admin-only tools and the QA pages, like
 * Admin (dark mode plan, decision 7). data-color-scheme="light" brings back the light colour
 * tokens, and the page's own light background covers the dark one behind it.
 */
export function HeldLight({ children }: { children: ReactNode }) {
  return (
    <div data-color-scheme="light" className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
