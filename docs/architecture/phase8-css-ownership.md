# Phase 8 CSS ownership

## Route graph and first-paint contract

`app/layout.tsx` imports `app/globals.css`, the only stylesheet on the initial
`/design` manifest. It owns Tailwind preflight/theme output, shared utilities,
the editor shell, focus-visible behavior,
status colors, overlays, and the shared responsive primitives required before
the first editor paint. The Tailwind scanner continues to cover `app`,
`components`, `features`, and `lib`, with three explicit ownership exclusions:

- `app/admin` is compiled by `app/admin/admin-tailwind.css` and loaded from
  `app/admin/layout.tsx`;
- `app/tools` is compiled by `app/tools/tools-tailwind.css` and loaded from
  `app/tools/layout.tsx`;
- `features/cabinetry` is compiled by
  `features/cabinetry/cabinetry-tailwind.css` and imported by the existing
  dynamically loaded `CabinetryStudio` implementation.

Each scoped stylesheet contains the sorted Tailwind candidate list that is
valid in, and exclusive to, its owner. Those inline lists are the canonical
exact selector inventories: on 21 Oct 2026, 52 admin utilities, 26 tools
utilities, and 86 Cabinetry Studio utilities. Ten more utilities are used by
two or more of those excluded owners but nowhere in the remaining global scan:
`gap-5`, `gap-6`, `max-h-40`, `min-w-[760px]`, `sm:col-span-2`, `text-3xl`,
`text-neutral-100`, `text-neutral-300`, `text-red-950`, and `xl:grid-cols-2`. They remain once in
`app/globals.css` rather than being duplicated into scoped chunks. These
counts move whenever a class enters or leaves an owner (UX phase 5's 12px
steps moved `text-[10px]` from the global scan to the cross-owner set, then to
Cabinetry, then out, and left `text-green-900` to Admin alone; UX 5l's removal of the unused
designer theme took eleven dark-palette utilities out of the global scan, so `bg-black/20`,
`bg-white/10` and `border-l` moved to Cabinetry, seven to tools, and `text-neutral-100` to
the cross-owner set; UX 5m's shared buttons left `bg-sky-700` to Cabinetry, AX10's later areas left
`text-neutral-300` and `bg-amber-900` to the cross-owner set, and AX10's Built-ins area left `bg-amber-900`
and `bg-blue-700` to Admin alone, and its Admin area took those two, `bg-black` and `bg-violet-700` out of
Admin's list); the guard below recomputes them, so it, not this
paragraph, is authoritative.

`scripts/test-phase8-performance-boundaries.ts` recomputes all four
inventories with Tailwind's own scanner/design system, checks the complete
union, rejects shared or missing scoped candidates, checks pairwise disjoint
ownership, and verifies compiled selector membership. Hashes are not part of
the guard.

## Ownership matrix

| Class | Exact source owner | Selector/rule scope | Consumer and trigger | Disposition |
| --- | --- | --- | --- | --- |
| A — required before first `/design` paint | `app/globals.css`, with shared candidates from `app` (except admin/tools), `components`, `features` (except cabinetry), and `lib` | Tailwind preflight/theme/shared utilities; `html`, `body`, `.appShell`, `.panel`; command bar, viewport, overlay, responsive, status, and focus-visible rules | Consumer and Pro editor mount, loading shell, command bar, plan/3D viewport, initial responsive layout | Remains initial and global |
| B — required only after a lazy feature opens | `features/cabinetry/cabinetry-tailwind.css` | Its exact inline list (101 candidates on 12 Oct), including Studio-only arbitrary grids, resize cursors, Guided/Detailed breakpoints, focus/ring states, colors, dimensions, and hover/disabled states | `CabinetryStudio` dynamic import after Workspace → Custom Millwork Studio | Lazy CSS chunk; loaded before the Studio leaves its loading state |
| B — lazy UI using shared primitives | `app/globals.css` | Shared Tailwind utilities and focus/status rules used by the surface-material browser, dialogs, Pro inspectors, export UI, onboarding, and drawers | Corresponding lazy/open transitions | Conservatively remains initial because the rules are shared with first-paint consumers; no duplicate scoped copy was introduced |
| C — print/export only | Shared Tailwind output from `app/share/[shareToken]/export`, `PlanSvgDownload`, `ShoppingCsvDownload`, and `PresentExportDialog` sources | Existing export-page layout, download controls, SVG/CSV/PDF states; there is no separate global `@media print` block | Present/Export and share-export workflows | Unchanged in the global scan so print/export availability cannot regress in this batch |
| D — admin or other non-`/design` route only | `app/admin/admin-tailwind.css`; `app/admin/operations-dashboard.module.css`; `app/tools/tools-tailwind.css` | Exact inline lists (54 and 19 candidates on 12 Oct); operations-dashboard module selectors and its responsive/reduced-motion media rules | Any `/admin/*` route; `/tools/glb-optimizer` | Route-owned and absent from `/design` initial CSS |
| D2 — shared only by multiple excluded owners | `app/globals.css` | Exact cross-owner set (9 candidates on 12 Oct) | Two or more of `/admin`, `/tools/glb-optimizer`, and lazy Cabinetry Studio; no first-paint `/design` consumer | Remains once in root CSS as the smaller no-duplication tradeoff; never copied across scoped chunks |
| E — duplicated or obsolete evidence | `app/globals.css` | The two `.panel` declaration sites | `.panel` remains reachable | Recorded but not changed: this remediation uses ownership boundaries. The unreferenced `.designer-toggle*` selectors went with the designer theme in UX 5l (13 Oct 2026), after a search of the whole repository found no consumer |
| F — global foundation | `app/globals.css` | CSS variables, `@theme`, body normalization, focus-visible outlines, `gridPulse`, `pulseOnce`, `toastIn`, and shared neutral-color compatibility rules | All routes and editor interaction states | Remains global |

Tailwind emits identical `@property --tw-*` registrations for independently
compiled utility sheets by default. The scoped PostCSS transform removes those
registrations only from the three scoped Tailwind entries. The semantic guard
derives every registration required by every scoped candidate, proves an
identical rule remains in root `/design` CSS, proves the admin and tools route
manifests include that root sheet, and rejects any scoped registration or
selector duplication. The final scoped chunks contain zero `@property --tw-*`
copies.

## Lazy-load and no-FOUC evidence

Measured when this boundary landed (4 Aug 2026): the production `/design` page
initially exposes one stylesheet, contains the 10 cross-owner rules of that
time, and has no Cabinetry-only `min-h-[680px]` rule. Opening
Custom Millwork Studio adds one lazy stylesheet while the dialog still exposes
its loading status. When the interactive Studio replaces that status, the
owner stylesheet is present, the matching element computes to
`min-height: 680px`, and the shared `gap-5` consumer computes to `20px`.
Closing and reopening keeps two unique stylesheet URLs and applies the same
geometry. Chromium and WebKit Cabinet Preview policy tests remain green.
