import assert from "node:assert/strict";
import { architecturalLineworkPage,hasSourceDivider,sourcePixelDistance,sourceSegmentsForWalls } from "../lib/floor-plan-imports/source-wall-linework";
import { rasterBoundaryProposals } from "../lib/floor-plan-imports/raster-boundary-proposals";
import { mergePhotoReferenceReview } from "../lib/floor-plan-imports/photo-reference-review";
import { acceptedPhotoFixture } from "./fixtures/scan-to-editable-plan/photo-calibration";
import { inversePhotoMatrix,mapPhotoPoint } from "../lib/floor-plan-photo-math";
import { compileFloorPlanDocumentV2 } from "../lib/floor-plan-compiler-v2";
import { saveSourceReviewSpan } from "../lib/floor-plan-source-span-review";
import { applySourceOpeningReviews } from "../lib/floor-plan-imports/source-opening-review";
import { applyConsumerFloorPlanCorrection } from "../lib/floor-plan-imports/review";
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

const textPage=structuredClone(partition);textPage.vectorSegments=[segment("long-wall",100,20,180)];
textPage.text=[{id:"ocr",pageNumber:1,text:"Il",center:{x:100,y:100},widthPx:180,heightPx:15,evidenceKind:"ocr"}];
assert.equal(sourceSegmentsForWalls(textPage).length,1,"OCR stroke-like glyphs must not erase a long wall.");
textPage.text[0].text="BEDROOM";textPage.text[0].widthPx=30;
assert.equal(sourceSegmentsForWalls(textPage).length,1,"A small text box crossing a wall midpoint cannot delete the full wall.");
textPage.vectorSegments=[segment("letter-stroke",100,90,110)];
assert.equal(sourceSegmentsForWalls(textPage).length,0,"Real letter strokes contained in text remain excluded.");

const rails=structuredClone(partition);rails.text=[];
rails.semantics.planRegion={bbox:{leftRatio:0,topRatio:0,rightRatio:1,bottomRatio:1},rotationDegrees:0,confidence:1,evidenceKind:"vision"};
rails.vectorSegments=[segment("rail-a",100,20,180),segment("rail-b",106,30,170)];
const pairs=rasterBoundaryProposals(rails,20);
assert.equal(pairs.length,1);assert.deepEqual(pairs[0].start,{x:30,y:103});assert.deepEqual(pairs[0].end,{x:170,y:103});
rails.vectorSegments.push(segment("window-middle",103,30,170));
assert.equal(rasterBoundaryProposals(rails,20).length,0,"Three rails cannot become a wall by choosing adjacent pairs.");
rails.vectorSegments=[segment("rail-a",100,20,180),segment("first-fragment",106,20,65),segment("second-fragment",106,120,180)];
const fragments=rasterBoundaryProposals(rails,20);assert.equal(fragments.length,2);
assert(fragments.every(p=>p.end.x<=65||p.start.x>=120),"An unsupported gap remains open.");
rails.semantics.planRegion=undefined;assert.equal(rasterBoundaryProposals(rails,20).length,0);

