import { useMemo } from "react";
import { Line } from "@react-three/drei/core/Line";
import type { CanonicalFloorPlanFloorRenderModel } from "@/lib/floor-plan-render-model";
import { isFloorPlanVoidRoom, voidRoomCrossSegments } from "@/lib/floor-plan-void-rooms";

type Floor = CanonicalFloorPlanFloorRenderModel;

/** A void (duct, shaft): only its dashed cross, as the plan draws it - no fill, no name. */
function CanonicalVoidRoom2D({
  room,
  walls,
  floorId,
  geometryHash,
}: {
  room: Floor["rooms"][number];
  walls: Floor["walls"];
  floorId: string;
  geometryHash: string;
}) {
  const lines = useMemo(() => {
    const outer = room.wallLoops.find((loop) => loop.kind === "outer");
    const thickness = new Map(walls.map((wall) => [wall.id, wall.thicknessMm]));
    return voidRoomCrossSegments(
      outer?.walls.map((wall) => wall.start) ?? [],
      outer?.walls.map((wall) => (thickness.get(wall.wallId) ?? 0) / 2)
    ).map(
      ([start, end]) =>
        [
          [start.xMm / 1000, 0.012, start.zMm / 1000],
          [end.xMm / 1000, 0.012, end.zMm / 1000],
        ] as [number, number, number][]
    );
  }, [room.wallLoops, walls]);
  if (!lines.length) return null;
  return (
    <group
      userData={{
        testId: "canonical-void-room-2d",
        canonicalFloorId: floorId,
        canonicalRoomId: room.id,
        canonicalGeometryHash: geometryHash,
      }}
    >
      {lines.map((points, index) => (
        <Line
          key={index}
          points={points}
          color="#64748b"
          lineWidth={1.2}
          dashed
          dashSize={0.08}
          gapSize={0.05}
          raycast={() => null}
        />
      ))}
    </group>
  );
}

/** Every void (duct, shaft) of the floor, drawn as its dashed cross under the walls. */
export function CanonicalVoidRooms2D({ floor, geometryHash }: { floor: Floor; geometryHash: string }) {
  return (
    <>
      {floor.rooms.filter(isFloorPlanVoidRoom).map((room) => (
        <CanonicalVoidRoom2D
          key={`${floor.id}:void:${room.id}`}
          room={room}
          walls={floor.walls}
          floorId={floor.id}
          geometryHash={geometryHash}
        />
      ))}
    </>
  );
}
