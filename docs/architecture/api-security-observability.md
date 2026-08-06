# API security, error, and observability boundaries

Phase 7 establishes the application boundary rules for designs, shared access,
imports, AI providers, exports, and commerce. These rules apply to new routes and
to future changes to the editor.

## Trust boundaries

- Browser payloads, persisted browser data, uploaded files, share tokens,
  provider responses, catalog feeds, URLs, filenames, and metadata are untrusted.
- Route handlers enforce byte limits before parsing, then validate structure,
  counts, string lengths, numeric finiteness, and supported formats.
- Provider data is normalized into a small transport contract before it reaches
  domain code. The design editor uses `lib/design-api-client.ts`; it does not
  interpret arbitrary response bodies.
- GET requests may retry once for network or server failures. Mutations are not
  automatically retried. Reads are abortable, and editor epochs prevent an older
  response from replacing a newer document.

## Authorization matrix

| Capability | Server requirement | Failure behavior |
| --- | --- | --- |
| List/create designs | Authenticated user; server-selected `userId` | 401 or bounded plan-limit error |
| Read private design | Owner ID in the session | 404 for missing or non-owned IDs |
| Update/delete design | Owner-scoped database predicate | 404 for missing or non-owned IDs |
| Read shared design/export | Enabled share token matching the design | 404 for invalid or disabled token |
| Create/disable share link | Authenticated owner | 404 for missing or non-owned IDs |
| Admin model optimization | Admin email on the server | 404 for non-admin callers |
| PDF presentation export | Authenticated user; tier resolved from the database | 401/429 or bounded validation error |
| AI cache | Authenticated owner of the referenced design | Unowned/unsaved input is not cached |
| Stripe entitlement | Provider-verified webhook | Client return pages never grant entitlement |
| Shopify order/revenue | Future provider-verified webhook | Browser return records only an unverified return |

Object existence is not disclosed to non-owners. User IDs, plans, totals,
prices, ownership, and entitlements are selected or recomputed on the server.

## Commerce integrity

- Scene product identity and a presentation snapshot may be persisted. Live
  stock and price remain provider/catalog data and are checked at checkout.
- Shopify lines must resolve to a live catalog variant and its exact server-side
  merchandise ID. Quantity, provider response, availability, price presence,
  and checkout URL are validated before returning a checkout link.
- Client totals, currency values, and return-page parameters never create an
  order or revenue event. Shopify/Stripe provider verification is authoritative.
- Provider and analytics failures cannot mutate or remove the design document.

## Error contract and recovery

API boundary errors include a stable category, a safe user-facing message, and
an operation ID. Unexpected errors return a generic message; stack traces,
provider response bodies, configuration values, and database errors are not
returned to the browser. Expected validation, authentication, not-found,
conflict, rate-limit, payload-size, and timeout failures are distinguished.

The editor preserves local backup data while cloud saves fail, displays a failed
save state, and offers retry. Revision conflicts are explicit. Global and canvas
error boundaries retain the last valid saved document and offer retry/reload
actions without exposing raw error messages.

## Privacy-safe observability

Operational logs use an operation name, random operation ID, outcome, duration,
status, error category, and bounded metadata. Metadata keys associated with
tokens, cookies, credentials, authorization, cards, or payment data are redacted.
Analytics is best-effort and cannot interrupt editing, saving, sharing, or
checkout creation.

Raw share tokens are never sent to PostHog and are never copied to `AppEvent`.
When correlation is required, the server stores a one-way 16-character SHA-256
reference. Provider cart/order references are represented only by presence flags
outside their authoritative provider records.

## App-event authority and provenance

`AppEvent` has four explicit authority classes. Browser-authorized analytics
describe interaction, intent, views, and requests; they never prove a payment,
cancellation, webhook outcome, or lifecycle transition. Trusted lifecycle
events require a server-only emitter, an approved producer, its exact
verification method, provenance version, and durable external event identity.
Internal diagnostics are separate from both classes. Rows predating this
contract, or missing/malformed provenance, are `UNTRUSTED_OR_LEGACY` and remain
excluded from authoritative operations.

The public app-event route accepts only
`BROWSER_AUTHORIZED_ANALYTICS_EVENT_TYPES`. Authentication, Pro entitlement,
or administrator role never promotes a request to trusted. Reserved provenance
keys are rejected, and browser metadata cannot populate server-owned authority
columns, including external event identity. The historical `checkout_completed`
name remains public-denied and legacy-only because it has no approved producer.
The current trusted producer is a Stripe webhook only after signature
verification. Invalid signatures create no trusted failure evidence; verified
processing failures use the verified event identity and deterministic retry
deduplication. Admin webhook health requires the complete trusted provenance
contract, including a valid Stripe event ID; a database check constraint rejects
malformed trusted rows. Customer-interaction metrics are explicitly labelled
non-authoritative. The full vocabulary and producer/consumer matrix is in
`docs/security/CH-0004_TRUSTED_EVENT_PROVENANCE.md`.

## Secrets and retention

- Secrets stay in server environment variables. Only deliberately public keys
  may use `NEXT_PUBLIC_` variables.
- Logs and application events must not contain API keys, authorization headers,
  cookies, passwords, private keys, card data, raw share tokens, private design
  content, filenames supplied by customers, or provider response bodies.
- `AppEvent` metadata is bounded and sanitized at write time. Product analytics
  is aggregate operational evidence, not a repository for customer content.
- Private floor-plan source retention and deletion remain governed by the
  existing floor-plan retention job and outbox policy. Design local backups stay
  in the user's browser until replaced or explicitly cleared. Guest server
  designs are capped per anonymous UUID and should be included in the scheduled
  data-retention cleanup policy before production launch.
- Payment-card data is handled only by Stripe or Shopify hosted surfaces; the
  application does not collect or persist card numbers, CVCs, or payment tokens.

## Verification

`npm run test:phase7-security-boundaries` checks request limits, telemetry
redaction, app-event authority/provenance, browser identity denial, trusted
producer context, admin trusted-only filters, client/server import direction,
AI input/output contracts, design/import limits, owner-scoped source guards,
commerce return semantics, share-token handling, and cabinetry import preflight.
This source remains owned exactly once by merge-required
`ci.critical-domain-contracts`. `tests/e2e/03-persistence.spec.ts` forces a cloud-save failure and
verifies that the failed state remains visible, its Retry control is reachable,
and the queued write returns to a cloud-saved state. Production build and the
existing persistence/cabinetry suites remain the release gate.
