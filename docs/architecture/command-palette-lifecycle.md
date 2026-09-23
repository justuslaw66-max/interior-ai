# Command Palette modal lifecycle

## CH-0015H test-contract hardening — 2026-08-12

This bounded child starts at CH-0015H implementation commit
`ee55098be7c750e8fa2a631978f3d4ebd956708c` / tree
`e6162ead7031eb41cbba23b3ac56f5873cfe0f92`. It changes test evidence only;
the production Palette executor, history owner, Client Preview focus lifecycle,
command inventory, capability policy, and Floor Plan Upload are unchanged.

The original WebKit result remains **D — NOT_REPRODUCED_WITH_PROVENANCE**. The
original required evidence SHA-256 is
`018afa76c7bc69104c879440f6d69801ddef9b238c713509f551f9f1a5095223` and
its Playwright report SHA-256 is
`fd35b65201f0583a1b8e86de8df08d3520cf9ab8f833273af4829d61d00b339c`.
The complete bounded instrumented WebKit project reproduced no in-window More
focus event and retained focus report SHA-256
`e997098141ddf0828d69d67a09252cb0b79304a5751231d86e7a3c28ade0d2c5`
plus Playwright report SHA-256
`e524a7e6cb7601f1858d06ac4dbceab1603689d15e02044f4351735465e5c9d2`.
The original trace/report needed to classify that historical event semantically
was unavailable, so these facts do not identify or imply a product root cause.
A future invalid event is now retained with enough phase and semantic state for
direct classification.

Palette exact-once coverage now uses the production-rendered snapshot
fingerprint: `F0`, one existing Insert default door action, `F1 != F0`, one
production Undo, and `F2 == F0`. The test also requires Undo to be disabled
after that single reversal, so a duplicate transaction cannot hide behind a
final visual assertion. The browser requires Palette absence after the action;
the production executor contract separately proves synchronous consume/close
before domain execution and duplicate-session rejection. No mutation-delivery
timing is treated as historical ordering evidence.

Client Preview scope-cancellation coverage now uses a fixed-capacity,
bubble-phase, test-only semantic recorder instead of a raw focus count. Each
window records phases A entry, B active Preview, C exit request, D semantic
settlement, and E post-exit restoration, together with generation, hashed scope,
opener/fallback, current dialog generation, inert/hidden/disabled state,
geometry, visual state, and command-bar animation settlement. A More
`focusin` is valid only in phase E when the current semantic opener or permitted
fallback remains eligible; every other More `focusin` fails the test. The
recorder never focuses an element, observes production mutations, or owns a
timer/frame.

## CH-0015H pre-remediation characterization — 2026-08-11

CH-0015H starts from exact integration source
`5ab9db530d4e4fcc8d1f8f678994e09ab7bb3e67`, tree
`f646076854c0c76b69c80c9cada996e58d01b1b0`, on
`fix/ch-0015-command-palette-accessibility`. The editor Command Palette opened
by Cmd/Ctrl+K is classified as a **MODAL_DIALOG**. Floor Plan Upload, command
content, command availability, pointer/touch entry, and every other overlay are
outside this batch.

### Original lifecycle map

Opening was owned by one `window` keydown effect in
`useDesignPageCommandPalette`. Meta+K and Ctrl+K shared the same path in
Consumer and Pro and at desktop or external-keyboard narrow widths. The only
guards were effective Client Preview and an input, textarea, or contenteditable
event target. A matching event toggled a Boolean and reset the separate query
state. It did not inspect the shared dialog stack, capture the active editor
action, bind route/requested-design/current-design/project/mode scope, or create
a generation. Repeated shortcuts toggled the Boolean rather than addressing a
typed session.

Search lowercased and trimmed the query, filtered the one canonical ordered
command array by label plus hint, retained disabled results, and let Enter run
the first enabled filtered result. Pointer activation used the same local
`runAction` callback. There was no arrow-key navigation. Native buttons skipped
disabled actions, but no session-level consumption guarded exact-once execution.
The input alone handled Enter and Escape. Tab and Shift+Tab used uncontained
browser order; the action buttons did not own Escape.

Input Escape and backdrop pointer dismissal only changed the open Boolean.
Action activation invoked `action.run()` first, then requested close, then
cleared the query. Route, requested/current design, workspace/project,
Consumer/Pro mode, editor mode, Preview entry, and unmount had no generation to
invalidate. The presentation facade hid the open Palette during Client Preview
without clearing its internal Boolean or query, so Preview exit could remount
the stale session.

The action inventory at this source is:

- current-editor mutations: undo, redo, add door, insert default door, add
  window, delete selected overlay, duplicate/delete selected room,
  duplicate/delete selected furniture, and presentation/technical layer
  presets;
- current-view changes: fit plan/view and switch 2D/3D;
- deletion and selection changes: the selected overlay, room, and furniture
  commands above use their existing direct domain actions;
- registered-dialog openers: none of the current command IDs directly opens a
  dialog at this source;
- focus-moving actions: view, selection, room, and deletion actions may remount
  or remove the current focus context even though none declares focus behavior
  in the Palette contract.

For every path the active element was whatever invoked the global shortcut,
then the search input through `autoFocus`. No semantic opener was retained. The
Palette had no shared-registry token or stack position; the background stayed
keyboard-accessible and present in the accessibility tree. Closing ordinarily
left focus on `body`. An already-topmost shared dialog remained the registry's
owner while the unregistered Palette rendered visually above it. A newer
registered dialog had no explicit parent/child contract with the Palette.

