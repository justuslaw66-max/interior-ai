"use client";

import { useState } from "react";
import type { FloorPlanFloorV2, FloorPlanWallV2 } from "@/lib/floor-plan-document-v2";
import type { ConsumerWallTopologyMutationV2 } from "@/lib/floor-plan-consumer-wall-edit";
import { changedOpeningFormFields, proposedOpeningForm } from "@/lib/floor-plan-opening-form";
import { CanonicalWallDimensions } from "./CanonicalWallDimensions";
import { CanonicalRoomRecovery } from "./CanonicalRoomRecovery";
import type { FloorPlanProposalState } from "@/lib/floor-plan-proposal-types";
import type { RecoverProposedRoomLayoutInput } from "@/lib/floor-plan-room-recovery";

type Props = { floor: FloorPlanFloorV2; wall: FloorPlanWallV2; commit: (operation: ConsumerWallTopologyMutationV2) => boolean };
const inputStyle = "mt-1 w-full rounded border border-neutral-400 bg-transparent p-1.5";
const buttonStyle = "rounded border border-neutral-400 px-2 py-1.5 disabled:opacity-40";

function Millimetres({ label, value, change, min }: { label: string; value: number; change: (value: number) => void; min?: number }) {
  return <label>{label} (mm)<input className={inputStyle} type="number" step="1" min={min} value={value} onChange={(event) => change(Number(event.target.value))} /></label>;
}

export function CanonicalPlanRemodelTools({ floor, wall, commit, proposal, recover }: Props & { proposal?: FloorPlanProposalState; recover: (input: RecoverProposedRoomLayoutInput) => boolean }) {
  return <div className="grid gap-3 border-t border-neutral-300 pt-3">
    <CanonicalWallDimensions floor={floor} wall={wall} commit={commit} />
    <AddPartition floor={floor} commit={commit} />
    <WallRemoval key={`removal:${wall.id}:${floor.openings.filter((opening) => opening.wallId === wall.id).map(({ id }) => id).join()}`} floor={floor} wall={wall} commit={commit} />
    <OpeningProperties key={`openings:${wall.id}:${floor.openings.map((opening) => opening.id).join()}`} floor={floor} wall={wall} commit={commit} />
    <CanonicalRoomRecovery proposal={proposal} rooms={floor.rooms} recover={recover} />
  </div>;
}

function AddPartition({ floor, commit }: Omit<Props, "wall">) {
  const [values, setValues] = useState({ x1: 0, z1: 0, x2: 1000, z2: 1000, thickness: 100, height: 2600, roomName: "New room" });
  const set = (key: keyof typeof values, value: number | string) => setValues((previous) => ({ ...previous, [key]: value }));
  const add = () => {
    const suffix = crypto.randomUUID();
    const start = floor.vertices.find((v) => v.xMm === values.x1 && v.zMm === values.z1);
    const end = floor.vertices.find((v) => v.xMm === values.x2 && v.zMm === values.z2);
    const startVertexId = start?.id ?? `start-${suffix}`, endVertexId = end?.id ?? `end-${suffix}`;
    commit({ kind: "add_wall", floorId: floor.id, wallId: `wall-${suffix}`, startVertexId, endVertexId,
      vertices: [...(start ? [] : [{ id: startVertexId, xMm: values.x1, zMm: values.z1 }]), ...(end ? [] : [{ id: endVertexId, xMm: values.x2, zMm: values.z2 }])],
      thicknessMm: values.thickness, heightMm: values.height, newRoomId: `room-${suffix}`, newRoomName: values.roomName });
  };
  return <details><summary className="cursor-pointer font-semibold">Add a wall</summary>
    <p className="my-2">Enter centreline endpoints. A point exactly on a straight wall creates a junction automatically. A boundary-to-boundary partition divides the room; partial partitions keep it open.</p>
    <div className="grid grid-cols-2 gap-2">
      <Millimetres label="Start X" value={values.x1} change={(v) => set("x1", v)} /><Millimetres label="Start Z" value={values.z1} change={(v) => set("z1", v)} />
      <Millimetres label="End X" value={values.x2} change={(v) => set("x2", v)} /><Millimetres label="End Z" value={values.z2} change={(v) => set("z2", v)} />
      <Millimetres label="Thickness" value={values.thickness} change={(v) => set("thickness", v)} min={1} /><Millimetres label="Proposed height" value={values.height} change={(v) => set("height", v)} min={1} />
      <label className="col-span-2">New room name if divided<input className={inputStyle} value={values.roomName} onChange={(event) => set("roomName", event.target.value)} /></label>
      <p className="col-span-2">The existing name stays on the boundary side reached from start to end. The new room inherits the same finishes for review.</p>
      <button type="button" className={`${buttonStyle} col-span-2`} onClick={add}>Add proposed wall</button>
    </div>
  </details>;
}

