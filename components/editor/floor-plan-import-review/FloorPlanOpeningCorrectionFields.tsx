"use client";
import type {
  FloorPlanDocumentV2,
  FloorPlanFloorV2,
  FloorPlanOpeningKindV2,
  FloorPlanOpeningOperationV2,
  FloorPlanOpeningV2,
  FloorPlanPropertyEvidenceV2,
} from "@/lib/floor-plan-document-v2";
import { floorPlanPropertyEvidenceIsEditable } from "@/lib/floor-plan-measured-property-mutations";
import type { FloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutations";
import FloorPlanOpeningAddFields from "./FloorPlanOpeningAddFields";
import { FloorPlanOpeningEvidenceLockNotice } from "./FloorPlanOpeningEvidenceLockNotice";
import { FloorPlanOpeningKindCorrectionNotice } from "./FloorPlanOpeningKindCorrectionNotice";
import { useFloorPlanOpeningCorrection } from "./useFloorPlanOpeningCorrection";
type Props = {
  document: FloorPlanDocumentV2;
  floor: FloorPlanFloorV2;
  controlClassName: string;
  subtleClassName: string;
  disabled: boolean;
  proMode: boolean;
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
const HINGES: FloorPlanOpeningV2["hinge"][] = ["start", "end", "none", "unknown"];
const HANDINGS: FloorPlanOpeningV2["handing"][] = ["left", "right", "double", "none", "unknown"];

function measurementFieldDisabled(
  disabled: boolean,
  evidence: FloorPlanPropertyEvidenceV2,
  approved: boolean
) {
  return disabled || (!floorPlanPropertyEvidenceIsEditable(evidence) && !approved);
}
export default function FloorPlanOpeningCorrectionFields({
  document, floor, controlClassName, subtleClassName, disabled, proMode,
  onFocusIds, onMutate,
}: Props) {
  const correction = useFloorPlanOpeningCorrection({ floor, onFocusIds, onMutate });
  const { openingId, values, evidence, kindCorrection, kindOverrideApproved,
    measurementOverrides } = correction;
  const {
    openingOffset, openingWidth, openingKind, openingOperation,
    heightMm, sillHeightMm, hinge, handing,
  } = values;
  const { width: widthEvidence, height: heightEvidence, sill: sillEvidence } = evidence;

  return (
    <div className="grid gap-3 border-t border-neutral-200 pt-2">
      <div className="grid gap-2">
        <label className={`text-[10px] ${subtleClassName}`}>
          Edit or remove an opening
          <select
            data-testid="import-review-opening-select"
            className={`${controlClassName} mt-1 w-full`}
            value={openingId}
            onChange={(event) => correction.selectOpening(event.target.value)}
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
                data-testid="import-review-opening-offset"
                className={`${controlClassName} mt-1 w-full`}
                min={0}
                step={1}
                type="number"
                value={openingOffset}
                onChange={(event) => correction.setValue("openingOffset", Number(event.target.value))}
              />
            </label>
            <label className={`text-[10px] ${subtleClassName}`}>
              Span (mm)
              <input
                data-testid="import-review-opening-width"
                className={`${controlClassName} mt-1 w-full`}
                min={1}
                step={1}
                type="number"
                value={openingWidth}
                disabled={measurementFieldDisabled(disabled, widthEvidence, measurementOverrides.has("width"))}
                onChange={(event) => correction.setValue("openingWidth", Number(event.target.value))}
              />
              <FloorPlanOpeningEvidenceLockNotice evidence={widthEvidence} field="width"
                proMode={proMode} approved={measurementOverrides.has("width")}
                onApprove={() => correction.approveMeasurementOverride("width")} />
            </label>
            <label className={`text-[10px] ${subtleClassName}`}>
              Kind
              <select
                className={`${controlClassName} mt-1 w-full`}
                value={openingKind}
                onChange={(event) => {
                  correction.setValue("openingKind", event.target.value as FloorPlanOpeningKindV2);
                  correction.setKindOverrideApproved(false);
                }}
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
                  correction.setValue("openingOperation",
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
                data-testid="import-review-opening-height"
                className={`${controlClassName} mt-1 w-full`}
                min={0}
                step={1}
                type="number"
                value={heightMm}
                disabled={measurementFieldDisabled(disabled, heightEvidence, measurementOverrides.has("height"))}
                onChange={(event) =>
                  correction.setValue("heightMm", event.target.value === "" ? "" : Number(event.target.value))
                }
              />
              <FloorPlanOpeningEvidenceLockNotice evidence={heightEvidence} field="height"
                proMode={proMode} approved={measurementOverrides.has("height")}
                onApprove={() => correction.approveMeasurementOverride("height")} />
            </label>
            <label className={`text-[10px] ${subtleClassName}`}>
              Sill (mm, optional)
              <input
                data-testid="import-review-opening-sill"
                className={`${controlClassName} mt-1 w-full`}
                min={0}
                step={1}
                type="number"
                value={sillHeightMm}
                disabled={measurementFieldDisabled(disabled, sillEvidence, measurementOverrides.has("sill"))}
                onChange={(event) =>
                  correction.setValue("sillHeightMm", event.target.value === "" ? "" : Number(event.target.value))
                }
              />
              <FloorPlanOpeningEvidenceLockNotice evidence={sillEvidence} field="sill"
                proMode={proMode} approved={measurementOverrides.has("sill")}
                onApprove={() => correction.approveMeasurementOverride("sill")} />
            </label>
            <label className={`text-[10px] ${subtleClassName}`}>
              Hinge
              <select className={`${controlClassName} mt-1 w-full`} value={hinge}
                onChange={(event) => correction.setValue("hinge", event.target.value as FloorPlanOpeningV2["hinge"])}>
                {HINGES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className={`text-[10px] ${subtleClassName}`}>
              Handing
              <select className={`${controlClassName} mt-1 w-full`} value={handing}
                onChange={(event) => correction.setValue("handing", event.target.value as FloorPlanOpeningV2["handing"])}>
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
              onClick={correction.updateOpening}
            >
              Update opening safely
            </button>
            <FloorPlanOpeningKindCorrectionNotice
              plan={kindCorrection} subtleClassName={subtleClassName}
              proMode={proMode} approved={kindOverrideApproved}
              onApprove={() => correction.setKindOverrideApproved(true)}
            />
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
                  correction.selectOpening("");
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
