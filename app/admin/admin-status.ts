import type { FloorPlanImportJobStatus, FloorPlanPublicationStatus } from "@prisma/client";
import type { CatalogWorkflowStage, ImportJobStatus } from "@/lib/import-jobs/types";
import type { ModelAssetStatus } from "@/lib/modelAssetStatus";
import type { SurfacePublishStatus } from "@/lib/surface-material-schema";

// One label and one tone for every status Admin shows (UX audit AD5, phase 4i-2), one dictionary
// per kind of status. Type imports only, so client components can read it too.

export type AdminStatusTone = "neutral" | "info" | "success" | "warning" | "critical";
export type AdminStatusEntry = { readonly label: string; readonly tone: AdminStatusTone };
type Dictionary<Status extends string> = Readonly<Record<Status, AdminStatusEntry>>;

const IMPORT_JOB: Dictionary<ImportJobStatus> = {
  received: { label: "Received", tone: "info" },
  normalizing: { label: "Normalizing", tone: "info" },
  optimized: { label: "Optimized", tone: "info" },
  preview_generated: { label: "Preview generated", tone: "info" },
  metadata_extracted: { label: "Metadata extracted", tone: "info" },
  needs_mapping: { label: "Needs mapping", tone: "warning" },
  needs_review: { label: "Needs review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  published: { label: "Published", tone: "success" },
  failed: { label: "Failed", tone: "critical" },
};

const WORKFLOW_STAGE: Dictionary<CatalogWorkflowStage> = {
  intake: { label: "Intake", tone: "info" },
  enrichment: { label: "Enrichment", tone: "info" },
  review: { label: "Review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  published: { label: "Published", tone: "success" },
  blocked: { label: "Blocked", tone: "critical" },
};

const FLOOR_PLAN_JOB: Dictionary<FloorPlanImportJobStatus> = {
  received: { label: "Received", tone: "info" },
  rendered: { label: "Rendered", tone: "info" },
  extracted: { label: "Extracted", tone: "info" },
  selecting_page: { label: "Selecting page", tone: "info" },
  scale_solved: { label: "Scale solved", tone: "info" },
  topology_built: { label: "Topology built", tone: "info" },
  validating: { label: "Validating", tone: "info" },
  needs_review: { label: "Needs review", tone: "warning" },
  ready: { label: "Ready", tone: "success" },
  applied: { label: "Applied", tone: "success" },
  published: { label: "Published", tone: "success" },
  failed: { label: "Failed", tone: "critical" },
};

const FLOOR_PLAN_PUBLICATION: Dictionary<FloorPlanPublicationStatus> = {
  draft: { label: "Draft", tone: "neutral" },
  approved: { label: "Approved", tone: "info" },
  published: { label: "Published", tone: "success" },
  retired: { label: "Retired", tone: "neutral" },
};

const MODEL_ASSET: Dictionary<ModelAssetStatus> = {
  draft: { label: "Draft", tone: "neutral" },
  needs_fix: { label: "Needs fix", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
};

const SURFACE_PUBLICATION: Dictionary<SurfacePublishStatus> = {
  draft: { label: "Draft", tone: "warning" },
  needs_review: { label: "Needs review", tone: "warning" },
  published: { label: "Published", tone: "success" },
  blocked: { label: "Blocked", tone: "critical" },
};

/** A supplier's size against the model's, row by row, in Catalog review. */
const SIZE_CHECK: Dictionary<"match" | "mismatch" | "missing"> = {
  match: { label: "Match", tone: "success" },
  mismatch: { label: "Mismatch", tone: "warning" },
  missing: { label: "Missing", tone: "neutral" },
};

export const ADMIN_STATUS_DICTIONARIES = {
  importJob: IMPORT_JOB,
  workflowStage: WORKFLOW_STAGE,
  floorPlanJob: FLOOR_PLAN_JOB,
  floorPlanPublication: FLOOR_PLAN_PUBLICATION,
  modelAsset: MODEL_ASSET,
  surfacePublication: SURFACE_PUBLICATION,
  sizeCheck: SIZE_CHECK,
} as const;

export type AdminStatusKind = keyof typeof ADMIN_STATUS_DICTIONARIES;

/** A status the dictionary doesn't know reads as its own words, in a neutral tone. */
export function describeAdminStatus(kind: AdminStatusKind, status: string): AdminStatusEntry {
  const dictionary: Readonly<Record<string, AdminStatusEntry>> = ADMIN_STATUS_DICTIONARIES[kind];
  if (Object.prototype.hasOwnProperty.call(dictionary, status)) return dictionary[status];
  const words = status.replaceAll("_", " ").trim();
  return {
    label: words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : "Not set",
    tone: "neutral",
  };
}
