# Asset Storage

## Policy

- New `.glb` files are stored through Git LFS.
- Catalog YAML and small web images remain ordinary Git files.
- Generated dependencies and caches never belong in source control.
- Every release candidate must pass `npm run assets:inventory:strict`.
- Supplier imports must be reproducible from a checked-in script and documented source.

The existing Git history contains ordinary Git GLB objects. `.gitattributes`
applies LFS to newly staged GLBs without rewriting that history. Do not run
`git lfs migrate import` on a shared branch; history migration requires a
separate maintenance window and coordinated force-push plan.

## Adding assets

```bash
git lfs install
git add .gitattributes
git add public/assets/models/example.glb
git lfs ls-files
npm run assets:inventory:strict
npm run test:catalog-asset-availability
```

Before committing, confirm the staged GLB is an LFS pointer:

```bash
git check-attr filter -- public/assets/models/example.glb
git show :public/assets/models/example.glb
```

The attribute must report `filter: lfs`, and the staged content must begin with
the Git LFS specification URL rather than binary bytes.

## Draft catalog models

The current asset audit reports 23 missing models, all attached to `draft`
entries in the Auburn, Harper, and Panes families. Keep those entries in draft
until each referenced GLB exists and the availability audit passes without its
corresponding warning. Do not publish placeholder geometry under those IDs.

## Recovery

Gardenia materials and local textures can be regenerated without deleting stale
files:

```bash
npm run import:gardenia-surfaces -- --keep-stale
```

After regeneration, require zero missing and zero-byte files through the strict
inventory and catalog audits before deleting any source snapshot.
