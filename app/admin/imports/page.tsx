import type { Metadata } from "next";
import { canAccessAdmin } from "@/lib/admin";
import { AdminPageHeader } from "../AdminPageHeader";
import { AdminPager } from "../AdminPager";
import { adminSection, adminTitle } from "../admin-navigation";
import { adminPageHrefs, type AdminSearchParams } from "../admin-paging";
import { auth } from "../admin-session";
import { ImportJobsFilters, ImportJobsSummary, ImportJobsTable } from "./ImportJobsList";
import { importJobListParams, parseImportJobListFilters } from "./import-jobs-list";
import { loadImportJobList } from "./load-import-jobs";

const SECTION = adminSection("/admin/imports");

export const metadata: Metadata = { title: adminTitle(SECTION.title) };

function loadErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to load import jobs.";
  return message.includes("User was denied access")
    ? "Database access was denied for the configured DATABASE_URL user."
    : message;
}

export default async function AdminImportsPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return null;

  const params = await searchParams;
  const filters = parseImportJobListFilters(params);
  const loaded = await loadImportJobList(filters, params).then(
    (list) => ({ list, errorMessage: null }),
    (error: unknown) => ({ list: null, errorMessage: loadErrorMessage(error) })
  );
  const { list, errorMessage } = loaded;
  const pages = list ? adminPageHrefs(SECTION.href, importJobListParams(filters), list.page) : null;

  return (
    <div className="p-6 space-y-6">
      <AdminPageHeader
        crumbs={[{ title: SECTION.title }]}
        title={SECTION.title}
        description="Every model import, from the uploaded file to its catalog entry."
      />

      {errorMessage && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-medium">Import jobs are temporarily unavailable.</div>
          <div className="mt-1">{errorMessage}</div>
        </section>
      )}

      <ImportJobsSummary counts={list?.statusCounts ?? new Map()} />
      <ImportJobsFilters filters={filters} />
      <p className="text-sm text-neutral-600">
        {list ? `${list.matching} ${list.matching === 1 ? "job matches" : "jobs match"}` : "No jobs loaded"}
      </p>
      <ImportJobsTable jobs={list?.page.rows ?? []} />
      {list && pages ? <AdminPager {...pages} cursorLost={list.cursorLost} /> : null}
    </div>
  );
}
