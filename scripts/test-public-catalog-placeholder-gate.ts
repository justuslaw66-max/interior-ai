import { CATALOG_ITEMS_MAP } from "../lib/catalog";

function isRealPublicCatalogId(id: string): boolean {
  return id.includes("-real-") || id.startsWith("castlery-");
}

const publicIds = Array.from(CATALOG_ITEMS_MAP.keys());
const legacyIds = publicIds.filter((id) => !isRealPublicCatalogId(id));

if (legacyIds.length > 0) {
  console.log("Public catalog placeholder gate failures:");
  for (const id of legacyIds) {
    console.log(`- ${id}: public catalog item id is not YAML-backed/imported`);
  }
  throw new Error("Public catalog placeholder gate failed");
}

console.log(`Public catalog placeholder gate scanned ${publicIds.length} public items`);
console.log("Public catalog placeholder gate passed");
