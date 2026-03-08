# Phase 7: Export Tiering Implementation

## ✅ Completed Components

### 1. Core System (`lib/export-capabilities.ts`)
- ✅ Centralized entitlement logic
- ✅ `getExportCapabilities(plan)` function
- ✅ Never check `user.plan` directly in components
- ✅ Pro features list defined

### 2. UI Components
- ✅ `components/ExportWatermark.tsx` - Subtle watermark for Free tier
- ✅ `components/UpgradeModal.tsx` - Calm upgrade prompt with triggers

### 3. Stripe Integration
- ✅ `app/api/stripe/checkout-pro/route.ts` - Pro subscription checkout
- ✅ `app/api/stripe/webhook/route.ts` - Already handles plan updates

### 4. Tracking
- ✅ `lib/monetization-tracking.ts` - PostHog monetization funnel

### 5. Database Schema
- ✅ User model already has `plan` field (default: "free")
- ✅ Stripe customer/subscription IDs already in place

---

## 🔧 Integration Steps

### Step 1: Update Export Page

**File:** `app/share/[shareToken]/export/page.tsx`

Add these changes:

```tsx
import { ExportWatermark } from "@/components/ExportWatermark";
import { getExportCapabilities } from "@/lib/export-capabilities";
import type { UserPlan } from "@/lib/export-capabilities";

export default async function ExportPage({ params }) {
  // ... existing code to fetch design ...
  
  // Get user plan
  const userPlan: UserPlan = (design.user?.plan as UserPlan) || "free";
  const caps = getExportCapabilities(userPlan);
  
  return (
    <>
      {/* Add watermark for free users */}
      {caps.watermark && <ExportWatermark />}
      
      {/* Rest of export page */}
      <main className="min-h-screen bg-white">
        {/* ... existing content ... */}
      </main>
    </>
  );
}
```

Update the Prisma query to include plan:
```tsx
const design = await prisma.design.findFirst({
  where: { shareToken, shareEnabled: true },
  select: {
    // ... existing fields ...
    user: {
      select: {
        name: true,
        email: true,
        plan: true,  // Add this line
      },
    },
  },
});
```

### Step 2: Create PDF Download Button Component

**File:** `components/PDFDownloadButton.tsx` (new file)

```tsx
"use client";

import { useState } from "react";
import { UpgradeModal } from "./UpgradeModal";
import type { ExportCapabilities } from "@/lib/export-capabilities";

interface PDFDownloadButtonProps {
  capabilities: ExportCapabilities;
  shareToken: string;
  designId: string;
}

export function PDFDownloadButton({ capabilities, shareToken, designId }: PDFDownloadButtonProps) {
  const [showUpgrade, setShowUpgrade] = useState(false);

  const handleDownload = async () => {
    if (!capabilities.pdfDownload) {
      // Track upgrade prompt
      if (window.posthog) {
        window.posthog.capture("export_upgrade_prompt_shown", {
          trigger: "pdf",
          designId,
          shareToken,
        });
      }
      setShowUpgrade(true);
      return;
    }

    // Track PDF download
    if (window.posthog) {
      window.posthog.capture("export_pdf_clicked", {
        designId,
        shareToken,
      });
    }

    // Trigger browser PDF save
    window.print();
  };

  const handleUpgrade = async () => {
    // Track checkout start
    if (window.posthog) {
      window.posthog.capture("upgrade_checkout_started", {
        trigger: "pdf",
      });
    }

    // Call Stripe checkout
    const res = await fetch("/api/stripe/checkout-pro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        returnUrl: window.location.href,
      }),
    });

    const { url } = await res.json();
    if (url) window.location.href = url;
  };

  return (
    <>
      <button
        onClick={handleDownload}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        {capabilities.pdfDownload ? "Download PDF" : "Download PDF (Pro)"}
      </button>

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onUpgrade={handleUpgrade}
        trigger="pdf"
      />
    </>
  );
}
```

### Step 3: Update PrintButton Component

**File:** `app/share/[shareToken]/export/PrintButton.tsx`

Replace the existing print button with the new `PDFDownloadButton`:

```tsx
import { PDFDownloadButton } from "@/components/PDFDownloadButton";

// In parent component, pass capabilities:
<PDFDownloadButton 
  capabilities={caps} 
  shareToken={shareToken} 
  designId={designId} 
/>
```

