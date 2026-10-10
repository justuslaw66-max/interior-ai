import { prisma } from "@/lib/prisma";
import {
  adminPageArgs,
  adminPageFromRows,
  parseAdminPageRequest,
  type AdminSearchParams,
} from "../admin-paging";
import {
  MODEL_LIST_SELECT,
  MODEL_PAGE_SIZE,
  modelListWhere,
  type ModelList,
  type ModelListFilters,
} from "./models-list";

/** One page of 3D models, newest change first, and how many match. */
export async function loadModelList(filters: ModelListFilters, params: AdminSearchParams): Promise<ModelList> {
  let request = parseAdminPageRequest(params);
  const cursorLost =
    request.direction !== "first" &&
    !(await prisma.modelAsset.findUnique({ where: { id: request.cursor }, select: { id: true } }));
  if (cursorLost) request = { direction: "first" };

  const where = modelListWhere(filters);
  const [fetched, matching] = await Promise.all([
    prisma.modelAsset.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...adminPageArgs(request, MODEL_PAGE_SIZE),
      select: MODEL_LIST_SELECT,
    }),
    prisma.modelAsset.count({ where }),
  ]);
  return { page: adminPageFromRows(fetched, request, MODEL_PAGE_SIZE), matching, cursorLost };
}
