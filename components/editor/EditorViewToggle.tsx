"use client";

import { trackProductEvent } from "@/lib/analytics";

export type EditorViewMode = "3d" | "2d";

type EditorViewToggleProps = {
  value: EditorViewMode;
  onChange: (next: EditorViewMode) => void;
  dark?: boolean;
};

export default function EditorViewToggle({ value, onChange, dark = false }: EditorViewToggleProps) {
  const inactive = dark
    ? "designer-work-control rounded-full px-2 py-1.5 text-sm font-semibold sm:px-4"
    : "rounded-full px-2 py-1.5 text-sm font-semibold text-neutral-600 hover:bg-white sm:px-4";

  const active = dark
    ? "designer-work-control-active rounded-full px-2 py-1.5 text-sm font-semibold sm:px-4"
    : "rounded-full bg-emerald-500 px-2 py-1.5 text-sm font-semibold text-white shadow-sm sm:px-4";

  return (
    <div
      role="group"
      aria-label="Design view"
      data-testid="editor-view-toggle"
      className={
        dark
          ? "designer-work-surface grid grid-cols-2 gap-1 rounded-full p-1"
          : "grid grid-cols-2 gap-1 rounded-full bg-neutral-100 p-1"
      }
    >
      <button
        type="button"
        aria-label="2D Plan"
        aria-pressed={value === "2d"}
        data-testid="editor-view-2d"
        className={value === "2d" ? active : inactive}
        onClick={() => onChange("2d")}
      >
        <span className="sm:hidden">2D</span>
        <span className="hidden sm:inline">2D Plan</span>
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
