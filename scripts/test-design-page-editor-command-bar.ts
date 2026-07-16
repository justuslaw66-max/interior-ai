import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const workspaceSource = fs.readFileSync(
  path.join(
    root,
    "components",
    "editor",
    "design-page",
    "DesignPageWorkspace.tsx"
  ),
  "utf8"
);
const commandBarSource = fs.readFileSync(
  path.join(
    root,
    "components",
    "editor",
    "design-page",
    "DesignPageEditorCommandBar.tsx"
  ),
  "utf8"
);

assert.match(
  commandBarSource,
  /import type \{ ComponentProps \} from "react";/,
  "The design-page command bar should infer leaf contracts with ComponentProps."
);
assert.match(
  commandBarSource,
  /type EditorCommandBarProps = ComponentProps<typeof EditorCommandBar>;/,
  "The wrapper should infer the leaf command-bar contract."
);
assert.match(
  commandBarSource,
  /type RoomPlanStatusBarProps = ComponentProps<typeof RoomPlanStatusBar>;/,
  "The wrapper should infer the room-status contract."
);

for (const contractName of [
  "DesignPageEditorCommandBarState",
  "DesignPageEditorCommandBarConfiguration",
  "DesignPageEditorCommandBarActions",
] as const) {
  assert.match(
    commandBarSource,
    new RegExp(`export type ${contractName} =`),
    `${contractName} should remain an explicit grouped contract.`
  );
}

assert.match(
  commandBarSource,
  /type DesignPageEditorCommandBarProps = \{\s*state: DesignPageEditorCommandBarState;\s*configuration: DesignPageEditorCommandBarConfiguration;\s*actions: DesignPageEditorCommandBarActions;\s*\};/,
  "The wrapper should expose only grouped state, configuration, and actions at its boundary."
);

