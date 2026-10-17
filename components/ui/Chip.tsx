import type { ButtonHTMLAttributes } from "react";

/**
 * A chip: one choice in a row that can run on or scroll (the catalogue's categories, the start
 * page's template filters, the share page's rooms), or a small action in such a row (clearing a
 * filter, opening a related product). J's choice on 17 Oct (AX10 area b, question 1, A): the
 * catalogue's pill everywhere, with a grey edge, and the chosen one black like a pressed `Button`
 * (Q3). A one-of chip sets `aria-pressed`, so screen readers hear which one is chosen; leave
 * `pressed` out for an action chip. It shows the app's one focus ring (globals.css).
 *
 * `regular` is 32px, and 44px on phones and touch screens (the touch: variant); `touch` is 44px
 * everywhere, for a page whose every target is 44px (the share page). Two to four short choices
 * that always fit are a `SegmentedControl`; a choice among cards is a `ChoiceTile`.
 */
export type ChipSize = "regular" | "touch";

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & {
  /** In a one-of row: the chosen chip is black and `aria-pressed="true"`. */
  pressed?: boolean;
  size?: ChipSize;
};

const CHIP_BASE_CLASS =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none";
const CHIP_SIZE_CLASS: Record<ChipSize, string> = {
  regular: "h-8 touch:h-11 px-3",
  touch: "min-h-11 min-w-11 px-4",
};
const CHIP_PRESSED_CLASS = "border-neutral-900 bg-neutral-900 text-white";
const CHIP_IDLE_CLASS = "border-neutral-300 bg-white text-neutral-800 enabled:hover:bg-neutral-50";

function chipClassName({ pressed, size, className }: { pressed: boolean; size: ChipSize; className: string }) {
  return [CHIP_BASE_CLASS, CHIP_SIZE_CLASS[size], pressed ? CHIP_PRESSED_CLASS : CHIP_IDLE_CLASS, className]
    .filter(Boolean)
    .join(" ");
}

export function Chip({ pressed, size = "regular", className = "", type = "button", ...props }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={chipClassName({ pressed: pressed === true, size, className })}
      {...props}
    />
  );
}
