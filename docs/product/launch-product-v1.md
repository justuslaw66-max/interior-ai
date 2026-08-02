# Interior AI launch product v1

Status: Phase 12 product definition
Baseline: `cabinetry-baseline-rc.5` at `fff22f828681d3cd860ae7d7452300bc177d72c4`
Decision date: 2026-07-22
Implementation authority: none; Phase 13 begins only after separate authorization

## Product principle

Simplicity first, power underneath. The launch experience must let an ordinary
homeowner finish a useful room plan without understanding CAD, fabrication, or
renderer terminology. Professional capability extends the same document,
commands, scene, and persistence model; it does not create a second product.

## Primary launch user

The primary launch user is a homeowner or consumer furnishing a real room.

They have approximate or measured room dimensions, want confidence that real
products fit together, and need a result they can save, revisit, share, and use
while purchasing. They are an occasional user, not a trained designer, and
should not need developer guidance or professional vocabulary.

The first launch use case is one furnished consumer room. Living rooms are the
reference vertical slice because the existing first-run checklist, templates,
catalog coverage, and test fixtures are strongest there. The document and
editor may preserve additional rooms, but whole-home creation is not required
to complete the first-use promise.

Professional designers are secondary users and early expert testers. Pro Mode
progressively reveals precise and technical controls while retaining the same
saved design and visible result. Professional or fabricator acceptance cannot
substitute for consumer usability acceptance, and vice versa.

### Evidence supporting this choice

- The public beta start panel already offers consumer-language paths: choose a
  template, draw a measured room, upload a plan, or request an AI proposal.
- The first-run checklist is organized around furnishing a living room with a
  sofa, rug, coffee table, and reading corner.
- Consumer Mode supports basic catalog placement and simple plan controls;
  advanced controls are capability-gated rather than implemented as a separate
  document model.
- Phase 11 passed HTTPS flows for room creation, real catalog search and
  variants, placement, transforms, persistence, recovery, sharing, shopping
  output, and representative rooms.
- The same certified commit passed 191 local production-server tests and 42
  distinct HTTPS staging tests with no failures or skips.

### Evidence that still challenges this choice

- No authorized first-time-user observation has been completed for this
  candidate; all 48 required human evidence rows remain `not_run`.
- The present onboarding language and fixtures emphasize living rooms, so
  equal usability for other room types is unproven.
- Screen-reader, real keyboard, touch-device, zoom, reduced-memory-device, and
  cognitive-usability evidence is incomplete.
- Live checkout was deliberately disabled for the staging candidate; purchase
  completion has not been certified against a sandbox or live merchant.
- The full editor exposes broad professional and whole-home capability. Phase
  13 must prevent that breadth from dominating the first-use path.

## Launch promise

> Design your real room with real products, see what fits, and leave with a
> saved, shareable, purchasable plan.

“Real room” means dimensions and openings are represented in a consistent
unit-aware design document. “Real products” means current catalog identity,
dimensions, variants, and commerce details are used when available. “See what
fits” is planning guidance, not structural, code, delivery, or installation
certification. “Purchasable plan” means the shopping summary resolves current
purchase options and can continue through an approved merchant or affiliate
path; it does not promise that every item can be bought in one transaction.

Custom millwork can appear as a planned, estimated object but remains excluded
from ordinary cart and checkout. Its estimate is not a supplier quote or
purchase order.

## Launch scope

A launch-complete consumer can:

1. Start a project from a simple choice rather than a blank expert workspace.
2. Choose a template or draw one measured room in 2D.
3. Set room dimensions and display units without changing canonical geometry.
4. Add, inspect, and remove supported doors and windows.
5. Search and filter the current catalog and inspect a product and variant.
6. Place at least three products in the room.
7. Move, rotate, resize where supported, duplicate, and delete an item.
8. Understand when snapping is active and where an item will land.
9. Undo and redo reversible room and item changes.
10. Switch between consistent 2D and 3D representations.
11. Receive visible local and authenticated cloud save status.
12. Close and reopen an authenticated project without identity or transform
    loss.
13. Recover or safely escape from an invalid local backup.
14. Create a read-only share link.
15. Review a consolidated shopping list with current purchase readiness.
16. Continue an eligible item through an approved purchase path.

AI layout, floor-plan upload, multi-room planning, advanced surfaces, and
Guided custom millwork may remain available, but none is required to satisfy
the launch promise. A failure in an optional path must not block the core
template-or-draw path.

## Consumer and Pro capability boundaries

| Capability | Consumer launch | Pro Mode | Release boundary |
| --- | --- | --- | --- |
| Start, template, measured room | Guided and prominent | Available | Consumer path is the default |
| Room dimensions and units | Plain-language controls | Same model plus precise controls | Canonical stored units stay unchanged |
| Doors and windows | Supported basic placement/edit/delete | Same plus technical plan controls | Unsupported geometry is explained |
| Catalog and variants | Search, filter, compare, inspect | Same | Current commerce data is never replaced by stale snapshots |
| Product transforms | Move, guided rotation, resize where valid, duplicate, delete | Advanced transform controls | One command/history model |
| Snapping | On by default with visible feedback | Configurable | No silent geometry change |
| Undo and redo | Always reachable and named | Same plus denser shortcuts | Same command stack |
| 2D and 3D | Simple Plan/Room switch | Advanced view and export controls | Same stable object IDs and transforms |
| Save and recovery | Local safety plus cloud save when signed in | Same | Failure and conflict remain visible |
| Share and shopping list | Read-only share and consolidated list | Same plus export options | Ownership is enforced server-side |
| Purchase | Eligible current merchant/affiliate options | Same | Custom millwork and invalid variants are excluded |
| Custom millwork | Guided templates and preliminary estimate | Detailed construction and outputs | Same cabinet definition; Pro controls hidden in Consumer |
| CAD, technical layers, multi-view export | Guarded with explanation | Capability-gated | Client visibility is not authorization |
| Fabrication, approval, CNC, RFQ packages | Not shown | Available to qualified Pro workflows | Human fabricator review remains mandatory |

