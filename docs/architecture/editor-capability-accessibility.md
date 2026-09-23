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

## Client Preview command-bar contract

Client Preview is a Pro/designer presentation mode. The editor command bar is
a **persistent panel**, not a modal dialog, and remains one mounted responsive
root so its local state and existing opacity transition survive entry/exit.
Capability derivation remains in `useEditorMode`; preview concealment is a
client interaction policy and is not an authorization boundary.

Normal editing keeps the root visible, accessibility-active, and interactive.
Effective Client Preview makes the root `inert`, accessibility-hidden, and
pointer-inactive before or as it fades to zero opacity. The root capture guard
also rejects programmatically dispatched hidden command actions. Hidden
descendants therefore contribute no tab stops or accessibility-tree controls,
cannot retain or receive focus, and cannot execute command routing. The same
root serves desktop and narrow layouts; no hidden mobile duplicate exists.

The core-shell preview setter is the single entry/exit boundary for More →
Preview, the presentation shortcut, export capture, visible Exit Presentation,
and export completion. A generation-scoped focus lifecycle records the current
semantic command opener, moves focus once to the visible connected Exit action
when command-bar focus becomes unavailable, and on ordinary exit restores the
current matching opener or visible More fallback after the panel's own animation
settles. Route, design, plan, mode, or unmount changes invalidate pending focus
work. A disconnected, hidden, inert, disabled, or semantically stale element is
never restored.

Consumer denial is unchanged, direct URL/restored preview is not supported,
and public sharing is separate. The selected-item panel is also a separate
persistent region; its P2 preview-transition hardening remains outside the
command-bar lifecycle.

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

CH-0015E applies the same lifecycle to `ShareLinkFallbackDialog` as a nested
child of Present/Export. Both dialogs remain registered, but only the registry
top is interactive: the fallback conceals and inerts the parent, owns initial
focus, Tab/Shift+Tab, Escape, and backdrop, then restores to the current
semantic Create Share action inside the resumed parent. The parent close action
is the sole ordered fallback. Design/project, mode-generation, supersession,
and unmount boundaries cancel stale child restoration; no caller-level trap,
global listener, raw-node-only return, or timer is added.

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
