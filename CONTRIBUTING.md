# Contributing

## Branch Strategy

- `main`: stable base branch for pull requests.
- `staging`: integration branch for ongoing work.
- `feat/*`, `fix/*`, `chore/*`: short-lived feature branches.

Always open PRs from a feature branch into `main` unless a release flow explicitly requires otherwise.

## First-Time Setup

```bash
git checkout main
git pull origin main
git checkout -b feat/<short-name>
```

If your local repo does not have `main` yet:

```bash
git fetch origin
git checkout -b main origin/main
```

## Daily Workflow

1. Sync base branch:

```bash
git checkout main
git pull origin main
```

2. Create feature branch:

```bash
git checkout -b feat/<short-name>
```

3. Commit changes with focused scope:

```bash
git add <files>
git commit -m "feat(scope): concise summary"
```

4. Push branch:

```bash
git push -u origin feat/<short-name>
```

5. Open PR:

- Base: `main`
- Compare: `feat/<short-name>`

## Pre-PR Checks

```bash
npm run typecheck
npm run test:e2e
```

If the full e2e suite has known unrelated failures, run targeted tests for your touched area and document that in the PR body.

For Cabinetry Studio changes, run the target-scoped deterministic gate and lint
every touched source file with zero warnings:

```bash
npm run verify:cabinetry
npx eslint <touched-source-files> --max-warnings 0
```

Run `npm run build` for runtime, route, dependency-boundary, or bundling changes.
Document any known unrelated failure separately; do not suppress or reclassify it
as a passing result.

For Cabinetry dependency or bundle changes, also run:

```bash
npm ls --depth=0
npm audit --omit=dev
npm run test:phase8-performance
```

Treat `npm audit` as evidence, not permission to run `npm audit fix`. Review
the dependency chain, separate safe removals from upgrades, and document every
remaining advisory. The Cabinetry architecture decision, saved-data contract,
rendering policy, performance budgets, security boundary, and final verification
report are indexed from `docs/architecture/cabinetry-studio-decomposition.md`.

For editor document-state, scene-command, or undo/redo changes, also run:

```bash
npm run test:editor-command-history
npm run test:design-page-history-controller
```

Scene UI components must call a document/controller action instead of mutating
scene objects. New undoable actions should use the atomic command boundary
documented in `docs/architecture/editor-state-command-ownership.md`.

## PR Rules

- Keep PRs focused and reviewable.
- Include validation commands and outcomes.
- Mention residual risks and known failures clearly.
- Do not mix unrelated refactors with feature changes.

## Troubleshooting

### "There isn’t anything to compare"

This usually means base and compare branch are identical or base branch does not exist on remote.

Check:

```bash
git branch -a
git ls-remote --heads origin
```

### "Invalid username or token" on push

Use SSH (`git@github.com:owner/repo.git`) or HTTPS with a PAT (not account password).
