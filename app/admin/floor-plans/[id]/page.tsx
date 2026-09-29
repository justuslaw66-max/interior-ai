import type { Metadata } from "next";
import { canAccessAdmin } from "@/lib/admin";
import { AdminPageHeader } from "../../AdminPageHeader";
import { adminSection, adminTitle } from "../../admin-navigation";
import { auth } from "../../admin-session";
import FloorPlanReviewWorkspace from "./FloorPlanReviewWorkspace";
import PingYiReviewSeedIntake from "./PingYiReviewSeedIntake";
import SupplementarySourceEvidencePanel from "./SupplementarySourceEvidencePanel";

type AdminFloorPlanDetailPageProps = { params: Promise<{ id: string }> };

const SECTION = adminSection("/admin/floor-plans");

export async function generateMetadata({ params }: AdminFloorPlanDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: adminTitle(`Floor-plan import ${id}`) };
}

export default async function AdminFloorPlanDetailPage({ params }: AdminFloorPlanDetailPageProps) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return null;
  const { id } = await params;

  return (
    <main className="space-y-5 p-6">
      <AdminPageHeader
        crumbs={[{ title: SECTION.title, href: SECTION.href }, { title: id }]}
        title="Review import"
        description="Check the source, correct what the reader missed, then approve a revision."
      />
      <details className="rounded-xl border bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-800">
          Additional source files (only if needed)
        </summary>
        <p className="mt-2 text-xs leading-5 text-neutral-600">
          Add a brochure or supporting document only when the uploaded floor plan
          does not show enough address or unit information.
        </p>
        <div className="mt-4 space-y-4">
          <SupplementarySourceEvidencePanel jobId={id} />
          <PingYiReviewSeedIntake jobId={id} />
        </div>
      </details>
      <FloorPlanReviewWorkspace jobId={id} />
    </main>
  );
}
