import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { SurfaceMaterial } from "./surface-material-schema";

export type SurfaceMaterialYamlEntry = SurfaceMaterial & {
  file_path: string;
};

function findSurfaceMaterialFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findSurfaceMaterialFiles(fullPath));
      continue;
    }
    if (entry.name === "catalog.yaml") {
      files.push(fullPath);
    }
  }

  return files.sort();
}

export function getSurfaceMaterialCatalogRoot(): string {
  return path.join(process.cwd(), "catalog", "surface-materials");
}

export function getAllSurfaceMaterialFiles(rootDir = getSurfaceMaterialCatalogRoot()): string[] {
  return findSurfaceMaterialFiles(rootDir);
}

export function readSurfaceMaterialYamlFile(filePath: string): SurfaceMaterialYamlEntry {
  const parsed = parse(fs.readFileSync(filePath, "utf8")) as SurfaceMaterial;
  return {
    ...parsed,
    file_path: filePath,
  };
}

export function getAllSurfaceMaterialYamlEntries(
  rootDir = getSurfaceMaterialCatalogRoot()
): SurfaceMaterialYamlEntry[] {
  return getAllSurfaceMaterialFiles(rootDir).map(readSurfaceMaterialYamlFile);
}
