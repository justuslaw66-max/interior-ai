import { safeGLBResourceHash } from "./createModelDiagnosticSnapshot";
import type { GLBResourceCacheInspection } from "./glbResourceCache";

export type GLBResourceCacheMetadataSnapshot = Omit<
  GLBResourceCacheInspection,
  "entries"
> & {
  entries: Array<
    Omit<GLBResourceCacheInspection["entries"][number], "key"> & {
      resourceHash: string;
    }
  >;
};

export type GLBResourceCachesMetadataSnapshot = {
  parsed: GLBResourceCacheMetadataSnapshot;
  prepared: GLBResourceCacheMetadataSnapshot;
};

export function safeGLBResourceCacheInspection(
  inspection: GLBResourceCacheInspection
): GLBResourceCacheMetadataSnapshot {
  return {
    ...inspection,
    entries: inspection.entries.map(({ key, ...entry }) => ({
      ...entry,
      resourceHash: safeGLBResourceHash(key),
    })),
  };
}
