# Required-test truthfulness

## Real-runner stage-order regression inventory — 2026-08-18

The bounded source-validation database projection correction adds
`scripts/test-production-certification-source-database-projection.mjs` to the existing
risk-triggered `script-tests` inventory. The canonical manifest now records
269 script tests at path-set SHA-256
`e60d2b091eb334b92c9438e1e7dfc10548e1d819d6b3f13f5eaf9ba04cce630e`.
Direct validation remains **27 gates / 392 classified test sources**. No gate,
workflow, cadence, browser project, retry, skip, or advisory classification is
added or changed.

The existing `ci.production-artifact-contract` owner reaches the new regression
through `test:production-artifact-evidence` and the certification harness. The
committed qualifier also invokes the focused file directly, so a missing real
runner import, copied/reordered/omitted/duplicated stage list, or unknown runner
stage cannot be hidden by helper-only or module-load-only coverage.

## Harness v1 source/continuity correction ownership — 2026-08-14

`ci.production-artifact-contract` remains the single required owner. Its source
closure now includes the machine-readable source-check/continuity contract and
the source-validation/physical-snapshot implementation; the focused Harness v1
owner exercises the real runner and state/continuity CLI paths. No gate,
workflow, browser project, retry, timeout, assertion, selector, or cadence is
added.

The previous source qualifier's A result was invalidated by
`SOURCE_VALIDATION_STAGE_BYPASS_DEFECT` and
`ARTIFACT_CONTINUITY_SELF_ASSERTION_DEFECT`. New deterministic coverage proves
15 source anti-bypass cases, 23 physical-continuity/tamper cases, and preserves
the original 26 historical regressions. Simulation executes deterministic
child commands, captures distinct live/staged/extracted roots, constructs a
deterministic miniature archive, rehashes every root at continuity, and remains
explicitly ineligible for real certification.

Direct manifest validation reports **27 gates / 381 classified test sources**.
The corrected bounded qualifier returned
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; this supersedes the invalid prior
source result without supplying any real-candidate evidence.
The final independent read-only review returned **PASS** after inspecting the
real source runner, state bindings, physical lifecycle captures, continuity CLI
tamper paths, simulation, doctor, qualification ownership, and complete diff.
No real build, benchmark, runtime smoke, browser matrix, Full E2E, integration,
or deployment is claimed. Exact-head certification and the final CH-0015
closure audit remain pending.

## Production Certification Harness v1 ownership — 2026-08-14

The existing `ci.production-artifact-contract` gate owns Harness v1. Its source
inventory includes the certification contract/state/evidence/doctor/CLI/
simulation, archive and recursive closure owners, Phase 8 external wrapper,
shared Playwright resolver, all seven required-owner configurations, regression
matrix, focused harness test, and production-artifact integration test. The
package closure invokes both tests. No new required gate, workflow, browser,
project, retry, timeout, assertion, selector, or cadence is introduced.

Deterministic coverage proves the 28-owner matrix; sealed ordered state,
attempts, resume and cascading invalidation; accumulating non-consuming doctor;
physical staged/extracted archive execution; deterministic compression and
inventory continuity; recursive import failure/escape rejection; explicit
preflight/archive-preflight/final separation; direct external Phase 8 and all
seven unique external reports; full final identity, Phase 8, 2/2 runtime,
browser, continuity and non-simulation requirements; real `--list` execution
for all seven distinct configs; retained raw-report revalidation; unknown-value
fail-closed guards; and executable negatives for all 26 historical regressions.

`certification:simulate` exercises physical committed CLI boundaries for
journal/manifest production, every state transition, doctor, source advance,
archive lifecycle, staged/extracted verification, and final verification
outside the repository without app/server/database/browser/real-benchmark execution and is
explicitly not acceptable for a real candidate. The required owner proves only
the repository-controlled harness contract. It does not claim a real exact-head
certification, integration, deployment, external platform state, Full E2E, or
the final CH-0015 closure audit.

The bounded source qualifier returned
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; direct manifest validation reports
**27 gates / 381 classified test sources**. The result authorizes a separately
approved real cycle but is not a browser, benchmark, artifact, or deployment
result.

## CH-0015I staged archive-preflight ownership — 2026-08-14

`ci.production-artifact-contract` remains the sole merge-required owner. Its
existing `scripts/test-production-artifact-evidence.mjs` source now contributes
`artifact.staged-archive-preflight-cli`; no new gate, test source, package
command, workflow step, project, browser, retry, timeout, or cadence is added.
The final inventory remains **27 gates / 379 classified test sources**.

The contribution creates a task-owned staged tree outside every repository,
copies the complete canonical verifier closure, omits `.git` and runtime/browser
evidence, and invokes the physical staged `production-artifact-evidence.mjs`.
It proves `verify-preflight` remains Git-bound, `verify-standalone` continues to
require complete runtime evidence, and `verify-archive-preflight` alone accepts
the pre-runtime staged contract while returning explicit non-final JSON. A
second staged case adds valid runtime evidence and proves final standalone then
passes while archive preflight remains non-final.

The same owner covers unknown modes; missing/malformed/future manifest and
journal forms; candidate/commit/tree/nonce/Build ID/artifact mismatches;
inventory, artifact-file, verifier-closure/import, ordering, build, inventory,
manifest, partial-test, source-fallback, portable-path, and safe-error failures;
the closure digest is externally identity-bound and the standalone source shape
rejects both absolute and relative worktree-fallback fields;
and final standalone rejection of missing, failed, incomplete, mismatched, or
uncompleted runtime evidence. Static guards preserve explicit mode semantics,
one shared canonical validator, mandatory final tests, repository-bound legacy
preflight, no generic caller-controlled `requireTests=false`, and required-owner
registration of the physical staged CLI test.

The required owner does not claim exact-head certification or integration.
Those remain pending with the final CH-0015 closure audit; Full E2E is outside
this correction.

## CH-0015I certification stage-environment ownership — 2026-08-14

`ci.production-artifact-contract` now also requires the canonical stage
environment projector and its machine-readable v1 contract. Its
`artifact.certification-source-stage-environment-isolation` contribution owns
the exact real-Playwright regression: a source-validation parent may retain an
external evidence root without activating runtime smoke, while an explicit
runtime-smoke stage still rejects a missing product-test start marker.
The bounded certification qualifier directly requires the stronger
real-runner regression and binds its source through the harness identity. It
is deliberately not added to the artifact gate's package command: that command
is canonical source check 1, so invoking the containing real-runner from it
would recurse instead of proving the boundary.

Required-test browser children receive the narrow
`PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT` capability instead of inheriting the full
parent certification root. The shared required-test path resolver rejects
contradictory narrow/generic roots and retains the same containment, physical
parent, absence, symlink, and repository-exclusion rules. Production-server
and development-server browser owners use separate profiles; development
cannot inherit production activation and production cannot omit it. No gate,
test count, project, browser, assertion, retry, timeout, cadence, or workflow
changes.

## CH-0015I external Playwright report-path ownership — 2026-08-14

`ci.production-artifact-contract` remains the sole merge-required owner. It now
requires `scripts/playwright-report-path.mjs` and the existing
`scripts/test-production-artifact-evidence.mjs` contributes
`artifact.playwright-external-report-producer-consumer`. No new gate, test
source, package command, project, cadence, retry, timeout, browser, or workflow
step is created; the inventory remains **27 gates / 379 classified test
sources**.

The owner preserves the repository-relative `.local/production-artifact-
evidence` case used by stable-checks and adds the real external case through the
same `PLAYWRIGHT_JSON_OUTPUT_FILE` path used by runtime smoke plus the explicit
`PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT`. Actual Playwright config/list execution
must exit zero, discover exactly two specs, and write a parseable, hashable JSON
report only at the external destination. Static guards require the shared
resolver in the loader, require the real config to consume its returned output,
retain mandatory report-path and schema/journal preflight ordering, reject the
old repository-relative-only check, prevent a `.local` fallback or arbitrary
absolute authorization, and prevent the local root variable from entering the
portable evidence writer.

