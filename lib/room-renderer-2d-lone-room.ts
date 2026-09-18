type PlanRoomRect2D = {
  x: number;
  z: number;
  w: number;
  d: number;
};

export type LoneRoomPlanFrame2D = {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  /** Closed rectangle in plan (XZ) coordinates. */
  outline: Array<[number, number]>;
};

/**
 * Frame for the plain floor and outline the 2D plan draws when a floor has
 * exactly one room. It comes from that room's own plan rectangle: the plan
 * width/depth handed to the renderer is the origin-symmetric house extent, which
 * only matches the room while the room sits at the origin.
 */
export function resolveLoneRoomPlanFrame2D(
  rooms: readonly PlanRoomRect2D[]
): LoneRoomPlanFrame2D | null {
  if (rooms.length !== 1) return null;
  const [{ x, z, w, d }] = rooms;
  const left = x - w / 2;
  const right = x + w / 2;
  const top = z - d / 2;
  const bottom = z + d / 2;
  return {
    centerX: x,
    centerZ: z,
    width: w,
    depth: d,
    outline: [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
      [left, top],
    ],
  };
}
