"use client";

import { useThree } from "@react-three/fiber";
import * as THREE from "three";
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

export type CabinetPreviewCameraPose = {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
};

const CABINET_PREVIEW_FIT_MARGIN = 1.14;
const CABINET_PREVIEW_MIN_DISTANCE_M = 2.4;

function fitDistanceForPlane(
  visibleWidthM: number,
  visibleHeightM: number,
  depthAlongViewM: number,
  verticalFovRad: number,
  aspect: number
): number {
  const halfVerticalFov = Math.max(0.01, verticalFovRad / 2);
  const halfVerticalSpan = Math.tan(halfVerticalFov);
  const halfHorizontalSpan = halfVerticalSpan * Math.max(0.1, aspect);
  const verticalDistance =
    (visibleHeightM * CABINET_PREVIEW_FIT_MARGIN) / 2 / halfVerticalSpan;
  const horizontalDistance =
    (visibleWidthM * CABINET_PREVIEW_FIT_MARGIN) / 2 / halfHorizontalSpan;

  return Math.max(
    CABINET_PREVIEW_MIN_DISTANCE_M,
    verticalDistance + depthAlongViewM / 2,
    horizontalDistance + depthAlongViewM / 2
  );
}

export function resolveCabinetPreviewCameraPose({
  view,
  widthMm,
  heightMm,
  depthMm,
  verticalFovDeg,
  aspect,
}: {
  view: CabinetPreviewView;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  verticalFovDeg: number;
  aspect: number;
}): CabinetPreviewCameraPose {
  const widthM = Math.max(0.1, widthMm / 1000);
  const heightM = Math.max(0.1, heightMm / 1000);
  const depthM = Math.max(0.1, depthMm / 1000);
  const targetY = heightM / 2;
  const verticalFovRad = THREE.MathUtils.degToRad(
    Number.isFinite(verticalFovDeg) ? verticalFovDeg : 42
  );
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const target: [number, number, number] = [0, targetY, 0];

  if (view === "front") {
    const distance = fitDistanceForPlane(
      widthM,
      heightM,
      depthM,
      verticalFovRad,
      safeAspect
    );
    return { position: [0, targetY, -distance], target, up: [0, 1, 0] };
  }

  if (view === "side") {
    const distance = fitDistanceForPlane(
      depthM,
      heightM,
      widthM,
      verticalFovRad,
      safeAspect
    );
    return { position: [distance, targetY, 0], target, up: [0, 1, 0] };
  }

  if (view === "top") {
    const distance = fitDistanceForPlane(
      widthM,
      depthM,
      heightM,
      verticalFovRad,
      safeAspect
    );
    return { position: [0, targetY + distance, 0.001], target, up: [0, 0, -1] };
  }

  const halfVerticalFov = Math.max(0.01, verticalFovRad / 2);
  const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * safeAspect);
  const limitingHalfFov = Math.max(0.01, Math.min(halfVerticalFov, halfHorizontalFov));
  const boundingRadius = Math.hypot(widthM, heightM, depthM) / 2;
  const distance = Math.max(
    CABINET_PREVIEW_MIN_DISTANCE_M,
    (boundingRadius * CABINET_PREVIEW_FIT_MARGIN) / Math.sin(limitingHalfFov)
  );
  const direction = new THREE.Vector3(0.72, 0.38, -0.9).normalize();

  return {
    position: [
      direction.x * distance,
      targetY + direction.y * distance,
      direction.z * distance,
    ],
    target,
    up: [0, 1, 0],
  };
}

/** Keeps named semantic views deterministic without exposing camera coordinates to users. */
export function CabinetPreviewCameraController({
  view,
  widthMm,
  heightMm,
  depthMm,
  fitKey,
}: CabinetPreviewCameraControllerProps) {
  const { camera, invalidate, size } = useThree();

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const pose = resolveCabinetPreviewCameraPose({
      view,
      widthMm,
      heightMm,
      depthMm,
      verticalFovDeg: perspectiveCamera.isPerspectiveCamera ? perspectiveCamera.fov : 42,
      aspect:
        size.height > 0
          ? size.width / size.height
          : perspectiveCamera.isPerspectiveCamera
            ? perspectiveCamera.aspect
            : 1,
    });

    camera.up.set(...pose.up);
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, depthMm, fitKey, heightMm, invalidate, size.height, size.width, view, widthMm]);

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
