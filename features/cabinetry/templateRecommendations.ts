import type { CabinetHostSpace, CabinetRoomType } from "./types";

const STRUCTURED_ROOM_TERMS: Readonly<Record<Exclude<CabinetRoomType, "custom">, readonly string[]>> = {
  kitchen: ["kitchen", "pantry", "island"],
  bedroom: ["bedroom", "wardrobe", "closet", "bed"],
  toilet: ["bathroom", "vanity", "toilet"],
  dining: ["dining", "banquette", "bar", "wine"],
  living: ["living", "media", "library", "bar"],
};

function getRoomNameTerms(roomName: string): readonly string[] {
  const normalizedName = roomName.trim().toLowerCase();
  if (normalizedName.includes("kitchen")) return STRUCTURED_ROOM_TERMS.kitchen;
  if (normalizedName.includes("bed")) return STRUCTURED_ROOM_TERMS.bedroom;
  if (normalizedName.includes("bath") || normalizedName.includes("toilet")) {
    return STRUCTURED_ROOM_TERMS.toilet;
  }
  if (normalizedName.includes("dining")) return STRUCTURED_ROOM_TERMS.dining;
  if (normalizedName.includes("laundry") || normalizedName.includes("utility")) {
    return ["laundry", "utility"];
  }
  if (normalizedName.includes("office") || normalizedName.includes("study")) {
    return ["office", "desk", "library"];
  }
  if (normalizedName.includes("entry") || normalizedName.includes("mud")) {
    return ["entry", "mudroom", "shoe"];
  }
  if (normalizedName.includes("living") || normalizedName.includes("family")) {
    return STRUCTURED_ROOM_TERMS.living;
  }
  return [];
}

/**
 * Returns stable template-ranking terms. A structured room type wins over the
 * editable display name; custom/legacy hosts retain the friendly-name fallback.
 */
export function getCabinetTemplateRoomTerms(
  space: Pick<CabinetHostSpace, "roomType" | "roomName"> | null | undefined
): readonly string[] {
  if (space?.roomType && space.roomType !== "custom") {
    return STRUCTURED_ROOM_TERMS[space.roomType];
  }
  return getRoomNameTerms(space?.roomName ?? "");
}
