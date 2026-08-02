"use client";

import {
  CONSUMER_LIGHTING_MODES,
  EDITOR_LIGHTING_PRESETS,
  resolveLightingMode,
  resolvePersistedLightingPreset,
} from "@/components/editor/design-page/lighting";
import type {
  DesignLightingSettings,
  LightingPreset,
} from "@/lib/lightingPresets";
import type { ScenePerformanceMode } from "@/lib/useDesignPageScenePerformance";

type LightingSettingsControlsProps = {
  settings: DesignLightingSettings;
  liteEnabled: boolean;
  dark: boolean;
  advanced: boolean;
  performanceMode: ScenePerformanceMode;
  placedFixtureCount: number;
  activeFixtureCount: number;
  estimatedFixtureCount: number;
  onPresetChange: (preset: LightingPreset) => void;
  onShadowsEnabledChange: (enabled: boolean) => void;
  onPerformanceModeChange: (mode: ScenePerformanceMode) => void;
  onSettingsChange: (patch: Partial<DesignLightingSettings>) => void;
};

function formatTimeMinutes(minutes: number): string {
  const normalized = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(
    normalized % 60
  ).padStart(2, "0")}`;
}

function parseTimeMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function SectionHeading({
  id,
  title,
  detail,
  dark,
}: {
  id: string;
  title: string;
  detail: string;
  dark: boolean;
}) {
  return (
    <div>
      <h3 id={id} className="text-sm font-bold">
        {title}
      </h3>
      <p
        className={
          dark
            ? "mt-0.5 text-xs text-neutral-400"
            : "mt-0.5 text-xs text-neutral-600"
        }
      >
        {detail}
      </p>
    </div>
  );
}

function SwitchControl({
  checked,
  testId,
  label,
  dark,
  onChange,
}: {
  checked: boolean;
  testId: string;
  label: string;
  dark: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        checked ? "bg-emerald-500" : dark ? "bg-neutral-700" : "bg-neutral-300"
      }`}
      onClick={() => onChange(!checked)}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
      <span className="sr-only">
        {checked ? `Turn ${label} off` : `Turn ${label} on`}
      </span>
    </button>
  );
}

