"use client";

import { useState } from "react";
import type {
  FloorPlanDocumentV2,
  FloorPlanSourceCalibrationV2,
} from "@/lib/floor-plan-document-v2";
import {
  traceRoomFromSourcePolygon,
  type ReviewSourcePoint,
} from "@/lib/floor-plan-import-review-geometry";

type FloorPlanRoomTracePanelProps = {
  document: FloorPlanDocumentV2;
  floorId: string;
  sourceId: string;
  pageNumber: number | null;
  calibration: FloorPlanSourceCalibrationV2 | undefined;
  pickingRoom: boolean;
  roomPoints: ReviewSourcePoint[];
  onPickingRoomChange: (value: boolean) => void;
  onRoomPointsChange: (value: ReviewSourcePoint[]) => void;
  onChange: (value: FloorPlanDocumentV2) => void;
  onError: (message: string | null) => void;
  dark: boolean;
  disabled: boolean;
};

export default function FloorPlanRoomTracePanel({
  document,
  floorId,
  sourceId,
  pageNumber,
  calibration,
  pickingRoom,
  roomPoints,
  onPickingRoomChange,
  onRoomPointsChange,
  onChange,
  onError,
  dark,
  disabled,
}: FloorPlanRoomTracePanelProps) {
  const floor = document.floors.find((entry) => entry.id === floorId);
  const [roomName, setRoomName] = useState("");
  const [roomType, setRoomType] = useState("other");
  const [wallThicknessMm, setWallThicknessMm] = useState(120);
  if (!floor) return null;

  const control = dark
    ? "designer-control rounded-md border px-2 py-1.5 text-xs"
    : "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs";
  const subtle = dark ? "text-neutral-400" : "text-neutral-600";

  return (
    <details className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3" open={pickingRoom || !floor.rooms.length}>
      <summary className="cursor-pointer text-sm font-semibold">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">2</span>
        Outline each room
        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">
          {floor.rooms.length
            ? `${floor.rooms.length} added`
            : calibration
              ? "Ready"
              : "After Step 1"}
        </span>
      </summary>
      <div className="mt-2 grid gap-2">
        <p className={`text-[10px] leading-4 ${subtle}`}>
          Start with one room. Click its inside corners in order around the room,
          then add it. Repeat until every room is outlined.
        </p>
        {!calibration ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[10px] font-medium text-amber-900">
            Set the drawing scale above before tracing rooms.
          </div>
        ) : null}
        <button
          className={`${control} w-full font-semibold`}
          disabled={disabled || !calibration}
          onClick={() => onPickingRoomChange(!pickingRoom)}
          type="button"
        >
          {pickingRoom
            ? "Selecting corners — click on the plan"
            : "Start outlining a room"}
        </button>
        <div className="rounded-md bg-white p-2 text-xs text-neutral-700">
          {pickingRoom
            ? roomPoints.length < 3
              ? `${roomPoints.length} corner${roomPoints.length === 1 ? "" : "s"} selected. Add at least ${3 - roomPoints.length} more.`
              : `${roomPoints.length} corners selected. Add the room when the outline looks correct.`
            : "The selected corners will appear directly on the plan."}
        </div>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <button
            className={control}
            disabled={disabled || !roomPoints.length}
            onClick={() => onRoomPointsChange(roomPoints.slice(0, -1))}
            type="button"
          >
            Undo last point
          </button>
          <button
            className={control}
            disabled={disabled || !roomPoints.length}
            onClick={() => onRoomPointsChange([])}
            type="button"
          >
            Start over
          </button>
        </div>
        <button
          className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          disabled={
            disabled ||
            !calibration ||
            pageNumber === null ||
            roomPoints.length < 3 ||
            !Number.isFinite(wallThicknessMm)
          }
          onClick={() => {
            if (!calibration || pageNumber === null) return;
            try {
              onError(null);
              onChange(
                traceRoomFromSourcePolygon({
                  document,
                  floorId,
                  sourceId,
                  pageNumber,
                  points: roomPoints,
                  roomName,
                  roomType,
                  wallThicknessMm,
                })
              );
              onRoomPointsChange([]);
              onPickingRoomChange(false);
              setRoomName("");
            } catch (cause) {
              onError(
                cause instanceof Error
                  ? cause.message
                  : "The traced room could not be added."
              );
            }
          }}
          type="button"
        >
          Add this room
        </button>
        <details className="rounded-md border border-emerald-200 bg-white p-2">
          <summary className="cursor-pointer text-[10px] font-semibold text-neutral-700">
            Room details (optional)
          </summary>
          <div className="mt-2 grid gap-2">
            <label className={`text-[10px] ${subtle}`}>
              Room name
              <input
                className={`${control} mt-1 w-full`}
                maxLength={120}
                onChange={(event) => setRoomName(event.target.value)}
                placeholder={`Room ${floor.rooms.length + 1}`}
                value={roomName}
              />
            </label>
            <label className={`text-[10px] ${subtle}`}>
              Room type
              <select
                className={`${control} mt-1 w-full`}
                onChange={(event) => setRoomType(event.target.value)}
                value={roomType}
              >
                <option value="other">Room</option>
                <option value="living">Living room</option>
                <option value="bedroom">Bedroom</option>
                <option value="dining">Dining room</option>
                <option value="kitchen">Kitchen</option>
                <option value="toilet">Bathroom</option>
                <option value="study">Study</option>
                <option value="shelter">Household shelter</option>
                <option value="service_yard">Service yard</option>
              </select>
            </label>
            <label className={`text-[10px] ${subtle}`}>
              Wall thickness (mm)
              <input
                className={`${control} mt-1 w-full`}
                max={1000}
                min={50}
                onChange={(event) =>
                  setWallThicknessMm(Number(event.target.value))
                }
                step={10}
                type="number"
                value={wallThicknessMm}
              />
            </label>
          </div>
        </details>
      </div>
    </details>
  );
}
