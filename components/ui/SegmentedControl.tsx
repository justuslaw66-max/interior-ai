import type { ReactNode } from "react";

/**
 * One choice out of two to four (UX 5n, J's choice on 14 Oct): 2D/3D, Simple/Detailed, Paint or
 * Materials, a pattern's rotation. A grey track holds the segments and the pressed one is black, as
 * Q3 asks of pressed toggles. Each segment is a button with `aria-pressed`, in a labelled group, so
 * screen readers hear which choice is on and Tab reaches every segment.
 *
 * The sizes are the Button's heights, so a control lines up with the buttons beside it: `compact`
 * 30px, `regular` 36px and `touch` 44px, track included. On phones and touch screens every segment
 * is a 44px target (the touch: variant in globals.css). `track={false}` drops the grey track for a
 * control that sits in a floating pill of its own (the phone's 2D | 3D); its segments are then the
 * full height. `fill` spreads the control across its container in equal segments; a segment whose
 * label needs more room takes it from the others, so every label stays on one line.
 *
 * On/off toggles that aren't a choice between options (Grid, Snap, Details) are a `Button` with
 * `pressed` instead.
 */
export type SegmentedControlSize = "compact" | "regular" | "touch";

export type SegmentedControlOption<T extends string | number> = {
  value: T;
  label: ReactNode;
  /** The segment's accessible name, when its label is an icon or shortened. */
  ariaLabel?: string;
  /** An icon before the label, drawn in the text colour. */
  icon?: ReactNode;
  testId?: string;
  title?: string;
  disabled?: boolean;
};

export type SegmentedControlProps<T extends string | number> = {
  /** The group's accessible name. */
  label: string;
  value: T | null;
  onChange: (next: T) => void;
  options: readonly SegmentedControlOption<T>[];
  size?: SegmentedControlSize;
  fill?: boolean;
  track?: boolean;
  disabled?: boolean;
  testId?: string;
  /** Layout only (margins, width); the look is the control's own. */
  className?: string;
};

const TRACK_CLASS: Record<SegmentedControlSize, string> = {
  compact: "gap-0.5 rounded-lg bg-neutral-100 p-0.5",
  regular: "gap-0.5 rounded-[10px] bg-neutral-100 p-0.5",
  touch: "gap-0.5 rounded-xl bg-neutral-100 p-0.5",
};

const SEGMENT_SIZE_CLASS: Record<SegmentedControlSize, string> = {
  compact: "h-[26px] touch:h-11 rounded-md px-2 text-xs",
  regular: "h-8 touch:h-11 rounded-lg px-3.5 text-sm",
  touch: "h-10 touch:h-11 rounded-[10px] px-4 text-sm",
};

// Without a track the segments are the size's full height.
const BARE_SEGMENT_SIZE_CLASS: Record<SegmentedControlSize, string> = {
  compact: "h-[30px] touch:h-11 rounded-lg px-3 text-xs",
  regular: "h-9 touch:h-11 rounded-lg px-3.5 text-sm",
  touch: "h-11 min-w-12 rounded-[9px] px-3 text-sm",
};

const SEGMENT_BASE_CLASS =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold leading-none outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none";

const SEGMENT_PRESSED_CLASS = "bg-neutral-900 text-white";
const SEGMENT_IDLE_CLASS = "text-neutral-700 enabled:hover:bg-white enabled:hover:text-neutral-900";

/** The class list for one segment, for a control that can't be a `<SegmentedControl>`. */
export function segmentClassName({
  pressed,
  size = "regular",
  track = true,
  className = "",
}: { pressed: boolean; size?: SegmentedControlSize; track?: boolean; className?: string }): string {
  return [
    SEGMENT_BASE_CLASS,
    (track ? SEGMENT_SIZE_CLASS : BARE_SEGMENT_SIZE_CLASS)[size],
    pressed ? SEGMENT_PRESSED_CLASS : SEGMENT_IDLE_CLASS,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function SegmentedControl<T extends string | number>({
  label,
  value,
  onChange,
  options,
  size = "regular",
  fill = false,
  track = true,
  disabled = false,
  testId,
  className = "",
}: SegmentedControlProps<T>) {
  const groupClass = [fill ? "flex w-full" : "inline-flex", track ? TRACK_CLASS[size] : "gap-0.5", className]
    .filter(Boolean)
    .join(" ");
  const segmentFill = fill ? "flex-1 basis-0" : "";
  return (
    <div role="group" aria-label={label} data-testid={testId} className={groupClass}>
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={pressed}
            aria-label={option.ariaLabel}
            title={option.title}
            data-testid={option.testId}
            disabled={disabled || option.disabled}
            className={segmentClassName({ pressed, size, track, className: segmentFill })}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
