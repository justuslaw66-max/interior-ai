# RC47-RC55 archival commit-disposition audit

## Final read-only integration recheck — 2026-08-06

**A. RC47-RC55 CLOSED** at exact application source
`2328f297e43b77e5a82693b1844bce1fe61512f9`.

All authoritative implementation commits in the table below are ancestors.
All nine original archival commits remain recoverable non-ancestors and
`git cherry HEAD release/cabinetry-alpha-rc55` continues to show them only on
the archival side. CH-0030 profiler commit `d7a5069...` also remains excluded.
No archival commit should be cherry-picked, merged, or replayed.

Fresh required public-share coverage passed Chromium 4/4 and WebKit 4/4;
required Pro visual passed 4/4; Consumer/Pro touch targets passed 6/6; and the
original Consumer placement/history spec passed 5/5. The corrected RC52
Workspace-unmount semantic-owner case passed in both engines. The complete
fresh drawer run was Chromium 8/9 and WebKit 9/9 because the Pro-opener case
timed out twice in its shared `openCatalog` setup: an optional `Maybe later`
button disappeared between `isVisible()` and `click()`. The failure occurs
before any drawer focus assertion. It is a separate P2 test-contract race and
does not reopen RC52, but it supersedes any claim that this final audit itself
produced a fresh 18/18 matrix. Fix it before release-wide browser certification.

The code-health count is now **0 unresolved P0 / 12 unresolved P1** because
CH-0019 is resolved by the complete current ancestry. GitHub ruleset
enforcement and the remaining external/release controls are not established by
this local closure.

## Final bounded RC52 WebKit closure — 2026-08-06

**A. RC47–RC55 LOCAL DISPOSITION COMPLETE.**

The bounded follow-up starts from exact documentation checkpoint
`ff5f98db74f44cece2519f0570ee2fdfdbb5b2b1`, whose exact application parent is
`7dddf06249b44c3b447a2fdde98b64b3306be003`, on
`fix/arch-rc52-webkit-workspace-focus`. Entry status, diff/stat/check, and
untracked inventories were empty; the direct manifest was 22 gates / 374
classified sources; and no application server was listening. All nine original
archival commits remain recoverable non-ancestors and evidence only. They must
not be cherry-picked, merged, or replayed.

| RC | Original archival commit | Authoritative current implementation | Current owner modules | Focused evidence | Required gate owner | Final category |
| --- | --- | --- | --- | --- | --- | --- |
| RC47 | `23e12bfe85742acb3bb10ecfb808401b3b63c638` | `e7cd5d9df19439f0956f840b977ddf8c23dc2757` | `CatalogItemDrawer`; exact-product specs 104/143; retained semantic-coordinate coverage | Both named product specs use the unique named modal `dialog`, contain no drawer `.first()` fallback, and passed in the focused Chromium batch | `release.gate-a3` inventory plus focused product checks | **A. RESOLVED_BY_CURRENT_IMPLEMENTATION** |
| RC48 | `e0db6f6661df2870e2f6f6063a7f0d866dd23618` | `faaa463d2f0211fa2ec8f15fe3da1efc3e80c1c1`; `abec1b92b86a0b74193f437aea11033f666adca0`; `d93e34558221e99797ca73791364c016a14ef0cc` | central selection command router; focused tracing listener; synchronized event-time trace state | static keyboard/tracing ownership passed; Chromium rotation/tracing passed 9/9; full code-quality scan passed at HEAD and retained two-clean-worktree exact-commit evidence remains valid | code-quality ratchet and `release.gate-a3` inventory | **A. RESOLVED_BY_CURRENT_IMPLEMENTATION** |
| RC49 | `d41bdf31720918705480a36a44c91347987080bb` | `f2760c529c0a964d99d53dbe73d8fb4a7c8def75` | canonical persistence projection; cloud baseline and load controllers | persistence guardrails passed inside cleanup, `critical-required`, and floor-plan-required; normalization/identity/epoch acknowledgment remains fail-closed | `ci.critical-domain-contracts` | **B. SUPERSEDED_BY_STRONGER_IMPLEMENTATION** |
| RC50 | `ee612c84f5f6c1e5370c7aeb12593cf920fe1967` | `f2760c529c0a964d99d53dbe73d8fb4a7c8def75` | same pending-baseline protocol, including recovery-copy and local/new-design paths | same green persistence evidence; autosave remains blocked until exact canonical acknowledgment | `ci.critical-domain-contracts` | **B. SUPERSEDED_BY_STRONGER_IMPLEMENTATION** |
| RC51 | `27b6a55bccbab5bf9a6556fea04fa4179343e447` | `bb0e4f8f999d774b8490eca16efdc84d6751aafd` | `lib/catalog/compare.ts`; canonical unfiltered product map; compare tray | static compare contract passed; Chromium compare suite passed 8/8 across category, search, price, unavailable/remove-only, and exact-variant behavior | `release.gate-a3` inventory plus focused compare checks | **B. SUPERSEDED_BY_STRONGER_IMPLEMENTATION** |
| RC52 | `637281505493572229be864449d77e3a626c67fe` | `793986d22b073c2d4ba093350b2442838703deb0`; bounded assertion correction on `fix/arch-rc52-webkit-workspace-focus` | semantic opener identity, close-time focus resolver, and semantic Workspace-menu assertion | Traces prove the `detail=0` Workspace open schedules first-menu-item focus in both engines. The former test then moved focus back to the trigger while the menu remained open. The corrected exact case and full matrix pass Chromium 9/9 and WebKit 9/9 with zero retry, flake, or skip. | focused Chromium/WebKit drawer matrix plus `release.gate-a3` inventory | **B. SUPERSEDED_BY_STRONGER_IMPLEMENTATION** |
| RC53 | `b0eab4cbbadf0203667fb750c42fb0e25eb43f62` | cloud `80627fa5a8cae1205999a90c9f2fa240b1df4305`; responsive `83425bad3cc30dc37100d090e79159998782bc29`; projection source `8818ac76d4772271f027e8dc3c8e9cd6b8009229` | execution-time cloud queue/revision; single responsive selection owner; closed snapshot-first public transport | persistence, responsive static, projection/security, share privacy/duplication, and canonical responsive matrix passed | `ci.critical-domain-contracts`; `ci.public-share-responsive`; `ci.floor-plan-required` | **A. RESOLVED_BY_CURRENT_IMPLEMENTATION** |
| RC54 | `588b90e8c526e54d314376f177bdb9c738ac659e` | `29a4c46070404a2426da123bc5b42c0592d95e34` | closed public projection schema/snapshot; public API and duplicate route | projection/security and fingerprint fixtures passed; Chromium share privacy/duplication passed 6/6 including the two share-read-only cases | `ci.floor-plan-required`; `release.gate-a3` inventory | **B. SUPERSEDED_BY_STRONGER_IMPLEMENTATION** |
| RC55 | `4883ffb9fc87248b6aa8624cdef39c5f97a173d1` | responsive `83425bad3cc30dc37100d090e79159998782bc29`; identity `27e78d25477b6e6d9282c59cd3c801e701abee9b`; gate `371feb2641866aba28db0a5332971768bfe283a8`; root lifecycle `840037865531c7bc5fb8ac92d5fccd0b7393d942` | responsive shell; full SHA-256 identity; one canonical manifest/CI owner; sole resolved-root lifecycle | collision fixture/static contract passed; fresh workflow-equivalent Chromium 4/4 plus WebKit 4/4 passed with zero retry, flake, or skip; root ownership remained one | `ci.public-share-responsive` in `stable-checks` | **B. SUPERSEDED_BY_STRONGER_IMPLEMENTATION** |

RC52's primary classification is **F. TEST_ORDERING_OR_ASSERTION_DEFECT**. In
both engines the drawer generation establishes its close button, programmatic
Workspace activation opens the menu and moves focus on the scheduled animation
frame to the connected, visible Plan menu item, and Plan activation returns
focus to the current connected Workspace trigger. The menu and drawer then
unmount, drawer generation 4 is invalidated by unmount generation 5, and two
terminal animation frames produce no later focus mutation. The former test
explicitly focused the trigger while the open menu correctly owned focus; its
result depended on whether that test action ran before or after the menu's
initial-focus frame. The focused test now asserts Plan during open ownership
and the trigger only after close/unmount. No production code changed.

Native pointer focus before drawer entry remains observably different:
Chromium focuses the product button while WebKit can retain the catalog-results
fallback. That incidental transition is not the product contract; both engines
then focus the drawer close button and reach identical semantic owners. The
complete RC52 matrix is **18/18**: Chromium 9/9 and WebKit 9/9, with no retry,
flake, skip, invalid destination, body fallback where a valid target exists,
newer-overlay theft, or late post-unmount focus mutation. RC47–RC55 therefore
no longer blocks local integration planning. Immutable-preview review and the
established Gate A3 promotion cadence remain separate and were not started.

The separately exposed Consumer Undo/Redo accessibility finding is
**RESOLVED** at `7dddf06249b44c3b447a2fdde98b64b3306be003` and does not remain an
archival blocker. Fresh Chromium/WebKit coverage passed 6/6: mobile Undo and
Redo are 44 x 44 px, desktop controls remain 30 x 30 px, the bars are 48/36 px,
the desktop save-status chip is exactly 30 px, and pointer, Enter, and Space
produce exactly one history mutation. The history targets and their immediate
neighbors do not overlap or clip, and page horizontal overflow is zero. A
separate pre-existing mobile workspace/right-action flex collision remains
outside this history-target claim.

