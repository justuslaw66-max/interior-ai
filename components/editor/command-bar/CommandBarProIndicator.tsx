"use client";

/** "Pro tools" beside the bar's controls while Pro's tools are on (not in Client Preview). */
export function CommandBarProIndicator({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span
      data-testid="pro-mode-indicator"
      role="status"
      aria-label="Pro tools on"
      className="inline-flex h-[30px] shrink-0 items-center rounded-full border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold text-blue-700 max-[390px]:hidden md:h-7"
    >
      <span className="lg:hidden">Pro</span>
      <span className="hidden lg:inline">Pro tools</span>
    </span>
  );
}
