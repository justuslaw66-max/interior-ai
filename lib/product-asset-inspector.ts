import fs from "node:fs";
import path from "node:path";

export type ProductAssetInspection = {
  source: "local" | "remote" | "missing" | "invalid";
  filePath: string | null;
  fileSizeBytes: number;
  validGlb: boolean | null;
  triangleCount: number | null;
  materialCount: number | null;
  textureCount: number | null;
  maxTextureResolution: number | null;
  missingTextureCount: number;
  geometryBoundsMeters: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  } | null;
  error: string | null;
};

type GltfAccessor = {
  count?: number;
  min?: number[];
  max?: number[];
};

type GltfImage = {
  uri?: string;
  bufferView?: number;
  mimeType?: string;
};

type GltfDocument = {
  accessors?: GltfAccessor[];
  meshes?: Array<{
    primitives?: Array<{
      mode?: number;
      indices?: number;
      attributes?: Record<string, number>;
      material?: number;
    }>;
  }>;
  materials?: unknown[];
  textures?: Array<{
    source?: number;
    extensions?: {
      KHR_texture_basisu?: { source?: number };
      EXT_texture_webp?: { source?: number };
    };
  }>;
  images?: GltfImage[];
  bufferViews?: Array<{ byteOffset?: number; byteLength?: number }>;
};

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BINARY_CHUNK = 0x004e4942;

function emptyInspection(
  source: ProductAssetInspection["source"],
  error: string | null = null
): ProductAssetInspection {
  return {
    source,
    filePath: null,
    fileSizeBytes: 0,
    validGlb: null,
    triangleCount: null,
    materialCount: null,
    textureCount: null,
    maxTextureResolution: null,
    missingTextureCount: 0,
    geometryBoundsMeters: null,
    error,
  };
}

function localPublicPath(modelUrl: string, publicRoot: string) {
  const clean = modelUrl.split("?")[0].split("#")[0];
  if (!clean.startsWith("/")) return null;
  const root = path.resolve(publicRoot);
  const resolved = path.resolve(root, clean.replace(/^\/+/, ""));
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

function readImageDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes.subarray(1, 4).toString("ascii") === "PNG"
  ) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > bytes.length) return null;
      if (
        marker >= 0xc0 &&
        marker <= 0xc3 &&
        marker !== 0xc4
      ) {
        return {
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        };
      }
      offset += length + 2;
    }
  }

  return null;
}

function imageBytes(
  image: GltfImage,
  views: NonNullable<GltfDocument["bufferViews"]>,
  binary: Buffer | null,
  glbDirectory: string
) {
  if (typeof image.bufferView === "number" && binary) {
    const view = views[image.bufferView];
    if (!view || typeof view.byteLength !== "number") return null;
    const offset = view.byteOffset ?? 0;
    return binary.subarray(offset, offset + view.byteLength);
  }
  if (!image.uri) return null;
  if (image.uri.startsWith("data:")) {
    const comma = image.uri.indexOf(",");
    if (comma < 0) return null;
    const encoded = image.uri.slice(comma + 1);
    return Buffer.from(encoded, image.uri.slice(0, comma).includes(";base64") ? "base64" : "utf8");
  }
  if (/^https?:\/\//i.test(image.uri)) return null;
  const candidate = path.resolve(glbDirectory, decodeURIComponent(image.uri));
  if (!candidate.startsWith(`${path.resolve(glbDirectory)}${path.sep}`) || !fs.existsSync(candidate)) {
    return null;
  }
  return fs.readFileSync(candidate);
}

function triangleCount(document: GltfDocument) {
  let total = 0;
  let known = false;
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
      const count =
        typeof accessorIndex === "number" ? document.accessors?.[accessorIndex]?.count : undefined;
      if (typeof count !== "number") continue;
      const mode = primitive.mode ?? 4;
      if (mode === 4) total += Math.floor(count / 3);
      else if (mode === 5 || mode === 6) total += Math.max(0, count - 2);
      else continue;
      known = true;
    }
  }
  return known ? total : null;
}

function geometryBounds(document: GltfDocument) {
  const mins = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const maxs = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  let found = false;

  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessorIndex = primitive.attributes?.POSITION;
      const accessor =
        typeof accessorIndex === "number" ? document.accessors?.[accessorIndex] : undefined;
      if (!accessor?.min || !accessor.max || accessor.min.length < 3 || accessor.max.length < 3) continue;
      for (let axis = 0; axis < 3; axis += 1) {
        mins[axis] = Math.min(mins[axis], accessor.min[axis]);
        maxs[axis] = Math.max(maxs[axis], accessor.max[axis]);
      }
      found = true;
    }
  }

  if (!found) return null;
  return {
    min: mins as [number, number, number],
    max: maxs as [number, number, number],
    size: maxs.map((value, axis) => value - mins[axis]) as [number, number, number],
  };
}

export function inspectProductModelAsset(
  modelUrl: string,
  publicRoot = path.join(process.cwd(), "public")
): ProductAssetInspection {
  if (/^https?:\/\//i.test(modelUrl)) return emptyInspection("remote");
  const filePath = localPublicPath(modelUrl, publicRoot);
  if (!filePath) return emptyInspection("invalid", "Model URL is not a safe local public path.");
  if (!fs.existsSync(filePath)) return emptyInspection("missing", "Model file does not exist.");

  const buffer = fs.readFileSync(filePath);
  const base = {
    ...emptyInspection("local"),
    filePath,
    fileSizeBytes: buffer.byteLength,
  };
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== GLB_MAGIC || buffer.readUInt32LE(4) !== 2) {
    return { ...base, validGlb: false, error: "Invalid GLB header or unsupported version." };
  }
  if (buffer.readUInt32LE(8) !== buffer.byteLength) {
    return { ...base, validGlb: false, error: "GLB declared length does not match file size." };
  }

  let jsonBytes: Buffer | null = null;
  let binary: Buffer | null = null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) jsonBytes = chunk;
    if (type === BINARY_CHUNK) binary = chunk;
    offset += 8 + length;
  }
  if (!jsonBytes) return { ...base, validGlb: false, error: "GLB JSON chunk is missing." };

  try {
    const document = JSON.parse(jsonBytes.toString("utf8").replace(/[\u0000\s]+$/g, "")) as GltfDocument;
    let missingTextureCount = 0;
    let maxTextureResolution: number | null = null;
    const images = document.images ?? [];
    for (const texture of document.textures ?? []) {
      const source =
        texture.source ??
        texture.extensions?.KHR_texture_basisu?.source ??
        texture.extensions?.EXT_texture_webp?.source;
      const image = typeof source === "number" ? images[source] : undefined;
      if (!image) {
        missingTextureCount += 1;
        continue;
      }
      const bytes = imageBytes(image, document.bufferViews ?? [], binary, path.dirname(filePath));
      if (!bytes) {
        if (!image.uri || !/^https?:\/\//i.test(image.uri)) missingTextureCount += 1;
        continue;
      }
      const dimensions = readImageDimensions(bytes);
      if (dimensions) {
        maxTextureResolution = Math.max(
          maxTextureResolution ?? 0,
          dimensions.width,
          dimensions.height
        );
      }
    }

    return {
      ...base,
      validGlb: true,
      triangleCount: triangleCount(document),
      materialCount: document.materials?.length ?? 0,
      textureCount: document.textures?.length ?? 0,
      maxTextureResolution,
      missingTextureCount,
      geometryBoundsMeters: geometryBounds(document),
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      validGlb: false,
      error: error instanceof Error ? error.message : "Unable to parse GLB metadata.",
    };
  }
}
