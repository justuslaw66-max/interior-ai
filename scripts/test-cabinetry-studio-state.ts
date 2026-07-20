import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getCabinetAutomationState,
  getCabinetParameterState,
  setCabinetModuleWidthLocked,
  setCabinetOverallWidthLocked,
  setCabinetParameterState,
} from "../features/cabinetry/automation";
import {
  CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE,
  CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS,
  CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE,
  CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS,
} from "../features/cabinetry/drawerBoxLayout";
import {
  CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE,
  CABINET_DEFAULT_DRAWER_SLIDE_LENGTH,
} from "../features/cabinetry/drawerSlideLayout";
import { getCabinetMinimumModuleWidthMm } from "../features/cabinetry/moduleWidthRules";
import { createCabinetPreset } from "../features/cabinetry/presets";
import { cabinetShelfLayoutParameterPath } from "../features/cabinetry/shelfLayout";
import { applyCabinetModulePatchCommand } from "../features/cabinetry/state/CabinetStudioDefinitionCommands";
import {
  CABINET_STUDIO_HISTORY_LIMIT,
  canRedoCabinetStudioHistory,
  canUndoCabinetStudioHistory,
  clearSavedTemplateFromCabinetStudioHistory,
  createCabinetHistoryEntry,
  createCabinetStudioHistory,
  recordCabinetStudioHistory,
  redoCabinetStudioHistory,
  undoCabinetStudioHistory,
} from "../features/cabinetry/state/CabinetStudioHistory";
import type {
  CabinetHistoryEntry,
  CabinetStudioHistoryState,
  CabinetTemplateSourceIdentity,
} from "../features/cabinetry/state/CabinetStudioHistory";
import type {
  CabinetDefinition,
  CabinetModuleDefinition,
} from "../features/cabinetry/types";

const sourceIdentity: CabinetTemplateSourceIdentity = {
  presetId: "base",
  savedTemplateId: null,
};
const baseDefinition = createCabinetPreset("base", "phase-9-batch-4");
const moduleId = baseDefinition.modules[0].id;

function entry(
  definition: CabinetDefinition,
  source: CabinetTemplateSourceIdentity = sourceIdentity
): CabinetHistoryEntry {
  return createCabinetHistoryEntry(definition, source);
}

function revision(number: number): CabinetDefinition {
  return { ...baseDefinition, name: `revision-${number}` };
}

function requireSuccessfulDefinition(
  result: ReturnType<typeof applyCabinetModulePatchCommand>
): CabinetDefinition {
  if (!result.ok) assert.fail(result.error);
  return result.definition;
}

// The bounded history retains the newest 60 committed states and traverses the
// complete retained sequence without manufacturing extra entries.
let longHistory = createCabinetStudioHistory();
let longCurrent = entry(baseDefinition);
for (let index = 1; index <= 75; index += 1) {
  longHistory = recordCabinetStudioHistory(longHistory, longCurrent);
  longCurrent = entry(revision(index));
}
assert.equal(longHistory.past.length, CABINET_STUDIO_HISTORY_LIMIT);
assert.equal(longHistory.past[0].definition.name, "revision-15");
assert.equal(longHistory.past.at(-1)?.definition.name, "revision-74");
assert.equal(longHistory.future.length, 0);
assert.equal(canUndoCabinetStudioHistory(longHistory), true);
assert.equal(canRedoCabinetStudioHistory(longHistory), false);

for (let index = 0; index < CABINET_STUDIO_HISTORY_LIMIT; index += 1) {
  const transition = undoCabinetStudioHistory(longHistory, longCurrent);
  assert.ok(transition, `undo ${index + 1} must remain available`);
  longHistory = transition.history;
  longCurrent = transition.entry;
}
assert.equal(longCurrent.definition.name, "revision-15");
assert.equal(undoCabinetStudioHistory(longHistory, longCurrent), null);
assert.equal(longHistory.future.length, CABINET_STUDIO_HISTORY_LIMIT);

for (let index = 0; index < CABINET_STUDIO_HISTORY_LIMIT; index += 1) {
  const transition = redoCabinetStudioHistory(longHistory, longCurrent);
  assert.ok(transition, `redo ${index + 1} must remain available`);
  longHistory = transition.history;
  longCurrent = transition.entry;
}
assert.equal(longCurrent.definition.name, "revision-75");
assert.equal(redoCabinetStudioHistory(longHistory, longCurrent), null);

