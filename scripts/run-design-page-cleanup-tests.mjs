import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDirectory = join(root, "scripts");
const require = createRequire(import.meta.url);
const tsNodeBin = require.resolve("ts-node/dist/bin.js");

const typescriptGuardFiles = [
  "test-beta-feedback-widget.ts",
  "test-beta-readiness-upgrades.ts",
  "test-catalog-panel-logic.ts",
  "test-catalog-placement.ts",
  "test-command-bar-save-status.ts",
  "test-design-page-ai-layout-controller.ts",
  "test-design-page-ai-layout-proposal.ts",
  "test-design-page-ai-panel-registration.ts",
  "test-design-page-cabinetry-controller.ts",
  "test-design-page-catalog-placement-registration.ts",
  "test-design-page-commerce-actions.ts",
  "test-design-page-editor-command-bar.ts",
  "test-design-page-equivalent-variant.ts",
  "test-design-page-feature-registration.ts",
  "test-design-page-history-controller.ts",
  "test-design-page-house-plan.ts",
  "test-design-page-layout-versions-and-views-controller.ts",
  "test-design-page-live-catalog.ts",
  "test-design-page-new-plan-controller.ts",
  "test-design-page-panel-mode.ts",
  "test-design-page-paywall.ts",
  "test-design-page-persistence-controller.ts",
  "test-design-page-plan-canvas-overlays.ts",
  "test-design-page-plan-overlay-controller.ts",
  "test-design-page-plan-quality-controller.ts",
  "test-design-page-presentation-export-runtime.ts",
  "test-design-page-room-placement-operations.ts",
  "test-design-page-room-plan-controller.ts",
  "test-design-page-save-status.ts",
  "test-design-page-scene-layers.ts",
  "test-design-page-selected-item-panel-controller.ts",
  "test-design-page-selected-item-panel.ts",
  "test-design-page-selection-inspector-model.ts",
  "test-design-page-selection-transforms.ts",
  "test-design-page-viewport-overlay-layer.ts",
  "test-design-page-viewport-selection-controls.ts",
  "test-design-page-wall-descriptors.ts",
  "test-design-page-zone-controller.ts",
  "test-designer-theme-contrast.ts",
  "test-editor-3d-floor-cutaway.ts",
  "test-editor-floating-overlay-layout.ts",
  "test-floor-plan-quality.ts",
  "test-load-design-delete-modal.ts",
  "test-manual-placement-scoring.ts",
  "test-placement-best-option.ts",
  "test-placement-best-room.ts",
  "test-placement-improvement-action.ts",
  "test-placement-keyboard-shortcuts.ts",
  "test-placement-score-aware-status.ts",
  "test-placement-smart-confirm.ts",
  "test-placement-target-validity.ts",
  "test-placement-valid-restore.ts",
  "test-plan-camera-2d-invariant.ts",
  "test-plan-camera-navigation-visibility.ts",
  "test-plan-template-access.ts",
  "test-pro-billing-ui.ts",
  "test-pro-tools-toggle-copy.ts",
  "test-room-resize-handle-style.ts",
  "test-shopping-readiness-polish.ts",
  "test-tap-target-placement.ts",
  "test-touch-placement-polish.ts",
];

// Register check-design-page-architecture.mjs here after the workspace reaches
// its final line limit. Keeping Node guards explicit preserves deterministic runs.
const nodeGuardFiles = [];

const guardFiles = [...typescriptGuardFiles, ...nodeGuardFiles];

if (guardFiles.length === 0) {
  console.error("No design-page cleanup guards are registered.");
  process.exit(1);
}

if (new Set(guardFiles).size !== guardFiles.length) {
  console.error("The design-page cleanup guard manifest contains duplicates.");
  process.exit(1);
}

for (const fileName of guardFiles) {
  if (!existsSync(join(scriptsDirectory, fileName))) {
    console.error(`Missing design-page cleanup guard: ${fileName}`);
    process.exit(1);
  }
}

const compilerOptions = JSON.stringify({
  module: "CommonJS",
  moduleResolution: "node",
  jsx: "react-jsx",
});

for (const fileName of guardFiles) {
  console.log(`\n[design-page-cleanup] ${fileName}`);
  const scriptPath = join(scriptsDirectory, fileName);
  const commandArguments = fileName.endsWith(".ts")
    ? [
        tsNodeBin,
        "--transpile-only",
        "--compiler-options",
        compilerOptions,
        "-r",
        "tsconfig-paths/register",
        scriptPath,
      ]
    : [scriptPath];
  const result = spawnSync(
    process.execPath,
    commandArguments,
    {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    }
  );

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\nDesign-page cleanup guards passed (${guardFiles.length} files).`);
