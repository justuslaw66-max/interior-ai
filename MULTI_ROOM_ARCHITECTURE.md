# Multi-Room Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          APP (app/page.tsx)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ UI Layer                                                    │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │   │
│  │  │ Room Switcher│  │ Design Canvas│  │ Sidebar Menu │      │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │   │
│  │         │                 │                 │               │   │
│  │         └─────────────────┼─────────────────┘               │   │
│  │                           │                                 │   │
│  │                  onChange / onRoomSwitch                    │   │
│  └───────────────────────────┼─────────────────────────────────┘   │
│                              │                                     │
│  ┌───────────────────────────▼─────────────────────────────────┐   │
│  │ State Management                                            │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  const [designSnapshot, setDesignSnapshot] = useState()    │   │
│  │                                                               │   │
│  │  designSnapshot: {                                          │   │
│  │    rooms: Room[]                                            │   │
│  │    activeRoomId: string                                     │   │
│  │    ...metadata                                              │   │
│  │  }                                                           │   │
│  └───────────────────────────┬─────────────────────────────────┘   │
│                              │                                     │
│  ┌───────────────────────────▼─────────────────────────────────┐   │
│  │ State Selectors (React Hooks)                              │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  useActiveRoom()           → Room | null                    │   │
│  │  useActiveRoomItems()      → PlacedItem[]                   │   │
│  │  useActiveRoomZones()      → Zone[]                         │   │
│  │  useActiveRoomSavedViews() → SavedView[]                    │   │
│  │  getAllRoomNames()         → { id, name, isActive }[]       │   │
│  │                                                               │   │
│  └───────────────────────────┬─────────────────────────────────┘   │
│                              │                                     │
│  ┌───────────────────────────▼─────────────────────────────────┐   │
│  │ Action Handlers                                             │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  commitItems(items)        → adds roomId, updates room only │   │
│  │  commitZones(zones)        → adds roomId, updates room only │   │
│  │  switchRoom(roomId)        → sets activeRoomId              │   │
│  │  addItemToActiveRoom()     → auto-scoped to room            │   │
│  │  updateZonesInActiveRoom() → auto-scoped to room            │   │
│  │                                                               │   │
│  └───────────────────────────┬─────────────────────────────────┘   │
│                              │                                     │
└──────────────────────────────┼─────────────────────────────────────┘
                               │
                    Read/Write snapshot
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
  ┌──────────┐         ┌──────────────┐       ┌──────────────┐
  │ Database │         │ localStorage │       │ Present Mode │
  └──────────┘         └──────────────┘       └──────────────┘
```

## Data Model Hierarchy

```
DesignSnapshot
├── rooms[]
│   ├── Room (id: "room-1", name: "Living Room")
│   │   ├── id: string
│   │   ├── name: string
│   │   ├── type: RoomType ("living_room" | "bedroom" | etc)
│   │   ├── bounds: { width, depth, wallThickness }
│   │   ├── items: PlacedItem[]
│   │   │   └── { instanceId, productId, variantId, position, roomId: "room-1", ... }
│   │   ├── zones: Zone[]
│   │   │   └── { id, type, itemIds, roomId: "room-1", ... }
│   │   └── savedViews: SavedView[]
│   │       └── { id, name, cameraPosition, cameraTarget }
│   │
│   └── Room (id: "room-2", name: "Bedroom")
│       └── [ same structure as Room 1 ]
│
└── activeRoomId: "room-1"
```

## State Flow: Adding an Item

```
User clicks "Add Sofa"
        │
        ▼
┌─────────────────────────┐
│ commitItems([...])      │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│ const room = getActiveRoom(snapshot)        │
└────────────┬────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────┐
│ const itemWithRoom = { ...item, roomId: room.id }        │
│ const updatedRoom = { ...room, items: [...] }           │
└────────────┬─────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────┐
│ setDesignSnapshot({                                    │
│   ...snapshot,                                         │
│   rooms: snapshot.rooms.map(r =>                       │
│     r.id === room.id ? updatedRoom : r                 │
│   )                                                    │
│ })                                                     │
└────────────┬───────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│ UI re-renders with updated items for room    │
│ Items from other rooms are NOT affected      │
└──────────────────────────────────────────────┘
```

## State Flow: Switching Rooms

```
User clicks "Bedroom" tab
        │
        ▼
handleSwitchRoom("room-2")
        │
        ├─ setDesignSnapshot(switchRoom(snapshot, "room-2"))
        │   └─ activeRoomId changes from "room-1" to "room-2"
        │
        ├─ setSelectedItemId(null)  [Clear selection]
        │
        ├─ resetCamera()             [Reset view]
        │
        └─ track("editor_room_switched")
                │
                ▼
        ┌──────────────────────────────┐
        │ UI re-renders:               │
        ├──────────────────────────────┤
        │ useActiveRoomItems()         │
        │  → filters by room-2         │
        │                              │
        │ useActiveRoomZones()         │
        │  → filters by room-2         │
        │                              │
        │ Canvas shows room-2 items    │
        └──────────────────────────────┘
```

## Save/Load Flow

```
SAVE:
┌────────────────────┐
│ app/page.tsx       │  Click Save
└────────┬───────────┘
         │
         ▼
┌─────────────────────────────┐
│ snapshotToLegacyApi()       │
│ Converts multi-room format  │
│ to legacy API format        │
└────────┬────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ POST /api/designs/[id]               │
│ { roomWidth, roomDepth, items, ... } │
│ (single-room format for compat)      │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ Database stores design               │
│ (using existing schema)              │
└──────────────────────────────────────┘


