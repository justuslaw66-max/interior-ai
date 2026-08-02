import { useMemo } from "react";
import { Edges } from "@react-three/drei/core/Edges";
import type { GLBLocalRenderBounds } from "../glb-scaled-model/localRenderBounds";

export const SELECTION_BOX_SIDE_PADDING_METERS = 0.035;
export const SELECTION_BOX_TOP_PADDING_METERS = 0.035;
export const SELECTION_BOX_BOTTOM_INSET_METERS = 0.012;

export function FurnitureSelectionOutline({
  localRenderBounds,
}: {
  localRenderBounds: GLBLocalRenderBounds;
}) {
  const centerX = localRenderBounds.center[0];
  const centerY = localRenderBounds.center[1];
  const centerZ = localRenderBounds.center[2];
  const sizeX = localRenderBounds.size[0];
  const sizeY = localRenderBounds.size[1];
  const sizeZ = localRenderBounds.size[2];
  const selectionBoxBounds = useMemo(() => {
    const minY = centerY - sizeY / 2;
    const maxY = centerY + sizeY / 2;
    const bottomY = minY + SELECTION_BOX_BOTTOM_INSET_METERS;
    const topY = maxY + SELECTION_BOX_TOP_PADDING_METERS;

    return {
      position: [centerX, (bottomY + topY) / 2, centerZ] as [
        number,
        number,
        number,
      ],
      size: [
        sizeX + SELECTION_BOX_SIDE_PADDING_METERS * 2,
        topY - bottomY,
        sizeZ + SELECTION_BOX_SIDE_PADDING_METERS * 2,
      ] as [number, number, number],
    };
  }, [centerX, centerY, centerZ, sizeX, sizeY, sizeZ]);

  return (
    <mesh
      raycast={() => null}
      renderOrder={24}
      position={selectionBoxBounds.position}
      userData={{ testId: "selected-furniture-outline" }}
    >
      <boxGeometry args={selectionBoxBounds.size} />
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        colorWrite={false}
      />
      <Edges
        color="#79a9e8"
        lineWidth={1.75}
        renderOrder={25}
        depthTest={false}
        depthWrite={false}
        threshold={12}
      />
    </mesh>
  );
}
