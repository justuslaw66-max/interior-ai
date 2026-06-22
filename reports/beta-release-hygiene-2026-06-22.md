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
- `npm run test:catalog-audit:strict` passed, including strict catalog quality mode where warnings are beta blockers.
- `npm run test:catalog-asset-availability` passed with 86 catalog files, 617 asset refs, 0 missing local URLs, and remote checking disabled by default.
- `PLAYWRIGHT_WEB_SERVER_PORT=3117 PLAYWRIGHT_BASE_URL=http://localhost:3117 npm run test:beta-gate` passed end to end after the smart placement/circulation upgrade.
- The beta smoke path validates persisted API state, share-page fingerprint, export-page fingerprint, PDF bytes, CSV/SVG/PNG downloads, mobile/tablet overflow, lite-mode control, and mocked checkout payload.
- The beta gate runs `CATALOG_STRICT_VALIDATION=true npm run build` so runtime catalog validation is strict during the release build.
- `CATALOG_CHECK_REMOTE_ASSETS=true npm run test:catalog-asset-availability` passed with 282 remote URLs checked and 0 failing.

## Smart Placement / Circulation

Manual placement guidance is now beta-gated:

- `d397c4f feat: improve manual placement guidance`
- Walking-path circulation analysis feeds manual placement scoring and the placement heatmap.
- The placement panel is guarded for improved nearby spot, best room, best option, restore valid spot, smart confirm, keyboard nudge/rotate/enter, score-aware target validity, and circulation analysis.
- `npm run test:beta-editor-polish` now includes the placement/circulation guard scripts before the beta smoke test runs.

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

Review each commit independently when possible; the full stack is also covered by the blocking beta gate above.

## Rerunnable Worktree Audit

Use this command before staging or release review:

```bash
npm run release:beta-worktree
```

It buckets dirty worktree paths into beta gate/hygiene, share/export, catalog readiness, editor stability, API/persistence, shared UI/app shell, generated cleanup, and review-needed files. It also fails on accidental copy-suffix artifacts, including tracked files that would be present in a clean checkout.

## Remaining Release Follow-Up

- Run the beta gate again immediately before tagging or opening the release PR.
- Repeat `CATALOG_CHECK_REMOTE_ASSETS=true npm run test:catalog-asset-availability` immediately before beta tagging if catalog media changes.
- Run the staging smoke checklist once staging auth/payment boundary configuration is available: sign in, start from `/design`, load template, place furniture manually, verify smart placement guidance, save, reload, share, export PDF/CSV/PNG/SVG, open retailer links, and start checkout boundary.
- Keep checkout completion out of the local blocker until staging payment credentials are explicitly configured; local beta gate validates checkout start with a mocked response.
- If new catalog items are added before beta, require them to pass strict catalog audit, asset availability, price/link readiness, and replacement-suggestion eligibility before publishing.
