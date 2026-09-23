# Cabinetry Studio Phase 10 final report

Date: 2026-07-20

Post-report remediation completed later on the same date supersedes the lint,
design-page cleanup, and dependency-audit failures captured in this point-in-time
report. See `cabinetry-post-phase10-remediation.md` for the verified follow-up and
the release gates that still require a named release candidate and human evidence.

This report covers the Cabinetry Studio hardening program through Phase 10. It
does not convert known failures, manual gates, or dependency advisories into
passing claims.

## 1. Executive summary

The 10,505-line `CabinetryStudio.tsx` monolith is now a 2,696-line coordinator
and stable compatibility facade. Guided and Detailed presentation live in
hook-free, IO-free mode views; focused modules own storage, document IO,
analytics, state/history, controllers, preview rendering, and UI leaves. Phase
10 removed two duplicate artifacts, one unused production dependency, and
seven duplicate label-format implementations. All 20 Cabinetry browser tests
pass. Full-repository lint, the broad design-page cleanup command, and npm audit
remain non-green for the reasons recorded below.

## 2. Initial condition

- Safety branch: `safety/cabinetry-pre-phase1-20260719`.
- Checkpoint HEAD: `f813b2c17160173e3a529596acc0fc0ef2956a94`.
- Phase 10 began from the completed Phase 9 Batch 8 boundary with 144 modified
  and 96 untracked paths in the broad user-owned worktree.
- The canonical listener was PID 75292 on port 3000 with cwd
  `/Users/justus/Developer/interior-ai`.
- The floor-plan worker remained stopped; its state was not changed.

## 3. Original oversized responsibilities

The original Studio combined public API, initialization, React state/effects,
history, storage, analytics, import/export, validation, geometry-derived data,
generated parts and documents, Guided and Detailed markup, focus/keyboard
behavior, and 3D-preview orchestration.

## 4. Final architecture

`CabinetryStudio.tsx` is the composition root and lifecycle coordinator.
`CabinetryStudioGuidedView.tsx` and `CabinetryStudioDetailedView.tsx` own mode
markup and UI event adaptation. Focused components, hooks, state modules,
storage, analytics, and document-IO adapters sit below them. The overlay keeps
the implementation behind `next/dynamic` with `ssr: false`. See ADR 0001.

## 5. Final tree

```text
DesignPageDialogLayer
  -> CabinetryStudioOverlay (lazy boundary and measurement provider)
      -> CabinetryStudio (coordinator and public facade)
          -> GuidedView | DetailedView
              -> focused form, navigation, preview, inspector, output leaves
          -> hooks (interaction and preference lifecycles)
          -> state (history and definition commands)
          -> infrastructure (analytics and document IO)
          -> storage (validated local persistence)
          -> pure domain, validation, generation, and export modules
```

## 6. Dependency direction

Design-page composition depends on the overlay; the overlay depends on the
type-only contract and lazy Studio implementation; the Studio depends on mode
views and lower feature modules. Lower modules do not import the composition
root. Presentation does not own storage, analytics, document IO, generated-part
lifecycle, or React hooks. The 129-file feature graph has no runtime cycle.

## 7. Before-and-after lines

| Boundary | Before | Final | Guard |
| --- | ---: | ---: | ---: |
| Coordinator/facade | 10,505 | 2,696 | 2,750 |
| Guided view | inline | 1,896 | 2,050 |
| Detailed view | inline | 3,375 | 3,400 |
| Three composition surfaces total | 10,505 | 7,967 | separate guards |

The coordinator fell by 7,809 lines (74.3%). The combined presentation and
coordinator surfaces are 2,538 lines smaller (24.2%) than the original file;
additional explicit contracts and focused modules are intentionally outside
that total.

## 8. Complexity

A Phase 10 TypeScript-AST characterization counted 219 functions / 429 branch
nodes in the coordinator, 147 / 166 in Guided, and 233 / 590 in Detailed. The
deepest syntactic branch nesting observed was 8, 5, and 12 respectively. These
are characterization counts, not formal cyclomatic-complexity claims. Separate
line ratchets, ownership rules, and tests are the enforced controls.

