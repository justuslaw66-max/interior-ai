"use client";

import { useState } from "react";
import type {
  FloorPlanFloorV2,
  FloorPlanWallClassificationV2,
} from "@/lib/floor-plan-document-v2";
import type { FloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutations";

type Props = {
  floor: FloorPlanFloorV2;
  controlClassName: string;
  subtleClassName: string;
  disabled: boolean;
  onFocusIds: (ids: string[]) => void;
  onMutate: (operation: FloorPlanTopologyMutationV2) => boolean;
};

const CLASSIFICATIONS: FloorPlanWallClassificationV2[] = [
  "exterior",
  "interior",
  "party",
  "partition",
  "structural",
];

export default function FloorPlanWallCorrectionFields({
  floor,
  controlClassName,
  subtleClassName,
  disabled,
  onFocusIds,
  onMutate,
}: Props) {
  const [wallId, setWallId] = useState("");
  const [thicknessMm, setThicknessMm] = useState(200);
  const [classification, setClassification] =
    useState<FloorPlanWallClassificationV2>("interior");

  const selectWall = (id: string) => {
    setWallId(id);
    const wall = floor.walls.find((entry) => entry.id === id);
    if (!wall) {
      onFocusIds([]);
      return;
    }
    setThicknessMm(wall.thicknessMm);
    setClassification(wall.classification);
    onFocusIds([wall.id, wall.path.startVertexId, wall.path.endVertexId]);
  };

  return (
    <div className="grid gap-2 border-t border-neutral-200 pt-2">
      <label className={`text-[10px] ${subtleClassName}`}>
        Wall thickness and type
        <select
          className={`${controlClassName} mt-1 w-full`}
          value={wallId}
          onChange={(event) => selectWall(event.target.value)}
        >
          <option value="">Choose a wall…</option>
          {floor.walls.map((wall) => (
            <option key={wall.id} value={wall.id}>
              {wall.id} · {wall.classification}
            </option>
          ))}
        </select>
      </label>
      {wallId ? (
        <div className="grid grid-cols-2 gap-2">
          <label className={`text-[10px] ${subtleClassName}`}>
            Thickness (mm)
            <input
              className={`${controlClassName} mt-1 w-full`}
              min={1}
              step={1}
              type="number"
              value={thicknessMm}
              onChange={(event) => setThicknessMm(Number(event.target.value))}
            />
          </label>
          <label className={`text-[10px] ${subtleClassName}`}>
            Classification
            <select
              className={`${controlClassName} mt-1 w-full`}
              value={classification}
              onChange={(event) =>
                setClassification(
                  event.target.value as FloorPlanWallClassificationV2
                )
              }
            >
              {CLASSIFICATIONS.map((value) => (
                <option key={value} value={value}>
                  {value.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`${controlClassName} col-span-2`}
            disabled={disabled || !Number.isSafeInteger(thicknessMm)}
            onClick={() =>
              onMutate({
                kind: "update_wall",
                floorId: floor.id,
                wallId,
                changes: { thicknessMm, classification },
              })
            }
          >
            Update wall safely
          </button>
        </div>
      ) : null}
    </div>
  );
}
