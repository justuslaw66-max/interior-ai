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

## Latest Preview Deployment

- Staging deployment URL: https://interior-ai-justuslaw66-max-justuslaw66-maxs-projects.vercel.app
- Vercel deployment ID: `dpl_JBSJ9jQ5jGhDWvjcjd4CTiA3xAYz`
- Inspect URL: https://vercel.com/justuslaw66-maxs-projects/interior-ai/JBSJ9jQ5jGhDWvjcjd4CTiA3xAYz
- Build ID or commit SHA: `d98ef4e`
- Environment label: Vercel preview with `APP_ENV=staging` from `vercel.json`
- Deployment status: `READY`
- Access note: `/design` returned `401` in a no-login header check because Vercel Deployment Protection is enabled. Manual smoke testers need Vercel access or protection disabled for this preview.
- Auth note: Google sign-in should be tested from the stable alias above. Preview `NEXTAUTH_URL` and `APP_ORIGIN` were reset to this alias to keep OAuth PKCE cookies and callbacks on the same host.
- Auth secret note: Preview `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `AUTH_SECRET` were refreshed from local `.env.local` after Google returned `invalid_client` for the older Preview secret.

## Smoke Path

Every row must be marked `PASS`, `FAIL`, or `N/A`, and every non-`N/A` row must include an evidence link or artifact filename before beta signoff.

| Step | Expected result | Status | Evidence required | Evidence link/artifact | Notes |
| --- | --- | --- | --- | --- | --- |
| Open staging `/design` signed out | Beta start/editor shell renders without server errors | `TODO` | URL and screenshot |  |  |
| Sign in or create a staging test user | User session is established and `/design` remains usable | `TODO` | Account email and screenshot |  |  |
| Start from template | Template applies and shows at least one editable room | `TODO` | Screenshot |  |  |
| Add or edit a room in 2D | Room controls update dimensions/material/opening state | `TODO` | Screenshot |  |  |
| Place furniture manually | Smart placement guidance appears when placement is blocked, cramped, or improvable | `TODO` | Screenshot |  |  |
| Verify smart placement actions | Improve placement, best room/option when available, restore valid spot, and keyboard nudge/rotate/enter behave predictably | `TODO` | Notes and screenshot |  |  |
| Fix shopping readiness | Replacement suggestions only show products with valid price and retailer URL | `TODO` | Screenshot plus product IDs |  |  |
| Save and reload | Reloaded editor snapshot matches saved state visually and functionally | `TODO` | Screenshot and saved design ID |  |  |
| Create and open share link | Public share page renders the exact saved snapshot and shopping readiness | `TODO` | Share URL and screenshot |  |  |
| Export PDF | PDF downloads/opens and is non-empty | `TODO` | Filename and screenshot |  |  |
| Export shopping CSV | CSV downloads and includes expected headers plus at least one cart-ready row | `TODO` | Filename and first row hash |  |  |
| Export 2D PNG/SVG | Plan artifact downloads and is visually non-empty | `TODO` | Filenames and screenshot |  |  |
| Open retailer link | Retailer click opens with tracking parameters and reaches external retailer page | `TODO` | URL redacted if needed |  |  |
| Start checkout boundary | Stripe/checkout start returns a staging/test checkout URL or expected configured boundary response | `TODO` | Redacted response diagnostics |  |  |

## Required Evidence Fields

- Staging deployment URL:
- Build ID or commit SHA:
- Staging environment label:
- Test user email:
- Saved design ID:
- Share token:
- Editor snapshot fingerprint:
- Share snapshot fingerprint:
- Export snapshot fingerprint:
- PDF filename:
- CSV filename:
- PNG filename:
- SVG filename:
- Checkout boundary response mode: `test checkout URL` / `boundary blocked` / `checkout disabled`
- Checkout diagnostics screenshot or redacted JSON:
- Catalog commerce readiness screenshot:
- Feedback report ID or copied payload filename:

## Hard Stops

- Do not complete a real payment in staging unless staging payment credentials and test payment completion are explicitly approved.
- Do not proceed to beta tag if share/export snapshot fidelity diverges from saved editor state.
- Do not proceed if any public catalog product shown in replacement suggestions lacks a positive price and valid retailer URL.
- Do not proceed if checkout start uses live Stripe keys or a production database in staging.

## Signoff Record

- Staging URL:
- Build ID or commit SHA:
- Tester:
- Date/time:
- Browser/device:
- Result: `PASS` / `FAIL`
- Required evidence complete: `YES` / `NO`
- Hard stops reviewed: `YES` / `NO`
- Blocking issues:
- Follow-up issues:
- Signoff owner:
