import { HOUSE_PLAN_RENDERED_WALL_THICKNESS_METERS } from "@/lib/editor-geometry-tolerances";
import {
  resolveSceneItemCanonicalTransform,
  type SceneRoomItemEntry,
} from "@/lib/design-page-scene-domain";

export type SceneProjection = "plan" | "spatial";

export type SceneItemProjection = {
  position: [number, number, number];
  rotationY: number;
  wallThickness: number;
  wallContactInset: number;
};

/**
 * Thin renderer adapter from the canonical scene model to plan/spatial values.
 * It owns no persistence, permissions, pricing, or canonical geometry.
 */
export function projectSceneRoomItem(
  entry: SceneRoomItemEntry,
  projection: SceneProjection,
  localPosition: [number, number, number] = entry.item.position
): SceneItemProjection {
  const transform = resolveSceneItemCanonicalTransform(entry, localPosition);
  const usesHousePlanShell = entry.roomWallModel === "house-plan-shell";
  const wallThickness =
    projection === "spatial" && usesHousePlanShell
      ? HOUSE_PLAN_RENDERED_WALL_THICKNESS_METERS
      : entry.roomWallThickness;

  return {
    position:
      projection === "spatial"
        ? transform.worldPosition
        : [
            transform.worldPosition[0],
            transform.localPosition[1] ?? 0,
            transform.worldPosition[2],
          ],
    rotationY: transform.rotationY,
    wallThickness,
    wallContactInset:
      projection === "plan"
        ? 0
        : usesHousePlanShell
          ? HOUSE_PLAN_RENDERED_WALL_THICKNESS_METERS / 2
          : entry.roomWallThickness,
  };
}

/** Preserves world X/Z while returning renderer Y to the canonical floor plane. */
export function removeSceneProjectionElevation(
  entry: SceneRoomItemEntry,
  projection: SceneProjection,
  position: [number, number, number]
): [number, number, number] {
  return [
    position[0],
    projection === "spatial"
      ? position[1] - entry.roomFloorElevationMeters
      : position[1],
    position[2],
  ];
}
