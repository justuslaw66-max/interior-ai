# Public design projection and fingerprint contract

## Scope and owners

`lib/shared-design-snapshot.ts` is the canonical production projector for the
design snapshot allowed across a share-token boundary;
`lib/shared-design-projection-schema.ts` owns its closed structural and
sensitive-name contract. The non-owner branch of
`app/api/designs/[id]/route.ts`, the public share and export routes, and
`app/api/share/[shareToken]/duplicate/route.ts` all use that projection. The
owner branch of the design API deliberately returns the owner document.

`projectSharedDesignTransport` is the canonical adapter for legacy and v3
database rows. It derives the public API envelope and share-recipient copy from
one projected snapshot, so divergent legacy columns cannot bypass that
snapshot. The projector fails closed on undeclared document, room, item, zone,
saved-view, layout-version, and floor-plan fields, and recursively rejects
sensitive key names in nested typed values. Both the deny keys and candidate
keys are normalized before comparison. The only owner-name exception is a
declared item path whose value is one of the typed public cabinetry
responsibility roles.

`tests/e2e/public-projection-assertion.ts` is certification-only. It validates
the exact public API envelope, canonicalizes both inputs to stored design schema
revision 1, applies the production public projection, rejects undeclared or
sensitive fields, sorts stable room/item/zone/view identities, and then
delegates object-key and noisy-timestamp normalization to
`fingerprintDesignSnapshot`. It is evidence of content parity, not an
authorization or share-token decision.

Client preview is separate. It suppresses owner editing chrome and actions
without changing the owner design document. `/share/[shareToken]`, its export
routes, and the share-token design API consume the public projection. Client
preview must not be substituted for the public-share contract.

## Access and identity path

| Read | Authorization | Snapshot | Identity evidence |
| --- | --- | --- | --- |
| Owner `GET /api/designs/:id` | Authenticated matching `userId` | Owner stored document | `id`, `updatedAt`; owner-only `shareToken`/`shareEnabled` metadata |
| Public `GET /api/designs/:id?shareToken=...` | Exact enabled token for that design | `projectSharedDesignTransport`; envelope fields derive from that projected snapshot | Requested design `id`, current `updatedAt`, `shareEnabled: true`; bearer token is returned as `null` |
| `/share/:shareToken` and exports | Exact enabled token selected server-side | `projectSharedDesignTransport`; presentation and export values read from its projected snapshot | Selected design row and token route |
| `POST /api/share/:shareToken/duplicate` | Authenticated recipient plus exact enabled source token | `projectSharedDesignTransport`; copied envelope and snapshot derive from the projection | New design ID; sharing disabled and token cleared on the copy |

The share token identifies the current live design revision; the design model
does not expose a separate immutable publication-revision parameter. The public
API's `updatedAt` is therefore the revision identity used by this assertion.
Wrong tokens and disabled shares remain 404. A different design ID or stale
`updatedAt` cannot be treated as the same current projection identity, although
a copied design may separately prove equal public *content* under its new ID and
revision.

## Compared representation inventory

The public API envelope is closed for the RC54 assertion. Its exact fields are
`id`, `title`, `roomWidth`, `roomDepth`, `items`, `snapshot`, `zones`,
`savedViews`, `style`, `budget`, `mode`, `notes`, `updatedAt`, `shareToken`, and
`shareEnabled`. `id` and `updatedAt` bind identity; `shareToken` must be `null`
for a public read; `snapshot` must be a valid v3 document. An omitted required
field or any unexpected envelope field fails the assertion instead of being
picked away.

The beta fixture's compared v3 snapshot contains these exact field families:

- document contract: `version`, `schemaRevision`, `units`,
  `coordinateSystem`, `rooms`, and `activeRoomId`;
- shared design presentation: `title`, `style`, `budget`, `lighting`,
  `lightingPreset`, and deliberately public `notes`;
- room identity and structure: `id`, `name`, `roomType`, `floorLevel`,
  `floorLabel`, `geometry`, `planPosition`, `planShape`, `surfaces`,
  `surfaceFinishes`, `surfaceOpacity`, and `ceilingVisible`;
- room content: `items`, `zones`, `savedViews`, and `layoutVersions`;
- beta item identity and transform: `instanceId`, `productId`, `variantId`,
  `position`, `rotationY`, and `includeInCheckout`;
- floor-plan content: `openings` with stable room/wall identity and dimensions.

