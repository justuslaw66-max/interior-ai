export function floorPlanVisionRuntimeConfiguration(
  environment: NodeJS.ProcessEnv = process.env
) {
  return Object.freeze({
    externalVisionEnabled: environment.FLOOR_PLAN_VISION_ENABLED === "1",
    apiKeyConfigured: Boolean(environment.OPENAI_API_KEY),
    safetyOverrideEnabled: environment.FLOOR_PLAN_VISION_DISABLED === "1",
    model: environment.FLOOR_PLAN_VISION_MODEL || "gpt-5.6",
  });
}
