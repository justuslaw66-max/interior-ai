# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into your Interior AI Next.js application. This integration adds comprehensive server-side analytics tracking across all critical business flows including design creation, checkout conversion, referral growth, and affiliate tracking. The setup includes both client-side (posthog-js) and server-side (posthog-node) tracking to ensure accurate event capture across your entire application.

## Events Implemented

| Event Name | Description | File Path |
|------------|-------------|-----------|
| `ai_layout_generated` | Tracks when AI generates a room layout with style, budget, and seed parameters | `app/api/ai/layout/route.ts` |
| `design_created` | Server-side conversion event when a new design is saved to database | `app/api/designs/route.ts` |
| `design_deleted` | Tracks design deletion for churn analysis | `app/api/designs/[id]/route.ts` |
| `design_duplicated` | Tracks design duplication as an engagement metric | `app/api/designs/[id]/duplicate/route.ts` |
| `checkout_initiated` | Critical conversion event when Shopify checkout cart is created | `app/api/shopify/checkout/route.ts` |
| `order_confirmed` | Revenue event when an order is confirmed and stored | `app/api/shopify/confirm/route.ts` |
| `referral_code_claimed` | Viral growth event when a user applies a referral code | `app/api/referral/claim/route.ts` |
| `product_clicked` | Server-side affiliate click tracking for accurate attribution | `app/api/track/click/route.ts` |
| `share_link_enabled` | Viral growth event when share is enabled for a design | `app/api/designs/[id]/share/route.ts` |

## Files Created/Modified

### New Files
- `lib/posthog-server.ts` - Server-side PostHog client singleton for Node.js tracking

### Modified Files
- `app/providers/PostHogProvider.tsx` - Updated with exception capture and PostHogProvider wrapper
- `app/api/ai/layout/route.ts` - Added `ai_layout_generated` event
- `app/api/designs/route.ts` - Added `design_created` event
- `app/api/designs/[id]/route.ts` - Added `design_deleted` event
- `app/api/designs/[id]/duplicate/route.ts` - Added `design_duplicated` event
- `app/api/designs/[id]/share/route.ts` - Added `share_link_enabled` event
- `app/api/shopify/checkout/route.ts` - Added `checkout_initiated` event
- `app/api/shopify/confirm/route.ts` - Added `order_confirmed` event
- `app/api/referral/claim/route.ts` - Added `referral_code_claimed` event
- `app/api/track/click/route.ts` - Added `product_clicked` event

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

### Dashboard
- **Analytics basics**: [https://us.posthog.com/project/316090/dashboard/1285772](https://us.posthog.com/project/316090/dashboard/1285772)

### Insights
- **Checkout Conversion Funnel**: [https://us.posthog.com/project/316090/insights/k8rfhuKT](https://us.posthog.com/project/316090/insights/k8rfhuKT) - Funnel from design creation to order confirmation
- **Design Activity Trend**: [https://us.posthog.com/project/316090/insights/D1J15kFp](https://us.posthog.com/project/316090/insights/D1J15kFp) - Daily trend of design creation, deletion, and duplication
- **Product Clicks by Retailer**: [https://us.posthog.com/project/316090/insights/12ybeg8Y](https://us.posthog.com/project/316090/insights/12ybeg8Y) - Affiliate product clicks broken down by retailer
- **AI Layout Generation Usage**: [https://us.posthog.com/project/316090/insights/syBnGToo](https://us.posthog.com/project/316090/insights/syBnGToo) - AI layout generation by style preferences
- **Referral & Viral Growth**: [https://us.posthog.com/project/316090/insights/mhaEJeBV](https://us.posthog.com/project/316090/insights/mhaEJeBV) - Referral code claims and share link enables

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/posthog-integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
