import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import FloorPlanReviewWorkspace from "./FloorPlanReviewWorkspace";
import PingYiReviewSeedIntake from "./PingYiReviewSeedIntake";
import SupplementarySourceEvidencePanel from "./SupplementarySourceEvidencePanel";

export default async function AdminFloorPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) redirect("/");
  const { id } = await params;

  return (
    <main className="space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Assisted floor-plan ingestion
          </div>
          <h1 className="mt-1 text-2xl font-semibold">Review import</h1>
          <div className="mt-1 font-mono text-xs text-neutral-500">{id}</div>
        </div>
        <Link className="rounded-lg border px-3 py-2 text-sm font-medium" href="/admin/floor-plans">
          Back to queue
        </Link>
      </header>
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
