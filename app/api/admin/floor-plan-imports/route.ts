import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_FLOOR_PLAN_QUEUE_MAX_PAGE_SIZE,
  ADMIN_FLOOR_PLAN_QUEUE_PAGE_SIZE,
  ADMIN_FLOOR_PLAN_QUEUE_JOB_SELECT,
  buildAdminFloorPlanQueueWhere,
  floorPlanQueueAttention,
  parseAdminFloorPlanQueueFilter,
} from "@/lib/floor-plan-imports/admin-queue";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const filter = parseAdminFloorPlanQueueFilter(url.searchParams.get("filter"));
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const overdue = url.searchParams.get("overdue") === "1";
  const cursor = url.searchParams.get("cursor")?.trim() || null;
  const requestedLimit = Number(url.searchParams.get("limit") ?? ADMIN_FLOOR_PLAN_QUEUE_PAGE_SIZE);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(
        ADMIN_FLOOR_PLAN_QUEUE_MAX_PAGE_SIZE,
        Math.max(1, Math.floor(requestedLimit))
      )
    : ADMIN_FLOOR_PLAN_QUEUE_PAGE_SIZE;
  if (cursor) {
    const exists = await prisma.floorPlanImportJob.findUnique({
      where: { id: cursor },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Invalid floor-plan queue cursor" }, { status: 400 });
    }
  }
  const where = buildAdminFloorPlanQueueWhere({ filter, query, overdue });
  const rows = await prisma.floorPlanImportJob.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1,
    select: ADMIN_FLOOR_PLAN_QUEUE_JOB_SELECT,
  });
  const hasMore = rows.length > limit;
  const jobs = rows.slice(0, limit).map((job) => ({
    ...job,
    attention: floorPlanQueueAttention(job),
  }));
  return NextResponse.json(
    {
      filter,
      query,
      overdue,
      jobs,
      nextCursor: hasMore ? jobs.at(-1)?.id ?? null : null,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
