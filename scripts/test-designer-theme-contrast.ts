import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cssPath = path.join(root, "app", "globals.css");
const css = fs.readFileSync(cssPath, "utf8");
const consumerTheme = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1];
const designerTheme = css.match(/\[data-theme="designer"\]\s*\{([\s\S]*?)\n\}/)?.[1];

assert.ok(consumerTheme, "Consumer theme tokens should be defined.");
assert.ok(designerTheme, "Designer theme tokens should be defined.");

function readHexTokenFrom(theme: string | undefined, themeLabel: string, name: string): string {
  const match = theme?.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(match?.[1], `${themeLabel} theme should define --${name} as a six-digit hex color.`);
  return match[1];
}

const readHexToken = (name: string) => readHexTokenFrom(designerTheme, "Designer", name);
const readConsumerHexToken = (name: string) => readHexTokenFrom(consumerTheme, "Consumer", name);

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

const panel = readHexToken("bg-panel");
const consumerTokens = {
  "bg-canvas": "#ffffff",
  "bg-panel": "#ffffff",
  "bg-panel-hover": "#f6f7fb",
  "text-primary": "#0b0d12",
  "text-secondary": "#4b5568",
  "text-muted": "#7b8496",
  accent: "#2f6bff",
  danger: "#e5484d",
} as const;

for (const [name, expected] of Object.entries(consumerTokens)) {
  assert.equal(
    readConsumerHexToken(name).toLowerCase(),
    expected,
    `Consumer token --${name} should remain unchanged.`
  );
}

const exactDesignerTokens = {
  "bg-canvas": "#dedfdf",
  "bg-canvas-3d": "#dedfdf",
  "bg-command": "#141514",
  "bg-frame": "#141514",
  "bg-frame-raised": "#242725",
  "bg-frame-hover": "#303330",
  "bg-frame-selected": "#e7e9e5",
  "bg-panel": "#f7f7f4",
  "bg-panel-raised": "#ffffff",
  "bg-panel-hover": "#e8e9e5",
  "bg-panel-recessed": "#eeefeb",
  "border-subtle": "#d4d6d1",
  "border-strong": "#9da29c",
  "border-control": "#717773",
  "border-on-dark-subtle": "#3f4340",
  "border-on-dark": "#7b827d",
  "text-primary": "#191b1a",
  "text-secondary": "#4b514e",
  "text-muted": "#626965",
  "text-on-dark-primary": "#f4f5f2",
  "text-on-dark-secondary": "#c7cdc8",
  "text-on-dark-muted": "#aab2ac",
  accent: "#275fcb",
  "accent-designer": "#275fcb",
  "accent-soft": "#e7eefc",
  "accent-on-dark": "#7ea7ff",
  "text-on-accent": "#ffffff",
  "text-on-accent-dark": "#11151d",
  danger: "#a53d3e",
  "status-ready-bg": "#e3f3ea",
  "status-ready-border": "#2f7356",
  "status-ready-text": "#20553f",
  "status-warning-bg": "#fbefcf",
  "status-warning-border": "#8a6515",
  "status-warning-text": "#624708",
  "status-blocked-bg": "#fbe6e5",
  "status-blocked-border": "#a53d3e",
  "status-blocked-text": "#7c2528",
  "status-info-bg": "#e5eefc",
  "status-info-border": "#356bb4",
  "status-info-text": "#264e86",
  "status-pending-bg": "#eceeea",
  "status-pending-border": "#6f756f",
  "status-pending-text": "#474d49",
} as const;

for (const [name, expected] of Object.entries(exactDesignerTokens)) {
  assert.equal(
    readHexToken(name).toLowerCase(),
    expected,
    `Designer token --${name} should match the shared-product Pro palette.`
  );
}

