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

/**
 * A semantic divider value owned by the integrating editor. `valueMm` can be
 * either a cumulative divider offset or an adjacent module width; the visual
 * control deliberately does not know or mutate the cabinet model.
 */
export type CabinetModuleDividerHandle = {
  id: string;
  valueMm: number;
  minMm: number;
  maxMm: number;
  /** Committed divider position within the overlay, measured from the left. */
  positionPercent: number;
  /** Accessible name, for example "Divider between drawers and open shelves". */
  label?: string;
  disabled?: boolean;
};

export type CabinetModuleDividerPreview = {
  dividerId: string;
  valueMm: number;
};

export type CabinetModuleDividerHandlesProps = {
  dividers: readonly CabinetModuleDividerHandle[];
  onPreviewChange: (preview: CabinetModuleDividerPreview | null) => void;
  onCommit: (dividerId: string, valueMm: number) => void;
  /** Pointer changes snap to this increment. Defaults to 10 mm. */
  dragSnapMm?: number;
  /** Arrow-key precision. Defaults to 1 mm. */
  keyboardStepMm?: number;
  /** Pointer distance that represents one drag snap. Defaults to 6 px. */
  pixelsPerSnap?: number;
  disabled?: boolean;
  className?: string;
};

type DividerDragState = {
  dividerId: string;
  label: string;
  pointerId: number;
  startClientX: number;
  startValueMm: number;
  startPositionPercent: number;
  valueMm: number;
  target: HTMLButtonElement;
};

type DividerDragVisual = Pick<
  DividerDragState,
  "dividerId" | "startValueMm" | "startPositionPercent"
>;

