# Catalog System - Quick Integration Guide

## 🎯 Immediate Next Steps (for developers)

### 1. Apply Prisma Migrations ⚡ **CRITICAL**

The database schema needs to be updated with 3 new tables: `ModelAsset`, `CommerceMapping`, `CatalogItem`.

```bash
# Stop the dev server first!
# Then:
npx prisma db push

# Or if using migrations:
npx prisma migrate dev --name add_catalog_schema
```

**Note:** This creates the tables but does NOT seed data yet.

---

### 2. Seed Test Data (Optional)

To populate with sample items from existing `lib/catalog.ts`:

```bash
npx prisma db seed
```

Create `prisma/seed.ts` if it doesn't exist (see examples below).

---

### 3. Validate on Startup

Update `/lib/init-env.ts` or add to `app/layout.tsx`:

```typescript
import { CatalogValidator } from "@/lib/catalog-validation";

export async function validateCatalog() {
  try {
    const validator = new CatalogValidator();
    const validation = validator.validateCatalog(CATALOG);
    
    if (!validation.valid) {
      console.error("\n🚨 CATALOG VALIDATION FAILED");
      console.error(validation.details
        .filter(d => d.errors.length > 0)
        .map(d => `  ${d.itemId}: ${d.errors.join(", ")}`)
        .join("\n"));
      
      if (process.env.NODE_ENV !== "development") {
        throw new Error("Catalog validation failed");
      }
    } else {
      console.log(`✓ Catalog OK: ${validation.summary.valid}/${validation.summary.total} items`);
    }
  } catch (error) {
    console.error("Catalog init failed:", error);
    throw error;
  }
}
```

Call in root layout or before scene initialization.

---

### 4. Import First Model

```bash
# From workspace root
node scripts/import-model.ts \
  --file path/to/sofa-model.glb \
  --slug sofa-scandi-01 \
  --output public/assets

# Expected output:
# ✓ Import complete for: sofa-scandi-01
# Metadata:
# {
#   "slug": "sofa-scandi-01",
#   "dimensionsMm": { "w": 2400, "d": 900, "h": 800 },
#   ...
# }
```

Copy the JSON output and use it to create the item in Prisma or the QA frontend.

---

### 5. Test Admin QA Page

Visit: `http://localhost:3000/admin/models`

You should see:
- ✅ Model list (if seeded)
- ✅ Thumbnails (placeholder URLs for now)
- ✅ Status badges
- ✅ Dimensions display

If you see an error, check:
- Is the dev server running?
- Have you run `npx prisma db push`?
- Are you logged in as dev user (NODE_ENV="development")?

---

### 6. Update Buy Mode

Snapshot showing how to use commerce helpers:

**Before** (old):
```typescript
// Hard to reason about, no type safety
const item = CATALOG.find(i => i.id === itemId);
if (!item) return;
addToCart(item);  // ← might crash if no commerce info
```

**After** (new):
```typescript
import { canAddToCart, getNonBuyableReason } from "@/lib/commerce-helpers";

const item = CATALOG.find(i => i.id === itemId);
if (!item || !canAddToCart(item)) {
  alert(getNonBuyableReason(item));
  return;
}
addToCart(item);  // ← safe
```

---

### 7. Wire Commerce Events

When users interact in Buy mode:

```typescript
import { createCommerceEvent } from "@/lib/commerce-helpers";

// Item viewed
track("commerce_event", createCommerceEvent("item_viewed_in_buy", item));

// Added to cart
track("commerce_event", createCommerceEvent("item_added_to_cart", item, variantId));

// Cart reconciliation
const { valid, invalid } = reconcileCart(cartItems, CATALOG);
if (invalid.length > 0) {
  console.warn("Removed invalid items:", invalid.map(i => i.itemId));
}
```

---

## 📋 File Inventory

| File | Purpose | Status |
|------|---------|--------|
| `lib/catalog-schema.ts` | Types + CATEGORY_DEFAULTS | ✅ Ready |
| `lib/catalog-validation.ts` | CatalogValidator + helpers | ✅ Ready |
| `scripts/import-model.ts` | GLB → metadata | ✅ Ready |
| `lib/commerce-helpers.ts` | Cart validation + events | ✅ Ready |
| `app/admin/models/page.tsx` | QA UI | ✅ Ready |
| `app/api/admin/models/route.ts` | QA API | ✅ Ready |
| `prisma/schema.prisma` | DB schema (3 new tables) | ✅ Ready |
| `CATALOG_SYSTEM.md` | Full documentation | ✅ Ready |

---

## ⚠️ Breaking Changes

### Old Code (Deprecated)

```typescript
// ❌ Don't use
if (item.onboarded) { ... }  // moved to localStorage
const sofa = CATALOG.find(c => c.id === "sofa-001");  // no longer safe
```

### New Pattern

```typescript
// ✅ Use this
const sofa = CATALOG.find(c => c.id === "sofa-001");
if (canAddToCart(sofa)) {
  addToCart(sofa);  // validated + type-safe
}
```

---

## 🧪 Testing Checklist

- [ ] Run `npx prisma db push` successfully
- [ ] Verify tables created: `SELECT name FROM sqlite_master WHERE type='table'`
- [ ] Visit `/admin/models` (should load without auth error)
- [ ] Import a test GLB: `node scripts/import-model.ts --file test.glb --slug test-01`
- [ ] Create CatalogItem in Prisma manually or via API
- [ ] Verify CatalogValidator passes on startup
- [ ] Test `canAddToCart()` on sample item
- [ ] Check `reconcileCart()` removes invalid items

---

## 🐛 Troubleshooting

### "Cannot find module 'lib/catalog-schema'"
→ Make sure the file exists at `/interior-ai/lib/catalog-schema.ts`

### "Prisma schema validation failed"
→ Run `npx prisma format` to auto-fix formatting

### "Dev server crashes on startup"
→ Check `validateCatalog()` errors in console, may need to update existing catalog items to match schema

### "ModelAsset table doesn't exist"
→ Migration didn't apply. Run `npx prisma db push` first.

### "/admin/models shows 403"
→ Must be dev user (NODE_ENV="development") or plan="pro"

---

## 🚀 Performance Tips

1. **Cache validation results** – don't validate catalog on every render
2. **Use getItemsByCategory()** – faster than filtering manually
3. **Batch commerce checks** – validate cart in one pass, not per-item
4. **Lazy load model 3D** – don't render all models in admin list
5. **Paginate models list** – if many items, paginate in API

---

## 📚 Reference

See `CATALOG_SYSTEM.md` for:
- Full architecture
- API documentation
- Type signatures
- Migration guide
- Future enhancements

---

## 💬 Questions?

| Topic | Where |
|-------|-------|
| Type definitions | `lib/catalog-schema.ts` |
| Validation logic | `lib/catalog-validation.ts` |
| Commerce flow | `lib/commerce-helpers.ts` |
| Import script | `scripts/import-model.ts` |
| Admin UI | `app/admin/models/page.tsx` |
| DB schema | `prisma/schema.prisma` |
