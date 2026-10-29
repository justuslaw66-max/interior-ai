"use client";

import { StableLine as Line } from "./StableLine";
import { getRoomPanelStrips2D, type PanelFaceRoom2D, type PanelStripOpenings2D } from "./roomPanelStrips2D";
import { getHouseRoomWallPlanColor, type WallPlanColourRoom2D } from "./roomWallPlanColour2D";
import { noRaycast } from "@/components/scene/stableSceneProps";
import { useCanvasPalette } from "@/lib/canvas-colours";

/**
 * The 2D plan's laminate panels (J, 29 Oct 2026: the room measured to the panel face): each panel's strip inside the wall
 * band, in the wall's finish colour, with its face drawn as a thin line, stopped at doorways. Nothing for a room without
 * panels, and nothing while the plan draws no wall bands (`shown`: a canonical plan draws its own walls).
 */
export function RoomPanelFaces2D({
  rooms,
  planRooms,
  openings,
  shown,
  isPro,
}: {
  rooms: readonly (PanelFaceRoom2D & WallPlanColourRoom2D)[];
  /** The rooms where they are saved, which the openings are placed against; `rooms` may hold a dragged copy. */
  planRooms: PanelStripOpenings2D["rooms"];
  openings: PanelStripOpenings2D["openings"];
  shown: boolean;
  isPro: boolean;
}) {
  const palette = useCanvasPalette();
  if (!shown) return null;
  return rooms.flatMap((room) =>
    getRoomPanelStrips2D(room, { rooms: planRooms, openings }).strips.map((strip) => (
      <group key={strip.key} position={[room.x, 0.0016, room.z]} userData={{ testId: "room-wall-panel-2d", faceId: strip.faceId }}>
        <mesh rotation-x={-Math.PI / 2} raycast={noRaycast}>
          <shapeGeometry args={[strip.shape]} />
          <meshBasicMaterial
            color={getHouseRoomWallPlanColor(room, strip.faceId, isPro, palette)}
            transparent
            opacity={0.96}
            depthWrite={false}
          />
        </mesh>
        {/* The panel's edge, drawn on its finish as the finish is: the same in dark. */}
        <Line points={strip.faceLine} color="#57534e" lineWidth={1} />
      </group>
    ))
  );
}
