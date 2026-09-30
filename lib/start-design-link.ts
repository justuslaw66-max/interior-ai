/**
 * Links into the editor from outside it: `?start=` opens Start a new design or one of its choices
 * (audit findings FR1 and ST2), and `?pricing=open` opens Pricing. Kept apart from the templates
 * so `/` can redirect without loading them.
 */
export type StartDesignParam = "choose" | "new" | "template" | "draw" | "upload" | "blank";

const START_DESIGN_PARAMS: readonly StartDesignParam[] = ["choose", "new", "template", "draw", "upload", "blank"];

export function parseStartDesignParam(value: string | null | undefined): StartDesignParam | null {
  return START_DESIGN_PARAMS.find((param) => param === value) ?? null;
}

/**
 * `/` opens the editor at Start a new design. Older links said `?source=template` or
 * `?source=blank`; they, and a `?start=` value, open that choice instead.
 */
export function rootStartDesignHref(query: { start?: unknown; source?: unknown }) {
  const requested = [query.start, query.source].find((value) => typeof value === "string");
  const start = parseStartDesignParam(typeof requested === "string" ? requested : null) ?? "choose";
  return `/design?start=${start}`;
}

/** Guests sign in first, then come back to the upload window. */
export const START_UPLOAD_CALLBACK_URL = "/design?start=upload";

/** My designs' New design: Start a new design as New design opens it, over whatever is open. */
export const NEW_DESIGN_HREF = "/design?start=new";

/** My designs' "See pricing" and the header's Pricing open the editor's Pricing. */
export const PRICING_HREF = "/design?pricing=open";
