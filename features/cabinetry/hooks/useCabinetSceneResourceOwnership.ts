"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect } from "react";
import * as THREE from "three";

import { acquireCabinetLaminateTexture } from "../cabinetLaminateTextures";
import { currentCabinetMaterials } from "../catalog/finishes";
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
      // The picture carries the design's colour; the mean colour was only its stand-in.
      material.color.set(0xffffff);
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
  const invalidate = useThree((state) => state.invalidate);
  const renderer = useThree((state) => state.gl);

  useEffect(() => {
    return () => disposeCabinetObject3DResources(assembly);
  }, [assembly]);

  useEffect(() => {
    if (!previewFrontEdges) return;
    return () => disposeCabinetObject3DResources(previewFrontEdges);
  }, [previewFrontEdges]);

  // A layout effect, so a picture already loaded is on the rebuilt cabinet before its first frame
  // and an edit never shows plain colour. The pictures belong to the page's shared cache
  // (cabinetLaminateTextures.ts), one copy per renderer; this cabinet leases them and releases
  // them on change or unmount.
  useLayoutEffect(() => {
    // A catalogue laminate draws its current picture, even in a design saved before a correction.
    const texturedMaterials = currentCabinetMaterials(materials).filter(
      (material) => typeof material.textureUrl === "string" && material.textureUrl.length > 0
    );
    const releases = texturedMaterials.map((materialRef) =>
      acquireCabinetLaminateTexture(materialRef.textureUrl!, renderer, (texture) => {
        attachCabinetMaterialTexture(assembly, materialRef.id, texture);
        // Scenes render on demand; a picture that arrives later needs its own frame.
        invalidate();
      })
    );
    return () => releases.forEach((release) => release());
  }, [assembly, invalidate, materials, renderer]);
}
