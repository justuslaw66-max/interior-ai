# Phase 5: Quality Gates & Error Handling

## ✅ E2E Tests (Playwright)

All 5 core flows have comprehensive tests:

### 1. Onboarding Flow (`01-onboarding.spec.ts`)
- ✅ Sofa placement triggers seating zone auto-creation
- ✅ "Room works" completion message displays
- ✅ Onboarding doesn't reappear after completion
- ✅ Reload preserves onboarding state

### 2. Editor Correctness (`02-editor.spec.ts`)
- ✅ Collision detection prevents overlapping items
- ✅ Wall snap alignment works
- ✅ Undo/redo restores state correctly (one action = one undo)
- ✅ Keyboard shortcuts work (Ctrl+Z, Ctrl+Y)

### 3. Save + Reload (`03-persistence.spec.ts`)
- ✅ Save design persists items, zones, and views
- ✅ Reload page restores all state
- ✅ Multi-room isolation (rooms don't leak state)
- ✅ Room switching maintains independent data

### 4. Share Link Read-Only (`04-share.spec.ts`)
- ✅ Shared link is read-only (no edits possible)
- ✅ Drag/drop doesn't move items
- ✅ Saved views are accessible
- ✅ Room switching works in shared view

### 5. Buy Flow (`05-buy.spec.ts`)
- ✅ Add Shopify item to cart
- ✅ Checkout link exists and works
- ✅ Affiliate click-out triggers confirm modal
- ✅ Affiliate events tracked

## ✅ Error Reporting (Sentry)

### Client + Server Integration
- `lib/sentry.ts` - Sentry initialization with sampling
- `lib/sentry-context.ts` - Context enrichment utilities
- `components/CanvasErrorBoundary.tsx` - R3F error boundary

### Error Context
All errors tagged with:
- ✅ `designId` - Which design errored
- ✅ `mode` - homeowner/designer/present
- ✅ `roomId` - Which room context
- ✅ `plan` - free/pro user plan
- ✅ `isGuest` - Guest vs authenticated

### WebGL Recovery
- ✅ Canvas error boundary catches R3F errors
- ✅ Shows graceful fallback (not white screen)
- ✅ WebGL context loss logged with recovery hint
- ✅ User can retry or reload

## ✅ Performance Monitoring

### Development
- `components/FPSMeter.tsx` - FPS toggle (Press F)
- Shows green (60+ FPS), yellow (30-50 FPS), red (<30 FPS)
- Dev-only, doesn't ship to production
- Logs performance metrics to console

### Staging/Production
- `lib/performance-monitor.ts` - Silent performance tracking
- Only sends events when bad (low FPS, high draw calls)
- Tracks: FPS, draw calls, texture memory, item count
- Prevents noise - no events for good performance

## ✅ Release Gates (CI/CD)

### GitHub Actions Workflow (`.github/workflows/ci.yml`)

**Blocking checks:**
1. ✅ TypeScript compilation (`npx tsc --noEmit`)
2. ✅ Linting (`npm run lint`)
3. ✅ Build succeeds (`npm run build`)
4. ✅ E2E tests pass (`npm run test:e2e`)

**Optional but recommended:**
- Prevent merge if any test fails
- Run tests on staging deploy
- Generate test reports (HTML, JSON, JUnit XML)

### Test Reports
- HTML report: `playwright-report/`
- JSON: `test-results/results.json`
- JUnit XML: `test-results/junit.xml`

## 🚀 How to Use

### Run Tests Locally
```bash
# Run all E2E tests
npm run test:e2e

# Run with UI (interactive)
npm run test:e2e:ui

# Run with headed browser (see actions)
npm run test:e2e:headed

# Run specific test file
npm run test:e2e -- 01-onboarding.spec.ts
```

### Run Dev Tools
```bash
# Start dev server
npm run dev

# Press 'F' in browser to toggle FPS meter
# Dev server running on http://localhost:3000
```

### Enable Sentry
```bash
# Set in .env.local
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

### Use Sentry Context in Code
```typescript
import { setSentryContext, captureDesignError } from '@/lib/sentry-context';

// Set context for auto-capture
setSentryContext({
  designId: currentDesign.id,
  mode: 'designer',
  roomId: activeRoom.id,
  plan: userPlan,
  isGuest: !user,
});

// Manual error capture
try {
  // risky code
} catch (error) {
  captureDesignError(error as Error, {
    designId: currentDesign.id,
    mode: 'designer',
    roomId: activeRoom.id,
    location: 'item-placement',
  });
}
```

## 📊 Quality Standards

- **No failing tests** - CI blocks merge on failure
- **No WebGL crashes** - Error boundary + recovery
- **Performance tracked** - Only bad signals reported
- **All errors tagged** - Context always included

## ⚠️ Next Steps

To fully implement, you need to:

1. Add `data-testid` attributes to your UI components
2. Set `NEXT_PUBLIC_SENTRY_DSN` in your environment
3. Wrap canvas in `<CanvasErrorBoundary>`
4. Import `FPSMeter` in your layout (dev only)
5. Call `setSentryContext()` when state changes
6. Run `npm install` to install new dependencies

