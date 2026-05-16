# Environment Setup for Testing & Error Reporting

## Local Development (`.env.local`)

```bash
# Sentry - Error Reporting
NEXT_PUBLIC_SENTRY_DSN=https://your-key@sentry.io/project-id
SENTRY_ENVIRONMENT=development

# NextAuth - Authentication (for tests)
AUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=http://localhost:3000

# Database - for E2E tests
DATABASE_URL=postgresql://user:password@localhost:5432/interior_ai_dev

# PostHog - Analytics (optional)
NEXT_PUBLIC_POSTHOG_KEY=phc_your_key
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Stripe - Payments (optional)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

# Shopify - Products (optional)
SHOPIFY_API_KEY=your-key
SHOPIFY_API_SECRET=your-secret
```

## CI/CD Environment (GitHub Actions - `.github/workflows/ci.yml`)

Set these secrets in GitHub:

1. Go to: **Settings → Secrets and variables → Actions**
2. Add these secrets:

| Secret Name | Value |
|------------|-------|
| `SENTRY_DSN` | Your Sentry project DSN |
| `DATABASE_URL` | Test database connection string |
| `AUTH_SECRET` | Any random string (for tests) |
| `STRIPE_SECRET_KEY` | Stripe test key |
| `SHOPIFY_API_KEY` | Shopify test key |

## Playwright Test Environment

Tests automatically use these variables:

```bash
# Playwright tests read from environment
BASE_URL=http://localhost:3000
DATABASE_URL=postgresql://...
AUTH_SECRET=test-secret
```

## Sentry Setup

### 1. Create Sentry Project
- Go to [sentry.io](https://sentry.io)
- Create new project (select Next.js)
- Copy your DSN

### 2. Add to `.env.local`
```bash
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project-id
```

### 3. Verify in Code

The Sentry integration is already in place:
- ✅ `lib/sentry.ts` - Initializes Sentry
- ✅ `lib/sentry-context.ts` - Adds design context
- ✅ `components/CanvasErrorBoundary.tsx` - Catches R3F errors
- ✅ Error context: `designId`, `roomId`, `mode`, `plan`, `isGuest`

### 4. Test Error Capture (Dev)

Add this to your page temporarily to test:

```typescript
// In a button click or useEffect
import * as Sentry from '@sentry/nextjs';

Sentry.captureMessage('Test error from dev', 'info');
```

Check [sentry.io Dashboard](https://sentry.io) → your project → Events to verify it worked.

## Running Tests

### Locally
```bash
# Install dependencies
pnpm install

# Run tests
pnpm run test:e2e

# Run with UI
pnpm run test:e2e:ui

# Run specific test
pnpm run test:e2e -- 01-onboarding.spec.ts
```

### In CI
GitHub Actions automatically:
1. ✅ Typecheck
2. ✅ Lint
3. ✅ Build
4. ✅ Run E2E tests
5. ✅ Block merge if any fail

## DevServer FPS Meter

In development:
1. Start: `pnpm run dev`
2. Press **F** to toggle FPS meter
3. Bottom-right shows FPS and color coding:
   - 🟢 Green: 50+ FPS (good)
   - 🟡 Yellow: 30-50 FPS (caution)
   - 🔴 Red: <30 FPS (bad)

## Debugging Tests

### Run tests with headed browser
```bash
pnpm run test:e2e:headed
```

### Run with Playwright Inspector
```bash
pnpm run test:e2e -- --debug
```

### View test results
```bash
# HTML report
npx playwright show-report

# Or open directly
open playwright-report/index.html
```

## Common Issues

### Tests timeout (⏱️ Cannot find element)
- Make sure you've added `data-testid` attributes to UI components
- See `TEST_IDS.md` for full list

### Sentry not capturing errors
- Check `.env.local` has valid `NEXT_PUBLIC_SENTRY_DSN`
- Sentry only captures in production builds
- In dev, check browser console

### Database connection fails in tests
- Verify `DATABASE_URL` is set
- Make sure DB is running (`docker-compose up`)
- Check credentials are correct

### FPS Meter not showing
- Only appears in development (`pnpm run dev`)
- Press **F** to toggle
- Check browser DevTools console for errors