const photo=acceptedPhotoFixture().floors[0].calibrations[0];
const evidence=structuredClone(rails);evidence.widthPx=photo.photoCorrection!.correctedWidthPx;evidence.heightPx=photo.photoCorrection!.correctedHeightPx;
evidence.semantics.planRegion={bbox:{leftRatio:0,topRatio:0,rightRatio:1,bottomRatio:1},rotationDegrees:0,confidence:1,evidenceKind:"vision"};
evidence.vectorSegments=[segment("supported-solid",200,100,200)];evidence.vectorSegments[0].strokeWidthPx=8;
const annotations=mergePhotoReferenceReview([],evidence,photo,20);assert.equal(annotations.length,1);
assert(annotations[0].geometry.kind==="source_drawing");
assert.deepEqual(annotations[0].geometry.points[0],mapPhotoPoint(inversePhotoMatrix(photo.photoCorrection!.originalToCorrected),{x:100,y:200}));
const corrected=structuredClone(annotations);corrected[0].text="Consumer correction";
corrected[0].provenance.reviewHistory=[{id:"review",action:"corrected",reviewerId:"consumer",reviewedAt:"2026-09-16T00:00:00Z"}];
evidence.vectorSegments[0].start.x=110;
assert.deepEqual(mergePhotoReferenceReview(corrected,evidence,photo,20),corrected,"New extraction cannot overwrite a saved consumer source correction.");
evidence.vectorSegments=[];
assert.deepEqual(mergePhotoReferenceReview(annotations,evidence,photo,20),[],"Stale automatic boundary proposals are invalidated.");
assert.deepEqual(mergePhotoReferenceReview(corrected,evidence,photo,20),corrected,"Manual corrections survive invalidated automatic proposals.");
evidence.vectorSegments=[segment("pair-a",200,100,200),segment("pair-b",206,100,200)];
const compiled=acceptedPhotoFixture();compiled.floors[0].annotations=mergePhotoReferenceReview([],evidence,photo,20);
assert.equal(compiled.floors[0].annotations.length,1);compileFloorPlanDocumentV2(compiled);
assert.equal(compiled.floors[0].walls.length,0,"Reference candidates cannot become canonical geometry.");
const hintStart={x:300,y:300},hintEnd={x:300,y:380},actualStart={x:301,y:298},actualEnd={x:301,y:383};
evidence.semantics.openingSymbols=[{kind:"door",operation:"swing",centerXRatio:300/evidence.widthPx,centerYRatio:340/evidence.heightPx,confidence:0.55,evidenceKind:"vision",
  spanStart:{xRatio:300/evidence.widthPx,yRatio:300/evidence.heightPx},spanEnd:{xRatio:300/evidence.widthPx,yRatio:380/evidence.heightPx}}];
evidence.openingSpanEvidence={coordinateSpace:"rendered_px",imageSha256:"synthetic",widthPx:evidence.widthPx,heightPx:evidence.heightPx,
  observations:[{symbolIndex:0,kind:"door",hintStart,hintEnd,span:{start:actualStart,end:actualEnd,method:"wall_jambs"},reason:"source_supported"}]};
const local=mergePhotoReferenceReview([],evidence,photo,20),opening=local.find(a=>a.id==="source-proposal:1:opening:0")!;
assert(opening.geometry.kind==="source_drawing");
assert.deepEqual(opening.geometry.points[0],mapPhotoPoint(inversePhotoMatrix(photo.photoCorrection!.originalToCorrected),actualStart));
opening.provenance.reviewHistory=[{id:"consumer-door",action:"corrected",reviewerId:"consumer",reviewedAt:"2026-09-16T00:00:00Z"}];
opening.geometry.points[0].x+=2;
assert.deepEqual(mergePhotoReferenceReview([opening],evidence,photo,20).find(a=>a.id===opening.id),opening,"Pixel refinements cannot overwrite newer consumer opening endpoints.");
console.log("PASS: OCR/wall associations, unresolved raster boundaries, multi-rail abstention, gap preservation, original-frame mapping and protected consumer edits.");

const itemDocument=acceptedPhotoFixture(),itemFloor=itemDocument.floors[0];
itemFloor.annotations=[opening];
const reviewInput={document:itemDocument,floorId:itemFloor.id,sourceId:photo.sourceId,
  page:{pageNumber:photo.pageNumber,widthPx:photo.imageWidthPx,heightPx:photo.imageHeightPx},
  annotationId:opening.id,points:opening.geometry.points,note:"An interior item, not a window",at:"2026-09-16T01:00:00Z"};
