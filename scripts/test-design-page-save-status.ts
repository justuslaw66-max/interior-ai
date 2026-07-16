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
};

assert.deepEqual(getDesignPageSaveStatus(base), {
  kind: "pending",
  source: "local",
  label: "Local backup pending",
  detail: "Autosave will run after your next edit.",
  tone: "pending",
  canRetry: false,
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

console.log("design page save status tests passed");
