# The editor's canvas frame (the rounded inset)

Dark mode's edge between the panels and the canvas (J, 13 Oct 2026: "Rounded inset"), built as the layout for both appearances (J, 23 Oct: dock the step panel, a warm canvas, Client Preview full window). The boards are on the dark-mode design canvas, under "The rounded inset frame, from today's real editor (23 Oct)".

## The layout

From md (768px):
- **The frame** is the bar and the space round the canvas. The bar sits on it with no line under it.
- **The step panel is docked in the frame**: a column of cards 8px from the left edge (Pro's beside the tool rail), from 8px under the bar to 8px above the bottom. Hidden (⌘B), it leaves its edge strip, and revealed from the strip it floats over the canvas.
- **The canvas is a card** with 12px corners, 8px from the panel, the bar, the right edge and the bottom. The scene is the card's size; the 2D fit and 3D's lens keep the plan and the room clear of what floats over it, so they centre in what's visible.
- **The right rail** (Levels, the navigator, the inspector) floats inside the card, 8px from its top and right edges.

Phones keep the whole window (the step sheet and the bottom nav), and so does Client Preview, which has no bar or panels to frame.

## Where it lives

- **`lib/editor-canvas-insets.ts`:**
  - `resolveCanvasFrameBox` gives the card's distance from each side of the editor. There are a few frames, and each is one object, so effects can depend on it.
  - `resolvePlanFitInsetsPx` takes the 2D fit's insets, measured from the editor's sides, with the frame, and gives them from the card's edges. The left and top ones change; the right ones stand, since the right rail moved in with the card's edge.
  - `isWideEditor` tells md from a canvas's width and its frame: a 1024 window's card is under 768px wide.
- **`components/editor/canvas/CanvasFrameCard.tsx`** is the card. It wraps the scene in `DesignSceneCanvas`, with the canvas's error boundary. `CanvasLensShift`, beside it, is 3D's lens (below).
- **The frame is worked out twice, from the same inputs,** as the step panel's inset was: in `useDesignPagePlanPresentationModel` (the card and the 2D and 3D fits) and in `DesignPageEditorChrome` (the canvas toolbar, centred on the card).

## 3D's lens

The right rail floats inside the card, so a 3D view centred on the card's middle sits partly under it (the Mac's screenshots, 23 Oct). Instead of moving the camera to make room, the lens moves: `CanvasLensShift` sets the perspective camera's view offset so the picture's centre sits midway between the step panel's margin and the rail (`resolveCanvas3DInsetsPx`, `resolveCanvasLensShiftPx`: 140px left of the card's middle at 1440 wide). Every 3D view (the default, a room's fit or focus, a saved view, an orbit) centres there, from the angle it was set at, and clicks, labels and the QA hooks follow, since they all project through the camera.

- The whole-home view fits the home between the same insets and centres it on the lens, so its camera only slides sideways for perspective (0.25m for the studio template), in every panel state. Before the frame it slid from 0.85m one way to 0.95m the other as the panel opened and closed.
- Client Preview, and so the image exports, which render in it, have no rail and no shift. Nor do phones; under 1024 wide there's no rail either, so the lens only clears the panel's margin.
- 2D's camera is orthographic and isn't shifted: the 2D fit keeps its own insets.

## Colour

The canvas is the warm `#F4F2ED` in 2D as well as 3D, so in light the card stands out from the white frame (1.12:1, as in 3D). In dark the frame is black and the canvas `#1C1C1E` (1.23:1).

## Known limits

- While Plan's canvas focus hides the step panel (drawing a room), the card widens, but the toolbar stays centred where the panel would be: the chrome doesn't see the focus.
- Plan's tool row and the other overlays centred with `left-1/2` stay on the window's centre, as before; only the canvas toolbar centres on the card.
- On a tablet the step panel steps aside for a right panel (`lib/tablet-panel-policy.ts`), so the card widens while the right panel is open.
- The 2D fit leaves room for the right rail as it was at the last automatic fit, so in a guest's first 2D view at 1280 wide the room's east wall sits just under the inspector, which opens after the fit. The line does the same (by 20px there, 22px here).
