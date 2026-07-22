import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { CanonicalProductContract } from "@/lib/canonical-product-contract";
import type { ProductAssetInspection } from "@/lib/product-asset-inspector";
import { buildAssetQaReport } from "@/lib/asset-pipeline/build-qa-report";
import type { AssetPipelineCheck, AssetQaReport } from "@/lib/asset-pipeline/types";

export const PRODUCT_ASSET_VALIDATOR_VERSION = "phase14-v1";

export type ProductAssetValidationInput = {
  item: CatalogItemSchema;
  contract: CanonicalProductContract;
  inspection: ProductAssetInspection;
  thumbnail?: { width: number; height: number; bytes: number } | null;
  browserLoadVerified?: boolean;
  memoryDisposalVerified: boolean;
};

export type ProductAssetValidationReport = {
  productId: string;
  assetId: string;
  modelUrl: string;
  validatorVersion: string;
  checks: AssetPipelineCheck[];
  coverage: Record<
    | "realWorldScale"
    | "origin"
    | "pivot"
    | "orientation"
    | "geometryComplexity"
    | "textureDimensions"
    | "missingTextures"
    | "materials"
    | "boundingBox"
    | "browserLoading"
    | "memoryDisposal"
    | "thumbnailQuality"
    | "licensing"
    | "attribution",
    "pass" | "warning" | "fail"
  >;
  qa: AssetQaReport;
};

function dimensionDeltaRatio(expected: number, actual: number) {
  if (!(expected > 0) || !(actual > 0)) return Number.POSITIVE_INFINITY;
  return Math.abs(expected - actual) / expected;
}

