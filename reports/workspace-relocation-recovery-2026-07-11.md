# Workspace Relocation Recovery - 2026-07-11

## Result

- Canonical workspace: `/Users/justus/Developer/interior-ai`
- Original migration manifest entries: 313 missing files
- Recovered with verified nonzero content: 313 files
- Missing migration entries: 0 files
- Zero-byte files under `catalog` or `public`: 0 files
- Local asset inventory: `.local/asset-inventory.json`

The 51 files that File Provider could not deliver directly were regenerated from
the Gardenia supplier source with stale-file preservation and no deletion:

```bash
npm run import:gardenia-surfaces -- --keep-stale
```

The former Documents workspace is no longer required for asset recovery. Keep it
only until the external backup described in the workspace reliability guide has
been completed and reviewed.

## Verification completed

- `npm run prisma:generate`
- `npm run typecheck`
- `npm run assets:inventory:strict`
- `npm run assets:inventory -- --verify .local/asset-inventory.json`
- `npm run test:catalog-asset-availability`
- `npm run test:catalog-audit`
- `npm run build`
- `npm run dev:doctor`
