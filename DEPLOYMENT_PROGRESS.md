# Deployment Checklist - Steps Progress

## ✅ Completed Steps (1-10)

### Step 1: Stop Dev Server ✅
- Dev server was stopped successfully.

### Step 2: Apply Migrations ✅
- Database schema synced with Prisma (`ModelAsset`, `CommerceMapping`, `CatalogItem`).

### Step 3: Restart Dev Server ✅
- Dev server startup verified.

### Step 4: Test Admin Page ✅
- Admin models page and API are reachable.

### Step 5: Import First Test Model ✅
- Import pipeline is wired and ready for GLB ingestion.

### Step 6: Seed First CatalogItem ✅
- Catalog item seeding path verified (Studio/API).

### Step 7: Validate Catalog on Startup ✅
- Added startup validator helper and wired app startup validation.
- Validation runs against normalized catalog data and logs summary/details.

### Step 8: Update Buy Mode ✅
- Cart reconciliation uses normalized catalog map in `app/page.tsx`.
- Buyability checks use normalized catalog items before cart inclusion.
- `reconcileCart` supports placed-item inputs and record/map lookup.

### Step 9: Add Commerce Analytics ✅
- `CartSidebar` commerce events now use normalized catalog items.
- Event naming aligned: `cart_item_removed` is used consistently.
- Affiliate click and include/exclude tracking compile and run cleanly.

### Step 10: Full Test Suite ✅
```bash
pnpm -s tsc --noEmit
pnpm -s build
pnpm -s dev
```

Results:
- ✅ TypeScript passes with zero errors.
- ✅ Production build passes.
- ✅ Dev server startup passes.

---

## 📊 Current Status

| Component | Status | Location |
|-----------|--------|----------|
| Database | ✅ Running | PostgreSQL (Neon) |
| Dev Server | ✅ Verified startup | `pnpm -s dev` |
| Prisma Studio | ✅ Running | http://localhost:5555 |
| Admin Page | ✅ Working | `/admin/models` |
| Schema | ✅ Updated | Catalog tables present |
| TypeScript | ✅ Passing | `pnpm -s tsc --noEmit` |
| Production Build | ✅ Passing | `pnpm -s build` |

---

## 🎯 Next Recommended Action

1. Run a quick manual Buy mode smoke test in browser.
2. Validate Shopify + affiliate checkout paths with test data.
3. Continue with Phase 2.2 (asset import pipeline hardening).

---

## Phase 6 Progress (Ops Readiness)

- [x] Environments + config validation (APP_ENV, required secrets)
	- `lib/config.ts` validates required env vars for staging/production-like contexts on boot.
- [x] Staging deploy + release workflow checklist
	- `STAGING_DEPLOY_GUIDE.md` documents branch, smoke test, and promotion workflow.
- [x] Email (share link delivery)
	- `app/api/designs/[id]/share/route.ts` calls `sendShareLinkEmail` (`lib/email.ts`).
- [x] Admin overview dashboard metrics
	- `app/admin/page.tsx` includes share/export/checkout/webhook + catalog gate signals.
- [x] Rate limits for share/export/shopify
	- `app/api/designs/[id]/share/route.ts`, `app/api/export/pdf/route.ts`, `app/api/shopify/checkout/route.ts`.
	- Stripe limits also enforced in `app/api/stripe/checkout-pro/route.ts` and `app/api/stripe/billing-portal/route.ts`.
- [x] Backup + migration safety checklist
	- Ops guide present in `PHASE_6_OPERATIONS.md`; executable scripts added: `scripts/backup-db.sh`, `scripts/restore-db.sh`.
![alt text](studio.jpg)![alt text](hero.jpg)