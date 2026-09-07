# Production certification database lifecycle v1

## Acknowledged creation and conservative cleanup — 2026-09-07

Create authorization and prior absence do not prove resource ownership.
Certification records database and scoped-role ownership only after an
acknowledged CREATE. Adapter errors distinguish a known no-create/collision,
acknowledged creation followed by a later failure, and an uncertain outcome.
Later migration, grant, or inspection failures retain acknowledged ownership;
unknown appearances and collisions are preserved for inspection. Exact role
names accompany creation receipts; credentials remain confined to the existing
private binding. Historical lifecycle evidence is not rewritten or reclassified.

Cleanup requires acknowledged ownership and closes clients/processes through
their existing owners. The database adapter no longer terminates sessions by
database name. Any remaining connection blocks DROP; the exact resources and
cleanup failure remain available for a retry after their owner closes them.
Normal and abort cleanup verify owned database, scoped-role, and session
absence. Unknown roles remain explicitly preserved.

Window mounted/build owners use the existing Gate A3 provisioner in explicit
`--create-owned-window` mode. This mode binds an exclusive local creation receipt
to the invocation, verified `justus@127.0.0.1:5432/postgres` server, exact generated
name (at most 63 bytes), acknowledged CREATE and catalog OID. It refuses existing
names before migrations and records creation before applying migrations.
Cleanup checks that same receipt and catalog identity, refuses remaining
sessions, and verifies absence after ordinary DROP. Cleanup errors are recorded
separately from the original test/build failure. The general service-database
Gate A3 provisioning contract remains unchanged for its existing callers.

The auth-preflight coverage case formerly named
`helper-active-session-exact-target-termination` now records refusal followed
by the fixture owner's normal client close; its place in the required matrix
and all unrelated failure/attribution cases remain.

## Final-database AppEvent attribution and cleanup — 2026-08-26

The retained rehearsal
`REHEARSAL_ONLY-NOT_RELEASE_CERTIFICATION-NOT_VALID_FOR_INTEGRATION-CERT-20260826T101232Z-023d251fb2b7`
remains unchanged and failed. Its database began with zero application rows,
all five required stage bindings were present, all seven browser owners passed
without retry, and final verification observed 314 `AppEvent` rows, zero rows
in every other application table, and zero sessions. Abort subsequently
dropped the exact disposable database and proved absence; final standalone,
continuity, and integration-ready did not run.

The selected primary classification is
`A. EXPECTED_APP_EVENT_CLEANUP_OWNER_MISSING`. The retained evidence proves one
fresh, lifecycle-bound disposable database, an initial zero-row checkpoint,
the exact certification/candidate commit and tree, cumulative event growth
while the runtime and browser-owner stages ran, and the same terminal count of
314 in the consecutive retained lifecycle. Current source attribution finds
all production writers behind `lib/app-events.ts` or
`lib/trusted-app-event-core.ts`: public browser ingestion, server application
analytics, internal server diagnostics, and verified Stripe lifecycle events.
The direct writer outside those owners is test-only and is not used by the
certification stage commands. No evidence indicates a foreign database user,
another application-table lifecycle, or unexpected persistence owner.

The old rows did not carry a per-row certification binding. Their ownership is
therefore proven by the exclusive fresh-database lifecycle, not by metadata in
each row. The dropped database and retained safe evidence do not preserve the
exact event-type breakdown or exact minimum/maximum `createdAt` values; those
facts must not be reconstructed or invented. The safe retained inventory is:

| Table/type | Count | Writer/stage attribution | Run binding | Time range | Foreign/private-data finding |
|---|---:|---|---|---|---|
| `AppEvent` (exact event-name breakdown unavailable) | 314 | Central application event writers during runtime smoke and seven browser owners | Exact lifecycle database and certification/candidate commit/tree; no old per-row binding | Within the retained runtime/browser-owner interval; exact row range unavailable | No foreign owner or prohibited private data is evidenced; raw payloads were not retained |
| Every other application table | 0 | Not applicable | Exact lifecycle database | Final verification checkpoint | None |

For future runs, `lib/certification-app-event-binding.ts` adds a server-derived
`certificationRunBinding` only during `runtime-smoke` and `browser-owners`. It
binds the certification, candidate, commit, tree, stage, stage attempt,
browser-owner ID where applicable, writer classification, schema, and a stable
run-identity digest. Public ingestion rejects client attempts to supply that
reserved field. Ordinary production telemetry behavior and event semantics are
unchanged.

