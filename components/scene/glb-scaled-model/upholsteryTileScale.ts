import * as THREE from "three";

type UpholsteryTextureSet = {
  baseColorMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
};

const MAX_SAMPLED_TRIANGLES_PER_MESH = 6000;

function isReadableAttribute(
  attribute: unknown
): attribute is THREE.BufferAttribute | THREE.InterleavedBufferAttribute {
  return (
    attribute instanceof THREE.BufferAttribute ||
    attribute instanceof THREE.InterleavedBufferAttribute
  );
}

/**
 * How many metres of surface one UV unit covers on this model, at its final
 * scale. AI-generated meshes pack the whole sofa into one atlas, so this is a
 * few metres and differs per model; a fixed texture repeat cannot be right for
 * all of them.
 */
export function measureMetresPerUvUnit(scene: THREE.Object3D): number | null {
  scene.updateMatrixWorld(true);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let surfaceArea = 0;
  let uvArea = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    if (!isReadableAttribute(position) || !isReadableAttribute(uv)) return;
    const index = geometry.getIndex();
    const triangleCount = Math.floor((index ? index.count : position.count) / 3);
    const stride = Math.max(1, Math.floor(triangleCount / MAX_SAMPLED_TRIANGLES_PER_MESH));
    for (let triangle = 0; triangle < triangleCount; triangle += stride) {
      const i0 = index ? index.getX(triangle * 3) : triangle * 3;
      const i1 = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
      const i2 = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
      a.fromBufferAttribute(position, i0).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(position, i1).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(position, i2).applyMatrix4(object.matrixWorld);
      surfaceArea += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2;
      const u0 = uv.getX(i0);
      const v0 = uv.getY(i0);
      uvArea +=
        Math.abs(
          (uv.getX(i1) - u0) * (uv.getY(i2) - v0) - (uv.getX(i2) - u0) * (uv.getY(i1) - v0)
        ) / 2;
    }
  });
  if (!(surfaceArea > 0) || !(uvArea > 1e-9)) return null;
  return Math.sqrt(surfaceArea / uvArea);
}

/**
 * Sets the repeat of the fabric textures so one tile covers `tileSizeM` metres
 * on this model. Returns the repeat applied, or null when it cannot be derived
 * (the textures then keep the repeat they were loaded with).
 */
export function applyPhysicalUpholsteryTileSize(
  scene: THREE.Object3D,
  textures: UpholsteryTextureSet,
  tileSizeM: number | undefined
): number | null {
  if (!tileSizeM || !(tileSizeM > 0)) return null;
  if (!textures.baseColorMap && !textures.normalMap && !textures.roughnessMap) return null;
  const metresPerUvUnit = measureMetresPerUvUnit(scene);
  if (!metresPerUvUnit) return null;
  const repeat = Math.max(1, Math.min(400, metresPerUvUnit / tileSizeM));
  for (const texture of [textures.baseColorMap, textures.normalMap, textures.roughnessMap]) {
    if (!texture) continue;
    texture.repeat.set(repeat, repeat);
    texture.needsUpdate = true;
  }
  return repeat;
}
