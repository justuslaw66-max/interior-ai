"use client";

import { useState } from "react";
import type {
  FloorPlanDocumentV2,
  FloorPlanFloorV2,
  FloorPlanOpeningKindV2,
  FloorPlanOpeningOperationV2,
  FloorPlanOpeningV2,
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

const KINDS: FloorPlanOpeningKindV2[] = [
  "door", "window", "open_passage", "gate", "vent", "louvre",
];
const OPERATIONS: FloorPlanOpeningOperationV2[] = [
  "swing", "sliding", "folding", "fixed", "open",
];
const HINGES: FloorPlanOpeningV2["hinge"][] = [
  "start", "end", "none", "unknown",
];
const HANDINGS: FloorPlanOpeningV2["handing"][] = [
  "left", "right", "double", "none", "unknown",
];

function optionalMm(value: number | "") {
  return value === "" ? undefined : value;
}

export default function FloorPlanOpeningAddFields({
  document,
  floor,
  controlClassName,
  subtleClassName,
  disabled,
  onFocusIds,
  onMutate,
}: Props) {
  const [wallId, setWallId] = useState("");
  const [offsetMm, setOffsetMm] = useState(0);
  const [widthMm, setWidthMm] = useState(900);
  const [kind, setKind] = useState<FloorPlanOpeningKindV2>("door");
  const [operation, setOperation] =
    useState<FloorPlanOpeningOperationV2>("swing");
  const [heightMm, setHeightMm] = useState<number | "">("");
  const [sillHeightMm, setSillHeightMm] = useState<number | "">("");
  const [hinge, setHinge] = useState<FloorPlanOpeningV2["hinge"]>("unknown");
  const [handing, setHanding] =
    useState<FloorPlanOpeningV2["handing"]>("unknown");

  const optionalValuesValid =
    (heightMm === "" || (Number.isSafeInteger(heightMm) && heightMm > 0)) &&
    (sillHeightMm === "" ||
      (Number.isSafeInteger(sillHeightMm) && sillHeightMm >= 0));

  return (
    <div className="grid grid-cols-2 gap-2 border-t border-neutral-200 pt-2">
      <label className={`col-span-2 text-[10px] ${subtleClassName}`}>
        Add a missing door, window or passage
        <select
          className={`${controlClassName} mt-1 w-full`}
          value={wallId}
          onChange={(event) => {
            setWallId(event.target.value);
            onFocusIds(event.target.value ? [event.target.value] : []);
          }}
        >
          <option value="">Choose its wall…</option>
          {floor.walls.map((wall) => (
            <option key={wall.id} value={wall.id}>{wall.id}</option>
          ))}
        </select>
      </label>
      {[
        ["Start (mm)", offsetMm, setOffsetMm, false],
        ["Span (mm)", widthMm, setWidthMm, false],
        ["Height (mm, optional)", heightMm, setHeightMm, true],
        ["Sill (mm, optional)", sillHeightMm, setSillHeightMm, true],
      ].map(([label, value, setter, optional]) => (
        <label key={String(label)} className={`text-[10px] ${subtleClassName}`}>
          {String(label)}
          <input
            className={`${controlClassName} mt-1 w-full`}
            min={0}
            step={1}
            type="number"
            value={value as number | ""}
            onChange={(event) =>
              (setter as (next: number | "") => void)(
                optional && event.target.value === "" ? "" : Number(event.target.value)
              )
            }
          />
        </label>
      ))}
      <label className={`text-[10px] ${subtleClassName}`}>
        Kind
        <select className={`${controlClassName} mt-1 w-full`} value={kind}
          onChange={(event) => setKind(event.target.value as FloorPlanOpeningKindV2)}>
          {KINDS.map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}
        </select>
      </label>
      <label className={`text-[10px] ${subtleClassName}`}>
        Operation
        <select className={`${controlClassName} mt-1 w-full`} value={operation}
          onChange={(event) => setOperation(event.target.value as FloorPlanOpeningOperationV2)}>
          {OPERATIONS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className={`text-[10px] ${subtleClassName}`}>
        Hinge
        <select className={`${controlClassName} mt-1 w-full`} value={hinge}
          onChange={(event) => setHinge(event.target.value as FloorPlanOpeningV2["hinge"])}>
          {HINGES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className={`text-[10px] ${subtleClassName}`}>
        Handing
        <select className={`${controlClassName} mt-1 w-full`} value={handing}
          onChange={(event) => setHanding(event.target.value as FloorPlanOpeningV2["handing"])}>
          {HANDINGS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <button
        type="button"
        className={`${controlClassName} col-span-2`}
        disabled={
          disabled || !wallId || !Number.isSafeInteger(offsetMm) ||
          !Number.isSafeInteger(widthMm) || widthMm <= 0 || !optionalValuesValid
        }
        onClick={() => {
          if (onMutate({
            kind: "add_opening",
            floorId: floor.id,
            opening: {
              id: nextFloorPlanReviewEntityId(document, "consumer-opening"),
              wallId, kind, operation, offsetMm, widthMm,
              heightMm: optionalMm(heightMm),
              sillHeightMm: optionalMm(sillHeightMm),
              hinge, handing,
            },
          })) {
            setWallId("");
            onFocusIds([]);
          }
        }}
      >
        Add opening safely
      </button>
    </div>
  );
}
