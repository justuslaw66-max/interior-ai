import Image from "next/image";
import type {
  AdminJob,
  RenderedPage,
  ReviewOverlay,
} from "./floorPlanReviewTypes";

export function FloorPlanSourceOverlayPanel({
  job,
  onPageChange,
  onShowEvidenceChange,
  onShowWallsChange,
  overlay,
  pages,
  selectedPage,
  selectedPageNumber,
  showEvidence,
  showWalls,
}: {
  job: AdminJob;
  onPageChange: (pageNumber: number) => void;
  onShowEvidenceChange: (show: boolean) => void;
  onShowWallsChange: (show: boolean) => void;
  overlay: ReviewOverlay;
  pages: RenderedPage[];
  selectedPage: RenderedPage | null;
  selectedPageNumber: number | null;
  showEvidence: boolean;
  showWalls: boolean;
}) {
  const evidenceShown = overlay.evidence.slice(0, 2_000);
  const maximumResidual = overlay.anchorResiduals.length
    ? Math.max(...overlay.anchorResiduals.map((item) => item.residualPx)).toFixed(3)
    : null;

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">2D plan preview</h2>
          <p className="mt-1 text-xs text-neutral-600">
            Compare the detected walls with the uploaded drawing. The highlighted
            wall lines should follow the source exactly, with closed room boundaries.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {pages.map((page) => (
            <button
              className={`rounded border px-2 py-1 ${
                page.pageNumber === selectedPageNumber
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : ""
              }`}
              key={page.pageNumber}
              onClick={() => onPageChange(page.pageNumber)}
              type="button"
            >
              Page {page.pageNumber}
            </button>
          ))}
        </div>
      </div>
      {selectedPage ? (
        <>
          <div
            className="relative mt-4 w-full overflow-hidden rounded-lg border bg-neutral-100"
            style={{ aspectRatio: `${selectedPage.widthPx} / ${selectedPage.heightPx}` }}
          >
            <Image
              alt={`Rendered source page ${selectedPage.pageNumber}`}
              className="object-contain"
              fill
              priority
              sizes="(max-width: 1280px) 100vw, 65vw"
              src={`/api/admin/floor-plan-imports/${job.id}/assets/${selectedPage.assetKey}`}
              unoptimized
            />
            <svg
              aria-label="Canonical geometry and evidence overlay"
              className="pointer-events-none absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
              viewBox={`0 0 ${selectedPage.widthPx} ${selectedPage.heightPx}`}
            >
              {showEvidence
                ? evidenceShown.map((item, index) => (
                    <g key={`${item.entityId}-${index}`}>
                      <title>{`${item.entityId}: ${item.basis} (${Math.round(item.confidence * 100)}%)`}</title>
                      <rect
                        fill="rgba(6,182,212,.08)"
                        height={item.heightPx}
                        stroke="rgb(8,145,178)"
                        strokeWidth={2}
                        width={item.widthPx}
                        x={item.xPx}
                        y={item.yPx}
                      />
                    </g>
                  ))
                : null}
              {showWalls
                ? overlay.walls.map((wall) => (
                    <polyline
                      fill="none"
                      key={wall.wallId}
                      points={wall.points
                        .map((point) => `${point.xPx},${point.yPx}`)
                        .join(" ")}
                      stroke="rgb(219,39,119)"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))
                : null}
              {overlay.calibrations.flatMap((calibration) =>
                calibration.points.map((point, index) => (
                  <circle
                    cx={point.xPx}
                    cy={point.yPx}
                    fill="rgb(250,204,21)"
                    key={`${calibration.calibrationId}-${index}`}
                    r={7}
                    stroke="rgb(113,63,18)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                ))
              )}
              {overlay.anchorResiduals.map((residual) => {
                const color = residual.withinTolerance
                  ? "rgb(5,150,105)"
                  : "rgb(220,38,38)";
                return (
                  <g
                    key={`${residual.entityType}-${residual.entityId}-${residual.role}-${residual.calibrationId}`}
                  >
                    <title>{`${residual.entityId} ${residual.role}: ${residual.residualPx.toFixed(3)} px residual`}</title>
                    <line
                      stroke={color}
                      strokeDasharray="3 3"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                      x1={residual.observedSourcePx.xPx}
                      x2={residual.expectedSourcePx.xPx}
                      y1={residual.observedSourcePx.yPx}
                      y2={residual.expectedSourcePx.yPx}
                    />
                    <circle
                      cx={residual.observedSourcePx.xPx}
                      cy={residual.observedSourcePx.yPx}
                      fill="white"
                      r={5}
                      stroke={color}
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
            </svg>
          </div>
          <details className="mt-3 rounded-lg border p-3 text-xs text-neutral-600">
            <summary className="cursor-pointer font-medium text-neutral-700">
              Overlay details
            </summary>
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input
                  checked={showWalls}
                  onChange={(event) => onShowWallsChange(event.target.checked)}
                  type="checkbox"
                />
                Detected walls ({overlay.walls.length})
              </label>
              <label className="flex items-center gap-2">
                <input
                  checked={showEvidence}
                  onChange={(event) => onShowEvidenceChange(event.target.checked)}
                  type="checkbox"
                />
                Source evidence ({overlay.evidence.length})
              </label>
              <span>
                Scale points:{" "}
                {overlay.calibrations.reduce(
                  (sum, item) => sum + item.points.length,
                  0
                )}
              </span>
              <span>
                Measured anchors: {overlay.anchorResiduals.length}
                {maximumResidual ? ` · max ${maximumResidual} px` : " · missing"}
              </span>
            </div>
            {overlay.anchorIssues.length ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
                <div className="font-medium">Source verification details</div>
                <ul className="mt-2 space-y-1">
                  {overlay.anchorIssues.slice(0, 100).map((issue, index) => (
                    <li key={`${issue.code}-${issue.path}-${index}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 font-medium text-emerald-700">Overlay checks ready</p>
            )}
          </details>
        </>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed p-10 text-center text-sm text-neutral-500">
          No rendered page is available. Keep the underlay and use guided tracing
          when extraction is weak.
        </div>
      )}
    </div>
  );
}
