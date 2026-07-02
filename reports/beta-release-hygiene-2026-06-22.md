# Beta Release Hygiene - 2026-06-22

## Release Status

- The beta stabilization worktree has been cleaned and split into reviewable release commits.
- `npm run release:beta-worktree` reports `Changed paths: 0` after the latest beta placement upgrade.
- Accidental/generated artifacts were removed from repo-facing paths, including duplicate `* 2.*` docs/configs/scripts/migrations/public SVGs, `incoming/test_sofa 2.glb`, `.next 2`, and `.next 3`.
- Local-only `.next-dev.log`, `.next*`, and `.vscode/` noise is ignored so it no longer pollutes release status.

## Draft Rug Deletions

The deleted rug catalog entries were confirmed as draft-only:

- `catalog/furniture/rugs/mira_wool_area_rug/catalog.yaml`
- `catalog/furniture/rugs/sienna_wool_area_rug/catalog.yaml`

Both had draft blockers for missing local model assets and unvalidated commerce mappings, so keeping the deletions is beta-safe.

## Armchair Readiness

New armchair release candidates are currently live/published and passed the local beta gates:

- Arden Performance Swivel Armchair
- Cammy Armchair
- Hamilton Round Swivel Armchair
- Hamilton Round Swivel 1.5 Seater Armchair
- Jaron Recliner Armchair
- Jaron Recliner Armchair Wide Arm
- Lena Armchair
- Mori Performance Fabric Armchair
- Owen Armchair
- Sacha Performance Boucle Armchair
- Solange Performance Boucle Chair
- Winora Armchair

No armchair assets were draft-gated in this pass because the catalog audit and local asset availability checks passed.

## Verified Gates

