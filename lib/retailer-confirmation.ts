export const RETAILER_CONFIRMATION_DIALOG_ID =
  "retailer-confirmation-dialog";
export const RETAILER_CONFIRMATION_GLOBAL_OPENER_ID =
  "retailer-confirmation-global-action";
export const RETAILER_CONFIRMATION_CART_FALLBACK_ID =
  "retailer-confirmation-cart-fallback-action";
export const RETAILER_CONFIRMATION_CLOSE_ACTION_ID =
  "retailer-confirmation-close-action";
export const RETAILER_CONFIRMATION_CANCEL_ACTION_ID =
  "retailer-confirmation-cancel-action";
export const RETAILER_CONFIRMATION_CONTINUE_ACTION_ID =
  "retailer-confirmation-continue-action";
export const RETAILER_CONFIRMATION_SAME_TAB_ACTION_ID =
  "retailer-confirmation-same-tab-action";

export type RetailerConfirmationLine = {
  instanceId: string;
  productId: string;
  variantId: string;
  name: string;
  category: string;
  retailer: string;
  buyUrl: string | null;
  qty: number;
  linkOpenCount: number;
  isBundleLine: boolean;
};

export type RetailerConfirmationOpener =
  | { kind: "global" }
  | { kind: "retailer-group"; groupIdentity: string };

export type RetailerConfirmationSession = {
  generation: number;
  opener: RetailerConfirmationOpener;
  title: string;
  lines: readonly RetailerConfirmationLine[];
  tabCount: number;
  openInSameTab: boolean;
  continuationConsumed: boolean;
  scopeKey: string;
};

export type RetailerConfirmationSessionIdentity = Pick<
  RetailerConfirmationSession,
  "generation" | "opener" | "scopeKey"
>;

type RetailerScopeItem = {
  instanceId: string;
  productId: string;
  variantId: string;
  qty?: number;
  includeInCheckout?: boolean;
  purchaseOptionId?: string | null;
  bundleGroupId?: string | null;
  bundleRole?: "primary" | "component" | null;
  bundleQuantity?: number | null;
};

export function canonicalRetailerGroupIdentity(retailer: string) {
  const canonical = retailer.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const exactCodePoints = Array.from(retailer, (character) =>
    character.codePointAt(0)!.toString(16)
  ).join("-");
  return `${canonical}--${exactCodePoints}`;
}

export function getRetailerGroupOpenerId(groupIdentity: string) {
  return `retailer-confirmation-group-action-${encodeURIComponent(groupIdentity)}`;
}

export function getRetailerConfirmationReturnFocusIds(
  opener: RetailerConfirmationOpener
) {
  const openerId = opener.kind === "global"
    ? RETAILER_CONFIRMATION_GLOBAL_OPENER_ID
    : getRetailerGroupOpenerId(opener.groupIdentity);
  return [openerId, RETAILER_CONFIRMATION_CART_FALLBACK_ID] as const;
}

export function countRetailerTabs(lines: readonly RetailerConfirmationLine[]) {
  return lines
    .filter((line) => Boolean(line.buyUrl))
    .reduce(
      (total, line) => total + (line.linkOpenCount ?? line.qty ?? 1),
      0
    );
}

export function createRetailerConfirmationScopeKey(
  designId: string | null | undefined,
  items: readonly RetailerScopeItem[]
) {
  return JSON.stringify({
    designId: designId ?? null,
    items: items.map((item) => ({
      instanceId: item.instanceId,
      productId: item.productId,
      variantId: item.variantId,
      qty: item.qty ?? null,
      includeInCheckout: item.includeInCheckout ?? true,
      purchaseOptionId: item.purchaseOptionId ?? null,
      bundleGroupId: item.bundleGroupId ?? null,
      bundleRole: item.bundleRole ?? null,
      bundleQuantity: item.bundleQuantity ?? null,
    })),
  });
}

export function getCurrentRetailerConfirmationSession(
  session: RetailerConfirmationSession | null,
  scopeKey: string
) {
  return session?.scopeKey === scopeKey ? session : null;
}

function sameOpener(
  current: RetailerConfirmationOpener,
  expected: RetailerConfirmationOpener
) {
  return current.kind === expected.kind && (
    current.kind === "global" ||
    (expected.kind === "retailer-group" &&
      current.groupIdentity === expected.groupIdentity)
  );
}

function matchesSession(
  session: RetailerConfirmationSession,
  expected: RetailerConfirmationSessionIdentity
) {
  return !session.continuationConsumed &&
    session.generation === expected.generation &&
    session.scopeKey === expected.scopeKey &&
    sameOpener(session.opener, expected.opener);
}

export function createRetailerConfirmationSession({
  generation,
  opener,
  title,
  lines,
  tabCount,
  openInSameTab,
  scopeKey,
}: Omit<RetailerConfirmationSession, "lines" | "continuationConsumed"> & {
  lines: readonly RetailerConfirmationLine[];
}) {
  return {
    generation,
    opener,
    title,
    lines: lines.map((line) => ({ ...line })),
    tabCount,
    openInSameTab,
    continuationConsumed: false,
    scopeKey,
  } satisfies RetailerConfirmationSession;
}

export function updateRetailerConfirmationSameTab(
  session: RetailerConfirmationSession | null,
  expected: RetailerConfirmationSessionIdentity,
  openInSameTab: boolean
) {
  if (!session || !matchesSession(session, expected)) return null;
  return { ...session, openInSameTab } satisfies RetailerConfirmationSession;
}

export function consumeRetailerConfirmationSession(
  session: RetailerConfirmationSession | null,
  expected: RetailerConfirmationSessionIdentity
) {
  if (!session || !matchesSession(session, expected)) return null;
  session.continuationConsumed = true;
  return session;
}

export function cancelRetailerConfirmationSession(
  session: RetailerConfirmationSession | null,
  expected: RetailerConfirmationSessionIdentity
) {
  return consumeRetailerConfirmationSession(session, expected) !== null;
}
