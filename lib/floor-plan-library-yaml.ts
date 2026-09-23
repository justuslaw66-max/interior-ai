import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import {
  floorPlanLibraryCatalogSchema,
  type FloorPlanLibraryCatalog,
} from "@/lib/floor-plan-library-schema";

export type FloorPlanLibraryCatalogEntry = FloorPlanLibraryCatalog & {
  file_path: string;
};

let floorPlanLibraryCache:
  | {
      rootDir: string;
      files: string[];
      entries: FloorPlanLibraryCatalogEntry[];
    }
  | null = null;

function findCatalogFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findCatalogFiles(fullPath));
      continue;
    }
    if (entry.name === "catalog.yaml") files.push(fullPath);
  }
  return files.sort();
}

export function getFloorPlanLibraryRoot(): string {
  return path.join(process.cwd(), "catalog", "floor-plans");
}

export function getAllFloorPlanLibraryFiles(
  rootDir = getFloorPlanLibraryRoot()
): string[] {
  if (
    process.env.NODE_ENV === "production" &&
    floorPlanLibraryCache?.rootDir === rootDir
  ) {
    return floorPlanLibraryCache.files;
  }
  return findCatalogFiles(rootDir);
}

export function readFloorPlanLibraryCatalog(
  filePath: string
): FloorPlanLibraryCatalogEntry {
  const parsed = parse(fs.readFileSync(filePath, "utf8"));
  const catalog = floorPlanLibraryCatalogSchema.parse(parsed);
  return { ...catalog, file_path: filePath };
}

function assertUniqueCatalogIds(entries: FloorPlanLibraryCatalogEntry[]) {
  const fileByPlanId = new Map<string, string>();
  for (const entry of entries) {
    const planId = entry.floor_plan.plan_id;
    const existingFile = fileByPlanId.get(planId);
    if (existingFile) {
      throw new Error(
        `Duplicate floor-plan plan_id "${planId}" in ${existingFile} and ${entry.file_path}`
      );
    }
    fileByPlanId.set(planId, entry.file_path);
  }
}

export function getAllFloorPlanLibraryCatalogs(
  rootDir = getFloorPlanLibraryRoot()
): FloorPlanLibraryCatalogEntry[] {
  if (
    process.env.NODE_ENV === "production" &&
    floorPlanLibraryCache?.rootDir === rootDir
  ) {
    return floorPlanLibraryCache.entries;
  }

  const files = findCatalogFiles(rootDir);
  const entries = files.map(readFloorPlanLibraryCatalog);
  assertUniqueCatalogIds(entries);
  floorPlanLibraryCache = { rootDir, files, entries };
  return entries;
}

export function invalidateFloorPlanLibraryCache() {
  floorPlanLibraryCache = null;
}