Deterministic negatives cover worktree and canonical-repository destinations,
outside-root paths, traversal, NUL, missing/relative root, missing/unwritable
parent, existing file, directory target, repository and outside-root symlinks,
empty/malformed path, unknown policy, safe error text, invalid schema before
path use, and missing `PLAYWRIGHT_JSON_OUTPUT_FILE`. Existing schema-v3,
semantic-journal, server-selection, required-test, and report-truthfulness
bindings are unchanged. Exact-head recertification and final CH-0015 closure
remain pending; Full E2E is outside this batch.

## CH-0015I Playwright artifact-v3 ownership — 2026-08-13

`ci.production-artifact-contract` remains the sole merge-required contract owner
for this correction. Its new
`artifact.playwright-v3-producer-consumer` contribution executes inside the
existing `test:production-artifact-evidence` source: the real producer writes a
current v3 manifest, the actual `PRODUCTION_EVIDENCE_MANIFEST` path reaches the
real Playwright configuration, configuration loading selects the canonical
production server, exact commit/tree/BUILD_ID/artifact/nonce metadata survives,
and nonzero runtime-smoke discovery is proven without starting a server.

The same source owns deterministic rejection of unknown schema/future version,
current-path v2, missing/wrong journal, missing/mismatched nonce, commit/tree,
BUILD_ID and artifact mismatch, invalid generated/build ordering, nonzero build,
incomplete inventory/manifest, malformed JSON, missing path, unsupported mode,
and secret-free error output. Static guards require producer and consumer to
import the shared contract, reject a stale v2 literal in Playwright, prevent a
second runtime-smoke version owner, retain the real integration contribution,
and keep validation before the web-server command.

No new gate, test source, package-script closure, project, retry, timeout,
browser, cadence, or workflow step is added. The final inventory remains **27
gates / 379 classified test sources**. Stable-checks already invokes the owning
contract before strict build/runtime smoke. Exact-head certification and the
CH-0015 closure audit remain separate pending work; Full E2E is outside this
batch.

## CH-0015I semantic artifact timestamp ownership — 2026-08-13

`ci.production-artifact-contract` remains the sole merge-required owner; no new
gate, cadence, project, retry, timeout, or browser owner was added. Its
`artifact.semantic-timestamp-provenance` contribution binds deterministic-clock
coverage to the executing wrapper's durable pre-dispatch and post-return event
records. The same owner covers canonical ordering, wrapper-start versus actual
build-start, generated-source and build failures, inventory and manifest
failure state, successful recovery, missing/incomplete/cross-run journals,
commit/tree/command/wrapper/BUILD_ID/artifact mismatches, invalid/nonmonotonic
ISO timestamps, diagnostic-only filesystem metadata, and rejection of the
historical filesystem-time reconstruction pattern.

Static guards inspect semantic ownership without line numbers: start is
persisted before child dispatch, completion follows child return, recovery does
not read stat/birthtime/ctime/mtime, nonce/source/tree/command/wrapper and
artifact bindings remain present, the generated-before-build ordering remains,
and no ca77-specific exception exists. Stable-checks still invokes the existing
production-artifact test and build steps. The final manifest inventory remains
**27 gates / 379 classified sources** because this correction creates no test
file and changes no package-script closure owned by a required gate. Full E2E
is outside this bounded implementation batch.

## CH-0015I Floor Plan NFT ownership — 2026-08-13

`ci.floor-plan-required` remains the sole Floor Plan domain umbrella and now
recursively owns `test:floor-plan-catalog-draft-match`. Its package closure is
**56 scripts** with SHA-256
`94276929fd43e144b2f23b037b63e28e15e1d2b385632a40e03b3347f12c465d`.
The canonical inventory remains **27 gates / 379 classified test sources**;
this change registers an already classified source instead of creating a gate
or test file.

The focused owner covers the exact `/assets/` contract, nested and encoded
valid paths, query/fragment handling, missing-file fallback, external URLs,
raw/encoded/double-encoded traversal, mixed/backslash separators, POSIX and
Windows absolute paths, drive letters, NUL, malformed encoding, empty relative
paths, containment, read failures, and symlink escape. The symlink negative uses
a uniquely named fixture beneath the canonical trace root and removes only that
fixture. Final-component symlinks are intentionally rejected; the reader binds
the opened descriptor to the post-open contained path by device/inode and reads
only that descriptor. Static assertions bind the local open to a direct
`process.cwd()/public/assets` join and prevent a repository/public-root dynamic
suffix or a regression to reading the unproved lexical/realpath string.

The existing `ci.production-artifact-contract` separately owns generated NFT
fixtures, unsafe raw references, lexical and realpath test-source edges,
missing chunks/paths, exact retained target summaries, standalone tampering,
and source guards against new output-tracing exclusions, archive allowlists, or
sensitive-scanner exceptions. Required-test truthfulness owns registration and
recursive reachability; the production-artifact owner owns post-build trace
behavior. Full E2E is not part of this correction.

## CH-0015I inherited runtime-smoke contract correction

The inherited `bootstrapEventsFlushed > 0` assertion is classified **B —
TEST_ASSERTION_DEFECT**. The field counts only records captured while the lazy
collector import is pending. A collector may activate with an exact empty batch
and then record timing, lifecycle, store, React, attachment, and renderer
activity directly; zero therefore does not prove loss.

The furnished runtime identity now calls one shared pure validator for the
initial document and each of three reload realms. It requires the hook, active
one-request collector, completed hydration, direct mode, current activation
generation, eight ready semantic models, timing plus lifecycle and renderer
activity, and exactly one coherent bootstrap path: positive queued equals
flushed with `hydrated-bootstrap`, or queued/flushed zero with
`direct-empty-bootstrap` and direct activity. Pending/failed imports, stale
realms, lost or mismatched records, empty mode with records, hydrated mode
without records, zero direct activity, malformed fields, and unknown schema
state fail closed with structured details.

Deterministic facade tests inject only the lazy loader and monotonic clock. They
control empty resolution, pending records, later direct activity, rejection,
one-request/no-retry, 96-entry/counter bounds, and fresh realm state without a
sleep or scheduler dependency. The test seam is not exported through the
browser facade. Required-test discovery is now **27 gates / 379 classified
sources**: 256 risk-triggered script tests, 101 Playwright specs, 14 imported
browser modules, and 8 imported script-test modules. The script-test path-set
SHA-256 is
`97bfe892688803f8fedc14a4a1d1da7b84af7ca69456a9d9ac68f4fb564aa77e`.

## CH-0015I Floor Plan Upload ownership

`ci.floor-plan-upload-accessibility` is the sole merge-required browser owner
for `tests/required/floor-plan-upload-accessibility.spec.ts` and
`playwright.floor-plan-upload.config.ts`. Its two-script closure first builds
the deterministic registered-child fixture and runs the focused static
lifecycle prerequisite. The package closure SHA-256 is
`9886ed08fb4a74d67873494181be2ef5c4ea6963553eaf7dca76a32b48318d2f`.

Ten stable identities execute once in Chromium and WebKit: focused result
**10/10 per engine**, one worker, zero retry, skip, annotation, flake, grep,
filter, shard, `.only`, force click, or timeout increase. Coverage owns
Consumer/Pro pointer and keyboard entry, desktop/390×844 full-screen geometry,
one named modal and topmost owner, state focus, containment, background
isolation, Escape/backdrop/close, semantic responsive/remounted return,
fallback and scope cancellation, registered-child supersession, stack-safe
Strict Mode body scroll, synthetic image/PDF/job behavior, and unchanged
inline history confirmation characterization.

