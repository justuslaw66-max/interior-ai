"use client";

import { trackProductEvent } from "@/lib/analytics";

export type EditorViewMode = "3d" | "2d";

type EditorViewToggleProps = {
  value: EditorViewMode;
  onChange: (next: EditorViewMode) => void;
  dark?: boolean;
  /**
   * `canvas`: the canvas toolbar's 32px segments (UX 4c); `pill`: the phone's 44px segments over
   * the canvas (UX 4d); `bar`: a 30px pill (Present & export's saved views).
   */
  variant?: "bar" | "canvas" | "pill";
};

const CANVAS_SEGMENT_CLASS =
  "inline-flex h-8 items-center justify-center rounded-[7px] px-3.5 text-[13px] font-bold leading-none";
const PILL_SEGMENT_CLASS =
  "inline-flex h-11 w-12 items-center justify-center rounded-[9px] text-sm font-bold leading-none";

function toggleClasses(dark: boolean, variant: "bar" | "canvas" | "pill") {
  if (variant === "pill") return {
    shell: "grid grid-cols-2 gap-0.5",
    inactive: `${PILL_SEGMENT_CLASS} ${dark ? "designer-work-control" : "text-neutral-700 hover:bg-neutral-100"}`,
    active: `${PILL_SEGMENT_CLASS} ${dark ? "designer-work-control-active" : "bg-neutral-900 text-white"}`,
  };
  if (variant === "canvas") return {
    shell: dark ? "designer-work-surface grid grid-cols-2 gap-0.5 rounded-[9px] p-0.5" : "grid grid-cols-2 gap-0.5 rounded-[9px] bg-neutral-100 p-0.5",
    inactive: `${CANVAS_SEGMENT_CLASS} ${dark ? "designer-work-control" : "text-neutral-700 hover:bg-white"}`,
    active: `${CANVAS_SEGMENT_CLASS} ${dark ? "designer-work-control-active" : "bg-neutral-900 text-white"}`,
  };
  return {
    shell: dark
      ? "designer-work-surface grid h-[30px] grid-cols-2 gap-1 rounded-full p-0.5"
      : "grid h-[30px] grid-cols-2 gap-1 rounded-full bg-neutral-100 p-0.5",
    inactive: dark
      ? "designer-work-control inline-flex h-[26px] items-center justify-center rounded-full px-2 text-sm font-semibold leading-none sm:px-4"
      : "inline-flex h-[26px] items-center justify-center rounded-full px-2 text-sm font-semibold leading-none text-neutral-600 hover:bg-white sm:px-4",
    active: dark
      ? "designer-work-control-active inline-flex h-[26px] items-center justify-center rounded-full px-2 text-sm font-semibold leading-none sm:px-4"
      : "inline-flex h-[26px] items-center justify-center rounded-full bg-neutral-900 px-2 text-sm font-semibold leading-none text-white shadow-sm sm:px-4",
  };
}

export default function EditorViewToggle({ value, onChange, dark = false, variant = "bar" }: EditorViewToggleProps) {
  const { shell, inactive, active } = toggleClasses(dark, variant);

  return (
    <div
      role="group"
      aria-label="Design view"
      data-testid="editor-view-toggle"
      className={shell}
    >
      <button
        type="button"
        aria-label="2D"
        aria-pressed={value === "2d"}
        data-testid="editor-view-2d"
        className={value === "2d" ? active : inactive}
        onClick={() => onChange("2d")}
      >
        2D
      </button>
      <button
        type="button"
        aria-label="3D"
        aria-pressed={value === "3d"}
        data-testid="editor-view-3d"
        className={value === "3d" ? active : inactive}
        onClick={() => {
          onChange("3d");
          if (value !== "3d") {
            trackProductEvent("view_switched_to_3d", {
              source: "editor_view_toggle",
              viewMode: "3d",
              result: "success",
            });
          }
        }}
      >
        3D
      </button>
    </div>
  );
}
