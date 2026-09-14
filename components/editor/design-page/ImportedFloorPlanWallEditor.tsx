"use client";

import { useState } from "react";
import type { FloorPlanWallClassificationV2 } from "@/lib/floor-plan-document-v2";
import { CONSUMER_WALL_EDIT_CONFIRMATION_COPY, selectConsumerWallGeometry } from "@/lib/floor-plan-consumer-wall-edit";
import { CanonicalPlanRemodelTools } from "@/components/editor/design-page/CanonicalPlanRemodelTools";
import { CanonicalPlanVectorExport } from "@/components/editor/design-page/CanonicalPlanVectorExport";
import { ImportedFloorPlanReviewStatus } from "./ImportedFloorPlanReviewStatus";
import type { CanonicalPlanVectorExportSource } from "./useCanonicalPlanVectorExport";
import type {
  ImportedWallEditingActions,
  ImportedWallEditingState,
} from "@/lib/useDesignPageImportedWallEditingController";

const CLASSIFICATIONS: FloorPlanWallClassificationV2[] = [
  "exterior",
  "interior",
  "party",
  "partition",
  "structural",
];

export type ImportedFloorPlanWallEditorProps = {
  state: ImportedWallEditingState;
  configuration: { dark: boolean; vectorExport?: CanonicalPlanVectorExportSource };
  actions: ImportedWallEditingActions;
};

