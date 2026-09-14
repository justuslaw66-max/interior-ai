# Guest Save sign-in/reload synchronization repair

Approved base M: `a4295bb60c2819c0c3d380f2c758aad8f20f21db`, tree `4f82d7ab6bc838fb91ff42c4805dba7c93e0fd9d`.
Branch: `fix/guest-save-signin-reload-sync`.

## Scope and contract

The keyboard Save case exercises duplicate primary activation, synthetic sign-in return, then intentional reload. The documented prompt contract requests sign-in after claim. Separate static coverage tests invalidation during pending claim and remains unchanged.

The repair registers a main-frame wait before the original double activation. A non-configurable observational marker on the old document excludes old-document, same-document history and iframe completion while supporting same-URL return navigation. It requires the new document at the return URL to finish DOM loading, then checks the existing scene client-hydrated attribute before the original reload. The marker does not alter authentication or save state. Playwright's existing action/test limits bound polling; internal polling is aborted/disposed on failure and the result handle is disposed on success.

All fixture responses, identities, routes, original assertions, actions, reloads, timeouts, retries and application source remain unchanged. No helper shared with My Designs or Floor Plan Upload changed. Durable requests remain DEFERRED_BY_OWNER.

## Validation and handoff

Before the local candidate commit: corrected Chromium case 1/1 passed with zero retries; static Guest Save prerequisite, typecheck, repository lint, code-quality checks and required-test repository truthfulness check passed. One separate focused local source review approved with no blocking findings. This is not submitted GitHub approval.

The full Chromium/WebKit Guest Save matrix is run against the resulting exact local commit with the unchanged eight scenarios, one worker and zero retries. Its actual result, commit identity, commands, attempt counts, source/build binding, cleanup and current readiness state are retained in `test-results/guest-save-sync-repair/repair.json` and `REPAIR-RESULT.md` within that directory. Do not infer its outcome merely from this tracked implementation handoff. Tests use a task-owned verified loopback server via untracked local configuration; no change to shared port configuration is proposed.

The reused synthetic application build is verified against unchanged application source at M. The local port override means these results are not a canonical remote required-gate run. Remote checks: NOT_RUN. A separate push/PR authorization is required; no remote mutation, deployment or integration approval is implied.

## Historical status and limits

Overall status remains MERGED_FEATURE_POST_INTEGRATION_CI_FAILED_REQUIRES_TRIAGE. The synchronization weakness exists at exact T (`35ec2eb8e1de3210549b7666ff8cd32f42f4c26e`), but failed run 34688747378 attempt 1 was NOT_REPRODUCED_LOCALLY and its cause remains UNRESOLVED. Its skipped My Designs and Floor Plan Upload checks remain skipped. Candidate C (`d0c7d8dd395da33174608aab7325b25c03b91f6e`) and prior local passes do not establish integration success. The original diagnostic worktree and all historical findings are preserved.

Rollback scope, if separately authorized, is this test-only change and handoff; there is no application, schema, dependency, auth-policy or deployment change to reverse. A rerun of unchanged M cannot test the new test bytes.
