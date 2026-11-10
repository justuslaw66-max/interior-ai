import { readFileSync } from "node:fs";
import type { Vec3Size } from "./dimension-fit";

/**
 * Measures a GLB's scene bounds without external tools: reads the JSON chunk,
 * takes every POSITION accessor's min/max (present for Draco- and
 * Meshopt-compressed and KHR_mesh_quantization files alike), transforms the
 * eight corners through the node hierarchy and returns the world-space size
 * in the file's own units (metres for a conforming asset).
 */

type GltfNode = {
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
};

type GltfAccessor = {
  componentType: number;
  normalized?: boolean;
  min?: number[];
  max?: number[];
};

type GltfDocument = {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives?: { attributes?: Record<string, number> }[] }[];
  accessors?: GltfAccessor[];
};

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const NORMALIZED_DIVISOR: Record<number, number> = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

type Mat4 = number[]; // column-major, like glTF

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out: Mat4 = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

function fromTrs(t: number[], r: number[], s: number[]): Mat4 {
  const [x, y, z, w] = r;
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
    2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
    2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function nodeMatrix(node: GltfNode): Mat4 {
  if (node.matrix && node.matrix.length === 16) return node.matrix;
  return fromTrs(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1]);
}

function transformPoint(m: Mat4, p: number[]): number[] {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function accessorExtent(accessor: GltfAccessor): { min: number[]; max: number[] } | null {
  if (!accessor.min || !accessor.max || accessor.min.length !== 3 || accessor.max.length !== 3) return null;
  const divisor = accessor.normalized ? NORMALIZED_DIVISOR[accessor.componentType] : undefined;
  if (!divisor) return { min: accessor.min, max: accessor.max };
  return { min: accessor.min.map((v) => v / divisor), max: accessor.max.map((v) => v / divisor) };
}

/** Parses the JSON chunk of a GLB container. */
export function readGlbJson(glbPath: string): GltfDocument {
  const buffer = readFileSync(glbPath);
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error("Not a GLB container.");
  const totalLength = buffer.readUInt32LE(8);
  let offset = 12;
  while (offset + 8 <= Math.min(totalLength, buffer.length)) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (chunkType === CHUNK_JSON) {
      return JSON.parse(buffer.subarray(offset, offset + chunkLength).toString("utf8")) as GltfDocument;
    }
    offset += chunkLength;
  }
  throw new Error("GLB has no JSON chunk.");
}

class BoundsAccumulator {
  min = [Infinity, Infinity, Infinity];
  max = [-Infinity, -Infinity, -Infinity];

  addCorners(m: Mat4, extent: { min: number[]; max: number[] }): void {
    for (const x of [extent.min[0], extent.max[0]]) {
      for (const y of [extent.min[1], extent.max[1]]) {
        for (const z of [extent.min[2], extent.max[2]]) {
          const p = transformPoint(m, [x, y, z]);
          for (let i = 0; i < 3; i += 1) {
            this.min[i] = Math.min(this.min[i], p[i]);
            this.max[i] = Math.max(this.max[i], p[i]);
          }
        }
      }
    }
  }

  size(): Vec3Size | null {
    if (!Number.isFinite(this.min[0])) return null;
    const size = { x: this.max[0] - this.min[0], y: this.max[1] - this.min[1], z: this.max[2] - this.min[2] };
    return [size.x, size.y, size.z].every((v) => Number.isFinite(v) && v > 0) ? size : null;
  }
}

function visitNode(doc: GltfDocument, index: number, parent: Mat4, acc: BoundsAccumulator, depth: number): void {
  const node = doc.nodes?.[index];
  if (!node || depth > 64) return;
  const world = multiply(parent, nodeMatrix(node));
  const mesh = node.mesh !== undefined ? doc.meshes?.[node.mesh] : undefined;
  for (const primitive of mesh?.primitives ?? []) {
    const positionIndex = primitive.attributes?.POSITION;
    const accessor = positionIndex !== undefined ? doc.accessors?.[positionIndex] : undefined;
    const extent = accessor ? accessorExtent(accessor) : null;
    if (extent) acc.addCorners(world, extent);
  }
  for (const child of node.children ?? []) visitNode(doc, child, world, acc, depth + 1);
}

/** World-space size of the default scene, or null when the file has no measurable geometry. */
export function measureGlbSceneSize(doc: GltfDocument): Vec3Size | null {
  const scene = doc.scenes?.[doc.scene ?? 0];
  const acc = new BoundsAccumulator();
  for (const rootIndex of scene?.nodes ?? []) visitNode(doc, rootIndex, IDENTITY, acc, 0);
  return acc.size();
}

/** Measures a GLB file's scene bounds; never throws. */
export function measureGlbSceneBounds(glbPath: string): { size: Vec3Size | null; error?: string } {
  try {
    return { size: measureGlbSceneSize(readGlbJson(glbPath)) };
  } catch (error) {
    return { size: null, error: (error as Error).message };
  }
}
