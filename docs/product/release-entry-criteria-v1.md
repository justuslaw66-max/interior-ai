# Alpha, beta, and launch entry criteria v1

Status: Phase 12 product gate definition
Evidence state on 2026-07-22: criteria defined, not yet satisfied by human
evidence

These criteria do not authorize deployment, production access, checkout,
signing, or Phase 13 implementation. Every gate applies to one immutable source
commit, lockfile, build configuration, artifact, deployment configuration,
evidence payload, and release manifest.

## Gate rules

- A branch name is not candidate identity; record the exact commit and an
  immutable candidate tag.
- Any source, lockfile, migration, schema, build-time configuration, artifact,
  required evidence, or manifest change creates a new candidate.
- Automated evidence does not substitute for human usability, accessibility,
  professional, fabricator, commerce, or product-owner decisions.
- A skipped, annotated-away, or early-returned scenario is not a passing launch
  test.
- Critical and high findings must be fixed or explicitly waived by the
  authorized product owner with a durable issue reference.
- Private signing keys, credentials, customer data, environment files, and raw
  private designs never enter Git history or release evidence.

## Alpha entry — internal, protected, non-production

Alpha is for named staff and expert testers on an isolated staging project and
dedicated non-production data. It does not affect production users or data.

All of the following are required:

1. The Phase 12 launch scope, golden path, capability boundaries, non-goals,
   and decision log are reviewed by an assigned product owner.
2. Phase 13 Batches 1–5 are complete or each deferred behavior is explicitly
   outside the alpha promise.
3. One immutable candidate is built in a clean, secret-free worktree and its
   complete upload closure is hashed and audited.
4. TypeScript, lint/scoped policy, migrations, persistence/migration fixtures,
   security boundaries, performance budgets, and the production build pass.
5. A strict production-server Playwright suite covers the 16-step golden path
   with zero failures, skips, retries, conditional early returns, or flakes.
6. HTTPS staging passes deep health and the strict consumer vertical slice
   against a dedicated, migrated, non-production database.
7. Authentication, project ownership, share-token projection, upload
   validation, invalid-variant rejection, and local-backup recovery fail
   closed.
8. Live AI, email, payment, and merchant actions remain disabled unless the
   specific integration has an approved non-production sandbox and owner.
9. An independent QA reviewer completes one desktop keyboard golden-path smoke
   with no developer coaching and records findings and local hashed evidence.
10. A consumer UX reviewer completes at least one first-time living-room
    session and the error/recovery scenario on the same candidate.
11. A rollback target and exact alias rollback command/procedure are recorded
    and rehearsed in staging.
12. Support contacts, feedback capture, privacy notice, and incident routing
    are visible to alpha participants.

Alpha blocks on any known data-loss, authorization, cross-user exposure,
unrecoverable save, invalid commerce identity, or inaccessible core-path issue.

## Beta entry — invited external consumers

Beta may expose the product to invited consumers but remains separately
controlled from production data and general availability.

All alpha criteria plus all of the following are required:

1. Every one of the 48 canonical human release-evidence rows is completed on
   the exact candidate by the authorized role, with required artifacts,
   attestations, timings, findings, and hashes.
2. Consumer first-time, returning-user, error-recovery, keyboard,
   screen-reader, zoom, contrast, touch-device, and low-powered-device sessions
   pass or carry an explicit approved waiver.
3. Professional designer and fabricator reviewers confirm that progressively
   exposed Pro controls preserve the same document and that exported
   fabrication data is not misrepresented as automatically approved.
4. The end-to-end golden-path session is completed without coaching and the
   participant can explain save status, read-only sharing, shopping readiness,
   and the purchase boundary.
5. Browser coverage includes the approved support matrix with no skipped core
   path. Mobile/touch coverage uses physical or appropriately controlled real
   devices, not only viewport emulation.
6. Consumer and Pro analytics captures pass the privacy-safe event contract in
   an approved non-QA environment with QA hooks disabled.
7. Product/catalog owners verify names, dimensions, imagery, variants,
   availability classification, retailer links, and disclaimers for the launch
   catalog slice.
8. If purchase continuation is in beta, a commerce owner passes a strict
   Shopify sandbox or approved affiliate-boundary test for the exact variant
   and quantity. Otherwise the UI explicitly ends at a shopping plan and does
   not imply checkout availability.