- `npm run release:beta-worktree` passed and is included in `npm run test:beta-gate`.
- `npm run test:beta-release-candidate` now chains the full beta gate, remote catalog asset availability, and staging checklist validation.
- `npm run test:beta-staging-evidence` validates the completed staging evidence bundle, stable alias promotion, feedback report id, checkout/fingerprint retest, linked artifact files, and absence of raw auth/protection headers in evidence text artifacts.
- `npm run test:beta-staging-artifacts` validates the staging evidence artifact manifest, file sizes, SHA-256 hashes, required screenshots/exports, file signatures, and text artifact redaction.
- `npm run test:beta-release-handoff` validates `reports/beta-release-handoff-2026-06-24.md` against staging evidence, stable alias promotion, feedback reference, and no-secret documentation rules.
- `PLAYWRIGHT_WEB_SERVER_PORT=3118 PLAYWRIGHT_BASE_URL=http://localhost:3118 npm run test:beta-release-candidate` passed end to end.
- `PLAYWRIGHT_WEB_SERVER_PORT=3146 PLAYWRIGHT_BASE_URL=http://localhost:3146 npm run test:beta-release-candidate` passed end to end on commit `ec920a7`.
- Post-release-candidate beta-stability commits through `6d32fdd` passed targeted local blockers: `npx tsc --noEmit`, `npm run lint`, `npm run test:beta-editor-polish`, `npm run test:floor-plan-quality`, `npm run test:ai-layout-planner`, `npm run test:ai-layout-preview`, `npm run test:plan-template-access`, `npm run test:house-plan-wall-rendering`, and `npx playwright test tests/e2e/pro-upgrade.spec.ts`.
- `PLAYWRIGHT_WEB_SERVER_PORT=3147 PLAYWRIGHT_BASE_URL=http://localhost:3147 npm run test:beta-release-candidate` passed end to end on app/test HEAD `4b64b9e`.
- Post-RC Load/template access commits through `0d29c06` passed targeted blockers: `npm run build:e2e`, `PLAYWRIGHT_WEB_SERVER_PORT=3151 PLAYWRIGHT_BASE_URL=http://localhost:3151 npx playwright test tests/e2e/00-beta-smoke.spec.ts --workers=1`, `npm run test:plan-template-access`, `npm run lint`, and `npm run release:beta-worktree`.
- `PLAYWRIGHT_WEB_SERVER_PORT=3153 PLAYWRIGHT_BASE_URL=http://localhost:3153 npm run test:beta-release-candidate` passed end to end on app/test HEAD `20d08bd`, closing the post-RC Load/template validation gap.
- `npm run test:catalog-audit:strict` passed, including strict catalog quality mode where warnings are beta blockers.
- `npm run test:catalog-asset-availability` passed with 86 catalog files, 617 asset refs, 0 missing local URLs, and remote checking disabled by default.
- `PLAYWRIGHT_WEB_SERVER_PORT=3117 PLAYWRIGHT_BASE_URL=http://localhost:3117 npm run test:beta-gate` passed end to end after the smart placement/circulation upgrade.
- `PLAYWRIGHT_WEB_SERVER_PORT=3119 PLAYWRIGHT_BASE_URL=http://localhost:3119 npm run test:beta-gate` passed end to end after the beta readiness diagnostics cleanup.
- The beta smoke path validates persisted API state, share-page fingerprint, export-page fingerprint, PDF bytes, CSV/SVG/PNG downloads, mobile/tablet overflow, lite-mode control, and mocked checkout payload.
- The beta gate runs `CATALOG_STRICT_VALIDATION=true npm run build` so runtime catalog validation is strict during the release build.
- `CATALOG_CHECK_REMOTE_ASSETS=true npm run test:catalog-asset-availability` passed with 282 remote URLs checked and 0 failing.
- Vercel preview deployment `dpl_JBSJ9jQ5jGhDWvjcjd4CTiA3xAYz` is `READY` at `https://interior-ai-justuslaw66-max-justuslaw66-maxs-projects.vercel.app` from commit `d98ef4e`.
- The staging deploy required refreshing `pnpm-lock.yaml` and excluding static/model assets from serverless output tracing; Vercel inspect now reports small serverless functions instead of the prior 250 MB bundle warnings.
- The Google sign-in staging retry reset preview `NEXTAUTH_URL` and `APP_ORIGIN` to the stable alias, removed a malformed preview `NODE_ENV`, and stopped runtime catalog validation from requiring static model files inside serverless functions.
- Preview `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `AUTH_SECRET` were refreshed from local `.env.local` after Google returned `invalid_client` for the older Preview secret.
- The stable staging alias now points to preview deployment `dpl_9e2Pi2wjB3yopf5oLWKcYtuUmGdw`, which includes checkout-boundary, QA-marker, and feedback-reference upgrades. Alias evidence is captured in `reports/staging-smoke-evidence-2026-06-24/stable-alias-promotion-result.json`.

## Smart Placement / Circulation

Manual placement guidance is now beta-gated:

- `d397c4f feat: improve manual placement guidance`
- Walking-path circulation analysis feeds manual placement scoring and the placement heatmap.
- The placement panel is guarded for improved nearby spot, best room, best option, restore valid spot, smart confirm, keyboard nudge/rotate/enter, score-aware target validity, and circulation analysis.
- `npm run test:beta-editor-polish` now includes the placement/circulation guard scripts before the beta smoke test runs.

## Beta Readiness Upgrade Pass

The next beta-readiness upgrades are now implemented and guarded:

- Staging checkout hard stops run inside Stripe and Shopify checkout starts through secret-safe boundary diagnostics.
- Admin overview shows checkout boundary diagnostics and catalog commerce readiness before staging signoff.
- The room header shows active room health, placement score, and the next action when the room needs review.
- Beta feedback payloads include selected item, placement score/kind, shopping readiness, save status, share state, viewport, and placement target context.
- Beta feedback submissions now return a persisted report reference from the app-event API and show that reference in the feedback dialog for staging signoff.
- Admin overview includes beta feedback triage cards with note, page, room, mode, placement, shopping, save, and share context.
- Admin beta feedback triage can be downloaded as CSV for spreadsheet review.
- Admin beta feedback triage includes severity and routing labels for save, placement, shopping, share/export, and general feedback.
- Admin overview includes a combined Beta Launch Readiness summary for checkout, catalog, feedback, share, and export signals.
- Admin Beta Launch Readiness can be downloaded as CSV evidence for staging signoff.
- Share and export QA hooks expose fidelity counts for rooms, items, openings, saved views, checkout-ready items, retailer-ready items, and missing commerce.
- Share and export pages show visible handoff integrity status, not only hidden QA metadata.
- Share and export pages show a visible handoff ID derived from the saved snapshot fingerprint.
- Share and export room schedules now include room health score and next action, so handoff review catches layout/shopping/export issues.
- The editor exposes a first-run activation QA marker for template, item, save, and share/export progress.
- The beta start panel now shows first-run activation progress and the next activation step.
- The admin staging smoke evidence panel is now an editable browser-persisted worksheet with row status, evidence fields, notes, and JSON/CSV/Markdown exports based on the tester's edited state.
- The editor emits `first_run_activation_step_completed` app events for template, item, save, and share/export activation steps with guided/manual mode, save/share state, room/item counts, and viewport context.
- `npm run test:e2e:mobile-plan` guards phone and tablet 2D Plan mode controls, manual action tap targets, and horizontal overflow.
- The room health badge is actionable and routes users into Shop, Export, Furnish, or Plan based on the highest-priority room issue.
- Share/export fidelity, catalog commerce readiness, room health, room fix preview, first-run activation, and ranked placement recommendation helpers are covered by `npm run test:beta-readiness-upgrades`.
- Smart placement has a dedicated release-candidate Playwright smoke at `npm run test:e2e:smart-placement`.
- The readiness diagnostics cleanup was committed as `b227ecb feat: add beta launch readiness diagnostics`.
- Share and export pages now show first-viewport client/export package summaries with guarded PDF, shopping, export-pack, and copy-to-edit actions.
- Mobile share/export handoff coverage now checks phone/tablet overflow and finger-friendly actions in `tests/e2e/pro-upgrade.spec.ts`.
- Whole-home 3D presentation cleanup removes persistent floating room/floor labels, stabilizes wall cutaway behavior, and queues template 3D camera restores until the 3D camera is mounted.
- Floor-plan quality issues now carry target metadata and render lightweight 2D hints, so fix actions can jump to the relevant room, wall, opening, or furniture item.

## Release Commit Stack

The cleanup was split into these commits:

- `28a3332 chore: add beta release hygiene gate`
- `1b0893e test: add beta smoke harness foundation`
- `fe332fa feat: polish beta share export preview`
- `eb2b5f0 feat: stabilize beta editor workflow`
- `6cb0151 feat: prepare beta catalog armchairs`
- `2eba7d8 fix: harden design persistence routes`
- `737bd12 feat: polish shared beta app shell`
- `96b096b chore: wire beta gate scripts`
- `f93a42a feat: add beta feedback capture`
- `f200d5f feat: add Hamilton leather upholstery variants`
- `462857f chore: gate beta editor polish checks`
- `d397c4f feat: improve manual placement guidance`
- `b227ecb feat: add beta launch readiness diagnostics`
- `a66603f chore: refresh pnpm lockfile for staging deploy`
- `3004b88 fix: slim Vercel serverless traces`
- `d98ef4e fix: avoid runtime catalog asset bundling on Vercel`
- `7fcd109 feat: add furnished starter plan templates`
- `05dee18 feat: add beta staging smoke evidence exports`
- `090b90d feat: harden beta editor readiness gate`
- `ca1a5aa docs: add beta staging evidence handoff`
- `ec920a7 chore: clean staging artifact guard import`
- `3729538 docs: record beta release candidate verification`
- `5af40a6 feat: polish shared client handoff summary`
- `8b8ba81 feat: polish export package summary`
- `646cb03 fix: stabilize whole-home wall cutaway`
- `7988b95 fix: reset template camera state`
- `5541176 test: harden mobile share export handoff`
- `13a6d32 fix: queue template 3d camera restore`
- `b2cf2af fix: clean whole-home 3d presentation`
- `6d32fdd feat: target floor plan quality fixes`
- `4b64b9e docs: refresh beta release handoff status`

Review each commit independently when possible; the full stack is also covered by the blocking beta gate above.

## Rerunnable Worktree Audit

Use this command before staging or release review:

```bash
npm run release:beta-worktree
```

It buckets dirty worktree paths into beta gate/hygiene, share/export, catalog readiness, editor stability, API/persistence, shared UI/app shell, generated cleanup, and review-needed files. It also fails on accidental copy-suffix artifacts, including tracked files that would be present in a clean checkout.

Use this command after staging smoke evidence is captured and the stable alias is promoted:

```bash
npm run test:beta-staging-evidence
```

Use this command after adding, removing, or regenerating staging evidence files:

```bash
npm run test:beta-staging-artifacts
```

Use this command after updating release notes or handoff details:

```bash
npm run test:beta-release-handoff
```

## Remaining Release Follow-Up

- The latest full release-candidate gate passed on app/test HEAD `20d08bd`; this report refresh is documentation-only. Rerun `npm run test:beta-release-candidate` immediately before tagging or opening the release PR if any non-documentation change lands.
- Keep the handoff manifest in `reports/beta-release-handoff-2026-06-24.md` aligned with the promoted staging alias and evidence bundle.
- Regenerate `reports/staging-smoke-evidence-2026-06-24/artifact-manifest.json` if any staging evidence artifact is intentionally replaced.
- Keep the manual staging smoke checklist in `reports/beta-staging-smoke-checklist-2026-06-23.md` green and rerun `npm run test:beta-staging-evidence` if any staging evidence or alias target changes.
- Keep checkout completion out of the local blocker until staging payment credentials are explicitly configured; local beta gate validates checkout start with a mocked response.
- If new catalog items are added before beta, require them to pass strict catalog audit, asset availability, price/link readiness, and replacement-suggestion eligibility before publishing.
