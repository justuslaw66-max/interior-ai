"use client";

export type EditorViewMode = "3d" | "2d";

type EditorViewToggleProps = {
  value: EditorViewMode;
  onChange: (next: EditorViewMode) => void;
  dark?: boolean;
};

export default function EditorViewToggle({ value, onChange, dark = false }: EditorViewToggleProps) {
  const inactive = dark
    ? "designer-work-control rounded-full px-4 py-1.5 text-sm font-semibold"
    : "rounded-full px-4 py-1.5 text-sm font-semibold text-neutral-600 hover:bg-white";

  const active = dark
    ? "designer-work-control-active rounded-full px-4 py-1.5 text-sm font-semibold"
    : "rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm";

  return (
    <div
      className={
        dark
          ? "designer-work-surface grid grid-cols-2 gap-1 rounded-full p-1"
          : "grid grid-cols-2 gap-1 rounded-full bg-neutral-100 p-1"
      }
    >
      <button type="button" className={value === "2d" ? active : inactive} onClick={() => onChange("2d")}>
        2D Plan
      </button>
      <button type="button" className={value === "3d" ? active : inactive} onClick={() => onChange("3d")}>
        3D
      </button>
    </div>
  );
}