9. Support runbooks cover save conflict, invalid backup, missing commerce,
   revoked share link, degraded catalog, and rollback communication.
10. An analytics owner defines alert thresholds for start-to-room, first-item,
    third-item, valid-layout, save, share, shopping, purchase-continuation,
    failure, and recovery rates without collecting private design content.
11. No unresolved critical/high finding lacks an authorized disposition.
12. The product owner approves the complete canonical evidence payload with
    the trusted key procedure. Codex may validate the signature but may not
    possess or use the private key.

## General-availability launch entry

General availability additionally requires:

1. An approved production project, database, domains, secrets, observability,
   retention policy, and ownership roster.
2. A rehearsed procedure for the platform's cross-project limitation: the same
   Vercel deployment object cannot be promoted, so the exact tested prebuilt
   output must be retained, re-uploaded, re-hashed, and compared with all
   runtime-configuration differences recorded.
3. Production deployment and rollback are separately authorized; the previous
   production deployment remains recorded and Ready until rollout acceptance.
4. Health, authentication, catalog, save/reopen, share, and read-only shopping
   smokes pass before traffic exposure. Merchant execution is tested only with
   explicit commerce authorization.
5. Rollout uses a named owner, monitoring window, rollback thresholds, and
   incident communication path.
6. The signed release manifest binds source, artifact, upload closure,
   deployment, configuration fingerprint, database migration state, evidence,
   and rollback reference.

## Evidence ownership

Named individuals must be assigned before evidence collection. The roles below
are owners, not evidence already obtained.

| Evidence or decision | Accountable human role | Required result |
| --- | --- | --- |
| Launch user, promise, scope, non-goals | Product owner | Approve, reject, or revise in decision log |
| Consumer first-time and returning flows | Consumer UX researcher | Neutral-prompt observations and hesitations |
| Error recovery and general golden path | Independent QA lead | Manual smoke and strict browser evidence |
| Keyboard, screen reader, zoom, contrast | Accessibility specialist | Real assistive-technology evidence |
| Touch and reduced-memory behavior | Mobile/performance owner | Physical-device timings and findings |
| Authentication, ownership, shares, privacy | Security/privacy lead | Threat-focused manual review and disposition |
| Catalog identity and commerce content | Catalog/commerce owner | Product/variant/link/readiness validation |
| Shopify sandbox or affiliate boundary | Commerce owner | Exact approved purchase-path evidence |
| Pro workflow | Professional designer | Workflow acceptance without consumer leakage |
| GLB, schedule, drawing, fabrication output | Fabricator/manufacturing reviewer | Independent artifact review |
| Analytics contract and privacy | Product analytics owner | Normalized live capture and privacy approval |
| Artifact provenance and rollback | Release engineering lead | Reproducible hashes and rehearsal record |
| Support and incident readiness | Support/operations owner | Published runbooks and contact coverage |
| Findings, waivers, final evidence signature | Product owner | Explicit disposition and trusted signature |

No one reviewer should approve evidence outside their competence solely to fill
the matrix. Product-owner signature approves the complete payload; it does not
convert a missing specialist observation into a pass.

## Required evidence package

For each candidate, retain at minimum:

- commit, tag, lockfile hash, migration state, build target, artifact hash,
  upload-closure hash, and configuration fingerprint;
- test discovery and result counts proving zero core skips;
- hashed local JSON reports for production-server and HTTPS runs;
- browser/device/viewport and elapsed timing for each human session;
- screen recordings, session notes, accessibility captures, normalized
  analytics capture, and reviewed exports required by the canonical schema;
- finding severity, durable issue link, resolution or waiver, and rerun result;
- staging and production rollback identities;
- product-owner approval metadata and signature validation result, never the
  private key.

## Current baseline assessment

RC5 is suitable as the evidence-backed source foundation for Phase 13, but it
does not yet satisfy alpha, beta, or production launch entry:

- Passed: 191/191 same-commit local production-server tests.
- Passed: 42/42 distinct HTTPS staging tests.
- Passed: dedicated database health with all 38 migrations current.
- Passed: clean-worktree artifact audit with zero forbidden/missing trace paths
  and zero detected secret matches.
- Missing: all 48 human evidence rows and trusted product-owner approval.
- Missing: strict approved purchase continuation evidence.
- Missing: approved/rehearsed cross-project production artifact procedure.
- Warning: broad floor-plan PDF NFT trace remains secret-safe but oversized.
