# Phase 5 Implementation Checklist

## ✅ Files Created

### E2E Tests (Playwright)
- [x] `playwright.config.ts` - Playwright configuration
- [x] `tests/e2e/fixtures.ts` - Test fixtures & utilities
- [x] `tests/e2e/01-onboarding.spec.ts` - Onboarding flow tests
- [x] `tests/e2e/02-editor.spec.ts` - Editor correctness tests
- [x] `tests/e2e/03-persistence.spec.ts` - Save/reload & multi-room tests
- [x] `tests/e2e/04-share.spec.ts` - Share link read-only tests
- [x] `tests/e2e/05-buy.spec.ts` - Buy flow (Shopify + affiliate) tests

### Error Reporting (Sentry)
- [x] `lib/sentry.ts` - Sentry client initialization
- [x] `lib/sentry-context.ts` - Context enrichment & error capture utilities
- [x] `components/CanvasErrorBoundary.tsx` - R3F error boundary with fallback UI

### Performance Monitoring
- [x] `lib/performance-monitor.ts` - FPS tracking & performance event reporting
- [x] `components/FPSMeter.tsx` - Dev-only FPS meter (toggle with F key)

### CI/CD
- [x] `.github/workflows/ci.yml` - GitHub Actions pipeline (typecheck, lint, build, E2E)

### Documentation
- [x] `TESTING_QUALITY_GATES.md` - Overview of all quality gates
- [x] `TEST_IDS.md` - Required data-testid attributes for tests
- [x] `ENV_SETUP.md` - Environment setup guide

### Package Updates
- [x] `package.json` - Added Playwright, Sentry, test scripts

## 📋 Next Steps to Implement

### 1. Install Dependencies
```bash
npm install
npx playwright install
```

### 2. Add Test IDs to UI Components
Use the checklist in `TEST_IDS.md`:
- [ ] Add `data-testid="scene-canvas"` to 3D canvas
- [ ] Add `data-testid="sofa-nudge"` to onboarding hint
- [ ] Add `data-testid="seating-zone"` to seating zone
- [ ] Add `data-testid="item-in-scene"` to placed items
- [ ] Add `data-testid="save-design"` to save button
- [ ] Add `data-testid="create-share"` to share button
- [ ] Add other IDs from `TEST_IDS.md`

### 3. Integrate Error Reporting
- [ ] Set `NEXT_PUBLIC_SENTRY_DSN` in `.env.local`
- [ ] Wrap canvas with `<CanvasErrorBoundary>` in [app/page.tsx](app/page.tsx#L1)
- [ ] Call `setSentryContext()` when state changes:
  ```typescript
  import { setSentryContext } from '@/lib/sentry-context';
  
  useEffect(() => {
    setSentryContext({
      designId,
      mode,
      roomId: activeRoom?.id,
      plan,
      isGuest: !session?.user,
      userId: session?.user?.id,
    });
  }, [designId, mode, activeRoom, plan, session]);
  ```

### 4. Add Performance Monitoring
- [ ] Import `FPSMeter` in layout.tsx:
  ```typescript
  import { FPSMeter } from '@/components/FPSMeter';
  
  // In JSX:
  <FPSMeter />
  ```
- [ ] Call performance tracking in render loop:
  ```typescript
  import { PerformanceMonitor } from '@/lib/performance-monitor';
  
  useFrame(({ gl }) => {
    PerformanceMonitor.updateFPS(deltaTime);
    PerformanceMonitor.trackLowPerformance(metrics, {
      itemCount: items.length,
      mode,
      plan,
    });
  });
  ```

### 5. Setup GitHub Actions
- [ ] Add secrets to GitHub repo settings:
  - `SENTRY_DSN`
  - `DATABASE_URL` (test DB)
  - Other env vars from `ENV_SETUP.md`
- [ ] Push code to trigger CI
- [ ] Verify workflow runs and tests pass

### 6. Run Tests Locally
```bash
# Start dev server
npm run dev

# In another terminal
npm run test:e2e

# Or with UI
npm run test:e2e:ui
```

## 🔍 Verification Checklist

### Local Development
- [ ] `npm run dev` starts without errors
- [ ] Press F in browser → FPS meter appears
- [ ] FPS meter shows 60 FPS (green)
- [ ] Console shows performance metrics

### Sentry
- [ ] Sentry DSN is set in `.env.local`
- [ ] Errors appear in Sentry dashboard
- [ ] Error context includes: designId, mode, roomId, plan, isGuest
- [ ] Canvas errors show graceful fallback (not white screen)

### Tests
- [ ] `npm run test:e2e` passes all 5 test suites
- [ ] Each test file can run independently:
  - `npm run test:e2e -- 01-onboarding.spec.ts`
  - `npm run test:e2e -- 02-editor.spec.ts`
  - `npm run test:e2e -- 03-persistence.spec.ts`
  - `npm run test:e2e -- 04-share.spec.ts`
  - `npm run test:e2e -- 05-buy.spec.ts`

### CI/CD
- [ ] Push to branch → GitHub Actions runs
- [ ] Typecheck passes
- [ ] Linting passes
- [ ] Build succeeds
- [ ] E2E tests pass
- [ ] Merge is allowed only when all checks are green

## 📊 Test Coverage Summary

| Flow | Tests | Status |
|------|-------|--------|
| Onboarding | 2 | ✅ Written |
| Editor | 3 | ✅ Written |
| Save/Reload | 2 | ✅ Written |
| Share Link | 2 | ✅ Written |
| Buy Flow | 2 | ✅ Written |
| **TOTAL** | **11 E2E Tests** | ✅ **Ready** |

## 🎯 Quality Gates In Place

1. **TypeScript** - Type safety
2. **ESLint** - Code quality
3. **Build** - No build errors
4. **E2E Tests** - 11 critical flow tests
5. **Sentry** - Error tracking with context
6. **Performance** - FPS monitoring + events

## 🚀 Release Readiness

All quality gates are now implemented:
- ✅ Tests written for 5 core flows
- ✅ Error reporting with Sentry
- ✅ Performance monitoring (dev + prod)
- ✅ CI/CD pipeline configured
- ✅ Error boundary for graceful fallback

**Next: Follow the "Next Steps" section above to integrate into your codebase.**

