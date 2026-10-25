import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCondoMapIndex, type CondoDevelopmentSummary } from "./condo-map-data";
import { isGitLfsPointer, type CondoMapFilePath } from "./condo-map-paths";

/**
 * The condo map's files on the server (catalog/condo-map, exported from the floor-plan masters). Only the admin page and
 * the admin data route read them, so the developments' plans stay behind the admin check; next.config's tracing entries
 * ship them with those two.
 */
const CONDO_MAP_ROOT = path.join(process.cwd(), "catalog", "condo-map");

export async function readCondoMapFile(file: CondoMapFilePath): Promise<Uint8Array | null> {
  try {
    const bytes = new Uint8Array(await readFile(path.join(CONDO_MAP_ROOT, ...file.segments)));
    // a deployment without Git LFS has the pointer, not the model: "not found" (the map shows the massing instead)
    return isGitLfsPointer(bytes) ? null : bytes;
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return null;
    throw cause;
  }
}

export async function readCondoMapIndex(): Promise<CondoDevelopmentSummary[]> {
  const source = await readFile(path.join(CONDO_MAP_ROOT, "index.json"), "utf8");
  return parseCondoMapIndex(JSON.parse(source));
}
