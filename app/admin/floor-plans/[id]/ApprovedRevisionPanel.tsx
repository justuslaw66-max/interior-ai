import { isRecord } from "./floorPlanReviewModel";
import type { AdminJob } from "./floorPlanReviewTypes";

export function ApprovedRevisionPanel({
  job,
  pending,
  publish,
  publishConfirmed,
  setPublishConfirmed,
  retire,
  retireConfirmation,
  retireReason,
  setRetireConfirmation,
  setRetireReason,
}: {
  job: AdminJob;
  pending: string | null;
  publish: () => void;
  publishConfirmed: boolean;
  setPublishConfirmed: (value: boolean) => void;
  retire: () => void;
  retireConfirmation: string;
  retireReason: string;
  setRetireConfirmation: (value: string) => void;
  setRetireReason: (value: string) => void;
}) {
  if (!job.revision) return null;
  const canRetire = ["approved", "published"].includes(
    job.revision.publicationStatus
  );
  const requiredRetirementConfirmation = `RETIRE ${job.revision.id}`;

  return (
    <div className="mt-4 space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-left text-xs">
              <th className="p-2">Address</th>
              <th className="p-2">Stack / floors</th>
              <th className="p-2">Transform</th>
            </tr>
          </thead>
          <tbody>
            {job.revision.addressBindings.map((binding) => (
              <tr
                className="border-b last:border-b-0"
                key={binding.id ?? `${binding.addressNormalized}-${binding.stack}`}
              >
                <td className="p-2">{binding.addressNormalized}</td>
                <td className="p-2">
                  {binding.stack ?? "all stacks"} · {binding.floorMin ?? "…"}–
                  {binding.floorMax ?? "…"}
                </td>
                <td className="p-2 font-mono text-xs">{binding.transform}</td>
              </tr>
            ))}
            {!job.revision.addressBindings.length ? (
              <tr>
                <td className="p-4 text-center text-xs text-neutral-500" colSpan={3}>
                  No address bindings; this revision is not address-searchable.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {job.revision.auditEvents.length ? (
        <div className="rounded-lg border p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Immutable lifecycle audit
          </h3>
          <div className="mt-2 space-y-2">
            {job.revision.auditEvents.map((event) => {
              const metadata = isRecord(event.metadataJson)
                ? event.metadataJson
                : {};
              return (
                <div className="rounded border bg-neutral-50 p-2 text-xs" key={event.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {event.eventType.replaceAll("_", " ")}
                    </span>
                    <span className="text-neutral-500">
                      {new Date(event.occurredAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-neutral-600">
                    Actor: {event.actorEmail ?? "system backfill"}
                  </div>
                  {typeof metadata.lifecycleReason === "string" ? (
                    <div className="mt-1">Reason: {metadata.lifecycleReason}</div>
                  ) : null}
                  {typeof metadata.replacementRevisionId === "string" ? (
                    <div className="mt-1">
                      Replacement: <span className="font-mono">{metadata.replacementRevisionId}</span>
                    </div>
                  ) : null}
                  {typeof metadata.supersedesRevisionId === "string" ? (
                    <div className="mt-1">
                      Supersedes: <span className="font-mono">{metadata.supersedesRevisionId}</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {job.revision.publicationStatus === "approved" ? (
        <>
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <input
              checked={publishConfirmed}
              className="mt-0.5"
              onChange={(event) => setPublishConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>
              I am an authorized publisher other than reviewer{" "}
              <strong>{job.revision.approvedByEmail ?? "unknown"}</strong>, and
              confirm this immutable revision and its address bindings are ready
              for the public library.
            </span>
          </label>
          <button
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            disabled={!publishConfirmed || Boolean(pending)}
            onClick={publish}
            type="button"
          >
            {pending === "publish" ? "Publishing…" : "Publish approved revision"}
          </button>
        </>
      ) : job.revision.publicationStatus === "published" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <div>This immutable revision is published.</div>
          <div className="mt-1 text-xs">
            To correct it without address downtime, create and fully review a new
            import, then enter this revision ID in that replacement&apos;s approval
            panel: <span className="font-mono font-semibold">{job.revision.id}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-neutral-50 p-3 text-sm text-neutral-700">
          This revision is retired and no longer appears in address search. Its
          document and bindings remain immutable so existing saved designs can
          keep referencing it.
        </div>
      )}
      {canRetire ? (
        <details className="rounded-lg border border-red-200 bg-red-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-red-900">
            Withdraw without replacement
          </summary>
          <p className="mt-2 text-xs leading-5 text-red-800">
            Use this only when the plan must disappear from the public library
            immediately and no reviewed replacement is ready. Geometry, address
            bindings, and lifecycle evidence stay immutable, and existing saved
            designs keep working. For a correction, use the atomic replacement
            workflow on the new import instead.
          </p>
          <label className="mt-3 block text-xs font-medium text-red-950">
            Withdrawal reason
            <textarea
              className="mt-1 min-h-20 w-full rounded border border-red-200 bg-white p-2 text-sm"
              maxLength={2_000}
              onChange={(event) => setRetireReason(event.target.value)}
              placeholder="Explain the safety, licensing, source, or address issue requiring withdrawal."
              value={retireReason}
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-red-950">
            Type <span className="font-mono">{requiredRetirementConfirmation}</span>{" "}
            to confirm
            <input
              autoComplete="off"
              className="mt-1 w-full rounded border border-red-200 bg-white p-2 font-mono text-xs"
              onChange={(event) => setRetireConfirmation(event.target.value)}
              value={retireConfirmation}
            />
          </label>
          <button
            className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            disabled={
              Boolean(pending) ||
              retireReason.trim().length < 10 ||
              retireConfirmation.trim() !== requiredRetirementConfirmation
            }
            onClick={retire}
            type="button"
          >
            {pending === "retire" ? "Withdrawing…" : "Withdraw revision"}
          </button>
        </details>
      ) : null}
    </div>
  );
}
