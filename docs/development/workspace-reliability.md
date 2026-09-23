# Workspace Reliability

## Canonical locations

- Application: `/Users/justus/Developer/interior-ai`
- Release evidence: `/Users/justus/Developer/interior-ai-release-evidence`
- RC3 worktree: `/Users/justus/Developer/interior-ai-cabinetry-rc`
- RC4 worktree: `/Users/justus/Developer/interior-ai-cabinetry-rc4`

Do not run the application from `Documents`, iCloud Drive, `CloudStorage`, or
`/private/tmp`. The development preflight rejects cloud-managed project paths
and macOS `dataless` placeholders.

## Fresh setup

```bash
nvm use
npm ci
npm run dev
npm run dev:doctor
```

`npm ci` generates Prisma Client without requiring a live database connection.
Copy required development keys from `.env.example` into private `.env.local`.

## Asset inventory

Create a local SHA-256 inventory after importing or changing catalog assets:

```bash
npm run assets:inventory
npm run assets:inventory -- --verify .local/asset-inventory.json
```

For a release, write the inventory to the release-evidence destination and
review it before committing or signing it:

```bash
npm run assets:inventory -- --output /path/to/release-evidence/asset-inventory.json
```

## External backup

Connect an external or independently synchronized volume, then run:

```bash
npm run backup:workspace -- /Volumes/Backup/interior-ai
```

The backup includes the app, release evidence, and both RC worktrees while
excluding dependencies and generated caches. A backup on the same internal disk
does not protect against disk failure.

Do not remove the former `Documents` workspace until every migration manifest
entry exists in the canonical workspace and the asset inventory has been saved.
