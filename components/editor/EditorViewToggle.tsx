"use client";

export type EditorViewMode = "3d" | "2d";

type EditorViewToggleProps = {
  value: EditorViewMode;
  onChange: (next: EditorViewMode) => void;
  dark?: boolean;
};

export default function EditorViewToggle({ value, onChange, dark = false }: EditorViewToggleProps) {
  const inactive = dark
    ? "rounded-lg bg-[#151820] px-3 py-2 text-sm text-neutral-200"
    : "rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200";

  const active = "rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white";

  return (
    <div className="grid grid-cols-2 gap-2">
      <button className={value === "2d" ? active : inactive} onClick={() => onChange("2d")}>
        2D Plan
      </button>
      <button className={value === "3d" ? active : inactive} onClick={() => onChange("3d")}>
        3D
      </button>
    </div>
  );
}
