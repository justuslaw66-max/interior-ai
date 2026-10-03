import type { CatalogItemSchema, FixturePhotometricVerification } from "@/lib/catalog-schema";
import { resolveDesignLightingSettings } from "@/lib/design-lighting-settings";
import { LIGHTING_PRESETS } from "@/lib/lightingPresets";
import { resolveFixturePhotometrics } from "@/lib/resolve-lighting-scene";
import type { DesignItem, DesignSnapshot, PlacedFixtureLightState } from "@/lib/room-types";

/** A placed lamp's light as its controls show it: on or off, dimmer, colour temperature, beam. */
export type ProductFixtureLight = {
  isOn: boolean;
  dimmer: number;
  cctKelvin: number;
  beamAngleDeg: number;
  beamAdjustable: boolean;
  luminousFluxLumens: number;
  dimmable: boolean;
  verification: FixturePhotometricVerification;
};

/**
 * The selected lamp's light, for Pro (the controls are Pro's): null for anything that doesn't give
 * light. A lamp nobody has switched follows the lighting preset's default. Moved from the viewport's
 * read model when the lamp controls moved into the item panel (UX 4f).
 */
export function resolveProductFixtureLight({ item, product, designSnapshot, isDesigner }: {
  item: DesignItem | null | undefined;
  product: CatalogItemSchema | null | undefined;
  designSnapshot: DesignSnapshot;
  isDesigner: boolean;
}): ProductFixtureLight | null {
  if (!isDesigner || !item) return null;
  const photometrics = resolveFixturePhotometrics(item, product);
  if (!photometrics) return null;
  const lightingSettings = resolveDesignLightingSettings(designSnapshot);
  return {
    isOn: item.fixtureLight?.isOn ?? LIGHTING_PRESETS[lightingSettings.preset].fixtureDefaultOn,
    dimmer: item.fixtureLight?.dimmer ?? 1,
    cctKelvin: item.fixtureLight?.cctKelvin ?? photometrics.cctKelvin,
    beamAngleDeg: item.fixtureLight?.beamAngleDeg ?? photometrics.beamAngleDeg,
    beamAdjustable: photometrics.emitterType === "spot",
    luminousFluxLumens: photometrics.luminousFluxLumens,
    dimmable: photometrics.dimmable,
    verification: photometrics.verification,
  };
}

/** The products with one lamp's light changed; the rest untouched. */
export function withFixtureLightPatch(items: DesignItem[], instanceId: string, patch: PlacedFixtureLightState): DesignItem[] {
  return items.map((item) => (item.instanceId === instanceId ? { ...item, fixtureLight: { ...item.fixtureLight, ...patch } } : item));
}
