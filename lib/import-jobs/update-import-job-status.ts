import { prisma } from "../prisma";
import { canTransitionImportStatus } from "./status";
import type {
  CatalogWorkflowStage,
  DimensionsVerificationStatus,
  ImportJobDerivativeUrls,
  ImportJobReport,
  ImportJobStatus,
} from "./types";

type ImportJobRow = {
  id: string;
  status: ImportJobStatus;
  normalizedAssetId: string | null;
  catalogItemId: string | null;
};

type UpdateImportJobStatusInput = {
  id: string;
  to?: ImportJobStatus;
  errorMessage?: string | null;
  notes?: string | null;
  normalizedAssetId?: string | null;
  catalogItemId?: string | null;
  report?: ImportJobReport;
  derivatives?: ImportJobDerivativeUrls;
  rawMetadataJson?: unknown;
  workflowStage?: CatalogWorkflowStage;
  workflowBlockers?: string[];
  nextAction?: string | null;
  reviewNotes?: string | null;
  reviewCommentsJson?: unknown;
  dimensionsVerificationStatus?: DimensionsVerificationStatus | null;
  sourceDimensionsJson?: unknown;
  extractedDimensionsJson?: unknown;
  behaviorDefaultsApplied?: boolean;
  metadataTags?: string[];
  brandId?: string | null;
  supplierSourceId?: string | null;
  sourceSku?: string | null;
  sourceProductUrl?: string | null;
  assetLicenseId?: string | null;
};

export class ImportJobUpdateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportJobUpdateValidationError";
  }
}

function buildImportJobUpdateData(input: UpdateImportJobStatusInput, nextStatus: ImportJobStatus) {
  const data: {
    status: ImportJobStatus;
    errorMessage?: string | null;
    notes?: string | null;
    normalizedAssetId?: string | null;
    catalogItemId?: string | null;
    reportJson?: unknown;
    rawMetadataJson?: unknown;
    rawFileUrl?: string;
    normalizedFileUrl?: string;
    optimizedFileUrl?: string;
    thumbnailUrl?: string;
    metadataReportUrl?: string;
    qaReportUrl?: string;
    workflowStage?: CatalogWorkflowStage;
    workflowBlockers?: string[];
    nextAction?: string | null;
    reviewNotes?: string | null;
    reviewCommentsJson?: unknown;
    dimensionsVerificationStatus?: DimensionsVerificationStatus | null;
    sourceDimensionsJson?: unknown;
    extractedDimensionsJson?: unknown;
    behaviorDefaultsApplied?: boolean;
    metadataTags?: string[];
    brandId?: string | null;
    supplierSourceId?: string | null;
    sourceSku?: string | null;
    sourceProductUrl?: string | null;
    assetLicenseId?: string | null;
  } = {
    status: nextStatus,
  };

  if (input.errorMessage !== undefined) data.errorMessage = input.errorMessage;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.normalizedAssetId !== undefined) data.normalizedAssetId = input.normalizedAssetId;
  if (input.catalogItemId !== undefined) data.catalogItemId = input.catalogItemId;
  if (input.report !== undefined) data.reportJson = input.report;
  if (input.rawMetadataJson !== undefined) data.rawMetadataJson = input.rawMetadataJson;
  if (input.derivatives?.rawFileUrl !== undefined) data.rawFileUrl = input.derivatives.rawFileUrl;
  if (input.derivatives?.normalizedFileUrl !== undefined) {
    data.normalizedFileUrl = input.derivatives.normalizedFileUrl;
  }
  if (input.derivatives?.optimizedFileUrl !== undefined) data.optimizedFileUrl = input.derivatives.optimizedFileUrl;
  if (input.derivatives?.thumbnailUrl !== undefined) data.thumbnailUrl = input.derivatives.thumbnailUrl;
  if (input.derivatives?.metadataReportUrl !== undefined) {
    data.metadataReportUrl = input.derivatives.metadataReportUrl;
  }
  if (input.derivatives?.qaReportUrl !== undefined) data.qaReportUrl = input.derivatives.qaReportUrl;
  if (input.workflowStage !== undefined) data.workflowStage = input.workflowStage;
  if (input.workflowBlockers !== undefined) data.workflowBlockers = input.workflowBlockers;
  if (input.nextAction !== undefined) data.nextAction = input.nextAction;
  if (input.reviewNotes !== undefined) data.reviewNotes = input.reviewNotes;
  if (input.reviewCommentsJson !== undefined) data.reviewCommentsJson = input.reviewCommentsJson;
  if (input.dimensionsVerificationStatus !== undefined) {
    data.dimensionsVerificationStatus = input.dimensionsVerificationStatus;
  }
  if (input.sourceDimensionsJson !== undefined) data.sourceDimensionsJson = input.sourceDimensionsJson;
  if (input.extractedDimensionsJson !== undefined) {
    data.extractedDimensionsJson = input.extractedDimensionsJson;
  }
  if (input.behaviorDefaultsApplied !== undefined) {
    data.behaviorDefaultsApplied = input.behaviorDefaultsApplied;
  }
  if (input.metadataTags !== undefined) data.metadataTags = input.metadataTags;
  if (input.brandId !== undefined) data.brandId = input.brandId;
  if (input.supplierSourceId !== undefined) data.supplierSourceId = input.supplierSourceId;
  if (input.sourceSku !== undefined) data.sourceSku = input.sourceSku;
  if (input.sourceProductUrl !== undefined) data.sourceProductUrl = input.sourceProductUrl;
  if (input.assetLicenseId !== undefined) data.assetLicenseId = input.assetLicenseId;

  return data;
}