`scripts/production-certification-app-event-lifecycle.mjs` is the exact safe
inspection owner, and final verification is its only release-certification
caller. Before any deletion it retains counts grouped by event type, writer,
stage/owner/attempt, exact `createdAt` ranges, run-bound and foreign/unbound
flags, payload-shape status, and a prohibited-private-data flag. It retains no
raw metadata, payload, user/design/share identifiers, row IDs, URLs, sessions,
credentials, cookies, or provider values. Foreign, unbound, malformed,
wrong-run, unexpected-contract, or private-data rows make the lifecycle fail
closed with no removable ID set.

The PostgreSQL adapter then opens a serializable transaction, locks and
rereads the complete `AppEvent` set, requires the exact in-memory ID set and
safe row-identity digest captured after evidence publication, deletes only
those exact IDs, and proves zero remaining `AppEvent` rows before commit. It
does not use `TRUNCATE`, delete-all, table-wide cleanup, timestamps, or event
names as ownership. Final verification subsequently retains and enforces the
existing all-table zero count, zero sessions, and complete stage bindings. The
auth-preflight-only lifecycle does not invoke this release-certification owner.

Final-database failure publication is independent of cleanup. A failed
`database:verify-final` transition is now a consumed
`DATABASE_LIFECYCLE_FAILURE` at attempt 1, not a precondition failure. The
runner hashes the exact failed physical state, writes an immutable failed
lifecycle snapshot, and carries both through automatic abort. Abort records
its own cleanup transition while preserving the original failure,
`finalEmptyVerified=false`, and `failedRunRehabilitated=false`. The canonical
stage-result consumer validates both the immutable failed snapshot and the
later abort lifecycle descriptor.

Focused deterministic and real PostgreSQL regressions cover empty success,
exact owned-event cleanup, evidence-before-removal, foreign/unbound/wrong-run
and malformed/private-data rejection, other-table residue, isolated sessions,
missing bindings, cleanup failure, normal drop/absence, preserved abort
failure, and the final published result. The real fixture inserts one exact
run-bound `AppEvent`, removes only that row through the transactional owner,
then proves an unrelated row and session still cause truthful final failure.

## Initial abort-inspection attribution correction — 2026-08-22

The retained archive-preflight attempt remains failed and unchanged. Its first
automatic-abort inspection was denied before the previous implementation had
checkpointed the initiating archive-preflight failure, so the portable failure
collapsed to generic `DATABASE_LIFECYCLE_FAILURE` attribution. That is a
committed `AUTOMATIC_ABORT_FAILURE_ATTRIBUTION_DEFECT`; cleanup success after
the stop is not certification success and does not rehabilitate the attempt.

`abortCertificationDatabase` now persists the original stage, attempt,
classification, consumed-gate bit, and failed-state binding before the first
cleanup inspection. Inspection or cleanup denial is retained as a separate
cleanup failure classification. The wrapper passes the complete automatic
cleanup outcome into the canonical stage-result owner, which verifies the
physical lifecycle descriptor and permits a precondition state transition only
when the original failure and cleanup outcome are mutually consistent. A later
authorized retry may prove physical database absence, but it cannot rewrite the
original failed result.

## Existing auth fixture consumed by the preflight-only lifecycle

`certification:auth-session-preflight` now requires the canonical external
fixture session and consumes it through `ci:auth-fixture:preflight-existing`.
It never delegates to generating `preflight-local`. The lifecycle remains plan,
provision, migrate, initial inspection, scoped non-admin `DATABASE_URL`
projection, auth checks with the same provider digests, server cleanup, final
inspection, role removal, database drop, and absence proof. Raw provider and
database values remain non-portable, and this database remains distinct from
any later rehearsal database.

The child receives the private fixture-session root only through the declared
`auth-session-preflight` stage capability. Build and unrelated children cannot
receive that root. Independent read-only review is **PASS**; exact clean
committed-head qualification on implementation commit
`54401bfeff100e59ffc7412197d0816858ada0bf`, tree
`1ad58ea5b661e659b43393395f6b083d82bc54bd`, returned
`QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`. The final handoff records the
required rerun for the documentation-only follow-up.

## Auth-session preflight-only lifecycle bridge

