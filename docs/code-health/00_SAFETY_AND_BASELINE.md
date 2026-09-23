# Safety and baseline

Audit date: 2026-07-31 (Asia/Singapore)
Repository: `/Users/justus/Developer/interior-ai`
Scope: audit and planning only; no production source, schema, catalog, or runtime behavior was changed.

## Running application and target verification

Before any repository write, the listener on port 3000 was identified with `lsof`. It is Node process 9145 and its current working directory is `/Users/justus/Developer/interior-ai`. The intended edit target and the running application therefore match. The configured database was classified as non-production-like before test execution. No push, deployment, remote mutation, destructive database command, or production-data operation was performed.

## Incoming worktree preservation

The incoming branch was `release/cabinetry-alpha-rc46`. It contained a broad, intentional-looking working set:

- 213 modified tracked files and no tracked deletions;
- 80 untracked status entries representing 158 untracked files;
- 371 changed files in the reviewed snapshot;
- 52,042 insertions and 28,402 deletions after the reviewed untracked files were staged;
- source, tests, documentation, migrations, catalog YAML, application assets, screenshots/evidence, configuration icons, and `package-lock.json`.

The staged set was reviewed by status, diff statistics, changed hunks/symbols, file types, and size. Untracked GLBs were valid glTF binaries (largest approximately 1.45 MB); screenshots were evidence assets (largest approximately 1.17 MB). No build directory, dependency cache, Playwright output, coverage directory, local database, local environment file, or obvious secret was staged. Actual `.env*` local files, `.vercel`, `.next`, `node_modules`, coverage, `test-results`, and Playwright reports remained ignored. `git diff --check` passed before the snapshot.

The complete reviewed state was preserved locally:

- safety branch: `safety/code-health-pre-audit-20260731`;
- safety checkpoint: `08bdfe0c5e5c882777dc5da38168ea7db14840ad`;
- commit message: `chore: checkpoint current project state before code health audit`;
- audit branch: `chore/code-health-audit-20260731`, created from that exact checkpoint.

Rollback/recovery is straightforward: switch to `safety/code-health-pre-audit-20260731` or inspect commit `08bdfe0c5e5c882777dc5da38168ea7db14840ad`. No previous user work was discarded or rewritten.

## Toolchain and discovered gates

- Node: 24.13.x (`.nvmrc` and engine range `>=24.13 <25`)
- Package manager: npm 11.6.2, lockfile v3
- Framework: Next.js 16.2.10, React 19, TypeScript strict mode
- Lint: ESLint; repository CI promotes warnings to failures with `--max-warnings=0`
- Tests: repository-specific TypeScript scripts plus Playwright; there is no general unit-test runner
- Formatting: no formatter configuration or package command; `git diff --check` is the only whitespace gate
- Database: Prisma schema plus 42 ordered migration directories

The required `stable-checks` workflow currently runs secret scan, dependency install, a fresh-database Gate A3 deploy, lint, design cleanup, typecheck, floor-plan checks, two focused visual/runtime checks, asset/catalog checks, build, runtime smoke, and Pro visual policy. Full E2E runs only in a manual/staging job and is `continue-on-error`.

## Baseline results

These are characterization results, not fixes. A failure can be an implementation defect, a stale assertion, a non-production-equivalent gate, or an environmental limitation; the audit records which.

