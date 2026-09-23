import Link from "next/link";

export type InboxQueueFilter = "all" | "scrape" | "normalize" | "review" | "publish";

const QUEUE_OPTIONS: InboxQueueFilter[] = ["all", "scrape", "normalize", "review", "publish"];

function inboxHref(queue: InboxQueueFilter, blockersOnly: boolean) {
  const params = new URLSearchParams();
  if (queue !== "all") params.set("queue", queue);
  if (blockersOnly) params.set("blocked", "1");
  const query = params.toString();
  return query ? `/admin/catalog/inbox?${query}` : "/admin/catalog/inbox";
}

function chipClass(active: boolean, activeClass: string) {
  return `rounded-full border px-3 py-1 ${
    active ? activeClass : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
  }`;
}

/**
 * Queue filters are plain links. The URL is the filter and the server page
 * applies it, so the highlighted chip and the listed jobs always agree.
 */
export function InboxFiltersUI({
  queue,
  blockersOnly,
}: {
  queue: InboxQueueFilter;
  blockersOnly: boolean;
}) {
  return (
    <section className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {QUEUE_OPTIONS.map((option) => (
          <Link
            key={option}
            href={inboxHref(option, blockersOnly)}
            aria-current={queue === option ? "page" : undefined}
            className={chipClass(queue === option, "border-neutral-900 bg-neutral-900 text-white")}
          >
            {option === "all" ? "All queues" : `${option[0].toUpperCase()}${option.slice(1)} queue`}
          </Link>
        ))}
        <Link
          href={inboxHref(queue, !blockersOnly)}
          className={chipClass(blockersOnly, "border-red-700 bg-red-700 text-white")}
        >
          {blockersOnly ? "Showing blockers only" : "Blockers only"}
        </Link>
      </div>
    </section>
  );
}
