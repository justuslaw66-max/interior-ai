import Link from "next/link";
import { IMPORT_JOB_STATUS_SEQUENCE } from "@/lib/import-jobs/status";
import { AdminStatusBadge } from "../AdminStatusBadge";
import { describeAdminStatus } from "../admin-status";
import { IMPORT_JOB_SORTS, type ImportJobListFilters, type ImportJobListItem } from "./import-jobs-list";

const FIELD = "mt-1 block h-10 w-full rounded-lg border bg-white px-3 text-sm";
const PROCESSING = ["normalizing", "optimized", "preview_generated", "metadata_extracted"];

/** Status, search and sort, sent as the URL's query (a GET form), so a filtered list can be shared. */
export function ImportJobsFilters({ filters }: { filters: ImportJobListFilters }) {
  return (
    <form className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-[180px_1fr_auto_auto]" method="get">
      <label className="text-xs font-medium text-neutral-700">
        Status
        <select className={FIELD} defaultValue={filters.status ?? ""} name="status">
          <option value="">All statuses</option>
          {IMPORT_JOB_STATUS_SEQUENCE.map((status) => (
            <option key={status} value={status}>
              {describeAdminStatus("importJob", status).label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-neutral-700">
        Search file, brand, SKU or job ID
        <input className={FIELD} defaultValue={filters.query} maxLength={120} name="q" />
      </label>
      <label className="text-xs font-medium text-neutral-700">
        Sort
        <select className={FIELD} defaultValue={filters.sort} name="sort">
          {Object.entries(IMPORT_JOB_SORTS).map(([sort, label]) => (
            <option key={sort} value={sort}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button className="h-10 self-end rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white">
        Apply filters
      </button>
    </form>
  );
}

/** Counts across every import job, by status. */
export function ImportJobsSummary({ counts }: { counts: ReadonlyMap<string, number> }) {
  const count = (status: string) => counts.get(status) ?? 0;
  const tiles: Array<[string, number]> = [
    ["Received", count("received")],
    ["Processing", PROCESSING.reduce((total, status) => total + count(status), 0)],
    ["Needs mapping", count("needs_mapping")],
    ["Needs review", count("needs_review")],
    ["Failed", count("failed")],
    ["Published", count("published")],
  ];
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
      {tiles.map(([label, value]) => (
        <div className="rounded-lg border p-3" key={label}>
          <div className="text-xs text-neutral-500">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      ))}
    </section>
  );
}

export function ImportJobsTable({ jobs }: { jobs: ImportJobListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-neutral-50 text-left">
            <th className="px-3 py-2 font-medium">Job</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Brand</th>
            <th className="px-3 py-2 font-medium">Updated</th>
            <th className="px-3 py-2 font-medium">Error</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b align-top">
              <td className="px-3 py-2 font-medium">
                <Link className="text-blue-600 hover:text-blue-700" href={`/admin/imports/${job.id}`}>
                  {job.id}
                </Link>
              </td>
              <td className="px-3 py-2">
                <AdminStatusBadge kind="importJob" status={job.status} />
              </td>
              <td className="px-3 py-2">{job.sourceFileName}</td>
              <td className="px-3 py-2">{job.sourceBrand ?? "-"}</td>
              <td className="px-3 py-2 text-neutral-600">{job.updatedAt.toLocaleString()}</td>
              <td className="px-3 py-2 text-xs text-neutral-600">{job.errorMessage ?? "-"}</td>
            </tr>
          ))}
          {jobs.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-xs text-neutral-500">
                No import jobs match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
