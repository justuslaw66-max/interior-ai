"use client";

import { useThree } from "@react-three/fiber";
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export type CabinetPreviewView = "perspective" | "front" | "side" | "top";

export type CabinetPreviewCameraControllerProps = {
  view: CabinetPreviewView;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  /** Changes when a newly chosen template/design should be framed. */
  fitKey: string;
};

/** Keeps named semantic views deterministic without exposing camera coordinates to users. */
export function CabinetPreviewCameraController({
  view,
  widthMm,
  heightMm,
  depthMm,
  fitKey,
}: CabinetPreviewCameraControllerProps) {
  const { camera, invalidate } = useThree();
  const dimensionsRef = useRef({ widthMm, heightMm, depthMm });

  useEffect(() => {
    dimensionsRef.current = { widthMm, heightMm, depthMm };
  }, [depthMm, heightMm, widthMm]);

  useEffect(() => {
    const {
      widthMm: currentWidthMm,
      heightMm: currentHeightMm,
      depthMm: currentDepthMm,
    } = dimensionsRef.current;
    const widthM = Math.max(0.1, currentWidthMm / 1000);
    const heightM = Math.max(0.1, currentHeightMm / 1000);
    const depthM = Math.max(0.1, currentDepthMm / 1000);
    const targetY = heightM / 2;
    const distance = Math.max(2.4, widthM * 1.25, heightM * 1.25, depthM * 2.5);

    camera.up.set(0, 1, 0);
    if (view === "front") {
      camera.position.set(0, targetY, distance);
    } else if (view === "side") {
      camera.position.set(distance, targetY, 0);
    } else if (view === "top") {
      camera.up.set(0, 0, -1);
      camera.position.set(0, distance, 0.001);
    } else {
      camera.position.set(distance * 0.72, Math.max(1.4, heightM * 0.9), distance * 0.9);
    }
    camera.lookAt(0, targetY, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, fitKey, invalidate, view]);

  return null;
}

export type CabinetPreviewViewSelectorProps = {
  value: CabinetPreviewView;
  onChange: (view: CabinetPreviewView) => void;
};

const VIEW_OPTIONS: Array<{ value: CabinetPreviewView; label: string }> = [
  { value: "perspective", label: "3D" },
  { value: "front", label: "Front" },
  { value: "side", label: "Side" },
  { value: "top", label: "Top" },
];

export function CabinetPreviewViewSelector({
  value,
  onChange,
}: CabinetPreviewViewSelectorProps) {
  const instructionsId = useId();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectViewWithKeyboard(
    currentIndex: number,
    event: ReactKeyboardEvent<HTMLButtonElement>
  ) {
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (currentIndex - 1 + VIEW_OPTIONS.length) % VIEW_OPTIONS.length;
        break;
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % VIEW_OPTIONS.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = VIEW_OPTIONS.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextOption = VIEW_OPTIONS[nextIndex];
    buttonRefs.current[nextIndex]?.focus();
    if (nextOption.value !== value) onChange(nextOption.value);
  }

  return (
    <div
      role="group"
      aria-label="Preview view"
      aria-describedby={instructionsId}
      className="inline-flex rounded-lg border border-white/60 bg-white/90 p-1 text-[11px] font-semibold text-neutral-700 shadow-sm backdrop-blur"
      data-testid="cabinet-preview-view-selector"
    >
      <span id={instructionsId} className="sr-only">
        Use the arrow keys to move between views. Home selects the first view and End selects
        the last view.
      </span>
      {VIEW_OPTIONS.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => {
            buttonRefs.current[index] = element;
          }}
          type="button"
          aria-pressed={value === option.value}
          data-testid={`cabinet-preview-view-${option.value}`}
          className={`inline-flex min-h-7 items-center rounded-md px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            value === option.value ? "bg-neutral-950 text-white" : "hover:bg-neutral-100"
          }`}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => selectViewWithKeyboard(index, event)}
        >
          <span aria-hidden="true" className="mr-1 inline-block w-3 text-center">
            {value === option.value ? "✓" : ""}
          </span>
          {option.label}
        </button>
      ))}
    </div>
  );
}
