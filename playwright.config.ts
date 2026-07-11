import { defineConfig, devices } from "@playwright/test";

const PLAYWRIGHT_SERVER_PORT = Number(process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? 3000);
const DEFAULT_LOCAL_BASE_URL = `http://127.0.0.1:${PLAYWRIGHT_SERVER_PORT}`;
const LEGACY_LOCAL_BASE_URL = process.env.PLAYWRIGHT_BASE_URL?.trim().replace(/\/+$/, "");
const LOCAL_BASE_URL = LEGACY_LOCAL_BASE_URL || DEFAULT_LOCAL_BASE_URL;
const RELEASE_BASE_URL = process.env.PLAYWRIGHT_RELEASE_BASE_URL?.trim().replace(
  /\/+$/,
  ""
);
const VERCEL_PROTECTION_BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

if (LEGACY_LOCAL_BASE_URL) {
  const parsedLocalURL = new URL(LEGACY_LOCAL_BASE_URL);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsedLocalURL.hostname)) {
    throw new Error(
      "PLAYWRIGHT_BASE_URL is restricted to local testing. Use PLAYWRIGHT_RELEASE_BASE_URL for a hosted release candidate."
    );
  }
}

if (RELEASE_BASE_URL) {
  const parsedReleaseURL = new URL(RELEASE_BASE_URL);
  if (parsedReleaseURL.protocol !== "https:") {
    throw new Error(
      "PLAYWRIGHT_RELEASE_BASE_URL must use HTTPS for release-candidate testing."
    );
  }
}

if (VERCEL_PROTECTION_BYPASS && !RELEASE_BASE_URL) {
  throw new Error(
    "VERCEL_AUTOMATION_BYPASS_SECRET may only be used with PLAYWRIGHT_RELEASE_BASE_URL."
  );
}

const BASE_URL = RELEASE_BASE_URL ?? LOCAL_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: process.env.CI ? 90_000 : 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/results.json" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: RELEASE_BASE_URL ? "off" : "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  ...(RELEASE_BASE_URL
    ? {}
    : {
        webServer: {
          command: `npx next start -H 127.0.0.1 -p ${PLAYWRIGHT_SERVER_PORT}`,
          url: LOCAL_BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        },
      }),
});
