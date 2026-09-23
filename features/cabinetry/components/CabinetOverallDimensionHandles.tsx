"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  cabinetMillimetresToDisplay,
  formatCabinetMeasurement,
} from "../measurementUnits";
import { useCabinetMeasurementUnit } from "./CabinetMeasurementUnitContext";

export type CabinetOverallDimensionField = "totalWidth" | "height" | "depth";

export type CabinetDimensionPreview = {
  field: CabinetOverallDimensionField;
  valueMm: number;
};

export type CabinetDimensionLimit = {
  minMm: number;
  maxMm: number;
};

export type CabinetOverallDimensionHandlesProps = {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  onPreviewChange: (preview: CabinetDimensionPreview | null) => void;
  onCommit: (field: CabinetOverallDimensionField, valueMm: number) => void;
  limits?: Partial<Record<CabinetOverallDimensionField, Partial<CabinetDimensionLimit>>>;
  /** Pointer changes snap to this increment. Defaults to 10 mm. */
  snapMm?: number;
  /** Arrow-key precision. Defaults to 1 mm. */
  keyboardStepMm?: number;
  /** Pointer distance that represents one drag snap. Defaults to 6 px. */
  pixelsPerSnap?: number;
  disabled?: boolean;
  disabledFields?: Partial<Record<CabinetOverallDimensionField, boolean>>;
  className?: string;
};

export const CABINET_DEFAULT_OVERALL_DIMENSION_LIMITS: Readonly<
  Record<CabinetOverallDimensionField, CabinetDimensionLimit>
> = {
  totalWidth: { minMm: 200, maxMm: 20_000 },
  height: { minMm: 200, maxMm: 5_000 },
  depth: { minMm: 100, maxMm: 2_500 },
};

type DragState = {
  field: CabinetOverallDimensionField;
  label: string;
  pointerId: number;
  startCoordinate: number;
  startValueMm: number;
  valueMm: number;
  target: HTMLButtonElement;
};

type HandleDefinition = {
  field: CabinetOverallDimensionField;
  label: string;
  axis: "x" | "y";
  direction: 1 | -1;
  placementClassName: string;
  cursorClassName: string;
  directionGlyph: string;
};

const HANDLE_DEFINITIONS: readonly HandleDefinition[] = [
  {
    field: "totalWidth",
    label: "Overall width",
    axis: "x",
    direction: 1,
    placementClassName: "bottom-3 left-1/2 -translate-x-1/2",
    cursorClassName: "cursor-ew-resize",
    directionGlyph: "↔",
  },
  {
    field: "height",
    label: "Overall height",
    axis: "y",
    direction: -1,
    placementClassName: "right-3 top-1/2 -translate-y-1/2",
    cursorClassName: "cursor-ns-resize",
    directionGlyph: "↕",
  },
  {
    field: "depth",
    label: "Overall depth",
    axis: "x",
    direction: 1,
    placementClassName: "right-3 top-3",
    cursorClassName: "cursor-ew-resize",
    directionGlyph: "↔",
  },
] as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

