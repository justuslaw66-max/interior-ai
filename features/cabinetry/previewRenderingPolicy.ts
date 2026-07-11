/**
 * The Studio preview has no ground plane that needs projected shadows. Cabinet
 * parts are densely packed box meshes, so enabling a low-resolution directional
 * shadow map causes triangle-shaped self-shadowing (shadow acne) across otherwise
 * flat fronts. Keep material lighting enabled, but do not allocate or sample a
 * shadow map in this compact preview.
 */
export const CABINET_PREVIEW_RENDERING_POLICY = Object.freeze({
  shadowMapsEnabled: false,
  directionalLightCastsShadow: false,
});
