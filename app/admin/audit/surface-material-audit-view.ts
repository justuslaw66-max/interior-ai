import type { SurfaceMaterialAdminAuditSummary } from "@/lib/surface-material-audit";
import type { NoOwnPicture } from "@/lib/surface-material-picture-source";

// The Surface Material QA section's filters and sorts, read from the page's search params and written
// back into its links.
export type SurfaceMaterialAuditFilter =
  | "all"
  | "draft"
  | "published"
  | "needs_permission"
  | "missing_assets"
  | "missing_specs"
  | "unresolved_blockers"
  | "sample_available"
  | "missing_links"
  | "no_picture_of_its_own";

export type SurfaceMaterialAuditSort =
  | "blocker_count"
  | "supplier"
  | "material_family"
  | "publish_status"
  | "license_status";

export const SURFACE_MATERIAL_AUDIT_FILTERS: Array<{
  id: SurfaceMaterialAuditFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "published", label: "Published" },
  { id: "needs_permission", label: "Needs permission" },
  { id: "missing_assets", label: "Missing assets" },
  { id: "missing_specs", label: "Missing specs" },
  { id: "unresolved_blockers", label: "Unresolved blockers" },
  { id: "sample_available", label: "Sample available" },
  { id: "missing_links", label: "Missing sample/source link" },
  { id: "no_picture_of_its_own", label: "No picture of its own" },
];

export const SURFACE_MATERIAL_AUDIT_SORTS: Array<{
  id: SurfaceMaterialAuditSort;
  label: string;
}> = [
  { id: "blocker_count", label: "Blocker count" },
  { id: "supplier", label: "Supplier" },
  { id: "material_family", label: "Material family" },
  { id: "publish_status", label: "Publish status" },
  { id: "license_status", label: "License status" },
];

export function formatAuditValue(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ") : "Not set";
}

export function normalizeSurfaceMaterialFilter(value: string | undefined): SurfaceMaterialAuditFilter {
  return SURFACE_MATERIAL_AUDIT_FILTERS.find((filter) => filter.id === value)?.id ?? "all";
}

export function normalizeSurfaceMaterialSort(value: string | undefined): SurfaceMaterialAuditSort {
  return SURFACE_MATERIAL_AUDIT_SORTS.find((sort) => sort.id === value)?.id ?? "blocker_count";
}

/** noOwnPicture: the material's entry when its manufacturer has no picture of it (surface-material-picture-source.ts). */
export function matchesSurfaceMaterialFilter(
  material: SurfaceMaterialAdminAuditSummary,
  filter: SurfaceMaterialAuditFilter,
  noOwnPicture: NoOwnPicture | null = null
): boolean {
  if (filter === "all") return true;
  if (filter === "draft") return material.publishStatus === "draft";
  if (filter === "published") return material.publishStatus === "published";
  if (filter === "needs_permission") return material.licenseStatus === "needs_permission";
  if (filter === "missing_assets") return material.missingAssets.length > 0;
  if (filter === "missing_specs") return material.missingSpecs.length > 0;
  if (filter === "unresolved_blockers") return material.blockers.length > 0;
  if (filter === "sample_available") return material.sampleAvailable === true;
  if (filter === "missing_links") return !material.sourceUrl || !material.sampleRequestUrl;
  if (filter === "no_picture_of_its_own") return noOwnPicture !== null;
  return true;
}

export function sortSurfaceMaterialSummaries(
  summaries: SurfaceMaterialAdminAuditSummary[],
  sort: SurfaceMaterialAuditSort
) {
  return [...summaries].sort((a, b) => {
    if (sort === "blocker_count") return b.blockers.length - a.blockers.length;
    if (sort === "supplier") return a.supplier.localeCompare(b.supplier);
    if (sort === "material_family") return a.materialFamily.localeCompare(b.materialFamily);
    if (sort === "publish_status") return a.publishStatus.localeCompare(b.publishStatus);
    if (sort === "license_status") return a.licenseStatus.localeCompare(b.licenseStatus);
    return 0;
  });
}

export function surfaceAuditHref(filter: SurfaceMaterialAuditFilter, sort: SurfaceMaterialAuditSort) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("surfaceFilter", filter);
  if (sort !== "blocker_count") params.set("surfaceSort", sort);
  const query = params.toString();
  return query ? `/admin/audit?${query}#surface-material-qa` : "/admin/audit#surface-material-qa";
}
