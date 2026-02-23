# Phase 6: Operations Readiness - Complete Implementation Guide

## 1. Environment Configuration

### 1.1 APP_ENV Setup

Set `APP_ENV` in each environment:
- **Development**: `AWS_ENV=development` (or omit, defaults to `development`)
- **Staging**: `APP_ENV=staging`
- **Production**: `APP_ENV=production`

### 1.2 Environment File Strategy

**Development** (`.env.local`):
```bash
APP_ENV=development
DATABASE_URL=postgresql://...staging-db...
OPENAI_API_KEY=sk-test-...
STRIPE_SECRET_KEY=sk_test_...
SHOPIFY_STORE_DOMAIN=staging-store.myshopify.com
# ... other test/dev credentials
```

**Staging** (`.env.staging` or Vercel staging environment):
```bash
APP_ENV=staging
DATABASE_URL=postgresql://...staging-db...
OPENAI_API_KEY=sk-test-...
STRIPE_SECRET_KEY=sk_test_...  # MUST be test key
SHOPIFY_STORE_DOMAIN=staging-store.myshopify.com
# ... all required vars from staging secrets
```

**Production** (`.env.production` or Vercel production environment):
```bash
APP_ENV=production
DATABASE_URL=postgresql://...prod-db...  # No "staging" in URL
OPENAI_API_KEY=sk-proj-...
STRIPE_SECRET_KEY=sk_live_...  # Live key
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
# ... all required vars from production secrets
```

### 1.3 Required Environment Variables (Staging & Production)

**Critical Secrets**:
- `DATABASE_URL` — Must NOT mix staging/prod
- `OPENAI_API_KEY`
- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_STOREFRONT_ACCESS_TOKEN` (or `SHOPIFY_STOREFRONT_TOKEN`)
- `POSTHOG_KEY` (or `NEXT_PUBLIC_POSTHOG_KEY`)
- `STRIPE_SECRET_KEY` — Must use test key in staging
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_YEARLY`
- `SENTRY_DSN` (or `NEXT_PUBLIC_SENTRY_DSN`)
- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APP_ORIGIN` — base URL (e.g., `https://staging.example.com`, `https://example.com`)
- `ADMIN_EMAILS` — comma-separated admin allowlist
- `RESEND_API_KEY` — for sending emails
- `EMAIL_FROM` — sender address (e.g., `Interior AI <noreply@example.com>`)

**Optional Feature Flags**:
- `FEATURE_AI=true` (default: true)
- `FEATURE_CHECKOUT=true` (default: true)
- `FEATURE_EMAIL=true` (default: true)

### 1.4 Validation on Boot

The app automatically validates critical env vars in staging/production via `lib/config.ts` `validateEnvOrThrow()`. If any required vars are missing or misconfigured (e.g., Stripe live key in staging), the app **refuses to boot**.

---

## 2. Staging Deploy + Release Workflow

### 2.1 Branch Strategy

**Recommended**:
- `main` → deploys to **production**
- `staging` → deploys to **staging**
- Feature branches → PRs to `staging`

**Workflow**:
1. Create feature branch: `feature/my-feature`
2. Open PR to `staging`
3. CI runs (type-check, lint, build, tests)
4. After approval → merge to `staging`
5. Staging auto-deploys
6. Manual smoke test on staging
7. If pass → merge `staging` to `main`
8. Production auto-deploys

### 2.2 Smoke Test Checklist (Staging)

Before promoting to production, verify these flows on staging:

**□ Share Link Flow**:
- [ ] Create share link
- [ ] Open share link in incognito window
- [ ] Check share tracking in admin dashboard

**□ Export Flow**:
- [ ] Open `/share/<token>/export`
- [ ] Click "Print / Save as PDF"
- [ ] Verify export metrics in admin

**□ AI Calls**:
- [ ] Generate AI design notes
- [ ] Generate AI layout
- [ ] Verify no 503 errors (feature gating)

**□ Checkout Flow**:
- [ ] Add items to cart
- [ ] Initiate Shopify checkout (staging store)
- [ ] Verify checkout started event in admin

**□ Admin Dashboard**:
- [ ] Visit `/admin`
- [ ] Check recent designs, orders, webhook failures
- [ ] Confirm no errors in last 24h

### 2.3 Manual Promotion to Production

**Option A: Merge Strategy**
```bash
git checkout main
git merge staging --ff-only
git push origin main
```

**Option B: Vercel Deploy (if using Vercel)**
```bash
vercel --prod  # from staging branch after smoke tests pass
```

---