The preserved failed preflight remains exactly
`PRECONDITION_ORCHESTRATION_FAILURE` with
`consumedSubstantiveGate=false`. It created no auth sidecar, database, state,
worktree, build, archive, Phase 8, runtime, or browser evidence and is not
resumed or reused. Its certification-infrastructure classifications are
`AUTH_SESSION_PREFLIGHT_DATABASE_LIFECYCLE_BRIDGE_MISSING`,
`AUTH_PREFLIGHT_DATABASE_STAGE_PROJECTION_OWNER_MISSING`, and
`AUTH_PREFLIGHT_HANDWRITTEN_SQL_OWNERSHIP_DEFECT`.

`auth-session-preflight` is now an explicit canonical database stage and
lifecycle profile. Its lifecycle is classified `AUTH_SESSION_PREFLIGHT_ONLY`,
`NOT_REHEARSAL_DATABASE`, `NOT_RELEASE_CERTIFICATION`, and
`NOT_VALID_FOR_INTEGRATION`. The profile binds the auth invocation nonce hash,
candidate commit/tree, generated database identity, lifecycle evidence,
private sidecar hash, scoped-role hash/classification, and exact active stage.
It cannot consume rehearsal state, and rehearsal stages cannot consume its
preflight binding.

`prepareAuthSessionPreflightDatabaseLifecycle` owns plan, live absence proof,
exact provision, all current Prisma migrations, initial row/session
verification, scoped non-admin role creation, private sidecar publication,
stage binding, and validated projection. The server environment is then built
through `projectCertificationChildEnvironment`; its sole database capability
is the lifecycle-owned `DATABASE_URL`. Admin URL, lifecycle controls, role
administration, session inspection, and drop capabilities remain parent-only.
Ambient `DATABASE_URL`, non-loopback, stale, cross-run, foreign, mismatched, or
dropped projections fail closed.

After the auth server stops, normal completion inspects final rows/sessions,
removes the scoped role and sidecar, drops the exact target, and proves
absence. Any auth, projection, publication, inspection, or normal-cleanup
failure routes through the existing canonical abort owner, retains the
original failure, records `failedRunRehabilitated=false`, refuses remaining
connections, drops only the owned target, and proves absence. The later
rehearsal database has a separate certification/candidate invocation and
database identity and cannot be planned from this preflight lifecycle.

The production helper and deterministic regression share the same exported
orchestration sequence. The registered 27-case matrix drives
server-before-listener, readiness, invalid-session, structured-result
publication, active-session, normal-cleanup, and repeated-abort failures
through that sequence. A database-cleanup failure after a successful auth
response records the auth server as passed while still failing the overall
result. Failed portable results require abort mode, original-failure retention,
non-rehabilitation, scoped-role removal, exact drop, and terminal absence.
When repeated abort cleanup cannot prove absence, the helper retains its
private recovery root instead of deleting the lifecycle identity and sidecar;
it removes that root only after terminal absence is verified.

Final independent read-only review passed. Exact clean committed-head
qualification returned `QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; a fresh
rehearsal and immutable final certification remain pending.

## Runtime failed-state CAS and abort attribution correction — 2026-08-18

The retained rehearsal ending `20260818T075947Z-5755043309d7` remains failed at
consumed `runtime-smoke:001` with `PRODUCT_ASSERTION_FAILURE`; its runtime,
state, database, and abort evidence is byte-identical. Outer cleanup success is
not runtime success and does not rehabilitate the run.

A managed stage now persists running→failed under compare-and-swap, rereads the
physical state, verifies its SHA-256, and returns that exact failed-state SHA
with stage and attempt. Automatic abort cleanup replaces any pre-stage expected
SHA with the physical post-failure SHA. Before cleanup it resolves the physical
failed stage and latest attempt, then requires exact caller agreement on stage,
attempt, classification, consumed flag, and the complete retained stage-evidence
set. Missing returned SHA, stale pre-stage SHA, or attribution drift is rejected.

For runtime failure, canonical database abort therefore retains
`originalStage=runtime-smoke`, the current attempt,
`PRODUCT_ASSERTION_FAILURE`, `consumedSubstantiveGate=true`, the failed-state
SHA, and runtime report/timing/start references. It captures current row/session
inventories and may, after owned clients close, drop the exact disposable
database, and prove absence while still recording `finalEmptyVerified=false`
when that normal checkpoint was never reached,
`failedRunRehabilitated=false`, and intentional `valid:false`. Raw database
URLs and passwords remain excluded. Successful lifecycle behavior is unchanged.

Deterministic state/CAS and database-abort regressions plus exact source
qualification return `QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; no real
database, rehearsal, runtime, Phase 8, or final certification was run for this
correction.