The capability map controls presentation, not authorization. Every protected
API must derive identity, ownership, plan, and limits from the server-side
session.

## Explicit non-goals

The first launch does not promise:

- full BIM or construction-grade coordination;
- complete AutoCAD import or export compatibility;
- real-time multi-user editing or automatic multi-tab merging;
- advanced construction documents for consumers;
- a plugin marketplace;
- full multi-storey architectural modeling;
- fully autonomous AI design or unreviewed AI application;
- continuous photoreal cloud rendering;
- a large unnormalized retailer marketplace;
- one-cart checkout for every retailer or custom item;
- live supplier pricing for custom millwork;
- structural, building-code, accessibility-code, delivery, or installation
  approval;
- feature parity between Consumer and Pro presentation;
- new supplier or production-data integrations during the launch slice.

## Capability readiness summary

| Outcome | Current automated evidence | Human or product gap | Phase 13 priority |
| --- | --- | --- | --- |
| Room setup | Blank-grid, templates, dimensions, mobile plan | First-time and real-device clarity | P0 / Batch 1 |
| Placement and transforms | Catalog, rotation, wall snap, duplicate/history, remove | Touch and discoverability | P0 / Batch 2 |
| 2D/3D continuity | Stable cabinetry identity/transform; plan projection | Subjective visual comparison | P0 / Batch 3 |
| Save and reopen | Authenticated HTTPS save/reopen with stable IDs | Multi-device and conflict comprehension | P0 / Batch 4 |
| Backup recovery | Quarantine and last-known-valid browser tests | Wording and confidence | P0 / Batch 4 |
| Share and shopping | Read-only share, export, variant identity | External-recipient and commerce review | P0 / Batch 5 |
| Purchase continuation | Invalid identity fails closed; source paths exist | Sandbox transaction decision and evidence | P0 release decision |
| Consumer accessibility | Static and selected keyboard automation | Screen reader, zoom, touch, cognition | P0 evidence |
| Pro compatibility | Full 20-test deployed Cabinetry suite | Designer/fabricator acceptance | P0 evidence, not consumer UI scope |

## Launch success measures

The following are acceptance targets, not claims about current users:

- A first-time participant can start, create or select a measured room, place
  three real products, adjust one product, switch views, save, and share without
  coaching or professional terminology.
- Every golden-path step has a visible success or recoverable failure state;
  no blocked action is reported as successful.
- A saved and reopened project retains room and object identities, dimensions,
  variants, transforms, and view consistency.
- The shopping list identifies purchasable, affiliate-only, unavailable, and
  custom-quote items without presenting stale commerce as current.
- The launch funnel can measure editor open, project start, room readiness,
  first and third product placement, first valid layout, save, share, shopping
  list open, and purchase continuation without recording private room content.
- Performance remains within the Phase 8 regression ceilings: 6 seconds to
  interactive, 3 seconds for 3D-to-2D, 2.5 seconds for local autosave, 250 ms
  frame p95, 150 MB project heap, and 2 MB retained after close on the reference
  harness. These ceilings are regression guards, not general device promises.

## Phase 13 implementation priority

Phase 13 should follow the authorized batch order and avoid unrelated cleanup:

1. **Batch 1 — Room setup:** make template-or-draw the unmistakable consumer
   default; validate dimensions, units, openings, states, and funnel events.
2. **Batch 2 — Placement and transforms:** make finding, placing, moving,
   rotating, resizing, duplicating, deleting, snapping, undo, and redo coherent.
3. **Batch 3 — 2D and 3D continuity:** verify consistent identity, transforms,
   selection, and understandable view transitions.
4. **Batch 4 — Save, autosave, and recovery:** clarify local/cloud state,
   conflict, close/reopen, invalid backup, and last-known-valid recovery.
5. **Batch 5 — Sharing and shopping summary:** finish the read-only recipient
   path, commerce classification, and the approved purchase continuation.

Each batch must preserve v1/v2/v3 document migration, stable IDs, Consumer and
Pro behavior, undo/redo semantics, 2D/3D parity, and the certified baseline's
security and performance constraints.

## Evidence references

- `components/editor/design-page/BetaStartPanel.tsx`
- `components/OnboardingChecklist.tsx`
- `docs/architecture/editor-capability-accessibility.md`
- `docs/architecture/design-document-contract.md`
- `docs/architecture/phase8-performance-baseline-and-budgets.md`
- `docs/architecture/cabinetry-phase10-final-report.md`
- `docs/qa/cabinetry-studio-mvp.md`
- Phase 11 certification for RC5, including the 191-test Gate A3 result and
  42-test HTTPS staging result
