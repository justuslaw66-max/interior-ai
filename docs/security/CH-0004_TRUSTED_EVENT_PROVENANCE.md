# CH-0004 trusted event provenance

Status: implementation record for the bounded pre-candidate CH-0004 remediation.
Starting source: `2e1df7ed7cefb5df2560fca70f77ef8785f37c8f` (tree
`394d4444d46ca8c1ce95ae3f0113197c015fd813`).

## Original authority defect

`POST /api/track/app-event` accepted the complete `APP_EVENT_TYPES` union for
anonymous and authenticated callers. That union included checkout completion,
subscription cancellation, and webhook failure. Authentication, plan, or admin
role did not add provider authority, but the admin operations read model counted
same-named records as operational evidence. `AppEvent` had no durable authority,
producer, verification, or provenance-version fields, so a record's name and
client-controlled metadata were the only apparent origin evidence.

The inventory below was completed before production code changes. No scheduled
or background `AppEvent` producer exists at the starting source. PostHog product
telemetry, `ConversionEvent`, and floor-plan revision audit events use separate
stores and are outside this contract.

## Starting event matrix

All starting records persist `id`, `eventType`, optional `userId` and `designId`,
`shareToken=null`, sanitized `meta`, and `createdAt`. Except where noted, the
single `logAppEvent` adapter performs the write. None has durable provenance;
provider/source/verified strings in `meta` are not authority evidence. Every
pre-contract row therefore has the legacy behavior **retain but exclude from
authoritative lifecycle evidence**.

| Event type | Meaning | Current producer / ingestion | Anonymous browser | Authenticated browser (ordinary/Pro/admin) | Intended class / server-only | Current verification | Operationally authoritative | Admin/release or other consumer | Current provenance evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `landing_viewed` | Editor landing observed | Design-page lifecycle -> public route | Allowed | Allowed | Browser analytics / no | Optional share or owned-design lookup | No | Revenue-smoke fixture | Session/user plus client metadata only |
| `design_started` | First editor interaction | Design-page controller -> public route | Allowed | Allowed | Browser analytics / no | Optional share or owned-design lookup | No | Revenue-smoke fixture | Session/user plus client metadata only |
| `first_item_added` | First catalog item added | Onboarding -> public route | Allowed | Allowed | Browser analytics / no | Optional share or owned-design lookup | No | Revenue-smoke fixture | Session/user plus client metadata only |
| `third_item_added` | Third item added | Onboarding -> public route | Allowed | Allowed | Browser analytics / no | Optional share or owned-design lookup | No | Revenue-smoke fixture | Session/user plus client metadata only |
| `first_run_activation_step_completed` | Browser-observed activation step | Onboarding -> public route | Allowed | Allowed | Browser analytics / no | Optional share or owned-design lookup | No | Beta-staging checklist | Session/user plus client metadata only |
| `export_clicked` | Export intent | Design-page export -> public route | Allowed | Allowed | Browser analytics / no | Optional share or owned-design lookup | No | Revenue-smoke fixture | Session/user plus client metadata only |
| `upgrade_clicked` | Upgrade CTA interaction | Billing controller -> public route | Allowed | Allowed | Browser analytics / no | Optional owned-design lookup | No | Paywall metrics/tests | Session/user plus client metadata only |
| `share_link_created` | Share creation interaction | Authenticated design-share route -> adapter | Forgeable | Forgeable | Browser-authorized analytics / no | Server route verifies owner for its own emission; public route does not prove creation | No | Admin non-authoritative activity | Server call site or client session, not durable |
| `share_link_opened` | Shared page viewed | Share page -> public route | Allowed | Allowed | Browser analytics / no | Valid enabled share token resolves a design | No | Admin non-authoritative activity | Hashed share reference and client metadata only |
| `design_duplicated` | Owned/floor-plan design duplication | Authenticated server routes -> adapter | Forgeable | Forgeable | Browser-authorized analytics / no | Server call sites verify operation; public route only resolves optional design | No | No authoritative consumer | Server call site or client session, not durable |
| `share_design_duplicated` | Shared design duplicated | Authenticated shared-duplicate route -> adapter | Forgeable | Forgeable | Browser-authorized analytics / no | Server route verifies share/user for its own emission | No | No authoritative consumer | Server call site or client session, not durable |
| `export_opened` | Shared export page viewed | Export page -> public route | Allowed | Allowed | Browser analytics / no | Valid enabled share token resolves a design | No | Admin non-authoritative activity | Hashed share reference and client metadata only |
| `export_printed` | Browser print interaction | No current producer | Allowed | Allowed | Browser analytics / no | None | No | Admin non-authoritative activity | Client metadata only if forged |
| `export_pdf_clicked` | PDF export interaction | PDF button -> public route | Allowed | Allowed | Browser analytics / no | Optional share or owned-design lookup | No | Monetization analytics | Session/user plus client metadata only |
| `export_upgrade_prompt_shown` | Export paywall shown | PDF button -> public route | Allowed | Allowed | Browser analytics / no | Optional share or owned-design lookup | No | Monetization analytics | Session/user plus client metadata only |
| `checkout_started` | Checkout intent/session creation | Design/PDF clients -> public route; Stripe/Shopify routes -> adapter | Allowed | Allowed | Browser-authorized analytics / no | Server producers create provider sessions; public submission remains intent only | No | Admin non-authoritative activity; revenue fixture | Server call site or client metadata, not durable |
| `checkout_return_observed` | Browser returned from hosted checkout | Checkout success client -> public route and Shopify confirm route | Allowed | Allowed | Browser analytics / no | Explicitly not order verified | No | Phase 7 source guard | Presence flag only |
| `upgrade_checkout_started` | Pro checkout CTA interaction | PDF button -> public route | Allowed | Allowed | Browser analytics / no | Optional share or owned-design lookup | No | Monetization analytics | Session/user plus client metadata only |
| `billing_portal_opened` | Billing portal session requested | Authenticated Stripe portal route -> adapter | Forgeable | Forgeable | Browser-authorized analytics / no | Server route verifies the user for its own emission | No | Monetization analytics | Server call site or client session, not durable |
| `beta_feedback_submitted` | User feedback report | Feedback widget -> public route | Allowed | Allowed | Browser analytics / no | Size, metadata sanitization, optional design/share lookup | No | Beta evidence uses returned record ID, not lifecycle truth | Session/user plus client metadata only |
| `checkout_completed` | Provider-confirmed commerce completion | No production producer; release-only revenue fixture seeds it directly | Allowed | Allowed | Trusted lifecycle / yes | None | Intended yes, currently unverifiable | Release-only revenue fixture | Event name only |
| `upgrade_checkout_completed` | Stripe-confirmed Pro activation | Verified webhook adapter and two billing-success browser components | Allowed | Allowed | Trusted lifecycle / yes | Webhook path verifies a signature; browser paths only observe UI/account state | Intended yes | Monetization analytics | Event name and spoofable metadata; origin not durable |
| `subscription_canceled` | Stripe-confirmed managed subscription deactivation | Verified webhook -> adapter | Allowed | Allowed | Trusted lifecycle / yes | Webhook signature before handler | Intended yes | Monetization analytics | Event name and metadata only |
| `webhook_failed` | Verified webhook processing failure | Invalid-signature catch and verified handler catch -> adapter | Allowed | Allowed | Trusted lifecycle / yes | Invalid-signature path has none; handler path has verified Stripe event | Yes in admin health | Admin operational health/recent failures | Event name and metadata only |
| `stripe_webhook_processed` | Idempotency claim for a verified Stripe event | Webhook transaction writes `AppEvent` directly | Not in public union | Not in public union | Trusted lifecycle / yes | Stripe signature; unique `stripe:<event-id>` record ID | Yes for processing/idempotency | Local Stripe lifecycle test cleanup | Record-ID convention and metadata only |
| `checkout_variant_validation_failed` | Server checkout validation diagnostic | Shopify checkout route -> adapter | Allowed | Allowed | Internal diagnostic / yes | Server/catalog validation result | No lifecycle authority | No current consumer | Server call site or forgeable client metadata |
| `variant_resolution_issue` | Catalog variant diagnostic | No `AppEvent` producer; separate PostHog browser event exists | Allowed | Allowed | Internal diagnostic / yes | None | No | No `AppEvent` consumer | Client metadata only if forged |

