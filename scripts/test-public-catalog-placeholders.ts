import { CATALOG_ITEMS_MAP } from "../lib/catalog";

type PublicCatalogPlaceholderIssue = {
  catalogItemId: string;
  issue: string;
};

function includesPlaceholder(value: unknown): boolean {
  const normalized = String(value ?? "").toLowerCase();
  return normalized.includes("example.com") || normalized.includes("unspecified") || normalized.includes("replace_me");
}

function collectIssues(): PublicCatalogPlaceholderIssue[] {
  const issues: PublicCatalogPlaceholderIssue[] = [];

  for (const [catalogItemId, item] of CATALOG_ITEMS_MAP.entries()) {
    if (item.commerce.type === "affiliate") {
      if (includesPlaceholder(item.commerce.data.url)) {
        issues.push({
          catalogItemId,
          issue: `affiliate URL is a placeholder: ${item.commerce.data.url}`,
        });
      }
    }

    if (item.commerce.type === "shopify") {
      if (includesPlaceholder(item.commerce.data.variantId)) {
        issues.push({
          catalogItemId,
          issue: `Shopify variant ID is a placeholder: ${item.commerce.data.variantId}`,
        });
      }
      if (!item.commerce.data.available) {
        issues.push({
          catalogItemId,
          issue: "Shopify commerce mapping is unavailable in public catalog",
        });
      }
    }
  }

  return issues;
}

function run(): void {
  const issues = collectIssues();

  console.log("Public catalog placeholder audit summary");
  console.log(`- public catalog items scanned: ${CATALOG_ITEMS_MAP.size}`);
  console.log(`- placeholder commerce issues: ${issues.length}`);

  if (issues.length > 0) {
    for (const issue of issues) {
      console.log(`  - ${issue.catalogItemId}: ${issue.issue}`);
    }
    throw new Error("Public catalog placeholder audit failed");
  }

  console.log("Public catalog placeholder audit passed");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
