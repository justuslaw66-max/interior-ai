import type { GLBModelTerminalErrorCategory } from "./modelLifecycleTypes";

export class GLBSourceLoadError extends Error {
  readonly category: GLBModelTerminalErrorCategory;

  constructor(category: GLBModelTerminalErrorCategory) {
    super(category);
    this.name = "GLBSourceLoadError";
    this.category = category;
  }
}

export function categorizeGLBBoundsFailure(error: unknown) {
  return error instanceof GLBSourceLoadError
    ? error
    : new GLBSourceLoadError("glb-bounds-failed");
}