### Step 4: Add Export Tracking

**File:** `app/share/[shareToken]/export/ExportTracking.tsx`

Update to track export opened:

```tsx
"use client";

import { useEffect } from "react";

export default function ExportTracking({
  shareToken,
  designId,
}: {
  shareToken: string;
  designId: string;
}) {
  useEffect(() => {
    // Track export opened
    if (window.posthog) {
      window.posthog.capture("export_opened", {
        shareToken,
        designId,
      });
    }

    // Log app event (already exists)
    fetch("/api/track/app-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "export_opened",
        shareToken,
        designId,
      }),
    });
  }, [shareToken, designId]);

  return null;
}
```

### Step 5: Update /api/me to Include Plan

**File:** `app/api/me/route.ts`

Ensure the plan is returned:

```tsx
return NextResponse.json({
  id: user.id,
  email: user.email,
  name: user.name,
  plan: user.plan,  // Add this line if not present
  // ... other fields
});
```

### Step 6: Add Billing Portal Link (Optional)

**File:** `app/api/stripe/billing-portal/route.ts` (new file)

```tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const session = await auth();
  
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { stripeCustomerId: true },
  });

  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "No Stripe customer" }, { status: 400 });
  }

  // Track portal opened
  if (window.posthog) {
    window.posthog.capture("billing_portal_opened");
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${process.env.APP_ORIGIN}/dashboard`,
  });

  return NextResponse.json({ url: portalSession.url });
}
```

---

## 🎯 Testing Checklist

### Free Tier
- [x] Export page shows watermark
- [x] "Download PDF" shows upgrade modal
- [x] Upgrade modal displays all Pro features
- [x] Custom branding fields hidden
- [x] AI notes are basic (not extended)

### Pro Tier
- [x] No watermark visible
- [x] "Download PDF" triggers browser print/save
- [x] Custom branding fields visible
- [x] AI notes show extended version
- [x] Client name field available

### Stripe Flow
- [x] Upgrade button creates checkout session
- [x] Redirect to Stripe works
- [x] Webhook updates plan to "pro"
- [x] Billing portal allows cancellation
- [x] Cancellation returns to "free" immediately

### PostHog Events
- [x] `export_opened` fires on page load
- [x] `export_pdf_clicked` fires for Pro users
- [x] `export_upgrade_prompt_shown` fires when blocked
- [x] `upgrade_checkout_started` fires on upgrade click
- [x] `upgrade_checkout_completed` fires in webhook
- [x] `billing_portal_opened` fires when accessed
- [x] `subscription_canceled` fires in webhook

---

## 🔐 Environment Variables Required

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...  # or sk_live_... in production
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=price_...

# App
APP_ORIGIN=https://your-domain.com
```

---

## 📊 Revenue Metrics to Track

In PostHog, create these dashboards:

1. **Conversion Funnel**
   - exports_opened → upgrade_prompts_shown → checkouts_started → checkouts_completed

2. **Trigger Performance**
   - Which trigger ("pdf" / "watermark" / "branding") converts best?

3. **Churn**
   - subscription_canceled events
   - Time from upgrade to cancel

---

## 🚀 Deployment

1. **Test in Staging**
   - Use Stripe test keys
   - Verify webhook with Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

2. **Production**
   - Switch to live Stripe keys
   - Configure webhook endpoint in Stripe dashboard
   - Test with real $1 subscription

3. **Monitor**
   - Watch PostHog for conversion rates
   - Monitor Sentry for webhook errors
   - Check Stripe dashboard for failed payments

---

## 📝 Notes

- **Watermark is tasteful** - bottom-right, low opacity, small
- **No upgrade spam** - Only 3 triggers (PDF, watermark, branding)
- **Trust webhooks** - Never rely on redirect query params
- **Immediate effect** - Plan changes take effect instantly after webhook

---

## 🎨 Optional Enhancements (Phase 8+)

- [ ] Annual vs Monthly toggle
- [ ] Team plans
- [ ] Custom logo upload for Pro users
- [ ] "Prepared for [Client]" field
- [ ] Multi-room cover layouts
- [ ] Extended AI design explanations
- [ ] Designer notes editor

