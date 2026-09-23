import assert from "node:assert/strict";

import { floorPlanVisionRuntimeConfiguration } from "@/lib/floor-plan-imports/vision-configuration";

const names = [
  "FLOOR_PLAN_VISION_DISABLED",
  "FLOOR_PLAN_VISION_ENABLED",
  "FLOOR_PLAN_VISION_MODEL",
  "OPENAI_API_KEY",
] as const;

const previous = Object.fromEntries(
  names.map((name) => [name, process.env[name]]),
) as Record<(typeof names)[number], string | undefined>;

function clearVisionEnvironment() {
  for (const name of names) delete process.env[name];
}

try {
  // The module import before environment setup is deliberate: configuration is read per call.
  clearVisionEnvironment();
  assert.deepEqual(floorPlanVisionRuntimeConfiguration(), {
    externalVisionEnabled: false,
    apiKeyConfigured: false,
    safetyOverrideEnabled: false,
    model: "gpt-5.6",
  });

  process.env.FLOOR_PLAN_VISION_ENABLED = "0";
  assert.equal(
    floorPlanVisionRuntimeConfiguration().externalVisionEnabled,
    false,
  );

  process.env.FLOOR_PLAN_VISION_ENABLED = "1";
  assert.equal(
    floorPlanVisionRuntimeConfiguration().externalVisionEnabled,
    true,
  );

  process.env.OPENAI_API_KEY = "synthetic-floor-plan-config-secret";
  process.env.FLOOR_PLAN_VISION_DISABLED = "1";
  process.env.FLOOR_PLAN_VISION_MODEL = "synthetic-floor-plan-model";
  assert.deepEqual(floorPlanVisionRuntimeConfiguration(), {
    externalVisionEnabled: true,
    apiKeyConfigured: true,
    safetyOverrideEnabled: true,
    model: "synthetic-floor-plan-model",
  });
} finally {
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
}

console.log("Floor-plan vision configuration tests passed.");
