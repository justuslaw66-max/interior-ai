// Separate from exact cleanup. An incomplete observation never spends B.
export function assessMaterialObservation(outcome, validate) {
  const streams = [outcome.stdout, outcome.stderr];
  const events = streams.flatMap(stream => stream?.events ?? []).sort((a,b) => a.hostReceiptSequence-b.hostReceiptSequence);
  const values = events.map(event=>event.value);
  let rejected = typeof validate !== 'function' || streams.some(stream => !stream || stream.counters.capped > 0 || stream.counters.malformed > 0);
  for (const v of values) {
    if (v.kind==='window-render-invalid') rejected=true;
    if (v.kind!=='window-render') continue;
    const {kind,...payload}=v;
    try { if (!validate?.(payload)) rejected=true; } catch { rejected=true; }
    if (v.event==='limit'||v.observerErrors>0||v.omitted>0) rejected=true;
  }
  const start = values.findIndex(v=>v.kind==='window-admission'&&v.phaseName==='reload-1'&&v.stage==='reload-start');
  const end = values.findIndex((v,i)=>i>start&&v.kind==='window-admission'&&v.stage==='reload-start');
  const generation = start < 0 ? [] : values.slice(start+1,end<0?undefined:end);
  const clocks = generation.filter(v=>v.kind==='window-clock');
  const admission = generation.findIndex(v=>v.kind==='window-admission'&&v.phaseName==='reload-1'&&v.stage==='admission-start');
  const clock = clocks.length===1 ? clocks[0] : null;
  const clockIndex=generation.indexOf(clock);
  const heartbeatIndex=generation.findIndex(v=>v.kind==='heartbeat'&&v.heartbeatKind==='started');
  const heartbeatStarted=clockIndex>=0&&heartbeatIndex>clockIndex&&heartbeatIndex<admission;
  const document = generation.filter(v=>v.kind==='window-render'&&v.timeOriginMs===clock?.timeOriginMs);
  if (document.some((v,index)=>v.sequence!==index+1||index>0&&v.observedAtMs<document[index-1].observedAtMs)) rejected=true;
  const installed = document.some(v=>v.event==='installed'&&v.observedAtMs>=clock?.observedAtMs);
  const draws=document.filter((v,index)=>{
    if (v.event!=='generated-exit'||v.transmission!==0.5||!(v.drawDelta>0)||v.completed!==true||!Number.isSafeInteger(v.frame)||v.frame<1||!(v.width>0&&v.height>0)) return false;
    const before=document.slice(0,index);const after=document.slice(index+1);
    const entry=before.findLast(e=>e.event==='generated-enter'&&e.rendererId===v.rendererId&&e.frame===v.frame&&e.objectId===v.objectId&&e.materialId===v.materialId);
    if (!entry||entry.transmission!==v.transmission||entry.side!==v.side||entry.targetId!==v.targetId||entry.width!==v.width||entry.height!==v.height||entry.observedAtMs>v.observedAtMs||v.durationMs>v.observedAtMs-entry.observedAtMs+0.001) return false;
    const render=before.find(e=>e.event==='render-enter'&&e.rendererId===v.rendererId&&e.frame===v.frame&&e.sequence<entry.sequence);
    const finish=after.find(e=>e.event==='render-exit'&&e.rendererId===v.rendererId&&e.frame===v.frame&&e.completed===true&&e.generatedDraws>=v.drawDelta&&e.generatedCalls>0);
    return Boolean(render&&finish&&before.some(e=>e.event==='installed'&&e.rendererId===v.rendererId&&e.sequence<render.sequence));
  });
  return { schema:'window-material-comparison-admission.v1', meaningful: !rejected&&installed&&heartbeatStarted&&admission>clockIndex&&draws.length>0&&clock!==null,
    rejectedObservation:rejected, reloadStartObserved:start>=0, admissionStartObserved:admission>=0, uniqueClock:clock!==null, observerInstalled:installed, heartbeatStarted,
    targetedCompletedDrawObservations:draws.length, generatedMaterialCount:new Set(draws.map(v=>`${v.rendererId}:${v.materialId}`)).size,
    timeOriginMs:clock?.timeOriginMs??null, scope:'reload-1-generation-including-admission; not-proof-of-GPU-time-or-admission-overlap' };
}