### Direct defect reproduction

Read-only Chromium characterization against the verified canonical dev server
confirmed Meta and Control opening, `role="dialog"`, the name `Command palette`,
missing `aria-modal`, missing registry marker, initial input focus, non-inert
and accessibility-visible command-bar background, Shift+Tab escape to `body`,
action-focused Escape failure, and `body` after ordinary close. Cmd/Ctrl+K also
opened while the shared Guest Save `EditorDialog` was active. Entering Client
Preview hid an internally open Palette; exiting Preview remounted it with the
same `fit` query.

## Required final policy

Cmd/Ctrl+K opens one fresh Palette session only while editing, from a
non-editable target, and with no current modal. Another topmost modal causes the
shortcut to be consumed and ignored. The Palette is absent while closed and,
while open, is exactly one named `aria-modal=true` shared `EditorDialog` owner
with search input initial focus, deterministic Tab/Shift+Tab, topmost
Escape/backdrop, and inert/accessibility-hidden editor background.

The session must bind generation, semantic opener candidates, pathname,
requested and current design, workspace/project, Consumer/Pro and editor mode,
Preview state, query, action consumption, and cancellation. Scope change,
Preview entry, unmount, or reopen supersession invalidates stale restoration.
Ordinary close returns to the current semantic equivalent of the recognized
editor action, then the visible More action, then the visible Workspace action.
Canvas or another non-action opener intentionally uses that fallback hierarchy;
`body` is not a target.

Execution resolves a currently enabled command, consumes once, clears the
query, and synchronously begins/commits Palette closure before `run()`. Normal
dialog restoration is suppressed for that transition. A registered dialog
created by an action owns the resulting stack and focus; otherwise a still-
current semantic opener/fallback may be restored after the action without
overriding focus that the action established. Throws leave the Palette closed
and cannot re-run the consumed session.

## CH-0015H implemented lifecycle

The Palette now directly composes `EditorDialog`. Its shared registration owns
one name, `aria-modal=true`, search-input entry, Tab/Shift+Tab containment,
topmost Escape from any focused descendant, backdrop dismissal, and editor
background inertness/accessibility concealment. The existing visual shell,
command IDs, labels, order, hints, enabled predicates, filtering, first-enabled
Enter behavior, and pointer actions are unchanged. Focus-visible rings were
made explicit for the search field and action buttons; no launcher, arrow-key
model, or visual redesign was added.

`hasActiveEditorModal()` is the only new registry query. The registry also
derives direct-root visual layers from registration order: it preserves the
greatest participating base layer, gives each newer root the next layer, and
restores prior inline z-index on unregister. Because a child z-index cannot
escape an ancestor stacking context, the Palette additionally opts into
reversible visual withdrawal while superseded. It stays mounted, inert, and
accessibility-hidden, but cannot cover a newer nested Cart/Retailer owner; its
prior visibility is restored when it reclaims topmost ownership. The global
shortcut retains the existing
input/textarea/contenteditable and Client Preview guards,
then consumes and ignores a qualifying event when a Palette session or any
registered/external modal already owns the page. It creates one generation only
when no modal exists. The session binds route, requested/current design,
workspace/project, brief/editor mode, plan/audience, Preview state, query,
semantic opener, consumption, and cancellation. Preview, scope, or unmount
invalidates it instead of merely hiding rendered output.

Recognized editor actions are captured by stable test ID, DOM ID, or accessible
label only within the command bar, tool rail, design controls, selected-item
panel, or focused editor toolbars. Close resolves exactly one current semantic
replacement, then More, then Workspace; hidden, inert, disabled, disconnected,
obscured, ambiguous, or out-of-viewport candidates are rejected. The temporary
return ID is session-local and removed before the next capture.

Enter and pointer activation re-resolve the requested ID against the current
filtered/enabled action array, mark the session consumed, clear its query,
suppress the shared close frame, and use `flushSync` to commit Palette removal
before invoking the existing action. A post-action frame restores only when the
same generation/scope remains current, no modal owns the page, and the action
did not establish valid focus. Thus a synchronous action-created registered
dialog wins without Palette focus theft. At this source no production Palette
command directly opens a registered dialog. A pure executor contract proves
close then synthetic action-created dialog and rejects duplicate execution;
the browser case proves a real newer `EditorDialog`, nested under a lower
stacking context, receives focus, dismissal, hit testing, and Palette return
while the superseded Palette is visually withdrawn. No command was added for
testing.

Canonical ownership remains `ci.pro-visual-policy`: five new stable identities
run once in Chromium and WebKit. They cover Meta and Control entry, Consumer and
Pro, 390x844 and desktop geometry, semantics/background/containment, input and
action Escape, backdrop, semantic replacement and fallback, query/order/
disabled behavior, Enter and pointer exact-once close ordering, editable
suppression, repeated open, competing/newer modal ownership, requested/current
design, Preview/project/audience/editor-mode/unmount cancellation, no stale
reappearance, and no overflow. The
package closure remains one script at
`e405cb73f95c111fb19dd7bbb4886c760841f8a08afcf0ba5bdb7e99482e3fa3`;
derived inventory remains 26 gates / 376 classified sources.

Rollback is the one focused CH-0015H commit, followed by the Palette static and
Pro owners plus the directly affected shared-dialog owners. No data, schema,
migration, dependency, catalog, command, entitlement, deployment, or external
setting is changed. After this batch, Floor Plan Upload is the only remaining
required CH-0015 overlay remediation; public legacy Upgrade and selected-item
preview remain separate P2 work.