export function LightingSettingsControls({
  settings,
  liteEnabled,
  dark,
  advanced,
  performanceMode,
  placedFixtureCount,
  activeFixtureCount,
  estimatedFixtureCount,
  onPresetChange,
  onShadowsEnabledChange,
  onPerformanceModeChange,
  onSettingsChange,
}: LightingSettingsControlsProps) {
  const panelClass = dark
    ? "rounded-2xl border border-white/10 bg-white/5 p-4"
    : "rounded-2xl border border-neutral-200 bg-neutral-50 p-4";
  const selectedMode = resolveLightingMode(settings.preset);

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="text-sm font-bold">Lighting</legend>
        <div className="mt-3 grid gap-2" role="radiogroup">
          {CONSUMER_LIGHTING_MODES.map((mode) => {
            const preset = EDITOR_LIGHTING_PRESETS[mode];
            const selected = selectedMode === mode;

            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`lighting-mode-${mode}`}
                data-persisted-preset={preset.persistedId ?? undefined}
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                  selected
                    ? dark
                      ? "border-blue-400 bg-blue-500/15"
                      : "border-neutral-950 bg-neutral-50"
                    : dark
                      ? "border-white/10 hover:bg-white/5"
                      : "border-neutral-200 hover:bg-neutral-50"
                }`}
                onClick={() =>
                  onPresetChange(resolvePersistedLightingPreset(mode))
                }
              >
                <span>
                  <span className="block text-sm font-bold">
                    {preset.label}
                  </span>
                  <span
                    className={
                      dark
                        ? "mt-0.5 block text-xs text-neutral-400"
                        : "mt-0.5 block text-xs text-neutral-600"
                    }
                  >
                    {preset.description}
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
          })}
        </div>
      </fieldset>

      {advanced ? (
        <section
          aria-labelledby="lighting-camera-heading"
          className={panelClass}
          data-testid="lighting-pro-controls"
        >
          <SectionHeading
            id="lighting-camera-heading"
            title="Pro adjustments"
            detail="Tune the viewport without changing authored material colours."
            dark={dark}
          />
          <label className="mt-4 block text-xs font-semibold">
            Exposure
            <span className="float-right font-normal opacity-60">
              {settings.exposureCompensationEv > 0 ? "+" : ""}
              {settings.exposureCompensationEv.toFixed(1)} EV
            </span>
            <input
              type="range"
              data-testid="lighting-exposure-input"
              className="mt-2 w-full accent-emerald-500"
              min={-1}
              max={1}
              step={0.1}
              value={settings.exposureCompensationEv}
              onChange={(event) =>
                onSettingsChange({
                  exposureCompensationEv: Number(event.currentTarget.value),
                })
              }
            />
          </label>

          <div className="mt-5 flex items-center justify-between gap-4 border-t border-current/10 pt-4">
            <div>
              <div className="text-xs font-semibold">Shadows</div>
              <div className="mt-0.5 text-[11px] opacity-60">
                Adds depth in 3D; paused automatically in Lite mode.
              </div>
            </div>
            <SwitchControl
              checked={settings.shadowsEnabled}
              testId="lighting-shadows-toggle"
              label="shadows"
              dark={dark}
              onChange={onShadowsEnabledChange}
            />
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

          <div className="mt-5 border-t border-current/10 pt-4">
            <div className="text-xs font-semibold">Daylight direction</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-[11px] font-semibold">
                Time of day
                <input
                  type="time"
                  data-testid="lighting-time-input"
                  className={
                    dark
                      ? "mt-1 h-9 w-full rounded-lg border border-white/15 bg-neutral-900 px-2 text-xs"
                      : "mt-1 h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 text-xs"
                  }
                  value={formatTimeMinutes(settings.timeMinutes)}
                  onChange={(event) => {
                    const timeMinutes = parseTimeMinutes(
                      event.currentTarget.value
                    );
                    if (timeMinutes !== null) onSettingsChange({ timeMinutes });
                  }}
                />
              </label>
              <label className="text-[11px] font-semibold">
                Date
                <input
                  type="date"
                  data-testid="lighting-date-input"
                  className={
                    dark
                      ? "mt-1 h-9 w-full rounded-lg border border-white/15 bg-neutral-900 px-2 text-xs"
                      : "mt-1 h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 text-xs"
                  }
                  value={settings.dateIso ?? ""}
                  onChange={(event) =>
                    onSettingsChange({
                      dateIso: event.currentTarget.value || undefined,
                    })
                  }
                />
              </label>
            </div>
            <label className="mt-3 block text-[11px] font-semibold">
              Plan north
              <span className="float-right font-normal opacity-60">
                {Math.round(settings.planNorthDeg)}°
              </span>
              <input
                type="range"
                data-testid="lighting-plan-north-input"
                className="mt-1 w-full accent-emerald-500"
                min={0}
                max={359}
                step={1}
                value={settings.planNorthDeg}
                onChange={(event) =>
                  onSettingsChange({
                    planNorthDeg: Number(event.currentTarget.value),
                  })
                }
              />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-[11px] font-semibold">
                Latitude
                <input
                  type="number"
                  data-testid="lighting-latitude-input"
                  className={
                    dark
                      ? "mt-1 h-9 w-full rounded-lg border border-white/15 bg-neutral-900 px-2 text-xs"
                      : "mt-1 h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 text-xs"
                  }
                  min={-90}
                  max={90}
                  step={0.01}
                  value={settings.location?.latitude ?? ""}
                  placeholder="Optional"
                  onChange={(event) => {
                    const latitude = Number(event.currentTarget.value);
                    if (!Number.isFinite(latitude)) return;
                    onSettingsChange({
                      location: {
                        latitude,
                        longitude: settings.location?.longitude ?? 0,
                      },
                    });
                  }}
                />
              </label>
              <label className="text-[11px] font-semibold">
                Longitude
                <input
                  type="number"
                  data-testid="lighting-longitude-input"
                  className={
                    dark
                      ? "mt-1 h-9 w-full rounded-lg border border-white/15 bg-neutral-900 px-2 text-xs"
                      : "mt-1 h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 text-xs"
                  }
                  min={-180}
                  max={180}
                  step={0.01}
                  value={settings.location?.longitude ?? ""}
                  placeholder="Optional"
                  onChange={(event) => {
                    const longitude = Number(event.currentTarget.value);
                    if (!Number.isFinite(longitude)) return;
                    onSettingsChange({
                      location: {
                        latitude: settings.location?.latitude ?? 0,
                        longitude,
                      },
                    });
                  }}
                />
              </label>
            </div>
            {settings.location ? (
              <button
                type="button"
                data-testid="lighting-location-clear"
                className="mt-2 text-[11px] font-semibold underline opacity-65"
                onClick={() => onSettingsChange({ location: undefined })}
              >
                Use neutral reference location
              </button>
            ) : null}
          </div>

          <div className="mt-5 border-t border-current/10 pt-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold">Fixture lights</div>
                <div className="mt-0.5 text-[11px] opacity-60">
                  {activeFixtureCount} active of {placedFixtureCount}
                  {estimatedFixtureCount > 0
                    ? ` · ${estimatedFixtureCount} estimated`
                    : ""}
                </div>
              </div>
              <SwitchControl
                checked={settings.fixtureMasterEnabled}
                testId="lighting-fixture-master-toggle"
                label="fixture lights"
                dark={dark}
                onChange={(fixtureMasterEnabled) =>
                  onSettingsChange({ fixtureMasterEnabled })
                }
              />
            </div>
            <label className="mt-3 block text-[11px] font-semibold">
              Fixture brightness
              <span className="float-right font-normal opacity-60">
                {Math.round(settings.fixtureMasterLevel * 100)}%
              </span>
              <input
                type="range"
                data-testid="lighting-fixture-master-level"
                className="mt-1 w-full accent-emerald-500"
                min={0}
                max={100}
                step={5}
                value={Math.round(settings.fixtureMasterLevel * 100)}
                disabled={!settings.fixtureMasterEnabled}
                onChange={(event) =>
                  onSettingsChange({
                    fixtureMasterLevel:
                      Number(event.currentTarget.value) / 100,
                  })
                }
              />
            </label>
          </div>

          <label className="mt-5 block border-t border-current/10 pt-4 text-xs font-semibold">
            Presentation quality
            <select
              data-testid="lighting-quality-select"
              className={
                dark
                  ? "mt-2 h-9 w-full rounded-lg border border-white/15 bg-neutral-900 px-2 text-xs"
                  : "mt-2 h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 text-xs"
              }
              value={performanceMode}
              onChange={(event) =>
                onPerformanceModeChange(
                  event.currentTarget.value as ScenePerformanceMode
                )
              }
            >
              <option value="auto">Automatic</option>
              <option value="quality">High quality</option>
              <option value="lite">Lite</option>
            </select>
          </label>
        </section>
      ) : null}

      <p
        className={
          dark
            ? "border-t border-white/10 pt-4 text-xs text-neutral-500"
            : "border-t border-neutral-200 pt-4 text-xs text-neutral-500"
        }
      >
        Interactive visualization only; this is not certified photometric
        analysis.
      </p>
    </div>
  );
}