export function validateProductAsset(
  input: ProductAssetValidationInput
): ProductAssetValidationReport {
  const checks: AssetPipelineCheck[] = [];
  const coverage: ProductAssetValidationReport["coverage"] = {
    realWorldScale: "pass",
    origin: "pass",
    pivot: "pass",
    orientation: "pass",
    geometryComplexity: "pass",
    textureDimensions: "pass",
    missingTextures: "pass",
    materials: "pass",
    boundingBox: "pass",
    browserLoading: "pass",
    memoryDisposal: "pass",
    thumbnailQuality: "pass",
    licensing: "pass",
    attribution: "pass",
  };
  const add = (
    field: keyof typeof coverage,
    severity: "error" | "warning",
    code: string,
    message: string,
    details?: string
  ) => {
    checks.push({ severity, code, message, ...(details ? { details } : {}) });
    coverage[field] = severity === "error" ? "fail" : coverage[field] === "fail" ? "fail" : "warning";
  };

  const declared = input.item.dimsMm;
  if (![declared.w, declared.d, declared.h].every((value) => Number.isInteger(value) && value > 0)) {
    add("realWorldScale", "error", "REAL_WORLD_SCALE_INVALID", "Declared dimensions must be positive whole millimetres.");
  }
  const boundsMm = {
    w: input.item.bounds.size.w * 1000,
    d: input.item.bounds.size.d * 1000,
    h: input.item.bounds.size.h * 1000,
  };
  if (
    dimensionDeltaRatio(declared.w, boundsMm.w) > 0.02 ||
    dimensionDeltaRatio(declared.d, boundsMm.d) > 0.02 ||
    dimensionDeltaRatio(declared.h, boundsMm.h) > 0.02
  ) {
    add("boundingBox", "error", "DECLARED_BOUNDS_MISMATCH", "Catalog bounds do not match canonical dimensions within 2%.");
  }

  if (!input.item.pivot.groundAligned) {
    add("origin", "warning", "ORIGIN_NOT_GROUND_ALIGNED", "Asset origin is not declared as floor-aligned.");
  }
  if (
    !Number.isFinite(input.item.pivot.offsetX) ||
    !Number.isFinite(input.item.pivot.offsetZ) ||
    Math.abs(input.item.pivot.offsetX) > input.item.bounds.size.w / 2 ||
    Math.abs(input.item.pivot.offsetZ) > input.item.bounds.size.d / 2
  ) {
    add("pivot", "error", "PIVOT_INVALID", "Pivot offsets must be finite and remain inside the product footprint.");
  }
  if (!Number.isFinite(input.item.defaultRotation)) {
    add("orientation", "error", "ORIENTATION_INVALID", "Default product orientation must be a finite rotation.");
  }

  if (input.inspection.source === "missing" || input.inspection.source === "invalid") {
    add("browserLoading", "error", "MODEL_UNAVAILABLE", "3D model cannot be loaded from its declared URL.", input.inspection.error ?? undefined);
  } else if (input.inspection.source === "remote") {
    add("browserLoading", "warning", "REMOTE_MODEL_NOT_PROBED", "Remote model requires the network availability check and browser smoke test.");
  } else if (!input.inspection.validGlb) {
    add("browserLoading", "error", "GLB_INVALID", "Local model is not a valid GLB 2.0 asset.", input.inspection.error ?? undefined);
  } else if (!input.browserLoadVerified) {
    add("browserLoading", "warning", "BROWSER_LOAD_NOT_PROBED", "Static validation passed; browser loading remains covered by the product-flow smoke test.");
  }

  const geometrySize = input.inspection.geometryBoundsMeters?.size;
  if (geometrySize && geometrySize.every((value) => value > 0)) {
    const expectedMeters = [declared.w / 1000, declared.h / 1000, declared.d / 1000];
    const sortedExpected = [...expectedMeters].sort((left, right) => left - right);
    const sortedActual = [...geometrySize].sort((left, right) => left - right);
    const worstDelta = Math.max(
      ...sortedExpected.map((expected, index) => dimensionDeltaRatio(expected, sortedActual[index]))
    );
    if (worstDelta > 0.35) {
      add("realWorldScale", "warning", "GEOMETRY_SCALE_REVIEW", "Raw mesh bounds differ from declared dimensions by more than 35%; confirm node transforms and normalization.");
    }
    if (input.item.pivot.groundAligned && Math.abs(input.inspection.geometryBoundsMeters!.min[1]) > 0.05) {
      add("origin", "warning", "GEOMETRY_ORIGIN_REVIEW", "Raw mesh floor is more than 5 cm from Y=0; confirm node transforms.");
    }
  } else if (input.inspection.source === "local" && input.inspection.validGlb) {
    add("boundingBox", "warning", "GEOMETRY_BOUNDS_UNKNOWN", "GLB position-accessor bounds are unavailable.");
  }

  const triangles = input.inspection.triangleCount;
  if (triangles === null) {
    add("geometryComplexity", "warning", "TRIANGLE_COUNT_UNKNOWN", "Triangle count is unavailable.");
  } else if (triangles > 150_000) {
    add("geometryComplexity", "error", "TRIANGLE_BUDGET_EXCEEDED", `Triangle count ${triangles.toLocaleString()} exceeds the 150,000 limit.`);
  } else if (triangles > 120_000) {
    add("geometryComplexity", "warning", "TRIANGLE_COUNT_HIGH", `Triangle count ${triangles.toLocaleString()} is above the preferred 120,000 budget.`);
  }

  const textureResolution = input.inspection.maxTextureResolution;
  if ((input.inspection.textureCount ?? 0) > 0 && textureResolution === null) {
    add("textureDimensions", "warning", "TEXTURE_DIMENSIONS_UNKNOWN", "Embedded texture dimensions could not be read.");
  } else if (textureResolution !== null && textureResolution > 4096) {
    add("textureDimensions", "error", "TEXTURE_DIMENSIONS_EXCEEDED", `Texture resolution ${textureResolution}px exceeds 4096px.`);
  } else if (textureResolution !== null && textureResolution > 2048) {
    add("textureDimensions", "warning", "TEXTURE_DIMENSIONS_HIGH", `Texture resolution ${textureResolution}px is above the preferred 2048px budget.`);
  }
  if (input.inspection.missingTextureCount > 0) {
    add("missingTextures", "error", "TEXTURES_MISSING", `${input.inspection.missingTextureCount} referenced texture${input.inspection.missingTextureCount === 1 ? " is" : "s are"} missing.`);
  }
  if (input.inspection.source === "local" && input.inspection.validGlb && input.inspection.materialCount === 0) {
    add("materials", "error", "MATERIALS_MISSING", "GLB contains no materials.");
  }
  if (!input.memoryDisposalVerified) {
    add("memoryDisposal", "error", "MEMORY_DISPOSAL_UNVERIFIED", "Scene renderer does not expose verified geometry, material, and texture disposal.");
  }

  if (!input.thumbnail) {
    add("thumbnailQuality", "warning", "THUMBNAIL_NOT_PROBED", "Thumbnail dimensions require the local or browser asset probe.");
  } else if (input.thumbnail.width < 320 || input.thumbnail.height < 240 || input.thumbnail.bytes === 0) {
    add("thumbnailQuality", "error", "THUMBNAIL_TOO_SMALL", "Thumbnail must be at least 320 x 240 and non-empty.");
  }
  if (input.contract.licensing.status !== "verified") {
    add("licensing", "warning", "LICENSE_UNVERIFIED", "Licensing metadata is present but not verified.");
  }
  if (!input.contract.licensing.attribution) {
    add("attribution", "error", "ATTRIBUTION_MISSING", "Attribution metadata is required.");
  }

  const blockerCodes = checks.filter((check) => check.severity === "error").map((check) => check.code);
  const warningCodes = checks.filter((check) => check.severity === "warning").map((check) => check.code);
  const score = Math.max(0, 100 - blockerCodes.length * 25 - warningCodes.length * 4);

  return {
    productId: input.item.id,
    assetId: input.item.assets.assetId,
    modelUrl: input.item.assets.modelUrl,
    validatorVersion: PRODUCT_ASSET_VALIDATOR_VERSION,
    checks,
    coverage,
    qa: buildAssetQaReport({
      score,
      blockers: blockerCodes,
      warnings: warningCodes,
      metrics: {
        fileSizeBytes: input.inspection.fileSizeBytes,
        triangleCount: input.inspection.triangleCount,
        textureCount: input.inspection.textureCount,
        maxTextureSize: input.inspection.maxTextureResolution,
      },
    }),
  };
}
