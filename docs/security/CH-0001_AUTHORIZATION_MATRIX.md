# CH-0001 authorization matrix

Status: repository remediation implemented; external deployment controls remain subject to the companion checklist.

## Dependency compatibility revalidation (2026-08-05)

The bounded security update from `next-auth@5.0.0-beta.30` to beta.32, `@auth/prisma-adapter@2.11.1` to 2.11.3, and split `@auth/core` 0.41.0/0.41.1 to one 0.41.3 preserves this matrix. Missing/malformed credentials and production synthetic-fixture attempts still fail closed; real database-session browser coverage still distinguishes signed-out, forged, expired, ordinary, Pro non-admin, malformed, and allowlisted administrator callers; and direct authorization remains before side effects. The strengthened Auth.js preflight additionally validates structured anonymous session JSON, provider/callback routes, CSRF, Google authorization/PKCE, sign-out, and same-origin redirects. No role, entitlement, session schema, OAuth setting, or middleware authority changed. See `docs/security/P1_DEPENDENCY_AUTH_NEXT_COMPATIBILITY.md` for the complete compatibility and advisory record.

## Verified root cause and policy

Before CH-0001, `lib/config.ts` mapped an absent or unrecognized `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, or `VERCEL_ENV` to `development`. `lib/admin.ts` then treated every nonempty authenticated email as an administrator when `ADMIN_EMAILS` was empty. `canAccessAdmin` separately allowed an unauthenticated development caller unless `ADMIN_REQUIRE_AUTH` was exactly `true`. Two catalog-audit handlers also accepted a query/header development bypass. The behavior was reproduced with `NODE_ENV=production`: both a missing classifier and `APP_ENV=not-a-real-environment` authorized `ordinary@example.com` while `ADMIN_EMAILS` was absent. Independent review also reproduced two surrounding enforcement gaps: GitHub Actions flags activated fixed/missing/short Auth.js credential fallbacks even under `APP_ENV=production`, and malformed reviewer/publisher lists retained their valid-looking subset.

The repository-controlled invariant is now:

1. Auth.js must resolve explicitly configured, valid server credentials and a valid database-backed session with a server-supplied email; CI flags do not synthesize or weaken credentials.
2. `APP_ENV` must explicitly be `development`, `staging`, or `production`; if `APP_ENV` is absent, the recognized Vercel values below may classify the deployment.
3. `ADMIN_EMAILS` must be present, nonempty, syntactically valid as a complete comma-separated list, and contain the session email.
4. Reviewer/publisher operations must additionally pass their existing narrower server-side allowlist, and each of those lists must be present and syntactically valid in full.
5. The route/page guard runs before protected data access, request-body consumption where implemented, and every mutation.

No client role, query parameter, request body, cookie, local storage value, public environment variable, `NODE_ENV`, or test flag grants administrative authority. `lib/admin.ts` is consumed only by server route handlers and server pages; `test:auth-env-hardening` discovers these consumers and fails if a client module imports the policy.

## Deployment policy

| Input | Resolved class | Admin operation policy |
| --- | --- | --- |
| `APP_ENV=development` | development | Allowed only to a valid Auth.js identity in a valid `ADMIN_EMAILS` allowlist; there is no local bypass. |
| `APP_ENV=staging` | staging | Allowed only to a valid Auth.js identity in a valid `ADMIN_EMAILS` allowlist; startup also requires the existing staging configuration. |
| `APP_ENV=production` | production | Allowed only to a valid Auth.js identity in a valid `ADMIN_EMAILS` allowlist; startup also requires the existing production configuration. |
| no `APP_ENV`, `VERCEL_ENV=development` | development | Same allowlist policy; intended for Vercel local tooling only. |
| no `APP_ENV`, `VERCEL_ENV=preview` | staging | Same allowlist policy; preview is not implicitly trusted. |
| no `APP_ENV`, `VERCEL_ENV=production` | production | Same allowlist policy. |
| missing both classifiers | invalid | Denied; root environment validation throws before rendering. |
| blank/unknown classifier | invalid | Denied; an invalid explicit `APP_ENV` does not fall back to Vercel. |
| `APP_ENV=preview` or `APP_ENV=test` | invalid | Denied; these are not repository-defined application environment names. CI explicitly uses `APP_ENV=development`. |
| only `NEXT_PUBLIC_APP_ENV` | invalid | Denied; public variables have no administrative authority. |

`APP_ENV` has deliberate precedence over `VERCEL_ENV`. This preserves the documented immutable staging flow, which uploads with Vercel's production deployment mode while explicitly setting `APP_ENV=staging`. A malformed admin, reviewer, or publisher allowlist denies the complete corresponding authority rather than accepting the valid-looking subset. Missing/empty/short Auth.js credentials fail in GitHub Actions just as they do elsewhere; CI supplies explicit non-secret placeholders that satisfy the existing shape checks.

## Enforcement codes

- **A** — Auth.js session email + canonical `isAdminEmail`/`canAccessAdmin` + recognized deployment + valid `ADMIN_EMAILS` membership.
- **R** — A plus `requireFloorPlanReviewer` and `FLOOR_PLAN_REVIEWER_EMAILS`.
- **P** — A plus `requireFloorPlanPublisher` and `FLOOR_PLAN_PUBLISHER_EMAILS`.
- Route denials use the established safe 403 response, except deliberately concealed tools/events that use 404. Server-page denials redirect before data loading.
- The intended enforcement location is the same direct handler/page boundary shown below; middleware and hidden UI are not security boundaries.

## Privileged route handlers

Every handler below is directly discovered by `scripts/test-admin-authorization.ts`. The test proves authentication precedes canonical authorization and that authorization precedes the first protected parse, read, or mutation marker.

| Route/function | Operation | State | Policy | Enforcement and coverage | Status |
| --- | --- | --- | --- | --- | --- |
| `GET /api/admin/audit` | Catalog governance, quality, and variant audit data/download | Read | A | Direct route guard; Playwright signed-out/forged/expired/free/Pro/admin matrix; former query/header bypass removed | Hardened |
| `PATCH /api/admin/catalog/[catalogItemId]` | Update catalog authoring and linked catalog state | Mutate | A | Direct guard before body/database/filesystem work; discovery/order test | Hardened through canonical policy |
| `GET /api/admin/catalog/media-health` | Catalog variant/media health | Read | A | Direct guard; former query/header bypass removed; discovery/order test | Hardened |
| `GET /api/admin/clicks.csv` | Export product-click records | Read/export | A | Direct guard before Prisma query; discovery/order test | Hardened through canonical policy |
| `POST /api/admin/floor-plan-imports/[id]/approve` | Create immutable approved floor-plan revision | Mutate | R | A then reviewer role before body/Prisma transaction; discovery/order and existing publication tests | Hardened; narrower role unchanged |
| `GET /api/admin/floor-plan-imports/[id]/assets/[assetId]` | Read private source/derivative bytes | Read | A | Direct guard before job/source lookup; discovery/order and asset-route test | Hardened through canonical policy |
| `DELETE /api/admin/floor-plan-imports/[id]/construction-sources/[sourceId]` | Remove construction evidence from review candidate | Mutate | A | Direct guard before lookup/transaction; discovery/order and construction-source tests | Hardened through canonical policy |
| `POST /api/admin/floor-plan-imports/[id]/construction-sources` | Upload and attach construction evidence | Mutate | A | Direct guard before request-body read, storage, and transaction; discovery/order and construction-source tests | Hardened through canonical policy |
| `POST /api/admin/floor-plan-imports/[id]/publish` | Publish an approved floor-plan revision | Mutate/publication | P | A then publisher role before lookup/transaction; discovery/order and publication-security tests | Hardened; narrower role unchanged |
| `POST /api/admin/floor-plan-imports/[id]/retire` | Retire a published floor-plan revision | Mutate/publication | A | Direct guard before lookup/transaction; discovery/order and retirement tests | Hardened for CH-0001; CH-0005 role policy remains separate |
| `GET /api/admin/floor-plan-imports/[id]/review-seed` | Read review-seed details | Read | A | Direct guard before repository lookup; discovery/order and review-seed tests | Hardened through canonical policy |
| `POST /api/admin/floor-plan-imports/[id]/review-seed` | Apply/reprocess review seed | Mutate | A | Direct guard before body/repository/storage work; discovery/order and review-seed tests | Hardened through canonical policy |
| `GET /api/admin/floor-plan-imports/[id]` | Read complete admin import/review record | Read | A | Direct guard before Prisma lookup; discovery/order test | Hardened through canonical policy |
| `PATCH /api/admin/floor-plan-imports/[id]` | Correct candidate/review metadata | Mutate | A | Direct guard before body/Prisma work; discovery/order and floor-plan review tests | Hardened through canonical policy |
| `PUT /api/admin/floor-plan-imports/[id]/source-observations` | Replace source-observation manifest | Mutate | R | A then reviewer role before body/transaction; discovery/order and governance tests | Hardened; narrower role unchanged |
| `POST /api/admin/floor-plan-imports/[id]/supplementary-sources/[sourceId]` | Attach supplementary source to candidate | Mutate | A | Direct guard before lookup/transaction; discovery/order and supplementary-source tests | Hardened through canonical policy |
| `DELETE /api/admin/floor-plan-imports/[id]/supplementary-sources/[sourceId]` | Remove supplementary source | Mutate | A | Direct guard before lookup/transaction; discovery/order and supplementary-source tests | Hardened through canonical policy |
| `POST /api/admin/floor-plan-imports/[id]/supplementary-sources` | Upload supplementary source | Mutate | A | Direct guard before request-body read, storage, and transaction; discovery/order and supplementary-source tests | Hardened through canonical policy |
| `POST /api/admin/floor-plan-imports/review-seeds` | Create/process a durable review-seed job | Mutate | A + resolved user ID | Direct guard before body/download/storage/database work; discovery/order and review-seed tests | Hardened through canonical policy |
| `GET /api/admin/floor-plan-imports` | List/filter administrative floor-plan queue | Read | A | Direct guard before query construction/Prisma read; discovery/order and admin-queue tests | Hardened through canonical policy |
| `POST /api/admin/floor-plan-variant-groups/[id]` | Publish/update variant-group lifecycle state | Mutate/publication | P | A then publisher role before body/transaction; discovery/order and authored-variant tests | Hardened; narrower role unchanged |
| `DELETE /api/admin/floor-plan-variant-groups/[id]` | Retire/delete variant group | Mutate/publication | P | A then publisher role before transaction; discovery/order and authored-variant tests | Hardened; narrower role unchanged |
| `POST /api/admin/floor-plan-variant-groups` | Create approved variant group | Mutate | R | A then reviewer role before body/transaction; discovery/order and authored-variant tests | Hardened; narrower role unchanged |
| `POST /api/admin/imports/[id]/link-catalog` | Link normalized import to catalog entry | Mutate | A | Direct guard before catalog/Prisma access; discovery/order and import workflow tests | Hardened through canonical policy |
| `GET /api/admin/imports/[id]` | Read model import job | Read | A | Direct guard before Prisma query; discovery/order test | Hardened through canonical policy |
| `PATCH /api/admin/imports/[id]` | Transition/update model import job | Mutate | A | Direct guard before body/Prisma mutation; discovery/order test | Hardened through canonical policy |
| `PATCH /api/admin/imports/bulk` | Bulk transition model import jobs | Mutate | A | Direct guard before body/Prisma mutation; discovery/order test | Hardened through canonical policy |
| `GET /api/admin/imports` | List model import jobs | Read | A | Direct guard before workflow query; discovery/order test | Hardened through canonical policy |
| `POST /api/admin/imports` | Create model import job | Mutate | A | Direct guard before body/storage/Prisma work; discovery/order test | Hardened through canonical policy |
| `GET /api/admin/models/[id]` | Read normalized model asset | Read | A | Direct guard before Prisma query; discovery/order test | Hardened through canonical policy |
| `PATCH /api/admin/models/[id]` | Update normalized model asset | Mutate | A | Direct guard before body/Prisma mutation; discovery/order test | Hardened through canonical policy |
| `GET /api/admin/models` | List normalized model assets | Read | A | Direct guard before Prisma query; discovery/order test | Hardened through canonical policy |
| `POST /api/tools/glb-optimizer` | Run cost-bearing model normalization/optimization and return bytes | Compute/write temp | A | Direct guard (concealed 404) before body read/temp files/process work; discovery/order test | Hardened through canonical policy |
| `POST /api/track/event` | Create an admin-only synthetic conversion event | Mutate | A | Direct guard (concealed 404) before body/Prisma work; discovery/order and Phase 7 security test | Hardened through canonical policy |
| `GET /api/me` admin branch | Project allowlisted administrator to Pro capability | Read/entitlement | A | Auth and canonical admin check before user-plan lookup; static order and policy matrix | Hardened; ordinary paid Pro remains non-admin |

## Server-rendered admin pages

| Page | Privileged data | State | Policy | Enforcement and coverage | Status |
| --- | --- | --- | --- | --- | --- |
| `/admin` | Operations metrics, recent designs/orders/events/queues | Read | A | Server page guard before `getOperationsDashboardData`; discovered by authorization test | Hardened |
| `/admin/audit` | Catalog audit and governance summaries | Read | A | Server page guard before audit work; discovered | Hardened |
| `/admin/catalog/[catalogItemId]` | Catalog authoring record | Read | A | Server page guard before Prisma/catalog reads; discovered | Hardened |
| `/admin/catalog/inbox` | Import inbox/workflow | Read | A | Server page guard before workflow read; discovered | Hardened |
| `/admin/catalog/review` | Import review/diff workflow | Read | A | Server page guard before workflow/catalog reads; discovered | Hardened |
| `/admin/clicks` | Affiliate click analytics | Read | A | Server page guard before Prisma reads; discovered | Hardened |
| `/admin/floor-plans` | Administrative floor-plan queue | Read | A | Server page guard before queue read; discovered | Hardened |
| `/admin/floor-plans/[id]` | Private floor-plan review workspace | Read | A | Server page guard before job/source reads; discovered | Hardened |
| `/admin/imports` | Model import workflow | Read | A | Server page guard before workflow read; discovered | Hardened |
| `/admin/imports/[id]` | Model import detail | Read | A | Server page guard before Prisma/workflow reads; discovered | Hardened |
| `/admin/models` | Model asset list | Read | A | Server page guard before Prisma read; discovered | Hardened |
| `/admin/models/[id]` | Model asset detail | Read | A | Server page guard before Prisma read; discovered | Hardened |
| `/admin/imports/batches` | Redirect to `/admin/imports` | None | Destination A | No privileged data is read; discovery permits only this fixed admin redirect | No independent boundary |
| `/admin/imports/batches/[id]` | Redirect to `/admin/imports/[id]` | None | Destination A | No privileged data is read; discovery permits only this fixed admin redirect | No independent boundary |

`app/tools/glb-optimizer/page.tsx` is a usability surface only. It is not the security boundary; the backing POST route remains directly protected. Client navigation and `/api/me` capability projection do not replace route/page enforcement.

## Non-HTTP privileged and deployment surfaces inspected

| Surface | Authority model | CH-0001 disposition |
| --- | --- | --- |
| `lib/admin.ts:isAdminEmail`, `canAccessAdmin`, `requireAdmin` | Server Auth.js email, strict deployment classifier, server `ADMIN_EMAILS` | Canonical fail-closed policy used by every application entry point above. |
| `lib/config.ts:getApplicationEnvironment`, `validateDeploymentEnvironmentOrThrow`, `validateEnvOrThrow` | Server environment only | Missing/unknown/blank deployment state is invalid; root startup validation fails. |
| `lib/auth-env.ts:getAuthEnvOrThrow` | Explicit server Auth.js and Google OAuth credentials | Missing, empty, malformed, or short credentials throw in every environment; `CI`/`GITHUB_ACTIONS` do not enable a fallback. |
| `instrumentation.ts:register` | Next.js server initialization | Calls the strict deployment validator during server preparation, so missing/unknown classifiers make all requests fail safely. |
| `lib/floor-plan-imports/publication-governance.ts` | Separate reviewer/publisher server allowlists | Preserved as operation-specific policy after general admin authorization; malformed complete lists now deny. CH-0005 is not changed. |
| `release:vercel:pull/build/verify/stage/certify/promote` and `scripts/vercel-prebuilt-release.mjs` | Local/Vercel CLI credentials and signed release evidence | No application admin bypass and no HTTP deployment endpoint. External credential/project permissions require human verification. |
| `.github/workflows/ci.yml` | GitHub workflow permissions | No deploy step. Both jobs now classify themselves explicitly as development; the fail-closed matrix is required in `stable-checks`. |
| Scheduled/background and direct privileged CLIs | Operator shell plus database/filesystem/object-store credentials | Listed separately below. Operational TypeScript entry points validate deployment state before privileged work; database backup/restore and legacy test utilities now enforce their applicable environment/target policy. Runtime credentials and concrete target selection remain external controls. |
| Admin server actions | None found | All inspected mutations are route handlers listed above. |

## Privileged CLI and background matrix

These commands do not impersonate an HTTP administrator. Their trusted identity is the operator or scheduler plus the supplied database, filesystem, object-store, or Vercel credential. The applicable CH-0001 policy is therefore explicit deployment classification before work and least-privilege external credentials, not an Auth.js session.

| Route/action/function | Operation | State | Authentication/permission | Deployment condition | Enforcement location | Test coverage | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `npm run worker:floor-plans` / `run-floor-plan-import-worker.ts:main` | Lease and process queued user floor-plan imports | Read/mutate DB and private derivatives | Scheduler/operator shell plus `DATABASE_URL` and configured processing/storage providers | Recognized `APP_ENV` or Vercel environment | First statement in `main`, before queue polling | CH-0001 static entry-point assertion plus worker recovery/processing/telemetry suites | Hardened |
| `npm run worker:floor-plan-deletions` / `run-floor-plan-deletion-worker.ts:main` | Lease deletion outbox rows and permanently delete private external objects | Destructive object-store mutation plus DB tombstone/state | Scheduler/operator shell plus DB and private object-store credentials | Recognized deployment; external storage configuration must also resolve | First statement in `main`, before storage creation or queue polling | CH-0001 static assertion plus retention-outbox/object-storage suites | Hardened |
| `npm run cleanup:floor-plan-private-sources` / `run-floor-plan-retention-cleanup.ts:main` | Clear expired private source bytes/metadata, enqueue deletion, and by default drain an external deletion batch | Destructive DB/object-store mutation; `--dry-run` is read-only and `--enqueue-only` avoids direct object deletion | Scheduler/operator shell plus DB and, unless dry/enqueue-only, object-store credentials | Recognized deployment | First statement in `main`, before cleanup; existing storage check fails when external deletion is queued without a provider | CH-0001 static assertion plus private-source-retention/outbox tests | Hardened deployment check; schedule/credentials external |
| `npm run audit:floor-plan-serving-integrity` / `audit-floor-plan-serving-integrity.ts:main` | Read published revisions and private evidence metadata for serving-integrity diagnostics | Privileged read | Operator shell plus DB credential | Recognized deployment | First statement in `main`, before Prisma query | CH-0001 static assertion plus serving-integrity tests | Hardened |
| `scripts/import-model.ts:main` (direct utility) | Create/update import jobs, process supplied model, write reports/public assets | DB and filesystem mutation | Operator shell plus DB/filesystem authority | Recognized deployment; staging/production QA strictness uses the canonical classifier | First statement in `main`, before input/file/DB work | CH-0001 static assertion plus asset/import QA domain tests | Hardened |
| `scripts/restore-model-assets.ts:main` (direct utility) | Read model rows and restore missing public GLBs from an operator path | Privileged DB read and filesystem mutation | Operator shell plus DB/filesystem authority | Recognized deployment | First statement in `main`, before source/DB/filesystem work | CH-0001 static assertion; asset availability/inventory gates cover resulting repository state | Hardened |
| `scripts/sync-catalog-model-assets.ts:run` and `scripts/sync-orphan-model-assets.ts:run` (direct utilities) | Upsert model-asset rows from source-controlled catalog YAML | DB mutation/publication metadata | Operator shell plus DB credential and reviewed catalog tree | Recognized deployment | First statement in each entry point, before catalog read or DB upsert | CH-0001 static assertions plus catalog governance/asset gates | Hardened |
| `scripts/backup-db.sh` | Export the complete configured database to a local SQL file | Sensitive read/filesystem write | Operator shell plus DB read credential and destination filesystem | Explicit `APP_ENV=development`, `staging`, or `production` | Shell guard before tool, path, or database work | CH-0001 static-order assertion and `bash -n` | Hardened deployment check; backup custody external |
| `scripts/restore-db.sh` | Apply arbitrary supplied SQL to the configured database | Destructive DB mutation | Operator shell plus DB write/DDL credential and reviewed backup file | Explicit recognized `APP_ENV` plus exact `--confirm-environment=<APP_ENV>` after verifying `DATABASE_URL` | Shell guards before backup inspection and `psql` | CH-0001 static-order assertion and `bash -n` | Hardened; target identity/approval remains external |
| `release:vercel:pull/build/verify/stage/certify/promote` | Pull/build an immutable artifact, stage it, bind clean Gate A3 evidence, and promote the exact artifact | External deployment mutation for stage/promote | Named operator/CI plus Vercel project/token and protected promotion authority | Manifest/staged/certified artifact identity and documented staging/production platform configuration | `vercel-output-manifest.mjs` and `vercel-prebuilt-release.mjs`; no application HTTP endpoint | Release-script identity checks and human/platform checklist | Existing fail-closed artifact workflow; external authority unverified |
| `seed-test-data.ts`, `seed-test-data.js`, and `test-pro-billing-local.mjs` | Create/remove catalog or billing test fixtures | Test DB mutation; billing test also creates test-mode Stripe resources | Explicit local/test invocation, local DB credential, and Stripe test credentials where applicable | Exact `APP_ENV=development`; seed scripts also require a loopback DB, while billing already required loopback DB and Stripe test keys | Entry-point assertions before Prisma/Stripe mutation; absent from deploy workflows and application imports | Behavioral production and malformed-URL denial with secret non-disclosure assertions, plus existing billing cleanup/shape checks | Hardened against production/non-local use |

## Test coverage summary

`npm run test:auth-env-hardening` covers valid/missing/blank/unknown environment values; Vercel preview mapping; public-variable forgery; absent/empty/malformed admin, reviewer, and publisher allowlists; explicit CI credential requirements including production; signed-out/malformed identities; ordinary and paid-Pro users; valid administrators in each recognized environment; legacy/production bypass attempts; authentication failure before side effects; all 25 `/api/admin` route files and 14 admin pages; direct-handler enforcement order; the extra optimizer/event routes; `/api/me`; client-import exclusion; strict deployment entry checks in all eight operational TypeScript CLIs; environment/target guards for backup and restore; and behavioral production/malformed-URL denial for both seed utilities and local billing, including proof that a sentinel database secret is absent from error output.

`tests/e2e/13-admin-variant-audit.spec.ts` uses real Auth.js database sessions against a local/CI database. It directly calls the admin audit route and proves signed-out, forged query/header/cookie, expired-session, free-user, and paid-Pro callers receive no audit data while the configured administrator succeeds. Remote fixtures must be distinct and first prove their expired/free/Pro projection through `/api/me`; the administrator proves validity through the positive direct-route result. Tracing is disabled for this API-only spec so retained failure evidence cannot serialize live session headers. The prior assertion-skipping development bypass was removed.
