# Vercel Staging Deployment - Step by Step

## ✅ Preparation Complete
- Vercel CLI installed (via npx)
- `vercel.json` configuration created
- `.vercelignore` file created
- Git repository ready on `staging` branch

---

## 🚀 Deployment Steps

### Step 1: Login to Vercel

Run this command - it will open your browser for authentication:

```bash
npx vercel login
```

Follow the browser prompts to authenticate with your Vercel account.

---

### Step 2: Link Project (First Time Only)

```bash
npx vercel link
```

Answer the prompts:
- **Set up and deploy?** → `Y`
- **Scope** → Choose your team or personal account
- **Link to existing project?** → `N` (first time) or `Y` (if project exists)
- **Project name** → `interior-ai` (or your preferred name)
- **Directory** → `.` (current directory)

---

### Step 3: Configure Environment Variables

Go to your Vercel dashboard at https://vercel.com/dashboard

1. Click on your project (`interior-ai`)
2. Go to **Settings** → **Environment Variables**
3. Add all variables from `.env.staging.template`:

**Required Variables (copy from template):**

```bash
# Environment
APP_ENV=staging

# App
APP_ORIGIN=https://your-project.vercel.app
NEXTAUTH_URL=https://your-project.vercel.app

# Database (Your Neon staging DB)
DATABASE_URL=postgresql://...

# Auth
AUTH_SECRET=<generate with: openssl rand -base64 32>
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# OpenAI
OPENAI_API_KEY=sk-test-...

# Shopify (Staging)
SHOPIFY_STORE_DOMAIN=your-staging-store.myshopify.com
SHOPIFY_STOREFRONT_ACCESS_TOKEN=your-token
SHOPIFY_API_VERSION=2026-01

# Stripe (TEST keys only!)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
STRIPE_PRICE_PRO_MONTHLY=price_test_...
STRIPE_PRICE_PRO_YEARLY=price_test_...

# Analytics
POSTHOG_KEY=phc_...
SENTRY_DSN=https://...@sentry.io/...

# Email
RESEND_API_KEY=re_...
EMAIL_FROM=Interior AI Staging <staging@yourdomain.com>

# Admin
ADMIN_EMAILS=your-email@domain.com
```

**Important:**
- Set environment to **"Preview"** for staging
- Make sure `APP_ENV=staging` is set
- Use **test** Stripe keys (sk_test_...), not live keys
- Update `APP_ORIGIN` after first deploy with actual Vercel URL

---

### Step 4: Deploy to Staging (Preview)

Deploy the staging branch as a preview deployment:

```bash
npx vercel
```

This deploys to a preview URL (staging environment).

**Or specify environment explicitly:**

```bash
npx vercel --env preview
```

---

### Step 5: Verify Deployment

After deployment, Vercel will show you the preview URL:
```
✅ Production: https://interior-ai-xxxxx.vercel.app
```

1. Visit the URL
2. Run smoke tests (see checklist below)

---

### Step 6: Run Database Migration (Important!)

After first deployment, run migration on staging database:

```bash
# Set DATABASE_URL to your staging database
export DATABASE_URL="postgresql://your-staging-db..."

# Run migration
npx prisma migrate deploy
```

Or in Vercel dashboard, you can add a build script in `package.json`:
```json
{
  "scripts": {
    "vercel-build": "prisma generate && prisma migrate deploy && next build"
  }
}
```

---

## 🧪 Smoke Test Checklist

After deployment, test these critical flows:

### 1. ✅ Basic Load (30 sec)
- [ ] Visit homepage
- [ ] Login with Google OAuth
- [ ] Create new design

### 2. ✅ Share Link (2 min)
- [ ] Add 2 items to design
- [ ] Create share link
- [ ] Open share link in incognito
- [ ] Verify: read-only mode, items visible

### 3. ✅ Export (1 min)
- [ ] From share page, click Export
- [ ] Click "Print / Save as PDF"
- [ ] Verify: PDF preview opens

### 4. ✅ AI Features (2 min)
- [ ] Click "AI Suggestions"
- [ ] Verify: AI notes generate
- [ ] Click "Auto Layout"
- [ ] Verify: Items rearrange

### 5. ✅ Checkout (3 min)
- [ ] Add Shopify item to cart
- [ ] Click Checkout
- [ ] Verify: Redirects to Shopify
- [ ] Complete test purchase (4242 4242 4242 4242)

### 6. ✅ Admin Dashboard (1 min)
- [ ] Visit `/admin`
- [ ] Verify: Metrics visible
- [ ] Check recent designs/orders
- [ ] Verify: No errors

---

## 🔧 Troubleshooting

### Issue: OAuth Redirect Error
**Fix:** Add Vercel URL to Google OAuth authorized redirect URIs:
- https://your-project.vercel.app/api/auth/callback/google

### Issue: Missing Environment Variables
**Fix:** Check Vercel logs:
```bash
npx vercel logs
```
Add missing variables in Vercel dashboard.

### Issue: Database Connection Error
**Fix:** Verify `DATABASE_URL` in environment variables, ensure Neon database accepts connections.

### Issue: Build Failed
**Fix:** Check build logs in Vercel dashboard or:
```bash
npx vercel logs --follow
```

---

## 🔄 Setup Branch Auto-Deploy

For automatic deployments on git push:

1. Go to project **Settings** → **Git**
2. Connect your GitHub repository
3. Set branch configuration:
   - **Production Branch:** `main`
   - **Preview Branches:** `staging` (and feature branches)
4. Enable **Automatic Deployments**

Now:
- Push to `staging` → Auto-deploys to preview
- Push to `main` → Auto-deploys to production

---

## 📊 View Deployment Status

Check deployment status:
```bash
npx vercel ls
```

View logs:
```bash
npx vercel logs [deployment-url]
```

Open project in dashboard:
```bash
npx vercel dashboard
```

---

## 🎯 Next Steps After Staging Verification

1. ✅ Complete smoke tests
2. ✅ Fix any issues found
3. ✅ Merge staging to main:
   ```bash
   git checkout main
   git merge staging
   git push origin main
   ```
4. ✅ Deploy to production:
   ```bash
   npx vercel --prod
   ```
5. ✅ Update production env vars (use live keys)
6. ✅ Run production smoke tests

---

## 📚 Resources

- Vercel Docs: https://vercel.com/docs
- Vercel CLI: https://vercel.com/docs/cli
- Next.js on Vercel: https://vercel.com/docs/frameworks/nextjs
- Environment Variables: https://vercel.com/docs/concepts/projects/environment-variables

---

**Ready to deploy!** 🚀

Run: `npx vercel login` to begin.
