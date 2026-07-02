# Dirty Worktree Stabilization Readiness - 2026-06-03

## Summary

This dirty tree is a broad MVP-hardening batch, not a small cleanup. Treat it as one stabilization branch with three groups: core Hugg/catalog/media behavior, QA tooling, and framework migration.

Fast checks are currently expected to stay strict:

- PASS `npm run lint`
- PASS `npx tsc --noEmit`
- PASS `git diff --check`
- PASS `npm run test:catalog-audit`
- PASS `npm run test:catalog-asset-availability`
- PASS `npm run test:catalog-panel`
- PASS `npm run test:import-preflight`
- PASS `npm run build`
- PASS `npx playwright test tests/e2e/100-hugg-smoke.spec.ts --timeout=120000`
- PASS `npx playwright test tests/e2e/12-variant-identity.spec.ts tests/e2e/98-dawson-variant-selector.spec.ts tests/e2e/100-hugg-smoke.spec.ts --timeout=120000`

## Core batch

Safe to keep in the main stabilization batch:

- Hugg/catalog/media/rendering updates in `app/design/page.tsx`, catalog YAML, catalog resolver/view-builder/normalizer modules, product selector/config modules, `FurnitureItem`, `GLBScaledModel`, and related generated thumbnails.
- Sideboard model assets and dining thumbnail assets, because catalog asset availability reports zero missing local files.
- Lazy image fallback cleanup, canvas/loading/error-boundary cleanup, and Sentry/performance-monitor hardening.

Verified by automated Hugg smoke:

- Hugg fabric and wood switching in `/design`.
- Hugg open/closed configurable state behavior where available.
- Hugg selected variant identity into cart after fabric and wood switching.

Still needs visual smoke before commit:

- Sideboard/dining thumbnails in catalog cards and detail drawer.
- Manual drag/move feel in the canvas, because object movement is canvas-rendered and not reliably asserted by DOM selectors.

Fixes found during smoke:

- Hugg fabric switching now preserves the selected wood variant by matching sibling variants by id, normalized finish code, then normalized finish label.
- Catalog detail drawer Add to room now uses the resolved `detail.variantId` instead of a potentially stale active finish id.
- Dawson Storage Ottoman media now uses distinct Castlery product-page images instead of repeated width variants of one packshot.
- Ollie and Dawson Storage Ottoman model assets are included in the orphan asset sync script, and the local approved model asset rows were upserted.
- Public legacy catalog export now excludes placeholder commerce entries by default. The Hugg square table entries use the real Castlery Singapore product URL, and a new `test:public-catalog-placeholders` gate is part of `test:catalog-audit`.
- Onboarding auto-complete no longer hardcodes legacy mock rug/chair/lamp/coffee-table IDs; it picks available catalog items by category and no-ops when a category is unavailable.

## Tooling and debug

Commit as QA tooling:

- `app/models-test/ModelDownloadCell.tsx`, because it removes inline script injection from the existing models test page and keeps model availability checks local to that page.
- `scripts/generate-catalog-thumbs.ts`, if you want to keep a repeatable local thumbnail generation utility for imported model assets.

Gated QA route:

- `app/hugg-test/page.tsx` is now guarded by a server route check. It is available in local development, or in builds where `NEXT_PUBLIC_ENABLE_QA_HOOKS=1`; normal production returns 404.
- `tests/e2e/100-hugg-smoke.spec.ts` is a focused QA smoke for Hugg fabric, wood, configurable layout, rotation, cart identity, and 2D/3D view toggles.

## Framework migration

Safe to keep together as one migration group:

- `middleware.ts` deletion and new `proxy.ts`, matching the Next proxy convention.
- `next.config.ts` `distDir: ".next-cache"`.
- `.gitignore` and `eslint.config.mjs` updates for `.next-cache`.
- `tsconfig.json` includes for `.next-cache` generated types.

## Known follow-ups

- Continue replacing quarantined legacy placeholders in `lib/catalog.ts` with YAML-backed imported products. Do not re-enable placeholders for production; `CATALOG_INCLUDE_PLACEHOLDER_ITEMS=1` is only an explicit local/debug escape hatch.
- Decide whether `/dashboard` should continue opening legacy `/design/[id]` or route saved designs through the newer `/design` editor.
- Playwright runs in the Codex/VS Code shell still print a non-app Node warning when both `NO_COLOR` and Playwright color forcing are present. Use `env -u NO_COLOR npx playwright test ...` for quieter local output, or add a dedicated wrapper script in a separate tooling cleanup.