export async function updateImportJobStatus(
  input: UpdateImportJobStatusInput
): Promise<{ previousStatus: ImportJobStatus }> {
  const prismaCompat = prisma as unknown as {
    importJob: {
      findUnique: (args: {
        where: { id: string };
        select: {
          id: true;
          status: true;
          normalizedAssetId: true;
          catalogItemId: true;
        };
      }) => Promise<ImportJobRow | null>;
      update: (args: {
        where: { id: string };
        data: {
          status: ImportJobStatus;
          errorMessage?: string | null;
          notes?: string | null;
          normalizedAssetId?: string | null;
          catalogItemId?: string | null;
          reportJson?: unknown;
          rawMetadataJson?: unknown;
          rawFileUrl?: string;
          normalizedFileUrl?: string;
          optimizedFileUrl?: string;
          thumbnailUrl?: string;
          metadataReportUrl?: string;
          qaReportUrl?: string;
          workflowStage?: CatalogWorkflowStage;
          workflowBlockers?: string[];
          nextAction?: string | null;
          reviewNotes?: string | null;
          reviewCommentsJson?: unknown;
          dimensionsVerificationStatus?: DimensionsVerificationStatus | null;
          sourceDimensionsJson?: unknown;
          extractedDimensionsJson?: unknown;
          behaviorDefaultsApplied?: boolean;
          metadataTags?: string[];
          brandId?: string | null;
          supplierSourceId?: string | null;
          sourceSku?: string | null;
          sourceProductUrl?: string | null;
          assetLicenseId?: string | null;
        };
      }) => Promise<unknown>;
    };
  };

  const current = await prismaCompat.importJob.findUnique({
    where: { id: input.id },
    select: { id: true, status: true, normalizedAssetId: true, catalogItemId: true },
  });

  if (!current) {
    throw new Error(`ImportJob not found: ${input.id}`);
  }

  const nextStatus = input.to ?? current.status;

  if (!canTransitionImportStatus(current.status, nextStatus)) {
    throw new ImportJobUpdateValidationError(
      `Invalid ImportJob transition ${current.status} -> ${nextStatus} for job ${input.id}`
    );
  }

  const nextNormalizedAssetId =
    input.normalizedAssetId !== undefined ? input.normalizedAssetId : current.normalizedAssetId;
  const nextCatalogItemId = input.catalogItemId !== undefined ? input.catalogItemId : current.catalogItemId;

  if ((nextStatus === "approved" || nextStatus === "published") && !nextNormalizedAssetId) {
    throw new ImportJobUpdateValidationError(
      `Cannot move import job ${input.id} to ${nextStatus} without a normalized asset id.`
    );
  }

  if (nextStatus === "published" && !nextCatalogItemId) {
    throw new ImportJobUpdateValidationError(
      `Cannot publish import job ${input.id} without a linked catalog item id.`
    );
  }

  await prismaCompat.importJob.update({
    where: { id: input.id },
    data: buildImportJobUpdateData(input, nextStatus),
  });

  return { previousStatus: current.status };
}
