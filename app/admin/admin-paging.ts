// Keyset paging for Admin's lists (UX audit AD6, phase 4i-2). A page is the rows after or before
// one row, in the list's own order (Prisma reads that row's values for the order's fields), so a
// page stays put while new rows arrive. One row more than the page is read, to know whether
// another page follows.

export const ADMIN_PAGE_SIZE = 50;

export type AdminSearchParams = Record<string, string | string[] | undefined>;

export type AdminPageRequest =
  | { direction: "first" }
  | { direction: "after" | "before"; cursor: string };

export type AdminPage<Row> = {
  rows: Row[];
  previousCursor: string | null;
  nextCursor: string | null;
};

// Row ids: cuids, and the slugs 3D models are named by.
const CURSOR = /^[A-Za-z0-9_.-]{1,200}$/;

export function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `after=<id>` or `before=<id>` from the URL; anything else is the first page. */
export function parseAdminPageRequest(params: AdminSearchParams): AdminPageRequest {
  const after = singleParam(params.after)?.trim();
  if (after && CURSOR.test(after)) return { direction: "after", cursor: after };
  const before = singleParam(params.before)?.trim();
  if (before && CURSOR.test(before)) return { direction: "before", cursor: before };
  return { direction: "first" };
}

/**
 * The findMany arguments for a page. One shape, not a union: spread into Prisma's findMany, a
 * union of two argument shapes makes TypeScript infer the call from one and reject the other.
 */
export type AdminPageArgs = { cursor?: { id: string }; skip?: number; take: number };

export function adminPageArgs(request: AdminPageRequest, pageSize = ADMIN_PAGE_SIZE): AdminPageArgs {
  if (request.direction === "first") return { take: pageSize + 1 };
  return {
    cursor: { id: request.cursor },
    skip: 1,
    take: request.direction === "after" ? pageSize + 1 : -(pageSize + 1),
  };
}

/** The page's rows and the cursors for the pages either side of it, from what findMany read. */
export function adminPageFromRows<Row extends { id: string }>(
  fetched: Row[],
  request: AdminPageRequest,
  pageSize = ADMIN_PAGE_SIZE
): AdminPage<Row> {
  const overflow = fetched.length > pageSize;
  if (request.direction === "before") {
    const rows = overflow ? fetched.slice(fetched.length - pageSize) : fetched;
    return {
      rows,
      previousCursor: overflow ? (rows[0]?.id ?? null) : null,
      nextCursor: rows.at(-1)?.id ?? null,
    };
  }
  const rows = overflow ? fetched.slice(0, pageSize) : fetched;
  return {
    rows,
    previousCursor: request.direction === "after" ? (rows[0]?.id ?? null) : null,
    nextCursor: overflow ? (rows.at(-1)?.id ?? null) : null,
  };
}

/** A list's URL with its filters; empty values are left out, so the defaults keep a short URL. */
export function adminListHref(path: string, params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** The links to the pages either side, keeping the list's filters. */
export function adminPageHrefs(
  path: string,
  filters: Record<string, string | null | undefined>,
  page: Pick<AdminPage<unknown>, "previousCursor" | "nextCursor">
) {
  return {
    previousHref: page.previousCursor
      ? adminListHref(path, { ...filters, before: page.previousCursor })
      : null,
    nextHref: page.nextCursor ? adminListHref(path, { ...filters, after: page.nextCursor }) : null,
  };
}
