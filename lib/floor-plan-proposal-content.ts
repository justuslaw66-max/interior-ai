import type { DesignItem, DesignSnapshot, LayoutVersion, RoomSnapshot, ZoneMin } from "@/lib/room-types";
import type { FloorPlanTopologyMutationV2, FloorPlanRoomSplitLineageV2 } from "@/lib/floor-plan-topology-mutation-types";
import { isPointInPlanarRing } from "@/lib/floor-plan-planar-union";

function containsWorldPoint(room: RoomSnapshot, point: [number, number, number]) {
  const offset = room.planPosition ?? { x: 0, z: 0 };
  const local = { xMm: (point[0] - offset.x) * 1000, zMm: (point[2] - offset.z) * 1000 };
  const points = (ring: { x: number; z: number }[]) => ring.map((p) => ({ xMm: p.x * 1000, zMm: p.z * 1000 }));
  return isPointInPlanarRing(local, points(room.planPolygon ?? [])) && !(room.planHoles ?? []).some((hole) => isPointInPlanarRing(local, points(hole)));
}

type RoomOrigin = Pick<RoomSnapshot, "planPosition">;

function translatedPosition(position: [number, number, number], from: RoomOrigin, to?: RoomOrigin): [number, number, number] {
  return [position[0] + (from.planPosition?.x ?? 0) - (to?.planPosition?.x ?? 0), position[1], position[2] + (from.planPosition?.z ?? 0) - (to?.planPosition?.z ?? 0)];
}

function rehostItem(item: DesignItem, from: RoomOrigin, to: RoomSnapshot): DesignItem {
  return {
    ...item, position: translatedPosition(item.position, from, to),
    ...(item.roomId ? { roomId: to.id } : {}),
    ...(item.transform ? { transform: { ...item.transform, position: translatedPosition(item.transform.position, from, to) } } : {}),
  };
}

function rehostZone(zone: ZoneMin, from: RoomOrigin, to: RoomOrigin): ZoneMin {
  return { ...zone, ...(zone.anchor ? { anchor: translatedPosition(zone.anchor, from, to) } : {}) };
}

export function rehostSavedRoomLayouts(versions: readonly LayoutVersion[], previous: RoomOrigin, target: RoomSnapshot): LayoutVersion[] {
  return structuredClone(versions).map((version) => ({ ...version,
    items: version.items.map((item) => rehostItem(item, previous, target)),
    zones: version.zones.map((zone) => rehostZone(zone, previous, target)),
  }));
}

function rehostSavedLayouts(previous: RoomSnapshot, target: RoomSnapshot, issues: Set<string>) {
  if (!previous.layoutVersions) return;
  target.layoutVersions = rehostSavedRoomLayouts(previous.layoutVersions, previous, target);
  if (target.layoutVersions.some((version) => version.items.some((item) => !containsWorldPoint(target, translatedPosition(item.position, target))))) {
    issues.add(`Saved layouts in ${target.name} retain their world positions. Some items lie outside the new room boundary; review before restoring.`);
  }
}

function contentTargets(before: DesignSnapshot, after: DesignSnapshot, operation: FloorPlanTopologyMutationV2) {
  const created = after.rooms.filter((room) => !before.rooms.some(({ id }) => id === room.id));
  return before.rooms.map((previous) => {
    const same = after.rooms.find(({ id }) => id === previous.id);
    const keep = operation.kind === "remove_wall" ? after.rooms.find(({ id }) => id === operation.keepRoomId) : undefined;
    const primary = same ?? keep;
    if (!primary) throw new Error(`Room ${previous.id} has no reviewed content destination.`);
    return { previous, primary, candidates: [primary, ...created.filter((room) => room.floorLevel === previous.floorLevel)] };
  });
}

