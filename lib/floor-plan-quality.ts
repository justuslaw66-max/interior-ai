import { CATALOG_ITEMS } from "@/lib/catalog";
import type { ProductCategory } from "@/lib/catalog-schema";
import {
  buildHouseRoomConnectionChecklist,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { DesignItem, RoomType } from "@/lib/room-types";

export type FloorPlanQualityLabel = "Looks good" | "Improve" | "Review";
export type FloorPlanQualityCategory =
  | "naturalLight"
  | "connections"
  | "privacy"
  | "storageSupport"
  | "furnitureFit"
  | "accessibility"
  | "readiness";

export type FloorPlanQualityAction =
  | "add_window"
  | "add_doorway"
  | "review_furniture_fit"
  | "add_storage";

export type FloorPlanQualityIssue = {
  id: string;
  category: FloorPlanQualityCategory;
  severity: "tip" | "improvement" | "review";
  roomId?: string;
  target?: {
    roomId?: string;
    adjacentRoomId?: string;
    wall?: RoomOpening2D["wall"];
    openingKind?: RoomOpening2D["kind"];
    itemInstanceId?: string;
  };
  title: string;
  detail: string;
  suggestedFix: string;
  action: FloorPlanQualityAction;
};

export type FloorPlanRoomGraphNode = {
  id: string;
  name: string;
  roomType: RoomType;
  areaSqm: number;
  hasWindow: boolean;
  exteriorWindowCount: number;
};

export type FloorPlanRoomGraphEdge = {
  fromRoomId: string;
  toRoomId: string;
  connected: boolean;
  sharedWallLengthMeters: number;
};

export type FloorPlanAiPlanningContext = {
  planIntent: {
    summary: string;
    tags: string[];
    activeRoomId?: string | null;
  };
  roomGraph: {
    nodes: FloorPlanRoomGraphNode[];
    edges: FloorPlanRoomGraphEdge[];
  };
  exteriorLightSummary: {
    roomsNeedingLight: string[];
    roomsWithExteriorLight: string[];
    roomsMissingLight: string[];
  };
  blockedTightIssues: Array<{
    id: string;
    roomId?: string;
    target?: FloorPlanQualityIssue["target"];
    label: string;
    severity: FloorPlanQualityIssue["severity"];
  }>;
  missingSupportSpaces: string[];
  suggestedNextActions: FloorPlanQualityAction[];
};

export type FloorPlanQualityReport = {
  score: number;
  label: FloorPlanQualityLabel;
  categoryScores: Record<FloorPlanQualityCategory, number>;
  strengths: string[];
  issues: FloorPlanQualityIssue[];
  suggestedFixes: string[];
  primaryAction: {
    label: "Add window" | "Add doorway" | "Review furniture fit" | "Add storage";
    action: FloorPlanQualityAction;
  };
  aiPlanningContext: FloorPlanAiPlanningContext;
};

export type QualityPlanItem = DesignItem & {
  roomId?: string;
};

export type FloorPlanQualityInput = {
  rooms: HousePlanRoom2D[];
  openings: RoomOpening2D[];
  items: QualityPlanItem[];
  activeRoomId?: string | null;
};

type RoomBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type ItemBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

const LIGHT_ROOM_NAME_RE = /\b(den|study|office|nook)\b/i;
const SUPPORT_SPACE_RE = /\b(entry|foyer|hall|hallway|storage|closet|laundry|utility|pantry|mud|wardrobe|linen)\b/i;
const SUPPORT_ITEM_CATEGORIES = new Set<ProductCategory>(["sideboard", "tv_console"]);

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roomArea(room: HousePlanRoom2D) {
  return Number((room.w * room.d).toFixed(2));
}

function roomBounds(room: HousePlanRoom2D): RoomBounds {
  return {
    left: room.x - room.w / 2,
    right: room.x + room.w / 2,
    top: room.z - room.d / 2,
    bottom: room.z + room.d / 2,
  };
}

function isRoomNeedingLight(room: HousePlanRoom2D) {
  return (
    room.roomType === "living" ||
    room.roomType === "bedroom" ||
    room.roomType === "dining" ||
    LIGHT_ROOM_NAME_RE.test(room.name)
  );
}

function wallIsExterior(room: HousePlanRoom2D, wall: RoomOpening2D["wall"], rooms: HousePlanRoom2D[]) {
  const bounds = roomBounds(room);
  return !rooms.some((candidate) => {
    if (candidate.id === room.id) return false;
    const other = roomBounds(candidate);
    if (wall === "east" || wall === "west") {
      const wallX = wall === "east" ? bounds.right : bounds.left;
      const otherWallX = wall === "east" ? other.left : other.right;
      const overlap = Math.min(bounds.bottom, other.bottom) - Math.max(bounds.top, other.top);
      return Math.abs(wallX - otherWallX) <= 0.04 && overlap > 0.45;
    }
    const wallZ = wall === "south" ? bounds.bottom : bounds.top;
    const otherWallZ = wall === "south" ? other.top : other.bottom;
    const overlap = Math.min(bounds.right, other.right) - Math.max(bounds.left, other.left);
    return Math.abs(wallZ - otherWallZ) <= 0.04 && overlap > 0.45;
  });
}

function roomWindows(room: HousePlanRoom2D, openings: RoomOpening2D[], rooms: HousePlanRoom2D[]) {
  return openings.filter(
    (opening) =>
      opening.kind === "window" &&
      opening.roomId === room.id &&
      wallIsExterior(room, opening.wall, rooms)
  );
}

function preferredExteriorWall(room: HousePlanRoom2D, rooms: HousePlanRoom2D[]): RoomOpening2D["wall"] | undefined {
  const walls: Array<RoomOpening2D["wall"]> = ["south", "east", "west", "north"];
  return walls.find((wall) => wallIsExterior(room, wall, rooms));
}

function oppositeWall(wall: RoomOpening2D["wall"]): RoomOpening2D["wall"] {
  if (wall === "north") return "south";
  if (wall === "south") return "north";
  if (wall === "east") return "west";
  return "east";
}

function getItemFootprint(item: QualityPlanItem) {
  const product = CATALOG_ITEMS[item.productId];
  if (!product) return null;

  let width = product.dimsMm.w / 1000;
  let depth = product.dimsMm.d / 1000;
  if (product.bounds?.type === "aabb") {
    width = product.bounds.size.w;
    depth = product.bounds.size.d;
  }

  const rotationY = item.rotationY ?? 0;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return {
    label: product.title,
    category: product.category,
    width: Math.abs(cos) * width + Math.abs(sin) * depth,
    depth: Math.abs(sin) * width + Math.abs(cos) * depth,
  };
}

function getItemBounds(item: QualityPlanItem): ItemBounds | null {
  const footprint = getItemFootprint(item);
  if (!footprint) return null;
  const [x, , z] = item.position;
  return {
    minX: x - footprint.width / 2,
    maxX: x + footprint.width / 2,
    minZ: z - footprint.depth / 2,
    maxZ: z + footprint.depth / 2,
  };
}

function boundsIntersect(a: ItemBounds, b: ItemBounds) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function minGapToRoom(bounds: ItemBounds, room: HousePlanRoom2D) {
  return Math.min(
    bounds.minX + room.w / 2,
    room.w / 2 - bounds.maxX,
    bounds.minZ + room.d / 2,
    room.d / 2 - bounds.maxZ
  );
}

function hasSupportSignal(rooms: HousePlanRoom2D[], items: QualityPlanItem[]) {
  if (rooms.some((room) => SUPPORT_SPACE_RE.test(room.name))) return true;
  return items.some((item) => {
    const product = CATALOG_ITEMS[item.productId];
    return Boolean(product && SUPPORT_ITEM_CATEGORIES.has(product.category));
  });
}

function addIssue(
  issues: FloorPlanQualityIssue[],
  issue: FloorPlanQualityIssue
) {
  if (issues.some((candidate) => candidate.id === issue.id)) return;
  issues.push(issue);
}

function labelForScore(score: number): FloorPlanQualityLabel {
  if (score >= 82) return "Looks good";
  if (score >= 58) return "Improve";
  return "Review";
}

function primaryActionForIssues(issues: FloorPlanQualityIssue[]): FloorPlanQualityReport["primaryAction"] {
  const preferred = issues.find((issue) => issue.action === "add_window") ??
    issues.find((issue) => issue.action === "add_doorway") ??
    issues.find((issue) => issue.action === "review_furniture_fit") ??
    issues.find((issue) => issue.action === "add_storage");
  const action = preferred?.action ?? "review_furniture_fit";
  const labels: Record<FloorPlanQualityAction, FloorPlanQualityReport["primaryAction"]["label"]> = {
    add_window: "Add window",
    add_doorway: "Add doorway",
    review_furniture_fit: "Review furniture fit",
    add_storage: "Add storage",
  };
  return { action, label: labels[action] };
}

function buildIntentTags(rooms: HousePlanRoom2D[]) {
  const tags = new Set<string>();
  const bedroomCount = rooms.filter((room) => room.roomType === "bedroom").length;
  if (rooms.length === 1) tags.add("single room");
  if (bedroomCount === 0 && rooms.some((room) => room.roomType === "living")) tags.add("studio");
  if (bedroomCount === 1) tags.add("one bedroom");
  if (bedroomCount >= 2) tags.add("multi bedroom");
  if (rooms.some((room) => room.roomType === "dining")) tags.add("dining ready");
  if (rooms.some((room) => room.roomType === "kitchen")) tags.add("kitchen included");
  if (rooms.some((room) => SUPPORT_SPACE_RE.test(room.name))) tags.add("support space");
  const totalArea = rooms.reduce((sum, room) => sum + roomArea(room), 0);
  if (totalArea < 35) tags.add("compact");
  if (totalArea >= 65) tags.add("family scale");
  return Array.from(tags);
}

export function buildFloorPlanQualityReport({
  rooms,
  openings,
  items,
  activeRoomId,
}: FloorPlanQualityInput): FloorPlanQualityReport {
  const issues: FloorPlanQualityIssue[] = [];
  const strengths: string[] = [];
  const roomsNeedingLight = rooms.filter(isRoomNeedingLight);
  const roomsWithExteriorLight = roomsNeedingLight.filter(
    (room) => roomWindows(room, openings, rooms).length > 0
  );
  const roomsMissingLight = roomsNeedingLight.filter(
    (room) => roomWindows(room, openings, rooms).length === 0
  );

  for (const room of roomsMissingLight) {
    addIssue(issues, {
      id: `missing-window-${room.id}`,
      category: "naturalLight",
      severity: "improvement",
      roomId: room.id,
      target: {
        roomId: room.id,
        wall: preferredExteriorWall(room, rooms),
        openingKind: "window",
      },
      title: `${room.name} needs daylight`,
      detail: "Main living, dining, bedroom, and work spaces feel better with an exterior window.",
      suggestedFix: `Add an exterior window to ${room.name}.`,
      action: "add_window",
    });
  }

  const connectionChecklist = buildHouseRoomConnectionChecklist(rooms, openings, activeRoomId);
  const missingConnections = connectionChecklist.filter((item) => item.status === "needs_doorway");
  for (const connection of missingConnections) {
    addIssue(issues, {
      id: `missing-doorway-${connection.id}`,
      category: "connections",
      severity: "improvement",
      roomId: connection.doorwaySuggestion?.roomId,
      target: {
        roomId: connection.doorwaySuggestion?.roomId,
        adjacentRoomId: connection.doorwaySuggestion?.adjacentRoomId,
        wall: connection.doorwaySuggestion?.wall,
        openingKind: "door",
      },
      title: `${connection.roomNames[0]} and ${connection.roomNames[1]} need a doorway`,
      detail: "Adjacent rooms should have a clear opening so the plan feels walkable.",
      suggestedFix: `Add a doorway between ${connection.roomNames[0]} and ${connection.roomNames[1]}.`,
      action: "add_doorway",
    });
  }

  for (const room of rooms) {
    const minDimension = Math.min(room.w, room.d);
    if (minDimension < 2.15) {
      addIssue(issues, {
        id: `narrow-room-${room.id}`,
        category: "accessibility",
        severity: "review",
        roomId: room.id,
        target: { roomId: room.id },
        title: `${room.name} is narrow`,
        detail: "Very narrow rooms can feel hard to move through once furniture is added.",
        suggestedFix: `Give ${room.name} more breathing room or keep furniture light.`,
        action: "review_furniture_fit",
      });
    }
  }

  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? rooms[0] ?? null;
  const activeRoomItems = activeRoom
    ? items.filter((item) => !item.roomId || item.roomId === activeRoom.id)
    : items;
  const itemBounds = activeRoomItems
    .map((item) => ({ item, bounds: getItemBounds(item), footprint: getItemFootprint(item) }))
    .filter((entry): entry is { item: QualityPlanItem; bounds: ItemBounds; footprint: NonNullable<ReturnType<typeof getItemFootprint>> } =>
      Boolean(entry.bounds && entry.footprint)
    );
  let tightItemCount = 0;
  let overlapCount = 0;

  if (activeRoom) {
    for (let i = 0; i < itemBounds.length; i += 1) {
      const entry = itemBounds[i];
      const roomGap = minGapToRoom(entry.bounds, activeRoom);
      if (roomGap < 0) {
        tightItemCount += 1;
        addIssue(issues, {
          id: `furniture-outside-${entry.item.instanceId}`,
          category: "furnitureFit",
          severity: "review",
          roomId: activeRoom.id,
          target: {
            roomId: activeRoom.id,
            itemInstanceId: entry.item.instanceId,
          },
          title: `${entry.footprint.label} does not fit cleanly`,
          detail: "One item crosses the room edge or sits too tight to the wall.",
          suggestedFix: "Move or resize the item so the main path stays clear.",
          action: "review_furniture_fit",
        });
      } else if (roomGap < 0.35) {
        tightItemCount += 1;
      }

      for (let j = i + 1; j < itemBounds.length; j += 1) {
        if (boundsIntersect(entry.bounds, itemBounds[j].bounds)) {
          overlapCount += 1;
        }
      }
    }
  }

  if (overlapCount > 0 || tightItemCount > 1) {
    addIssue(issues, {
      id: "tight-furniture-fit",
      category: "furnitureFit",
      severity: overlapCount > 0 ? "review" : "improvement",
      roomId: activeRoom?.id,
      target: {
        roomId: activeRoom?.id,
        itemInstanceId: itemBounds[0]?.item.instanceId,
      },
      title: "Furniture fit needs a quick check",
      detail: overlapCount > 0
        ? "Some pieces overlap or block each other."
        : "Several pieces are close to walls or walking paths.",
      suggestedFix: "Review the furniture fit and open up the main path.",
      action: "review_furniture_fit",
    });
  }

  const supportMissing = rooms.length > 1 && !hasSupportSignal(rooms, items);
  if (supportMissing) {
    addIssue(issues, {
      id: "missing-support-space",
      category: "storageSupport",
      severity: "tip",
      target: { roomId: activeRoomId ?? rooms[0]?.id },
      title: "Add a storage or entry moment",
      detail: "A small drop zone, closet, pantry, or utility space helps the plan work day to day.",
      suggestedFix: "Add storage, laundry, pantry, or entry space where it naturally fits.",
      action: "add_storage",
    });
  }

  const toiletRooms = rooms.filter((room) => room.roomType === "toilet");
  for (const toilet of toiletRooms) {
    const directlyPublic = connectionChecklist.some(
      (connection) =>
        connection.status === "connected" &&
        connection.roomIds.includes(toilet.id) &&
        connection.roomIds.some((roomId) => {
          const room = rooms.find((entry) => entry.id === roomId);
          return room?.roomType === "living" || room?.roomType === "dining";
        })
    );
    if (directlyPublic) {
      addIssue(issues, {
        id: `privacy-${toilet.id}`,
        category: "privacy",
        severity: "tip",
        roomId: toilet.id,
        target: { roomId: toilet.id, openingKind: "door" },
        title: `${toilet.name} opens to a public room`,
        detail: "A small hall or offset entry can make bathrooms feel more private.",
        suggestedFix: `Consider a small buffer before ${toilet.name}.`,
        action: "add_doorway",
      });
    }
  }

  if (roomsWithExteriorLight.length > 0) strengths.push("Key rooms have exterior light.");
  if (missingConnections.length === 0 && rooms.length > 1) strengths.push("Adjacent rooms are linked.");
  if (!supportMissing && rooms.length > 1) strengths.push("Support space is represented.");
  if (itemBounds.length > 0 && overlapCount === 0) strengths.push("Placed furniture has a workable footprint.");

  const lightScore = roomsNeedingLight.length === 0
    ? 100
    : clampScore((roomsWithExteriorLight.length / roomsNeedingLight.length) * 100);
  const connectionScore = connectionChecklist.length === 0
    ? rooms.length > 1 ? 65 : 90
    : clampScore(((connectionChecklist.length - missingConnections.length) / connectionChecklist.length) * 100);
  const privacyScore = clampScore(100 - issues.filter((issue) => issue.category === "privacy").length * 18);
  const storageScore = supportMissing ? 62 : 92;
  const furnitureScore = itemBounds.length === 0
    ? 78
    : clampScore(100 - overlapCount * 24 - tightItemCount * 8);
  const accessibilityScore = clampScore(
    100 -
      issues.filter((issue) => issue.category === "accessibility").length * 24 -
      missingConnections.length * 8 -
      tightItemCount * 4
  );
  const readinessScore = clampScore(
    100 -
      issues.filter((issue) => issue.severity === "review").length * 18 -
      issues.filter((issue) => issue.severity === "improvement").length * 10 -
      issues.filter((issue) => issue.severity === "tip").length * 4
  );

  const categoryScores: FloorPlanQualityReport["categoryScores"] = {
    naturalLight: lightScore,
    connections: connectionScore,
    privacy: privacyScore,
    storageSupport: storageScore,
    furnitureFit: furnitureScore,
    accessibility: accessibilityScore,
    readiness: readinessScore,
  };
  const score = clampScore(
    lightScore * 0.18 +
      connectionScore * 0.18 +
      privacyScore * 0.1 +
      storageScore * 0.12 +
      furnitureScore * 0.16 +
      accessibilityScore * 0.12 +
      readinessScore * 0.14
  );
  const sortedIssues = [...issues].sort((a, b) => {
    const rank = { review: 0, improvement: 1, tip: 2 };
    return rank[a.severity] - rank[b.severity];
  });
  const primaryAction = primaryActionForIssues(sortedIssues);
  const intentTags = buildIntentTags(rooms);
  const suggestedNextActions = Array.from(new Set(sortedIssues.map((issue) => issue.action))).slice(0, 4);

  return {
    score,
    label: labelForScore(score),
    categoryScores,
    strengths,
    issues: sortedIssues,
    suggestedFixes: sortedIssues.slice(0, 5).map((issue) => issue.suggestedFix),
    primaryAction,
    aiPlanningContext: {
      planIntent: {
        summary: intentTags.length > 0 ? intentTags.join(", ") : "custom floor plan",
        tags: intentTags,
        activeRoomId,
      },
      roomGraph: {
        nodes: rooms.map((room) => {
          const exteriorWindows = roomWindows(room, openings, rooms);
          return {
            id: room.id,
            name: room.name,
            roomType: room.roomType,
            areaSqm: roomArea(room),
            hasWindow: exteriorWindows.length > 0,
            exteriorWindowCount: exteriorWindows.length,
          };
        }),
        edges: connectionChecklist.map((connection) => ({
          fromRoomId: connection.roomIds[0],
          toRoomId: connection.roomIds[1],
          connected: connection.status === "connected",
          sharedWallLengthMeters: connection.sharedWallLengthMeters,
        })),
      },
      exteriorLightSummary: {
        roomsNeedingLight: roomsNeedingLight.map((room) => room.id),
        roomsWithExteriorLight: roomsWithExteriorLight.map((room) => room.id),
        roomsMissingLight: roomsMissingLight.map((room) => room.id),
      },
      blockedTightIssues: sortedIssues
        .filter((issue) => issue.category === "connections" || issue.category === "furnitureFit" || issue.category === "accessibility")
        .map((issue) => ({
          id: issue.id,
          roomId: issue.roomId,
          target: issue.target,
          label: issue.title,
          severity: issue.severity,
        })),
      missingSupportSpaces: supportMissing ? ["entry", "storage", "laundry", "utility"] : [],
      suggestedNextActions,
    },
  };
}

export { oppositeWall as getOppositeFloorPlanWall };
