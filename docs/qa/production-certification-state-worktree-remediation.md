# Production certification state/worktree remediation

## CH-0015I post-install dependency-binding-order correction

The preserved failed certification is
`CH-0015I-final-20260815T105213Z-cd21d61f`; its candidate is
`CH-0015I-20260815T105213Z-cd21d61f` at
`cd21d61fe0b0581144b3ce77aa091789ac915393`, tree
`566da9faccd85d7c8cc10bbe2c79a7ab25713f85`. Its physical source install
succeeded, all 19 source commands exited zero, and its aggregate measured the
dependency identity beginning `65dd2bef`, but state still contained null when
the aggregate validator ran. The later in-memory refresh was unreachable.
`SOURCE_CONTRACT_FAILURE` and `consumedSubstantiveGate=true` remain truthful in
that historical state and are not changed.

The separate root cause is classified as
`POST_INSTALL_DEPENDENCY_IDENTITY_BINDING_ORDER_DEFECT` plus
`CERTIFICATION_WORKTREE_DEPENDENCY_STATE_LIFECYCLE_DEFECT`. State v3 and
worktrees v2 now initialize all roles as `not-installed`/null/no evidence. A
single shared physical-install owner writes sealed dependency-installation and
binding evidence, then `worktree-dependencies:bind` acquires the state lock,
rereads and rehashes state, validates the exact certification, candidate,
commit/tree, role, worktree, private/filesystem identity, package/lock/toolchain,
node_modules/inventory/implementation-byte/resolution/isolation proof, performs
a final in-lock remeasurement, and atomically seals the
installed identity into state. Same-identity revalidation is read-only; a
different identity cannot overwrite the binding.
The isolation proof enumerates and hashes the exact ancestor and global Node
module search roots and rejects any present external root or `NODE_PATH`.
Binding-time drift is retained as terminal `binding-failed` evidence before a
retry can reinstall; non-consuming post-bind retries use only same-identity
read-only revalidation. Install/bind timestamps must belong to exactly one
retained owner attempt and durable state time is monotonic. Nested npm child and
outer wrapper results are separate, preserving a wrapper signal even when npm
itself completed successfully.

Source validation binds and retains the sealed transition-state receipt before
its 19 checks and v4 aggregate comparison. The final-artifact wrapper pauses
after its one install so binding and an explicit journal v2 process handoff
precede generated-source validation and build dispatch. Development-browser binding
precedes Cart/Retailer discovery and launch, with both browser dependency
identities revalidated before discovery and after their owners. Each role
revalidates after its last dependency-using boundary; drift fails rather than
reinstalling or refreshing. Dependency installs receive a minimal
credential-free environment with global and user npm configuration disabled.
Cleaned roles retain and revalidate their sealed semantic evidence.
Certification build evidence and final standalone verification require and
cross-bind exactly one prepare-to-complete process handoff. Evidence writers
authorize every intermediate directory as a contained physical non-symlink
component before writing; an intermediate symlink produces no outside file.
Doctor, deterministic physical-install simulation, qualification,
and the 26-case lifecycle matrix enforce this order. No product/UI, Floor Plan,
telemetry, NFT, Playwright product assertion, Phase 8 semantic, dependency,
lockfile, schema, migration, or external-service behavior changes.

The exact clean correction commit must return, and the final handoff records,
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; that source-platform result is
not real candidate evidence. Independent review is also recorded there. No
real build, Phase 8, runtime smoke,
browser-owner matrix, Full E2E, integration, push, or deployment is part of this
correction. Exact-head certification and the final CH-0015 closure audit remain
pending. Rollback is one focused commit revert; the preserved failed
certification is never a rollback target.

## Successor runtime-output capability correction

Read-only review of exact successor candidate
`d449afd0ff693ad8bd03932d13b768b961dceab4`, tree
`2af0f9c22cff576663174903494f904bdd4c4960`, stopped before any certification
ID, candidate ID, state, evidence root, doctor, or substantive stage existed.
No mutation occurred; it is not a runtime execution result. The preserved
source classifications are `RUNTIME_SMOKE_TIMING_EVIDENCE_ROOT_CONTRACT_DEFECT`
and `STAGE_ENVIRONMENT_OUTPUT_CAPABILITY_OWNER_MISMATCH`.

The successor correction retains this document's state/worktree boundaries.
`CERTIFICATION_EVIDENCE_ROOT` remains parent-only. Runtime smoke receives the
explicit stage-owned `PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT` and exact report,
timing, start-marker, and summary paths, all prevalidated outside the canonical
checkout and all three stage worktrees. The timing writer uses the same
versioned path contract as the real runner and cannot infer a root, fall back
to `.local`, create the external tree, or overwrite a final target. Portable
evidence records only the safe relative path and contract/identity hashes.
Phase-budget semantics and product behavior are unchanged. Exact-head real
certification and the final CH-0015 closure audit remain pending.

Status: bounded certification-platform correction on 2026-08-15. Real
exact-head certification and the final CH-0015 closure audit remain pending.
The authoritative state classification is
`CERTIFICATION_STATE_PRECONDITION_MUTATION_DEFECT`; its paired execution-root
classification is `CERTIFICATION_STAGE_WORKTREE_ISOLATION_DEFECT`.
The dirty pre-commit worktree is deliberately ineligible for qualification;
the final handoff records the sole bounded source-qualification result from the
exact clean correction commit. That result does not certify a real artifact or
consume any real gate.

