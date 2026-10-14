import { useCallback, useEffect, useRef } from "react";
import { EditorDialog } from "@/components/editor/design-system/EditorDialog";
import {
  SHARE_LINK_FALLBACK_CLOSE_ACTION_ID,
  SHARE_LINK_FALLBACK_COPY_ACTION_ID,
  SHARE_LINK_FALLBACK_OPEN_ACTION_ID,
  SHARE_LINK_FALLBACK_RETURN_FOCUS_IDS,
} from "@/lib/share-link-fallback-dialog-focus";
import { Button } from "@/components/ui/Button";

export type ShareLinkFallbackDialogProps = {
  url: string | null;
  copied: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onCopy: (url: string, signal: AbortSignal) => void;
  onOpen: (url: string) => void;
};

function ShareLinkFallbackControls({
  url, onClose, onCopy, onOpen,
}: Omit<ShareLinkFallbackDialogProps, "url" | "copied" | "errorMessage" | "onCopy"> & {
  url: string; onCopy: (url: string) => void;
}) {
  const inputClassName = "min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-700 outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
  return <>
    <div className="mb-4 flex min-w-0 gap-2">
      <input type="text" readOnly aria-label="Share URL" data-testid="share-url-input"
        value={url} className={inputClassName} />
      <Button
        id={SHARE_LINK_FALLBACK_COPY_ACTION_ID}
        data-testid="share-copy-button"
        onClick={() => onCopy(url)}
        variant="primary" size="regular" className="shrink-0"
      >
        Copy
      </Button>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Button
        id={SHARE_LINK_FALLBACK_OPEN_ACTION_ID}
        data-testid="share-open-button"
        onClick={() => onOpen(url)}
        variant="primary" size="touch"
      >
        Open link
      </Button>
      <Button data-testid="share-done-button" onClick={onClose} variant="secondary" size="touch">
        Done
      </Button>
    </div>
  </>;
}

function useFallbackCopyLifecycle({ url, onCopy, onClose, onOpen }: ShareLinkFallbackDialogProps) {
  const current = useRef<AbortController | null>(null);
  const cancel = useCallback(() => { current.current?.abort(); current.current = null; }, []);
  useEffect(() => cancel, [cancel, url]);
  return {
    onCopy: (link: string) => {
      cancel();
      const operation = new AbortController();
      current.current = operation;
      onCopy(link, operation.signal);
    },
    onClose: () => { cancel(); onClose(); },
    onOpen: (link: string) => { cancel(); onOpen(link); },
  };
}

export function ShareLinkFallbackDialog(props: ShareLinkFallbackDialogProps) {
  const { url, copied, errorMessage } = props;
  const { onClose, onCopy, onOpen } = useFallbackCopyLifecycle(props);
  return (
    <EditorDialog
      open={Boolean(url)}
      title="Share link"
      description="Copy this link to share your design:"
      onClose={onClose}
      closeLabel="Close Share link"
      closeButtonId={SHARE_LINK_FALLBACK_CLOSE_ACTION_ID}
      closeButtonTestId="share-fallback-close"
      testId="share-fallback-modal"
      returnFocusIds={SHARE_LINK_FALLBACK_RETURN_FOCUS_IDS}
      cancelFocusRestorationOnUnmount
      manageBackground
      panelClassName="!max-w-md max-h-[calc(100dvh-2rem)] !rounded-xl !p-6 overflow-y-auto"
      contentClassName="min-w-0"
    >
      {url ? <ShareLinkFallbackControls {...{ url, onClose, onCopy, onOpen }} /> : null}
      <p data-testid="share-copy-status" role="status" aria-live="polite" aria-atomic="true"
        className="mt-3 text-sm">
        {errorMessage ?? (copied ? "Share link copied to clipboard!" : "")}
      </p>
    </EditorDialog>
  );
}
