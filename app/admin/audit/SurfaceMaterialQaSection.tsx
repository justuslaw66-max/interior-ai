import Link from "next/link";
import {
  buildSurfaceMaterialAdminAuditSummaries,
  getRelativeSurfaceMaterialPath,
  type SurfaceMaterialAuditResult,
} from "@/lib/surface-material-audit";
import { collectNoOwnPictures, type NoOwnPicture } from "@/lib/surface-material-picture-source";
import { getAllSurfaceMaterialYamlEntries } from "@/lib/surface-material-yaml";
import { SurfaceMaterialAuditRow } from "./SurfaceMaterialAuditRow";
import {
  SURFACE_MATERIAL_AUDIT_FILTERS,
  SURFACE_MATERIAL_AUDIT_SORTS,
  matchesSurfaceMaterialFilter,
  sortSurfaceMaterialSummaries,
  surfaceAuditHref,
  type SurfaceMaterialAuditFilter,
  type SurfaceMaterialAuditSort,
} from "./surface-material-audit-view";

const CHIP_ACTIVE = "rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white";
const CHIP_IDLE = "rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700";

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-neutral-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function SurfaceMaterialAuditControls({
  filter,
  sort,
}: {
  filter: SurfaceMaterialAuditFilter;
  sort: SurfaceMaterialAuditSort;
}) {
  return (
    <div className="mt-4 grid gap-3 rounded-lg border bg-neutral-50 p-3 text-sm md:grid-cols-2">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Filter</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SURFACE_MATERIAL_AUDIT_FILTERS.map((option) => (
            <Link key={option.id} href={surfaceAuditHref(option.id, sort)} className={filter === option.id ? CHIP_ACTIVE : CHIP_IDLE}>
              {option.label}
            </Link>
          ))}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Sort</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SURFACE_MATERIAL_AUDIT_SORTS.map((option) => (
            <Link key={option.id} href={surfaceAuditHref(filter, option.id)} className={sort === option.id ? CHIP_ACTIVE : CHIP_IDLE}>
              {option.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// The record J asked for on 12 Oct 2026: which surfaces have no picture of their own, and how many of each kind.
function NoOwnPictureSummary({ found, sort }: { found: Map<string, NoOwnPicture>; sort: SurfaceMaterialAuditSort }) {
  const standIns = [...found.values()].filter((noOwnPicture) => noOwnPicture.source === "stand_in").length;
  return (
    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <Link href={surfaceAuditHref("no_picture_of_its_own", sort)} className="font-semibold underline">
        {found.size} entries have no picture of their own
      </Link>{" "}
      on the manufacturer&apos;s download area: {standIns} draw another item&apos;s faces, cut to the tile at true scale, and{" "}
      {found.size - standIns} show the configurator&apos;s preview. The sizes left out of the catalogue for want of a picture
      are listed with them in docs/architecture/surface-material-tile-faces.md.
    </p>
  );
}

function ParseErrors({ files }: { files: string[] }) {
  if (files.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium">Surface material parse errors</h3>
      <ul className="mt-2 space-y-1 text-sm text-red-700">
        {files.map((filePath) => (
          <li key={filePath}>{getRelativeSurfaceMaterialPath(filePath)}</li>
        ))}
      </ul>
    </div>
  );
}

export function SurfaceMaterialQaSection({
  audit,
  filter,
  sort,
}: {
  audit: SurfaceMaterialAuditResult;
  filter: SurfaceMaterialAuditFilter;
  sort: SurfaceMaterialAuditSort;
}) {
  const all = buildSurfaceMaterialAdminAuditSummaries();
  const noOwnPictures = collectNoOwnPictures(getAllSurfaceMaterialYamlEntries());
  const noOwnPictureOf = (filePath: string) => noOwnPictures.get(filePath) ?? null;
  const shown = sortSurfaceMaterialSummaries(
    all.filter((material) => matchesSurfaceMaterialFilter(material, filter, noOwnPictureOf(material.filePath))),
    sort
  );
  const draftCount = all.filter((material) => material.publishStatus === "draft").length;
  return (
    <section id="surface-material-qa" className="rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Surface material QA</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Separate flooring/material catalog checks. Draft blockers are shown for admin import QA and are not furniture cart lines.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
        <Tile label="Files scanned" value={audit.files.length} />
        <Tile label="Draft flooring" value={draftCount} />
        <Tile label="Failures" value={audit.failureCount} />
        <Tile label="Warnings" value={audit.warningCount} />
        <Tile label="No picture of its own" value={noOwnPictures.size} />
      </div>
      <NoOwnPictureSummary found={noOwnPictures} sort={sort} />

      <SurfaceMaterialAuditControls filter={filter} sort={sort} />

      {shown.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-medium">
            Surface material status ({shown.length} of {all.length})
          </h3>
          <div className="mt-2 space-y-4 text-sm text-neutral-700">
            {shown.map((material) => (
              <SurfaceMaterialAuditRow
                key={`${material.materialId}:${material.filePath}`}
                material={material}
                noOwnPicture={noOwnPictureOf(material.filePath)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
          No surface materials match the current filter.
        </div>
      )}

      <ParseErrors files={audit.parseErrorFiles} />
    </section>
  );
}
