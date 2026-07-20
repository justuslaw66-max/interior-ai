# Cabinetry Phase 1 Risk Backlog

This backlog records target-adjacent API, security, import, and recovery work
that was deliberately not folded into the structural Cabinetry Studio phase.
No critical vulnerability, exposed secret, confirmed authorization bypass, or
immediate data-loss path was found in the approved Phase 1 boundary.

## 1. Bound imported source-definition size

- Severity: medium
- Confidence: confirmed
- Evidence: `CabinetryStudio.tsx` reads the selected JSON file with
  `await file.text()` before enforcing a byte limit. Parsing and domain
  validation happen afterward in `parseCabinetSourceDefinitionJson`.
- Affected files: `features/cabinetry/components/CabinetryStudio.tsx`,
  `features/cabinetry/generateCabinetDocumentation.ts`
- User impact: a mistakenly or deliberately oversized local file can allocate
  excessive browser memory or stall the Studio tab. The path is client-local;
  no server upload was found in this flow.
- Recommended batch: focused untrusted-import hardening. Define a documented
  maximum, reject before `file.text()`, retain current valid state, and provide
  an accessible error without logging file contents.
- Tests required: just-under/at/over-limit files, malformed JSON, wrong schema,
  non-finite values, deeply nested data, retained current definition, keyboard
  and screen-reader error announcement, and representative parse timing.

## 2. Verify capability enforcement at every durable boundary

- Severity: medium
- Confidence: requires verification; no confirmed bypass
- Evidence: `CabinetryStudio.tsx` uses the client-provided `accessLevel` to
  choose Guided versus Detailed UI and reveal Pro fabrication/export controls.
  `CabinetryStudioOverlay.tsx` passes the capability resolved by the design-page
  integration. Client UI gating is not authorization.
- Affected files: `components/editor/design-page/CabinetryStudioOverlay.tsx`,
  `features/cabinetry/components/CabinetryStudio.tsx`,
  `features/cabinetry/useDesignPageCabinetry.ts`, and any server route later used
  for durable cabinetry mutation, privileged export, ordering, or collaboration
- User impact: current Studio exports are generated locally, but a future or
  existing server boundary that trusts the client flag could expose a paid or
  privileged operation.
- Recommended batch: server-authorization inventory and negative-test pass. Map
  every callback to its durable/API owner and enforce identity, ownership, and
  plan capability on the server wherever privilege is material.
- Tests required: signed-out, Free, Pro, wrong-owner, expired-session, forged
  client capability, direct-route invocation, and permitted-owner success.

## 3. Version and deeply validate saved Cabinetry templates

- Severity: medium
- Confidence: confirmed reliability and trust-boundary gap
- Evidence: `CabinetStudioLocalStorage.ts` reads
  `interior-ai:millwork-custom-templates:v1` as a legacy bare array and accepts a
  template after shallow checks including only the presence of a module array.
  Invalid JSON returns an empty list without preserving a recovery path.
- Affected files: `features/cabinetry/storage/CabinetStudioLocalStorage.ts`,
  `features/cabinetry/components/CabinetryStudio.tsx`
- User impact: corrupt or hand-edited browser data can make templates disappear
  silently or pass malformed nested definition data into later processing.
- Recommended batch: persistence/schema migration. Preserve the old key as a
  readable version, add a versioned envelope and complete runtime validation,
  quarantine invalid raw data, and offer explicit recovery/export.
- Tests required: valid legacy fixture, valid new fixture, migration idempotence,
  every invalid nested definition family, duplicate IDs, non-finite values,
  oversized data, quarantine/export, no automatic overwrite, and last-valid
  fallback.

## 4. Replace silent project-backup discard with explicit recovery

- Severity: high
- Confidence: confirmed known reliability defect
- Evidence: `lib/useDesignPageLocalBackupHydration.ts` catches normalization or
  parse failures with `// Ignore invalid saved data.` and then marks hydration
  complete. The next autosave lifecycle can proceed without quarantining or
  exposing the invalid raw backup.
- Affected files: `lib/useDesignPageLocalBackupHydration.ts`,
  `lib/useDesignPagePersistence.ts`, `lib/design-page-local-backup.ts`
- User impact: a recoverable local project may become invisible and may later be
  overwritten without an explanation or raw-data escape hatch.
- Recommended batch: dedicated persistence and recovery architecture, separate
  from Cabinetry Studio decomposition. Quarantine the raw value, retain last
  known valid data, block destructive autosave until the user decides, provide
  notification/retry/raw export/last-valid/clean-copy actions, and record only
  privacy-safe diagnostics.
- Tests required: corrupt JSON, unsupported version, partially corrupt project,
  last-known-valid recovery, quarantine retention, reload loops, autosave
  blocking, explicit clean-copy confirmation, raw export, privacy-safe logging,
  and Consumer/Pro browser flows.

## Preserved external constraint

The floor-plan worker remains:

`PRESERVE CURRENT STATE — INTENT REQUIRES SEPARATE VERIFICATION`

Its enablement, deployment, correctness, and replacement behavior require a
separate investigation and are not part of any item above.