// A new commit after undo invalidates the abandoned redo branch.
let branchHistory = recordCabinetStudioHistory(
  createCabinetStudioHistory(),
  entry(baseDefinition)
);
let branchCurrent = entry(revision(1));
branchHistory = recordCabinetStudioHistory(branchHistory, branchCurrent);
branchCurrent = entry(revision(2));
const branchUndo = undoCabinetStudioHistory(branchHistory, branchCurrent);
assert.ok(branchUndo);
branchHistory = branchUndo.history;
branchCurrent = branchUndo.entry;
assert.equal(branchCurrent.definition.name, "revision-1");
assert.equal(canRedoCabinetStudioHistory(branchHistory), true);
branchHistory = recordCabinetStudioHistory(branchHistory, branchCurrent);
branchCurrent = entry(revision(99));
assert.equal(branchCurrent.definition.name, "revision-99");
assert.equal(canRedoCabinetStudioHistory(branchHistory), false);
assert.equal(redoCabinetStudioHistory(branchHistory, branchCurrent), null);

// Deleting a saved template clears only the matching source identity from both
// directions and leaves the caller's state untouched.
const deletedTemplateSource: CabinetTemplateSourceIdentity = {
  presetId: null,
  savedTemplateId: "saved-template-delete-me",
};
const retainedTemplateSource: CabinetTemplateSourceIdentity = {
  presetId: null,
  savedTemplateId: "saved-template-keep",
};
const templateHistory: CabinetStudioHistoryState = {
  past: [entry(revision(1), deletedTemplateSource), entry(revision(2), retainedTemplateSource)],
  future: [entry(revision(3), deletedTemplateSource)],
};
const clearedTemplateHistory = clearSavedTemplateFromCabinetStudioHistory(
  templateHistory,
  "saved-template-delete-me"
);
assert.deepEqual(
  clearedTemplateHistory.past.map((item) => item.savedTemplateId),
  [null, "saved-template-keep"]
);
assert.deepEqual(
  clearedTemplateHistory.future.map((item) => item.savedTemplateId),
  [null]
);
assert.equal(templateHistory.past[0].savedTemplateId, "saved-template-delete-me");
assert.equal(templateHistory.future[0].savedTemplateId, "saved-template-delete-me");

// Rejected commands preserve both value and reference history: callers can
// simply skip record/commit on failure.
const lockedOverall = setCabinetOverallWidthLocked(baseDefinition, true);
const lockedOverallJson = JSON.stringify(lockedOverall);
const overallResult = applyCabinetModulePatchCommand(lockedOverall, moduleId, {
  width: 900,
});
assert.deepEqual(overallResult, {
  ok: false,
  error: "Overall width is locked. Unlock it before changing an individual bay width.",
});
assert.equal(JSON.stringify(lockedOverall), lockedOverallJson);

const lockedModule = setCabinetModuleWidthLocked(baseDefinition, moduleId, true);
assert.deepEqual(applyCabinetModulePatchCommand(lockedModule, moduleId, { width: 900 }), {
  ok: false,
  error: "This module width is locked. Unlock it before changing the bay width.",
});

const equalSizing = {
  ...baseDefinition,
  automation: {
    ...getCabinetAutomationState(baseDefinition),
    equalModuleSizing: true,
  },
};
assert.deepEqual(applyCabinetModulePatchCommand(equalSizing, moduleId, { width: 900 }), {
  ok: false,
  error: "Equal module sizing is locked. Release it before changing one bay width.",
});

const lockedShelfLayout = setCabinetParameterState(
  baseDefinition,
  cabinetShelfLayoutParameterPath(moduleId),
  { locked: true }
);
assert.deepEqual(
  applyCabinetModulePatchCommand(lockedShelfLayout, moduleId, { shelfCount: 5 }),
  {
    ok: false,
    error: "Shelf layout is locked. Unlock it before changing shelf settings.",
  }
);

