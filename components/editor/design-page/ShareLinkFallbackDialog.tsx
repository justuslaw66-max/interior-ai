import { EditorDialog } from "@/components/editor/design-system/EditorDialog";
import {
  SHARE_LINK_FALLBACK_CLOSE_ACTION_ID,
  SHARE_LINK_FALLBACK_COPY_ACTION_ID,
  SHARE_LINK_FALLBACK_OPEN_ACTION_ID,
  SHARE_LINK_FALLBACK_RETURN_FOCUS_IDS,
} from "@/lib/share-link-fallback-dialog-focus";

export type ShareLinkFallbackDialogProps = {
  url: string | null;
  dark: boolean;
  onClose: () => void;
  onCopy: (url: string) => void;
  onOpen: (url: string) => void;
};

function ShareLinkFallbackControls({
  url, dark, onClose, onCopy, onOpen,
}: Omit<ShareLinkFallbackDialogProps, "url"> & { url: string }) {
  const inputClassName = dark
    ? "designer-control min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm text-neutral-200 font-mono outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    : "min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
  const doneClassName = dark
    ? "designer-control min-h-11 rounded-lg border px-4 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    : "min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 outline-none hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
  return <>
    <div className="mb-4 flex min-w-0 gap-2">
      <input type="text" readOnly aria-label="Share URL" data-testid="share-url-input"
        value={url} className={inputClassName} />
      <button id={SHARE_LINK_FALLBACK_COPY_ACTION_ID} data-testid="share-copy-button"
        onClick={() => onCopy(url)}
        className="shrink-0 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white outline-none hover:bg-purple-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
        Copy
      </button>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <button id={SHARE_LINK_FALLBACK_OPEN_ACTION_ID} data-testid="share-open-button"
        onClick={() => onOpen(url)}
        className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white outline-none hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
        Open Link
      </button>
      <button data-testid="share-done-button" onClick={onClose} className={doneClassName}>
        Done
      </button>
    </div>
  </>;
}

export function ShareLinkFallbackDialog({ url, dark, onClose, onCopy, onOpen }: ShareLinkFallbackDialogProps) {
  return (
    <EditorDialog
      open={Boolean(url)}
      title="Share Link"
      description="Copy this link to share your design:"
      onClose={onClose}
      closeLabel="Close Share Link"
      closeButtonId={SHARE_LINK_FALLBACK_CLOSE_ACTION_ID}
      closeButtonTestId="share-fallback-close"
      testId="share-fallback-modal"
      returnFocusIds={SHARE_LINK_FALLBACK_RETURN_FOCUS_IDS}
      cancelFocusRestorationOnUnmount
      manageBackground
      dark={dark}
      forceLight={!dark}
      panelClassName={`${dark ? "designer-panel " : ""}!max-w-md max-h-[calc(100dvh-2rem)] !rounded-xl !p-6 overflow-y-auto`}
      contentClassName="min-w-0"
    >
      {url ? <ShareLinkFallbackControls {...{ url, dark, onClose, onCopy, onOpen }} /> : null}
    </EditorDialog>
  );
}