type NumericBounds = {
  minMm: number;
  maxMm: number;
};

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeBounds(divider: CabinetModuleDividerHandle): NumericBounds {
  const first = finiteOr(divider.minMm, 0);
  const second = finiteOr(divider.maxMm, first);
  return first <= second
    ? { minMm: first, maxMm: second }
    : { minMm: second, maxMm: first };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function constrainValue(divider: CabinetModuleDividerHandle, valueMm: number) {
  const { minMm, maxMm } = normalizeBounds(divider);
  return Math.round(clamp(finiteOr(valueMm, minMm), minMm, maxMm) * 100) / 100;
}

function positionPercent(value: number) {
  return clamp(finiteOr(value, 0), 0, 100);
}

/**
 * DOM overlay for constrained module-divider resizing. It reports scalar
 * preview/commit values and never imports cabinet models or exposes 3D
 * transforms.
 */
export function CabinetModuleDividerHandles({
  dividers,
  onPreviewChange,
  onCommit,
  dragSnapMm = 10,
  keyboardStepMm = 1,
  pixelsPerSnap = 6,
  disabled = false,
  className = "",
}: CabinetModuleDividerHandlesProps) {
  const projectMeasurementUnit = useCabinetMeasurementUnit();
  const formatMeasurement = (valueMm: number) =>
    formatCabinetMeasurement(valueMm, projectMeasurementUnit, {
      includeMillimetreReference: projectMeasurementUnit !== "mm",
    });
  const displayValue = (valueMm: number) =>
    cabinetMillimetresToDisplay(valueMm, projectMeasurementUnit);
  const instructionsId = useId();
  const dragRef = useRef<DividerDragState | null>(null);
  const previewCallbackRef = useRef(onPreviewChange);
  const commitCallbackRef = useRef(onCommit);
  const [preview, setPreview] = useState<CabinetModuleDividerPreview | null>(null);
  const [dragVisual, setDragVisual] = useState<DividerDragVisual | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  const effectiveDragSnapMm = Math.max(0.01, Math.abs(finiteOr(dragSnapMm, 10)));
  const effectiveKeyboardStepMm = Math.max(0.01, Math.abs(finiteOr(keyboardStepMm, 1)));
  const effectivePixelsPerSnap = Math.max(1, Math.abs(finiteOr(pixelsPerSnap, 6)));

  function publishPreview(nextPreview: CabinetModuleDividerPreview | null) {
    setPreview(nextPreview);
    previewCallbackRef.current(nextPreview);
  }

  function startDrag(
    divider: CabinetModuleDividerHandle,
    label: string,
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    if (
      disabled ||
      divider.disabled ||
      dragRef.current ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    event.currentTarget.focus({ preventScroll: true });
    event.preventDefault();
    const startValueMm = constrainValue(divider, divider.valueMm);
    dragRef.current = {
      dividerId: divider.id,
      label,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startValueMm,
      startPositionPercent: positionPercent(divider.positionPercent),
      valueMm: startValueMm,
      target: event.currentTarget,
    };
    setDragVisual({
      dividerId: divider.id,
      startValueMm,
      startPositionPercent: positionPercent(divider.positionPercent),
    });
    setLiveMessage("");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(
    divider: CabinetModuleDividerHandle,
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    const drag = dragRef.current;
    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      drag.dividerId !== divider.id
    ) {
      return;
    }

    event.preventDefault();
    const snapCount = Math.round(
      (event.clientX - drag.startClientX) / effectivePixelsPerSnap
    );
    const nextValueMm = constrainValue(
      divider,
      drag.startValueMm + snapCount * effectiveDragSnapMm
    );

    if (nextValueMm === drag.valueMm) return;
    drag.valueMm = nextValueMm;
    publishPreview({ dividerId: divider.id, valueMm: nextValueMm });
    setLiveMessage(`${drag.label} ${formatMeasurement(nextValueMm)}`);
  }

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>, shouldCommit: boolean) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setDragVisual(null);
    publishPreview(null);
    if (shouldCommit && drag.valueMm !== drag.startValueMm) {
      setLiveMessage(`${drag.label} set to ${formatMeasurement(drag.valueMm)}`);
      commitCallbackRef.current(drag.dividerId, drag.valueMm);
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
    setDragVisual(null);
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
    setDragVisual(null);
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
    divider: CabinetModuleDividerHandle,
    label: string,
    event: ReactKeyboardEvent<HTMLButtonElement>
  ) {
    if (disabled || divider.disabled) return;
    if (event.key === "Escape" && cancelActiveDrag(event)) return;

    const currentValueMm =
      preview?.dividerId === divider.id
        ? preview.valueMm
        : constrainValue(divider, divider.valueMm);
    const { minMm, maxMm } = normalizeBounds(divider);
    const pageStepMm = effectiveKeyboardStepMm * 10;
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
    const constrainedValueMm = constrainValue(divider, nextValueMm);
    if (constrainedValueMm !== currentValueMm) {
      setLiveMessage(`${label} set to ${formatMeasurement(constrainedValueMm)}`);
      commitCallbackRef.current(divider.id, constrainedValueMm);
    }
  }

  useEffect(() => {
    previewCallbackRef.current = onPreviewChange;
    commitCallbackRef.current = onCommit;
  }, [onCommit, onPreviewChange]);

  useEffect(() => {
    return () => {
      if (dragRef.current) previewCallbackRef.current(null);
    };
  }, []);

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 select-none ${className}`.trim()}
      data-testid="cabinet-module-divider-handles"
    >
      <span id={instructionsId} className="sr-only">
        Drag horizontally to resize in {formatMeasurement(effectiveDragSnapMm)} increments.
        Use the arrow keys for {formatMeasurement(effectiveKeyboardStepMm)} precision, Page Up
        or Page Down for larger changes, Home or End for the allowed bounds, and Escape to
        cancel a drag.
      </span>

      {dividers.map((divider, index) => {
        const drag = dragVisual?.dividerId === divider.id ? dragVisual : null;
        const valueMm =
          preview?.dividerId === divider.id
            ? preview.valueMm
            : constrainValue(divider, divider.valueMm);
        const { minMm, maxMm } = normalizeBounds(divider);
        const visualOffsetPx = drag
          ? ((valueMm - drag.startValueMm) / effectiveDragSnapMm) *
            effectivePixelsPerSnap
          : 0;
        const basePositionPercent = drag
          ? drag.startPositionPercent
          : positionPercent(divider.positionPercent);
        const label = divider.label ?? `Module divider ${index + 1}`;
        const fieldDisabled = disabled || Boolean(divider.disabled) || minMm === maxMm;

        return (
          <button
            key={divider.id}
            type="button"
            role="slider"
            aria-label={label}
            aria-describedby={instructionsId}
            aria-orientation="horizontal"
            aria-valuemin={displayValue(minMm)}
            aria-valuemax={displayValue(maxMm)}
            aria-valuenow={displayValue(valueMm)}
            aria-valuetext={`${formatMeasurement(valueMm)} from the supplied reference edge`}
            disabled={fieldDisabled}
            data-divider-id={divider.id}
            data-testid={`cabinet-module-divider-${divider.id}`}
            className={`pointer-events-auto absolute inset-y-6 flex w-11 -translate-x-1/2 cursor-ew-resize items-start justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-45 ${
              drag ? "text-white" : "text-slate-50"
            }`}
            style={{
              left: `calc(${basePositionPercent}% + ${visualOffsetPx}px)`,
              touchAction: "none",
            }}
            onPointerDown={(event) => startDrag(divider, label, event)}
            onPointerMove={(event) => moveDrag(divider, event)}
            onPointerUp={(event) => finishDrag(event, true)}
            onPointerCancel={(event) => finishDrag(event, false)}
            onLostPointerCapture={(event) => {
              if (dragRef.current?.pointerId === event.pointerId) finishDrag(event, false);
            }}
            onBlur={(event) => cancelDragFromFocusLoss(event.currentTarget)}
            onKeyDown={(event) => adjustWithKeyboard(divider, label, event)}
          >
            <span
              aria-hidden="true"
              className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${
                drag ? "bg-sky-300" : "bg-white/65"
              }`}
            />
            <span
              aria-hidden="true"
              className={`relative mt-2 inline-flex min-h-8 items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums shadow-lg backdrop-blur transition-colors ${
                drag
                  ? "border-sky-200 bg-sky-500 text-white"
                  : "border-white/20 bg-slate-950/90 text-slate-50 hover:border-sky-300 hover:bg-slate-900"
              }`}
            >
              <span className="mr-1 text-sm leading-none text-sky-200">↔</span>
              {formatMeasurement(valueMm)}
            </span>
          </button>
        );
      })}

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage ||
          (preview
            ? `${
                dividers.find((divider) => divider.id === preview.dividerId)?.label ??
                "Module divider"
              } ${formatMeasurement(preview.valueMm)}`
            : "")}
      </span>
    </div>
  );
}
