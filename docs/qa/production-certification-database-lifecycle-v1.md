# Production certification database lifecycle v1

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
  database-using stages, releases exact sessions, drops, verifies absence,
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
`create-authorized`/`provisioned` chain proves this lifecycle authorized and
created it. A duplicate-database response revokes recoverable ownership and
abort refuses the colliding target. A lost response after successful creation
is recoverable only from the exact durable authorization, generated identity,
and just-in-time absence checkpoint.

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
10. exact session release, drop, and catalog absence proof; and
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
the observed or safely recovered creation, invokes canonical
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

Normal cleanup first matches only sessions whose `datname` equals the exact
generated target, excludes the current admin backend, records matched and
terminated PIDs, waits boundedly for retirement, requires zero remaining, drops
only the exact quoted identifier, and proves `pg_database` absence. It never
restarts PostgreSQL or terminates another database's sessions.

Abort cleanup retains the original stage/classification and
`consumedSubstantiveGate` value, captures reachable rows and sessions, records
whether final-empty genuinely passed, releases only exact owned sessions,
drops the entire owned disposable database even when rows remain, proves
absence, and records `failedRunRehabilitated=false`. Repeated cleanup is
idempotent at `abort-absence-verified`. SIGINT, SIGTERM, and ordinary runner
failures route to this owner when a real lifecycle/state binding exists.
Terminal signals are latched while the active owner finishes; abort cleanup is
serialized afterward, so it cannot race the lifecycle lock. Abort checkpoints
the row/session inventory, exact release, drop, and absence steps, retaining
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
rows, stage bindings, active sessions, exact-only termination, unrelated
session survival, normal drop/absence, abort retention/idempotence, foreign
candidate and stale state hashes, and secret-free evidence. Its real fixture
uses one generated local database, applies all 43 migrations, proves initial
zero rows, creates one fixture row and one held target session, proves truthful
final failure, abort-drops the target, proves absence, and confirms an unrelated
`postgres` session survives. `finally` invokes the same abort owner whenever a
terminal absence state was not reached.

The deterministic matrix also rejects resealed impossible transitions, tests
resource/doctor/provision resume ordering and live doctor absence, recovers an
injected state CAS failure through the sealed revision chain, serializes a
signal during an active command, distinguishes a foreign create collision from
an ambiguous successful create response, preserves late final-empty truth and
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
lifecycle retains only sidecar/role hashes. Every stage bind proves that login
still reaches the exact live target with no admin capability, and normal/abort
cleanup removes both the generated database and scoped role/sidecar. A durable
pre-create/created role receipt makes ambiguous task-owned creation recoverable;
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
