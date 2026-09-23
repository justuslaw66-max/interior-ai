import { formatBytes, REVIEW_STAGES } from "./floorPlanReviewModel";
import type { AdminJob } from "./floorPlanReviewTypes";

export function FloorPlanJobSummary({
  job,
  onRefresh,
  pending,
}: {
  job: AdminJob;
  onRefresh: () => void;
  pending: string | null;
}) {
  const stageIndex =
    job.status === "failed"
      ? -1
      : REVIEW_STAGES.indexOf(job.status as (typeof REVIEW_STAGES)[number]);

  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{job.sourceAsset.fileName}</h2>
          <div className="mt-1 text-sm text-neutral-600">
            {job.sourceAsset.mimeType} · {formatBytes(job.sourceAsset.byteLength)} ·
            candidate v{job.candidateVersion}
          </div>
          <div className="mt-2 break-all font-mono text-[11px] text-neutral-500">
            SHA-256 {job.sourceAsset.sha256}
          </div>
        </div>
        <div className="flex gap-2">
          <a
            className="rounded-lg border px-3 py-2 text-xs font-medium"
            href={`/api/admin/floor-plan-imports/${job.id}/assets/source`}
            rel="noreferrer"
            target="_blank"
          >
            Open source
          </a>
          <button
            className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50"
            disabled={Boolean(pending)}
            onClick={onRefresh}
            type="button"
          >
            {pending === "reload" ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      <div className="mt-5 overflow-x-auto pb-2">
        <div className="flex min-w-max items-center">
          {REVIEW_STAGES.map((stage, index) => {
            const complete = stageIndex >= index && job.status !== "failed";
            const current = job.status === stage;
            return (
              <div className="flex items-center" key={stage}>
                {index ? (
                  <div
                    className={`h-px w-5 ${complete ? "bg-emerald-500" : "bg-neutral-200"}`}
                  />
                ) : null}
                <div
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${
                    current
                      ? "border-blue-600 bg-blue-600 font-medium text-white"
                      : complete
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-neutral-200 text-neutral-400"
                  }`}
                >
                  {stage.replaceAll("_", " ")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
        <div><span className="text-neutral-500">Progress:</span> {job.progress}%</div>
        <div><span className="text-neutral-500">Adapter:</span> {job.adapterId ?? "—"}</div>
        <div><span className="text-neutral-500">Extractor:</span> {job.extractionVersion ?? "—"}</div>
        <div><span className="text-neutral-500">Updated:</span> {new Date(job.updatedAt).toLocaleString()}</div>
      </div>
      {job.errorMessage ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {job.errorMessage}
        </div>
      ) : null}
    </section>
  );
}
