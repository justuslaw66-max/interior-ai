# Upgrade Hardening - 2026-07-11

## Scope completed

- Blocking CI gates for typecheck, strict assets, catalog quality, catalog availability, build, and runtime smoke.
- GitHub secret scanning with narrow placeholder allowlisting.
- Pinned Node runtime consumption in CI through `.nvmrc`.
- Git LFS policy for newly staged GLB files without history rewriting.
- Focused Playwright regression for the React render-readiness update loop.
- Shallow and database-backed `/api/health` checks.
- Conditional Sentry server/client initialization and request-error hooks.
- Updated pull request validation checklist and asset-storage guidance.
- Explicit documentation of the 23 missing models that remain safely draft-only.

## Validation

- `npm run typecheck`: pass
- `npm run assets:inventory:strict`: pass, 1,541 files and zero empty files
- `npm run test:catalog-audit`: pass
- `npm run test:catalog-asset-availability`: pass with 23 draft-only warnings
- `npm run test:e2e:smoke`: pass, 2 tests
- `npm run build`: pass
- `npm run dev:doctor`: pass, including `/api/health`
- `/api/health?deep=1`: database check pass
- CI workflow YAML parse: pass
- Git LFS attribute check for `.glb`: pass

## Checkpoint strategy

The repository already contains extensive modified and untracked product work.
No commit was created because modified shared files such as `package.json` and
`package-lock.json` also contain pre-existing changes. Commit this upgrade set
only after reviewing and grouping the broader worktree so unrelated changes are
not bundled accidentally.

## External follow-ups

- Connect a real backup volume and run `npm run backup:workspace -- <destination>`.
- Review GitHub LFS quota before pushing the currently untracked GLB collection.
- Publish the 23 draft catalog entries only after their referenced GLBs exist.
- Consider a dedicated follow-up to decompose `app/design/page.tsx` and the cabinetry studio; that refactor was excluded from this operational hardening pass.
