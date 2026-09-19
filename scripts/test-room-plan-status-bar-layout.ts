import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import RoomPlanStatusBar, { formatRoomStatusDetails } from "@/components/editor/RoomPlanStatusBar";
import type { DisplayUnit } from "@/lib/display-units";

const statusBarPath = path.join(process.cwd(), "components", "editor", "RoomPlanStatusBar.tsx");
const source = fs.readFileSync(statusBarPath, "utf8");

assert.match(
  source,
  /flex min-w-0 flex-nowrap items-center justify-start overflow-hidden/,
  "Room plan status bar should stay on one row instead of wrapping the view toggle under the status copy."
);

assert.doesNotMatch(
  source,
  /flex flex-wrap items-center justify-center/,
  "Room plan status bar should not center wrapped controls in a second row."
);

assert.match(
  source,
  /data-testid="room-plan-status-next-action"[\s\S]*?max-w-36 truncate \$\{isCommand \? "" : "2xl:block"\}/,
  "Long health guidance should stay truncated and only appear on very wide screens."
);

assert.match(
  source,
  /isCommand[\s\S]*\? "h-\[30px\] max-w-full/,
  "Command-bar room context should fit the balanced 30px toolbar control height."
);

assert.match(
  source,
  /data-testid="room-plan-status-view-toggle"[\s\S]*?className=\{`\$\{buttonClass\} shrink-0`\}/,
  "The room/plan view toggle should keep a stable width and stay in the action cluster."
);

function renderRoomSizeElement(measurementUnit: DisplayUnit | null): string {
  const props: ComponentProps<typeof RoomPlanStatusBar> = {
    roomName: "Living room",
    roomTypeLabel: "Living",
    roomCount: 1,
    widthMeters: 4.2,
    depthMeters: 3.8,
    measurementUnit,
    viewMode: "2d",
    variant: "command",
    onViewModeChange: () => undefined,
  };
  const markup = renderToStaticMarkup(createElement(RoomPlanStatusBar, props));
  const match = markup.match(/<div data-testid="room-plan-status-room-size"[\s\S]*?<\/div>/);
  assert.ok(match, "The room status should render its room-size readout.");
  return match[0];
}

function renderRoomSize(measurementUnit: DisplayUnit): string {
  const element = renderRoomSizeElement(measurementUnit);
  assert.match(element, /aria-busy="false"/, "A resolved display unit should not mark the room size busy.");
  return element.replace(/<[^>]*>/g, "");
}

assert.equal(
  renderRoomSize("cm"),
  "420 cm × 380 cm",
  "The command-bar room size should follow the default cm display unit instead of hard-coded metres."
);
assert.equal(
  renderRoomSize("ft-in"),
  "13′ 9.4″ × 12′ 5.6″",
  "Imperial viewers should read the command-bar room size in feet and inches."
);
// Until the saved display unit loads, the pill must not flash the default unit (server HTML included).
const pendingRoomSize = renderRoomSizeElement(null);
assert.match(pendingRoomSize, /aria-busy="true"/, "The room size should be marked busy while the display unit loads.");
assert.match(
  pendingRoomSize,
  /data-testid="room-plan-status-room-size-placeholder"/,
  "The room size should show a neutral placeholder while the display unit loads."
);
assert.equal(
  pendingRoomSize.replace(/<[^>]*>/g, ""),
  "",
  "The room size must not render a default-unit length before the saved display unit loads."
);
assert.equal(
  formatRoomStatusDetails({
    roomTypeLabel: "Living", widthMeters: 4.2, depthMeters: 3.8, measurementUnit: "ft-in", roomCount: 2,
  }),
  "Living · 13′ 9.4″ × 12′ 5.6″ · 2 rooms",
  "The compact overflow room details should show the size in the plan display unit."
);
assert.equal(
  formatRoomStatusDetails({
    roomTypeLabel: "Living", widthMeters: 4.2, depthMeters: 3.8, measurementUnit: null, roomCount: 1,
  }),
  "Living · 1 room",
  "The compact overflow room details should omit the size until the display unit loads."
);
assert.match(
  source,
  /data-testid="room-plan-status-room-size"[^>]*?className=\{`\$\{metaClass\} whitespace-nowrap`\}/,
  "The longer unit-aware room size should stay on one line inside the 30px command pill."
);

console.log("Room plan status bar layout guardrails passed.");
