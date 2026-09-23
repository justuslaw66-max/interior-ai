import * as THREE from "three";

import { GLBSourceLoadError } from "./glbSourceLoadError";
import {
  isValidGLBLocalRenderBounds,
  type GLBLocalRenderBounds,
} from "./localRenderBounds";

export function measureGLBLocalRenderBounds(
  normalizedModel: THREE.Object3D
): GLBLocalRenderBounds {
  const detachedModel = normalizedModel.clone(true);
  detachedModel.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(detachedModel, true);
  if (bounds.isEmpty()) throw new GLBSourceLoadError("glb-empty-bounds");
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bounds.getCenter(center);
  bounds.getSize(size);
  const localRenderBounds: GLBLocalRenderBounds = {
    center: [center.x, center.y, center.z],
    size: [size.x, size.y, size.z],
  };
  if (!isValidGLBLocalRenderBounds(localRenderBounds)) {
    throw new GLBSourceLoadError("glb-bounds-failed");
  }
  return localRenderBounds;
}
