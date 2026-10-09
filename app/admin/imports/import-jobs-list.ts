import type { Prisma } from "@prisma/client";
import { isImportJobStatus } from "@/lib/import-jobs/status";
import type { ImportJobStatus } from "@/lib/import-jobs/types";
import { singleParam, type AdminPage, type AdminSearchParams } from "../admin-paging";

// Import jobs' list (UX audit AD6): a status filter, a search and a sort in the URL, keyset pages,
// and counts for every job rather than the newest 200.

export const IMPORT_JOB_SORTS = {
  newest: "Newest first",
  updated: "Recently changed",
  oldest: "Oldest first",
} as const;

export type ImportJobSort = keyof typeof IMPORT_JOB_SORTS;

export type ImportJobListFilters = {
  status: ImportJobStatus | null;
  query: string;
  sort: ImportJobSort;
};

export const IMPORT_JOB_LIST_SELECT = {
  id: true,
  status: true,
  sourceBrand: true,
  sourceFileName: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ImportJobSelect;

export type ImportJobListItem = Prisma.ImportJobGetPayload<{ select: typeof IMPORT_JOB_LIST_SELECT }>;

export type ImportJobList = {
  page: AdminPage<ImportJobListItem>;
  matching: number;
  statusCounts: ReadonlyMap<string, number>;
  cursorLost: boolean;
};

function isImportJobSort(value: string | undefined): value is ImportJobSort {
  return value !== undefined && Object.prototype.hasOwnProperty.call(IMPORT_JOB_SORTS, value);
}

export function parseImportJobListFilters(params: AdminSearchParams): ImportJobListFilters {
  const status = singleParam(params.status);
  const sort = singleParam(params.sort);
  return {
    status: isImportJobStatus(status) ? status : null,
    query: (singleParam(params.q) ?? "").trim().slice(0, 120),
    sort: isImportJobSort(sort) ? sort : "newest",
  };
}

/** The filters as URL parameters, defaults left out. */
export function importJobListParams(filters: ImportJobListFilters) {
  return {
    status: filters.status,
    q: filters.query,
    sort: filters.sort === "newest" ? null : filters.sort,
  };
}

export function importJobListWhere(filters: ImportJobListFilters): Prisma.ImportJobWhereInput {
  const clauses: Prisma.ImportJobWhereInput[] = [];
  if (filters.status) clauses.push({ status: filters.status });
  if (filters.query) {
    const contains = { contains: filters.query, mode: "insensitive" as const };
    clauses.push({
      OR: [{ id: contains }, { sourceFileName: contains }, { sourceBrand: contains }, { sourceSku: contains }],
    });
  }
  return clauses.length === 0 ? {} : { AND: clauses };
}

export function importJobListOrder(sort: ImportJobSort): Prisma.ImportJobOrderByWithRelationInput[] {
  if (sort === "updated") return [{ updatedAt: "desc" }, { id: "desc" }];
  if (sort === "oldest") return [{ createdAt: "asc" }, { id: "asc" }];
  return [{ createdAt: "desc" }, { id: "desc" }];
}
