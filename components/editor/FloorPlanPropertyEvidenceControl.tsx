"use client";

import { useState } from "react";
import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import {
  floorPlanPropertyEvidenceIsEditable,
  floorPlanPropertyEvidenceLabel,
  type FloorPlanConsumerMeasurementEvidenceV2,
} from "@/lib/floor-plan-measured-property-mutations";
import { Button } from "@/components/ui/Button";

type FloorPlanPropertyEvidenceControlProps = {
  evidence: FloorPlanPropertyEvidenceV2 | null | undefined;
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
  evidence, testId, assumedLabel, assumedHelpText,
}: Pick<FloorPlanPropertyEvidenceControlProps, "testId" | "assumedLabel" | "assumedHelpText"> & {
  evidence: FloorPlanPropertyEvidenceV2;
}) {
  const editable = floorPlanPropertyEvidenceIsEditable(evidence);
  const badgeClass = evidence === "assumed"
    ? "bg-amber-100 text-amber-800"
    : evidence === "site_measured"
      ? "bg-emerald-100 text-emerald-800"
      : "bg-blue-100 text-blue-800";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}`} data-testid={`${testId}-badge`}>
        {evidence === "assumed" && assumedLabel ? assumedLabel : floorPlanPropertyEvidenceLabel(evidence)}
      </span>
      {evidence === "assumed" ? (
        <span className="text-xs text-amber-700">
          {assumedHelpText ?? "Not read from the source drawing."}
        </span>
      ) : null}
      {!editable ? (
        <span className="text-xs text-neutral-500">
          Locked; use reviewed override workflow to replace it.
        </span>
      ) : null}
    </div>
  );
}

function EvidenceConfirmation({
  selectedEvidence, setSelectedEvidence, measurementNote, setMeasurementNote,
  controlClass, disabled, onConfirm,
}: {
  selectedEvidence: FloorPlanConsumerMeasurementEvidenceV2;
  setSelectedEvidence: (value: FloorPlanConsumerMeasurementEvidenceV2) => void;
  measurementNote: string;
  setMeasurementNote: (value: string) => void;
  controlClass: string;
  disabled: boolean;
  onConfirm: NonNullable<FloorPlanPropertyEvidenceControlProps["onConfirm"]>;
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <select aria-label="Measurement evidence" className={`${controlClass} max-w-full grow`} disabled={disabled}
          value={selectedEvidence} onChange={(event) => setSelectedEvidence(event.currentTarget.value as FloorPlanConsumerMeasurementEvidenceV2)}>
          <option value="user_confirmed">I confirm this value</option>
          <option value="site_measured">Measured on site</option>
        </select>
        <Button
          variant="secondary" size="compact"
          disabled={disabled || (selectedEvidence === "site_measured" && measurementNote.trim().length < 4)}
          onClick={() => onConfirm(selectedEvidence, measurementNote.trim() || undefined)}
        >
          Confirm displayed value
        </Button>
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
  const controlClass = "rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700";

  return (
    <div className="mt-1.5 grid grid-cols-1 gap-1.5" data-testid={testId}>
      <EvidenceStatus evidence={evidence} testId={testId} assumedLabel={assumedLabel} assumedHelpText={assumedHelpText} />
      {editable && onConfirm ? (
        <EvidenceConfirmation
          selectedEvidence={selectedEvidence} setSelectedEvidence={setSelectedEvidence}
          measurementNote={measurementNote} setMeasurementNote={setMeasurementNote}
          controlClass={controlClass} disabled={disabled} onConfirm={onConfirm}
        />
      ) : null}
    </div>
  );
}
