"use client";

import { useState } from "react";
import type { FloorPlanFloorV2, FloorPlanWallV2 } from "@/lib/floor-plan-document-v2";
import type { ConsumerWallTopologyMutationV2 } from "@/lib/floor-plan-consumer-wall-edit";
import { proposedWallLengthEndpoint } from "@/lib/floor-plan-wall-length";

const inputClass = "mt-1 w-full rounded border border-neutral-400 bg-transparent p-1.5";
const buttonClass = "rounded border border-neutral-400 px-2 py-1.5 aria-disabled:opacity-40";

export function CanonicalWallDimensions({ floor, wall, commit }: {
  floor: FloorPlanFloorV2; wall: FloorPlanWallV2; commit: (operation: ConsumerWallTopologyMutationV2) => boolean;
}) {
  const start = floor.vertices.find(({ id }) => id === wall.path.startVertexId);
  const end = floor.vertices.find(({ id }) => id === wall.path.endVertexId);
  const length = start && end ? Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm) : 0;
  const source = { requested: Math.round(length), height: wall.heightMm ?? floor.defaults.wallHeight.valueMm, base: wall.baseOffsetMm ?? 0 };
  const sourceKey = JSON.stringify([wall.id, start?.xMm, start?.zMm, end?.xMm, end?.zMm, source]);
  const [draft, setDraft] = useState({ key: sourceKey, values: source });
  const values = draft.key === sourceKey ? draft.values : source;
  const change = (key: keyof typeof source, value: number) => setDraft({ key: sourceKey, values: { ...values, [key]: value } });
  const endpoint = proposedWallLengthEndpoint(floor, wall, values.requested);
  const verticalChanged = values.height !== source.height || values.base !== source.base;
  const verticalValid = Number.isSafeInteger(values.height) && values.height > 0 && Number.isSafeInteger(values.base) && values.base >= 0;
  return <details><summary className="cursor-pointer font-semibold">Wall length and height</summary>
    <p className="my-2">Centreline length: {wall.path.kind === "line" ? `${length.toFixed(3)} mm` : "curved wall (length editing unavailable)"}. Length edits keep the start fixed and move the end, including any connected walls.</p>
    <div className="grid grid-cols-2 gap-2">
      <label className="col-span-2">Requested length (mm)<input className={inputClass} type="number" min={1} step={1} disabled={wall.path.kind !== "line"} value={values.requested} onChange={(event) => change("requested", Number(event.target.value))} /></label>
      {endpoint ? <p className="col-span-2">Endpoints use a 1 mm grid along the current direction. Result: {endpoint.actualLengthMm.toFixed(3)} mm; end ({endpoint.to.xMm}, {endpoint.to.zMm}) mm.</p> : null}
      <button className={`${buttonClass} col-span-2`} type="button" aria-disabled={!endpoint?.changed} onClick={() => endpoint?.changed && commit({ kind: "move_vertex", floorId: floor.id, vertexId: endpoint.vertexId, to: endpoint.to })}>Apply wall length</button>
      <label>Wall height (mm)<input className={inputClass} type="number" min={1} step={1} value={values.height} onChange={(event) => change("height", Number(event.target.value))} /></label>
      <label>Wall base above floor (mm)<input className={inputClass} type="number" min={0} step={1} value={values.base} onChange={(event) => change("base", Number(event.target.value))} /></label>
      <p className="col-span-2">Height is {wall.heightMm === undefined ? "a plan default" : "an explicit value"}. Changed values describe this proposal; they do not verify a source measurement. Openings must fit the resulting wall.</p>
      <button className={`${buttonClass} col-span-2`} type="button" aria-disabled={!verticalChanged || !verticalValid} onClick={() => verticalChanged && verticalValid && commit({ kind: "update_wall", floorId: floor.id, wallId: wall.id, changes: {
        ...(values.height !== source.height ? { heightMm: values.height } : {}), ...(values.base !== source.base ? { baseOffsetMm: values.base } : {}),
      } })}>Apply wall height</button>
    </div>
  </details>;
}