## Scope and preserved preflight

This is the repository-owned lifecycle contract for disposable databases used
by Production Certification Harness v1. It corrects
`CERTIFICATION_DATABASE_LIFECYCLE_OWNER_MISSING` and
`DATABASE_PROVISIONING_CLEANUP_CONTRACT_GAP` without changing product/UI,
Floor Plan, Prisma schema, migrations, telemetry, tracing, archive policy,
performance budgets, dependencies, or Playwright product assertions.

The retained preflight remains read-only and failed as
`PRECONDITION_ORCHESTRATION_FAILURE` /
`COMMITTED_DATABASE_LIFECYCLE_OWNER_ABSENT`, with
`consumedSubstantiveGate=false`. Its source identity, database-owner audit,
implementation hashes, host/storage evidence, proof that no database name or
database was created, historical operator database-name failure, and all prior
certification/rehearsal evidence are unchanged. This correction does not
reinterpret that stop as an application or PostgreSQL failure and does not make
the retained run resumable.

## Canonical owners

- `scripts/production-certification-database-lifecycle.mjs` is the only
  high-level owner. It plans, provisions, verifies initial/final state, binds
  database-using stages, requires connection absence, drops, verifies absence,
  reports status, and performs abort cleanup.
- `scripts/production-certification-database-contract.mjs` owns the name,
  server, state, schema, seal, and migration-inventory policies.
- `scripts/production-certification-database-adapter.mjs` owns the bounded
  PostgreSQL and canonical Prisma operations.
- `npm run gate:a3:db` remains the lower-level merge-required migration
  primitive. It still accepts a caller-selected Gate A3 URL and can reuse its
  target; it is not a certification lifecycle owner and the certification
  runner never treats it as one.

The database lifecycle evidence schema is
`interior-ai.production-certification-database-lifecycle.v1`; its atomic state
binding schema is
`interior-ai.production-certification-database-lifecycle-binding.v1`.

## Identity and plan policy

The owner generates, rather than accepts, the final database name. The fixed
`interior_ai_gate_a3_test_cert_` prefix is followed by 32 lowercase hexadecimal
characters from SHA-256 over the certification ID, candidate ID, candidate
commit, disposable-certification classification, owner-generated 128-bit
nonce, and generator version. The result is a valid lowercase PostgreSQL
identifier no longer than 63 bytes. Raw IDs, environment values, usernames,
hosts, passwords, and URLs are never embedded in the name. Different
certifications, candidates, commits, or nonces produce different identities;
the fixed full-length digest suffix is never truncated.

`npm run certification:database:plan` is database-non-mutating. On the exact
clean candidate it requires:

- an explicit `127.0.0.1` or `::1` admin URL on port 5432 targeting `postgres`;
- PostgreSQL 14 or newer and a local `CREATEDB` or superuser role;
- a canonical generated, unprotected target;
- live admin connectivity and private target-URL construction;
- catalog proof that the target is absent;
- coherent certification/candidate commit and tree bindings; and
- an absent physical evidence target under the authorized external evidence
  root.

The plan seals safe database identity, owner/policy/generator hashes, host/port
and server/role classifications, absence and policy results, timestamps,
aggregate SHA-256, and a domain-separated self-seal. It never retains a raw
connection URL or password. A target appearing after plan fails provision and
is not owned or dropped; abort cleanup may drop only a target whose durable
`provisioned` receipt proves acknowledged creation and its recorded catalog
OID still matches. A duplicate-database response marks the target unowned.
A lost CREATE response remains uncertain; prior authorization and later
appearance do not prove ownership. Cleanup preserves that exact resource.

## State machine and runner order

Normal states are:

`planned` → `create-authorized` → `provisioned` → `migrated` →
`initial-empty-verified` → `active`
→ `final-empty-verified` → `sessions-cleared` → `dropped` →
`absence-verified`.

Failure cleanup uses `failed` → `abort-cleanup-in-progress` → `abort-dropped`
→ `abort-absence-verified`. Evidence validators enforce every legal transition
and the required migration, initial/final row and session, release, drop,
absence, retained-failure, completion, identity, and revision invariants. They
reject impossible histories even when a caller recomputes the public seal.

