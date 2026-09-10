import type { Material, Object3D, WebGLRenderer } from "three";
import { WINDOW_RENDER_LIMIT, WINDOW_RENDER_SCHEMA } from "@/scripts/window-rendering-attribution-constants.cjs";

type Target = Parameters<WebGLRenderer["setRenderTarget"]>[0];
type Frame = { id: number; parent: number; generatedCalls: number; generatedDraws: number; otherTransmissiveCalls: number; allDirectCalls: number; targetSwitches: number; directMs: number };
type Fields = Record<string, number | boolean>;
type Observer = { gl: WebGLRenderer; id: number; frame: Frame | null; nextFrame: number; targets: WeakMap<NonNullable<Target>, number>; nextTarget: number; materials: Set<string> };
const installed = new WeakSet<WebGLRenderer>();
const budget = { events: 0, omitted: 0, errors: 0, observerMs: 0, materialOmissions: 0, nextRenderer: 0 };

function observe(callback: () => void) {
  const start = performance.now();
  try { callback(); } catch { budget.errors++; }
  finally { budget.observerMs += performance.now() - start; }
}
function emit(state: Observer, event: string, fields: Fields = {}) {
  if (budget.events > WINDOW_RENDER_LIMIT) { budget.omitted++; return; }
  if (budget.events === WINDOW_RENDER_LIMIT) { event = "limit"; fields = {}; budget.omitted++; }
  budget.events++;
  console.info("[window-render-attribution]", JSON.stringify({
    schema: WINDOW_RENDER_SCHEMA, event, sequence: budget.events,
    timeOriginMs: performance.timeOrigin, observedAtMs: performance.now(),
    rendererId: state.id, frame: state.frame?.id ?? 0,
    observerMs: budget.observerMs, observerErrors: budget.errors,
    omitted: budget.omitted, omittedIsLowerBound: budget.events > WINDOW_RENDER_LIMIT, materialOmissions: budget.materialOmissions, ...fields,
  }));
}
function targetFields(state: Observer, target: Target = state.gl.getRenderTarget()) {
  if (!target) return { targetId: 0, width: state.gl.domElement.width, height: state.gl.domElement.height };
  let id = state.targets.get(target);
  if (id === undefined) { id = ++state.nextTarget; state.targets.set(target, id); }
  return { targetId: id, width: target.width, height: target.height };
}
function materialIdentity(material: Material) {
  if (!("id" in material) || typeof material.id !== "number") throw new Error("material-identity");
  return material.id;
}
function materialFields(state: Observer, object: Object3D, material: Material) {
  return { objectId: object.id, materialId: materialIdentity(material),
    transmission: "transmission" in material && typeof material.transmission === "number" ? material.transmission : 0,
    side: material.side, ...targetFields(state) };
}
function generated(object: Object3D, material: Material) {
  return object.userData.testId === "generated-window-glass-3d" &&
    "isMeshPhysicalMaterial" in material && material.isMeshPhysicalMaterial === true;
}
function firstMaterial(state: Observer, object: Object3D, material: Material) {
  const key = `${object.id}:${materialIdentity(material)}`;
  if (state.materials.has(key)) return false;
  if (state.materials.size >= 64) { budget.materialOmissions++; return false; }
  state.materials.add(key); return true;
}
function instrumentDirect(state: Observer) {
  const original = state.gl.renderBufferDirect;
  state.gl.renderBufferDirect = function (...args: Parameters<typeof original>) {
    const [, , , material, object] = args;
    const frame = state.frame; let targeted = false; let record = false;
    observe(() => {
      targeted = generated(object, material);
      if (frame) { frame.allDirectCalls++; if (targeted) frame.generatedCalls++; }
      if (targeted) { const fresh = firstMaterial(state, object, material); record = fresh || frame?.generatedCalls === 1; }
      if (record) emit(state, "generated-enter", materialFields(state, object, material));
      if (!targeted && "transmission" in material && typeof material.transmission === "number" && material.transmission > 0) {
        if (frame) frame.otherTransmissiveCalls++;
        if (firstMaterial(state, object, material)) emit(state, "other-transmissive", materialFields(state, object, material));
      }
    });
    const before = state.gl.info.render.calls; const start = performance.now(); let completed = false;
    try { const result = original.apply(this, args); completed = true; return result; }
    finally {
      const durationMs = performance.now() - start;
      observe(() => {
        const drawDelta = Math.max(0, state.gl.info.render.calls - before);
        if (frame) { frame.directMs += durationMs; if (targeted) frame.generatedDraws += drawDelta; }
        if (record) emit(state, "generated-exit", { ...materialFields(state, object, material), completed, drawDelta, durationMs });
      });
    }
  };
}
function instrumentTargets(state: Observer) {
  const original = state.gl.setRenderTarget;
  state.gl.setRenderTarget = function (...args: Parameters<typeof original>) {
    observe(() => {
      if (state.frame) state.frame.targetSwitches++;
      emit(state, "target-enter", targetFields(state, args[0]));
    });
    const start = performance.now(); let completed = false;
    try { const result = original.apply(this, args); completed = true; return result; }
    finally { const durationMs = performance.now() - start; observe(() => emit(state, "target-exit", { ...targetFields(state), completed, durationMs })); }
  };
}
function instrumentRender(state: Observer) {
  const original = state.gl.render;
  state.gl.render = function (...args: Parameters<typeof original>) {
    const parent = state.frame;
    const frame: Frame = { id: ++state.nextFrame, parent: parent?.id ?? 0, generatedCalls: 0, generatedDraws: 0, otherTransmissiveCalls: 0, allDirectCalls: 0, targetSwitches: 0, directMs: 0 };
    state.frame = frame;
    observe(() => emit(state, "render-enter", { parentFrame: frame.parent, ...targetFields(state) }));
    const start = performance.now(); let completed = false;
    try { const result = original.apply(this, args); completed = true; return result; }
    finally {
      const durationMs = performance.now() - start;
      observe(() => emit(state, "render-exit", { parentFrame: frame.parent, completed, durationMs,
        generatedCalls: frame.generatedCalls, generatedDraws: frame.generatedDraws,
        otherTransmissiveCalls: frame.otherTransmissiveCalls, allDirectCalls: frame.allDirectCalls,
        targetSwitches: frame.targetSwitches, directMs: frame.directMs, ...targetFields(state) }));
      state.frame = parent;
    }
  };
}
// Diagnostic source only. No global material mutation, added frames, GPU waits or timer.
export function installWindowRenderingAttribution(gl: WebGLRenderer) {
  if (installed.has(gl)) return;
  observe(() => {
    const state: Observer = { gl, id: ++budget.nextRenderer, frame: null, nextFrame: 0,
      targets: new WeakMap(), nextTarget: 0, materials: new Set() };
    instrumentDirect(state); instrumentTargets(state); instrumentRender(state);
    installed.add(gl); emit(state, "installed", targetFields(state));
  });
}
