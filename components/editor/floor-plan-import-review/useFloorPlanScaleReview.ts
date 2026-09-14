import { useMemo, useState } from "react";
import { analyzePointScale } from "@/lib/floor-plan-import-review-geometry";
import { evaluateSourceMeasurement } from "@/lib/floor-plan-scale-measurements";
import { useReviewMeasurementInput } from "./FloorPlanMeasurementInput";
import { applyScaleReviewMeasurement, scaleReviewFailureMessage } from "./applyScaleReviewMeasurement";
import type { FloorPlanScaleReviewPanelProps } from "./FloorPlanScaleReviewPanel";

function canApplyScale(props: FloorPlanScaleReviewPanelProps, scale: ReturnType<typeof analyzePointScale> | null,
  hasVertices: boolean, first: string, second: string) {
  if (props.disabled || !props.page || props.scalePoints.length !== 2) return false;
  if (props.calibration) return scale?.valid === true;
  return scale?.measurementValid === true && (!hasVertices || Boolean(first && second && first !== second));
}

export function useFloorPlanScaleReview(props: FloorPlanScaleReviewPanelProps) {
  const { document, floorId, sourceId, page, calibration, scalePoints } = props;
  const input = useReviewMeasurementInput(calibration?.primaryMeasurement);
  const printedMm = input.confirmedMm;
  const hasConflict = calibration?.independentMeasurements?.some((value) => !evaluateSourceMeasurement(calibration, value).agrees) ?? false;
  const [mode, setMode] = useState<"set" | "check">(hasConflict ? "check" : "set");
  const [firstVertexId, setFirstVertexId] = useState(""), [secondVertexId, setSecondVertexId] = useState("");
  const floor = document.floors.find((entry) => entry.id === floorId);
  const canMapExistingVertices = (floor?.vertices.length ?? 0) >= 2;
  const scale = useMemo(() => page ? analyzePointScale({ first: scalePoints[0] ?? null, second: scalePoints[1] ?? null,
    printedMm, pageWidthPx: page.widthPx, pageHeightPx: page.heightPx, calibration }) : null, [calibration, page, printedMm, scalePoints]);
  const apply = () => {
    if (!page || scalePoints.length !== 2) return;
    try {
      props.onError(null);
      props.onChange(applyScaleReviewMeasurement({ document, floorId, sourceId, page, calibration, scalePoints,
        printedMm, firstVertexId, secondVertexId, inputUnit: input.unit, sourceQuality: input.sourceQuality }));
      props.onPickingScaleChange(false);
    } catch (cause) { props.onError(scaleReviewFailureMessage(cause)); }
  };
  return { input, printedMm, hasConflict, mode, setMode, floor, canMapExistingVertices, scale, apply,
    firstVertexId, setFirstVertexId, secondVertexId, setSecondVertexId,
    canApply: canApplyScale(props, scale, canMapExistingVertices, firstVertexId, secondVertexId) };
}
