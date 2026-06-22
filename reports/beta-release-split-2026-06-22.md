# Beta Release Split Manifest - 2026-06-22

## Goal

Turn the current beta-ready but very dirty worktree into reviewable release commits without accidentally swallowing unrelated feature work.

## Safe First Commit: Beta Gate + Hygiene Shell

These files are safe to include together because they are new beta-gate artifacts or direct cleanup metadata:

- `.gitignore`
- `lib/snapshot-fingerprint.ts`
- `scripts/check-beta-release-worktree.ts`
- `tests/e2e/00-beta-smoke.spec.ts`
- `tests/e2e/beta-seed.ts`
- `reports/beta-release-hygiene-2026-06-22.md`
- `reports/beta-release-split-2026-06-22.md`
- tracked generated cleanup:
  - `.next 2/dev/fallback-build-manifest.json`
  - `.next 3/dev/build-manifest.json`
  - `.next 3/dev/fallback-build-manifest.json`
  - `.next 3/dev/node_modules/pg-587764f78a6c7a9c 2`
  - `.next 3/dev/package.json`
  - `.next 3/dev/prerender-manifest.json`
  - `.next 3/dev/routes-manifest.json`
  - `.next 3/dev/server/app-paths-manifest.json`
  - `.next 3/dev/server/pages-manifest.json`
  - `.next 3/dev/trace`

Patch-stage these hunks into the same commit if splitting carefully:

- `package.json`: only `release:beta-worktree`, `test:e2e:beta`, and `test:beta-gate`.
- `app/design/page.tsx`: only the QA fingerprint import/render hook.
- `app/share/[shareToken]/page.tsx`: only the QA fingerprint import/render hook.
- `app/share/[shareToken]/export/page.tsx`: only the QA fingerprint hook and PDF download test id.

Do not blindly stage those mixed files; they contain large pre-existing product work.

## Second Commit: Share/Export Controls

Group the share/export action surface after the beta gate shell:

- `components/SharePageActions.tsx`
- `components/DuplicateDesignButton.tsx`
- `app/share/[shareToken]/export/PlanSvgDownload.tsx`
- `app/share/[shareToken]/export/ShoppingCsvDownload.tsx`
- `app/share/[shareToken]/export/pdf/`
- `app/share/[shareToken]/export/ShoppingList.tsx`
- `app/share/[shareToken]/export/page.tsx` remaining export-pack changes
- `app/share/[shareToken]/page.tsx` remaining share-preview changes

Gate after this commit:

```bash
PLAYWRIGHT_WEB_SERVER_PORT=3111 PLAYWRIGHT_BASE_URL=http://localhost:3111 npm run test:e2e:beta
```

## Third Commit: Catalog Readiness

Group catalog assets and catalog governance together:

- new armchair catalog YAML directories
- new armchair GLBs and thumbnails
- `catalog/furniture/_upholstery_libraries/hamilton.yaml`
- modified upholstery/catalog YAML files
- deleted draft rug catalog entries
- catalog audit/test helpers touched in this release

Gate after this commit:

```bash
npm run test:catalog-audit
npm run test:catalog-asset-availability
```

## Fourth Commit: Editor Stability + Mobile/Performance

Group the large editor-side behavior changes last:

- `app/design/page.tsx`
- editor panels/renderers/floor/placement/shopping components
- room persistence/types/floor/layout/shopping helper modules
- mobile/touch/performance tests and support scripts

Gate after this commit:

```bash
npm run release:beta-worktree
PLAYWRIGHT_WEB_SERVER_PORT=3111 PLAYWRIGHT_BASE_URL=http://localhost:3111 npm run test:beta-gate
```

## Additional Review Buckets

The rerunnable audit now separates these buckets so they can be reviewed after the four primary release commits:

- API / persistence: design routes, layout route, duplication, payload, shopping readiness, and Next config changes.
- Shared UI / app shell: admin/model viewer, app shell styling/layout, dialogs, cart/list buttons, PDF button, Sentry fallback, style consistency, and Draco assets.

Both buckets are currently release-code candidates, not generated cleanup. Review them with the feature commits they support.

## Notes

- The full beta gate already passed with `PLAYWRIGHT_WEB_SERVER_PORT=3111 PLAYWRIGHT_BASE_URL=http://localhost:3111 npm run test:beta-gate`.
- No remaining `* 2.*` or `* 2` copy-suffix files were found outside ignored/generated paths after cleanup.
- The first commit can be staged safely as whole files except for the explicitly listed mixed files.
- `.next-dev.log` and `.vscode/` are ignored as local-only development noise.
