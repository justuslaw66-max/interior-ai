"use client";

import { useState } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { applyConsumerTopologyCorrection } from "@/lib/floor-plan-import-review-geometry";
import FloorPlanDimensionCorrectionFields from "./FloorPlanDimensionCorrectionFields";
import FloorPlanOpeningCorrectionFields from "./FloorPlanOpeningCorrectionFields";
import FloorPlanStructureCorrectionFields from "./FloorPlanStructureCorrectionFields";
import FloorPlanWallCorrectionFields from "./FloorPlanWallCorrectionFields";

type FloorPlanTopologyCorrectionPanelProps = {
  document: FloorPlanDocumentV2;
  onChange: (value: FloorPlanDocumentV2) => void;
  onFocusIds: (ids: string[]) => void;
  onError: (message: string | null) => void;
  dark: boolean;
  disabled: boolean;
};

export default function FloorPlanTopologyCorrectionPanel({
  document,
  onChange,
  onFocusIds,
  onError,
  dark,
  disabled,
}: FloorPlanTopologyCorrectionPanelProps) {
  const floor = document.floors[0];
  const [selectedVertexId, setSelectedVertexId] = useState("");
  const [vertexX, setVertexX] = useState(0);
  const [vertexZ, setVertexZ] = useState(0);
  if (!floor) return null;

  const control = dark
    ? "designer-control rounded-md border px-2 py-1.5 text-xs"
    : "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs";
  const subtle = dark ? "text-neutral-400" : "text-neutral-600";

  const selectVertex = (id: string) => {
    setSelectedVertexId(id);
    const item = floor.vertices.find((entry) => entry.id === id);
    if (!item) {
      onFocusIds([]);
      return;
    }
    setVertexX(item.xMm);
    setVertexZ(item.zMm);
    const wallIds = floor.walls
      .filter(
        (wall) =>
          wall.path.startVertexId === id ||
          wall.path.endVertexId === id ||
          (wall.path.kind === "arc" && wall.path.centerVertexId === id)
      )
      .map((wall) => wall.id);
    onFocusIds([id, ...wallIds]);
  };

  const mutate = (
    operation: Parameters<typeof applyConsumerTopologyCorrection>[0]["operation"]
  ) => {
    try {
      onError(null);
      onChange(
        applyConsumerTopologyCorrection({
          document,
          operation,
          mutationId: `consumer-review-${Date.now()}`,
        })
      );
      return true;
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "The correction was rejected."
      );
      return false;
    }
  };

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-semibold">
        Correct walls, openings and structures
      </summary>
      <div className="mt-2 grid gap-3">
        <div className="grid gap-2">
          <label className={`text-[10px] ${subtle}`}>
            Wall vertex
            <select
              className={`${control} mt-1 w-full`}
              value={selectedVertexId}
              onChange={(event) => selectVertex(event.target.value)}
            >
              <option value="">Choose a vertex…</option>
              {floor.vertices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                </option>
              ))}
            </select>
          </label>
          {selectedVertexId ? (
            <div className="grid grid-cols-2 gap-2">
              <label className={`text-[10px] ${subtle}`}>
                X (mm)
                <input
                  className={`${control} mt-1 w-full`}
                  step={1}
                  type="number"
                  value={vertexX}
                  onChange={(event) => setVertexX(Number(event.target.value))}
                />
              </label>
              <label className={`text-[10px] ${subtle}`}>
                Z (mm)
                <input
                  className={`${control} mt-1 w-full`}
                  step={1}
                  type="number"
                  value={vertexZ}
                  onChange={(event) => setVertexZ(Number(event.target.value))}
                />
              </label>
              <button
                type="button"
                className={`${control} col-span-2`}
                disabled={
                  disabled ||
                  !Number.isSafeInteger(vertexX) ||
                  !Number.isSafeInteger(vertexZ)
                }
                onClick={() =>
                  mutate({
                    kind: "move_vertex",
                    floorId: floor.id,
                    vertexId: selectedVertexId,
                    to: { xMm: vertexX, zMm: vertexZ },
                  })
                }
              >
                Move wall vertex safely
              </button>
            </div>
          ) : null}
        </div>
        <FloorPlanWallCorrectionFields
          floor={floor}
          controlClassName={control}
          subtleClassName={subtle}
          disabled={disabled}
          onFocusIds={onFocusIds}
          onMutate={mutate}
        />
        <FloorPlanOpeningCorrectionFields
          document={document}
          floor={floor}
          controlClassName={control}
          subtleClassName={subtle}
          disabled={disabled}
          onFocusIds={onFocusIds}
          onMutate={mutate}
        />
        <FloorPlanStructureCorrectionFields
          document={document}
          floor={floor}
          controlClassName={control}
          subtleClassName={subtle}
          disabled={disabled}
          onFocusIds={onFocusIds}
          onMutate={mutate}
        />
        <FloorPlanDimensionCorrectionFields
          document={document}
          floor={floor}
          controlClassName={control}
          subtleClassName={subtle}
          disabled={disabled}
          onFocusIds={onFocusIds}
          onMutate={mutate}
        />
        <p className={`text-[10px] ${subtle}`}>
          Invalid loops, overlaps, detached spans and non-integer geometry are
          rejected before the candidate changes. Every accepted correction
          stays needs-review.
        </p>
      </div>
    </details>
  );
}
