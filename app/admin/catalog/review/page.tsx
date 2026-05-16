import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { getFreshCatalogYamlMap, type CatalogYamlEntry } from "@/lib/catalog-yaml";
import { getAdminImportWorkflowData, type AdminImportWorkflowJob } from "@/lib/import-jobs/admin-workflow";

function renderJson(value: unknown): string {
  if (value === null || value === undefined) return "-";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function readNested(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "-";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((entry) => normalizeValue(entry)).join(", ") : "-";
  }
  return JSON.stringify(value);
}

type DiffRow = {
  label: string;
  sourceValue: string;
  presetValue: string;
  state: "match" | "mismatch" | "missing";
};

function buildDiffRows(job: AdminImportWorkflowJob, linkedPreset: CatalogYamlEntry | null): DiffRow[] {
  const raw = job.rawMetadataJson;
  const rows: Array<{ label: string; sourceValue: unknown; presetValue: unknown }> = [
    { label: "Brand", sourceValue: readNested(raw, ["brand"]) ?? job.sourceBrand, presetValue: linkedPreset?.brand },
    { label: "Category", sourceValue: readNested(raw, ["category"]), presetValue: linkedPreset?.category },
    { label: "Product name", sourceValue: readNested(raw, ["product_name"]), presetValue: linkedPreset?.product_name },
    { label: "Variant", sourceValue: readNested(raw, ["variant"]) ?? job.sourceSku, presetValue: linkedPreset?.variant },
    { label: "Material family", sourceValue: readNested(raw, ["material_family"]), presetValue: linkedPreset?.material_family },
    { label: "Color family", sourceValue: readNested(raw, ["color_family"]), presetValue: linkedPreset?.color_family },
    { label: "Tone", sourceValue: readNested(raw, ["tone"]), presetValue: linkedPreset?.tone },
    { label: "Asset id", sourceValue: readNested(raw, ["assets", "asset_id"]) ?? job.normalizedAssetId, presetValue: linkedPreset?.assets?.asset_id ?? job.normalizedAssetId },
    { label: "Width (cm)", sourceValue: readNested(raw, ["dimensions", "width_cm"]), presetValue: linkedPreset?.dimensions?.width_cm },
    { label: "Depth (cm)", sourceValue: readNested(raw, ["dimensions", "depth_cm"]), presetValue: linkedPreset?.dimensions?.depth_cm },
    { label: "Height (cm)", sourceValue: readNested(raw, ["dimensions", "height_cm"]), presetValue: linkedPreset?.dimensions?.height_cm },
    { label: "Price band", sourceValue: readNested(raw, ["price_band"]), presetValue: linkedPreset?.price_band },
  ];

  return rows.map((row) => {
    const sourceValue = normalizeValue(row.sourceValue);
    const presetValue = normalizeValue(row.presetValue);
    const state =
      sourceValue === "-" || presetValue === "-"
        ? "missing"
        : sourceValue.toLowerCase() === presetValue.toLowerCase()
          ? "match"
          : "mismatch";

    return {
      label: row.label,
      sourceValue,
      presetValue,
      state,
    };
  });
}

