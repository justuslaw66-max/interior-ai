# Colour tokens and dark mode

Dark mode is modelled on Apple's: colours are named for their role, each with a light and a dark value. The plan is `claude/dark-mode-plan-2026-10-13.md` in the project; this is step 3 (22 Oct 2026).

## Where the colours live

`app/globals.css` holds every token twice:
- **`:root, [data-color-scheme="light"]`:** the light values. They are today's colours, and most point at the Tailwind colour they replaced (`--control-primary: var(--color-neutral-900)`), so light renders the same pixels.
- **`[data-color-scheme="dark"]`:** the dark values. They are J's choices: black panels and bar, `#1C1C1E` cards, fields and dialogs, `#2C2C2E` floating bars, the menus over the canvas and the fields in dialogs, white text with Apple's 60% grey, near-white primaries, grey fills for secondary controls, a red tint for deleting.

`@theme inline` maps each token to a Tailwind colour, so it's a utility: `bg-surface`, `text-label`, `border-separator`, `bg-control-primary` and so on.

**The tokens:**
- **Roles:**
  - `surface`, `surface-secondary`, `surface-elevated`, `surface-elevated-secondary` and `surface-floating`;
  - `label` and `label-secondary`;
  - `separator` and `link`.
- **The shared controls' colours,** `control-*`, which `components/ui` (Button, SegmentedControl, Chip, ChoiceTile) draw with: the primary and its hover and text; the secondary and its hover and border; the quiet hover; idle labels; the segmented track; the hover edge; the danger fill, hover, border and text. Also `control-badge`, a stronger grey (a step's number, the avatar's hover), and `control-handle` (the phone sheet's handle).
- **The editor's shell (step 5.1, 24 Oct):**
  - `surface-toast` and `on-surface-toast`, the Undo toast (`#171717` in light, `#3A3A3C` in dark), with `toast-control` and its hover for its Undo;
  - `accent-tint`, `accent-tint-border` and `on-accent-tint`, Pro's blue: the Pro tools pill, and Get Pro's word;
  - `surface-tab-bar`, the phone's steps along the bottom. It's opaque (the canvas can sit under it), so the translucent `control-track` can't stand in; the current step is a `surface-floating` card.
