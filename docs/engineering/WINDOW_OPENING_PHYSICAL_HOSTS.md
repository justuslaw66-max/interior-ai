# Window opening physical hosts

## Decision

Legacy plan openings use the physical wall topology produced by
`buildRoomWallSegments2D` and `mergeSharedWallSegments2D`. The resolved merged
segment is the single host authority for placement, collision, 2D projection,
and legacy 3D projection. Canonical floor-plan openings continue to use their
canonical wall identity; adapters must resolve legacy inputs before they reach a
renderer.

The host is a world-space straight segment with canonical, direction-independent
endpoints, a unit tangent and normal, length, floor-qualified physical identity,
and the opening center/along-segment distance. This is true for full overlaps and
for every merged subsegment created by a partial overlap. A consumer that needs
an owning-room-local offset projects the host world center onto that room's own
wall midpoint and tangent, then verifies perpendicular distance and endpoint
containment. A subsegment-relative offset is never reused on a full room wall.

Persisted legacy identity remains the logical opening ID plus its source room,
wall label, and offset. The floor-qualified physical wall ID and merged-segment
key are runtime projections and may be recomputed after topology changes. Repair
keeps the logical opening ID wherever possible.

Move, resize, endpoint clamping, wall reassignment, and collision use scalar
along-wall coordinates from the resolved host. Pointer positions and deltas are
projected onto the unit tangent; world coordinates are reconstructed only after
the scalar interval is final. The legacy room-wall offset is then derived by
projecting that exact world center onto the original room segment. No interaction
selects x or z from the compatibility wall label.

The design-page resolver accepts room-owned and roomless openings. A room-owned
opening must match a wall segment belonging to that room. A roomless opening may
use the plan bounds to locate the requested exterior coordinate, but the bounds
are never treated as wall geometry: exactly one existing physical segment must
cover that coordinate. No match is `unresolved`; more than one match is
`ambiguous`. Both states fail closed and carry a diagnostic instead of moving the
opening onto an invented edge.

Physical identity includes floor and the merged segment key. Collinear but
disconnected segments therefore stay distinct, and collision is evaluated only
between openings with the same resolved identity.

## Orientation and topology support

Projection, collinearity, overlap splitting, containment, and canonicalization
use vector segment mathematics. Horizontal, vertical, positive- and
negative-slope diagonal, reversed, near-horizontal, and near-vertical straight
segments are supported, including shared straight edges of custom polygons.
Cardinal `north`/`south`/`east`/`west` labels remain compatibility metadata; they
do not select a dominant-axis projection for a room-owned opening. Its offset is
measured on the canonical tangent of the original room segment.

This support applies to imported and persisted custom-polygon geometry. The
current consumer straight-wall drawing tool intentionally authors orthogonal
segments only; it is not a diagonal-polygon authoring surface.

The host tolerance is 1 mm. The legacy renderer additionally rejects a
world-center projection more than 2 mm off its target wall or outside that
segment after including half the opening width.

Curved wall paths are not part of the legacy room model. A custom room without
at least three finite polygon vertices is explicitly `unsupported` and cannot
fall back to its bounding rectangle. Self-intersecting custom polygons and
curved/arc shared-wall topology remain outside this compatibility contract and
must be validated before host resolution.

## Unresolved and ambiguous openings

Every persisted opening remains in the editor read model. Resolution is a
discriminated `resolved`, `unresolved`, `ambiguous`, `unsupported`, or `invalid`
result with a consumer message and technical diagnostic. Failed resolutions do
not cut 2D or 3D wall geometry and never create floating frame/glass geometry.
They remain selectable through a restrained 2D repair marker and through the
plan-quality panel, which is also available while viewing 3D. The inspector can
reassign the requested wall without replacing the logical opening ID.
The marker is rendered only when resolution carries a trustworthy requested or
last-known world position. A missing-room opening without that information has
no spatial marker—especially not an origin fallback—but remains discoverable in
the quality/issue workflow.

Surface-material/BOM projection returns a structured
`UNRESOLVED_OPENING_HOST` warning. Wall quantities remain deliberately uncut,
and HTML, PDF, and CSV exports expose that condition rather than silently
subtracting or hiding the opening.

## Shared-wall ownership

Legacy opening detail is assembled at scene level, outside incidental room-tree
ownership. Exactly one assembly is selected for each logical opening in full
plan, focus room A, and focus room B. Its React/Three key is the stable physical
wall identity plus logical opening ID, so repeated full → A → B → full changes
retain one frame, glass, sill/lintel/jamb/threshold assembly and one logical
selection/raycast target even when the visible room providing the transform
changes.

## Effective vertical dimensions and evidence

