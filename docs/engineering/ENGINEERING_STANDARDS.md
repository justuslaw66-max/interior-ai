# Engineering standards

These standards turn the repository-root instructions into day-to-day engineering practice. They apply to production code, tests, scripts, configuration, generated artifacts, documentation, and review evidence. Product behavior takes precedence over aesthetic cleanup: structural work must preserve characterized behavior unless the change explicitly and separately changes that behavior.

## Change design

Start by locating the current owner of the behavior, its callers, its tests, and the closest architecture boundary. Check the worktree and the running application checkout before writing. State the intended behavior, failure modes, and rollback boundary. Prefer one coherent patch that can be understood and reverted independently.

Avoid broad renames, mass formatting, dependency upgrades, generated-data changes, or unrelated cleanup inside a feature or refactor change. A repeated sequence is not automatically an abstraction: extract only when the abstraction has a stable responsibility, vocabulary, and owner. Do not create catch-all utility, helper, manager, or service modules.

## Module and function design

- A module should have one describable responsibility and one natural owner. Split by domain responsibility or lifecycle, not merely to meet a number.
- Production TypeScript modules normally remain at or below 400 physical lines. React component modules normally remain at or below 250 physical lines. Functions and hooks normally remain at or below 60 physical lines.
- Complexity above 15 or control-flow nesting deeper than 4 is a review signal. Prefer guard clauses, named domain predicates, pure calculations, and explicit state machines where they clarify behavior.
- Keep side effects at application and adapter boundaries. A calculation should accept values and return values; persistence, network, clock, randomness, telemetry, and rendering resource ownership should be injected or isolated.
- Prefer domain names over implementation names. Do not hide dependency direction behind barrel exports.
- Remove dead code. Source control is the archive.

The limits are guardrails, not fragmentation targets. A cohesive parser, schema, generated projection, or algorithm may justify an exception when splitting it would obscure invariants. The exception must name the cohesion reason, owner, review reference, and expiry; it is not permission for unrelated growth.

## Types, boundaries, and errors

Production code must not introduce explicit `any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, unexplained assertions, or disabled lint rules. Prefer `unknown` at an untrusted boundary, validate it, and return a domain type. Assertions are acceptable only when an invariant is established locally and the reason is evident or documented.

Validate input at every system boundary: HTTP payloads, environment variables, database records crossing version boundaries, catalog authoring data, generated inputs, browser storage, worker messages, and external-service responses. Use stable typed error codes and a consistent public envelope. Do not leak internal paths, vendor payloads, secrets, or raw database failures.

Secrets, Prisma, filesystem access, privileged roles, and vendor credentials remain server-side. Client-safe code receives minimal typed DTOs. Minimise `use client`: put it at the narrowest interactive boundary and keep pure domain modules importable without React, browser globals, or Three.js.

## React and Three.js

React owns declarative UI composition, not canonical geometry or persistence truth. Avoid mirrored state; derive values or appoint one transaction owner. Effects synchronize external systems and should not be used to rebuild derived state that can be calculated during render.

Three.js adapters receive canonical transforms and domain projections. XZ is the plan plane, Y is vertical, and `rotationDeg` is the durable rotation representation. Resource loading, cloning, listeners, frame invalidation, and disposal require explicit ownership. Do not set React state per frame, register per-item global commands, or allocate disposable vectors/materials/geometries inside `useFrame` when they can be reused.

## Catalog and generated artifacts

Catalog authoring sources, schemas/validation, generators, generated runtime projections, and consumer adapters are distinct responsibilities. Never mutate an imported registry at runtime or hand-edit a generated file. A generated diff must include its authoring change and pass check mode. Fixtures and draft/authoring metadata must not leak into production projections accidentally.

## Code-quality gate

Run `npm run check:code-quality`. The gate scans production `.ts`/`.tsx` under `app`, `components`, `features`, `hooks`, and `lib`, plus root runtime entry files such as instrumentation and the Next proxy. It excludes generated sources, fixture/snapshot artifacts, migrations, catalog/data-only modules listed in the policy, vendored/public assets, tests, lockfiles, and build output.

The checked-in `scripts/code-quality/baseline.json` records only accepted historical debt:

- physical line counts for files over 400 lines, or over 250 for TSX;
- per-file count and maximum for functions over 60 lines, complexity over 15, and nesting over 4;
- existing production lint-suppression net counts keyed by file and rule.

The gate fails when debt grows, a new violation appears, explicit `any` or a TypeScript suppression appears, or a static runtime import cycle is introduced. Static emitted ES imports/exports and string-literal `require` calls are included; dynamic imports remain deliberate asynchronous boundaries. Existing lint debt is counted per file/rule, so its net count cannot grow. It also fails when debt shrinks until `npm run check:code-quality:baseline` records the lower value. That update command can only lower or remove existing accepted debt; it cannot baseline new debt or raise a limit. CI compares the baseline with the pull-request base or pre-push commit, so the workflow fetches repository history.

Unavoidable temporary size/function exceptions belong in `scripts/code-quality/exceptions.json`. Each entry must contain a narrow allowance plus `reason`, `owner`, `review`, and an ISO `expiresOn` date. Exceptions are reviewed code, expire automatically, and must be removed when unused. Lint and TypeScript suppressions are not exception-eligible.

The repository already has TypeScript strict mode and Next/TypeScript ESLint rules. This batch makes explicit `any` and TypeScript suppression comments errors and uses a staged metric ratchet rather than thousands of suppressions. Static cycles within measured production TypeScript are blocked by the quality gate; specialized design-page, floor-plan, and cabinetry architecture checks remain valuable domain gates. Unused-export and dependency analysis is deferred until a low-false-positive manifest can distinguish framework entry points, scripts, generated modules, and optional integrations without adding overlapping tooling.

## Verification evidence

Every completed change reports the commands actually run and their exact outcomes. At minimum inspect the complete diff and run `git diff --check`. Run focused lint/tests first, then typecheck and the relevant domain/build/browser gates. Known inherited failures remain failures; do not weaken assertions, raise budgets, or describe a skipped check as passing.
