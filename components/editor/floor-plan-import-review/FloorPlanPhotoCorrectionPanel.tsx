import { usePhotoCorrectionReview,type PhotoReviewProps } from "./usePhotoCorrectionReview";
import FloorPlanPhotoComparison from "./FloorPlanPhotoComparison";
import { useContext } from "react";
import { PhotoReviewAction } from "./photo-review-action";

type Model=ReturnType<typeof usePhotoCorrectionReview>;
const button="rounded border px-2 py-1 text-xs disabled:opacity-50";

function Measurements({model:m}:{model:Model}) {
  return <div className="mt-3 space-y-2">{m.measurements.map((span,i)=><div key={span.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
    <span>{i+1}.</span><label>mm <input aria-label={`Photo measurement ${i+1} mm`} type="number" min="100" className="w-20 rounded border p-1" value={span.lengthMm}
      onChange={(e)=>m.edit(i,{lengthMm:Number(e.target.value)})}/></label>
    <select aria-label={`Photo measurement ${i+1} purpose`} value={span.use} onChange={(e)=>m.edit(i,{use:e.target.value==="fit"?"fit":"check"})}>
      <option value="fit">Use to fit</option><option value="check">Independent check</option>
    </select>
    <button type="button" className={button} onClick={()=>m.replace(i)}>Replace endpoints {i+1}</button>
    <button type="button" className={button} onClick={()=>m.remove(i)}>Remove measurement {i+1}</button>
  </div>)}</div>;
}

function Result({model:m,url}:{model:Model;url:string}) {
  const proposal=m.proposal;if(!proposal)return null;
  const r=proposal.result;
  return <div className="mt-3 rounded border p-3" aria-label="Photo correction result">
    <p role="status">{r.kind==="supported"?"A perspective correction is supported by these checks.":r.kind==="affine_sufficient"?
      "These anchors do not require perspective correction. Review ordinary scale and endpoint associations.":
      "The correction still conflicts with source measurements. Review the marked endpoints and readings."}</p>
    <p className="mt-1 text-xs">Affine check failures: {r.affineChecks.filter((c)=>!c.passes).length}. All errors below are measured in source pixels.</p>
    <ul className="mt-2 text-xs">{r.checks.map((check,i)=><li key={check.id} className={check.passes?"text-green-800":"text-red-800"}>
      Measurement {i+1} ({check.use}): {check.residualPx.toFixed(2)} px / {check.tolerancePx} px — {check.passes?"passes":"conflict"}
    </li>)}</ul>
    {r.correction?<FloorPlanPhotoComparison url={url} correction={r.correction}/>:null}
    <div className="mt-3 flex gap-2">
      <button type="button" className={button} disabled={!r.correction} onClick={m.accept}>Accept photo correction</button>
      <button type="button" className={button} onClick={m.cancel}>Cancel proposed correction</button>
    </div>
  </div>;
}

function PhotoReviewContents(props:PhotoReviewProps) {
  const m=usePhotoCorrectionReview(props), url=`${props.assetRoutePrefix??`/api/floor-plan-imports/${encodeURIComponent(props.jobId)}/assets`}/${encodeURIComponent(props.page.assetKey)}`;
  const recompute=useContext(PhotoReviewAction),reviewed=m.proposal?.result.correction?m.proposal.constraints:
    !props.document.floors.find(f=>f.id===props.floorId)?.photoReviewDrafts?.length?props.calibration?.photoCorrection?.constraints:null;
  return <details className="mt-3 rounded-lg border border-neutral-200 bg-white p-3 text-neutral-800">
    <summary className="cursor-pointer text-sm font-semibold">Correct a photographed plan</summary>
    <fieldset disabled={props.disabled} className="mt-2 text-xs">
      <p>Check the actual dimension end ticks first. A camera correction uses six printed spans and a square corner; at least two other spans check the result independently. Your original stays unchanged.</p>
      {props.calibration?.photoCorrection?<p role="status" className="mt-2">Photo correction accepted in this review. Save the review draft to keep it.</p>:null}
      <button type="button" className={`${button} mt-2`} onClick={props.onPicking}>Pick photo anchor endpoints</button>
      <p className="my-2">Selected endpoints: {props.scalePoints.length}/2. Pick on the source above; you can also use a printed-dimension proposal.</p>
      <div className="flex flex-wrap gap-2">
        <label>Printed length (mm) <input aria-label="Photo printed length mm" type="number" min="100" className="w-24 rounded border p-1" value={m.length} onChange={(e)=>m.setLength(e.target.value)}/></label>
        <select aria-label="New photo measurement purpose" value={m.use} onChange={(e)=>m.setUse(e.target.value==="fit"?"fit":"check")}><option value="fit">Use to fit</option><option value="check">Independent check</option></select>
        <button type="button" className={button} onClick={m.add}>Add photo measurement</button>
      </div>
      <Measurements model={m}/>
      <p className="mt-3">For one known square corner, select two points along each straight edge. The edges do not have to meet in the photo.</p>
      <div className="mt-2 flex gap-2"><button type="button" className={button} onClick={()=>m.setEdge("first")}>Set corner edge A{m.first?" ✓":""}</button>
        <button type="button" className={button} onClick={()=>m.setEdge("second")}>Set corner edge B{m.second?" ✓":""}</button></div>
      <label className="mt-2 flex gap-2"><input type="checkbox" checked={m.confirmed} onChange={(e)=>m.confirm(e.target.checked)}/>I confirm this corner is 90°. This does not assume every room is rectangular.</label>
      <button type="button" className={`${button} mt-3`} onClick={m.propose}>Preview photo correction</button>
      <Result model={m} url={url}/>{m.error?<p role="alert" className="mt-2 text-red-700">{m.error}</p>:null}
      {recompute&&reviewed?<div className="mt-3"><p>Re-extract locally into a separate review. Your earlier draft, geometry and saved design stay available.</p>
        <button type="button" className={`${button} mt-2`} onClick={()=>recompute({constraints:reviewed,pageNumber:props.page.pageNumber})}>Create separate corrected review</button></div>:null}
    </fieldset>
  </details>;
}

export default function FloorPlanPhotoCorrectionPanel({page,...props}:Omit<PhotoReviewProps,"page">&{page:PhotoReviewProps["page"]|null}) {
  return page?<PhotoReviewContents {...props} page={page}/>:null;
}
