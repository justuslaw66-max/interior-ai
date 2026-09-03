import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const baseURL = process.env.WINDOW_OPENING_BASE_URL;
const runRoot = process.env.WINDOW_OPENING_RUN_ROOT;
if (!baseURL || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL)) {
  throw new Error("WINDOW_OPENING_BASE_URL must name a dedicated 127.0.0.1 port.");
}
if (!runRoot || !path.isAbsolute(runRoot)) {
  throw new Error("WINDOW_OPENING_RUN_ROOT must be an absolute immutable run directory.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "window-opening-corrections.spec.ts",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  outputDir: path.join(runRoot, "playwright-output"),
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(runRoot, "playwright-report.json") }],
  ],
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
    trace: "on",
    screenshot: "only-on-failure",
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
  }],
});
