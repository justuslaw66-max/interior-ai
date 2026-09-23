# P1 Next.js/Auth.js dependency security compatibility record

Status: repository-controlled remediation complete on branch `security/dependency-auth-next-compatibility`; final exact-commit detached validation and external verification are recorded separately.

Starting source: `55bc4b65c121c1a6646fd2d8b38bb93f9061c372`

Scope: the direct-production Next.js/Auth.js advisories reported against the frozen Deep Clean v1 candidate. This batch did not implement CH-0004, another P1, a framework/auth migration, Full E2E, a deployment, or an external-platform change.

## Safety baseline

Before editing, `git status --short`, both diffs, `git diff --check`, and the untracked-file inventory were empty; the branch was at the exact required SHA. A clean `npm ci` proved `package.json`/`package-lock.json` consistency. Node was `v24.13.0` and npm was `11.6.2`. No Next/Node application listener was active, so there was no running-worktree mismatch. The CH-0030 profiler commit `d7a50698707153b43df0a982766288060c24b997` was not an ancestor of the application source. The two baseline extraneous artifacts were recorded before the update and preserved.

## Selected compatibility set

| Package | Before | After | Reason and compatibility |
| --- | --- | --- | --- |
| `next` | `16.2.10` | `16.2.11` | Minimum fixed Active LTS patch. It retains the existing Node `>=20.9`, React 18/19, App Router, route-handler, proxy, and Turbopack contracts. |
| `eslint-config-next` | `16.2.10` | `16.2.11` | Kept on the exact Next patch so framework lint rules are not split across releases. |
| `next-auth` | `5.0.0-beta.30` | `5.0.0-beta.32` | Minimum fixed v5 beta. The application already uses v5 APIs; this deliberately remains on the same beta channel and does not migrate to v4. |
| `@auth/prisma-adapter` | `2.11.1` | `2.11.3` | Republished adapter with an exact dependency on fixed `@auth/core@0.41.3`; its Prisma peer range includes the installed Prisma 7 client. No adapter API or schema migration is required. |
| `@auth/core` (transitive) | `0.41.0` and `0.41.1` | one deduplicated `0.41.3` | Fixes the Auth.js advisories and removes the split core implementation. |
| `postcss` | `8.5.20` | `8.5.23` | Minimum fixed release above the affected `<=8.5.22` range. The exact override also replaces Next 16.2.11's vulnerable `8.4.31` declaration without changing the CSS toolchain. |

