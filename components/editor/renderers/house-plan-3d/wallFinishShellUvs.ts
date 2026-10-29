import * as THREE from "three";

/**
 * Texture coordinates for a wall finish's box (`buildWallFinishShellGeometry`), which is a wall part's share of the wall's
 * picture, from `startU` to `endU` across the face.
 *
 * Its face shows that share. Its ends (at a door, a window or the wall's end) and its top and bottom show the picture's edge
 * there, not the whole picture squeezed into their depth. A laminate panel on its board is 10 to 44 mm deep
 * (lib/laminate-wall-backing.ts), so its edges show, as the edge-banding in the same laminate does. A tile's 1.5 mm skin gets
 * the same treatment, too thin to see.
 */
export function mapWallFinishShellUvs(geometry: THREE.BufferGeometry, startU: number, endU: number): void {
  const uv = geometry.getAttribute("uv");
  const normal = geometry.getAttribute("normal");
  for (let index = 0; index < uv.count; index += 1) {
    const normalX = normal.getX(index);
    const normalY = normal.getY(index);
    // An end: the picture's column at that end, its full height.
    if (Math.abs(normalX) > 0.5) uv.setX(index, normalX < 0 ? startU : endU);
    else uv.setX(index, THREE.MathUtils.lerp(startU, endU, uv.getX(index)));
    // The top or bottom: the picture's top or bottom row, along the part.
    if (Math.abs(normalY) > 0.5) uv.setY(index, normalY > 0 ? 1 : 0);
  }
  uv.needsUpdate = true;
}
