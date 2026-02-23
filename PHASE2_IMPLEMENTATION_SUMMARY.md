# Phase 2: Single Source of Truth - Implementation Summary

## ✅ Completed

### 1. MODEL_ASSETS Registry Created
- **File**: `lib/model-assets.ts`
- **Status**: Created and ready
- Empty registry ready for deterministic asset imports
- Helper functions: `getModelAsset()`, `isValidAsset()`, `getAssetIds()`, `getAssetCount()`

### 2. Catalog Schema Updated
- **File**: `lib/catalog-schema.ts`
- Added `assetId` to `AssetReferences` interface
- Assets now reference MODEL_ASSETS registry

### 3. buildCatalogItem Enhanced  
- **File**: `lib/catalog.ts`
- Now checks MODEL_ASSETS registry for bounds/dims/pivot
- Falls back to product dimensions if asset not in registry
- Added `assetId` to all catalog items

### 4. CATALOG Made Private
- **File**: `lib/catalog.ts`
- `CATALOG` const is no longer exported
- Only `CATALOG_ITEMS` and `CATALOG_ITEMS_MAP` are public
- Legacy `Product` shape kept internal

### 5. Dev-Only Validations
- **File**: `lib/catalog.ts` (bottom)
- Validates all products convert successfully
- Checks ID uniqueness
- Verifies defaultVariantId exists
- Validates commerce mappings
- Checks dimension positivity
- Runs only in development mode

### 6. Consumer Migration (Partial)
Files successfully migrated to CATALOG_ITEMS:
- ✅ `lib/swap.ts`
- ✅ `lib/bulkSwap.ts`  
- ✅ `lib/onboarding.ts`
- ✅ `lib/onboardingActions.ts`
- ✅ `app/admin/clicks/page.tsx`
- ⚠️ `lib/constraints/evaluate.ts` (needs .dimensions fixes)
- ⚠️ `components/CartSidebar.tsx` (needs property fixes)
- ⚠️ `components/DesignerCanvas.tsx` (needs type cleanup)
- ⚠️ `components/ReadOnlyViewer.tsx` (needs type cleanup)
- ⚠️ `app/page.tsx` (mostly done, ~60 errors remaining)

## 🚧 In Progress

### Remaining Type Errors (~80 total)

**Pattern 1: Property name changes**
- `.name` → `.title`
- `.dimensions.w` → `.dimsMm.w / 1000`  
- `.price` → Extract from `commerce.data.priceHint`
- `.retailer` → Extract from `commerce.data.retailer`
- `.buyUrl` → Extract from `commerce.data.url`
- `.purchaseMode` → Check `commerce.type`

**Pattern 2: Variant shape**
- `ProductVariant.name` → `ProductVariant.label`
- `Product.Variant.shopifyVariantId` → moved to commerce mapping

**Pattern 3: Type references**
- `Product` type → `CatalogItemSchema`
- Import from `@/lib/catalog-schema` not `@/lib/catalog`

## 📋 Remaining TODO

### Critical (Blocks Build)
1. Fix `components/CartSidebar.tsx`:
   - Update property access patterns
   - Fix variant shopify ID extraction
   - Update purchase mode logic

2. Fix `lib/constraints/evaluate.ts`:
   - Replace `.dimensions` with `.dimsMm / 1000`
   - Update `product.name` → `product.title`

3. Fix `app/page.tsx` (~60 errors):
   - Fix remaining `.buyUrl` / `.retailer` access
   - Some variant.name → variant.label

### Nice-to-Have
4. Verify dev server works with new catalog
5. Test admin models QA pages
6. Document MODEL_ASSETS import workflow

## 🎯 Next Steps

### Immediate (to get build working)
```bash
# 1. Fix CartSidebar prop types
# 2. Fix constraints dimensions
# 3. Fix remaining app/page.tsx errors
# 4. Run: pnpm tsc --noEmit
# 5. Run: pnpm build
```

### Follow-Up (Phase 2.2-2.5)
- Import first real asset into MODEL_ASSETS
- Update import script to output MODEL_ASSETS format
- Build admin QA pages (already exist at /admin/models)
- Implement buy mapping filter in UI
- Add commerce.type guards in cart flows

## 📊 Progress

- **Phase 2.1 (Single Source)**: 85% complete
- **Phase 2.2 (Asset Pipeline)**: Not started
- **Phase 2.3 (QA Pages)**: Already implemented!
- **Phase 2.4 (Buy Enforcement)**: Partially done

## 🔧 Quick Reference

**Get catalog item:**
```ts
const item = CATALOG_ITEMS[productId];
```

**Get dimensions (meters):**
```ts
const widthMeters = item.dimsMm.w / 1000;
```

**Get price:**
```ts
const price = item.commerce.type === 'shopify' || item.commerce.type === 'affiliate' 
  ? item.commerce.data.priceHint ?? 0 
  : 0;
```

**Check buyability:**
```ts
const buyable = item.commerce.type !== 'not_buyable';
```

**Get asset:**
```ts
import { getModelAsset } from '@/lib/model-assets';
const asset = getModelAsset(item.assets.assetId);
```
