"use client";

import { useState } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { addFoundRoom } from "@/lib/floor-plan-review-room-conform";
import type { FoundRoom } from "@/lib/floor-plan-review-room-click";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { Button } from "@/components/ui/Button";
import { ROOM_TYPE_OPTIONS } from "./roomTypeOptions";
import type { RoomClick } from "./useRoomClick";

type FloorPlanRoomClickPanelProps = {
  roomClick: RoomClick;
  document: FloorPlanDocumentV2;
  floorId: string;
  sourceId: string;
  ready: boolean;
  onStart: () => void;
  onChange: (value: FloorPlanDocumentV2) => void;
  onError: (message: string | null) => void;
  disabled: boolean;
};

const control = "rounded-md border border-control-secondary-border bg-field px-2 py-1.5 text-xs";

/** A found room, before it is added: its size, an editable printed name and type, and Add / Clear. */
function FoundRoomFields({ room, onAdd, onClear, disabled }: {
  room: FoundRoom; onAdd: (name: string, type: string) => void; onClear: () => void; disabled: boolean;
}) {
  const [name, setName] = useState(room.name);
  const [type, setType] = useState(room.roomType);
  return (
    <div data-review-controls="room-click-found" className="grid gap-2 rounded-md border border-success-tint-border bg-surface-floating p-2 text-xs">
      <p className="font-medium text-label">Found a room of {room.areaM2} m². Check its outline on the plan.</p>
      <label className="text-label-secondary">
        Room name
        <input className={`${control} mt-1 w-full`} maxLength={120} value={name} placeholder="Room"
          onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="text-label-secondary">
        Room type
        <select className={`${control} mt-1 w-full`} value={type} onChange={(event) => setType(event.target.value)}>
          {ROOM_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="compact" disabled={disabled} onClick={() => onAdd(name, type)}>Add this room</Button>
        <Button size="compact" disabled={disabled} onClick={onClear}>Clear</Button>
      </div>
    </div>
  );
}

/** Step 2's quick way: click inside a room on the plan and its outline is found from the drawing. */
export default function FloorPlanRoomClickPanel({
  roomClick, document, floorId, sourceId, ready, onStart, onChange, onError, disabled,
}: FloorPlanRoomClickPanelProps) {
  const found = roomClick.found;
  const add = (name: string, type: string) => {
    if (!found) return;
    try {
      onError(null);
      onChange(addFoundRoom({ document, floorId, sourceId, pageNumber: found.pageNumber, corners: found.corners, roomName: name,
        roomType: type, wallThicknessMm: found.wallThicknessMm ?? 120 }));
      roomClick.clear();
    } catch (cause) {
      onError(userFacingErrorMessage(cause, "The room could not be added. Outline it corner by corner instead."));
    }
  };
  return (
    <div data-review-controls="room-click" className="grid gap-2">
      <Button size="compact" pressed={roomClick.picking} className="w-full" disabled={disabled || !ready}
        onClick={() => (roomClick.picking ? roomClick.choose(false) : onStart())}>
        {roomClick.picking ? "Click inside a room on the plan" : "Click inside a room"}
      </Button>
      <p className="text-xs leading-4 text-label-secondary">
        {roomClick.busy ? "Finding the room…" : "Click in the middle of a room and its outline is found from the drawing. Or outline it corner by corner below."}
      </p>
      {roomClick.message ? (
        <p className="rounded-md border border-warning-tint-border bg-surface-floating p-2 text-xs text-on-warning-tint" role="status">
          {roomClick.message}
        </p>
      ) : null}
      {found ? <FoundRoomFields key={found.corners.map((corner) => `${corner.x},${corner.y}`).join(" ")} room={found}
        onAdd={add} onClear={roomClick.clear} disabled={disabled} /> : null}
    </div>
  );
}
