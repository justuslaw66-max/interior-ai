"use client";

import { useEffect, useMemo, useState } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type {
  FloorPlanSourceObservation,
  FloorPlanSourceObservationManifest,
} from "@/lib/floor-plan-imports/source-observation-manifest";

type Page = { pageNumber: number; widthPx: number; heightPx: number };
type Kind = FloorPlanSourceObservation["kind"];
type DraftAnchor = { role: FloorPlanSourceObservation["anchorsPx"][number]["role"]; xPx: string; yPx: string };
type DraftObservation = {
  id: string;
  kind: Kind;
  floorId: string;
  canonicalEntityId: string;
  pageNumber: string;
  crop: { xPx: string; yPx: string; widthPx: string; heightPx: string };
  anchors: DraftAnchor[];
  observedText: string;
  measuredMm: string;
  reviewerNote: string;
};

type Completeness = {
  passed: boolean;
  observationCount: number;
  canonicalTargetCount: number;
  issues: Array<{ code: string; message: string; canonicalEntityId?: string }>;
};

const KINDS: Kind[] = ["wall", "opening", "structure", "label", "dimension"];
const ANCHOR_ROLES: DraftAnchor["role"][] = ["start", "midpoint", "end", "center", "label"];

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `observation-${Date.now()}-${Math.random()}`;
}

function blankObservation(page?: Page): DraftObservation {
  return {
    id: id(), kind: "wall", floorId: "", canonicalEntityId: "",
    pageNumber: String(page?.pageNumber ?? 1),
    crop: { xPx: "", yPx: "", widthPx: "", heightPx: "" },
    anchors: [
      { role: "start", xPx: "", yPx: "" },
      { role: "end", xPx: "", yPx: "" },
    ],
    observedText: "", measuredMm: "", reviewerNote: "",
  };
}

function draftFromObservation(observation: FloorPlanSourceObservation): DraftObservation {
  return {
    id: observation.id,
    kind: observation.kind,
    floorId: observation.floorId,
    canonicalEntityId: observation.canonicalEntityId,
    pageNumber: String(observation.pageNumber),
    crop: Object.fromEntries(
      Object.entries(observation.cropPx).map(([key, value]) => [key, String(value)])
    ) as DraftObservation["crop"],
    anchors: observation.anchorsPx.map((anchor) => ({
      role: anchor.role, xPx: String(anchor.xPx), yPx: String(anchor.yPx),
    })),
    observedText: observation.observedText ?? "",
    measuredMm: observation.measuredMm === undefined ? "" : String(observation.measuredMm),
    reviewerNote: observation.reviewerNote ?? "",
  };
}

function storedManifest(value: unknown): FloorPlanSourceObservationManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<FloorPlanSourceObservationManifest>;
  return candidate.schemaVersion === 1 && Array.isArray(candidate.observations)
    ? candidate as FloorPlanSourceObservationManifest
    : null;
}

