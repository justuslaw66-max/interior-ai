# Editor state, command, and history ownership

Phase 4 classifies editor state by lifetime and authority. The application does
not use one global editor store: document state, pointer-time interaction,
view/UI preferences, and remote data retain separate owners.

## Ownership matrix

| Category | State and owner | Source of truth | Allowed writers | Primary readers | Persistence | Reset | Serialization |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Persistent scene | Rooms, room geometry/walls, furniture, zones, surfaces/materials, dimensions, saved camera views, and canonical floor-plan data. Owned by `useDesignPageSnapshotDocumentState`. | `DesignSnapshot` and its synchronous `designSnapshotRef`. | Document commands/controllers only. React components receive callbacks and do not mutate scene objects. | Room/plan selectors, 2D/3D scene adapters, shopping projection, save/export controllers. | Local recovery backup plus authenticated/guest project persistence. | New/open project replaces the complete snapshot and clears history. | `snapshotToStored` emits version 3/revision 1; runtime migration/validation protects older documents. |
| Persistent plan scene | Openings, fixed elements, annotations, and durable underlay metadata. Owned by `useDesignPagePlanDocumentState` and `useDesignPageFloorPlanDocumentState`; event-time refs support commands. | Owner React state plus owner-updated refs. `buildPersistedFloorPlanState` projects them into `DesignSnapshot.floorPlan` for storage. | Plan/topology/underlay controllers and history restore adapters. | Plan canvas, topology compiler, export, persistence, history. | Project document and recovery backup. Local storage remains a compatibility cache. Annotation persistence is optional/backward-compatible. | Project hydration replaces all four collections; a project without floor-plan state clears them when requested. | Optional `floorPlan.openings`, `fixedElements`, `annotations`, and persistable `underlay`; object/blob-only asset URLs are excluded. |
| Transient interaction | Selection, hover/pointer callbacks, active item/room/overlay drag flags, transform previews, snap/grid pulse, tracing/calibration buffers, active handles, camera animation tokens. Owned by the smallest interaction controller (`useDesignPageItemSelectionController`, `useDesignPageCanvasInteractionController`, `useDesignPageFloorPlanWorkflowState`, or scene callback refs). | Local hook state or a hot mutable ref; never the saved document. | The owning controller and its pointer/keyboard adapters. | Active canvas/overlay and focused inspector only. | Not persisted. A committed scene result is persisted, not the gesture machinery. | Pointer-up/cancel, tool change, project change, or controller unmount. | Never serialized. Continuous item updates use compact transform-patch inputs, while pointer coordinates remain outside React state. |
| UI state | Panels, tabs, modals, inspector expansion, notifications, plan theme/layers/preset/unit/export preset, guided-action choices. Owned by shell/feature hooks such as `useDesignPageCoreShellBaseRegistration`, `useDesignPagePlanState`, and `CabinetryStudio`. | Local React state; selected preferences use local storage. | Owning shell or feature actions. | UI composition and presentation adapters. | No project persistence. Selected preferences may persist per browser profile in local storage. | Dialog close, route/project reset where applicable, or preference reset. | Deliberately excluded from `DesignPageHistorySnapshot` and saved scene documents. |
| Server state | Session/account, current catalog/commerce data, cloud design list/revisions, share state, billing operations. Owned by `useSession`, live-catalog/persistence/billing controllers, and route handlers. | Auth/API/database response or the static catalog fallback. | Server routes and their client query/controller boundary. | Access rules, catalog/checkout UI, persistence and sharing UI. | Server-defined. | Refetch, sign-out, route change, or explicit retry. | Never copied wholesale into editor state. A placed item stores only immutable visual `productSnapshot`; live price, stock, delivery, and purchase URLs continue to come from the current catalog. |

Selection is transient even though it changes which persistent objects a command
targets. Project identity (`designId`, share token, cloud revision) is session
coordination state, not scene content. History stacks are runtime state and are
never part of project, local-backup, API, or share payloads.

## Explicit scene mutation path

`HistoryManager.executeCommand` is the atomic boundary for discrete undoable
changes. A command has a stable ID, user-visible description, cloned
deterministic input, and one synchronous executor. The executor writes only
through a document owner. If input cloning, reduction, or writing throws, the
captured snapshot is restored and no history entry is added.

