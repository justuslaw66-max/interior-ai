export type CabinetPreviewView = "perspective" | "front" | "side" | "top";

export type CabinetPreviewCameraPose = {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  up: readonly [number, number, number];
};

export const CABINET_PREVIEW_CAMERA_FOV_DEGREES = 42;

const PERSPECTIVE_FRAME_MARGIN = 1.18;
const NAMED_VIEW_FRAME_MARGIN = 1.5;
const NAMED_VIEW_MIN_DISTANCE = 3.2;

function requiredCameraDistance(
  horizontalM: number,
  verticalM: number,
  aspectRatio: number,
  frameMargin: number,
) {
  const safeAspectRatio = Math.max(0.35, aspectRatio);
  const halfVerticalFovRadians = (CABINET_PREVIEW_CAMERA_FOV_DEGREES * Math.PI) / 360;
  const halfVerticalFovTangent = Math.tan(halfVerticalFovRadians);
  const verticalDistance =
    (verticalM * frameMargin) / (2 * halfVerticalFovTangent);
  const horizontalDistance =
    (horizontalM * frameMargin) /
    (2 * halfVerticalFovTangent * safeAspectRatio);

  return Math.max(verticalDistance, horizontalDistance);
}

/**
 * Cabinet fronts are generated on the negative-Z side of the assembly. Named
 * front and default perspective views must therefore approach from negative Z.
 */
export function resolveCabinetPreviewCameraPose(
  view: CabinetPreviewView,
  widthMm: number,
  heightMm: number,
  depthMm: number,
  aspectRatio = 1,
): CabinetPreviewCameraPose {
  const widthM = Math.max(0.1, widthMm / 1000);
  const heightM = Math.max(0.1, heightMm / 1000);
  const depthM = Math.max(0.1, depthMm / 1000);
  const targetY = heightM / 2;
  const target = [0, targetY, 0] as const;

  if (view === "front") {
    const distance = Math.max(
      NAMED_VIEW_MIN_DISTANCE,
      requiredCameraDistance(widthM, heightM, aspectRatio, NAMED_VIEW_FRAME_MARGIN),
      depthM * 2.5,
    );
    return {
      position: [0, targetY, -(distance + depthM / 2)],
      target,
      up: [0, 1, 0],
    };
  }
  if (view === "side") {
    const distance = Math.max(
      NAMED_VIEW_MIN_DISTANCE,
      requiredCameraDistance(depthM, heightM, aspectRatio, NAMED_VIEW_FRAME_MARGIN),
    );
    return {
      position: [distance + widthM / 2, targetY, 0],
      target,
      up: [0, 1, 0],
    };
  }
  if (view === "top") {
    const distance = Math.max(
      NAMED_VIEW_MIN_DISTANCE,
      requiredCameraDistance(widthM, depthM, aspectRatio, NAMED_VIEW_FRAME_MARGIN),
    );
    return {
      position: [0, targetY + heightM / 2 + distance, 0.001],
      target,
      up: [0, 0, -1],
    };
  }
  const distance = Math.max(
    2.4,
    requiredCameraDistance(
      Math.hypot(widthM, depthM),
      heightM,
      aspectRatio,
      PERSPECTIVE_FRAME_MARGIN,
    ),
    depthM * 2.5,
  );
  return {
    position: [distance * 0.72, targetY + distance * 0.38, -distance * 0.9],
    target,
    up: [0, 1, 0],
  };
}
