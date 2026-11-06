import type { ThreeEvent } from "@react-three/fiber";
import { Mesh } from "three";

export { noRaycast } from "@/components/scene/stableSceneProps";

/** A click or pointer event on an imported plan's wall, surface or opening. */
export type CanonicalPointerEvent = ThreeEvent<MouseEvent | PointerEvent>;
// R3F 9 skips a prop that becomes undefined, so turning picking back on must pass the default raycast.
export const meshRaycast = Mesh.prototype.raycast;