The deterministic empty-plan fixture mounts the production
`DesignControlsPlanPanel` for Pro and its real production workspace. The
responsive identity remounts the extracted production Pro action without
unmounting that workspace. Empty Surfaces mounts its exact production action
and handler because its current integrated branch is structurally unreachable;
the child-dialog fixture declares neither Pro nor Surfaces opener. The static
prerequisite fails if any manufactured replacement is reintroduced or the
production integration wiring is removed.

The spec remains under the declared `tests/required` root and outside Full
E2E. Its config requires Chromium and WebKit, zero retries, one worker, exact
report metadata for canonical evidence, and a strict production server for
required runs. Manifest critical requirements lock exact projects, titles,
sources, reports, process exit, nonzero discovery, and static prerequisite;
missing, renamed, skipped, retried, flaky, filtered, or duplicate ownership
fails closed. Stable checks runs this owner after the strict build. Existing
`ci.floor-plan-required` remains the sole Floor Plan domain umbrella.

Direct discovery at the CH-0015I feature handoff derived **27 gates / 377 classified sources** with
inventory path-set SHA-256
`701f57101d65eb50f58b72ae62432bcc59d7b180de61f094504a79386cf22985`.
Repository registration does not claim GitHub ruleset enforcement or an
external exact-head workflow result; those remain separate evidence.

## CH-0015H bounded contract correction — 2026-08-12

The CH-0015H child above
`ee55098be7c750e8fa2a631978f3d4ebd956708c` replaces two weak assertions
without changing the 18 stable Pro Visual identities, Chromium/WebKit project
ownership, one-script package closure, retries, timeouts, filters, shards,
cadence, Full E2E, or Gate A3. `ci.pro-visual-policy` now classifies the
test-only semantic focus recorder as a required supporting source; gate count
remains 26, classified inventory remains 376 sources, and package closure
remains 1 script / SHA-256
`e405cb73f95c111fb19dd7bbb4886c760841f8a08afcf0ba5bdb7e99482e3fa3`.

The Palette pointer identity proves `F0 -> F1 -> F0` through the
production-rendered snapshot fingerprint and one production Undo, requires no
remaining Undo transaction, and requires the Palette to be absent after action
activation. The executor contract independently proves synchronous
consume/close before run and duplicate rejection; mutation-delivery timing is
not used as ordering evidence. The test no longer enables `debug_layout` or
reads the QA layout overlay. The responsive Client Preview identity replaces
its raw More focus count with a fixed-capacity A–E semantic event record,
positively classifies a current post-exit More restoration, and fails on any
invalid More `focusin`.

The original WebKit classification is unchanged: **D —
NOT_REPRODUCED_WITH_PROVENANCE**. Original evidence/report SHA-256 values are
`018afa76c7bc69104c879440f6d69801ddef9b238c713509f551f9f1a5095223` /
`fd35b65201f0583a1b8e86de8df08d3520cf9ab8f833273af4829d61d00b339c`;
the bounded diagnostic focus/report values are
`e997098141ddf0828d69d67a09252cb0b79304a5751231d86e7a3c28ade0d2c5` /
`e524a7e6cb7601f1858d06ac4dbceab1603689d15e02044f4351735465e5c9d2`.
The complete instrumented WebKit project reproduced no in-window More focus
event. The historical event cannot be classified semantically because its
original trace/report was unavailable; no product root cause is asserted. Any
future invalid event now retains phase and semantic evidence for direct
classification.

Status: **CH-0015H COMMAND PALETTE CONTRACT REGISTERED — LOCAL CONTRACT GREEN;
EXTERNAL RULESET ENFORCEMENT UNVERIFIED**. Repository truthfulness assigns the
Command Palette lifecycle to the existing Pro visual merge-required
Chromium/WebKit owner; it retains Retailer, Guest Save, My Designs, Client
Preview, Plans, Selection Tray, CH-0013 surface-material, responsive, advisory
Full E2E, and release Gate A3 ownership without duplication.
GitHub ruleset selection and an exact-head workflow run remain external
evidence; repository registration does not claim either control is configured.

## CH-0015H Command Palette ownership

`ci.pro-visual-policy` remains the sole browser owner and keeps its one-script
package closure SHA-256
`e405cb73f95c111fb19dd7bbb4886c760841f8a08afcf0ba5bdb7e99482e3fa3`.
Five stable identities were added to the existing Chromium/WebKit matrix; no
new gate, project, retry, timeout, filter, shard, cadence, workflow, Full E2E,
or release Gate A3 substitute was introduced. Direct manifest discovery
remains 26 gates / 376 classified sources.

The identities own Meta/Control, Consumer/Pro, desktop/390x844, one named
`aria-modal` dialog, input entry, background inertness/tree concealment,
Tab/Shift+Tab, input/action Escape, backdrop, semantic replacement/fallback,
editable and Preview suppression, repeated open, Plans/other-modal blocking,
newer registered visual/focus ownership, requested/current design/project/
audience/editor-mode/Preview/unmount cancellation, filter/order/disabled and
first-enabled Enter behavior, pointer exact-once history, close-before-action
execution, and overflow. Closed assertions use the stable Palette test ID so a
hidden mounted duplicate cannot satisfy absence.

The focused static prerequisite remains inside `test:design-page-cleanup`. It
locks shared `EditorDialog` composition, additive active-modal query, typed
session fields, semantic candidates, command scope wiring, registry-derived
direct-root z-stack plus reversible Palette visual supersession, query
consumption, exact-once execution, and a
synthetic action-created-dialog sequence in which close must occur first.
Browser hit-testing separately proves the ordinary Palette is above editor
chrome and a registered Guest Save owner nested under a lower stacking context
is interactive while Palette is visually withdrawn, with stack indices 0/1.
Current command inventory has no direct registered-dialog opener;
the executor contract covers future additions without altering current IDs.

## Canonical inventory

`scripts/required-test-manifest.json` is the single machine-readable owner for
required and advisory gate classification. `package.json` remains the command
owner; the manifest points to those commands and verifies their recursive test
sources instead of duplicating their shell bodies.

The manifest currently classifies 256 `scripts/test-*` files as risk-triggered
tests, 101 Playwright specs as release-only browser inventory, 14 imported
cabinetry/multi-room browser modules, and 8 imported cabinetry script-test
modules, for 379 classified sources in total. The sorted path-set hashes make a new,
deleted, renamed, or moved test source a blocking manifest-review event. Static
registration contracts additionally prove every split-suite registration is
imported and invoked, so removing an import/call cannot silently exclude an
unchanged module. Critical requirements use stable IDs, source paths, test
titles, and browser projects rather than relying on a total test count alone.

Playwright attributes tests declared by split modules to the module file, not
the importing aggregator. The manifest therefore names the registration groups
whose runnable `.spec.ts` file owns those module records. Validation requires
every registered module to contribute at least one record in every required
project before records are attributed to the owner. The owner is counted once;
non-registering helpers remain classified supporting sources and are not
invented as runnable tests.

Repository-controlled cadence is explicit:

- `merge-required`: the `stable-checks` job invokes the named package command
  and shell/process failure remains blocking;
- `release-blocking`: evidence is validated before Vercel Gate A3 certification
  or by the existing cabinetry release-evidence validator;
- `advisory`: the full development/staging E2E inventory runs only by required
  manual exact-SHA dispatch, PR label `run-full-e2e`, or nightly staging
  schedule in its own non-required workflow; its real failed or cancelled
  conclusion and dishonest evidence remain visible and are never accepted as
  release certification.

The 27-gate inventory includes the required Git-history secret scan, code
quality, CH-0016 artifact-contract and runtime smoke, authorization/security,
database migration process, persistence, Stripe, Phase 14/15, Consumer/Pro
capability boundaries, cabinetry unit/accessibility/performance and release
evidence, design guards, typecheck, zero-warning lint, the complete floor-plan
umbrella (including live progress), catalog/materials, asset availability,
Chromium/WebKit Pro visual policy, the Chromium/WebKit responsive public-share
gate, the Chromium/WebKit Selection Tray lifecycle gate, the Chromium/WebKit My
Designs parent/nested-delete lifecycle gate, the Guest Save Prompt lifecycle
gate, the Retailer Confirmation lifecycle gate, the Floor Plan Upload
lifecycle gate, and final merge-result
aggregation. Gate A3 discovers all 101 current
browser specs and separately locks the six repaired
commerce/Kelsey requirement identities; cabinetry release evidence owns 23
named Consumer/Pro workflows. CH-0016 runtime smoke locks its two runtime
requirement identities.