Required confirmation passed for direct manifest validation (22 gates / 374
classified test sources), required-test truthfulness, production-artifact
evidence, `critical-required`, all 78 design-page cleanup guards, the complete
floor-plan-required chain, zero-warning lint, typecheck, full code quality,
strict 57-route production build, complete Phase 8 budgets, public projection
and privacy, focused RC47/48/51/53/54/55 coverage, and diff hygiene. Full E2E
was not run. The independent read-only review result for this bounded closure
is recorded in `HANDOFF.md`; the earlier 8/9 WebKit snapshot is superseded by
the traced semantic-owner proof and final 18/18 matrix above.

No new P0 or P1 is assigned by this confirmation. The superseding final
re-triage records **0 unresolved P0 and 12 unresolved P1** after resolving
CH-0019. GitHub ruleset
enforcement remains externally unverified; CH-0030 isolated/larger-runner A/B
remains externally blocked absent changed administrator inventory; and Vercel,
OAuth, database, scheduler, promotion, and release controls remain pending
where applicable. Local repository ownership is not external enforcement or
release certification.

## Prior superseded disposition — 2026-08-06

**F. ARCH-RC55 REQUIRED MATRIX RED — ARCHIVAL DISPOSITION REMAINS OPEN.**

The original read-only confirmation audited exact application source
`83425bad3cc30dc37100d090e79159998782bc29`; this superseding disposition also
incorporates the later bounded implementation branches listed below. All nine
archival commits remain recoverable, form the original continuous one-parent
RC47-RC55 chain, and must not be cherry-picked or merged.

| RC | Original archival commit | Current implementation commit(s) | Final category | Confirmation |
| --- | --- | --- | --- | --- |
| RC47 | `23e12bfe85742acb3bb10ecfb808401b3b63c638` | `e7cd5d9df19439f0956f840b977ddf8c23dc2757` | **A. RESOLVED_BY_CURRENT_IMPLEMENTATION** | The unique visible product drawer is asserted as the named modal `dialog`; both exact product flows retain their content contracts. |
| RC48 | `e0db6f6661df2870e2f6f6063a7f0d866dd23618` | `faaa463d2f0211fa2ec8f15fe3da1efc3e80c1c1` plus the bounded ARCH-RC48 remediation on `fix/arch-rc48-tracing-keyboard-ownership` | **A. RESOLVED_BY_CURRENT_IMPLEMENTATION** | The selected-item capture router now declines active tracing's unmodified `R` from a synchronous tool-state ref before placement/item routing. A direct Chromium collision test proves tracing changes tools while item state, selection, and Undo history remain unchanged. |
| RC49 | `d41bdf31720918705480a36a44c91347987080bb` | `f2760c529c0a964d99d53dbe73d8fb4a7c8def75` | **B. SUPERSEDED_BY_STRONGER_IMPLEMENTATION** | Canonical projection precedes fingerprinting and an identity-bound design/revision/epoch acknowledgment gates autosave. |
| RC50 | `ee612c84f5f6c1e5370c7aeb12593cf920fe1967` | `f2760c529c0a964d99d53dbe73d8fb4a7c8def75` | **B. SUPERSEDED_BY_STRONGER_IMPLEMENTATION** | The same pending-baseline protocol fails closed on mismatch, supersession, migration failure, and recovery-copy transitions. |
| RC51 | `27b6a55bccbab5bf9a6556fea04fa4179343e447` | `bb0e4f8f999d774b8490eca16efdc84d6751aafd` | **B. SUPERSEDED_BY_STRONGER_IMPLEMENTATION** | Compare resolution uses the canonical full product map and retains an explicit remove-only unavailable state. |
| RC52 | `637281505493572229be864449d77e3a626c67fe` | `793986d22b073c2d4ba093350b2442838703deb0` | **B. SUPERSEDED_BY_STRONGER_IMPLEMENTATION** | Semantic opener identity survives hydration/replacement; restoration resolves a connected, visible, enabled target and respects modal/unmount cancellation. |
| RC53 | `b0eab4cbbadf0203667fb750c42fb0e25eb43f62` | cloud `80627fa5a8cae1205999a90c9f2fa240b1df4305`; responsive `83425bad3cc30dc37100d090e79159998782bc29`; projection source `8818ac76d4772271f027e8dc3c8e9cd6b8009229` | **A. RESOLVED_BY_CURRENT_IMPLEMENTATION** | Cloud writes use the execution-time queue protocol, while the responsive share page and exports now source visible metadata from the canonical public transport projection. |
| RC54 | `588b90e8c526e54d314376f177bdb9c738ac659e` | `29a4c46070404a2426da123bc5b42c0592d95e34` | **B. SUPERSEDED_BY_STRONGER_IMPLEMENTATION** | Public API and duplicate paths use one closed public transport projection with non-tautological security and like-for-like assertions. |
| RC55 | `4883ffb9fc87248b6aa8624cdef39c5f97a173d1` | responsive `83425bad3cc30dc37100d090e79159998782bc29`; projection identity `27e78d25477b6e6d9282c59cd3c801e701abee9b`; Gate A3 registration on `fix/arch-rc55-gate-a3-ownership` | **F. STILL_REQUIRED** | `ci.public-share-responsive` now owns the static plus Chromium/WebKit contract in merge-required `stable-checks`, but its first canonical production-server run passed WebKit 4/4 and failed Chromium 0/4 because two public-share roots coexist during hydration. The required gate therefore cannot close RC55. |

RC53 now has exactly one overall category: **A**. Its cloud, responsive, and
public projection-source sub-scopes are present in current implementation.

The bounded Gate A3 ownership correction is registered, but one RC55
implementation gap remains because the newly required Chromium execution
exposed a duplicate public-share root during hydration. A separate focused
Consumer rotation batch retained one
unrelated failure: Undo was 30 px high against the 44 px touch-target contract.
That accessibility finding was not retried, fixed, or used to reopen RC55.

The first canonical `ci.public-share-responsive` run at implementation snapshot
`729caae` passed its static prerequisite and all four WebKit records, then
failed all four Chromium records without retry. A read-only timing diagnostic
observed root count/status transition from one resolving root, to two resolving
roots, to simultaneous resolving and ready roots, then one ready root about
1.17 seconds later. Historical focused confirmation still includes drawer
focus 18/18, compare plus exact product flows 15/15, beta
smoke 1/1, stale cloud-write isolation 2/2, the ARCH-RC48 Chromium collision
case 1/1, and the focused rotation matrix plus Consumer route 10/10. All
required static gates, lint, typecheck, code quality, strict 57-page build, and
Phase 8 budgets pass. Full E2E was not run. The merge-required ownership record
truthfully exposes the failure but does not close RC55; the unrelated Consumer
touch-target finding remains separate.

No integration branch was created by this result. Promotion still requires
review and certification of the exact immutable artifact under the established
release cadence, plus separately authorized GitHub required-check enforcement.

## Historical starting decision

The following audit record describes the original candidate
`7016da0ad74c7d463a07ec061259b50d757031e0` before the bounded remediation
commits. Its all-`G` mapping is historical and is superseded by the final table
above.

**B. ARCHIVAL DISPOSITION COMPLETE — ADDITIONAL BOUNDED REMEDIATION REQUIRED.**

The candidate did not contain every required RC47-RC55 application or
certification correction. All nine archival commits were recoverable and
retained, but none was an ancestor or patch-equivalent of that candidate. Each
then had primary disposition **G. STILL_REQUIRED**. The nine commits reduced to
eight bounded findings: two P1 persistence findings, three P2 editor/catalog
findings, and three P3 certification/responsive-layout findings. No P0 was
found.

## Scope and safety

- Authoritative application source: `7016da0ad74c7d463a07ec061259b50d757031e0`.
- Excluded profiler source: `d7a50698707153b43df0a982766288060c24b997`
  (CH-0030), which remains outside the cumulative application tree.
- Initial branch: `security/dependency-auth-next-compatibility`.
- Initial `git status --short`, `git diff --stat`, `git diff --check`, and
  untracked-file inventory were empty. `HEAD` matched the authoritative source.
- The initial ten-commit history was `7016da0` dependency/Auth compatibility,
  `55bc4b6` Phase 8 CSS, `299536f` Phase 8 surface-material JS, `101f25d` Pro
  Cabinet Preview policy, `8cec1f0` required-test inventory, `69a7627` plan-
  template access, `bb22590` 3D floor-cutaway, `2a6a979` requested-design load
  coordination, `f95b7e2` viewport registration, and `3f84fbd` GLB local bounds.
- Local branches, tags, remote branches, reflogs, Git history, code-health
  records, release-candidate records, and the RC55 handoff were searched before
  switching branches.
- No commit was cherry-picked; no merge or rebase was performed; no application
  or test file was edited; no integration branch was created; Full E2E was not
  run; CH-0004 was not started; no external system was changed.
- No Node/Next listener was present during the audit. The focused browser checks
  used a temporary Playwright web server rooted in the canonical checkout.

## Exact archival inventory

Every RC is a one-parent commit in a continuous RC47-to-RC55 chain. Each local
branch `release/cabinetry-alpha-rcNN` and lightweight tag
`cabinetry-alpha-rc.NN` resolves to the corresponding SHA. No remote RC ref was
found. Each RC47-RC54 commit is also reachable from every later retained RC ref;
RC55 is reachable from its own retained branch and tag.

