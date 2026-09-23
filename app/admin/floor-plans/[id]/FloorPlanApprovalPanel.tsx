import type { Dispatch, SetStateAction } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { AddressBindingEditor } from "./AddressBindingEditor";
import { ApprovedRevisionPanel } from "./ApprovedRevisionPanel";
import { ConstructionEvidenceEditor } from "./ConstructionEvidenceEditor";
import { emptyBinding } from "./floorPlanReviewModel";
import type {
  AdminJob,
  BindingDraft,
  PublicDisplayMetadataDraft,
  RenderedPage,
  VerificationTier,
} from "./floorPlanReviewTypes";
import { SourceObservationManifestEditor } from "./SourceObservationManifestEditor";
import { PublicDisplayMetadataEditor } from "./PublicDisplayMetadataEditor";

export function FloorPlanApprovalPanel({
  approve,
  bindings,
  constructionEvidenceText,
  document,
  hasUnsavedChanges,
  job,
  onObservationSaved,
  pages,
  pending,
  publicDisplayMetadata,
  publish,
  publishConfirmed,
  retire,
  retireConfirmation,
  retireReason,
  reviewable,
  setBindings,
  setConstructionEvidenceText,
  setPublishConfirmed,
  setPublicDisplayMetadata,
  setRetireConfirmation,
  setRetireReason,
  setSupersedeConfirmed,
  setSupersedeReason,
  setSupersedesRevisionId,
  setVerificationTier,
  supersedeConfirmed,
  supersedeReason,
  supersedesRevisionId,
  unresolvedCriticalCount,
  verificationTier,
}: {
  approve: () => void;
  bindings: BindingDraft[];
  constructionEvidenceText: string;
  document: FloorPlanDocumentV2 | null;
  hasUnsavedChanges: boolean;
  job: AdminJob;
  onObservationSaved: () => Promise<void>;
  pages: RenderedPage[];
  pending: string | null;
  publicDisplayMetadata: PublicDisplayMetadataDraft;
  publish: () => void;
  publishConfirmed: boolean;
  retire: () => void;
  retireConfirmation: string;
  retireReason: string;
  reviewable: boolean;
  setBindings: Dispatch<SetStateAction<BindingDraft[]>>;
  setConstructionEvidenceText: (value: string) => void;
  setPublishConfirmed: (value: boolean) => void;
  setPublicDisplayMetadata: Dispatch<SetStateAction<PublicDisplayMetadataDraft>>;
  setRetireConfirmation: (value: string) => void;
  setRetireReason: (value: string) => void;
  setSupersedeConfirmed: (value: boolean) => void;
  setSupersedeReason: (value: string) => void;
  setSupersedesRevisionId: (value: string) => void;
  setVerificationTier: (value: VerificationTier) => void;
  supersedeConfirmed: boolean;
  supersedeReason: string;
  supersedesRevisionId: string;
  unresolvedCriticalCount: number;
  verificationTier: VerificationTier;
}) {
  const publicSourceFields = [
    publicDisplayMetadata.sourceUrl,
    publicDisplayMetadata.sourceTitle,
    publicDisplayMetadata.sourcePage,
  ].filter((value) => value.trim().length > 0).length;
  const publicDisplayMetadataReady =
    [
      publicDisplayMetadata.projectName,
      publicDisplayMetadata.label,
      publicDisplayMetadata.flatType,
      publicDisplayMetadata.previewUrl,
      publicDisplayMetadata.publisher,
    ].every((value) => value.trim().length >= 2) &&
    (publicSourceFields === 0 || publicSourceFields === 3);
  const approvalDisabled =
    job.status !== "ready" ||
    unresolvedCriticalCount > 0 ||
    !job.sourceObservationManifestJson ||
    Boolean(pending) ||
    hasUnsavedChanges ||
    !publicDisplayMetadataReady ||
    Boolean(supersedesRevisionId.trim() && !supersedeConfirmed);

  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">
            Import status
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-neutral-600">
            Finish and test the imported 2D plan first. Public-directory details
            can be completed later without changing its geometry.
          </p>
        </div>
        {job.revision ? (
          <div className="rounded-lg border bg-neutral-50 px-3 py-2 text-xs">
            <div className="font-medium">{job.revision.publicationStatus}</div>
            <div>{job.revision.verificationTier.replaceAll("_", " ")}</div>
            <div className="mt-1 font-mono text-[10px]">{job.revision.id}</div>
          </div>
        ) : null}
      </div>

      {!job.revision ? (
        <div
          className={`mt-4 rounded-lg border p-4 ${
            job.status === "ready"
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <div className="text-sm font-semibold text-neutral-950">
            {job.status === "ready"
              ? "2D import ready — publishing can wait"
              : "Finish the required 2D checks first"}
          </div>
          <p className="mt-1 text-xs leading-5 text-neutral-600">
            {job.status === "ready"
              ? "The reviewed layout is saved. You may leave the address, rights, observations, public display and replacement fields for later. It will not appear in public search until you publish it."
              : "Complete the scale, room and wall checks and use Save and check. Publishing information is not required for this stage."}
          </p>
        </div>
      ) : null}

      {!job.revision ? (
        <details className="mt-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-blue-950">
            Publish to the searchable directory (optional — do later)
          </summary>
          <p className="mt-2 text-xs leading-5 text-blue-900">
            Open this only when the plan is ready for public search. Public
            release still requires address proof, source rights, independent
            observations and display information.
          </p>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Property address</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Search for the property, add unit details only when they apply,
                then confirm which uploaded page proves the address. Leave this
                blank to create a starter layout that is not searchable by address.
              </p>
            </div>
            <button
              className="rounded-lg border px-3 py-1.5 text-xs font-medium"
              onClick={() => setBindings((current) => [...current, emptyBinding()])}
              type="button"
            >
              Add binding
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {bindings.map((binding, index) => (
              <AddressBindingEditor
                binding={binding}
                canRemove={bindings.length > 1}
                documentId={document?.id ?? null}
                index={index}
                key={binding.key}
                pages={pages}
                setBindings={setBindings}
                sourceAsset={job.sourceAsset}
              />
            ))}
          </div>

          <details className="mt-4 rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-700">
              Publishing and audit details
            </summary>
            <p className="mt-2 text-xs leading-5 text-neutral-500">
              These governance fields are needed only when releasing the plan to
              the shared public directory. They do not change the imported 2D layout.
            </p>
            <div className="mt-4">
              <SourceObservationManifestEditor
                candidateVersion={job.candidateVersion}
                disabled={Boolean(pending) || hasUnsavedChanges || !reviewable}
                document={document}
                jobId={job.id}
                onSaved={onObservationSaved}
                pages={pages}
                sourceObservationVersion={job.sourceObservationVersion}
                storedManifest={job.sourceObservationManifestJson}
              />
            </div>
            <ConstructionEvidenceEditor
              evidenceText={constructionEvidenceText}
              onEvidenceTextChange={setConstructionEvidenceText}
              onVerificationTierChange={setVerificationTier}
              verificationTier={verificationTier}
            />
            <PublicDisplayMetadataEditor
              disabled={Boolean(pending) || hasUnsavedChanges || !reviewable}
              onChange={setPublicDisplayMetadata}
              value={publicDisplayMetadata}
            />
          </details>

          <details className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-blue-950">
              Replace a currently published revision
            </summary>
            <p className="mt-2 text-xs leading-5 text-blue-900">
              Use this for a corrected source or address mapping. The server
              retires the old revision only when a different authorized publisher
              releases this approved replacement. The publication transaction
              retires the old revision and publishes the new one together, so
              address search never sees a gap or two active matches.
            </p>
            <label className="mt-3 block text-xs font-medium text-blue-950">
              Published revision ID to replace (optional)
              <input
                className="mt-1 w-full rounded border border-blue-200 bg-white p-2 font-mono text-xs"
                onChange={(event) => {
                  setSupersedesRevisionId(event.target.value);
                  setSupersedeConfirmed(false);
                }}
                placeholder="FloorPlanDocumentV2 revision ID"
                value={supersedesRevisionId}
              />
            </label>
            {supersedesRevisionId.trim() ? (
              <>
                <label className="mt-3 block text-xs font-medium text-blue-950">
                  Replacement reason
                  <textarea
                    className="mt-1 min-h-20 w-full rounded border border-blue-200 bg-white p-2 text-sm"
                    onChange={(event) => setSupersedeReason(event.target.value)}
                    placeholder="Describe the corrected geometry or address evidence."
                    value={supersedeReason}
                  />
                </label>
                <label className="mt-3 flex items-start gap-2 text-xs text-blue-950">
                  <input
                    checked={supersedeConfirmed}
                    className="mt-0.5"
                    onChange={(event) => setSupersedeConfirmed(event.target.checked)}
                    type="checkbox"
                  />
                  I confirm this replacement covers every active address selector
                  and is ready for independent publication review.
                </label>
              </>
            ) : null}
          </details>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              disabled={approvalDisabled}
              onClick={approve}
              type="button"
            >
              {pending === "approve"
                ? "Checking floor plan…"
                : supersedesRevisionId.trim()
                  ? "Approve replacement floor plan"
                  : "Approve searchable floor plan"}
            </button>
            {job.status !== "ready" ? (
              <span className="text-xs text-amber-700">
                Finish the required 2D plan checks first.
              </span>
            ) : !job.sourceObservationManifestJson ? (
              <span className="text-xs text-amber-700">
                Complete the publishing details before public release.
              </span>
            ) : hasUnsavedChanges ? (
              <span className="text-xs text-amber-700">
                Save review changes before approval.
              </span>
            ) : !publicDisplayMetadataReady ? (
              <span className="text-xs text-amber-700">
                Complete the public project, label, flat type, preview and
                publisher fields. Optional source fields must be supplied together.
              </span>
            ) : null}
          </div>
        </details>
      ) : (
        <ApprovedRevisionPanel
          job={job}
          pending={pending}
          publish={publish}
          publishConfirmed={publishConfirmed}
          retire={retire}
          retireConfirmation={retireConfirmation}
          retireReason={retireReason}
          setPublishConfirmed={setPublishConfirmed}
          setRetireConfirmation={setRetireConfirmation}
          setRetireReason={setRetireReason}
        />
      )}
    </section>
  );
}
