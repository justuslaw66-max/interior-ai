import Link from "next/link";
import type { AdminFloorPlanQueueJob } from "@/lib/floor-plan-imports/admin-queue";

const STATUS_TONES: Record<string, string> = {
  received: "border-neutral-200 bg-neutral-50 text-neutral-700",
  rendered: "border-blue-200 bg-blue-50 text-blue-700",
  extracted: "border-blue-200 bg-blue-50 text-blue-700",
  scale_solved: "border-blue-200 bg-blue-50 text-blue-700",
  topology_built: "border-blue-200 bg-blue-50 text-blue-700",
  validating: "border-violet-200 bg-violet-50 text-violet-700",
  needs_review: "border-amber-200 bg-amber-50 text-amber-800",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
  applied: "border-emerald-200 bg-emerald-50 text-emerald-800",
  published: "border-green-200 bg-green-50 text-green-800",
  failed: "border-red-200 bg-red-50 text-red-700",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function attentionLabel(attention: AdminFloorPlanQueueJob["attention"]) {
  if (attention === "processing_overdue") return "Processing SLA missed";
  if (attention === "review_overdue") return "Review SLA missed";
  if (attention === "failed") return "Action required";
  return null;
}

export default function AdminFloorPlanQueueTable({
  jobs,
  nextHref,
}: {
  jobs: AdminFloorPlanQueueJob[];
  nextHref: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-left text-xs text-neutral-600">
              {[
                "Source",
                "Status",
                "Progress",
                "Owner",
                "Extractor",
                "Revision",
                "Updated",
              ].map((label) => (
                <th className="px-4 py-3 font-medium" key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const attention = attentionLabel(job.attention);
              return (
                <tr className="border-b align-top last:border-b-0" key={job.id}>
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-blue-700 hover:text-blue-800"
                      href={`/admin/floor-plans/${job.id}`}
                    >
                      {job.sourceAsset.fileName}
                    </Link>
                    <div className="mt-1 text-xs text-neutral-500">
                      {job.sourceAsset.mimeType} · {formatBytes(job.sourceAsset.byteLength)}
                    </div>
                    <div className="mt-1 max-w-52 truncate font-mono text-[10px] text-neutral-400">
                      {job.sourceAsset.sha256}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
                        STATUS_TONES[job.status] ?? STATUS_TONES.received
                      }`}
                    >
                      {job.status.replaceAll("_", " ")}
                    </span>
                    {attention ? (
                      <div className="mt-2 text-xs font-semibold text-red-700">{attention}</div>
                    ) : null}
                    {job.errorMessage ? (
                      <div className="mt-2 max-w-64 text-xs text-red-700">{job.errorMessage}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-2 w-28 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {job.progress}% · candidate v{job.candidateVersion}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600">
                    {job.user.email ?? "No email"}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600">
                    <div>{job.adapterId ?? "Not selected"}</div>
                    <div className="text-neutral-400">{job.extractionVersion ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600">
                    {job.revision ? (
                      <>
                        <div className="font-medium">{job.revision.publicationStatus}</div>
                        <div>{job.revision.verificationTier.replaceAll("_", " ")}</div>
                      </>
                    ) : (
                      "Not approved"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600">
                    {job.updatedAt.toLocaleString()}
                  </td>
                </tr>
              );
            })}
            {jobs.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-neutral-500" colSpan={7}>
                  No floor-plan import jobs match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {nextHref ? (
        <div className="flex justify-end border-t bg-neutral-50 px-4 py-3">
          <Link className="rounded-lg border bg-white px-3 py-2 text-sm font-medium" href={nextHref}>
            Next 50
          </Link>
        </div>
      ) : null}
    </section>
  );
}
