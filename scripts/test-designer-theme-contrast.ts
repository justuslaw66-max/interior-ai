import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readEditorCommandBarSource } from "./editor-command-bar-test-utils";

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
  "control-danger": "var(--color-red-600)",
  "control-danger-hover": "var(--color-red-700)",
  "control-danger-border": "var(--color-red-600)",
  "control-on-danger": "var(--color-white)",
} as const;
for (const [name, value] of Object.entries(LIGHT_ROLE_TOKENS)) {
  assert.equal(lightTokens.get(name), value, `Light --${name} keeps the colour it drew with before.`);
}
// J's dark surfaces (13 Oct: black panels, #1C1C1E cards; 22 Oct: dialogs #1C1C1E with #2C2C2E
// fields, Apple's 60% grey) and the near-white primary (14 Oct).
const DARK_CHOICES = {
  surface: "#000000",
  "surface-secondary": "#1c1c1e",
  "surface-elevated": "#1c1c1e",
  "surface-elevated-secondary": "#2c2c2e",
  "surface-floating": "#2c2c2e",
  "label-secondary": "rgba(235, 235, 245, 0.6)",
  "control-primary": "#f5f5f7",
} as const;
for (const [name, value] of Object.entries(DARK_CHOICES)) {
  assert.equal(darkTokens.get(name), value, `Dark --${name} is the value J chose.`);
}

// Tailwind 4's colours that the light tokens point at, in sRGB (its oklch values, rounded).
const TAILWIND_SRGB: Record<string, string> = {
  white: "#ffffff",
  "neutral-50": "#fafafa",
  "neutral-100": "#f5f5f5",
  "neutral-200": "#e5e5e5",
  "neutral-300": "#d4d4d4",
  "neutral-400": "#a1a1a1",
  "neutral-700": "#404040",
  "neutral-800": "#262626",
  "neutral-900": "#171717",
  "red-600": "#e7000b",
  "red-700": "#c10007",
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
// 4.1:1 over a floating bar in dark, so deletes stay off them.
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
];
// The focus ring and the primary's black (or near-white) edge need 3:1 against what's around them.
const EDGE_PAIRS: ReadonlyArray<readonly [edge: string, grounds: readonly string[]]> = [
  ["control-primary", CONTROL_GROUNDS],
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
  /if \(saveStatus\.tone === "error"\) return "text-red-700";[\s\S]*?return "text-success";/,
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
  /data-testid="shop-step"[\s\S]{0,200}?bg-\[#fafaf9\]/,
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
  /layout\.viewMode\s*===\s*"3d"\s*\?\s*"#f4f2ed"\s*:\s*"#ffffff"/,
  "The 3D canvas is the warm #f4f2ed and the 2D plan white."
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

console.log("Light and dark colour checks passed.");
