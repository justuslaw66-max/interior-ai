# Beta Release Hygiene - 2026-06-22

## Dirty Worktree Buckets

- Release code: editor, share/export, persistence, shopping readiness, catalog, and E2E changes remain in the worktree for beta stabilization.
- Release assets: new armchair catalog YAML, model GLBs, and thumbnails are release candidates.
- Accidental/generated artifacts: duplicate `* 2.*` docs/configs/scripts/migrations/public SVGs, `incoming/test_sofa 2.glb`, `.next 2`, and `.next 3` were removed.

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

- `npm run release:beta-worktree` passed and is now included in `npm run test:beta-gate`.
- `npm run test:catalog-audit` passed.
- `npm run test:catalog-asset-availability` passed with 86 catalog files, 617 asset refs, 0 missing local URLs, and remote checking disabled by default.
- `PLAYWRIGHT_WEB_SERVER_PORT=3111 PLAYWRIGHT_BASE_URL=http://localhost:3111 npm run test:beta-gate` passed end to end.

Remote media availability remains covered by enabling `CATALOG_CHECK_REMOTE_ASSETS=true` when a network-capable release environment is available.

## Recommended Commit Buckets

Use separate commits so the beta release can be reviewed without turning into one giant diff:

- Beta gate and QA harness: snapshot fingerprinting, QA-only fingerprint DOM hooks, beta seed helper/spec, export/share test IDs, and `test:e2e:beta` / `test:beta-gate` scripts.
- Release hygiene cleanup: `.gitignore`, duplicate generated/copy-suffix artifact deletions, and this report.
- Catalog release assets: armchair catalog YAML, model GLBs, thumbnails, upholstery libraries, and draft rug deletions.
- Editor and share/export product work: the large editor, persistence, shopping readiness, share, export, and mobile/performance changes that predated this final gate pass.

Because several beta-gate files also contain pre-existing feature edits, avoid a blind commit of individual large files unless the whole release surface is intended to ship together.

## Rerunnable Worktree Audit

Use this command before staging or release review:

```bash
npm run release:beta-worktree
```

It buckets the dirty worktree into beta gate/hygiene, share/export, catalog readiness, editor stability, generated cleanup, and review-needed files. It also fails on accidental copy-suffix artifacts, including tracked files that would be present in a clean checkout.

## Cleanup Pass Follow-Up

- Local-only `.next-dev.log` and `.vscode/` noise is ignored so it no longer pollutes release status.
- The worktree audit now uses NUL-delimited Git status parsing, so paths with spaces are classified correctly.
- The audit now separates API/persistence and shared UI/app shell changes instead of leaving them in a vague `other` bucket.
- Current audit result: `other (0)`, with remaining changes fully bucketed for release review.
- Tracked generated `.next 2` / `.next 3` files remain isolated as generated cleanup deletions and should be included only in the hygiene cleanup commit.
