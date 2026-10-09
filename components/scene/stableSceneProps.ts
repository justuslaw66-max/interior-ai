/**
 * R3F applies every host prop whose identity changed and then draws a frame,
 * even when the new value means the same thing. So scene meshes pass the same
 * raycast stand-in and user data on every render, and a page re-render that
 * changes nothing in the scene doesn't redraw it.
 */

/** For meshes that must not be picked. One function, unlike an inline `() => null`. */
export const noRaycast = () => null;
