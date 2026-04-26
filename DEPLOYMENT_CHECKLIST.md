# Catalog System - Deployment & Integration Checklist

## ✅ Pre-Deployment Verification

- [x] TypeScript modules compile without errors
- [x] All catalog files created (5 modules + 2 admin pages + API route)
- [x] Documentation complete (3 guides)
- [x] Prisma schema updated with 3 new tables
- [x] Type safety verified for all exports
- [x] GLB parser logic reviewed and tested
- [x] Commerce helpers API finalized
- [ ] Route hardening checks pass on the real running server (`npm run test:hardening`)

---

## 🚀 Deployment Steps (In Order)

### Step 1: Stop Current Dev Server (2 min)
```bash
lsof -ti :3010 | xargs kill -9 || true
sleep 2
```

### Step 2: Apply Database Migrations (5 min)
```bash
cd /Users/justus/Documents/Interior-AI/interior-ai
npx prisma db push
# Creates 3 new tables:
#   - ModelAsset
#   - CommerceMapping
#   - CatalogItem
```

**Verify success:**
```bash
npx prisma studio  # Browse the schema visually
# Should show 3 new tables in the left sidebar
```

### Step 3: Restart Dev Server (2 min)
```bash
npm run dev
# Should start on http://localhost:3010
# Ready in ~524ms
```

### Step 4: Test Admin Page (5 min)
Navigate to: `http://localhost:3010/admin/models`

**Expected behavior:**
- ✅ Page loads (may show empty list initially)
- ✅ Auth check passes (dev user or pro admin)
- ✅ API endpoint returns: `{ success: true, models: [] }`
- ✅ No console errors

**Troubleshooting:**
- 403 Forbidden? → Check NODE_ENV or plan
- Models not loading? → Check Prisma DB connection
- API error? → Run `npx prisma db push` again

### Step 5: Import First Test Model (10 min)
```bash
# Find or create a GLB file, then:
node scripts/import-model.ts \
  --file /path/to/test-model.glb \
  --slug test-sofa-01 \
  --output public/assets

# Expected output:
# ✓ Import complete for: test-sofa-01
# 
# Metadata:
# {
#   "slug": "test-sofa-01",
#   "modelUrl": "/assets/models/test-sofa-01.glb",
#   "dimensionsMm": { "w": 2400, "d": 900, "h": 800 },
#   "bounds": { "type": "aabb", "size": {...}, "center": [...] },
#   ...
# }
```

**Verify import:**
- ✅ GLB copied to `/public/assets/models/test-sofa-01.glb`
- ✅ Metadata JSON created with bounds
- ✅ No errors in GLB parsing

### Step 6: Seed First CatalogItem (15 min)

Create via Prisma CLI (interactive):
```bash
npx prisma studio
```

Or programmatically via API call:
```typescript
// POST /api/admin/models
const item = {
  id: "test-sofa-01",
  slug: "test-sofa-01",
  title: "Test Sofa",
  category: "sofa",
  modelAssetId: "<copied from import>",
  dimensionsMm: { w: 2400, d: 900, h: 800 },
  status: "draft"
};
```

**Verify in Prisma Studio:**
```bash
npx prisma studio
# Click CatalogItem table → should see your item
```

### Step 7: Validate Catalog on Startup (10 min)

Add to `lib/init-env.ts`:

```typescript
import { CatalogValidator } from "@/lib/catalog-validation";

export function initializeCatalog() {
  const validator = new CatalogValidator();
  const validation = validator.validateCatalog(CATALOG);
  
  console.log(`📦 Catalog Status:`);
  console.log(`   Total: ${validation.summary.total}`);
  console.log(`   Valid: ${validation.summary.valid}`);
  console.log(`   Errors: ${validation.summary.total - validation.summary.valid}`);
  
  if (!validation.valid) {
    console.warn("\n⚠️  Invalid items:");
    for (const detail of validation.details) {
      if (detail.errors.length > 0) {
        console.warn(`   ${detail.itemId}: ${detail.errors.join(", ")}`);
      }
    }
  }
  
  return validation;
}
```

Call in `app/page.tsx` on mount:
```typescript
const catalogValid = initializeCatalog();
if (!catalogValid.valid && process.env.NODE_ENV !== "development") {
  throw new Error("Catalog validation failed");
}
```

**Verify in console:**
```
📦 Catalog Status:
   Total: 47
   Valid: 45
   Errors: 2
```

### Step 8: Update Buy Mode (30 min)

Replace in components that handle adding to cart:

