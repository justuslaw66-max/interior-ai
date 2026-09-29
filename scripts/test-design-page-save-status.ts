import assert from "node:assert/strict";
import { getDesignPageSaveStatus, type DesignPageSaveStatusInput } from "../lib/design-page-save-status";

const base: DesignPageSaveStatusInput = {
  designId: null,
  isAuthenticated: false,
  isSaving: false,
  lastCloudSaveError: null,
  lastDbSaveAt: null,
  lastLocalAutosaveAt: null,
  lastLocalSaveError: null,
  hasPendingCloudSnapshotChanges: false,
  hasCloudConflict: false,
};

assert.deepEqual(getDesignPageSaveStatus(base), {
  kind: "pending",
  source: "local",
  label: "",
  detail: "Your design saves after your next change.",
  tone: "pending",
  canRetry: false,
  lastSuccessfulSaveAt: null,
});

assert.equal(
  getDesignPageSaveStatus({ ...base, designId: "design-1", isSaving: true }).label,
  "Saving…"
);

assert.equal(
  getDesignPageSaveStatus({
    ...base,
    designId: "design-1",
    isAuthenticated: true,
    lastCloudSaveError: "Network unavailable",
  }).canRetry,
  true
);

assert.equal(
  getDesignPageSaveStatus({
    ...base,
    designId: "design-1",
    lastDbSaveAt: Date.now(),
    hasPendingCloudSnapshotChanges: true,
  }).kind,
  "pending"
);

assert.equal(
  getDesignPageSaveStatus({
    ...base,
    designId: "design-1",
    isAuthenticated: true,
    lastLocalAutosaveAt: Date.now(),
  }).detail,
  "Not in your account yet. Save to keep it there."
);

const successfulSaveAt = 1_721_344_000_000;
assert.equal(
  getDesignPageSaveStatus({
    ...base,
    designId: "design-1",
    lastDbSaveAt: successfulSaveAt,
  }).lastSuccessfulSaveAt,
  successfulSaveAt
);

assert.deepEqual(
  getDesignPageSaveStatus({
    ...base,
    designId: "design-1",
    isAuthenticated: true,
    hasCloudConflict: true,
    lastCloudSaveError: "This design changed in another session.",
    lastDbSaveAt: successfulSaveAt,
  }),
  {
    kind: "conflict",
    source: "cloud",
    label: "Not saved",
    detail: "This design changed in another session. Choose which copy to keep.",
    tone: "error",
    canRetry: false,
    lastSuccessfulSaveAt: successfulSaveAt,
  }
);

// The four things the bar says (UX audit SX5), and the tooltip's detail.
const now = Date.now();
const said = (input: Partial<DesignPageSaveStatusInput>) => {
  const status = getDesignPageSaveStatus({ ...base, ...input });
  return [status.kind, status.source, status.label, status.detail];
};
assert.deepEqual(said({ designId: "design-1", lastDbSaveAt: now }), [
  "saved", "cloud", "Saved", "Saved to your account just now.",
]);
assert.deepEqual(said({ lastLocalAutosaveAt: now }), [
  "saved", "local", "Saved on this device", "Saved just now. Sign in to keep it in your account.",
]);
assert.deepEqual(said({ isSaving: true }), ["saving", "local", "Saving…", "Saving on this device."]);
assert.deepEqual(said({ designId: "design-1", isAuthenticated: true, lastCloudSaveError: "Network unavailable.", lastLocalAutosaveAt: now }), [
  "failed", "cloud", "Not saved", "Network unavailable. A copy was saved on this device just now.",
]);
assert.deepEqual(said({ lastLocalSaveError: "Storage is full." }), ["failed", "local", "Not saved", "Storage is full."]);
assert.equal(getDesignPageSaveStatus({ ...base, lastLocalSaveError: "Storage is full." }).canRetry, true);
assert.equal(getDesignPageSaveStatus({ ...base, designId: "design-1", lastCloudSaveError: "x" }).canRetry, false);
for (const retired of ["Cloud saved", "Local saved", "Cloud save pending", "Local backup pending", "Saving to cloud", "Saving locally"]) {
  for (const input of [{ designId: "design-1", lastDbSaveAt: now }, { lastLocalAutosaveAt: now }, { isSaving: true }, {}]) {
    const status = getDesignPageSaveStatus({ ...base, ...input });
    assert.ok(!`${status.label} ${status.detail}`.includes(retired), `"${retired}" is retired.`);
  }
}

console.log("design page save status tests passed");