const normalTextPairs = [
  ["primary on panel", readHexToken("text-primary"), panel],
  ["secondary on panel", readHexToken("text-secondary"), panel],
  ["muted on panel", readHexToken("text-muted"), panel],
  ["primary on raised", readHexToken("text-primary"), readHexToken("bg-panel-raised")],
  ["secondary on raised", readHexToken("text-secondary"), readHexToken("bg-panel-raised")],
  ["muted on raised", readHexToken("text-muted"), readHexToken("bg-panel-raised")],
  ["primary on hover", readHexToken("text-primary"), readHexToken("bg-panel-hover")],
  ["secondary on hover", readHexToken("text-secondary"), readHexToken("bg-panel-hover")],
  ["muted on hover", readHexToken("text-muted"), readHexToken("bg-panel-hover")],
  ["primary on recessed", readHexToken("text-primary"), readHexToken("bg-panel-recessed")],
  ["secondary on recessed", readHexToken("text-secondary"), readHexToken("bg-panel-recessed")],
  ["muted on recessed", readHexToken("text-muted"), readHexToken("bg-panel-recessed")],
  ["accent text on soft active", readHexToken("accent"), readHexToken("accent-soft")],
  ["text on accent", readHexToken("text-on-accent"), readHexToken("accent")],
  ["primary on command selection", readHexToken("text-primary"), readHexToken("bg-frame-selected")],
  ["primary on frame", readHexToken("text-on-dark-primary"), readHexToken("bg-frame")],
  ["secondary on frame", readHexToken("text-on-dark-secondary"), readHexToken("bg-frame")],
  ["muted on frame", readHexToken("text-on-dark-muted"), readHexToken("bg-frame")],
  ["secondary on raised frame", readHexToken("text-on-dark-secondary"), readHexToken("bg-frame-raised")],
  ["muted on raised frame", readHexToken("text-on-dark-muted"), readHexToken("bg-frame-raised")],
  ["text on on-dark accent", readHexToken("text-on-accent-dark"), readHexToken("accent-on-dark")],
] as const;

for (const [label, foreground, background] of normalTextPairs) {
  const ratio = contrastRatio(foreground, background);
  assert.ok(ratio >= 4.5, `${label} text contrast is ${ratio.toFixed(2)}:1; expected at least 4.5:1.`);
}

for (const [label, background] of [
  ["panel", panel],
  ["raised", readHexToken("bg-panel-raised")],
  ["hover", readHexToken("bg-panel-hover")],
  ["recessed", readHexToken("bg-panel-recessed")],
] as const) {
  const controlBoundaryRatio = contrastRatio(readHexToken("border-control"), background);
  assert.ok(
    controlBoundaryRatio >= 3,
    `Control boundaries are ${controlBoundaryRatio.toFixed(2)}:1 against ${label}; expected at least 3:1.`
  );
  const activeBoundaryRatio = contrastRatio(readHexToken("accent"), background);
  assert.ok(
    activeBoundaryRatio >= 3,
    `Active-state boundaries are ${activeBoundaryRatio.toFixed(2)}:1 against ${label}; expected at least 3:1.`
  );
}

for (const [label, background] of [
  ["frame", readHexToken("bg-frame")],
  ["raised frame", readHexToken("bg-frame-raised")],
  ["hovered frame", readHexToken("bg-frame-hover")],
] as const) {
  const boundaryRatio = contrastRatio(readHexToken("border-on-dark"), background);
  assert.ok(
    boundaryRatio >= 3,
    `On-dark control boundaries are ${boundaryRatio.toFixed(2)}:1 against ${label}; expected at least 3:1.`
  );
}

const commandSelectionBoundaryRatio = contrastRatio(
  readHexToken("border-on-dark"),
  readHexToken("bg-frame-selected")
);
assert.ok(
  commandSelectionBoundaryRatio >= 3,
  `Command selection boundary is ${commandSelectionBoundaryRatio.toFixed(2)}:1; expected at least 3:1.`
);

const toolRailActiveBoundaryRatio = contrastRatio(
  readHexToken("accent-on-dark"),
  readHexToken("bg-frame")
);
assert.ok(
  toolRailActiveBoundaryRatio >= 3,
  `On-dark active state is ${toolRailActiveBoundaryRatio.toFixed(2)}:1; expected at least 3:1.`
);

