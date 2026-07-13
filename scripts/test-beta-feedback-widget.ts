import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const widgetSource = readFileSync(
  join(process.cwd(), "components/BetaFeedbackWidget.tsx"),
  "utf8"
);
const commandBarSource = readFileSync(
  join(process.cwd(), "components/editor/EditorCommandBar.tsx"),
  "utf8"
);
const designPageSource = readFileSync(join(process.cwd(), "app/design/page.tsx"), "utf8");
const appEventRouteSource = readFileSync(
  join(process.cwd(), "app/api/track/app-event/route.ts"),
  "utf8"
);
const appEventsSource = readFileSync(join(process.cwd(), "lib/app-events.ts"), "utf8");

assert.match(
  appEventsSource,
  /"beta_feedback_submitted"/,
  "beta feedback should be included in the typed app-event union."
);
assert.match(
  appEventRouteSource,
  /new Set<AppEventType>\(APP_EVENT_TYPES\)/,
  "beta feedback should be accepted through the shared typed app-event allow-list."
);
assert.match(
  appEventsSource,
  /AppEventLogResult[\s\S]*eventId/,
  "app event logging should return a persisted report id for smoke evidence."
);
assert.match(
  appEventRouteSource,
  /eventId:\s*result\.eventId/,
  "app-event route should return the persisted event id."
);
assert.match(
  commandBarSource,
  /data-testid="beta-feedback-open"/,
  "beta feedback entry point in the More menu should have a stable test id."
);
assert.match(
  commandBarSource,
  /data-testid="beta-feedback-open"[\s\S]*setOverflowOpen\(false\);[\s\S]*onFeedback\(\);/,
  "opening feedback should close the More menu first."
);
assert.match(
  widgetSource,
  /data-testid="beta-feedback-dialog"/,
  "beta feedback dialog should have a stable test id."
);
assert.match(
  widgetSource,
  /data-testid="beta-feedback-note"/,
  "beta feedback note field should have a stable test id."
);
assert.match(
  widgetSource,
  /data-testid="beta-feedback-submit"/,
  "beta feedback submit action should have a stable test id."
);
assert.match(
  widgetSource,
  /role="status"/,
  "beta feedback submission state should be announced as status text."
);
assert.match(
  widgetSource,
  /data-testid="beta-feedback-report-id"/,
  "beta feedback success state should expose a copyable report id for staging signoff."
);
assert.match(
  widgetSource,
  /maxLength=\{1200\}/,
  "beta feedback notes should stay bounded before submission."
);
assert.match(
  widgetSource,
  /trimmed\.slice\(0,\s*1200\)/,
  "beta feedback payload should be capped even if the DOM limit is bypassed."
);
assert.match(
  widgetSource,
  /fetch\("\/api\/track\/app-event"/,
  "beta feedback should post to the durable app-event endpoint."
);
assert.match(
  widgetSource,
  /response\.json\(\)[\s\S]*setReportId/,
  "beta feedback should read the durable event id from the API response."
);
assert.match(
  widgetSource,
  /eventType:\s*"beta_feedback_submitted"/,
  "beta feedback should send the expected app-event type."
);
assert.match(
  widgetSource,
  /exportReadinessScore/,
  "beta feedback context should include export readiness."
);
assert.match(
  widgetSource,
  /viewportWidth[\s\S]*viewportHeight/,
  "beta feedback context should include viewport dimensions."
);
assert.match(
  designPageSource,
  /!\s*isClientPreview\s*&&\s*\([\s\S]*<BetaFeedbackWidget/,
  "beta feedback should mount in the editor but not in client preview mode."
);
assert.match(
  designPageSource,
  /<BetaFeedbackWidget[\s\S]*open=\{feedbackOpen\}[\s\S]*onOpenChange=\{setFeedbackOpen\}[\s\S]*showTrigger=\{false\}/,
  "the feedback dialog should remain mounted outside the More menu with its floating trigger hidden."
);
assert.match(
  designPageSource,
  /roomCount:\s*housePlan2D\.rooms\.length[\s\S]*itemCount:\s*items\.length[\s\S]*openingCount:\s*planOpenings\.length/,
  "editor feedback context should include room, item, and opening counts."
);

console.log("Beta feedback widget checks passed.");