export function ImportedFloorPlanWallEditor({
  state,
  configuration,
  actions,
}: ImportedFloorPlanWallEditorProps) {
  const document = state.document;
  const { floorId, wallId } = state.selection;
  const setFloorId = (id: string) => actions.selectWall(id, document?.floors.find((floor) => floor.id === id)?.walls[0]?.id ?? "");
  const setWallId = (id: string) => actions.selectWall(floorId, id);
  const [deltaXMm, setDeltaXMm] = useState(0);
  const [deltaZMm, setDeltaZMm] = useState(0);
  const [vertexId, setVertexId] = useState("");
  const { floor, wall, wallLengthMm } = selectConsumerWallGeometry(document, floorId, wallId);
  const selectionKey =
    document && floor && wall
      ? `${document.id}:${document.revisionId}:${floor.id}:${wall.id}`
      : "none";
  const defaultWallDraft = {
    key: selectionKey,
    thicknessMm: wall?.thicknessMm ?? 200,
    classification: wall?.classification ?? ("interior" as const),
    splitOffsetMm: wallLengthMm ? Math.round(wallLengthMm / 2) : 0,
  };
  const [wallDraft, setWallDraft] = useState(defaultWallDraft);
  const currentWallDraft =
    wallDraft.key === selectionKey ? wallDraft : defaultWallDraft;
  const { thicknessMm, classification, splitOffsetMm } = currentWallDraft;
  const endpointIds = wall
    ? [wall.path.startVertexId, wall.path.endVertexId]
    : [];
  const selectedVertexId = endpointIds.includes(vertexId)
    ? vertexId
    : endpointIds[0] ?? "";
  const vertex =
    floor?.vertices.find((candidate) => candidate.id === selectedVertexId) ?? null;
  const vertexKey = `${selectionKey}:${selectedVertexId}`;
  const defaultVertexDraft = {
    key: vertexKey,
    xMm: vertex?.xMm ?? 0,
    zMm: vertex?.zMm ?? 0,
  };
  const [vertexDraft, setVertexDraft] = useState(defaultVertexDraft);
  const currentVertexDraft =
    vertexDraft.key === vertexKey ? vertexDraft : defaultVertexDraft;
  const vertexX = currentVertexDraft.xMm;
  const vertexZ = currentVertexDraft.zMm;

  if (!state.available || !document || !floor || !wall) return null;

  const dark = configuration.dark;
  const shell = dark
    ? "designer-work-surface rounded-lg border p-3 text-xs"
    : "rounded-lg border border-neutral-200 bg-white/95 p-3 text-xs text-neutral-800 shadow-lg backdrop-blur";
  const control = dark
    ? "designer-control rounded-md border px-2 py-1.5"
    : "rounded-md border border-neutral-300 bg-white px-2 py-1.5";
  const secondaryButton = dark
    ? "designer-work-control rounded-md px-2.5 py-1.5 font-semibold"
    : "rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 font-semibold hover:bg-neutral-50";
  const primaryButton = dark
    ? "designer-work-control-active rounded-md px-2.5 py-1.5 font-semibold disabled:opacity-40"
    : "rounded-md bg-neutral-950 px-2.5 py-1.5 font-semibold text-white hover:bg-neutral-800 disabled:opacity-40";
  const subtle = dark ? "text-neutral-400" : "text-neutral-500";
  const straightWall = wall.path.kind === "line";
  const updateChanged =
    thicknessMm !== wall.thicknessMm || classification !== wall.classification;
  const vertexChanged = Boolean(
    vertex && (vertexX !== vertex.xMm || vertexZ !== vertex.zMm)
  );

  return (
    <section data-testid="imported-wall-editor" className={shell}>
      <ImportedFloorPlanReviewStatus document={document} isLocalFork={state.isLocalFork} editingEnabled={state.editingEnabled} subtle={subtle} />

      {!state.editingEnabled ? (
        <div className="mt-3">
          <p className={subtle}>
            Walls stay locked until you explicitly choose to edit a local copy.
          </p>
          {state.confirmationPending ? (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-950">
              <p>{CONSUMER_WALL_EDIT_CONFIRMATION_COPY}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className={secondaryButton} onClick={actions.cancelEditingRequest}>
                  Keep locked
                </button>
                <button
                  type="button"
                  data-testid="confirm-edit-local-floor-plan"
                  className={primaryButton}
                  onClick={actions.confirmEditing}
                >
                  Edit local copy
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              data-testid="request-edit-imported-walls"
              className={`${secondaryButton} mt-2 w-full`}
              onClick={actions.requestEditing}
            >
              {state.isLocalFork ? "Continue editing local copy" : "Edit imported walls"}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-900">
            {state.isLocalFork
              ? "Changes save to this design’s local copy. The source plan is unchanged."
              : "Your first accepted change creates a local Needs review copy."}
          </div>
          {document.floors.length > 1 ? (
            <label className={subtle}>
              Floor
              <select className={`${control} mt-1 w-full`} value={floor.id} onChange={(event) => {
                setFloorId(event.target.value);
                setWallId("");
                setVertexId("");
                setDeltaXMm(0);
                setDeltaZMm(0);
              }}>
                {document.floors.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className={subtle}>
            Wall
            <select aria-label="Wall" className={`${control} mt-1 w-full`} value={wall.id} onChange={(event) => {
              setWallId(event.target.value);
              setVertexId("");
              setDeltaXMm(0);
              setDeltaZMm(0);
            }}>
              {floor.walls.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.id} · {candidate.classification} · {candidate.path.kind}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Move X (mm)" value={deltaXMm} className={control} subtle={subtle} onChange={setDeltaXMm} />
            <NumberField label="Move Z (mm)" value={deltaZMm} className={control} subtle={subtle} onChange={setDeltaZMm} />
            <button
              type="button"
              className={`${secondaryButton} col-span-2`}
              disabled={!straightWall || (deltaXMm === 0 && deltaZMm === 0) || !Number.isSafeInteger(deltaXMm) || !Number.isSafeInteger(deltaZMm)}
              onClick={() => {
                if (actions.moveWall({ floorId: floor.id, wallId: wall.id, deltaXMm, deltaZMm })) {
                  setDeltaXMm(0);
                  setDeltaZMm(0);
                }
              }}
            >
              Move wall
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-neutral-200 pt-3">
            <NumberField label="Thickness (mm)" value={thicknessMm} min={1} className={control} subtle={subtle} onChange={(value) => setWallDraft({ ...currentWallDraft, thicknessMm: value })} />
            <label className={subtle}>
              Classification
              <select className={`${control} mt-1 w-full`} value={classification} onChange={(event) => setWallDraft({ ...currentWallDraft, classification: event.target.value as FloorPlanWallClassificationV2 })}>
                {CLASSIFICATIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <button type="button" className={`${secondaryButton} col-span-2`} disabled={!updateChanged || !Number.isSafeInteger(thicknessMm) || thicknessMm < 1} onClick={() => actions.updateWall({ floorId: floor.id, wallId: wall.id, thicknessMm, classification })}>
              Update wall type
            </button>
          </div>

          <div className="grid gap-2 border-t border-neutral-200 pt-3">
            <NumberField label={`Split position (mm${wallLengthMm ? ` of ${Math.round(wallLengthMm)}` : ""})`} value={splitOffsetMm} min={1} className={control} subtle={subtle} onChange={(value) => setWallDraft({ ...currentWallDraft, splitOffsetMm: value })} />
            <button type="button" className={secondaryButton} disabled={!straightWall || !Number.isSafeInteger(splitOffsetMm) || splitOffsetMm <= 0 || (wallLengthMm !== null && splitOffsetMm >= wallLengthMm)} onClick={() => actions.splitWall({ floorId: floor.id, wallId: wall.id, offsetMm: splitOffsetMm })}>
              Split wall
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-neutral-200 pt-3">
            <label className={`${subtle} col-span-2`}>
              Endpoint
              <select className={`${control} mt-1 w-full`} value={selectedVertexId} onChange={(event) => setVertexId(event.target.value)}>
                {endpointIds.map((id, index) => <option key={id} value={id}>{index === 0 ? "Start" : "End"} · {id}</option>)}
              </select>
            </label>
            <NumberField label="Endpoint X" value={vertexX} className={control} subtle={subtle} onChange={(value) => setVertexDraft({ ...currentVertexDraft, xMm: value })} />
            <NumberField label="Endpoint Z" value={vertexZ} className={control} subtle={subtle} onChange={(value) => setVertexDraft({ ...currentVertexDraft, zMm: value })} />
            <button type="button" className={`${secondaryButton} col-span-2`} disabled={!straightWall || !vertex || !vertexChanged || !Number.isSafeInteger(vertexX) || !Number.isSafeInteger(vertexZ)} onClick={() => actions.moveVertex({ floorId: floor.id, vertexId: selectedVertexId, xMm: vertexX, zMm: vertexZ })}>
              Move endpoint
            </button>
          </div>
          {!straightWall ? <p className="text-[10px] text-amber-700">Arc geometry is review-only here. Wall type and thickness remain editable.</p> : null}
          <CanonicalPlanRemodelTools floor={floor} wall={wall} commit={actions.applyProposalMutation} proposal={state.proposal} recover={actions.recoverLayout} />
          {state.proposal?.reviewIssues.map((issue) => <p key={issue} className="text-amber-700">{issue}</p>)}
          <button type="button" className={secondaryButton} onClick={actions.stopEditing}>Stop editing walls</button>
        </div>
      )}
      <CanonicalPlanVectorExport document={document} floorId={floor.id} original={state.proposal?.originalDocument} {...configuration.vectorExport} />
    </section>
  );
}

function NumberField({ label, value, min, className, subtle, onChange }: {
  label: string;
  value: number;
  min?: number;
  className: string;
  subtle: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={subtle}>
      {label}
      <input className={`${className} mt-1 w-full`} type="number" step={1} min={min} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