## 9. Files added

The program adds 86 safe, non-ignored files relative to the checkpoint: 44
focused Cabinetry feature files, 29 test/benchmark/architecture scripts and
fixtures, one performance-budget config, and 12 architecture/QA documents
including this report and ADR 0001. The exact list is available with:

```bash
git ls-files --others --exclude-standard -- features/cabinetry config \
  docs/architecture docs/qa scripts tests/fixtures
```

## 10. Files modified

Eighteen program-scoped tracked files are modified: `CONTRIBUTING.md`, the
overlay/workspace/scene integration, the QA matrix, six existing Cabinetry
sources, both npm manifests, four existing Cabinetry tests, and the complete
Cabinetry Playwright specification.

## 11. Files removed

No tracked source file was deleted. Phase 10 removed two verified untracked
artifacts: an exact duplicate `app/api/auth/[...nextauth]/route 2.ts` and the
generated `test-results 2/.last-run.json`. Neither represented a registered
route or durable evidence.

## 12. Public contracts

The default `CabinetryStudio` export, named `CabinetryStudioProps` export,
create/edit modes, access level, callback payloads, false-return behavior,
loading/error semantics, DOM test IDs, roles, labels, focus, and keyboard
behavior remain covered and unchanged.

## 13. Saved data

No saved-data meaning changed. `CabinetDefinition.version`, canonical mm units,
stable definition/module/part/instance IDs, source fingerprints, placed-asset
adapters, and existing local-storage keys/formats remain compatible.

## 14. Migrations and fixtures

No new Cabinetry migration was required. Legacy Cabinetry v1 and design
document v1/v2 fixtures pass through the current v3 document boundary, retain
unknown fields where allowed, reject unsupported future data, preserve stable
IDs/transforms, and regenerate derived outputs.

## 15. State improvements

History, definition commands, selection repair, measurement drafts, custom
spaces, preferences, property focus, validation exposure, and module drag
ownership have explicit modules. Presentation receives values and callbacks
rather than mutating the canonical model.

## 16. Undo and redo

History is bounded, branch invalidation is tested, coalesced gestures commit
once, template deletion can be restored, and module reorder, locks, fitting,
placement, and editor document commands retain undo/redo behavior.

## 17. 2D and 3D

Both projections consume the same canonical placed definition and transform.
Dedicated plan and spatial adapters preserve elevation policy. The full browser
test for identity and transform parity between 2D and 3D passes.

## 18. Consumer and Pro modes

Both modes share one domain model, validation system, generation pipeline, and
saved representation. Consumer remains Guided and excludes Pro controls; Pro
may enter Detailed mode. `accessLevel` remains presentation capability, not
server authorization.

## 19. Security

Phase 7 request, privacy, import-size/type, authorization-source, and analytics
guards pass after updating the static import-order assertion to follow the
extracted document-IO adapter. `npm audit` is not green: all dependencies report
15 vulnerabilities (1 low, 11 moderate, 3 high); `--omit=dev` reports 11 (1
low, 9 moderate, 1 high). Direct affected packages include Sentry, Next via its
nested PostCSS, and Prisma; high transitive findings include Picomatch and, in
the full graph, Flatted and Minimatch. No automatic fix or broad upgrade was
performed.

## 20. Accessibility

Static accessibility checks pass for units, spinbuttons, sliders, named views,
visual choices, Guided navigation, tabs, status regions, focus recovery, and
keyboard preview controls. The complete responsive keyboard browser scenario
passes. Human screen-reader, zoom, contrast, and touch-device sign-off remains
a release gate.

## 21. Error and recovery behavior

Busy, success, failure, loading, validation recovery, invalid numeric drafts,
invalid imports, and local-backup quarantine/last-valid flows have explicit
tests. No catch suppression or silent success was added. The known manual
recovery and production-operational observations remain in the QA matrix.

## 22. Performance

