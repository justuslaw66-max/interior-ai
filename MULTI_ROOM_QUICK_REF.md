# Multi-Room API Quick Reference

## Core Types (room-types.ts)

```typescript
interface Room {
  id: string;
  name: string;
  type: "living_room" | "bedroom" | "kitchen" | /* ... */;
  bounds: { width: number; depth: number; wallThickness?: number };
  items: PlacedItem[];
  zones: Zone[];
  savedViews: SavedView[];
}

interface DesignSnapshot {
  rooms: Room[];
  activeRoomId: string;
  title?: string;
  style?: string;
  budget?: "budget" | "mid" | "luxury";
  mode?: "guest" | "design" | "present" | "adjust";
}

// PlacedItem and Zone now have roomId field
type PlacedItem = { /* ... */ roomId?: string };
type Zone = { /* ... */ roomId?: string };
```

## Common Operations

### Get Active Room Data

```typescript
// React hook approach (recommended)
import { useActiveRoomItems, useActiveRoomZones } from "@/lib/room-hooks";

const items = useActiveRoomItems(snapshot);
const zones = useActiveRoomZones(snapshot);

// Direct approach
import { getActiveRoom } from "@/lib/room-types";

const room = getActiveRoom(snapshot);
const items = room?.items ?? [];
```

### Switch Rooms

```typescript
import { switchRoom } from "@/lib/room-types";

const nextSnapshot = switchRoom(snapshot, roomId);
setDesignSnapshot(nextSnapshot);
```

### Add Item to Active Room

```typescript
// The room context is automatic
const room = getActiveRoom(snapshot);
const newItem = { ...item, roomId: room.id };
const updatedRoom = { ...room, items: [...room.items, newItem] };
const nextSnapshot = {
  ...snapshot,
  rooms: snapshot.rooms.map(r => r.id === room.id ? updatedRoom : r)
};
```

### Get All Rooms for UI

```typescript
import { getAllRoomNames } from "@/lib/room-hooks";

const rooms = getAllRoomNames(snapshot);
// Returns: { id, name, type, isActive }[]
```

## Save/Load (room-persistence.ts)

```typescript
// Save to localStorage
import { saveToLocalStorage } from "@/lib/room-persistence";
saveToLocalStorage(snapshot);

// Load from localStorage
import { loadFromLocalStorage } from "@/lib/room-persistence";
const loaded = loadFromLocalStorage();

// Load from legacy API (auto-migrates)
import { legacyApiToSnapshot } from "@/lib/room-persistence";
const snapshot = legacyApiToSnapshot(apiResponse);

// Convert to legacy API format for saving
import { snapshotToLegacyApi } from "@/lib/room-persistence";
const apiBody = snapshotToLegacyApi(snapshot);
```

## Present Mode (room-present-mode.ts)

```typescript
import {
  createPresentModeState,
  getPresentModeNavigation,
  switchPresentModeRoom,
  nextPresentModeView,
  previousPresentModeView
} from "@/lib/room-present-mode";

// Initialize present mode
const [presentState, setPresentState] = useState(
  createPresentModeState(snapshot)
);

// Get current room/view
const nav = getPresentModeNavigation(snapshot, presentState);
// nav = {
//   rooms: [{ id, name, isActive }],
//   currentRoom: Room | null,
//   currentView: SavedView | null,
//   viewCount: number,
//   currentViewNumber: number
// }

// Handle navigation
setPresentState(nextPresentModeView(snapshot, presentState));
setPresentState(switchPresentModeRoom(presentState, roomId));
```

## UI Components

### Room Switcher

```typescript
import { RoomSwitcher } from "@/components/RoomSwitcher";

<RoomSwitcher
  snapshot={snapshot}
  onSwitchRoom={(roomId) => {
    // Handle room switch
    // Remember to clear selection!
  }}
  onAddRoom={() => {
    // Pro feature - add new room
  }}
/>

// Vertical variant
import { RoomSwitcherVertical } from "@/components/RoomSwitcher";
<RoomSwitcherVertical {...props} />
```

## Helper Functions

### Check if items are in the same room

```typescript
const item1 = { ...item, roomId: "room-1" };
const item2 = { ...item, roomId: "room-1" };

// Both in same room
console.assert(item1.roomId === item2.roomId);
```

### Create migration to multi-room

