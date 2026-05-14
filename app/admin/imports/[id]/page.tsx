import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getFreshCatalogYamlMap } from "@/lib/catalog-yaml";
import {
  type AdminImportWorkflowJob,
  getImportJobValidationBlockers,
  getPrimaryImportWorkflowQueue,
} from "@/lib/import-jobs/admin-workflow";
import ImportJobActions from "./ImportJobActions";

type ImportJobDetail = {
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
  workflowBlockers: string[];
  nextAction: string | null;
  reviewNotes: string | null;
  reviewCommentsJson: unknown;
  dimensionsVerificationStatus: string | null;
  sourceDimensionsJson: unknown;
  extractedDimensionsJson: unknown;
  behaviorDefaultsApplied: boolean;
  metadataTags: string[];
  uploadedByUserId: string | null;
  notes: string | null;
  errorMessage: string | null;
  rawMetadataJson: unknown;
  reportJson: unknown;
  rawFileUrl: string | null;
  normalizedFileUrl: string | null;
  optimizedFileUrl: string | null;
  thumbnailUrl: string | null;
  metadataReportUrl: string | null;
  qaReportUrl: string | null;
  normalizedAssetId: string | null;
  catalogItemId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function renderJson(value: unknown): string {
  if (value === null || value === undefined) return "-";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type ParsedImportReport = {
  warnings?: string[];
  blockers?: string[];
  metrics?: {
    fileSizeBytes?: number;
    triangleCount?: number;
    textureCount?: number;
    maxTextureSize?: number;
  };
};

type CatalogAuditEventRow = {
  id: string;
  createdAt: Date;
  actorEmail: string | null;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
};

type LinkedCatalogPresetSummary = {
  category?: string;
  product_name?: string;
  variant?: string;
  preset_label?: string | null;
  file_path?: string;
  preset_validation?: {
    missingRequiredFields: string[];
    invalidEnumFields: Array<{
      field: string;
      value: string;
      allowed: string[];
    }>;
    invalidPositiveNumberFields: string[];
    errors: string[];
    warnings: string[];
    publishable: boolean;
  };
  auto_metadata?: Record<string, unknown>;
} | null;

function parseReport(value: unknown): ParsedImportReport | null {
  if (!value || typeof value !== "object") return null;
  return value as ParsedImportReport;
}

export default async function ImportJobDetailPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }

  const { id } = await params;

  const prismaCompat = prisma as unknown as {
    importJob: {
      findUnique: (args: {
        where: { id: string };
        select: {
          id: true;
          status: true;
          sourceBrand: true;
          sourceSku: true;
          sourceProductUrl: true;
          sourceFileName: true;
          sourceFileUrl: true;
          brandId: true;
          supplierSourceId: true;
          assetLicenseId: true;
          workflowStage: true;
          workflowBlockers: true;
          nextAction: true;
          reviewNotes: true;
          reviewCommentsJson: true;
          dimensionsVerificationStatus: true;
          sourceDimensionsJson: true;
          extractedDimensionsJson: true;
          behaviorDefaultsApplied: true;
          metadataTags: true;
          uploadedByUserId: true;
          notes: true;
          errorMessage: true;
          rawMetadataJson: true;
          reportJson: true;
          rawFileUrl: true;
          normalizedFileUrl: true;
          optimizedFileUrl: true;
          thumbnailUrl: true;
          metadataReportUrl: true;
          qaReportUrl: true;
          normalizedAssetId: true;
          catalogItemId: true;
          createdAt: true;
          updatedAt: true;
        };
      }) => Promise<ImportJobDetail | null>;
    };
    catalogAuditEvent: {
      findMany: (args: {
        where: { importJobId: string };
        orderBy: { createdAt: "desc" };
        take: number;
        select: {
          id: true;
          createdAt: true;
          actorEmail: true;
          eventType: true;
          fromStatus: true;
          toStatus: true;
          note: true;
        };
      }) => Promise<CatalogAuditEventRow[]>;
    };
  };

  const job = await prismaCompat.importJob.findUnique({
    where: { id },
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
      workflowBlockers: true,
      nextAction: true,
      reviewNotes: true,
      reviewCommentsJson: true,
      dimensionsVerificationStatus: true,
      sourceDimensionsJson: true,
      extractedDimensionsJson: true,
      behaviorDefaultsApplied: true,
      metadataTags: true,
      uploadedByUserId: true,
      notes: true,
      errorMessage: true,
      rawMetadataJson: true,
      reportJson: true,
      rawFileUrl: true,
      normalizedFileUrl: true,
      optimizedFileUrl: true,
      thumbnailUrl: true,
      metadataReportUrl: true,
      qaReportUrl: true,
      normalizedAssetId: true,
      catalogItemId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!job) notFound();

  const auditEvents = await prismaCompat.catalogAuditEvent.findMany({
    where: { importJobId: id },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      createdAt: true,
      actorEmail: true,
      eventType: true,
      fromStatus: true,
      toStatus: true,
      note: true,
    },
  });

  const parsedReport = parseReport(job.reportJson);
  const blockers = parsedReport?.blockers ?? [];
  const warnings = parsedReport?.warnings ?? [];
  const hasBlockers = blockers.length > 0;
  const hasWarnings = warnings.length > 0;
  const linkedCatalogEntry: LinkedCatalogPresetSummary = job.normalizedAssetId
    ? (getFreshCatalogYamlMap().get(job.normalizedAssetId) ?? null)
    : null;
  const workflowJob = job as unknown as AdminImportWorkflowJob;
  const queueKey = getPrimaryImportWorkflowQueue(workflowJob);
  const validationBlockers = getImportJobValidationBlockers(workflowJob);

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <Link href="/admin/imports" className="text-xs text-blue-600 hover:text-blue-700">Back to imports</Link>
        <h1 className="text-2xl font-semibold">Import Job {job.id}</h1>
        <p className="text-sm text-neutral-600">Status: {job.status}</p>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-neutral-700">
            Queue: {queueKey}
          </span>
          <Link href="/admin/catalog/inbox" className="text-blue-600 hover:text-blue-700">
            Open inbox workflow
          </Link>
          <Link href="/admin/catalog/review" className="text-blue-600 hover:text-blue-700">
            Open review queue
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border p-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Workflow queue</div>
          <div className="mt-2 text-lg font-semibold capitalize">{queueKey}</div>
          <div className="mt-1 text-xs text-neutral-600">Stage: {job.workflowStage}</div>
          <div className="mt-1 text-xs text-neutral-600">Next action: {job.nextAction ?? "-"}</div>
        </div>
        <div className="rounded-xl border p-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Publish readiness</div>
          <div className="mt-2 text-lg font-semibold">
            {validationBlockers.length === 0 ? "Ready to advance" : "Blocked"}
          </div>
          <div className="mt-1 text-xs text-neutral-600">
            {validationBlockers.length} blocker{validationBlockers.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="rounded-xl border p-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Side-by-side diff</div>
          <div className="mt-2 text-xs text-neutral-600">
            Compare source metadata against linked catalog preset and import validation below.
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-4 text-sm">
          <div><span className="text-neutral-500">Source file:</span> {job.sourceFileName}</div>
          <div><span className="text-neutral-500">Source brand:</span> {job.sourceBrand ?? "-"}</div>
          <div><span className="text-neutral-500">Source SKU:</span> {job.sourceSku ?? "-"}</div>
          <div><span className="text-neutral-500">Source URL:</span> {job.sourceProductUrl ?? "-"}</div>
          <div><span className="text-neutral-500">Brand Id:</span> {job.brandId ?? "-"}</div>
          <div><span className="text-neutral-500">Supplier source:</span> {job.supplierSourceId ?? "-"}</div>
          <div><span className="text-neutral-500">Asset license:</span> {job.assetLicenseId ?? "-"}</div>
          <div><span className="text-neutral-500">Uploaded by:</span> {job.uploadedByUserId ?? "-"}</div>
          <div><span className="text-neutral-500">Created:</span> {job.createdAt.toLocaleString()}</div>
          <div><span className="text-neutral-500">Updated:</span> {job.updatedAt.toLocaleString()}</div>
          <div><span className="text-neutral-500">Error:</span> {job.errorMessage ?? "-"}</div>
        </div>

        <div className="rounded-xl border p-4 text-sm space-y-1">
          <div><span className="text-neutral-500">Raw:</span> {job.rawFileUrl ?? "-"}</div>
          <div><span className="text-neutral-500">Normalized:</span> {job.normalizedFileUrl ?? "-"}</div>
          <div><span className="text-neutral-500">Optimized:</span> {job.optimizedFileUrl ?? "-"}</div>
          <div><span className="text-neutral-500">Thumbnail:</span> {job.thumbnailUrl ?? "-"}</div>
          <div><span className="text-neutral-500">Metadata report:</span> {job.metadataReportUrl ?? "-"}</div>
          <div><span className="text-neutral-500">QA report:</span> {job.qaReportUrl ?? "-"}</div>
          <div><span className="text-neutral-500">ModelAsset:</span> {job.normalizedAssetId ?? "-"}</div>
          <div><span className="text-neutral-500">CatalogItem:</span> {job.catalogItemId ?? "-"}</div>
        </div>
      </section>

      <ImportJobActions
        jobId={job.id}
        currentStatus={job.status}
        initialNotes={job.notes ?? ""}
        initialErrorMessage={job.errorMessage ?? ""}
        initialCatalogItemId={job.catalogItemId ?? ""}
        initialNormalizedAssetId={job.normalizedAssetId ?? ""}
        initialWorkflowStage={job.workflowStage}
        initialWorkflowBlockers={job.workflowBlockers}
        initialValidationBlockers={validationBlockers}
        initialNextAction={job.nextAction ?? ""}
        initialReviewNotes={job.reviewNotes ?? ""}
        initialDimensionsVerificationStatus={job.dimensionsVerificationStatus ?? "pending"}
        initialBehaviorDefaultsApplied={job.behaviorDefaultsApplied}
        initialMetadataTags={job.metadataTags}
        initialBrandId={job.brandId ?? ""}
        initialSupplierSourceId={job.supplierSourceId ?? ""}
        initialSourceSku={job.sourceSku ?? ""}
        initialSourceProductUrl={job.sourceProductUrl ?? ""}
        initialAssetLicenseId={job.assetLicenseId ?? ""}
        linkedCatalogEntry={linkedCatalogEntry}
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-4 text-sm">
          <h2 className="text-sm font-semibold">Workflow Stage</h2>
          <div className="mt-2"><span className="text-neutral-500">Stage:</span> {job.workflowStage}</div>
          <div><span className="text-neutral-500">Next action:</span> {job.nextAction ?? "-"}</div>
          <div><span className="text-neutral-500">Blockers:</span> {job.workflowBlockers.length > 0 ? job.workflowBlockers.join(", ") : "-"}</div>
          <div><span className="text-neutral-500">Behavior defaults:</span> {job.behaviorDefaultsApplied ? "applied" : "pending"}</div>
          <div><span className="text-neutral-500">Metadata tags:</span> {job.metadataTags.length > 0 ? job.metadataTags.join(", ") : "-"}</div>
        </div>
        <div className="rounded-xl border p-4 text-sm">
          <h2 className="text-sm font-semibold">Dimensions Verification</h2>
          <div className="mt-2"><span className="text-neutral-500">Status:</span> {job.dimensionsVerificationStatus ?? "pending"}</div>
          <div className="text-xs text-neutral-500 mt-2">Supplier dimensions</div>
          <pre className="mt-1 max-h-32 overflow-auto rounded bg-neutral-50 p-2 text-xs">{renderJson(job.sourceDimensionsJson)}</pre>
          <div className="text-xs text-neutral-500 mt-2">Extracted dimensions</div>
          <pre className="mt-1 max-h-32 overflow-auto rounded bg-neutral-50 p-2 text-xs">{renderJson(job.extractedDimensionsJson)}</pre>
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-sm font-semibold">QA Summary</h2>
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded border p-3">
            <div className="text-xs text-neutral-500">Blockers</div>
            {hasBlockers ? (
              <ul className="mt-1 list-disc pl-5 text-xs text-red-700">
                {blockers.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-xs text-green-700">No blockers detected.</div>
            )}
          </div>
          <div className="rounded border p-3">
            <div className="text-xs text-neutral-500">Warnings</div>
            {hasWarnings ? (
              <ul className="mt-1 list-disc pl-5 text-xs text-amber-700">
                {warnings.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-xs text-neutral-600">No warnings.</div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Side-by-side diff</h2>
            <p className="mt-1 text-xs text-neutral-600">
              Review source import data against catalog-linked preset and validation output before publish.
            </p>
          </div>
          <Link href="/admin/catalog/review" className="text-xs text-blue-600 hover:text-blue-700">
            Open review queue
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-neutral-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Source side</div>
            <pre className="mt-2 max-h-105 overflow-auto rounded bg-neutral-50 p-3 text-xs">
              {renderJson({
                sourceBrand: job.sourceBrand,
                sourceSku: job.sourceSku,
                sourceProductUrl: job.sourceProductUrl,
                sourceDimensions: job.sourceDimensionsJson,
                extractedDimensions: job.extractedDimensionsJson,
                rawMetadata: job.rawMetadataJson,
              })}
            </pre>
          </div>

          <div className="rounded-lg border border-neutral-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">Catalog side</div>
            <pre className="mt-2 max-h-105 overflow-auto rounded bg-neutral-50 p-3 text-xs">
              {renderJson({
                linkedCatalogItemId: job.catalogItemId,
                normalizedAssetId: job.normalizedAssetId,
                linkedPreset: linkedCatalogEntry,
                importReport: job.reportJson,
                validationBlockers,
              })}
            </pre>
          </div>
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-sm font-semibold">Catalog Handoff</h2>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          {job.catalogItemId ? (
            <>
              <Link className="text-blue-700 hover:underline" href={`/admin/catalog/${job.catalogItemId}`}>
                Open catalog item
              </Link>
              <Link className="text-blue-700 hover:underline" href={`/admin/catalog/${job.catalogItemId}/finishes`}>
                Open finish mapping
              </Link>
              <Link className="text-blue-700 hover:underline" href={`/admin/catalog/${job.catalogItemId}/commerce`}>
                Open commerce mapping
              </Link>
              <Link className="text-blue-700 hover:underline" href={`/admin/catalog/${job.catalogItemId}/qa`}>
                Open catalog QA
              </Link>
            </>
          ) : (
            <span className="text-xs text-neutral-600">
              No catalog item linked yet. Link this import during mapping to unlock finish and commerce handoff.
            </span>
          )}
          {job.normalizedAssetId && (
            <Link className="text-blue-700 hover:underline" href={`/admin/models/${job.normalizedAssetId}`}>
              Open model asset
            </Link>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Report JSON</h2>
          <pre className="mt-2 max-h-105 overflow-auto rounded bg-neutral-50 p-3 text-xs">{renderJson(job.reportJson)}</pre>
        </div>
        <div className="rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Raw Metadata JSON</h2>
          <pre className="mt-2 max-h-105 overflow-auto rounded bg-neutral-50 p-3 text-xs">{renderJson(job.rawMetadataJson)}</pre>
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-sm font-semibold">Audit Trail</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-170 border-collapse text-xs">
            <thead>
              <tr className="border-b bg-neutral-50 text-left">
                <th className="px-2 py-1 font-medium">Time</th>
                <th className="px-2 py-1 font-medium">Actor</th>
                <th className="px-2 py-1 font-medium">Event</th>
                <th className="px-2 py-1 font-medium">Transition</th>
                <th className="px-2 py-1 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.map((event) => (
                <tr key={event.id} className="border-b align-top">
                  <td className="px-2 py-1">{event.createdAt.toLocaleString()}</td>
                  <td className="px-2 py-1">{event.actorEmail ?? "system"}</td>
                  <td className="px-2 py-1">{event.eventType}</td>
                  <td className="px-2 py-1">{event.fromStatus ?? "-"}{" -> "}{event.toStatus ?? "-"}</td>
                  <td className="px-2 py-1 text-neutral-600">{event.note ?? "-"}</td>
                </tr>
              ))}
              {auditEvents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-neutral-500">
                    No audit events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {job.notes && (
        <section className="rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Notes</h2>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-700">{job.notes}</pre>
        </section>
      )}
    </div>
  );
}
