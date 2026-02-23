import { prisma } from "@/lib/prisma";
import ShareViewer from "@/components/ShareViewer";
import ShareTracking from "./ShareTracking";
import { ShareFooterCTA } from "@/components/ShareFooterCTA";
import { legacyApiToSnapshot } from "@/lib/room-persistence";
import type { DesignSnapshot } from "@/lib/room-types";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;

  const design = await prisma.design.findFirst({
    where: { shareToken, shareEnabled: true },
    select: {
      id: true,
      title: true,
      roomWidth: true,
      roomDepth: true,
      items: true,
      zones: true,
      savedViews: true,
      style: true,
      budget: true,
    },
  });

  if (!design) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="rounded-xl border bg-white p-6">
          <div className="text-lg font-semibold">Link not available</div>
          <div className="text-sm text-neutral-600">
            This share link is disabled or invalid.
          </div>
        </div>
      </main>
    );
  }

  // Convert legacy format to v3
  const designSnapshot: DesignSnapshot = legacyApiToSnapshot({
    id: design.id,
    title: design.title,
    roomWidth: design.roomWidth,
    roomDepth: design.roomDepth,
    items: design.items as any[],
    zones: (design.zones as any[]) || [],
    savedViews: (design.savedViews as any[]) || [],
  });

  return (
    <main className="min-h-screen bg-neutral-100">
      <ShareTracking shareToken={shareToken} designId={design.id} />
      <header className="mx-auto max-w-6xl px-6 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{design.title}</h1>
            <div className="text-sm text-neutral-600">
              Read-only • {design.style ?? "Style"} • {design.budget ?? "Budget"}
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              Best on desktop • Orbit to look around • No editing in share view
            </div>
          </div>

          <div className="rounded-lg bg-white px-3 py-2 text-xs shadow">
            Interior AI (Beta)
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <ShareViewer initialSnapshot={designSnapshot} />
      </div>

      <ShareFooterCTA />
    </main>
  );
}