export default async function AdminCatalogReviewPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }

  const workflow = await getAdminImportWorkflowData();
  const reviewJobs = workflow.jobs.filter(
    (job) => job.workflowStage === "review" || job.status === "needs_review"
  );
  const catalogYamlMap = getFreshCatalogYamlMap();

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Phase B</div>
        <h1 className="text-2xl font-semibold">Catalog Review Queue</h1>
        <p className="max-w-3xl text-sm text-neutral-600">
          Side-by-side review for imports that need human approval. Compare source metadata, import report,
          and linked catalog preset data before publishing.
        </p>
      </header>

      <div className="flex flex-wrap gap-3 text-xs">
        <Link href="/admin/catalog/inbox" className="text-blue-600 hover:text-blue-700">
          Back to inbox
        </Link>
        <Link href="/admin/imports" className="text-blue-600 hover:text-blue-700">
          Open raw import jobs
        </Link>
      </div>

      <section className="rounded-xl border p-4">
        <div className="text-sm font-semibold">Review queue size</div>
        <div className="mt-1 text-3xl font-semibold">{reviewJobs.length}</div>
        <div className="mt-1 text-xs text-neutral-500">Items waiting for review-stage QA or explicit needs-review status.</div>
      </section>

      <div className="space-y-6">
        {reviewJobs.map((job) => {
          const linkedPreset = job.normalizedAssetId
            ? (catalogYamlMap.get(job.normalizedAssetId) ?? null)
            : null;
          const diffRows = buildDiffRows(job, linkedPreset);
          const matches = diffRows.filter((row) => row.state === "match").length;
          const mismatches = diffRows.filter((row) => row.state === "mismatch").length;
          const missing = diffRows.filter((row) => row.state === "missing").length;

          return (
            <section key={job.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">{job.workflowStage}</div>
                  <h2 className="mt-1 text-lg font-semibold">{job.sourceFileName}</h2>
                  <div className="mt-1 text-sm text-neutral-600">
                    {job.sourceBrand ?? "Unknown brand"}
                    {job.sourceSku ? ` · SKU ${job.sourceSku}` : ""}
                    {job.status ? ` · ${job.status}` : ""}
                  </div>
                </div>
                <Link className="text-sm text-blue-600 hover:text-blue-700" href={`/admin/imports/${job.id}`}>
                  Open full job
                </Link>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                <div className="rounded-lg border border-neutral-200 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                    Review context
                  </div>
                  <div className="mt-3 grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
                    <div className="text-neutral-500">Brand</div>
                    <div>{job.sourceBrand ?? "-"}</div>
                    <div className="text-neutral-500">SKU</div>
                    <div>{job.sourceSku ?? "-"}</div>
                    <div className="text-neutral-500">Product URL</div>
                    <div className="break-all">{job.sourceProductUrl ?? "-"}</div>
                    <div className="text-neutral-500">Next action</div>
                    <div>{job.nextAction ?? "-"}</div>
                    <div className="text-neutral-500">Review notes</div>
                    <div>{job.reviewNotes ?? "-"}</div>
                    <div className="text-neutral-500">Preset path</div>
                    <div className="break-all">{linkedPreset?.file_path ?? "-"}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full bg-green-100 px-2 py-1 text-green-700">Matches: {matches}</span>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">Mismatches: {mismatches}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-1 text-neutral-700">Missing: {missing}</span>
                  </div>
                  <div className="mt-4">
                    <div className="text-xs font-medium text-neutral-600">Validation snapshot</div>
                    <pre className="mt-1 max-h-52 overflow-auto rounded bg-neutral-50 p-3 text-xs">
                      {renderJson({
                        importReport: job.reportJson,
                        linkedPresetValidation: linkedPreset?.preset_validation ?? null,
                      })}
                    </pre>
                  </div>
                </div>

                <div className="rounded-lg border border-neutral-200 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                    Field-level diff
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-160 border-collapse text-sm">
                      <thead>
                        <tr className="border-b bg-neutral-50 text-left">
                          <th className="px-3 py-2 font-medium">Field</th>
                          <th className="px-3 py-2 font-medium">Source/import</th>
                          <th className="px-3 py-2 font-medium">Linked preset</th>
                          <th className="px-3 py-2 font-medium">State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diffRows.map((row) => (
                          <tr key={row.label} className="border-b align-top">
                            <td className="px-3 py-2 font-medium">{row.label}</td>
                            <td className="px-3 py-2 text-neutral-700">{row.sourceValue}</td>
                            <td className="px-3 py-2 text-neutral-700">{row.presetValue}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  row.state === "match"
                                    ? "bg-green-100 text-green-700"
                                    : row.state === "mismatch"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-neutral-100 text-neutral-700"
                                }`}
                              >
                                {row.state}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          );
        })}

        {reviewJobs.length === 0 ? (
          <section className="rounded-xl border border-dashed p-8 text-center text-sm text-neutral-500">
            No items currently waiting in the review queue.
          </section>
        ) : null}
      </div>
    </div>
  );
}
