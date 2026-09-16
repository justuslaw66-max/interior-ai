import assert from "node:assert/strict";
import { architecturalLineworkPage,hasSourceDivider,sourcePixelDistance } from "../lib/floor-plan-imports/source-wall-linework";
import type { RegisteredPageEvidence,SourceVectorSegment } from "../lib/floor-plan-imports/deterministic-evidence";
const segment=(id:string,y:number,x=0,end=200):SourceVectorSegment=>({id,pageNumber:1,start:{x,y},end:{x:end,y},strokeWidthPx:1,confidence:1,evidenceKind:"raster_linework"});
const page:RegisteredPageEvidence={pageNumber:1,widthPx:300,heightPx:400,vectorSegments:[segment("ruler",20),segment("wall",24)],vectorPaths:[],text:[],
  semantics:{roomLabels:[],dimensionLabels:[],openingSymbols:[],notes:[]},dimensionSpanEvidence:{coordinateSpace:"rendered_px",imageSha256:"test",observations:[0,100].map(x=>({
    labelIndex:x,valueMm:1000,hintStart:{x,y:20},hintEnd:{x:x+100,y:20},start:{x,y:20},end:{x:x+100,y:20},status:"source_supported",reason:null,lineCoverage:1}))}};
const before=JSON.stringify(page);
assert.deepEqual(architecturalLineworkPage(page).vectorSegments.map(s=>s.id),["wall"],"Adjacent ruler spans must exclude their combined long stroke from wall support.");
assert.equal(JSON.stringify(page),before,"Retain the original ruler as source evidence.");
const unconfirmed=structuredClone(page);unconfirmed.dimensionSpanEvidence!.observations.forEach(o=>o.status="needs_review");
assert.equal(architecturalLineworkPage(unconfirmed).vectorSegments.length,2,"Unconfirmed numeric hints cannot delete architectural evidence.");
const resized=structuredClone(page);resized.originalPixelMapping=[2,0,0,0,2,0,0,0,1];resized.vectorSegments=[segment("nearby-wall",22)];
assert.equal(architecturalLineworkPage(resized).vectorSegments.length,1,"A 4-original-pixel gap stays outside the unchanged 3px association tolerance.");
assert.equal(sourcePixelDistance(resized,{x:0,y:0},{x:0,y:2}),4);
const polygon=[{x:0,y:0},{x:200,y:0},{x:200,y:300},{x:0,y:300}],partition=structuredClone(page);
partition.dimensionSpanEvidence=undefined;partition.vectorSegments=[segment("partition-a",150),segment("partition-b",154)];
assert.equal(hasSourceDivider(partition,polygon),true,"Do not merge spaces across a complete paired source boundary.");
partition.vectorSegments=[segment("extended-a",150,-50,250),segment("extended-b",154,-50,250)];
assert.equal(hasSourceDivider(partition,polygon),true,"A divider extending beyond the proposed room still separates its interior.");
partition.vectorSegments=[segment("fixture-a",150,30,80),segment("fixture-b",154,30,80)];
assert.equal(hasSourceDivider(partition,polygon),false,"A short fixture mark does not establish a partition.");
partition.vectorSegments=[segment("single-mark",150)];assert.equal(hasSourceDivider(partition,polygon),false);
partition.vectorSegments=[segment("edge-a",0),segment("edge-b",4)];assert.equal(hasSourceDivider(partition,polygon),false,"Outer wall rails are not interior partitions.");
console.log("PASS: confirmed chained dimension rulers excluded from wall support, original-pixel tolerance retained, unresolved hints preserved and complete internal paired boundaries prevent false room merging.");