assert.match(
  commandBarSource,
  /const room = state\.room;[\s\S]*?const contextVisible =\s*!state\.commandBar\.isClientPreview &&\s*Boolean\(room \|\| state\.commandBar\.viewMode === "3d"\);/,
  "Room context and scene quality should stay hidden in client preview and available for rooms or 3D."
);
assert.match(
  commandBarSource,
  /const contextSlot = contextVisible \? \(\s*<>\s*\{room \? \([\s\S]*?<RoomPlanStatusBar[\s\S]*?\/>\s*\) : null\}\s*<\/>\s*\) : null;/,
  "The 3D-without-room case should retain the intentional truthy empty context fragment."
);
assert.match(
  commandBarSource,
  /const overflowSlot = contextVisible \? \(/,
  "The context and overflow slots should share the exact visibility gate."
);

assert.match(
  commandBarSource,
  /<RoomPlanStatusBar[\s\S]*?roomName=\{room\.roomName\}[\s\S]*?roomTypeLabel=\{room\.roomTypeLabel\}[\s\S]*?roomCount=\{room\.roomCount\}[\s\S]*?widthMeters=\{room\.widthMeters\}[\s\S]*?depthMeters=\{room\.depthMeters\}/,
  "The command context should preserve the active room identity, count, and dimensions."
);
assert.match(
  commandBarSource,
  /healthLevel=\{\s*configuration\.showRoomHealth\s*\? room\.health\?\.level\s*:\s*undefined\s*\}[\s\S]*?healthScore=\{\s*configuration\.showRoomHealth\s*\? room\.health\?\.score\s*:\s*undefined\s*\}[\s\S]*?healthNextAction=\{\s*configuration\.showRoomHealth\s*\? room\.health\?\.nextAction\s*:\s*undefined\s*\}/,
  "Guided-plan mode should suppress all room-health values with undefined props."
);
assert.match(
  commandBarSource,
  /disabled=\{state\.commandBar\.editorMode === "present"\}[\s\S]*?dark=\{configuration\.dark\}[\s\S]*?compact=\{configuration\.compactRoomStatus\}[\s\S]*?variant="command"/,
  "Room status should preserve presentation disabling, theme, compact layout, and command variant."
);
assert.match(
  commandBarSource,
  /onViewModeChange=\{actions\.room\.onViewModeChange\}[\s\S]*?onReviewHealth=\{actions\.room\.onReviewHealth\}[\s\S]*?onFitPlan=\{actions\.room\.onFitPlan\}/,
  "Room status should retain view, health-review, and fit actions."
);

const renameIndex = commandBarSource.indexOf(
  'data-testid="editor-command-overflow-rename-room"'
);
const sceneQualityIndex = commandBarSource.indexOf(
  'data-testid="editor-overflow-scene-quality"'
);
assert.ok(
  renameIndex >= 0 && sceneQualityIndex > renameIndex,
  "The overflow slot should keep Rename room before Scene quality."
);
assert.match(
  commandBarSource,
  /<button\s+type="button"\s+data-testid="editor-command-overflow-rename-room"/,
  "The overflow rename action should remain an explicit non-submit button with its stable test id."
);
assert.match(
  commandBarSource,
  /\(\["auto", "quality", "lite"\] as const\)\.map/,
  "Scene performance choices should retain auto, quality, lite order."
);
assert.match(
  commandBarSource,
  /data-testid=\{`scene-performance-\$\{option\}`\}[\s\S]*?data-active=\{active \? "true" : "false"\}/,
  "Scene performance choices should retain stable test ids and active-state attributes."
);
assert.match(
  commandBarSource,
  /option === "auto"[\s\S]*?state\.scenePerformance\.liteEnabled[\s\S]*?\? "Auto Lite"[\s\S]*?: "Auto"[\s\S]*?option === "quality"[\s\S]*?\? "Quality"[\s\S]*?: "Lite"/,
  "Automatic scene mode should retain its effective Auto Lite label."
);
assert.match(
  commandBarSource,
  /onClick=\{\(\) => actions\.scenePerformance\.changeMode\(option\)\}/,
  "Scene performance choices should stay wired to the grouped mode action."
);

assert.match(
  commandBarSource,
  /<EditorCommandBar\s*[\s\S]*?\{\.\.\.state\.commandBar\}[\s\S]*?\{\.\.\.actions\.commandBar\}[\s\S]*?dark=\{configuration\.dark\}[\s\S]*?contextSlot=\{contextSlot\}[\s\S]*?overflowSlot=\{overflowSlot\}/,
  "The wrapper should forward inferred leaf state and actions before installing its owned slots."
);

assert.match(
  workspaceSource,
  /import \{ DesignPageEditorCommandBar \} from "@\/components\/editor\/design-page\/DesignPageEditorCommandBar";/,
  "The workspace should import the page-specific command-bar wrapper."
);
assert.doesNotMatch(
  workspaceSource,
  /from "@\/components\/editor\/EditorCommandBar"|from "@\/components\/editor\/RoomPlanStatusBar"/,
  "The workspace should no longer import command-bar leaf components directly."
);
assert.doesNotMatch(
  workspaceSource,
  /<EditorCommandBar\b|<RoomPlanStatusBar\b/,
  "The workspace should delegate command and room-status rendering to the wrapper."
);
assert.match(
  workspaceSource,
  /<DesignPageEditorCommandBar\s+state=\{\{[\s\S]*?commandBar:\s*\{[\s\S]*?room:\s*activeRoom[\s\S]*?scenePerformance:\s*\{[\s\S]*?configuration=\{\{[\s\S]*?actions=\{\{[\s\S]*?commandBar:\s*\{[\s\S]*?room:\s*\{[\s\S]*?scenePerformance:\s*\{/,
  "The workspace should wire grouped command, room, and performance state, configuration, and actions."
);
assert.match(
  workspaceSource,
  /commandBar:\s*\{[\s\S]*?onMillwork:\s*canUseCabinetryStudio\s*\? openCabinetryStudio\s*:\s*undefined/,
  "Unavailable Millwork should remain undefined so the leaf hides both command entries."
);
assert.match(
  workspaceSource,
  /commandBar:\s*\{[\s\S]*?onNewPlan:\s*openNewPlanPicker[\s\S]*?onSave:\s*async \(\) => \{[\s\S]*?openGuestPrompt\("save", \(\) => \{\}\)[\s\S]*?await saveDesignToCloud\(\)[\s\S]*?showRuleToast\("Saved to cloud"\)/,
  "The workspace boundary should preserve controller-owned New plan and guest/cloud save behavior."
);

const viewportOverlayIndex = workspaceSource.indexOf(
  "<DesignPageViewportOverlayLayer"
);
const commandCompositionIndex = workspaceSource.indexOf(
  "<DesignPageEditorCommandBar"
);
const betaStartIndex = workspaceSource.indexOf("<BetaStartPanel");
assert.ok(
  viewportOverlayIndex >= 0 &&
    commandCompositionIndex > viewportOverlayIndex &&
    betaStartIndex > commandCompositionIndex,
  "Workspace composition should remain Viewport overlay, Command bar, then Beta start."
);

console.log("Design-page editor command-bar guardrails passed.");