## CH-0015G canonical Retailer Confirmation owner

`ci.retailer-confirmation-accessibility` is the sole merge-required browser
owner for `tests/required/retailer-confirmation-accessibility.spec.ts` and
`playwright.retailer-confirmation.config.ts`. Its two-script closure first
builds the actual CartSidebar fixture and runs
`scripts/test-retailer-confirmation-static.tsx`. That prerequisite proves typed
generation/scope/snapshot/exact-once behavior; zero/one/three/four, bundle,
duplicate, missing and unavailable counting; stable IDs; unchanged row bypass,
tracking/fail-open/UTM/pacing; and unchanged Guest Shopify ownership.

Twelve stable identities execute once in Chromium and WebKit: **24/24**, zero
retry, skip, annotation, flake, grep, inverse-grep, filter, shard, `.only`, or
timeout increase. Coverage owns global/group pointer and keyboard entry,
role/name/modal state, close focus/ring, Tab/Shift+Tab, full-viewport inert/
hidden background, Escape/backdrop/close/cancel, exact-once Continue, tracking
failure, same-tab navigation, semantic replacement/fallback, newer-dialog
ownership, scope/route/unmount, direct/confirm boundaries, duplicate URL,
bundle/exclusion/missing/unavailable/row behavior, Guest/Consumer/Pro parity,
desktop/390×844 containment, overflow, and duplicate IDs. Tracking and
destination boundaries are synthetic and contact no merchant.

The runnable spec remains under the gate-declared `tests/required` root,
outside advisory Full E2E and release Gate A3 discovery. Exact config, report,
process-exit, project, stable-ID, source, prerequisite, and nonzero-discovery
validation fails closed. Stable checks invoke it after strict build. Canonical
package closure is 2 scripts with SHA-256
`808a1bf39daa58ac4e0e7a0599ecdb9782abd2beeec7c2d434e2ca3e49bbc836`.
Derived inventory advances from 25 to **26 gates** and stays **376 classified
sources** because its TSX/spec/config/fixture/builder sources are explicit gate
sources outside broad inventories. External GitHub ruleset enforcement and an
exact-head hosted run remain unverified.

## CH-0015F canonical Guest Save Prompt owner

`ci.guest-save-overlay-accessibility` is the sole merge-required browser owner
for `tests/required/guest-save-overlay-accessibility.spec.ts` and
`playwright.guest-save-overlay.config.ts`. Its prerequisite
`scripts/test-guest-save-overlay-static.tsx` remains registered in
`ci.design-cleanup` and renders closed/open semantics, proves typed reason
preservation and generation/scope/exact-once consumption, locks the three
semantic openers, and retains the existing Save, AI, and checkout call sites.

Eight stable identities execute once in Chromium and WebKit against the strict
production artifact: **16/16**, zero retry, skip, annotation, flake, grep,
inverse-grep, filter, shard, `.only`, or timeout increase. The matrix covers
Save/AI/checkout pointer and keyboard paths, one modal/name/initial focus,
Tab/Shift+Tab, parent inert/hidden ownership, Escape/backdrop/close zero
continuation, explicit Not now exact once, primary duplicate guard,
reason-specific return, responsive remount, opener removal/fallback,
route/design/workspace/mode/auth/unmount invalidation, newer-dialog
supersession, reopen, Consumer guest and authenticated Pro parity, desktop and
390x844 containment, focus ring, overflow, and duplicate IDs. AI and checkout
network boundaries are synthetic and no model or merchant is contacted.

The runnable spec stays under the gate-declared `tests/required` root, outside
advisory Full E2E and release Gate A3 discovery. Exact config, report,
process-exit, project, stable-ID, source, prerequisite, and nonzero-discovery
validation fails closed. Stable checks invoke the gate after the strict build;
merge-gate still consumes stable-checks. Canonical package closure is 2 scripts
with SHA-256
`c39ee6ba1530d042c500662969f56b81b728ee7f4b6d644dc5420db54d3b254e`.
Derived inventory advances from 24 to **25 gates** and remains **376 classified
sources** because the new focused TSX/spec/config are explicitly owned rather
than part of broad discovery. External GitHub ruleset enforcement and an
exact-head hosted run remain unverified.

## CH-0015D canonical My Designs owner

`ci.my-designs-overlay-accessibility` is the sole merge-required browser owner
for `tests/required/my-designs-overlay-accessibility.spec.ts` and
`playwright.my-designs-overlay.config.ts`. The static guard
`scripts/test-my-designs-overlay-static.tsx` remains registered under
`ci.design-cleanup`; the focused gate consumes it as a prerequisite that renders
closed/loading/empty/populated/nested contracts, proves semantic opener and
delete-return ordering, retains the first-use lazy import, and guards the
unchanged persistence deletion path before browser execution.

Eight stable identities execute once in Chromium and WebKit against the strict
production artifact and explicit isolated database: **16/16**, zero retry,
skip, annotation, flake, grep, inverse-grep, filter, shard, or timeout change.
Coverage owns pointer/keyboard, Consumer/Pro, desktop/390×844, role/name/modal,
initial focus, Tab/Shift+Tab, Escape/close/backdrop, direct return and opener
replacement/fallback, loading/empty/populated, single/bulk cancel/success,
parent inert/hidden nested ownership, failure, busy duplicate guard,
current-design detach, surviving-row/empty hierarchy, newer-dialog
supersession, reopen, route unmount, no overflow/clipping/duplicates, and lazy
resource entry.

The runnable spec deliberately remains under the gate-declared
`tests/required` root, so advisory Full E2E and release Gate A3 do not discover
or double-own it. Exact config/report/process validation fails closed on a
missing/renamed/skipped/retried/flaky/filtered/focused/zero-discovery record.
Stable-checks invokes the package command after the strict build and after the
already-isolated migration step; merge-gate continues to consume
stable-checks. The derived manifest advances from 23 to **24 gates** and keeps
**376 classified sources** with unchanged five inventory counts/hashes because
the three new focused sources are explicit gate sources. External GitHub
ruleset enforcement and an exact-head hosted run remain unverified.

## CH-0015C canonical Plans dialog owner

Existing `ci.pro-visual-policy` remains the sole merge-required owner for
`tests/e2e/pro-visual-policy.spec.ts`; no gate, config, or runnable source is
added. Its stable identity inventory expands from five to ten. The five Plans
identities cover direct Account pointer, direct Account keyboard plus 390×844,
nested Upgrade pointer, nested Upgrade keyboard plus newer-modal supersession,
and route-unmount plus Free/Pro billing preservation.

All ten identities execute once in Chromium and once in WebKit, producing 20
required records with zero retry, skip, annotation, grep, inverse-grep, shard,
or timeout change. Canonical local result: **20/20**; the five Plans identities
pass 10/10. Coverage proves role/name/modal state, exactly one active Plans
owner, intentional focus, deterministic Tab/Shift+Tab, topmost Escape/backdrop,
direct/nested semantic return, Upgrade inertness and ownership resumption,
opener replacement/removal, newer-modal and route/unmount cancellation,
reopen, narrow containment/focus ring, Consumer denial, Pro state, and unchanged
monthly checkout payload.

The manifest remains 23 gates / 376 classified sources with unchanged path-set
inventories and hashes. Stable IDs/titles make missing or renamed Plans
coverage fail truthfulness. The existing Stripe/Pro static owner retains
pricing, checkout, portal, and entitlement contracts; advisory Full E2E cannot
substitute for this required owner and was not run.

