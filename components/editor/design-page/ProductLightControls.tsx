"use client";

import type { PlacedFixtureLightState } from "@/lib/room-types";
import type { ProductFixtureLight } from "@/lib/product-fixture-light";

const KELVIN_STEPS = [2200, 2700, 3000, 4000, 5000, 6500];

function verificationLabel(verification: ProductFixtureLight["verification"]) {
  if (verification === "estimated") return "Estimated output";
  return verification === "manufacturer" ? "Manufacturer data" : "Photometric data";
}

type LightControlProps = {
  light: ProductFixtureLight;
  disabled: boolean;
  onChange: (patch: PlacedFixtureLightState) => void;
};

function LightPowerRow({ light, disabled, onChange }: LightControlProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 id="selected-item-light-heading" className="text-[13px] font-bold text-neutral-900">
          Light
        </h3>
        <div className="mt-0.5 text-neutral-600">
          {light.luminousFluxLumens} lm · {verificationLabel(light.verification)}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={light.isOn}
        aria-label={light.isOn ? "Turn the light off" : "Turn the light on"}
        data-testid="selection-inspector-fixture-power"
        disabled={disabled}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${light.isOn ? "bg-emerald-600" : "bg-neutral-300"}`}
        onClick={() => onChange({ isOn: !light.isOn })}
      >
        <span aria-hidden="true" className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${light.isOn ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

function LightBeamControl({ light, disabled, onChange }: LightControlProps) {
  return (
    <label className="mt-3 block font-semibold text-neutral-800">
      Beam width
      <span className="float-right font-normal text-neutral-600">{Math.round(light.beamAngleDeg)}°</span>
      <input
        type="range"
        data-testid="selection-inspector-fixture-beam"
        className="mt-1 w-full accent-emerald-600"
        min={5}
        max={90}
        step={1}
        value={Math.min(90, Math.max(5, light.beamAngleDeg))}
        disabled={disabled || !light.beamAdjustable}
        onChange={(event) => onChange({ beamAngleDeg: Number(event.currentTarget.value) })}
      />
      {!light.beamAdjustable ? <span className="mt-1 block font-normal text-neutral-600">Lights all around</span> : null}
    </label>
  );
}

/**
 * A lamp's light in the item panel (UX 4f; Pro): on or off, dimmer, colour temperature and beam.
 * These lived in Plan's inspector, so Furnish couldn't dim a lamp. The test ids stay.
 */
export function ProductLightControls({ light, disabled, onChange }: LightControlProps) {
  const kelvins = Array.from(new Set([light.cctKelvin, ...KELVIN_STEPS])).sort((left, right) => left - right);
  return (
    <section data-testid="selection-inspector-fixture-lighting" aria-labelledby="selected-item-light-heading" className="border-t border-neutral-200 pt-3 text-xs">
      <LightPowerRow light={light} disabled={disabled} onChange={onChange} />
      <label className="mt-3 block font-semibold text-neutral-800">
        Dimmer
        <span className="float-right font-normal text-neutral-600">{Math.round(light.dimmer * 100)}%</span>
        <input
          type="range"
          data-testid="selection-inspector-fixture-dimmer"
          className="mt-1 w-full accent-emerald-600"
          min={0}
          max={100}
          step={5}
          value={Math.round(light.dimmer * 100)}
          disabled={disabled || !light.dimmable}
          onChange={(event) => onChange({ dimmer: Number(event.currentTarget.value) / 100 })}
        />
      </label>
      <label className="mt-3 block font-semibold text-neutral-800">
        Colour temperature
        <select
          data-testid="selection-inspector-fixture-cct"
          className="mt-1 h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-xs touch:h-11"
          value={String(light.cctKelvin)}
          disabled={disabled}
          onChange={(event) => onChange({ cctKelvin: Number(event.currentTarget.value) })}
        >
          {kelvins.map((kelvin) => (
            <option key={kelvin} value={kelvin}>
              {kelvin}K
            </option>
          ))}
        </select>
      </label>
      <LightBeamControl light={light} disabled={disabled} onChange={onChange} />
    </section>
  );
}
