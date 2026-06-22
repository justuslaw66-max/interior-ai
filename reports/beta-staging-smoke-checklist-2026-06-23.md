# Beta Staging Smoke Checklist - 2026-06-23

## Purpose

Validate the deployed beta boundary after the local blocker gate passes. This checklist covers environment wiring, auth/session behavior, persisted design fidelity, public share/export rendering, retailer links, and checkout start configuration without completing a real payment.

## Prerequisites

- Deploy target is a staging or preview URL, not production.
- `APP_ENV=staging` or an equivalent preview environment is configured intentionally.
- Staging auth provider, database, Stripe test keys, Shopify/retailer link config, PostHog, and app origin are configured.
- Local release candidate command has passed:

```bash
npm run test:beta-release-candidate
```

## Smoke Path

| Step | Expected result | Evidence |
| --- | --- | --- |
| Open staging `/design` signed out | Beta start/editor shell renders without server errors | URL and screenshot |
| Sign in or create a staging test user | User session is established and `/design` remains usable | Account email and screenshot |
| Start from template | Template applies and shows at least one editable room | Screenshot |
| Add or edit a room in 2D | Room controls update dimensions/material/opening state | Screenshot |
| Place furniture manually | Smart placement guidance appears when placement is blocked, cramped, or improvable | Screenshot |
| Verify smart placement actions | Improve placement, best room/option when available, restore valid spot, and keyboard nudge/rotate/enter behave predictably | Notes and screenshot |
| Fix shopping readiness | Replacement suggestions only show products with valid price and retailer URL | Screenshot |
| Save and reload | Reloaded editor snapshot matches saved state visually and functionally | Screenshot |
| Create and open share link | Public share page renders the exact saved snapshot and shopping readiness | Share URL and screenshot |
| Export PDF | PDF downloads/opens and is non-empty | Filename and screenshot |
| Export shopping CSV | CSV downloads and includes expected headers plus at least one cart-ready row | Filename |
| Export 2D PNG/SVG | Plan artifact downloads and is visually non-empty | Filenames |
| Open retailer link | Retailer click opens with tracking parameters and reaches external retailer page | URL redacted if needed |
| Start checkout boundary | Stripe/checkout start returns a staging/test checkout URL or expected configured boundary response | URL redacted if needed |

## Hard Stops

- Do not complete a real payment in staging unless staging payment credentials and test payment completion are explicitly approved.
- Do not proceed to beta tag if share/export snapshot fidelity diverges from saved editor state.
- Do not proceed if any public catalog product shown in replacement suggestions lacks a positive price and valid retailer URL.
- Do not proceed if checkout start uses live Stripe keys or a production database in staging.

## Signoff Record

- Staging URL:
- Tester:
- Date/time:
- Browser/device:
- Result: `PASS` / `FAIL`
- Blocking issues:
- Follow-up issues:
