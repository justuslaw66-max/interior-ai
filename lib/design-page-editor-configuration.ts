import type { CameraView } from "@/lib/design-page-types";

export const DEFAULT_EDITOR_CAMERA_VIEW: CameraView = {
  pos: [6.2, 3.6, 7.2],
  target: [0, 1.0, 0],
  fov: 45,
};

export const EDITOR_3D_MIN_CAMERA_DISTANCE = 1.4;
export const EDITOR_3D_MIN_POLAR_ANGLE = 0.02;
export const EDITOR_3D_MAX_POLAR_ANGLE = Math.PI - 0.02;

export const PLAN_FLOATING_OVERLAY_DESKTOP_MIN_WIDTH = 1024;
export const PLAN_FLOATING_OVERLAY_STACK_RIGHT_PX = 4;
export const PLAN_FLOATING_OVERLAY_INSPECTOR_STACK_TOP_PX = 304;
export const PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX = 264;
export const PLAN_FLOATING_OVERLAY_STACK_GAP_PX = 8;

export const SIMPLE_PLAN_LAYERS = {
  grid: false,
  dimensions: true,
  labels: true,
  openings: true,
  builtIns: true,
  zones: false,
  annotations: false,
};
