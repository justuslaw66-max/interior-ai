export type DesignPageToastsProps = {
  ruleMessage: string | null;
  nudgeMessage: string | null;
  shareCopied: boolean;
  shareErrorMessage: string | null;
};

export function DesignPageToasts({
  ruleMessage,
  nudgeMessage,
  shareCopied,
  shareErrorMessage,
}: DesignPageToastsProps) {
  return (
    <>
      {/* Collision/Rule Toast */}
      {ruleMessage && (
        <div data-testid="collision-toast" className="pointer-events-none fixed top-16 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
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
