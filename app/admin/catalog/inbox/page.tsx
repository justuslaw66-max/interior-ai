import type { Metadata } from "next";
import Link from "next/link";
import { isAdminEmail } from "@/lib/admin";
import { InboxFiltersUI, type InboxQueueFilter } from "@/components/admin/InboxFiltersUI";
import {
  getAdminImportWorkflowData,
  getImportJobValidationBlockers,
  getImportWorkflowQueueCounts,
} from "@/lib/import-jobs/admin-workflow";
import { AdminPageHeader } from "../../AdminPageHeader";
import { AdminStatusBadge } from "../../AdminStatusBadge";
import { adminSection, adminTitle } from "../../admin-navigation";
import { auth } from "../../admin-session";
import { InboxQueueCard, InboxSummary } from "./InboxQueues";

const SECTION = adminSection("/admin/catalog/inbox");

export const metadata: Metadata = { title: adminTitle(SECTION.title) };

export default async function AdminCatalogInboxPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) return null;

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedQueue = resolvedSearchParams?.queue;
  const queueFilter =
    typeof requestedQueue === "string" &&
    ["all", "scrape", "normalize", "review", "publish"].includes(requestedQueue)
      ? (requestedQueue as InboxQueueFilter)
      : "all";
  const blockersOnly =
    resolvedSearchParams?.blocked === "1" ||
    (Array.isArray(resolvedSearchParams?.blocked) && resolvedSearchParams?.blocked.includes("1"));

  const [workflow, queueCounts] = await Promise.all([
    getAdminImportWorkflowData(),
    getImportWorkflowQueueCounts(),
  ]);
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
      <AdminPageHeader
        crumbs={[{ title: SECTION.title }]}
        title={SECTION.title}
        description="Every import job by queue (scrape, normalize, review, publish), with the jobs that are blocked."
      />

      <InboxSummary counts={queueCounts} blocked={workflow.summary.blocked} />

      <InboxFiltersUI queue={queueFilter} blockersOnly={blockersOnly} />

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
                  <td className="px-3 py-2"><AdminStatusBadge kind="workflowStage" status={job.workflowStage} /></td>
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
          <InboxQueueCard key={queue.key} queue={queue} />
        ))}
      </div>
    </div>
  );
}