| Check | Result | Evidence |
| --- | --- | --- |
| `git diff --check` | PASS | 0.01 s before checkpoint |
| `npm run lint -- --max-warnings=0` | FAIL | `CatalogPanel.tsx:358` `react-hooks/set-state-in-effect`; one warning in `FloorPlanImportAssistant.tsx:294`; 32.19 s |
| `npm run typecheck` | PASS | 2.82 s |
| `npx prisma validate` | PASS | 0.76 s |
| `npm run test:design-page-cleanup` | FAIL | stale command-bar save-chip assertion in `scripts/test-command-bar-save-status.ts:34`; runner stops on first failure |
| `node scripts/check-design-page-architecture.mjs` | FAIL | `DesignPageWorkspace.tsx` 594 > 550 lines; viewport registration 361 > 300 lines |
| `npm run verify:design-persistence` | PASS | 3.03 s |
| `npm run test:phase7-security-boundaries` | PASS | 0.43 s |
| `npm run verify:cabinetry` | PASS | functional, accessibility, architecture, and performance groups passed; one Node-only GLB assertion self-skipped because `FileReader` was unavailable |
| `npm run test:editor-capabilities-accessibility` | PASS | 0.41 s |
| `npm run test:floor-plan-required` | PASS | all required groups passed; architecture emitted 30 existing oversized-file warnings |
| `npm run test:floor-plan-live-progress` | PASS | Important: this check is not included by `test:floor-plan-required` or CI |
| generated surface `--check` | PASS | generated runtime is current |
| `scripts/test-surface-material-schema.ts` | PASS | 980 files; 25 Goodrich draft fixtures |
| `npm run assets:inventory:strict` | PASS | 1,613 files; 283,251,305 bytes; wrote ignored `.local/asset-inventory.json` |
| `npm run test:catalog-audit` | FAIL | five invalid values in three Hamilton sofa YAML files |
| `npm run test:catalog-asset-availability` | PASS with draft warnings | five missing local draft GLBs; 144 files and 812 references scanned |
| `npm run test:designer-theme-contrast` | PASS | focused contrast contract passed |
| `npm run test:phase8-performance` | FAIL | large-project `fingerprintCold` p95 11.218 ms exceeds 6 ms; later bundle/boundary steps were masked |
| `npm run build` | PASS with warnings | optimized build succeeds; catalog runs lenient; Turbopack warns whole-project tracing from floor-plan raster imports |
| `npm run test:e2e:smoke` equivalent | PASS | two Chromium runtime-smoke cases passed in 2.2 min against the canonical local app |
| `npm run test:pro-visual-policy` equivalent | FAIL | 2 passed, 2 failed; Cabinet Preview opener remains hidden in Chromium and WebKit |
| complete `npx playwright test` | FAIL | 183 passed, 29 failed, 13 did not run in 1.5 h; artifacts in `/private/tmp/code-health-e2e-full` |

The first Pro visual attempt was blocked by sandbox localhost binding (`EPERM`); it was rerun with approved local-app access. That rerun is the result above. Playwright evidence was directed to `/private/tmp/code-health-*`, not repository source.

The full-suite failures cluster rather than indicating 29 independent defects:

- 20 cabinetry cases plus the Pro visual case fail because `open-custom-millwork-studio` exists but remains hidden;
- two catalog drawer cases cannot find the expected Arcadia/Seb product name, although their later live-API data tests pass;
- phone/tablet New Plan controls are 30 px instead of the asserted 36 px minimum, and Undo is 30 px instead of the asserted 44 px touch target;
- the multi-room consumer-workflow serial case times out and causes 13 later cases in that group not to run;
- rapid wall orbit cannot reacquire a selected wall panel;
- the final Angel Pink case cannot connect because port 3000 stops accepting connections near the end of the run, so that result is infrastructure-contaminated rather than a color assertion.

After the run, `lsof` confirmed no listener on port 3000. The test process therefore disturbed the previously running local app. The prior state was restored with `npm run dev`: Node PID 24923 listens on port 3000, `lsof` confirms cwd `/Users/justus/Developer/interior-ai`, and `/api/health?deep=1` returns HTTP 200.

## Baseline interpretation

The repository is buildable and substantial domain suites are healthy, especially floor-plan and cabinetry checks. It is not a green release baseline: lint, design cleanup, design architecture, catalog quality, Phase 8 performance, and Pro visual policy are red. CI also exercises a lenient build and a development server rather than the built production artifact, so a green workflow would not by itself prove production equivalence. See `02_CODE_HEALTH_AUDIT.md` and `05_QUALITY_GATES_PLAN.md` for stable finding IDs and remediation sequencing.
