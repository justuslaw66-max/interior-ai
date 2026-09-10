import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { createProjection } from './projection.mjs';
import { createStreamProjection } from './process-capture.mjs';
import { assessMaterialObservation as assessActual } from './render-observation.mjs';
import { serialPair, FOUNDATIONS } from './campaign.mjs';
const root = path.resolve(path.dirname(import.meta.filename),'../../../..');
const a = path.join(root,'a-source'); const b = path.join(root,'b-source');
const req = createRequire(path.join(a,'package.json')); const ts=req('typescript'); const THREE=req('three');
const schema = await import(pathToFileURL(path.join(a,'scripts/window-rendering-attribution.mjs')).href);
const {FURNISHED_TEMPLATE_PHASE_CONTRACTS:contracts} = await import(pathToFileURL(path.join(a,'scripts/runtime-smoke-operation-contracts.mjs')).href);
const validators = {...await import(pathToFileURL(path.join(a,'scripts/runtime-smoke-browser-diagnostics.mjs')).href),...schema};
const assessMaterialObservation = outcome => assessActual(outcome,schema.projectWindowRenderObservation);
const projection=createProjection(contracts,[],validators);
const sentinel='PRIVATE_TOKEN_DOM_UNRELATED';
function moduleAt(source,name,logger=()=>{}) {
  const input=fs.readFileSync(path.join(source,name),'utf8');
  const code=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const context={exports:{},performance,console:{info:logger},require:id=>id==='@/scripts/window-rendering-attribution-constants.cjs'?req(path.join(source,'scripts/window-rendering-attribution-constants.cjs')):req(id)};
  vm.runInNewContext(code,context,{timeout:1000});return context.exports;
}
function glass(source) {
  const component=moduleAt(source,'components/editor/renderers/GeneratedWindowFrame3D.tsx').GeneratedWindowFrame3D;
  const tree=component({widthMeters:1.4,heightMeters:1.2,wallDepthMeters:.12});
  const nodes=[];
  function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){if(n.type==='meshPhysicalMaterial')nodes.push(n.props);walk(n.props?.children);}}
  walk(tree);assert.equal(nodes.length,1);
  return new THREE.MeshPhysicalMaterial(nodes[0]);
}
function fixture(source=a,throwLog=false) {
  const events=[];const forward=[];
  const logger=(prefix,text)=>{if(throwLog)throw new Error(sentinel);events.push(JSON.parse(text));schema.forwardWindowRenderObservation(prefix+' '+text,v=>forward.push(v));};
  const material=glass(source);const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);mesh.userData.testId='generated-window-glass-3d';
  const otherMaterial=new THREE.MeshPhysicalMaterial({transmission:.7,side:THREE.DoubleSide});otherMaterial.userData.secret=sentinel;
  const other=new THREE.Mesh(mesh.geometry,otherMaterial);other.userData.testId=sentinel;
  const target=new THREE.WebGLRenderTarget(640,480);let current=null;let throwRender=null;let throwDirect=null;let draw=true;
  const gl={domElement:{width:1280,height:960},info:{render:{calls:0}},getRenderTarget(){return current;},
    setRenderTarget(value){assert.equal(this,gl);current=value;return 'target-result';},
    renderBufferDirect(camera,scene,geometry,mat,object,group){assert.equal(this,gl);assert.equal(group,null);if(throwDirect)throw throwDirect;if(draw)gl.info.render.calls++;return 'direct-result';},
    render(scene,camera){assert.equal(this,gl);if(throwRender)throw throwRender;
      gl.info.render.calls=0;gl.setRenderTarget(target);
      gl.renderBufferDirect(camera,scene,mesh.geometry,otherMaterial,other,null);
      gl.renderBufferDirect(camera,scene,mesh.geometry,material,mesh,null);
      gl.setRenderTarget(null);gl.renderBufferDirect(camera,scene,mesh.geometry,material,mesh,null);return 'render-result';}};
  const observer=moduleAt(source,'components/editor/design-page/windowRenderingAttribution.ts',logger);
  observer.installWindowRenderingAttribution(gl);
  return {gl,observer,events,forward,mesh,material,otherMaterial,target,
    throwRender(value){throwRender=value;},throwDirect(value){throwDirect=value;},draw(value){draw=value;}};
}
test('actual A/B element settings and observer preserve all properties except targeted side',()=>{
  const observed=fixture(a), counterfactual=fixture(b);
  assert.equal(observed.material.transmission,.5);assert.equal(counterfactual.material.transmission,.5);
  assert.equal(observed.material.side,THREE.DoubleSide);assert.equal(counterfactual.material.side,THREE.FrontSide);
  for(const key of ['opacity','roughness','thickness','depthWrite','transparent'])assert.equal(observed.material[key],counterfactual.material[key]);
  for(const f of [observed,counterfactual]){
    const before=f.otherMaterial.toJSON();
    assert.equal(f.gl.render({},{}),'render-result');
    assert.deepEqual(f.otherMaterial.toJSON(),before);assert.equal(f.otherMaterial.transmission,.7);
    assert.equal(f.events.some(e=>JSON.stringify(e).includes(sentinel)),false);
    const entry=f.events.find(e=>e.event==='generated-enter');const exit=f.events.find(e=>e.event==='generated-exit');
    assert.equal(entry.objectId,f.mesh.id);assert.equal(entry.materialId,f.material.id);assert.equal(exit.drawDelta,1);assert.equal(exit.completed,true);
    assert.equal(entry.transmission,f.material.transmission);assert.equal(entry.side,f.material.side);
    assert.equal(entry.targetId>0,true);assert.equal(entry.width,640);assert.equal(entry.height,480);
    const render=f.events.find(e=>e.event==='render-exit');assert.equal(render.generatedCalls,2);assert.equal(render.generatedDraws,2);assert.equal(render.otherTransmissiveCalls,1);assert.equal(render.allDirectCalls,3);
    assert.equal(f.events.filter(e=>e.event==='other-transmissive').length,1);
    assert.equal(f.forward.length,f.events.length);assert.ok(f.events.every(e=>schema.projectWindowRenderObservation(e)!==null));
  }
  const behavior=f=>f.events.map(e=>e.event);
  assert.deepEqual(behavior(observed),behavior(counterfactual));
});
test('drawing distinguishes material-function entry from actual draw-counter increments',()=>{
  const f=fixture();f.draw(false);f.gl.render({},{});
  assert.equal(f.events.find(e=>e.event==='generated-exit').drawDelta,0);
  assert.equal(f.events.find(e=>e.event==='render-exit').generatedDraws,0);
});
test('original render/direct throws survive observer and logging failures without retries',()=>{
  for(const brokenLogger of [false,true]){
    const f=fixture(a,brokenLogger);const original=new Error('original-render');f.throwRender(original);
    assert.throws(()=>f.gl.render({},{}),error=>error===original);f.throwRender(null);
    const direct=new Error('original-direct');f.throwDirect(direct);assert.throws(()=>f.gl.render({},{}),error=>error===direct);
    if(!brokenLogger)assert.equal(f.events.filter(e=>e.event==='render-exit').at(-1).completed,false);
  }
});
test('installation is idempotent and recording caps without blocking underlying rendering',()=>{
  const f=fixture();const installed=f.gl.render;f.observer.installWindowRenderingAttribution(f.gl);assert.equal(f.gl.render,installed);
  for(let i=0;i<400;i++)assert.equal(f.gl.render({},{}),'render-result');
  assert.equal(f.events.length,schema.WINDOW_RENDER_LIMIT+1);assert.equal(f.events.at(-1).event,'limit');assert.ok(f.events.at(-1).omitted>0);assert.equal(f.events.at(-1).omittedIsLowerBound,true);
  assert.equal(f.gl.info.render.calls,3);
  assert.ok(f.events.at(-1).observerMs>=0);
  console.info('[local-window-observer-measurement]', JSON.stringify({fixture:'in-memory renderer stand-in, not GPU/browser',renderCalls:400,retainedEvents:f.events.length,observerMsAtCap:f.events.at(-1).observerMs,cap:schema.WINDOW_RENDER_LIMIT}));
});
test('source projection drops unknown/private fields and stream only retains safe structured observations',()=>{
  const f=fixture();f.gl.render({},{});const event=f.events.find(e=>e.event==='generated-exit');
  for(const input of [{...event,url:sentinel},{...event,materialId:sentinel},{...event,observedAtMs:NaN},{...event,event:sentinel},{...event,completed:sentinel}])assert.equal(schema.projectWindowRenderObservation(input),null);
  const stream=createStreamProjection(projection.event,()=>({hostReceiptSequence:1,hostReceiptElapsedMs:1}));
  stream.consume(Buffer.from('[window-render-attribution-observation] '+JSON.stringify({...event,secret:sentinel})+'\n'));
  const result=stream.finish();assert.equal(result.events[0].value.kind,'window-render-invalid');assert.equal(JSON.stringify(result).includes(sentinel),false);
});
function outcomeFrom(values) {return {stdout:{events:values.map((value,index)=>({hostReceiptSequence:index+1,value})),counters:{capped:0,malformed:0}},stderr:{events:[],counters:{capped:0,malformed:0}}};}
function meaningfulFixture(){
  const f=fixture();f.gl.render({},{});const origin=f.events[0].timeOriginMs;
  const values=[{kind:'window-admission',phaseName:'reload-1',stage:'reload-start'}, {kind:'window-clock',timeOriginMs:origin,observedAtMs:0}, {kind:'heartbeat',heartbeatKind:'started'},
    ...f.events.map(e=>({kind:'window-render',...e})),{kind:'window-admission',phaseName:'reload-1',stage:'admission-start'}];
  return outcomeFrom(values);
}
test('B requires actual targeted draw evidence in reload1 with installed observer/clock/admission and clean recording',()=>{
  const good=meaningfulFixture();assert.equal(assessMaterialObservation(good).meaningful,true);
  const values=good.stdout.events.map(e=>e.value);
  for(const mutated of [
    values.filter(v=>v.event!=='generated-enter'), values.filter(v=>v.event!=='generated-exit'),values.filter(v=>v.event!=='installed'),values.filter(v=>v.stage!=='admission-start'),
    values.map(v=>v.event==='generated-exit'?{...v,transmission:0}:v),values.map(v=>v.event==='generated-exit'?{...v,drawDelta:0}:v),values.map(v=>v.event==='generated-exit'?{...v,completed:false}:v),
    values.map(v=>v.event==='generated-exit'?{...v,timeOriginMs:v.timeOriginMs+1}:v),values.map(v=>v.kind==='window-render'?{...v,observerErrors:1}:v),
    [...values,{kind:'window-render-invalid'}],[...values,{kind:'window-render',event:'limit',omitted:1}], values.filter(v=>v.kind!=='window-clock'),
  ])assert.equal(assessMaterialObservation(outcomeFrom(mutated)).meaningful,false);
  const capped=structuredClone(good);capped.stdout.counters.capped=1;assert.equal(assessMaterialObservation(capped).meaningful,false);
});
test('material gating supplements exact cleanup and cannot authorize B after an unsafe A',async()=>{
  const sources=FOUNDATIONS.map((s,i)=>({...s,commit:String(i+1).repeat(40),tree:'f'.repeat(40)}));
  const base={runtimeInvocations:1,runtime:{exitCode:1,safeForNextSource:true},bootstrap:{absent:true,sessionCount:0},observerErrors:0,attribution:assessMaterialObservation(meaningfulFixture())};
  for(const change of [{},{attribution:{meaningful:false}},{runtime:{safeForNextSource:false}},{bootstrap:{absent:true,sessionCount:1}},{observerErrors:1}]){
    const called=[];const results=await serialPair(sources,async source=>{called.push(source.id);return {...base,...change};});
    assert.deepEqual(called,Object.keys(change).length?['A']:['A','B']);assert.equal(results[0].runtime.exitCode,Object.hasOwn(change,'runtime')?undefined:1);
  }
});