function distributeZones(previous: RoomSnapshot, targets: RoomSnapshot[], issues: Set<string>, usedIds: Set<string>) {
  for (const zone of previous.zones) {
    const groups = targets.flatMap((target) => {
      const itemIds = zone.itemIds.filter((id) => target.items.some((item) => item.instanceId === id));
      return itemIds.length ? [{ target, itemIds }] : [];
    });
    if (!groups.length) {
      targets[0].zones.push(rehostZone(zone, previous, targets[0]));
      continue;
    }
    for (const [index, { target, itemIds }] of groups.entries()) {
      let id = zone.id;
      if (index > 0) {
        const base = `${zone.id}:split:${target.id}`;
        id = base;
        for (let suffix = 2; usedIds.has(id); suffix++) id = `${base}:${suffix}`;
        usedIds.add(id);
      }
      target.zones.push({ ...rehostZone(zone, previous, target), id, itemIds });
    }
    if (groups.length > 1) issues.add(`Zone ${zone.id} was split between ${groups.map(({ target }) => target.name).join(" and ")}. Each part keeps its local members; review the grouping in Zones.`);
  }
}

/** Reconciles only editor projections; canonical geometry remains the transaction result. */
export function reconcileProposedRoomContent(before: DesignSnapshot, after: DesignSnapshot, operation: FloorPlanTopologyMutationV2, splits: readonly FloorPlanRoomSplitLineageV2[] = []): DesignSnapshot {
  const rooms = after.rooms.map((room) => ({ ...room, items: [] as DesignItem[], zones: [] as ZoneMin[] }));
  const next = { ...after, rooms };
  const recovery = [...(before.floorPlan?.proposal?.roomRecovery ?? [])];
  const issues = new Set(before.floorPlan?.proposal?.reviewIssues ?? []);
  const zoneIds = new Set(before.rooms.flatMap((room) => room.zones.map(({ id }) => id)));
  for (const { previous, primary, candidates } of contentTargets(before, next, operation)) {
    if (!rooms.some(({ id }) => id === previous.id)) {
      recovery.push({ id: previous.id, name: previous.name, roomType: previous.roomType, floorLevel: previous.floorLevel, planPosition: previous.planPosition, surfaces: previous.surfaces, surfaceFinishes: previous.surfaceFinishes, savedViews: previous.savedViews, layoutVersions: previous.layoutVersions });
      issues.add(`Room ${previous.name} merged into ${primary.name}. Its alternate finishes and saved layouts remain in room recovery.`);
    } else rehostSavedLayouts(previous, primary, issues);
    for (const item of previous.items) {
      const world = translatedPosition(item.position, previous);
      const target = candidates.find((room) => containsWorldPoint(room, world)) ?? primary;
      target.items.push(rehostItem(item, previous, target));
      if (!containsWorldPoint(target, world)) issues.add(`Placement ${item.instanceId} needs review after the wall edit; its world position is preserved.`);
    }
    distributeZones(previous, candidates, issues, zoneIds);
  }
  for (const room of rooms.filter((candidate) => !before.rooms.some(({ id }) => id === candidate.id))) {
    const point: [number, number, number] = [room.planPosition?.x ?? 0, 0, room.planPosition?.z ?? 0];
    const lineage = splits.find(({ newRoomId }) => newRoomId === room.id);
    const parent = before.rooms.find((candidate) => lineage ? candidate.id === lineage.parentRoomId : containsWorldPoint(candidate, point));
    room.surfaces = parent?.surfaces;
    room.surfaceFinishes = parent?.surfaceFinishes;
    issues.add(`New room ${room.name} inherits its parent's finishes. Review the association in Surfaces.`);
  }
  const originalDocument = before.floorPlan?.proposal?.originalDocument ?? before.floorPlan?.canonicalDocument;
  if (!originalDocument) throw new Error("Proposal is missing its immutable original document.");
  return { ...next, floorPlan: { ...next.floorPlan, proposal: { originalDocument, roomRecovery: recovery, reviewIssues: [...issues] } } };
}
