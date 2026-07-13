# Custom Millwork Studio release readiness — 2026-07-10

## Decision

**Engineering implementation: regression-ready. Production UX release: not yet signed off.**

The implementation and automated evidence below are current, but the required observer, access, Guided, full-manual, accessibility, analytics, and fabricator sessions have not been run and product-owner approval is absent. This report must not be used as a substitute for those release gates.

## Automated evidence

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript | Pass | `npx tsc --noEmit --incremental false --pretty false` |
| Cabinetry domain suite | Pass | `npm run test:cabinetry` |
| Preset validity | Pass | All 33 curated presets exercised by the domain and performance suites |
| Template catalog completeness | Pass | All 33 templates expose name, recognizable thumbnail kind, default dimensions/layout/materials/hardware, customization options, room types, host, safety, difficulty, and estimated time; metadata search/filter coverage is included in `npm run test:cabinetry` |
| Contextual onboarding and direct entry | Pass | Exactly five first-use actions appear at their relevant Guided steps, dismissal persists, Show me how remains available, and returning Pro Guided/Detailed preference is covered without splitting the definition model |
| Numeric integrity | Pass | Empty, incomplete, non-finite, range, integer, increment, and nested-definition guards |
| Project-unit consistency | Pass | mm/cm/in fields, direct handles, Fit/validation/action feedback, rounded exact increments, and no-drift keyboard steps retain millimetres as the model source of truth |
| Friendly-first terminology | Pass | Inspector and property search lead with cabinet structure, wall fitting panel, floor base, finished side, shadow-gap, and wall-fit language while retaining trade terms secondarily/searchably |
| Semantic preview | Pass | Divider and shelf preview transforms preserve source data and stable part IDs |
| Polygon/Fit hosts | Pass | Rectangular, L-shape/custom polygon, openings, baseboards, arbitrary placement, and host compatibility |
| Wardrobe arrangements | Pass | Five Guided arrangements, locks, provenance, validation, parts/BOM, and round trip |
| Structured room recommendations | Pass | Project room type is propagated independently of editable names; renamed kitchen/bedroom and legacy/custom-name fallbacks are covered in `npm run test:cabinetry` |
| Preset provenance | Pass | All present definition/module configuration fields across 33 presets initialize as template-defined while derived front/handle controls remain automatic |
| Performance evidence | Pass | `npm run test:cabinetry-performance`; 24-module/342-part parity and all 33 preset timings remain below gross-regression bounds |
| Static accessibility smoke | Pass | `npm run test:cabinetry-accessibility`; numeric/spinbutton and direct-handle slider semantics, keyboard instructions, named camera views, visual-choice labels, and mm/cm/in presentation |
| Browser acceptance discovery | Pass | 18 tests listed by `npx playwright test tests/e2e/cabinetry-studio.spec.ts --list` |
| Production build | Pass | `npm run build`; 48/48 static pages generated and TypeScript completed |
| Full browser execution preflight | Pass | 18/18 tests passed against the local production build with no failures/skips; JSON at `reports/cabinetry-playwright-release.json`, SHA-256 `5afb6f1bb56108b1f4f9809aab5446c29caa3020776cdd16e03637e046de7f71`. This is not credited to the formal release row until a frozen release candidate and named observer attestation exist. |
| Release evidence harness | Pass (fail-closed) | `npm run test:cabinetry-release-evidence`; exact 48-row coverage, local SHA-256 artifacts, parsed browser/analytics records, unsigned/wrong-key/tamper rejection, and trusted Ed25519 positive coverage |

The Node test runtime intentionally skips the GLB binary assertion because `FileReader` is unavailable there. GLB export remains covered by the browser/manual checklist.

The authoritative machine-readable gate is
`reports/cabinetry-studio-release-evidence.v2.json`, validated against the versioned
JSON/TypeScript contract by `npm run check:cabinetry-release-evidence`. Its current
state is structurally valid and intentionally exits nonzero with 48 `not_run` blockers
plus absent product-owner approval.
Use `npm run report:cabinetry-release-evidence` only to render the matrix; report-only
mode never converts missing evidence into a pass. Automated and static checks cannot
satisfy observed-human rows, and complete evidence cannot become release-ready without
the trusted product-owner Ed25519 signature.

## Required observer-led scenarios

Record observer, build commit, device/viewport, start/end time, result, hesitations, and notes in the table. Attach screen recording or issue links where available.