const reviewedItem=saveSourceReviewSpan({...reviewInput,kind:"interior_item"});
const reviewedMarks=reviewedItem.floors[0].annotations;
assert.match(reviewedMarks[0].text,/Reviewed interior item, not an opening/);
assert.deepEqual(reviewedMarks[0].provenance.evidence.slice(0,-1),opening.provenance.evidence,"Retain the rejected proposal's evidence.");
const semanticBefore=JSON.stringify(evidence.semantics);
evidence.semantics.openingSymbols.push({...evidence.semantics.openingSymbols[0],kind:"window"});
const withFollowing=JSON.stringify(evidence.semantics);
const filtered=applySourceOpeningReviews(evidence.semantics,reviewedMarks,photo.sourceId,photo.pageNumber);
assert.equal(filtered.openingSymbols.length,2,"Preserve ordinal identities of subsequent proposals.");
assert.equal(filtered.openingSymbols[0].confidence,0);assert.equal(filtered.openingSymbols[0].spanStart,undefined);
assert.deepEqual(filtered.openingSymbols[1],evidence.semantics.openingSymbols[1]);
assert.equal(JSON.stringify(evidence.semantics),withFollowing,"Never mutate retained recognition evidence.");
for(const [source,pageNumber] of [["other-source",photo.pageNumber],[photo.sourceId,photo.pageNumber+1]] as const)
  assert.equal(applySourceOpeningReviews(evidence.semantics,reviewedMarks,source,pageNumber).openingSymbols[0].confidence,0.55);
assert.equal(applySourceOpeningReviews(evidence.semantics,[opening],photo.sourceId,photo.pageNumber).openingSymbols[0].confidence,0.55);
const reversed=saveSourceReviewSpan({...reviewInput,document:reviewedItem,kind:"window",note:"Reclassified after closer source review"});
assert.equal(reversed.floors[0].annotations[0].configurationId,undefined);
assert.equal(applySourceOpeningReviews(evidence.semantics,reversed.floors[0].annotations,photo.sourceId,photo.pageNumber).openingSymbols[0].confidence,0.55);
assert.deepEqual(reviewedItem.floors[0].walls,itemFloor.walls);assert.deepEqual(reviewedItem.floors[0].calibrations,itemFloor.calibrations);
assert.equal(JSON.stringify({...evidence.semantics,openingSymbols:evidence.semantics.openingSymbols.slice(0,1)}),semanticBefore);
assert.deepEqual(mergePhotoReferenceReview(reviewedMarks,evidence,photo,20).find(a=>a.id===opening.id),reviewedMarks[0]);
console.log("PASS: interior-item review suppresses only its opening proposal; raw evidence, later IDs, source/page scoping, geometry and reversible classification remain intact.");

const submitted=structuredClone(reviewedItem);
submitted.floors[0].annotations[0].provenance={confidence:1,extractionVersion:"forged",evidence:[{
  sourceId:photo.sourceId,basis:"site_measured",confidence:1,extractorVersion:"forged"}],reviewHistory:[{
  id:"forged",action:"approved",reviewerId:"surveyor",reviewedAt:"2026-09-16T00:00:00Z"}]};
const persist=(current:typeof itemDocument,next:typeof itemDocument)=>applyConsumerFloorPlanCorrection({current,next,
  currentIssues:[],submittedIssues:[],sourceId:photo.sourceId,sourceSha256:current.sources[0].sha256!,
  userId:"authenticated-owner",note:"Save incomplete draft",at:"2026-09-16T02:00:00Z"}).document;
const persisted=persist(itemDocument,submitted),stored=persisted.floors[0].annotations[0];
assert.equal(stored.provenance.confidence,0,"Saving a reference correction cannot grant geometry confidence.");
assert.deepEqual(stored.provenance.evidence.slice(0,-1),itemFloor.annotations[0].provenance.evidence);
assert.deepEqual(stored.provenance.reviewHistory.slice(0,-1),itemFloor.annotations[0].provenance.reviewHistory);
assert.equal(stored.provenance.reviewHistory.at(-1)?.reviewerId,"authenticated-owner");
assert.equal(stored.provenance.reviewHistory.at(-1)?.action,"corrected");
assert(!JSON.stringify(stored.provenance).includes("forged"));
assert.equal(persist(persisted,persisted).floors[0].annotations[0].provenance.reviewHistory.length,stored.provenance.reviewHistory.length);
assert.equal(applySourceOpeningReviews(evidence.semantics,[stored],photo.sourceId,photo.pageNumber).openingSymbols[0].confidence,0);
console.log("PASS: real review sanitizer keeps trusted prior source evidence, records authenticated correction without confidence inflation, rejects forged audit claims and leaves unchanged saves unchanged.");
