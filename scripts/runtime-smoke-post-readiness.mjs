function checkpointFragment(value, maximumLength = 64) {
  const normalized = String(value ?? "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (normalized || "unknown").slice(0, maximumLength);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function runRuntimeSmokePostReadinessOperation({
  checkpoint,
  startedCheckpoint,
  completedCheckpoint,
  task,
}) {
  checkpoint(startedCheckpoint, "ready");
  const result = await task();
  checkpoint(completedCheckpoint, "ready");
  return result;
}

export function captureImmediatePostReadinessSnapshot({
  checkpoint,
  phaseName,
  responseTotal,
  snapshot,
  timing,
  writeDiagnostic = (message) => console.info(message),
}) {
  if (snapshot?.schema !== "interior-ai.glb-required-snapshot.v1") {
    throw new Error("Immediate post-readiness snapshot is missing or malformed");
  }
  if (!Number.isSafeInteger(responseTotal) || responseTotal < 0) {
    throw new Error("Immediate post-readiness response total is invalid");
  }
  const detachedSnapshot = cloneJson(snapshot);
  const activeRequired = detachedSnapshot.models.filter(
    (model) => model.active && model.requiredForReadiness,
  );
  const readyCount = activeRequired.filter(
    (model) => model.loadState === "ready",
  ).length;
  const loadingCount = activeRequired.filter(
    (model) => model.loadState === "loading",
  ).length;
  const errorCount = activeRequired.filter(
    (model) => model.loadState === "error",
  ).length;
  const staleCount = detachedSnapshot.models.filter(
    (model) => model.generationState !== "current",
  ).length;

  checkpoint("immediate-snapshot-captured", "ready");
  checkpoint(
    `immediate-generation-${detachedSnapshot.reloadGeneration}`,
    "ready",
  );
  checkpoint(
    `immediate-registry-${detachedSnapshot.registryEntryCount}` +
      `-required-${detachedSnapshot.activeRequiredCount}` +
      `-ready-${readyCount}-loading-${loadingCount}` +
      `-error-${errorCount}-stale-${staleCount}`,
    "ready",
  );
  checkpoint(
    `immediate-cache-parsed-${detachedSnapshot.caches.parsed.entryCount}` +
      `-refs-${detachedSnapshot.caches.parsed.activeReferenceCount}` +
      `-prepared-${detachedSnapshot.caches.prepared.entryCount}` +
      `-refs-${detachedSnapshot.caches.prepared.activeReferenceCount}` +
      `-retained-${detachedSnapshot.caches.prepared.zeroReferenceEntryCount}`,
    "ready",
  );
  checkpoint(`immediate-response-total-${responseTotal}`, "ready");
  detachedSnapshot.activeRequiredModelIds.forEach((key, index) => {
    checkpoint(
      `immediate-active-key-${index + 1}-${checkpointFragment(key)}`,
      "ready",
    );
  });
  activeRequired.forEach((model, index) => {
    checkpoint(
      `immediate-model-${index + 1}-transition-` +
        `${checkpointFragment(model.lastTransitionName, 24)}` +
        `-at-${Math.max(0, Math.round(model.lastTransitionAtMs ?? 0))}`,
      "ready",
    );
  });
  if (timing) {
    checkpoint(
      `immediate-snapshot-wait-${timing.schedulingDelayMs}` +
        `-compute-${timing.computationDurationMs}` +
        `-serialize-${timing.serializationDurationMs}` +
        `-transfer-${timing.transferDurationMs}`,
      "ready",
    );
  }
  const relativeTiming = timing
    ? {
        schedulingDelayMs: timing.schedulingDelayMs,
        computationDurationMs: timing.computationDurationMs,
        serializationDurationMs: timing.serializationDurationMs,
        transferDurationMs: timing.transferDurationMs,
      }
    : null;
  writeDiagnostic(
    `[runtime-smoke-immediate-post-readiness-snapshot] ${JSON.stringify({
      phaseName,
      responseTotal,
      timing: relativeTiming,
      snapshot: detachedSnapshot,
    })}`,
  );
  return detachedSnapshot;
}
