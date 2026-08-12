# Floor Plan Upload workspace lifecycle

## CH-0015I implementation record — 2026-08-12

Status: **LOCALLY REMEDIATED; EXACT-SOURCE CH-0015 CLOSURE AUDIT STILL
REQUIRED**.

CH-0015I starts from `2c567fd483877c7dcbd8fd23e3cd8cb316732c8c`
(tree `50f9c5d6a6610990606fd9db9a27ba40200fca90`). The parent Floor Plan
Upload / Import surface is classified as a `FULL_SCREEN_MODAL_WORKSPACE`. It
uses modal lifecycle ownership while retaining the current mobile `100dvh`
workspace and viewport-contained desktop composition. This batch does not
redesign the workflow or convert the workspace into the compact
`EditorDialog` presentation.

### Production ownership and entry inventory

`FloorPlanUploadPanel` owns the single portaled workspace and the hidden file
input. `DesignControlsPlanPanel` owns editor entry routing. The supported
semantic entry families are:

| Entry | Current DOM lifetime and active element | Expected close return |
| --- | --- | --- |
| Consumer `plan-tool-import-2d` | Conditional room-setup button; pointer and keyboard activation leave it active; it can remount on responsive or mode changes | Current Consumer import-2D action |
| Pro/empty-plan `plan-start-upload` | Conditional Pro empty-plan action; transient with plan state | Current Pro start-upload action |
| Empty Surfaces “Upload plan” | Conditional surface-empty action; transient with panel/mode state | Current Surfaces upload action |
| Address library “Upload a plan” | Conditional address-library action dispatches `floor-plan-upload-requested`; switching to Upload removes that Template-mode action | Current address action if still mounted, otherwise the first visually eligible Floor Plan section/workspace fallback |
| Floor Plan “Import” | Persistent only while the Floor Plan card is rendered | Current Import action |
| “Open import workspace” | Persistent only while the Floor Plan card is rendered | Current workspace-launch action |
| File-input change | The input is visually hidden and is never a valid return target; a visible triggering action remains semantic authority | Triggering action, then fallback |
| Restored active job | An active job is read from local storage after an explicit entry opens the workspace; no route opens the parent workspace by itself | Explicit opener, then fallback |

The Empty Surfaces action is production-owned and carries the same semantic
contract, but its current integrated render branch is not reachable: both
call sites require `hasRooms`, while the start card itself requires
`!hasRooms`. CH-0015I does not change that pre-existing product reachability
or make an otherwise unavailable state visible. The focused browser fixture
mounts the exact production action component with its real handler and
workspace; the static prerequisite also proves that the integrated branch is
wired to that component. This limitation is recorded rather than represented
as live-app navigation coverage.

Every entry receives a stable, non-random ID. The documented fallback is the
current visible Plan / Design Controls Floor Plan section action. Return
resolution prefers the captured semantic identity, then the current responsive
equivalent within the same family, then this fallback. Hidden, disabled,
inert, disconnected, outside-viewport, obscured, stale, or superseded
candidates are ineligible. The hidden file input and a retained raw DOM node
are not restoration authorities.

### Workspace-state inventory

The parent owns no import-domain state. `FloorPlanImportWorkspace` selects the
empty versus active branch, `FloorPlanImportAssistant` owns import-job state,
and the existing page-selection and review components retain their domain
behavior.

| Semantic state | Existing controls and pre-remediation focus | Contract focus target |
| --- | --- | --- |
| Initial / empty | Header Choose file, Close, empty-state Choose floor-plan file, privacy checkbox; focus was the dialog container | Empty-state Choose floor-plan file |
| File selection / image or PDF upload / vision processing | Progress copy and any current import controls; focus could remain on the now-removed file trigger | Preserve a current valid control, otherwise Close while processing |
| PDF page selection | Candidate-page buttons and Use this page | Selected page action, then Use this page |
| Calibration / review | Review controls, calibration inputs, and continuation actions | First marked current calibration/review action |
| Ready / create | Create editable plan and supporting controls | Create editable plan |
| Failure / retry | Retry or resume processing action where supported | Current retry/resume action |
| Import history | Disclosure summary plus history actions | Preserve the summary/action used to open or select history; otherwise current history action, then Close |
| History item selected / swap | The selected job replaces the active assistant state | Preserve a still-valid workspace action; otherwise the next state target |
| Close / route / design / project / mode / plan / auth replacement / unmount | Parent was removed; a captured raw opener was focused even when stale | Cancel pending state focus and stale restoration; a later open starts a new generation |

Focus moves at most once per semantic state transition. A still-visible,
enabled, connected current control may retain focus. When a transition removes
the focused control, focus resolves to the new state target, scrolls it into
view without moving the document, and cancels queued work on supersession,
scope replacement, close, or unmount.

### Directly reproduced parent defect

The starting workspace rendered exactly one named `role="dialog"` with
`aria-modal="true"`, but it was not registered. It focused the `<section>`
container, installed a global `window` Escape listener, closed directly from
the backdrop, captured/restored a raw opener node, and independently captured
and replaced `document.body.style.overflow`.

Chromium reproduction at desktop and `390x844` confirmed:

- no `data-editor-dialog-focus-trap` or stack index;
- the workspace was detected as an external, unowned modal;
- editor, command bar, panels, and canvas remained keyboard- and
  accessibility-active rather than inert/`aria-hidden`;
- focus was not contained by the shared lifecycle;
- Escape was not topmost-aware;
- a retained opener could become disconnected after responsive, mode, or
  design replacement;
