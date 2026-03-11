export type AssetQualityInput = {
  triangleCount: number | null;
  maxTextureResolution: number | null;
  textureCount: number | null;
  materialCount: number | null;
  hasBaseColorTexture: boolean | null;
  fileSizeBytes: number;
  hasLodHint?: boolean;
};

export type AssetQualityIssue = {
  code: string;
  severity: "warning" | "error";
  message: string;
};

export type AssetQualityResult = {
  score: number;
  issues: AssetQualityIssue[];
};

export const QUALITY_TAG_PREFIX = "[ASSET_QUALITY:";
export const GEOM_HASH_TAG_PREFIX = "[GEOM_HASH:";

export function computeAssetQuality(input: AssetQualityInput): AssetQualityResult {
  let score = 0;
  const issues: AssetQualityIssue[] = [];

  const fileSizeMb = input.fileSizeBytes / (1024 * 1024);

  const triangles = input.triangleCount;
  if (triangles === null) {
    issues.push({
      code: "QUALITY_TRIANGLES_UNKNOWN",
      severity: "warning",
      message: "Triangle count unavailable.",
    });
  } else if (triangles <= 80_000) {
    score += 25;
  } else if (triangles <= 120_000) {
    score += 20;
    issues.push({
      code: "QUALITY_TRIANGLES_ELEVATED",
      severity: "warning",
      message: `Triangle count elevated (${triangles.toLocaleString()}).`,
    });
  } else if (triangles <= 150_000) {
    score += 10;
    issues.push({
      code: "QUALITY_TRIANGLES_HIGH",
      severity: "warning",
      message: `Triangle count high (${triangles.toLocaleString()}).`,
    });
  } else {
    issues.push({
      code: "QUALITY_TRIANGLES_CRITICAL",
      severity: "error",
      message: `Triangle count too high (${triangles.toLocaleString()}).`,
    });
  }

  const maxTex = input.maxTextureResolution;
  if (maxTex === null) {
    issues.push({
      code: "QUALITY_TEXTURE_RES_UNKNOWN",
      severity: "warning",
      message: "Texture resolution unavailable.",
    });
  } else if (maxTex <= 2048) {
    score += 20;
  } else if (maxTex <= 4096) {
    score += 10;
    issues.push({
      code: "QUALITY_TEXTURE_RES_HIGH",
      severity: "warning",
      message: `Texture resolution is high (${maxTex}px).`,
    });
  } else {
    issues.push({
      code: "QUALITY_TEXTURE_RES_CRITICAL",
      severity: "error",
      message: `Texture resolution is oversized (${maxTex}px).`,
    });
  }

  if (fileSizeMb <= 10) {
    score += 20;
  } else if (fileSizeMb <= 20) {
    score += 15;
    issues.push({
      code: "QUALITY_FILESIZE_ELEVATED",
      severity: "warning",
      message: `File size is elevated (${fileSizeMb.toFixed(2)}MB).`,
    });
  } else if (fileSizeMb <= 25) {
    score += 5;
    issues.push({
      code: "QUALITY_FILESIZE_HIGH",
      severity: "warning",
      message: `File size is high (${fileSizeMb.toFixed(2)}MB).`,
    });
  } else {
    issues.push({
      code: "QUALITY_FILESIZE_CRITICAL",
      severity: "error",
      message: `File size is oversized (${fileSizeMb.toFixed(2)}MB).`,
    });
  }

  const textureCount = input.textureCount;
  if (textureCount === null) {
    issues.push({
      code: "QUALITY_TEXTURE_COUNT_UNKNOWN",
      severity: "warning",
      message: "Texture count unavailable.",
    });
  } else if (textureCount <= 8) {
    score += 10;
  } else if (textureCount <= 14) {
    score += 6;
    issues.push({
      code: "QUALITY_TEXTURE_COUNT_HIGH",
      severity: "warning",
      message: `Texture count is high (${textureCount}).`,
    });
  } else {
    issues.push({
      code: "QUALITY_TEXTURE_COUNT_CRITICAL",
      severity: "error",
      message: `Texture count is excessive (${textureCount}).`,
    });
  }

  if (input.hasBaseColorTexture === true) {
    score += 10;
  } else {
    issues.push({
      code: "QUALITY_BASECOLOR_MISSING",
      severity: "warning",
      message: "Base color texture missing.",
    });
  }

  const materialCount = input.materialCount;
  if (materialCount === null) {
    issues.push({
      code: "QUALITY_MATERIAL_COUNT_UNKNOWN",
      severity: "warning",
      message: "Material count unavailable.",
    });
  } else if (materialCount >= 2) {
    score += 10;
  } else {
    score += 4;
    issues.push({
      code: "QUALITY_SINGLE_MATERIAL",
      severity: "warning",
      message: "Single material detected; finish customization may be limited.",
    });
  }

  if (input.hasLodHint) {
    score += 5;
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    issues,
  };
}

export function getTaggedValue(notes: string | null | undefined, prefix: string): string | null {
  if (!notes) return null;
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escapedPrefix}([^\\]]+)\\]`);
  const match = notes.match(re);
  return match?.[1] ?? null;
}

export function upsertTaggedValue(notes: string | null | undefined, prefix: string, value: string): string {
  const current = notes ?? "";
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escapedPrefix}[^\\]]+\\]`, "g");
  const cleaned = current.replace(re, "").trim();
  const tag = `${prefix}${value}]`;
  return cleaned ? `${tag}\n${cleaned}` : tag;
}
