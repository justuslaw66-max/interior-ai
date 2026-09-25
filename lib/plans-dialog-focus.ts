export const PLANS_ACCOUNT_OPENER_ID = "editor-command-account-action";
export const PLANS_DIRECT_FALLBACK_ID = "editor-command-more-action";
export const PLANS_UPGRADE_OPENER_ID = "upgrade-see-plans-action";
/** The command bar's Get Pro button. */
export const PLANS_GET_PRO_OPENER_ID = "editor-command-get-pro-action";

const PLANS_DIRECT_RETURN_FOCUS_IDS = [
  PLANS_ACCOUNT_OPENER_ID,
  PLANS_DIRECT_FALLBACK_ID,
] as const;
const PLANS_UPGRADE_RETURN_FOCUS_IDS = [PLANS_UPGRADE_OPENER_ID] as const;
// One array per opener, so the dialog's focus session isn't restarted on every render.
const openerReturnFocusIds = new Map<string, readonly string[]>();

/**
 * Where focus goes when Pricing closes. Openers outside the Account menu (Get Pro, Download's "See
 * pricing") come first, ahead of the usual Account and More.
 */
export function getPlansReturnFocusIds(openedFromUpgrade: boolean, openerId: string | null = null) {
  if (openedFromUpgrade) return PLANS_UPGRADE_RETURN_FOCUS_IDS;
  if (!openerId) return PLANS_DIRECT_RETURN_FOCUS_IDS;
  let ids = openerReturnFocusIds.get(openerId);
  if (!ids) {
    ids = [openerId, ...PLANS_DIRECT_RETURN_FOCUS_IDS];
    openerReturnFocusIds.set(openerId, ids);
  }
  return ids;
}