The real order is:

1. database plan/preflight;
2. environment-envelope sealing;
3. state initialization with the exact plan descriptor;
4. resource preparation;
5. doctor;
6. database provision and exact 43-migration verification;
7. initial-empty verification and activation;
8. source validation through browser owners with owner-projected `DATABASE_URL`
   bound to the same database identity;
9. final-empty verification;
10. connection absence, exact owned drop, and catalog absence proof; and
11. final standalone and continuity under the existing ownership boundary.

`certification:resume` reports resource preparation and doctor before database
provision, then the required database command at each lifecycle boundary.
Final standalone rejects a real state that has not reached normal
`absence-verified`. Each durable lifecycle write extends a sealed revision
chain. Database transitions then compare-and-swap the descriptor into
certification state; if that state write loses its CAS, a later lifecycle
command may advance the stale binding only when its exact descriptor is a
sealed predecessor of the current same-identity lifecycle. Foreign or
unrelated bindings cannot be reconciled.

Doctor is read-only. Before provisioning it requires the physical lifecycle,
adapter, and contract owners; a current sealed plan; state/evidence identity;
approved local server/role/port; a fresh live catalog absence/capability query;
private target URL
construction; and registered provision, initial/final, drop, absence, and abort
owners. It never creates or repairs a database.

## Provision, row, session, and cleanup policy

Provision repeats the live absence/capability check, durably records an exact
pre-create authorization, creates only the exact generated identifier, records
acknowledged creation and its catalog OID, invokes canonical
`prisma migrate deploy`, and requires the target `_prisma_migrations` names to
equal all 43 sorted repository migration directories. It records the migration
count, source aggregate, applied-name aggregate, and exact target identity.

The canonical application-table set is the migrated target's sorted `public`
catalog, excluding only `_prisma_migrations`. Initial verification records every
table and count and requires total rows zero and no unexplained target sessions.
It never deletes rows to manufacture emptiness.

My Designs and Public Share continue to own their scoped fixtures and cleanup;
Guest Save remains database-free. Final verification occurs only after all
database-using stage identities were bound. It records every application-table
count and exact target session, requires both totals zero, and never runs a
generic delete. A leak is a truthful lifecycle failure even when later abort
cleanup removes the disposable database.

Normal cleanup verifies the recorded database and role OIDs, inspects target
database sessions and sessions for the role on any database, and refuses any
remaining connection. Owners close their own clients/processes normally.
Cleanup uses ordinary DROP, then proves database, role and session absence.
It never restarts PostgreSQL or terminates sessions.

Abort cleanup retains the original stage/classification and
`consumedSubstantiveGate` value, captures reachable rows and sessions, records
whether final-empty passed, refuses any remaining connections,
drops the entire owned disposable database even when rows remain, proves
absence, and records `failedRunRehabilitated=false`. Repeated cleanup is
idempotent at `abort-absence-verified`. SIGINT, SIGTERM, and ordinary runner
failures route to this owner when a real lifecycle/state binding exists.
Terminal signals are latched while the active owner finishes; abort cleanup is
serialized afterward, so it cannot race the lifecycle lock. Abort checkpoints
the row/session inventory, connection absence, drop, and absence steps, retaining
partial cleanup facts and the original failure across a retry. A late
standalone/continuity abort retains a previously proven final-empty result.

## Evidence and qualification

Portable evidence contains certification/candidate commit/tree identity; safe
database name and hashes; nonce hash; owner/policy/generator hashes; server and
role classifications; preflight absence; provision/migration results; initial,
final, and abort table inventories; stage bindings; target-session inventories;
release/drop/absence results; normal versus abort disposition; retained failure;
timestamps; aggregate SHA-256; and self-seal. It excludes raw URLs, passwords,
and credential values.

`scripts/test-production-certification-database-lifecycle.mjs` covers canonical
generation, length/collision behavior, protected/remote/port rejection,
existing and between-plan/provision targets, exact migrations, initial/final
rows, stage bindings, active-session refusal, owned-client closure, unrelated
session survival, catalog replacements, missing creation identities, normal drop/absence, abort retention/idempotence, foreign
candidate and stale state hashes, and secret-free evidence. Its real fixture
uses one generated local database, applies all 43 migrations, proves initial
zero rows, creates one fixture row and one held target session, proves truthful
final failure, refuses cleanup while the held client remains open, closes that
client, abort-drops the target, proves absence, and confirms an unrelated
`postgres` session survives. `finally` invokes the same abort owner whenever a
terminal absence state was not reached.

