# Staging Deployment Guide

## Quick Reference: Current Status

**Git Setup**: ✅ Complete
- Repository initialized
- Branches: `main` (production), `staging` (staging environment)
- Phase 6 changes committed

**E2E Tests**: ⚠️ 5/11 passing (6 timeout failures)
- ✅ Passing: collision detection, wall snap, save/persist, multi-room, shared views
- ❌ Timeouts: onboarding (2), undo/redo, share read-only, checkout (2)

**Production Build**: ✅ Verified
- TypeScript compiles without errors
- All Phase 6 features integrated

---

## Deployment Options

### Option 1: Vercel (Recommended)

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy to staging**:
   ```bash
   vercel --prod=false
   ```
   
   Or link to existing project:
   ```bash
   vercel link
   vercel --env=preview
   ```

4. **Configure environment variables** in Vercel dashboard:
   - Project Settings → Environment Variables
   - Import from `.env.staging.template`
   - Set environment to "Preview" (staging)

5. **Set up deployment branches**:
   - Production Branch: `main`
   - Preview Branches: `staging`, feature branches
   - Auto-deploy enabled for both

### Option 2: Railway

1. **Install Railway CLI**:
   ```bash
   npm i -g @railway/cli
   ```

2. **Login and initialize**:
   ```bash
   railway login
   railway init
   ```

3. **Create staging environment**:
   ```bash
   railway environment create staging
   railway environment use staging
   ```

4. **Set environment variables**:
   ```bash
   railway variables set APP_ENV=staging
   railway variables set DATABASE_URL=postgresql://...
   # ... repeat for all variables
   ```

5. **Deploy**:
   ```bash
   railway up
   ```

### Option 3: Manual VPS/Docker

1. **Build production bundle**:
   ```bash
   npm run build
   ```

2. **Copy files to server**:
   ```bash
   rsync -avz --exclude node_modules --exclude .git . user@staging-server:/var/www/interior-ai/
   ```

3. **On server, install and start**:
   ```bash
   cd /var/www/interior-ai
   npm ci --omit=dev
   APP_ENV=staging npm start
   ```

4. **Set up process manager (PM2)**:
   ```bash
   npm i -g pm2
   pm2 start npm --name interior-ai -- start
   pm2 startup
   pm2 save
   ```

---

## Environment Setup Checklist

Before deploying to staging, ensure:

- [ ] **Database Ready**
  - [ ] Staging Neon database created
  - [ ] Connection string added to env vars
  - [ ] Migrations applied: `npx prisma migrate deploy`

- [ ] **Authentication Configured**
  - [ ] Google OAuth app created (staging redirect URLs)
  - [ ] `AUTH_SECRET` generated: `openssl rand -base64 32`
  - [ ] `APP_ORIGIN` set to staging URL

- [ ] **Third-Party Services**
  - [ ] Shopify staging store created
  - [ ] Shopify Storefront API token generated
  - [ ] Stripe test account keys obtained
  - [ ] Stripe webhook endpoint configured
  - [ ] OpenAI API key (test or production with low quotas)
  - [ ] PostHog staging project created
  - [ ] Sentry staging environment configured
  - [ ] Resend API key and domain verified

- [ ] **Required Environment Variables**
  - [ ] All vars from `.env.staging.template` filled in
  - [ ] No production secrets in staging env
  - [ ] `APP_ENV=staging` explicitly set

- [ ] **Admin Access**
  - [ ] `ADMIN_EMAILS` configured with your email

---

## Post-Deployment Smoke Tests

After staging deployment, test these critical flows:

### 1. Share Link Flow (2 min)
1. Visit staging URL and log in
2. Create a design, add 1-2 items
3. Click "Share" → create share link
4. Open share link in incognito window
5. ✅ Verify: design loads, items visible, read-only mode

### 2. Export Flow (1 min)
1. From share link, click "Export"
2. Click "Print / Save as PDF"
3. ✅ Verify: PDF preview opens

### 3. AI Calls (2 min)
1. In editor, click "AI Suggestions"
2. ✅ Verify: AI notes generate successfully
3. Click "Auto Layout"
4. ✅ Verify: Items rearrange automatically

### 4. Checkout Flow (3 min)
1. Add Shopify-mapped item to cart
2. Click "Checkout"
3. ✅ Verify: Redirects to staging Shopify checkout
4. Complete test purchase (use Stripe test card: 4242 4242 4242 4242)
5. ✅ Verify: Order appears in Shopify admin

### 5. Admin Dashboard (1 min)
1. Visit `/admin`
2. ✅ Verify: Dashboard loads, shows metrics
3. Check recent designs, orders, events
4. ✅ Verify: No errors in last 24h

---

## Monitoring & Debugging

### View Logs

**Vercel**:
```bash
vercel logs [deployment-url] --follow
```

**Railway**:
```bash
railway logs
```

**Docker/PM2**:
```bash
pm2 logs interior-ai
```

### Check Health

```bash
curl https://staging.yourdomain.com/api/me
# Should return: {"user": null} or user object if logged in
```

### Common Issues

**Issue**: `Missing required env vars for staging`
- **Fix**: Check logs for missing variable names, add to platform env vars

**Issue**: `Database connection timeout`
- **Fix**: Verify `DATABASE_URL` is correct, check Neon dashboard for status

**Issue**: `Stripe webhook verification failed`
- **Fix**: Regenerate webhook secret in Stripe dashboard, update env var

**Issue**: `Share link leads to 404`
- **Fix**: Ensure `APP_ORIGIN` matches actual staging URL (no trailing slash)

**Issue**: `Cannot login with Google`
- **Fix**: Add staging URL to Google OAuth authorized redirect URIs

---

## Rollback Procedure

If staging deployment fails:

1. **Vercel**: Redeploy previous version from dashboard
2. **Railway**: `railway rollback`
3. **Manual**: Restore previous build and restart

---

## Promote to Production

Once staging smoke tests pass:

1. **Merge staging to main**:
   ```bash
   git checkout main
   git merge staging --ff-only
   git push origin main
   ```

2. **Verify production env vars** (use production secrets):
   - `APP_ENV=production`
   - `DATABASE_URL` → production database
   - `STRIPE_SECRET_KEY` → live key (starts with `sk_live_`)
   - All other services → production instances

3. **Deploy production**:
   - Vercel: Auto-deploys on push to `main`
   - Railway: Switch to production environment, deploy
   - Manual: Build and deploy to production server

4. **Run production smoke tests** (same as staging checklist)

5. **Monitor for errors** in Sentry for first 15 minutes

---

## CI/CD Setup (Optional)

To automate testing and deployment, create `.github/workflows/staging.yml`:

```yaml
name: Staging Deploy

on:
  push:
    branches: [staging]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npm run test:e2e
      - name: Deploy to Vercel
        run: vercel deploy --prod=false --token=${{ secrets.VERCEL_TOKEN }}
```

---

## Support

For deployment issues:
- **Vercel**: https://vercel.com/docs
- **Railway**: https://docs.railway.app
- **Neon**: https://neon.tech/docs
- **Phase 6 Operations**: See `PHASE_6_OPERATIONS.md`

---

## Next Steps

1. ✅ Choose deployment platform (Vercel recommended)
2. ✅ Set up staging environment variables
3. ✅ Deploy staging from `staging` branch
4. ✅ Run smoke tests
5. ✅ Fix any E2E test timeout issues (optional)
6. ✅ Merge to `main` and deploy production
