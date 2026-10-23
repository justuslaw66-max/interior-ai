# The editor's canvas frame (the rounded inset)

Dark mode's edge between the panels and the canvas (J, 13 Oct 2026: "Rounded inset"), built as the layout for both appearances (J, 23 Oct: dock the step panel, a warm canvas, Client Preview full window). The boards are on the dark-mode design canvas, under "The rounded inset frame, from today's real editor (23 Oct)".

## The layout

From md (768px):
- **The frame** is the bar and the space round the canvas. The bar sits on it with no line under it.
- **The step panel is docked in the frame**: a column of cards 8px from the left edge (Pro's beside the tool rail), from 8px under the bar to 8px above the bottom. Hidden (⌘B), it leaves its edge strip, and revealed from the strip it floats over the canvas.
- **The canvas is a card** with 12px corners, 8px from the panel, the bar, the right edge and the bottom. The scene is the card's size, so the 2D plan and the 3D room centre in what's visible.
- **The right rail** (Levels, the navigator, the inspector) floats inside the card, 8px from its top and right edges.

Phones keep the whole window (the step sheet and the bottom nav), and so does Client Preview, which has no bar or panels to frame.

## Where it lives

- **`lib/editor-canvas-insets.ts`:**
  - `resolveCanvasFrameBox` gives the card's distance from each side of the editor. There are a few frames, and each is one object, so effects can depend on it.
  - `resolvePlanFitInsetsPx` takes the 2D fit's insets, measured from the editor's sides, with the frame, and gives them from the card's edges. The left and top ones change; the right ones stand, since the right rail moved in with the card's edge.
  - `isWideEditor` tells md from a canvas's width and its frame: a 1024 window's card is under 768px wide.
- **`components/editor/canvas/CanvasFrameCard.tsx`** is the card. It wraps the scene in `DesignSceneCanvas`, with the canvas's error boundary.
- **The frame is worked out twice, from the same inputs,** as the step panel's inset was: in `useDesignPagePlanPresentationModel` (the card and the 2D and 3D fits) and in `DesignPageEditorChrome` (the canvas toolbar, centred on the card).

## Colour

The canvas is the warm `#F4F2ED` in 2D as well as 3D, so in light the card stands out from the white frame (1.12:1, as in 3D). In dark the frame is black and the canvas `#1C1C1E` (1.23:1).

## Known limits

- While Plan's canvas focus hides the step panel (drawing a room), the card widens, but the toolbar stays centred where the panel would be: the chrome doesn't see the focus.
- Plan's tool row and the other overlays centred with `left-1/2` stay on the window's centre, as before; only the canvas toolbar centres on the card.
- On a tablet the step panel steps aside for a right panel (`lib/tablet-panel-policy.ts`), so the card widens while the right panel is open.
