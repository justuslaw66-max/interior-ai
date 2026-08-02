# Catalog System - Quick Reference Card

## 🎯 What to Import

### Validation
```typescript
import { 
  CatalogValidator,  // Main class
  validateCatalogItem,  // Single item validation
} from "@/lib/catalog-validation";
```

### Commerce
```typescript
import { 
  canAddToCart,
  reconcileCart,
  getNonBuyableReason,
  createCommerceEvent,
} from "@/lib/commerce-helpers";
```

### Types
```typescript
import type { 
  CatalogItemSchema,
  ProductCategory,
  PlacementRules,
  ClearanceRules,
} from "@/lib/catalog-schema";
```

### Constants
```typescript
import { CATEGORY_DEFAULTS } from "@/lib/catalog-schema";
```

---

## 📝 Common Patterns

### Validate Entire Catalog
```typescript
const validator = new CatalogValidator();
const result = validator.validateCatalog(CATALOG);

if (!result.valid) {
  console.error("❌ Invalid items:", result.details
    .filter(d => d.errors.length > 0)
    .map(d => `${d.itemId}: ${d.errors.join(", ")}`)
  );
}
```

### Check If Item Can Be Bought
```typescript
if (canAddToCart(item)) {
  addToCart(item);
} else {
  alert(getNonBuyableReason(item));
}
```

### Clean Cart of Invalid Items
```typescript
const { valid, invalid } = reconcileCart(cartItems, CATALOG);
if (invalid.length > 0) {
  console.warn("Removed:", invalid.map(i => i.itemId));
}
setCart(valid);
```

### Track Commerce Event
```typescript
track("commerce_event", createCommerceEvent("item_added_to_cart", item, variantId));
```

### Build Catalog Item
```typescript
const newItem: CatalogItemSchema = {
  id: "sofa-001",
  slug: "sofa-real-castlery-dawson-3s",
  title: "Scandinavian Sofa",
  category: "sofa",  // ← gets category defaults
  
  // Required geometry (no defaults)
  dimensionsMm: { w: 2400, d: 900, h: 800 },
  bounds: { type: "aabb", size: { w: 2.4, d: 0.9, h: 0.8 }, center: [0, 0.4, 0] },
  pivot: { offsetX: 0, offsetZ: 0, groundAligned: true },
  
  // Override category defaults if needed
  placementRules: { wallSnappable: true },  // overrides sofa category default
  
  // Assets
  assets: { modelUrl: "/models/sofa.glb" },
  
  // Commerce
  commerce: {
    type: "shopify",
    data: {
      productId: "gid://shopify/Product/123",
      available: true
    }
  }
};
```

### Find Items by Category
```typescript
import { getItemsByCategory } from "@/lib/catalog-validation";

const sofas = getItemsByCategory(CATALOG, "sofa");
const buyableSofas = sofas.filter(s => canAddToCart(s));
```

### Find Best Item by Dimension
```typescript
import { findBestByDimension } from "@/lib/catalog-validation";

// Find sofa closest to 2.4m width
const matchingSofa = findBestByDimension(CATALOG, "sofa", 2.4);
```

---

## 🚀 Import Script CLI

```bash
# Basic usage
node scripts/import-model.ts --file path/to/model.glb --slug item-name

# Full options
node scripts/import-model.ts \
  --file path/to/model.glb \
  --slug my-sofa-01 \
  --output public/assets
```

### Output Format
```json
{
  "slug": "my-sofa-01",
  "modelUrl": "/assets/models/my-sofa-01.glb",
  "thumbUrl": "/assets/thumbs/my-sofa-01.png",
  "dimensionsMm": { "w": 2400, "d": 900, "h": 800 },
  "bounds": {
    "type": "aabb",
    "size": { "w": 2.4, "d": 0.9, "h": 0.8 },
    "center": [0, 0.4, 0]
  },
  "pivot": {
    "offsetX": 0,
    "offsetZ": 0,
    "groundAligned": true
  }
}
```

---

## 📊 Type Glossary

