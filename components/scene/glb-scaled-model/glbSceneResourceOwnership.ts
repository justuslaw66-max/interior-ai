import * as THREE from "three";

export function disposeObjectGeometryAndMaterials(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    materials.forEach((material) => material.dispose());
  });
}

export function clonePreparedGLBForMount(object: THREE.Object3D) {
  const clone = object.clone(true);
  clone.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry = mesh.geometry.clone();
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) => material.clone());
    } else if (mesh.material) {
      mesh.material = mesh.material.clone();
    }
  });
  return clone;
}

export function disposeObjectTextures(object: THREE.Object3D) {
  const disposedTextures = new Set<THREE.Texture>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
          disposedTextures.add(value);
          value.dispose();
        }
      }
    }
  });
}
