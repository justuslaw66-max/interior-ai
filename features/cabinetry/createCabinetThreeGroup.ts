import * as THREE from "three";
import type { CabinetDefinition, CabinetPart } from "./types";
import { CABINET_SERVICE_ZONE_MATERIAL_ID } from "./vanityServiceLayout";

const MM_TO_METERS = 0.001;

export function createCabinetThreeGroup(definition: CabinetDefinition, parts: CabinetPart[]): THREE.Group {
  const group = new THREE.Group();
  group.name = `CabinetAssembly_${definition.id}`;
  group.userData = {
    sourceType: "parametric_cabinet",
    cabinetDefinitionId: definition.id,
    cabinetDefinitionVersion: definition.version,
    cabinetDefinition: definition,
    generatedAt: new Date().toISOString(),
  };

  const materialById = new Map<string, THREE.Material>();
  const resolveMaterial = (materialId: string) => {
    const cached = materialById.get(materialId);
    if (cached) return cached;

    const materialRef = definition.materials.find((material) => material.id === materialId);
    const isHardware = materialId === "hardware_metal" || parts.some((part) => part.materialId === materialId && part.type === "handle");
    const isServiceZone = materialId === CABINET_SERVICE_ZONE_MATERIAL_ID;
    const material = new THREE.MeshStandardMaterial({
      color: materialRef?.color ?? (isHardware ? "#a7adb3" : "#d8d2c6"),
      roughness: materialRef?.roughness ?? (isHardware ? 0.28 : isServiceZone ? 0.38 : 0.72),
      metalness: materialRef?.metalness ?? (isHardware ? 0.78 : 0.02),
      transparent: isServiceZone,
      opacity: isServiceZone ? 0.36 : 1,
      depthWrite: !isServiceZone,
    });
    materialById.set(materialId, material);
    return material;
  };

  for (const part of parts) {
    const geometry = new THREE.BoxGeometry(
      part.size.width * MM_TO_METERS,
      part.size.height * MM_TO_METERS,
      part.size.depth * MM_TO_METERS
    );
    const mesh = new THREE.Mesh(geometry, resolveMaterial(part.materialId));
    mesh.name = part.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(
      (part.position.x + part.size.width / 2) * MM_TO_METERS,
      (part.position.y + part.size.height / 2) * MM_TO_METERS,
      (part.position.z + part.size.depth / 2) * MM_TO_METERS
    );
    mesh.userData = {
      sourceType: "parametric_cabinet",
      cabinetDefinitionId: definition.id,
      moduleId: part.moduleId,
      partId: part.id,
      partType: part.type,
      materialId: part.materialId,
      skuId: part.skuId,
      editable: true,
      dimensionsMm: {
        width: part.size.width,
        height: part.size.height,
        depth: part.size.depth,
      },
      size: part.size,
      position: part.position,
    };
    group.add(mesh);
  }

  return group;
}
