"use client";

import { useEffect } from "react";
import * as THREE from "three";

import type { CabinetMaterialRef } from "../types";

export function disposeCabinetObject3DResources(object: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of meshMaterials) {
      if (material) materials.add(material);
    }
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export function disposeCabinetOwnedTextures(textures: readonly THREE.Texture[]): void {
  new Set(textures).forEach((texture) => texture.dispose());
}

function attachCabinetMaterialTexture(
  assembly: THREE.Object3D,
  materialId: string,
  texture: THREE.Texture
): void {
  assembly.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.userData.materialId !== materialId) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.map = texture;
      material.needsUpdate = true;
    }
  });
}

export type CabinetSceneResourceOwnership = {
  assembly: THREE.Group;
  previewFrontEdges: THREE.Group | null;
  materials: readonly CabinetMaterialRef[];
};

/** Owns only Three.js resources allocated for one mounted cabinet scene item. */
export function useCabinetSceneResourceOwnership({
  assembly,
  previewFrontEdges,
  materials,
}: CabinetSceneResourceOwnership): void {
  useEffect(() => {
    return () => disposeCabinetObject3DResources(assembly);
  }, [assembly]);

  useEffect(() => {
    if (!previewFrontEdges) return;
    return () => disposeCabinetObject3DResources(previewFrontEdges);
  }, [previewFrontEdges]);

  useEffect(() => {
    const texturedMaterials = materials.filter(
      (material) => typeof material.textureUrl === "string" && material.textureUrl.length > 0
    );
    if (!texturedMaterials.length) return;

    let cancelled = false;
    const loadedTextures: THREE.Texture[] = [];
    const loader = new THREE.TextureLoader();
    for (const materialRef of texturedMaterials) {
      loader.load(
        materialRef.textureUrl!,
        (texture) => {
          if (cancelled) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          loadedTextures.push(texture);
          attachCabinetMaterialTexture(assembly, materialRef.id, texture);
        },
        undefined,
        () => {
          // The color fallback remains usable when a texture asset is unavailable.
        }
      );
    }

    return () => {
      cancelled = true;
      disposeCabinetOwnedTextures(loadedTextures);
    };
  }, [assembly, materials]);
}
