import type { AdminJob } from "./floorPlanReviewTypes";

export function FloorPlanReviewAuditPanels({ job }: { job: AdminJob }) {
  return (
    <>
      {Array.isArray(job.correctionLogJson) && job.correctionLogJson.length ? (
        <details className="rounded-xl border bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Correction audit log
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-neutral-950 p-3 text-[11px] text-neutral-100">
            {JSON.stringify(job.correctionLogJson, null, 2)}
          </pre>
        </details>
      ) : null}
      {job.sourceManifestJson ? (
        <details className="rounded-xl border bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Persisted source manifest
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-neutral-950 p-3 text-[11px] text-neutral-100">
            {JSON.stringify(job.sourceManifestJson, null, 2)}
          </pre>
        </details>
      ) : null}
    </>
  );
}
