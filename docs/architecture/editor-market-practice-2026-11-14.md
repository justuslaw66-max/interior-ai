# Editor: following market practice (14 Nov 2026)

J's browser check of layout block resize (PR #298, 13 Nov 2026) turned up seven issues. J asked to research how the major apps handle each one and follow them. The research is in the project doc `claude/browser-test-layout-block-resize-2026-11-13.md` and the chat that followed it. This note records what changed and why.

## Lock

- **Practice:** Figma and Canva block moving, resizing and editing a locked item on the canvas. Canva lets anyone who can edit lock or unlock, from the selected item's padlock. Live Home 3D hides an object's handles while it's locked.
- **Before:** resize refused any locked item, but move, rotate, duplicate, delete, align, zone layout and room moves only honoured a lock in Pro (`isDesigner && locked`). Lock and its badge were Pro-only, so a block locked in Pro couldn't be resized or unlocked by a consumer.
- **Now:**
  - A lock holds in Consumer and Pro alike, everywhere a transform checks it.
  - The Lock / Unlock button is in the item panel's header for anyone who can edit (`SelectedItemPanelHeader`), and the padlock badge shows in both modes.
  - A locked item on the plan shows only its corners: no resize or rotate handles (`ItemRenderer2D`).
- **Unused inputs:** `isDesigner` / `designerMode` stay in three input types that callers still fill (`DesignPageSelectionTransformConfiguration`, the scene drag state, `SelectedItemDetailsPanel`'s props, and `SceneItemsLayer`'s configuration). They're marked as no longer read; removing them means a wider caller change, left as follow-up.

## Handle sizes and the rotate knob

- **Practice:**
  - Apple's minimum touch target is 44 pt, Material's is 48 dp, and WCAG 2.2's is 24×24 CSS px.
  - Canva and Planner 5D turn an item with a separate knob outside its outline, and show the angle while turning.
- **Now (`lib/plan-handle-sizes.ts`):** grab areas are a fixed size on screen at any zoom.
  - With a mouse or trackpad: corners 24 px, sides 16 px, rotate knob 24 px.
  - On a touch screen (`pointer: coarse`): corners 44 px, sides 28 px, rotate knob 44 px.
  - The knob sits 28 px (44 px on touch) off the item's edge, clear of the edge's grab area, and is lifted above neighbouring items' pick volumes like a block's resize handles.
  - The angle readout sits just above the knob.
  - The Rotate / Copy / Delete chips sit a fixed distance above the item's edge (46 px, 72 px on touch), clear of the knob. They used to sit 0.34 m out, which covered the moved knob (J's browser check, 14 Nov 2026). The knob stays on the item's top side, because the turn maths (`resolvePointerRotationRadians`) reads the angle from the top.
  - The chips flip below the item when the spot above is off the plan or under the plan's own controls (the 2D/3D switch on a phone), as Figma and Canva flip a selection toolbar (`lib/selected-chips-placement.ts`). The spot is checked whenever the item has moved on screen, not every few frames: the plan only redraws while something changes, and a throttled check missed the frame where the phone sheet's framing came to rest. A spot counts as clear when it shows anything inside the plan's own area (the canvas, its labels, the chips themselves); only the page's controls over the plan count as covering it. The chips sit over the door and window labels (z 22 against their 20), under the page's controls (40 and up).
  - Every drei `<Html>` that sits over an item (the chips, the name label, the size labels, the angle readout) passes `PLAN_HTML_PASS_THROUGH` (`lib/plan-html-overlay.ts`) as its style. Html's wrapper keeps the content's box at the anchor even when the content is moved off it with a CSS transform, and by default that box takes the pointer; the second browser check found the lifted chips' unseen box over a block's top edge, so the edge couldn't be dragged (desktop and phone). Only the chips and an unselected name take the pointer now.
  - A resize handle remembers where it was taken hold of (`layoutBlockResizeGrab`) and keeps that gap while dragged, so the side follows the drag instead of jumping to the pointer. With 44 px touch handles the jump was up to 22 px, and a corner taken for an edge on a small block changed both sizes.
  - Once an item is selected, its name label lets the pointer through. On a phone's small plan the label covered a block's whole outline, so no handle could be reached.
  - The knob's grab area used to be about 10 px across at the default zoom, and a missed grab panned the plan.

## Phone editing

- **Practice:** Canva's phone app keeps the selection on the canvas and puts actions in a bottom toolbar. Interior apps such as Live Home 3D and Planner 5D keep the resize and rotation handles on the plan.
- **Before:** on a phone the 320 px desktop item panel floated over the plan, so the handles couldn't be reached, and closing the panel deselected the item.
- **Now (`selectedItemPanelPlacement.ts`):**
  - Below md the item panel moves into the phone's step sheet, the same slot a wall or door inspector uses.
  - The sheet opens to half height and the plan is framed above it. The on-canvas Rotate / Copy / Delete chips are the action bar, and the sheet's handle pulls it up for the rest.
  - The Pro cabinet panel still floats on phones (follow-up).

## Cursor style on touch screens

- **Practice:** iPad shows Pointer Control only while a pointing device is connected.
- **Now:**
  - Preferences shows Cursor style only when `any-pointer: fine` matches, and it appears as soon as a mouse or trackpad is connected.
  - On a touch-only device the panel says there is nothing to set yet and that connecting a mouse or trackpad shows the cursor style.

## Inches as fractions

- **Practice:** SketchUp's architectural units and US tape measures use fractions of an inch, typically to 1/16″.
- **Now (`lib/inch-fractions.ts`, `lib/display-units.ts`):**
  - Feet + inches and inches show the nearest 1/16″, reduced: 3′ 11 3/8″ and 47 3/8 in, instead of 3′ 11.4″ and 47.402 in. Under an inch keeps its 0 in feet + inches (4′ 0 3/8″).
  - Entry accepts a fraction or a decimal: 47 3/8, 47-3/8, 3/8 and 47.4 all work.
  - Imperial fields open the text keyboard on phones, which has the "/" key.
  - Numeric scalar APIs (aria values, cabinetry steps) keep decimals.
  - Metric units are unchanged.

## Units on a locked item

The item panel's Units menu stays usable while the item is locked: it's the design's display setting, not the item's.

## Copy

- **Size guidance:** a layout block's item panel no longer says "Catalogue size is preserved"; it says "Set its size above, or drag its edges on the plan."
- **Room setup chip:** the openings chip under Room setup reads "2 doors & windows" (or "1 door or window") instead of "2 placed", which read as two of the items. It still shows the step's status when a door is needed.
