// Start a new design (audit findings FR3, ST7 and ST8): the blank room and the template cards.
// The `?start=` links are in `lib/start-design-link.ts`.
import {
  HOUSE_PLAN_TEMPLATES,
  ROOM_DIMENSION_DEFAULTS,
  type HousePlanTemplate,
  type HousePlanTemplateFurnishingPackId,
  type HousePlanTemplateId,
} from "@/lib/design-page-house-plan";

/**
 * Blank room and Draw room start from one empty room at the default size, the same room a
 * first visit opens with. It goes through the template flow, so a design with content first
 * asks "Start a new design?".
 */
export const BLANK_ROOM_TEMPLATE: HousePlanTemplate = {
  id: "blank_room",
  label: "Blank room",
  summary: "One empty room. Set its size, then furnish it.",
  bestFor: "Planning one room",
  layoutType: "studio",
  footprint: "compact",
  bedroomCount: 0,
  tags: [],
  zones: [],
  realLifeChecks: [],
  rooms: [
    {
      id: "room",
      name: "Living Room",
      roomType: "living",
      shape: "rectangle",
      width: ROOM_DIMENSION_DEFAULTS.width,
      depth: ROOM_DIMENSION_DEFAULTS.depth,
      x: 0,
      z: 0,
    },
  ],
  doorways: [],
  windows: [],
  furnishingPacks: [],
};

/** Singapore homes first, as in the mockups; the US layouts come last. */
const START_TEMPLATE_ORDER: readonly HousePlanTemplateId[] = [
  "hdb_two_room", "studio", "one_bedroom", "living_dining", "three_room_flat", "small_condo",
  "compact_two_bed", "family_two_bed", "l_shaped_studio", "narrow_one_bed", "corner_one_bed",
  "railroad_apartment", "adu_guest_house",
];

export type StartTemplateFilter = "all" | 0 | 1 | 2;

export const START_TEMPLATE_FILTERS: ReadonlyArray<{ key: StartTemplateFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: 0, label: "Studio" },
  { key: 1, label: "1 bedroom" },
  { key: 2, label: "2 bedrooms" },
];

/** How many template cards show before "See all". */
export const START_TEMPLATE_PREVIEW_COUNT = 8;

export type StartTemplateCard = {
  template: HousePlanTemplate;
  name: string;
  meta: string;
  /** The styled furniture pack Furnished applies; null when the template has none. */
  furnishingPackId: HousePlanTemplateFurnishingPackId | null;
};

function bedroomLabel(count: number) {
  if (count === 0) return "Studio";
  return count === 1 ? "1 bedroom" : `${count} bedrooms`;
}

const roomCountLabel = (count: number) => (count === 1 ? "1 room" : `${count} rooms`);

function templateCard(template: HousePlanTemplate): StartTemplateCard {
  const area = Math.round(template.rooms.reduce((sum, room) => sum + room.width * room.depth, 0));
  const pack =
    template.furnishingPacks.find((entry) => entry.id === "styled_starter" && entry.intents.length > 0) ??
    template.furnishingPacks.find((entry) => entry.intents.length > 0);
  return {
    template,
    name: template.label,
    meta: `${bedroomLabel(template.bedroomCount)} · ${roomCountLabel(template.rooms.length)} · ${area} m²`,
    furnishingPackId: pack?.id ?? null,
  };
}

export function buildStartTemplateCards(templates: readonly HousePlanTemplate[] = HOUSE_PLAN_TEMPLATES) {
  const rank = (template: HousePlanTemplate) => {
    const index = START_TEMPLATE_ORDER.indexOf(template.id);
    return index === -1 ? START_TEMPLATE_ORDER.length : index;
  };
  return [...templates].sort((left, right) => rank(left) - rank(right)).map(templateCard);
}

export function matchesStartTemplateFilter(card: StartTemplateCard, filter: StartTemplateFilter) {
  if (filter === "all") return true;
  return filter === 2 ? card.template.bedroomCount >= 2 : card.template.bedroomCount === filter;
}
