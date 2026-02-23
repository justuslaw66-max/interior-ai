# Multi-Room Foundation - Integration Guide

## Overview

This guide walks through integrating the multi-room system into the existing editor. The changes are incremental and non-breaking - the system gracefully handles legacy single-room designs and auto-migrates them.

## Architecture

### Key Components Created

1. **lib/room-types.ts** - Core data models (Room, DesignSnapshot with rooms array, migrations)
2. **lib/room-hooks.ts** - React hooks for accessing active room data (useActiveRoom, useActiveRoomItems, etc.)
3. **components/RoomSwitcher.tsx** - UI component for switching between rooms
4. **lib/room-persistence.ts** - Save/load utilities and format converters
5. **lib/room-present-mode.ts** - Present mode support for multi-room navigation

### Design Principles

- **No breaking changes**: Legacy single-room designs auto-migrate to multi-room format
- **Scoped operations**: Items, zones, saved views are always filtered by activeRoomId
- **Instant switching**: Switching rooms doesn't affect undo/redo or UI state (just clears selection)
- **Transparent migration**: Existing code continues to work; new code uses multi-room APIs

## Integration Steps

### Step 1: Introduce roomId to Data Structures ✅ DONE

All core types now support roomId:
- `PlacedItem.roomId`
- `Zone.roomId`
- `SavedView.roomId` (part of Room structure)

### Step 2: Update app/page.tsx State Management

**Current structure:**
```typescript
type DesignSnapshot = {
  items: PlacedItem[];
  zones?: Zone[];
  roomBounds?: RoomBounds;
};

const [designSnapshot, setDesignSnapshot] = useState<DesignSnapshot>({
  items: fallbackItems,
  zones: [],
});
```

**New structure will be:**
```typescript
import { DesignSnapshot, migrateToMultiRoom, switchRoom } from "@/lib/room-types";
import { useActiveRoomItems, useActiveRoomZones } from "@/lib/room-hooks";

// Load existing designs via migration
const loadedSnapshot = legacyApiToSnapshot(data);

// Use active room items/zones
const items = useActiveRoomItems(designSnapshot);
const zones = useActiveRoomZones(designSnapshot);
```

**Migration path:**
1. Keep existing `designSnapshot` state
2. Wrap state getters with `migrateToMultiRoom()` if needed
3. Replace item/zone getters with `useActiveRoomItems()`, `useActiveRoomZones()`
4. Add `onSwitchRoom` handler that calls `switchRoom()`

### Step 3: Update Item/Zone Management

**Adding an item to active room:**
```typescript
// OLD:
const newItems = [...items, newItem];
commitItems(newItems);

// NEW:
const room = getActiveRoom(designSnapshot);
const newItem = { ...item, roomId: room.id };
const updatedRoom = { ...room, items: [...room.items, newItem] };
commitItems(updatedRoom);
```

**Updating zones in active room:**
```typescript
// Use updateZonesInActiveRoom helper
updateZonesInActiveRoom(
  designSnapshot,
  nextZones,
  setDesignSnapshot
);
```

### Step 4: Integrate Room Switcher UI

Add to the top of the editor canvas:

```typescript
import { RoomSwitcher } from "@/components/RoomSwitcher";
import { switchRoom } from "@/lib/room-types";

<RoomSwitcher
  snapshot={designSnapshot}
  onSwitchRoom={(roomId) => {
    setDesignSnapshot(switchRoom(designSnapshot, roomId));
    // Clear selection when switching rooms
    setSelectedItemId(null);
  }}
  disabled={mode !== "design"}
/>
```

### Step 5: Update Save/Load Snapshot

**When loading from API:**
```typescript
import { legacyApiToSnapshot } from "@/lib/room-persistence";

const data = await fetch(`/api/designs/${id}`).then(r => r.json());
const snapshot = legacyApiToSnapshot(data);
setDesignSnapshot(snapshot);
```

**When saving to API:**
```typescript
import { snapshotToLegacyApi } from "@/lib/room-persistence";

const legacyData = snapshotToLegacyApi(designSnapshot);
await fetch(`/api/designs/${id}`, {
  method: "PUT",
  body: JSON.stringify(legacyData)
});
```

**Guest mode (localStorage):**
```typescript
import { saveToLocalStorage, loadFromLocalStorage } from "@/lib/room-persistence";

// Save
saveToLocalStorage(designSnapshot);

// Load
const saved = loadFromLocalStorage();
if (saved) setDesignSnapshot(saved);
```

### Step 6: Update Present Mode ✅ DONE

Present mode now supports room navigation:

