import type { MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

type CameraCaptureProps = {
  cameraRef: MutableRefObject<THREE.Camera | null>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
};

export function CameraCapture({
  cameraRef,
  canvasRef,
  rendererRef,
  sceneRef,
}: CameraCaptureProps) {
  const { camera, gl, scene } = useThree();

  useFrame(() => {
    cameraRef.current = camera as THREE.Camera;
    rendererRef.current = gl as THREE.WebGLRenderer;
    sceneRef.current = scene;
    canvasRef.current = gl.domElement as HTMLCanvasElement;
  });

  return null;
}
