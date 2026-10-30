"use client";

import { useMemo } from "react";
import { Shape, Vector2 } from "three";
import { noRaycast } from "@/components/scene/stableSceneProps";
import { useCanvasPalette } from "@/lib/canvas-colours";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { CanonicalFloorPlanFloorRenderModel } from "@/lib/floor-plan-render-model";
import { StableLine as Line } from "../StableLine";
import { getWallFinishPlanColor } from "../roomWallPlanColour2D";
import { getCanonicalPanelStrips2D } from "./canonicalWallPanels";

/**
 * An imported plan's laminate panels on the 2D plan: each strip in the plan colour of its finish, with the panel's face as a
 * thin line, as a drawn room's are (RoomPanelFaces2D.tsx). Rebuilt when the floor or the rooms change.
 */
export function CanonicalPanelStrips2D({ floor, rooms, isPro }: {
  floor: CanonicalFloorPlanFloorRenderModel;
  rooms: readonly HousePlanRoom2D[];
  isPro: boolean;
}) {
  const palette = useCanvasPalette();
  const strips = useMemo(() => getCanonicalPanelStrips2D(floor, rooms).map((strip) => ({
    ...strip,
    // The plan is drawn looking down: a shape's y is the plan's -z, as the room shapes are (lib/room-plan-shape.ts).
    shape: new Shape(strip.corners.map((point) => new Vector2(point.x, -point.z))),
  })), [floor, rooms]);
  return strips.map((strip) => (
    <group
      key={strip.key}
      position={[0, 0.0016, 0]}
      userData={{ testId: "canonical-wall-panel-2d", canonicalWallId: strip.wallId, canonicalRoomId: strip.roomId }}
    >
      <mesh rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <shapeGeometry args={[strip.shape]} />
        <meshBasicMaterial color={getWallFinishPlanColor(strip.finish, isPro, palette)} transparent opacity={0.96} depthWrite={false} />
      </mesh>
      {/* The panel's edge, drawn on its finish as the finish is: the same in dark. */}
      <Line points={strip.faceLine} color="#57534e" lineWidth={1} />
    </group>
  ));
}