Production has an explicit closed key-name contract for current `DesignItem`
fields plus the known legacy `type`/`x`/`y`/`z`/`width`/`depth`/`height` shape,
legacy zone `name`, and legacy saved-view `mode`. The focused fixture directly
proves `productSnapshot` identity/dimensions, selected variant, XZ position,
rotation, `rotationDeg`, material and surface identity, views, zones, and
multi-room content. Other declared optional cabinetry and commerce fields are
covered by the production field-name boundary but are not claimed as
individual value-parity cases in this remediation. The current model has no
per-item draft/publication flag; the live shared snapshot is the publication
unit, and this remediation does not invent a second item lifecycle.

For a historical row with no v3 snapshot, the transport adapter preserves the
declared legacy item/zone/view fields while adding deterministic required v3
identity, transform, zone type, and camera defaults. The result must pass the
same v3 parser and remain duplication-compatible; it is not emitted as an
invalid v3 envelope.

## Field classification

| Class | Current fields | Treatment and consumers |
| --- | --- | --- |
| A — publicly visible design content | Rooms and names; geometry, walls/openings/fixed elements; items, product/variant/dimension/material/transform identity; zones; saved views; surfaces; lighting; design title/style/budget/notes; public presentation/layout data; public canonical floor-plan geometry and source-supported options | Preserved for `ShareViewer`, plan preview, shopping/export/PDF, and share-recipient duplication. Contract tests assert meaningful literal values rather than only serializer equality. |
| B — owner-only/internal state | `floorPlan.underlay`, direct private `floorPlan.revisionId`, `sourceRevisionGeometryHash`, `surfaceMigrationReviewIssues`, `addressTransform`, `addressBinding`, `sourceJobId`, `sourceAssetSha256`, opening review evidence, private fixed-element labels/kinds, shared canonical parent lineage, owner name/email, and raw design-row `createdAt` | Explicitly omitted or replaced by the public projector. Anonymous exports use the static label `Interior AI` and do not emit owner identity or row-created metadata. Owner changes to these fields leave the public fingerprint unchanged. |
| C — derived/nondeterministic metadata | Projected saved-view/layout timestamps; shopping totals, dimensions, room health, export readiness, filenames, and catalog presentation derived from the public projection; public response `updatedAt` remains separate revision identity | The generic fingerprint omits `timestamp`, `createdAt`, and `updatedAt`. The response revision is parsed and compared separately. Static page metadata emits only the route's no-index policy and application title; it does not look up design presentation data. |
| D — security-sensitive | Raw share token; owner/user/auth/admin identity; source filename/URI/hash; private address/binding; private reviewer identity/timeline; free-form provenance/review notes; private upload data URL | Must never enter the public snapshot. Exact sentinel and sensitive-key checks fail on leakage. Authorization routes continue to own token validity, revocation, and permissions. |
| E — unknown/ambiguous | Any undeclared field at the document, room, item, zone, saved-view, layout-version, or floor-plan boundary; any nested field whose normalized name indicates owner/private/internal/auth/admin/session/token/address/hash/reviewer state | Fails in the production projector before response/copy creation and requires explicit contract review. A typed public cabinetry responsibility role is the narrow path/value exception. The certification assertion repeats the guard and rejects any unexpected API-envelope field. |

## Fingerprint rules

1. Owner input is first converted to stored schema revision 1 and then passed
   through the canonical shared projection.
2. The actual public response must already contain a valid v3 snapshot; the
   same normalization is idempotently applied for one representation version.
3. Rooms, room items, zones and their item references, saved views, layout
   versions, and layout-version items/zones are ordered by stable identity.
   Object keys are sorted by `canonicalizeDesignSnapshot`.
4. Known owner/private paths do not affect the result. Meaningful public room,
   item, variant, dimensions, XZ transform, rotation, material, surface, and
   fixed-element changes do.
5. Required data, undeclared structural fields, and sensitive nested fields
   fail before hashing. The test does not compare raw JSON, accept either
   fingerprint, or drop unmatched fields.
6. Design ID, response revision, and token authorization are asserted outside
   content equality. Equal content cannot authorize a request.

## RC54 comparison

The old smoke fetched the source anonymously, fetched the duplicate through an
authenticated owner context (despite appending the source token), fingerprinted
both with the generic design fingerprint, and compared them directly:

`ownerDuplicateFingerprint === publicSourceFingerprint`

The current smoke now performs:

`publicFingerprint(project(ownerDuplicate)) === publicFingerprint(publicSource)`

It also asserts the source design/revision identity, wrong-token 404, exact
public envelope, literal multi-room/item/material/view/opening values, and the
raw public fingerprint used by the share viewer and exports.