`beginContinuousCommand` / `updateContinuousCommand` /
`commitContinuousCommand` form the gesture boundary. Item dragging now sends
compact item-transform patches through this API. A single-item preview updates
the hot item ref and the `Furniture` component's local transform without
publishing a root document render on every pointer event; the final accepted
items are published once before commit. Group movement publishes intermediate
positions because the other selected scene objects must move too. Many pointer
updates still produce one history entry, and a failed update rolls the entire
gesture back. Moving across rooms discards the same-room preview and executes
one cross-room command, so a single pointer gesture does not create a preview
entry plus a transfer entry.

Pure reducers in `design-page-item-commands.ts` validate targets before
returning a new snapshot. Replace-room and cross-room multi-item operations are
all-or-nothing; zone membership is cleaned in the same reducer. They import no
React, browser, DOM, or renderer objects.

The retained `begin` / `commit` API is a compatibility path for controllers not
yet migrated. New item document mutations, single/multi-room transfer, and item
drag must use the command API. `runHistoryTransaction` is the atomic adapter for
older plan actions that already expose a cohesive controller-level action.

## Undo/redo memory and reset policy

- Default capacity is 100 committed entries and can be lowered in tests or
  specialized hosts. Oldest entries are discarded first.
- Each entry contains cloned before/after document history snapshots. UI,
  server, selection, drag, and history state are excluded.
- A new committed command after undo clears the redo branch.
- Project load, recovery hydration, and new-project creation clear history.
- Persistence hydration does not open a user transaction.
- Presentation diagnostics call `getStatus`; they do not clone or expose stored
  snapshots. `getHistory` remains compatibility/debug-only and returns a
  defensive clone.

## Derived state and synchronization decisions

Phase 4 removed five copied UI-preference refs (`planTheme`, `planLayers`,
`planLayerPreset`, `planMeasurementUnit`, and `exportStylePreset`) and their
synchronization effects. Those values use their React owner directly and are no
longer captured/restored by scene undo. The `DesignSnapshot` ref also no longer
needs a synchronization effect because its owner setter updates state and ref
in one operation.

Room dimensions, active items/zones, room maps, shopping summaries, scene
entries, and plan projections remain selectors derived from the snapshot. Hot
refs are retained only where event-time callbacks need the latest canonical
value without a whole-shell render. Single-item pointer movement stays local;
drag lifecycle flags change only at gesture boundaries.

## Remaining direct-mutation migration schedule

The following compatibility paths are explicit debt, not an invitation to move
them into a global store:

| Priority | Existing path | Risk | Scheduled migration |
| --- | --- | --- | --- |
| P0 | `useDesignPageSelectionCoordinator.ts`, canonical topology delete | Manual begin/rollback/commit around several plan projections. | Next topology-command batch: one pure canonical projection result plus one atomic command. |
| P0 | `useDesignPageFloorPlanUnderlayController.ts`, template/upload/page/clear | Some asynchronous preparation is mixed with manual history completion. | Underlay resource-lifecycle batch: prepare assets first, then execute one synchronous document command; failures revoke temporary URLs. |
| P1 | `useDesignPageRoomPlanController.ts`, `useFloorManager.ts`, `useDesignPageRoomGeometry.ts` | Multi-room/floor edits are atomic React snapshots today but manually bracketed. | Room/floor command batch with deterministic room IDs supplied in payloads. |
| P1 | `useDesignPageCanvasInteractionController.ts` room/overlay resize and drag | One-entry gestures exist, but still use compatibility transactions. | Extend compact continuous command payloads to room and plan-overlay transforms. |
| P1 | `useDesignPageZoneController.ts`, `useDesignPageLayoutVersionsController.ts`, floor-plan tracing | Cohesive controller actions use direct begin/commit. | Convert to discrete `executeCommand` or the existing atomic transaction adapter after focused behavior tests. |

The command contract intentionally does not add networking, operational
transforms, collaborative cursors, or replay infrastructure. Stable command IDs
and cloned data payloads preserve a future integration seam without designing a
collaboration system in this phase.
