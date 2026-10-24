"use client";

/** "Pro tools" beside the bar's controls while Pro's tools are on (not in Client Preview). */
export function CommandBarProIndicator({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span
      data-testid="pro-mode-indicator"
      role="status"
      aria-label="Pro tools on"
      className="inline-flex h-7 shrink-0 items-center rounded-full border border-accent-tint-border bg-accent-tint px-2 text-xs font-bold text-on-accent-tint max-[390px]:hidden"
    >
      <span className="lg:hidden">Pro</span>
      <span className="hidden lg:inline">Pro tools</span>
    </span>
  );
}
