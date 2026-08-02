import type { RoomType } from "@/lib/room-types";

export type FloorPlanSourceRoom = {
  id: string;
  source_label?: string;
  name?: string;
  room_type?: RoomType;
};

export type ResolvedFloorPlanRoomIdentity = {
  name: string;
  roomType: RoomType;
  sourceLabel: string | null;
};

type SourceLabelRule = {
  name: string;
  roomType: RoomType;
  numberDuplicates?: boolean;
};

function normalizeSourceLabel(value: string): string {
  return value
    .normalize("NFKD")
    .toUpperCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseSourceLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s/-])([a-z])/g, (_match, prefix: string, letter: string) =>
      `${prefix}${letter.toUpperCase()}`
    );
}

function sourceLabelRule(sourceLabel: string): SourceLabelRule {
  const mainBedroomMatch = sourceLabel.match(/^MAIN BEDROOM(?:\s+(\d+))?$/);
  if (mainBedroomMatch) {
    return {
      name: mainBedroomMatch[1]
        ? `Main Bedroom ${mainBedroomMatch[1]}`
        : "Main Bedroom",
      roomType: "bedroom",
    };
  }

  const rules: Record<string, SourceLabelRule> = {
    BEDROOM: {
      name: "Bedroom",
      roomType: "bedroom",
      numberDuplicates: true,
    },
    "LIVING/DINING": {
      name: "Living / Dining",
      roomType: "living",
    },
    "BATH/WC": {
      name: "Bath / WC",
      roomType: "toilet",
      numberDuplicates: true,
    },
    KITCHEN: {
      name: "Kitchen",
      roomType: "kitchen",
    },
    "KITCHEN/UTILITY": {
      name: "Kitchen / Utility",
      roomType: "kitchen",
    },
    "HOUSE HOLD SHELTER": {
      name: "Household Shelter",
      roomType: "custom",
    },
    "HOUSEHOLD SHELTER": {
      name: "Household Shelter",
      roomType: "custom",
    },
    "SERVICE YARD": {
      name: "Service Yard",
      roomType: "custom",
    },
  };

  return (
    rules[sourceLabel] ?? {
      name: titleCaseSourceLabel(sourceLabel),
      roomType: "custom",
    }
  );
}

/**
 * Resolves consumer-facing room names from labels printed in the source drawing.
 * Explicit names/types remain available for inferred spaces that have no source label.
 */
export function resolveFloorPlanRoomIdentities(
  rooms: FloorPlanSourceRoom[]
): ResolvedFloorPlanRoomIdentity[] {
  const labelCounts = new Map<string, number>();

  return rooms.map((room) => {
    if (!room.source_label) {
      if (!room.name || !room.room_type) {
        throw new Error(
          `Floor-plan room ${room.id} needs source_label or an explicit name and room_type.`
        );
      }
      return {
        name: room.name,
        roomType: room.room_type,
        sourceLabel: null,
      };
    }

    const normalizedLabel = normalizeSourceLabel(room.source_label);
    const rule = sourceLabelRule(normalizedLabel);
    const occurrence = (labelCounts.get(normalizedLabel) ?? 0) + 1;
    labelCounts.set(normalizedLabel, occurrence);

    return {
      name:
        rule.numberDuplicates && occurrence > 1
          ? `${rule.name} ${occurrence}`
          : rule.name,
      roomType: rule.roomType,
      sourceLabel: normalizedLabel,
    };
  });
}
