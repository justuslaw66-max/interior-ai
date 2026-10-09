import { prisma } from "@/lib/prisma";
import {
  adminPageArgs,
  adminPageFromRows,
  parseAdminPageRequest,
  type AdminSearchParams,
} from "../admin-paging";
import {
  IMPORT_JOB_LIST_SELECT,
  importJobListOrder,
  importJobListWhere,
  type ImportJobList,
  type ImportJobListFilters,
} from "./import-jobs-list";

/** One page of Import jobs, how many match, and every job's count by status. */
export async function loadImportJobList(
  filters: ImportJobListFilters,
  params: AdminSearchParams
): Promise<ImportJobList> {
  let request = parseAdminPageRequest(params);
  const cursorLost =
    request.direction !== "first" &&
    !(await prisma.importJob.findUnique({ where: { id: request.cursor }, select: { id: true } }));
  if (cursorLost) request = { direction: "first" };

  const where = importJobListWhere(filters);
  const [fetched, matching, statusRows] = await Promise.all([
    prisma.importJob.findMany({
      where,
      orderBy: importJobListOrder(filters.sort),
      ...adminPageArgs(request),
      select: IMPORT_JOB_LIST_SELECT,
    }),
    prisma.importJob.count({ where }),
    prisma.importJob.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return {
    page: adminPageFromRows(fetched, request),
    matching,
    statusCounts: new Map(statusRows.map((row) => [row.status, row._count._all])),
    cursorLost,
  };
}
