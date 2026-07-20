import { defineConfig, devices } from "@playwright/test";

const localBaseURL = "http://127.0.0.1:3000";
const releaseBaseURL = process.env.PLAYWRIGHT_RELEASE_BASE_URL?.trim().replace(
  /\/+$/,
  ""
);
const useProductionServer = process.env.PLAYWRIGHT_USE_PRODUCTION_SERVER === "1";

if (releaseBaseURL) {
  const parsedURL = new URL(releaseBaseURL);

  if (parsedURL.protocol !== "https:") {
    throw new Error(
      "PLAYWRIGHT_RELEASE_BASE_URL must use HTTPS for release-candidate testing."
    );
  }
}

const baseURL = releaseBaseURL ?? localBaseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  metadata: {
    gateA3ReleaseBaseURL: releaseBaseURL ?? null,
  },
  use: {
    baseURL,
    actionTimeout: 30000,
    navigationTimeout: 60000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(releaseBaseURL
    ? {}
    : {
        webServer: {
          command: useProductionServer ? "npm run start" : "npm run dev",
          url: localBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
        },
      }),
});
