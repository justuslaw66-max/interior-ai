# Stripe Pro testing

The local Pro billing stack is test-mode only. It never writes Stripe secrets to
the repository or `.env.local`; it reads the current Stripe CLI test profile,
validates the two active recurring Pro prices, starts webhook forwarding, and
passes the credentials only to the supervised processes.

## One-time setup

1. Run `stripe login` and approve the test account.
2. Keep `DATABASE_URL` pointed at the local development database.
3. Ensure the Stripe test account has one active product with:
   - SGD 29.90 recurring monthly
   - SGD 249.90 recurring yearly
4. Ensure Stripe Billing Portal has an active test configuration.

The supervisor refuses live Stripe keys, non-local databases, missing prices,
incorrect amounts/cadences, identical Monthly/Yearly IDs, and an occupied port
3000.

## Automated full lifecycle

```sh
npm run dev:stop
npm run test:stripe-pro
npm run test:pro-billing:local
```

The lifecycle test creates disposable local users and Stripe test customers. It
verifies Monthly and Yearly Checkout Sessions, server-controlled prices,
activation, duplicate-subscription blocking, both portal routes, two concurrent
Pro subscriptions, cancellation ordering, webhook idempotency, and unmanaged
price rejection. It then cancels/expires the test objects and removes local test
records.

Stripe retains expired Checkout Session and event history, as expected in test
mode. No charge is created by this automated run.

## Manual hosted Checkout form

```sh
npm run dev:stop
npm run dev:stripe
```

Open `http://localhost:3000`, sign in, and start Monthly or Yearly Pro. Use a
Stripe test card only. Keep the supervisor running until the success page shows
`Pro is active`; it also owns the local webhook listener. Press Ctrl+C when the
manual session is complete.

This local stack does not configure a hosted deployment. Staging/production
still require deployment-specific test/live environment variables and a
persistent Stripe webhook endpoint for `/api/stripe/webhook`.
