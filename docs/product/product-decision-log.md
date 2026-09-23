# Product decision log

This log distinguishes Phase 12 working definitions from approvals that only
an authorized human can provide. `Defined` means implementation may be planned
against the decision after Phase 13 is authorized. It does not mean alpha,
beta, deployment, commerce, waiver, or release approval.

| ID | Decision | Status | Evidence/rationale | Human owner and deadline |
| --- | --- | --- | --- | --- |
| PD-001 | The primary launch user is a homeowner furnishing one real room. Professional designers are secondary expert testers. | Defined; product-owner ratification required | Existing public-beta start, consumer onboarding, capability policy, and Phase 11 representative consumer evidence support this focus. Human consumer evidence is still absent. | Product owner before Phase 13 Batch 1 acceptance |
| PD-002 | Launch promise: “Design your real room with real products, see what fits, and leave with a saved, shareable, purchasable plan.” | Defined; product-owner/content review required | Matches the implemented room, catalog, persistence, share, shopping, and purchase-boundary capabilities without promising architecture or fabrication approval. | Product owner and content/legal reviewer before alpha |
| PD-003 | The first reference vertical slice is one living room using template-or-draw. Upload, AI, whole-home, and advanced surfaces are optional. | Defined | Living-room onboarding and fixtures have the strongest existing coverage. This narrows completion without deleting compatible capability. | Product owner before Batch 1 scope freeze |
| PD-004 | Consumer and Pro use one document, command system, scene, renderer, and persistence contract. Pro capability is progressively exposed. | Accepted architecture constraint | Existing capability policy and RC5 tests enforce the shared-model boundary. | Architecture lead monitors every Phase 13 batch |
| PD-005 | Major new editor features, full BIM/CAD, real-time collaboration, autonomous AI, continuous cloud rendering, and marketplace expansion are launch non-goals. | Defined | They do not contribute to the narrow promise and would invalidate the certified baseline without resolving a launch blocker. | Product owner may revise only through an explicit scope decision |
| PD-006 | Live checkout stays disabled until a commerce owner chooses and certifies either a Shopify sandbox path or an affiliate-continuation launch boundary. | Open P0; disabled is the safe default | Phase 11 intentionally used inert checkout configuration. Current buy smokes permit conditional early returns and are not launch evidence. | Commerce owner and product owner before Batch 5 acceptance |
| PD-007 | Custom millwork is excluded from normal cart/checkout and presented as a preliminary estimate/quote path. | Defined release constraint | Current document/export contracts specify `includeInCheckout: false`; no live supplier quote is certified. | Product owner and commerce owner before alpha |
| PD-008 | Core candidate tests may not be skipped. The five formerly declared skips are not approved for RC5-derived candidates. | Defined release policy; product-owner ratification required | Gate A3 passed 191/191 and Phase 11 passed 42/42 with zero skips. Allowing skips would weaken established evidence. | Product owner before the next candidate freeze |
| PD-009 | Forty-eight human evidence rows require named consumer UX, QA, accessibility, performance, security/privacy, analytics, professional, and fabricator reviewers. | Open P0 | Automation cannot supply these observations or signatures. | Product owner assigns names before alpha evidence collection |
| PD-010 | The supported browser/device matrix is not yet fixed. | Open P0 | Chromium automation exists, but real screen-reader, touch, zoom, and low-powered-device evidence is missing. | Product owner, accessibility owner, and QA lead before alpha |
| PD-011 | Production promotion topology and exact-artifact comparison procedure are not yet approved. | Open P0 | Vercel cannot promote one deployment object across projects; re-upload creates a new deployment/runtime configuration. | Release engineering lead and product owner before any production authorization |
| PD-012 | Release policy must decide whether 191 same-commit local tests plus 42 HTTPS tests are sufficient or whether more specs must become production-safe and remote. | Open P0 | QA-only markers and localhost assumptions prevent the entire suite from running unchanged on protected staging. | QA lead and product owner before beta candidate freeze |
| PD-013 | Phase 8 performance ceilings remain regression guards; real-device product targets require separate evidence. | Defined | Existing measurements use one reference machine and exclude several device/network/GPU dimensions. | Performance owner defines supported-device targets before beta |
| PD-014 | Phase 13 priority is Batch 1 room setup; Batch 2 placement/transforms; Batch 3 2D/3D; Batch 4 save/recovery; Batch 5 share/shopping/purchase boundary. | Defined | This order follows the dependency of the consumer golden path and the authorized program. | Product owner approves each batch separately |
| PD-015 | The broad floor-plan PDF NFT trace is not a Phase 12 feature task, but it must be narrowed or explicitly accepted before production launch. | Open P1 | RC5 audit found it secret-safe but dependent on 3,821 traced source inputs. | Release engineering lead before production candidate |
| PD-016 | Product-owner approval uses the trusted Ed25519 procedure; Codex never creates, stores, requests, or uses the private signing key. | Mandatory governance constraint | Required by the release-evidence contract and global program rules. | Product owner/signing custodian at beta and launch gates |

## Decision-change rule

A change to PD-001 through PD-008 or PD-014 after Phase 13 implementation begins
must identify affected golden-path steps, tests, telemetry, data contracts, and
candidate validity. A decision that changes source, build inputs, or required
evidence requires a new immutable release candidate.

## Immediate decisions before Phase 13 Batch 1 acceptance

1. Ratify or revise PD-001, PD-002, and PD-003.
2. Assign the product owner and consumer UX reviewer by name.
3. Confirm the initial supported desktop and mobile/touch targets.
4. Confirm that optional upload and AI failures cannot block template-or-draw.

## Decisions that may wait until later Phase 13 batches

- Batch 2: exact resize support by product type and snap discoverability target.
- Batch 3: supported renderer fallback/lite-mode policy.
- Batch 4: multi-tab conflict wording and offline/cloud status language.
- Batch 5: Shopify sandbox versus affiliate boundary, commerce catalog slice,
  and shopping-list export expectations.
