# Catalog Schema & System Documentation

## Overview

The catalog system is the **Single Source of Truth** for all furniture and decor items in Interior-AI. It provides:

1. **Normalized data model** with Prisma schema (CatalogItem, ModelAsset, CommerceMapping)
2. **Type-safe contract** via TypeScript (lib/catalog-schema.ts)
3. **Runtime validation** that catches errors early (lib/catalog-validation.ts)
4. **Model import pipeline** to convert GLB → metadata (scripts/import-model.ts)
5. **QA tools** for previewing and validating models (/admin/models)
6. **Commerce enforcement** to ensure buyability (lib/commerce-helpers.ts)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│  CatalogItemSchema (typeified contract)         │
│  - Identity: id, slug, title, category          │
│  - Geometry: dimsMm, bounds, pivot              │
│  - Placement: wallSnappable, floorOnly, etc     │
│  - Clearance: walkwayMin, coffeeGapMin, etc     │
│  - Commerce: shopify | affiliate | not_buyable │
│  - Rendering: modelUrl, thumbUrl, variants     │
└─────────────────────────────────────────────────┘
           ↓ (persisted via)
┌─────────────────────────────────────────────────┐
│  Prisma Schema (3 tables)                       │
│  ├─ CatalogItem (primary, all meta)             │
│  ├─ ModelAsset (geometry + assets)              │
│  └─ CommerceMapping (buyability)                │
└─────────────────────────────────────────────────┘
        ↓ (imported from)              ↑ (created by)
     *.glb files              scripts/import-model.ts
                              /admin/models QA page
```

---

## Phase 1: Core Types (lib/catalog-schema.ts)

### Key Interfaces

```typescript
// Complete item schema
interface CatalogItemSchema {
  id: string;
  slug: string;
  title: string;
  category: ProductCategory;
  
  // Geometry (required, no defaults)
  dimensionsMm: Dimensions;      // { w, d, h } in mm
  bounds: BoundsAABB;             // collision box
  pivot: PivotInfo;               // ground alignment
  defaultRotation: number;
  
  // Placement rules (merged with category defaults)
  placementRules: PlacementRules;
  clearanceRules: ClearanceRules;
  
  // Style
  styleTags: StyleTag[];
  toneTags: ToneTag[];
  roomTags: RoomTag[];
  
  // Variants
  variants: ProductVariant[];
  defaultVariantId: string;
  
  // Commerce
  commerce: CommerceMapping;
  
  // Assets
  assets: AssetReferences;
  aiRoles: string[];
}
```

### Category Defaults

Every category has default rules. Items can override:

```typescript
CATEGORY_DEFAULTS = {
  sofa: {
    placement: { wallSnappable: true, floorOnly: true, ... },
    clearance: { walkwayMinMm: 800, coffeeGapMinMm: 400, ... },
    aiRoles: ["seating_anchor", "living_room_focal"],
  },
  rug: {
    placement: { floorOnly: true, allowRugOverlap: false, ... },
    clearance: { ... },
    aiRoles: ["seating_zone_anchor"],
  },
  // ... per category
}
```

**Don't repeat rules!** Use category defaults as fallback.

---

## Phase 2: Prisma Schema

### Tables

#### `ModelAsset`
Stores imported 3D model metadata (reusable, normalized).

```prisma
model ModelAsset {
  id            String @id @default(cuid())
  slug          String @unique
  modelUrl      String      // /assets/models/slug.glb
  thumbUrl      String      // /assets/thumbs/slug.png
  dimensionsJson Json      // { w, d, h } in meters
  boundsJson    Json        // { type, size, center }
  pivotJson     Json        // { offsetX, offsetZ, groundAligned }
  status        String @default("draft") // approved | archived
  catalogItems  CatalogItem[]
}
```

#### `CommerceMapping`
Buyability per item (one-to-one with CatalogItem).

```prisma
model CommerceMapping {
  id                String @unique
  mappingType       String  // "shopify" | "affiliate" | "not_buyable"
  
  // Shopify
  shopifyProductId  String?
  shopifyVariantId  String?
  shopifyAvailable  Boolean
  
  // Affiliate
  affiliateUrl      String?
  affiliateRetailer String?
  
  catalogItem       CatalogItem @relation
}
```

#### `CatalogItem`
The primary table. Everything in one place for speed.

```prisma
model CatalogItem {
  id                String @id
  slug              String @unique
  title             String
  category          String
  
  modelAssetId      String       // FK to ModelAsset
  materialsProfile  Json
  
  // Rules (can override category defaults)
  placementRules    Json
  clearanceRules    Json
  
  // Metadata
  styleTags         Json         // string[]
  toneTags          Json
  roomTags          Json
  aiRoles           Json
  
  variants          Json         // ProductVariant[]
  defaultVariantId  String
  
  commerce          CommerceMapping?
  status            String @default("draft")
}
```

---

## Phase 3: Runtime Validation

### CatalogValidator

```typescript
const validator = new CatalogValidator();

