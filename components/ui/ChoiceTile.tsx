import type { ButtonHTMLAttributes } from "react";

/**
 * One option out of several: a product's configuration, orientation, model or named finish, and
 * the AI layout's goal and style (UX 5n, J's choice on 16 Oct: the app's controls, not each
 * brand's palette). It's a white tile, and the chosen one has a black edge; photos, diagrams and
 * swatch images inside keep their own colours. It sets `aria-pressed`, so screen readers hear
 * which option is chosen, and shows the app's one focus ring (globals.css). The edge is 1px, and
 * the chosen tile adds a second pixel inside it, so choosing an option doesn't move its content.
 *
 * The caller lays out the content: `className` sets the padding, height and alignment. A choice
 * between two to four short labels is a `SegmentedControl`; an on/off toggle is a `Button` with
 * `pressed`.
 */
export type ChoiceTileProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & {
  /** The chosen option: a black edge and `aria-pressed="true"`. */
  selected: boolean;
};

/**
 * A chosen swatch's ring, as a `box-shadow`: a white gap, then black (UX 5n, J, 16 Oct; the
 * catalogue's swatches too, J, 17 Oct). The swatch keeps its colour or texture, whole.
 */
export const CHOSEN_SWATCH_RING = "0 0 0 2px #fff, 0 0 0 4px #171717";

const CHOICE_TILE_BASE_CLASS =
  "rounded-lg border bg-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none";
const CHOICE_TILE_SELECTED_CLASS = "border-neutral-900 text-neutral-900 inset-ring inset-ring-neutral-900";
const CHOICE_TILE_IDLE_CLASS =
  "border-neutral-200 text-neutral-700 enabled:hover:border-neutral-400 enabled:hover:text-neutral-900";

function choiceTileClassName({ selected, className = "" }: { selected: boolean; className?: string }): string {
  return [CHOICE_TILE_BASE_CLASS, selected ? CHOICE_TILE_SELECTED_CLASS : CHOICE_TILE_IDLE_CLASS, className]
    .filter(Boolean)
    .join(" ");
}

export function ChoiceTile({ selected, className = "", type = "button", ...props }: ChoiceTileProps) {
  return <button type={type} aria-pressed={selected} className={choiceTileClassName({ selected, className })} {...props} />;
}
