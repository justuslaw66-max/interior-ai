// Next's development server compiles each route the first time it is requested. Without a
// warm-up the first test paid for that (/design took 26 s on CI), and the page load after it
// could still be slow: on #109's run 37894799114 the second test's scripts took 13 s to arrive
// instead of about 2 s, and its fixture room missed the 20 s wait. The runner therefore requests
// the design page, the scripts it names and the routes the page reads, once, before the tests.
// Every request is a GET that only reads. The runner's database check after the tests still
// covers the whole run.
export const WINDOW_OPENING_WARM_UP_PAGE = "/design?debug_layout=1";
export const WINDOW_OPENING_WARM_UP_ROUTES = Object.freeze([
  "/api/catalog/live",
  "/api/models/imported",
  "/api/auth/session",
]);
const WARM_UP_REQUEST_TIMEOUT_MS = 180_000;

/** The `/_next/` scripts a page's HTML names, each once, in page order. */
export function windowOpeningPageScriptPaths(html) {
  const paths = [];
  for (const match of html.matchAll(/<script\b[^>]*?\bsrc="(\/_next\/[^"]+)"/g)) {
    const scriptPath = match[1].replaceAll("&amp;", "&");
    if (!paths.includes(scriptPath)) paths.push(scriptPath);
  }
  return paths;
}

/**
 * Requests the design page, its scripts and the routes it reads, one at a time, and returns a
 * record of each request. Throws on the first answer that isn't OK, or when the page names no
 * scripts.
 */
export async function warmUpWindowOpeningServer(baseUrl, {
  request = fetch,
  now = () => Date.now(),
  timeoutMs = WARM_UP_REQUEST_TIMEOUT_MS,
} = {}) {
  const startedAt = new Date(now()).toISOString();
  const requests = [];
  const get = async (requestPath) => {
    const requestStartedAt = now();
    const response = await request(new URL(requestPath, baseUrl), {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = Buffer.from(await response.arrayBuffer());
    requests.push({
      path: requestPath,
      status: response.status,
      bytes: body.length,
      durationMs: now() - requestStartedAt,
    });
    if (!response.ok) {
      throw new Error(`Server warm-up: ${requestPath} answered ${response.status}.`);
    }
    return body.toString("utf8");
  };

  const scripts = windowOpeningPageScriptPaths(await get(WINDOW_OPENING_WARM_UP_PAGE));
  if (!scripts.length) throw new Error("Server warm-up: the design page names no scripts.");
  for (const scriptPath of scripts) await get(scriptPath);
  for (const route of WINDOW_OPENING_WARM_UP_ROUTES) await get(route);
  return { startedAt, endedAt: new Date(now()).toISOString(), requests };
}
