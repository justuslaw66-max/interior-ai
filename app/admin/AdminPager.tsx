import Link from "next/link";

const LINK = "rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50";
const OFF = "rounded-lg border px-3 py-2 text-sm text-neutral-400";

export type AdminPagerProps = {
  previousHref: string | null;
  nextHref: string | null;
  cursorLost?: boolean;
};

/**
 * Previous and Next for an Admin list (UX audit AD6). A page whose link no longer leads anywhere
 * (its row was deleted) says so, instead of quietly showing the first page.
 */
export function AdminPager({ previousHref, nextHref, cursorLost = false }: AdminPagerProps) {
  return (
    <div className="space-y-2">
      {cursorLost ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          That page is no longer available, so this is the first page.
        </p>
      ) : null}
      {previousHref || nextHref ? (
        <nav aria-label="Pages" className="flex justify-end gap-2">
          {previousHref ? <Link className={LINK} href={previousHref}>Previous</Link> : <span className={OFF}>Previous</span>}
          {nextHref ? <Link className={LINK} href={nextHref}>Next</Link> : <span className={OFF}>Next</span>}
        </nav>
      ) : null}
    </div>
  );
}