## CH-0015B canonical Client Preview command-bar owner

Existing `ci.pro-visual-policy` remains the sole merge-required owner for
`tests/e2e/pro-visual-policy.spec.ts`; no gate or runnable source is added. Its
stable identity inventory expands from two to five:

- Consumer/Pro visual-theme policy;
- Cabinet Preview readability policy;
- Client Preview command-bar focus exclusion and semantic restoration;
- responsive/scope-cancelled/Consumer-denied/Pro-enabled Client Preview;
- presentation-export entry parity.

All five execute once in Chromium and once in WebKit, producing 10 required
records with zero retry, skip, annotation, grep, inverse-grep, or shard. The
canonical local result is 10/10; the three new identities pass 6/6. The new
coverage proves one command-bar root, native inert and accessibility-tree
exclusion, zero effective focusable descendants, blocked pointer and
programmatic action routing, visible Exit focus, semantic return/fallback,
generation and scope cancellation, actual export entry, Consumer denial, Pro
success, and 390×844 behavior.

The manifest remains 23 gates and 376 classified sources. All five inventory
counts and sorted path SHA-256 values are unchanged because CH-0015B adds no
test source. Stable IDs/titles make missing or renamed coverage fail
truthfulness. Advisory Full E2E and release Gate A3 may still discover this
spec at their separate cadences but cannot substitute for the merge-required
owner.

## CH-0015A canonical cart overlay owner

`ci.cart-overlay-accessibility` is the sole merge-required owner for
`scripts/test-cart-overlay-static.tsx`,
`tests/required/cart-overlay-accessibility.spec.ts`, and
`playwright.cart-overlay.config.ts`. Its package prerequisite renders the
closed, empty-open, and populated-open component contracts before the browser
phase. Eight stable browser identities execute in Chromium and WebKit, giving
16 required records with zero retry, skip, annotation, filter, or shard.
The static prerequisite also proves populated unique actions and that Clear,
Remove, and decrement-to-zero focus a surviving modal control before mutation.

The runnable spec deliberately lives under the gate-declared
`tests/required` root. It is therefore not discovered by advisory Full E2E or
release Gate A3, whose 101-spec inventory and configuration are unchanged.
Truthfulness now validates a safe explicit repository test root, normalizes
report files against it, and includes positive and traversal-negative fixture
coverage. Runnable-owner enforcement also includes `scripts/test-*.tsx` and
specs below `tests/required`, so neither source class can acquire a duplicate
required owner. A mismatched report root still fails closed. The manifest advances
from 22 to 23 gates while its classified inventory remains 376 sources; these
three focused files are explicit sources of the new gate rather than members
of the broad Full E2E inventory.

## CH-0013 canonical surface-material owner

`ci.catalog-materials` now owns `test:surface-material-semantics` in the
existing post-build catalog-quality step. Its 12-script gate closure has
SHA-256
`7ea65dfdc5ea31aac049836764123a9bc5a2e80b3af30c36bb42c34d8755b5e0`.
Required command-source validation proves the schema, browser-helper, and
focused Phase 8 source remain reachable. Fifteen named contribution markers
must remain inside executable assertions and bind YAML/render/lazy parity,
fixture exclusion, texture/UV, 2D/3D,
persistence, browser grouping/filtering, variants/Nippon, BOM/export,
publication negatives, and lazy/bundle boundaries.

The already-required production-artifact build retains the only generator
drift execution before the strict build. The semantic command therefore
consumes fresh exact-source projections without duplicating that command or
the full Phase 8 gate. New negatives reject a missing required command source,
a missing registered executable contribution, and filtered, skipped, retried,
`.only`, or fail-open command mutations independently of the closure hash, in
addition to the existing missing/renamed source, zero-discovery,
duplicate-owner, advisory-only, stale-inventory, and imported-contribution
cases. Exact CI step names, the post-build ordering, the combined fail-fast
invocation inside its declared owner step, and workflow-level fail-open syntax
are also validated. Package-level failure swallowing rejects equivalent
`||true`, `|| :`, and `; exit 0` forms after hash regeneration.

The path inventories are 253 script tests at
`4b3aac7e5b284060e26d4e62810494020c8b367b371cc27282a7fa0357a5b9e3`,
101 browser specs at
`b4e63b256df544fa8009e1dc5bf393251ff3cb68fa2d3caee6fa7d5dde521875`,
6 cabinetry browser modules at
`805b0ec8a0d24658c0cb5e01616fb1a684c8dc2aae81b6338f3d1b87fd6fafa9`,
8 multi-room browser modules at
`e701b0ff04421c8eca749fdd8e6daffcd0c0fbb987226ec2319bdcee8d368851`,
and 8 cabinetry script modules at
`55ed53e1acde7854a321a3a6480aba3c2c89636d9227057d66341bfd845d6696`.
The exact suite inventory and rollback are in the CH-0013 security/quality
record.

## ARCH-RC55 canonical responsive owner

Before ARCH-RC55 ownership remediation, the static contract was only a manual
risk-triggered command. The browser spec was discovered by
`advisory.full-e2e` and `release.gate-a3`, but neither provided merge-required
ownership and `stable-checks` invoked neither responsive source.

| Source | Previous execution | Canonical required owner |
| --- | --- | --- |
| `scripts/test-public-share-responsive.ts` | Manual `test:share-responsive-unit`; risk-triggered inventory only | `ci.public-share-responsive` static phase |
| `tests/e2e/share-responsive.spec.ts` | Advisory full inventory and release Gate A3 discovery | `ci.public-share-responsive` Chromium/WebKit phase |
| `playwright.share-responsive.config.ts` | Manual focused configuration, also selecting `04-share.spec.ts` | Exact config for `ci.public-share-responsive`, selecting only `share-responsive.spec.ts` |
| `tests/e2e/beta-seed.ts`, `tests/e2e/fixtures.ts`, collision fixture | Imported helpers/fixture, not independent runnable specs | Required supporting sources of `ci.public-share-responsive` |

The canonical command is
`npm run test:public-share-responsive-required`. Its two-script package closure
(SHA-256
`d554bcd17619cead3de0012153f24a352b71dd45719262e0a7902c7453a033fe`)
runs the static contract first, then the required-test runner with the exact
responsive configuration. The Playwright invocation has no title/path/project
filter and no shard; the configuration declares exactly `chromium` and
`webkit`, zero retries, one worker, `forbidOnly`, and only the four responsive
test identities. A required run disables trace, screenshot, and video capture,
does not reuse an existing listener, and writes only the canonical JSON report
plus evidence envelope under ignored `.local/required-test-evidence/`.
The evidence-producing runner itself executes the declared static prerequisite,
then rechecks source cleanliness; it is not merely labeled by an outer shell
command. Direct runner invocation fails unless the exact staging, strict-catalog,
and production-server environment is active, and required-mode configuration
throws instead of falling back to `npm run dev`.

`stable-checks` invokes the command after database migration, the pristine
strict staging build, Chromium/WebKit installation, runtime smoke, and safe
production-evidence preparation. The command forces `npm run start` against
that existing `.next` output; it cannot select `next dev` or compile a second
development artifact. The step has no fail-open policy, so failure makes
`stable-checks` fail and the existing `merge-gate` aggregation rejects the PR.
No second required job or duplicate required invocation exists.

At implementation snapshot `729caae`, the first canonical command passed the
static prerequisite and all four WebKit records, then failed all four Chromium
records without retry. Each Chromium failure was a strict-locator rejection:
two identical `public-share-root` elements coexisted while resolving. An ignored
read-only timing diagnostic confirmed the runtime transition `1 resolving → 2
resolving → 2 (resolving, ready) → 1 ready` over about 1.17 seconds. The runner
correctly rejected its process/report/aggregate result. This is application
evidence exposed by registration, not a truthfulness bypass; product and test
behavior remain unchanged pending separately authorized production work.

