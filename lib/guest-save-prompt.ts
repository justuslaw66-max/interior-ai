import { CLIENT_PREVIEW_FALLBACK_ACTION_ID } from "@/lib/useClientPreviewCommandBarFocus";

export type GuestPromptReason = "save" | "ai-layout" | "checkout";

export type GuestPromptSession = {
  reason: GuestPromptReason;
  generation: number;
  scopeKey: string;
  continuation: () => void;
  consumed: boolean;
};

export type GuestPromptSessionIdentity = Pick<
  GuestPromptSession,
  "reason" | "generation" | "scopeKey"
>;

export const GUEST_SAVE_OPENER_ID = "guest-save-action";
export const GUEST_AI_LAYOUT_OPENER_ID = "guest-ai-layout-action";
export const GUEST_CHECKOUT_OPENER_ID = "guest-checkout-action";
export const GUEST_PROMPT_WORKFLOW_FALLBACK_ID =
  "editor-command-workspace-action";
export const GUEST_PROMPT_DIALOG_ID = "editor-guest-save-prompt";
export const GUEST_PROMPT_CLOSE_ACTION_ID = "guest-save-prompt-close-action";
export const GUEST_PROMPT_CONTINUE_ACTION_ID =
  "guest-save-prompt-continue-action";
export const GUEST_PROMPT_PRIMARY_ACTION_ID =
  "guest-save-prompt-primary-action";

const RETURN_FOCUS_IDS: Record<GuestPromptReason, readonly string[]> = {
  save: [GUEST_SAVE_OPENER_ID, CLIENT_PREVIEW_FALLBACK_ACTION_ID],
  "ai-layout": [
    GUEST_AI_LAYOUT_OPENER_ID,
    GUEST_PROMPT_WORKFLOW_FALLBACK_ID,
  ],
  checkout: [
    GUEST_CHECKOUT_OPENER_ID,
    GUEST_PROMPT_WORKFLOW_FALLBACK_ID,
  ],
};

export function getGuestPromptReturnFocusIds(reason: GuestPromptReason) {
  return RETURN_FOCUS_IDS[reason];
}

export function createGuestPromptSession(
  reason: GuestPromptReason,
  generation: number,
  scopeKey: string,
  continuation: () => void
): GuestPromptSession {
  return { reason, generation, scopeKey, continuation, consumed: false };
}

export function consumeGuestPromptSession(
  session: GuestPromptSession | null,
  expected: GuestPromptSessionIdentity,
  executeContinuation: boolean
) {
  if (
    !session ||
    session.consumed ||
    session.reason !== expected.reason ||
    session.generation !== expected.generation ||
    session.scopeKey !== expected.scopeKey
  ) {
    return null;
  }
  session.consumed = true;
  return executeContinuation ? session.continuation : undefined;
}
