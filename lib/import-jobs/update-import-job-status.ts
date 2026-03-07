import { prisma } from "../prisma";
import { canTransitionImportStatus } from "./status";
import type { ImportJobDerivativeUrls, ImportJobReport, ImportJobStatus } from "./types";

type ImportJobRow = {
  id: string;
  status: ImportJobStatus;
};

type UpdateImportJobStatusInput = {
  id: string;
  to: ImportJobStatus;
  errorMessage?: string | null;
  notes?: string | null;
  normalizedAssetId?: string | null;
  catalogItemId?: string | null;
  report?: ImportJobReport;
  derivatives?: ImportJobDerivativeUrls;
  rawMetadataJson?: unknown;
};

export async function updateImportJobStatus(input: UpdateImportJobStatusInput): Promise<void> {
  const prismaCompat = prisma as unknown as {
    importJob: {
      findUnique: (args: { where: { id: string }; select: { id: true; status: true } }) => Promise<ImportJobRow | null>;
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
        };
      }) => Promise<unknown>;
    };
  };

  const current = await prismaCompat.importJob.findUnique({
    where: { id: input.id },
    select: { id: true, status: true },
  });

  if (!current) {
    throw new Error(`ImportJob not found: ${input.id}`);
  }

  if (!canTransitionImportStatus(current.status, input.to)) {
    throw new Error(`Invalid ImportJob transition ${current.status} -> ${input.to} for job ${input.id}`);
  }

  await prismaCompat.importJob.update({
    where: { id: input.id },
    data: {
      status: input.to,
      errorMessage: input.errorMessage,
      notes: input.notes,
      normalizedAssetId: input.normalizedAssetId,
      catalogItemId: input.catalogItemId,
      reportJson: input.report,
      rawMetadataJson: input.rawMetadataJson,
      rawFileUrl: input.derivatives?.rawFileUrl,
      normalizedFileUrl: input.derivatives?.normalizedFileUrl,
      optimizedFileUrl: input.derivatives?.optimizedFileUrl,
      thumbnailUrl: input.derivatives?.thumbnailUrl,
      metadataReportUrl: input.derivatives?.metadataReportUrl,
      qaReportUrl: input.derivatives?.qaReportUrl,
    },
  });
}