test('R1 incomplete identity/target/draw records cannot pass either shared projection or actual B gate',()=>{
  const good=meaningfulFixture();
  for(const event of ['generated-enter','generated-exit']) {
    const original=good.stdout.events.find(e=>e.value.event===event).value;
    const fields=['objectId','materialId','targetId','width','height','frame','rendererId','transmission','side',...(event==='generated-exit'?['completed','drawDelta','durationMs']:[])];
    for(const key of fields){
      const missing=structuredClone(good);delete missing.stdout.events.find(e=>e.value.event===event).value[key];
      const {kind,...payload}=missing.stdout.events.find(e=>e.value.event===event).value;
      assert.equal(schema.projectWindowRenderObservation(payload),null,`${event} missing ${key}`);
      assert.equal(assessMaterialObservation(missing).meaningful,false,`${event} gate missing ${key}`);
    }
    for(const key of ['objectId','materialId','targetId','frame','rendererId','width','height']){
      const malformed=structuredClone(good);malformed.stdout.events.find(e=>e.value.event===event).value[key]=original[key]+.5;
      assert.equal(assessMaterialObservation(malformed).meaningful,false,`${event} fractional ${key}`);
    }
  }
});
test('R1 mismatched, reordered or incomplete render/material pairs cannot spend B',()=>{
  const good=meaningfulFixture();
  const changes=[
    (v)=>{v.find(e=>e.event==='generated-exit').materialId+=1;},
    (v)=>{v.find(e=>e.event==='generated-exit').targetId+=1;},
    (v)=>{v.find(e=>e.event==='generated-exit').width+=1;},
    (v)=>{v.find(e=>e.event==='generated-exit').observedAtMs=0;},
    (v)=>{v.find(e=>e.event==='generated-exit').sequence+=1;},
    (v)=>{v.find(e=>e.event==='generated-exit').durationMs=Number.MAX_SAFE_INTEGER;},
    (v)=>{v.find(e=>e.event==='render-exit').completed=false;},
    (v)=>{v.find(e=>e.event==='render-exit').generatedDraws=0;},
  ];
  for(const change of changes){const values=good.stdout.events.map(e=>structuredClone(e.value));change(values);assert.equal(assessMaterialObservation(outcomeFrom(values)).meaningful,false);}
  assert.equal(assessActual(good).meaningful,false);
});
