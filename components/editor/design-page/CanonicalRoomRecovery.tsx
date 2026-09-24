"use client";

import { useState } from "react";
import type { FloorPlanProposalState } from "@/lib/floor-plan-proposal-types";
import type { RecoverProposedRoomLayoutInput } from "@/lib/floor-plan-room-recovery";

export function CanonicalRoomRecovery({ proposal, rooms, recover }: {
  proposal?: FloorPlanProposalState;
  rooms: readonly { id: string; name: string }[];
  recover: (input: RecoverProposedRoomLayoutInput) => boolean;
}) {
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [layoutId, setLayoutId] = useState("");
  const [message, setMessage] = useState("");
  const sources = proposal?.roomRecovery.filter((room) => room.layoutVersions?.length) ?? [];
  const source = sources.find(({ id }) => id === sourceId) ?? sources[0];
  const target = rooms.find(({ id }) => id === targetId) ?? rooms[0];
  const layout = source?.layoutVersions?.find(({ id }) => id === layoutId) ?? source?.layoutVersions?.[0];
  if (!source) return null;
  const field = "mt-1 w-full rounded border border-neutral-400 bg-transparent p-1.5";
  return <details className="mt-3 border-t border-neutral-300 pt-3"><summary className="cursor-pointer font-semibold">Recover a room layout</summary>
    <p className="my-2">Merged rooms keep their saved layouts. Add one to a current room, then preview or restore it in Layouts. World positions are preserved; review placements against the new walls.</p>
    <label className="block">Original room<select className={field} value={source.id} onChange={(event) => { setSourceId(event.target.value); setLayoutId(""); setMessage(""); }}>{sources.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
    <label className="mt-2 block">Saved layout<select className={field} value={layout?.id ?? ""} onChange={(event) => setLayoutId(event.target.value)}>{source.layoutVersions?.map((version) => <option key={version.id} value={version.id}>{version.name}</option>)}</select></label>
    <label className="mt-2 block">Recover into room<select className={field} value={target?.id ?? ""} onChange={(event) => setTargetId(event.target.value)}>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
    <button type="button" className="mt-2 rounded border border-neutral-400 px-2 py-1.5 disabled:opacity-40" disabled={!layout || !target} onClick={() => {
      if (layout && target && recover({ sourceRoomId: source.id, targetRoomId: target.id, layoutId: layout.id })) setMessage("Added to Layouts. Current furniture is unchanged.");
    }}>Recover saved layout</button>
    <p role="status" className="mt-2">{message}</p>
  </details>;
}
