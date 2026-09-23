import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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

console.log("UX states and fallbacks checks passed.");
