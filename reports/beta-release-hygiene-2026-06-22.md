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
- `PLAYWRIGHT_WEB_SERVER_PORT=3118 PLAYWRIGHT_BASE_URL=http://localhost:3118 npm run test:beta-release-candidate` passed end to end.
- `npm run test:catalog-audit:strict` passed, including strict catalog quality mode where warnings are beta blockers.
- `npm run test:catalog-asset-availability` passed with 86 catalog files, 617 asset refs, 0 missing local URLs, and remote checking disabled by default.
- `PLAYWRIGHT_WEB_SERVER_PORT=3117 PLAYWRIGHT_BASE_URL=http://localhost:3117 npm run test:beta-gate` passed end to end after the smart placement/circulation upgrade.
- `PLAYWRIGHT_WEB_SERVER_PORT=3119 PLAYWRIGHT_BASE_URL=http://localhost:3119 npm run test:beta-gate` passed end to end after the beta readiness diagnostics cleanup.
- The beta smoke path validates persisted API state, share-page fingerprint, export-page fingerprint, PDF bytes, CSV/SVG/PNG downloads, mobile/tablet overflow, lite-mode control, and mocked checkout payload.
- The beta gate runs `CATALOG_STRICT_VALIDATION=true npm run build` so runtime catalog validation is strict during the release build.
- `CATALOG_CHECK_REMOTE_ASSETS=true npm run test:catalog-asset-availability` passed with 282 remote URLs checked and 0 failing.

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
- The room health badge is actionable and routes users into Shop, Export, Furnish, or Plan based on the highest-priority room issue.
- Share/export fidelity, catalog commerce readiness, room health, room fix preview, first-run activation, and ranked placement recommendation helpers are covered by `npm run test:beta-readiness-upgrades`.
- Smart placement has a dedicated release-candidate Playwright smoke at `npm run test:e2e:smart-placement`.
- The readiness diagnostics cleanup was committed as `b227ecb feat: add beta launch readiness diagnostics`.

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

Review each commit independently when possible; the full stack is also covered by the blocking beta gate above.

## Rerunnable Worktree Audit

Use this command before staging or release review:

```bash
npm run release:beta-worktree
```

It buckets dirty worktree paths into beta gate/hygiene, share/export, catalog readiness, editor stability, API/persistence, shared UI/app shell, generated cleanup, and review-needed files. It also fails on accidental copy-suffix artifacts, including tracked files that would be present in a clean checkout.

## Remaining Release Follow-Up

- Run `npm run test:beta-release-candidate` immediately before tagging or opening the release PR.
- Run the manual staging smoke checklist in `reports/beta-staging-smoke-checklist-2026-06-23.md` once staging auth/payment boundary configuration is available.
- Keep checkout completion out of the local blocker until staging payment credentials are explicitly configured; local beta gate validates checkout start with a mocked response.
- If new catalog items are added before beta, require them to pass strict catalog audit, asset availability, price/link readiness, and replacement-suggestion eligibility before publishing.
