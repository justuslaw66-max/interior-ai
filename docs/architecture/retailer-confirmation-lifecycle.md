# Retailer confirmation lifecycle

## Classification and bounded source

CH-0015G classifies the CartSidebar multi-tab Retailer Confirmation as a
**MODAL_DIALOG**. The bounded branch
`fix/ch-0015-retailer-confirmation-accessibility` starts from exact integration
source `d76994a778db99cb57834ef6bb62db5e8705a478`, tree
`ba00cb930778c84a4879d70274182868eb9c428f`. It changes only the Retailer
Confirmation caller, its local dialog composition and typed session adapter,
focused required/static coverage, gate wiring, ratchet baseline decreases, and
records. Shared dialog primitives, Guest Save, Shopify checkout, catalog data,
authentication, persistence, APIs, schemas, dependencies, and unrelated
overlays are unchanged.

The two modal entry classes are:

- the global `Open retailer links` action; and
- each retailer-group `Buy retailer` action.

Per-row `Open` remains a direct action and never enters the multi-tab modal.

## Reproduced defect

Before production or expectation changes, the actual CartSidebar prompt was
exercised with one, three, and four-tab fixtures. One and three tabs opened
directly. Four tabs rendered a visual custom overlay, but its root had no
dialog role, accessible name, or `aria-modal`; focus remained on the obscured
global or retailer-group opener. The background was neither inert nor
`aria-hidden`, Tab reached background actions, Escape and backdrop activation
did not dismiss, and Cancel left focus on `body`. Continue still produced four
tracking requests and four windows, demonstrating that the defect was modal
ownership rather than affiliate-domain behavior.

Focused screenshot inspection later found a second ownership problem: a
`position: fixed` dialog rendered inside CartSidebar's `max-height`/`overflow`
aside was clipped to that scrolling box. The local dialog is therefore a
sibling of the aside, not its descendant. The required responsive test locks
the overlay to the complete viewport and the panel/actions to 16px mobile
gutters for both global and retailer-group entry.

## Preserved count, track, and open contract

The count and opening rules remain caller-owned in CartSidebar:

- only included affiliate lines contribute to global/group requests;
- a line without `buyUrl` contributes zero tabs;
- an ordinary line contributes its clamped quantity;
- a bundle line contributes one link even when its bundle quantity is larger;
- unavailable affiliate catalog variants retain the existing CartSidebar
  behavior and are not silently excluded;
- duplicate URLs and duplicate lines are not deduplicated;
- zero purchasable links retain the existing warning;
- at most three tabs open directly, while four or more require confirmation;
  and
- row `Open` bypasses the multi-tab threshold.

Continue uses the exact captured line snapshot and same-tab preference from
the session. For each link, the existing `/api/track/click` payload remains
`designId`, `productId`, and `variantId`; a successful `clickKey` is appended
with `utm_source=interior-ai` and `utm_medium=affiliate`. Tracking failure
retains fail-open navigation to the original affiliate URL. New-tab mode keeps
`window.open(url, "_blank", "noopener,noreferrer")` and 350ms pacing. Same-tab
mode opens the first link and returns. No merchant or paid external service is
used by focused tests.

## Typed session and exact-once ownership

`RetailerConfirmationSession` captures generation, global/group semantic
opener, title, cloned lines, tab count, same-tab preference, cart/design scope
key, and a continuation-consumed bit. A canonical NFKC/trimmed/collapsed/
lowercase retailer identity plus an exact Unicode-code-point discriminator
produces deterministic, collision-free encoded group-action IDs without
changing preserved raw retailer grouping.
The scope key binds design identity plus instance/product/variant, quantity,
include, purchase-option, bundle group/role, and bundle quantity fields.

Four or more tabs create a fresh generation. A newer request consumes and
supersedes the old generation. Same-tab changes update only the matching
current generation. Continue synchronously validates and consumes the current
generation, clears modal state, then starts the captured opening operation.
Repeated activation, a stale render callback, or an older opener cannot run it
again. Cancel, Escape, backdrop, close, cart/design scope change, and unmount
consume without continuation. Route replacement unmounts the owner and cannot
restore or execute stale work.

## Modal and focus contract

The local `RetailerConfirmationDialog` directly composes `EditorDialog`; it
does not reuse Guest Save or `ConfirmDialog` and does not modify the shared
primitive. Closed state has no dialog/action DOM. Open state has one named
`role="dialog"`, `aria-modal="true"`, a visible close-button initial focus,
deterministic Tab/Shift+Tab containment, topmost Escape/backdrop ownership, and
inert plus accessibility-hidden background branches. Retailer-local `focus`
and `focus-visible` rings cover close, same-tab, Cancel, and Continue in both
Chromium and WebKit.

Cancellation returns by semantic identity, never a captured DOM node. Global
entry resolves the current global action first. Group entry resolves the
current canonical group action first. Both then fall back to the current Cart
collapse/expand action. The shared resolver rejects missing, disconnected,
hidden, inert, disabled, obscured, or superseded targets. Explicit Continue
does not require return because opening disables the Cart actions and may
navigate away. A newer registered dialog becomes the topmost owner; closing it
resumes Retailer Confirmation without allowing stale dismissal or focus
restoration.

Stable IDs cover the dialog, global and canonical group openers, Cart
fallback, close, same-tab, Cancel, and Continue actions.

## Required owner and rollback

`ci.retailer-confirmation-accessibility` is the sole merge-required browser
owner. Its static prerequisite builds the actual CartSidebar fixture and locks
typed state, exact counting boundaries, snapshot/scope/exact-once behavior,
stable IDs, unchanged tracking/UTM/pacing, direct row behavior, and unchanged
Guest Shopify call-site ownership. Twelve stable cases execute once in
Chromium and WebKit: 24 required records, one worker, zero retries, skips,
annotations, filters, shards, focused tests, or timeout increases. Synthetic
boundaries cover tracking and safe same-origin destinations. The gate is
registered after the strict build and outside advisory Full E2E/Gate A3
discovery. Derived inventory is 26 gates / 376 classified sources; its
two-script package closure is SHA-256
`808a1bf39daa58ac4e0e7a0599ecdb9782abd2beeec7c2d434e2ca3e49bbc836`.

Rollback is one focused commit revert, followed by the Retailer static and
required owners, Cart/Guest and commerce guards, critical checks, required
truthfulness, design cleanup, code quality, Phase 8, and strict build. No data,
schema, dependency, auth, catalog, merchant, deployment, integration-branch,
or external-service rollback is required.
