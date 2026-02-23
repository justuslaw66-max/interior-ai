import { LIGHTING_PRESETS, type LightingPreset } from "@/lib/lightingPresets";

interface LightingPresetsProps {
  current: LightingPreset;
  onChange: (preset: LightingPreset) => void;
  theme?: "designer" | "default";
}

/**
 * Lighting preset selector UI
 */
export function LightingPresetsUI({ current, onChange, theme = "default" }: LightingPresetsProps) {
  const presets: LightingPreset[] = ["daylight", "warm", "studio"];

  return (
    <div
      className={
        theme === "designer"
          ? "designer-panel rounded-xl p-3"
          : "rounded-xl bg-white p-3 shadow"
      }
    >
      <div
        className={
          theme === "designer"
            ? "designer-text-primary text-xs font-semibold uppercase tracking-wide"
            : "text-xs font-semibold uppercase tracking-wide text-neutral-600"
        }
      >
        Lighting
      </div>
      <div className="mt-2 flex gap-2">
        {presets.map((preset) => {
          const config = LIGHTING_PRESETS[preset];
          const isActive = current === preset;
          return (
            <button
              key={preset}
              onClick={() => onChange(preset)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? theme === "designer"
                    ? "designer-button-active"
                    : "bg-neutral-900 text-white"
                  : theme === "designer"
                    ? "designer-button"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
              title={config.name}
            >
              {preset === "daylight" && "☀️"}
              {preset === "warm" && "🌅"}
              {preset === "studio" && "💡"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
