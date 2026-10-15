import { seededSurfaceRandom } from "./surface-material-physical-sampling";
import type { SurfaceMaterial } from "./surface-material-schema";

/**
 * The chevron layout: parallelogram pieces whose ends are cut on a slant, laid in bands. Each band's pieces lean the
 * opposite way to the next band's, and the two meet end to end along straight band lines (ridges and valleys).
 *
 * A piece is `pieceWidth` wide and `pieceLength` long tip to tip. Each end's cut runs `endOffset` along the piece while
 * it crosses the width, so the long edges are `pieceLength - endOffset` long. Laid, the cuts lie on the band lines,
 * which run along x, and the pieces lean off the y axis by an angle whose tangent is endOffset / pieceWidth.
 *
 * Faces show a piece upright in its pieceWidth x pieceLength bounding box, with the top cut rising to the right: from
 * (pieceWidth, 0) at the top right down to (0, endOffset) on the left. Half the bands show their faces mirrored left to
 * right, which is the other hand of the same piece. Any one unit works (canvas pixels, millimetres).
 */
export type ChevronLayout = {
  pieceWidth: number;
  pieceLength: number;
  endOffset: number;
  /** Distance between band lines. */
  bandHeight: number;
  /** Distance between pieces along a band line: the length of a cut. */
  pitch: number;
  /** How far a long edge moves along x per unit of y. */
  lean: number;
};

/** Where a point falls: its piece, and its place in that piece's face frame. */
export type ChevronPieceLocal = {
  band: number;
  piece: number;
  /** Face-frame x, 0..pieceWidth. */
  across: number;
  /** Face-frame y, 0..pieceLength. */
  along: number;
  /** Distance to the piece's nearest edge (a long edge or a band line), for drawing joints. */
  edgeDistance: number;
};

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

export function getChevronLayout({
  pieceWidth,
  pieceLength,
  endOffset,
}: {
  pieceWidth: number;
  pieceLength: number;
  endOffset: number;
}): ChevronLayout | null {
  if (!(pieceWidth > 0) || !(endOffset > 0) || !(pieceLength > endOffset)) return null;
  const lean = endOffset / pieceWidth;
  const pitch = Math.hypot(pieceWidth, endOffset);
  return {
    pieceWidth,
    pieceLength,
    endOffset,
    bandHeight: ((pieceLength - endOffset) * pieceWidth) / pitch,
    pitch,
    lean,
  };
}

export function getChevronPieceLocal(layout: ChevronLayout, x: number, y: number): ChevronPieceLocal {
  const band = Math.floor(y / layout.bandHeight);
  const inBand = y - band * layout.bandHeight;
  // Odd bands are the mirror image of even ones, so neighbouring bands meet end to end on the band line.
  const fromBandLine = band % 2 === 0 ? inBand : layout.bandHeight - inBand;
  const alongBand = x - fromBandLine * layout.lean;
  const piece = Math.floor(alongBand / layout.pitch);
  const fraction = alongBand / layout.pitch - piece;
  const fromEdge = fraction * layout.pieceWidth;
  return {
    band,
    piece,
    across: layout.pieceWidth - fromEdge,
    along: fraction * layout.endOffset + (fromBandLine * layout.pitch) / layout.pieceWidth,
    edgeDistance: Math.min(fromEdge, layout.pieceWidth - fromEdge, inBand, layout.bandHeight - inBand),
  };
}

/**
 * The face a piece shows. Each band runs through its own shuffled order of the faces, so neighbours along a band
 * never repeat; neighbours across a band line repeat only by chance.
 */