The deterministic matrix also rejects resealed impossible transitions, tests
resource/doctor/provision resume ordering and live doctor absence, recovers an
injected state CAS failure through the sealed revision chain, serializes a
signal during an active command, distinguishes a foreign create collision from
an uncertain CREATE response and acknowledged creation followed by failure,
preserves late final-empty truth and
partial abort checkpoints, and proves injected URL/password values are absent
from retained evidence and surfaced errors.

Independent read-only review initially failed the draft on lifecycle semantics,
runner order, CAS/create/signal recovery, abort truth, live doctor absence, and
redaction. Follow-up passes drove exact stage-binding validation and successful
drop-receipt retention across failed absence queries and retries. The terminal
review disposition is PASS with no remaining lifecycle blocker.

Deterministic simulation runs the contract-only lifecycle matrix and marks it
ineligible for real certification. Qualification requires that matrix plus the
real disposable fixture, doctor/state/environment integration, the existing
resource/worktree/dependency/generated-output/archive/runtime/journal/
continuity regressions, required-test truthfulness/direct manifest, zero-warning
lint, typecheck, code quality, architecture, tracked-artifact hygiene, syntax,
and clean Git status. The committed-head qualifier is the only owner allowed to
record `QUALIFIED_FOR_FINAL_CANDIDATE_CERTIFICATION`; its terminal result is
reported with the focused correction commit.

## CH-0015I handoff and rollback

The 2026-08-18 source-validation projection correction is classified
`SOURCE_VALIDATION_DATABASE_ENVIRONMENT_PROJECTION_DEFECT` and
`CERTIFICATION_DATABASE_BINDING_HANDOFF_DEFECT`. The failed rehearsal remains
failed closed with zero source child attempts; its database lifecycle and abort
absence evidence are unchanged. The lifecycle owner now exposes one private
`resolveCertificationDatabaseStageEnvironment` handoff that requires the exact
active, provisioned, migrated, initial-empty, state-bound, loopback database and
observed stage identity. Provisioning creates one lifecycle-scoped non-admin
stage login and mode-0600 private sidecar outside portable evidence; the sealed
lifecycle originally retained sidecar/role hashes; the 2026-09-07 correction
adds exact created role names and catalog OIDs. Every stage bind proves that login
still reaches the exact live target with no admin capability, and normal/abort
cleanup removes both the generated database and scoped role/sidecar. A durable
acknowledged-created role receipt permits cleanup only for its matching catalog
identity; uncertain creation is preserved under the 2026-09-07 correction;
an explicit or raced foreign role collision is recorded non-owned and abort
cleanup proves it was preserved rather than dropping it. The private sidecar
uses the same two-phase absent/expected-hash receipt: crash-after-write cleanup
removes only the exact owned bytes, while a foreign collision or replacement is
retained and recorded rather than unlinked. Its final publish is an exclusive
same-filesystem no-replace operation, so a foreign sidecar raced into the
authorized publish window is preserved and ownership is downgraded.
`production-certification-real.mjs` supplies that capability to the canonical
projector and never constructs a URL or copies a parent `DATABASE_URL`.

The correction changes no product/UI, Floor Plan behavior, telemetry, tracing,
archive semantics, Prisma schema, migration, dependency, lockfile, workflow, or
Playwright product assertion. The exact real-runner regression, capability
isolation matrix, database lifecycle matrix, doctor, simulation, and
committed-head qualification own validation. A fresh rehearsal, final
certification, and CH-0015 closure audit remain pending.

This correction is certification infrastructure only. It ran no production
build, Phase 8, runtime smoke, browser-owner matrix, Full E2E, rehearsal, final
certification, integration, deployment, or push. It changed no product, schema,
migration, dependency, or lockfile content. A fresh rehearsal remains pending;
final candidate certification and the CH-0015 closure audit remain pending.

Rollback is one focused correction-commit revert. If a task-owned disposable
database is active, run `npm run certification:database:abort-cleanup` first and
retain its absence proof. Never delete rows from or drop a caller-selected or
foreign database, never reuse the preserved failed preflight, and never rewrite
migration history.

