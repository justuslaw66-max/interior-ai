import type { DesignSnapshot } from "@/lib/room-types";
import { MAX_ROOM_LAYOUT_VERSIONS } from "@/lib/layout-versions";
import { rehostSavedRoomLayouts } from "@/lib/floor-plan-proposal-content";

export type RecoverProposedRoomLayoutInput = { sourceRoomId: string; targetRoomId: string; layoutId: string };

/** Adds a recoverable layout; never replaces the currently placed furniture or the archive. */
export function recoverProposedRoomLayout(snapshot: DesignSnapshot, input: RecoverProposedRoomLayoutInput): DesignSnapshot {
  const proposal = snapshot.floorPlan?.proposal;
  if (!proposal || !snapshot.floorPlan?.canonicalDocument) throw new Error("No private proposed plan is available for recovery.");
  const source = proposal.roomRecovery.find(({ id }) => id === input.sourceRoomId);
  const saved = source?.layoutVersions?.find(({ id }) => id === input.layoutId);
  const target = snapshot.rooms.find(({ id }) => id === input.targetRoomId);
  if (!source || !saved || !target) throw new Error("The saved layout or target room is no longer available.");
  const originalFloor = proposal.originalDocument.floors.find((floor) => floor.rooms.some(({ id }) => id === source.id));
  const sourceLevel = source.floorLevel ?? (originalFloor ? originalFloor.levelIndex + 1 : undefined);
  if (sourceLevel === undefined || sourceLevel !== (target.floorLevel ?? 1)) throw new Error("Recover this layout into a room on its original floor.");
  const id = `recovered:${source.id}:${saved.id}`;
  if (target.layoutVersions?.some((version) => version.id === id)) throw new Error("This layout is already recovered in that room. Open Layouts to preview or restore it.");
  if ((target.layoutVersions?.length ?? 0) >= MAX_ROOM_LAYOUT_VERSIONS) {
    throw new Error(`This room already has ${MAX_ROOM_LAYOUT_VERSIONS} saved layouts. Remove one in Layouts before recovering another; the archived copy remains saved.`);
  }
  const [translated] = rehostSavedRoomLayouts([saved], source, target);
  const recovered = { ...translated, id, name: `${saved.name} — from ${source.name}` };
  return { ...snapshot, rooms: snapshot.rooms.map((room) => room.id === target.id
    ? { ...room, layoutVersions: [recovered, ...(room.layoutVersions ?? [])] } : room) };
}
