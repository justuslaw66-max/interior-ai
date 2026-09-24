"use client";

import {
  EditorDialog,
  EditorDialogButton,
} from "@/components/editor/design-system/EditorDialog";
import { EDITOR_DOWNLOAD_RETURN_FOCUS_IDS } from "@/lib/editor-download-focus";

export type DownloadDialogProps = {
  open: boolean;
  dark: boolean;
  signedIn: boolean;
  /** Free downloads are one view with a watermark; Pro removes both limits. */
  freeLimits: boolean;
  sceneReady: boolean;
  hasItems: boolean;
  exportingImages: boolean;
  exportingPdf: boolean;
  onClose: () => void;
  onDownloadImages: () => Promise<void>;
  onDownloadPdf: () => Promise<void>;
  onSignIn: () => void;
  onSeePricing: () => void;
};

/**
 * Download (audit findings SX2 and PR6): pictures of the 3D view, or a PDF with them and the
 * shopping list. Free limits are stated here, instead of in an upgrade pop-up after the download.
 */
export function DownloadDialog(props: DownloadDialogProps) {
  const { open, dark, onClose } = props;
  return (
    <EditorDialog
      open={open}
      title="Download"
      description="Pictures of the 3D view, or a PDF with the pictures and your shopping list."
      onClose={onClose}
      closeLabel="Close Download"
      closeButtonTestId="download-dialog-close"
      testId="download-dialog"
      returnFocusIds={EDITOR_DOWNLOAD_RETURN_FOCUS_IDS}
      cancelFocusRestorationOnUnmount
      manageBackground
      dark={dark}
      forceLight={!dark}
      panelClassName={`${dark ? "designer-panel " : ""}max-h-[calc(100dvh-2rem)] overflow-y-auto`}
      contentClassName="space-y-3"
    >
      <DownloadChoices {...props} />
      {props.freeLimits ? <FreeLimitsNote {...props} /> : null}
    </EditorDialog>
  );
}

/**
 * The dialog stays open, with focus on the chosen button, until the file is ready. The export
 * briefly hides the editor's chrome to capture the scene; because focus never left the dialog,
 * closing it afterwards returns focus to Download.
 */
function DownloadChoices({
  dark, signedIn, sceneReady, hasItems, exportingImages, exportingPdf,
  onClose, onDownloadImages, onDownloadPdf, onSignIn,
}: DownloadDialogProps) {
  const busy = exportingImages || exportingPdf;
  // While one file is on its way, both buttons wait for it.
  const waitClass = "aria-disabled:cursor-wait aria-disabled:opacity-60";
  const secondaryClass = `${dark ? "designer-control " : ""}${waitClass}`;
  const start = (download: () => Promise<void>) => async () => {
    if (busy) return;
    await download();
    onClose();
  };
  return (
    <div className="grid gap-2">
      <EditorDialogButton
        data-testid="download-images" variant="primary" aria-disabled={busy}
        className={`${dark ? "designer-primary-action " : ""}${waitClass}`}
        disabled={!sceneReady} onClick={start(onDownloadImages)}
      >
        {exportingImages ? "Preparing pictures…" : "Pictures (PNG)"}
      </EditorDialogButton>
      {signedIn ? (
        <EditorDialogButton
          data-testid="download-pdf" aria-disabled={busy} className={secondaryClass}
          disabled={!sceneReady || !hasItems} onClick={start(onDownloadPdf)}
        >
          {exportingPdf ? "Preparing PDF…" : "PDF with shopping list"}
        </EditorDialogButton>
      ) : (
        <EditorDialogButton data-testid="download-pdf-sign-in" className={secondaryClass} onClick={onSignIn}>
          Sign in to download a PDF
        </EditorDialogButton>
      )}
      {signedIn && !hasItems ? (
        <p data-testid="download-pdf-needs-items" className="text-xs opacity-80">
          Add products first: the PDF lists what you&apos;ve placed.
        </p>
      ) : null}
    </div>
  );
}

function FreeLimitsNote({ dark, onClose, onSeePricing }: DownloadDialogProps) {
  return (
    <div
      data-testid="download-free-note"
      className={
        dark
          ? "designer-recessed flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs"
          : "flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600"
      }
    >
      <span>Free downloads are one view with a small watermark. Pro gives clean files and more views.</span>
      <button
        type="button"
        data-testid="download-see-pricing"
        className="min-h-11 shrink-0 font-semibold underline underline-offset-2"
        onClick={() => {
          onClose();
          onSeePricing();
        }}
      >
        See pricing
      </button>
    </div>
  );
}
