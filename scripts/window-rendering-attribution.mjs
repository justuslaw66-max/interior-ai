export const WINDOW_RENDER_SCHEMA = 'interior-ai.window-rendering-attribution.v1';
export const WINDOW_RENDER_MARKER = '[window-render-attribution] ';
export const WINDOW_RENDER_LIMIT = 2048;
export const WINDOW_RENDER_EVENTS = Object.freeze(['installed', 'render-enter', 'render-exit', 'target-enter', 'target-exit', 'generated-enter', 'generated-exit', 'other-transmissive', 'limit', 'observer-error']);
const base = ['sequence','timeOriginMs','observedAtMs','rendererId','frame','observerMs','observerErrors','omitted','materialOmissions','omittedIsLowerBound'];
const target = ['targetId','width','height'];
const material = ['objectId','materialId','transmission','side',...target];
const fields = {
  installed: target,
  'render-enter': ['parentFrame',...target],
  'render-exit': ['parentFrame','completed','durationMs','generatedCalls','generatedDraws','otherTransmissiveCalls','allDirectCalls','targetSwitches','directMs',...target],
  'target-enter': target,
  'target-exit': ['completed','durationMs',...target],
  'generated-enter': material,
  'generated-exit': ['completed','drawDelta','durationMs',...material],
  'other-transmissive': material,
  limit: [],
  'observer-error': [],
};
const fractions = new Set(['timeOriginMs','observedAtMs','observerMs','durationMs','directMs','transmission']);
const booleans = new Set(['completed','omittedIsLowerBound']);
export function projectWindowRenderObservation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== WINDOW_RENDER_SCHEMA || !WINDOW_RENDER_EVENTS.includes(value.event)) return null;
  const keys = ['schema','event',...base,...fields[value.event]];
  if (Object.keys(value).length !== keys.length || keys.some(key=>!Object.hasOwn(value,key))) return null;
  for (const key of keys.slice(2)) {
    if (booleans.has(key)) { if (typeof value[key] !== 'boolean') return null; }
    else if (!Number.isFinite(value[key]) || value[key]<0 || value[key]>Number.MAX_SAFE_INTEGER || (!fractions.has(key)&&!Number.isSafeInteger(value[key]))) return null;
  }
  if (value.sequence<1 || value.sequence>WINDOW_RENDER_LIMIT+1 || value.rendererId<1 || value.timeOriginMs<=0) return null;
  if (value.event.startsWith('render-') && (value.frame<1 || value.parentFrame>=value.frame)) return null;
  if (Object.hasOwn(value,'transmission') && value.transmission>1 || Object.hasOwn(value,'side') && ![0,1,2].includes(value.side)) return null;
  if (value.event==='limit' && (!value.omittedIsLowerBound||value.omitted<1) || value.event==='observer-error'&&value.observerErrors<1) return null;
  return Object.fromEntries(keys.map(key=>[key,value[key]]));
}
export function forwardWindowRenderObservation(text, write = value => console.info('[window-render-attribution-observation]', JSON.stringify(value))) {
  if (!text.startsWith(WINDOW_RENDER_MARKER)) return false;
  try {
    const value = text.length <= 4096 ? projectWindowRenderObservation(JSON.parse(text.slice(WINDOW_RENDER_MARKER.length))) : null;
    if (value) write(value);
    else console.info('[window-render-attribution-invalid]', '{"schema":"interior-ai.window-rendering-attribution-invalid.v1"}');
  } catch {
    // Never add a fatal error or change the original runtime outcome.
    try { console.info('[window-render-attribution-invalid]', '{"schema":"interior-ai.window-rendering-attribution-invalid.v1"}'); } catch { /* Original owner remains authoritative. */ }
  }
  return true;
}

export function recordWindowAdmission(phaseName, stage) {
  if (!['bounds-verification', 'remount', 'reload-1', 'reload-2', 'reload-3'].includes(phaseName) || !['reload-start', 'admission-start', 'admission-ready'].includes(stage)) return;
  try { console.info('[window-render-admission]', JSON.stringify({ schema: 'interior-ai.window-render-admission.v1', phaseName, stage })); } catch { /* Observation does not replace an owner failure. */ }
}
export function forwardWindowClock(text) {
  const prefix = '[window-render-clock] ';
  if (!text.startsWith(prefix)) return;
  try {
    const value = text.length < 1024 ? JSON.parse(text.slice(prefix.length)) : null;
    if (value?.schema !== 'interior-ai.window-render-clock.v1' || Object.keys(value).sort().join(',') !== 'observedAtMs,schema,timeOriginMs' || ![value.observedAtMs,value.timeOriginMs].every(n=>Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER)) throw new Error('clock');
    console.info('[window-render-clock-observation]', JSON.stringify(value));
  } catch { try { console.info('[window-render-attribution-invalid]', '{"schema":"interior-ai.window-rendering-attribution-invalid.v1"}'); } catch { /* Original outcome remains authoritative. */ } }
}
