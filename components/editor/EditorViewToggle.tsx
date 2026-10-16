"use client";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { trackProductEvent } from "@/lib/analytics";

export type EditorViewMode = "3d" | "2d";

type EditorViewToggleProps = {
  value: EditorViewMode;
  onChange: (next: EditorViewMode) => void;
  /** `canvas`: the canvas toolbar's 36px control with 32px segments (UX 4c); `pill`: the phone's 44px segments, in the pill over the canvas (UX 4d). */
  variant: "canvas" | "pill";
};

const VIEW_OPTIONS = [
  { value: "2d", label: "2D", testId: "editor-view-2d" },
  { value: "3d", label: "3D", testId: "editor-view-3d" },
] as const;

/** 2D | 3D, the shared segmented control (UX 5n). On phones the pill over the canvas is its track. */
export default function EditorViewToggle({ value, onChange, variant }: EditorViewToggleProps) {
  return (
    <SegmentedControl
      label="Design view"
      testId="editor-view-toggle"
      value={value}
      size={variant === "pill" ? "touch" : "regular"}
      track={variant === "canvas"}
      options={VIEW_OPTIONS}
      onChange={(next) => {
        onChange(next);
        if (next === "3d" && value !== "3d") {
          trackProductEvent("view_switched_to_3d", {
            source: "editor_view_toggle",
            viewMode: "3d",
            result: "success",
          });
        }
      }}
    />
  );
}
