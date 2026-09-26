/**
 * The `?start=` links that open the editor at one of Start a new design's choices (audit findings
 * FR1 and ST2). Kept apart from the templates so `/` can redirect without loading them.
 */
export type StartDesignParam = "choose" | "template" | "draw" | "upload" | "blank";

const START_DESIGN_PARAMS: readonly StartDesignParam[] = ["choose", "template", "draw", "upload", "blank"];

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
