# Editor capability, mode, and accessibility policy

## Purpose

The homeowner and designer experiences use one design document, scene model,
command system, renderer pipeline, and editor composition. A mode may change
the controls, defaults, density, guidance, and guardrails presented to a user;
it must not fork the domain model or create a second editor.

## Capability policy

`lib/editor-capabilities.ts` is the client-side source of truth for behavioral
capabilities. Consumers ask questions such as `configurePlanLayers`,
`applyAiSuggestions`, or `exportMultipleViews`; they do not branch on a price
tier inside editor domain code.

The current experience matrix is:

| Behavior | Consumer | Professional |
| --- | --- | --- |
| Basic catalog placement | Yes | Yes |
| Basic plan notes | Yes | Yes |
| Advanced transforms | Guarded | Yes |
| Plan layers and technical dimensions | Guarded | Yes |
| Technical annotations | Guarded | Yes |
| Custom materials and CAD import | Guarded | Yes |
| Advanced render settings | Guarded | Yes |
| Apply AI suggestions | Guarded | Yes |
| Designer workspace | Guarded | Yes |
| Multi-view and clean exports | Guarded | Yes |

The capability map shapes the UI only. It is not an authorization boundary.
API routes must derive entitlements from the authenticated server-side user and
must validate limits even if the client hides or disables a control. The PDF
export and design persistence routes retain those independent checks.

## Mode rules

- Consumer mode keeps placement and basic annotation usable, provides guided
  onboarding, defaults to simple plan controls, and explains guarded controls.
- Professional mode adds control density and technical workflows without
  changing the stored scene or command semantics.
- URL mode selection is accepted only when `useDesignerWorkspace` is available.
- Capability decisions belong at adapters and workflow boundaries, not in
  geometry, persistence, history, scene projection, or renderer domain code.
- Visual themes named `consumer` and `pro` are plan-rendering styles, not access
  decisions; renderer checks against those theme values are intentionally not
  subscription checks.

## Loading boundaries

The Cabinetry Studio remains client-only and dynamically loaded. Advanced plan
layer/theme controls in Present & Export are also dynamically loaded only after
the advanced workflow is selected. Consumer users do not download that control
surface during the default simple workflow.

## Dialog design system and accessibility

`components/editor/design-system/EditorDialog.tsx` owns the repeated modal
contract used by confirmation, copy fallback, room rename, plan annotation, AI
notes, upgrade, and Present & Export workflows. It provides:

- labelled dialog semantics and optional descriptions;
- deterministic initial focus;
- Tab and Shift+Tab focus containment;
- Escape and guarded backdrop dismissal;
- focus return to the invoking control;
- named close controls, visible focus rings, reduced-motion treatment, and
  44-pixel minimum action targets;
- shared action and button primitives with primary, secondary, and destructive
  states.

Editor keyboard shortcuts remain owned by the editor. While a modal is open,
the modal consumes Escape and Tab navigation so the background editor does not
receive those interactions.

## Verification

- `npm run test:editor-capabilities-accessibility` verifies the capability
  matrix, absence of tier checks in the targeted editor paths, shared modal
  semantics, the lazy advanced-control boundary, and independent server export
  entitlement lookup.
- The focused multi-room Playwright scenario verifies initial focus, focus
  wrapping, Escape dismissal, focus return, and successful rename/annotation
  completion in the running editor.
- `npm run build` remains the authoritative TypeScript and production-bundle
  check.
