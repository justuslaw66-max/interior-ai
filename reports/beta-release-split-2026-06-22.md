# Beta Release Split Manifest - 2026-06-22

## Goal

Turn the beta-ready but very dirty worktree into reviewable release commits without accidentally swallowing unrelated feature work.

Status: completed. The worktree is clean, the release commits are split, and the blocking beta gate passed.

## Final Commit Stack

- `28a3332 chore: add beta release hygiene gate`
- `1b0893e test: add beta smoke harness foundation`
- `fe332fa feat: polish beta share export preview`
- `eb2b5f0 feat: stabilize beta editor workflow`
- `6cb0151 feat: prepare beta catalog armchairs`
- `2eba7d8 fix: harden design persistence routes`
- `737bd12 feat: polish shared beta app shell`
- `96b096b chore: wire beta gate scripts`

## Review Buckets Delivered

- Release hygiene and audit gate: `.gitignore`, copy-suffix/generated cleanup, hygiene reports, and `scripts/check-beta-release-worktree.ts`.
- Beta smoke harness: deterministic seed helper, canonical snapshot fingerprinting, QA-only DOM hooks, and `tests/e2e/00-beta-smoke.spec.ts`.
- Share/export preview: share actions, export pack downloads, PDF route, shopping CSV helpers, and share-page checkout readiness.
- Editor workflow: beta start, editor fingerprint hook, persistence, manual placement, floor/material controls, shopping readiness, mobile/touch controls, and lite-mode hooks.
- Catalog readiness: armchair catalog/model/thumb assets, catalog audit helpers, draft rug deletion, and placement/readiness tests.
- API/persistence hardening: design route payload parsing, snapshot validation, share-token access, AI layout payloads, and route-level tests.
- Shared app shell: layout/style polish, dialogs, cart/list buttons, PDF button, Sentry fallback, Draco assets, and style consistency checks.
- Script wiring: `test:beta-gate`, focused beta/editor test aliases, and default `next dev` scripts.

## Final Gate

```bash
PLAYWRIGHT_WEB_SERVER_PORT=3111 PLAYWRIGHT_BASE_URL=http://localhost:3111 npm run test:beta-gate
```

Passed end to end after the final script wiring commit.

## Rerunnable Audit

Use this before release review or tagging:

```bash
npm run release:beta-worktree
```

The latest clean audit reported `Changed paths: 0` and no accidental copy-suffix artifacts.

## Notes

- Review the stack commit-by-commit rather than as one giant release diff.
- Enable `CATALOG_CHECK_REMOTE_ASSETS=true` in a network-capable release environment before final beta signoff.
- Keep the mocked local checkout boundary in the beta gate; real payment completion belongs in staging release validation.
