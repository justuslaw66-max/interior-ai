"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const STATUS_SEQUENCE = [
  "received",
  "normalizing",
  "optimized",
  "preview_generated",
  "metadata_extracted",
  "needs_mapping",
  "needs_review",
  "approved",
  "published",
  "failed",
] as const;

type ImportJobStatus = (typeof STATUS_SEQUENCE)[number];

type ImportJobActionsProps = {
  jobId: string;
  currentStatus: string;
  initialNotes: string;
  initialErrorMessage: string;
  initialCatalogItemId: string;
  initialNormalizedAssetId: string;
  initialWorkflowStage: string;
  initialWorkflowBlockers: string[];
  initialValidationBlockers: string[];
  initialNextAction: string;
  initialReviewNotes: string;
  initialDimensionsVerificationStatus: string;
  initialBehaviorDefaultsApplied: boolean;
  initialMetadataTags: string[];
  initialBrandId: string;
  initialSupplierSourceId: string;
  initialSourceSku: string;
  initialSourceProductUrl: string;
  initialAssetLicenseId: string;
  linkedCatalogEntry: {
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
};

const WORKFLOW_STAGES = ["intake", "enrichment", "review", "approved", "published", "blocked"] as const;
const DIMENSION_STATUSES = ["pending", "matched", "mismatch", "missing_supplier", "missing_extracted"] as const;

function getAllowedStatuses(currentStatus: string): ImportJobStatus[] {
  if (!STATUS_SEQUENCE.includes(currentStatus as ImportJobStatus)) {
    return ["failed"];
  }

  if (currentStatus === "failed" || currentStatus === "published") {
    return [currentStatus as ImportJobStatus];
  }

  const fromIdx = STATUS_SEQUENCE.indexOf(currentStatus as ImportJobStatus);
  const forward = STATUS_SEQUENCE.slice(fromIdx) as ImportJobStatus[];
  return forward.includes("failed") ? forward : [...forward, "failed"];
}

export default function ImportJobActions(props: ImportJobActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [status, setStatus] = useState<ImportJobStatus | string>(props.currentStatus);
  const [notes, setNotes] = useState(props.initialNotes);
  const [errorMessage, setErrorMessage] = useState(props.initialErrorMessage);
  const [catalogItemId, setCatalogItemId] = useState(props.initialCatalogItemId);
  const [normalizedAssetId, setNormalizedAssetId] = useState(props.initialNormalizedAssetId);
  const [workflowStage, setWorkflowStage] = useState(props.initialWorkflowStage);
  const [workflowBlockers, setWorkflowBlockers] = useState(props.initialWorkflowBlockers.join("\n"));
  const [nextAction, setNextAction] = useState(props.initialNextAction);
  const [reviewNotes, setReviewNotes] = useState(props.initialReviewNotes);
  const [dimensionsVerificationStatus, setDimensionsVerificationStatus] = useState(props.initialDimensionsVerificationStatus);
  const [behaviorDefaultsApplied, setBehaviorDefaultsApplied] = useState(props.initialBehaviorDefaultsApplied);
  const [metadataTags, setMetadataTags] = useState(props.initialMetadataTags.join(", "));
  const [brandId, setBrandId] = useState(props.initialBrandId);
  const [supplierSourceId, setSupplierSourceId] = useState(props.initialSupplierSourceId);
  const [sourceSku, setSourceSku] = useState(props.initialSourceSku);
  const [sourceProductUrl, setSourceProductUrl] = useState(props.initialSourceProductUrl);
  const [assetLicenseId, setAssetLicenseId] = useState(props.initialAssetLicenseId);
  const [feedback, setFeedback] = useState<string>("");
  const [linkingCatalogItem, setLinkingCatalogItem] = useState(false);

  const statusOptions = useMemo(() => getAllowedStatuses(props.currentStatus), [props.currentStatus]);
  const autoMetadataEntries = Object.entries(props.linkedCatalogEntry?.auto_metadata ?? {});
  const parsedWorkflowBlockers = workflowBlockers
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const validationBlockers = Array.from(new Set([...props.initialValidationBlockers, ...parsedWorkflowBlockers]));
  const hasValidationBlockers = validationBlockers.length > 0;

  const buildPayload = (nextStatus: ImportJobStatus | string, overrides?: Record<string, unknown>) => ({
    status: nextStatus,
    notes: notes.trim() || null,
    errorMessage: errorMessage.trim() || null,
    catalogItemId: catalogItemId.trim() || null,
    normalizedAssetId: normalizedAssetId.trim() || null,
    workflowStage,
    workflowBlockers: parsedWorkflowBlockers,
    nextAction: nextAction.trim() || null,
    reviewNotes: reviewNotes.trim() || null,
    dimensionsVerificationStatus,
    behaviorDefaultsApplied,
    metadataTags: metadataTags
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    brandId: brandId.trim() || null,
    supplierSourceId: supplierSourceId.trim() || null,
    sourceSku: sourceSku.trim() || null,
    sourceProductUrl: sourceProductUrl.trim() || null,
    assetLicenseId: assetLicenseId.trim() || null,
    ...overrides,
  });

  const runUpdate = (nextStatus: ImportJobStatus | string, overrides?: Record<string, unknown>) => {
    setFeedback("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/imports/${props.jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(nextStatus, overrides)),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "Failed to update import job.");
        }

        setStatus(nextStatus);
        if (typeof overrides?.workflowStage === "string") {
          setWorkflowStage(overrides.workflowStage);
        }
        if (typeof overrides?.nextAction === "string") {
          setNextAction(overrides.nextAction);
        }
        setFeedback("Saved.");
        router.refresh();
      } catch (error) {
        const err = error as Error;
        setFeedback(`Error: ${err.message}`);
      }
    });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runUpdate(status);
  };

  const linkCatalogItem = () => {
    setFeedback("");
    setLinkingCatalogItem(true);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/imports/${props.jobId}/link-catalog`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              created?: boolean;
              catalogItemId?: string;
              error?: string;
            }
          | null;

        if (!response.ok || !payload?.ok || !payload.catalogItemId) {
          throw new Error(payload?.error || "Failed to link catalog item.");
        }

        setCatalogItemId(payload.catalogItemId);
        setFeedback(payload.created ? `Created and linked ${payload.catalogItemId}` : `Linked ${payload.catalogItemId}`);
        router.refresh();
      } catch (error) {
        const err = error as Error;
        setFeedback(`Error: ${err.message}`);
      } finally {
        setLinkingCatalogItem(false);
      }
    });
  };

  return (
    <section className="rounded-xl border p-4">
      <h2 className="text-sm font-semibold">Workflow Actions</h2>

      {props.linkedCatalogEntry && (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">Linked preset guidance</div>
              <div className="mt-1 text-neutral-600">
                {props.linkedCatalogEntry.preset_label ?? props.linkedCatalogEntry.category ?? "Unknown category"}
                {props.linkedCatalogEntry.product_name ? ` · ${props.linkedCatalogEntry.product_name}` : ""}
                {props.linkedCatalogEntry.variant ? ` · ${props.linkedCatalogEntry.variant}` : ""}
              </div>
            </div>
            <div
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                props.linkedCatalogEntry.preset_validation?.publishable
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {props.linkedCatalogEntry.preset_validation?.publishable ? "publishable" : "needs fixes"}
            </div>
          </div>

          {props.linkedCatalogEntry.file_path && (
            <div className="mt-2 break-all text-neutral-600">{props.linkedCatalogEntry.file_path}</div>
          )}

          {props.linkedCatalogEntry.preset_validation && (
            <div className="mt-3 space-y-2 text-neutral-700">
              {props.linkedCatalogEntry.preset_validation.missingRequiredFields.length > 0 && (
                <div>
                  <div className="font-medium text-amber-800">Missing required fields</div>
                  <div className="mt-1">
                    {props.linkedCatalogEntry.preset_validation.missingRequiredFields.join(", ")}
                  </div>
                </div>
              )}
              {props.linkedCatalogEntry.preset_validation.invalidEnumFields.length > 0 && (
                <div>
                  <div className="font-medium text-amber-800">Invalid controlled values</div>
                  <div className="mt-1 space-y-1">
                    {props.linkedCatalogEntry.preset_validation.invalidEnumFields.map((entry) => (
                      <div key={`${entry.field}-${entry.value}`}>
                        {entry.field}: {entry.value} (allowed: {entry.allowed.join(", ")})
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {props.linkedCatalogEntry.preset_validation.invalidPositiveNumberFields.length > 0 && (
                <div>
                  <div className="font-medium text-amber-800">Expected positive numbers</div>
                  <div className="mt-1">
                    {props.linkedCatalogEntry.preset_validation.invalidPositiveNumberFields.join(", ")}
                  </div>
                </div>
              )}
            </div>
          )}

          {autoMetadataEntries.length > 0 && (
            <div className="mt-3 border-t border-neutral-200 pt-2 text-neutral-700">
              <div className="font-medium text-neutral-800">Auto metadata</div>
              <div className="mt-1 grid grid-cols-1 gap-1">
                {autoMetadataEntries.map(([key, value]) => (
                  <div key={key}>
                    <span className="font-medium">{key}:</span>{" "}
                    {Array.isArray(value) ? value.join(", ") : String(value)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
        <div className="font-medium text-neutral-900">Queue shortcuts</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border px-2 py-1 font-medium disabled:opacity-60"
            disabled={isPending}
            onClick={() => runUpdate(status, { workflowStage: "intake", nextAction: "Verify source file and supplier metadata." })}
          >
            Send to scrape queue
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1 font-medium disabled:opacity-60"
            disabled={isPending}
            onClick={() => runUpdate(status, { workflowStage: "enrichment", nextAction: "Normalize asset, extract metadata, and finish mappings." })}
          >
            Send to normalize queue
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1 font-medium disabled:opacity-60"
            disabled={isPending}
            onClick={() => runUpdate("needs_review", { workflowStage: "review", nextAction: "Run human QA and compare source against preset output." })}
          >
            Send to review queue
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1 font-medium disabled:opacity-60"
            disabled={isPending || hasValidationBlockers}
            title={hasValidationBlockers ? "Clear validation blockers before moving to publish queue." : undefined}
            onClick={() => runUpdate("approved", { workflowStage: "approved", nextAction: "Ready for publish verification and launch." })}
          >
            Send to publish queue
          </button>
        </div>
        {hasValidationBlockers ? (
          <div className="mt-2 text-red-700">
            Publish queue blocked: {validationBlockers.join("; ")}
          </div>
        ) : null}
      </div>

      <form className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <label className="text-xs text-neutral-600">
          Status
          <select
            className="mt-1 w-full rounded border p-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as ImportJobStatus)}
            disabled={isPending}
          >
            {statusOptions.map((nextStatus) => (
              <option key={nextStatus} value={nextStatus}>
                {nextStatus}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-neutral-600">
          Catalog Item Id
          <input
            className="mt-1 w-full rounded border p-2 text-sm"
            value={catalogItemId}
            onChange={(event) => setCatalogItemId(event.target.value)}
            disabled={isPending}
          />
          <button
            type="button"
            className="mt-2 rounded border px-2 py-1 text-[11px] font-medium disabled:opacity-60"
            disabled={isPending || linkingCatalogItem || !normalizedAssetId.trim()}
            onClick={linkCatalogItem}
          >
            {linkingCatalogItem ? "Linking..." : "Auto-create/link catalog item"}
          </button>
        </label>

        <label className="text-xs text-neutral-600">
          Model Asset Id
          <input
            className="mt-1 w-full rounded border p-2 text-sm"
            value={normalizedAssetId}
            onChange={(event) => setNormalizedAssetId(event.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="text-xs text-neutral-600">
          Workflow Stage
          <select
            className="mt-1 w-full rounded border p-2 text-sm"
            value={workflowStage}
            onChange={(event) => setWorkflowStage(event.target.value)}
            disabled={isPending}
          >
            {WORKFLOW_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-neutral-600">
          Dimensions Verification
          <select
            className="mt-1 w-full rounded border p-2 text-sm"
            value={dimensionsVerificationStatus}
            onChange={(event) => setDimensionsVerificationStatus(event.target.value)}
            disabled={isPending}
          >
            {DIMENSION_STATUSES.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-neutral-600">
          Brand Id
          <input
            className="mt-1 w-full rounded border p-2 text-sm"
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="text-xs text-neutral-600">
          Supplier Source Id
          <input
            className="mt-1 w-full rounded border p-2 text-sm"
            value={supplierSourceId}
            onChange={(event) => setSupplierSourceId(event.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="text-xs text-neutral-600">
          Asset License Id
          <input
            className="mt-1 w-full rounded border p-2 text-sm"
            value={assetLicenseId}
            onChange={(event) => setAssetLicenseId(event.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="text-xs text-neutral-600">
          Source SKU
          <input
            className="mt-1 w-full rounded border p-2 text-sm"
            value={sourceSku}
            onChange={(event) => setSourceSku(event.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="text-xs text-neutral-600 md:col-span-2">
          Source Product URL
          <input
            className="mt-1 w-full rounded border p-2 text-sm"
            value={sourceProductUrl}
            onChange={(event) => setSourceProductUrl(event.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="text-xs text-neutral-600 md:col-span-2">
          Workflow Blockers (one per line)
          <textarea
            className="mt-1 min-h-20 w-full rounded border p-2 text-sm"
            value={workflowBlockers}
            onChange={(event) => setWorkflowBlockers(event.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="text-xs text-neutral-600 md:col-span-2">
          Next Action
          <input
            className="mt-1 w-full rounded border p-2 text-sm"
            value={nextAction}
            onChange={(event) => setNextAction(event.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="text-xs text-neutral-600 md:col-span-2">
          Review Notes
          <textarea
            className="mt-1 min-h-20 w-full rounded border p-2 text-sm"
            value={reviewNotes}
            onChange={(event) => setReviewNotes(event.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="text-xs text-neutral-600 md:col-span-2">
          Metadata Tags (comma-separated)
          <input
            className="mt-1 w-full rounded border p-2 text-sm"
            value={metadataTags}
            onChange={(event) => setMetadataTags(event.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-neutral-600 md:col-span-2">
          <input
            type="checkbox"
            checked={behaviorDefaultsApplied}
            onChange={(event) => setBehaviorDefaultsApplied(event.target.checked)}
            disabled={isPending}
          />
          Behavior defaults applied
        </label>

        <label className="text-xs text-neutral-600 md:col-span-2">
          Error Message
          <input
            className="mt-1 w-full rounded border p-2 text-sm"
            value={errorMessage}
            onChange={(event) => setErrorMessage(event.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="text-xs text-neutral-600 md:col-span-2">
          Notes
          <textarea
            className="mt-1 min-h-24 w-full rounded border p-2 text-sm"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={isPending}
          />
        </label>

        <div className="md:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Save workflow update"}
          </button>
          <button
            type="button"
            className="rounded border px-3 py-2 text-xs font-medium disabled:opacity-60"
            disabled={isPending || !statusOptions.includes("needs_review")}
            onClick={() => {
              setStatus("needs_review");
              runUpdate("needs_review");
            }}
          >
            Mark Needs Review
          </button>
          <button
            type="button"
            className="rounded border px-3 py-2 text-xs font-medium disabled:opacity-60"
            disabled={isPending || !statusOptions.includes("approved") || hasValidationBlockers}
            title={hasValidationBlockers ? "Clear validation blockers before approval." : undefined}
            onClick={() => {
              setStatus("approved");
              runUpdate("approved", { workflowStage: "approved" });
            }}
          >
            Mark Approved
          </button>
          <button
            type="button"
            className="rounded border px-3 py-2 text-xs font-medium disabled:opacity-60"
            disabled={isPending || !statusOptions.includes("published") || hasValidationBlockers}
            title={hasValidationBlockers ? "Clear validation blockers before publish." : undefined}
            onClick={() => {
              setStatus("published");
              runUpdate("published", { workflowStage: "published" });
            }}
          >
            Mark Published
          </button>
          {feedback && <span className="text-xs text-neutral-600">{feedback}</span>}
        </div>
      </form>
    </section>
  );
}
