function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validModelSample(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof value.key === "string" &&
      value.key.length > 0 &&
      nonNegativeInteger(value.renderCount) &&
      nonNegativeInteger(value.boundsMaterialChangeCount),
  );
}

export function evaluateRuntimeSmokeRendererIdle({ previous, current }) {
  if (
    !previous ||
    !current ||
    !Array.isArray(previous.models) ||
    !Array.isArray(current.models) ||
    previous.models.some((entry) => !validModelSample(entry)) ||
    current.models.some((entry) => !validModelSample(entry)) ||
    !nonNegativeInteger(previous.rendererCalls) ||
    !nonNegativeInteger(current.rendererCalls)
  ) {
    throw new Error("Runtime-smoke renderer-idle sample is malformed");
  }
  const modelsStable =
    previous.models.length > 0 &&
    previous.models.length === current.models.length &&
    current.models.every((entry, index) => {
      const prior = previous.models[index];
      return (
        prior.key === entry.key &&
        entry.boundsMaterialChangeCount >= 1 &&
        entry.renderCount === prior.renderCount &&
        entry.boundsMaterialChangeCount === prior.boundsMaterialChangeCount
      );
    });
  const rendererCallDelta = current.rendererCalls - previous.rendererCalls;
  return Object.freeze({
    settled: modelsStable && rendererCallDelta === 0,
    modelsStable,
    rendererIdle: rendererCallDelta === 0,
    rendererCallDelta,
  });
}