## 3. Email Sending (Resend)

### 3.1 Setup

1. Sign up at [resend.com](https://resend.com)
2. Add your domain and verify DNS records
3. Create an API key
4. Set env vars:
   - `RESEND_API_KEY=re_...`
   - `EMAIL_FROM=Interior AI <noreply@yourdomain.com>`

### 3.2 Usage

**Share Link Email** (sent automatically when user provides recipient email):
- Endpoint: `POST /api/designs/[id]/share`
- Request body: `{ email: "client@example.com", recipientName: "Optional Name" }`
- Email includes: design title, sender name, share URL

**Testing**:
- In development, email sending is **optional** (logs warning if `RESEND_API_KEY` missing)
- In staging/production, emails are sent if `FEATURE_EMAIL=true` (default)

### 3.3 Deliverability Checks

- Check inbox and spam folder
- Verify link opens correct `/share/<token>` page
- Test with Gmail, Outlook, Apple Mail

---

## 4. Admin Dashboard (/admin)

### 4.1 Access Control

Admin pages require:
- Authenticated user
- Email in `ADMIN_EMAILS` allowlist

**In development**: If `ADMIN_EMAILS` is empty, **all logged-in users** get admin access.

### 4.2 Available Metrics

**`/admin` (Overview Dashboard)**:
- Designs created (24h / 7d)
- Share links created / opened (24h)
- Exports opened / printed (24h)
- Checkout started (24h)
- Affiliate clicks (24h)
- Webhook failures (24h) + Sentry link

**Recent Activity Tables**:
- Recent Designs (last 10)
- Recent Orders (Shopify, last 10)
- Recent Webhook Failures (last 24h)

**`/admin/clicks`**:
- Detailed affiliate click tracking
- CSV export of product clicks

**`/admin/models`**:
- Model asset management
- Catalog item editing (future)

### 4.3 Monitoring Links

Set these optional env vars to link admin dashboard to monitoring tools:
- `SENTRY_ISSUES_URL` — link to Sentry project issues
- `SENTRY_PROJECT_URL` — link to Sentry project home

---

## 5. Rate Limits + Abuse Guardrails

### 5.1 Rate Limit Summary

| Endpoint | Limit | Window | Rate Key |
|----------|-------|--------|----------|
| `POST /api/designs/[id]/share` | 10 | 60s | `share:{userId}` |
| `POST /api/export/pdf` | 6 | 60s | `export:{userId}` |
| `POST /api/shopify/checkout` | 8 | 60s | `shopify:{ip}` |
| `POST /api/stripe/checkout` | 8 | 60s | `stripe:{userId}` |
| `POST /api/stripe/portal` | 10 | 60s | `stripe-portal:{userId}` |
| `POST /api/ai/design-notes` | 12 | 60s | `user:{userId}` or `anon:{anonId}` |
| `POST /api/ai/layout` | 20 | 60s | `ai-layout:{userId}` |
| `POST /api/track/app-event` | 30 | 60s | `user:{userId}:app-event` or `ip:{ip}:app-event` |

### 5.2 Rate Limit Behavior

- Returns `429 Too Many Requests` with error message
- Client should retry after 60s
- Uses in-memory map (resets on server restart)

### 5.3 Production Hardening

**For high-traffic production**:
- Upgrade rate limiter to Redis (use `ioredis` + Upstash)
- Add IP allowlist for known integrations
- Add Cloudflare rate limiting at edge

---

## 6. Data Backups + Migration Safety

### 6.1 Neon Backup Configuration

**Enable Neon Backups**:
1. Log in to [Neon console](https://console.neon.tech)
2. Select your project
3. Go to Settings → Backups
4. Enable automatic daily backups
5. Set retention period (7-30 days)

**Manual Backups**:
```bash
# Export via Neon API or pg_dump
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### 6.2 Migration Workflow

**Safe Migration Steps**:
1. **Never** run migrations directly on production DB
2. Test migrations on staging first
3. Use Prisma migration commands (not manual SQL):
   ```bash
   npx prisma migrate dev --name add_app_event_table
   npx prisma db push  # For prototyping only
   ```
4. For production, use CI/CD or controlled manual deploy:
   ```bash
   npx prisma migrate deploy
   ```

**Schema Change Checklist**:
- [ ] Migration tested on staging DB
- [ ] No breaking changes to existing queries
- [ ] Indexes added for new queries
- [ ] Backup taken before migration
- [ ] Rollback plan documented

### 6.3 Restore Rehearsal

**Quarterly Restore Test**:
1. Take manual backup of staging DB
2. Create new empty Neon database
3. Restore backup:
   ```bash
   psql $NEW_DATABASE_URL < backup-staging.sql
   ```
4. Verify data integrity:
   ```bash
   npx prisma studio  # Browse tables
   ```
5. Document any issues

**Restore SOP (Production)**:
1. Contact Neon support for point-in-time restore (if needed)
2. Or restore from latest daily backup
3. Test restored DB with read-only connection
4. Swap connection strings in env vars
5. Monitor app for errors

---

## 7. Feature Flags

### 7.1 Available Flags

- `FEATURE_AI` — Enable/disable AI endpoints (`/api/ai/*`)
- `FEATURE_CHECKOUT` — Enable/disable Stripe/Shopify checkout
- `FEATURE_EMAIL` — Enable/disable email sending

**Default**: All `true`

**To disable** (e.g., during incident):
```bash
FEATURE_CHECKOUT=false
```

**Behavior**:
- Disabled features return `503 Service Unavailable`
- Client should show graceful error message

### 7.2 Logging Verbosity

Based on `APP_ENV`, the app sets log level:
- `development` → `debug` (verbose)
- `staging` → `info` (moderate)
- `production` → `warn` (minimal)

---

## 8. Incident Response Playbook

### 8.1 High Error Rate

**Symptoms**: Sentry shows spike in errors

**Steps**:
1. Check `/admin` → Webhook failures
2. Check Sentry issues URL
3. If Stripe/Shopify API errors → check status pages
4. If database errors → check Neon dashboard
5. If needed, disable affected feature (`FEATURE_CHECKOUT=false`)

### 8.2 Slow AI Responses

**Symptoms**: Users report AI timeouts

**Steps**:
1. Check OpenAI status page
2. Verify `OPENAI_API_KEY` is valid
3. Check `/admin` → recent designs (verify AI usage)
4. Temporarily disable AI if needed: `FEATURE_AI=false`

### 8.3 Database Connection Issues

**Symptoms**: `DATABASE_URL` errors, Prisma timeouts

**Steps**:
1. Check Neon console for DB status
2. Verify connection pooling (Prisma uses PgBouncer via Neon)
3. Check connection limit (Neon free tier: 100 connections)
4. If connection leak suspected, restart server

### 8.4 Webhook Failures

**Symptoms**: `/admin` shows webhook failures

**Steps**:
1. Check Stripe dashboard → Webhooks → Recent deliveries
2. Verify `STRIPE_WEBHOOK_SECRET` is correct
3. Check if endpoint is reachable (firewall/CORS)
4. Manually retry failed webhooks in Stripe dashboard

---

## 9. Deployment Checklist (Final)

**Before deploying to production**:

- [ ] All required env vars set in production environment
- [ ] APP_ENV=production
- [ ] DATABASE_URL points to prod DB (no "staging" in URL)
- [ ] STRIPE_SECRET_KEY is live key (starts with `sk_live_`)
- [ ] Staging smoke tests passed (all 5 flows)
- [ ] Admin emails allowlist configured
- [ ] Neon backups enabled
- [ ] Sentry project configured
- [ ] PostHog project configured (production environment)
- [ ] Resend domain verified
- [ ] CI/CD pipeline tested on staging
- [ ] Rollback plan documented

**After deploying to production**:

- [ ] Verify health check: `curl https://yourdomain.com/api/me`
- [ ] Test one feature end-to-end (e.g., create design + save)
- [ ] Check `/admin` shows zero webhook failures
- [ ] Monitor Sentry for first 15 minutes
- [ ] Verify PostHog events arriving

---

## 10. Quick Reference

**Useful Commands**:
```bash
# Validate env vars (fails if missing/wrong)
npm run dev  # validateEnvOrThrow() runs on boot

# Apply migrations (production)
npx prisma migrate deploy

# Check DB connection
npx prisma studio

# Export env vars for debugging
env | grep -E "DATABASE_URL|OPENAI|STRIPE|SHOPIFY"

# Test email locally
node -e "require('./lib/email').sendShareLinkEmail({to:'you@example.com',designTitle:'Test',shareUrl:'https://localhost:3000/share/test'})"
```

**Admin URLs**:
- `/admin` — Overview dashboard
- `/admin/clicks` — Affiliate tracking
- `/admin/models` — Catalog management

**Monitoring**:
- Sentry: https://sentry.io/organizations/<org>/issues/
- Neon: https://console.neon.tech
- Resend: https://resend.com/emails
- Stripe: https://dashboard.stripe.com/webhooks
