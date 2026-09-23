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

/** A custom shelf height supplied and owned by the integrating editor. */
export type CabinetShelfMarkerHandle = {
  id: string;
  valueMm: number;
  minMm: number;
  maxMm: number;
  /** Committed marker position within the overlay, measured from the bottom. */
  positionPercentFromBottom: number;
  /** Accessible name, for example "Shelf 2 in open shelving". */
  label?: string;
  disabled?: boolean;
};

export type CabinetShelfMarkerPreview = {
  shelfId: string;
  valueMm: number;
};

export type CabinetShelfMarkerHandlesProps = {
  shelves: readonly CabinetShelfMarkerHandle[];
  onPreviewChange: (preview: CabinetShelfMarkerPreview | null) => void;
  onCommit: (shelfId: string, valueMm: number) => void;
  /** Pointer changes snap to this increment. Defaults to 10 mm. */
  dragSnapMm?: number;
  /** Arrow-key precision. Defaults to 1 mm. */
  keyboardStepMm?: number;
  /** Pointer distance that represents one drag snap. Defaults to 6 px. */
  pixelsPerSnap?: number;
  disabled?: boolean;
  className?: string;
};

type ShelfDragState = {
  shelfId: string;
  label: string;
  pointerId: number;
  startClientY: number;
  startValueMm: number;
  startPositionPercentFromBottom: number;
  valueMm: number;
  target: HTMLButtonElement;
};

type ShelfDragVisual = Pick<
  ShelfDragState,
  "shelfId" | "startValueMm" | "startPositionPercentFromBottom"
>;