## Historical failed certification

Certification `CH-0015I-final-20260815-cd2d42690091` and candidate
`CH-0015I-cd2d426900916a10` remain historical, invalidated, and ineligible for
reuse. Its doctor attempts 001–003, passed doctor, passed 19/19 source evidence,
failed non-consuming build attempt, quarantine-preflight discrepancy, failed
validator invocation, state invalidation, path inventory, and downstream
invalidations are not repaired or reinterpreted by this change. This correction
does not open or modify that state/evidence root; its existing state SHA-256 and
stage history remain properties of the retained historical record.

The failed validator invocation omitted
`PRODUCTION_EVIDENCE_CANDIDATE_ID`. The old owner treated the missing caller
value as source drift and mutated durable state, invalidating a passed
substantive source stage. The correct classification is
`PRECONDITION_ORCHESTRATION_FAILURE`, non-consuming, with zero state mutation.

The normal checkout contained 1,305 ignored user-owned paths. Their recorded
path-set aggregate is
`8ad720847565da6d586f2881e674d51100b70da27335eedee4deee8814fb50af`.
Environment files, historical evidence, `.vercel`, test output, and an
external-target final-component symlink made quarantine-based build eligibility
the wrong ownership boundary. Those paths are not certification inputs and are
not moved, copied, deleted, restored, or used by the corrected lifecycle.

A future real cycle must use a new certification ID, candidate ID, state file,
evidence root, three newly created worktrees, and a new ordered stage sequence.

## Entry-point ownership map

| Entry point | Invocation validation | Canonical identity | State access | Mutation authority |
| --- | --- | --- | --- | --- |
| `state:init` | complete init contract first | explicit new identity | creates a new state only | initialization owner |
| `state:validate` | complete mode contract before read | sealed state; caller fields compare | read and seal report | none |
| `build:eligibility` | candidate/commit/tree/parent and environment before read | sealed state; caller fields compare | read and seal report/plan | none |
| `resume` | resume contract before read | sealed state | read and return first eligible stage | none |
| `state:reconcile` | plan path plus exact expected state hash | sealed plan and current state | read, compare, then atomic replace | invalidation only after proven retained-input mismatch |
| stage commands | stage-specific environment and worktree before transition | sealed state and assigned worktree | read before start; atomic attempt transitions | their own stage only |
| `integration-ready` | integration refs/commit/tree and continuity before transition | sealed candidate plus integration comparators | read, validate, then transition | readiness owner only |
| `worktrees:cleanup` | task ownership and lifecycle terminality | sealed worktree bindings/private sidecars | read, remove task roots, record cleanup | cleanup fields only |

No missing invocation variable may cascade invalidation. A validation discrepancy
is a sealed report and, when retained inputs prove drift, a sealed invalidation
plan. Only explicit reconciliation with the exact pre-mutation state SHA-256 can
apply that plan. Every mutation holds an exclusive state sidecar lock, rereads
the current bytes under that lock, compares their expected SHA-256, and only
then performs atomic replacement. Unsealed plans and stale or concurrent
writers fail without changing bytes or history.

## Three-worktree correction

The `source-validation`, `final-artifact`, and `development-browser` roles are
three distinct detached Git worktrees at exact candidate
`cd2d426900916a1096fd0dab9380020db1c62671`, tree
`f783e8affd82c8fc6f933650b5cb59dedbbfea49`. Source checks never execute in the
canonical checkout. Install/build/archive/Phase 8/production runtime/final
continuity use only the final-artifact root. Cart and Retailer development
servers use only the development-browser root.

The owner rejects ignored influential paths, copied or external dependencies,
root/role aliasing, symlinks, wrong identities, missing roots before their last
stage, canonical-root use, and cross-certification reuse. Portable state binds
stable role/commit/tree/cleanliness/dependency/lifecycle hashes; private
sidecars bind physical realpaths, filesystem identity, and the private evidence
root. Roots persist through their last required continuity event and explicit
cleanup removes only task-owned worktrees. `NODE_PATH` and `NODE_OPTIONS` are
stripped and recorded for every projected child and are also stripped from both
stage-owned dependency installations, preventing parent or canonical modules
from influencing worktree execution.
An interrupted post-continuity cleanup is retryable: sealed private ownership
allows an already absent task root to be finalized without weakening validation
of the surviving roots.

## Scope and rollback

This changes certification state/orchestration, contracts, tests, simulation,
doctor, qualification, and documentation only. It does not change product/UI,
Floor Plan Upload, telemetry, NFT resolution, semantic timestamps, Phase 8
operations/samples/thresholds/budgets, dependencies or lockfile, database
schema/migrations/data, Playwright product assertions, CI workflows, or
deployment behavior. No real build, benchmark, runtime/browser matrix, Full
E2E, integration, push, or deployment belongs to this correction.

Rollback is one focused commit revert. A rollback restores both known
certification blockers, so no real certification should run until a reviewed
replacement owns transactional validation and pristine stage worktrees.
