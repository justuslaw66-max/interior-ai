# Guest Save Prompt continuation and dialog lifecycle

## CH-0015F contract — 2026-08-10

CH-0015F starts from exact integration source
`d649708ba31eb9d8ede183dea6d6268c9dd1aca3`, tree
`a34e6a5831c0e7b40649895a7cc3e3f18b07fec4`, on
`fix/ch-0015-guest-save-prompt-accessibility`. It owns exactly the guest Save,
guest AI-layout, and guest Shopify-checkout prompt entries. Authentication,
guest quota policy, AI planning/generation, cart eligibility, Shopify payloads,
pricing, variants, retailer handling, external navigation, and other overlays
are unchanged.

### Characterized entry state machines

Before this batch, all three entries stored an arbitrary string and raw
callback in persistence state, then reduced the reason to a Boolean before
rendering. Save stored `save` with a no-op continuation; AI cancelled its
current request epoch, stored `ai_layout` with the existing no-op continuation,
and began no AI request; checkout stored `checkout` with the real existing
checkout closure and began no checkout request or navigation. The custom
overlay left focus on the obscured Save, Generate layout, or Checkout here
action and had no dialog semantics, topmost ownership, focus containment,
Escape/backdrop/close policy, background isolation, or semantic return.

The public catalog currently contains no Shopify-mapped line, so its visible
Checkout here action remains correctly disabled and the no-variant behavior is
unchanged. Focused checkout coverage bundles a test-only harness that mounts
the actual `CartSidebar`, prompt controller, and dialog against an in-memory
eligible Shopify catalog object. Normal click/Enter therefore reaches the real
production handler, exact request body, and URL construction while the final
boundary and navigation stay same-origin and synthetic. No production catalog
mapping or eligibility branch is added and no merchant is contacted.

### Typed reason and single continuation owner

`GuestPromptReason` is exactly `save | ai-layout | checkout`. One in-memory
`GuestPromptSession` binds the typed reason, route/design/workspace/mode/auth
scope key, generation, and callback. Opening supersedes the previous session;
cancel, continuation, primary action, scope change, authentication transition,
or unmount consumes it. Consumption marks and clears the session before any
callback runs, so a duplicate, stale, superseded, or mismatched generation can
never execute. There is no persistent callback serialization or second Save,
AI, or checkout queue.

`Not now` is the only explicit continue-without-saving action and executes the
current callback at most once. Escape, backdrop, and close-button activation
cancel with zero continuation. Save and continue consumes the session without
executing its stored callback, preserves the existing guest-claim operation,
and requests sign-in only while the same scope/generation remains current.
Checkout adds only a ref-backed single-flight guard around the existing request
body; payload construction, validation, analytics, URL handling, and navigation
remain in their original owner.

### Modal and semantic-focus contract

`GuestSavePromptDialog` now composes the shared `EditorDialog`. Closed state has
no prompt DOM. Open state has one labelled `role=dialog`, `aria-modal=true`, a
visible close-button initial focus, Tab/Shift+Tab containment, topmost
Escape/backdrop ownership, and inert plus `aria-hidden` background management.
A newer registered dialog alone owns dismissal; when it closes, the prompt
resumes ownership. Responsive presentation is contained at desktop and
390x844 with no horizontal overflow or clipped focus ring.

Cancellation resolves only current, connected, visible, enabled, non-inert,
non-obscured semantic actions in this order:

- Save: `guest-save-action`, then persistent
  `editor-command-more-action`;
- AI layout: `guest-ai-layout-action`, then
  `editor-command-workspace-action`;
- checkout: `guest-checkout-action`, then
  `editor-command-workspace-action`.

Responsive replacement carrying the same semantic ID is valid; a removed or
disabled reason-specific action is skipped. Route, requested/actual design,
workspace/project, homeowner/designer mode, preview state, plan/auth identity,
unmount, and supersession invalidate stale continuation and restoration.

### Required ownership, performance, and rollback

`ci.guest-save-overlay-accessibility` is the sole focused browser owner. Its
static prerequisite and eight stable scenarios cover all three reasons in
Chromium and WebKit with one worker, zero retries, no filter/shard, fail-closed
report validation, deterministic auth/AI/checkout boundaries, desktop and
390x844 behavior. Stable checks invoke it after the strict production build.
The derived required manifest is 25 gates / 376 classified sources.

Against CH-0015E, `/design` stays at 25 initial JavaScript chunks and one CSS
chunk. JavaScript moves from 5,830,782 raw / 1,113,525 Brotli bytes to
5,834,673 / 1,114,584 (`+3,891 / +1,059`); CSS moves from 131,607 / 17,493 to
131,910 / 17,506 (`+303 / +13`). Cabinetry Studio and GLTFExporter remain
492,639 / 84,899 and 34,525 / 8,970. All bundle budgets pass; the prompt stays
in the existing `/design` initial ownership graph and adds no dedicated lazy
chunk. Source-bound raw benchmark evidence is produced only from the final
clean implementation commit.

Rollback is one local revert of the focused CH-0015F commit, followed by the
Guest Save static/required owners, Save/AI/checkout domain guards, Phase 8, and
strict build. No schema, data, dependency, quota, auth-policy, external-service,
deployment, or integration-branch rollback is required.

CH-0015 remains open for exactly three required batches: Command Palette,
Floor Plan Upload, and retailer confirmation. Public legacy Upgrade and the
selected-item preview transition remain separate P2 work.