React, Prisma, the package manager, the database provider/schema, OAuth settings, and all unrelated direct dependencies are unchanged. Official decision sources were the [Next.js July 2026 security release](https://nextjs.org/blog/july-2026-security-release), [Auth.js July 2026 security update](https://better-auth.com/blog/security-update-july-2026), [`next-auth@5.0.0-beta.32`](https://github.com/nextauthjs/next-auth/releases/tag/next-auth%405.0.0-beta.32), [`@auth/core@0.41.3`](https://github.com/nextauthjs/next-auth/releases/tag/%40auth%2Fcore%400.41.3), and [`@auth/prisma-adapter@2.11.3`](https://github.com/nextauthjs/next-auth/releases/tag/%40auth%2Fprisma-adapter%402.11.3).

## Advisory inventory and exact classification

`Current classification` is exactly one of the required classifications. `INVALIDATED_BY_FRESH_AUDIT` means the pre-change path was present and was removed by the fresh post-change audit; it does not mean the original report was false. Direct advisories were not dismissed merely because a feature-specific exploit was not reproduced.

| Advisory | Severity | Affected installed path before change | Fixed version/range and update kind | Reachability / affected feature | Current classification |
| --- | --- | --- | --- | --- | --- |
| `GHSA-8fpg-xm3f-6cx3` | Critical | direct `next-auth@5.0.0-beta.30` | `next-auth@5.0.0-beta.32`, same beta channel | Session resolution and fail-open configuration-error behavior; `auth()` is used by pages and API routes. | `INVALIDATED_BY_FRESH_AUDIT` |
| `GHSA-7rqj-j65f-68wh` | Critical | direct `next-auth@5.0.0-beta.30` -> `@auth/core@0.41.0`; adapter -> core `0.41.1` | beta.32 / core `0.41.3`, same channel/patch | Email normalization in the enabled Google OAuth identity flow. | `INVALIDATED_BY_FRESH_AUDIT` |
| `GHSA-xmf8-cvqr-rfgj` | High | same direct/transitive Auth.js paths | beta.32 / core `0.41.3`, same channel/patch | Malformed Bearer-token handling in the server authentication stack. | `INVALIDATED_BY_FRESH_AUDIT` |
| `GHSA-x445-f3h2-j279` | Moderate | same direct/transitive Auth.js paths | beta.32 / core `0.41.3`, same channel/patch | Provider binding for OAuth state, nonce, and PKCE cookies; Google is the configured provider. | `INVALIDATED_BY_FRESH_AUDIT` |
| `GHSA-6gpp-xcg3-4w24` | High | direct `next@16.2.10` | `16.2.11`, patch | Proxy/middleware bypass. The app has `proxy.ts`, while sensitive routes also enforce direct server authorization. | `INVALIDATED_BY_FRESH_AUDIT` |
| `GHSA-m99w-x7hq-7vfj` | High | direct `next@16.2.10` | `16.2.11`, patch | Server Actions denial of service. No application `"use server"` action was found, but the direct framework advisory was still updated. | `INVALIDATED_BY_FRESH_AUDIT` |
| `GHSA-89xv-2m56-2m9x` | High | direct `next@16.2.10` | `16.2.11`, patch | Server Action/custom-server SSRF. No custom server or application Server Action was found. | `INVALIDATED_BY_FRESH_AUDIT` |
| `GHSA-p9j2-gv94-2wf4` | High | direct `next@16.2.10` | `16.2.11`, patch | Rewrite SSRF with a dynamic host. Current PostHog rewrites choose a fixed `us`/`eu` host from server environment, never request input. | `INVALIDATED_BY_FRESH_AUDIT` |
| `GHSA-68g3-v927-f742` | Moderate | direct `next@16.2.10` | `16.2.11`, patch | Cache-confusion response bodies in the App Router/runtime. | `INVALIDATED_BY_FRESH_AUDIT` |
| `GHSA-4633-3j49-mh5q` | Moderate | direct `next@16.2.10` | `16.2.11`, patch | Invalid-UTF-8 cache confusion in the framework request path. | `INVALIDATED_BY_FRESH_AUDIT` |
| `GHSA-4c39-4ccg-62r3` | Moderate | direct `next@16.2.10` | `16.2.11`, patch | Unbounded Edge Server Action payload. No Edge Server Action was found. | `INVALIDATED_BY_FRESH_AUDIT` |
| `GHSA-q8wf-6r8g-63ch` | Moderate | direct `next@16.2.10` | `16.2.11`, patch | Image/SVG denial of service in the application framework. | `INVALIDATED_BY_FRESH_AUDIT` |
| `GHSA-955p-x3mx-jcvp` | Moderate | direct `next@16.2.10` | `16.2.11`, patch | Internal Server Function endpoint disclosure. No application Server Function was found. | `INVALIDATED_BY_FRESH_AUDIT` |
| `GHSA-fxqj-rqcc-2cmp` | Moderate | direct development `postcss@8.5.20`; Next declaration overridden to the same installed node | fixed `>8.5.22`; selected `8.5.23`, patch | Build-time CSS parsing. It was updated because the affected node was also attributed through direct Next in the audit. | `INVALIDATED_BY_FRESH_AUDIT` |
| `GHSA-mh99-v99m-4gvg` | High | `brace-expansion@1.1.16`, `2.1.2`, `5.0.7` through ESLint/type analysis and Sentry bundler `glob` | fixed lines `1.1.17`, `2.1.3`, `5.0.8`; transitive patch updates, but a second advisory supersedes those minima | No request-time application import. The retained omit-dev node is in Sentry's build/bundler plugin; callers do not pass an untrusted brace expression. Updating ESLint/Sentry parent trees would be an unrelated toolchain wave. | `NOT_REACHABLE_WITH_EVIDENCE` |
| `GHSA-rgw5-rvv9-x895` | High | same `brace-expansion` tool paths | fixed lines `1.1.18`, `2.1.4`, `5.0.9`; transitive patch updates require ESLint/Sentry parent refreshes | Same lint/type-analysis and Sentry build-only paths; no application request-time pattern expansion. The broader parent refresh is outside this direct-production Auth/Next batch. | `NOT_REACHABLE_WITH_EVIDENCE` |
| `GHSA-7p8r-x3mc-p8w7` | High | `fast-uri@3.1.4` through AJV in Sentry webpack schema validation and `prisma -> @prisma/dev` | fixed `>=3.1.5`; transitive patch/override update available | Schema/CLI/bundler validation only; no application URL parser import or request-time authority. Its Sentry/Prisma tool paths are outside this narrow batch. | `NOT_REACHABLE_WITH_EVIDENCE` |
| `GHSA-c96f-x56v-gq3h` | High | development root `prisma@7.9.0 -> @prisma/dev@0.24.14 -> find-my-way@9.6.0` | fixed `>=9.7.0`; transitive minor requires a Prisma CLI/`@prisma/dev` parent refresh | Prisma CLI development tooling, not `@prisma/client` or the deployed Next server. Updating the direct Prisma CLI is a separate dependency batch. | `DEVELOPMENT_ONLY` |
| `GHSA-5qjj-4xww-7phc` | Moderate | development root `prisma@7.9.0 -> @prisma/dev@0.24.14 -> valibot@1.2.0` | fixed `>1.4.1`; transitive minor requires a Prisma CLI/`@prisma/dev` parent refresh | Prisma CLI development tooling only; the parent refresh is outside this batch. | `DEVELOPMENT_ONLY` |

The post-change full audit still reports 11 *package nodes* because npm propagates the five unresolved advisory IDs through `eslint`, `minimatch`, `@eslint/*`, `ajv`, `@prisma/dev`, and `prisma`. `npm audit --omit=dev` still retains seven nodes because npm follows the production-installed Sentry build-plugin subtree and lockfile/peer closure around Prisma; source tracing above distinguishes these tool paths from deployed request-time imports. They are recorded, not claimed resolved, and were not expanded into a second dependency-upgrade wave.

The existing `@img/sharp-wasm32@0.35.3` and `@emnapi/runtime@1.11.2` extraneous-package observations are unchanged. They are install artifacts, not direct declarations, and this batch did not remove or reclassify them.

## Audit before and after

| Fresh audit | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Full vulnerable package nodes | 16 | 11 | -5 |
| Full moderate / high / critical | 2 / 12 / 2 | 1 / 10 / 0 | -1 / -2 / -2 |
| `--omit=dev` vulnerable package nodes | 12 | 7 | -5 |
| `--omit=dev` moderate / high / critical | 2 / 8 / 2 | 1 / 6 / 0 | -1 / -2 / -2 |
| Unique direct-production Next/Auth advisory IDs | 13 | 0 | -13 |
| Unique transitive-production-only advisory IDs | 0 | 0 | 0; the three affected core IDs were also reported on direct `next-auth` |

Fresh post-change audits contain no `next`, `next-auth`, `@auth/core`, `@auth/prisma-adapter`, or `postcss` vulnerability node. Remaining IDs are `GHSA-mh99-v99m-4gvg`, `GHSA-rgw5-rvv9-x895`, `GHSA-7p8r-x3mc-p8w7`, `GHSA-c96f-x56v-gq3h`, and `GHSA-5qjj-4xww-7phc`, with the exact classifications above. There is no claim of zero total vulnerabilities.

## Lockfile scope

The lockfile was regenerated with npm, never hand-edited. Every changed subtree is explained by the selected set:

- Next `16.2.11`: `@next/env`, the eight platform-specific optional SWC artifacts, and aligned ESLint config/plugin moved from `16.2.10` to `16.2.11`.
- Auth.js: `next-auth` beta.32 and adapter `2.11.3` converge on one core `0.41.3`; the nested core `0.41.0` is removed. Core's allowed dependency ranges canonically resolved `jose` `6.1.3 -> 6.2.8` and `oauth4webapi` `3.8.5 -> 3.8.6`; shared Auth metadata/integrities were materialized by npm.
- PostCSS: the root and Next override converge on `8.5.23`.
- npm also normalized one `eslint-plugin-import` peer marker and filled registry/integrity metadata for already-selected shared Auth dependencies. No other package version changed.

`npm ci`, `npm ls --depth=0`, affected-package `npm ls`, and `npm dedupe --dry-run` show a valid tree, one Auth core, one Next version, one overridden PostCSS version, no peer conflict, and the same two extraneous optional artifacts noted above.

## Compatibility matrix

| Boundary | Evidence after update | Result |
| --- | --- | --- |
| Next App Router, static/dynamic pages, route handlers | Strict optimized build compiled TypeScript and generated all 57 pages on Next 16.2.11. | Preserved |
| Auth configuration and Google environment validation | `test:auth-env-hardening` covers missing/blank/malformed secret, client ID, and client secret; production rejects the synthetic fixture. | Fail closed |
| Auth route handlers and anonymous session | Node.js auth route exports the v5 handlers; preflight receives JSON `null`, never HTML-as-JSON. Built runtime also returned JSON `null` with no-store headers. | Preserved |
| Google sign-in, callback URL, PKCE, redirect | Strengthened real local Auth.js preflight reads `/providers` and `/csrf`, posts sign-in, and validates the Google authorization URL, client ID, canonical callback, response type, and PKCE challenge without contacting Google. A malformed callback redirected to the existing `/auth/error?error=Configuration` path and did not create a session. | Preserved / fail closed |
| Sign-out | The preflight posts the issued CSRF token/cookie and verifies the same-origin `/` redirect. The local real-session browser matrix additionally signs out an authenticated ordinary user, proves the Prisma session row is deleted, and proves the old cookie then returns JSON `null`. | Preserved |
| Prisma adapter and session/account persistence | Adapter 2.11.3 is API-compatible and pins core 0.41.3. Existing Prisma schema is unchanged. The focused browser matrix creates real database users/sessions, covers valid and expired retrieval, exercises adapter-backed sign-out deletion, then cleans up. | Preserved; no migration |
| Session serialization and callbacks | Existing callback still serializes `session.user.id`; anonymous and database-backed session checks passed. | Preserved |
| Proxy/middleware | Existing `proxy.ts` compiles. It remains development-CORS only and is not treated as an authorization boundary. | Preserved |
| Admin, ordinary, and Pro boundaries | Real-session browser checks cover signed-out, forged, expired, ordinary, Pro non-admin, malformed, and administrator callers; direct route authorization remains before protected work. | Preserved |
| Consumer fallback and client preview | Critical-required, design-persistence, Phase 7, and Pro visual-policy gates passed, including the rule that `?mode=designer` cannot grant Pro. | Preserved |
| API routes importing `auth()` | Static auth hardening discovers the protected routes/pages; lint, typecheck, and the 57-page build compile all current consumers. | Preserved |
| Server Actions / Server Functions / Edge actions | Source inventory found no `"use server"` application action. Framework fixes were still applied; build confirms no convention regression. | No current feature path |
| Production artifact/start | Optimized build passed; `next start` on port 3320 became ready, `lsof` confirmed the canonical checkout, and health/session returned structured JSON. | Preserved |
| Synthetic OAuth fixture | Fixture remains guarded by an explicit activation token plus GitHub CI or local-preflight proof and a non-production application environment. | Production-disabled |
| CH-0001 controls | Auth-environment hardening, Phase 7, critical-required, and the focused real-session browser matrix passed without relaxing configuration, role, entitlement, or side-effect ordering. | Preserved / fail closed |

The Google provider itself was not contacted and no OAuth callback registration was changed. A live external provider round-trip and platform settings remain a separate external-verification activity, not a repository blocker or an implied change.

## Validation and budgets

Focused and required validation passed: auth-environment hardening; Auth.js session/sign-in/sign-out preflight; Phase 7 boundaries; required truthfulness; production-artifact evidence; critical-required; design cleanup `78/78`; design persistence; floor-plan required; strict catalog audit; surface-material runtime/schema; wall-paint catalog; catalog asset availability; strict asset inventory; Pro visual policy `4/4` across Chromium/WebKit; full lint with zero warnings; typecheck; code quality; focused real-session browser auth `2/2`; optimized 57-page build; production start; Phase 8; and `git diff --check`. Full E2E was not run.

The first production-classified build attempt intentionally supplied no production secrets and failed closed during prerender environment validation. A second production-classified build with inert, shape-valid local placeholders passed all 57 pages without contacting an external provider; that same command is repeated from the clean detached implementation commit for final authority. The inherited floor-plan NFT broad-trace warning, oversized-file warnings, and five draft-only catalog asset warnings are unchanged and outside scope.

| Phase 8 `/design` initial artifact | Starting candidate | After update | Delta |
| --- | ---: | ---: | ---: |
| JS raw | 5,790,910 | 5,791,051 | +141 |
| JS Brotli | 1,104,392 | 1,104,420 | +28 |
| CSS raw | 129,803 | 129,803 | 0 |
| CSS Brotli | 17,182 | 17,182 | 0 |
| JS chunks | 26 | 26 | 0 |
| CSS chunks | 1 | 1 | 0 |

All existing budgets remain green; no budget, architecture, code-quality, test, or security baseline changed. The 141 raw-byte and 28 Brotli-byte movements do not indicate an eager framework/auth chunk wave.

## Rollback and external verification

Rollback is one `git revert <focused implementation commit>` followed by `npm ci` and the focused auth/build checks. There is no data migration, schema change, stored-session rewrite, provider change, platform setting, push, deployment, or external mutation to undo.

Separate external verification may exercise a real Google OAuth sign-in/callback/sign-out against an immutable preview with the existing registered URLs. It must not reuse the synthetic fixture and is not evidence that this local batch deployed anything.
