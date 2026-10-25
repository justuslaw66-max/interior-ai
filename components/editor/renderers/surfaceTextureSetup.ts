import * as THREE from "three";

/**
 * How a surface's UVs are given: in metres across a floor ("world"), or from 0 to 1 across the surface ("normalized"), as on
 * a wall finish, whose painted canvas covers the surface exactly.
 */
export type SurfaceTextureUvMode = "world" | "normalized";

/**
 * Lays a surface texture on its mesh: repeating, in sRGB, centred, with the surface's pattern offset and rotation. `painted`
 * is true for a canvas the surface's tiles were painted on, false for the material's own picture drawn as it is.
 */
export function configureSurfaceTexture(
  texture: THREE.Texture,
  {
    uvMode,
    painted,
    widthMeters,
    heightMeters,
    maxAnisotropy,
    offset,
    rotationRad,
  }: {
    uvMode: SurfaceTextureUvMode;
    painted: boolean;
    widthMeters: number;
    heightMeters: number;
    maxAnisotropy: number;
    offset: { x: number; y: number };
    rotationRad: number;
  }
): void {
  const width = Math.max(0.1, widthMeters);
  const height = Math.max(0.1, heightMeters);
  const normalized = uvMode === "normalized";
  const origin = {
    x: normalized ? 0 : painted ? 0.5 / width : 0.5,
    y: normalized ? 0 : painted ? 0.5 / height : 0.5,
  };

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  texture.center.set(0.5, 0.5);
  texture.offset.set(origin.x + offset.x, origin.y + offset.y);
  texture.rotation = rotationRad;
  texture.repeat.set(normalized ? 1 : 1 / width, normalized ? 1 : 1 / height);
  texture.needsUpdate = true;
}
