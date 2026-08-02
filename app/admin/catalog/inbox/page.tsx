import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { InboxFiltersUI } from "@/components/admin/InboxFiltersUI";
import {
  getAdminImportWorkflowData,
  getImportJobValidationBlockers,
} from "@/lib/import-jobs/admin-workflow";

type QueueFilter = "all" | "scrape" | "normalize" | "review" | "publish";

export default async function AdminCatalogInboxPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedQueue = resolvedSearchParams?.queue;
  const queueFilter =
    typeof requestedQueue === "string" &&
    ["all", "scrape", "normalize", "review", "publish"].includes(requestedQueue)
      ? (requestedQueue as QueueFilter)
      : "all";
  const blockersOnly =
    resolvedSearchParams?.blocked === "1" ||
    (Array.isArray(resolvedSearchParams?.blocked) && resolvedSearchParams?.blocked.includes("1"));

  const workflow = await getAdminImportWorkflowData();
  const filteredQueues = workflow.queues
    .filter((queue) => queueFilter === "all" || queue.key === queueFilter)
    .map((queue) => ({
      ...queue,
      jobs: blockersOnly
        ? queue.jobs.filter((job) => getImportJobValidationBlockers(job).length > 0)
        : queue.jobs,
    }));
  const filteredBlockers = queueFilter === "all"
    ? workflow.blockers
    : workflow.blockers.filter((job) => filteredQueues.some((queue) => queue.jobs.some((entry) => entry.id === job.id)));

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Phase B</div>
        <h1 className="text-2xl font-semibold">Catalog Inbox</h1>
        <p className="max-w-3xl text-sm text-neutral-600">
          This is the operations view for catalog growth: scrape queue, normalize queue, review queue,
          publish queue, and validation blockers in one admin workflow.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-xl border p-3">
          <div className="text-xs text-neutral-500">Total jobs</div>
          <div className="text-2xl font-semibold">{workflow.summary.total}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-neutral-500">Scrape queue</div>
          <div className="text-2xl font-semibold">{workflow.summary.scrape}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-neutral-500">Normalize queue</div>
          <div className="text-2xl font-semibold">{workflow.summary.normalize}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-neutral-500">Review queue</div>
          <div className="text-2xl font-semibold">{workflow.summary.review}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-neutral-500">Blocked</div>
          <div className="text-2xl font-semibold">{workflow.summary.blocked}</div>
        </div>
      </section>

      <InboxFiltersUI initialQueue={queueFilter} initialBlocked={blockersOnly} />

      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Validation blockers</h2>
            <p className="mt-1 text-xs text-neutral-600">
              Jobs listed here have blockers that should stop publish or review progression.
            </p>
          </div>
          <Link href="/admin/catalog/review" className="text-xs text-blue-600 hover:text-blue-700">
            Open side-by-side review
          </Link>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[840px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-neutral-50 text-left">
                <th className="px-3 py-2 font-medium">Job</th>
                <th className="px-3 py-2 font-medium">Queue</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Next action</th>
                <th className="px-3 py-2 font-medium">Blockers</th>
              </tr>
            </thead>
            <tbody>
              {filteredBlockers.map((job) => (
                <tr key={job.id} className="border-b align-top">
                  <td className="px-3 py-2 font-medium">
                    <Link className="text-blue-600 hover:text-blue-700" href={`/admin/imports/${job.id}`}>
                      {job.id}
                    </Link>
                  </td>
                  <td className="px-3 py-2 capitalize">{job.workflowStage}</td>
                  <td className="px-3 py-2">
                    <div>{job.sourceFileName}</div>
                    <div className="text-xs text-neutral-500">{job.sourceBrand ?? "Unknown brand"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-600">{job.nextAction ?? "-"}</td>
                  <td className="px-3 py-2">
                    <ul className="list-disc pl-4 text-xs text-red-700">
                      {job.validationBlockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
              {filteredBlockers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-xs text-neutral-500">
                    No validation blockers right now.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {filteredQueues.map((queue) => (
          <section key={queue.key} className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{queue.title}</h2>
                <p className="mt-1 text-xs text-neutral-600">{queue.description}</p>
              </div>
              <div className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">
                {queue.jobs.length}
              </div>
            </div>

            <div className="mt-3 space-y-3">
              {queue.jobs.slice(0, 12).map((job) => {
                const validationBlockers = getImportJobValidationBlockers(job);
                return (
                  <div key={job.id} className="rounded-lg border border-neutral-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link className="text-sm font-medium text-blue-600 hover:text-blue-700" href={`/admin/imports/${job.id}`}>
                          {job.sourceFileName}
                        </Link>
                        <div className="mt-1 text-xs text-neutral-500">
                          {job.sourceBrand ?? "Unknown brand"}
                          {job.sourceSku ? ` · SKU ${job.sourceSku}` : ""}
                        </div>
                      </div>
                      <div className="rounded-full border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-700">
                        {job.status}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-neutral-600">Stage: {job.workflowStage}</div>
                    <div className="mt-1 text-xs text-neutral-600">Next: {job.nextAction ?? "-"}</div>
                    {validationBlockers.length > 0 ? (
                      <div className="mt-2 text-xs text-red-700">
                        {validationBlockers.length} blocker{validationBlockers.length === 1 ? "" : "s"}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {queue.jobs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-neutral-200 p-4 text-xs text-neutral-500">
                  No jobs in this queue.
                </div>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
