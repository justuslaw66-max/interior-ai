import { forwardRef, type ButtonHTMLAttributes } from "react";

/**
 * The app's one button (UX audit AX10, phase 4b). Primary is black, secondary an outline, quiet
 * has no border, danger is red; the focus ring is the one accent blue. `touch` is 44px tall for
 * dialogs, sheets and anything a finger presses; `compact` is the 30px desktop size for dense
 * bars (phase 4d grows it to 44px on touch screens). `icon` is a 36px square for an icon with an
 * accessible name (the canvas toolbar, UX 4c), and `round` a 40px circle (the canvas corner).
 */
export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "touch" | "compact" | "icon" | "round";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center gap-2 border font-semibold outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none";

const BUTTON_VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800",
  secondary: "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
  quiet: "border-transparent bg-transparent text-neutral-800 hover:bg-neutral-100",
  danger: "border-red-600 bg-red-600 text-white hover:bg-red-700",
};

const BUTTON_SIZE_CLASS: Record<ButtonSize, string> = {
  touch: "min-h-11 rounded-lg px-4 py-2 text-sm",
  compact: "h-[30px] rounded-lg px-3 text-xs",
  icon: "h-9 w-9 shrink-0 rounded-lg p-0",
  round: "h-10 w-10 shrink-0 rounded-full p-0",
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
  { variant = "secondary", size = "touch", className = "", type = "button", ...props },
  ref
) {
  return <button ref={ref} type={type} className={buttonClassName({ variant, size, className })} {...props} />;
});
