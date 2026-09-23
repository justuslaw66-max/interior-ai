# Current objective

Continue the cabinetry Detailed editor’s module-level and generated-part selection work, specifically ensuring that selecting a wardrobe module or one of its shelves produces one coherent selection across the 3D highlight, breadcrumb, scoped inspector, and parent-module navigation. The next work must remain limited to this selection flow and its focused regression coverage.

# Completed and verified

- Human browser testing on `https://interior-ai-cabinetry-staging-egin0mheu.vercel.app/design` verified that individual wardrobe modules can be selected. The selected module received a blue outline, its module badge became active, and the inspector changed to that module.
- Human browser testing verified shelf-level selection. Selecting a shelf in Module 3 showed `Selected: Shelf · Module 3`, highlighted the shelf, and opened a `SHELF` inspector containing part material, shelf layout/count, resolved dimensions and fabrication, parent-module validation, and `Open parent Module 3`.
- Human browser testing also verified the same generated-part routing pattern for a back panel in Module 6: the breadcrumb, highlighted part, part inspector, and parent-module validation agreed.
- The user explicitly marked the relevant selection checks as pass.
- No production code was changed while creating this emergency handoff.

# Implemented but not verified

- UNVERIFIED: The deployed module and shelf selection behavior has not been traced to production source files in this chat.
- UNVERIFIED: Selection persistence across undo/redo, 3D/front/side/top view changes, editor close/reopen, and geometry edits has not been adequately tested.
- UNVERIFIED: No automated regression test for module-to-shelf-to-parent selection was identified or run.

# Relevant files

- `docs/handoffs/2026-07-27-cabinetry-module-shelf-selection-handoff.md` — emergency continuation record created for this task.
- `AGENTS.md` — repository routing and preservation instructions inspected before creating this handoff.
- `tests/e2e/00-beta-smoke.spec.ts` — narrowly inspected only to classify its existing My Designs navigation edits as unrelated work.
- `tests/e2e/00-runtime-smoke.spec.ts` — narrowly inspected only to classify its existing plan-template startup edits as unrelated work.
- `tests/e2e/18-multi-room-whole-home.spec.ts` — narrowly inspected only to classify its existing room-drag persistence edits as unrelated work.
- UNVERIFIED: No production implementation file was directly inspected for this task.

# Decisions and invariants

- Module selection must have one visible source of truth: module list/badge, 3D outline, breadcrumb, and inspector must identify the same module.
- Shelf selection must scope controls to the selected shelf without exposing unrelated module settings.
- A selected generated part must retain its parent module identity and provide an explicit route back to that parent.
- Selecting a module or part must not itself mutate geometry, materials, locks, or validation state.
- Part dimensions and fabrication information must be derived from the generated part, not independently editable duplicate state.
- Existing unrelated dirty work must be preserved.

# Current repository state

- Branch: `release/cabinetry-alpha-rc46`
- HEAD: `bfa44edbc7d1ae1fe19f1babf91b1022f5db3211`
- Task-related untracked file: `docs/handoffs/2026-07-27-cabinetry-module-shelf-selection-handoff.md`.
- Existing modified files are the three E2E specs listed above; their narrow diffs are unrelated to cabinetry selection and must remain untouched.

# Validation evidence

- Manual browser check: module selection — PASS.
- Manual browser check: shelf selection in Module 3, including scoped inspector and parent navigation — PASS.
- Manual browser check: back-panel generated-part selection in Module 6 — PASS.
- Automated tests, type checks, lint checks, and builds: none run for this emergency handoff.
- Screenshots:
  - [Module 1 selected in 3D](evidence/2026-07-27-cabinetry-module-shelf-selection/01-3d-module-1-selected.png)
  - [Module 1 selected in front view](evidence/2026-07-27-cabinetry-module-shelf-selection/02-front-module-1-selected.png)
  - [Module 1 selected in side view](evidence/2026-07-27-cabinetry-module-shelf-selection/03-side-module-1-selected.png)
  - [Module 1 selected in top view](evidence/2026-07-27-cabinetry-module-shelf-selection/04-top-module-1-selected.png)
  - [Guided side-control overlap defect](evidence/2026-07-27-cabinetry-module-shelf-selection/05-guided-side-control-overlap-defect.png)
  - [Guided side-control overlap fixed locally](evidence/2026-07-27-cabinetry-module-shelf-selection/06-guided-side-overlap-fixed-local.png)
  - [Detailed editor toolbar overlap](evidence/2026-07-27-cabinetry-module-shelf-selection/07-detailed-editor-toolbar-overlap-local.png)

# Known issues and risks

- Confirmed: The module dimension fields can display confusing shortened values such as `34`, `23`, and `62` while the model badges show `348 mm`, `2,380 mm`, and `620 mm`.
- Confirmed: Lowering wardrobe height to `2,130 mm` produced black square artifacts above the model; restoring `2,380 mm` removed them.
- Confirmed: The summary `8 NOTES` badge was not clickable even though the notes were available later in Review.
- UNVERIFIED: It is unknown whether any of these confirmed display issues share state or rendering code with selection.
- UNVERIFIED: The deployed preview may differ from the current local branch and HEAD.

# Smallest next action

Add one focused Playwright test that selects a wardrobe module, selects a shelf inside it, asserts the matching breadcrumb/highlight/scoped inspector, then uses the parent action to return to the same module.

# Do not touch

- Preserve the existing edits in `tests/e2e/00-beta-smoke.spec.ts`.
- Preserve the existing edits in `tests/e2e/00-runtime-smoke.spec.ts`.
- Preserve the existing edits in `tests/e2e/18-multi-room-whole-home.spec.ts`.
- Do not modify RC copies or the release-evidence directory unless the user explicitly changes scope.
