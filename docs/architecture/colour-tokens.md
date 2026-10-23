# Colour tokens and dark mode

Dark mode is modelled on Apple's: colours are named for their role, each with a light and a dark value. The plan is `claude/dark-mode-plan-2026-10-13.md` in the project; this is step 3 (22 Oct 2026).

## Where the colours live

`app/globals.css` holds every token twice:
- **`:root, [data-color-scheme="light"]`:** the light values. They are today's colours, and most point at the Tailwind colour they replaced (`--control-primary: var(--color-neutral-900)`), so light renders the same pixels.
- **`[data-color-scheme="dark"]`:** the dark values. They are J's choices: black panels and bar, `#1C1C1E` cards, fields, dialogs and menus, `#2C2C2E` floating bars and the fields in dialogs, white text with Apple's 60% grey, near-white primaries, grey fills for secondary controls, a red tint for deleting.

`@theme inline` maps each token to a Tailwind colour, so it's a utility: `bg-surface`, `text-label`, `border-separator`, `bg-control-primary` and so on.

**The tokens:**
- **Roles:**
  - `surface`, `surface-secondary`, `surface-elevated`, `surface-elevated-secondary` and `surface-floating`;
  - `label` and `label-secondary`;
  - `separator` and `link`.
- **The shared controls' colours,** `control-*`, which `components/ui` (Button, SegmentedControl, Chip, ChoiceTile) draw with: the primary and its hover and text; the secondary and its hover and border; the quiet hover; idle labels; the segmented track; the hover edge; the danger fill, hover, border and text.
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
- **The delete look's red reads 4.1:1 over a floating bar in dark,** so deletes stay off the floating bars.

## Moving screens

- **Screens move folder by folder** (plan step 5). Replace hard-coded `bg-white`, `bg-neutral-*`, `text-neutral-*`, `border-neutral-*`, `text-white` and `bg-black` with roles.
- **`scripts/test-ui-foundations.tsx` counts those classes** (`neutralColours`, 2,851 after step 3), and the count can only go down.
- **The `.text-neutral-400`, `-500` and `-600` overrides** at the end of `globals.css` are a light-only fix. They go once their users have moved.
