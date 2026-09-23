import * as THREE from "three";

import type {
  CabinetDefinition,
  CabinetPart,
  CabinetPartType,
} from "../types";

const PREVIEW_FRONT_EDGE_PART_TYPES = new Set<CabinetPartType>([
  "door_front",
  "drawer_front",
]);
export const CABINET_PREVIEW_FRONT_EDGE_OFFSET_M = 0.0004;

export function resolveCabinetPreviewFrontEdgeStyle(materialColor?: string): {
  color: string;
  opacity: number;
} {
  const color = new THREE.Color(materialColor ?? "#d8d2c6");
  const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;

  if (luminance < 0.08) return { color: "#879198", opacity: 0.62 };
  if (luminance < 0.4) return { color: "#d1d6d9", opacity: 0.42 };
  return { color: "#505a63", opacity: 0.3 };
}

export function createCabinetPreviewFrontEdgePositions(
  part: CabinetPart
): Float32Array | null {
  if (!PREVIEW_FRONT_EDGE_PART_TYPES.has(part.type)) return null;

  const x0 = part.position.x / 1000;
  const x1 = (part.position.x + part.size.width) / 1000;
  const y0 = part.position.y / 1000;
  const y1 = (part.position.y + part.size.height) / 1000;
  const z = part.position.z / 1000 - CABINET_PREVIEW_FRONT_EDGE_OFFSET_M;

  return new Float32Array([
    x0, y0, z, x1, y0, z,
    x1, y0, z, x1, y1, z,
    x1, y1, z, x0, y1, z,
    x0, y1, z, x0, y0, z,
  ]);
}

export function createCabinetPreviewFrontEdgeGroup(
  definition: CabinetDefinition,
  parts: readonly CabinetPart[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = `CabinetPreviewFrontEdges_${definition.id}`;

  for (const part of parts) {
    const positions = createCabinetPreviewFrontEdgePositions(part);
    if (!positions) continue;

    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const materialRef = definition.materials.find(
      (material) => material.id === part.materialId
    );
    const edgeStyle = resolveCabinetPreviewFrontEdgeStyle(materialRef?.color);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: edgeStyle.color,
      transparent: true,
      opacity: edgeStyle.opacity,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edgeLines.name = `CabinetPreviewFrontEdge_${part.id}`;
    edgeLines.renderOrder = 1;
    edgeLines.raycast = () => undefined;
    edgeLines.userData = {
      sourceType: "cabinet_preview_front_edge",
      partId: part.id,
      partType: part.type,
      previewOnly: true,
    };
    group.add(edgeLines);
  }

  return group;
}
