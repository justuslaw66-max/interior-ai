import { forwardRef, type ButtonHTMLAttributes } from "react";

/**
 * The app's one button (UX audit AX10, phase 4b). Primary is black, secondary an outline, quiet
 * has no border, danger is red; the focus ring is the one accent blue. `touch` is 44px tall for
 * dialogs, sheets and anything a finger presses; `regular` is the 36px size of the panels' buttons
 * (UX 5m, J's choice on 13 Oct); `compact` is the 30px size for dense bars. `icon` is a 36px
 * square for an icon with an accessible name (the canvas toolbar, UX 4c), and `round` a 40px
 * circle (the canvas corner). On phones and touch screens all of them are 44px (UX 4d, the touch:
 * variant in globals.css). `pressed` makes it an on/off toggle (Grid, Snap, Details): it sets
 * `aria-pressed` and takes the primary look while on, as Q3 asks of pressed toggles (UX 5n, J's
 * choice on 14 Oct). A choice between options is a `SegmentedControl` instead.
 *
 * Two more for 5n's last part (J, 16 Oct): `link` is the one link look, in the accent blue and
 * underlined on hover and focus (Q3: blue is for links), with the `inline` size, which keeps the
 * surrounding text's size and line; a link that stands alone adds its own target height. `mini` is
 * a 24px square for controls docked to a map or a panel's edge (the room navigator, the floating
 * panels' rail), 44px on touch screens like every other size.
 */
export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "link";
export type ButtonSize = "touch" | "regular" | "compact" | "icon" | "round" | "mini" | "inline";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** An on/off toggle: on is the primary look and `aria-pressed="true"`, off is `variant`. */
  pressed?: boolean;
};

const BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center gap-2 border font-semibold outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none";

const BUTTON_VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800",
  secondary: "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
  quiet: "border-transparent bg-transparent text-neutral-800 hover:bg-neutral-100",
  danger: "border-red-600 bg-red-600 text-white hover:bg-red-700",
  link: "border-transparent bg-transparent text-accent underline-offset-2 hover:underline focus-visible:underline",
};

const BUTTON_SIZE_CLASS: Record<ButtonSize, string> = {
  touch: "min-h-11 rounded-lg px-4 py-2 text-sm",
  regular: "touch:min-h-11 min-h-9 rounded-lg px-3.5 py-1.5 text-sm",
  compact: "touch:h-11 h-[30px] rounded-lg px-3 text-xs",
  icon: "touch:h-11 touch:w-11 h-9 w-9 shrink-0 rounded-lg p-0",
  round: "touch:h-11 touch:w-11 h-10 w-10 shrink-0 rounded-full p-0",
  mini: "touch:h-11 touch:w-11 h-6 w-6 shrink-0 rounded-md p-0",
  inline: "rounded-sm p-0",
};

/** The class list for a button that can't be a `<Button>` (a link styled as one, say). */
export function buttonClassName({
  variant = "secondary",
  size = "touch",
  className = "",
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return [BUTTON_BASE_CLASS, BUTTON_SIZE_CLASS[size], BUTTON_VARIANT_CLASS[variant], className]
    .filter(Boolean)
    .join(" ");
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "touch", className = "", type = "button", pressed, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={buttonClassName({ variant: pressed ? "primary" : variant, size, className })}
      {...props}
    />
  );
});
