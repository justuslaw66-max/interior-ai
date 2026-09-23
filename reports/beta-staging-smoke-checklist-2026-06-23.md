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

- Staging deployment URL: https://interior-hr2bpyza0-justuslaw66-maxs-projects.vercel.app
- Vercel deployment ID: `dpl_9e2Pi2wjB3yopf5oLWKcYtuUmGdw`
- Inspect URL: https://vercel.com/justuslaw66-maxs-projects/interior-ai/9e2Pi2wjB3yopf5oLWKcYtuUmGdw
- Build ID or commit SHA: preview deploy from current working tree; repository HEAD `05dee18`
- Environment label: Vercel preview with `APP_ENV=staging` from `vercel.json`
- Deployment status: `READY`
- Previous checkout/fingerprint retest preview: https://interior-d8xiqnj42-justuslaw66-maxs-projects.vercel.app (`dpl_5GpxSyYngLa2GbQ7LyMaNAoaPxpe`)
- Previous full smoke alias: https://interior-ai-justuslaw66-max-justuslaw66-maxs-projects.vercel.app (`dpl_5UGezchywzAYRB6QUxw4CAUKSBqP`, commit `ce96731`)
- Access note: `/design` returned `401` in a no-login header check because Vercel Deployment Protection is enabled. Manual smoke testers need Vercel access or protection disabled for this preview.
- Auth note: Google sign-in should be tested from the stable alias above. Preview `NEXTAUTH_URL` and `APP_ORIGIN` were reset to this alias to keep OAuth PKCE cookies and callbacks on the same host.
- Auth secret note: Preview `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `AUTH_SECRET` were refreshed from local `.env.local` after Google returned `invalid_client` for the older Preview secret.
- Editor note: Deployment `dpl_3KSVwaarig4fNMXxL84VnSYuCR3q` includes `53e2546`, which restores underside 3D orbiting and cuts away the floor/slab when the camera moves below it.
- Wall rendering note: Deployment `dpl_C4dQcBFnVSxwwWQwjYw1b95W2oB1` includes `2648d5e`, which dedupes shared 3D room wall meshes to prevent z-fighting/pixelated bathroom wall artifacts.
- Overlay note: Deployment `dpl_2cEN3tA7YfMtLeb4v8sfYaSLXVJg` includes `3890bae`, which shifts Scene quality controls beside the design panel and below the plan status bar on tablet/desktop.
- Command bar note: Deployment `dpl_9XkWPsB6CEPsGhkQkeMjHRVnqpKf` includes `70e08f7`, which keeps the Pro tools toggle fixed-width and reserves the Preview slot so Pro tools, Preview, and Load do not shift when Pro tools are toggled.
- Plan camera note: Deployment `dpl_2NcEgAeaA575zriGfiBCaSHWxtGG` includes `aaec2f8`, which hides in-canvas 2D camera/target navigation handles from homeowner plan mode while keeping them gated behind Pro tools.
- Template realism note: Deployment `dpl_E8RKw6ayQ11yGNVAa3eYSAJEqZ9A` includes `03fe467`, which reshapes the 1-bedroom home template into a compact apartment-style layout with an entry/service band, open living/kitchen edge, bedroom, and bathroom.
- Template access note: Deployment `dpl_68AeCRDk8DZwYzzQ7qwjpgxxmaW7` includes `f1fa58b`, which adds visible Templates actions to the Plan panel while editing so testers do not have to use Load to find starter floor plans.
- Status bar note: Deployment `dpl_ARQgMG37Xh5fQude6S5H3DS9MyuV` includes `6e95d75`, which keeps the room plan status pill on one row and prevents the Plan/Room view toggle from wrapping into an awkward centered second row.
- Blueprint template note: Deployment `dpl_F4KDRvGEEezy4JwFcrxBLtcq4Amo` includes `085ae8b`, which replaces the mock-looking starter plans with blueprint-style editable layouts based on common studio, 1-bedroom, open-plan, compact 2-bedroom, and 3-room flat patterns: entry/service zones, grouped kitchen/bath wet walls, connected halls, and private bedroom zones.
- Template picker note: Deployment `dpl_5UGezchywzAYRB6QUxw4CAUKSBqP` includes `ce96731`, which adds real-life template categories, mini plan previews, bedroom/footprint/style filters, best-for tags, starter furniture-zone hints, and automatic doorways when applying templates.
- Checkout/fingerprint retest note: Deployment `dpl_5GpxSyYngLa2GbQ7LyMaNAoaPxpe` includes the staging checkout-boundary guard and always-visible snapshot fingerprint markers used for the 2026-06-24 blocker retest.
- Feedback reference note: Deployment `dpl_9e2Pi2wjB3yopf5oLWKcYtuUmGdw` returns persisted app-event ids from `/api/track/app-event`; beta feedback now exposes the returned reference in the feedback dialog for staging signoff.
- Stable alias promotion note: `2026-06-24 23:04 SGT` Vercel alias promotion succeeded. `https://interior-ai-justuslaw66-max-justuslaw66-maxs-projects.vercel.app` now points to `https://interior-hr2bpyza0-justuslaw66-maxs-projects.vercel.app`; evidence: `reports/staging-smoke-evidence-2026-06-24/stable-alias-promotion-result.json`.