| RC | Commit and direct parent | Subject / author date | Patch size | Stable patch ID |
| --- | --- | --- | ---: | --- |
| RC47 | `23e12bfe85742acb3bb10ecfb808401b3b63c638`<br>parent `bfa44edbc7d1ae1fe19f1babf91b1022f5db3211` | `test: align Gate A3 release assertions`<br>2026-07-26 14:06:07 +08:00 | 3 files, +8/-9 | `7067f2df7b30e21443dbb772353055f3572cf00c` |
| RC48 | `e0db6f6661df2870e2f6f6063a7f0d866dd23618`<br>parent RC47 | `fix: stabilize RC48 interaction certification`<br>2026-07-26 15:25:38 +08:00 | 10 files, +108/-92 | `04fd4204e2ce5c731bbe2d5928823af66e63ad27` |
| RC49 | `d41bdf31720918705480a36a44c91347987080bb`<br>parent RC48 | `fix: stabilize RC49 cloud reload certification`<br>2026-07-26 17:01:04 +08:00 | 4 files, +37/-5 | `27ad4dbe722c119df6497cc67135aaa9ee4026b3` |
| RC50 | `ee612c84f5f6c1e5370c7aeb12593cf920fe1967`<br>parent RC49 | `fix: stabilize RC50 certification races`<br>2026-07-26 18:08:27 +08:00 | 3 files, +23/-5 | `7d6f7622eb58179608f8030122b815b4be062e13` |
| RC51 | `27b6a55bccbab5bf9a6556fea04fa4179343e447`<br>parent RC50 | `fix: stabilize RC51 compare and conflict checks`<br>2026-07-26 18:28:14 +08:00 | 2 files, +8/-3 | `9f0e2011d28c3fee15ec50b7bf504265d83cbee8` |
| RC52 | `637281505493572229be864449d77e3a626c67fe`<br>parent RC51 | `fix: stabilize catalog certification flows`<br>2026-07-26 19:49:38 +08:00 | 3 files, +23/-15 | `de9fab56f1cd3419b6b13ac4972677a7f0129faa` |
| RC53 | `b0eab4cbbadf0203667fb750c42fb0e25eb43f62`<br>parent RC52 | `fix: stabilize cloud saves and mobile sharing`<br>2026-07-26 21:37:08 +08:00 | 4 files, +117/-63 | `e60da75a5181f9527d5c0d7e6f08b4b217f40735` |
| RC54 | `588b90e8c526e54d314376f177bdb9c738ac659e`<br>parent RC53 | `test: compare shared duplicate projections`<br>2026-07-26 21:59:23 +08:00 | 1 file, +21/-3 | `7cede777c039943badc76fa1e6ab9a67a22f5efa` |
| RC55 | `4883ffb9fc87248b6aa8624cdef39c5f97a173d1`<br>parent RC54 | `test: wait for responsive share layout`<br>2026-07-26 22:40:43 +08:00 | 2 files, +25/-6 | `fc5dd94a783f25de18f565ed32ba724ddbacd5c1` |

`git cherry` reports all nine as RC-side additions relative to the
starting source, and `git range-diff` leaves all nine RC commits unmatched by
the candidate history. No stable patch ID is present in the candidate. Patch
identity is supporting evidence only; the dispositions below derive from the
current implementation and tests.

The RC patches touch no migration, Prisma schema, dependency, lockfile, or
feature-flag definition. Their persistence changes affect runtime interpretation
of existing fingerprints and `expectedUpdatedAt` revision contracts, but do not
change the stored design format or require data migration. Selector changes are
limited to tests and the share-layout test identities described below.

### Original patch surfaces and retained evidence

- **RC47:** product assertions in
  `tests/e2e/104-arcadia-coffee-table-smoke.spec.ts` and
  `tests/e2e/143-seb-lift-top-small-product-info.spec.ts`, plus room-coordinate
  certification in `tests/e2e/18-multi-room-whole-home.spec.ts`.
- **RC48:** rotation/selection ownership across
  `components/scene/FurnitureItem.tsx`,
  `components/editor/design-page/SceneItemsLayer.tsx`, the scene/selection
  adapters and workspace registrations, and
  `lib/useDesignPageSelectionKeyboard.ts`; static shortcut coverage plus compare
  and multi-room E2E changed with it.
- **RC49:** loaded-baseline handling in `lib/useDesignPagePersistence.ts`, share
  root containment, its static persistence controller, and persistence E2E.
- **RC50:** baseline acknowledgment and autosave blocking in persistence, its
  static controller, and compare E2E race control.
- **RC51:** full-map compare resolution in `components/catalog/CatalogPanel.tsx`
  and persistence conflict timing in `tests/e2e/03-persistence.spec.ts`.
- **RC52:** catalog category freezing plus product-info drawer coverage; its
  multi-room change only adjusted the mobile timeout/navigation wait.
- **RC53:** execution-time cloud revision/autosave generation ownership in
  persistence, mobile/desktop room projections in the share page, the static
  persistence controller, and a separate multi-room Lite-mode toast/active-
  assertion ordering adjustment.
- **RC54:** like-for-like public-projection comparison in
  `tests/e2e/00-beta-smoke.spec.ts`.
- **RC55:** responsive share projection identities/readiness in the share page
  and beta smoke.

The retained RC55 handoff records the cumulative RC45-RC55 intent and a final
exact-artifact Gate A3 result of 206 passed, 0 failed, 0 skipped, and 0 flaky,
plus a 10/10 focused RC55 recheck. That historical certification proves the RC
chain's intended combined behavior; it does not prove incorporation into the
separately evolved candidate.

## Intent-to-current-source dispositions

| RC | Original intent | Primary disposition | Current evidence and missing behavior | Severity / finding | Integration implication |
| --- | --- | --- | --- | --- | --- |
| RC47 | Align product-drawer and multi-room release assertions with the RC UI semantics. | **G — STILL_REQUIRED** | The current drawer is a `dialog` with `data-testid="catalog-item-drawer"`, but product E2E specs 104 and 143 still query the obsolete `complementary` role. A focused run reproduced those two failures. The RC room-coordinate invariant is already protected in the split multi-room editing spec, so only the stale drawer assertions remain. | P3 `ARCH-RC47-ASSERTIONS` | Correct the two certification selectors; do not replay the already-incorporated room assertion. |
| RC48 | Establish one furniture-rotation keyboard path and stabilize compare/multi-room interaction certification. | **G — STILL_REQUIRED** | `FurnitureItem` still owns per-instance R/Shift-R/Q/E/0 handling while `useDesignPageSelectionKeyboard` separately owns R and movement/duplicate commands. Shift+R has conflicting meanings, and the central controller lacks Q/E/0, snap/free/reset, and complete 2D/3D ownership coverage. Current focused interaction cases pass through mixed ownership, not a canonical controller. | P2 `ARCH-RC48-KEYBOARD` | Adapt the invariant to the current controller architecture, including correct keyboard analytics/history source and existing focus/lock/drag guards. Do not transplant the old patch blindly. |
| RC49 | Normalize cloud-load baselines and harden share-root overflow/reload certification. | **G — STILL_REQUIRED** | `useDesignPagePersistence` fingerprints raw `legacyApiToSnapshot(data)` before post-commit document/floor-plan/product normalization, with no pending loaded-baseline acknowledgment. A normal load can therefore appear dirty and schedule a write. RC49 begins the pending-baseline protocol but RC50 is required to retain it through the acknowledging render. Share-root hardening is subsumed by the responsive finding below. | P1 `ARCH-RC49-50-CLOUD-BASELINE`; share portion P3 `ARCH-RC53-55-SHARE-RESPONSIVE` | Implement one current-architecture normalized-baseline protocol covering load and recovery-copy paths before integration. |
| RC50 | Complete pending baseline acknowledgment and remove compare/conflict certification races. | **G — STILL_REQUIRED** | Current recovery-copy code immediately installs the new ID, revision, and fingerprint; autosave has no pending-baseline block. RC50 completes RC49 by retaining the pending baseline through the next render and blocking autosave until the normalized fingerprint is acknowledged. The current persistence E2E also lacks the RC wait control, but the application invariant is the primary gap. | P1 `ARCH-RC49-50-CLOUD-BASELINE` (recovery-copy subcase P2) | Remediate with RC49 as one bounded persistence change; retain current load coordination and document-epoch protections. |
| RC51 | Keep compared products visible after category/filter changes and make a conflict check deterministic. | **G — STILL_REQUIRED** | `CatalogPanel` builds `allCardById`, but `compareCards` still resolves through filtered `cardById`. Persistent compare IDs therefore disappear from the compare tray after filtering or category changes. Current compare tests do not exercise that transition. | P2 `ARCH-RC51-COMPARE` | Resolve compare projections from the all-product map and add the missing transition regression before integration. |
| RC52 | Freeze catalog category ownership during preview and restore drawer focus after hydration changes. | **G — STILL_REQUIRED** | Catalog preview entry paths set the selected ID without freezing the owning category. Drawer cleanup restores focus only while the opener remains connected; imported-catalog hydration can change the controlled default/category and unmount it. Current E2E waits for hydration before opening, which hides the race. | P2 `ARCH-RC52-DRAWER-FOCUS` | Preserve the category/opening owner and test opening before hydration changes the default, including focus return. |
| RC53 | Read the latest cloud revision at serialized-write execution time and provide a responsive mobile share-room layout. | **G — STILL_REQUIRED** | Manual and autosave closures capture `lastCloudRevision` before their queued operation executes. A second same-client write can run after the first commits while still submitting the old revision, causing a false 409 and stranding the latest edit. The API's strong compare-and-swap prevents a proven silent cross-session overwrite, but the persistence correctness gap is production-reachable and hard to detect. The share page still renders one horizontally scrolling table at every width. | P1 `ARCH-RC53-CLOUD-REVISION`; share portion P3 `ARCH-RC53-55-SHARE-RESPONSIVE` | Add synchronous current-revision and autosave-generation ownership without weakening server CAS; separately implement the bounded responsive projection. |
| RC54 | Compare owner and duplicated-design views through the same public projection during beta smoke. | **G — STILL_REQUIRED** | Current production projection and static publication-security coverage strongly prove privacy stripping, geometry preservation, and duplicate compatibility. The required beta smoke nevertheless compares the owner-visible duplicate fingerprint directly with the public source projection, so it can falsely fail a valid API/auth/database round trip. | P3 `ARCH-RC54-PROJECTION-ASSERTION` | Change only the smoke comparison to like-for-like public projections; production projection code need not be carried forward. |
| RC55 | Wait for the responsive share projection and assert layout after it settles. | **G — STILL_REQUIRED** | The current share page has neither `share-room-list-mobile` nor `share-room-list-table`; beta smoke checks overflow immediately without a layout selector or poll. This is distinct regression coverage for RC53's mobile layout, not a duplicate commit. | P3 `ARCH-RC53-55-SHARE-RESPONSIVE` | Implement the responsive room projections and stable layout readiness/assertions as one share batch before final certification. |

### Current canonical evidence index

- **RC47:** `components/catalog/CatalogItemDrawer.tsx` owns the current dialog
  semantic and stable drawer identity. The obsolete role remains in product
  specs 104 and 143. `tests/e2e/multi-room/editing.ts` already protects the room
  semantic-coordinate invariant.
- **RC48:** `components/scene/FurnitureItem.tsx` owns per-instance rotation;
  `lib/useDesignPageSelectionKeyboard.ts` owns the overlapping selected-item
  keyboard path; `lib/useDesignPageSelectionTransforms.ts` supplies the current
  transform adapter and `inspector` source; and
  `scripts/test-placement-keyboard-shortcuts.ts` does not establish unique
  rotation ownership or Shift+R parity.
- **RC49/RC50:** `lib/useDesignPagePersistence.ts` owns load, recovery-copy,
  manual save, autosave, fingerprint, revision, and queue state. Current
  protection is in `scripts/test-design-page-persistence-controller.ts`,
  `tests/e2e/03-persistence.spec.ts`, the design-editor routing suite, and floor-
  plan revision-copy coverage; none asserts a normalized pending baseline.
- **RC51:** `components/catalog/CatalogPanel.tsx` contains both `allCardById` and
  the filtered `cardById` currently used by `compareCards`;
  `tests/e2e/06-catalog-compare.spec.ts` does not cover category/filter change
  after selection.
- **RC52:** preview entry lives in `components/catalog/CatalogPanel.tsx`, while
  opener restoration lives in `components/catalog/CatalogItemDrawer.tsx`.
  Product-info E2E waits for catalog hydration and therefore does not reproduce
  opener unmount during hydration; the archival multi-room timeout/navigation
  adjustment does not establish that invariant either.
- **RC53:** queued persistence state is in `lib/useDesignPagePersistence.ts`;
  `app/api/designs/[id]/route.ts` enforces the strong server compare-and-swap.
  The responsive surface is `app/share/[shareToken]/page.tsx`.
- **RC54:** projection logic and route boundaries are in
  `lib/shared-design-snapshot.ts` and
  `app/api/share/[shareToken]/duplicate/route.ts`. Static security proof is in
  `scripts/test-floor-plan-public-document.ts`; the mismatched comparison
  remains in `tests/e2e/00-beta-smoke.spec.ts`.
- **RC55:** `app/share/[shareToken]/page.tsx` still has a single table projection,
  and `tests/e2e/00-beta-smoke.spec.ts` lacks stable responsive-layout readiness.

## Cloud baseline and revision review

Current strengths remain intact: owner/share authorization, server-side
compare-and-swap using `expectedUpdatedAt`, explicit 409 conflict handling,
local backup and offline errors, document-epoch and load-coordinator rejection
of stale cross-design completions, canonical owner/share projection, and
CH-0012 routing and revision-copy coverage. No evidence showed silent
cross-session overwrite or cross-design mutation.

Two separate P1 gaps remain:

1. **Normalized baseline acknowledgment (`ARCH-RC49-50-CLOUD-BASELINE`).** A
   loaded or recovery-copy snapshot must not become the active autosave baseline
   until the canonical post-commit document, floor-plan, and product state has
   produced the corresponding fingerprint. RC49 starts this protocol; RC50
   provides the required render-to-render retention and autosave block.
2. **Queued revision freshness (`ARCH-RC53-CLOUD-REVISION`).** Each serialized
   manual/autosave operation must read the revision committed by the preceding
   operation at execution time, and stale debounce generations must not
   acknowledge or strand newer edits. The server CAS must remain authoritative.

The risk classification is P1 because false conflicts can leave the latest
production edit unsaved or stranded with weak user visibility. Strong API CAS,
local backup, request coordination, and epoch rejection reduce the blast radius
and prevent a defensible P0 classification; they do not establish the missing
same-client invariants.

## Centralized furniture keyboard review

Selection, duplicate, nudge, plan-mode handling, delete, and history shortcuts
exist, but furniture rotation does not have one canonical owner. Current
per-item and central handlers overlap on R and disagree on Shift+R. The static
selection-keyboard check covers R and arrows only; focused browser coverage
proved current R/Q/E/0 interaction through mixed ownership, not ownership
uniqueness or Shift+R behavior.

The bounded follow-up must preserve locked/dragging exclusions, editable/input
focus exclusions, modal/accessibility behavior, Consumer/Pro parity, and 2D/3D
behavior. It should also correct keyboard analytics/history attribution: the
current central transform adapter labels rotation as `inspector`. Delete and
undo/redo already have separate canonical owners and are not archival carry-
forward work.

## Responsive share review

The current route resolves tokens server-side, enforces `shareEnabled`, exposes
the public projection, supports presentation views and copy/open/native/
duplicate actions, and allows action wrapping. The remaining archival gap is
narrow: rooms use one horizontally scrollable table at desktop, tablet, and
mobile widths, and the smoke has no stable projection-ready selector before it
asserts overflow.

No evidence showed inaccessible core actions, document-wide overflow, an auth
distinction, or a safe-area regression. The finding is therefore P3, not P1.
The bounded correction is a mobile room-card projection, desktop table
projection, root overflow hardening, and deterministic layout readiness using
the RC55 selectors or equivalent stable identities.

## Focused validation

No test was changed. Full E2E was not run.

| Validation | Result |
| --- | --- |
| `npm run verify:design-persistence` | PASS |
| `npm run test:design-page-selection-keyboard` | PASS |
| `npm run test:design-editor-routing` | PASS |
| `npm run test:floor-plan-revision-copy` | PASS |
| `npm run test:catalog-editor-coverage` | PASS |
| `npm run test:editor-capabilities-accessibility` | PASS |
| `npm run test:floor-plan-publication-security` | PASS |
| `npm run test:design-page-history-controller` | PASS |
| `npm run test:editor-command-history` | PASS |
| `npm run test:phase14-product-flow` | PASS |
| Product drawer specs 104 and 143, focused Chromium | **5 passed, 2 failed**; both failures are the obsolete `complementary` role and directly reproduce `ARCH-RC47-ASSERTIONS` |
| Focused catalog/rotation Chromium cases | **5 passed**; validates current mixed-owner behavior, not RC48 incorporation |
| Persistence browser mutation coverage | Not run: a database-mutating run was outside this read-only audit's authorization |

The first browser invocation without the repository-required `APP_ENV` was
rejected before test discovery. A sandboxed listener then failed to bind its
port; the authorized local-port reruns used `APP_ENV=development` and produced
the results above. Ignored browser artifacts did not change the working tree.

## Independent review

A separate read-only reviewer independently inspected commit recovery, patch
and semantic comparisons, all nine dispositions, current code/test ownership,
the cloud, keyboard, and share analyses, severity, and the integration result.
It made no edits.

The review confirmed result B and required three precision corrections that are
reflected here: RC50 completes RC49's render-to-render baseline protocol; RC54
is G rather than B because the required E2E assertion is still semantically
wrong; and any RC48 remediation must adapt analytics/history attribution to the
current architecture. It also required the future RC52 regression to open the
drawer before hydration changes the default category.

## Follow-up order and closure rule

1. Remediate and characterize the two P1 persistence findings without weakening
   server CAS, local backup, load coordination, or document-epoch rejection.
2. Remediate the P2 canonical keyboard, compare projection, and drawer-focus
   findings in bounded batches.
3. Correct the P3 drawer/projection assertions and responsive share projection.
4. Run focused checks while iterating, then run the required release suite once
   against the exact immutable artifact proposed for integration.

