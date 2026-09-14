# Floor Plan Upload synchronization maintenance

Status: **LOCAL_REPAIR_REVIEWED_AWAITING_PUBLICATION_APPROVAL**.

## Locked scope and identities

Repository: justuslaw66-max/interior-ai. Worktree: /Users/justus/Developer/interior-ai-floor-plan-upload-sync-fix. Branch: fix/floor-plan-upload-scroll-restoration-sync.

Initial base R: `b472293c07165f70af5f5b7c31e4c23a912c1f49`; tree `2c2274d4c1c57b16ada29d50ae00a50446308075`; sole parent M / latest observed integration/deep-clean-v1 target: `a4295bb60c2819c0c3d380f2c758aad8f20f21db` (2026-09-13T07:29:36Z). PR #31 remains open/unmerged at R. No target drift observed.

The candidate is the commit containing this record, with sole parent R. Its exact post-commit HEAD/tree is retained in the ordinary ignored publication/candidate.json and displayed in the exact publication approval request; no self-referential commit hash is embedded here. Tested upload-spec SHA-256: `1d7021b8cd4fd394d3a7893f777da0dabcc6df590775c34257c7a87d4498d66d`.

Own changes against R: tests/required/floor-plan-upload-accessibility.spec.ts and this record only. Guest Save source and status are inherited unchanged. The complete proposed diff against M therefore contains FOUR paths: those two plus tests/required/guest-save-overlay-accessibility.spec.ts and GUEST-SAVE-SYNC-STATUS.md. R is the inherited Guest Save commit; this commit is the new upload repair. No application, workflow, manifest, dependency, database or shared-helper change.

Durable requests remain DEFERRED_BY_OWNER. B10, real authentication/providers, keys and production release remain outside scope.

## Correction and direct contract

The affected history/Escape/scope-replacement case now awaits expect.poll, freshly reading exactly document.body.style.overflow on each observation and still requiring exactly the empty string. Existing limits remain: test 30s, assertion 30s, action 30s, navigation 60s; worker=1, retries=0, repeatEach=1. Installed Playwright 1.60.0 derives polling from the existing assertion and test deadlines. A lock that remains hidden fails; no timeout increase, action replay, sleep, computed CSS, soft assertion or forced style change.

The dialog registry restores its saved inline overflow after final-owner unregistration. This workspace uses passive-effect cleanup; portal absence alone does not establish release. Triage separately observed portal removal with one disconnected lock owner, then release before teardown. Historical CI causation remains UNRESOLVED / NOT_REPRODUCED_LOCALLY.

Because triage also observed a later /design URL cleanup, a minimal test-local MutationObserver records restoration only in the original document at /design with the exact replacement design/project. The original-document JS handle must confirm that observation after the fresh-value poll. A fresh document invalidates the handle, and an empty style observed solely after the later URL cleanup does not set its flag. Teardown occurs after awaited assertions and cannot manufacture success. The observer disconnects when it observes the valid empty value; successful tests dispose the handle, and failed contexts dispose their observers through the existing fixture lifecycle.

The observer adds no intentional delay or action replay; its overhead may affect timing. It records callback-time state, not exact mutation causality, and may conservatively fail if the URL changes before its callback sees the release. All original user actions/order, routes, synthetic identities, fixtures, URL/dialog/focus/history/Escape assertions and other scenarios are preserved byte-for-byte outside the affected case. Production lifecycle choices are unchanged.

## Executed local validation

All commands executed once; ordinary outputs under ignored test-results/floor-plan-upload-sync. Tests ran at R plus the exact reviewed patch, not a different source. Their execution records bind HEAD, tracked diff and final spec hash; the subsequent commit contains those same test bytes.

| Check | Result |
| --- | --- |
| npm run test:floor-plan-upload-accessibility-static | PASS; existing local fixture producer and static contract |
| Focused corrected WebKit case | PASS 1/1, zero retries |
| Complete existing Floor Plan Upload matrix | PASS 22/22 (11 Chromium + 11 WebKit), zero retries/skips; all declared scenarios |
| npm run typecheck | PASS |
| npm run lint | PASS; non-failing generated-file Babel size notices retained |
| npm run check:code-quality | PASS; no baseline changes |
| node scripts/required-test-truthfulness.mjs check | PASS; 27 gates / 413 classified sources |
| git diff --check / staged diff check | PASS |
| Separate focused source review | APPROVED; no blocking finding or source remediation cycle |

Focused command: `node_modules/.bin/playwright test --config=test-results/floor-plan-upload-sync/diagnostic.config.ts --project=webkit --grep 'history confirmation is unchanged and guards parent Escape while scope replacement cancels stale return$'`.

Matrix command: `node_modules/.bin/playwright test --config=test-results/floor-plan-upload-sync/diagnostic.config.ts`.

