import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config";

const chromium = baseConfig.projects?.find(
  (project) => project.name === "chromium",
);

if (!chromium) {
  throw new Error("Runtime-smoke timeout integration requires the chromium project");
}

// This configuration is selected only by the module-level Stable-parent test
// injection. No environment value can activate the deliberate product timeout.
export default defineConfig({
  ...baseConfig,
  projects: [
    {
      ...chromium,
      metadata: {
        ...chromium.metadata,
        runtimeSmokeTestInjection: "post-product-diagnostics-timeout",
      },
    },
  ],
});
