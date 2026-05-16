# Catalog Import Checklist

This guide ensures all new product imports appear in your webapp with the correct category and are properly validated. Follow these steps after creating a new product's YAML file.

## Import Workflow

### Step 1: Create the YAML File
- Create `catalog/furniture/{category}/{product_id}/catalog.yaml`
- Ensure the following required fields are present:
  - `assets.asset_id` - Unique product identifier (used to sync with lib/catalog.ts)
  - `category` - Product category (must be a valid ProductCategory)
  - Other metadata: name, dimensions, materials, colors, etc.

### Step 2: Verify Category is Valid
- Open `lib/catalog.ts` and check the `ProductCategory` type (around line 18-25)
- Current valid categories are:
  ```typescript
  type ProductCategory =
    | "sofa"
    | "ottoman"
    | "coffee_table"
    | "rug"
    | "tv_console"
    | "sideboard"
    | "accent_chair"
    | "floor_lamp";
  ```
- **If your category is not in this list**, you must add it to the union type first
- Example: Adding a new "dining_table" category:
  ```typescript
  type ProductCategory =
    | "sofa"
    | "ottoman"
    | "coffee_table"
    | "rug"
    | "tv_console"
    | "sideboard"
    | "accent_chair"
    | "floor_lamp"
    | "dining_table";  // ← New category
  ```

### Step 3: Run Quality Validation
Run the catalog quality validation to ensure the YAML is well-formed:
```bash
npm run test:catalog-quality:strict
```
✅ **All 50 files must pass** before proceeding.

### Step 4: Add Entry to Registry (`lib/catalog.ts`)
- Open `lib/catalog.ts`
- Find the `const CATALOG: Record<string, Product> = {` declaration (around line 291)
- Add your new product entry with this structure:

```typescript
"sofa-real-castlery-ollie-storage-ottoman": {
  id: "sofa-real-castlery-ollie-storage-ottoman",
  name: "Castlery Ollie Storage Ottoman",
  category: "ottoman",  // ← Must match YAML category exactly
  price: 499,
  dimensions: { w: 0.93, d: 0.77, h: 0.44 },
  styleTags: ["modern", "minimalistic"],
  defaultVariantId: "variant_id_here",
  purchaseMode: "affiliate",  // "shopify" or "affiliate"
  retailer: "Castlery Singapore",
  buyUrl: "https://www.castlery.com/...",
  variants: [
    { id: "color_1", name: "Color Name 1", colorHex: "#e6ddc7" },
    { id: "color_2", name: "Color Name 2", colorHex: "#a67c52" },
  ],
},
```

**Key requirements:**
- `id` must match the `assets.asset_id` from your YAML file
- `category` must match the YAML category exactly
- `defaultVariantId` must be one of the variant IDs listed
- `styleTags` should align with design metadata

### Step 5: (Optional) Add Thumbnail URL Override
If your product uses an external image that needs caching override:
- Open `lib/catalog.ts`
- Find `LEGACY_THUMB_URL_OVERRIDES` (around line 265)
- Add your product:
```typescript
const LEGACY_THUMB_URL_OVERRIDES: Record<string, string> = {
  // ... existing entries ...
  "sofa-real-castlery-ollie-storage-ottoman": "https://your-image-url.jpg",
};
```

### Step 6: Run Registry Sync Validation
Verify the YAML and registry entries are properly synced:
```bash
npm run test:catalog-registry-sync
```
✅ **Exit code must be 0** (no errors)

You should see output like:
```
=== Catalog Registry Sync Audit ===

Found 50 YAML catalog entries
Found 40 entries in lib/catalog.ts registry

✅ All YAML entries are properly registered with correct categories
```

### Step 7: Build & Test
Run a full build to catch any TypeScript errors:
```bash
npm run build
```
✅ **Build must succeed with 0 errors**

### Step 8: Run Full Import Preflight
This runs all validation gates together:
```bash
npm run test:import-preflight
```
✅ **All tests must pass:**
- ✅ test:catalog-governance
- ✅ test:catalog-quality:strict
- ✅ test:catalog-asset-availability
- ✅ test:catalog-registry-sync
- ✅ npm run lint
- ✅ Playwright e2e tests

### Step 9: Product is Live!
Once all gates pass, your product is:
- ✅ Visible in the catalog
- ✅ In the correct category
- ✅ Fully validated across the system
- ✅ Ready for users to see and purchase

---

## Troubleshooting

### Issue: "YAML entries missing from lib/catalog.ts registry"
**Solution:** You created the YAML file but didn't add an entry to the `CATALOG` object in `lib/catalog.ts`. 
- Action: Add the product entry to `lib/catalog.ts` following the template in **Step 4**.

### Issue: "Category mismatches between YAML and registry"
**Solution:** The category value in your YAML doesn't match the `category` field in the `lib/catalog.ts` entry.
- Action: Ensure both locations have the exact same category value (e.g., "ottoman", not "sofa").

