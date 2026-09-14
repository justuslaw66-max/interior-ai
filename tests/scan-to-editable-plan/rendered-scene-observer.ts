import type { Page } from "@playwright/test";
import type { RootState } from "@react-three/fiber";
import type { Object3D, BufferGeometry } from "three";

/** Test-only DevTools observer. It reads the real renderer; it does not author scene or document state. */
export async function observeRenderedScene(page: Page) {
  await page.addInitScript(() => {
    const roots = new Set<object>(), renderers = new Map<number, unknown>();
    const pointerEvents: { type: string; x: number; y: number }[] = [];
    for (const type of ["pointerdown", "pointermove", "pointerup"] as const) window.addEventListener(type, (event) => {
      pointerEvents.push({ type, x: event.clientX, y: event.clientY });
      if (pointerEvents.length > 32) pointerEvents.shift();
    }, true);
    Object.defineProperty(window, "__scanPlanPointerEvents", { value: pointerEvents });
    Object.defineProperty(window, "__scanPlanReactRoots", { value: roots });
    if ("__REACT_DEVTOOLS_GLOBAL_HOOK__" in window) throw new Error("The scene observer requires an isolated browser without another DevTools hook.");
    Object.defineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", { value: {
      supportsFiber: true, renderers,
      inject: (renderer: unknown) => { const id = renderers.size + 1; renderers.set(id, renderer); return id; },
      onCommitFiberRoot: (_id: number, root: object) => roots.add(root),
      onCommitFiberUnmount: () => undefined,
    } });
  });
}

type ObservedFiber = { stateNode?: unknown; child?: ObservedFiber | null; sibling?: ObservedFiber | null };
type SceneObject = Object3D & { geometry?: BufferGeometry; __r3f?: { root: { getState: () => RootState } } };

export async function renderedSceneObject(page: Page, query: { testId?: string; openingId?: string; itemId?: string; edge?: string; delta?: { x: number; z: number } }) {
  return page.evaluate(({ testId, openingId, itemId, edge, delta }) => {
    // The hook above receives React's root objects; validate scene candidates before reading Three methods.
    const host = window as typeof window & { __scanPlanReactRoots?: Set<{ current: ObservedFiber }>; __scanPlanPointerEvents?: { type: string; x: number; y: number }[] };
    const pending = [...(host.__scanPlanReactRoots ?? [])].map(({ current }) => current);
    const visited = new Set<ObservedFiber>(), objects = new Set<SceneObject>();
    while (pending.length && visited.size < 30_000) {
      const node = pending.pop()!;
      if (!node || visited.has(node)) continue;
      visited.add(node);
      if (node.child) pending.push(node.child);
      if (node.sibling) pending.push(node.sibling);
      const instance = node.stateNode;
      const value = instance && typeof instance === "object" && "object" in instance ? instance.object : instance;
      if (value && typeof value === "object" && "isObject3D" in value && value.isObject3D === true && "matrixWorld" in value) objects.add(value as SceneObject);
    }
    const object = [...objects].find((candidate) => itemId ? candidate.userData.sceneDemandItemId === itemId :
      candidate.userData.testId === testId && candidate.userData.canonicalOpeningId === openingId && (!edge || candidate.userData.canonicalResizeEdge === edge));
    if (!object?.__r3f) return null;
    for (let ancestor: Object3D | null = object; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return null;
    const state = object.__r3f.root.getState(), bounds = state.gl.domElement.getBoundingClientRect();
    const world = object.position.clone().setFromMatrixPosition(object.matrixWorld);
    const target = world.clone(); target.x += delta?.x ?? 0; target.z += delta?.z ?? 0;
    const screen = (point: typeof world) => {
      const projected = point.clone().project(state.camera);
      return { x: bounds.left + (projected.x + 1) * bounds.width / 2, y: bounds.top + (1 - projected.y) * bounds.height / 2 };
    };
    const symbols = [...objects].filter((candidate) => candidate.userData.testId === "canonical-opening-symbol-3d" && candidate.userData.canonicalOpeningId === openingId);
    const meshBounds = (candidate: SceneObject) => {
      const positions = candidate.geometry?.getAttribute("position"), point = candidate.position.clone();
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      if (!positions) return null;
      for (let index = 0; index < positions.count; index += 1) {
        point.set(positions.getX(index), positions.getY(index), positions.getZ(index)).applyMatrix4(candidate.matrixWorld);
        point.toArray().forEach((value, axis) => { min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value); });
      }
      return { min, max, vertices: positions.count, userData: candidate.userData };
    };
    const wallSolids = [...objects].filter((candidate) => candidate.userData.testId === "canonical-wall-3d" && candidate.userData.canonicalWallId === object.userData.canonicalWallId).map(meshBounds);
    const wallBodies = [...objects].filter((candidate) => candidate.userData.testId === "canonical-wall-body-3d").map(meshBounds);
    return { pointerEvents: host.__scanPlanPointerEvents, wallSolids, wallBodies, screen: screen(world), target: screen(target), world: world.toArray(), userData: object.userData,
      symbols: symbols.map(({ userData }) => userData), camera: { position: state.camera.position.toArray(), quaternion: state.camera.quaternion.toArray(), matrix: state.camera.projectionMatrix.toArray() } };
  }, query);
}

export const renderedOpening = renderedSceneObject;