LOAD:
┌──────────────────────────────────────┐
│ GET /api/designs/[id]                │
│ Returns legacy API format            │
│ { roomWidth, roomDepth, items, ... } │
└────────┬─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ legacyApiToSnapshot()       │
│ Auto-migrates to multi-room │
│ creates room with items     │
└────────┬────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ setDesignSnapshot()        │
│ Snapshot now has rooms[]   │
│ and activeRoomId           │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│ UI renders multi-room      │
│ Single room appears as     │
│ migration of old design    │
└────────────────────────────┘
```

## Present Mode Flow

```
User clicks "Present"
        │
        ▼
┌────────────────────────────────────────┐
│ presentModeState = createPresentModeState() │
│ {                                          │
│   currentRoomId: string                    │
│   currentViewIndex: number                 │
│ }                                          │
└────────┬───────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│ Press Space / Right Arrow              │
└────────┬───────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ handlePresentModeKeyPress()             │
│  → nextPresentModeView(state)           │
│  → currentViewIndex incremented         │
└────────┬────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ getPresentModeSavedView()                │
│ Changes camera to new view in room       │
└──────────────────────────────────────────┘


Press number key for room (future)
        │
        ▼
┌──────────────────────────────────────────┐
│ switchPresentModeRoom()                  │
│  → currentRoomId changes                 │
│  → currentViewIndex resets to 0          │
└────────┬─────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ getPresentModeRoom() gets new room       │
│ Shows room's items and first saved view  │
└──────────────────────────────────────────┘
```

## File Dependencies

```
app/page.tsx (to be modified)
  ├─ lib/room-types.ts (import types)
  ├─ lib/room-hooks.ts (import hooks)
  ├─ lib/room-persistence.ts (import converters)
  ├─ lib/room-present-mode.ts (import for present mode)
  └─ components/RoomSwitcher.tsx (import UI)

components/RoomSwitcher.tsx
  └─ lib/room-hooks.ts (import getAllRoomNames)

lib/room-hooks.ts
  └─ lib/room-types.ts (import types & helpers)

lib/room-persistence.ts
  └─ lib/room-types.ts (import types & migrateToMultiRoom)

lib/room-present-mode.ts
  └─ lib/room-types.ts (import types & getActiveRoom)

Tests (future)
  ├─ lib/room-types.ts (unit tests)
  ├─ lib/room-hooks.ts (hook tests)
  ├─ lib/room-persistence.ts (conversion tests)
  ├─ components/RoomSwitcher.tsx (component tests)
  └─ integration tests with app/page.tsx
```

## Component Interaction Diagram

```
                    ┌─────────────────────┐
                    │  app/page.tsx       │
                    │  (root component)   │
                    └──────────┬──────────┘
                               │
                 ┌─────────────┼─────────────┐
                 │             │             │
                 ▼             ▼             ▼
      ┌────────────────┐  ┌───────────┐  ┌──────────┐
      │ RoomSwitcher   │  │  Canvas3D │  │ Sidebar  │
      └────────┬───────┘  └─────┬─────┘  └────┬─────┘
               │                │             │
               │ onSwitchRoom   │ onItemsAdd  │ onZoneCreate
               │                │             │
               └────────────────┼─────────────┘
                                │
                        onChange snapshot
                                │
                    ┌───────────▼──────────┐
                    │ State Management     │
                    │ (hooks + selectors)  │
                    └─────────────────────┘
```

## Migration Path (Legacy → Multi-Room)

```
Legacy Format:
┌──────────────────────────────┐
│ DesignSnapshot               │
├──────────────────────────────┤
│ items: PlacedItem[]          │
│ zones: Zone[]                │
│ roomBounds: RoomBounds       │
│ (no roomId fields)           │
└──────────────────────────────┘
        │
        │ migrateToMultiRoom(snapshot)
        ▼
┌──────────────────────────────┐
│ DesignSnapshot (Multi-Room)  │
├──────────────────────────────┤
│ rooms: [                     │
│   {                          │
│     id: "room-1"             │
│     name: "Living Room"      │
│     type: "living_room"      │
│     bounds: RoomBounds       │
│     items: [ ...with roomId ]│
│     zones: [ ...with roomId ]│
│     savedViews: []           │
│   }                          │
│ ]                            │
│ activeRoomId: "room-1"       │
└──────────────────────────────┘

This is AUTOMATIC on load - transparent to user
```

## Concurrency & Thread Safety

All state mutations happen through `setDesignSnapshot()`:
- React batches updates
- No race conditions possible
- Undo/redo captures full snapshot
- All operations are atomic

```
commit operation 1 → snapshot v1
commit operation 2 → snapshot v2  (reads from v1, outputs v2)
commit operation 3 → snapshot v3  (reads from v2, outputs v3)
                ↓
         undo/redo point
```

## Performance Characteristics

```
Operation              Time Complexity    Notes
─────────────────────────────────────────────────
getActiveRoom()        O(n)              n = rooms (typically <10)
useActiveRoomItems()   O(1)              filtered by activeRoomId
switchRoom()           O(r+i)            r = rooms, i = items in new room (negligible)
migrateToMultiRoom()   O(i)              i = total items (one-time on load)
saveToLocalStorage()   O(d)              d = snapshot size (~100-500KB typical)
renderRoomSwitcher()   O(r)              r = rooms, very lightweight component
```

All operations are fast enough for smooth UX (< 16ms for 60fps)