Cleanup also binds the certification database and role to catalog OIDs recorded
after acknowledged CREATE. A missing identity or same-name replacement is
preserved, including before abort cleanup reads application rows. Role-session
checks use the recorded role OID across all databases; any remaining session
blocks cleanup without termination. Normal and abort absence verification
include both database sessions and sessions for the recorded role.

### Approved cleanup observation exception (2026-09-07)

Owner: window-integration task / Justus. Review expiry: **2026-09-14**.
Expiry requires review; it does not extend the budget automatically. This is the
specific approved timing exception under `docs/engineering/CODE_REVIEW.md`;
the general review policy and its ratchets remain unchanged.

The negative-attribution diagnostic on candidate `9453324` observed an autovacuum
worker starting inside abort cleanup after final verification had observed zero
sessions. Evidence: task-state `candidate-9453324-session-type-observations.json`
and `database-autovacuum-cleanup-wait-proposal-review.md`. Approved proposal:
`database-autovacuum-cleanup-wait-proposal.md`, SHA256
`40334c1c94f491c49203d35b51a41909a576f4a807f73a1b4cc15ccaab1bdb46`.
Explicit approval: attachment `ee9e57af-4cc3-46d4-ae01-39d443b69c1d`.
The original qualifier's session subtype remains **UNKNOWN**. The instrumented
diagnostic does not retrospectively classify it or qualify the failed run.

The adapter and lifecycle use the cohesive local owner
`scripts/production-certification-database-cleanup-observation.mjs` for one
2,000 ms monotonic polling deadline per normal-drop or abort invocation, shared
by release observation and the final pre-DROP guard. It starts at the first
eligible nonempty autovacuum-only observation. Once started, query, identity
check, checkpoint and sleep time consume that same budget. Requested sleeps
are at most `min(50 ms, remaining)`. No additional poll or sleep starts after
expiry. Mandatory initial/final guard observations still execute. An empty
result succeeds without deliberate waiting, including an in-flight query that
finishes beyond the deadline. The existing 10-second connection timeout and
absence of an explicit SQL query timeout are preserved; this is not a hard
2-second cleanup or SQL-operation timeout.

Waiting requires physical acknowledged creation, matching recorded database
and role OIDs, and the existing ownership/private-binding checks. Every session
must explicitly identify `backendType: "autovacuum worker"`. Client, unknown,
other server or mixed session sets refuse immediately. Raw null client addresses
remain null. Current database identity is rechecked on each nonempty observation
and immediately before non-forced DROP; role receipt checks remain enforced.
No session is filtered, cancelled or terminated. No settings change, forced DROP,
DROP retry or automatic cleanup replay is introduced. A zero count is mandatory;
a late DROP race remains a failure and retains its evidence. Timeout preserves
resources for later exact-ownership cleanup after conditions change.

Each invocation records its observations, backend types, chronological poll and
sleep events, shared budget, elapsed time, final count and refusal/identity/query
failures in `sessions.cleanupObservations`. Checkpoints preserve these through
later errors and stale intermediate lifecycle snapshots. Existing failure fields
retain later DROP/cleanup errors and the original failure independently.
Historical evidence may omit the new field; omission is not evidence of waiting.
The portable evidence validator checks the optional observation contract, and
the helper and focused tests are registered in source/ownership inventories.
The registered database-lifecycle owner executes the controlled-clock regression
coverage and lifecycle checkpoint cases before its complete real disposable
coverage, including the held-client refusal and unrelated-session assertions.

This scope changes no initial/final substantive verification, application data,
package dependency or publication/deployment authority. Roll back the coherent
cleanup-observation patch to restore immediate worker refusal; prior failure and
browser/build artifacts remain attributed to their original source.

Automatic fallbacks in the certification CLI, both auth-preflight fallback
paths, and the real database fixture finalizer read the validated physical
receipt before attempting cleanup. If a failed lifecycle has already recorded
a cleanup observation, they preserve it and refuse replay, including timeout,
late in-flight failure and failed DROP. This prevents renewed budgets and a
second automatic DROP. The original error remains the primary error/cause;
explicit later exact-owner cleanup is still available after conditions change.

The imported focused regression module remains in the harness inventory and
its precommit fixture copy list. The global script-test inventory includes its
one new path. It is executed by the existing database test owner, so it is not
listed as an additional direct package-command test in the gate manifest.
Existing literal-command enforcement and package-script digests are unchanged.
