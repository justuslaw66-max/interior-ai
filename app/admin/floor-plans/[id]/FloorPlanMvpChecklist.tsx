import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { AdminJob, BindingDraft } from "./floorPlanReviewTypes";

function addressBindingReady(binding: BindingDraft) {
  return Boolean(
    binding.countryCode.trim().length === 2 &&
    binding.addressNormalized.trim() &&
    (binding.postalCode.trim() ||
      (binding.block.trim() && binding.street.trim())) &&
    binding.sourceEvidenceText.trim()
  );
}

function StatusBadge({ ready, optional = false }: { ready: boolean; optional?: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        ready
          ? "bg-emerald-100 text-emerald-800"
          : optional
            ? "bg-neutral-100 text-neutral-600"
          : "bg-amber-100 text-amber-800"
      }`}
    >
      {ready ? "Ready" : optional ? "Add later" : "Needs attention"}
    </span>
  );
}

export function FloorPlanMvpChecklist({
  bindings,
  document,
  job,
  unresolvedCriticalCount,
}: {
  bindings: BindingDraft[];
  document: FloorPlanDocumentV2 | null;
  job: AdminJob;
  unresolvedCriticalCount: number;
}) {
  const wallCount =
    document?.floors.reduce((total, floor) => total + floor.walls.length, 0) ?? 0;
  const roomCount =
    document?.floors.reduce((total, floor) => total + floor.rooms.length, 0) ?? 0;
  const everyFloorRegistered = Boolean(
    document?.floors.length &&
      document.floors.every((floor) => floor.calibrations.length > 0)
  );
  const planReady = Boolean(
    document &&
      wallCount > 0 &&
      roomCount > 0 &&
      everyFloorRegistered &&
      unresolvedCriticalCount === 0 &&
      ["ready", "applied", "published"].includes(job.status)
  );
  const addressReady = bindings.some(addressBindingReady);
  const planMessage = !document
    ? "No editable 2D plan is available yet."
    : !everyFloorRegistered
      ? "The drawing scale still needs to be set for every floor."
      : !roomCount || !wallCount
        ? `The plan currently has ${roomCount} room${roomCount === 1 ? "" : "s"} and ${wallCount} wall${wallCount === 1 ? "" : "s"}. Add the missing closed room outlines.`
        : unresolvedCriticalCount > 0
          ? `${unresolvedCriticalCount} required source check${unresolvedCriticalCount === 1 ? " remains" : "s remain"}. Confirm the three checklist cards after the plan matches the source.`
          : job.status === "validating"
            ? "The saved plan is being checked now."
            : job.status === "needs_review"
              ? "All required checks are marked complete. Click Save and check plan to update the status."
              : `${roomCount} rooms and ${wallCount} walls passed the scale and geometry checks.`;
  const planAction =
    unresolvedCriticalCount > 0
      ? { href: "#floor-plan-2d-checklist", label: "Open the 2D checklist" }
      : job.status === "needs_review" && roomCount > 0 && wallCount > 0 && everyFloorRegistered
        ? { href: "#floor-plan-save-check", label: "Go to Save and check" }
        : null;

  return (
    <section
      className="rounded-xl border border-blue-200 bg-blue-50 p-4"
      data-testid="floor-plan-mvp-checklist"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Minimum needed
          </p>
          <h2 className="mt-1 text-lg font-semibold text-blue-950">
            Get the 2D floor plan ready
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-blue-900">
            First make the walls, rooms and scale match the uploaded drawing.
            Address and publishing information can be added later when you want
            this plan to appear in the shared searchable directory.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm">
          {planReady ? "2D plan ready" : "Finish the 2D plan"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-blue-100 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-blue-700">STEP 1</p>
              <h3 className="mt-1 text-sm font-semibold text-neutral-950">
                Confirm the 2D plan
              </h3>
            </div>
            <StatusBadge ready={planReady} />
          </div>
          <p className="mt-2 text-xs leading-5 text-neutral-600">
            {planMessage}
          </p>
          {planAction ? (
            <a
              className="mt-2 inline-flex text-xs font-semibold text-blue-700 underline underline-offset-2"
              href={planAction.href}
            >
              {planAction.label}
            </a>
          ) : null}
        </div>

        <div className="rounded-lg border border-blue-100 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-blue-700">
                OPTIONAL · PUBLISH LATER
              </p>
              <h3 className="mt-1 text-sm font-semibold text-neutral-950">
                Add the searchable address
              </h3>
            </div>
            <StatusBadge optional ready={addressReady} />
          </div>
          <p className="mt-2 text-xs leading-5 text-neutral-600">
            {addressReady
              ? "The address and its uploaded source page are confirmed."
              : "Skip this for now. Add the address when you are ready to publish the plan for search."}
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs text-blue-800">
        Room names and assumed 3D heights are optional for this MVP. Technical
        publication details remain available in a collapsed section.
      </p>
    </section>
  );
}