export function CabinetOverallDimensionHandles({
  widthMm,
  heightMm,
  depthMm,
  onPreviewChange,
  onCommit,
  limits,
  snapMm = 10,
  keyboardStepMm = 1,
  pixelsPerSnap = 6,
  disabled = false,
  disabledFields,
  className = "",
}: CabinetOverallDimensionHandlesProps) {
  const projectMeasurementUnit = useCabinetMeasurementUnit();
  const formatMeasurement = (valueMm: number) =>
    formatCabinetMeasurement(valueMm, projectMeasurementUnit, {
      includeMillimetreReference: projectMeasurementUnit !== "mm",
    });
  const displayValue = (valueMm: number) =>
    cabinetMillimetresToDisplay(valueMm, projectMeasurementUnit);
  const instructionsId = useId();
  const dragRef = useRef<DragState | null>(null);
  const previewChangeCallbackRef = useRef(onPreviewChange);
  const commitCallbackRef = useRef(onCommit);
  const [preview, setPreview] = useState<CabinetDimensionPreview | null>(null);
  const [draggingField, setDraggingField] =
    useState<CabinetOverallDimensionField | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const effectiveSnapMm = Math.max(0.01, Math.abs(finiteOr(snapMm, 10)));
  const effectiveKeyboardStepMm = Math.max(
    0.01,
    Math.abs(finiteOr(keyboardStepMm, 1))
  );
  const effectivePixelsPerSnap = Math.max(1, Math.abs(finiteOr(pixelsPerSnap, 6)));

  const valueByField: Record<CabinetOverallDimensionField, number> = {
    totalWidth: finiteOr(widthMm, CABINET_DEFAULT_OVERALL_DIMENSION_LIMITS.totalWidth.minMm),
    height: finiteOr(heightMm, CABINET_DEFAULT_OVERALL_DIMENSION_LIMITS.height.minMm),
    depth: finiteOr(depthMm, CABINET_DEFAULT_OVERALL_DIMENSION_LIMITS.depth.minMm),
  };

  function getLimit(field: CabinetOverallDimensionField): CabinetDimensionLimit {
    const fallback = CABINET_DEFAULT_OVERALL_DIMENSION_LIMITS[field];
    const configured = limits?.[field];
    const minMm = Number.isFinite(configured?.minMm) ? configured!.minMm! : fallback.minMm;
    const maxMm = Number.isFinite(configured?.maxMm) ? configured!.maxMm! : fallback.maxMm;

    return minMm <= maxMm ? { minMm, maxMm } : { minMm: maxMm, maxMm: minMm };
  }

  function constrain(field: CabinetOverallDimensionField, valueMm: number) {
    const { minMm, maxMm } = getLimit(field);
    return Math.round(clamp(finiteOr(valueMm, minMm), minMm, maxMm) * 100) / 100;
  }

  function publishPreview(nextPreview: CabinetDimensionPreview | null) {
    setPreview(nextPreview);
    previewChangeCallbackRef.current(nextPreview);
  }

  function startDrag(
    definition: HandleDefinition,
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    if (
      disabled ||
      disabledFields?.[definition.field] ||
      dragRef.current ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    event.currentTarget.focus({ preventScroll: true });
    event.preventDefault();
    const startValueMm = constrain(definition.field, valueByField[definition.field]);
    dragRef.current = {
      field: definition.field,
      label: definition.label,
      pointerId: event.pointerId,
      startCoordinate: definition.axis === "x" ? event.clientX : event.clientY,
      startValueMm,
      valueMm: startValueMm,
      target: event.currentTarget,
    };
    setDraggingField(definition.field);
    setLiveMessage("");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(
    definition: HandleDefinition,
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.field !== definition.field) return;

    event.preventDefault();
    const coordinate = definition.axis === "x" ? event.clientX : event.clientY;
    const snapCount = Math.round(
      ((coordinate - drag.startCoordinate) * definition.direction) / effectivePixelsPerSnap
    );
    const nextValueMm = constrain(
      definition.field,
      drag.startValueMm + snapCount * effectiveSnapMm
    );

    if (nextValueMm === drag.valueMm) return;
    drag.valueMm = nextValueMm;
    publishPreview({ field: definition.field, valueMm: nextValueMm });
    setLiveMessage(`${drag.label} ${formatMeasurement(nextValueMm)}`);
  }

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>, shouldCommit: boolean) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setDraggingField(null);
    publishPreview(null);
    if (shouldCommit && drag.valueMm !== drag.startValueMm) {
      setLiveMessage(`${drag.label} set to ${formatMeasurement(drag.valueMm)}`);
      commitCallbackRef.current(drag.field, drag.valueMm);
    } else if (!shouldCommit) {
      setLiveMessage(
        `${drag.label} change cancelled. Value remains ${formatMeasurement(
          drag.startValueMm
        )}`
      );
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function cancelActiveDrag(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return false;

    event.preventDefault();
    dragRef.current = null;
    setDraggingField(null);
    publishPreview(null);
    setLiveMessage(
      `${drag.label} change cancelled. Value remains ${formatMeasurement(
        drag.startValueMm
      )}`
    );
    if (drag.target.hasPointerCapture(drag.pointerId)) {
      drag.target.releasePointerCapture(drag.pointerId);
    }
    return true;
  }

  function cancelDragFromFocusLoss(target: HTMLButtonElement) {
    const drag = dragRef.current;
    if (!drag || drag.target !== target) return;

    dragRef.current = null;
    setDraggingField(null);
    publishPreview(null);
    setLiveMessage(
      `${drag.label} change cancelled. Value remains ${formatMeasurement(
        drag.startValueMm
      )}`
    );
    if (target.hasPointerCapture(drag.pointerId)) {
      target.releasePointerCapture(drag.pointerId);
    }
  }

  function adjustWithKeyboard(
    definition: HandleDefinition,
    event: ReactKeyboardEvent<HTMLButtonElement>
  ) {
    const { field } = definition;
    if (disabled || disabledFields?.[field]) return;
    if (event.key === "Escape" && cancelActiveDrag(event)) return;

    const pageStepMm = effectiveKeyboardStepMm * 10;
    const currentValueMm = preview?.field === field ? preview.valueMm : valueByField[field];
    const { minMm, maxMm } = getLimit(field);
    let nextValueMm: number | null = null;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        nextValueMm = currentValueMm + effectiveKeyboardStepMm;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        nextValueMm = currentValueMm - effectiveKeyboardStepMm;
        break;
      case "PageUp":
        nextValueMm = currentValueMm + pageStepMm;
        break;
      case "PageDown":
        nextValueMm = currentValueMm - pageStepMm;
        break;
      case "Home":
        nextValueMm = minMm;
        break;
      case "End":
        nextValueMm = maxMm;
        break;
      default:
        return;
    }

    event.preventDefault();
    const constrainedValueMm = constrain(field, nextValueMm);
    if (constrainedValueMm !== constrain(field, currentValueMm)) {
      setLiveMessage(
        `${definition.label} set to ${formatMeasurement(constrainedValueMm)}`
      );
      commitCallbackRef.current(field, constrainedValueMm);
    }
  }

  useEffect(() => {
    previewChangeCallbackRef.current = onPreviewChange;
    commitCallbackRef.current = onCommit;
  }, [onCommit, onPreviewChange]);

  useEffect(() => {
    return () => {
      if (dragRef.current) previewChangeCallbackRef.current(null);
    };
  }, []);

  const liveValue = preview ? formatMeasurement(preview.valueMm) : "";

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 select-none ${className}`.trim()}
      data-testid="cabinet-overall-dimension-handles"
    >
      <span id={instructionsId} className="sr-only">
        Drag to resize in {formatMeasurement(effectiveSnapMm)} increments. Use arrow keys for
        {" "}{formatMeasurement(effectiveKeyboardStepMm)} precision, Page Up or Page Down for a
        larger adjustment, Home or End for the allowed minimum or maximum, and Escape to cancel
        a drag.
      </span>

      {HANDLE_DEFINITIONS.map((definition) => {
        const valueMm =
          preview?.field === definition.field
            ? preview.valueMm
            : constrain(definition.field, valueByField[definition.field]);
        const { minMm, maxMm } = getLimit(definition.field);
        const isDragging = draggingField === definition.field;
        const fieldDisabled =
          disabled || Boolean(disabledFields?.[definition.field]) || minMm === maxMm;

        return (
          <button
            key={definition.field}
            type="button"
            role="slider"
            aria-label={definition.label}
            aria-describedby={instructionsId}
            aria-orientation={definition.axis === "y" ? "vertical" : "horizontal"}
            aria-valuemin={displayValue(minMm)}
            aria-valuemax={displayValue(maxMm)}
            aria-valuenow={displayValue(valueMm)}
            aria-valuetext={formatMeasurement(valueMm)}
            disabled={fieldDisabled}
            data-dimension-field={definition.field}
            data-testid={`cabinet-dimension-handle-${definition.field}`}
            className={`pointer-events-auto absolute inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold tabular-nums shadow-lg backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ${definition.placementClassName} ${definition.cursorClassName} ${
              isDragging
                ? "border-sky-300 bg-sky-500 text-white"
                : "border-white/20 bg-slate-950/90 text-slate-50 hover:border-sky-300 hover:bg-slate-900"
            }`}
            style={{ touchAction: "none" }}
            onPointerDown={(event) => startDrag(definition, event)}
            onPointerMove={(event) => moveDrag(definition, event)}
            onPointerUp={(event) => finishDrag(event, true)}
            onPointerCancel={(event) => finishDrag(event, false)}
            onLostPointerCapture={(event) => {
              if (dragRef.current?.pointerId === event.pointerId) finishDrag(event, false);
            }}
            onBlur={(event) => cancelDragFromFocusLoss(event.currentTarget)}
            onKeyDown={(event) => adjustWithKeyboard(definition, event)}
          >
            <span aria-hidden="true" className="text-sm leading-none text-sky-200">
              {definition.directionGlyph}
            </span>
            <span className="sr-only">{definition.label}: </span>
            <span>{formatMeasurement(valueMm)}</span>
          </button>
        );
      })}

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage ||
          (preview
            ? `${
                preview.field === "totalWidth"
                  ? "Overall width"
                  : `Overall ${preview.field}`
              } ${liveValue}`
            : "")}
      </span>
    </div>
  );
}
