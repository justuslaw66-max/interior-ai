# Exact-artifact Vercel release workflow

This workflow makes `.vercel/output` the immutable release artifact. It follows
Vercel's Build Output API flow: pull production settings, build once, hash the
output, stage that prebuilt output without assigning production domains, run
Gate A3 against the staged URL, and promote the already-tested deployment.

## Preconditions

- Use a clean, committed candidate checkout with Git LFS assets materialized.
- Configure the linked Vercel project and authenticate the pinned local CLI.
- Provision a dedicated Gate A3 PostgreSQL database. Never point destructive or
  fixture-writing tests at customer or production data.
- Production-environment certification must use production-safe test accounts
  and isolation. If the staged deployment cannot safely run the full Gate A3
  suite, do not certify or promote it.

## Local database

```sh
GATE_A3_DATABASE_URL='postgresql://user@127.0.0.1:5432/interior_ai_gate_a3_rc2' \
  npm run gate:a3:db
```

The provisioner refuses generic database names and remote hosts by default,
creates the database if needed, deploys all Prisma migrations, and verifies the
applied migration count. A dedicated remote test database additionally requires
`GATE_A3_ALLOW_REMOTE_DATABASE=1`.

## Build and stage once

```sh
npm run release:vercel:pull
npm run release:vercel:build
npm run release:vercel:verify
npm run release:vercel:stage
```

`release:vercel:build` writes `.vercel/output` and a sibling manifest at
`.vercel/prebuilt-manifest.json`. The manifest is outside the upload root, so
hashing does not mutate the artifact. Staging verifies the hash and uploads only
that output via `vercel deploy --prebuilt --prod --skip-domain`.

## Certify and promote

Run the full Playwright suite against the HTTPS URL recorded in
`.vercel/staged-deployment.json`, with JSON reporting enabled. Then bind that
passing report to the deployment and artifact:

```sh
PLAYWRIGHT_RELEASE_BASE_URL='https://staged.example.vercel.app' \
PLAYWRIGHT_JSON_OUTPUT_FILE='.vercel/gate-a3-playwright.json' \
  npx playwright test --reporter=json

GATE_A3_CERTIFIED_DEPLOYMENT_URL='https://staged.example.vercel.app' \
GATE_A3_ALLOWED_SKIPPED='0' \
  npm run release:vercel:certify -- .vercel/gate-a3-playwright.json

npm run release:vercel:promote
```

Certification rejects unexpected or flaky tests and requires the exact reviewed
skip count (zero by default). It also verifies that the JSON report metadata
identifies the recorded staged URL. Promotion re-hashes `.vercel/output` and
requires the manifest, staged deployment, and certification to identify the
same artifact and deployment URL. Do not run `vercel deploy` again between
certification and promotion.