| Scenario | Status | Observer | Time/result | Notes |
| --- | --- | --- | --- | --- |
| A. First-time designer — two-minute base cabinet | **NOT RUN** | — | — | Production blocker |
| B. Intermediate designer — 3000 mm wardrobe | **NOT RUN** | — | — | Production blocker |
| C. Professional designer — fitted media wall | **NOT RUN** | — | — | Production blocker |
| D. Error recovery | **NOT RUN** | — | — | Production blocker |
| E. Returning designer — reopen and edit | **NOT RUN** | — | — | Production blocker |

Detailed scripts and pass criteria are in `docs/qa/cabinetry-studio-mvp.md`.

### Per-template first-time-user record

The plan's module definition of done also requires a first-time manual usability check for every released template. Each row needs a first-time participant who completes the full flow without external instructions, verifies that the default is placeable without modification, and observes credible materials/hardware, contextual advanced options, BOM, placement, and responsive behavior. Automated default-validity coverage is green, but the records below remain open until observed.

| Template | Manual first-time check |
| --- | --- |
| Base cabinet | NOT RUN |
| Wall cabinet | NOT RUN |
| Tall cabinet | NOT RUN |
| Wardrobe | NOT RUN |
| Vanity | NOT RUN |
| TV console | NOT RUN |
| Cabinet run | NOT RUN |
| Closet system | NOT RUN |
| Media wall | NOT RUN |
| Mudroom storage | NOT RUN |
| Laundry room | NOT RUN |
| Home office built-in | NOT RUN |
| Library wall | NOT RUN |
| Window seat | NOT RUN |
| Banquette | NOT RUN |
| Murphy bed | NOT RUN |
| Fold-down desk | NOT RUN |
| Platform storage bed | NOT RUN |
| Under-stair storage | NOT RUN |
| Room divider storage | NOT RUN |
| Home bar | NOT RUN |
| Kitchen island | NOT RUN |
| Pantry system | NOT RUN |
| Wine storage | NOT RUN |
| Pet built-in | NOT RUN |
| Kids storage | NOT RUN |
| Hobby storage | NOT RUN |
| Wall paneling | NOT RUN |
| Slat wall | NOT RUN |
| Ceiling beams | NOT RUN |
| Coffered ceiling | NOT RUN |
| Fireplace surround | NOT RUN |
| Trim package | NOT RUN |

### Required manual release-gate records

| Gate | Status | Required source evidence |
| --- | --- | --- |
| Consumer / Free access smoke | NOT RUN | Hashed local recording and session notes covering all 6 checks |
| Pro access and workspace smoke | NOT RUN | Hashed local recording and session notes covering all 4 checks |
| Guided quick-start smoke | NOT RUN | Hashed local recording and session notes covering all 18 checks |
| Full manual smoke | NOT RUN | Hashed local recording and session notes covering all 41 checks |
| Final UX release-gate observation | NOT RUN | Hashed local recording and session notes covering all 13 UX/signoff checks |
| Product-owner Ed25519 approval | NOT SIGNED | Signature must verify over the complete canonical v2 payload with the trusted key |

## Known data-model limits

- The persisted room model has doors/windows, wall dimensions, wall thickness, ceiling height, and baseboard depth, but no outlet or generic wall-obstruction entity to forward into Fit.
- Manually measured niche/opening/area hosts use validated, versioned local persistence with a capped Pro-only saved-host list; they are not yet project/server-synced host entities.
- Cardinal opening records can be mapped to an outer axis-aligned polygon edge only when the mapping is unambiguous. Sloped walls and interior notch edges are deliberately not guessed.
- Supplier rates and SKU mappings remain preliminary; estimates are not checkout totals, purchase orders, or final fabricator quotes.

## Release signoff

Machine gate: `npm run check:cabinetry-release-evidence` — **NOT READY (48 required records remain `not_run`; trusted product-owner approval is absent)**.

- [x] Final production build passes.
- [ ] Consumer and Pro access/workspace smokes pass and are recorded.
- [ ] Guided 18-step and full 41-step manual smokes pass and are recorded.
- [ ] Final UX release-gate observation passes without developer guidance.
- [ ] Full cabinetry browser acceptance suite passes in the release environment.
- [ ] Scenarios A–E are observed and recorded.
- [ ] Critical/high findings from those sessions are resolved or explicitly waived by the product owner.
- [ ] Consumer and Pro analytics events are verified in an approved non-QA environment.
- [ ] Accessibility keyboard/screen-reader smoke is completed on the release candidate.
- [ ] Fabricator/export artifacts receive the required human review; no automated check marks fabrication approved.
- [ ] Product-owner Ed25519 approval verifies over the complete canonical v2 evidence payload.