```typescript
import { createPresentModeState, getPresentModeNavigation } from "@/lib/room-present-mode";

const [presentState, setPresentState] = useState(
  createPresentModeState(designSnapshot)
);

const nav = getPresentModeNavigation(designSnapshot, presentState);
// Now can switch rooms and navigate saved views per room
```

### Step 7: Undo/Redo Considerations

**Current approach:** Undo/redo includes room switches (recommended for now)
- Room ID is part of the snapshot, so switching rooms is undoable
- When undoing, the room switches along with item changes

**Future optimization:** Room-scoped undo/redo
- Each room maintains its own history
- Switching rooms doesn't clear undo/redo for other rooms
- Requires HistoryManager modifications

For now, keep current approach (simpler, works well).

## Migration Checklist

### Phase 1: Foundation (Non-Breaking) ✅
- [x] Create room type definitions
- [x] Create migration utilities
- [x] Create active room hooks
- [x] Create room switcher UI
- [x] Create present mode utilities
- [ ] **Next: Update app/page.tsx state**

### Phase 2: Editor Integration
- [ ] Add roomId to all new items/zones created in editor
- [ ] Update item/zone commitment functions to use room context
- [ ] Filter items/zones by activeRoomId in all queries
- [ ] Add room switcher to editor UI
- [ ] Clear selection when switching rooms

### Phase 3: Persistence
- [ ] Update API routes to use migration helpers
- [ ] Update guest mode to save/load multi-room snapshots
- [ ] Test migration of legacy designs
- [ ] Add multi-room support to share mode

### Phase 4: Mobile & Share
- [ ] Update share link to work with all rooms (show dropdown)
- [ ] Update present mode to support room navigation
- [ ] Add keyboard shortcuts for room switching in present mode

## Testing Checklist

- [ ] Load legacy single-room design → auto-migrates to multi-room
- [ ] Add item in one room → doesn't appear in other rooms
- [ ] Switch rooms → selection clears, but undo/redo works
- [ ] Save design → DB stores multi-room format
- [ ] Load saved design → loads all rooms correctly
- [ ] Present mode → can switch rooms and navigate views
- [ ] Share link → works across all rooms
- [ ] Guest mode → localStorage saves/loads multi-room format

## Key Implementation Notes

1. **Always use migration**: Call `migrateToMultiRoom()` on any snapshot received from API or localStorage. It's safe to call repeatedly (idempotent).

2. **Active room context**: All operations default to `activeRoomId`. No "global" item list anymore.

3. **Selection clearing**: When switching rooms, clear any selected items. This keeps the UI calm and prevents confusion.

4. **Backward compatibility**: The system supports both old and new formats. Existing API endpoints continue to work without modification using the legacy format converters.

5. **Type safety**: Use the helper functions (`useActiveRoomItems`, `addItemToActiveRoom`, etc.) rather than manually managing room context. This prevents bugs from missed roomId assignments.

## Common Patterns

### Get current room data
```typescript
const room = getActiveRoom(designSnapshot);
const items = room?.items ?? [];
const zones = room?.zones ?? [];
```

### Add multiple items (e.g., during onboarding)
```typescript
let current = designSnapshot;
for (const itemDef of itemsToAdd) {
  const item = { ...itemDef, roomId: room.id };
  current = {
    ...current,
    rooms: current.rooms.map(r =>
      r.id === room.id
        ? { ...r, items: [...r.items, item] }
        : r
    )
  };
}
setDesignSnapshot(current);
```

### Filter items by category in active room
```typescript
const items = getActiveRoomItems(snapshot).filter(
  item => CATALOG_ITEMS[item.productId]?.category === "sofa"
);
```

### Ensure all zone refs are valid when setting
```typescript
const nextZones = normalizeZones(autoZones, room.items);
updateZonesInActiveRoom(
  designSnapshot,
  nextZones,
  setDesignSnapshot
);
```

## Rollout Strategy

1. **Soft launch**: Deploy room foundation code (no UI changes yet)
2. **Limited beta**: Show room switcher to 10% of users, gather feedback
3. **Full rollout**: Enable for everyone with toggle in settings
4. **Pro feature**: Add "Add Room" button behind Pro plan later

## Future Enhancements

1. **Room templates**: "Create bedroom from template" with pre-set bounds and furniture
2. **Room-scoped history**: Each room has independent undo/redo
3. **Per-room budgets**: Track spending per room separately
4. **Room-specific AI suggestions**: "Best sofa for this bedroom size"
5. **Whole-home rendering**: 3D view of all rooms connected
6. **Export per-room**: Generate PDF/images for each room separately