`advisory.full-e2e` may still discover the same spec through the broad default
configuration, and `release.gate-a3` still includes it in its complete release
inventory. Those executions remain advisory and release-wide respectively and
cannot substitute for `ci.public-share-responsive`. The direct runnable source
owner check rejects any second merge-required owner. Imported test-module
registration still requires a contributing report record before attribution;
non-registering helpers are not counted as specs.

Final inventory metadata is 22 gates and 373 classified sources:

| Inventory | Count | Sorted path SHA-256 |
| --- | ---: | --- |
| `script-tests` | 251 | `34354f2440b3671752b14d298aa37c548bdcb1c7aca7b5367c370cc765fb7cd3` |
| `browser-specs` | 100 | `c80ed50279d95e08f94726784270ef887459703ec7aaaa113a3226a3268bcd07` |
| `cabinetry-browser-modules` | 6 | `805b0ec8a0d24658c0cb5e01616fb1a684c8dc2aae81b6338f3d1b87fd6fafa9` |
| `multi-room-browser-modules` | 8 | `e701b0ff04421c8eca749fdd8e6daffcd0c0fbb987226ec2319bdcee8d368851` |
| `cabinetry-script-modules` | 8 | `55ed53e1acde7854a321a3a6480aba3c2c89636d9227057d66341bfd845d6696` |

The negative suite rejects a missing static source or browser spec, stale path
hash, wrong Playwright config, Chromium-only or WebKit-only execution, grep or
shard narrowing, zero discovery, skip, retry/flake, `.only`, process/report
disagreement, aggregate-count disagreement, duplicate merge-required owner,
and registered-owner reports with no imported-module contribution. External
`merge-gate` ruleset selection remains `not-verified` and was not modified.

## Truthful pass contract

A required Playwright pass proves all of the following:

1. the canonical command ran and its real process exit code is zero;
2. the report was freshly created inside the recorded process interval;
3. the report is readable JSON with a matching SHA-256;
4. `forbidOnly` is enabled and no grep, inverse-grep, or shard filter narrowed
   the suite;
5. the required source inventory, stable test identities, and browser projects
   were discovered exactly once;
6. every required test executed once and passed with no skip, retry, flake,
   annotation, expected-failure substitution, or not-run outcome;
7. aggregate counts match parsed per-test results;
8. the report identifies the canonical Playwright configuration and test root;
9. source commit, production artifact, and staged URL identities match where
   the gate requires them;
10. missing, malformed, truncated, tampered, stale, future-dated, filtered, or
    secret-bearing evidence fails closed.

The runner deletes an existing report before execution, canonicalizes repository
paths to `<repository-root>`, hashes the report, and writes a small evidence
envelope containing only gate/source/artifact identities, UTC timings, the real
process exit, report path/hash, result, and diagnostics. It never records an
environment dump, credentials, cookies, private designs, or machine-local
repository paths.

CI never uploads this raw directory. After an advisory runner result,
`evidence:required-tests:prepare-upload` requires the process envelope and
Playwright JSON report, verifies their source/hash/process/project/totals
relationship, and writes a safe failing-or-passing summary. Mandatory malformed
or unsafe JSON rejects the complete bundle. Optional diagnostic text is decoded
as strict UTF-8, normalized from Linux/macOS/Windows/home/temp paths to
`<WORKSPACE>`, and retained only under `optional-diagnostics/`; unsafe optional
files are omitted with a safe path, category, reason code, and original SHA-256.
Screenshots, videos, traces, archives, and other binary/uninspectable files are
never copied. A retained/omitted inventory makes omissions explicit. The staged
tree is rescanned and atomically published as `.local/required-test-upload/`;
every failure removes both staging and canonical output.

Process-only gates remain direct package commands or `&&`-chained umbrellas, so
missing executable files and nonzero child results already stop the command.
The manifest audit verifies a stable hash of every recursively reachable package
script body—41 scripts for the critical-domain umbrella, 56 for floor-plan, and
8 for catalog/materials—so a nested child, fail-open operator, or scope-changing
flag cannot silently disappear behind an edited umbrella.

## Commands

Static inventory and negative contract:

```sh
npm run test:required-test-truthfulness
node scripts/required-test-truthfulness.mjs check
npm run evidence:required-tests:prepare-upload
```

Broad E2E visibility, deliberately advisory:

```sh
npm run test:e2e:advisory
```

Exact staged-artifact Gate A3 evidence:

```sh
PLAYWRIGHT_RELEASE_BASE_URL='https://staged.example.vercel.app' \
REQUIRED_TEST_ARTIFACT_SHA256='<sha256 from .vercel/prebuilt-manifest.json>' \
  npm run test:e2e:release

GATE_A3_CERTIFIED_DEPLOYMENT_URL='https://staged.example.vercel.app' \
  npm run release:vercel:certify -- \
  .vercel/gate-a3-required-test-evidence.json
```

`release:vercel:certify` validates the evidence envelope, its hashed Playwright
report, exact source/artifact/staged URL, full checked-in spec inventory, and
per-test outcomes. A raw Playwright report is no longer certification input.

## Fail-closed coverage

`scripts/test-required-test-truthfulness.mjs` uses temporary directories and the
real exported validator. It covers a complete pass plus missing/renamed source,
zero discovery, missing project, filtered scope, skip, retry/flake, focused
`.only`, annotated early return, nonzero child with passing JSON, zero child with
failed JSON, missing/malformed/stale report, source mismatch, artifact mismatch,
advisory failure visibility, and secret-bearing report fields. CH-0016 and
cabinetry validator suites additionally exercise their actual integration with
the two runtime, six commerce/Kelsey, and 23 cabinetry stable identities,
project coverage, focused execution, and retry rejection.

The Outcome-D negatives additionally cover imported-module-to-aggregator
attribution, an owner with no contributing module record, missing/reclassified
registered modules, duplicate ownership, Linux GitHub/macOS/Windows/temp paths,
nested JSON/Markdown/log evidence, advisory error contexts, shaped and generic
credentials, API/access-key fields, binary/archive bytes disguised with a text
extension, unsafe cleanup targets, final-audit failure, and the invariant that a
failed preparation leaves no upload directory.

The formerly annotated early-return prerequisites in `05-buy.spec.ts` and
`07-kelsey-variants.spec.ts` now fail their tests when canvas, catalog, product,
variant, selection, cart, or buyer controls are absent. This can expose a red
commerce gate; that is truthful release evidence, not a reason to weaken an
expectation.

The cabinetry GLB export behavior check also no longer catches a missing
`FileReader`, prints a skip message, and returns success. It installs a bounded
Node-compatible `FileReader` shim for the test, restores the prior global after
execution, and always reaches the export assertion.

## Outcome D external evidence and remediation

The exact-head GitHub run for `b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`
(`30658564565`, attempts 1 and 2) passed secret scan, 42 migrations, the
truthfulness suite, the CH-0016 evidence contract, and the strict build. Both
attempts then failed the furnished-template case at the same implicit
five-second diagnostic poll while the health/catalog case passed. The advisory
job ran and retained honest failures, but Playwright attributed cabinetry and
multi-room tests to imported modules, producing false missing-aggregator and
out-of-scope-module diagnostics. A retained `error-context.md` also exposed a
`/home/runner/work/...` path. Required smoke failure correctly prevented the
stable production bundle.

The furnished fixture is created and persisted by the browser in local storage;
GLB loading, normalization, bounds, and selection diagnostics are computed
client-side. There is no database transaction, API authorization, worker, or
scheduler in that readiness path. HTTP completion was being treated as model
readiness, then Playwright's default five-second poll was used for asynchronous
decode/normalization. Two external failures plus a clean CI-shaped local pass
classify the cause as a **test synchronization defect**. Diagnostics now expose
the existing semantic model lifecycle (`loading`, `ready`, or terminal `error`
with a safe code); the required case waits on that bounded observable state and
emits phase, elapsed time, fixture identity, safe request/response counts, and
current diagnostics without weakening selection, bounds, remount, reload, or
render-loop assertions.