export function getChevronFaceIndex({
  seed,
  band,
  piece,
  faceCount,
}: {
  seed: number;
  band: number;
  piece: number;
  faceCount: number;
}): number {
  if (faceCount <= 1) return 0;
  const order = Array.from({ length: faceCount }, (_, index) => index);
  const bandSeed = seed + Math.imul(band, 7919);
  for (let index = faceCount - 1; index > 0; index -= 1) {
    const swap = Math.floor(seededSurfaceRandom(bandSeed + index * 31) * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  const start = Math.floor(seededSurfaceRandom(bandSeed + 17) * faceCount);
  return order[positiveModulo(piece + start, faceCount)];
}

/** The pieces that cover a width x height area, as polygons (for small previews and checks). */
export function getChevronPiecePolygons(
  layout: ChevronLayout,
  width: number,
  height: number
): Array<{ band: number; piece: number; points: Array<[number, number]> }> {
  const polygons: Array<{ band: number; piece: number; points: Array<[number, number]> }> = [];
  const shift = layout.bandHeight * layout.lean;
  for (let band = 0; band * layout.bandHeight < height; band += 1) {
    const top = band * layout.bandHeight;
    const bottom = top + layout.bandHeight;
    const [topShift, bottomShift] = band % 2 === 0 ? [0, shift] : [shift, 0];
    const firstPiece = Math.floor(-shift / layout.pitch) - 1;
    for (let piece = firstPiece; piece * layout.pitch - shift < width; piece += 1) {
      const left = piece * layout.pitch;
      const right = left + layout.pitch;
      polygons.push({
        band,
        piece,
        points: [
          [left + topShift, top],
          [right + topShift, top],
          [right + bottomShift, bottom],
          [left + bottomShift, bottom],
        ],
      });
    }
  }
  return polygons;
}

export type ChevronFacePixels = { data: Uint8ClampedArray; width: number; height: number };

/**
 * Paints the layout into RGBA pixels: each piece shows one face, sampled nearest neighbour; pixels within `jointInset`
 * of a piece's edge take the joint colour. `layout` is in output pixels.
 */
export function paintChevronPixels({
  output,
  width,
  height,
  layout,
  faces,
  jointInset,
  jointRgb,
  seed,
}: {
  output: Uint8ClampedArray;
  width: number;
  height: number;
  layout: ChevronLayout;
  faces: readonly ChevronFacePixels[];
  jointInset: number;
  jointRgb: readonly [number, number, number];
  seed: number;
}): void {
  const faceByPiece = new Map<number, number>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const local = getChevronPieceLocal(layout, x + 0.5, y + 0.5);
      const outputIndex = (y * width + x) * 4;
      let source: Uint8ClampedArray | readonly number[] = jointRgb;
      let sourceIndex = 0;
      if (local.edgeDistance >= jointInset) {
        const key = local.band * 65536 + local.piece;
        let faceIndex = faceByPiece.get(key);
        if (faceIndex === undefined) {
          faceIndex = getChevronFaceIndex({ seed, band: local.band, piece: local.piece, faceCount: faces.length });
          faceByPiece.set(key, faceIndex);
        }
        const face = faces[faceIndex];
        const sampleX = Math.min(face.width - 1, Math.max(0, Math.floor((local.across / layout.pieceWidth) * face.width)));
        const sampleY = Math.min(face.height - 1, Math.max(0, Math.floor((local.along / layout.pieceLength) * face.height)));
        source = face.data;
        sourceIndex = (sampleY * face.width + sampleX) * 4;
      }
      output[outputIndex] = source[sourceIndex];
      output[outputIndex + 1] = source[sourceIndex + 1];
      output[outputIndex + 2] = source[sourceIndex + 2];
      output[outputIndex + 3] = 255;
    }
  }
}

/** Catalogue checks: a chevron material needs its pieces' end offset, and only a chevron material has one. */
export function getSurfaceMaterialChevronFailures(
  material: Pick<SurfaceMaterial, "surface_material" | "physical_specs" | "rendering">
): string[] {
  const id = material.surface_material.material_id;
  const offset = material.physical_specs.chevron_end_offset_mm;
  const lists = material.rendering.available_pattern_layouts?.includes("chevron") ?? false;
  const { tile_width_mm: width, tile_length_mm: length } = material.physical_specs;
  if (!lists) return offset == null ? [] : [`${id}: chevron_end_offset_mm is set but the layouts don't list chevron`];
  const layout =
    width && length && offset
      ? getChevronLayout({ pieceWidth: Math.min(width, length), pieceLength: Math.max(width, length), endOffset: offset })
      : null;
  return layout ? [] : [`${id}: a chevron needs tile_width_mm, tile_length_mm and a chevron_end_offset_mm shorter than the piece`];
}
