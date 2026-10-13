import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readEditorCommandBarSource } from "./editor-command-bar-test-utils";

// The editor's colour contract. Its name is older than its job: the Pro "designer theme" it
// once checked was never switched on and went in UX 5l (13 Oct 2026). It now checks the light
// theme's tokens and their contrast, and that the retired theme stays gone; the dark mode
// modelled on Apple's (claude/dark-mode-plan-2026-10-13.md) adds its dark values here.

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const css = read("app/globals.css");
const consumerTheme = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1];

assert.ok(consumerTheme, "Consumer theme tokens should be defined.");

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
  "No stylesheet rule may follow the OS dark setting until the app has a designed dark theme."
);

console.log("Light theme contrast checks passed.");
