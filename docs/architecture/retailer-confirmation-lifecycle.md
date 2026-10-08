# Retailer confirmation lifecycle

## Re-pinned in UX phase 3c-2: buying at a retailer from the Shopping list

Shop is one Shopping list over the canvas (audit findings FU7 and FU8). It lists
every product in the design, grouped by the shop that sells it, with one total
and one "Buy at <shop>" per shop. `CartSidebar`, `ShoppingOverviewPanel`,
`RetailerConfirmationDialog` and `lib/retailer-confirmation.ts` are gone.

CH-0015G's gate keeps its id (`ci.retailer-confirmation-accessibility`), its
owner (`retailer`, the development server), its files, package scripts and CI
step, as the My designs gate did in 3b-3b. It now owns the buy list. Since
8 Oct CI serves its strict build to this gate (`PLAYWRIGHT_USE_PRODUCTION_SERVER=1`
in the step); other runs keep the development server.

### Why a buy list, not a burst of tabs

Browsers let one click open one tab. The old Cart opened up to N tabs from one
click, 350 ms apart, behind a confirmation at four or more; after the first,
pop-up blockers stop the rest. J chose (Q2, 27 Sep) one list instead:

- a shop with **one** product: "Buy at <shop>" opens that product directly;
- a shop with **several**: "Buy at <shop>" opens that shop's buy list, a modal
  with one row per product, its own **Open**, how many to add ("Add 3 to your
  cart"; a set counts once), progress ("1 of 3 opened") and **Done**;
- each Open opens exactly one tab. Opened products stay ticked while Shop is
  open, so reopening the list keeps the person's place; opening one again is
  allowed and opens one more tab.

### Grouping and counts (`lib/shopping-list.ts`)

- Shops are grouped by website: the retailer URL's host without `www.`. Two
  spellings of one shop ("Castlery", "Castlery Singapore") are one shop, named
  by the shortest spelling, without a trailing "Singapore" or "SG".
- Each placed product is one line, in room and placement order; a shop's
  section spans rooms, with the room on each row.
- How many to add is the line's quantity, clamped to 1–99; a set bought as a
  purchase option counts once and opens the set's own page.
- A product without a buy link is listed apart, under "Not sold online yet",
  and never opened. Products sold through Shopify are listed under "Checkout
  here", which stays hidden until a design has one (J, Q5).

### Opening one tab (`lib/shopping-list-buy.ts`)

1. `window.open("", "_blank")` runs at the click, while it still counts as the
   person's, so no pop-up blocker stops it.
2. A blocked tab (`null`) records no click. The list says why, in a status line
   that is always present while the list is open: "Your browser blocked the new
   tab. Allow pop-ups for this site, then open the product again." The product
   stays unticked. A later successful Open clears the message.
3. Otherwise the tab's `opener` is cleared, then the click is recorded:
   `POST /api/track/click` with `designId`, `productId` and `variantId`. A
   returned `clickKey` is added to the address with `utm_source=interior-ai` and
   `utm_medium=affiliate`. If recording fails, the tab still goes to the
   retailer's own address (fail-open).
4. The tab is sent to that address, and the product is ticked.

### Modal and focus contract (`ShoppingBuyListDialog`)

The buy list composes `EditorDialog` directly and is portaled to the page body,
because the Shop page is a layer of its own. Closed, it renders nothing. Open,
it is one named `role="dialog"` with `aria-modal="true"`; focus starts on its
close button; Tab and Shift+Tab stay inside; Escape, the backdrop, the close
button and Done close it; the rest of the page is inert and hidden from
assistive technology. Every action is at least 44px tall on a 390×844 phone and
shows a focus ring.

Closing returns focus by id: the shop's Buy button
(`shopping-buy-<website>`), or, when that button has gone, the current step's
tab (`editor-command-workspace-action`). The focus plan is fixed for each
opening. When the shop's last product leaves the design, the list closes and
focus goes to the fallback. When Shop unmounts, the list goes without
restoring focus, and nothing opens. A newer registered dialog takes Escape and
focus first; closing it returns to the buy list.

Stable ids: `shopping-buy-list-dialog`, each `shopping-buy-<website>`, and the
test ids `shopping-buy-list`, `shopping-buy-list-close`, `shopping-buy-list-row`,
`shopping-buy-list-open`, `shopping-buy-list-progress`,
`shopping-buy-list-notice` and `shopping-buy-list-done`.

### Required owner

`ci.retailer-confirmation-accessibility` stays the sole merge-required browser
owner. Its static prerequisite (`test:retailer-confirmation-static`) builds the
harness bundle and runs `scripts/test-retailer-confirmation-static.tsx`, which
renders the buy list and locks the ids, grouping and counts, and the order of
opening, clearing the opener, recording and fail-open. The harness
(`tests/required/fixtures/retailer-confirmation-harness.tsx`) mounts the real
`ShopStep` with synthetic products sold by synthetic shops on reserved `.test`
hosts; `window.open` is replaced by a tab that records where it is sent, so no
merchant is contacted. Fourteen tests run once in Chromium and WebKit: 28
required records, one worker, no retries, skips, annotations, filters, shards,
focused tests or timeout increases. The package closure is unchanged: two
scripts, SHA-256
`808a1bf39daa58ac4e0e7a0599ecdb9782abd2beeec7c2d434e2ca3e49bbc836`.

Rollback is a revert of the 3c-2 Shop commit, followed by the Retailer static
and required owners, the Guest Save owner, the commerce guards, design cleanup,
code quality, Phase 8 and the strict build. No data, schema, dependency, auth,
catalogue, merchant or deployment rollback is needed.

## History: CH-0015G, the Cart's multi-tab confirmation

CH-0015G made the Cart's four-or-more-tab confirmation a real modal dialog: it
had had no dialog role, name or `aria-modal`, left focus on the obscured
opener, and let Tab reach the page behind it. It kept the Cart's counting (at
most three tabs direct, four or more confirmed, bundles counting once, row
Open bypassing the threshold), tracking, 350 ms pacing and same-tab option, and
added a typed, generation-bound session so Continue ran exactly once. UX phase
3c-2 replaced that flow with the buy list above.
