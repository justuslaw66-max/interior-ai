"use client";

import { useState } from "react";
import type {
  FloorPlanDocumentV2,
  FloorPlanFloorV2,
  FloorPlanStructureKindV2,
} from "@/lib/floor-plan-document-v2";
import {
  buildStructureRectangleVertices,
  getStructureRectangleBounds,
  nextFloorPlanReviewEntityId,
} from "@/lib/floor-plan-review-structure-rectangle";
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

const KINDS: FloorPlanStructureKindV2[] = [
  "column",
  "shaft",
  "ledge",
  "service_strip",
  "void",
  "structural_core",
  "other",
];

const DEFAULTS = {
  name: "Column",
  kind: "column" as FloorPlanStructureKindV2,
  xMm: 0,
  zMm: 0,
  widthMm: 600,
  depthMm: 600,
  baseOffsetMm: 0,
  heightMm: 2600,
  locked: true,
};

export default function FloorPlanStructureCorrectionFields({
  document,
  floor,
  controlClassName,
  subtleClassName,
  disabled,
  onFocusIds,
  onMutate,
}: Props) {
  const [structureId, setStructureId] = useState("");
  const [name, setName] = useState(DEFAULTS.name);
  const [kind, setKind] = useState(DEFAULTS.kind);
  const [xMm, setXMm] = useState(DEFAULTS.xMm);
  const [zMm, setZMm] = useState(DEFAULTS.zMm);
  const [widthMm, setWidthMm] = useState(DEFAULTS.widthMm);
  const [depthMm, setDepthMm] = useState(DEFAULTS.depthMm);
  const [baseOffsetMm, setBaseOffsetMm] = useState(DEFAULTS.baseOffsetMm);
  const [heightMm, setHeightMm] = useState(DEFAULTS.heightMm);
  const [locked, setLocked] = useState(DEFAULTS.locked);

  const reset = () => {
    setStructureId("");
    setName(DEFAULTS.name);
    setKind(DEFAULTS.kind);
    setXMm(DEFAULTS.xMm);
    setZMm(DEFAULTS.zMm);
    setWidthMm(DEFAULTS.widthMm);
    setDepthMm(DEFAULTS.depthMm);
    setBaseOffsetMm(DEFAULTS.baseOffsetMm);
    setHeightMm(DEFAULTS.heightMm);
    setLocked(DEFAULTS.locked);
    onFocusIds([]);
  };

  const selectStructure = (id: string) => {
    setStructureId(id);
    const structure = floor.structures.find((item) => item.id === id);
    if (!structure) return reset();
    const bounds = getStructureRectangleBounds(floor, structure);
    setName(structure.name);
    setKind(structure.kind);
    setBaseOffsetMm(structure.baseOffsetMm);
    setHeightMm(structure.heightMm);
    setLocked(structure.locked);
    if (bounds) {
      setXMm(bounds.xMm);
      setZMm(bounds.zMm);
      setWidthMm(bounds.widthMm);
      setDepthMm(bounds.depthMm);
    } else {
      setXMm(0);
      setZMm(0);
      setWidthMm(0);
      setDepthMm(0);
    }
    onFocusIds([structure.id, ...structure.vertexIds]);
  };

  const boundsAreValid =
    [xMm, zMm, widthMm, depthMm, baseOffsetMm, heightMm].every(
      Number.isSafeInteger
    ) &&
    widthMm > 0 &&
    depthMm > 0 &&
    baseOffsetMm >= 0 &&
    heightMm > 0 &&
    name.trim().length > 0;

  const save = () => {
    const id =
      structureId || nextFloorPlanReviewEntityId(document, "consumer-structure");
    const shapePrefix = nextFloorPlanReviewEntityId(
      document,
      `${id}-shape`
    );
    const shape = buildStructureRectangleVertices({
      document,
      floor,
      bounds: { xMm, zMm, widthMm, depthMm },
      idPrefix: shapePrefix,
    });
    const common = {
      name: name.trim(),
      kind,
      vertexIds: shape.vertexIds,
      baseOffsetMm,
      heightMm,
      locked,
    };
    const operation: FloorPlanTopologyMutationV2 = structureId
      ? {
          kind: "update_structure",
          floorId: floor.id,
          structureId,
          changes: common,
          vertices: shape.vertices,
        }
      : {
          kind: "add_structure",
          floorId: floor.id,
          structure: { id, ...common },
          vertices: shape.vertices,
        };
    if (onMutate(operation) && !structureId) reset();
  };

  return (
    <div className="grid gap-2 border-t border-neutral-200 pt-2">
      <label className={`text-[10px] ${subtleClassName}`}>
        Add or edit a structural rectangle
        <select
          className={`${controlClassName} mt-1 w-full`}
          value={structureId}
          onChange={(event) => selectStructure(event.target.value)}
        >
          <option value="">New missing structure…</option>
          {floor.structures.map((structure) => (
            <option key={structure.id} value={structure.id}>
              {structure.name} · {structure.kind.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={`text-[10px] ${subtleClassName}`}>
          Name
          <input
            className={`${controlClassName} mt-1 w-full`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className={`text-[10px] ${subtleClassName}`}>
          Type
          <select
            className={`${controlClassName} mt-1 w-full`}
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as FloorPlanStructureKindV2)
            }
          >
            {KINDS.map((value) => (
              <option key={value} value={value}>{value.replace("_", " ")}</option>
            ))}
          </select>
        </label>
        {[
          ["Left X (mm)", xMm, setXMm],
          ["Top Z (mm)", zMm, setZMm],
          ["Width (mm)", widthMm, setWidthMm],
          ["Depth (mm)", depthMm, setDepthMm],
          ["Base (mm)", baseOffsetMm, setBaseOffsetMm],
          ["Height (mm)", heightMm, setHeightMm],
        ].map(([label, value, setter]) => (
          <label key={String(label)} className={`text-[10px] ${subtleClassName}`}>
            {String(label)}
            <input
              className={`${controlClassName} mt-1 w-full`}
              step={1}
              type="number"
              value={value as number}
              onChange={(event) =>
                (setter as (next: number) => void)(Number(event.target.value))
              }
            />
          </label>
        ))}
        <label className={`col-span-2 flex items-center gap-2 text-[10px] ${subtleClassName}`}>
          <input
            type="checkbox"
            checked={locked}
            onChange={(event) => setLocked(event.target.checked)}
          />
          Lock this structural element against casual editor moves
        </label>
        <button
          type="button"
          className={`${controlClassName} col-span-2`}
          disabled={disabled || !boundsAreValid}
          onClick={save}
        >
          {structureId ? "Update structure safely" : "Add structure safely"}
        </button>
        {structureId ? (
          <button
            type="button"
            className={`${controlClassName} col-span-2 text-red-700`}
            disabled={disabled}
            onClick={() => {
              if (
                onMutate({
                  kind: "remove_structure",
                  floorId: floor.id,
                  structureId,
                })
              ) {
                reset();
              }
            }}
          >
            Remove this structure
          </button>
        ) : null}
      </div>
      <p className={`text-[10px] ${subtleClassName}`}>
        Rectangles reuse matching plan vertices. Replaced vertices are removed
        only when no wall, annotation, dimension, or structure still uses them.
      </p>
    </div>
  );
}