// Validate and merge with category defaults
const result = validator.validateAndMerge(itemData);
if (!result.valid) {
  console.error(result.errors);
  throw new Error("Invalid item");
}

const item: CatalogItemSchema = result.merged!;

// Validate entire catalog
const validation = validator.validateCatalog(catalogMap);
console.log(`Valid: ${validation.summary.valid}/${validation.summary.total}`);
for (const detail of validation.details) {
  if (detail.errors.length > 0) {
    console.error(`[${detail.itemId}]`, detail.errors);
  }
}
```

### On Startup

Add to `lib/init-env.ts` or similar:

```typescript
import { CatalogValidator } from "@/lib/catalog-validation";

export function validateCatalogOnStartup() {
  const validator = new CatalogValidator();
  const validation = validator.validateCatalog(CATALOG);
  
  if (!validation.valid) {
    console.error("\n🚨 CATALOG VALIDATION FAILED:");
    for (const detail of validation.details) {
      if (detail.errors.length > 0) {
        console.error(`  [${detail.itemId}]`, detail.errors);
      }
    }
    if (process.env.NODE_ENV !== "development") {
      throw new Error("Catalog validation failed");
    }
  } else {
    console.log(`✓ Catalog validated: ${validation.summary.valid} items`);
  }
}

// Call in getServerSideProps or app layout
```

---

## Phase 4: Model Import Pipeline

### Usage

```bash
# Import a GLB and compute metadata
node scripts/import-model.ts --file path/to/model.glb --slug sofa-real-castlery-dawson-3s --output public/assets
```

### Output

```
✓ Import complete for: sofa-real-castlery-dawson-3s