function WallRemoval({ floor, wall, commit }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [keepRoomId, setKeepRoomId] = useState(wall.adjacentRoomIds[0] ?? "");
  const openings = floor.openings.filter((opening) => opening.wallId === wall.id);
  const rooms = floor.rooms.filter((room) => wall.adjacentRoomIds.includes(room.id));
  return <details><summary className="cursor-pointer font-semibold">Remove selected wall</summary>
    <p className="my-2 text-amber-700">Structural status is not established by this drawing. Removing a wall here is a conceptual proposal and does not authorize demolition. Consult the relevant qualified professional before physical work.</p>
    <p>Affected openings: {openings.map((opening) => `${opening.kind} ${opening.id}`).join(", ") || "none"}. Their removal is part of this transaction. Attached furniture stays at its world position for review.</p>
    {rooms.length === 2 ? <label className="my-2 block">Keep name and finishes from<select className={inputStyle} value={keepRoomId} onChange={(event) => setKeepRoomId(event.target.value)}>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label> : null}
    <label className="my-2 flex gap-2"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed these dependencies and am making a conceptual proposal.</label>
    <button type="button" className={buttonStyle} disabled={!confirmed || wall.path.kind !== "line"} onClick={() => commit({ kind: "remove_wall", floorId: floor.id, wallId: wall.id, confirmedOpeningIds: openings.map(({ id }) => id), keepRoomId })}>Remove proposed wall</button>
  </details>;
}

function OpeningProperties({ floor, wall, commit }: Props) {
  const openings = floor.openings.filter((opening) => opening.wallId === wall.id);
  const [selected, setSelected] = useState(openings[0]?.id ?? "");
  const opening = openings.find(({ id }) => id === selected);
  return <details><summary className="cursor-pointer font-semibold">Doors and windows</summary>
    <select aria-label="Opening to edit" className={inputStyle} value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">New opening</option>{openings.map((entry) => <option key={entry.id} value={entry.id}>{entry.kind} {entry.id}</option>)}</select>
    <OpeningForm key={selected} floor={floor} wall={wall} opening={opening} commit={commit} />
  </details>;
}

function OpeningForm({ floor, wall, opening, commit }: Props & { opening?: FloorPlanFloorV2["openings"][number] }) {
  const source = proposedOpeningForm(floor, opening);
  const sourceKey = JSON.stringify([wall.id, opening?.id, source]);
  const [form, setForm] = useState({ key: sourceKey, values: source });
  const draft = form.key === sourceKey ? form.values : source;
  const setDraft = (values: typeof source) => setForm({ key: sourceKey, values });
  return <div className="mt-2 grid grid-cols-2 gap-2">
    <label>Type<select className={inputStyle} value={draft.kind} onChange={(event) => { const kind = event.target.value; if (kind === "door" || kind === "window" || kind === "open_passage" || kind === "gate" || kind === "vent" || kind === "louvre") setDraft({ ...draft, kind }); }}>{["door", "window", "open_passage", "gate", "vent", "louvre"].map((kind) => <option key={kind}>{kind}</option>)}</select></label>
    <label>Operation<select className={inputStyle} value={draft.operation} onChange={(event) => { const value = event.target.value; if (value === "swing" || value === "sliding" || value === "fixed" || value === "folding" || value === "open") setDraft({ ...draft, operation: value }); }}>{["swing", "sliding", "fixed", "folding", "open"].map((v) => <option key={v}>{v}</option>)}</select></label>
    {([['offsetMm', 'Position from wall start'], ['widthMm', 'Width'], ['heightMm', 'Height'], ['sillHeightMm', 'Sill']] as const).map(([key, label]) => <Millimetres key={key} label={label} value={draft[key]} min={0} change={(value) => setDraft({ ...draft, [key]: value })} />)}
    <label>Hinge<select className={inputStyle} value={draft.hinge} onChange={(event) => { const value = event.target.value; if (value === "start" || value === "end" || value === "none" || value === "unknown") setDraft({ ...draft, hinge: value }); }}>{["start", "end", "none", "unknown"].map((v) => <option key={v}>{v}</option>)}</select></label>
    <label>Swing side<select className={inputStyle} value={draft.handing} onChange={(event) => { const value = event.target.value; if (value === "left" || value === "right" || value === "double" || value === "none" || value === "unknown") setDraft({ ...draft, handing: value }); }}>{["left", "right", "double", "none", "unknown"].map((v) => <option key={v}>{v}</option>)}</select></label>
    <p className="col-span-2">Heights without source measurements use the plan defaults. Only values you change become proposed measurements.</p>
    <button type="button" className={`${buttonStyle} col-span-2`} onClick={() => commit(opening ? { kind: "update_opening", floorId: floor.id, openingId: opening.id, changes: changedOpeningFormFields(floor, opening, draft) } : { kind: "add_opening", floorId: floor.id, opening: { ...draft, id: `opening-${crypto.randomUUID()}`, wallId: wall.id, heightEvidence: "assumed", sillHeightEvidence: "assumed", widthEvidence: "user_confirmed" } })}>{opening ? "Apply opening changes" : "Add opening"}</button>
    {opening ? <button type="button" className={`${buttonStyle} col-span-2`} onClick={() => commit({ kind: "remove_opening", floorId: floor.id, openingId: opening.id })}>Remove opening</button> : null}
  </div>;
}
