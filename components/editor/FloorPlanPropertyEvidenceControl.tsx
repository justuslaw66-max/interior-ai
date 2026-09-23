"use client";

import { useState } from "react";
import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import {
  floorPlanPropertyEvidenceIsEditable,
  floorPlanPropertyEvidenceLabel,
  type FloorPlanConsumerMeasurementEvidenceV2,
} from "@/lib/floor-plan-measured-property-mutations";

type FloorPlanPropertyEvidenceControlProps = {
  evidence: FloorPlanPropertyEvidenceV2 | null | undefined;
  dark?: boolean;
  disabled?: boolean;
  onConfirm?: (
    evidence: FloorPlanConsumerMeasurementEvidenceV2,
    note?: string
  ) => void;
  testId: string;
  assumedLabel?: string;
  assumedHelpText?: string;
};

function EvidenceStatus({
  evidence, dark, testId, assumedLabel, assumedHelpText,
}: Pick<FloorPlanPropertyEvidenceControlProps, "testId" | "assumedLabel" | "assumedHelpText"> & {
  evidence: FloorPlanPropertyEvidenceV2;
  dark: boolean;
}) {
  const editable = floorPlanPropertyEvidenceIsEditable(evidence);
  const badgeClass = evidence === "assumed"
    ? dark ? "bg-amber-400/15 text-amber-200" : "bg-amber-100 text-amber-800"
    : evidence === "site_measured"
      ? dark ? "bg-emerald-400/15 text-emerald-200" : "bg-emerald-100 text-emerald-800"
      : dark ? "bg-blue-400/15 text-blue-200" : "bg-blue-100 text-blue-800";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`} data-testid={`${testId}-badge`}>
        {evidence === "assumed" && assumedLabel ? assumedLabel : floorPlanPropertyEvidenceLabel(evidence)}
      </span>
      {evidence === "assumed" ? (
        <span className={dark ? "text-[10px] text-amber-200" : "text-[10px] text-amber-700"}>
          {assumedHelpText ?? "Not read from the source drawing."}
        </span>
      ) : null}
      {!editable ? (
        <span className={dark ? "text-[10px] text-neutral-400" : "text-[10px] text-neutral-500"}>
          Locked; use reviewed override workflow to replace it.
        </span>
      ) : null}
    </div>
  );
}

function EvidenceConfirmation({
  selectedEvidence, setSelectedEvidence, measurementNote, setMeasurementNote,
  controlClass, dark, disabled, onConfirm,
}: {
  selectedEvidence: FloorPlanConsumerMeasurementEvidenceV2;
  setSelectedEvidence: (value: FloorPlanConsumerMeasurementEvidenceV2) => void;
  measurementNote: string;
  setMeasurementNote: (value: string) => void;
  controlClass: string;
  dark: boolean;
  disabled: boolean;
  onConfirm: NonNullable<FloorPlanPropertyEvidenceControlProps["onConfirm"]>;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1.5">
        <select aria-label="Measurement evidence" className={`${controlClass} min-w-0 flex-1`} disabled={disabled}
          value={selectedEvidence} onChange={(event) => setSelectedEvidence(event.currentTarget.value as FloorPlanConsumerMeasurementEvidenceV2)}>
          <option value="user_confirmed">I confirm this value</option>
          <option value="site_measured">Measured on site</option>
        </select>
        <button type="button" className={dark
          ? "designer-work-control rounded-md px-2 py-1 text-[10px] font-semibold disabled:opacity-40"
          : "rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-700 disabled:opacity-40"}
          disabled={disabled || (selectedEvidence === "site_measured" && measurementNote.trim().length < 4)}
          onClick={() => onConfirm(selectedEvidence, measurementNote.trim() || undefined)}>
          Confirm displayed value
        </button>
      </div>
      {selectedEvidence === "site_measured" ? (
        <input aria-label="Site measurement method" className={controlClass} disabled={disabled} maxLength={240}
          placeholder="How and where was it measured?" value={measurementNote}
          onChange={(event) => setMeasurementNote(event.currentTarget.value)} />
      ) : null}
    </div>
  );
}

export default function FloorPlanPropertyEvidenceControl({
  evidence,
  dark = false,
  disabled = false,
  onConfirm,
  testId,
  assumedLabel,
  assumedHelpText,
}: FloorPlanPropertyEvidenceControlProps) {
  const [selectedEvidence, setSelectedEvidence] =
    useState<FloorPlanConsumerMeasurementEvidenceV2>("user_confirmed");
  const [measurementNote, setMeasurementNote] = useState("");
  if (!evidence) return null;

  const editable = floorPlanPropertyEvidenceIsEditable(evidence);
  const controlClass = dark
    ? "designer-control rounded-md border px-2 py-1 text-[10px] text-neutral-100"
    : "rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] text-neutral-700";

  return (
    <div className="mt-1.5 grid gap-1.5" data-testid={testId}>
      <EvidenceStatus evidence={evidence} dark={dark} testId={testId} assumedLabel={assumedLabel} assumedHelpText={assumedHelpText} />
      {editable && onConfirm ? (
        <EvidenceConfirmation
          selectedEvidence={selectedEvidence} setSelectedEvidence={setSelectedEvidence}
          measurementNote={measurementNote} setMeasurementNote={setMeasurementNote}
          controlClass={controlClass} dark={dark} disabled={disabled} onConfirm={onConfirm}
        />
      ) : null}
    </div>
  );
}
