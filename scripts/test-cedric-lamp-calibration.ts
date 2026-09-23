import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "yaml";
import { GLB_CALIBRATION_BY_PRODUCT_ID } from "../lib/design-page-calibration";

const PRODUCT_ID = "accessory-real-castlery-cedric-floor-lamp-with-table";
const CATALOG_PATH = "catalog/furniture/accessories/cedric_floor_lamp_with_table/catalog.yaml";
const MODEL_PATH = "public/assets/models/accessory-real-castlery-cedric-floor-lamp-with-table.glb";

type Vector3 = [number, number, number];
type Quaternion = [number, number, number, number];

type GlbAccessor = {
  componentType: number;
  normalized?: boolean;
  min?: Vector3;
  max?: Vector3;
};

type GlbNode = {
  mesh?: number;
  translation?: Vector3;
  rotation?: Quaternion;
  scale?: Vector3;
};

type GlbJson = {
  accessors?: GlbAccessor[];
  meshes?: Array<{ primitives?: Array<{ attributes?: { POSITION?: number } }> }>;
  nodes?: GlbNode[];
  scenes?: Array<{ nodes?: number[] }>;
  scene?: number;
};

function readGlbJson(filePath: string): GlbJson {
  const bytes = fs.readFileSync(filePath);
  assert.equal(bytes.toString("ascii", 0, 4), "glTF", "Cedric asset must remain a valid GLB");

  let offset = 12;
  while (offset < bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.toString("ascii", offset + 4, offset + 8);
    if (chunkType === "JSON") {
      return JSON.parse(
        bytes
          .toString("utf8", offset + 8, offset + 8 + chunkLength)
          .replace(/\u0000/g, "")
          .trim(),
      ) as GlbJson;
    }
    offset += 8 + chunkLength;
  }

  throw new Error("Cedric GLB is missing its JSON chunk");
}

function normalizeComponent(value: number, accessor: GlbAccessor): number {
  if (!accessor.normalized) return value;
  if (accessor.componentType === 5122) return Math.max(value / 32767, -1);
  if (accessor.componentType === 5123) return value / 65535;
  throw new Error(`Unsupported normalized component type ${accessor.componentType}`);
}

function rotateByQuaternion([x, y, z]: Vector3, [qx, qy, qz, qw]: Quaternion): Vector3 {
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx),
  ];
}

function modelBounds(json: GlbJson): Vector3 {
  const rootNodeIndexes = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  assert.equal(rootNodeIndexes.length, 1, "Cedric GLB should retain one calibrated root node");

  const node = json.nodes?.[rootNodeIndexes[0]];
  assert(node?.mesh !== undefined, "Cedric root node must reference its mesh");
  const primitive = json.meshes?.[node.mesh]?.primitives?.[0];
  const positionAccessorIndex = primitive?.attributes?.POSITION;
  assert(positionAccessorIndex !== undefined, "Cedric mesh must expose POSITION bounds");
  const accessor = json.accessors?.[positionAccessorIndex];
  assert(accessor?.min && accessor.max, "Cedric POSITION accessor must retain min/max bounds");

  const min = accessor.min.map((value) => normalizeComponent(value, accessor)) as Vector3;
  const max = accessor.max.map((value) => normalizeComponent(value, accessor)) as Vector3;
  const scale = node.scale ?? [1, 1, 1];
  const rotation = node.rotation ?? [0, 0, 0, 1];
  const translation = node.translation ?? [0, 0, 0];
  const worldMin: Vector3 = [Infinity, Infinity, Infinity];
  const worldMax: Vector3 = [-Infinity, -Infinity, -Infinity];

  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const rotated = rotateByQuaternion(
          [x * scale[0], y * scale[1], z * scale[2]],
          rotation,
        );
        for (let axis = 0; axis < 3; axis += 1) {
          const value = rotated[axis] + translation[axis];
          worldMin[axis] = Math.min(worldMin[axis], value);
          worldMax[axis] = Math.max(worldMax[axis], value);
        }
      }
    }
  }

  return [
    worldMax[0] - worldMin[0],
    worldMax[1] - worldMin[1],
    worldMax[2] - worldMin[2],
  ];
}

function scaleSpread(scales: Vector3): number {
  return Math.max(...scales) / Math.min(...scales);
}

const catalog = parse(fs.readFileSync(CATALOG_PATH, "utf8")) as {
  dimensions?: { width_cm?: number; depth_cm?: number; height_cm?: number };
};
const dimensions = catalog.dimensions;
assert(dimensions?.width_cm && dimensions.depth_cm && dimensions.height_cm);

const calibration = GLB_CALIBRATION_BY_PRODUCT_ID[PRODUCT_ID];
assert.equal(
  calibration?.swapWidthDepthAxes,
  true,
  "Cedric must swap its source footprint axes before dimension fitting",
);
assert.equal(calibration?.useVariantColor, false, "Cedric must keep its authored brass/glass material");

const [sourceWidth, sourceHeight, sourceDepth] = modelBounds(readGlbJson(MODEL_PATH));
const targetWidth = dimensions.width_cm / 100;
const targetDepth = dimensions.depth_cm / 100;
const targetHeight = dimensions.height_cm / 100;
const unswappedScales: Vector3 = [
  targetWidth / sourceWidth,
  targetHeight / sourceHeight,
  targetDepth / sourceDepth,
];
const calibratedScales: Vector3 = [
  targetDepth / sourceWidth,
  targetHeight / sourceHeight,
  targetWidth / sourceDepth,
];

assert(
  scaleSpread(unswappedScales) > 1.8,
  "The fixture should continue detecting the original shade/table distortion",
);
assert(
  scaleSpread(calibratedScales) < 1.05,
  `Cedric calibration must stay nearly uniform; received ${calibratedScales.join(", ")}`,
);

console.log(
  `Cedric lamp calibration passed: source ${sourceWidth.toFixed(3)} × ${sourceDepth.toFixed(3)} × ${sourceHeight.toFixed(3)} m, scale spread ${scaleSpread(calibratedScales).toFixed(3)}.`,
);
