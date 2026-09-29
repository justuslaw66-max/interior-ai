import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomSetupProgressChips } from "../components/editor/RoomSetupProgressChips";
import { RoomSetupStatusBadge, roomSetupStatus } from "../components/editor/RoomSetupStatusBadge";
import { AiLayoutReadinessChecklist } from "../components/editor/AiLayoutReadinessChecklist";
import { aiLayoutReadinessChecks } from "../lib/ai-layout-readiness";
import { ROOM_DIMENSION_DEFAULTS } from "../lib/design-page-house-plan";
import { isUntouchedStarterRoom } from "../lib/design-page-template-furnishings";
import type { RoomOpening2D } from "../lib/editorScene";
import { createRoom, type DesignItem, type RoomSnapshot } from "../lib/room-types";

// The first room (audit finding FR2): the first visit's untouched room reads as a draft, with one
// badge. FR5 (no inspector on arrival) waits for a way to select a one-room plan by clicking it.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const starter = (overrides: Partial<RoomSnapshot> = {}) => ({
  ...createRoom("room_living", "Living Room", "living", {
    width: ROOM_DIMENSION_DEFAULTS.width,
    depth: ROOM_DIMENSION_DEFAULTS.depth,
    wallThickness: ROOM_DIMENSION_DEFAULTS.wallThickness,
    height: ROOM_DIMENSION_DEFAULTS.roomHeight,
  }),
  ...overrides,
});
const openings = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `opening-${index}` }) as unknown as RoomOpening2D);

// What counts as the untouched starter room.
assert.equal(isUntouchedStarterRoom({ rooms: [starter()] }, openings(2)), true, "The first visit's room, with its door and window.");
assert.equal(isUntouchedStarterRoom({ rooms: [starter()] }, []), true, "Blank room and Draw room start from the same room.");
assert.equal(isUntouchedStarterRoom({ rooms: [starter()] }, openings(3)), false, "A third opening is the person's.");
assert.equal(
  isUntouchedStarterRoom({ rooms: [starter({ geometry: { ...starter().geometry, width: 4.95 } })] }, openings(2)),
  false,
  "A real width makes it the person's room."
);
assert.equal(isUntouchedStarterRoom({ rooms: [starter({ roomType: "bedroom" })] }, openings(2)), false);
assert.equal(
  isUntouchedStarterRoom({ rooms: [starter({ items: [{ id: "sofa" } as unknown as DesignItem] })] }, openings(2)),
  false,
  "A product makes it the person's room."
);
assert.equal(isUntouchedStarterRoom({ rooms: [starter(), starter({ id: "room_2" })] }, []), false);
assert.equal(isUntouchedStarterRoom({ rooms: [] }, []), false, "No room is not a draft room.");

// FR2: the room card's one badge.
assert.equal(roomSetupStatus(false, false), "none");
assert.equal(roomSetupStatus(true, true), "draft");
assert.equal(roomSetupStatus(true, false), "ready");
const badge = (status: Parameters<typeof RoomSetupStatusBadge>[0]["status"]) =>
  renderToStaticMarkup(createElement(RoomSetupStatusBadge, { dark: false, status }));
assert.match(badge("draft"), /data-testid="room-setup-status" data-status="draft" class="[^"]*bg-amber-50[^"]*">Default size</);
assert.match(badge("ready"), /data-status="ready" class="[^"]*bg-emerald-50[^"]*">Room ready</);
assert.match(badge("none"), /data-status="none" class="[^"]*bg-amber-50[^"]*">Needs a room</);

// FR2: no "Not started" beside a draft room; the chips come back once the room is the person's.
const chips = (roomIsDraft: boolean) =>
  renderToStaticMarkup(createElement(RoomSetupProgressChips, {
    roomIsDraft, hasRooms: true, readyClass: "ready", todoClass: "todo",
    furniture: { label: "Not started", ready: false },
    openings: { label: "2 placed", ready: true },
  }));
assert.equal(chips(true), "");
assert.match(chips(false), /data-testid="room-setup-step-furnish-meta" class="todo">Not started<\/span><span class="ready">2 placed</);

