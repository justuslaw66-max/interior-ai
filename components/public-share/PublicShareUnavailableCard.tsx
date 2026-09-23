import Link from "next/link";

/** Shown when a share link is off or unknown: say so plainly and offer a way in. */
export function PublicShareUnavailableCard() {
  return (
    <div className="max-w-sm rounded-xl border bg-white p-6">
      <div className="text-lg font-semibold">This link isn&apos;t available</div>
      <div className="mt-1 text-sm text-neutral-600">
        The owner may have turned sharing off, or the link is incomplete.
      </div>
      <Link
        href="/design"
        className="mt-4 inline-block rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white"
        data-testid="public-share-unavailable-start"
      >
        Start your own design
      </Link>
    </div>
  );
}
