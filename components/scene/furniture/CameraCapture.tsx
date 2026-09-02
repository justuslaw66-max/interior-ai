import { useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

type CameraCaptureProps = {
  cameraRef: MutableRefObject<THREE.Camera | null>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
};

type QaCameraState = {
  px: number; py: number; pz: number;
  qx: number; qy: number; qz: number; qw: number;
  tx: number; ty: number; tz: number;
  zoom: number; fov: number | null;
};

function positionChanged(previous: QaCameraState, camera: THREE.Camera) {
  return previous.px !== camera.position.x || previous.py !== camera.position.y ||
    previous.pz !== camera.position.z;
}

function quaternionChanged(previous: QaCameraState, camera: THREE.Camera) {
  return previous.qx !== camera.quaternion.x || previous.qy !== camera.quaternion.y ||
    previous.qz !== camera.quaternion.z || previous.qw !== camera.quaternion.w;
}

function targetChanged(previous: QaCameraState, target: THREE.Vector3 | undefined) {
  return previous.tx !== (target?.x ?? 0) || previous.ty !== (target?.y ?? 0) ||
    previous.tz !== (target?.z ?? 0);
}

function cameraStateChanged(
  previous: QaCameraState | null,
  camera: THREE.Camera,
  target: THREE.Vector3 | undefined,
  zoom: number,
  fov: number | null
) {
  if (!previous) return true;
  if (positionChanged(previous, camera)) return true;
  if (quaternionChanged(previous, camera)) return true;
  if (targetChanged(previous, target)) return true;
  return previous.zoom !== zoom || previous.fov !== fov;
}

function cameraClip(camera: THREE.Camera) {
  if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
    return { near: camera.near, far: camera.far };
  }
  return null;
}

function updateQaCameraState(
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  controls: OrbitControlsImpl | null,
  last: MutableRefObject<QaCameraState | null>
) {
  const target = controls?.target;
  const zoom = "zoom" in camera && typeof camera.zoom === "number" ? camera.zoom : 1;
  const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : null;
  const clip = cameraClip(camera);
  if (!clip) return;
  if (!cameraStateChanged(last.current, camera, target, zoom, fov)) return;
  last.current = {
    px: camera.position.x, py: camera.position.y, pz: camera.position.z,
    qx: camera.quaternion.x, qy: camera.quaternion.y,
    qz: camera.quaternion.z, qw: camera.quaternion.w,
    tx: target?.x ?? 0, ty: target?.y ?? 0, tz: target?.z ?? 0,
    zoom, fov,
  };
  canvas.dataset.qaCameraState = JSON.stringify({
    projection: camera instanceof THREE.OrthographicCamera ? "orthographic" : "perspective",
    position: [camera.position.x, camera.position.y, camera.position.z],
    quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
    target: [target?.x ?? 0, target?.y ?? 0, target?.z ?? 0],
    zoom, fov, near: clip.near, far: clip.far,
  });
  document.documentElement.dataset.qaCameraState = canvas.dataset.qaCameraState;
}

export function CameraCapture({
  cameraRef,
  canvasRef,
  controlsRef,
  rendererRef,
  sceneRef,
}: CameraCaptureProps) {
  const { camera, gl, scene } = useThree();
  const lastQaState = useRef<QaCameraState | null>(null);

  useFrame(() => {
    cameraRef.current = camera as THREE.Camera;
    rendererRef.current = gl as THREE.WebGLRenderer;
    sceneRef.current = scene;
    canvasRef.current = gl.domElement;
    if (process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS !== "1") return;
    updateQaCameraState(camera, gl.domElement, controlsRef.current, lastQaState);
  });

  return null;
}