Classification is **E — CODE AND TEST BOTH REQUIRE CORRECTION**. The original
like-for-like defect was in the assertion, but independent review also proved
that the production projector preserved arbitrary snapshot extensions and that
the public API/duplicate path could use raw legacy envelope values beside a
projected v3 snapshot. The production correction closes the declared snapshot
shape and makes the canonical transport projection the single content source.
Publication authorization, token lifecycle, client-preview semantics, and
responsive share layout are unchanged.

The fail-closed schema is intentionally maintenance-sensitive: adding a new
public snapshot field or a legitimate nested name requires a deliberate schema
and fixture update. That is preferable to allowing an unreviewed extension to
cross the public boundary.

## ARCH-RC53 public presentation ownership

Starting at `12bc689b7db757c0f7323774d214aaa1aa8c8028`, the main share page
projected the stored snapshot but rendered `title`, `style`, `budget`, and
`notes` from the outer Prisma row. The same bypass existed in the anonymous
HTML/PDF exports, CSV/PDF filenames, native-share title, and share-duplication
analytics. Export HTML/PDF also exposed raw owner name/email and design-row
`createdAt`. Static route metadata did not read design content and was not a
leak.

The closed contract classifies the audited fields as follows:

| Field family | Classification | Source and fallback |
| --- | --- | --- |
| `title`, `style`, categorical `budget`, deliberately public `notes` | `INTENDED_PUBLIC_PROJECTED_FIELD` | Exact declared snapshot fields. Title is a non-empty string of at most 120 characters, style a non-empty string of at most 80, notes a string of at most 20,000, and budget one of `budget`/`mid`/`luxury` or the explicit legacy `$`/`$$`/`$$$` categories. A v3 snapshot's present values always win over divergent outer columns. The explicit legacy transport upgrades a no-snapshot row or fills presentation metadata absent from an older v3 row, using `Untitled Living Room`, `null`, `null`, and absent notes when the legacy values are missing. Invalid types, limits, or categories fail closed. |
| Room names/types/geometry; items and product/variant/material/transform identity; zones; saved views; layouts; lighting; floor-plan public content | `INTENDED_PUBLIC_PROJECTED_FIELD` | Declared closed snapshot fields. Malformed, sensitive, or undeclared snapshot structure fails before presentation. |
| Shopping totals, readiness, room health, measurements, filenames, catalog labels/media/commerce links, responsive mode, and static page metadata | `PUBLIC_DERIVED_METADATA` | Deterministic formatting or catalog resolution from the projected snapshot; route metadata remains generic and no-index. |
| Owner name/email, raw row `createdAt`, private import/reviewer/provenance fields, and unknown outer presentation fields | `OWNER_OR_INTERNAL_ONLY` | Never rendered or serialized anonymously. Owner plan remains an internal entitlement input for export watermark/capability policy and is not public content. |
| `id`, share token, and public response `updatedAt` | Binding/authorization metadata, not presentation content | Used only for lookup, routing, tracking validation, projection/layout binding, or revision identity under their existing contracts. |
| Known no-snapshot outer title/dimensions/items/zones/views/style/budget/notes, plus presentation fields absent from an older v3 snapshot | `LEGACY_COMPATIBILITY_ONLY` | Consumed only by `projectSharedDesignTransport`, upgraded or filled into a valid closed v3 snapshot, then read back from that snapshot. |

Before remediation, the data flow was `row -> partial snapshot projection` plus
`row presentation fields -> anonymous UI/export`. After remediation it is
`row -> projectSharedDesignTransport -> validated closed snapshot -> UI/export`
with derived presentation values downstream of that snapshot. The non-owner API
and recipient-copy path continue to use the same transport. Changing projected
title/style/budget/notes changes the public fingerprint; changing a divergent
raw/private outer field does not. Unknown outer fields are not spread into the
transport.

Client preview remains the owner document with edit controls suppressed and is
intentionally not an anonymous public projection. Its cloud-load controller now
uses the same snapshot-first constrained presentation resolver for
title/style/budget/notes: snapshot values win, and missing older-v3 values use
the same validated legacy fallback. The editor converts recognized style case
and canonical `budget`/`mid`/`luxury` categories into its existing control
labels; this is a derived owner-UI representation, not a second source. A
divergent raw owner envelope is covered by an independent client-preview
fixture. Responsive desktop, tablet, and mobile modes receive the identical
projected snapshot.

Rollback is one local revert of the focused ARCH-RC53 implementation commit,
followed by public-projection security, the 12-case Chromium/WebKit share
matrix, duplication/privacy, beta smoke, persistence, build, and Phase 8
checks. No schema, data, token, authorization, deployment, or external rollback
is required.