Any application or test change invalidates the evidence for the candidate
audited here. Integration becomes eligible only after all G dispositions are
resolved or defensibly reclassified from reviewed current evidence.

## ARCH-RC49-50 remediation closure — 2026-08-05

The RC49/RC50 disposition above is historical evidence for audited source
`7016da0ad74c7d463a07ec061259b50d757031e0`. On the later exact clean source
`e06795dc92874afb383f61b28ba380930c1c7252`, the combined P1
`ARCH-RC49-50-CLOUD-BASELINE` invariant is locally remediated on
`fix/arch-rc49-50-cloud-baseline`. Archival commits
`d41bdf31720918705480a36a44c91347987080bb` and
`ee612c84f5f6c1e5370c7aeb12593cf920fe1967` remain unmerged intent references;
neither was cherry-picked.

### Before and after sequence

Before: the requested-design coordinator fetched the selected ID; the API
client validated only the transport shell; `legacyApiToSnapshot` migrated or
fell back; persistence fingerprinted that raw snapshot; only afterward did the
document controller install it, hydrate floor-plan defaults, enrich product
snapshots, and reconcile active-room zones. Revision installed separately, and
autosave checked hydration/conflict/fingerprint equality without a pending
loaded-baseline acknowledgment.

After: the coordinator creates a unique request epoch and starts an identity-
bound loading state; the load owner validates exact returned ID and parseable
revision; one projection performs supported migration, floor-plan defaults,
product enrichment, active-room zone reconciliation, stored-document
validation, canonical round-trip, and then fingerprinting. The resulting
fingerprint is installed as pending with `{designId, revision, epoch}` before
the canonical document, identity, and revision commit. A post-commit effect can
acknowledge only the exact still-current identity and fingerprint. All existing-
design mutation paths remain blocked while loading, pending, failed, or
detached from an acknowledged matching cloud identity.

Create/update/autosave responses stage their exact event-time stored snapshot
and returned revision as a new pending identity before acknowledgment. A
recovery copy gets its own ID, revision, epoch, and fingerprint. Superseded and
aborted requests cannot install or acknowledge; migration/normalization failure
fails closed; local-only drafts do not wait for a cloud acknowledgment.
`ARCH-RC53-CLOUD-REVISION` remains unchanged: queued writes still require their
separate execution-time revision-ownership remediation.

### Verification and scope

Deterministic tests cover equivalent defaults/order, raw-versus-canonical
fingerprints, active-room zone normalization, exact identity matching,
pre-acknowledgment blocking, post-acknowledgment edits, superseded requests,
duplicate identity, failed/future migration, reload idempotence, and local-only
behavior with deferred adapters rather than sleeps. The final focused Chromium
database-backed paths pass for load/edit/one write/reload, My Designs switching,
and duplicate failure/success identity. The final isolated local database
identity was `interior_ai_test_arch_rc49_50_final_20260805` at
`127.0.0.1:5432` as local user `justus`; all 42 migrations applied, seed cleanup
left zero design rows, and the database was deleted and verified absent.

`test:critical-required`, required-test truthfulness, production-artifact
evidence, full zero-warning lint, typecheck, code quality, the strict 57-page
production build, and Phase 8 representative project/bundle checks pass. No
allowance increased; persistence and document-history baselines decreased.
Full E2E was not run. No workflow, dependency, lockfile, schema, migration,
server CAS, RC53, push, deployment, or other RC remediation is included.

Rollback is one local revert of the focused implementation commit after its SHA
is created. RC47, RC48, RC51, RC52, RC53, RC54, and RC55 findings remain open
as recorded above; this closure does not make the archival integration set
eligible by itself.

### Independent remediation review

The separate read-only implementation review identified and verified fixes for
a newer-load/write interleaving, status-only baseline installation, an ungated
recovery-copy path, null-identity loading eligibility, and stale render-captured
revision use during failure restoration. The corrected implementation preserves
the active loading envelope, installs only exact identity/fingerprint baselines,
restores only the matching live generation, blocks transient null-cloud writes,
and gates recovery-copy creation before and after its request before detaching
and restaging the returned identity. The reviewer then returned **functional
PASS** and made no edits. Its final documentation-only ownership finding is
resolved by recording `useDesignPageCloudConflictCopyController.ts` as the
recovery-copy create/gate/commit owner composed by persistence.

## ARCH-RC51 compare remediation closure — 2026-08-05

The RC51 row above records the historical finding at audited source
`7016da0ad74c7d463a07ec061259b50d757031e0`. On exact clean starting source
`faaa463d2f0211fa2ec8f15fe3da1efc3e80c1c1`, `ARCH-RC51-COMPARE` is locally
remediated on `fix/arch-rc51-compare`. Archival RC51 commit
`27b6a55bccbab5bf9a6556fea04fa4179343e447` was inspected only for intent and
was not cherry-picked.

The verified defect was the lookup edge, not compare storage: ordered
`compareIds` survived filter/navigation state, but `compareCards` mapped them
through filtered `cardById`. The current implementation uses one pure
`resolveCatalogCompareItems` selector over `allCardById`, the unfiltered public
card projection rebuilt from current furnish-catalog items and per-product
variant selections. No product object, registry, fetch path, ID, filter, group,
or visual design was duplicated or changed.

Category, search, room, brand, price, smart/stock-style filtering, and family
grouping no longer control compared-product resolution. Ordering, duplicate
prevention, the three-item replace-oldest limit, selected variant, price,
dimensions, media identity, retailer/purchase re-entry, remove/clear, and native
button accessibility remain on their existing paths. A missing, retired,
identity-mismatched, or non-public product produces one removable unavailable
entry with no open/add action. Consumer and Pro share the same `CatalogPanel`
and selector.

Deterministic coverage proves canonical-versus-filtered lookup for every filter
class, grouping independence, actual canonical product and variant IDs, order,
count independence, stale-refresh replacement, safe missing/mismatched/draft
behavior, unavailable rendering, duplicate/limit guards, and one shared mode
path. It also reproduces a removed `queen_frost_white` selection falling back to
`queen_nickel_grey` inside the underlying variant resolver and proves the
compare selector rejects that substitution. The complete focused Chromium
compare spec passes 8/8 using fixed canonical product IDs, including the new
real category/search/price transition and native-keyboard add/remove behavior.
Product-flow, finish-picker, commerce, publication/live/draft, catalog-refresh,
and editor accessibility checks pass. Final required-gate results are recorded
in `docs/code-health/HANDOFF.md`; Full E2E was not run.

The detailed owner/identity/source/fallback matrix is
`docs/architecture/catalog-compare-identity.md`. Rollback is one local revert of
the focused implementation commit once its SHA is resolved. Remaining archival
findings are RC52 at P2 and RC47, RC54, plus RC53/55 responsive share work at
P3. The RC49/50 and RC53 persistence and RC48 keyboard invariants are already
present in the required starting source; this closure neither reopens nor
changes them and does not authorize an integration branch.

## ARCH-RC52 drawer-focus remediation closure — 2026-08-05

The RC52 row above records the historical finding at audited source
`7016da0ad74c7d463a07ec061259b50d757031e0`. From exact clean starting source
`bb0e4f8f999d774b8490eca16efdc84d6751aafd`,
`ARCH-RC52-DRAWER-FOCUS` is locally remediated on
`fix/arch-rc52-drawer-focus`. Archival commit
`637281505493572229be864449d77e3a626c67fe` was inspected only for intent and
was not cherry-picked. Its intent was to keep the product-preview opening
owner stable through catalog hydration so close could return keyboard focus.

The verified current defect was direct-node authority. `CatalogItemDrawer`
captured only `document.activeElement`; cleanup focused it only if the same
node remained connected. Hydration, category/filter/virtualization changes, or
responsive replacement could unmount it, while WebKit pointer activation could
leave it uncaptured from the outset. The disconnected or absent path had no
semantic resolution and no safe fallback.

The current architecture now establishes one typed descriptor at activation:
product ID, the stable `details` action, and `product-card` or `compare-tray`
source. One focus owner resolves a connected, visible, enabled target only when
the drawer closes. It prefers the still-valid direct element, then the current
exact semantic action, then another current same-product details action, then
the programmatically focusable catalog-results region. It never focuses a
disconnected node or accepts `body`; a newer visible modal or alertdialog
suppresses entry, Escape ownership, and restoration; unmount and newer-open
generations cancel queued focus work. Every close path releases the DOM-bearing
optimization after cleanup captures it. Product changes inside the drawer
retain the original opener, while every reopen establishes a new identity. The
mechanism is not an authorization boundary.

Deterministic test-first coverage proves pointer, Enter, Space, Escape, close,
different-product reopen, hydration-style connected-node replacement,
desktop/mobile replacement in both directions, filtering/DOM removal fallback,
real live-catalog product unavailability, compare tray, searched product cards,
route/workspace unmount cancellation, alertdialog entry/Escape/restoration
ownership, Consumer/Pro parity, dialog semantics, active element,
connectedness, visibility, enabled state, and unique exact targets. The
complete focused matrix passes 18/18 in Chromium and WebKit. The unit/render focus identity assertions,
catalog accessibility/compare/product-flow/responsive suites, required local
gates, strict catalog audit/build, and Phase 8 gate are recorded in
`docs/code-health/HANDOFF.md`; Full E2E was not run.

