export type CatalogPublicationEntry = {
  status?: unknown;
  publication_state?: unknown;
};

export type CatalogPublicationSummary = {
  total: number;
  liveCount: number;
  draftCount: number;
  statusCounts: Record<string, number>;
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

export function summarizeCatalogPublication(entries: CatalogPublicationEntry[]): CatalogPublicationSummary {
  const summary: CatalogPublicationSummary = {
    total: entries.length,
    liveCount: 0,
    draftCount: 0,
    statusCounts: {},
  };

  for (const entry of entries) {
    const status = getCatalogPublicationStatus(entry) || "unspecified";
    summary.statusCounts[status] = (summary.statusCounts[status] ?? 0) + 1;

    if (isDraftCatalogEntry(entry)) {
      summary.draftCount += 1;
    } else {
      summary.liveCount += 1;
    }
  }

  return summary;
}
