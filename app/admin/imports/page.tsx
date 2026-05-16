import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { BulkImportsTable } from "@/components/admin/BulkImportsTable";
import {
  getAdminImportWorkflowData,
} from "@/lib/import-jobs/admin-workflow";



export default async function AdminImportsPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }
  const workflow = await getAdminImportWorkflowData();
  const jobs = workflow.jobs;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Import Jobs</h1>
        <p className="text-sm text-neutral-600">Queue-based intake-to-publish workflow for catalog operations.</p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <Link href="/admin/catalog/inbox" className="text-blue-600 hover:text-blue-700">
            Open inbox workflow
          </Link>
          <Link href="/admin/catalog/review" className="text-blue-600 hover:text-blue-700">
            Open side-by-side review
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Scrape queue</div>
          <div className="text-lg font-semibold">{workflow.summary.scrape}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Normalize queue</div>
          <div className="text-lg font-semibold">{workflow.summary.normalize}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Review queue</div>
          <div className="text-lg font-semibold">{workflow.summary.review}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Publish queue</div>
          <div className="text-lg font-semibold">{workflow.summary.publish}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Blocked</div>
          <div className="text-lg font-semibold">{workflow.summary.blocked}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Total jobs</div>
          <div className="text-lg font-semibold">{workflow.summary.total}</div>
        </div>
      </section>

      <BulkImportsTable jobs={jobs} />
    </div>
  );
}
