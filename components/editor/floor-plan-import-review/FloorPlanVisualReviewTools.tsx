"use client";

import { useState, type ReactNode } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { ReviewSourcePoint } from "@/lib/floor-plan-import-review-geometry";
import type { ConsumerFloorPlanImportJob } from "../floor-plan-import-ui-types";
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
  onChange: (value: FloorPlanDocumentV2) => void;
  assetRoutePrefix?: string;
  guidedLayout?: boolean;
  openScaleByDefault?: boolean;
  sidebarFooter?: ReactNode;
  dark?: boolean;
  disabled?: boolean;
};

export default function FloorPlanVisualReviewTools({
  document,
  job,
  focusedIssueEntityIds,
  onChange,
  assetRoutePrefix,
  guidedLayout = false,
  openScaleByDefault = false,
  sidebarFooter,
  dark = false,
  disabled = false,
}: FloorPlanVisualReviewToolsProps) {
  const floor = document.floors[0];
  const initialPage =
    floor?.calibrations[0]?.pageNumber ??
    job.renderedPagesJson[0]?.pageNumber ??
    1;
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [pickingScale, setPickingScale] = useState(false);
  const [scalePoints, setScalePoints] = useState<ReviewSourcePoint[]>([]);
  const [pickingRoom, setPickingRoom] = useState(false);
  const [roomPoints, setRoomPoints] = useState<ReviewSourcePoint[]>([]);
  const [pickingOpening, setPickingOpening] = useState(false);
  const [openingPoints, setOpeningPoints] = useState<ReviewSourcePoint[]>([]);
  const [focusedCorrectionIds, setFocusedCorrectionIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const page =
    job.renderedPagesJson.find((entry) => entry.pageNumber === pageNumber) ??
    job.renderedPagesJson[0] ??
    null;
  const fallbackSourceId =
    floor?.calibrations[0]?.sourceId ?? document.sources[0]?.id ?? "";
  const sourceId =
    floor?.calibrations.find((entry) => entry.pageNumber === page?.pageNumber)
      ?.sourceId ?? fallbackSourceId;
  const calibration = floor?.calibrations.find(
    (entry) =>
      entry.sourceId === sourceId && entry.pageNumber === page?.pageNumber
  );
  if (!floor) return null;

  const expandedIssueFocus = new Set(focusedIssueEntityIds);
  for (const room of floor.rooms) {
    if (!expandedIssueFocus.has(room.id)) continue;
    for (const loop of room.wallLoops) {
      for (const wall of loop.walls) expandedIssueFocus.add(wall.wallId);
    }
  }
  const focusedEntityIds = [
    ...new Set([...expandedIssueFocus, ...focusedCorrectionIds]),
  ];

  const canvas = (
      <FloorPlanSourceReviewCanvas
        document={document}
        floorId={floor.id}
        sourceId={sourceId}
        jobId={job.id}
        adapterId={job.adapterId}
        pages={job.renderedPagesJson}
        pageNumber={page?.pageNumber ?? pageNumber}
        onPageNumberChange={(value) => {
          setPageNumber(value);
          setScalePoints([]);
          setRoomPoints([]);
          setOpeningPoints([]);
        }}
        focusedEntityIds={focusedEntityIds}
        pickingScale={pickingScale}
        scalePoints={scalePoints}
        onSourcePoint={(point) =>
          setScalePoints((current) =>
            current.length >= 2 ? [point] : [...current, point]
          )
        }
        pickingRoom={pickingRoom}
        roomPoints={roomPoints}
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
  );
  const primaryControls = (
    <>
      <FloorPlanScaleReviewPanel
        document={document}
        floorId={floor.id}
        sourceId={sourceId}
        page={page}
        calibration={calibration}
        pickingScale={pickingScale}
        scalePoints={scalePoints}
        onPickingScaleChange={(value) => {
          setPickingScale(value);
          if (value) {
            setPickingRoom(false);
            setPickingOpening(false);
          }
        }}
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
        onPickingRoomChange={(value) => {
          setPickingRoom(value);
          if (value) {
            setPickingScale(false);
            setPickingOpening(false);
          }
        }}
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
        onPickingOpeningChange={(value) => {
          setPickingOpening(value);
          if (value) {
            setPickingScale(false);
            setPickingRoom(false);
          }
        }}
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
          Most imports do not need these controls. Use them only to repair a
          specific wall, opening, structural object, dimension, or orientation.
        </p>
        <FloorPlanTopologyCorrectionPanel
          document={document}
          onChange={onChange}
          onFocusIds={setFocusedCorrectionIds}
          onError={setError}
          dark={dark}
          disabled={disabled}
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

  if (!guidedLayout) {
    return (
      <>
        {canvas}
        {primaryControls}
      </>
    );
  }

  return (
    <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,0.7fr)]">
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