Local focused validation passed the two runtime identities with process exit 0
and no failed/flaky/skipped result. Truthfulness, production-evidence,
cabinetry-evidence, critical-domain, floor-plan, typecheck, code-quality,
generated-runtime, asset-inventory, and catalog-asset checks also passed. Full
lint, design cleanup, and catalog audit retain the same inherited failures
recorded in the code-health handoff; no exception, threshold, baseline, or
expectation was changed.

## Exact-head 701aaa follow-up

GitHub Actions run `30684560486` attempt 1 proved the pre-smoke contracts and
strict build, then truthfully rejected required smoke: health/catalog passed,
while the furnished-template identity reached semantic GLB readiness but the
manually duplicated 240-second whole-test timeout expired during a later body
assertion (about 4.3 minutes). The fix does not alter production GLB behavior,
remove a reload, introduce a retry, or downgrade the identity. One canonical
14-phase table budgets every sequential setup, navigation, fixture creation,
fixture reload/2D readiness, combined initial GLB loading and selection
verification, lifecycle, bounds, render-idle, remount, three reload,
persistence, and final-state phase. Its 585,000 ms sequential sum plus 15,000 ms each for
fixture setup, fixture teardown, and assertion scheduling and a documented
30,000 ms orchestration margin mechanically derives the 660,000 ms Playwright
whole-test timeout. Every phase has its own preemptive timeout, and terminal GLB
`error` still rejects immediately. The strict phase JSON records only relative
start, elapsed time, outcome, phase budget, lifecycle state, and a safe category.
Its schema and encoding are closed; canonical order must be non-overlapping,
every phase end must remain inside the derived whole-test envelope, and a passed
phase cannot claim terminal `error` state.

The same external run's 232-test advisory job reported 107 passed, 92 failed,
and 33 not run with process exit 1, but its environment used the structurally
invalid `gate-a3-ci-google-client-secret-placeholder`; those results are not a
clean product baseline. Stable and advisory CI now call one repository-owned
synthetic OAuth fixture policy. The policy is committed once in
`scripts/ci-auth-fixture.json`, outside the application build graph; each pair
is generated only in exporter memory. CI transports it only as exactly three
allowlisted single-line assignments in runner-owned `GITHUB_ENV`, whose real
path must exist outside the checkout. The exporter registers both generated
values with `add-mask` before the write, and the immediately following step
validates propagation. It never prints fixture values or runner paths outside
the required masking command, writes a workspace transport, uses `BASH_ENV`, or
places values in workflow YAML, command arguments, outputs, summaries,
artifacts, manifests, or JSON diagnostics. Pair detection in
`lib/auth-env.ts` requires explicit CI/test activation and a canonically resolved
`development` or `staging` environment; missing, invalid, and Vercel-production
classifications reject it. The pair is never an implicit application or
production fallback. Before browser installation,
the advisory job validates that exact environment, starts the same Next.js app,
and requires `/api/auth/session` to return structured JSON without Auth.js HTML
or `ClientFetchError` signatures. Unit coverage retains trimming policy while
rejecting absent, quoted, whitespace-only, truncated, malformed, mismatched,
implicit, and production fixture use.

The exact synthetic pair also installs a provider-local Auth.js `customFetch`
boundary. It serves only Google's canonical discovery document from inert
in-memory metadata and rejects every other provider request; normal Google OAuth
continues to use Auth.js discovery unchanged. The real advisory launcher disables
Next telemetry, requires exactly one value-free inert-discovery marker after the
providers/CSRF/sign-out/Google-sign-in route sequence, and fails if either raw
generated fixture value enters server output. Focused tests prove the discovery
shape, marker, blocked token/non-GET requests, exact-pair activation, and
non-activation for normal Google credentials.

The merge-required authorization boundary now also includes the focused
`interior-ai.ci-auth-fixture-command-result.v1` regression owner. Every export,
validation, production-misuse, and preflight command requires an explicit
runner-temp result root/path/nonce and a canonical checksum-closed sidecar;
stdout/stderr are human logs only. Validation retains safe classifications,
production misuse requires the exact structured production-prohibition proof,
and preflight retains safe session/server/cleanup evidence without bodies,
cookies, sessions, CSRF values, credentials, database URLs, or private paths.
The required workflow validates each result with the shared reader. Database
plan stdout and certification-stage result routing are unchanged.

The run's flooring error context was the exact optional file rejected for
prohibited environment output; no diagnostic contents were copied into this
record. It is now omitted without discarding the mandatory failing report. The
mandatory pair is bound to the registered advisory command, exact checkout SHA,
configured project, process exit, canonical/fresh timing envelope, report hash,
full validator diagnostics, and a conclusion that cannot contradict the report.
Production-artifact, release-candidate, release-environment, and Gate A3 URL
bindings must remain null. Unsafe optional filenames are represented in the
omission inventory only by a stable SHA-256 path identifier so a secret-shaped
name cannot eliminate the safe bundle. The
advisory job consumes no stable-checks output, artifact, database, or environment
state and has its own exact-head checkout and PostgreSQL service, so its
`needs: stable-checks` edge was removed. `merge-gate` still depends only on
`secret-scan` and `stable-checks`; the advisory conclusion remains separately
visible and non-required.

Gitleaks still scans the full checkout with the official v2 action and writes
`results.sarif`; its automatic workspace-root artifact upload is disabled. A
repository-owned atomic staging step validates strict SARIF JSON and rejects
runner paths, preserves the SARIF bytes, and uploads only root-level
`results.sarif` plus `artifact-manifest.json` from `.local/gitleaks-upload/` at
the existing 90-day policy. The next real artifact download must still verify
the ZIP entry layout.

Focused local validation passed the phase derivation/terminal/timeout tests,
required-test truthfulness, production evidence, auth hardening, live auth
preflight, GLB bounds, cabinetry evidence, complete critical and floor-plan
umbrellas, typecheck, targeted zero-warning ESLint, code-quality ratchets,
generated-runtime drift, strict asset inventory, and catalog asset availability.
A development smoke exercised all phases in about two minutes; its final check
correctly reported two 500 console errors caused by the deliberately nonexistent
local fallback database. The required 2/2 result and production evidence hashes
are therefore taken only from the final clean detached, migrated-database proof.
The inherited catalog audit remains five invalid Hamilton enum values in three
unchanged YAML files.

## Exact-head 8cb7cae Outcome-C correction

