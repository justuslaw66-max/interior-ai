"use client";

import {
  EditorDialog,
  EditorDialogActions,
  EditorDialogButton,
} from "@/components/editor/design-system/EditorDialog";
import {
  RETAILER_CONFIRMATION_CANCEL_ACTION_ID,
  RETAILER_CONFIRMATION_CLOSE_ACTION_ID,
  RETAILER_CONFIRMATION_CONTINUE_ACTION_ID,
  RETAILER_CONFIRMATION_DIALOG_ID,
  RETAILER_CONFIRMATION_SAME_TAB_ACTION_ID,
  getRetailerConfirmationReturnFocusIds,
  type RetailerConfirmationSession,
} from "@/lib/retailer-confirmation";

export type RetailerConfirmationDialogProps = {
  session: RetailerConfirmationSession | null;
  busy: boolean;
  isDesignerTheme: boolean;
  onCancel: (session: RetailerConfirmationSession) => void;
  onContinue: (session: RetailerConfirmationSession) => void;
  onToggleSameTab: (session: RetailerConfirmationSession) => void;
};

function RetailerConfirmationLineList({
  session,
  isDesignerTheme,
}: Pick<RetailerConfirmationDialogProps, "session" | "isDesignerTheme">) {
  if (!session) return null;
  return (
    <div className={`max-h-48 overflow-auto rounded-xl border ${
      isDesignerTheme ? "border-white/10" : "border-neutral-200"
    }`}>
      <ul className={isDesignerTheme ? "divide-y divide-white/10 text-sm" : "divide-y text-sm"}>
        {session.lines.filter((line) => line.buyUrl).map((line) => (
          <li key={line.instanceId} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">{line.name}</div>
                <div className={isDesignerTheme ? "text-xs text-neutral-300" : "text-xs text-neutral-500"}>
                  {line.retailer} • {line.isBundleLine ? `set of ${line.qty}` : `qty ${line.qty}`}
                </div>
              </div>
              <div className={isDesignerTheme ? "text-xs text-neutral-300" : "text-xs text-neutral-500"}>
                {line.linkOpenCount} tab{line.linkOpenCount === 1 ? "" : "s"}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RetailerSameTabPreference({
  session,
  isDesignerTheme,
  onToggleSameTab,
}: Pick<
  RetailerConfirmationDialogProps,
  "session" | "isDesignerTheme" | "onToggleSameTab"
>) {
  if (!session) return null;
  return (
    <div className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
      isDesignerTheme ? "border-white/10 bg-black/10" : "border-neutral-200 bg-neutral-50"
    }`}>
      <div>
        <div className="text-sm font-semibold">Open in same tab</div>
        <div className={isDesignerTheme ? "text-xs text-neutral-300" : "text-xs text-neutral-500"}>
          Safer for popup blockers. Opens the first link and leaves this page.
        </div>
      </div>
      <button
        id={RETAILER_CONFIRMATION_SAME_TAB_ACTION_ID}
        data-testid="retailer-confirmation-same-tab"
        className={`min-h-11 shrink-0 rounded-lg px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
          session.openInSameTab ? "bg-neutral-900 text-white" : "border bg-white text-neutral-900"
        }`}
        aria-pressed={session.openInSameTab}
        onClick={() => onToggleSameTab(session)}
        type="button"
      >
        {session.openInSameTab ? "On" : "Off"}
      </button>
    </div>
  );
}

function RetailerConfirmationFooter({
  session,
  busy,
  onCancel,
  onContinue,
}: Pick<
  RetailerConfirmationDialogProps,
  "session" | "busy" | "onCancel" | "onContinue"
>) {
  if (!session) return null;
  return (
    <EditorDialogActions>
      <EditorDialogButton
        id={RETAILER_CONFIRMATION_CANCEL_ACTION_ID}
        data-testid="retailer-confirmation-cancel"
        className="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        disabled={busy}
        onClick={() => onCancel(session)}
      >
        Cancel
      </EditorDialogButton>
      <EditorDialogButton
        id={RETAILER_CONFIRMATION_CONTINUE_ACTION_ID}
        data-testid="retailer-confirmation-continue"
        className="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        variant="primary"
        disabled={busy}
        onClick={() => onContinue(session)}
      >
        Continue
      </EditorDialogButton>
    </EditorDialogActions>
  );
}

export function RetailerConfirmationDialog({
  session,
  busy,
  isDesignerTheme,
  onCancel,
  onContinue,
  onToggleSameTab,
}: RetailerConfirmationDialogProps) {
  return (
    <EditorDialog
      open={session !== null}
      title={session?.title ?? "Open retailer links"}
      description={session?.openInSameTab ? (
        <>This will open the first link in the <span className="font-semibold">same tab</span>.</>
      ) : (
        <>This will open <span className="font-semibold">{session?.tabCount ?? 0}</span>{" "}
          tab{session?.tabCount === 1 ? "" : "s"} to retailer pages.</>
      )}
      onClose={() => { if (session) onCancel(session); }}
      closeLabel="Close retailer confirmation"
      closeButtonId={RETAILER_CONFIRMATION_CLOSE_ACTION_ID}
      closeButtonTestId="retailer-confirmation-close" closeButtonClassName="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      testId="retailer-confirmation-dialog"
      dialogId={RETAILER_CONFIRMATION_DIALOG_ID}
      returnFocusIds={session ? getRetailerConfirmationReturnFocusIds(session.opener) : undefined}
      cancelFocusRestorationOnUnmount
      manageBackground
      dark={isDesignerTheme} forceLight={!isDesignerTheme}
      panelClassName="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      footer={
        <RetailerConfirmationFooter
          session={session}
          busy={busy}
          onCancel={onCancel}
          onContinue={onContinue}
        />
      }
    >
      <RetailerConfirmationLineList
        session={session}
        isDesignerTheme={isDesignerTheme}
      />
      <RetailerSameTabPreference
        session={session}
        isDesignerTheme={isDesignerTheme}
        onToggleSameTab={onToggleSameTab}
      />
      <div className={isDesignerTheme ? "mt-2 text-[11px] text-neutral-300" : "mt-2 text-[11px] text-neutral-500"}>
        Tip: reduce quantity to open fewer tabs.
      </div>
      {session ? (
        <span
          aria-hidden="true"
          data-retailer-confirmation-generation={session.generation}
          data-retailer-confirmation-scope={session.scopeKey}
        />
      ) : null}
    </EditorDialog>
  );
}
