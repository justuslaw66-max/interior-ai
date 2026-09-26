"use client";

import { EditorDialog, EditorDialogButton } from "@/components/editor/design-system/EditorDialog";

export type ShareDesignDialogProps = {
  open: boolean;
  designTitle: string;
  /** Null while the link is being made, or when making it failed. */
  url: string | null;
  errorMessage: string | null;
  copied: boolean;
  returnFocusIds: readonly string[];
  onCopy: () => void;
  onClose: () => void;
};

/**
 * Share from My designs, as in the Share mockup: the link, Copy link (a click of its own, so the
 * clipboard accepts it), "Preview what they see" and Done.
 */
export function ShareDesignDialog(props: ShareDesignDialogProps) {
  const { url, copied, errorMessage } = props;
  return (
    <EditorDialog
      open={props.open}
      title="Share this design"
      description={`Anyone with the link can view ${props.designTitle}. They can't change it.`}
      onClose={props.onClose}
      closeLabel="Close Share"
      testId="my-design-share-dialog"
      returnFocusIds={props.returnFocusIds}
      manageBackground
      forceLight
      panelClassName="max-w-[480px]"
    >
      {url ? (
        <div className="flex min-w-0 gap-2">
          <input type="text" readOnly aria-label="Link to this design" value={url} data-testid="my-design-share-url"
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 text-sm text-neutral-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-600" />
          <EditorDialogButton variant="primary" data-testid="my-design-share-copy" onClick={props.onCopy}>
            Copy link
          </EditorDialogButton>
        </div>
      ) : (
        <p data-testid="my-design-share-pending" className="text-sm text-neutral-600">
          {errorMessage ?? "Making the link…"}
        </p>
      )}
      <p role="status" aria-live="polite" data-testid="my-design-share-status" className="mt-2 min-h-5 text-sm text-neutral-700">
        {url && errorMessage ? errorMessage : copied ? "Link copied." : ""}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" data-testid="my-design-share-preview"
            className="flex min-h-11 items-center rounded-md text-sm font-bold text-blue-800 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-blue-600">
            Preview what they see
          </a>
        ) : <span />}
        <EditorDialogButton data-testid="my-design-share-done" onClick={props.onClose}>Done</EditorDialogButton>
      </div>
    </EditorDialog>
  );
}
