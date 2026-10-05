import { prisma } from "@/lib/prisma";
import ShareViewer from "@/components/ShareViewer";
import ShareTracking from "../ShareTracking";
import { ShareFooterCTA } from "@/components/ShareFooterCTA";
import { storedToSnapshot } from "@/lib/room-persistence";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { buildShareExportFidelitySummary } from "@/lib/share-export-fidelity";
import { buildPublicProjectionContentIdentity } from "@/lib/public-design-projection-identity";
import { buildSharePageModel } from "@/lib/public-share-page-model";
import type { DesignSnapshot } from "@/lib/room-types";
import { projectSharedDesignTransport } from "@/lib/shared-design-snapshot";
import ShareFloorPlanPreview from "@/components/ShareFloorPlanPreview";
import { PublicShareClientBoundary } from "@/components/public-share/PublicShareClientBoundary";
import { PublicShareInvalidView } from "@/components/public-share/PublicShareRootLifecycle";
import { ShareHeader } from "./ShareHeader";
import { ShareRoomsSection } from "./ShareRoomsSection";
import { ShareShoppingSection } from "./ShareShoppingSection";

export const metadata = {
  robots: { index: false, follow: false },
};

type FidelitySummary = ReturnType<typeof buildShareExportFidelitySummary>;

/** The hidden marker the release smoke tests read to prove the page shows the saved design. */
function ShareFingerprintMarker({ summary }: { summary: FidelitySummary }) {
  return (
    <div
      data-testid="qa-share-snapshot-fingerprint"
      data-fingerprint={summary.fingerprint}
      data-room-count={String(summary.roomCount)}
      data-item-count={String(summary.itemCount)}
      data-opening-count={String(summary.openingCount)}
      data-saved-view-count={String(summary.savedViewCount)}
      data-checkout-ready-count={String(summary.checkoutReadyCount)}
      data-retailer-ready-count={String(summary.retailerReadyCount)}
      data-missing-commerce-count={String(summary.missingCommerceCount)}
      hidden
    />
  );
}

function ShareNotes({ notes }: { notes: string }) {
  return (
    <section className="border-t bg-white" data-testid="share-design-notes">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <h2 className="text-lg font-semibold text-neutral-950">Design notes</h2>
        <p className="mt-2 whitespace-pre-wrap rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-700">
          {notes}
        </p>
      </div>
    </section>
  );
}

/**
 * A shared design (UX audit SX7, phase 4e): the title and three actions, the 3D view as the hero,
 * the plan, the rooms, the Shopping list grouped by shop, the notes, and "Start your own design".
 */
export default async function SharePage({ params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  const design = await prisma.design.findFirst({
    where: { shareToken, shareEnabled: true },
    select: {
      id: true,
      title: true,
      roomWidth: true,
      roomDepth: true,
      items: true,
      snapshot: true,
      zones: true,
      savedViews: true,
      style: true,
      budget: true,
      notes: true,
    },
  });
  if (!design) return <PublicShareInvalidView />;

  const publicDesign = projectSharedDesignTransport(design);
  const designSnapshot: DesignSnapshot = storedToSnapshot(publicDesign.snapshot);
  const fidelitySummary = buildShareExportFidelitySummary(designSnapshot, CATALOG_ITEMS);
  const page = buildSharePageModel(designSnapshot, publicDesign.style);
  return (
    <PublicShareClientBoundary
      key={`${design.id}:${shareToken}`}
      snapshot={designSnapshot}
      projectionContentIdentity={buildPublicProjectionContentIdentity(designSnapshot)}
      projectionDiagnosticFingerprint={fidelitySummary.fingerprint}
    >
      <ShareFingerprintMarker summary={fidelitySummary} />
      <ShareTracking shareToken={shareToken} designId={design.id} />
      <ShareHeader
        shareToken={shareToken}
        title={publicDesign.title}
        style={publicDesign.style ?? null}
        budget={publicDesign.budget ?? null}
        summary={page.summary}
      />
      <div className="mx-auto max-w-6xl px-6 py-6">
        <ShareViewer />
      </div>
      <ShareFloorPlanPreview snapshot={designSnapshot} />
      <ShareRoomsSection shareToken={shareToken} rooms={page.rooms} />
      <ShareShoppingSection list={page.shopping} checkoutLines={page.checkoutLines} />
      {publicDesign.notes ? <ShareNotes notes={publicDesign.notes} /> : null}
      <ShareFooterCTA shareToken={shareToken} />
    </PublicShareClientBoundary>
  );
}
