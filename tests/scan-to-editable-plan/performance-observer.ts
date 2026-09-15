import type { Page } from "@playwright/test";
import type { RootState } from "@react-three/fiber";
import type { Object3D } from "three";

type PointerSample = { timestamp: number; durationMs: number };
type PerformanceEvidence = { active: boolean; pointer: PointerSample[]; renderMs: number[] };
type Fiber = { stateNode?: unknown; child?: Fiber | null; sibling?: Fiber | null };
type SceneObject = Object3D & { __r3f?: { root: { getState: () => RootState } } };
type ObservedWindow = typeof window & { __scanPlanPerformance: PerformanceEvidence; __scanPlanReactRoots?: Set<{ current: Fiber }> };

/** Instruments real event callbacks in the isolated test browser; never changes a document or pointer event. */
export async function observePointerPerformance(page: Page) {
  await page.addInitScript(() => {
    const samples: PerformanceEvidence = { active: false, pointer: [], renderMs: [] };
    Object.defineProperty(window, "__scanPlanPerformance", { value: samples });
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    const wrapped = new WeakMap<EventListenerOrEventListenerObject, EventListener>();
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (!listener || type !== "pointermove") return add.call(this, type, listener, options);
      let callback = wrapped.get(listener);
      if (!callback) {
        callback = function(this: EventTarget, event) {
          const start = performance.now();
          try { if (typeof listener === "function") listener.call(this, event); else listener.handleEvent(event); }
          finally {
            if (samples.active && event.isTrusted && event.target instanceof Element &&
              event.target.closest('[data-testid="scene-canvas"],[data-testid^="canonical-wall-drag-"]')) {
              samples.pointer.push({ timestamp: event.timeStamp, durationMs: performance.now() - start });
            }
          }
        };
        wrapped.set(listener, callback);
      }
      return add.call(this, type, callback, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      return remove.call(this, type, type === "pointermove" && listener ? wrapped.get(listener) ?? listener : listener, options);
    };
  });
}

/** Read the real R3F renderer through the existing test-only DevTools observer. */
export async function rendererPerformance(page: Page, install = false) {
  return page.evaluate((install) => {
    const host = window as ObservedWindow;
    const pending = [...(host.__scanPlanReactRoots ?? [])].map(({ current }) => current), visited = new Set<Fiber>();
    let state: RootState | undefined;
    while (pending.length && visited.size < 30_000) {
      const node = pending.pop()!;
      if (!node || visited.has(node)) continue;
      visited.add(node); if (node.child) pending.push(node.child); if (node.sibling) pending.push(node.sibling);
      const instance = node.stateNode;
      const value = instance && typeof instance === "object" && "object" in instance ? instance.object : instance;
      if (!value || typeof value !== "object" || !("isObject3D" in value) || value.isObject3D !== true) continue;
      const object = value as SceneObject, current = object.__r3f?.root.getState();
      if (current && current.scene.getObjectById(object.id) === object) { state = current; break; }
    }
    if (!state) return null;
    const gl = state.gl;
    if (install) {
      const render = gl.render;
      gl.render = function(...args: Parameters<typeof render>) {
        const start = performance.now();
        try { return render.apply(this, args); }
        finally { if (host.__scanPlanPerformance.renderMs.length < 10000) host.__scanPlanPerformance.renderMs.push(performance.now() - start); }
      };
    }
    const walls = new Set<string>(), openings = new Set<string>();
    state.scene.traverse((object) => {
      if (object.userData.testId === "canonical-wall-3d") walls.add(object.userData.canonicalWallId);
      if (object.userData.testId === "canonical-opening-symbol-3d") openings.add(object.userData.canonicalOpeningId);
    });
    const direction = state.camera.getWorldDirection(state.camera.position.clone());
    return { camera: { x: state.camera.position.x, y: state.camera.position.y, z: state.camera.position.z }, viewDirection: { x: direction.x, z: direction.z },
      geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length,
      drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles, wallIds: [...walls].sort(), openingIds: [...openings].sort() };
  }, install);
}

export async function pointerAndRenderSamples(page: Page) {
  return page.evaluate(() => {
    const samples = (window as ObservedWindow).__scanPlanPerformance;
    const events = new Map<number, number>();
    for (const sample of samples.pointer) events.set(sample.timestamp, (events.get(sample.timestamp) ?? 0) + sample.durationMs);
    return { pointerHandlerMs: [...events.values()], renderCpuMs: samples.renderMs, pointerCallbacks: samples.pointer.length };
  });
}
