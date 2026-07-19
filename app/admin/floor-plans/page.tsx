import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import {
  ADMIN_FLOOR_PLAN_QUEUE_FILTERS,
  ADMIN_FLOOR_PLAN_QUEUE_JOB_SELECT,
  ADMIN_FLOOR_PLAN_QUEUE_PAGE_SIZE,
  buildAdminFloorPlanQueueWhere,
  floorPlanQueueAttention,
  parseAdminFloorPlanQueueFilter,
} from "@/lib/floor-plan-imports/admin-queue";
import { prisma } from "@/lib/prisma";
import AdminFloorPlanFixturePanel from "./AdminFloorPlanFixturePanel";
import AdminFloorPlanIntakeForm from "./AdminFloorPlanIntakeForm";
import AdminFloorPlanQueueTable from "./AdminFloorPlanQueueTable";

type PageSearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function nextQueueHref(input: {
  filter: string;
  query: string;
  overdue: boolean;
  cursor: string | null;
}) {
  if (!input.cursor) return null;
  const params = new URLSearchParams();
  if (input.filter !== "all") params.set("filter", input.filter);
  if (input.query) params.set("q", input.query);
  if (input.overdue) params.set("overdue", "1");
  params.set("cursor", input.cursor);
  return `/admin/floor-plans?${params.toString()}`;
}

export default async function AdminFloorPlansPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) redirect("/");

  const params = await searchParams;
  const filter = parseAdminFloorPlanQueueFilter(single(params.filter));
  const query = (single(params.q) ?? "").trim().slice(0, 120);
  const overdue = single(params.overdue) === "1";
  let cursor = single(params.cursor)?.trim() || null;
  if (cursor) {
    const cursorExists = await prisma.floorPlanImportJob.findUnique({
      where: { id: cursor },
      select: { id: true },
    });
    if (!cursorExists) cursor = null;
  }
  const where = buildAdminFloorPlanQueueWhere({ filter, query, overdue });
  const [rows, statusRows, approved, published] = await Promise.all([
    prisma.floorPlanImportJob.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: ADMIN_FLOOR_PLAN_QUEUE_PAGE_SIZE + 1,
      select: ADMIN_FLOOR_PLAN_QUEUE_JOB_SELECT,
    }),
    prisma.floorPlanImportJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.floorPlanRevision.count({ where: { publicationStatus: "approved" } }),
    prisma.floorPlanRevision.count({ where: { publicationStatus: "published" } }),
  ]);
  const hasMore = rows.length > ADMIN_FLOOR_PLAN_QUEUE_PAGE_SIZE;
  const jobs = rows.slice(0, ADMIN_FLOOR_PLAN_QUEUE_PAGE_SIZE).map((job) => ({
    ...job,
    attention: floorPlanQueueAttention(job),
  }));
  const counts = new Map<string, number>(
    statusRows.map((row) => [row.status, row._count._all])
  );

  const summary = {
    active: ["received", "rendered", "extracted", "scale_solved", "topology_built", "validating"]
      .reduce((total, status) => total + (counts.get(status) ?? 0), 0),
    needsReview: counts.get("needs_review") ?? 0,
    ready: counts.get("ready") ?? 0,
    approved,
    published,
    failed: counts.get("failed") ?? 0,
  };
  const nextHref = nextQueueHref({
    filter,
    query,
    overdue,
    cursor: hasMore ? jobs.at(-1)?.id ?? null : null,
  });

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Floor-plan platform
          </div>
          <h1 className="mt-1 text-2xl font-semibold">Import review queue</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-600">
            Review source registration, resolve extraction uncertainty, then approve an immutable
            revision. Publication always runs the server verification gates.
          </p>
        </div>
        <Link className="rounded-lg border px-3 py-2 text-sm font-medium" href="/admin">
          Admin overview
        </Link>
      </header>

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

      <AdminFloorPlanQueueTable jobs={jobs} nextHref={nextHref} />
    </main>
  );
}