- body overflow ownership could restore too early when modal lifetimes
  overlap;
- a newer registered dialog could not truthfully supersede the visible
  external workspace.

The visual shell itself was correct: mobile remained exactly `390x844` with
no horizontal overflow; desktop remained viewport-contained with the existing
maximum width and margin.

### Parent modal contract

While closed, the workspace is absent. While open, its existing portal exposes
exactly one named `role="dialog"` with `aria-modal="true"`, registers one
shared topmost owner, manages background inertness, contains Tab and Shift+Tab,
and lets the shared owner arbitrate Escape, backdrop, and focus restoration.
A newer registered dialog may remain above it: the parent stays mounted but
becomes inert and accessibility-hidden, the child owns input, and child close
returns to a current valid workspace action.

Body-scroll locking is an additive responsibility of the existing dialog
registry. The registry records the original inline body overflow when the
first owner acquires a lock, reference-counts owners by dialog token, and
restores the original value only after the final owner unregisters. Nested
close, individual unmount, reopen generations, and React Strict Mode cleanup
therefore cannot release another dialog's lock or leak this workspace's lock.

### Inline history-confirmation boundary

`FloorPlanImportHistory` currently renders the single-delete and bulk-delete
confirmations inline with `role="alertdialog"`-like semantics but without a
separate registered modal lifecycle, focus trap, or independent Escape owner.
CH-0015I deliberately does not choose between correcting those prompts to
non-modal inline semantics and migrating them to registered child dialogs.
Their DOM, actions, and domain behavior remain unchanged. The parent only
observes whether either prompt is visible and blocks parent Escape, backdrop,
and parent Close while it is visible, preventing the parent from bypassing the
current confirmation. Focus remains where the current prompt behavior places
it. A dedicated characterization test must fail if this policy changes
silently.

### Domain and validation boundary

Accepted file types, size validation, rasterization, PDF page handling,
vision/model boundaries, polling, calibration, tracing, review, retry, job and
history identity, persistence, room creation, Consumer/Pro policy, auth,
analytics, storage, geometry, pricing, APIs, schemas, and migrations stay under
their existing owners. CH-0015I adds lifecycle annotations and observation,
not a second workflow-state owner.

The canonical browser owner is `ci.floor-plan-upload-accessibility`; the
existing static/domain owner remains `ci.floor-plan-required`. The focused
owner must exercise Chromium and WebKit, Consumer and Pro pointer/keyboard
entry, desktop and `390x844`, semantics, focus containment and transitions,
background isolation, semantic return and invalidation, supersession,
stack-safe scroll ownership, and the inline-history characterization without
retry, skip, flake, filter, `.only`, force clicks, or arbitrary sleeps.

Rollback is one revert of the focused CH-0015I commit followed by both Floor
Plan required owners and directly affected shared-dialog owners. No database,
dependency, workflow, deployment, or external-control rollback is involved.

### Implemented lifecycle and focused evidence

The existing full-screen portal now consumes the shared registry lifecycle
directly rather than adding another dialog shell or workflow store. It owns a
single stack token, focus trap, topmost Escape/backdrop decision, inert and
accessibility-hidden background, and body-scroll token. Registry state is a
single `globalThis` instance so a separately bundled registered child still
participates in the same stack. A child supersedes the mounted workspace at
stack index 1, returns to its current workspace action, and releases only its
own scroll token; the parent lock remains until the workspace closes.

Semantic openers are wired explicitly at the Consumer import-2D, Pro start,
empty Surfaces, and address-library handlers so Safari pointer activation does
not depend on click focus. Import and workspace-launch actions provide their
own IDs. Close re-resolves that ordered identity against the current DOM,
scrolls an eligible remounted equivalent into view, rejects concealed or
superseded candidates, and then uses the visible Floor Plan section action and
workspace launcher as fallbacks. Scope changes, `pagehide`, `popstate`, and
unmount cancel restoration; each reopen increments the dialog generation.

State owners mark exactly one preferred action for empty/file selection,
page selection, processing, calibration/review, ready, failure/retry, and
history states. A mutation observer reacts only when the semantic state key
changes; it preserves valid in-state focus and otherwise moves to the new
visible action once. The history single/bulk confirmation DOM and product
policy remain unchanged. The only parent addition is a close/Escape/backdrop
guard while the current inline confirmation is visible.

Focused results on the final pre-commit candidate are Chromium **10/10** and
WebKit **10/10**, one worker per project, zero retries/skips/filters/shards or
timeout increase. Consumer and Pro entry use the production-rendered empty
`DesignControlsPlanPanel`; responsive replacement uses the exact production
Pro action with the production workspace kept mounted; Empty Surfaces uses
the exact production action component because its integrated branch is
currently unreachable as documented above. The child-dialog fixture contains
no manufactured Pro or Surfaces openers. The static lifecycle prerequisite
and existing Floor Plan consumer-flow guard pass. Synthetic local
image/page/job boundaries were used;
no private plan, real vision provider, paid quota, database fixture, schema,
API, geometry, calibration, room-creation, persistence, pricing, or analytics
behavior changed. The manifest derives **27 gates / 377 classified sources**;
`ci.floor-plan-upload-accessibility` is its sole focused browser owner and
`ci.floor-plan-required` remains the domain owner.

The source-bound Phase 8 command is intentionally deferred until the one clean
committed candidate exists, because its evidence contract binds the measured
tree to `HEAD` and permits exactly one invocation. Its authoritative result
and hash belong to that post-commit evidence record and the final handoff; no
pre-commit run is represented as final evidence.
