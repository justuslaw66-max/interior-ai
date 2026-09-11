import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { WallSegment3D } from "./geometry";

export function projectOpeningWorldCenterOntoLegacySegment(
  room: Pick<HousePlanRoom2D, "x" | "z">,
  segment: WallSegment3D,
  worldCenter: { x: number; z: number },
  openingWidth: number
): number | null {
  const direction = [
    Math.cos(segment.rotationY),
    -Math.sin(segment.rotationY),
  ] as const;
  const deltaX = worldCenter.x - room.x - segment.x;
  const deltaZ = worldCenter.z - room.z - segment.z;
  const perpendicular = Math.abs(deltaX * -direction[1] + deltaZ * direction[0]);
  if (perpendicular > 0.002) return null;
  const offset = deltaX * direction[0] + deltaZ * direction[1];
  return Math.abs(offset) <= segment.length / 2 + openingWidth / 2
    ? offset
    : null;
}
