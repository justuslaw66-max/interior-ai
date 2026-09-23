import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  planPaletteOpeningSummary,
  roomSetupOpeningStatus,
} from "../lib/consumer-room-setup-copy";

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

// FR7 (UX audit 2026-09-23): OAuth configuration advice is for developers only.
const authError = read("app/auth/error/page.tsx");
assert.match(
  authError,
  /const developerNote =\s*process\.env\.NODE_ENV !== "production" \? copy\.developerNote : undefined;/,
  "The sign-in error page may show OAuth configuration advice only outside production."
);
assert.doesNotMatch(
  authError.replace(/developerNote:\s*"[^"]*",?/g, ""),
  /GOOGLE_CLIENT_SECRET|dev server|environment variable/i,
  "User-facing sign-in error copy must not mention environment variables or the dev server."
);
assert.doesNotMatch(
  authError,
  /params\.error \?\? "Configuration"/,
  "A missing error code must not be reported as a configuration failure."
);

// FR8: the editor names its loading state and the opening copy waits for plan settings.
assert.match(
  read("app/design/page.tsx"),
  /data-testid="design-page-loading"[\s\S]*?role="status">Opening your design…</,
  "The /design loading fallback should say what is happening instead of rendering a blank page."
);
assert.equal(
  roomSetupOpeningStatus({ hasConnectionBlockers: false, planSettingsReady: false, openingCount: 0 }),
  "Checking doors and windows…"
);
assert.equal(
  roomSetupOpeningStatus({ hasConnectionBlockers: false, planSettingsReady: true, openingCount: 2 }),
  "2 door/window openings placed."
);
assert.equal(
  roomSetupOpeningStatus({ hasConnectionBlockers: false, planSettingsReady: true, openingCount: 0 }),
  "No doors or windows placed yet. Add only the openings that affect fit."
);
assert.equal(
  roomSetupOpeningStatus({ hasConnectionBlockers: true, planSettingsReady: false, openingCount: 0 }),
  "A connected room still needs a doorway. Add one before furnishing."
);
assert.equal(planPaletteOpeningSummary(false, 0), "");
assert.equal(planPaletteOpeningSummary(true, 2), "2 openings placed.");
assert.equal(planPaletteOpeningSummary(true, 0), "Openings optional.");
assert.match(
  read("components/editor/ConsumerRoomSetupCard.tsx"),
  /roomSetupOpeningStatus\(\{ hasConnectionBlockers, planSettingsReady: measurementUnitReady, openingCount \}\)/,
  "The room setup card must take its opening status from the shared copy owner."
);
assert.match(
  read("components/editor/DesignControlsPlanPanel.tsx"),
  /planPaletteOpeningSummary\(measurementUnitReady, planOpeningCount\)/,
  "The Plan palette summary must take its opening copy from the shared copy owner."
);

// SX9 / AX9: every dead end offers a way back into the app.
const notFound = read("app/not-found.tsx");
assert.match(notFound, /href="\/design"[\s\S]*?Start designing/);
assert.match(notFound, /href="\/dashboard"[\s\S]*?My designs/);
assert.match(
  read("app/global-error.tsx"),
  /<html[\s\S]*?onClick=\{reset\}[\s\S]*?Try again[\s\S]*?window\.location\.assign\("\/design"\)/,
  "The global error page must offer retry and a way back to the editor."
);
assert.match(
  read("components/public-share/PublicShareUnavailableCard.tsx"),
  /href="\/design"[\s\S]*?Start your own design/
);
assert.match(read("components/public-share/PublicShareRootLifecycle.tsx"), /<PublicShareUnavailableCard \/>/);
assert.match(read("app/share/[shareToken]/export/page.tsx"), /<PublicShareUnavailableCard \/>/);
assert.doesNotMatch(
  read("components/CanvasErrorBoundary.tsx"),
  /3D view encountered|Reload Page/,
  "The canvas boundary wraps both 2D and 3D, so its copy must not blame the 3D view."
);

console.log("UX states and fallbacks checks passed.");
