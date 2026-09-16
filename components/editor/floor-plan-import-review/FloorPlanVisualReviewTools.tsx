"use client";

import { useRef, useState, type ReactNode } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanReviewIssue } from "@/lib/floor-plan-imports/types";
import { expandFloorPlanReviewFocus, floorPlanReviewPage, resolveFloorPlanReviewTarget } from "@/lib/floor-plan-review-target";
import { FloorPlanReviewIssueAction } from "./FloorPlanReviewIssueAction";
import type { ReviewSourcePoint } from "@/lib/floor-plan-import-review-geometry";
import type { ConsumerFloorPlanImportJob } from "../floor-plan-import-ui-types";
import FloorPlanPhotoCorrectionPanel from "./FloorPlanPhotoCorrectionPanel";
import FloorPlanPendingSpanReview from "./FloorPlanPendingSpanReview";
import FloorPlanOpeningTracePanel from "./FloorPlanOpeningTracePanel";
import FloorPlanOrientationReviewPanel from "./FloorPlanOrientationReviewPanel";
import FloorPlanRoomTracePanel from "./FloorPlanRoomTracePanel";
import FloorPlanScaleReviewPanel from "./FloorPlanScaleReviewPanel";
import FloorPlanSourceReviewCanvas from "./FloorPlanSourceReviewCanvas";
import FloorPlanTopologyCorrectionPanel from "./FloorPlanTopologyCorrectionPanel";

type FloorPlanVisualReviewToolsProps = {
  document: FloorPlanDocumentV2;
  job: Pick<
    ConsumerFloorPlanImportJob,
    "id" | "adapterId" | "renderedPagesJson"
  >;
  focusedIssueEntityIds: string[];
  focusedIssue?: FloorPlanReviewIssue | null;
  onChange: (value: FloorPlanDocumentV2) => void;
  assetRoutePrefix?: string;
  guidedLayout?: boolean;
  openScaleByDefault?: boolean;
  consumerMode?: boolean; proMode?: boolean;
  manualToolsOpen?: boolean;
  onManualToolsOpenChange?: (value: boolean) => void;
  previewOnly?: boolean;
  sidebarFooter?: ReactNode;
  dark?: boolean;
  disabled?: boolean;
};