`resolveEffectiveOpeningDimensions` is the compatibility-rendering policy for
legacy opening height and sill values. Callers provide applicable floor/room
defaults. Precedence is explicit valid raw value, contextual default, then the
documented legacy fallback (door height 2100 mm, window height 1200 mm, window
sill 900 mm). Explicit finite sill `0` is valid. Positive explicit heights are
retained when possible, including full-height windows, and are constrained when
the wall becomes shorter.

The result keeps raw value/evidence separate from the effective render value and
reports `exact`, `defaulted`, `constrained`, `invalid`, or `unsupported` plus
issues. Inspectors show the stored value and evidence alongside any adjusted
effective value; they do not relabel the clipped value as source-documented. A
host wall below the 1 mm physical minimum is `unsupported` and produces no
positive opening geometry.

Canonical compilation is intentionally stricter: floor defaults remain
authoritative and invalid documents, including an opening above its wall, are
rejected. Legacy sparse data may be defaulted or constrained for compatibility
rendering without changing the stored raw value. These policies are deliberately
not identical.

Sparse persisted values are not materialized merely because a renderer needs an
effective value. Width, height, and sill carry independent optional evidence for
backward compatibility. Editing a field writes and confirms only that field;
source-documented, site-measured, verified, and locked values are governed at the
shared structural mutation boundary, not only by disabled controls. An unchanged
protected value passes through unchanged. A changed protected value produces an
explicit fail-closed result and no history entry unless Pro supplies the reviewed
override authorization, truthful replacement evidence, and the required audit
note. Import review applies that policy independently to width, height, and sill,
so one locked measurement does not disable editable offset or other editable
measurements. Consumer opening controls call missing/assumed values `Estimated`.
The global measured-property label remains `Assumed`, so unrelated floor, wall,
slab, and structure terminology is unchanged.

Opening override authority is the field-scoped
`floor-plan-opening-override/v1` contract. It binds the logical opening, every
changed protected field, exact old and proposed raw values, current and
replacement evidence, mutation purpose, Pro review context, actor, reason, and
audit note. The shared boundary validates the complete binding against the
actual mutation. A legacy `allowDocumentedOverride` boolean carries no authority
for width, height, sill, or a kind-dependent sill change, and one authorization
cannot cover an unlisted dependent field.

Import scale calibration uses the same policy. Its pure preflight reports every
proposed value, clamp, evidence class, and protected field before mutation.
Unchanged protected dimensions survive unchanged; a forced protected clamp
requires an exact replacement authorization. Apply is cloned and atomic, so a
blocked field changes no geometry, evidence, audit, or history. An approved
operation records truthful replacement evidence and audit provenance in one
history command; undo/redo and persistence restore the entire calibrated state.

Default opening widths are centralized at 900 mm for doors and 1200 mm for
windows. A missing width-evidence property means estimated/assumed legacy data;
rendering or an unrelated save does not materialize evidence.

Changing an opening kind is planned as one composite edit. Today, the only
dependent stored value changed by that policy is a present, nonzero window sill
when changing to a door; width and height remain unchanged. Editable sill data
is replaced with zero and `user_confirmed` evidence in the same history command.
Documented or site-measured sills block the edit until the Pro reviewed-override
action is explicitly approved. An absent sill stays absent, an already-zero
locked sill permits the kind-only edit, and door-to-window preserves explicit
zero for valid full-height windows.

Opening-host contexts are immutable per room snapshot. The batch scene projection,
opening-quality scan, and surface-material/BOM warning projection each construct
one context for their own complete opening list. Placement validation, collision
candidate evaluation, single-opening overlay edits, wall reassignment, and other
scalar resolution paths still construct or repeat local topology scans. There is
no global cache, so room replacement, floor edits, and history restoration cannot
reuse stale topology. Consolidating those remaining scalar scans is a non-blocking
P3 follow-up; this correction deliberately does not introduce cross-operation
caching or claim full host-context reuse.

## Rejected alternatives

- An overall-plan rectangle as a wall host: it invents edges for L-shaped,
  multi-wing, and disconnected plans.
- Rendering shared openings from every participant: it duplicates geometry and
  raycast targets.
- Renderer-specific minimum heights or defaults: they make persisted, inspected,
  and rendered values disagree.
- A malformed custom polygon's bounding box as a host: it creates physical walls
  that were never authored.

## Verification and rollback boundary

Behavior coverage lives in `scripts/test-window-opening-corrections.ts` together
with the existing canonical, legacy watertight, wall rendering, topology,
history, persistence, quality, and surface-material suites. Deterministic browser
evidence covers the final mounted full/focus, interaction, lock/override, and
unresolved/ambiguous repair states. The
implementation can be rolled back as one window-opening correction batch:
vector topology/resolution, scene-level legacy assembly, effective-dimension
policy, width provenance, unresolved diagnostics/exports, inspector projections,
and their tests.
