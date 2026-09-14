"use client";

import { useState } from "react";
import type { FloorPlanFloorV2, FloorPlanWallV2 } from "@/lib/floor-plan-document-v2";
import type { ConsumerWallTopologyMutationV2 } from "@/lib/floor-plan-consumer-wall-edit";

const inputStyle = "mt-1 w-full rounded border border-neutral-400 bg-transparent p-1.5";

export function CanonicalWallJoin({ floor, wall, commit }: {
  floor: FloorPlanFloorV2; wall: FloorPlanWallV2; commit: (operation: ConsumerWallTopologyMutationV2) => boolean;
}) {
  const [endpoint, setEndpoint] = useState<"start" | "end">("end");
  const [target, setTarget] = useState({ xMm: 0, zMm: 0 });
  const [roomName, setRoomName] = useState("New room");
  const vertexId = endpoint === "start" ? wall.path.startVertexId : wall.path.endVertexId;
  const incidentCount = floor.walls.filter((candidate) => candidate.path.startVertexId === vertexId || candidate.path.endVertexId === vertexId).length;
  const enabled = wall.path.kind === "line" && incidentCount === 1 && Number.isSafeInteger(target.xMm) && Number.isSafeInteger(target.zMm);
  const join = () => {
    if (enabled) commit({ kind: "join_wall_endpoint", floorId: floor.id, wallId: wall.id, endpoint, to: target,
      newRoomId: `room-${crypto.randomUUID()}`, newRoomName: roomName });
  };
  return <details><summary className="cursor-pointer font-semibold">Join an endpoint</summary>
    <p className="my-2">Connect a free endpoint to an existing wall corner or an exact point on a straight wall centreline. The join preserves one shared corner; an opening crossing a required split blocks the change.</p>
    <div className="grid grid-cols-2 gap-2">
      <label className="col-span-2">Endpoint to join<select className={inputStyle} value={endpoint} onChange={(event) => setEndpoint(event.target.value === "start" ? "start" : "end")}>
        <option value="start">Start (A)</option><option value="end">End (B)</option>
      </select></label>
      <label>Join target X (mm)<input type="number" step={1} className={inputStyle} value={target.xMm} onChange={(event) => setTarget({ ...target, xMm: Number(event.target.value) })} /></label>
      <label>Join target Z (mm)<input type="number" step={1} className={inputStyle} value={target.zMm} onChange={(event) => setTarget({ ...target, zMm: Number(event.target.value) })} /></label>
      <label className="col-span-2">New room name after join<input className={inputStyle} value={roomName} onChange={(event) => setRoomName(event.target.value)} /></label>
      <p className="col-span-2">A dividing partition keeps the existing name on the boundary side reached from start to end. An enclosed loop keeps it with the surrounding space. The new room inherits finishes for review.</p>
      {!enabled && <p className="col-span-2 text-amber-700">Choose a free endpoint of a straight wall. An existing room corner or shared junction cannot be joined by this tool.</p>}
      <button type="button" className="col-span-2 rounded border border-neutral-400 px-2 py-1.5 aria-disabled:opacity-40" aria-disabled={!enabled} onClick={join}>Join proposed endpoint</button>
    </div>
  </details>;
}
