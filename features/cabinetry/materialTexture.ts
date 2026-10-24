/**
 * How a cabinet material's picture lies on a part, at its real size.
 *
 * A laminate picture shows a real area of its sheet (for Greenlam's 4'x8' HPL, the
 * 1220 mm width and the picture's own shape). Each face of a part gets texture
 * coordinates in millimetres divided by that area, so a 600 mm door shows 600 mm of
 * sheet and the grain is never stretched. Coordinates are measured from the cabinet's
 * origin, so neighbouring parts in one plane continue the pattern, as fronts cut from
 * one sheet do. The grain runs along the part's grain axis (the cut list's rule).
 */

/** Texture fields of a cabinet material. Materials without `textureSizeMm` keep one picture per face. */
export interface CabinetMaterialTexture {
  textureUrl?: string;
  /** The real area the picture covers, in mm: width across the picture, height along it. */
  textureSizeMm?: { width: number; height: number };
  /** How the pattern's grain lies on the picture: along its height (most woodgrains) or across it. */
  textureGrain?: "along" | "across";
}

/** A box axis in cabinet space: x along the width, y up, z towards the front. */
type Axis = "x" | "y" | "z";
/** A part's size key, as `CabinetPartDimensionAxis` names the cut face's axes. */
type DimensionAxis = "width" | "height" | "depth";

export type CabinetPartTextureLayout = {
  /** Cabinet-local position of the part's minimum corner, in mm. */
  positionMm: { x: number; y: number; z: number };
  sizeMm: { width: number; height: number; depth: number };
  /** The axis the part's grain runs along. */
  grainAxis: Axis;
};

const AXES: readonly Axis[] = ["x", "y", "z"];
const SIZE_KEY: Record<Axis, DimensionAxis> = { x: "width", y: "height", z: "depth" };
const AXIS_OF_DIMENSION: Record<DimensionAxis, Axis> = { width: "x", height: "y", depth: "z" };

/** The cabinet axis a part's grain runs along, from its cut face and the cut list's grain axis. */
export function resolveCabinetPartGrainWorldAxis(
  cutFace: { widthAxis: DimensionAxis; heightAxis: DimensionAxis },
  grainAxis: "cut_width" | "cut_height" | "none"
): Axis {
  return AXIS_OF_DIMENSION[grainAxis === "cut_width" ? cutFace.widthAxis : cutFace.heightAxis];
}

function dominantAxis(normal: readonly [number, number, number]): Axis {
  const magnitudes = normal.map(Math.abs);
  const index = magnitudes.indexOf(Math.max(...magnitudes));
  return AXES[index];
}

/** The two in-face axes of a face: [the one the picture's height follows, the other]. */
export function resolveFaceTextureAxes(
  normalAxis: Axis,
  layout: CabinetPartTextureLayout,
  textureGrain: CabinetMaterialTexture["textureGrain"]
): { heightAxis: Axis; widthAxis: Axis } {
  const inFace = AXES.filter((axis) => axis !== normalAxis);
  const longer = layout.sizeMm[SIZE_KEY[inFace[0]]] >= layout.sizeMm[SIZE_KEY[inFace[1]]] ? inFace[0] : inFace[1];
  const grainAxis = inFace.includes(layout.grainAxis) ? layout.grainAxis : longer;
  const otherAxis = inFace[0] === grainAxis ? inFace[1] : inFace[0];
  // The grain follows the part's grain axis; a picture whose grain runs across it is turned a quarter turn.
  return textureGrain === "across"
    ? { heightAxis: otherAxis, widthAxis: grainAxis }
    : { heightAxis: grainAxis, widthAxis: otherAxis };
}

/**
 * Texture coordinates for a box part's vertices, two per vertex, in sheet units.
 * `positions` are the box's own vertex positions in metres around its centre (Three.js
 * BoxGeometry), `normals` its vertex normals.
 */
export function computeCabinetPartTextureUv(
  positions: ArrayLike<number>,
  normals: ArrayLike<number>,
  layout: CabinetPartTextureLayout,
  texture: Required<Pick<CabinetMaterialTexture, "textureSizeMm">> & Pick<CabinetMaterialTexture, "textureGrain">
): Float32Array {
  const vertexCount = Math.floor(positions.length / 3);
  const uv = new Float32Array(vertexCount * 2);
  const { width: sheetWidth, height: sheetHeight } = texture.textureSizeMm;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const normal: [number, number, number] = [normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]];
    const axes = resolveFaceTextureAxes(dominantAxis(normal), layout, texture.textureGrain);
    const cabinetMm = (axis: Axis) => {
      const index = AXES.indexOf(axis);
      const centreMm = layout.positionMm[axis] + layout.sizeMm[SIZE_KEY[axis]] / 2;
      return centreMm + positions[vertex * 3 + index] * 1000;
    };
    uv[vertex * 2] = cabinetMm(axes.widthAxis) / sheetWidth;
    uv[vertex * 2 + 1] = cabinetMm(axes.heightAxis) / sheetHeight;
  }
  return uv;
}

export function hasCabinetMaterialRealSizeTexture(
  material: CabinetMaterialTexture | undefined
): material is CabinetMaterialTexture & { textureUrl: string; textureSizeMm: { width: number; height: number } } {
  const size = material?.textureSizeMm;
  return Boolean(
    material?.textureUrl &&
      size &&
      Number.isFinite(size.width) &&
      Number.isFinite(size.height) &&
      size.width > 0 &&
      size.height > 0
  );
}
