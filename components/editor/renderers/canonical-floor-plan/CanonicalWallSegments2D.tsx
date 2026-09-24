import type { ThreeEvent } from "@react-three/fiber";
import type { CanonicalFloorPlanFloorRenderModel } from "@/lib/floor-plan-render-model";
import type { CanonicalWallGestureControls } from "@/lib/floor-plan-wall-gesture";
import { preferredRoomId, segmentTransform } from "./geometry";

type CanonicalPointerEvent = ThreeEvent<MouseEvent | PointerEvent>;
type Props = {
  floor: CanonicalFloorPlanFloorRenderModel; geometryHash: string; activeRoomId: string | null;
  theme: "consumer" | "pro"; interactive: boolean; wallEditing?: CanonicalWallGestureControls;
  onSelectWall?: (wallId: string, roomId: string | null) => void;
  onSelectRoom?: (roomId: string) => void;
  onSelectOpening?: (openingId: string | null) => void;
};

export function CanonicalWallSegments2D({ floor, geometryHash, activeRoomId, theme, interactive,
  wallEditing, onSelectWall, onSelectRoom, onSelectOpening }: Props) {
  return <group>
      {floor.walls.flatMap((wall) => {
        const roomId = preferredRoomId(wall.adjacentRoomIds, activeRoomId);
        const color = wallEditing?.enabled && wallEditing.selectedWallId === wall.id ? "#2563eb"
          : roomId === activeRoomId ? "#16a34a" : theme === "pro" ? "#a1a1aa" : "#b8b0a1";
        return wall.planSegments.map((segment) => {
          const geometry = segmentTransform(segment);
          return (
            <mesh
              key={`${floor.id}:wall:${wall.id}:segment:${segment.startOffsetMm}:${segment.endOffsetMm}`}
              position={[geometry.centerX, 0.009, geometry.centerZ]}
              rotation-y={geometry.rotationY}
              raycast={interactive ? undefined : () => null}
              userData={{
                testId: "canonical-wall-2d",
                canonicalFloorId: floor.id,
                canonicalWallId: wall.id,
                canonicalPathKind: wall.path.kind,
                canonicalThicknessMm: wall.thicknessMm,
                canonicalGeometryHash: geometryHash,
              }}
              onClick={
                interactive
                  ? (event: CanonicalPointerEvent) => {
                      event.stopPropagation();
                      if (wallEditing?.enabled) wallEditing.select(floor.id, wall.id);
                      else if (onSelectWall) onSelectWall(wall.id, roomId);
                      else if (roomId) onSelectRoom?.(roomId);
                      onSelectOpening?.(null);
                    }
                  : undefined
              }
            >
              <boxGeometry
                args={[
                  geometry.length,
                  0.018,
                  Math.max(0.01, wall.thicknessMm / 1000),
                ]}
              />
              <meshBasicMaterial color={color} />
            </mesh>
          );
        });
      })}
  </group>;
}
