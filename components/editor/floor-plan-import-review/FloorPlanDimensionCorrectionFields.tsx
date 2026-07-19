"use client";

import { useState } from "react";
import type {
  FloorPlanDimensionV2,
  FloorPlanDocumentV2,
  FloorPlanFloorV2,
} from "@/lib/floor-plan-document-v2";
import { nextFloorPlanReviewEntityId } from "@/lib/floor-plan-review-structure-rectangle";
import type { FloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutations";

type Props = {
  document: FloorPlanDocumentV2;
  floor: FloorPlanFloorV2;
  controlClassName: string;
  subtleClassName: string;
  disabled: boolean;
  onFocusIds: (ids: string[]) => void;
  onMutate: (operation: FloorPlanTopologyMutationV2) => boolean;
};

const AXES: FloorPlanDimensionV2["axis"][] = [
  "aligned",
  "horizontal",
  "vertical",
];

function currentMeasurement(
  floor: FloorPlanFloorV2,
  fromVertexId: string,
  toVertexId: string,
  axis: FloorPlanDimensionV2["axis"]
): number | null {
  const from = floor.vertices.find((vertex) => vertex.id === fromVertexId);
  const to = floor.vertices.find((vertex) => vertex.id === toVertexId);
  if (!from || !to || from.id === to.id) return null;
  if (axis === "horizontal") return Math.abs(to.xMm - from.xMm);
  if (axis === "vertical") return Math.abs(to.zMm - from.zMm);
  return Math.round(Math.hypot(to.xMm - from.xMm, to.zMm - from.zMm));
}

export default function FloorPlanDimensionCorrectionFields({
  document,
  floor,
  controlClassName,
  subtleClassName,
  disabled,
  onFocusIds,
  onMutate,
}: Props) {
  const [dimensionId, setDimensionId] = useState("");
  const [label, setLabel] = useState("");
  const [fromVertexId, setFromVertexId] = useState("");
  const [toVertexId, setToVertexId] = useState("");
  const [axis, setAxis] =
    useState<FloorPlanDimensionV2["axis"]>("aligned");
  const [measuredMm, setMeasuredMm] = useState(0);

  const focus = (fromId: string, toId: string, id = dimensionId) => {
    onFocusIds([id, fromId, toId].filter(Boolean));
  };

  const reset = () => {
    setDimensionId("");
    setLabel("");
    setFromVertexId("");
    setToVertexId("");
    setAxis("aligned");
    setMeasuredMm(0);
    onFocusIds([]);
  };

  const selectDimension = (id: string) => {
    setDimensionId(id);
    const dimension = floor.dimensions.find((item) => item.id === id);
    if (!dimension) return reset();
    setLabel(dimension.label ?? "");
    setFromVertexId(dimension.fromVertexId);
    setToVertexId(dimension.toVertexId);
    setAxis(dimension.axis);
    setMeasuredMm(dimension.measuredMm);
    focus(dimension.fromVertexId, dimension.toVertexId, dimension.id);
  };

  const save = () => {
    const common = {
      label: label.trim() || undefined,
      fromVertexId,
      toVertexId,
      axis,
      measuredMm,
    };
    const id =
      dimensionId || nextFloorPlanReviewEntityId(document, "consumer-dimension");
    const operation: FloorPlanTopologyMutationV2 = dimensionId
      ? {
          kind: "update_dimension",
          floorId: floor.id,
          dimensionId,
          changes: common,
        }
      : {
          kind: "add_dimension",
          floorId: floor.id,
          dimension: { id, ...common },
        };
    if (onMutate(operation) && !dimensionId) reset();
  };

  const exact = currentMeasurement(floor, fromVertexId, toVertexId, axis);
  const valid =
    fromVertexId.length > 0 &&
    toVertexId.length > 0 &&
    fromVertexId !== toVertexId &&
    Number.isSafeInteger(measuredMm) &&
    measuredMm > 0;

  return (
    <div className="grid gap-2 border-t border-neutral-200 pt-2">
      <label className={`text-[10px] ${subtleClassName}`}>
        Add or edit an exact source dimension
        <select
          className={`${controlClassName} mt-1 w-full`}
          value={dimensionId}
          onChange={(event) => selectDimension(event.target.value)}
        >
          <option value="">New dimension…</option>
          {floor.dimensions.map((dimension) => (
            <option key={dimension.id} value={dimension.id}>
              {dimension.label || dimension.id} · {dimension.measuredMm} mm
            </option>
          ))}
        </select>
      </label>
      <label className={`text-[10px] ${subtleClassName}`}>
        Label (optional)
        <input
          className={`${controlClassName} mt-1 w-full`}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {[
          ["From vertex", fromVertexId, setFromVertexId],
          ["To vertex", toVertexId, setToVertexId],
        ].map(([fieldLabel, value, setter]) => (
          <label key={String(fieldLabel)} className={`text-[10px] ${subtleClassName}`}>
            {String(fieldLabel)}
            <select
              className={`${controlClassName} mt-1 w-full`}
              value={value as string}
              onChange={(event) => {
                (setter as (next: string) => void)(event.target.value);
                const nextFrom = fieldLabel === "From vertex" ? event.target.value : fromVertexId;
                const nextTo = fieldLabel === "To vertex" ? event.target.value : toVertexId;
                focus(nextFrom, nextTo);
              }}
            >
              <option value="">Choose…</option>
              {floor.vertices.map((vertex) => (
                <option key={vertex.id} value={vertex.id}>
                  {vertex.id} · ({vertex.xMm}, {vertex.zMm})
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className={`text-[10px] ${subtleClassName}`}>
          Axis
          <select
            className={`${controlClassName} mt-1 w-full`}
            value={axis}
            onChange={(event) =>
              setAxis(event.target.value as FloorPlanDimensionV2["axis"])
            }
          >
            {AXES.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className={`text-[10px] ${subtleClassName}`}>
          Printed distance (mm)
          <input
            className={`${controlClassName} mt-1 w-full`}
            min={1}
            step={1}
            type="number"
            value={measuredMm}
            onChange={(event) => setMeasuredMm(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          className={`${controlClassName} col-span-2`}
          disabled={disabled || exact === null || exact <= 0}
          onClick={() => exact !== null && setMeasuredMm(exact)}
        >
          Use current geometry{exact !== null ? ` (${exact} mm)` : ""}
        </button>
        <button
          type="button"
          className={`${controlClassName} col-span-2`}
          disabled={disabled || !valid}
          onClick={save}
        >
          {dimensionId ? "Update dimension safely" : "Add dimension safely"}
        </button>
        {dimensionId ? (
          <button
            type="button"
            className={`${controlClassName} col-span-2 text-red-700`}
            disabled={disabled}
            onClick={() => {
              if (
                onMutate({
                  kind: "remove_dimension",
                  floorId: floor.id,
                  dimensionId,
                })
              ) {
                reset();
              }
            }}
          >
            Remove this dimension
          </button>
        ) : null}
      </div>
      <p className={`text-[10px] ${subtleClassName}`}>
        A printed distance that contradicts these vertices is rejected; the
        geometry is never silently stretched to make it fit.
      </p>
    </div>
  );
}