for (const status of ["ready", "warning", "blocked", "info", "pending"] as const) {
  const background = readHexToken(`status-${status}-bg`);
  const border = readHexToken(`status-${status}-border`);
  const foreground = readHexToken(`status-${status}-text`);
  const textRatio = contrastRatio(foreground, background);
  const innerBoundaryRatio = contrastRatio(border, background);
  const outerBoundaryRatio = contrastRatio(border, panel);
  const frameBoundaryRatio = contrastRatio(background, readHexToken("bg-frame"));
  assert.ok(textRatio >= 4.5, `${status} text contrast is ${textRatio.toFixed(2)}:1; expected at least 4.5:1.`);
  assert.ok(innerBoundaryRatio >= 3, `${status} inner boundary is ${innerBoundaryRatio.toFixed(2)}:1; expected at least 3:1.`);
  assert.ok(outerBoundaryRatio >= 3, `${status} outer boundary is ${outerBoundaryRatio.toFixed(2)}:1; expected at least 3:1.`);
  assert.ok(frameBoundaryRatio >= 3, `${status} surface boundary on the frame is ${frameBoundaryRatio.toFixed(2)}:1; expected at least 3:1.`);
}

assert.match(
  css,
  /Keep legacy utility classes readable[\s\S]*?var\(--text-primary\)[\s\S]*?var\(--text-secondary\)[\s\S]*?var\(--text-muted\)/,
  "Designer mode should map legacy text utilities to the readable light-work-surface scale."
);
assert.match(
  css,
  /Graphite shell regions[\s\S]*?var\(--text-on-dark-primary\)[\s\S]*?var\(--text-on-dark-secondary\)[\s\S]*?var\(--text-on-dark-muted\)/,
  "Designer mode should map command and tool-rail utilities to the on-dark text scale."
);

for (const semanticClass of [
  "designer-tool-rail",
  "designer-command-selection",
  "designer-work-surface",
  "designer-work-section",
  "designer-work-divider",
  "designer-work-control",
  "designer-work-control-active",
  "designer-work-muted",
  "designer-primary-action",
]) {
  assert.match(css, new RegExp(`\\.${semanticClass}\\b`), `${semanticClass} should have a semantic CSS rule.`);
}

for (const [relativePath, semanticClass] of [
  ["components/editor/DesignControlsPanel.tsx", "designer-dock"],
  ["components/editor/EditorToolRail.tsx", "designer-tool-rail"],
  ["components/editor/FloorPropertiesPanel.tsx", "designer-dock"],
  ["components/editor/RoomPanNavigator.tsx", "designer-dock"],
  ["components/editor/RoomPlanStatusBar.tsx", "designer-work-surface"],
  ["components/editor/SceneAdjustmentToolbar.tsx", "designer-work-surface"],
  ["components/editor/FloorPlanToolStrip.tsx", "designer-work-section"],
] as const) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert.match(
    source,
    new RegExp(semanticClass),
    `${relativePath} should use ${semanticClass}.`
  );
}

const commandBarSource = fs.readFileSync(
  path.join(root, "components", "editor", "EditorCommandBar.tsx"),
  "utf8"
);
assert.match(commandBarSource, /designer-command-bar/, "The Pro command bar should use the shell token.");
assert.match(commandBarSource, /designer-control/, "The Pro command bar should use strong control boundaries.");
assert.match(commandBarSource, /designer-command-selection/, "The Pro command bar should use restrained neutral selection states.");
assert.match(commandBarSource, /designer-work-surface/, "The Pro command menus should use light work surfaces.");
assert.match(commandBarSource, /designer-primary-action/, "The Pro command bar should reserve solid blue for its primary action.");
assert.match(commandBarSource, /designer-status-(?:ready|blocked|info|pending)/, "Save states should use semantic Pro statuses.");

