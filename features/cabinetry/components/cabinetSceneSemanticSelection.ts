import * as THREE from "three";

import type { CabinetDefinition, CabinetPart } from "../types";
import type { CabinetSemanticSelection } from "./CabinetSceneItem.types";

export function resolveSemanticSelection(
  object: THREE.Object3D,
  boundary: THREE.Object3D | null,
  definition: CabinetDefinition,
  instanceId: string | undefined,
  partById: ReadonlyMap<string, CabinetPart>,
  moduleIds: ReadonlySet<string>,
  additive: boolean
): CabinetSemanticSelection {
  let current: THREE.Object3D | null = object;

  while (current && current !== boundary) {
    const partId = typeof current.userData.partId === "string" ? current.userData.partId : undefined;
    const part = partId ? partById.get(partId) : undefined;
    if (part) {
      return {
        scope: "part",
        cabinetDefinitionId: definition.id,
        cabinetInstanceId: instanceId,
        moduleId: part.moduleId,
        partId: part.id,
        partType: part.type,
        additive,
      };
    }

    const moduleId = typeof current.userData.moduleId === "string" ? current.userData.moduleId : undefined;
    if (moduleId && moduleIds.has(moduleId)) {
      return {
        scope: "module",
        cabinetDefinitionId: definition.id,
        cabinetInstanceId: instanceId,
        moduleId,
        additive,
      };
    }

    current = current.parent;
  }

  return {
    scope: "assembly",
    cabinetDefinitionId: definition.id,
    cabinetInstanceId: instanceId,
    additive,
  };
}

