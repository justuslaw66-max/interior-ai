export const PLANS_ACCOUNT_OPENER_ID = "editor-command-account-action";
export const PLANS_DIRECT_FALLBACK_ID = "editor-command-more-action";
export const PLANS_UPGRADE_OPENER_ID = "upgrade-see-plans-action";

const PLANS_DIRECT_RETURN_FOCUS_IDS = [
  PLANS_ACCOUNT_OPENER_ID,
  PLANS_DIRECT_FALLBACK_ID,
] as const;
const PLANS_UPGRADE_RETURN_FOCUS_IDS = [PLANS_UPGRADE_OPENER_ID] as const;

export function getPlansReturnFocusIds(openedFromUpgrade: boolean) {
  return openedFromUpgrade
    ? PLANS_UPGRADE_RETURN_FOCUS_IDS
    : PLANS_DIRECT_RETURN_FOCUS_IDS;
}
