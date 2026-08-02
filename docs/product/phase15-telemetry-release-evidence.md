# Phase 15 telemetry and release evidence

## Privacy boundary

Product outcomes are emitted through `trackProductEvent` in `lib/analytics.ts`. Domain and UI code do not call an analytics vendor directly. The adapter accepts only the fixed fields in `ProductTelemetryProperties`; it has no fields for project text, room names, addresses, URLs, object IDs, tokens, payment data, credentials, or free-form error messages. Analytics failure remains best-effort and cannot interrupt editing or saving.

The canonical event list is in `lib/product-telemetry.ts`. It covers project start, room completion, catalog use, placement, transforms, validation, undo, 3D use, save/reload/recovery, sharing, shopping, and purchase intent. Performance observations use the same adapter and a fixed metric-name allow-list.

## Baseline-first metrics

`lib/product-metrics.ts` defines activation, time to first room, time to first placement, golden-path completion, save/reload/recovery success, crash-free editing, 2D/3D success, shopping engagement, purchase click-through, returning use, and human confidence evidence.

`config/phase15-quality-budgets.json` deliberately leaves product conversion targets unset until representative production-like baselines exist. Existing Phase 8 performance limits remain safety guardrails. Asset failures and rendering crashes remain zero-tolerance blockers.

Baseline sources:

- `npm run benchmark:phase8:projects`
- `npm run benchmark:phase8:browser`
- `npm run test:phase8-performance`
- `npm run validate:product-assets`

## Human evidence

`PHASE15_HUMAN_EVIDENCE_REQUIREMENTS` defines exactly 48 reviewer-owned rows. `npm run create:phase15-human-evidence` prints a complete blocked template; pass `-- --output <path>` only when intentionally preparing a candidate evidence file. Codex must not convert blocked rows to passing rows.

Every generated row includes the required candidate, reviewer, device, steps, expected/actual result, outcome, artifact hash, defect, notes, and Not-applicable justification fields. Completed evidence is rejected when it is missing a reviewer, candidate binding, evidence artifact, or matching SHA-256. Failed evidence requires a defect reference; Not applicable requires a written justification.

## Canonical release manifest

`Phase15ReleaseManifestSchema` binds the candidate identifier, full commit SHA, immutable tag, clean-checkout confirmation, lockfile, automated reports, Playwright JSON report, build artifact digest, deployment build ID, HTTPS environment, project and migration versions, evidence-bundle hashes, approval decision and timestamp, and trusted product-owner public-key fingerprint.

The manifest uses the schema-ordered, two-space-indented UTF-8 JSON encoding produced by `canonicalizePhase15ReleaseManifest`, including one trailing newline. The detached signature verifies those exact bytes. Verification accepts only a trusted Ed25519 public key and explicitly rejects private-key input. The repository does not need, read, generate, or store the product owner's private key.

Run the final validator from the exact clean candidate checkout:

```text
npm run check:phase15-release-evidence -- \
  --manifest <manifest.json> \
  --human-evidence <human-evidence.json> \
  --signature <manifest.sig> \
  --trusted-public-key <trusted-owner-public.pem>
```

The command exits nonzero for malformed, incomplete, mismatched, dirty-checkout, wrong-tag, wrong-commit, bad-hash, missing-signature, untrusted-key, or invalid-signature evidence. `--report-only` is for an intentionally incomplete review matrix and does not grant release approval.

## Existing cabinetry checker

`npm run check:cabinetry-release-evidence` remains the specialized Custom Millwork Studio validator. Its v2 matrix requires exactly 48 records: five usability scenarios, 33 first-time template checks, and ten release gates. It validates candidate/build identity, readable repository-relative hashed artifacts, actual human observations, browser execution counts, accessibility evidence, live Consumer and Pro analytics captures, fabricator artifacts, finding dispositions, and a trusted Ed25519 product-owner approval. Normal mode fails closed until all evidence and approval are valid; `--report-only` permits an incomplete but structurally valid matrix. It never needs a private key.
