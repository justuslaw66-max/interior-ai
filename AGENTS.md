# Interior AI engineering guardrails

This is the canonical application checkout. Apply application, UI, catalog, API, runtime, and test changes here unless the user explicitly names another checkout. Release-candidate copies are not the default source, and release-evidence directories are artifacts unless explicitly placed in scope. Before editing a running app, identify its listening process with `lsof` and confirm that its working directory is this repository. Stop and report any mismatch.

## Working method

- Inspect the relevant architecture, tests, `git status`, and applicable instructions before editing. Preserve unrelated work and use the smallest coherent change that solves the request.
- Do not perform opportunistic rewrites. Keep behavior changes, architecture refactors, dependency upgrades, unrelated generated churn, and formatting in separate changes with separate rollback boundaries. Generated output stays atomically with the authoring or generator source that produced it.
- Prefer clear code over clever code. Avoid premature abstractions, unnecessary design patterns, and generic `utils.ts`, `helpers.ts`, `manager.ts`, or `service.ts` dumping grounds.
- Give every module one clear responsibility and owner. Do not introduce a second source of truth for existing state or add a dependency when the current stack solves the problem cleanly.
- Document architectural changes and important tradeoffs in the relevant engineering or decision document.

## Architecture invariants

- Preserve one canonical scene/document model shared by 2D and 3D, one placement/collision engine, XZ-plan/Y-rotation conventions, and canonical `rotationDeg`.
- Consumer Mode is the simple default. Pro Mode adds capabilities to the same application; it must not duplicate document, editor, renderer, catalog, persistence, or accessibility semantics.
- Keep domain calculations independent from React and Three.js where practical. Rendering adapters consume canonical projections and stay separate from domain calculations and persistence.
- Keep catalog authoring sources separate from generated runtime outputs. Never hand-edit generated files; change their source and run the generator/check command.
- Keep secrets, database access, and privileged integrations server-side. Minimise `use client` boundaries.
- Do not update React state every frame or make avoidable allocations in `useFrame`.

## Code-quality ratchets

- New production TypeScript/TSX files should normally stay at or below 400 physical lines; React component modules should normally stay at or below 250. Functions and hooks should normally stay at or below 60 lines. Limits must not cause meaningless fragmentation.
- Any exception requires a documented cohesion-based reason, owner, review reference, and expiry. Existing oversized code follows the checked-in no-growth ratchet. When an oversized file or function metric improves, lower the accepted baseline; when materially modifying an oversized file, leave it smaller unless that makes the change less safe.
- Do not introduce explicit `any`, TypeScript suppression comments, unexplained type assertions, new lint suppressions, or disabled lint rules. Avoid unnecessary nesting and prefer pure calculations with isolated side effects.
- Validate data at system boundaries and use typed, consistent errors. Delete dead code instead of commenting it out.
- Do not create barrel exports that hide dependency direction or introduce cycles.

## Testing and completion

- Add characterization or parity tests before a structural refactor when behavior is not already protected. Add appropriate tests for new behavior.
- Run targeted checks first, then the relevant repository gates. Use the existing package scripts for code quality, type checking, lint, tests, and production build.
- Before finishing, inspect the complete diff and run `git diff --check`.
- Report exact commands and results, changed files, behavioral impact, known risks, and remaining follow-up. Never claim completion when a required check was skipped or failed without saying so clearly.
- During iteration use focused checks. Run critical-path smoke against an immutable preview after a related batch, and reserve full Gate A3 for the exact artifact proposed for promotion. Any later code change invalidates that certification.

Detailed standards live in `docs/engineering/ENGINEERING_STANDARDS.md`, `docs/engineering/CODE_REVIEW.md`, and `docs/engineering/ARCHITECTURE_RULES.md`.
