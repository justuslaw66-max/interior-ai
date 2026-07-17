import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildRoomWallDescriptors,
  DEFAULT_WALL_LONG_SIDE_CLEARANCE_METERS,
} from "@/lib/design-page-wall-descriptors";

const roundMeters = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

const descriptors = buildRoomWallDescriptors({
  roomWidth: 6.2,
  roomDepth: 4.2,
  wallThickness: 0.2,
});
const secondDefaultDescriptors = buildRoomWallDescriptors({
  roomWidth: 6.2,
  roomDepth: 4.2,
  wallThickness: 0.2,
});

assert.equal(DEFAULT_WALL_LONG_SIDE_CLEARANCE_METERS, 2.2);
assert.deepEqual(
  descriptors.map(({ axis, coord, min, max }) => ({
    axis,
    coord: roundMeters(coord),
    min: roundMeters(min),
    max: roundMeters(max),
  })),
  [
    { axis: "x", coord: -3, min: -0.9, max: 0.9 },
    { axis: "x", coord: 3, min: -0.9, max: 0.9 },
    { axis: "z", coord: -2, min: -1.9, max: 1.9 },
    { axis: "z", coord: 2, min: -1.9, max: 1.9 },
  ],
  "Wall order and inner-face snap ranges must remain left, right, front, back."
);
assert.notStrictEqual(
  descriptors,
  secondDefaultDescriptors,
  "Each calculation must return a fresh descriptor array."
);

const compactDescriptors = buildRoomWallDescriptors({
  roomWidth: 6.2,
  roomDepth: 4.2,
  wallThickness: 0.2,
  longSideClearanceMeters: 1.2,
});
assert.deepEqual(
  compactDescriptors.map(({ axis, coord, min, max }) => ({
    axis,
    coord: roundMeters(coord),
    min: roundMeters(min),
    max: roundMeters(max),
  })),
  [
    { axis: "x", coord: -3, min: -1.4, max: 1.4 },
    { axis: "x", coord: 3, min: -1.4, max: 1.4 },
    { axis: "z", coord: -2, min: -2.4, max: 2.4 },
    { axis: "z", coord: 2, min: -2.4, max: 2.4 },
  ],
  "An explicit long-side clearance must replace the 2.2 m default."
);

const aiWorkspaceSource = readFileSync(
  resolve(process.cwd(), "lib/useDesignPageAiWorkspaceRegistration.ts"),
  "utf8"
);
assert.match(
  aiWorkspaceSource,
  /import \{ buildRoomWallDescriptors \} from "@\/lib\/design-page-wall-descriptors";/
);
assert.match(aiWorkspaceSource, /const walls = buildRoomWallDescriptors\(\{/);
assert.doesNotMatch(aiWorkspaceSource, /const halfLong\s*=/);
assert.doesNotMatch(aiWorkspaceSource, /coord:\s*-halfW\s*\+/);

console.log("Design-page wall descriptor checks passed.");
