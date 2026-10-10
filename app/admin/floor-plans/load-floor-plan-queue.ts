import {
  ADMIN_FLOOR_PLAN_QUEUE_JOB_SELECT,
  ADMIN_FLOOR_PLAN_QUEUE_PAGE_SIZE,
  buildAdminFloorPlanQueueWhere,
  floorPlanQueueAttention,
  type AdminFloorPlanQueueFilter,
  type AdminFloorPlanQueueJob,
} from "@/lib/floor-plan-imports/admin-queue";
import { prisma } from "@/lib/prisma";
import {
  adminPageArgs,
  adminPageFromRows,
  parseAdminPageRequest,
  type AdminPage,
  type AdminSearchParams,
} from "../admin-paging";

const PROCESSING = ["received", "rendered", "extracted", "selecting_page", "scale_solved", "topology_built", "validating"];

export type FloorPlanQueue = {
  page: AdminPage<AdminFloorPlanQueueJob>;
  cursorLost: boolean;
  summary: Record<"active" | "needsReview" | "ready" | "approved" | "published" | "failed", number>;
};

/**
 * One page of the floor-plan queue, both ways (UX audit AD6), with counts for every job. Links
 * from before the change said `cursor=` for the next page; they still work.
 */
export async function loadFloorPlanQueue(input: {
  filter: AdminFloorPlanQueueFilter;
  query: string;
  overdue: boolean;
  params: AdminSearchParams;
}): Promise<FloorPlanQueue> {
  let request = parseAdminPageRequest({ ...input.params, after: input.params.after ?? input.params.cursor });
  const cursorLost =
    request.direction !== "first" &&
    !(await prisma.floorPlanImportJob.findUnique({ where: { id: request.cursor }, select: { id: true } }));
  if (cursorLost) request = { direction: "first" };

  const where = buildAdminFloorPlanQueueWhere(input);
  const [rows, statusRows, approved, published] = await Promise.all([
    prisma.floorPlanImportJob.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...adminPageArgs(request, ADMIN_FLOOR_PLAN_QUEUE_PAGE_SIZE),
      select: ADMIN_FLOOR_PLAN_QUEUE_JOB_SELECT,
    }),
    prisma.floorPlanImportJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.floorPlanRevision.count({ where: { publicationStatus: "approved" } }),
    prisma.floorPlanRevision.count({ where: { publicationStatus: "published" } }),
  ]);
  const page = adminPageFromRows(rows, request, ADMIN_FLOOR_PLAN_QUEUE_PAGE_SIZE);
  const counts = new Map<string, number>(statusRows.map((row) => [row.status, row._count._all]));
  return {
    page: { ...page, rows: page.rows.map((job) => ({ ...job, attention: floorPlanQueueAttention(job) })) },
    cursorLost,
    summary: {
      active: PROCESSING.reduce((total, status) => total + (counts.get(status) ?? 0), 0),
      needsReview: counts.get("needs_review") ?? 0,
      ready: counts.get("ready") ?? 0,
      approved,
      published,
      failed: counts.get("failed") ?? 0,
    },
  };
}