```typescript
import { migrateToMultiRoom } from "@/lib/room-types";

const legacySnapshot = { items: [], zones: [] };
const modern = migrateToMultiRoom(legacySnapshot);
// Returns: { rooms: [/* room with legacy items */], activeRoomId }
```

### Create a new room

```typescript
import { createRoom, addRoom } from "@/lib/room-types";

const newRoom = createRoom("room-2", "Bedroom", "bedroom", {
  width: 3.5,
  depth: 4,
  wallThickness: 0.2
});

const nextSnapshot = addRoom(snapshot, newRoom);
```

## Migration Helpers (room-persistence.ts)

```typescript
// Format: What you store in DB/localStorage
interface StoredDesign {
  rooms: Room[];
  activeRoomId: string;
  title?: string;
  // ...
}

// Convert snapshot ↔ storage format
const stored = snapshotToStored(snapshot);
const snapshot = storedToSnapshot(stored);

// Auto-convert from legacy API responses
const snapshot = legacyApiToSnapshot({
  id, title, roomWidth, roomDepth, items, zones, ...
});

// Convert to legacy API format for PUT requests
const body = snapshotToLegacyApi(snapshot);
```

## Integration Points in app/page.tsx

### State Initialization

```typescript
// OLD
const [designSnapshot, setDesignSnapshot] = useState<DesignSnapshot>({
  items: fallbackItems,
  zones: [],
});

// NEW
const [designSnapshot, setDesignSnapshot] = useState<DesignSnapshot>(
  migrateToMultiRoom({
    items: fallbackItems,
    zones: [],
  })
);
```

### Item Operations

```typescript
// OLD
commitItems([...items, newItem]);

// NEW - wrap with room context
const room = getActiveRoom(designSnapshot);
const itemWithRoom = { ...newItem, roomId: room.id };
setDesignSnapshot({
  ...designSnapshot,
  rooms: designSnapshot.rooms.map(r =>
    r.id === room.id
      ? { ...r, items: [...r.items, itemWithRoom] }
      : r
  )
});
```

### Zone Updates

```typescript
// OLD
setDesignSnapshot({ ...designSnapshot, zones: nextZones });

// NEW
const room = getActiveRoom(designSnapshot);
const zonesWithRoom = nextZones.map(z => ({ ...z, roomId: room.id }));
setDesignSnapshot({
  ...designSnapshot,
  rooms: designSnapshot.rooms.map(r =>
    r.id === room.id
      ? { ...r, zones: zonesWithRoom }
      : r
  )
});
```

### Load from API

```typescript
// OLD
const data = await fetch(...).then(r => r.json());
setDesignSnapshot({ items: data.items, zones: data.zones });

// NEW
const data = await fetch(...).then(r => r.json());
const snapshot = legacyApiToSnapshot(data);
setDesignSnapshot(snapshot);
```

### Save to API

```typescript
// OLD
await fetch(...PUT, { items: snapshot.items, zones: snapshot.zones });

// NEW
const body = snapshotToLegacyApi(snapshot);
await fetch(...PUT, body);
```

## Common Mistakes to Avoid

❌ **Don't**: Filter items without checking roomId
```typescript
// WRONG: Gets items from ALL rooms
const items = snapshot.rooms.flatMap(r => r.items);
```

✅ **Do**: Use active room context
```typescript
// RIGHT: Gets items from active room only
const room = getActiveRoom(snapshot);
const items = room?.items ?? [];
```

---

❌ **Don't**: Forget to add roomId to new items
```typescript
// WRONG: Item has no roomId, will be invisible
setItems([...items, { productId: "sofa-1", ... }]);
```

✅ **Do**: Include roomId
```typescript
// RIGHT: Item has roomId, will appear in room
const room = getActiveRoom(snapshot);
setItems([...items, { productId: "sofa-1", roomId: room.id, ... }]);
```

---

❌ **Don't**: Save whole design without migration
```typescript
// WRONG: Loses room structure
localStorage.setItem("design", JSON.stringify(snapshot));
```

✅ **Do**: Use persistence helpers
```typescript
// RIGHT: Preserves all rooms
saveToLocalStorage(snapshot);
```

---

❌ **Don't**: Manually switch rooms without effects
```typescript
// WRONG: Room changes but selection/camera stays
setActiveRoomId(newId);
```

✅ **Do**: Clear selection and reset view
```typescript
// RIGHT: Clean room switch
setDesignSnapshot(switchRoom(snapshot, newId));
setSelectedItemId(null);
resetCamera();
```
