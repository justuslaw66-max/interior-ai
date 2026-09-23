import { getAllFloorPlanLibraryCatalogs } from "@/lib/floor-plan-library-yaml";
import { loadPingYiCourtV2ReviewSeedBundle } from "@/lib/floor-plan-seeds/ping-yi-court-review-intake";
import { isFloorPlanMvpBlockingIssue } from "@/lib/floor-plan-imports/types";
import PingYiReviewJobButton from "./PingYiReviewJobButton";

export default function AdminFloorPlanFixturePanel() {
  const reviewFixtures = getAllFloorPlanLibraryCatalogs();
  const pingYiBundle = loadPingYiCourtV2ReviewSeedBundle();
  const pingYiFixtureByLayout = new Map(
    pingYiBundle.fixtures.map((fixture) => [fixture.layoutId, fixture])
  );
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-amber-950">
            Review-only YAML fixtures
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-amber-900">
            These compatibility plans remain available for source comparison and regression
            review. They are never returned by consumer address search and cannot be applied
            until an independently approved canonical revision is published.
          </p>
        </div>
        <span className="rounded-full border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900">
          {reviewFixtures.length} fixture{reviewFixtures.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {reviewFixtures.map((catalog) => (
          <article
            className="rounded-lg border border-amber-200 bg-white p-3"
            key={catalog.floor_plan.plan_id}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-neutral-900">
                  {catalog.floor_plan.project_name}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {catalog.layouts.length} layouts · licence{" "}
                  {catalog.source.license_status.replaceAll("_", " ")}
                </div>
              </div>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                {catalog.publication.visibility.replaceAll("_", " ")}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {catalog.layouts.map((layout) => {
                const fixture = pingYiFixtureByLayout.get(layout.layout_id);
                const counts = fixture
                  ? fixture.document.floors.reduce(
                      (total, floor) => ({
                        rooms: total.rooms + floor.rooms.length,
                        walls: total.walls + floor.walls.length,
                        openings: total.openings + floor.openings.length,
                        structures: total.structures + floor.structures.length,
                      }),
                      { rooms: 0, walls: 0, openings: 0, structures: 0 }
                    )
                  : null;
                const criticalIssues = fixture?.reviewIssues.filter(
                  isFloorPlanMvpBlockingIssue
                ).length;
                const stackBindings = pingYiBundle.stackBindings.filter(
                  (binding) => binding.layout_id === layout.layout_id
                );
                return (
                  <div
                    className="min-w-[230px] flex-1 rounded-lg border border-amber-100 bg-amber-50/40 p-2"
                    data-testid={`review-fixture-${layout.layout_id}`}
                    key={layout.layout_id}
                  >
                    <a
                      className="text-xs font-semibold text-blue-700 hover:underline"
                      href={layout.preview_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {layout.label} · source p. {layout.source_page}
                    </a>
                    {counts ? (
                      <div className="mt-1 text-[11px] leading-5 text-neutral-600">
                        {counts.rooms} rooms · {counts.walls} walls · {counts.openings} openings ·{" "}
                        {counts.structures} structures
                        <br />
                        {criticalIssues} required review issue
                        {criticalIssues === 1 ? "" : "s"}
                      </div>
                    ) : null}
                    {stackBindings.map((binding) => (
                      <div
                        className="mt-1 rounded border border-amber-200 bg-white px-2 py-1 text-[10px] leading-4 text-amber-950"
                        data-testid={`review-stack-binding-${layout.layout_id}-${binding.block}`}
                        key={`${binding.layout_id}-${binding.block}`}
                      >
                        Block {binding.block} · stacks {binding.stacks.join(", ")} · floors{" "}
                        {binding.floor_ranges
                          .map((range) => `${range.from}–${range.to}`)
                          .join(", ")} · transform {binding.transform.replaceAll("_", " ")}
                      </div>
                    ))}
                    {catalog.floor_plan.plan_id === pingYiBundle.planId && fixture ? (
                      <PingYiReviewJobButton label={layout.label} layoutId={layout.layout_id} />
                    ) : null}
                  </div>
                );
              })}
              <a
                className="rounded-md border px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                href={catalog.source.source_url}
                rel="noreferrer"
                target="_blank"
              >
                Open source PDF
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
