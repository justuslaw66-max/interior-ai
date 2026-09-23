import { createHash } from "node:crypto";
import type {
  DesignItem,
  DesignSnapshot,
  LayoutVersion,
  RoomSnapshot,
  ZoneMin,
} from "@/lib/room-types";
import { assertSharedDesignSnapshotPublic } from "@/lib/shared-design-projection-schema";
import { serializeDesignSnapshotFingerprint } from "@/lib/snapshot-fingerprint";

export const PUBLIC_PROJECTION_CONTENT_IDENTITY_VERSION =
  "public-design-projection.v1" as const;

function compareStableIdentity(
  left: { id?: string; instanceId?: string },
  right: { id?: string; instanceId?: string }
) {
  const leftId = left.id ?? left.instanceId ?? "";
  const rightId = right.id ?? right.instanceId ?? "";
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function canonicalItems(items: DesignItem[]) {
  return [...items].sort(compareStableIdentity);
}

function canonicalZones(zones: ZoneMin[]) {
  return [...zones]
    .sort(compareStableIdentity)
    .map((zone) => ({ ...zone, itemIds: [...zone.itemIds].sort() }));
}

function canonicalLayoutVersions(layoutVersions: LayoutVersion[] | undefined) {
  if (!layoutVersions) return undefined;
  return [...layoutVersions]
    .sort(compareStableIdentity)
    .map((layoutVersion) => ({
      ...layoutVersion,
      items: canonicalItems(layoutVersion.items),
      zones: canonicalZones(layoutVersion.zones),
    }));
}

function canonicalRoom(room: RoomSnapshot): RoomSnapshot {
  return {
    ...room,
    items: canonicalItems(room.items),
    zones: canonicalZones(room.zones),
    savedViews: [...room.savedViews].sort(compareStableIdentity),
    layoutVersions: canonicalLayoutVersions(room.layoutVersions),
  };
}

/** Canonical content only; publication, authorization, and layout state stay separate. */
export function canonicalizePublicDesignProjection(
  snapshot: DesignSnapshot
): DesignSnapshot {
  assertSharedDesignSnapshotPublic(snapshot);
  return {
    ...snapshot,
    rooms: snapshot.rooms.map(canonicalRoom).sort(compareStableIdentity),
  };
}

export function serializePublicDesignProjectionIdentity(snapshot: DesignSnapshot) {
  const content = serializeDesignSnapshotFingerprint(
    canonicalizePublicDesignProjection(snapshot)
  );
  return `${PUBLIC_PROJECTION_CONTENT_IDENTITY_VERSION}\n${content}`;
}

/** Synchronous server-owned SHA-256 over the closed canonical public projection. */
export function buildPublicProjectionContentIdentity(snapshot: DesignSnapshot) {
  const digest = createHash("sha256")
    .update(serializePublicDesignProjectionIdentity(snapshot))
    .digest("hex");
  return `${PUBLIC_PROJECTION_CONTENT_IDENTITY_VERSION}:sha256:${digest}`;
}
