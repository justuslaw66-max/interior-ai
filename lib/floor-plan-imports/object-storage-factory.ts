import {
  resolveFloorPlanObjectStorageConfig,
  type FloorPlanObjectStorageConfig,
} from "./object-storage-config";
import { S3CompatibleFloorPlanObjectStorage } from "./object-storage-s3";
import type { PrivateFloorPlanObjectStorage } from "./object-storage";

type Environment = Record<string, string | undefined>;

export function createFloorPlanObjectStorage(
  config: FloorPlanObjectStorageConfig
): PrivateFloorPlanObjectStorage | null {
  if (config.provider === "database") return null;
  return new S3CompatibleFloorPlanObjectStorage(config);
}

/**
 * Returns null for the explicit database backend. Selecting S3 is fail-closed:
 * partial or unsafe configuration throws during service construction.
 */
export function createFloorPlanObjectStorageFromEnv(
  env: Environment = process.env
): PrivateFloorPlanObjectStorage | null {
  return createFloorPlanObjectStorage(resolveFloorPlanObjectStorageConfig(env));
}
