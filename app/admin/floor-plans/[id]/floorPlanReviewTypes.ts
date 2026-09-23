import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanAdminSourceOverlay } from "@/lib/floor-plan-imports/admin-review";

export type ReviewIssue = {
  id: string;
  code: string;
  message: string;
  severity: "info" | "warning" | "critical";
  entityIds?: string[];
  resolved: boolean;
  resolution?: string;
};

export type RenderedPage = {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  assetKey: string;
};

export type AddressBinding = {
  id?: string;
  countryCode: string;
  addressNormalized: string;
  block: string;
  street: string;
  postalCode?: string | null;
  stack?: string | null;
  floorMin?: number | null;
  floorMax?: number | null;
  transform: string;
  role: "catalog" | "authored_variant";
  sourceEvidenceJson?: unknown;
};

export type RevisionAuditEvent = {
  id: string;
  eventType: "revision_approved" | "revision_published" | "revision_retired";
  actorEmail: string | null;
  occurredAt: string;
  metadataJson: unknown;
};

export type AdminRevision = {
  id: string;
  geometryHash: string;
  verificationTier: string;
  publicationStatus: string;
  approvedByEmail: string | null;
  addressBindings: AddressBinding[];
  auditEvents: RevisionAuditEvent[];
  publicMetadata?: {
    projectName: string;
    label: string;
    flatType: string;
    floorAreaSqm: number | null;
    previewUrl: string;
    sourceUrl: string | null;
    sourceTitle: string | null;
    sourcePage: number | null;
    publisher: string;
  } | null;
};

export type AdminJob = {
  id: string;
  status: string;
  progress: number;
  candidateVersion: number;
  adapterId: string | null;
  extractionVersion: string | null;
  renderedPagesJson: unknown;
  candidateJson: unknown;
  sourceManifestJson: unknown;
  sourceObservationManifestJson: unknown;
  sourceObservationVersion: number;
  reviewIssuesJson: unknown;
  correctionLogJson: unknown;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  sourceAsset: {
    id: string;
    fileName: string;
    mimeType: string;
    byteLength: number;
    sha256: string;
  };
  revision: AdminRevision | null;
};

export type BindingDraft = {
  key: string;
  countryCode: string;
  addressNormalized: string;
  block: string;
  street: string;
  postalCode: string;
  stack: string;
  floorMin: string;
  floorMax: string;
  transform: string;
  role: "catalog" | "authored_variant";
  sourceEvidenceText: string;
};

export type AddressBindingInput = Omit<
  BindingDraft,
  "key" | "sourceEvidenceText" | "postalCode" | "stack" | "floorMin" | "floorMax"
> & {
  countryCode: string;
  postalCode: string | null;
  stack: string | null;
  floorMin: number | null;
  floorMax: number | null;
  sourceEvidence: unknown;
};

export type Feedback = {
  tone: "success" | "error" | "info";
  message: string;
} | null;

export type VerificationTier = "source_verified" | "construction_verified";

export type PublicDisplayMetadataDraft = {
  projectName: string;
  label: string;
  flatType: string;
  floorAreaSqm: string;
  previewUrl: string;
  sourceUrl: string;
  sourceTitle: string;
  sourcePage: string;
  publisher: string;
};

export type RoomRow = {
  floor: FloorPlanDocumentV2["floors"][number];
  floorIndex: number;
  room: FloorPlanDocumentV2["floors"][number]["rooms"][number];
  roomIndex: number;
};

export type ReviewOverlay = FloorPlanAdminSourceOverlay;
