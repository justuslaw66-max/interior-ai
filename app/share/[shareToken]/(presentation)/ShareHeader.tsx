import SharePageActions from "@/components/SharePageActions";

/**
 * The shared design's header (UX audit SX7, phase 4e): the title, what the viewer can do, a one-line
 * summary with a link to the Shopping list, and three actions. The Beta badge, the "Reference" hash,
 * the handoff summary card and its stats are gone.
 */
export function ShareHeader({
  shareToken,
  title,
  style,
  budget,
  summary,
}: {
  shareToken: string;
  title: string;
  style: string | null;
  budget: string | null;
  summary: string;
}) {
  return (
    <header className="mx-auto max-w-6xl px-6 pt-6">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold text-neutral-950">{title}</h1>
          <div className="mt-1 text-sm text-neutral-600">
            View only{style ? ` • ${style}` : ""}{budget ? ` • ${budget}` : ""}
          </div>
          <div
            className="mt-2 flex flex-wrap items-center gap-x-3 text-sm text-neutral-800"
            data-testid="share-client-handoff-summary"
          >
            <span>{summary}</span>
            <a
              href="#shopping-preview"
              data-testid="share-shopping-list"
              data-share-touch-target="true"
              className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-2 outline-offset-2 hover:underline focus-visible:outline-2"
            >
              Shopping list
            </a>
          </div>
          <div className="text-xs text-neutral-500">Drag to look around • Make a copy to edit</div>
        </div>

        <SharePageActions shareToken={shareToken} />
      </div>
    </header>
  );
}
