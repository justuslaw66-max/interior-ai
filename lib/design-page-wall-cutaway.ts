import type { RoomOpening2D } from "@/lib/editorScene";

export type CutawayWallId = RoomOpening2D["wall"];

type CutawayWallParams = {
  cameraX: number;
  cameraZ: number;
  roomX: number;
  roomZ: number;
  roomWidth: number;
  roomDepth: number;
  wall?: CutawayWallId;
  outsideBufferMeters?: number;
};

type CutawayWallOpacityParams = CutawayWallParams & {
  baseOpacity: number;
  cutawayOpacity?: number;
  cutawayEligible?: boolean;
  forceCutaway?: boolean;
  targetX?: number;
  targetZ?: number;
  targetWidth?: number;
  targetDepth?: number;
  wallCenterX?: number;
  wallCenterZ?: number;
  wallAxis?: "x" | "z";
  wallLength?: number;
};

export function isWallFacingCamera(params: CutawayWallParams): boolean {
  const outsideBufferMeters = params.outsideBufferMeters ?? 0.12;
  const halfWidth = params.roomWidth / 2;
  const halfDepth = params.roomDepth / 2;

  if (params.wall === "north") {
    return params.cameraZ < params.roomZ - halfDepth - outsideBufferMeters;
  }

  if (params.wall === "south") {
    return params.cameraZ > params.roomZ + halfDepth + outsideBufferMeters;
  }

  if (params.wall === "west") {
    return params.cameraX < params.roomX - halfWidth - outsideBufferMeters;
  }

  if (params.wall === "east") {
    return params.cameraX > params.roomX + halfWidth + outsideBufferMeters;
  }

  return false;
}

export function resolveDominantCameraCutawayWall(
  params: CutawayWallParams & {
    eligibleWalls?: CutawayWallId[];
    minScore?: number;
  }
): CutawayWallId | null {
  const eligibleWalls = params.eligibleWalls ?? ["north", "south", "east", "west"];
  if (!eligibleWalls.length) return null;

  const dx = params.cameraX - params.roomX;
  const dz = params.cameraZ - params.roomZ;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.001) return null;

  const viewX = dx / distance;
  const viewZ = dz / distance;
  const minScore = params.minScore ?? 0.18;
  const wallScores: Array<{ wall: CutawayWallId; score: number }> = [
    { wall: "north", score: -viewZ },
    { wall: "south", score: viewZ },
    { wall: "east", score: viewX },
    { wall: "west", score: -viewX },
  ];
  const candidates = wallScores.filter((candidate) =>
    eligibleWalls.includes(candidate.wall) &&
    isWallFacingCamera({ ...params, wall: candidate.wall })
  );
  const depthWallCandidates = candidates.filter(
    (candidate) => candidate.wall === "north" || candidate.wall === "south"
  );
  const preferredCandidates = depthWallCandidates.length ? depthWallCandidates : candidates;

  const best = preferredCandidates.reduce<{ wall: CutawayWallId; score: number } | null>(
    (currentBest, candidate) =>
      !currentBest || candidate.score > currentBest.score ? candidate : currentBest,
    null
  );

  return best && best.score >= minScore ? best.wall : null;
}

function isBetween(value: number, first: number, second: number, buffer = 0): boolean {
  return value >= Math.min(first, second) - buffer && value <= Math.max(first, second) + buffer;
}

function rangesOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number
): boolean {
  return Math.min(firstEnd, secondEnd) >= Math.max(firstStart, secondStart);
}

export function isWallBetweenCameraAndTarget(params: CutawayWallOpacityParams): boolean {
  if (
    params.targetX === undefined ||
    params.targetZ === undefined ||
    params.wallCenterX === undefined ||
    params.wallCenterZ === undefined ||
    !params.wallAxis ||
    params.wallLength === undefined
  ) {
    return false;
  }

  const targetWidth = params.targetWidth ?? 0;
  const targetDepth = params.targetDepth ?? 0;
  const spanPadding = 0.75;
  const betweenBuffer = 0.12;

  if (params.wallAxis === "x") {
    if (!isBetween(params.wallCenterZ, params.cameraZ, params.targetZ, betweenBuffer)) {
      return false;
    }

    const wallStart = params.wallCenterX - params.wallLength / 2;
    const wallEnd = params.wallCenterX + params.wallLength / 2;
    const targetStart = params.targetX - targetWidth / 2 - spanPadding;
    const targetEnd = params.targetX + targetWidth / 2 + spanPadding;
    return rangesOverlap(wallStart, wallEnd, targetStart, targetEnd);
  }

  if (!isBetween(params.wallCenterX, params.cameraX, params.targetX, betweenBuffer)) {
    return false;
  }

  const wallStart = params.wallCenterZ - params.wallLength / 2;
  const wallEnd = params.wallCenterZ + params.wallLength / 2;
  const targetStart = params.targetZ - targetDepth / 2 - spanPadding;
  const targetEnd = params.targetZ + targetDepth / 2 + spanPadding;
  return rangesOverlap(wallStart, wallEnd, targetStart, targetEnd);
}

export function isWallOnCameraSideOfTarget(params: CutawayWallOpacityParams): boolean {
  if (
    params.targetX === undefined ||
    params.targetZ === undefined ||
    params.wallCenterX === undefined ||
    params.wallCenterZ === undefined ||
    !params.wallAxis
  ) {
    return false;
  }

  const axisBuffer = 0.18;

  if (params.wallAxis === "x") {
    if (Math.abs(params.cameraZ - params.targetZ) <= axisBuffer) return false;
    return params.cameraZ < params.targetZ
      ? params.wallCenterZ <= params.targetZ + axisBuffer
      : params.wallCenterZ >= params.targetZ - axisBuffer;
  }

  if (Math.abs(params.cameraX - params.targetX) <= axisBuffer) return false;
  return params.cameraX < params.targetX
    ? params.wallCenterX <= params.targetX + axisBuffer
    : params.wallCenterX >= params.targetX - axisBuffer;
}

export function resolveCutawayWallOpacity(params: CutawayWallOpacityParams): number {
  if (params.cutawayEligible === false) return params.baseOpacity;

  const shouldCutAway =
    params.forceCutaway ||
    isWallFacingCamera(params) ||
    isWallBetweenCameraAndTarget(params) ||
    isWallOnCameraSideOfTarget(params);

  if (!shouldCutAway) return params.baseOpacity;
  return Math.min(params.baseOpacity, params.cutawayOpacity ?? 0.08);
}