const lockedDoorStyle = setCabinetParameterState(
  baseDefinition,
  `modules.${moduleId}.doorStyle`,
  { locked: true }
);
assert.deepEqual(
  applyCabinetModulePatchCommand(lockedDoorStyle, moduleId, {
    doorStyle: "shaker",
  }),
  {
    ok: false,
    error: "DoorStyle is locked. Unlock it before changing this value.",
  }
);

// Widths clamp to the same domain bounds as the former component-local path.
const sourceBeforeClamp = JSON.stringify(baseDefinition);
const maximumClamp = requireSuccessfulDefinition(
  applyCabinetModulePatchCommand(baseDefinition, moduleId, { width: 99_999 })
);
assert.equal(maximumClamp.modules[0].width, 4_000);
const expectedMinimumWidth = getCabinetMinimumModuleWidthMm(
  baseDefinition.modules[0],
  baseDefinition
);
const minimumClamp = requireSuccessfulDefinition(
  applyCabinetModulePatchCommand(baseDefinition, moduleId, { width: 1 })
);
assert.equal(minimumClamp.modules[0].width, expectedMinimumWidth);
assert.equal(JSON.stringify(baseDefinition), sourceBeforeClamp);

const materialResult = requireSuccessfulDefinition(
  applyCabinetModulePatchCommand(baseDefinition, moduleId, {
    materialId: "walnut_veneer",
  })
);
assert.equal(materialResult.modules[0].materialId, "walnut_veneer");
assert.equal(
  getCabinetParameterState(
    materialResult,
    `modules.${moduleId}.materialId`
  ).source,
  "user_overridden"
);
assert.equal(
  materialResult.updatedAt,
  baseDefinition.updatedAt,
  "timestamps remain owned by the Studio commit boundary"
);

// Custom shelf and drawer modes reconcile dependent arrays in one command.
const customShelfModule: CabinetModuleDefinition = {
  ...baseDefinition.modules[0],
  shelfSpacingMode: "custom",
  shelfCount: 2,
  shelfPositionsMm: [200, 400],
};
const customShelfDefinition: CabinetDefinition = {
  ...baseDefinition,
  modules: [customShelfModule],
};
const shelfResult = requireSuccessfulDefinition(
  applyCabinetModulePatchCommand(customShelfDefinition, moduleId, {
    shelfCount: 3.6,
  })
);
assert.equal(shelfResult.modules[0].shelfCount, 4);
assert.equal(shelfResult.modules[0].shelfPositionsMm?.length, 4);
assert.equal(customShelfDefinition.modules[0].shelfCount, 2);
assert.deepEqual(customShelfDefinition.modules[0].shelfPositionsMm, [200, 400]);

const customDrawerModule: CabinetModuleDefinition = {
  ...baseDefinition.modules[0],
  frontType: "drawer_stack",
  drawerCount: 2,
  drawerHeightMode: "custom",
  drawerHeightProportions: [0.4, 0.6],
};
const customDrawerDefinition: CabinetDefinition = {
  ...baseDefinition,
  modules: [customDrawerModule],
};
const drawerResult = requireSuccessfulDefinition(
  applyCabinetModulePatchCommand(customDrawerDefinition, moduleId, {
    drawerCount: 3.2,
  })
);
assert.equal(drawerResult.modules[0].drawerCount, 3);
assert.equal(drawerResult.modules[0].drawerHeightProportions?.length, 3);
assert.ok(
  Math.abs(
    (drawerResult.modules[0].drawerHeightProportions ?? []).reduce(
      (sum, value) => sum + value,
      0
    ) - 1
  ) < 1e-9
);
assert.deepEqual(customDrawerDefinition.modules[0].drawerHeightProportions, [0.4, 0.6]);

