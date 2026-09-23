import {
  EDITOR_FEEDBACK_TONE_CLASS,
  editorFeedbackTone,
} from "@/lib/editor-feedback-tone";

export type DesignPageToastsProps = {
  ruleMessage: string | null;
  nudgeMessage: string | null;
  shareCopied: boolean;
  shareErrorMessage: string | null;
};

const TOAST = "rounded-lg px-4 py-3 text-sm font-semibold shadow-lg";

export function DesignPageToasts({
  ruleMessage,
  nudgeMessage,
  shareCopied,
  shareErrorMessage,
}: DesignPageToastsProps) {
  const ruleTone = ruleMessage ? editorFeedbackTone(ruleMessage) : "notice";
  const assertiveRuleMessage = ruleTone === "error" ? ruleMessage : null;
  const politeRuleMessage =
    ruleMessage && !assertiveRuleMessage ? ruleMessage : null;

  return (
    <>
      {/*
        Keep both regions mounted before feedback occurs. Safari VoiceOver can
        miss a live region that mounts with its initial text already present.
      */}
      <div
        data-testid="rule-announcement-alert"
        className="sr-only"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        {assertiveRuleMessage ?? ""}
      </div>
      <div
        data-testid="rule-announcement-status"
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {politeRuleMessage ?? ""}
      </div>

      {/* Collision/Rule Toast */}
      {ruleMessage && (
        <div
          data-testid="collision-toast" data-tone={ruleTone}
          aria-hidden="true"
          className="pointer-events-none fixed top-11 left-1/2 z-50 -translate-x-1/2 animate-fade-in"
        >
          <div className={`${TOAST} ${EDITOR_FEEDBACK_TONE_CLASS[ruleTone]}`}>
            {ruleMessage}
          </div>
        </div>
      )}

      {/* Onboarding/Nudge Toast */}
      {nudgeMessage && (
        <div data-testid="sofa-nudge" className="fixed top-23 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div className={`${TOAST} ${EDITOR_FEEDBACK_TONE_CLASS.tip}`}>
            {nudgeMessage}
          </div>
        </div>
      )}

      {/* Share Success Toast */}
      {shareCopied && (
        <div className="fixed top-6 right-6 z-50 animate-fade-in">
          <div className={`${TOAST} ${EDITOR_FEEDBACK_TONE_CLASS.success}`}>
            Share link copied to clipboard!
          </div>
        </div>
      )}

      {/* Share Error Toast */}
      {shareErrorMessage && (
        <div className="fixed top-6 right-6 z-50 animate-fade-in">
          <div className={`${TOAST} ${EDITOR_FEEDBACK_TONE_CLASS.error}`}>
            {shareErrorMessage}
          </div>
        </div>
      )}
    </>
  );
}