The detailed owner, lifecycle, former-failure proof, and fallback matrix is
`docs/architecture/catalog-drawer-focus.md`. Rollback is one local revert of
the focused implementation commit once its SHA is resolved. Remaining archival
findings are RC47 and RC54 plus RC53/55 responsive share work at P3. No RC47,
RC54, RC55, touch-target, responsive-share, integration-branch, push, workflow,
deployment, or external-setting work is included.

## ARCH-RC47 drawer-assertion remediation closure — 2026-08-05

The RC47 row above records the historical finding at audited source
`7016da0ad74c7d463a07ec061259b50d757031e0`. From exact clean starting source
`793986d22b073c2d4ba093350b2442838703deb0`, `ARCH-RC47-ASSERTIONS` is locally
remediated on `fix/arch-rc47-drawer-assertions`. Archival commit
`23e12bfe85742acb3bb10ecfb808401b3b63c638` was inspected only for intent and
was not cherry-picked. Its relevant intent was to align product certification
with the product preview's current semantics; its unrelated multi-room change
was already protected by current split coverage and was not replayed.

Focused Chromium execution reproduced exactly five passes and two failures:
`tests/e2e/104-arcadia-coffee-table-smoke.spec.ts` failed at its Arcadia title
assertion after selecting `getByRole("complementary")`, and
`tests/e2e/143-seb-lift-top-small-product-info.spec.ts` failed the equivalent
Seb Small title assertion through the same selector. The rendered accessibility
tree showed the correct Arcadia and Seb Small content inside one modal `dialog`
named `Review exact variant`; the only `complementary` landmark was the separate
`Plan information and controls` region. Classification is **A — STALE TEST
ASSERTIONS**. No product behavior or production file changed.

Both specs now query
`getByRole("dialog", { name: /^Review exact variant$/i })`, require exactly one
match, visibility, and `aria-modal="true"`, then retain exact product title,
variant, retailer, add, selected-item, material, dimension, warranty, swatch,
and configured-state assertions. The Seb title assertion is exact and no longer
uses `.first()`, so duplicate matching content cannot be hidden. The shared
drawer name remains the visible dialog title; current-product identity is
proved separately by the exact title and product-specific detail assertions.

The corrected two-spec Chromium run passes 7/7. RC52 unit/render checks pass,
and its complete pointer/keyboard, Consumer/Pro, desktop/mobile, product-card,
compare-tray, close/Escape/backdrop, reopen, overlay-ownership, and restoration
matrix passes 18/18 across Chromium and WebKit. The focused Chromium compare,
layout, and product-flow regression set passes 10/10. Product-flow, editor
accessibility, asset availability, design-page cleanup, required-test
truthfulness, critical-required, zero-warning lint, typecheck, code quality,
strict catalog audit, the strict 57-page production build, Phase 8 budgets, and
diff hygiene all pass. Full E2E was not run.

Rollback is one local revert of the focused implementation commit once its SHA
is resolved, followed by the two product specs and RC52 drawer-focus matrix; no
data or external rollback is required. Remaining archival findings are RC54 and
the RC53/55 responsive-share work at P3. No drawer redesign, RC52 production
change, RC54, responsive-share, integration-branch, push, workflow, deployment,
or external-setting work is included.

## ARCH-RC54 public-projection assertion closure — 2026-08-05

The RC54 row above is the historical finding at audited source
`7016da0ad74c7d463a07ec061259b50d757031e0`. From exact clean starting source
`e7cd5d9df19439f0956f840b977ddf8c23dc2757`,
`ARCH-RC54-PROJECTION-ASSERTION` is locally remediated on
`fix/arch-rc54-projection-assertion`. Archival commit
`588b90e8c526e54d314376f177bdb9c738ac659e` was inspected only for intent and
was not cherry-picked.

Classification is **E — CODE AND TEST BOTH REQUIRE CORRECTION**. The focused
public-projection security suite and original beta smoke passed before editing,
but the smoke was evidentially invalid: the source fingerprint came from an
unauthenticated public response, while the duplicate fingerprint came from an
authenticated owner response, and the generic design fingerprint was applied
directly to both. Independent read-only review then found two production
boundary defects: arbitrary snapshot extensions survived projection, and raw
legacy envelope values could be returned or copied beside the projected v3
snapshot.

The old comparison was
`ownerDuplicateFingerprint === publicSourceFingerprint`. The corrected
comparison is
`publicFingerprint(project(ownerDuplicate)) === publicFingerprint(publicSource)`.
The duplicate owner GET no longer appends the source share token. The public
side also requires the exact response envelope, requested design ID, current
`updatedAt` revision, `shareEnabled: true`, a redacted `shareToken`, a valid v3
snapshot, a wrong-token 404, and independently specified beta fixture room,
item, variant, XZ transform, rotation, material, saved-view, opening, and note
values.

Production now fails closed on undeclared document, room, item, zone,
saved-view, layout-version, and floor-plan fields and recursively rejects
sensitive nested key names after normalized comparison while preserving a
path/value-bounded typed public cabinetry responsibility role.
`projectSharedDesignTransport` makes the projected snapshot the single source
for the non-owner API envelope and recipient copy;
direct divergent-title/dimension/item/style/budget/note cases prove raw legacy
columns cannot bypass it. Known historical legacy item, zone, and saved-view
field names remain explicitly declared and are upgraded to a parser-valid v3
snapshot when no stored snapshot exists.

Focused contract coverage proves multi-room and item-order normalization,
schema-revision-1 normalization, owner-only source/provenance changes remaining
fingerprint-neutral, meaningful public changes remaining fingerprint-visible,
private sentinels not leaking, missing required public data failing, unexpected
sensitive fields failing rather than being broadly picked away, and stale or
wrong design/revision identity not comparing as current. The full contract and
field classification are in
`docs/architecture/public-design-projection.md`.

Final independent read-only review returned **PASS — no actionable findings**
after reproducing the complete mixed-case/short-form leakage matrix and the
valid public cabinetry role. New public fields require deliberate closed-schema
maintenance; they fail closed until reviewed.

The bounded production projection and two consuming API routes changed; share
UI, responsive layout, token lifecycle, authorization, persistence schema,
dependencies, workflows, deployment, and external settings did not. Rollback
is one local revert of the focused implementation commit, followed by the
focused public-projection security, share/duplicate, and Chromium beta-smoke
commands; no data or external rollback is required. The only remaining
archival finding is the separate P3 `ARCH-RC53-55-SHARE-RESPONSIVE` batch. This
closure does not authorize an integration branch, push, deployment, workflow
change, or external-setting change.

## ARCH-RC53/55 responsive-share closure — 2026-08-05

From exact clean starting source
`29a4c46070404a2426da123bc5b42c0592d95e34`, the responsive portion of RC53
and the settled-layout intent of RC55 are locally remediated on
`fix/arch-rc53-55-share-responsive`. Archival commits
`b0eab4cbbadf0203667fb750c42fb0e25eb43f62` and
`4883ffb9fc87248b6aa8624cdef39c5f97a173d1` were inspected only as intent
evidence and were not cherry-picked. Their unrelated cloud-revision work was
not replayed.

The verified current defect was a single desktop-shaped room table at every
width, a client-owned mutable copy of the public snapshot for room switching,
an invalid selected-room ID that could disagree with the visually rendered
fallback, and a mount-only readiness marker that did not prove responsive mode,
Canvas creation, or finite current-generation dimensions. Canonical room and
saved-view actions lacked stable identities, and the page did not expose one
semantic layout boundary for deterministic Chromium/WebKit verification.

The current-architecture correction keeps `projectSharedDesignSnapshot` as the
only public document source and gives `PublicShareShell` one room/view selection
owner. One active component tree renders the viewer; only the non-actionable
room schedule chooses mobile cards or a tablet/desktop table. Room and saved
view state survive breakpoint changes, while a missing room resolves to the
first canonical projected room. Exact internal layout-key equality is the
readiness authority; the exposed numeric generation hash is diagnostic only.
Ready also requires resolved mode/room, current Canvas evidence, and a finite
positive current surface measurement. Loading, error, invalid/revoked, empty,
and resolving states cannot claim ready.

Stable identities cover the public root, schedule mode, room navigation,
canonical room actions, saved-view navigation/actions, and preview surface.
Focused coverage proves uniqueness, every projected mobile room, projection
fingerprint parity across modes, deterministic resize/history/reload behavior,
44 px touch targets, visible keyboard focus, four safe-area insets, no page
overflow, and viewport containment for non-scrollable actions. The exact
responsive contract and rollback matrix are in
`docs/architecture/public-share-responsive-layout.md`.

Final evidence is 12/12 focused public-share cases across Chromium and WebKit,
5/5 Chromium beta/client-preview and share-duplication cases, all 78 design-page
cleanup guards, public-projection security, required-test truthfulness,
critical-required, zero-warning lint, typecheck, code quality, strict 57-page
production build, complete Phase 8 budgets, and diff hygiene. Independent
read-only review is **PASS — no remaining code blocker**. Full E2E was not run.

ARCH-RC54 projection fields, fingerprint behavior, closed-schema security,
token lifecycle, authorization, publication policy, cloud revision/baseline,
persistence, and duplication behavior are unchanged. All RC47-RC55 archival
findings are now locally remediated in their bounded branches; this closure does
not create or authorize an integration branch, push, deployment, workflow,
ruleset, runner, or external-setting change. Rollback is one local revert of the
focused implementation commit followed by the responsive, projection,
duplication, build, and Phase 8 checks; no data or external rollback is needed.

