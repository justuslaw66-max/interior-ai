import type {
  GLBModelDiagnosticSnapshot,
  GLBRequiredModelIdentity,
  GLBRequiredModelReadiness,
} from "./modelLifecycleTypes";

export function evaluateRequiredGLBModelReadiness(
  snapshots: GLBModelDiagnosticSnapshot[],
  requiredIdentities: GLBRequiredModelIdentity[]
): GLBRequiredModelReadiness {
  const snapshotByKey = new Map(
    snapshots.map((snapshot) => [snapshot.key, snapshot])
  );
  const pending: GLBRequiredModelReadiness["pending"] = [];
  const errors: GLBRequiredModelReadiness["errors"] = [];

  for (const identity of requiredIdentities) {
    const snapshot = snapshotByKey.get(identity.key);
    if (
      !snapshot ||
      snapshot.mountInstanceId !== identity.mountInstanceId ||
      snapshot.reloadGeneration !== identity.reloadGeneration ||
      !snapshot.requiredForReadiness
    ) {
      pending.push({ key: identity.key, pendingStage: "identity-mismatch" });
      continue;
    }
    if (snapshot.loadState === "error" && snapshot.terminalErrorCategory) {
      errors.push({
        key: identity.key,
        category: snapshot.terminalErrorCategory,
      });
      continue;
    }
    if (!snapshot.active || snapshot.loadState !== "ready") {
      pending.push({
        key: identity.key,
        pendingStage: snapshot.pendingStage ?? snapshot.loadState,
      });
    }
  }

  return {
    state: errors.length > 0 ? "error" : pending.length > 0 ? "loading" : "ready",
    pending,
    errors,
  };
}
