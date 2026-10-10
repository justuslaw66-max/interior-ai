import type { Prisma } from "@prisma/client";
import { singleParam, type AdminPage, type AdminSearchParams } from "../admin-paging";

// 3D models' list (UX audit AD6): it loaded every model at once. Now a page at a time, with a
// search and an approval filter in the URL. A model's card reads its status from `notes` too.

export const MODEL_PAGE_SIZE = 48;

export const MODEL_APPROVAL_FILTERS = {
  approved: "Approved",
  not_approved: "Not approved",
} as const;

export type ModelApprovalFilter = keyof typeof MODEL_APPROVAL_FILTERS;

export type ModelListFilters = { query: string; approval: ModelApprovalFilter | null };

export const MODEL_LIST_SELECT = {
  id: true,
  modelUrl: true,
  dimsWmm: true,
  dimsDmm: true,
  dimsHmm: true,
  approved: true,
  notes: true,
  updatedAt: true,
} satisfies Prisma.ModelAssetSelect;

export type ModelListItem = Prisma.ModelAssetGetPayload<{ select: typeof MODEL_LIST_SELECT }>;

export type ModelList = { page: AdminPage<ModelListItem>; matching: number; cursorLost: boolean };

function isApprovalFilter(value: string | undefined): value is ModelApprovalFilter {
  return value !== undefined && Object.prototype.hasOwnProperty.call(MODEL_APPROVAL_FILTERS, value);
}

export function parseModelListFilters(params: AdminSearchParams): ModelListFilters {
  const approval = singleParam(params.approval);
  return {
    query: (singleParam(params.q) ?? "").trim().slice(0, 120),
    approval: isApprovalFilter(approval) ? approval : null,
  };
}

export function modelListParams(filters: ModelListFilters) {
  return { q: filters.query, approval: filters.approval };
}

export function modelListWhere(filters: ModelListFilters): Prisma.ModelAssetWhereInput {
  const clauses: Prisma.ModelAssetWhereInput[] = [];
  if (filters.approval) clauses.push({ approved: filters.approval === "approved" });
  if (filters.query) {
    const contains = { contains: filters.query, mode: "insensitive" as const };
    clauses.push({ OR: [{ id: contains }, { modelUrl: contains }] });
  }
  return clauses.length === 0 ? {} : { AND: clauses };
}