## ARCH-RC53 public-share projection-source closure — 2026-08-06

This section supersedes only the final-confirmation finding that visible public
share metadata can bypass the canonical projection. From exact clean starting
source `12bc689b7db757c0f7323774d214aaa1aa8c8028`, the bounded remediation is
implemented on `fix/arch-rc53-share-projection-source`. Archival RC53 commit
`b0eab4cbbadf0203667fb750c42fb0e25eb43f62` was not cherry-picked, and the
resolved cloud-revision queue was not modified.

The verified bypasses were raw outer-row `title`, `style`, `budget`, and `notes`
in the share page and its anonymous HTML/PDF exports, plus raw title use in
native-share/CSV/PDF naming and raw style/budget use in duplication analytics.
The export routes also rendered owner name/email and row `createdAt`, neither of
which is declared public. Static route metadata remained generic and did not
perform a presentation lookup.

`title`, `style`, categorical `budget`, and deliberately public `notes` are
`INTENDED_PUBLIC_PROJECTED_FIELD`; rooms/items/materials/views and floor-plan
content retain the same classification. Totals, readiness, filenames, catalog
labels, and static route metadata are `PUBLIC_DERIVED_METADATA`. Owner
name/email, row `createdAt`, and unknown outer fields are
`OWNER_OR_INTERNAL_ONLY`. Known no-snapshot outer fields and presentation
metadata absent from older v3 snapshots are `LEGACY_COMPATIBILITY_ONLY` and may
enter only through the explicit validated transport upgrade. Design ID, token,
and revision binding retain their existing
non-presentation roles. No field remains `AMBIGUOUS_PRODUCT_DECISION`.

The presentation boundary validates title as non-empty and at most 120
characters, style as non-empty and at most 80, notes at most 20,000, and budget
as one of the modern `budget`/`mid`/`luxury` or explicit legacy `$`/`$$`/`$$$`
categories. Invalid types, oversize values, and undeclared categories fail
closed. Owner/client preview now uses the same snapshot-first resolver and has
an independent divergent-envelope fixture; its editor-specific labels are
derived from that value rather than read from the raw row.

All three anonymous presentation surfaces now call
`projectSharedDesignTransport(design)` and read presentation values from its
validated snapshot/read model. Valid v3 snapshot fields win over divergent raw
columns; legacy rows are upgraded or filled once and then read from the closed snapshot.
Owner identity and row-created metadata are absent from anonymous exports. The
non-owner API and recipient duplicate continue to use the same transport, and
duplicate analytics now observes projected style/budget. There is no second
projection, arbitrary spread, denylist-only boundary, token/auth change,
responsive-layout change, or RC54/RC55 fingerprint-identity change.

Independent fixtures assert divergent outer versus projected presentation
values, a private raw-notes sentinel, unknown outer fields, exact legacy
upgrade, projected-field fingerprint changes, raw-private fingerprint
neutrality, API/HTML/serialized-props/metadata/export/copy exclusion, static
metadata ownership, extracted PDF-text exclusion, multi-room/saved-view
behavior, owner/client-preview source parity, and recipient-copy parity.
The detailed field/source matrix, before/after flow, client-preview distinction,
and rollback procedure are recorded in
`docs/architecture/public-design-projection.md`.

RC53's public-share projection-source finding is locally remediated. The
remaining archival gaps are RC48 tracing/selected-item rotation ownership, RC55
collision-resistant projection identity, and RC55 merge-required Gate A3
ownership for responsive Chromium/WebKit coverage. No integration branch,
push, deployment, workflow, ruleset, runner, secret, or external setting was
created or changed.

## ARCH-RC48 tracing/selected-item keyboard closure — 2026-08-06

From exact clean starting source
`8818ac76d4772271f027e8dc3c8e9cd6b8009229`, the remaining RC48 keyboard
collision is locally remediated on
`fix/arch-rc48-tracing-keyboard-ownership`. Archival RC48 commit
`e0db6f6661df2870e2f6f6063a7f0d866dd23618` was inspected as evidence only and
was not cherry-picked.

The verified defect was event-order ownership: selected-item rotation listened
in capture phase and consumed `R` before active floor-plan tracing's bubble
listener could receive it. The bounded correction adds an explicit higher-
priority owner resolver and a synchronous tracing-mode ref. With room tracing
active, only plain unmodified `R` belongs to tracing; the selected-item router
returns before `preventDefault`, propagation stop, command resolution, history,
dirty state, autosave, or analytics. Absent pending placement, `Shift+R`, `Q`,
`E`, and `0` remain on the canonical selected-item transform path.
`Cmd/Ctrl/Alt+R` remains unowned by
both routes. Editable/modal focus and captured pointer interaction block both.
Every accepted repeat event has the same single owner.

The direct Chromium regression first failed because `R` changed the selected
item fingerprint. It now proves `R` changes the active draw mode from straight
wall to rectangle wall exactly through tracing while the selected item remains
selected and its snapshot fingerprint and Undo label remain unchanged. Pure
and static guardrails cover active/inactive tracing, all modifiers, `Q/E/0`,
repeat, editable/modal exclusion, captured interaction, current selection refs,
and the ref-before-state-update transition contract.

RC48 is therefore **A. RESOLVED_BY_CURRENT_IMPLEMENTATION**. Canonical
selected-item history, dirty/autosave, analytics, 2D/3D projection, and scoped
rotation-button activation are unchanged. The remaining archival gaps are only
RC55 collision-resistant projection identity and RC55 merge-required Gate A3
ownership for responsive Chromium/WebKit coverage. The unrelated Consumer Undo
44 px touch-target failure remains separate and was not modified.

Rollback is one local revert of the focused remediation commit, followed by the
selection-keyboard guardrail and focused Chromium collision test. No schema,
data, dependency, workflow, integration branch, push, deployment, or external
setting rollback is required.

## ARCH-RC55 projection-identity closure — 2026-08-06

From exact clean starting source
`abec1b92b86a0b74193f437aea11033f666adca0`, the bounded projection-identity
remediation is implemented on `fix/arch-rc55-projection-identity`. Archival
RC55 commit `4883ffb9fc87248b6aa8624cdef39c5f97a173d1` is not an ancestor and was
inspected only for intent. RC54, the responsive implementation, RC53 cloud
revision/projection-source ownership, and RC48 keyboard ownership are
ancestors and remain unchanged.

The retained deterministic collision fixture contains two valid closed public
projections whose only meaningful difference is title:
`ARCH-RC55 1vnkyl8-80u7s7-q7q69o` and
`ARCH-RC55 y1co6q-7jaizn-1n448ct`. Both produce the former FNV-1a fingerprint
`bafccb68`; under the former `design:token:fingerprint` contract they also
produce the same projection and desktop-room layout identities. The new
versioned identities are respectively
`public-design-projection.v1:sha256:bca20ead56fca406f2109f34ab09e20c0fa5e90f0128983f773b4773ea635b45`
and
`public-design-projection.v1:sha256:baf781927092d4f47e815cd08ff33ea50cfde427cef00b27d8584c232db7141d`.

`lib/public-design-projection-identity.ts` reuses the established RC54 stable
room/item/zone/view/layout ordering and the generic canonical snapshot
serializer, validates the closed public shape, prefixes representation contract
`public-design-projection.v1`, and applies the platform `node:crypto` SHA-256
without truncation. It runs once on the server route. There is no client digest,
loading state, completion callback, render-time randomness, timestamp, or
animation-frame serialization. Identity failure throws during server render,
so the shell cannot advertise ready.

Publication/binding identity remains separate: the exact enabled token selects
the design row, the shell React key remains design plus token, and the public
API continues to bind design ID plus current `updatedAt`. The versioned layout
key is the exact JSON tuple of content identity, responsive mode, canonical
selected room, and selected saved view. Canvas and surface evidence must match
that full key; the small numeric FNV generation remains diagnostic only. A
removed room or view is resolved against the current closed projection before
keying, so stale selection or measurement evidence cannot ready a replacement
projection.

Focused evidence passes: the identity/collision and responsive unit contract;
ARCH-RC54 projection/security; the zero-retry 12/12 Chromium/WebKit responsive
and read-only matrix; 5/5 Chromium beta plus share duplication/privacy; invalid
and revoked tokens; room/view continuity; required-test truthfulness; all 78
design-page cleanup guards; `critical-required`; full zero-warning lint;
typecheck; strict 57-page build; and complete Phase 8. `/design` JS and CSS are
unchanged from the exact base. The share route remains 19 JS chunks and changes
from 2,439,017 raw / 572,346 Brotli bytes to 2,439,363 / 572,348 (+346 / +2);
CSS remains 130,408 / 17,276. The server-only identity source is 2,622 raw / 765
Brotli bytes and contributes no client SHA dependency. A 12-room/720-item,
554,055-byte canonical public projection measures 7.21 ms p50 / 7.55 ms p95
over 100 server-side identity derivations.

The global code-quality command remains nonzero only for ten metrics already
present in the untouched starting SHA's RC48 tracing/interaction files. The
RC55 page/shell changes initially exposed three local ratchet findings; all
three were removed, no exception or allowance changed, and an isolated archive
of the exact base reproduces the same ten remaining findings. Fixing those
unrelated files or raising their allowances is outside this batch.