// FR2: Suggest a layout doesn't call a default-size room measured, but can still suggest a layout.
const checks = (roomIsDraft: boolean, roomArea = 20) =>
  aiLayoutReadinessChecks({ roomSupported: true, roomArea, roomIsDraft, mustHaveCount: 3, measurementUnit: "cm" });
assert.deepEqual(checks(true)[1], { label: "Measured room", ready: false, detail: "Default size" });
assert.equal(checks(false)[1].ready, true);
assert.match(checks(false)[1].detail, /20/);
assert.deepEqual(checks(false, 0)[1], { label: "Measured room", ready: false, detail: "Add dimensions" });
assert.deepEqual(checks(true).map((check) => check.label), ["Living room", "Measured room", "Must-haves"]);
const checklist = renderToStaticMarkup(createElement(AiLayoutReadinessChecklist, { dark: false, checks: checks(true) }));
assert.match(checklist, /data-testid="ai-layout-readiness"/);
assert.match(checklist, />Ready to generate</);
assert.match(checklist, /Measured room<\/span><span class="[^"]*bg-amber-50[^"]*">Default size</);
const aiPanel = read("components/editor/DesignControlsAiPanel.tsx");
assert.match(aiPanel, /const briefReady = aiMustHaves\.length > 0 && roomArea > 0 && roomSupported;/, "A draft room can still get a layout.");
assert.match(aiPanel, /aiLayoutReadinessChecks\(\{\s*roomSupported, roomArea, roomIsDraft,/);

// FR2 wiring: one predicate, computed once for the panels.
assert.match(
  read("lib/design-page-panel-workspace-registration.ts"),
  /roomIsDraft: isUntouchedStarterRoom\(coreShell\.state\.document\.designSnapshot, planDocument\.state\.planOpenings\)/
);
const planPanel = read("components/editor/DesignControlsPlanPanel.tsx");
assert.match(planPanel, /roomIsDraft \? "Enter your room's real size\." : `\$\{planRoomCount\} room/);
assert.match(planPanel, /<RoomSetupProgressChips roomIsDraft=\{roomIsDraft\}/);
assert.match(planPanel, /<ConsumerRoomSetupCard[\s\S]*?roomIsDraft=\{roomIsDraft\}/);
assert.match(read("components/editor/ConsumerRoomSetupCard.tsx"), /status=\{roomSetupStatus\(hasRooms, roomIsDraft\)\}/);
assert.match(read("components/editor/DesignControlsPanel.tsx"), /measurementUnit, roomIsDraft \}\}/);

// FR5 waits. A single rectangular room has nothing to click in 2D (no room label or body to hit), so
// if it weren't selected on arrival, its inspector couldn't be opened from the plan. It is selected
// on arrival, for everyone, as before.
const sceneReadModel = read("lib/useDesignPageSceneReadModel.ts");
assert.match(
  sceneReadModel,
  /if \(activeRoomChanged\) \{[\s\S]*?activeRoomId && roomIds\.has\(activeRoomId\) \? activeRoomId : null/
);
assert.doesNotMatch(sceneReadModel, /deferStarterRoomSelection/);
assert.doesNotMatch(read("lib/useDesignPageDocumentSelectionRegistrationFacade.ts"), /isUntouchedStarterRoom/);
// Not selected isn't out of focus: with nothing selected (after Escape, say), Plan still draws a plan's
// only room in focus, with its sizes and its door and window labels.
assert.match(
  sceneReadModel,
  /const planFocusRoomId = selectedPlanRoomId \?\? \(housePlanRooms\.length === 1 \? housePlanRooms\[0\]\.id : null\);/
);
assert.match(read("lib/useDesignPageSceneRegionWorkspaceRegistration.ts"), /focusRoomId: scene\.planFocusRoomId,/);
assert.match(read("lib/design-page-scene-region-adapter.ts"), /activeRoomId: plan\.focusRoomId,/);

console.log("First room draft (FR2) checks passed.");
