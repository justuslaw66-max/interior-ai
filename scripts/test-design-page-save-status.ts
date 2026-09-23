import assert from "node:assert/strict";
import { getDesignPageSaveStatus } from "../lib/design-page-save-status";

const base = {
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
  label: "Local backup pending",
  detail: "Autosave will run after your next edit.",
  tone: "pending",
  canRetry: false,
  lastSuccessfulSaveAt: null,
});

assert.equal(
  getDesignPageSaveStatus({ ...base, designId: "design-1", isSaving: true }).label,
  "Saving to cloud"
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
  "Cloud save pending"
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
    label: "Save conflict",
    detail: "Cloud changed in another session. Choose which copy to keep.",
    tone: "error",
    canRetry: false,
    lastSuccessfulSaveAt: successfulSaveAt,
  }
);

console.log("design page save status tests passed");
