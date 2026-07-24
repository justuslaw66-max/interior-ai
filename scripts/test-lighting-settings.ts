import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveDesignLightingSettings,
  updateDesignLightingSettings,
} from "@/lib/design-lighting-settings";
import {
  snapshotToStored,
  storedToSnapshot,
} from "@/lib/room-persistence";
import {
  createRoom,
  type DesignSnapshot,
} from "@/lib/room-types";
import { validateStoredDesignDocument } from "@/lib/design-document-contract";

const makeSnapshot = (
  extra: Partial<DesignSnapshot> = {}
): DesignSnapshot => ({
  version: 3,
  rooms: [createRoom("room-1", "Living room")],
  activeRoomId: "room-1",
  ...extra,
});

assert.deepEqual(
  resolveDesignLightingSettings(makeSnapshot()),
  { preset: "studio", shadowsEnabled: true },
  "Missing settings should preserve today's Studio scene with shadows on."
);
assert.deepEqual(
  resolveDesignLightingSettings(
    makeSnapshot({ lightingPreset: "warm" })
  ),
  { preset: "warm", shadowsEnabled: true },
  "Legacy lightingPreset should remain readable."
);
assert.deepEqual(
  snapshotToStored(makeSnapshot({ lightingPreset: "warm" })).lighting,
  { preset: "warm", shadowsEnabled: true },
  "Saving a legacy design should upgrade it to structured lighting settings."
);
assert.deepEqual(
  resolveDesignLightingSettings(
    makeSnapshot({
      lighting: { preset: "daylight", shadowsEnabled: false },
      lightingPreset: "warm",
    })
  ),
  { preset: "daylight", shadowsEnabled: false },
  "Structured settings should be the canonical source of truth."
);
assert.deepEqual(
  resolveDesignLightingSettings(
    makeSnapshot({
      lighting: {
        preset: "invalid",
        shadowsEnabled: "invalid",
      },
      lightingPreset: "warm",
    } as unknown as Partial<DesignSnapshot>)
  ),
  { preset: "warm", shadowsEnabled: true },
  "Invalid structured values should fail safe to legacy/default values."
);

const updated = updateDesignLightingSettings(makeSnapshot(), {
  preset: "daylight",
  shadowsEnabled: false,
});
assert.deepEqual(updated.lighting, {
  preset: "daylight",
  shadowsEnabled: false,
});
assert.equal(
  updated.lightingPreset,
  "daylight",
  "Updates should mirror the preset for legacy clients."
);

const roundTrip = storedToSnapshot(snapshotToStored(updated));
assert.deepEqual(
  roundTrip.lighting,
  updated.lighting,
  "Lighting settings should survive storage serialization."
);
assert.equal(roundTrip.lightingPreset, "daylight");
assert.equal(
  validateStoredDesignDocument(snapshotToStored(updated)).ok,
  true,
  "Valid lighting settings should satisfy the design contract."
);

const invalidStored = {
  ...snapshotToStored(updated),
  lighting: { preset: "night", shadowsEnabled: "yes" },
};
const invalidValidation = validateStoredDesignDocument(invalidStored);
assert.equal(invalidValidation.ok, false);
if (!invalidValidation.ok) {
  assert.ok(
    invalidValidation.issues.some(
      (issue) => issue.path === "$.lighting.preset"
    )
  );
  assert.ok(
    invalidValidation.issues.some(
      (issue) => issue.path === "$.lighting.shadowsEnabled"
    )
  );
}

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const commandBarSource = read("components/editor/EditorCommandBar.tsx");
const drawerSource = read(
  "components/editor/design-page/LightingSettingsDrawer.tsx"
);
const controlsSource = read(
  "components/editor/design-page/LightingSettingsControls.tsx"
);
const canvasSource = read(
  "components/editor/design-page/DesignSceneCanvas.tsx"
);
const presentationSource = read(
  "lib/useDesignPagePresentationWorkspaceRegistration.ts"
);

assert.match(
  commandBarSource,
  /data-testid="editor-command-overflow-lighting"[\s\S]*?Lighting settings/,
  "Lighting settings should open from the existing More menu."
);
assert.match(
  drawerSource,
  /role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby="lighting-settings-title"/,
  "The drawer should expose an accessible dialog contract."
);
assert.match(
  drawerSource,
  /event\.key === "Escape"[\s\S]*?onClose\(\)/,
  "Escape should close the lighting drawer."
);
assert.match(
  drawerSource,
  /sm:inset-y-0[\s\S]*?sm:right-0/,
  "The mobile bottom sheet should become a right-side desktop drawer."
);
assert.match(
  controlsSource,
  /role="switch"[\s\S]*?aria-checked=\{settings\.shadowsEnabled\}/,
  "The shadow toggle should be announced as a switch."
);
assert.match(
  controlsSource,
  /Shadows are paused in Lite mode\./,
  "Lite mode should explain temporary shadow suppression."
);
assert.match(
  canvasSource,
  /const effectiveShadowsEnabled =\s*viewMode === "3d" &&\s*state\.shadowsEnabled &&\s*!state\.liteSceneEnabled;/,
  "Effective shadows should require 3D, the saved preference, and non-Lite mode."
);
assert.match(
  canvasSource,
  /shadows=\{effectiveShadowsEnabled \? QUALITY_SHADOW_FILTER : false\}/,
  "Disabled shadows should turn off Canvas shadow-map rendering."
);
assert.match(
  canvasSource,
  /castShadow=\{effectiveShadowsEnabled\}/,
  "The key light should follow the effective shadow state."
);
assert.match(
  canvasSource,
  /receiveShadow=\{shadowsEnabled\}[\s\S]*?opacity=\{shadowsEnabled \? 0\.2 : 0\}/,
  "The workspace shadow catcher should turn off with shadows."
);
assert.match(
  presentationSource,
  /runHistoryTransaction\([\s\S]*?updateDesignLightingSettings/,
  "Lighting edits should enter the design history transaction."
);

console.log("Lighting settings compatibility and wiring checks passed.");
