export type DesignPageToastsProps = {
  ruleMessage: string | null;
  nudgeMessage: string | null;
  shareCopied: boolean;
  shareErrorMessage: string | null;
};

const ASSERTIVE_RULE_MESSAGE =
  /\b(?:failed|failure|invalid|error|blocked|unavailable)\b|\bcould not\b|\bcannot\b|\bcan't\b|^enter a valid\b|^choose a valid\b|^keep at least\b|^try again\b/i;

function isAssertiveRuleMessage(message: string | null) {
  return Boolean(message && ASSERTIVE_RULE_MESSAGE.test(message));
}

export function DesignPageToasts({
  ruleMessage,
  nudgeMessage,
  shareCopied,
  shareErrorMessage,
}: DesignPageToastsProps) {
  const assertiveRuleMessage = isAssertiveRuleMessage(ruleMessage)
    ? ruleMessage
    : null;
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
          data-testid="collision-toast"
          aria-hidden="true"
          className="pointer-events-none fixed top-16 left-1/2 z-50 -translate-x-1/2 animate-fade-in"
        >
          <div className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            ⚠️ {ruleMessage}
          </div>
        </div>
      )}

      {/* Onboarding/Nudge Toast */}
      {nudgeMessage && (
        <div data-testid="sofa-nudge" className="fixed top-28 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div className="rounded-lg bg-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            💡 {nudgeMessage}
          </div>
        </div>
      )}

      {/* Share Success Toast */}
      {shareCopied && (
        <div className="fixed top-6 right-6 z-50 animate-fade-in">
          <div className="rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            ✅ Share link copied to clipboard!
          </div>
        </div>
      )}

      {/* Share Error Toast */}
      {shareErrorMessage && (
        <div className="fixed top-6 right-6 z-50 animate-fade-in">
          <div className="rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            ❌ {shareErrorMessage}
          </div>
        </div>
      )}
    </>
  );
}
