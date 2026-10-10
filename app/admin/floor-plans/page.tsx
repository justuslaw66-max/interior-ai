import type { Metadata } from "next";
import { canAccessAdmin } from "@/lib/admin";
import {
  ADMIN_FLOOR_PLAN_QUEUE_FILTERS,
  parseAdminFloorPlanQueueFilter,
} from "@/lib/floor-plan-imports/admin-queue";
import { AdminPageHeader } from "../AdminPageHeader";
import { adminSection, adminTitle } from "../admin-navigation";
import { adminPageHrefs, singleParam as single, type AdminSearchParams } from "../admin-paging";
import { auth } from "../admin-session";
import AdminFloorPlanFixturePanel from "./AdminFloorPlanFixturePanel";
import AdminFloorPlanIntakeForm from "./AdminFloorPlanIntakeForm";
import AdminFloorPlanQueueTable from "./AdminFloorPlanQueueTable";
import { loadFloorPlanQueue } from "./load-floor-plan-queue";

const SECTION = adminSection("/admin/floor-plans");

export const metadata: Metadata = { title: adminTitle(SECTION.title) };

export default async function AdminFloorPlansPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return null;

  const params = await searchParams;
  const filter = parseAdminFloorPlanQueueFilter(single(params.filter));
  const query = (single(params.q) ?? "").trim().slice(0, 120);
  const overdue = single(params.overdue) === "1";
  const queue = await loadFloorPlanQueue({ filter, query, overdue, params });
  const { summary } = queue;
  const pages = adminPageHrefs(
    SECTION.href,
    { filter: filter === "all" ? null : filter, q: query, overdue: overdue ? "1" : null },
    queue.page
  );

  return (
    <main className="space-y-6 p-6">
      <AdminPageHeader
        crumbs={[{ title: SECTION.title }]}
        title={SECTION.title}
        description="Review source registration, resolve extraction uncertainty, then approve an immutable revision. Publication always runs the server verification gates."
      />

      <AdminFloorPlanIntakeForm />

      <AdminFloorPlanFixturePanel />

      <form className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-[180px_1fr_auto_auto]" method="get">
        <label className="text-xs font-medium text-neutral-700">
          Queue
          <select
            className="mt-1 block h-10 w-full rounded-lg border bg-white px-3 text-sm"
            defaultValue={filter}
            name="filter"
          >
            {ADMIN_FLOOR_PLAN_QUEUE_FILTERS.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-neutral-700">
          Search source, owner, hash or job ID
          <input
            className="mt-1 block h-10 w-full rounded-lg border px-3 text-sm"
            defaultValue={query}
            maxLength={120}
            name="q"
            placeholder="Search review queue"
          />
        </label>
        <label className="flex h-10 items-center gap-2 self-end rounded-lg border px-3 text-sm">
          <input defaultChecked={overdue} name="overdue" type="checkbox" value="1" />
          Action overdue
        </label>
        <button className="h-10 self-end rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white">
          Apply filters
        </button>
      </form>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          ["Processing", summary.active],
          ["Needs review", summary.needsReview],
          ["Ready", summary.ready],
          ["Approved", summary.approved],
          ["Published", summary.published],
          ["Failed", summary.failed],
        ].map(([label, value]) => (
          <div className="rounded-xl border bg-white p-3" key={String(label)}>
            <div className="text-xs text-neutral-500">{label}</div>
            <div className="mt-1 text-xl font-semibold">{value}</div>
          </div>
        ))}
      </section>

      <AdminFloorPlanQueueTable jobs={queue.page.rows} {...pages} cursorLost={queue.cursorLost} />
    </main>
  );
}