Total new browser executions: 23 (one focused plus 22 matrix), zero failed/skipped/retried executions. No historical reproduction or unrelated matrix was rerun. No local setup failure; prior triage/reporting incidents remain in their original records.

One separate reviewer, /root/floor_upload_sync_review, checked the complete diff, direct cleanup contract and installed polling behavior at the final spec hash. No source remediation required. Its reporting clarification about observer overhead is incorporated. This is local separate review, not a submitted GitHub approval or independent browser run.

## Reused build, fixtures and cleanup limits

Reused existing synthetic application build from M, via preserved R/triage worktrees: build ID `yU4Ir0L0duaVDHAk6IusS`; all 1883 non-cache build hashes verified before reuse. M/R application and build configuration are identical, and the new diff is test/status only. Matching existing root and installed dependency locks were independently cloned; no installation, upgrade or fresh application build. The existing static command produced its local Floor Plan Upload browser bundles in this worktree.

Node 24.13.0, npm 11.6.2, Playwright 1.60.0 on macOS with installed Chromium/WebKit. Runtime uses the retained synthetic environment and original mocked API/auth/import boundaries, inert provider placeholders, and an unreachable local database URL. No database service/mutation or real provider/authentication. Synthetic fixture passes do not establish real persistence or production readiness.

The local config imports the committed config, changing only local paths/origin, server ownership verification and reporting. These local results are not canonical required-CI results. The full matrix includes existing integrated and inert component fixture limitations; it does not turn unreachable product branches into live navigation evidence.

Focused origin: http://127.0.0.1:52927; matrix origin: http://127.0.0.1:52958. The actual listener cwd/ancestry/build was verified before browser launch; baseURL, readiness URL, APP_ORIGIN and NEXTAUTH_URL aligned. Both listeners are absent after completion. Playwright disposed its browser/server groups; natural child exit-status/PID records are not complete, so graceful individual-child exits are not claimed. No other worktree or port 3000 listener was used/stopped. No background monitoring scheduled.

## Publication, CI and dependency plan

Propose one successor maintenance PR on this branch against integration/deep-clean-v1, containing unchanged R plus this repair. Its description must disclose both commits/four paths and that it is intended to supersede #31. Leave #31 open and unchanged unless its closure/change is separately authorized. Avoid requiring the already-failed R alone to pass without the known upload repair.

Read-only preflight verified origin is exactly justuslaw66-max/interior-ai; the proposed remote branch and matching PR are absent. Existing repository automation is unchanged: ordinary pushes to this new fix branch are outside the CI push branch filter; creating the PR against the integration target triggers existing required CI. Secret scan, Stable checks, Advisory contract preflight and merge-gate apply; Stable contains Guest Save, My Designs and Floor Plan Upload. Existing CI uses runner-local disposable PostgreSQL/synthetic auth resources. Full advisory is label-triggered/dispatch/scheduled and is not added by ordinary PR creation.

Known-team Vercel refresh: official existing CLI 56.3.2; complete one-page inventory of four projects, no Git links reported; repository-filtered inventory empty. Repository webhooks empty. No deployment path established for the proposed action within these checked scopes. Deploy-hook counts and unknown external callers/accounts remain unverified, not absent. No environment values read, hosting changes, hook call or preview/deployment occurred. No broader hosting audit was performed.

Applicable branch rules are empty; protection reports Branch not protected. This does not waive required CI. Candidate canonical CI, submitted GitHub review state, merge-context verification and post-integration CI remain PENDING / NOT_RUN for this new candidate. Prior R passes are not transferred as new-candidate passes.

## Historical evidence and next exact action

Preserve /Users/justus/Developer/interior-ai-floor-plan-upload-triage/test-results/floor-plan-upload-triage/TRIAGE.md and /Users/justus/Developer/interior-ai-guest-save-sync-fix/test-results/guest-save-sync-repair/REPAIR-RESULT.md unchanged. Original runs 34688747378 attempt 1 and 34712531712 attempt 1 remain failed. R's Guest Save 16/16 and My Designs 16/16 passes and Floor Plan Upload 21/1 failure remain distinct. Missing historical traces/error-context and uncertainty are unchanged. The floor-plan increment remains merged.

Next exact action: obtain owner approval INSIDE CODEX to publish the displayed exact local HEAD/tree with one ordinary non-force branch push and one successor PR; authorize its existing automatic required CI/disposable resources and retained automation boundary. Do not push under this checkpoint alone. After approval execute that batch and continue the same maintenance mandate through candidate CI, then a separate exact merge approval and post-integration verification. No merge/auto-merge, closure of #31, branch deletion, CI rerun, workflow change or deployment is included in the publication request.

Completion remains pending until an integrated revision containing both repairs passes applicable required post-integration CI. Do not report COMPLETE_DEVELOPMENT_INTEGRATION_VERIFIED before then.
