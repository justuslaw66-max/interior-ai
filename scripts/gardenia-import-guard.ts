import fs from "node:fs";
import path from "node:path";

// scripts/import-gardenia-surface-materials.ts rewrites Gardenia's catalogue from the RealityRemod configurator: a
// write run deletes every Gardenia entry (unless --keep-stale) and writes back the ones the configurator lists, with
// their July previews. Entries on tile faces would be reset, and collections the configurator never had (imported
// from ABK's pages) would be deleted. This finds those entries, by collection, so a write run can refuse.
export function findGardeniaEntriesAWriteRunWouldLose(catalogRoot: string) {
  const lost = new Map<string, number>();
  for (const category of ["flooring", "wall_tile"]) {
    const root = path.join(catalogRoot, "surface-materials", category, "gardenia");
    if (!fs.existsSync(root)) continue;
    for (const collection of fs.readdirSync(root, { withFileTypes: true })) {
      if (!collection.isDirectory()) continue;
      for (const entry of fs.readdirSync(path.join(root, collection.name), { withFileTypes: true })) {
        const file = path.join(root, collection.name, entry.name, "catalog.yaml");
        if (!entry.isDirectory() || !fs.existsSync(file)) continue;
        const flags = fs.readFileSync(file, "utf8");
        const onFaces = /^ {4}- physical_scale_faces$/m.test(flags);
        const fromConfigurator = /^ {4}- gardenia_realityremod_import$/m.test(flags);
        if (onFaces || !fromConfigurator) lost.set(collection.name, (lost.get(collection.name) ?? 0) + 1);
      }
    }
  }
  return lost;
}
