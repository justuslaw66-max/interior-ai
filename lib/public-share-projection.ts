import { projectSharedDesignTransport } from "@/lib/shared-design-snapshot";

/** What a public share page says when the projection refuses a design. */
export const PUBLIC_SHARE_PROJECTION_ERROR = "This shared design can't be shown.";

/**
 * The public share pages' projection (the shared page, its export and the PDF), with a refusal's
 * details kept off the page (30 Oct 2026). A design the public projection refuses still shows the
 * error page. But the refusal's message names the owner's field ("…contains undeclared field
 * snapshot.ownerInternalState"), and the dev server sends a thrown error's message and cause to
 * the browser. So these pages throw a generic error instead, with no cause. A production server
 * hides messages anyway, which is why only Mac runs (next dev) saw share-responsive's
 * "history, reload, invalid, and revoked states" fail.
 */
export function projectSharedDesignForPublicPage(
  data: Parameters<typeof projectSharedDesignTransport>[0]
): ReturnType<typeof projectSharedDesignTransport> {
  try {
    return projectSharedDesignTransport(data);
  } catch {
    throw new Error(PUBLIC_SHARE_PROJECTION_ERROR);
  }
}