type NumericBounds = {
  minMm: number;
  maxMm: number;
};

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeBounds(shelf: CabinetShelfMarkerHandle): NumericBounds {
  const first = finiteOr(shelf.minMm, 0);
  const second = finiteOr(shelf.maxMm, first);
  return first <= second
    ? { minMm: first, maxMm: second }
    : { minMm: second, maxMm: first };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function constrainValue(shelf: CabinetShelfMarkerHandle, valueMm: number) {
  const { minMm, maxMm } = normalizeBounds(shelf);
  return Math.round(clamp(finiteOr(valueMm, minMm), minMm, maxMm) * 100) / 100;
}

function positionPercent(value: number) {
  return clamp(finiteOr(value, 0), 0, 100);
}

/**
 * DOM overlay for constrained custom-shelf positioning. It reports scalar
 * preview/commit values and never imports cabinet models or exposes 3D
 * transforms.
 */
export function CabinetShelfMarkerHandles({
  shelves,
  onPreviewChange,
  onCommit,
  dragSnapMm = 10,
  keyboardStepMm = 1,
  pixelsPerSnap = 6,
  disabled = false,
  className = "",
}: CabinetShelfMarkerHandlesProps) {
  const projectMeasurementUnit = useCabinetMeasurementUnit();
  const formatMeasurement = (valueMm: number) =>
    formatCabinetMeasurement(valueMm, projectMeasurementUnit, {
      includeMillimetreReference: projectMeasurementUnit !== "mm",
    });
  const displayValue = (valueMm: number) =>
    cabinetMillimetresToDisplay(valueMm, projectMeasurementUnit);
  const instructionsId = useId();
  const dragRef = useRef<ShelfDragState | null>(null);
  const previewCallbackRef = useRef(onPreviewChange);
  const commitCallbackRef = useRef(onCommit);
  const [preview, setPreview] = useState<CabinetShelfMarkerPreview | null>(null);
  const [dragVisual, setDragVisual] = useState<ShelfDragVisual | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  const effectiveDragSnapMm = Math.max(0.01, Math.abs(finiteOr(dragSnapMm, 10)));
  const effectiveKeyboardStepMm = Math.max(0.01, Math.abs(finiteOr(keyboardStepMm, 1)));
  const effectivePixelsPerSnap = Math.max(1, Math.abs(finiteOr(pixelsPerSnap, 6)));

  function publishPreview(nextPreview: CabinetShelfMarkerPreview | null) {
    setPreview(nextPreview);
    previewCallbackRef.current(nextPreview);
  }

  function startDrag(
    shelf: CabinetShelfMarkerHandle,
    label: string,
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    if (
      disabled ||
      shelf.disabled ||
      dragRef.current ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    event.currentTarget.focus({ preventScroll: true });
    event.preventDefault();
    const startValueMm = constrainValue(shelf, shelf.valueMm);
    dragRef.current = {
      shelfId: shelf.id,
      label,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startValueMm,
      startPositionPercentFromBottom: positionPercent(shelf.positionPercentFromBottom),
      valueMm: startValueMm,
      target: event.currentTarget,
    };
    setDragVisual({
      shelfId: shelf.id,
      startValueMm,
      startPositionPercentFromBottom: positionPercent(shelf.positionPercentFromBottom),
    });
    setLiveMessage("");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(
    shelf: CabinetShelfMarkerHandle,
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.shelfId !== shelf.id) return;

    event.preventDefault();
    const snapCount = Math.round(
      (drag.startClientY - event.clientY) / effectivePixelsPerSnap
    );
    const nextValueMm = constrainValue(
      shelf,
      drag.startValueMm + snapCount * effectiveDragSnapMm
    );

    if (nextValueMm === drag.valueMm) return;
    drag.valueMm = nextValueMm;
    publishPreview({ shelfId: shelf.id, valueMm: nextValueMm });
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
      commitCallbackRef.current(drag.shelfId, drag.valueMm);
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
    shelf: CabinetShelfMarkerHandle,
    label: string,
    event: ReactKeyboardEvent<HTMLButtonElement>
  ) {
    if (disabled || shelf.disabled) return;
    if (event.key === "Escape" && cancelActiveDrag(event)) return;

    const currentValueMm =
      preview?.shelfId === shelf.id
        ? preview.valueMm
        : constrainValue(shelf, shelf.valueMm);
    const { minMm, maxMm } = normalizeBounds(shelf);
    const pageStepMm = effectiveKeyboardStepMm * 10;
    let nextValueMm: number | null = null;

    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        nextValueMm = currentValueMm + effectiveKeyboardStepMm;
        break;
      case "ArrowDown":
      case "ArrowLeft":
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
    const constrainedValueMm = constrainValue(shelf, nextValueMm);
    if (constrainedValueMm !== currentValueMm) {
      setLiveMessage(`${label} set to ${formatMeasurement(constrainedValueMm)}`);
      commitCallbackRef.current(shelf.id, constrainedValueMm);
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
      data-testid="cabinet-shelf-marker-handles"
    >
      <span id={instructionsId} className="sr-only">
        Drag vertically to move a shelf in {formatMeasurement(effectiveDragSnapMm)} increments.
        Use the arrow keys for {formatMeasurement(effectiveKeyboardStepMm)} precision, Page Up
        or Page Down for larger changes, Home or End for the allowed bounds, and Escape to
        cancel a drag.
      </span>

      {shelves.map((shelf, index) => {
        const drag = dragVisual?.shelfId === shelf.id ? dragVisual : null;
        const valueMm =
          preview?.shelfId === shelf.id
            ? preview.valueMm
            : constrainValue(shelf, shelf.valueMm);
        const { minMm, maxMm } = normalizeBounds(shelf);
        const visualOffsetPx = drag
          ? ((valueMm - drag.startValueMm) / effectiveDragSnapMm) *
            effectivePixelsPerSnap
          : 0;
        const basePositionPercent = drag
          ? drag.startPositionPercentFromBottom
          : positionPercent(shelf.positionPercentFromBottom);
        const label = shelf.label ?? `Shelf marker ${index + 1}`;
        const fieldDisabled = disabled || Boolean(shelf.disabled) || minMm === maxMm;

        return (
          <button
            key={shelf.id}
            type="button"
            role="slider"
            aria-label={label}
            aria-describedby={instructionsId}
            aria-orientation="vertical"
            aria-valuemin={displayValue(minMm)}
            aria-valuemax={displayValue(maxMm)}
            aria-valuenow={displayValue(valueMm)}
            aria-valuetext={`${formatMeasurement(valueMm)} above the supplied reference base`}
            disabled={fieldDisabled}
            data-shelf-id={shelf.id}
            data-testid={`cabinet-shelf-marker-${shelf.id}`}
            className={`pointer-events-auto absolute inset-x-6 flex h-11 translate-y-1/2 cursor-ns-resize items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-45 ${
              drag ? "text-white" : "text-slate-50"
            }`}
            style={{
              bottom: `calc(${basePositionPercent}% + ${visualOffsetPx}px)`,
              touchAction: "none",
            }}
            onPointerDown={(event) => startDrag(shelf, label, event)}
            onPointerMove={(event) => moveDrag(shelf, event)}
            onPointerUp={(event) => finishDrag(event, true)}
            onPointerCancel={(event) => finishDrag(event, false)}
            onLostPointerCapture={(event) => {
              if (dragRef.current?.pointerId === event.pointerId) finishDrag(event, false);
            }}
            onBlur={(event) => cancelDragFromFocusLoss(event.currentTarget)}
            onKeyDown={(event) => adjustWithKeyboard(shelf, label, event)}
          >
            <span
              aria-hidden="true"
              className={`absolute inset-x-0 top-1/2 h-px -translate-y-1/2 ${
                drag ? "bg-sky-300" : "bg-white/65"
              }`}
            />
            <span
              aria-hidden="true"
              className={`relative ml-auto inline-flex min-h-8 items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums shadow-lg backdrop-blur transition-colors ${
                drag
                  ? "border-sky-200 bg-sky-500 text-white"
                  : "border-white/20 bg-slate-950/90 text-slate-50 hover:border-sky-300 hover:bg-slate-900"
              }`}
            >
              <span className="mr-1 text-sm leading-none text-sky-200">↕</span>
              {formatMeasurement(valueMm)}
            </span>
          </button>
        );
      })}

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage ||
          (preview
            ? `${
                shelves.find((shelf) => shelf.id === preview.shelfId)?.label ??
                "Shelf marker"
              } ${formatMeasurement(preview.valueMm)}`
            : "")}
      </span>
    </div>
  );
}
