# Code review

Review establishes that a change is necessary, locally understandable, behaviorally intentional, and safe to operate. A green check is evidence, not a substitute for reading the diff.

## Author handoff

The change description should state:

- the problem and intended behavior, including whether behavior changes;
- the architecture owner and contracts affected;
- changed files and why each is in scope;
- data, schema, catalog, generated, dependency, security, accessibility, and performance impact;
- characterization added before a refactor and tests added for new behavior;
- exact commands and results, including known failures or skipped gates;
- rollback approach, known risks, follow-up, and any dated exception.

Keep formatting-only, dependency, generated-data, behavior, and structural changes separate. Review is allowed to reject a correct-looking patch that is too broad to verify safely.

## Reviewer sequence

1. Confirm the request, applicable instructions, clean/understood worktree, and correct running checkout.
2. Read the complete diff and identify every behavior, boundary, state owner, and source of truth affected.
3. Check that the smallest coherent change was made and unrelated work is preserved.
4. Trace untrusted input, authorization, persistence, errors, and privileged integrations end to end when relevant.
5. Check canonical scene/document, placement, transform, Consumer/Pro, catalog, generated-file, client/server, and rendering boundaries.
6. Look for mirrored state, hidden global mutation, ambiguous side-effect ownership, per-frame React work, avoidable `useFrame` allocation, cycles, and catch-all modules.
7. Review tests for meaningful assertions and failure paths. Refactors need parity/characterization before movement; new behavior needs positive, negative, and boundary cases.
8. Check size/function ratchets and make sure any improvement lowers the baseline. Challenge exceptions for cohesion, scope, owner, review reference, and expiry.
9. Verify the reported commands and inspect failure output. A required test that skipped its core assertion is not a pass.
10. Confirm the handoff states behavioral impact, risks, rollback, and remaining work accurately.

## Blocking findings

Block review for accidental product changes, a second state truth, hand-edited generated output, weakened tests, raised budgets without an approved exception, client access to secrets/Prisma, silent error swallowing, unvalidated boundary data, new explicit `any` or suppressions, unexplained assertions, hidden dependency direction, runtime cycles, or unrelated rewrites.

Large modules are not grounds for opportunistic extraction. When an oversized module is materially changed, ask whether a characterized, responsibility-based reduction is safe inside the requested scope. If it is not, hold the baseline and record the reason; do not fragment the file mechanically.

## Verification expectations

Start with focused lint and tests for the touched area. Run `npm run check:code-quality`, `npm run typecheck`, repository lint, relevant domain suites, and production build according to risk and existing scripts. UI/runtime changes require focused browser or manual verification against the correct checkout. Related batches require immutable-preview critical-path smoke; full Gate A3 is run once on the exact promotion artifact.

Always finish with `git diff --check`, a complete diff review, and a status check. Any code, configuration, generated, catalog, migration, lockfile, or build-environment change after certification invalidates the certified artifact.
