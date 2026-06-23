import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const statusBarPath = path.join(process.cwd(), "components", "editor", "RoomPlanStatusBar.tsx");
const source = fs.readFileSync(statusBarPath, "utf8");

assert.match(
  source,
  /flex flex-nowrap items-center justify-start overflow-hidden/,
  "Room plan status bar should stay on one row instead of wrapping the view toggle under the status copy."
);

assert.doesNotMatch(
  source,
  /flex flex-wrap items-center justify-center/,
  "Room plan status bar should not center wrapped controls in a second row."
);

assert.match(
  source,
  /data-testid="room-plan-status-next-action"[\s\S]*?max-w-36 truncate 2xl:block/,
  "Long health guidance should stay truncated and only appear on very wide screens."
);

assert.match(
  source,
  /data-testid="room-plan-status-view-toggle"[\s\S]*?className=\{`\$\{buttonClass\} shrink-0`\}/,
  "The room/plan view toggle should keep a stable width and stay in the action cluster."
);

console.log("Room plan status bar layout guardrails passed.");