function number(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number`);
  return parsed;
}

function targetOptions(document: FloorPlanDocumentV2 | null) {
  if (!document) return [];
  return document.floors.flatMap((floor) => [
    ...floor.walls.map((entity) => ({ kind: "wall" as const, floorId: floor.id, entityId: entity.id, label: `${floor.name} · wall ${entity.id}` })),
    ...floor.openings.map((entity) => ({ kind: "opening" as const, floorId: floor.id, entityId: entity.id, label: `${floor.name} · ${entity.kind} ${entity.id}` })),
    ...floor.structures.map((entity) => ({ kind: "structure" as const, floorId: floor.id, entityId: entity.id, label: `${floor.name} · ${entity.name}` })),
    ...floor.rooms.map((entity) => ({ kind: "label" as const, floorId: floor.id, entityId: entity.id, label: `${floor.name} · room label for ${entity.name}` })),
    ...floor.annotations.map((entity) => ({ kind: "label" as const, floorId: floor.id, entityId: entity.id, label: `${floor.name} · annotation “${entity.text}”` })),
    ...floor.dimensions.map((entity) => ({ kind: "dimension" as const, floorId: floor.id, entityId: entity.id, label: `${floor.name} · ${entity.measuredMm} mm (${entity.id})` })),
  ]);
}

export function SourceObservationManifestEditor(props: {
  jobId: string;
  candidateVersion: number;
  sourceObservationVersion: number;
  storedManifest: unknown;
  document: FloorPlanDocumentV2 | null;
  pages: Page[];
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const [rightsStatus, setRightsStatus] = useState("");
  const [rightsBasis, setRightsBasis] = useState("");
  const [rightsReference, setRightsReference] = useState("");
  const [sourceRedistribution, setSourceRedistribution] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [observations, setObservations] = useState<DraftObservation[]>([]);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [completeness, setCompleteness] = useState<Completeness | null>(null);
  const targets = useMemo(() => targetOptions(props.document), [props.document]);

  useEffect(() => {
    const manifest = storedManifest(props.storedManifest);
    setRightsStatus(manifest?.rightsEvidence.status ?? "");
    setRightsBasis(manifest?.rightsEvidence.basis ?? "");
    setRightsReference(manifest?.rightsEvidence.evidenceReference ?? "");
    setSourceRedistribution(manifest?.rightsEvidence.sourceAssetRedistributionAllowed ?? false);
    setExpiresAt(manifest?.rightsEvidence.expiresAt?.slice(0, 10) ?? "");
    setReviewerNotes(manifest?.reviewerNotes ?? "");
    setObservations(manifest?.observations.map(draftFromObservation) ?? []);
    setCompleteness(null);
    setFeedback(null);
  }, [props.sourceObservationVersion, props.storedManifest]);

  const update = (index: number, change: (draft: DraftObservation) => DraftObservation) =>
    setObservations((current) => current.map((entry, entryIndex) => entryIndex === index ? change(entry) : entry));

  const save = async () => {
    setPending(true);
    setFeedback(null);
    try {
      const manifest = {
        schemaVersion: 1,
        rightsEvidence: {
          status: rightsStatus,
          basis: rightsBasis.trim(),
          evidenceReference: rightsReference.trim(),
          permitsDerivedFloorPlanPublication: true,
          sourceAssetRedistributionAllowed: sourceRedistribution,
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59.999Z`).toISOString() : null,
        },
        reviewerNotes: reviewerNotes.trim(),
        observations: observations.map((observation, index) => ({
          id: observation.id,
          kind: observation.kind,
          floorId: observation.floorId,
          canonicalEntityId: observation.canonicalEntityId,
          pageNumber: number(observation.pageNumber, `Observation ${index + 1} page`),
          cropPx: {
            xPx: number(observation.crop.xPx, `Observation ${index + 1} crop X`),
            yPx: number(observation.crop.yPx, `Observation ${index + 1} crop Y`),
            widthPx: number(observation.crop.widthPx, `Observation ${index + 1} crop width`),
            heightPx: number(observation.crop.heightPx, `Observation ${index + 1} crop height`),
          },
          anchorsPx: observation.anchors.map((anchor) => ({
            role: anchor.role,
            xPx: number(anchor.xPx, `Observation ${index + 1} anchor X`),
            yPx: number(anchor.yPx, `Observation ${index + 1} anchor Y`),
          })),
          ...(observation.observedText.trim() ? { observedText: observation.observedText.trim() } : {}),
          ...(observation.measuredMm.trim() ? { measuredMm: number(observation.measuredMm, `Observation ${index + 1} dimension`) } : {}),
          ...(observation.reviewerNote.trim() ? { reviewerNote: observation.reviewerNote.trim() } : {}),
        })),
      };
      const response = await fetch(`/api/admin/floor-plan-imports/${props.jobId}/source-observations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateVersion: props.candidateVersion,
          sourceObservationVersion: props.sourceObservationVersion,
          manifest,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; completeness?: Completeness } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Unable to save source observations");
      setCompleteness(payload?.completeness ?? null);
      setFeedback(payload?.completeness?.passed
        ? "Independent source observations cover every canonical critical entity."
        : "Draft saved. Unmapped canonical entities still block approval.");
      await props.onSaved();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Unable to save source observations");
    } finally {
      setPending(false);
    }
  };

  return <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
    <h3 className="text-sm font-semibold">Independent source observation manifest</h3>
    <p className="mt-1 text-xs leading-5 text-neutral-600">Record what you can see on the source before approval. Nothing is copied from extracted geometry automatically; each observed element must be mapped manually to exactly one canonical entity.</p>
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <label className="text-xs font-medium">Rights status<select className="mt-1 w-full rounded border bg-white p-2 text-sm" onChange={(event) => setRightsStatus(event.target.value)} value={rightsStatus}><option value="">Select…</option><option value="licensed">Licensed</option><option value="permission_confirmed">Permission confirmed</option><option value="public_domain">Public domain</option></select></label>
      <label className="text-xs font-medium">Rights evidence reference<input className="mt-1 w-full rounded border bg-white p-2 text-sm" onChange={(event) => setRightsReference(event.target.value)} placeholder="Licence record, permission ID, or authoritative URL" value={rightsReference} /></label>
      <label className="text-xs font-medium md:col-span-2">Rights basis<textarea className="mt-1 min-h-20 w-full rounded border bg-white p-2 text-sm" onChange={(event) => setRightsBasis(event.target.value)} placeholder="Explain why derived geometry may be published." value={rightsBasis} /></label>
      <label className="text-xs font-medium">Rights expiry (optional)<input className="mt-1 w-full rounded border bg-white p-2 text-sm" onChange={(event) => setExpiresAt(event.target.value)} type="date" value={expiresAt} /></label>
      <label className="flex items-center gap-2 self-end rounded border bg-white p-2 text-xs"><input checked={sourceRedistribution} onChange={(event) => setSourceRedistribution(event.target.checked)} type="checkbox" />Source file itself may be redistributed publicly</label>
      <label className="text-xs font-medium md:col-span-2">Reviewer completeness notes<textarea className="mt-1 min-h-20 w-full rounded border bg-white p-2 text-sm" onChange={(event) => setReviewerNotes(event.target.value)} value={reviewerNotes} /></label>
    </div>
    <div className="mt-5 flex items-center justify-between gap-3"><div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Observed elements ({observations.length})</div><button className="rounded border bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40" disabled={props.disabled || pending} onClick={() => setObservations((current) => [...current, blankObservation(props.pages[0])])} type="button">Add observed element</button></div>
    <div className="mt-3 space-y-3">{observations.map((observation, index) => {
      const compatibleTargets = targets.filter((target) => target.kind === observation.kind);
      return <details className="rounded-lg border bg-white p-3" key={observation.id} open={observations.length < 8}><summary className="cursor-pointer text-xs font-medium">{index + 1}. {observation.kind} → {observation.canonicalEntityId || "unmapped"}</summary>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <label className="text-[11px] font-medium">Observed kind<select className="mt-1 w-full rounded border p-2 text-xs" onChange={(event) => update(index, (draft) => ({ ...draft, kind: event.target.value as Kind, floorId: "", canonicalEntityId: "" }))} value={observation.kind}>{KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
          <label className="text-[11px] font-medium md:col-span-2">Manual canonical mapping<select className="mt-1 w-full rounded border p-2 text-xs" onChange={(event) => { const target = compatibleTargets.find((item) => `${item.floorId}:${item.entityId}` === event.target.value); update(index, (draft) => ({ ...draft, floorId: target?.floorId ?? "", canonicalEntityId: target?.entityId ?? "" })); }} value={observation.floorId && observation.canonicalEntityId ? `${observation.floorId}:${observation.canonicalEntityId}` : ""}><option value="">Choose after inspecting source…</option>{compatibleTargets.map((target) => <option key={`${target.floorId}:${target.entityId}`} value={`${target.floorId}:${target.entityId}`}>{target.label}</option>)}</select></label>
          <label className="text-[11px] font-medium">Page<select className="mt-1 w-full rounded border p-2 text-xs" onChange={(event) => update(index, (draft) => ({ ...draft, pageNumber: event.target.value }))} value={observation.pageNumber}>{props.pages.map((page) => <option key={page.pageNumber} value={page.pageNumber}>{page.pageNumber}</option>)}</select></label>
          <label className="text-[11px] font-medium">Visible text<input className="mt-1 w-full rounded border p-2 text-xs" onChange={(event) => update(index, (draft) => ({ ...draft, observedText: event.target.value }))} value={observation.observedText} /></label>
          <label className="text-[11px] font-medium">Printed mm<input className="mt-1 w-full rounded border p-2 text-xs" min="1" onChange={(event) => update(index, (draft) => ({ ...draft, measuredMm: event.target.value }))} type="number" value={observation.measuredMm} /></label>
          {(["xPx", "yPx", "widthPx", "heightPx"] as const).map((field) => <label className="text-[11px] font-medium" key={field}>Crop {field}<input className="mt-1 w-full rounded border p-2 text-xs" min="0" onChange={(event) => update(index, (draft) => ({ ...draft, crop: { ...draft.crop, [field]: event.target.value } }))} type="number" value={observation.crop[field]} /></label>)}
        </div>
        <div className="mt-3 space-y-2">{observation.anchors.map((anchor, anchorIndex) => <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2" key={`${observation.id}-anchor-${anchorIndex}`}><select className="rounded border p-2 text-xs" onChange={(event) => update(index, (draft) => ({ ...draft, anchors: draft.anchors.map((item, itemIndex) => itemIndex === anchorIndex ? { ...item, role: event.target.value as DraftAnchor["role"] } : item) }))} value={anchor.role}>{ANCHOR_ROLES.map((role) => <option key={role}>{role}</option>)}</select><input className="rounded border p-2 text-xs" onChange={(event) => update(index, (draft) => ({ ...draft, anchors: draft.anchors.map((item, itemIndex) => itemIndex === anchorIndex ? { ...item, xPx: event.target.value } : item) }))} placeholder="anchor x px" type="number" value={anchor.xPx} /><input className="rounded border p-2 text-xs" onChange={(event) => update(index, (draft) => ({ ...draft, anchors: draft.anchors.map((item, itemIndex) => itemIndex === anchorIndex ? { ...item, yPx: event.target.value } : item) }))} placeholder="anchor y px" type="number" value={anchor.yPx} /><button className="text-xs text-red-700" onClick={() => update(index, (draft) => ({ ...draft, anchors: draft.anchors.filter((_, itemIndex) => itemIndex !== anchorIndex) }))} type="button">Remove</button></div>)}</div>
        <div className="mt-3 flex gap-3"><button className="text-xs font-medium text-blue-700" onClick={() => update(index, (draft) => ({ ...draft, anchors: [...draft.anchors, { role: "center", xPx: "", yPx: "" }] }))} type="button">Add anchor</button><button className="text-xs font-medium text-red-700" onClick={() => setObservations((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button">Remove observation</button></div>
      </details>;
    })}</div>
    {completeness && !completeness.passed ? <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><div>{completeness.observationCount}/{completeness.canonicalTargetCount} mappings recorded.</div><ul className="mt-2 max-h-40 list-disc overflow-auto pl-5">{completeness.issues.slice(0, 100).map((issue, index) => <li key={`${issue.code}-${issue.canonicalEntityId}-${index}`}>{issue.code}: {issue.message}{issue.canonicalEntityId ? ` (${issue.canonicalEntityId})` : ""}</li>)}</ul></div> : null}
    {feedback ? <div className="mt-3 text-xs text-neutral-700" role="status">{feedback}</div> : null}
    <button className="mt-4 rounded bg-violet-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40" disabled={props.disabled || pending || observations.length === 0} onClick={() => void save()} type="button">{pending ? "Saving observations…" : "Save independent observations"}</button>
  </section>;
}
