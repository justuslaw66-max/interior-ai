import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

type ImportJobDetail = {
  id: string;
  status: string;
  sourceBrand: string | null;
  sourceFileName: string;
  sourceFileUrl: string;
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
          sourceFileName: true;
          sourceFileUrl: true;
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
  };

  const job = await prismaCompat.importJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      sourceBrand: true,
      sourceFileName: true,
      sourceFileUrl: true,
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

  const parsedReport = parseReport(job.reportJson);
  const blockers = parsedReport?.blockers ?? [];
  const warnings = parsedReport?.warnings ?? [];
  const hasBlockers = blockers.length > 0;
  const hasWarnings = warnings.length > 0;

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <Link href="/admin/imports" className="text-xs text-blue-600 hover:text-blue-700">Back to imports</Link>
        <h1 className="text-2xl font-semibold">Import Job {job.id}</h1>
        <p className="text-sm text-neutral-600">Status: {job.status}</p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-4 text-sm">
          <div><span className="text-neutral-500">Source file:</span> {job.sourceFileName}</div>
          <div><span className="text-neutral-500">Source brand:</span> {job.sourceBrand ?? "-"}</div>
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
          <pre className="mt-2 max-h-[420px] overflow-auto rounded bg-neutral-50 p-3 text-xs">{renderJson(job.reportJson)}</pre>
        </div>
        <div className="rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Raw Metadata JSON</h2>
          <pre className="mt-2 max-h-[420px] overflow-auto rounded bg-neutral-50 p-3 text-xs">{renderJson(job.rawMetadataJson)}</pre>
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