RC55 projection identity is therefore resolved. RC55 remains overall **F**
only because merge-required Gate A3 ownership is deliberately deferred to its
separate batch. Full E2E, workflow/ruleset/runner changes, push, deployment,
integration branch creation, responsive geometry, token/auth lifecycle, and
the unrelated Consumer Undo target were not performed. Rollback is one local
revert of the focused implementation commit, followed by the identity,
projection-security, responsive, beta/duplication, build, and Phase 8 checks;
no data or external rollback is required.

## ARCH-RC48 code-quality disposition correction — 2026-08-06

The earlier RC48 closure remains the authoritative behavior record, but its
statement that all required static/code-quality gates passed was inaccurate.
Likewise, “only RC55 remains” referred only to the behavioral archival queue;
RC48 still carried one merge-blocking code-quality sub-scope. This correction
preserves those historical statements and explicitly supersedes their quality
interpretation. The later RC55 records correctly kept code quality red.

The clean comparison of `8818ac76d4772271f027e8dc3c8e9cd6b8009229`,
`abec1b92b86a0b74193f437aea11033f666adca0`, and
`27e78d25477b6e6d9282c59cd3c801e701abee9b` assigns all ten findings to RC48:
nine real growth findings across the tracing, workflow, editor, plan, and
selection facades, plus one required downward complexity correction. None is
owned by RC55. `npm run test:code-quality` passing was checker-self-test
evidence only and never established a green repository scan.

`fix/arch-rc48-code-quality-ratchet` resolves that sub-scope structurally with
one focused tracing keyboard binding, one synchronized trace-mode owner, and
one typed event-time ownership capability passed through the existing facade
chain. Selected-item/tracing behavior, history, autosave, analytics, 2D/3D,
Consumer/Pro, RC55 projection identity, and listener priority remain unchanged.
All source metrics are back within their accepted ratchets, every baseline
change is downward, and no exception or suppression was added. Two separate clean
exact-commit worktrees each pass `npm ci` followed by the full
`npm run check:code-quality` command.

RC48 is now **A. RESOLVED_BY_CURRENT_IMPLEMENTATION** for both behavior and the
code-quality sub-scope. The remaining archival gap is still only RC55’s
separate merge-required Gate A3 ownership; the Consumer Undo touch target
remains an unrelated product finding.

## ARCH-RC55 canonical merge-required Gate A3 ownership — 2026-08-06

This section supersedes the prior statement that RC55 had no merge-required
owner, but does not classify RC55 resolved. Starting source was exact clean
`d93e34558221e99797ca73791364c016a14ef0cc`; branch is
`fix/arch-rc55-gate-a3-ownership`. No archival commit was cherry-picked.

The proven gap was governance rather than responsive behavior. The static
contract was a manually invoked risk-triggered script with no gate owner. The
responsive spec was discovered by advisory Full E2E and release Gate A3, but
neither execution was merge-required through `stable-checks`. The focused
configuration also selected `04-share.spec.ts`, so it was not an exact
responsive ownership boundary.

`ci.public-share-responsive` is now the one canonical merge-required owner. Its
two-script package closure first executes
`scripts/test-public-share-responsive.ts`, then the required-test runner invokes
only `playwright.share-responsive.config.ts`. That configuration owns only
`share-responsive.spec.ts` and exactly Chromium plus WebKit. The four named
test identities protect single/multi-room, desktop/mobile/tablet/landscape,
both breakpoint directions, room/view/focus continuity, deterministic fallback
and layout readiness, collision-resistant identity, finite geometry, overflow,
safe area, 44 px applicable share controls, keyboard focus, invalid/revoked
tokens, and absence of owner controls. The static phase retains closed public
projection/privacy and stale-readiness rejection.

The required runner binds its clean source SHA, canonical configuration,
projects, process exit, per-test records, and aggregate counts. It rejects
missing/renamed sources, stale inventories, wrong config, either one-engine
subset, grep/shard filtering, zero discovery, skip, retry/flake, annotations,
`.only`, duplicate required owners, imported-owner records with no module
contribution, and process/report/count disagreement. Helpers and the collision
fixture are required sources but are not counted as independent runnable specs.
The evidence-producing runner executes the declared static package prerequisite
itself and rechecks cleanliness afterward. It also requires the staging,
strict-catalog, and production-server environment; required-mode configuration
throws before it can substitute `npm run dev`.

Stable CI reuses the already migrated database and strict staging `.next`
artifact after runtime evidence preparation. The command forces `npm run start`,
does not reuse a listener, does not create a development build, and disables
trace, screenshot, and video for the required run. Failure remains the primary
`stable-checks` result and propagates through the existing `merge-gate` needs
edge. No duplicate required job or step was added. Advisory Full E2E and
`release.gate-a3` may still discover the spec but cannot substitute for this
owner.

The final manifest is 22 gates and 373 classified sources. Inventory counts and
hashes are 251 script tests
`34354f2440b3671752b14d298aa37c548bdcb1c7aca7b5367c370cc765fb7cd3`,
100 browser specs
`c80ed50279d95e08f94726784270ef887459703ec7aaaa113a3226a3268bcd07`,
6 cabinetry browser modules
`805b0ec8a0d24658c0cb5e01616fb1a684c8dc2aae81b6338f3d1b87fd6fafa9`,
8 multi-room browser modules
`e701b0ff04421c8eca749fdd8e6daffcd0c0fbb987226ec2319bdcee8d368851`,
and 8 cabinetry script modules
`55ed53e1acde7854a321a3a6480aba3c2c89636d9227057d66341bfd845d6696`.
The package closure hash is
`d554bcd17619cead3de0012153f24a352b71dd45719262e0a7902c7453a033fe`.

Registration is complete, but RC55 and the RC47-RC55 archival queue remain
open. At implementation snapshot `729caae`, the canonical command passed the
static prerequisite and WebKit 4/4 but failed Chromium 0/4 because the locator
resolved to two identical `public-share-root` elements during hydration. A
separate ignored timing diagnostic confirmed that both roots coexist for about
1.17 seconds, including a period with one resolving and one ready root. Per the
bounded-remediation stop rule, no product or responsive-test behavior was
changed after this discovery. GitHub ruleset enforcement remains external and
unverified; no ruleset, branch-protection, runner, deployment, secret,
environment, OAuth, product behavior, responsive geometry, projection identity,
persistence, keyboard, Full E2E, integration branch, push, or deployment change
was made.
The unrelated Consumer Undo 44 px touch-target finding remains open. Rollback
is one local revert followed by manifest/truthfulness, static, Chromium,
WebKit, and production-evidence checks; no data or external rollback is needed.

## ARCH-RC55 public-share root lifecycle disposition — 2026-08-06

The bounded runtime remediation starts at
`371feb2641866aba28db0a5332971768bfe283a8` on
`fix/arch-rc55-public-share-root-lifecycle`. The tree was clean and
untracked-free, full `check:code-quality` passed, the Gate A3 ownership commit
was present, and no archival lifecycle patch had been applied.

The pre-fix MutationObserver sequence assigned stable node 1 to the resolving
server tree under hidden React stream owner `S:0`, then observed separately
created node 2 resolving and visible under `body`. Node 1 remained connected,
hidden/aria-hidden, non-inert, and contained 21 actionable descendants. Both
nodes had the same public projection SHA-256 identity and selected room. The
authoritative longer trace continued through simultaneous resolving/ready
states before node 1 disappeared about 1.17 seconds after navigation. This is
classification B, an SSR/hydration replacement defect at the automatic route
loading boundary, not duplicated responsive presentation or test navigation.

After remediation, `PublicShareResolvedRoot` is the sole source owner of
`data-testid="public-share-root"`. It mounts through a client-only dynamic
boundary (`ssr: false`), so the route stream contains the accessible
`public-share-loading` but no resolved or intermediate client-fallback server
tree. The mounted root itself transitions from resolving to ready and stays the same node
through resolving → ready and viewport, room, and saved-view generation
changes. A design-ID/share-token key invalidates the old root only for an
actual route generation change. Loading, invalid/revoked, and error keep
distinct non-root identities.
The static owner scan rejects any second JSX owner across `app` and
`components`.

The corrected focused production matrix is Chromium 4/4 and WebKit 4/4,
aggregate 8/8, with zero retry, flake, or skip. Observer samples never exceed
one connected or visible root, retain one node identity through both responsive
directions, reject duplicate stable selectors and out-of-owner actions, and
never focus a hidden, inert, removed, or superseded root. Visible and
accessibility-active lifecycle owner counts also stay at one even when Next
briefly connects a hidden outgoing fallback during invalid/error handoff. The
log fails on truncation while continuous maximum counters remain active. A database-gated
slow read, empty-content projection, actual error boundary, same-document token
A/B transition with a retained stale control, back/forward, reload, invalid,
and revoked coverage preserve public projection and room/view contracts. Gate
`ci.public-share-responsive`, its
required command, manifest ownership, release Gate A3 ownership, and the
22-gate / 373-source inventory remain unchanged.

No public authorization/projection, SHA-256 identity, persistence, geometry,
dependency, Full E2E, integration branch, push, deployment, runner, or GitHub
setting changed. GitHub ruleset enforcement remains externally pending, and
the Consumer Undo 44 px touch-target gap remains separate. Rollback is a local
revert of the lifecycle commit followed by strict rebuild, required responsive,
direct truthfulness/manifest, production-evidence, and critical-required
validation; no data or external rollback is needed.
