import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readEditorCommandBarSource } from "./editor-command-bar-test-utils";
import { darkCanvasColour, darkFloorTint, hasDarkCanvasColour } from "../lib/canvas-colours";

// The editor's colour contract. Its name is older than its job: the Pro "designer theme" it
// once checked was never switched on and went in UX 5l (13 Oct 2026). It checks the colour
// tokens in light and in dark (the dark mode modelled on Apple's,
// claude/dark-mode-plan-2026-10-13.md; step 3, 22 Oct) and their contrast, and that the retired
// theme stays gone.

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const css = read("app/globals.css");
const consumerTheme = css.match(/:root,\s*\[data-color-scheme="light"\]\s*\{([\s\S]*?)\n\}/)?.[1];
const darkTheme = css.match(/\[data-color-scheme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1];

assert.ok(consumerTheme, "Consumer theme tokens should be defined.");
assert.ok(darkTheme, "Every colour token should have a dark value.");

function readConsumerHexToken(name: string): string {
  const match = consumerTheme?.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(match?.[1], `The consumer theme should define --${name} as a six-digit hex color.`);
  return match[1];
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
  assert.ok(channels && channels.length === 3, `Expected an RGB hex color, received ${hex}.`);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

const consumerTokens = {
  "bg-canvas": "#ffffff",
  "bg-panel": "#ffffff",
  "bg-panel-hover": "#f6f7fb",
  "text-primary": "#0b0d12",
  "text-secondary": "#4b5568",
  "text-muted": "#636363",
  accent: "#275fcb",
  focus: "#275fcb",
  success: "#20553f",
  danger: "#dc2626",
} as const;

for (const [name, expected] of Object.entries(consumerTokens)) {
  assert.equal(
    readConsumerHexToken(name).toLowerCase(),
    expected,
    `Consumer token --${name} should remain unchanged.`
  );
}

// Consumer text tokens are read on white: muted text, the accent and danger need 4.5:1 (AX7),
// and the focus ring and success fills 3:1 against the page.
for (const name of ["text-primary", "text-secondary", "text-muted", "accent", "danger", "success"] as const) {
  const ratio = contrastRatio(readConsumerHexToken(name), readConsumerHexToken("bg-panel"));
  assert.ok(ratio >= 4.5, `Consumer --${name} on white is ${ratio.toFixed(2)}:1; expected at least 4.5:1.`);
}
assert.ok(
  contrastRatio(readConsumerHexToken("focus"), readConsumerHexToken("bg-canvas")) >= 3,
  "The consumer focus ring should reach 3:1 against the page."
);
assert.match(
  css,
  /@layer base \{\s*:focus-visible \{\s*outline: 2px solid var\(--focus\);\s*outline-offset: 2px;/,
  "Every control should get one 2px focus ring from the base layer (AX6)."
);
assert.match(
  css,
  /@layer utilities \{\s*\.text-neutral-400 \{/,
  "The darker neutral text sits in the utilities layer, so hover and disabled variants still apply."
);

// Dark mode step 3 (J, 22 Oct). Every colour token has a light value, today's, and a dark one: the
// roles (surfaces, labels, the separator and the link) and the shared controls' colours. Light
// points at the Tailwind colours the controls drew with before, so light mode doesn't change.
type Rgba = readonly [number, number, number, number];
const tokenValues = (block: string) =>
  new Map(Array.from(block.matchAll(/^\s*--([a-z-]+):\s*([^;]+);/gm), ([, name, value]) => [name, value.trim()]));
const lightTokens = tokenValues(consumerTheme);
const darkTokens = tokenValues(darkTheme);
assert.deepEqual([...darkTokens.keys()].sort(), [...lightTokens.keys()].sort(), "Light and dark define the same tokens.");
assert.match(consumerTheme, /^\s*color-scheme: light;/m, "Light tells the browser its controls and scrollbars are light.");
assert.match(darkTheme, /^\s*color-scheme: dark;/m, "Dark tells the browser its controls and scrollbars are dark.");

const LIGHT_ROLE_TOKENS = {
  surface: "var(--color-white)",
  "surface-secondary": "var(--color-white)",
  "surface-elevated": "var(--color-white)",
  "surface-elevated-secondary": "var(--color-white)",
  "surface-floating": "var(--color-white)",
  label: "var(--color-neutral-900)",
  "label-secondary": "#525252",
  separator: "var(--color-neutral-200)",
  link: "#275fcb",
  "surface-toast": "var(--color-neutral-900)",
  "on-surface-toast": "var(--color-white)",
  "toast-control": "rgba(255, 255, 255, 0.15)",
  "toast-control-hover": "rgba(255, 255, 255, 0.25)",
  "accent-tint": "var(--color-blue-50)",
  "accent-tint-border": "var(--color-blue-200)",
  "on-accent-tint": "var(--color-blue-700)",
  "surface-tab-bar": "var(--color-neutral-100)",
  "box-border": "var(--color-neutral-200)",
  "separator-subtle": "var(--color-neutral-100)",
  field: "var(--color-white)",
  tile: "var(--color-neutral-50)",
  "surface-band": "color-mix(in oklab, var(--color-neutral-50) 80%, transparent)",
  "surface-floating-secondary": "var(--color-neutral-50)",
  "swatch-edge": "rgba(0, 0, 0, 0.1)",
  "label-tertiary": "var(--color-neutral-400)",
  "success-tint": "var(--color-emerald-50)",
  "success-tint-border": "var(--color-emerald-200)",
  "on-success-tint": "var(--color-emerald-700)",
  "warning-tint": "var(--color-amber-50)",
  "warning-tint-border": "var(--color-amber-300)",
  "on-warning-tint": "var(--color-amber-800)",
  "danger-tint": "var(--color-red-50)",
  "danger-tint-border": "var(--color-red-200)",
  "on-danger-tint": "var(--color-red-700)",
  "surface-floating-edge": "transparent",
  "floating-card": "var(--color-white)",
  "floating-field": "var(--color-white)",
  "floating-tile": "var(--color-neutral-50)",
  "floating-elevated": "var(--color-white)",
  "floating-on-danger": "var(--color-white)",
  "floating-on-danger-tint": "var(--color-red-700)",
  "floating-on-accent-tint": "var(--color-blue-700)",
  "surface-canvas": "#f4f2ed",
  "control-switch-off": "var(--color-neutral-500)",
  "control-switch-knob": "var(--color-white)",
  "surface-page": "#fafaf9",
  "surface-well": "color-mix(in oklab, var(--color-neutral-100) 70%, transparent)",
  "surface-grouped": "var(--color-neutral-100)",
  "control-primary": "var(--color-neutral-900)",
  "control-primary-hover": "var(--color-neutral-800)",
  "control-on-primary": "var(--color-white)",
  "control-secondary": "var(--color-white)",
  "control-secondary-hover": "var(--color-neutral-50)",
  "control-secondary-border": "var(--color-neutral-300)",
  "control-quiet-hover": "var(--color-neutral-100)",
  "control-label": "var(--color-neutral-800)",
  "control-label-idle": "var(--color-neutral-700)",
  "control-track": "var(--color-neutral-100)",
  "control-track-hover": "var(--color-white)",
  "control-edge-hover": "var(--color-neutral-400)",
  "control-badge": "var(--color-neutral-200)",
  "control-handle": "var(--color-neutral-300)",
  "control-danger": "var(--color-red-600)",
  "control-danger-hover": "var(--color-red-700)",
  "control-danger-border": "var(--color-red-600)",
  "control-on-danger": "var(--color-white)",
} as const;
for (const [name, value] of Object.entries(LIGHT_ROLE_TOKENS)) {
  assert.equal(lightTokens.get(name), value, `Light --${name} keeps the colour it drew with before.`);
}
// J's dark surfaces (13 Oct: black panels, #1C1C1E cards; 22 Oct: dialogs #1C1C1E with #2C2C2E
// fields, Apple's 60% grey), the near-white primary (14 Oct), the shell's toast and the phone's
// steps (24 Oct: a #3A3A3C toast; a #1C1C1E bar with the current step a #2C2C2E card), the step
// panel (24 Oct: cards with no outline, fields #2C2C2E, no band, the menu's room card #3A3A3C), and
// the right rail (24 Oct: floating cards with a hairline, fields #3A3A3C, Delete's word #FF8A84), and
// what covers the canvas while a room prepares (25 Oct: the canvas's own colour), and the rest of the
// editor (25 Oct: Shop and Start a black page like the panels; no grey behind the workspace's cards).
const DARK_CHOICES = {
  surface: "#000000",
  "surface-secondary": "#1c1c1e",
  "surface-elevated": "#1c1c1e",
  "surface-elevated-secondary": "#2c2c2e",
  "surface-floating": "#2c2c2e",
  "label-secondary": "rgba(235, 235, 245, 0.6)",
  "control-primary": "#f5f5f7",
  "surface-toast": "#3a3a3c",
  "surface-tab-bar": "#1c1c1e",
  "box-border": "transparent",
  field: "#2c2c2e",
  "surface-band": "transparent",
  "surface-floating-secondary": "#3a3a3c",
  "surface-floating-edge": "rgba(84, 84, 88, 0.65)",
  "floating-card": "#3a3a3c",
  "floating-field": "#3a3a3c",
  "floating-tile": "#3a3a3c",
  "floating-on-danger": "#ff8a84",
  "surface-canvas": "#1c1c1e",
  "surface-page": "#000000",
  "surface-well": "transparent",
  "surface-grouped": "#000000",
} as const;
for (const [name, value] of Object.entries(DARK_CHOICES)) {
  assert.equal(darkTokens.get(name), value, `Dark --${name} is the value J chose.`);
}

// A floating surface (data-surface="floating") swaps these tokens for their floating values. In light
// the floating values are the ones they replace, so a floating surface looks as it did.
const FLOATING_SWAPS = {
  "surface-secondary": "floating-card",
  field: "floating-field",
  tile: "floating-tile",
  "surface-elevated": "floating-elevated",
  "control-on-danger": "floating-on-danger",
  "on-danger-tint": "floating-on-danger-tint",
  "on-accent-tint": "floating-on-accent-tint",
} as const;
const floatingScope = css.match(/\n\[data-surface="floating"\]\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(floatingScope, "A floating surface's token swaps should be defined.");
assert.deepEqual(
  Object.fromEntries(Array.from(floatingScope.matchAll(/^\s*--([a-z-]+):\s*var\(--([a-z-]+)\);/gm), ([, name, value]) => [name, value])),
  FLOATING_SWAPS,
  "A floating surface swaps exactly these tokens."
);
for (const [token, floating] of Object.entries(FLOATING_SWAPS)) {
  assert.equal(lightTokens.get(floating), lightTokens.get(token), `Light --${floating} is --${token}'s value, so light is unchanged.`);
}

// Tailwind 4's colours that the light tokens point at, in sRGB (its oklch values, rounded).
const TAILWIND_SRGB: Record<string, string> = {
  white: "#ffffff",
  "neutral-50": "#fafafa",
  "neutral-100": "#f5f5f5",
  "neutral-200": "#e5e5e5",
  "neutral-300": "#d4d4d4",
  "neutral-400": "#a1a1a1",
  "neutral-500": "#737373",
  "neutral-700": "#404040",
  "neutral-800": "#262626",
  "neutral-900": "#171717",
  "red-600": "#e7000b",
  "red-700": "#c10007",
  "blue-50": "#eff6ff",
  "blue-200": "#bedbff",
  "blue-700": "#1447e6",
  "emerald-50": "#ecfdf5",
  "emerald-700": "#007a55",
  "amber-50": "#fffbeb",
  "amber-800": "#973c00",
  "red-50": "#fef2f2",
};
function parseColour(value: string): Rgba {
  const tailwind = value.match(/^var\(--color-([a-z]+(?:-\d+)?)\)$/)?.[1];
  if (tailwind) {
    const hex = TAILWIND_SRGB[tailwind];
    assert.ok(hex, `Add Tailwind's ${tailwind} to TAILWIND_SRGB.`);
    return parseColour(hex);
  }
  if (value === "transparent") return [0, 0, 0, 0];
  const hex = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) return [Number.parseInt(hex[1], 16), Number.parseInt(hex[2], 16), Number.parseInt(hex[3], 16), 1];
  const rgba = value.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
  assert.ok(rgba, `Expected a hex, rgba() or Tailwind colour, received ${value}.`);
  return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])];
}
const over = ([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba => [
  r * a + br * (1 - a),
  g * a + bg * (1 - a),
  b * a + bb * (1 - a),
  1,
];
const hexOf = ([r, g, b]: Rgba) => `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;

// Text needs 4.5:1 on every surface it sits on; a translucent fill is read over each surface.
// Controls sit on panels, cards, dialogs and the floating bars. The delete look's red reads
// 4.1:1 over a floating bar in dark, so on a floating surface its word is floating-on-danger.
const GROUNDS = ["surface", "surface-secondary", "surface-elevated", "surface-elevated-secondary", "surface-floating"];
const CONTROL_GROUNDS = ["surface", "surface-secondary", "surface-elevated", "surface-floating"];
const DANGER_GROUNDS = ["surface", "surface-secondary", "surface-elevated"];
const TEXT_PAIRS: ReadonlyArray<readonly [text: string, fill: string | null, grounds: readonly string[]]> = [
  ["label", null, GROUNDS],
  ["label-secondary", null, GROUNDS],
  ["link", null, GROUNDS],
  ["control-on-primary", "control-primary", CONTROL_GROUNDS],
  ["label", "control-secondary", CONTROL_GROUNDS],
  ["control-label", "control-secondary", CONTROL_GROUNDS],
  ["control-label", null, CONTROL_GROUNDS],
  ["control-label-idle", "control-track", CONTROL_GROUNDS],
  ["control-label-idle", null, ["surface-secondary"]],
  ["control-on-danger", "control-danger", DANGER_GROUNDS],
  // The editor's shell: the toast and its Undo; Pro's blue, on its tint and as Get Pro's word, on
  // the bar; an idle step on the phone's bar; a step's number, on the track over the bar (in dark
  // the track over black is surface-secondary's grey; in light the number's grey is opaque).
  ["on-surface-toast", "surface-toast", ["surface"]],
  ["on-surface-toast", "toast-control", ["surface-toast"]],
  ["on-accent-tint", "accent-tint", ["surface"]],
  ["on-accent-tint", "control-secondary", ["surface"]],
  ["label-secondary", null, ["surface-tab-bar"]],
  ["control-label-idle", "control-badge", ["surface-secondary"]],
  // The step panel: text in fields, boxes and tiles inside a card; the status colours on their tints
  // over a card; and the More menu's room card inside the floating menu.
  ["label", null, ["field", "tile", "surface-floating-secondary"]],
  ["label-secondary", null, ["field", "tile", "surface-floating-secondary"]],
  ["control-label", null, ["field", "tile"]],
  ["on-success-tint", "success-tint", ["surface-secondary"]],
  ["on-warning-tint", "warning-tint", ["surface-secondary"]],
  ["on-danger-tint", "danger-tint", ["surface-secondary"]],
  ["on-accent-tint", "accent-tint", ["surface-secondary"]],
  // The right rail and the other floating surfaces: Delete, and the red and blue words on their tints,
  // in their floating colours; green and amber on their tints; text in fields, tiles and popovers.
  ["floating-on-danger", "control-danger", ["surface-floating"]],
  ["floating-on-danger-tint", "danger-tint", ["surface-floating"]],
  ["floating-on-accent-tint", "accent-tint", ["surface-floating"]],
  ["label-secondary", "accent-tint", ["surface-floating"]],
  ["on-success-tint", "success-tint", ["surface-floating"]],
  ["on-warning-tint", "warning-tint", ["surface-floating"]],
  ["on-success-tint", null, ["floating-tile"]],
  ["label", null, ["floating-card", "floating-field", "floating-tile", "floating-elevated"]],
  ["label-secondary", null, ["floating-card", "floating-field", "floating-tile", "floating-elevated"]],
  ["control-label-idle", null, ["floating-card"]],
  ["control-label", null, ["floating-field", "floating-tile"]],
  ["control-label-idle", "control-track", ["floating-tile"]],
  // Over the canvas: text on the canvas's own colour (what covers it while a room prepares), and the
  // tooltip on the tool row, in the toast's colours.
  ["label", null, ["surface-canvas"]],
  ["on-surface-toast", "surface-toast", ["surface-floating", "surface-canvas"]],
  // The rest of the editor: text and notices on Shop's and Start's page; the status colours in dialogs, on
  // the dialog and on its cards (a dialog's card that holds status is a floating surface, so its red and
  // blue words lighten, as on the rail).
  ["label", null, ["surface-page"]],
  ["label-secondary", null, ["surface-page"]],
  ["link", null, ["surface-page"]],
  ["on-accent-tint", "accent-tint", ["surface-page"]],
  ["on-warning-tint", "warning-tint", ["surface-page"]],
  ["on-danger-tint", "danger-tint", ["surface-page"]],
  ["on-success-tint", "success-tint", ["surface-elevated", "surface-elevated-secondary"]],
  ["on-warning-tint", "warning-tint", ["surface-elevated", "surface-elevated-secondary"]],
  ["on-danger-tint", "danger-tint", ["surface-elevated"]],
  ["on-accent-tint", "accent-tint", ["surface-elevated"]],
  ["floating-on-danger-tint", "danger-tint", ["surface-elevated-secondary"]],
  ["floating-on-accent-tint", "accent-tint", ["surface-elevated-secondary"]],
  ["control-on-primary", "control-primary", ["surface-elevated-secondary", "surface-page"]],
  ["label", "control-secondary", ["surface-elevated-secondary"]],
  // The pages outside the editor: text and links on the grey page (the shared design, the status pages),
  // and the primary control on it.
  ["label", null, ["surface-grouped"]],
  ["label-secondary", null, ["surface-grouped"]],
  ["link", null, ["surface-grouped"]],
  ["control-on-primary", "control-primary", ["surface-grouped"]],
];
// The focus ring and the primary's black (or near-white) edge need 3:1 against what's around them.
const EDGE_PAIRS: ReadonlyArray<readonly [edge: string, grounds: readonly string[]]> = [
  ["control-primary", CONTROL_GROUNDS],
  // A chosen ChoiceTile's edge on a floating surface's card.
  ["control-primary", ["floating-card"]],
];
// A switch's knob against its track, on and off, over a floating surface (the Tips switch).
const SWITCH_PAIRS: ReadonlyArray<readonly [knob: string, track: string]> = [
  ["control-on-primary", "control-primary"],
  ["control-switch-knob", "control-switch-off"],
];
for (const [mode, tokens, focus] of [
  ["light", lightTokens, readConsumerHexToken("focus")],
  ["dark", darkTokens, darkTokens.get("focus") ?? ""],
] as const) {
  const colour = (name: string) => {
    const value = tokens.get(name);
    assert.ok(value, `${mode} --${name} should be defined.`);
    return parseColour(value);
  };
  for (const [text, fill, grounds] of TEXT_PAIRS) {
    for (const ground of grounds) {
      const background = fill ? over(colour(fill), colour(ground)) : colour(ground);
      const foreground = over(colour(text), background);
      const ratio = contrastRatio(hexOf(foreground), hexOf(background));
      assert.ok(
        ratio >= 4.5,
        `${mode}: --${text} on ${fill ? `--${fill} over ` : ""}--${ground} is ${ratio.toFixed(2)}:1; expected at least 4.5:1.`
      );
    }
  }
  for (const [knob, track] of SWITCH_PAIRS) {
    const trackColour = over(colour(track), colour("surface-floating"));
    const ratio = contrastRatio(hexOf(over(colour(knob), trackColour)), hexOf(trackColour));
    assert.ok(ratio >= 3, `${mode}: the switch knob --${knob} on --${track} is ${ratio.toFixed(2)}:1; expected at least 3:1.`);
  }
  for (const [edge, grounds] of [...EDGE_PAIRS, ["focus", CONTROL_GROUNDS] as const]) {
    for (const ground of grounds) {
      const edgeColour = edge === "focus" ? parseColour(focus) : colour(edge);
      const ratio = contrastRatio(hexOf(over(edgeColour, colour(ground))), hexOf(colour(ground)));
      assert.ok(ratio >= 3, `${mode}: --${edge} against --${ground} is ${ratio.toFixed(2)}:1; expected at least 3:1.`);
    }
  }
}

// The shared controls draw only with the tokens, so their colours change in one place.
for (const file of ["Button", "SegmentedControl", "Chip", "ChoiceTile"]) {
  assert.doesNotMatch(
    read(`components/ui/${file}.tsx`),
    /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|inset-ring|outline)-(?:white|black|accent|(?:neutral|gray|red|blue)-\d+)(?![\w-])/,
    `components/ui/${file}.tsx should use the colour tokens.`
  );
}
// Admin stays light whatever the device (plan decision 7).
for (const file of ["app/admin/AdminShell.tsx", "app/admin/AdminAccessDenied.tsx"]) {
  assert.match(read(file), /<div className=\{styles\.page\} data-color-scheme="light">/, `${file} holds Admin light.`);
}

// The retired designer theme stays gone (UX 5l): no theme attribute, no designer palette, and
// no component switching its colours on a dark flag. Dark mode comes back as tokens.
assert.doesNotMatch(css, /data-theme/, "No stylesheet rule may key on a data-theme attribute.");
assert.doesNotMatch(
  css,
  /--(?:bg-frame|bg-command|text-on-dark|accent-on-dark|accent-designer|status-[a-z]+-(?:bg|border|text))\b/,
  "The designer palette's tokens should not come back."
);
const retiredThemeProps = /\b(?:showDesignerTheme|designerTheme|forceLight)\b|\bdark\s*\?|\bdark=\{|data-theme=/;
const sourceRoots = ["app", "components", "features", "lib"];
const sourceFiles: string[] = [];
const collect = (directory: string) => {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(relativePath);
    else if (/\.tsx?$/.test(entry.name)) sourceFiles.push(relativePath);
  }
};
sourceRoots.forEach(collect);
const themedFiles = sourceFiles.filter((file) => retiredThemeProps.test(read(file)));
assert.deepEqual(themedFiles, [], "No component should take the retired dark/designer theme flags.");

const commandBarSource = readEditorCommandBarSource(root);
assert.match(
  commandBarSource,
  /data-testid=\{step\.testId\}[\s\S]*?data-active=\{step\.active \? "true" : "false"\}[\s\S]*?aria-current=\{step\.active \? "step" : undefined\}/,
  "The design steps should expose the current step semantically."
);
assert.match(
  commandBarSource,
  /if \(saveStatus\.tone === "error"\) return "text-danger";[\s\S]*?return "text-success";/,
  "The save status line keeps red for Not saved and green for Saved (UX 4c)."
);
assert.match(
  commandBarSource,
  /data-testid="pro-mode-indicator"[\s\S]{0,300}?aria-label="Pro tools on"[\s\S]{0,300}?>Pro tools</,
  "The shared command bar should clearly label Pro mode without changing its theme."
);

const legacySurfacePattern = /#(?:10131a|12151d|151820|1b2030)/i;
for (const relativePath of [
  "components/editor/DesignControlsAiPanel.tsx",
  "components/editor/DesignControlsFurnishPanel.tsx",
  "components/editor/DesignControlsPlanPanel.tsx",
  "components/editor/FloorPlanUploadPanel.tsx",
  "components/editor/design-page/DesignPageWorkspace.tsx",
  "components/editor/design-page/SelectedItemPanel.tsx",
]) {
  assert.doesNotMatch(read(relativePath), legacySurfacePattern, `${relativePath} should not restore the legacy blue-black Pro palette.`);
}

const designPageSource = read("components/editor/design-page/DesignPageWorkspace.tsx");
assert.doesNotMatch(
  designPageSource,
  /<(?:EditorCommandBar|RoomPlanStatusBar)\b/,
  "The workspace should delegate command and room-status composition to the wrapper."
);
assert.doesNotMatch(
  designPageSource,
  /<SceneReadyVeil/,
  "The design workspace should delegate the loading veil to the viewport overlay layer."
);
// Shop is one light page over the canvas for everyone (audit finding FU8; J's Q6, 27 Sep), not a dock.
const designPagePanelRegionSource = read("components/editor/design-page/DesignPagePanelRegion.tsx");
assert.match(
  designPagePanelRegionSource,
  /data-testid="shop-step"[\s\S]{0,200}?bg-surface-page/,
  "Shop should be an opaque page over the canvas."
);
assert.doesNotMatch(designPagePanelRegionSource, /shopping-dock/, "Shop should not come back as a dock.");
assert.match(
  read("components/editor/design-page/DesignPageViewportOverlayLayer.tsx"),
  /state\.sceneLoadingVisible \? \([\s\S]{0,250}?<SceneReadyVeil \/>/,
  "The viewport overlay layer should own scene-loading veil composition."
);
assert.match(
  read("lib/design-page-viewport-workspace-read-model.ts"),
  /sceneLoading: sceneRoomRead\.state\.scene\.showSceneLoadingVeil,/,
  "The viewport read model should say when the scene is still loading."
);
assert.match(
  read("components/editor/design-page/SelectedSurfaceInspector.tsx"),
  /\{pro \? \([\s\S]{0,200}?data-testid="surface-inspector-publish-status"[\s\S]{0,200}?header\.draft/,
  "Pro sees material publication statuses (UX 4f, ED5)."
);
assert.match(
  read("lib/useDesignPagePlanPresentationModel.ts"),
  /const sceneBackgroundColor = "#f4f2ed";/,
  "The canvas is the warm #f4f2ed in 3D and 2D, so its card stands out from the white frame (J, 23 Oct)."
);

const designSceneCanvasSource = read("components/editor/design-page/DesignSceneCanvas.tsx");
assert.match(
  designSceneCanvasSource,
  /<Canvas[\s\S]*?data-shadow-maps-enabled=\{[\s\S]*?effectiveShadowsEnabled[\s\S]*?data-tone-mapping="aces"[\s\S]*?data-lighting-model="central-environment-sun-ambient"[\s\S]*?shadows=\{effectiveShadowsEnabled \? QUALITY_SHADOW_FILTER : false\}[\s\S]*?<LightingSystem/,
  "The whole-home renderer should mount the central preset-driven lighting system."
);
assert.doesNotMatch(
  designSceneCanvasSource,
  /physicallyCorrectLights/,
  "The whole-home renderer should not restore the obsolete physical-light assignment."
);
assert.match(
  read("components/editor/design-page/lighting/LightingSystem.tsx"),
  /<ExposureController[\s\S]*?<EnvironmentController[\s\S]*?<ambientLight[\s\S]*?<SunController/,
  "The central lighting system should own renderer output and the complete global light stack."
);
assert.match(
  read("components/editor/design-page/lighting/ExposureController.tsx"),
  /THREE\.SRGBColorSpace[\s\S]*?THREE\.ACESFilmicToneMapping[\s\S]*?lighting\.renderer\.exposure/,
  "The renderer controller should own sRGB output, ACES tone mapping, and preset exposure."
);

assert.match(
  css,
  /@custom-variant dark \(&:where\(\[data-color-scheme="dark"\], \[data-color-scheme="dark"\] \*\)\);/,
  "Tailwind dark: utilities must be opt-in; following the OS setting half-themes the light-first dialogs."
);
assert.doesNotMatch(
  css,
  /@media\s*\(prefers-color-scheme:\s*dark\)/,
  "Until the editor is on the colour tokens, dark follows data-color-scheme only, not the device (J, 22 Oct)."
);

// The canvases (dark mode PR 4): WebGL can't read the tokens, so lib/canvas-colours swaps each light
// colour the 2D plan and the 3D view's surroundings draw with for its dark one. J's look (28 Oct):
// the canvas card's #1C1C1E paper, Apple's dark green, blue and orange, labels floating at #2C2C2E.
for (const [light, dark] of [
  ["#f4f2ed", "#1c1c1e"],
  ["#f3f5f5", "#232325"],
  ["#22c55e", "#30d158"],
  ["#0284c7", "#409cff"],
  ["#c2410c", "#ff9f0a"],
  ["#2a66ff", "#0a84ff"],
  ["#9a9a9a", "#aeaeb2"],
  ["rgba(255,255,255,0.94)", "rgba(44,44,46,0.94)"],
  ["1px solid rgba(34,197,94,0.36)", "1px solid rgba(48,209,88,0.36)"],
] as const) {
  assert.equal(darkCanvasColour(light), dark, `In dark the canvas draws ${light} as ${dark}.`);
}
assert.equal(darkFloorTint("#ded3be", true), "#454240", "The room you're in mixes 21% of its floor's tint into the paper (J, 28 Oct).");
assert.equal(darkFloorTint("#e7dfd2", false), "#383737", "The other rooms mix 14% of their muted tint.");
for (const material of ["#c9c2b4", "#c6a77b", "#9b7659", "#eeeae0", "#b8b0a1"]) {
  assert.equal(hasDarkCanvasColour(material), false, `${material} is the room's finish, so it draws as it is in dark too.`);
}

const CANVAS_SOURCES = [
  "components/editor/renderers/RoomRenderer2D.tsx",
  "components/editor/renderers/ItemRenderer2D.tsx",
  "components/editor/renderers/PlanUnderlayRenderer2D.tsx",
  "components/editor/renderers/CanonicalFloorPlanStructure.tsx",
  "components/editor/renderers/canonical-floor-plan/CanonicalWallSegments2D.tsx",
  "components/editor/renderers/canonical-floor-plan/CanonicalVoidRooms2D.tsx",
  "components/editor/renderers/canonical-floor-plan/CanonicalWallGestureOverlay.tsx",
  "components/editor/renderers/UnresolvedOpeningMarkers2D.tsx",
  "components/editor/design-page/DesignSceneCanvas.tsx",
  "features/cabinetry/components/CabinetPreviewScene3D.tsx",
];
const COLOUR_IN_STRING = /#[0-9a-fA-F]{6}\b|rgba?\([^)]*\)/g;
function colourCallArguments(text: string): string[] {
  const calls: string[] = [];
  for (const match of text.matchAll(/\bcolour\(/g)) {
    let depth = 1;
    let index = (match.index ?? 0) + match[0].length;
    const start = index;
    while (depth > 0 && index < text.length) {
      if (text[index] === "(") depth += 1;
      if (text[index] === ")") depth -= 1;
      index += 1;
    }
    calls.push(text.slice(start, index - 1));
  }
  return calls;
}
let canvasColourCount = 0;
for (const file of CANVAS_SOURCES) {
  const calls = colourCallArguments(read(file));
  assert.ok(calls.length > 0, `${file} draws its canvas colours through the palette.`);
  for (const call of calls) {
    for (const literal of call.match(/"[^"]*"/g) ?? []) {
      for (const colour of literal.match(COLOUR_IN_STRING) ?? []) {
        canvasColourCount += 1;
        assert.ok(hasDarkCanvasColour(colour), `${file}: ${colour} needs a dark value in lib/canvas-colours.`);
      }
    }
  }
}
assert.ok(canvasColourCount > 200, "The 2D plan's colours are drawn through the palette.");
assert.match(
  read("lib/canvas-colour-scheme.ts"),
  /getComputedStyle\(document\.documentElement\)\.getPropertyValue\("color-scheme"\)[\s\S]*new MutationObserver[\s\S]*matchMedia\(DARK_QUERY\)/,
  "The canvases follow the page's scheme: <html>'s color-scheme, the attribute and the device."
);
const exportSource = read("lib/useDesignPageExport.ts");
assert.equal(
  (exportSource.match(/return renderLightCapture\(rendererRef\.current, sceneRef\.current, cameraRef\.current,/g) ?? []).length,
  2,
  "The image and PDF exports capture the 3D view in its light colours (exports stay light)."
);
assert.match(
  designSceneCanvasSource,
  /userData=\{captureLightUserData\(\{ color: "#f3f5f5" \}\)\}[\s\S]*userData=\{captureLightUserData\(\{ cellColor: "#ffffff", sectionColor: "#ffffff" \}\)\}[\s\S]*<CanvasBackground light=\{configuration\.backgroundColor\} \/>/,
  "The workspace ground, its grid and the background keep their light colours for exports."
);

console.log("Light and dark colour checks passed.");