## Final authority vocabulary and producer graph

The remediation uses four explicit authority classes:

- `BROWSER_AUTHORIZED_ANALYTICS`: the non-authoritative interaction events
  above plus `checkout_success_viewed`, which replaces browser emission of
  `upgrade_checkout_completed` on the billing success screen.
- `TRUSTED_SERVER_LIFECYCLE`: `upgrade_checkout_completed`,
  `subscription_canceled`, `webhook_failed`, and `stripe_webhook_processed`.
- `INTERNAL_DIAGNOSTIC`: `checkout_variant_validation_failed` and
  `variant_resolution_issue`.
- `UNTRUSTED_OR_LEGACY`: every pre-contract, missing, malformed, imported, or
  otherwise unverifiable record.

The historical `checkout_completed` name is reserved and denied publicly, but
is not emit-capable under the trusted union because no approved authoritative
producer exists. Existing and fixture records with that name remain
`UNTRUSTED_OR_LEGACY`.

The public producer is `PUBLIC_BROWSER_INGESTION`. Server-side
non-authoritative interaction recording uses `SERVER_APPLICATION`. Internal
diagnostics use `SERVER_APPLICATION`. The only approved trusted producer in the
current graph is `VERIFIED_STRIPE_WEBHOOK`, verified by `STRIPE_SIGNATURE` and
bound to the verified external Stripe event identity. There is no approved
producer yet for generic Shopify `checkout_completed`; its name remains
reserved and public ingestion fails closed.

## Durable provenance and legacy policy

The narrow forward-only schema contract adds server-owned `authority`,
`producer`, `verificationMethod`, `provenanceVersion`, and `externalEventId`
fields. Browser metadata remains in `meta` and cannot populate these columns.
Current records use provenance version `1`. Existing rows receive only the
`UNTRUSTED_OR_LEGACY` default; no event-name, role, user, route, header, IP, or
metadata backfill is permitted.

Authoritative queries require the complete current trusted contract, not the
event name alone: trusted lifecycle authority, an approved trusted producer,
the matching verification method, current provenance version, and a valid
Stripe `evt_...` external identity and one of the four emit-capable lifecycle
names. A null-safe database check constraint enforces the same exact trusted-row
contract, so missing fields, reserved/unknown names, and malformed combinations
cannot be stored.
Browser analytics shown to administrators remain separate and explicitly
non-authoritative.

## Rollback

Application rollback is one focused commit revert. Because the migration is
forward-only, a deployed database rollback is a reviewed forward correction or
database restore; migration history must not be rewritten. The added nullable
provenance columns and legacy default are safe to leave in place during an
application rollback. No historical records are deleted or promoted.