export default function FloorPlanVisualReviewTools({
  document,
  job,
  focusedIssueEntityIds,
  focusedIssue,
  onChange,
  assetRoutePrefix,
  guidedLayout = false,
  openScaleByDefault = false,
  consumerMode = false, proMode = false,
  manualToolsOpen = false,
  onManualToolsOpenChange,
  previewOnly = false,
  sidebarFooter,
  dark = false,
  disabled = false,
}: FloorPlanVisualReviewToolsProps) {
  const floor = document.floors[0];
  const root = useRef<HTMLDivElement>(null);
  const reviewTarget = resolveFloorPlanReviewTarget(document, job.renderedPagesJson, focusedIssue);
  const initialPage = reviewTarget?.pageNumber ?? floor?.calibrations[0]?.pageNumber ?? job.renderedPagesJson[0]?.pageNumber ?? 1;
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [pickingScale, setPickingScale] = useState(false);
  const [scalePoints, setScalePoints] = useState<ReviewSourcePoint[]>([]);
  const [pickingRoom, setPickingRoom] = useState(false);
  const [roomPoints, setRoomPoints] = useState<ReviewSourcePoint[]>([]);
  const [pickingOpening, setPickingOpening] = useState(false);
  const [openingPoints, setOpeningPoints] = useState<ReviewSourcePoint[]>([]);
  const [focusedCorrectionIds, setFocusedCorrectionIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { page, sourceId, calibration } = floorPlanReviewPage(document, job.renderedPagesJson, pageNumber);
  const focusKey = `${focusedIssue?.id ?? ""}:${reviewTarget?.pageNumber ?? ""}`;
  const [previousFocus, setPreviousFocus] = useState(focusKey);
  if (previousFocus !== focusKey) {
    setPreviousFocus(focusKey);
    setFocusedCorrectionIds([]);
    if (reviewTarget?.pageNumber) setPageNumber(reviewTarget.pageNumber);
    setScalePoints([]); setRoomPoints([]); setOpeningPoints([]);
    setPickingScale(false); setPickingRoom(false); setPickingOpening(false);
  }
  if (!floor) return null;

  const pick=(kind:"scale"|"room"|"opening",value=true)=> {
    setPickingScale(kind==="scale"&&value);setPickingRoom(kind==="room"&&value);setPickingOpening(kind==="opening"&&value);
  };
  const focusedEntityIds = expandFloorPlanReviewFocus(floor, focusedIssueEntityIds, focusedCorrectionIds);

  const canvas = (
    <>
      <FloorPlanSourceReviewCanvas
        document={document} onDocumentChange={onChange} disabled={disabled} previewOnly={previewOnly}
        floorId={floor.id}
        sourceId={sourceId}
        jobId={job.id}
        adapterId={job.adapterId}
        pages={job.renderedPagesJson}
        pageNumber={page?.pageNumber ?? pageNumber}
        onPageNumberChange={(value) => {
          setPageNumber(value);
          setScalePoints([]); setRoomPoints([]); setOpeningPoints([]);
        }}
        focusedEntityIds={focusedEntityIds}
        pickingScale={pickingScale} scalePoints={scalePoints} onUseScaleEndpoints={setScalePoints}
        onSourcePoint={(point) =>
          setScalePoints((current) =>
            current.length >= 2 ? [point] : [...current, point]
          )
        }
        pickingRoom={pickingRoom} roomPoints={roomPoints}
        onRoomPoint={(point) => setRoomPoints((current) => [...current, point])}
        pickingOpening={pickingOpening}
        openingPoints={openingPoints}
        onOpeningPoint={(point) =>
          setOpeningPoints((current) =>
            current.length >= 2 ? [point] : [...current, point]
          )
        }
        assetRoutePrefix={assetRoutePrefix}
        dark={dark}
      />
      {!previewOnly && <FloorPlanReviewIssueAction target={reviewTarget} root={root} disabled={disabled} />}
    </>
  );
  const primaryControls = (
    <>
      <FloorPlanPhotoCorrectionPanel key={`photo:${sourceId}:${pageNumber}`} document={document} floorId={floor.id}
        sourceId={sourceId} jobId={job.id} page={page} calibration={calibration} scalePoints={scalePoints}
        onPicking={()=>{setScalePoints([]);pick("scale");}} onChange={onChange} assetRoutePrefix={assetRoutePrefix} disabled={disabled}/>
      <FloorPlanPendingSpanReview key={`spans:${sourceId}:${pageNumber}`} document={document} floorId={floor.id} sourceId={sourceId}
        page={page} points={scalePoints} onPick={()=>{setScalePoints([]);pick("scale");}} onChange={onChange} disabled={disabled}
        onSelect={(id,points)=>{setFocusedCorrectionIds(id?[id]:[]);setScalePoints(points);pick("scale",false);}}/>
      <FloorPlanScaleReviewPanel key={`${sourceId}:${page?.pageNumber}`}
        document={document}
        floorId={floor.id}
        sourceId={sourceId}
        page={page}
        calibration={calibration}
        pickingScale={pickingScale}
        scalePoints={scalePoints}
        onPickingScaleChange={(value)=>pick("scale",value)}
        onScalePointsChange={setScalePoints}
        onChange={onChange}
        onError={setError}
        openByDefault={openScaleByDefault}
        dark={dark}
        disabled={disabled}
      />
      <FloorPlanRoomTracePanel
        calibration={calibration}
        dark={dark}
        disabled={disabled}
        document={document}
        floorId={floor.id}
        onChange={onChange}
        onError={setError}
        onPickingRoomChange={(value)=>pick("room",value)}
        onRoomPointsChange={setRoomPoints}
        pageNumber={page?.pageNumber ?? null}
        pickingRoom={pickingRoom}
        roomPoints={roomPoints}
        sourceId={sourceId}
      />
      <FloorPlanOpeningTracePanel
        calibration={calibration}
        dark={dark}
        disabled={disabled}
        document={document}
        floorId={floor.id}
        onChange={onChange}
        onError={setError}
        onOpeningPointsChange={setOpeningPoints}
        onPickingOpeningChange={(value)=>pick("opening",value)}
        openingPoints={openingPoints}
        pageNumber={page?.pageNumber ?? null}
        pickingOpening={pickingOpening}
        sourceId={sourceId}
      />
      <details className="mt-3 rounded-lg border border-neutral-200 bg-white p-3">
        <summary className="cursor-pointer text-xs font-semibold text-neutral-700">
          Expert corrections (only if the outline is wrong)
        </summary>
        <p className="mt-2 text-[10px] leading-4 text-neutral-500">
          Repair a specific wall, opening, structural object, dimension, or orientation.
        </p>
        <FloorPlanTopologyCorrectionPanel
          document={document}
          onChange={onChange}
          onFocusIds={setFocusedCorrectionIds}
          onError={setError}
          dark={dark}
          disabled={disabled} proMode={proMode}
        />
        <FloorPlanOrientationReviewPanel
          document={document}
          onChange={onChange}
          onError={setError}
          dark={dark}
          disabled={disabled}
        />
      </details>
      {error ? (
        <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {sidebarFooter}
    </>
  );

  if (previewOnly) return canvas;

  if (consumerMode) {
    return (
      <div ref={root}>
        {canvas}
        <details
          id="floor-plan-manual-tools"
          className={
            dark
              ? "designer-recessed mt-4 rounded-xl border border-white/10 p-4"
              : "mt-4 rounded-xl border border-neutral-200 bg-white p-4"
          }
          open={manualToolsOpen}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            if (open !== manualToolsOpen) onManualToolsOpenChange?.(open);
          }}
        >
          <summary className="cursor-pointer text-sm font-semibold">
            Help AI finish this plan
          </summary>
          <p
            className={
              dark
                ? "mt-2 text-xs leading-5 text-neutral-400"
                : "mt-2 text-xs leading-5 text-neutral-600"
            }
          >
            Only use these tools when the preview is missing a room, scale,
            door, or wall. Your changes are checked again before a design can
            be created.
          </p>
          {primaryControls}
        </details>
      </div>
    );
  }

  if (!guidedLayout) {
    return (
      <div ref={root}>
        {canvas}
        {primaryControls}
      </div>
    );
  }

  return (
    <div ref={root} className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,0.7fr)]">
      <div className="min-w-0 xl:sticky xl:top-4">{canvas}</div>
      <aside className="min-w-0 rounded-xl border bg-neutral-50 p-3 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
        <div className="rounded-lg bg-white p-3 text-xs leading-5 text-neutral-700">
          <div className="font-semibold text-neutral-900">Follow these steps</div>
          <ol className="mt-1 list-inside list-decimal">
            <li>Set one printed measurement.</li>
            <li>Trace each room around its inside corners.</li>
            <li>Add visible doors and windows, if any.</li>
            <li>Save and run the automatic checks.</li>
          </ol>
        </div>
        {primaryControls}
      </aside>
    </div>
  );
}