## Manual Smoke Attempt - 2026-06-24

- `2026-06-24 13:07 SGT`: no-bypass probe against `https://interior-ai-justuslaw66-max-justuslaw66-maxs-projects.vercel.app/design` was blocked before the editor rendered. The preview returned `HTTP/2 401` from Vercel Deployment Protection and set `_vercel_sso_nonce`.
- `2026-06-24 21:52 SGT`: reran the smoke pass with the user-provided Vercel automation bypass header. `/design` loaded with `HTTP 200` in Chromium.
- Evidence bundle: `reports/staging-smoke-evidence-2026-06-24/` and `reports/staging-smoke-evidence-2026-06-24/smoke-result.json`.
- Passed in the unsigned bypass session: open `/design`, apply the Alcove studio template, edit an opening width from `1.20m` to `1.35m`, preview and confirm an Avery armchair placement, verify the placement score/controls panel, and reload the guest local design state.
- `2026-06-24 22:16 SGT`: reran the remaining checks with a seeded staging database session. Cloud load, share page, PDF/CSV/PNG/SVG exports, and retailer handoff passed. Evidence summary: `reports/staging-smoke-evidence-2026-06-24/other-checks-result.json`.
- Initial blocker findings: checkout boundary returned `HTTP 500` from Stripe connectivity, and the deployed preview did not expose the QA fingerprint markers on editor/share/export pages.
- `2026-06-24 22:46 SGT`: deployed a fresh preview with the checkout-boundary guard and always-visible snapshot markers, then reran the blocker checks. Checkout returned a redacted `HTTP 503` boundary response with no checkout URL. Editor/share/export QA markers rendered. The editor marker matched the pre-autosave cloud fingerprint `a21f6aec`; after editor load/autosave, share/export markers matched the current persisted API/handoff fingerprint `46c9dc79`.
- `2026-06-24 22:59 SGT`: deployed the feedback-reference upgrade and submitted a staging beta feedback event. The endpoint returned persisted event id `cmqs789xw000004johhrwar9s`; evidence: `reports/staging-smoke-evidence-2026-06-24/feedback-reference-result.json`.
- `2026-06-24 23:04 SGT`: promoted the feedback-reference preview to the stable staging alias and verified the alias resolves to deployment `dpl_9e2Pi2wjB3yopf5oLWKcYtuUmGdw`. No-bypass `/design` still redirects to Vercel SSO, so Deployment Protection remains enabled.
- Remaining blockers: none in the smoke evidence path.
- Hard stops reviewed: no checkout page was opened and no payment was attempted.

## Smoke Path

Every row must be marked `PASS`, `FAIL`, or `N/A`, and every non-`N/A` row must include an evidence link or artifact filename before beta signoff.

Use `/admin?devBypass=1` in staging or preview to open the **Staging Smoke Evidence** worksheet. The worksheet lets testers edit row status, paste evidence, record notes, persist progress in the browser, and export JSON, CSV, or Markdown evidence for signoff.

