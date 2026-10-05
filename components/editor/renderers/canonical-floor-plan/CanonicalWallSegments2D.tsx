import { memo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type {
  CanonicalFloorPlanFloorRenderModel,
  CanonicalFloorPlanWallRenderModel,
} from "@/lib/floor-plan-render-model";
import type { CanonicalWallGestureControls } from "@/lib/floor-plan-wall-gesture";
import { useLatestCallback } from "../useLatestCallback";
import { preferredRoomId, segmentTransform } from "./geometry";

type CanonicalPointerEvent = ThreeEvent<MouseEvent | PointerEvent>;
type Props = {
  floor: CanonicalFloorPlanFloorRenderModel; geometryHash: string; activeRoomId: string | null;
  theme: "consumer" | "pro"; interactive: boolean; wallEditing?: CanonicalWallGestureControls;
  onSelectWall?: (wallId: string, roomId: string | null) => void;
  onSelectRoom?: (roomId: string) => void;
  onSelectOpening?: (openingId: string | null) => void;
};
type WallProps = {
  wall: CanonicalFloorPlanWallRenderModel; floorId: string; geometryHash: string;
  roomId: string | null; color: string; interactive: boolean;
  onPick: (wallId: string, roomId: string | null) => void;
};

/** One wall's plan segments. Memoized: selecting a room re-renders only the walls whose color or room changed. */
const CanonicalWall2D = memo(function CanonicalWall2D({ wall, floorId, geometryHash, roomId, color, interactive, onPick }: WallProps) {
  return wall.planSegments.map((segment) => {
    const geometry = segmentTransform(segment);
    return (
      <mesh
        key={`${floorId}:wall:${wall.id}:segment:${segment.startOffsetMm}:${segment.endOffsetMm}`}
        position={[geometry.centerX, 0.009, geometry.centerZ]}
        rotation-y={geometry.rotationY}
        raycast={interactive ? undefined : () => null}
        userData={{
          testId: "canonical-wall-2d",
          canonicalFloorId: floorId,
          canonicalWallId: wall.id,
          canonicalPathKind: wall.path.kind,
          canonicalThicknessMm: wall.thicknessMm,
          canonicalGeometryHash: geometryHash,
        }}
        onClick={interactive ? (event: CanonicalPointerEvent) => {
          event.stopPropagation();
          onPick(wall.id, roomId);
        } : undefined}
      >
        <boxGeometry args={[geometry.length, 0.018, Math.max(0.01, wall.thicknessMm / 1000)]} />
        <meshBasicMaterial color={color} />
      </mesh>
    );
  });
});

export function CanonicalWallSegments2D({ floor, geometryHash, activeRoomId, theme, interactive,
  wallEditing, onSelectWall, onSelectRoom, onSelectOpening }: Props) {
  // One handler for every wall, stable across renders, so a click elsewhere leaves the walls alone.
  const pick = useLatestCallback((wallId: string, roomId: string | null) => {
    if (wallEditing?.enabled) wallEditing.select(floor.id, wallId);
    else if (onSelectWall) onSelectWall(wallId, roomId);
    else if (roomId) onSelectRoom?.(roomId);
    onSelectOpening?.(null);
  });
  return <group>
      {floor.walls.map((wall) => {
        const roomId = preferredRoomId(wall.adjacentRoomIds, activeRoomId);
        const color = wallEditing?.enabled && wallEditing.selectedWallId === wall.id ? "#2563eb"
          : roomId === activeRoomId ? "#16a34a" : theme === "pro" ? "#a1a1aa" : "#b8b0a1";
        return <CanonicalWall2D key={`${floor.id}:wall:${wall.id}`} wall={wall} floorId={floor.id}
          geometryHash={geometryHash} roomId={roomId} color={color} interactive={interactive} onPick={pick} />;
      })}
  </group>;
}