- **The step panel (step 5.2a, 24 Oct):**
  - `box-border`, the hairline around cards, boxes and fields in light (none in dark), and `separator-subtle`, the lighter line inside a card;
  - `field` (fields, and the boxes inside a card) and `tile` (light's grey tiles), both `#2C2C2E` in dark;
  - `surface-band`, the lower part of a card (light's grey band; no fill in dark), and `surface-floating-secondary`, a card inside a floating menu (`#3A3A3C` in dark);
  - `swatch-edge` and `label-tertiary` (placeholders);
  - the status colours: `success-tint`, `warning-tint` and `danger-tint`, each with `-border` and an `on-` text colour. Light uses today's tints (emerald, amber, red); dark uses Apple's system colours over a tint of themselves. Blue is the existing `accent-tint` set.
- **Floating surfaces (step 5.2b, 24 Oct):**
  - `surface-floating-edge`, a floating card's hairline where light has none (transparent in light);
  - the `floating-*` values that a floating surface swaps in (below): `floating-card`, `floating-field`, `floating-tile` and `floating-elevated` (`#3A3A3C` in dark), `floating-on-danger` and `floating-on-danger-tint` (`#FF8A84`), and `floating-on-accent-tint` (`#64B0FF`). In light each is the value it replaces. They aren't utilities.
- **Over the canvas (step 5.2c, 25 Oct):**
  - `surface-canvas`, the canvas card's own colour (`#F4F2ED` in light, `#1C1C1E` in dark). While a room prepares the scene fades out and the cover over the window is see-through, so the card shows in its shape and the frame stays as it is (J, 25 Oct);
  - `control-switch-off` and `control-switch-knob`, the Tips switch's track and knob when it is off. On, it is `control-primary` with a `control-on-primary` knob (J: the near-white of the pressed controls in dark).
- **The rest of the editor (dark mode PR 1, 25 Oct):**
  - `surface-page`, the page behind Shop's and Start a new design's cards: `#FAFAF9` in light, black in dark, like the panels, so their cards are `surface-secondary` (`#1C1C1E`);
  - `surface-well`, the grey body behind the floor-plan workspace's cards (`neutral-100` at 70% in light), with nothing in dark, where the dialog's own `#1C1C1E` shows behind `#2C2C2E` cards.
- **The pages outside the editor (dark mode PR 2, 26 Oct):** `surface-grouped`, the grey page behind white cards (the shared design, the status pages): `neutral-100` in light, black in dark.
- **The page tokens from before** (`--bg-canvas`, `--text-primary`, `--accent`, `--focus`…), with dark values too. Screens fold into the roles as they move.

## The switch

- **Dark applies only under `data-color-scheme="dark"`** (J, 22 Oct), the attribute the `dark:` variant also uses. Nothing in the app sets it yet: it's for previews and tests.
- **Once the editor and the pages it opens are on tokens,** one change makes the app follow the device. It adds an `@media (prefers-color-scheme: dark)` block with the dark values.
- **`data-color-scheme="light"` holds a subtree light.** Admin's frame (`AdminShell`) and access page (`AdminAccessDenied`) carry it: Admin stays light (plan decision 7).
- **`color-scheme`** is `light` or `dark` with the tokens, so the browser's own controls and scrollbars match.

## Adding or changing a token

- Give it both values, in both blocks, and a `--color-*` line in `@theme inline` if it's used as a utility.
- `scripts/test-designer-theme-contrast.ts` (the required `ci.pro-visual-static` gate) checks:
  - both blocks define the same tokens;
  - light values match what the controls drew with before, and the dark values J chose;
  - text reaches 4.5:1 on each surface it sits on, with translucent fills read over each surface;
  - the focus ring and the primary edge reach 3:1.
- **The delete look's red reads 4.1:1 over a floating bar in dark,** and blue on its tint 4.0:1. On a floating surface they are `#FF8A84` and `#64B0FF` (5.0:1), through the swaps below.

## Which surface

- **Panels and the bar:** `surface`. **The step panel's cards:** `surface-secondary` with `box-border`.
- **Fields and boxes inside a card:** `field`; grey tiles: `tile`; the lower part of a card: `surface-band` (J, 24 Oct: no fill in dark, with `separator-subtle` above).
- **Dialogs:** `surface-elevated`, with their fields and cards `surface-elevated-secondary`. A dialog's card that holds status or boxes carries `data-surface="floating"`, like the rail's cards: in dark the card is `#2C2C2E`, where red and blue words on their tints read about 4.1:1, so they lighten, and boxes inside (`tile`, `field`) step up to `#3A3A3C`.
- **Pages** (Shop, Start a new design, My designs): `surface-page`, with `surface-secondary` cards and `box-border`. **Grey pages** (the shared design, the status pages): `surface-grouped`. The shared design follows the device like the app (J, 26 Oct); the export page and its PDF stay light, held with `data-color-scheme="light"` like Admin.
- **Built-ins** (a full-window dialog over the editor) **is drawn like the editor** (J, 28 Oct), not like a dialog: its panel is `surface` with `ring-surface-floating-edge` (a hairline in dark only), Guided setup's page and the Detailed editor's `surface-page`, its header, footer and Detailed columns `surface` with `separator` edges, its cards `surface-secondary` with `box-border`, and boxes and fields `tile` and `field`. What sits over its preview (the view buttons, the summary chips, the validation card) is `surface-floating` at today's opacity, like the overlays on the canvas. Its 3D preview and grounds, the template pictures and the drag handles' dark pills stay as they are until the canvases move (step 6).
- **Tooltips** on the canvas's tool row: the toast's colours, `surface-toast` and `on-surface-toast`.
- **Anything over the canvas** (the canvas toolbar, the phone's pills, Pro's tool rail, the right rail) **and the menus that open over it** (More, Account, Saved views): `surface-floating`. Since the inset frame the canvas is `#1C1C1E` in dark, the same as `surface-elevated`, so a menu on the elevated surface would only be told from the canvas by its line (J, 24 Oct).
- **A floating card that holds fields or status** (the right rail's cards, the inspector from md, the Selected panel and the Selected built-in panel, the bars for a door, a group or a zone, the level stack) carries `data-surface="floating"`. Under it, `surface-secondary` (a ChoiceTile, for one), `field`, `tile` and `surface-elevated` are `#3A3A3C` in dark, a step up from the card's `#2C2C2E`, and Delete's word, `on-danger-tint` and `on-accent-tint` lighten (J, 24 Oct: `#FF8A84` for Delete on the rail). Its edge is `border-separator`, or `ring-surface-floating-edge` where light draws no line. A box nested in a tile goes back to `surface-floating` with a `separator` edge, so status chips never sit on `#3A3A3C`, where they would read about 4.2:1. In the phone's step sheet the inspector is a `surface-secondary` card without the attribute.

**Photos and drawings stay light** (J, 25 Oct): product photos keep their light backdrop in dark (they are JPGs on their own light backgrounds, so photo and letterbox read as one tile), and so do the gallery's buttons over a photo. Plan drawings (Start's template pictures, the import review's source plan, the Levels map) stay light until the canvases move (step 6).

**One colour system** (J, 25 Oct): status is green, amber and red on their tints, and information is blue (`accent-tint`). Other hues fold in: sky and violet to blue, orange to amber, category chips (Tileable, Sample) to grey chips (`control-track`).

## Moving screens

- **Screens move folder by folder** (plan step 5). Replace hard-coded `bg-white`, `bg-neutral-*`, `text-neutral-*`, `border-neutral-*`, `text-white` and `bg-black` with roles.
- **`scripts/test-ui-foundations.tsx` counts those classes** (`neutralColours`, 2,851 after step 3, 2,848 after the inset frame, 2,738 after the laminate picker and the editor's shell, 2,399 after the step panel, 2,137 after the right rail, 2,024 after the overlays on the canvas, 1,475 after the rest of the editor, 1,267 after the pages outside it, 1,103 after Built-ins' frame, Guided setup and previews, 846 after its Detailed editor, 793 after the Selected built-in panel), and the count can only go down.
- **The `.text-neutral-400`, `-500` and `-600` overrides** at the end of `globals.css` are a light-only fix. They go once their users have moved.

The edge between the panels and the canvas, the rounded inset frame, is in `editor-canvas-frame.md`.