// Front changes remove obsolete drawer hardware or create the legacy defaults
// when drawer fronts become available.
const drawerHardwareModule: CabinetModuleDefinition = {
  ...customDrawerModule,
  drawerSlideHardwareEnabled: true,
  drawerSlideLength: 450,
  drawerSlideClearance: 12,
  drawerBoxEnabled: true,
  drawerBoxSideThickness: 13,
  drawerBoxBottomThickness: 7,
  drawerBoxHeightClearance: 44,
  drawerBoxBackClearance: 21,
};
const drawerHardwareDefinition: CabinetDefinition = {
  ...baseDefinition,
  modules: [drawerHardwareModule],
};
const hardwareRemoved = requireSuccessfulDefinition(
  applyCabinetModulePatchCommand(drawerHardwareDefinition, moduleId, {
    frontType: "open",
    drawerCount: 0,
  })
).modules[0];
assert.equal(hardwareRemoved.drawerSlideHardwareEnabled, undefined);
assert.equal(hardwareRemoved.drawerSlideLength, undefined);
assert.equal(hardwareRemoved.drawerSlideClearance, undefined);
assert.equal(hardwareRemoved.drawerBoxEnabled, undefined);
assert.equal(hardwareRemoved.drawerBoxSideThickness, undefined);
assert.equal(hardwareRemoved.drawerBoxBottomThickness, undefined);
assert.equal(hardwareRemoved.drawerBoxHeightClearance, undefined);
assert.equal(hardwareRemoved.drawerBoxBackClearance, undefined);

const openModule: CabinetModuleDefinition = {
  ...baseDefinition.modules[0],
  frontType: "open",
  drawerCount: 0,
  drawerSlideHardwareEnabled: undefined,
  drawerSlideLength: undefined,
  drawerSlideClearance: undefined,
  drawerBoxEnabled: undefined,
  drawerBoxSideThickness: undefined,
  drawerBoxBottomThickness: undefined,
  drawerBoxHeightClearance: undefined,
  drawerBoxBackClearance: undefined,
};
const drawerHardwareCreated = requireSuccessfulDefinition(
  applyCabinetModulePatchCommand(
    { ...baseDefinition, modules: [openModule] },
    moduleId,
    { frontType: "drawer_stack", drawerCount: 3 }
  )
).modules[0];
assert.equal(drawerHardwareCreated.drawerSlideHardwareEnabled, true);
assert.equal(drawerHardwareCreated.drawerSlideLength, CABINET_DEFAULT_DRAWER_SLIDE_LENGTH);
assert.equal(drawerHardwareCreated.drawerSlideClearance, CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE);
assert.equal(drawerHardwareCreated.drawerBoxEnabled, true);
assert.equal(
  drawerHardwareCreated.drawerBoxSideThickness,
  CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS
);
assert.equal(
  drawerHardwareCreated.drawerBoxBottomThickness,
  CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS
);
assert.equal(
  drawerHardwareCreated.drawerBoxHeightClearance,
  CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE
);
assert.equal(
  drawerHardwareCreated.drawerBoxBackClearance,
  CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE
);

// Many transient previews are intentionally not history operations. A single
// commit records the pre-gesture state and one undo restores it exactly.
let previewDefinition = baseDefinition;
for (let index = 1; index <= 80; index += 1) {
  previewDefinition = requireSuccessfulDefinition(
    applyCabinetModulePatchCommand(previewDefinition, moduleId, {
      width: baseDefinition.modules[0].width + index,
    })
  );
}
const gestureHistory = recordCabinetStudioHistory(
  createCabinetStudioHistory(),
  entry(baseDefinition)
);
const gestureCurrent = entry(previewDefinition);
assert.equal(gestureHistory.past.length, 1);
const gestureUndo = undoCabinetStudioHistory(gestureHistory, gestureCurrent);
assert.ok(gestureUndo);
assert.deepEqual(gestureUndo.entry.definition, baseDefinition);
assert.equal(gestureUndo.history.past.length, 0);
assert.equal(gestureUndo.history.future.length, 1);

const studioSource = readFileSync(
  "features/cabinetry/components/CabinetryStudio.tsx",
  "utf8"
);
assert.ok(studioSource.includes("applyCabinetModulePatchCommand"));
assert.ok(studioSource.includes("recordCabinetStudioHistory"));
assert.ok(studioSource.includes("undoCabinetStudioHistory"));
assert.ok(studioSource.includes("redoCabinetStudioHistory"));
assert.ok(!studioSource.includes("const patchFields = Object.keys(patch)"));

console.log(
  "Cabinetry Studio state tests passed (bounded history, branch invalidation, template cleanup, locks, rollback, clamping, reconciliation, provenance, and coalesced gestures)."
);