**Before:**
```typescript
const item = CATALOG.find(i => i.id === itemId);
if (!item) return;
cart.push(item);  // ← might crash
```

**After:**
```typescript
import { canAddToCart, getNonBuyableReason, reconcileCart } from "@/lib/commerce-helpers";

const item = CATALOG.find(i => i.id === itemId);
if (!canAddToCart(item)) {
  showAlert(getNonBuyableReason(item));
  return;
}
cart.push(item);  // ← safe

// On cart load:
const { valid, invalid } = reconcileCart(cartItems, CATALOG);
setCart(valid);
if (invalid.length > 0) {
  console.warn("Removed invalid items:", invalid);
}
```

### Step 9: Add Commerce Analytics (10 min)

Wrap commerce events:

```typescript
import { createCommerceEvent } from "@/lib/commerce-helpers";

// When item viewed in Buy mode
track("commerce_event", createCommerceEvent("item_viewed_in_buy", item));

// When added to cart
track("commerce_event", createCommerceEvent("item_added_to_cart", item, selectedVariant));

// When clicking affiliate
track("commerce_event", createCommerceEvent("affiliate_link_clicked", item));
```

### Step 10: Run Full Test Suite (15 min)

```bash
# Type check
npx tsc --noEmit

# Route hardening checks (requires app running on :3000)
npm run test:hardening

# Build test
npm run build

# Dev server test
npm run dev
# Visit http://localhost:3010
# Click through Buy mode
# Check PostHog for events
```

---

## 🧪 Verification Tests

### Test 1: Catalog Validation
```typescript
import { CatalogValidator } from "@/lib/catalog-validation";

const validator = new CatalogValidator();
const result = validator.validateCatalog(CATALOG);
console.log("✓ Validation:", result.valid);
```

Expected: `✓ Validation: true`

### Test 2: Import Script
```bash
node scripts/import-model.ts --file test.glb --slug test-01
```

Expected: `✓ Import complete for: test-01`

### Test 3: Commerce Check
```typescript
import { canAddToCart, getNonBuyableReason } from "@/lib/commerce-helpers";

const sofa = CATALOG.find(i => i.id === "sofa-001");
console.log("Can add:", canAddToCart(sofa));
```

Expected: `Can add: true`

### Test 4: Admin Page
Visit: `http://localhost:3000/admin/models`

Expected: Page loads, model list visible or empty state visible

### Test 5: Cart Reconciliation
```typescript
import { reconcileCart } from "@/lib/commerce-helpers";

const { valid, invalid } = reconcileCart(testCart, CATALOG);
console.log("Valid:", valid.length, "Invalid:", invalid.length);
```

Expected: Invalid items gracefully removed

---

## 🎯 Integration Checklist

### Database
- [ ] `npx prisma db push` completed successfully
- [ ] Run `npx prisma studio` and see 3 new tables
- [ ] At least 1 test ModelAsset created
- [ ] At least 1 CatalogItem exists in DB

### Application
- [ ] Dev server runs without errors
- [ ] No TypeScript compilation errors
- [ ] `npm run build` completes
- [ ] Admin page loads at `/admin/models`

### Validation
- [ ] `CatalogValidator` passes on startup
- [ ] Console shows `📦 Catalog Status` on load
- [ ] Invalid items logged (if any)
- [ ] No crashes when validation runs

### Commerce
- [ ] `canAddToCart()` works correctly
- [ ] `reconcileCart()` removes invalid items
- [ ] `getNonBuyableReason()` shows friendly messages
- [ ] Analytics events fire in PostHog

### Testing
- [ ] Manual Buy mode test successful
- [ ] Admin page displays models
- [ ] Import script produces valid output
- [ ] No console errors in dev server

---

## 🐛 Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Cannot find module" | File not created | Run file creation commands again |
| TypeScript errors | Type mismatch | Run `npx tsc --noEmit` and check errors list |
| Prisma migration fails | Tables exist | Run `npx prisma db reset --force` (deletes all data!) |
| Port 3010 in use | Old dev server | `lsof -ti :3010 \| xargs kill -9` |
| Admin page 403 | Not dev user | Must have `NODE_ENV=development` or `plan=pro` |
| Import script fails | Invalid GLB | Verify file is valid glTF 2.0 format |
| No models in admin | DB not seeded | Create first CatalogItem via Prisma Studio |
| Cart crashes | Missing commerce | Use `reconcileCart()` to find broken items |
| Validation errors | Schema mismatch | Check CATEGORY_DEFAULTS overrides |

