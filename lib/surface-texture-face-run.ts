import type { SurfaceTextureFace } from "./surface-material-schema";

/**
 * A material's tile faces in the render data, written compactly.
 *
 * Faces named `<prefix>01.webp`, `<prefix>02.webp`, … with one size are stored as
 * `[prefix, count, width_mm, height_mm]` instead of one object per face. The app expands
 * the run back into exactly the face list the catalogue YAML declares, so the pictures,
 * their order and their sizes are unchanged; only the render data is smaller.
 */
export type SurfaceTextureFaceRun = readonly [
  urlPrefix: string,
  count: number,
  widthMm: number,
  heightMm: number,
];

export type SurfaceTextureFacesData = SurfaceTextureFace[] | SurfaceTextureFaceRun;

const RUN_SUFFIX = ".webp";
const MAX_RUN_COUNT = 99;

function runUrl(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(2, "0")}${RUN_SUFFIX}`;
}

/** The run that expands to these faces exactly, or null when they don't follow the pattern. */
export function compactSurfaceTextureFaces(
  faces: readonly SurfaceTextureFace[]
): SurfaceTextureFaceRun | null {
  if (faces.length === 0 || faces.length > MAX_RUN_COUNT) return null;
  const first = faces[0];
  const match = /^(.*_)01\.webp$/.exec(first.url);
  if (!match) return null;
  const prefix = match[1];
  const same = faces.every(
    (face, index) =>
      Object.keys(face).length === 3 &&
      face.url === runUrl(prefix, index + 1) &&
      face.width_mm === first.width_mm &&
      face.height_mm === first.height_mm
  );
  return same ? [prefix, faces.length, first.width_mm, first.height_mm] : null;
}

function isFaceRun(value: SurfaceTextureFacesData): value is SurfaceTextureFaceRun {
  return typeof value[0] === "string";
}

/** The face list for a render tuple's faces field, whether it was written in full or as a run. */
export function expandSurfaceTextureFaces(value: SurfaceTextureFacesData): SurfaceTextureFace[] {
  if (!isFaceRun(value)) return value;
  const [prefix, count, widthMm, heightMm] = value;
  return Array.from({ length: count }, (_, index) => ({
    url: runUrl(prefix, index + 1),
    width_mm: widthMm,
    height_mm: heightMm,
  }));
}
