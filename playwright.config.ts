import { defineConfig, devices } from "@playwright/test";

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^\[(.*)\]$/, "$1");
}

function isLoopbackHostname(hostname: string) {
  const normalized = normalizeHostname(hostname);
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (normalized === "::" || normalized === "::1") return true;
  if (/^(?:0|127)(?:\.|$)/.test(normalized)) return true;
  return /^::(?:ffff:)?7f[0-9a-f]{2}:/.test(normalized);
}

const CONFIGURED_LOCAL_SERVER_PORT = Number(process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? 3000);
if (
  !Number.isInteger(CONFIGURED_LOCAL_SERVER_PORT) ||
  CONFIGURED_LOCAL_SERVER_PORT < 1 ||
  CONFIGURED_LOCAL_SERVER_PORT > 65_535
) {
  throw new Error("PLAYWRIGHT_WEB_SERVER_PORT must be an integer from 1 to 65535.");
}
const DEFAULT_LOCAL_BASE_URL = `http://127.0.0.1:${CONFIGURED_LOCAL_SERVER_PORT}`;
const LEGACY_LOCAL_BASE_URL = process.env.PLAYWRIGHT_BASE_URL?.trim().replace(/\/+$/, "");
const LOCAL_BASE_URL = LEGACY_LOCAL_BASE_URL || DEFAULT_LOCAL_BASE_URL;
let localServerPort = CONFIGURED_LOCAL_SERVER_PORT;
const RELEASE_BASE_URL = process.env.PLAYWRIGHT_RELEASE_BASE_URL?.trim().replace(
  /\/+$/,
  ""
);
const RELEASE_COMMIT = process.env.PLAYWRIGHT_RELEASE_COMMIT?.trim();
const RELEASE_ENVIRONMENT = process.env.PLAYWRIGHT_RELEASE_ENVIRONMENT?.trim();
const VERCEL_PROTECTION_BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

if (LEGACY_LOCAL_BASE_URL) {
  const parsedLocalURL = new URL(LEGACY_LOCAL_BASE_URL);
  const localHostname = normalizeHostname(parsedLocalURL.hostname);
  if (
    parsedLocalURL.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(localHostname) ||
    parsedLocalURL.username ||
    parsedLocalURL.password ||
    parsedLocalURL.pathname !== "/" ||
    parsedLocalURL.search ||
    parsedLocalURL.hash
  ) {
    throw new Error(
      "PLAYWRIGHT_BASE_URL is restricted to local testing. Use PLAYWRIGHT_RELEASE_BASE_URL for a hosted release candidate."
    );
  }
  localServerPort = parsedLocalURL.port ? Number(parsedLocalURL.port) : 80;
}

if (RELEASE_BASE_URL) {
  const parsedReleaseURL = new URL(RELEASE_BASE_URL);
  if (parsedReleaseURL.protocol !== "https:") {
    throw new Error(
      "PLAYWRIGHT_RELEASE_BASE_URL must use HTTPS for release-candidate testing."
    );
  }
  const releaseHostname = parsedReleaseURL.hostname;
  if (
    isLoopbackHostname(releaseHostname) ||
    parsedReleaseURL.username ||
    parsedReleaseURL.password ||
    parsedReleaseURL.pathname !== "/" ||
    parsedReleaseURL.search ||
    parsedReleaseURL.hash
  ) {
    throw new Error(
      "PLAYWRIGHT_RELEASE_BASE_URL must identify a hosted release candidate, not a loopback or credential-bearing URL."
    );
  }
  if (!RELEASE_COMMIT || !/^[0-9a-f]{40}$/i.test(RELEASE_COMMIT)) {
    throw new Error(
      "PLAYWRIGHT_RELEASE_COMMIT must be the exact 40-character release commit SHA."
    );
  }
  if (!RELEASE_ENVIRONMENT) {
    throw new Error(
      "PLAYWRIGHT_RELEASE_ENVIRONMENT is required for hosted release-candidate testing."
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
  metadata: RELEASE_BASE_URL
    ? {
        buildCommit: RELEASE_COMMIT!,
        releaseEnvironment: RELEASE_ENVIRONMENT!,
        releaseBaseURL: RELEASE_BASE_URL,
      }
    : {},
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
          command: `npx next start -H 127.0.0.1 -p ${localServerPort}`,
          url: LOCAL_BASE_URL,
          // Release preflight must fail on a port collision instead of silently testing another build.
          reuseExistingServer: false,
          timeout: 120 * 1000,
        },
      }),
});
