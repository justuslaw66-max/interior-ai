import assert from "node:assert/strict";

import {
  getCatalogPublicationStatus,
  isDraftCatalogEntry,
  isLiveCatalogEntry,
  summarizeCatalogPublication,
} from "../lib/catalog-publication";

const entries = [
  { status: "active" },
  { status: "draft" },
  { status: "pending-review" },
  { status: "blocked" },
  {},
  { status: "active", publication_state: "needs_review" },
];

assert.equal(getCatalogPublicationStatus({ status: " Active " }), "active");
assert.equal(getCatalogPublicationStatus({ status: "active", publication_state: "draft" }), "draft");
assert.equal(isDraftCatalogEntry({ status: "pending_review" }), true);
assert.equal(isDraftCatalogEntry({ status: "active" }), false);
assert.equal(isLiveCatalogEntry({}), true);

const summary = summarizeCatalogPublication(entries);

assert.equal(summary.total, 6);
assert.equal(summary.liveCount, 2);
assert.equal(summary.draftCount, 4);
assert.deepEqual(summary.statusCounts, {
  active: 1,
  draft: 1,
  "pending-review": 1,
  blocked: 1,
  unspecified: 1,
  needs_review: 1,
});

console.log("Catalog publication summary checks passed");
