import { prisma } from "../prisma";
import type { ImportJobStatus } from "./types";

export type CreateImportJobInput = {
  sourceFileName: string;
  sourceFileUrl: string;
  sourceBrand?: string;
  notes?: string;
  uploadedByUserId?: string;
  status?: ImportJobStatus;
  rawMetadataJson?: unknown;
};

type ImportJobRecord = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: ImportJobStatus;
  sourceBrand: string | null;
  sourceFileName: string;
  sourceFileUrl: string;
  uploadedByUserId: string | null;
  notes: string | null;
  errorMessage: string | null;
};

export async function createImportJob(input: CreateImportJobInput): Promise<ImportJobRecord> {
  const prismaCompat = prisma as unknown as {
    importJob: {
      create: (args: {
        data: {
          status: ImportJobStatus;
          sourceBrand?: string;
          sourceFileName: string;
          sourceFileUrl: string;
          uploadedByUserId?: string;
          notes?: string;
          rawMetadataJson?: unknown;
          rawFileUrl: string;
        };
      }) => Promise<ImportJobRecord>;
    };
  };

  return prismaCompat.importJob.create({
    data: {
      status: input.status ?? "received",
      sourceBrand: input.sourceBrand,
      sourceFileName: input.sourceFileName,
      sourceFileUrl: input.sourceFileUrl,
      uploadedByUserId: input.uploadedByUserId,
      notes: input.notes,
      rawMetadataJson: input.rawMetadataJson,
      rawFileUrl: input.sourceFileUrl,
    },
  });
}