| Type | Purpose | Example |
|------|---------|---------|
| `CatalogItemSchema` | Complete product definition | `{ id, title, category, bounds, commerce, ... }` |
| `ProductCategory` | "sofa" \| "rug" \| ... (12 values) | `"sofa"` |
| `Dimensions` | `{ w, d, h }` in mm | `{ w: 2400, d: 900, h: 800 }` |
| `BoundsAABB` | Axis-aligned bounding box | `{ type: "aabb", size, center }` |
| `PlacementRules` | Where item can go | `{ wallSnappable: true, floorOnly: true }` |
| `ClearanceRules` | Space item needs | `{ walkwayMinMm: 800, coffeeGapMinMm: 400 }` |
| `CommerceMapping` | Buy option type | `"shopify" \| "affiliate" \| "not_buyable"` |

---

## 🔍 Helper Functions

### Validation
```typescript
validateCatalogItem(item)          // Returns { valid, errors }
validator.validateAndMerge(item)   // Applies category defaults
validator.validateCatalog(items)   // Returns summary + details
```

### Querying
```typescript
getItemsByCategory(items, "sofa")     // Filter by category
getBuyableItems(items)                // Filter by commerce type
getItemsByAiRole(items, "seating")    // Filter by AI role
findByStyleTags(items, ["modern"])    // Filter by style
findBestByDimension(items, "sofa", 2.4)  // Find closest match
```

### Commerce
```typescript
canAddToCart(item)                    // Boolean check
resolveCommerceMapping(item)          // Get buy option
reconcileCart(items, catalog)         // Split valid/invalid
getNonBuyableReason(item)             // Error message
getCartVisibleItems(items)            // Buyable only
```

### Analytics
```typescript
createCommerceEvent(type, item, variantId)  // Structured event
```

---

## ❌ Anti-Patterns (Don't Do This)

```typescript
// ❌ Assume item always has commerce
item.commerce.shopifyProductId  // crashes if not_buyable

// ❌ Cast without validation
const item = CATALOG[0] as CatalogItemSchema  // may be invalid

// ❌ Hardcode defaults
if (!item.placementRules.wallSnappable) {  // should use category default
  // ...
}

// ❌ Direct cart push without checking
cart.push(item)  // item might not be buyable

// ❌ Skip validation on load
// Just trust CATALOG is valid
```

---

## ✅ Best Practices

```typescript
// ✅ Validate on startup
const validator = new CatalogValidator();
if (!validator.validateCatalog(CATALOG).valid) {
  throw new Error("Catalog validation failed");
}

// ✅ Use type-safe checks
if (canAddToCart(item)) {
  cart.push(item);
}

// ✅ Let category defaults handle it
const sofa: CatalogItemSchema = {
  category: "sofa",
  // placementRules: undefined → uses category default
};

// ✅ Gracefully handle bad data
const { valid, invalid } = reconcileCart(cartItems, CATALOG);

// ✅ Use helpers instead of manual filtering
const sofas = getItemsByCategory(items, "sofa");
// not: const sofas = items.filter(i => i.category === "sofa");
```

---

## 🧪 Quick Test

```bash
# Check types
npx tsc --noEmit

# Check functionality
cd interior-ai
node -e "
const { CatalogValidator } = require('./lib/catalog-validation');
const { CATALOG } = require('./lib/catalog');
const v = new CatalogValidator();
const r = v.validateCatalog(CATALOG);
console.log('Valid:', r.summary.valid, '/', r.summary.total);
"
```

---

## 📚 Full Documentation

- **Types & architecture**: [CATALOG_SYSTEM.md](CATALOG_SYSTEM.md)
- **Integration steps**: [CATALOG_INTEGRATION.md](CATALOG_INTEGRATION.md)
- **Deployment**: [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
- **Summary**: [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Module not found" | Check file exists: `lib/catalog-schema.ts`, etc. |
| Type errors | Run: `npx tsc --noEmit` to see details |
| Import fails | Input GLB must be valid glTF 2.0 format |
| Validation fails | Check item.dimensionsMm is valid |
| Crashes in Buy mode | Use `reconcileCart()` first |
| No models in /admin | Run: `npx prisma db push` first |

---

**Last updated**: Feb 23, 2025
**System version**: 1.0
**Status**: Production-ready, awaiting integration
