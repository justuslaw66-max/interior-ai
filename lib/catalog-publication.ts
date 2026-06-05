export type CatalogPublicationEntry = {
  status?: unknown;
  publication_state?: unknown;
};

const DRAFT_CATALOG_STATUSES = new Set([
  "draft",
  "pending-review",
  "pending_review",
  "needs-review",
  "needs_review",
  "blocked",
]);

export function getCatalogPublicationStatus(entry: CatalogPublicationEntry): string {
  return String(entry.publication_state ?? entry.status ?? "").trim().toLowerCase();
}

export function isDraftCatalogEntry(entry: CatalogPublicationEntry): boolean {
  return DRAFT_CATALOG_STATUSES.has(getCatalogPublicationStatus(entry));
}

export function isLiveCatalogEntry(entry: CatalogPublicationEntry): boolean {
  return !isDraftCatalogEntry(entry);
}