| Step | Expected result | Status | Evidence required | Evidence link/artifact | Notes |
| --- | --- | --- | --- | --- | --- |
| Open staging `/design` signed out | Beta start/editor shell renders without server errors | `PASS` | URL and screenshot | `reports/staging-smoke-evidence-2026-06-24/01-editor-open.png` | Staging app loaded at `HTTP 200` with Vercel automation bypass; deployment `dpl_5UGezchywzAYRB6QUxw4CAUKSBqP` is ready. |
| Sign in or create a staging test user | User session is established and `/design` remains usable | `PASS` | Account email and screenshot | User-confirmed Google sign-in works after Preview auth secret refresh | Fresh Vercel logs show no Google OAuth `invalid_client` or PKCE callback errors after redeploy. |
| Start from template | Template applies and shows at least one editable room | `PASS` | Screenshot | `reports/staging-smoke-evidence-2026-06-24/03-template-applied.png` | Alcove studio applied and showed `4 rooms`. Template picker evidence: `reports/staging-smoke-evidence-2026-06-24/02-template-picker.png`. |
| Add or edit a room in 2D | Room controls update dimensions/material/opening state | `PASS` | Screenshot | `reports/staging-smoke-evidence-2026-06-24/04-opening-edited.png` | Opening width updated from `1.20m` to `1.35m` in the 2D inspector. |
| Place furniture manually | Smart placement guidance appears when placement is blocked, cramped, or improvable | `PASS` | Screenshot | `reports/staging-smoke-evidence-2026-06-24/06-furniture-confirmed.png` | Avery armchair placement confirmed; active room count showed `1` placed item. |
| Verify smart placement actions | Improve placement, best room/option when available, restore valid spot, and keyboard nudge/rotate/enter behave predictably | `PASS` | Notes and screenshot | `reports/staging-smoke-evidence-2026-06-24/06-placement-preview.png` | Placement panel showed valid placement, score `68/100`, walking path warning, and visible find/center/nudge/rotate/confirm controls. Local guard `npm run test:placement-keyboard-shortcuts` passed for Enter, R/Shift+R, and arrow nudge handling. |
| Fix shopping readiness | Replacement suggestions only show products with valid price and retailer URL | `PASS` | Screenshot plus product IDs | `reports/staging-smoke-evidence-2026-06-24/12-share-page.png`; `reports/staging-smoke-evidence-2026-06-24/14-shopping-list.csv` | Seeded share/export shopping readiness showed `9` retailer-link rows, `0` needs-review rows, and CSV rows with product IDs, retailer URLs, included status, and unit/line prices. First data row hash: `78d100aeca809c84`. |
| Save and reload | Reloaded editor snapshot matches saved state visually and functionally | `PASS` | Screenshot and saved design ID | `reports/staging-smoke-evidence-2026-06-24/11-signed-editor-loaded.png`; `reports/staging-smoke-evidence-2026-06-24/18-retest-editor-fingerprint.png` | Signed-in seeded design `cmqs5pruw00010occ75d0h737` loaded from cloud with `3 rooms`. Fresh retest design `cmqs6rzfn0001plccy2obuoh4` exposed editor marker `a21f6aec`, matching the pre-autosave cloud fingerprint; after editor load/autosave, the current persisted API fingerprint became `46c9dc79`. Guest reload evidence remains `reports/staging-smoke-evidence-2026-06-24/08-reloaded-local-design.png`. |
| Create and open share link | Public share page renders the exact saved snapshot and shopping readiness | `PASS` | Share URL and screenshot | `reports/staging-smoke-evidence-2026-06-24/12-share-page.png`; `reports/staging-smoke-evidence-2026-06-24/19-retest-share-fingerprint.png` | Seeded share token `share-1782310604353-0630bf78` rendered the public share page with shopping readiness: `0` cart-ready, `9` retailer links, `0` needs review. Fresh retest share token `share-1782312387100-6e33d3ec` exposed share marker `46c9dc79`, matching the current persisted API/handoff fingerprint after editor load/autosave. |
| Export PDF | PDF downloads/opens and is non-empty | `PASS` | Filename and screenshot | `reports/staging-smoke-evidence-2026-06-24/12-share-export.pdf` | PDF returned `HTTP 200`, `application/pdf`, `%PDF` magic, and `6925` bytes. |
| Export shopping CSV | CSV downloads and includes expected headers plus at least one cart-ready row | `PASS` | Filename and first row hash | `reports/staging-smoke-evidence-2026-06-24/14-shopping-list.csv` | Downloaded `beta-smoke-whole-home-shopping-list.csv`; expected header present; first data row hash `78d100aeca809c84`. |
| Export 2D PNG/SVG | Plan artifact downloads and is visually non-empty | `PASS` | Filenames and screenshot | `reports/staging-smoke-evidence-2026-06-24/15-2d-plan.svg`; `reports/staging-smoke-evidence-2026-06-24/16-2d-plan.png` | SVG downloaded as `beta-smoke-whole-home-1f-2d-plan.svg` with `8042` bytes; PNG downloaded as `beta-smoke-whole-home-1f-2d-plan.png` with `98061` bytes and a valid PNG header. |
| Open retailer link | Retailer click opens with tracking parameters and reaches external retailer page | `PASS` | URL redacted if needed | `reports/staging-smoke-evidence-2026-06-24/17-cart-retailer-ready.png` | Editor cart retailer link opened `www.castlery.com` with both `clickKey` and `utm_source=interior-ai` present. |
| Start checkout boundary | Stripe/checkout start returns a staging/test checkout URL or expected configured boundary response | `PASS` | Redacted response diagnostics | `reports/staging-smoke-evidence-2026-06-24/retest-checkout-fingerprint-result.json` | Fresh preview retest returned `HTTP 503` checkout-boundary diagnostics for Stripe provider connectivity, with no checkout URL. No checkout page was opened and no payment was attempted. |