Representative small/medium/large project budgets pass. Final large p95 values
were 3.740042 ms cold fingerprint, 0.000167 ms cached fingerprint, 1.222542 ms
save, and 7.237291 ms load. The 33-preset Cabinetry pipeline passes at 0.80 ms
p50 / 1.44 ms p95; the 24-module large run passes at 42.56 ms p50 / 43.41 ms
p95. No performance improvement is claimed from Phase 10 cleanup.

## 23. Bundle

The final production build measures initial JavaScript at 6,818,292 raw /
1,106,717 Brotli bytes and CSS at 135,416 / 17,544. The lazy Studio chunk is
492,018 raw / 84,799 Brotli, below its 500,000 / 85,000 limits. The lazy GLTF
exporter is 34,525 / 8,970, below 40,000 / 11,000. Removing the unused Stripe
browser SDK does not justify a measured bundle-saving claim because it was not
imported into the bundle.

## 24. Cleanup

- Removed `@stripe/stripe-js` from both manifests after a repository-wide
  static/dynamic/config/script/test search found zero references; pruned its
  installed package. Server-side `stripe` remains used.
- Consolidated seven identical enum-label formatters into the dependency-free
  `formatCabinetLabel` function and added focused tests.
- Verified all 129 Cabinetry source files have a resolved incoming edge; no
  feature source was deleted as dead.
- Exact-function review found nine remaining duplicate-body groups. Pointer
  drag cancellation and responsive/specialty markup were retained because
  extraction would cross behavior-sensitive ownership or represent distinct
  presentation contexts.
- Removed one stale Phase-owned unused destructure and updated the security
  guard for the approved adapter boundary.

## 25. Tests

Focused domain, validation, storage, state, controller, infrastructure, UI,
composition, accessibility, persistence, history, security, performance,
schema, production-build, and browser tests ran. The complete Cabinetry browser
file passed 20/20 with one worker and zero retries in 31.0 minutes.

## 26. Exact commands

```bash
git status --short
git diff --check
npx tsc --noEmit --incremental false --pretty false
npx tsc --noEmit --incremental false --pretty false --noUnusedLocals --noUnusedParameters
npx eslint features/cabinetry components/editor/design-page/CabinetryStudioOverlay.tsx \
  components/editor/design-page/DesignPageWorkspace.tsx \
  scripts/test-cabinetry-studio-pure-logic.ts \
  scripts/test-phase7-security-boundaries.ts --max-warnings 0
npm run lint
npm run verify:cabinetry
npm run verify:design-persistence
npm run test:phase7-security-boundaries
npm run test:editor-command-history
npm run test:design-page-history-controller
npm run test:design-page-cleanup
npx prisma validate
npm run build
npm run test:phase8-performance
npx playwright test tests/e2e/cabinetry-studio.spec.ts
npm ls --depth=0
npm audit --json
npm audit --omit=dev --json
npm outdated --json
curl -sS -i http://127.0.0.1:3000/api/health?deep=1
```

## 27. Results

| Gate | Result |
| --- | --- |
| Scoped format/whitespace | Pass |
| Non-incremental TypeScript | Pass |
| Scoped ESLint, zero warnings | Pass |
| Repository-wide strict unused-symbol audit | Fail: 14 candidates outside the Cabinetry feature; no Cabinetry candidate |
| Full repository ESLint | Fail: one unchanged `HousePlanRenderer3D` React-compiler error and two unchanged unused-symbol warnings |
| Cabinetry deterministic gate | Pass |
| Persistence and old fixtures | Pass |
| Security boundary checks | Pass |
| Editor history checks | Pass |
| Prisma schema validation | Pass |
| Production build | Pass with existing broad NFT-trace warning in floor-plan import code |
| Phase 8 performance/bundle | Pass |
| Cabinetry Playwright | Pass, 20/20 in 31.0 minutes |
| Design-page cleanup aggregate | Fail: pre-checkpoint admin catalog-health-link assertion |
| npm dependency tree | Pass with an extraneous optional `@emnapi/runtime` hoist warning |
| npm vulnerability audit | Fail: 15 all / 11 production-reachable findings |
| Deep health | HTTP 200, degraded only for an old queued floor-plan import with no active worker lease |

