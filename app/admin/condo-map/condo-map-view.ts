import type { CondoDevelopmentMap, CondoUnitCard, LonLat } from "@/lib/condo-map/condo-map-data";

/**
 * What the admin condo map shows: a development (or none: all of them), one of its floors (or the whole building) and
 * one of that floor's units. Changes go through these pure steps, so the floor always matches the chosen unit.
 */
export type CondoMapView = { slug: string | null; floor: number | null; unit: string | null };
export type CondoMapsBySlug = Readonly<Record<string, CondoDevelopmentMap>>;

export const NO_CONDO_VIEW: CondoMapView = { slug: null, floor: null, unit: null };

export function chooseDevelopment(view: CondoMapView, slug: string | null): CondoMapView {
  return slug === view.slug ? view : { slug, floor: null, unit: null };
}

export function chooseFloor(view: CondoMapView, floor: number | null): CondoMapView {
  return view.floor === floor ? view : { ...view, floor, unit: null };
}

/** A unit chosen on the map or in the list: its development and floor come with it; none keeps the floor. */
export function chooseUnit(view: CondoMapView, maps: CondoMapsBySlug, target: { slug: string; unit: string } | null): CondoMapView {
  if (!target) return view.unit === null ? view : { ...view, unit: null };
  const card = maps[target.slug]?.units.find((unit) => unit.unit === target.unit);
  return card ? { slug: target.slug, floor: card.floor, unit: card.unit } : view;
}

export function chosenUnitCard(view: CondoMapView, maps: CondoMapsBySlug): CondoUnitCard | null {
  if (!view.slug || !view.unit) return null;
  return maps[view.slug]?.units.find((unit) => unit.unit === view.unit) ?? null;
}

export function unitsOnFloor(dev: CondoDevelopmentMap, floor: number): CondoUnitCard[] {
  return dev.units.filter((unit) => unit.floor === floor).sort((a, b) => a.unit.localeCompare(b.unit, "en", { numeric: true }));
}

/** The box round some lon/lat points, as Mapbox's fitBounds takes it, or none for no points. */
export function boundsAround(points: readonly LonLat[]): [LonLat, LonLat] | null {
  if (points.length === 0) return null;
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

/** Every credit the drawn developments carry, once each, in the order they first appear. */
export function condoMapCredits(maps: CondoMapsBySlug): string[] {
  return [...new Set(Object.values(maps).flatMap((dev) => dev.credits))];
}

/** A floor as the developers' plans name it: 1st and 2nd storey, then Level 3 and up. */
export function floorName(floor: number): string {
  if (floor === 1) return "1st storey";
  if (floor === 2) return "2nd storey";
  return `Level ${floor}`;
}

export function unitLayout(card: CondoUnitCard): string {
  const rooms = card.bedrooms === null ? null : card.bedrooms === 0 ? "Studio" : `${card.bedrooms} bedroom${card.bedrooms === 1 ? "" : "s"}`;
  const parts = [rooms && card.study ? `${rooms} + study` : rooms, card.penthouse ? "penthouse" : null, card.levels > 1 ? `${card.levels} levels` : null];
  return parts.filter(Boolean).join(" · ") || "Not given";
}

export function unitArea(card: CondoUnitCard): string {
  const metric = card.areaSqm === null ? null : `${card.areaSqm.toLocaleString("en-SG")} m²`;
  const imperial =
    card.areaSqft === null ? null : `${card.areaSqft.toLocaleString("en-SG")} sq ft${card.areaSqftFrom === "converted" ? " (converted)" : ""}`;
  return [metric, imperial].filter(Boolean).join(" · ") || "Not given";
}