### Issue: "Invalid category values in YAML files"
**Solution:** Your YAML uses a category that's not in the `ProductCategory` type.
- Action: Either (a) change your YAML to use a valid category, or (b) add the new category to `ProductCategory` in `lib/catalog.ts` (Step 2).

### Issue: "TypeScript compilation failed"
**Solution:** Check that all required fields are present and types match.
- Run `npm run build` to see detailed errors
- Ensure `id` matches `assets.asset_id`
- Ensure `defaultVariantId` matches one of your variant IDs

### Issue: "Build passes but product not visible in UI"
**Solution:** The product is in `lib/catalog.ts` but might not be in `PUBLIC_CATALOG_ENTRIES` filter.
- Check that `isRealCatalogProduct(product)` returns true for your product
- This usually means your `purchaseMode` is "affiliate" or "shopify"

---

## Quick Reference: CI Gates Required Before Deployment

Run this command to validate everything:
```bash
npm run test:import-preflight
```

This gate runs in order:
1. **test:catalog-governance** → Checks YAML asset IDs against database
2. **test:catalog-quality:strict** → Validates YAML syntax and structure (50 files, 0 failures)
3. **test:catalog-asset-availability** → Checks all image/model URLs are accessible (197 URLs)
4. **test:catalog-registry-sync** → Ensures YAML↔registry consistency
5. **npm run lint** → TypeScript/ESLint validation
6. **Playwright e2e tests** → Functional testing

All gates must pass (`exit code 0`) before your changes are production-ready.

---

## Real Example: Importing Ollie Storage Ottoman

Here's exactly what was done to import Ollie (a working example):

### File 1: Create YAML
**File:** `catalog/furniture/sofas/ollie_storage_ottoman/catalog.yaml`
```yaml
assets:
  asset_id: "sofa-real-castlery-ollie-storage-ottoman"
  model_url: "/assets/models/sofa-real-castlery-ollie-storage-ottoman-closed.glb"
  thumbnail_url: "/assets/thumbs/ollie-closed.jpg"

category: "ottoman"
name: "Castlery Ollie Storage Ottoman"
dimensions: { w: 0.93, d: 0.77, h: 0.44 }

variants:
  - id: "greta_ivory"
    name: "Greta Ivory"
    assets:
      - state: "closed"
        model_url: "/assets/models/sofa-real-castlery-ollie-storage-ottoman-closed.glb"
      - state: "open"
        model_url: "/assets/models/sofa-real-castlery-ollie-storage-ottoman-open.glb"
  # ... more variants ...

room_compatibility: ["living_room", "family_room", "bedroom"]
design_pairings: ["sofa", "sectional_sofa", "armchair", "rug", "coffee_table"]
```

### File 2: Update lib/catalog.ts - Add ProductCategory
**File:** `lib/catalog.ts`, line ~23
```typescript
export type ProductCategory =
  | "sofa"
  | "ottoman"  // ← Added this
  | "coffee_table"
  | "rug"
  | "tv_console"
  | "sideboard"
  | "accent_chair"
  | "floor_lamp";
```

### File 3: Update lib/catalog.ts - Add to CATALOG
**File:** `lib/catalog.ts`, in `const CATALOG = { ... }` block
```typescript
"sofa-real-castlery-ollie-storage-ottoman": {
  id: "sofa-real-castlery-ollie-storage-ottoman",
  name: "Castlery Ollie Storage Ottoman",
  category: "ottoman",
  price: 499,
  dimensions: { w: 0.93, d: 0.77, h: 0.44 },
  styleTags: ["modern", "minimalistic"],
  defaultVariantId: "greta_ivory",
  purchaseMode: "affiliate",
  retailer: "Castlery Singapore",
  buyUrl: "https://www.castlery.com/sg/products/ollie-storage-ottoman",
  variants: [
    { id: "greta_ivory", name: "Greta Ivory", colorHex: "#e6ddc7" },
    { id: "greta_caramel", name: "Greta Caramel", colorHex: "#a67c52" },
    { id: "greta_moss", name: "Greta Moss", colorHex: "#7a8f70" },
  ],
},
```

### Validation
```bash
npm run test:catalog-quality:strict  # ✅ Passed
npm run test:catalog-registry-sync   # ✅ Passed
npm run build                        # ✅ Passed
```

Result: Ollie is now visible in the catalog under "ottoman" category!

---

## Summary

**The Golden Rule:** Every YAML file requires TWO things:
1. ✅ YAML file in `catalog/furniture/{category}/` with valid `assets.asset_id` and `category`
2. ✅ Entry in `lib/catalog.ts` CATALOG object with matching `id` and `category`

If either is missing, the product won't be visible or will be miscategorized. Use `npm run test:catalog-registry-sync` to validate both are in sync before deploying.