The final broad worktree remains intentionally uncommitted at 145 modified and
97 untracked status entries, with no tracked deletion or rename. Phase 10 did
not stage or commit any path.

## 28. Dependencies

One unused production dependency was removed; the audited production graph
fell from 431 to 430 packages. Client/server pairs retained for distinct
runtimes include PostHog and Sentry; server Stripe remains. PDF-Lib generates
PDFs while PDF.js reads them. Tesseract core and language data are paired.
Three, React Three Fiber, Drei, and Three-stdlib overlap in domain but have
verified direct imports. Large installed packages include Three (~36.9 MiB),
PDF.js (~35.7 MiB), Three-stdlib (~28.9 MiB), Stripe (~18.9 MiB), and OpenAI
(~9.6 MiB); installed size is not browser transfer size. Version upgrades were
reported separately and not mixed into this refactor.

## 29. Remaining oversized modules

- `generateCabinetDocumentation.ts`: 8,372 lines.
- `validation.ts`: 3,842 lines.
- `CabinetryStudioDetailedView.tsx`: 3,375 lines.
- `generateCabinetParts.ts`: 2,775 lines.
- `CabinetryStudio.tsx`: 2,696 lines.
- `presets.ts`: 2,606 lines.
- `types.ts`: 2,228 lines.
- `CabinetryStudioGuidedView.tsx`: 1,896 lines.
- `useDesignPageCabinetry.ts`: 1,379 lines.

## 30. Justifications

The coordinator remains large because it explicitly composes many established
commands and derived models; extracting another family without a separately
reviewed lifecycle contract would create hidden ordering risk. Detailed and
Guided views are intentionally exhaustive presentation boundaries. Generation,
validation, presets, and types require domain-specific fixtures before any
split. Their sizes are debt with guards, not approval to grow.

## 31. Technical debt

Outstanding debt includes vulnerable transitive dependency chains, full-repo
lint debt in `HousePlanRenderer3D`, 14 strict unused-symbol candidates outside
the Cabinetry feature, a stale admin-link assertion in the broad
cleanup aggregate, large generation/validation/catalog modules, possible
shared pointer-drag lifecycle extraction, incomplete automated React commit/GPU
memory measurements, and manual release-evidence rows.

## 32. Risks

The lazy Studio chunk has only 201 Brotli bytes of headroom. Current npm
advisories include a production-reachable high finding. Labeled tuples rely on
their static order guard. Exhaustive Detailed markup remains change-sensitive.
The running service remains degraded while the intentionally stopped floor-plan
worker leaves an old import queued. Broad user-owned dirty changes remain
uncommitted and must not be mistaken for an isolated Phase 10 patch.

## 33. Next three highest-value actions

1. Run a dedicated dependency-security batch for Sentry, nested PostCSS/Next,
   Prisma/Hono, and vulnerable glob/serialization chains, with build and E2E
   evidence and no automatic major downgrade.
2. Resolve the unchanged `HousePlanRenderer3D` memoization lint error and the
   stale admin catalog-health assertion in separately owned patches, restoring
   green full-repository gates.
3. Complete the signed manual release-evidence matrix, including screen reader,
   zoom, touch/device/network, analytics, fabricator, and production recovery
   observations.

## 34. Changes deliberately not made

No broad dependency upgrade, `npm audit fix`, global context, mega-controller,
schema version, storage-key change, worker change, floor-plan fix, tracked-file
deletion, bundle-limit increase, lint suppression, unsafe cast, test skip,
remote operation, stage, commit, push, reset, stash, or clean was performed.

## 35. Conclusions requiring further verification

Automated evidence supports the scoped architecture and behavior, but release
approval still requires human accessibility/usability/fabricator evidence,
device/network profiling, dependency-advisory remediation and exploitability
review, a green full-repository lint gate, resolution of the broad admin-link
assertion, and an operational decision about the intentionally stopped
floor-plan worker. Phase 10 is complete as an implementation/audit phase, not a
claim that the entire dirty repository is release-ready.
