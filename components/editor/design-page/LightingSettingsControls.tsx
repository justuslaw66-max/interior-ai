"use client";

import {
  LIGHTING_PRESETS,
  type DesignLightingSettings,
  type LightingPreset,
} from "@/lib/lightingPresets";

type LightingSettingsControlsProps = {
  settings: DesignLightingSettings;
  liteEnabled: boolean;
  dark: boolean;
  onPresetChange: (preset: LightingPreset) => void;
  onShadowsEnabledChange: (enabled: boolean) => void;
};

const PRESET_DESCRIPTION: Record<LightingPreset, string> = {
  daylight: "Balanced natural light",
  warm: "Soft evening warmth",
  studio: "Clean neutral lighting",
};

export function LightingSettingsControls({
  settings,
  liteEnabled,
  dark,
  onPresetChange,
  onShadowsEnabledChange,
}: LightingSettingsControlsProps) {
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-bold">Preset</legend>
        <div className="mt-3 grid gap-2" role="radiogroup">
          {(Object.keys(LIGHTING_PRESETS) as LightingPreset[]).map(
            (preset) => {
              const selected = settings.preset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-testid={`lighting-preset-${preset}`}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                    selected
                      ? dark
                        ? "border-blue-400 bg-blue-500/15"
                        : "border-neutral-950 bg-neutral-50"
                      : dark
                        ? "border-white/10 hover:bg-white/5"
                        : "border-neutral-200 hover:bg-neutral-50"
                  }`}
                  onClick={() => onPresetChange(preset)}
                >
                  <span>
                    <span className="block text-sm font-bold">
                      {LIGHTING_PRESETS[preset].name}
                    </span>
                    <span
                      className={
                        dark
                          ? "mt-0.5 block text-xs text-neutral-400"
                          : "mt-0.5 block text-xs text-neutral-600"
                      }
                    >
                      {PRESET_DESCRIPTION[preset]}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`h-4 w-4 rounded-full border-4 ${
                      selected
                        ? dark
                          ? "border-blue-400 bg-neutral-950"
                          : "border-neutral-950 bg-white"
                        : dark
                          ? "border-neutral-600"
                          : "border-neutral-300"
                    }`}
                  />
                </button>
              );
            }
          )}
        </div>
      </fieldset>

      <section aria-labelledby="lighting-shadows-heading">
        <div
          className={`rounded-2xl border p-4 ${
            dark ? "border-white/10 bg-white/5" : "border-neutral-200 bg-neutral-50"
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 id="lighting-shadows-heading" className="text-sm font-bold">
                Shadows
              </h3>
              <p
                className={
                  dark
                    ? "mt-1 text-xs text-neutral-400"
                    : "mt-1 text-xs text-neutral-600"
                }
              >
                Add depth beneath furniture and along walls.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.shadowsEnabled}
              data-testid="lighting-shadows-toggle"
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                settings.shadowsEnabled
                  ? "bg-emerald-500"
                  : dark
                    ? "bg-neutral-700"
                    : "bg-neutral-300"
              }`}
              onClick={() =>
                onShadowsEnabledChange(!settings.shadowsEnabled)
              }
            >
              <span
                aria-hidden="true"
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  settings.shadowsEnabled
                    ? "translate-x-6"
                    : "translate-x-1"
                }`}
              />
              <span className="sr-only">
                {settings.shadowsEnabled ? "Turn shadows off" : "Turn shadows on"}
              </span>
            </button>
          </div>

          {liteEnabled && settings.shadowsEnabled ? (
            <p
              data-testid="lighting-lite-shadow-message"
              className={
                dark
                  ? "mt-3 rounded-xl bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200"
                  : "mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
              }
            >
              Shadows are paused in Lite mode.
            </p>
          ) : null}
        </div>
      </section>

      <p
        className={
          dark
            ? "border-t border-white/10 pt-4 text-xs text-neutral-500"
            : "border-t border-neutral-200 pt-4 text-xs text-neutral-500"
        }
      >
        More controls for exposure, colour temperature, sun position, and
        fixtures can be added here in future releases.
      </p>
    </div>
  );
}
