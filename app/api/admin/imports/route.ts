import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import {
  hasOwn,
  isPlainObject,
  isStringArray,
  normalizeStringArray,
  pickDefinedFields,
} from "@/lib/admin-api/update-validation";
import { prisma } from "@/lib/prisma";
import { createImportJob } from "@/lib/import-jobs/create-import-job";

type ImportJobListRow = {
  id: string;
  status: string;
  sourceBrand: string | null;
  sourceSku: string | null;
  sourceProductUrl: string | null;
  sourceFileName: string;
  sourceFileUrl: string;
  brandId: string | null;
  supplierSourceId: string | null;
  assetLicenseId: string | null;
  workflowStage: string;
  uploadedByUserId: string | null;
  notes: string | null;
  errorMessage: string | null;
  normalizedAssetId: string | null;
  catalogItemId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const WORKFLOW_STAGES = ["intake", "enrichment", "review", "approved", "published", "blocked"] as const;

function isWorkflowStage(value: unknown): value is (typeof WORKFLOW_STAGES)[number] {
  return typeof value === "string" && WORKFLOW_STAGES.includes(value as (typeof WORKFLOW_STAGES)[number]);
}

const CREATE_IMPORT_JOB_FIELDS = [
  "sourceFileName",
  "sourceFileUrl",
  "sourceBrand",
  "sourceSku",
  "sourceProductUrl",
  "brandId",
  "supplierSourceId",
  "assetLicenseId",
  "workflowStage",
  "workflowBlockers",
  "metadataTags",
  "notes",
  "uploadedByUserId",
  "rawMetadataJson",
] as const;

type CreateImportField = (typeof CREATE_IMPORT_JOB_FIELDS)[number];
type CreateImportRouteBody = Partial<Record<CreateImportField, unknown>>;

function pickDefinedCreateFields(value: Record<string, unknown>) {
  return pickDefinedFields(value, CREATE_IMPORT_JOB_FIELDS) as CreateImportRouteBody;
}

function normalizeCreateBody(data: CreateImportRouteBody) {
  const next: CreateImportRouteBody = { ...data };

  const trimStringField = (field: CreateImportField) => {
    if (typeof next[field] === "string") {
      next[field] = next[field].trim();
    }
  };

  trimStringField("sourceFileName");
  trimStringField("sourceFileUrl");
  trimStringField("sourceBrand");
  trimStringField("sourceSku");
  trimStringField("sourceProductUrl");
  trimStringField("brandId");
  trimStringField("supplierSourceId");
  trimStringField("assetLicenseId");
  trimStringField("workflowStage");
  trimStringField("notes");
  trimStringField("uploadedByUserId");

  if (Array.isArray(next.workflowBlockers) && next.workflowBlockers.every((entry) => typeof entry === "string")) {
    next.workflowBlockers = normalizeStringArray(next.workflowBlockers as string[]);
  }

  if (Array.isArray(next.metadataTags) && next.metadataTags.every((entry) => typeof entry === "string")) {
    next.metadataTags = normalizeStringArray(next.metadataTags as string[]);
  }

  return next;
}

function validateCreateBody(body: CreateImportRouteBody) {
  if (!body.sourceFileName || typeof body.sourceFileName !== "string") {
    return "sourceFileName is required.";
  }

  if (!body.sourceFileUrl || typeof body.sourceFileUrl !== "string") {
    return "sourceFileUrl is required.";
  }

  const optionalStringFields: CreateImportField[] = [
    "sourceBrand",
    "sourceSku",
    "sourceProductUrl",
    "brandId",
    "supplierSourceId",
    "assetLicenseId",
    "notes",
    "uploadedByUserId",
  ];

  for (const field of optionalStringFields) {
    if (!hasOwn(body as Record<string, unknown>, field)) continue;
    const value = body[field];
    if (!(typeof value === "string" || value === null)) {
      return `${field} must be a string or null.`;
    }
  }

  if (hasOwn(body as Record<string, unknown>, "workflowStage")) {
    if (!isWorkflowStage(body.workflowStage)) {
      return "Invalid workflowStage.";
    }
  }

  if (hasOwn(body as Record<string, unknown>, "workflowBlockers") && !isStringArray(body.workflowBlockers)) {
    return "workflowBlockers must be an array of strings.";
  }

  if (hasOwn(body as Record<string, unknown>, "metadataTags") && !isStringArray(body.metadataTags)) {
    return "metadataTags must be an array of strings.";
  }

  return null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prismaCompat = prisma as unknown as {
    importJob: {
      findMany: (args: unknown) => Promise<ImportJobListRow[]>;
    };
  };

  const jobs = await prismaCompat.importJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      status: true,
      sourceBrand: true,
      sourceSku: true,
      sourceProductUrl: true,
      sourceFileName: true,
      sourceFileUrl: true,
      brandId: true,
      supplierSourceId: true,
      assetLicenseId: true,
      workflowStage: true,
      uploadedByUserId: true,
      notes: true,
      errorMessage: true,
      normalizedAssetId: true,
      catalogItemId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let parsedBody: unknown;

  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid POST body." }, { status: 400 });
  }

  if (!isPlainObject(parsedBody)) {
    return NextResponse.json({ error: "Invalid POST body." }, { status: 400 });
  }

  const body = normalizeCreateBody(pickDefinedCreateFields(parsedBody));
  const validationError = validateCreateBody(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const sourceFileName = String(body.sourceFileName);
  const sourceFileUrl = String(body.sourceFileUrl);

  const job = await createImportJob({
    sourceFileName,
    sourceFileUrl,
    sourceBrand: (body.sourceBrand as string | null | undefined) ?? undefined,
    sourceSku: (body.sourceSku as string | null | undefined) ?? undefined,
    sourceProductUrl: (body.sourceProductUrl as string | null | undefined) ?? undefined,
    brandId: (body.brandId as string | null | undefined) ?? undefined,
    supplierSourceId: (body.supplierSourceId as string | null | undefined) ?? undefined,
    assetLicenseId: (body.assetLicenseId as string | null | undefined) ?? undefined,
    workflowStage: (body.workflowStage as (typeof WORKFLOW_STAGES)[number] | undefined) ?? undefined,
    workflowBlockers: (body.workflowBlockers as string[] | undefined) ?? undefined,
    metadataTags: (body.metadataTags as string[] | undefined) ?? undefined,
    notes: (body.notes as string | null | undefined) ?? undefined,
    uploadedByUserId: (body.uploadedByUserId as string | null | undefined) ?? undefined,
    rawMetadataJson: body.rawMetadataJson,
  });

  return NextResponse.json({ job }, { status: 201 });
}
