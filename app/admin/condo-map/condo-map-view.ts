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

/** The storeys a unit takes: its own and, for a two-level unit (24 One's duplexes), the one above too. */
export function unitStoreys(card: CondoUnitCard): number[] {
  return Array.from({ length: Math.max(1, card.levels) }, (_, index) => card.floor + index);
}

/**
 * A unit chosen on the map or in the list: its development and floor come with it (a two-level unit chosen on its upper
 * storey keeps that storey); none keeps the floor.
 */
export function chooseUnit(view: CondoMapView, maps: CondoMapsBySlug, target: { slug: string; unit: string } | null): CondoMapView {
  if (!target) return view.unit === null ? view : { ...view, unit: null };
  const card = maps[target.slug]?.units.find((unit) => unit.unit === target.unit);
  if (!card) return view;
  const keep = view.slug === target.slug && view.floor !== null && unitStoreys(card).includes(view.floor);
  return { slug: target.slug, floor: keep ? view.floor : card.floor, unit: card.unit };
}

export function chosenUnitCard(view: CondoMapView, maps: CondoMapsBySlug): CondoUnitCard | null {
  if (!view.slug || !view.unit) return null;
  return maps[view.slug]?.units.find((unit) => unit.unit === view.unit) ?? null;
}

/** The units on a floor, a two-level unit on both of its storeys. */
export function unitsOnFloor(dev: CondoDevelopmentMap, floor: number): CondoUnitCard[] {
  return dev.units.filter((unit) => unitStoreys(unit).includes(floor)).sort((a, b) => a.unit.localeCompare(b.unit, "en", { numeric: true }));
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

const ACCESSED = / accessed on (\d{1,2} [A-Z][a-z]{2} \d{4}) /;

/**
 * Every credit the drawn developments carry, once each, in the order they first appear. Credits that differ only in
 * their access date (the land lots, read on different days) become one, with each date: "accessed on 24 Oct 2026 and
 * 25 Oct 2026".
 */
export function condoMapCredits(maps: CondoMapsBySlug): string[] {
  const dates = new Map<string, string[]>();
  for (const credit of Object.values(maps).flatMap((dev) => dev.credits)) {
    const date = ACCESSED.exec(credit)?.[1];
    const key = date ? credit.replace(ACCESSED, " accessed on {date} ") : credit;
    const seen = dates.get(key) ?? [];
    if (date && !seen.includes(date)) seen.push(date);
    dates.set(key, seen);
  }
  return [...dates].map(([key, seen]) => (seen.length === 0 ? key : key.replace("{date}", seen.join(seen.length === 2 ? " and " : ", "))));
}

/** A floor as the developers' plans name it: 1st and 2nd storey, then Level 3 and up. */
export function floorName(floor: number): string {
  if (floor === 1) return "1st storey";
  if (floor === 2) return "2nd storey";
  return `Level ${floor}`;
}

/** Where a unit is: its floor, or both of a two-level unit's ("1st–2nd storey", "Levels 4–5"). */
export function unitFloorName(card: CondoUnitCard): string {
  const storeys = unitStoreys(card);
  if (storeys.length === 1) return floorName(card.floor);
  const last = storeys[storeys.length - 1];
  if (last <= 2) return "1st–2nd storey";
  return card.floor <= 2 ? `${floorName(card.floor)} to Level ${last}` : `Levels ${card.floor}–${last}`;
}

export function unitLayout(card: CondoUnitCard): string {
  const rooms = card.bedrooms === null ? null : card.bedrooms === 0 ? "Studio" : `${card.bedrooms} bedroom${card.bedrooms === 1 ? "" : "s"}`;
  const parts = [rooms && card.study ? `${rooms} + study` : rooms, card.penthouse ? "penthouse" : null, card.levels > 1 ? `${card.levels} levels` : null];
  return parts.filter(Boolean).join(" · ") || "Not given";
}

/**
 * The unit's area as the brochure gives it: m², with the attic void the plan leaves out where it gives one, and sq ft,
 * said to count that void when it does (10 Evelyn's 5th storey: "46 m² + attic void 25 m² · 764 sq ft with the void").
 */
export function unitArea(card: CondoUnitCard): string {
  const attic = card.atticVoidSqm ? ` + attic void ${card.atticVoidSqm.toLocaleString("en-SG")} m²` : "";
  const metric = card.areaSqm === null ? null : `${card.areaSqm.toLocaleString("en-SG")} m²${attic}`;
  const withVoid = card.areaSqftWithVoid ? " with the void" : "";
  const imperial =
    card.areaSqft === null
      ? null
      : `${card.areaSqft.toLocaleString("en-SG")} sq ft${withVoid}${card.areaSqftFrom === "converted" ? " (converted)" : ""}`;
  return [metric, imperial].filter(Boolean).join(" · ") || "Not given";
}
