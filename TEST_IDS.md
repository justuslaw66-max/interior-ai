# Test IDs Reference

Add these `data-testid` attributes to your UI for E2E test selectors.

## Required Test IDs for E2E Tests

### Canvas & Scene
```tsx
<canvas data-testid="scene-canvas" />
<div data-testid="sofa-nudge">Place your sofa...</div>
<div data-testid="seating-zone">Seating Zone</div>
<div data-testid="onboarding-complete">Room setup complete!</div>
<div data-testid="item-in-scene">Item</div> {/* Every placed item */}
```

### Toasts & Messages
```tsx
<div data-testid="collision-toast">Cannot place here - collision</div>
<div data-testid="snap-toast">✓ Snapped to wall</div>
<div data-testid="room-works-message">Your room works!</div>
```

### Buttons
```tsx
<button data-testid="save-design">Save</button>
<button data-testid="load-design">📂 Load Design</button>
<button data-testid="create-share">🔗 Create Share Link</button>
<button data-testid="checkout-button">Checkout</button>
<button data-testid="add-room">+ Add Room</button>
<button data-testid="present-mode">👁️ Present Mode</button>
```

### Modals & Panels
```tsx
<div data-testid="edit-panel">Edit Panel</div>
<div data-testid="cart-panel">Shopping Cart</div>
<div data-testid="cart-item">Item</div> {/* Each cart item */}
<div data-testid="room-switcher">Room Selector</div>
<div data-testid="saved-view">Saved View</div>
<div data-testid="affiliate-confirm">Confirm Exit</div>
<div data-testid="room-select">Room Selector</div>
```

### Forms & Inputs
```tsx
<input data-testid="design-title" />
<input data-testid="share-url-input" readonly />
<input data-testid="cart-quantity" type="number" />
```

## Implementation Example

### Before (no test IDs)
```tsx
<button onClick={() => setShowPresentModal(true)}>
  👁️ Present Mode
</button>
```

### After (with test ID)
```tsx
<button 
  data-testid="present-mode"
  onClick={() => setShowPresentModal(true)}
>
  👁️ Present Mode
</button>
```

## Quick Checklist

Use this to add test IDs to your components:

- [ ] Canvas: `scene-canvas`
- [ ] Sofa nudge: `sofa-nudge`
- [ ] Seating zone: `seating-zone`
- [ ] Placed items: `item-in-scene`
- [ ] Save button: `save-design`
- [ ] Load button: `load-design`
- [ ] Share button: `create-share`
- [ ] Present button: `present-mode`
- [ ] Room switcher: `room-switcher`
- [ ] Cart panel: `cart-panel`
- [ ] Checkout button: `checkout-button`
- [ ] Edit panel: `edit-panel`
- [ ] Toasts: `collision-toast`, `snap-toast`
- [ ] Room selector: `room-select`
- [ ] Saved views: `saved-view`

These are minimal IDs needed for the 5 core E2E tests to work.
