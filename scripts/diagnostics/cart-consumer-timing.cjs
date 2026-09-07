// One explicitly selected diagnostic observation; never a required-gate result.
const TIMING = String.raw`const fs=require('fs'),path=require('path');
const root=process.cwd();
const {test}=require(root+'/node_modules/@playwright/test');
const {createRequire}=require('module');
const req=createRequire(root+'/package.json');
const {monotonicTime}=req('playwright-core/lib/coreBundle').iso;
let lastState=null;
const sampled=new Set([412,420,469,476,480,481,482,486,488]);
function budget(){
 const info=test.info();const tm=info._timeoutManager;const slot=tm.defaultSlot();const running=tm._running;const now=monotonicTime();
 const consumed=slot.elapsed+(running?.slot===slot?now-running.start:0);
 return {hostMonotonicMs:now,wall:Date.now(),elapsedMs:consumed,remainingMs:slot.timeout-consumed,timeoutMs:slot.timeout,wallSinceTestInfoMs:now-info._startTime,project:info.project.name};
}
function save(row){try{fs.appendFileSync(path.join(path.join(root,'.local/cart-timing-diagnostic/raw'),'ledger-'+test.info().project.name+'.jsonl'),JSON.stringify(row)+'\n');}catch(error){process.stderr.write('Diagnostic ledger write failed: '+error.message+'\n');}}
exports.timed=async function(label,operation,page){
 const start=budget();if(label.startsWith('L459:'))save({event:'browser-version',...start,version:page.context().browser()?.version()??null});save({event:'start',label,...start,lastState});
 try{
  const result=await operation();save({event:'end',label,...budget(),lastState});
  const line=Number(/^L(\d+)/.exec(label)?.[1]);
  if(sampled.has(line)){
   const sampleStart=budget();
   try{
    lastState=await page.evaluate(()=>{
     const dialog=document.querySelector('[data-testid="selection-tray-dialog"]');const active=document.activeElement;const trigger=document.querySelector('[data-testid="selection-tray-trigger"]');
     return {browserTime:performance.now(),dialogCount:document.querySelectorAll('[data-testid="selection-tray-dialog"]').length,lifecycle:dialog?.getAttribute('data-editor-dialog-state')??null,generation:dialog?.getAttribute('data-editor-dialog-generation')??null,expanded:trigger?.getAttribute('aria-expanded')??null,focus:active?.getAttribute('data-testid')??active?.tagName??null,clearCount:document.querySelectorAll('[data-testid="selection-tray-clear"]').length};
    });
    save({event:'snapshot',label,...budget(),sampleStartMs:sampleStart.elapsedMs,state:lastState});
   }catch(error){save({event:'snapshot-error',label,...budget(),message:error.message});}
  }
  return result;
 }catch(error){save({event:'error',label,...budget(),lastState,message:error.message});throw error;}
};
`;
const REPORTER = String.raw`const fs=require('fs'),path=require('path');
module.exports=class{
 constructor(){this.events=[];}
 onStepBegin(test,result,step){this.event({event:"stepBegin",project:test.parent.project().name,title:step.title,category:step.category,parent:step.parent?.title,hostMonotonicMs:Number(process.hrtime.bigint())/1e6,wall:Date.now()});}
 event(row){if(row.event==='testBegin')this.fixtureElapsed=0;if(row.category==='fixture'&&row.parent==='Before Hooks'&&['Fixture \"context\"','Fixture \"page\"'].includes(row.title)){if(row.event==='stepEnd')this.fixtureElapsed=(this.fixtureElapsed??0)+row.duration;row.fixtureElapsedEstimateMs=this.fixtureElapsed??0;row.fixtureRemainingEstimateMs=30000-row.fixtureElapsedEstimateMs;row.estimateBasis='Completed context/page durations only; internal setup overhead omitted; browser worker excluded';}this.events.push(row);fs.appendFileSync(path.join(process.cwd(),".local/cart-timing-diagnostic/raw/fixtures.jsonl"),JSON.stringify({...row,hostMonotonicMs:Number(process.hrtime.bigint())/1e6})+"\n");}
 onBegin(config,suite){this.start=Date.now();this.event({event:'discovery',tests:suite.allTests().map(t=>({title:t.title,project:t.parent.project().name}))});this.config={workers:config.workers,projects:config.projects.map(p=>({name:p.name,timeout:p.timeout,retries:p.retries,use:p.use})),testCount:suite.allTests().length};}
 onTestBegin(test,result){this.event({event:'testBegin',title:test.title,project:test.parent.project().name,wall:result.startTime.getTime(),timeout:test.timeout});}
 onStepEnd(test,result,step){this.event({event:'stepEnd',project:test.parent.project().name,title:step.title,category:step.category,parent:step.parent?.title,wall:step.startTime.getTime(),duration:step.duration,error:step.error?.message});}
 onTestEnd(test,result){this.event({event:'testEnd',project:test.parent.project().name,title:test.title,status:result.status,duration:result.duration,wall:Date.now(),errors:result.errors});this.flush();}
 onEnd(result){this.result=result;this.flush();}
 flush(){fs.writeFileSync(path.join(path.join(process.cwd(),".local/cart-timing-diagnostic/raw"),'reporter.json'),JSON.stringify({diagnosticOnly:true,config:this.config,start:this.start,result:this.result,events:this.events},null,2));}
};
`;
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const os = require('node:os'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const ROOT = process.cwd(), SOURCE = '6dd4271031613ea35c9a4b2bf82bf8612c754f56';
const HARNESS = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, '.local/cart-timing-diagnostic');
const RAW = path.join(DIR, 'raw'), PROBE = path.join(DIR, 'probe'), UPLOAD = path.join(DIR, 'upload');
const TITLE = 'consumer empty cart owns a closed, pointer, keyboard, and reopen lifecycle';
const req = createRequire(path.join(ROOT, 'package.json'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (root, ref) => cp.execFileSync('git', ['rev-parse', ref], {cwd:root,encoding:'utf8'}).trim();
const write = (name, value) => fs.writeFileSync(path.join(RAW,name), JSON.stringify(value,null,2)+'\n');
const mono = () => Number(process.hrtime.bigint())/1e6;
function checkSource() {
  if (git(ROOT,'HEAD')!==SOURCE) throw Error('Application source mismatch');
  cp.execFileSync('git',['diff','--exit-code','HEAD'],{cwd:ROOT});
}
function initialize() {
  checkSource();
  if(process.env.GITHUB_SHA&&git(HARNESS,'HEAD')!==process.env.GITHUB_SHA)throw Error('Workflow/harness identity mismatch');
  if (fs.existsSync(DIR)) throw Error('Diagnostic output already exists');
  fs.mkdirSync(RAW,{recursive:true});fs.mkdirSync(PROBE);fs.mkdirSync(UPLOAD);
  write('identity.json',{diagnosticOnly:true,sourceCommit:SOURCE,sourceTree:git(ROOT,'HEAD^{tree}'),harnessCommit:git(HARNESS,'HEAD'),workflowCommit:process.env.GITHUB_SHA??null,run:process.env.GITHUB_RUN_ID??null,attempt:process.env.GITHUB_RUN_ATTEMPT??null,helperSha256:sha(fs.readFileSync(__filename)),lockSha256:sha(fs.readFileSync('package-lock.json')),nextInitiallyPresent:fs.existsSync('.next'),initializedWall:Date.now(),initializedHostMonotonicMs:mono()});
}
function prepare() {
  checkSource();
  const ts=req('typescript');
  const source=fs.readFileSync('tests/required/cart-overlay-accessibility.spec.ts','utf8');
  const sf=ts.createSourceFile('cart-overlay-accessibility.spec.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const edits=[];
  function walk(n) {
    const line=sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
    if(ts.isAwaitExpression(n)&&line>=395&&line<=490){edits.push({start:n.getStart(sf),end:n.end,line,text:n.expression.getText(sf)});return;}
    ts.forEachChild(n,walk);
  }
  walk(sf);
  if(!edits.some(e=>e.line===482)||!edits.some(e=>e.line===428))throw Error('Unexpected baseline operation map');
  let instrumented=source;
  for(const e of [...edits].reverse())instrumented=instrumented.slice(0,e.start)+`await timed(${JSON.stringify('L'+e.line+': '+e.text.replace(/\s+/g,' '))}, () => ${e.text}, page)`+instrumented.slice(e.end);
  instrumented=instrumented.replace('from "@playwright/test"','from '+JSON.stringify(path.join(ROOT,'node_modules/@playwright/test')));
  instrumented='import { timed } from "./timing.cjs";\n'+instrumented;
  fs.writeFileSync(path.join(PROBE,'cart-budget.spec.ts'),instrumented);
  fs.writeFileSync(path.join(PROBE,'timing.cjs'),TIMING);
  fs.writeFileSync(path.join(PROBE,'reporter.cjs'),REPORTER);
  const diff=cp.spawnSync('git',['diff','--no-index','--','tests/required/cart-overlay-accessibility.spec.ts',path.join(PROBE,'cart-budget.spec.ts')],{encoding:'utf8'});
  if(![0,1].includes(diff.status))throw Error('Cannot record timing patch');
  fs.writeFileSync(path.join(RAW,'timing-patch.txt'),diff.stdout);
  write('instrumentation.json',{originalSha256:sha(source),instrumentedSha256:sha(instrumented),timingPatchSha256:sha(diff.stdout),timingHelperSha256:sha(TIMING),reporterSha256:sha(REPORTER),operations:edits.map(e=>({line:e.line,expression:e.text})),accounting:'elapsed=defaultSlot.elapsed + monotonicNow-running.start when running.slot is defaultSlot; remaining=30000-elapsed. Worker slots and teardown are separate. Browser performance.now is a distinct clock domain.',overhead:'Synchronous compact writes plus nine small state evaluations; no polling loop. Sample latency stays inside test budget.'});
  fs.mkdirSync(path.join(ROOT,'.local/required-test-evidence/ci.cart-overlay-accessibility'),{recursive:true});
  const config=`import base from ${JSON.stringify(path.join(ROOT,'playwright.cart-overlay.config'))};
import {defineConfig} from ${JSON.stringify(path.join(ROOT,'node_modules/@playwright/test'))};
import fs from 'node:fs';
fs.writeFileSync(${JSON.stringify(path.join(RAW,'base-config.json'))},JSON.stringify(base,null,2));
export default defineConfig({...base,testDir:${JSON.stringify(PROBE)},testMatch:'cart-budget.spec.ts',reporter:[['list'],['json',{outputFile:${JSON.stringify(path.join(RAW,'playwright.json'))}}],[${JSON.stringify(path.join(PROBE,'reporter.cjs'))}]],outputDir:${JSON.stringify(path.join(RAW,'playwright-output'))},metadata:{diagnosticOnly:true,source:${JSON.stringify(SOURCE)},notCanonicalGate:true},webServer:{...base.webServer,cwd:${JSON.stringify(ROOT)},stdout:'pipe',stderr:'pipe'}});`;
  fs.writeFileSync(path.join(PROBE,'diagnostic.config.ts'),config);
  const version = (cmd,args,env=process.env) => {const r=cp.spawnSync(cmd,args,{encoding:'utf8',env});return r.status===0?r.stdout.trim():{unavailable:true,exit:r.status};};
  const postgres=version('psql',['-h','localhost','-U','test','-d','interior_ai_test','-Atc','show server_version'],{...process.env,PGPASSWORD:'test'});
  write('machine.json',{platform:process.platform,arch:process.arch,release:os.release(),cpuCount:os.cpus().length,cpuModel:os.cpus()[0]?.model,totalMemoryBytes:os.totalmem(),freeMemoryBytes:os.freemem(),imageOS:process.env.ImageOS??null,imageVersion:process.env.ImageVersion??null,runnerOS:process.env.RUNNER_OS??null,runnerArch:process.env.RUNNER_ARCH??null,node:process.version,npm:version('npm',['--version']),playwright:req('@playwright/test/package.json').version,next:req('next/package.json').version,chromiumPinned:JSON.parse(fs.readFileSync(path.join(path.dirname(req.resolve('playwright-core/package.json')),'browsers.json'),'utf8')).browsers.filter(b=>b.name==='chromium'||b.name==='chromium-headless-shell'),postgres,osRelease:fs.existsSync('/etc/os-release')?fs.readFileSync('/etc/os-release','utf8'):null,precedingStableWorkloadReproduced:false,nextBeforeDiscovery:fs.existsSync('.next')});
}
function executionEnvironment() {
  return {...process.env,REQUIRED_TEST_GATE_ID:'ci.cart-overlay-accessibility',REQUIRED_TEST_REPORT_PATH:'.local/required-test-evidence/ci.cart-overlay-accessibility/diagnostic-unused.json'};
}
function args() {
  return [req.resolve('@playwright/test/cli'),'test','--config='+path.join(PROBE,'diagnostic.config.ts'),'--grep='+TITLE+'$','--project=chromium','--workers=1','--retries=0'];
}
function discover() {
  checkSource();
  const r=cp.spawnSync(process.execPath,[...args(),'--list'],{env:executionEnvironment(),encoding:'utf8'});
  fs.writeFileSync(path.join(RAW,'discovery.log'),r.stdout+r.stderr);
  if(r.status!==0)throw Error('Diagnostic discovery failed');
  const records=fs.readFileSync(path.join(RAW,'fixtures.jsonl'),'utf8').trim().split('\n').map(x=>JSON.parse(x));
  const selection=records.findLast(x=>x.event==='discovery');
  if(selection?.tests.length!==1||selection.tests[0].title!==TITLE||selection.tests[0].project!=='chromium')throw Error('Discovery did not select exactly one intended case');
  write('selection.json',{diagnosticOnly:true,tests:selection.tests,command:[process.execPath,...args()]});
  const config=JSON.parse(fs.readFileSync(path.join(RAW,'reporter.json'),'utf8')).config;
  if(config.testCount!==1||config.workers!==1)throw Error('Unexpected diagnostic configuration');
  const p=config.projects.find(project=>project.name==='chromium');
  if(!p)throw Error('Selected Chromium configuration unavailable');
  const base=JSON.parse(fs.readFileSync(path.join(RAW,'base-config.json'),'utf8'));
  if(base.expect.timeout!==30000||base.webServer.timeout!==120000||base.webServer.command!=='npm run dev'||base.webServer.reuseExistingServer!==false)throw Error('Required server or assertion settings changed');
  if(p.timeout!==30000||p.retries!==0||p.use.actionTimeout!==30000||p.use.navigationTimeout!==60000||['trace','video','screenshot'].some(k=>p.use[k]!=='off'))throw Error('Baseline deadlines or recording changed');
  write('resolved-config.json',config);
  console.log('Selected exactly one Chromium Consumer case; deadlines and required recording settings verified.');
}
async function observe() {
  checkSource();
  if(!fs.existsSync(path.join(RAW,'selection.json')))throw Error('Discovery prerequisite missing');
  if(fs.existsSync(path.join(RAW,'execution-start.json')))throw Error('Diagnostic execution already attempted');
  write('execution-start.json',{wall:Date.now(),hostMonotonicMs:mono(),command:[process.execPath,...args()]});
  const log=fs.openSync(path.join(RAW,'server.log'),'wx');let ownership=false;
  const child=cp.spawn(process.execPath,args(),{env:executionEnvironment(),stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
    const line=`[hostMonotonicMs=${mono()} wall=${Date.now()}] ${chunk}`;fs.writeSync(log,line);process.stdout.write(chunk);
    if(!ownership&&(chunk.toString().includes('Ready')||chunk.toString().includes('Running '))){
      const ids=cp.spawnSync('lsof',['-nP','-t','-iTCP:3000','-sTCP:LISTEN'],{encoding:'utf8'}).stdout?.trim().split('\n').filter(Boolean)??[];
      const owners=[...new Set(ids)].map(pid=>({pid,cwd:cp.spawnSync('lsof',['-a','-p',pid,'-d','cwd','-Fn'],{encoding:'utf8'}).stdout}));
      if(owners.length){write('server-ownership.json',{wall:Date.now(),hostMonotonicMs:mono(),owners});ownership=owners.every(o=>o.cwd.includes('n'+ROOT+'\n'));if(!ownership){child.kill('SIGTERM');process.exitCode=1;}}
    }
  });
  const result=await new Promise(resolve=>child.on('close',(exitCode,signal)=>resolve({exitCode,signal})));
  fs.closeSync(log);write('execution.json',{...result,wall:Date.now(),hostMonotonicMs:mono(),ownershipVerified:ownership});
  process.exitCode=result.exitCode??1;
}
async function collect() {
  if(!fs.existsSync(RAW))throw Error('No initialized diagnostic output');
  const {sanitizePortableEvidenceText,auditRetainedEvidenceDirectory}=await import(pathToFileURL(path.join(ROOT,'scripts/required-test-truthfulness.mjs')).href);
  const included=[],missing=[],omitted=[];
  const fields=/secret|token|password|private.?key|api.?key|access.?key|cookie|database.?url|credential|storageState|^headers$/i;
  function cleanValue(v){if(Array.isArray(v))return v.map(cleanValue);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!fields.test(k)).map(([k,c])=>[k,cleanValue(c)]));return v;}
  function safeText(text){
    let result=text.replace(/\x1b\[[0-9;]*m/g,'');
    for(const [name,value] of Object.entries(process.env))if(fields.test(name)&&value.length>=8)result=result.split(value).join('<REDACTED>');
    return sanitizePortableEvidenceText(result,ROOT);
  }
  function retain(relative,destination=relative,jsonLines=false){
    const source=path.join(RAW,relative);
    if(!fs.existsSync(source)){missing.push(relative);return;}
    const stat=fs.lstatSync(source);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024){omitted.push({path:relative,reason:'not a bounded regular text file'});return;}
    const bytes=fs.readFileSync(source);let text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(jsonLines)text=JSON.stringify(cleanValue(text.trim().split('\n').filter(Boolean).map(x=>JSON.parse(x))),null,2);
    else if(relative.endsWith('.json'))text=JSON.stringify(cleanValue(JSON.parse(text)),null,2);
    text=safeText(text);const output=path.join(UPLOAD,destination);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,text);
    try{auditRetainedEvidenceDirectory({repositoryRoot:ROOT,evidenceRoot:path.relative(ROOT,UPLOAD)});included.push({path:destination,originalSha256:sha(bytes),retainedSha256:sha(text)});}
    catch{fs.rmSync(output);omitted.push({path:relative,reason:'existing retained-evidence safety audit rejected content'});}
  }
  for(const name of ['identity.json','machine.json','selection.json','base-config.json','resolved-config.json','instrumentation.json','timing-patch.txt','execution-start.json','execution.json','playwright.json','reporter.json','server-ownership.json','discovery.log','server.log'])retain(name);
  retain('ledger-chromium.jsonl','timing.json',true);retain('fixtures.jsonl','fixtures.json',true);
  const errorRoot=path.join(RAW,'playwright-output');
  const contexts=fs.existsSync(errorRoot)?fs.readdirSync(errorRoot,{recursive:true}).filter(x=>x.endsWith('/error-context.md')):[];
  for(const [i,p] of contexts.entries())retain('playwright-output/'+p,`error-context-${i+1}.md`);
  if(!contexts.length)missing.push('error-context.md:not-produced-or-unavailable');
  const required=['identity.json','machine.json','selection.json','resolved-config.json','instrumentation.json','execution.json','playwright.json','timing.json','fixtures.json','server-ownership.json'];
  const incomplete=required.filter(name=>!included.some(x=>x.path===name));
  if(fs.existsSync(path.join(RAW,'execution.json'))&&!JSON.parse(fs.readFileSync(path.join(RAW,'execution.json'),'utf8')).ownershipVerified)incomplete.push('positive server ownership unavailable');
  const unfinishedOperations=[];
  const timingPath=path.join(UPLOAD,'timing.json');
  if(fs.existsSync(timingPath)){const rows=JSON.parse(fs.readFileSync(timingPath,'utf8'));if(!rows.some(r=>r.event==='start')||!rows.some(r=>r.event==='end'||r.event==='error'))incomplete.push('operation timing incomplete');for(const row of rows){if(row.event==='start')unfinishedOperations.push({label:row.label,startElapsedMs:row.elapsedMs});else if(row.event==='end'||row.event==='error'){const i=unfinishedOperations.findLastIndex(x=>x.label===row.label);if(i>=0)unfinishedOperations.splice(i,1);}}}
  const inventory={diagnosticOnly:true,diagnosticCompleteness:incomplete.length||omitted.length?'DIAGNOSTIC_EXECUTION_INCOMPLETE':'retained',incomplete,unfinishedOperations,source:SOURCE,harnessCommit:git(HARNESS,'HEAD'),observationOutcome:process.env.OBSERVATION_OUTCOME??'local-setup-check',included,missing,omitted,oldCiContextAvailable:false};
  fs.writeFileSync(path.join(UPLOAD,'inventory.json'),JSON.stringify(inventory,null,2));
  auditRetainedEvidenceDirectory({repositoryRoot:ROOT,evidenceRoot:path.relative(ROOT,UPLOAD)});
  console.log(JSON.stringify({included:included.length,missing,omitted}));
  if(omitted.length||incomplete.length)process.exitCode=1;
}
(async()=>{const mode=process.argv[2];if(mode==='initialize')initialize();else if(mode==='prepare')prepare();else if(mode==='discover')discover();else if(mode==='observe')await observe();else if(mode==='collect')await collect();else throw Error('Unknown diagnostic mode');})().catch(error=>{console.error(error);process.exitCode=1;});