---

## 📊 Success Criteria

✅ **Full Success** when:
1. Dev server runs stably
2. All TypeScript compiles
3. `/admin/models` page loads
4. At least 1 model imported successfully
5. Catalog validation passes
6. Buy mode uses new commerce helpers
7. No crashes when testing cart operations
8. PostHog shows commerce events

---

## 🎓 Learning Resources

| Topic | File |
|-------|------|
| Type system | `CATALOG_SYSTEM.md` (§2) |
| Validation | `CATALOG_SYSTEM.md` (§3) |
| Import pipeline | `CATALOG_SYSTEM.md` (§4) |
| Commerce | `CATALOG_SYSTEM.md` (§6) |
| Integration | `CATALOG_INTEGRATION.md` |
| Complete summary | `IMPLEMENTATION_SUMMARY.md` |

---

## 📞 Support

If you get stuck:

1. **Check docs first**: `CATALOG_SYSTEM.md` has full reference
2. **Review integration guide**: `CATALOG_INTEGRATION.md` has troubleshooting
3. **Check console errors**: `npm run dev | grep error`
4. **Validate schema**: `npx tsc --noEmit`
5. **Reset DB**: `npx prisma db reset --force` (⚠️ deletes data!)

---

## ✨ Next Phase (After Integration)

Once catalog system is live:

### Phase 2: Admin Enhancements
- [ ] Model detail viewer (`/admin/models/[id]`)
- [ ] 3D preview with bounds visualization
- [ ] Bulk model import
- [ ] Bounds/pivot editing UI

### Phase 3: Commerce Features
- [ ] Shopify API integration for stock
- [ ] Product variant A/B testing
- [ ] Affiliate link rotation
- [ ] Pricing sync from retailers

### Phase 4: Analytics & QA
- [ ] Commerce funnel dashboard
- [ ] Model usage stats (/admin/analytics)
- [ ] Commerce mapping audit (/admin/audit)
- [ ] Automatic variant fetch from Shopify

---

## Phase 6: Environments, Release, and Operations

### 6.1 Environments + Config Discipline
- [ ] Set `APP_ENV` to `development` | `staging` | `production` in each environment.
- [ ] Create separate env files or secrets per environment (never reuse prod secrets in staging).
- [ ] Required env vars in staging/prod:
  - `DATABASE_URL`
  - `OPENAI_API_KEY`
  - `SHOPIFY_STORE_DOMAIN`
  - `SHOPIFY_STOREFRONT_ACCESS_TOKEN` (or `SHOPIFY_STOREFRONT_TOKEN`)
  - `POSTHOG_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_PRO_MONTHLY`
  - `STRIPE_PRICE_PRO_YEARLY`
  - `SENTRY_DSN`
  - `AUTH_SECRET`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `APP_ORIGIN`
  - `ADMIN_EMAILS`
  - `RESEND_API_KEY`
  - `EMAIL_FROM`
- [ ] Validate staging guards (Stripe test key, DB not tagged as prod).

### 6.2 Staging Deploy + Release Workflow
- [ ] PR → CI → staging deploy is enforced.
- [ ] Staging uses staging DB + staging tokens (never prod).
- [ ] Manual smoke test checklist completed:
  - Share link creation + open
  - Export open + print
  - AI call
  - Checkout started
- [ ] Promote staging → prod only after checklist passes.

### 6.3 Email (Minimum Viable)
- [ ] Share link email is sent from Present/Share flow.
- [ ] Deliverability verified (check inbox + spam).
- [ ] URL in email opens the correct share page.

### 6.4 Admin Dashboard (Must-Have Visibility)
- [ ] `/admin` shows: designs created, share links created/opened, exports opened/printed.
- [ ] `/admin` shows: checkout started, affiliate clicks, webhook failures.
- [ ] Link to Sentry issues for last 24h errors.

### 6.5 Rate Limits + Abuse Guardrails
- [ ] Share link creation rate limited.
- [ ] Export generation rate limited.
- [ ] Shopify cart create / stock check rate limited.

### 6.6 Data Backups + Migration Safety
- [ ] Migrations only via CI or controlled commands.
- [ ] Neon backups enabled and verified.
- [ ] Restore rehearsal checklist documented and tested.

---

## 🎉 You're Ready!

All components are built. Follow steps 1-10 above, and the catalog system will be live and integrated with runtime validation, commerce enforcement, and admin QA tools.

**Estimated total time: 2-3 hours for full integration.**

Good luck! 🚀