Run `30707099465`, stable job `91387983537`, passed checkout, migration,
truthfulness, production-evidence, strict-build, and OAuth validation steps, then
failed `Run runtime smoke tests` when `bounds-verification` exhausted its
20,000 ms budget. Runner metadata after `Configure synthetic CI OAuth fixture`
also exposed `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`CI_AUTH_FIXTURE_ACTIVE`; no value is reproduced. The values were synthetic,
not derived from repository or organization secrets, and not a registered
externally authenticating Google client/secret.

Three clean CI-like executions against an isolated migrated PostgreSQL database
passed 2/2, with zero failures, flakes, skips, or retries. Bounds started/ended
at 29,192/36,668 ms, 29,685/36,793 ms, and 29,579/36,832 ms: elapsed 7,476,
7,108, and 7,253 ms. Each completed only after diagnostics settled, one further
second elapsed, bounds material-change deltas remained zero, and lifecycle was
recorded `stable`; whole bodies completed in 119,946, 123,137, and 119,869 ms.
The phase budget is 45,000 ms, leaving 37,524 ms over the slowest local result
and a bounded CI margin above the externally exhausted ceiling. The sequential
sum is 610,000 ms and the unchanged 75,000 ms named overhead derives a 685,000
ms whole-test timeout.

The runtime-generated nonce is shared only between the client-ID and secret
shapes; it is random, unregistered, unrelated to any GitHub secret, and the
policy declares external authentication incapable. Both values are registered
with `add-mask` before the only `GITHUB_ENV` append. Exact allowlisting,
single-line validation, outside-workspace realpath checks, next-step structural
validation, `/api/auth/session` JSON preflight, explicit CI/test activation,
and production exclusion remain fail closed. Tests reject write-before-mask,
wrong mask/value binding, non-allowlisted keys, CR/LF, workspace/symlink
transports, mismatched pair fingerprints, production use, and the retired fixed
fixture pair in both production and non-activated development.

## Required and full-advisory workflow separation

Previously `.github/workflows/ci.yml` owned `secret-scan`, `stable-checks`,
`e2e-full`, and `merge-gate`; every ordinary `pull_request` synchronize event
made the `e2e-full` condition true. Although `merge-gate` already needed only
`secret-scan` and `stable-checks`, the approximately two-hour advisory suite ran
on every narrow branch update and shared the required workflow's cancellation
domain.

The required workflow now owns only `secret-scan`, `stable-checks`, and
`merge-gate`. Every relevant PR update retains exact-head checkout, migrations,
masked OAuth export and structural validation, a live structured
`/api/auth/session` preflight, auth hardening, code-quality and truthfulness
contracts, strict production build, unchanged `npm run start` smoke identities,
evidence bundling, fresh standalone extraction verification, the remaining
required checks, and aggregation. The truthfulness step is the lightweight
advisory evidence preflight: its fixture cases preserve a representative failed
process/report pair, safe retained content, hashed omissions including redundant
`.last-run.json`, exact archive inventory, and rejection of hidden, extra,
environment, OAuth, credential, database, binary, or raw Playwright content. It
does not launch the application-wide E2E suite.

`.github/workflows/full-advisory-e2e.yml` is the canonical owner for
`advisory.full-e2e`. It is triggered only by a required exact `source_sha`
manual dispatch, adding `run-full-e2e` to a PR, or a nightly checkout of
`refs/heads/staging`; ordinary PR synchronize is not an event type. Label runs
checkout and compare the PR head SHA, manual runs compare the required input,
and scheduled runs record the resolved staging HEAD before migrations or
browsers. The full suite retains the canonical `npm run test:e2e:advisory`
runner, all 98 spec sources/current discovered records, real child exit and
counts, sanitized evidence, omission inventory, exact archive agreement, and
30-day upload. The separate job has no `continue-on-error`, so a child failure
remains a failed workflow without becoming merge-required. Its
`full-advisory-*` concurrency group can cancel an obsolete full-advisory run for
the same PR/ref but cannot cancel or gate required CI; a cancelled job skips
evidence preparation/upload and remains cancelled.

The manifest records the advisory workflow path as part of CI ownership. A
missing or renamed file, job, step, or package invocation fails repository
validation. The gate inventory remains 21 and no required gate changed cadence.
The source inventory advanced from 365 to 368 solely because CH-0029 added
three risk-triggered focused scripts; `merge-gate` still depends exactly on
`secret-scan` and `stable-checks`.

## Runtime failure provenance

Runtime smoke timing uses schema version 3 and a closed failure-kind enum:
`phase-timeout`, `nested-operation-timeout`, `no-progress-watchdog`,
`terminal-lifecycle-error`, `assertion-failure`, and `unexpected-error`. Every
failure carries phase identity, elapsed time and budget, last safe checkpoint,
safe lifecycle state, progress observation, and a bounded safe cause summary.
Nested-operation failures additionally require the canonical operation identity,
elapsed time, budget, current `attemptTimeoutMs`,
`remainingAtAttemptStartMs`, and `operationOutcome=timed-out`; their parent
phase must be `failed`. A true phase timeout requires parent `timed-out` and
forbids child identity. Validators reject missing, extra, unknown, unsafe,
budget-drifted, or cross-record-inconsistent fields.

The producer owns one immutable deadline per registered operation. Its
`operationBudgetMs` is resolved from the phase contract, its elapsed time starts
when that operation starts, and polling iterations receive branded attempts
whose decreasing allowances are recorded only in the attempt fields. Neither a
browser evaluation nor the timeout-error constructor can promote its remaining
allowance into canonical evidence. The exact external regression—70,000 ms
canonical reload readiness with a 65,507 ms leaf allowance—remains a validator
negative when 65,507 is presented as the operation budget and is a valid
structured failure when the two values occupy their correct fields.

Canonical expiration also requires `deadlineReached=true`. The owner uses a
high-resolution monotonic start and deadline, retains
`operationElapsedPreciseMs`, and floors only the portable integer
`operationElapsedMs`; remaining allowance is rounded up for the integer timer
conversion so conversion cannot shorten the canonical window. A full-remaining
attempt that fires while integer display is still 69,999/70,000 ms continues
against the same owner until the deadline is actually reached. A materially
early capped attempt is an internal-attempt/unexpected failure and cannot carry
canonical operation-timeout fields. Schema v3 rejects missing deadline proof,
premature precise elapsed values, and integer/precise rounding disagreement.

A final settle evaluation capped below its own 10,000 ms contract is an
internal attempt, not a child canonical timeout. At the 42,000 ms parent
boundary the handler retains that distinction, waits through any fractional
timer residual, and constructs parent timeout evidence only after the parent
deadline predicate succeeds. The failure therefore remains a canonical
`diagnostics-settle` record rather than `unexpected-error` with null operation
fields.

`diagnostics-settle-evaluation` is a canonical 10,000 ms child of the 42,000 ms
`diagnostics-settle` operation. A child evaluation timeout remains attributed to
that child; only exhaustion of the complete settle envelope is attributed to the
parent operation. No-progress records retain the canonical watchdog budget and
originating phase, and terminal/assertion/unexpected failures cannot exceed the
parent phase budget.

The `diagnostics-settle` operation is derived rather than guessed: one immediate
baseline read plus two required stable samples at 500 ms intervals entails three
browser evaluations. Three 10,000 ms evaluation allowances, 1,000 ms assertion
allowance, and 10,000 ms orchestration margin produce its 42,000 ms bound. The
source test must throw `RuntimeSmokeOperationTimeoutError` for nested expiry;
only the actual parent deadline may throw `RuntimeSmokePhaseTimeoutError`.

Stable CI runs `production-artifact-evidence.mjs verify-runtime-failure` before
preparing any always-run failure diagnostic. A coherent real failure remains
visible through the existing safe three-file archive; an ambiguous schema-v2
record, mismatched report/timing pair, wrong budget or outcome, substituted
source/artifact identity, or unsafe diagnostic is rejected and not uploaded.
The verifier recomputes the current checkout, artifact inventory and BUILD_ID,
and validates the canonical manifest/sidecar and report production metadata; it
does not accept identities merely because test and manifest fields agree with
each other.
The successful path remains fail closed and requires no failure provenance.

## External controls and rollback

Repository checks cannot verify which GitHub checks branch protection requires,
whether the workflow ran for the candidate, or whether uploaded evidence was
retained for the requested duration. Attach the actual workflow/run/settings
evidence before treating those controls as verified.

Rollback the workflow-separation follow-up first, then the Outcome-C follow-up
`53a0c98bab4d5a211c93fd1f4f5057806e074bbd`, then
`8cb7cae37d6bb49cd66d61f5523927dc7b64283d`, then the follow-up containing the
exact-head 701aaa remediation, then
the Outcome-D commit, then
`b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`, then the CH-0017 implementation
`c840c06dc2c5e67f463542292bb7391b0f93d731`. That would restore unsafe/raw
retention, timing-dependent smoke, aggregate-only evidence, and advisory
ambiguity and is not an acceptable steady state. Ignored
`.local/required-test-evidence/`, `.local/production-artifact-evidence/`,
`.vercel` reports, and Playwright outputs are regenerated evidence, not source
to commit. GitHub ruleset changes, if separately approved later, require their
own administrator rollback and are not implied by either repository revert.
