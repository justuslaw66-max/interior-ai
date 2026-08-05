import { fingerprintDesignSnapshot } from "../../lib/snapshot-fingerprint";
import {
  sanitizeStoredDesign,
  snapshotToStored,
  storedToSnapshot,
} from "../../lib/room-persistence";
import {
  assertSharedDesignSnapshotPublic,
  projectSharedStoredDesign,
} from "../../lib/shared-design-snapshot";
import type {
  DesignItem,
  DesignSnapshot,
  LayoutVersion,
  RoomSnapshot,
  ZoneMin,
} from "../../lib/room-types";

const PUBLIC_DESIGN_RESPONSE_FIELDS = [
  "budget",
  "id",
  "items",
  "mode",
  "notes",
  "roomDepth",
  "roomWidth",
  "savedViews",
  "shareEnabled",
  "shareToken",
  "snapshot",
  "style",
  "title",
  "updatedAt",
  "zones",
] as const;

export type PublicDesignProjection = {
  designId: string;
  mode: "homeowner" | "designer";
  revision: string;
  snapshot: DesignSnapshot;
};

export type PublicDesignProjectionIdentity = Pick<
  PublicDesignProjection,
  "designId" | "revision"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(`Invalid public design projection: ${message}`);
}

function compareStableId(
  left: { id?: string; instanceId?: string },
  right: { id?: string; instanceId?: string }
) {
  const leftId = left.id ?? left.instanceId ?? "";
  const rightId = right.id ?? right.instanceId ?? "";
  if (leftId < rightId) return -1;
  if (leftId > rightId) return 1;
  return 0;
}

function normalizeItems(items: DesignItem[]) {
  return [...items].sort(compareStableId);
}

function normalizeZones(zones: ZoneMin[]) {
  return [...zones]
    .sort(compareStableId)
    .map((zone) => ({ ...zone, itemIds: [...zone.itemIds].sort() }));
}

function normalizeLayoutVersions(layoutVersions: LayoutVersion[] | undefined) {
  if (!layoutVersions) return undefined;
  return [...layoutVersions]
    .sort(compareStableId)
    .map((layoutVersion) => ({
      ...layoutVersion,
      items: normalizeItems(layoutVersion.items),
      zones: normalizeZones(layoutVersion.zones),
    }));
}

function normalizeRoom(room: RoomSnapshot): RoomSnapshot {
  return {
    ...room,
    items: normalizeItems(room.items),
    zones: normalizeZones(room.zones),
    savedViews: [...room.savedViews].sort(compareStableId),
    layoutVersions: normalizeLayoutVersions(room.layoutVersions),
  };
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, normalizeValue(value[key])])
  );
}

function requireEquivalentValue(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(normalizeValue(actual)) !== JSON.stringify(normalizeValue(expected))) {
    fail(`${label} did not match the public snapshot`);
  }
}

export function normalizePublicDesignProjection(
  snapshot: DesignSnapshot
): DesignSnapshot {
  const projectedStored = projectSharedStoredDesign(snapshotToStored(snapshot));
  if (!projectedStored) fail("snapshot could not be canonicalized to the public schema");
  const projected = storedToSnapshot(projectedStored);
  assertSharedDesignSnapshotPublic(projected);
  return {
    ...projected,
    rooms: projected.rooms.map(normalizeRoom).sort(compareStableId),
  };
}

export function fingerprintPublicDesignProjection(snapshot: DesignSnapshot) {
  return fingerprintDesignSnapshot(normalizePublicDesignProjection(snapshot));
}

export function publicDesignProjectionHasIdentity(
  projection: PublicDesignProjectionIdentity,
  expected: PublicDesignProjectionIdentity
) {
  return (
    projection.designId === expected.designId &&
    projection.revision === expected.revision
  );
}

export function parsePublicDesignProjection(
  body: unknown,
  expectedDesignId: string
): PublicDesignProjection {
  if (!isRecord(body)) fail("response body must be an object");

  const actualFields = Object.keys(body).sort();
  if (JSON.stringify(actualFields) !== JSON.stringify(PUBLIC_DESIGN_RESPONSE_FIELDS)) {
    fail(`response fields were ${actualFields.join(", ")}`);
  }
  if (body.id !== expectedDesignId) fail("response design ID did not match the request");
  if (body.shareEnabled !== true) fail("shareEnabled must be true");
  if (body.shareToken !== null) fail("the bearer share token must not be returned");
  if (body.mode !== "homeowner" && body.mode !== "designer") {
    fail("mode must be homeowner or designer");
  }
  if (
    typeof body.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(body.updatedAt))
  ) {
    fail("updatedAt must identify the shared cloud revision");
  }

  const stored = sanitizeStoredDesign(body.snapshot);
  if (!stored) fail("a valid v3 public snapshot is required");
  const snapshot = storedToSnapshot(stored);
  assertSharedDesignSnapshotPublic(snapshot);
  const activeRoom = snapshot.rooms.find((room) => room.id === snapshot.activeRoomId);
  if (!activeRoom) fail("the active public room is required");
  if (body.title !== snapshot.title) fail("title did not match the public snapshot");
  if (body.roomWidth !== activeRoom.geometry.width) {
    fail("roomWidth did not match the active public room");
  }
  if (body.roomDepth !== activeRoom.geometry.depth) {
    fail("roomDepth did not match the active public room");
  }
  requireEquivalentValue(body.items, activeRoom.items, "items");
  requireEquivalentValue(body.zones, activeRoom.zones, "zones");
  requireEquivalentValue(body.savedViews, activeRoom.savedViews, "savedViews");
  if (body.style !== (snapshot.style ?? null)) {
    fail("style did not match the public snapshot");
  }
  if (body.budget !== (snapshot.budget ?? null)) {
    fail("budget did not match the public snapshot");
  }
  if (body.notes !== (snapshot.notes ?? null)) {
    fail("notes did not match the public snapshot");
  }

  return {
    designId: expectedDesignId,
    mode: body.mode,
    revision: body.updatedAt,
    snapshot,
  };
}