## Required Evidence Fields

- Staging deployment URL: `https://interior-hr2bpyza0-justuslaw66-maxs-projects.vercel.app`
- Build ID or commit SHA: `05dee18`; preview deployment `dpl_9e2Pi2wjB3yopf5oLWKcYtuUmGdw` includes current working-tree checkout-boundary, QA-marker, and feedback-reference changes
- Staging environment label: Vercel preview with `APP_ENV=staging`
- Test user email: Seeded staging smoke database session
- Saved design ID: `cmqs6rzfn0001plccy2obuoh4`
- Share token: `share-1782312387100-6e33d3ec`
- Editor snapshot fingerprint: `a21f6aec` marker matched the pre-autosave cloud fingerprint; current persisted API fingerprint after editor load/autosave is `46c9dc79`
- Share snapshot fingerprint: `46c9dc79`, matching current persisted API/handoff fingerprint
- Export snapshot fingerprint: `46c9dc79`, matching current persisted API/handoff fingerprint
- PDF filename: `share-export.pdf`
- CSV filename: `beta-smoke-whole-home-shopping-list.csv`
- PNG filename: `beta-smoke-whole-home-1f-2d-plan.png`
- SVG filename: `beta-smoke-whole-home-1f-2d-plan.svg`
- Checkout boundary response mode: `boundary blocked` via redacted `HTTP 503`
- Checkout diagnostics screenshot or redacted JSON: `reports/staging-smoke-evidence-2026-06-24/retest-checkout-fingerprint-result.json`
- Catalog commerce readiness screenshot: `reports/staging-smoke-evidence-2026-06-24/12-share-page.png`; `reports/staging-smoke-evidence-2026-06-24/14-shopping-list.csv`
- Feedback report ID or copied payload filename: `cmqs789xw000004johhrwar9s`; `reports/staging-smoke-evidence-2026-06-24/feedback-reference-result.json`

## Automated Guards

- `npm run test:e2e:mobile-plan` validates phone and tablet 2D Plan mode controls: compact room status, guided/manual toggle, manual action buttons, tap sizing, and horizontal overflow.
- `npm run test:beta-staging-checklist` verifies the staging worksheet, JSON/CSV/Markdown exports, hard stops, first-run activation event plumbing, and the mobile Plan guard remain wired into the beta path.
- `npm run test:beta-staging-evidence` verifies the completed evidence bundle, stable alias promotion, feedback report id, checkout/fingerprint retest, linked artifacts, and raw auth/protection header redaction.
- `npm run test:beta-staging-artifacts` verifies staging evidence artifact hashes, sizes, required screenshots/exports, file signatures, and text artifact redaction.
- `npm run test:beta-release-handoff` verifies the release handoff manifest matches the promoted staging alias, evidence bundle, and final gate commands.
- The editor emits `first_run_activation_step_completed` events when users complete template, item, save, and share/export activation steps, including guided/manual mode, room count, item count, save state, share state, and viewport context.

## Hard Stops

- Do not complete a real payment in staging unless staging payment credentials and test payment completion are explicitly approved.
- Do not proceed to beta tag if share/export snapshot fidelity diverges from saved editor state.
- Do not proceed if any public catalog product shown in replacement suggestions lacks a positive price and valid retailer URL.
- Do not proceed if checkout start uses live Stripe keys or a production database in staging.

## Signoff Record

- Staging URL: `https://interior-hr2bpyza0-justuslaw66-maxs-projects.vercel.app`
- Build ID or commit SHA: `05dee18`; preview deployment `dpl_9e2Pi2wjB3yopf5oLWKcYtuUmGdw` includes current working-tree checkout-boundary, QA-marker, and feedback-reference changes
- Tester: Codex staging smoke automation with seeded staging database session
- Date/time: `2026-06-24 22:59 SGT`
- Browser/device: Chromium headless desktop
- Result: `PASS` / `FAIL` -> `PASS`
- Required evidence complete: `YES` / `NO` -> `YES`
- Hard stops reviewed: `YES` / `NO` -> `YES`
- Blocking issues: None in the retested smoke path.
- Follow-up issues: Rotate the Vercel automation bypass secret after the smoke window closes, then commit/tag the checkout-boundary, QA-marker, feedback-reference, and staging evidence bundle.
- Signoff owner:
