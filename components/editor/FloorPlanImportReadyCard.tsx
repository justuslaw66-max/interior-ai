import { useMemo } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { inspectFloorPlanOptionalConfigurations } from "@/lib/floor-plan-optional-configurations";
import type { ReviewHomeTypeId } from "@/lib/floor-plan-imports/review-home-type";
import { Button } from "@/components/ui/Button";
import type { ConsumerFloorPlanImportJob } from "./floor-plan-import-ui-types";
import FloorPlanVisualReviewTools from "./floor-plan-import-review/FloorPlanVisualReviewTools";
import ReadyCardHomeType, { useReadyCardHomeType } from "./FloorPlanReadyCardHomeType";
import FloorPlanOptionalConfigurationPanel from "./FloorPlanOptionalConfigurationPanel";
import { FloorPlanImportRetentionNotice } from "./FloorPlanImportRetentionNotice";

/** Where the uploaded file stands: queued for deletion, deleted, or kept until a date. */
function uploadRetentionNote(input: {
  sourceDeletionPending: boolean;
  sourceContentDeleted: boolean;
  savedUnderlaysScrubbed: number;
  retentionDate: Date | null;
}) {
  if (input.sourceDeletionPending) return "Your uploaded file is queued for deletion.";
  if (input.sourceContentDeleted) {
    return input.savedUnderlaysScrubbed > 0
      ? "Your upload and its floor plan image in your designs were deleted."
      : "The private upload was deleted.";
  }
  return input.retentionDate && !Number.isNaN(input.retentionDate.getTime())
    ? `Your uploaded file will be deleted by ${input.retentionDate.toLocaleDateString()}.`
    : "Your uploaded file is kept for a limited time.";
}

type FloorPlanImportReadyCardProps = {
  activeJob: ConsumerFloorPlanImportJob;
  candidate: FloorPlanDocumentV2 | null;
  floor: FloorPlanDocumentV2["floors"][number] | null;
  setCandidate: (next: FloorPlanDocumentV2) => void;
  canonicalRoomCount: number;
  canonicalDimensionCount: number;
  disabled: boolean;
  submitting: boolean;
  deletingSource: boolean;
  createDesign: (homeType?: ReviewHomeTypeId | null) => Promise<void>;
  createError: string | null;
  title: string;
  setTitle: (next: string) => void;
  subtle: string;
  surface: string;
  control: string;
  sourceDeletionPending: boolean;
  sourceContentDeleted: boolean;
  savedUnderlaysScrubbed: number;
  retentionDate: Date | null;
  deletePrivateSource: () => Promise<void>;
  onChooseFile?: () => void;
  deleteError: string | null;
};

type ReadyCounts = { canonicalRoomCount: number; canonicalDimensionCount: number; subtle: string };

/** What the AI check found, and what Create design makes. */
function ReadyCardSummary({ canonicalRoomCount, canonicalDimensionCount, subtle }: ReadyCounts) {
  return (
    <>
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-on-success-tint">
        AI check complete
      </div>
      <h3 className="mt-1 text-2xl font-semibold">Your floor plan is ready</h3>
      <p className={`mt-2 max-w-3xl text-sm leading-6 ${subtle}`}>
        This candidate contains {canonicalRoomCount} room
        {canonicalRoomCount === 1 ? "" : "s"} and{" "}
        {canonicalDimensionCount} recorded measurement
        {canonicalDimensionCount === 1 ? "" : "s"}. Check the drawing and scale. Confirming records your review for planning and creates a separate editable design without furniture.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-surface-floating px-3 py-1.5 font-semibold text-on-success-tint">
          Editable 2D
        </span>
        <span className="rounded-full bg-surface-floating px-3 py-1.5 font-semibold text-on-success-tint">
          Editable 3D
        </span>
        <span className="rounded-full bg-surface-floating px-3 py-1.5 font-semibold text-on-success-tint">
          Zero furniture
        </span>
        <span className="rounded-full bg-surface-floating px-3 py-1.5 font-semibold text-on-success-tint">
          Current design unchanged
        </span>
      </div>
    </>
  );
}

type ReadyCreateProps = Pick<FloorPlanImportReadyCardProps,
  "disabled" | "submitting" | "deletingSource" | "createDesign" | "createError" | "subtle"> & { homeType: ReviewHomeTypeId | null };

/** Create design (with the home type chosen on the card, if one was), and why it paused if it did. */
function ReadyCardCreate({ disabled, submitting, deletingSource, createDesign, createError, subtle, homeType }: ReadyCreateProps) {
  return (
    <>
      <Button
        data-floor-plan-workspace-focus="primary"
        variant="primary" size="touch" className="mt-4 w-full"
        disabled={disabled || submitting || deletingSource}
        onClick={() => void createDesign(homeType)}
      >
        {submitting
          ? "Creating and opening…"
          : createError
            ? "Try creating again"
            : "Create design"}
      </Button>
      <p className={`mt-2 text-center text-xs leading-5 ${subtle}`}>
        Opens in Plan, in 2D, so you can check it before you furnish. Your planning review does not grant source verification or construction approval.
      </p>
      {createError ? (
        <p className="mt-2 text-xs leading-4 text-on-danger-tint">
          Creation paused: {createError}
        </p>
      ) : null}
    </>
  );
}

type ReadyUploadProps = Pick<FloorPlanImportReadyCardProps,
  "disabled" | "submitting" | "deletingSource" | "subtle" | "sourceDeletionPending" | "sourceContentDeleted" |
  "savedUnderlaysScrubbed" | "retentionDate" | "deletePrivateSource" | "onChooseFile" | "deleteError">;

/** Where the upload stands, and deleting it or choosing another file. */
function ReadyCardUpload({
  disabled, submitting, deletingSource, subtle, sourceDeletionPending, sourceContentDeleted, savedUnderlaysScrubbed,
  retentionDate, deletePrivateSource, onChooseFile, deleteError,
}: ReadyUploadProps) {
  return (
    <>
      <p className={`mt-2 text-xs leading-5 ${subtle}`}>
        {uploadRetentionNote({ sourceDeletionPending, sourceContentDeleted, savedUnderlaysScrubbed, retentionDate })}
      </p>
      <FloorPlanImportRetentionNotice sourceDeletionPending={sourceDeletionPending} sourceContentDeleted={sourceContentDeleted}
        savedUnderlaysScrubbed={savedUnderlaysScrubbed} retentionDate={retentionDate} subtle={subtle} />
      {!sourceContentDeleted && !sourceDeletionPending ? (
        <Button
          variant="secondary" size="compact" className="mt-2"
          disabled={disabled || deletingSource || submitting}
          onClick={() => void deletePrivateSource()}
        >
          {deletingSource ? "Deleting upload…" : "Delete private upload"}
        </Button>
      ) : null}
      {onChooseFile ? (
        <Button
          variant="secondary" size="compact" className="ml-2 mt-2"
          disabled={disabled || submitting || deletingSource}
          onClick={onChooseFile}
        >
          Use a different file
        </Button>
      ) : null}
      {deleteError ? (
        <p className="mt-2 text-xs text-on-danger-tint">{deleteError}</p>
      ) : null}
    </>
  );
}

/** Rename, plan options & privacy: the design's name, the plan's optional settings, and the upload. */
function ReadyCardOptions(props: FloorPlanImportReadyCardProps) {
  const { candidate, title, setTitle, subtle, control, disabled, submitting, deletingSource } = props;
  const optionalConfigurationCount = useMemo(
    () => candidate ? inspectFloorPlanOptionalConfigurations(candidate).length : 0,
    [candidate]
  );
  return (
    <details data-surface="floating" className="mt-4 rounded-xl border border-separator bg-surface-elevated-secondary p-3">
      <summary className="cursor-pointer text-xs font-semibold">
        Rename, plan options & privacy
      </summary>
      <label className={`mt-3 block text-xs ${subtle}`}>
        Design name
        <input
          className={`${control} mt-1 w-full`}
          value={title}
          maxLength={160}
          aria-label="New design name"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      {candidate && optionalConfigurationCount > 0 ? (
        <FloorPlanOptionalConfigurationPanel
          document={candidate}
          disabled={disabled || submitting || deletingSource}
          compact
        />
      ) : null}
      <p
        className={`mt-3 text-xs leading-5 ${subtle}`}
        data-testid="floor-plan-import-accuracy-baseline"
      >
        Checks passed: {props.canonicalRoomCount} room
        {props.canonicalRoomCount === 1 ? "" : "s"} and{" "}
        {props.canonicalDimensionCount} recorded dimension
        {props.canonicalDimensionCount === 1 ? "" : "s"}. The scale and all required checks passed; whole-plan accuracy still depends on the source and your review.
      </p>
      <ReadyCardUpload {...props} />
    </details>
  );
}

/** An upload the AI check passed: what it found, the traced drawing, its home type, Create design, and the plan's options. */
export default function FloorPlanImportReadyCard(props: FloorPlanImportReadyCardProps) {
  const { activeJob, candidate, floor, setCandidate, surface } = props;
  const heights = useReadyCardHomeType(candidate, floor);
  return (
    <div className={surface} data-testid="floor-plan-import-ready" data-floor-plan-workspace-state="ready">
      <ReadyCardSummary {...props} />
      {candidate && floor ? (
        <FloorPlanVisualReviewTools
          document={candidate}
          job={activeJob}
          focusedIssueEntityIds={[]}
          onChange={(next) => setCandidate(next)}
          previewOnly
          disabled
        />
      ) : null}
      <ReadyCardHomeType floor={floor} heights={heights} disabled={props.disabled || props.submitting || props.deletingSource} />
      <ReadyCardCreate {...props} homeType={heights.chosen} />
      <ReadyCardOptions {...props} />
    </div>
  );
}
