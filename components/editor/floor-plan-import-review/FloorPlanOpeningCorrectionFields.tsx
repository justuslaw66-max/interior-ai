"use client";

import { useState } from "react";
import type {
  FloorPlanDocumentV2,
  FloorPlanFloorV2,
  FloorPlanOpeningKindV2,
  FloorPlanOpeningOperationV2,
  FloorPlanOpeningV2,
} from "@/lib/floor-plan-document-v2";
import type { FloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutations";
import FloorPlanOpeningAddFields from "./FloorPlanOpeningAddFields";

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
  "door",
  "window",
  "open_passage",
  "gate",
  "vent",
  "louvre",
];
const OPERATIONS: FloorPlanOpeningOperationV2[] = [
  "swing",
  "sliding",
  "folding",
  "fixed",
  "open",
];
const HINGES: FloorPlanOpeningV2["hinge"][] = [
  "start", "end", "none", "unknown",
];
const HANDINGS: FloorPlanOpeningV2["handing"][] = [
  "left", "right", "double", "none", "unknown",
];

const optionalMm = (value: number | "") =>
  value === "" ? undefined : value;

export default function FloorPlanOpeningCorrectionFields({
  document,
  floor,
  controlClassName,
  subtleClassName,
  disabled,
  onFocusIds,
  onMutate,
}: Props) {
  const [openingId, setOpeningId] = useState("");
  const [openingOffset, setOpeningOffset] = useState(0);
  const [openingWidth, setOpeningWidth] = useState(900);
  const [openingKind, setOpeningKind] =
    useState<FloorPlanOpeningKindV2>("door");
  const [openingOperation, setOpeningOperation] =
    useState<FloorPlanOpeningOperationV2>("swing");
  const [heightMm, setHeightMm] = useState<number | "">("");
  const [sillHeightMm, setSillHeightMm] = useState<number | "">("");
  const [hinge, setHinge] =
    useState<FloorPlanOpeningV2["hinge"]>("unknown");
  const [handing, setHanding] =
    useState<FloorPlanOpeningV2["handing"]>("unknown");

  const selectOpening = (id: string) => {
    setOpeningId(id);
    const opening = floor.openings.find((entry) => entry.id === id);
    if (!opening) {
      onFocusIds([]);
      return;
    }
    setOpeningOffset(opening.offsetMm);
    setOpeningWidth(opening.widthMm);
    setOpeningKind(opening.kind);
    setOpeningOperation(opening.operation);
    setHeightMm(opening.heightMm ?? "");
    setSillHeightMm(opening.sillHeightMm ?? "");
    setHinge(opening.hinge);
    setHanding(opening.handing);
    onFocusIds([opening.id, opening.wallId]);
  };

  return (
    <div className="grid gap-3 border-t border-neutral-200 pt-2">
      <div className="grid gap-2">
        <label className={`text-[10px] ${subtleClassName}`}>
          Edit or remove an opening
          <select
            className={`${controlClassName} mt-1 w-full`}
            value={openingId}
            onChange={(event) => selectOpening(event.target.value)}
          >
            <option value="">Choose an opening…</option>
            {floor.openings.map((opening) => (
              <option key={opening.id} value={opening.id}>
                {opening.id} · {opening.kind}
              </option>
            ))}
          </select>
        </label>
        {openingId ? (
          <div className="grid grid-cols-2 gap-2">
            <label className={`text-[10px] ${subtleClassName}`}>
              Start (mm)
              <input
                className={`${controlClassName} mt-1 w-full`}
                min={0}
                step={1}
                type="number"
                value={openingOffset}
                onChange={(event) => setOpeningOffset(Number(event.target.value))}
              />
            </label>
            <label className={`text-[10px] ${subtleClassName}`}>
              Span (mm)
              <input
                className={`${controlClassName} mt-1 w-full`}
                min={1}
                step={1}
                type="number"
                value={openingWidth}
                onChange={(event) => setOpeningWidth(Number(event.target.value))}
              />
            </label>
            <label className={`text-[10px] ${subtleClassName}`}>
              Kind
              <select
                className={`${controlClassName} mt-1 w-full`}
                value={openingKind}
                onChange={(event) =>
                  setOpeningKind(event.target.value as FloorPlanOpeningKindV2)
                }
              >
                {KINDS.map((value) => (
                  <option key={value} value={value}>{value.replace("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className={`text-[10px] ${subtleClassName}`}>
              Operation
              <select
                className={`${controlClassName} mt-1 w-full`}
                value={openingOperation}
                onChange={(event) =>
                  setOpeningOperation(
                    event.target.value as FloorPlanOpeningOperationV2
                  )
                }
              >
                {OPERATIONS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className={`text-[10px] ${subtleClassName}`}>
              Height (mm, optional)
              <input
                className={`${controlClassName} mt-1 w-full`}
                min={0}
                step={1}
                type="number"
                value={heightMm}
                onChange={(event) =>
                  setHeightMm(event.target.value === "" ? "" : Number(event.target.value))
                }
              />
            </label>
            <label className={`text-[10px] ${subtleClassName}`}>
              Sill (mm, optional)
              <input
                className={`${controlClassName} mt-1 w-full`}
                min={0}
                step={1}
                type="number"
                value={sillHeightMm}
                onChange={(event) =>
                  setSillHeightMm(event.target.value === "" ? "" : Number(event.target.value))
                }
              />
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
                disabled ||
                  !Number.isSafeInteger(openingOffset) ||
                  !Number.isSafeInteger(openingWidth) ||
                  (heightMm !== "" &&
                    (!Number.isSafeInteger(heightMm) || heightMm <= 0)) ||
                  (sillHeightMm !== "" &&
                    (!Number.isSafeInteger(sillHeightMm) || sillHeightMm < 0))
              }
              onClick={() =>
                onMutate({
                  kind: "update_opening",
                  floorId: floor.id,
                  openingId,
                  changes: {
                    offsetMm: openingOffset,
                    widthMm: openingWidth,
                    kind: openingKind,
                    operation: openingOperation,
                    heightMm: optionalMm(heightMm),
                    sillHeightMm: optionalMm(sillHeightMm),
                    hinge,
                    handing,
                  },
                })
              }
            >
              Update opening safely
            </button>
            <button
              type="button"
              className={`${controlClassName} col-span-2 text-red-700`}
              disabled={disabled}
              onClick={() => {
                if (
                  onMutate({
                    kind: "remove_opening",
                    floorId: floor.id,
                    openingId,
                  })
                ) {
                  setOpeningId("");
                  onFocusIds([]);
                }
              }}
            >
              Remove this opening
            </button>
          </div>
        ) : null}
      </div>

      <FloorPlanOpeningAddFields
        document={document}
        floor={floor}
        controlClassName={controlClassName}
        subtleClassName={subtleClassName}
        disabled={disabled}
        onFocusIds={onFocusIds}
        onMutate={onMutate}
      />
    </div>
  );
}