const legacySurfacePattern = /#(?:10131a|12151d|151820|1b2030)/i;
for (const relativePath of [
  "components/editor/DesignControlsAiPanel.tsx",
  "components/editor/DesignControlsFurnishPanel.tsx",
  "components/editor/DesignControlsPlanPanel.tsx",
  "components/editor/FloorPlanUploadPanel.tsx",
  "components/editor/ShoppingOverviewPanel.tsx",
]) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert.doesNotMatch(source, legacySurfacePattern, `${relativePath} should not restore the legacy blue-black Pro palette.`);
  assert.match(source, /designer-(?:dock|raised|recessed|control)/, `${relativePath} should use semantic Pro surfaces.`);
}

const planPanelSource = fs.readFileSync(
  path.join(root, "components", "editor", "DesignControlsPlanPanel.tsx"),
  "utf8"
);
const designControlsSource = fs.readFileSync(
  path.join(root, "components", "editor", "DesignControlsPanel.tsx"),
  "utf8"
);
assert.match(designControlsSource, /panelShellClass = `\$\{dark \? "designer-dock/, "The design workspace should have one outer Pro dock.");
assert.doesNotMatch(planPanelSource, /<div className=\{dark \? "designer-dock/, "The Plan content should not nest another dock.");
assert.match(planPanelSource, /progressCardClass = dark[\s\S]*?designer-divider/, "Internal Plan sections should use dividers.");
assert.doesNotMatch(planPanelSource, /progressCardClass = dark[\s\S]{0,100}?designer-dock/, "Internal Plan sections should not each become shadowed docks.");

const designPageSource = fs.readFileSync(
  path.join(root, "components", "editor", "design-page", "DesignPageWorkspace.tsx"),
  "utf8"
);
const viewportWorkspaceSource = fs.readFileSync(
  path.join(root, "lib", "design-page-viewport-workspace-registration.ts"),
  "utf8"
);
const presentationWorkspaceSource = fs.readFileSync(
  path.join(root, "lib/useDesignPagePresentationWorkspaceRegistration.ts"),
  "utf8"
);
const designPagePanelRegionSource = fs.readFileSync(
  path.join(root, "components", "editor", "design-page", "DesignPagePanelRegion.tsx"),
  "utf8"
);
const planPresentationSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPagePlanPresentationModel.ts"),
  "utf8"
);
const coreShellSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPageCoreShellRegistration.ts"),
  "utf8"
);
const editorCommandBarSource = fs.readFileSync(
  path.join(root, "components", "editor", "EditorCommandBar.tsx"),
  "utf8"
);
const designPageCommandBarSource = fs.readFileSync(
  path.join(
    root,
    "components",
    "editor",
    "design-page",
    "DesignPageEditorCommandBar.tsx"
  ),
  "utf8"
);
const designPageEditorChromeSource = fs.readFileSync(
  path.join(
    root,
    "components",
    "editor",
    "design-page",
    "DesignPageEditorChrome.tsx"
  ),
  "utf8"
);
const editorChromeControllerSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPageEditorChromeController.ts"),
  "utf8"
);
const viewportAdapterSource = fs.readFileSync(
  path.join(root, "lib", "design-page-viewport-region-adapter.ts"),
  "utf8"
);
const viewportOverlaySource = fs.readFileSync(
  path.join(
    root,
    "components",
    "editor",
    "design-page",
    "DesignPageViewportOverlayLayer.tsx"
  ),
  "utf8"
);
const selectionInspectorSource = fs.readFileSync(
  path.join(root, "components", "editor", "design-page", "DesignPageSelectionInspector.tsx"),
  "utf8"
);
const selectedItemPanelSource = fs.readFileSync(
  path.join(root, "components", "editor", "design-page", "SelectedItemPanel.tsx"),
  "utf8"
);
const designSceneCanvasSource = fs.readFileSync(
  path.join(root, "components", "editor", "design-page", "DesignSceneCanvas.tsx"),
  "utf8"
);
const commandPaletteSource = fs.readFileSync(
  path.join(root, "components", "editor", "design-page", "EditorCommandPalette.tsx"),
  "utf8"
);
const planQualityReviewPanelSource = fs.readFileSync(
  path.join(root, "components", "editor", "design-page", "PlanQualityReviewPanel.tsx"),
  "utf8"
);
const sceneReadyVeilSource = fs.readFileSync(
  path.join(root, "components", "editor", "design-page", "SceneReadyVeil.tsx"),
  "utf8"
);
const selectedPlanOpeningActionsSource = fs.readFileSync(
  path.join(root, "components", "editor", "design-page", "SelectedPlanOpeningActions.tsx"),
  "utf8"
);
const selectedSurfaceInspectorSource = fs.readFileSync(
  path.join(root, "components", "editor", "design-page", "SelectedSurfaceInspector.tsx"),
  "utf8"
);
assert.doesNotMatch(
  designPageSource,
  legacySurfacePattern,
  "The Pro design workspace should not restore the legacy blue-black palette."
);
assert.doesNotMatch(
  selectedItemPanelSource,
  legacySurfacePattern,
  "The Pro selected-item panel should not restore the legacy blue-black palette."
);
assert.match(
  coreShellSource,
  /const showDesignerTheme = false;/,
  "Pro capability mode should keep the shared light product theme."
);
assert.match(
  editorCommandBarSource,
  /data-testid="pro-mode-indicator"[\s\S]{0,300}?aria-label="Pro mode active"[\s\S]{0,300}?>Pro mode</,
  "The shared command bar should clearly label Pro mode without changing its theme."
);
assert.match(
  designPageCommandBarSource,
  /<RoomPlanStatusBar[\s\S]*?dark=\{configuration\.dark\}/,
  "The command wrapper should apply the resolved Pro theme to room context."
);
assert.match(
  designPageCommandBarSource,
  /<EditorCommandBar[\s\S]*?dark=\{configuration\.dark\}/,
  "The command wrapper should apply the resolved Pro theme to the command-bar leaf."
);
assert.match(
  presentationWorkspaceSource,
  /useDesignPagePresentationQaFacade\(\{[\s\S]*?configuration:\s*\{[\s\S]*?designerTheme:\s*coreShell\.derived\.access\.showDesignerTheme/,
  "The presentation workspace should inject its resolved designer theme into the presentation/QA facade."
);
assert.match(
  editorChromeControllerSource,
  /commandBar: configuration\.commandBar/,
  "The chrome controller should preserve the resolved command-bar theme."
);
assert.match(
  designPageEditorChromeSource,
  /<DesignPageEditorCommandBar[\s\S]*?configuration=\{configuration\.commandBar\}/,
  "The editor chrome should pass its resolved designer theme through the command-wrapper boundary."
);
assert.doesNotMatch(
  designPageSource,
  /<(?:EditorCommandBar|RoomPlanStatusBar)\b/,
  "The workspace should delegate themed command and room-status composition to the wrapper."
);
assert.match(
  commandPaletteSource,
  /data-testid="editor-command-palette"[\s\S]{0,1200}?designer-(?:dock|work-surface)/,
  "The Pro command palette should use an opaque semantic surface."
);
assert.match(
  planQualityReviewPanelSource,
  /data-testid="plan-quality-review-panel"[\s\S]{0,500}?designer-(?:dock|work-surface)/,
  "The Pro plan review should use an opaque semantic surface."
);
assert.match(
  selectedPlanOpeningActionsSource,
  /data-testid="selected-plan-opening-actions"[\s\S]{0,500}?designer-(?:dock|work-surface)/,
  "The Pro selected-opening toolbar should use an opaque semantic surface."
);
for (const [label, pattern] of [
  ["shopping dock", /data-testid="shopping-dock"[\s\S]{0,1000}?designer-(?:dock|work-surface)/],
] as const) {
  assert.match(
    designPagePanelRegionSource,
    pattern,
    `The Pro ${label} should use an opaque semantic surface in its owning panel region.`
  );
}
assert.match(
  sceneReadyVeilSource,
  /data-testid="scene-ready-veil"[\s\S]{0,700}?backgroundColor:\s*configuration\.backgroundColor/,
  "The scene loading veil should match the resolved scene background without a white flash."
);
assert.match(
  viewportOverlaySource,
  /state\.sceneLoadingVisible \? \([\s\S]{0,250}?<SceneReadyVeil configuration=\{configuration\.sceneLoading\}/,
  "The viewport overlay layer should own scene-loading veil composition."
);
assert.doesNotMatch(
  designPageSource,
  /<SceneReadyVeil/,
  "The design workspace should delegate the loading veil to the viewport overlay layer."
);
assert.match(
  viewportWorkspaceSource,
  /buildDesignPageViewportRegionAdapter\(\{[\s\S]*?sceneLoading: sceneRoomRead\.state\.scene\.showSceneLoadingVeil,[\s\S]*?configuration:\s*\{[\s\S]*?dark: coreShell\.derived\.access\.showDesignerTheme,[\s\S]*?sceneBackgroundColor: planWorkspace\.derived\.sceneBackgroundColor/,
  "The viewport workspace should inject the resolved loading theme and background."
);
assert.match(
  viewportAdapterSource,
  /sceneLoading:\s*\{[\s\S]*?dark: configuration\.dark,[\s\S]*?backgroundColor: configuration\.sceneBackgroundColor,/,
  "The viewport adapter should pass the resolved scene-loading theme and background through the overlay boundary."
);
assert.match(
  selectedSurfaceInspectorSource,
  /state\.header\.draft[\s\S]{0,500}?designer-status-warning[\s\S]{0,500}?designer-status-ready/,
  "Pro material publication statuses should use theme-first semantic status classes."
);
assert.match(
  planPresentationSource,
  /layout\.viewMode\s*===\s*"3d"[\s\S]{0,120}?presentation\.showDesignerTheme[\s\S]{0,80}?"#dedfdf"[\s\S]{0,80}?"#f4f2ed"[\s\S]{0,80}?"#ffffff"/,
  "The plan presentation model should use the normal warm 3D canvas whenever the optional designer theme is inactive."
);
assert.match(
  designSceneCanvasSource,
  /<Canvas[\s\S]*?data-shadow-maps-enabled=\{[\s\S]*?effectiveShadowsEnabled[\s\S]*?data-tone-mapping="aces"[\s\S]*?data-lighting-model="ambient-hemi-key-fill-ibl"[\s\S]*?shadows=\{effectiveShadowsEnabled \? QUALITY_SHADOW_FILTER : false\}[\s\S]*?outputColorSpace:\s*THREE\.SRGBColorSpace[\s\S]*?toneMapping:\s*THREE\.ACESFilmicToneMapping/,
  "The whole-home renderer should honor the effective shadow preference with sRGB output and ACES tone mapping."
);
assert.match(
  designSceneCanvasSource,
  /<hemisphereLight[\s\S]*?color=\{configuration\.lightConfig\.skyColor[\s\S]*?groundColor=\{configuration\.lightConfig\.groundColor[\s\S]*?intensity=\{configuration\.lightConfig\.hemiIntensity/,
  "The whole-home renderer should use the configured hemisphere light for directional ambient depth."
);
assert.doesNotMatch(
  designSceneCanvasSource,
  /<ambientLight\s+color="#ffffff"\s+intensity=\{0\.24\}/,
  "The whole-home renderer should not restore the unconditional white ambient wash."
);
assert.match(
  selectionInspectorSource,
  /data-testid="selection-inspector"[\s\S]*?designer-work-surface/,
  "The Pro selection inspector should use the light work-surface semantic."
);
assert.match(
  selectedItemPanelSource,
  /data-testid="selected-item-panel"[\s\S]{0,500}?designer-panel/,
  "The Pro selected-item panel should preserve its semantic panel surface."
);

console.log("Designer theme contrast checks passed.");