Metadata:
{
  "slug": "sofa-real-castlery-dawson-3s",
  "modelUrl": "/assets/models/sofa-real-castlery-dawson-3s.glb",
  "thumbUrl": "/assets/thumbs/sofa-real-castlery-dawson-3s.png",
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

### What the script does

1. **Parses GLB** – extracts meshes and POSITION data
2. **Computes AABB** – from all vertex positions
3. **Extracts dimensions** – converts AABB size to mm
4. **Copies GLB** – to `/assets/models/slug.glb`
5. **Generates metadata** – JSON with bounds, pivot, etc
6. *(Future)* **Renders thumbnail** – headless renderer for consistent thumbs

---

## Phase 5: QA Tools (/admin/models)

Access (dev or pro admin):
```
http://localhost:3000/admin/models
```

### Features

- **Model list** – all imported assets with status
- **Preview** – individual model viewer
- **Bounds overlay** – visual wireframe of collision box
- **Pivot marker** – shows ground alignment
- **Actions:**
  - Approve model (mark for use)
  - Regenerate thumbnail
  - Recompute bounds
  - Copy metadata snippet
  - Mark as archived

### API

```
GET /api/admin/models              → list all models
GET /api/admin/models/[id]         → single model
PATCH /api/admin/models/[id]       → update status/metadata
POST /api/admin/models/[id]/approve → approve model
POST /api/admin/models/[id]/regenerate → recompute bounds/thumb
```

---

## Phase 6: Buyability & Commerce

### Commerce Mapping

Each item maps to **exactly one** purchase option:

```typescript
// Shopify
commerce: {
  type: "shopify",
  data: {
    productId: "gid://shopify/Product/123",
    variantId: "gid://shopify/ProductVariant/456",
    available: true
  }
}

// Affiliate
commerce: {
  type: "affiliate",
  data: {
    url: "https://wayfair.com/...",
    retailer: "wayfair",
    priceHint: 50000,  // SGD cents
    trackingTag: "interior-ai-wayfair"
  }
}

// Not buyable (e.g., structural)
commerce: {
  type: "not_buyable",
  reason: "Structural item"
}
```

### Validation in Buy Mode

```typescript
import { reconcileCart, canAddToCart, getNonBuyableReason } from "@/lib/commerce-helpers";

// Check if item can be added to cart
if (!canAddToCart(item)) {
  alert(getNonBuyableReason(item));
  return;
}

// Reconcile cart on load
const { valid, invalid } = reconcileCart(cartItems, catalogMap);
if (invalid.length > 0) {
  console.warn("Invalid cart items:", invalid);
  // Remove or show warning
}
```

### Analytics

```typescript
import { createCommerceEvent } from "@/lib/commerce-helpers";

// Track item viewed in Buy mode
track("commerce_event", createCommerceEvent("item_viewed_in_buy", item));

// Track add to cart
track("commerce_event", createCommerceEvent("item_added_to_cart", item, variantId));

// Track affiliate click
track("commerce_event", createCommerceEvent("affiliate_link_clicked", item));
```

---

## Integration Checklist

- [ ] Update `app/page.tsx` to use CatalogValidator on startup
- [ ] Update CartSidebar to use reconcileCart() and canAddToCart()
- [ ] Update Buy mode to filter non-buyable items
- [ ] Add commerce event tracking to cart operations
- [ ] Run migrations for new Prisma tables
- [ ] Test model import script with sample GLB
- [ ] Verify admin/models page works
- [ ] Validate existing catalog items against new schema

---

## Helper Functions Quick Reference

### Validation

```typescript
import { validateCatalogItem, CatalogValidator } from "@/lib/catalog-validation";

// Single item
const validation = validateCatalogItem(item);
if (!validation.valid) { throw new Error(...); }

// Entire catalog
const validator = new CatalogValidator();
const result = validator.validateCatalog(CATALOG);
```

### Querying

```typescript
import {
  getItemsByCategory,
  getBuyableItems,
  findByStyleTags,
  findBestByDimension,
  getItemsByAiRole,
} from "@/lib/catalog-validation";

// Get all sofas
const sofas = getItemsByCategory(items, "sofa");

// Get buyable items only
const buyable = getBuyableItems(items);

// Find sofa matching target width
const sofa = findBestByDimension(items, "sofa", 2.4); // 2.4m

// Find items by AI role
const seatingAnchors = getItemsByAiRole(items, "seating_anchor");
```

### Commerce

```typescript
import {
  resolveCommerceMapping,
  canAddToCart,
  reconcileCart,
} from "@/lib/commerce-helpers";

// Check buyability
const commerce = resolveCommerceMapping(item);
if (!commerce.buyable) { ... }

// Validate cart
const { valid, invalid } = reconcileCart(cartItems, catalogMap);
```

---

## Migration from Old Catalog

1. **Export current CATALOG items** to JSON
2. **Map to CatalogItemSchema** using validators
3. **Run import script** for each GLB
4. **Create database records** via API
5. **Validate with CatalogValidator**
6. **Approve in QA page**
7. **Switch runtime** to load from DB instead of hardcoded

---

## Future Enhancements

- [ ] LOD (Level-of-Detail) support in bounds
- [ ] OBB (Oriented Bounding Box) for more accurate collisions
- [ ] Automatic thumbnail generation via headless renderer
- [ ] A/B testing for commerce mappings (Shopify vs affiliate)
- [ ] Multi-variant pricing
- [ ] Stock synchronization from Shopify
- [ ] Model versioning (update geometry without breaking designs)
- [ ] Community model submissions + approval flow
