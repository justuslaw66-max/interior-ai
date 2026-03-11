// scripts/import-model.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { resolveImportQaLimits, type ImportQaLimits } from "../lib/importQaPolicy";
import { validateVariantForPublish } from "../lib/finish-taxonomy";
import {
  computeAssetQuality,
  GEOM_HASH_TAG_PREFIX,
  QUALITY_TAG_PREFIX,
  upsertTaggedValue,
} from "../lib/assetQuality";
import { createImportJob } from "../lib/import-jobs/create-import-job";
import { updateImportJobStatus } from "../lib/import-jobs/update-import-job-status";
import { buildImportJobReport } from "../lib/import-jobs/build-import-job-report";
import { buildAssetQaReport } from "../lib/asset-pipeline/build-qa-report";
import { normalizeModel } from "../lib/asset-pipeline/normalize";
import { optimizeModel } from "../lib/asset-pipeline/optimize";
import { extractModelMetadata } from "../lib/asset-pipeline/extract-metadata";
import {
  createPngPlaceholder,
  generateModelThumbnail,
} from "../lib/asset-pipeline/generate-thumbnail";
import type {
  AssetPipelineCheck as ImportCheck,
  ModelInspectStats as InspectStats,
} from "../lib/asset-pipeline/types";

type ImportInput = {
  srcGlbPath: string;         // local file path
  assetId?: string;           // optional; else derived
  importJobId?: string;       // optional existing job id
  uploadedByUserId?: string;  // optional uploader context
  qaReportPath?: string;      // optional; override default report output path
  category?: "sofa" | "decor" | "chair" | "table" | string;
  dimsMm?: { w: number; d: number; h: number }; // optional fallback
  aabb?: {
    size: { x: number; y: number; z: number };
    center: { x: number; y: number; z: number };
  }; // optional fallback
  approved?: boolean;
  catalogItemId?: string;
  brandName?: string;
  optimizeModel?: boolean;
  generateThumbnail?: boolean;
  generateHeroThumbnail?: boolean;
  supplierFinishes?: Array<{
    sourceLabel: string;
    sourceCode?: string;
    materialFamily?: string;
    notes?: string;
  }>;
  // Optional finish mappings for strict import workflows.
  finishMappings?: Array<{
    id?: string;
    component?: string;
    brandFinishId?: string;
    brandFinishLabel?: string;
    normalizedFinishId?: string;
    presentationLabel?: string;
    facets?: {
      materialFamily?: string;
      colorFamily?: string;
      tone?: string;
      surface?: string;
      pattern?: string;
    };
  }>;
};

type ImportQAResult = {
  stats: InspectStats;
  checks: ImportCheck[];
};

type ImportQAReport = {
  timestamp: string;
  status: "passed" | "failed";
  assetId: string;
  srcGlbPath: string;
  imported: boolean;
  limits: ImportQaLimits;
  stats: InspectStats;
  checks: ImportCheck[];
  errorCount: number;
  warningCount: number;
  failureReason?: string;
  modelUrl?: string;
  thumbUrl?: string;
};

const CATEGORY_FILE_SIZE_WARN_MB: Record<string, number> = {
  sofa: 25,
  decor: 5,
  chair: 12,
  table: 15,
};

function hashFile(filepath: string) {
  const buf = fs.readFileSync(filepath);
  return crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)}MB`;
}

function runImportQA(glbPath: string, input: ImportInput, limits: ImportQaLimits): ImportQAResult {
  const checks: ImportCheck[] = [];
  const requireFinishMappings = process.env.IMPORT_QA_REQUIRE_FINISH_MAPPING === "true";
  const strictInStaging = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "preview";

  const stat = fs.statSync(glbPath);
  if (stat.size > limits.maxFileSizeBytes) {
    checks.push({
      severity: "error",
      code: "FILE_TOO_LARGE",
      message: `GLB file size exceeds limit (${formatBytes(stat.size)} > ${formatBytes(limits.maxFileSizeBytes)}).`,
      details: "Reduce texture sizes, mesh complexity, or compress the model before import.",
    });
  }

  if (input.category) {
    const normalizedCategory = input.category.trim().toLowerCase();
    const warnCapMb = CATEGORY_FILE_SIZE_WARN_MB[normalizedCategory];
    if (warnCapMb) {
      const warnCapBytes = warnCapMb * 1024 * 1024;
      if (stat.size > warnCapBytes) {
        checks.push({
          severity: "warning",
          code: "CATEGORY_FILESIZE_WARN",
          message: `GLB size exceeds suggested ${normalizedCategory} cap (${formatBytes(stat.size)} > ${warnCapMb}MB).`,
          details: "Consider reducing mesh complexity or texture footprint before approval.",
        });
      }
    }
  }

  if (!input.dimsMm && !input.aabb) {
    checks.push({
      severity: "error",
      code: "MISSING_BOUNDS",
      message: "Import requires geometry bounds metadata (dimsMm or aabb).",
      details: "Provide dimsMm or aabb in the import JSON so scale and placement are verifiable.",
    });
  }

  if (requireFinishMappings) {
    if (!input.catalogItemId) {
      checks.push({
        severity: strictInStaging ? "error" : "warning",
        code: "FINISH_MISSING_CATALOG_ITEM",
        message: "catalogItemId is required when finish mapping gate is enabled.",
      });
    }

    if (!input.brandName || !input.brandName.trim()) {
      checks.push({
        severity: strictInStaging ? "error" : "warning",
        code: "FINISH_MISSING_BRAND_NAME",
        message: "brandName should be provided for supplier finish ingestion.",
      });
    }

    const supplierFinishes = input.supplierFinishes ?? [];
    if (supplierFinishes.length === 0) {
      checks.push({
        severity: strictInStaging ? "error" : "warning",
        code: "FINISH_MISSING_SUPPLIER_FINISHES",
        message: "supplierFinishes are missing while finish mapping gate is enabled.",
      });
    }

    const pseudoVariant = {
      id: input.assetId || path.basename(glbPath, path.extname(glbPath)),
      finishMappings: input.finishMappings ?? [],
    } as Record<string, unknown>;
    const finishErrors = validateVariantForPublish(pseudoVariant);

    for (const error of finishErrors) {
      checks.push({
        severity: "error",
        code: `FINISH_${error.code}`,
        message: error.message,
        details: error.variantId
          ? `variant=${error.variantId}${error.mappingId ? ` mapping=${error.mappingId}` : ""}`
          : undefined,
      });
    }
  }

  const metadata = extractModelMetadata(glbPath, limits);
  const stats: InspectStats = metadata.stats;
  checks.push(...metadata.checks);

  if (metadata.inspectError) {
    console.warn(`[import:model] glTF inspect unavailable; skipping mesh/material checks. reason=${metadata.inspectError}`);
  }

  if ((stats.materialCount ?? 0) <= 1) {
    checks.push({
      severity: "warning",
      code: "SINGLE_MATERIAL",
      message: "Single material detected. Selective upholstery/wood controls may not work as expected.",
      details: "Split materials in Blender (e.g., Fabric vs OakLegs) before export.",
    });
  }

  if (stats.hasBaseColorTexture === false) {
    checks.push({
      severity: "error",
      code: "MISSING_BASECOLOR_TEXTURE",
      message: "No base color texture detected in material slots.",
      details: "Ensure at least one material includes baseColorTexture before import.",
    });
  }

  return { stats, checks };
}

function checkBoundsScale(
  input: ImportInput,
  aabb: { size: { x: number; y: number; z: number } },
  limits: ImportQaLimits
): ImportCheck[] {
  const checks: ImportCheck[] = [];
  const axes = [aabb.size.x, aabb.size.y, aabb.size.z];

  const hasInvalidAxis = axes.some((axis) => !Number.isFinite(axis) || axis <= 0);
  if (hasInvalidAxis) {
    checks.push({
      severity: "error",
      code: "INVALID_AABB",
      message: "AABB size contains invalid axis values.",
      details: `Received: x=${aabb.size.x}, y=${aabb.size.y}, z=${aabb.size.z}`,
    });
    return checks;
  }

  const isSuspicious = axes.some(
    (axis) => axis < limits.minAabbAxisMeters || axis > limits.maxAabbAxisMeters
  );

  if (isSuspicious) {
    checks.push({
      severity: "warning",
      code: "SUSPICIOUS_SCALE",
      message: "AABB scale appears unusual for furniture.",
      details: `Expected each axis in [${limits.minAabbAxisMeters}, ${limits.maxAabbAxisMeters}]m, got x=${aabb.size.x.toFixed(3)}, y=${aabb.size.y.toFixed(3)}, z=${aabb.size.z.toFixed(3)}.`,
    });
  }

  if (input.dimsMm) {
    const dims = [input.dimsMm.w, input.dimsMm.d, input.dimsMm.h];
    const hasBadDims = dims.some((v) => !Number.isFinite(v) || v <= 0);
    if (hasBadDims) {
      checks.push({
        severity: "error",
        code: "INVALID_DIMS",
        message: "dimsMm contains invalid values.",
      });
    }
  }

  return checks;
}

function printQASummary(result: ImportQAResult) {
  const { stats, checks } = result;
  console.log("\n📋 Import QA Summary");
  console.log(`   materials=${stats.materialCount ?? "n/a"}`);
  console.log(`   triangles=${stats.triangleCount ?? "n/a"}`);
  console.log(`   textures=${stats.textureCount ?? "n/a"}`);
  console.log(`   maxTextureResolution=${stats.maxTextureResolution ?? "n/a"}`);

  if (checks.length === 0) {
    console.log("   checks=0 (all clear)");
    return;
  }

  for (const check of checks) {
    const icon = check.severity === "error" ? "❌" : "⚠️";
    console.log(`   ${icon} [${check.code}] ${check.message}`);
    if (check.details) console.log(`      ${check.details}`);
  }
}

function makeDefaultReportPath(assetId: string): string {
  const reportDir = process.env.IMPORT_QA_REPORT_DIR?.trim() || "reports/import-qa";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.resolve(reportDir, `${assetId}-${stamp}.json`);
}

function writeQAReport(report: ImportQAReport, overridePath?: string): string {
  const outPath = path.resolve(overridePath || makeDefaultReportPath(report.assetId));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  return outPath;
}

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) throw new Error("Usage: ts-node scripts/import-model.ts <import.json>");

  const absJson = path.resolve(jsonPath);
  const raw = fs.readFileSync(absJson, "utf8");
  const input: ImportInput = JSON.parse(raw);
  const limits = resolveImportQaLimits();

  const src = path.resolve(input.srcGlbPath);
  if (!fs.existsSync(src)) throw new Error(`Missing srcGlbPath: ${src}`);
  const fileHash = hashFile(src);
  const assetId = input.assetId ?? `asset_${fileHash}`;
  const sourceFileName = path.basename(src);
  const optimizeEnabled = input.optimizeModel ?? process.env.IMPORT_OPTIMIZE_MODEL !== "false";
  const generateThumbEnabled = input.generateThumbnail ?? process.env.IMPORT_GENERATE_THUMBNAIL !== "false";
  const generateHeroThumbEnabled =
    input.generateHeroThumbnail ?? process.env.IMPORT_GENERATE_HERO_THUMB === "true";

  let importJobId = input.importJobId;
  if (!importJobId) {
    const createdJob = await createImportJob({
      sourceFileName,
      sourceFileUrl: src,
      sourceBrand: input.brandName,
      uploadedByUserId: input.uploadedByUserId,
      notes: `Import initiated for asset ${assetId}`,
      rawMetadataJson: { inputPath: absJson, requestedAssetId: input.assetId ?? null },
    });
    importJobId = createdJob.id;
  }

  // Fallback geometry if not computed yet
  const dims = input.dimsMm ?? { w: 2000, d: 900, h: 800 };
  const aabb = input.aabb ?? {
    size: { x: dims.w / 1000, y: dims.h / 1000, z: dims.d / 1000 }, // if your scene units are meters
    center: { x: 0, y: (dims.h / 1000) / 2, z: 0 },
  };

  const pipelineWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), `import-pipeline-${assetId}-`));
  let terminalImportStatusSet = false;
  let normalizedInputPath = src;
  let optimizedInputPath = src;

  const setImportStatus = async (
    status: "received" | "normalizing" | "optimized" | "preview_generated" | "metadata_extracted" | "needs_mapping" | "needs_review" | "approved" | "published" | "failed",
    extra?: {
      errorMessage?: string | null;
      notes?: string | null;
      qaReportUrl?: string;
      thumbnailUrl?: string;
      normalizedFileUrl?: string;
      optimizedFileUrl?: string;
      report?: ReturnType<typeof buildImportJobReport>;
      rawMetadataJson?: unknown;
    }
  ) => {
    if (!importJobId) return;
    await updateImportJobStatus({
      id: importJobId,
      to: status,
      errorMessage: extra?.errorMessage,
      notes: extra?.notes,
      normalizedAssetId: status === "needs_mapping" ? assetId : undefined,
      report: extra?.report,
      rawMetadataJson: extra?.rawMetadataJson,
      derivatives: {
        rawFileUrl: src,
        normalizedFileUrl: extra?.normalizedFileUrl,
        optimizedFileUrl: extra?.optimizedFileUrl,
        thumbnailUrl: extra?.thumbnailUrl,
        qaReportUrl: extra?.qaReportUrl,
      },
    });
  };

  try {
  await setImportStatus("normalizing", {
    notes: optimizeEnabled ? "Running normalization + optimization pipeline." : "Running normalization + QA/metadata extraction.",
  });

  let qa: ImportQAResult;
  const pipelineWarnings: ImportCheck[] = [];

  const normalization = normalizeModel(src, pipelineWorkDir);
  normalizedInputPath = normalization.normalizedPath;

  if (normalization.usedFallback) {
    pipelineWarnings.push({
      severity: "warning",
      code: "PIPELINE_NORMALIZE_FALLBACK",
      message: normalization.details,
    });
  }

  if (optimizeEnabled) {
    const pipeline = optimizeModel(normalizedInputPath, pipelineWorkDir, limits);
    optimizedInputPath = pipeline.optimizedPath;
    for (const step of pipeline.steps) {
      if (!step.success) {
        const availabilityLabel = step.toolUnavailable ? "tool unavailable" : "step failed";
        console.warn(`[import:model] ${step.step} ${availabilityLabel}; ${step.details}`);
        const severity: ImportCheck["severity"] = step.step === "validate" ? "error" : "warning";
        if (severity === "error") {
          qa = {
            stats: {
              materialCount: null,
              triangleCount: null,
              textureCount: null,
              maxTextureResolution: null,
              hasBaseColorTexture: null,
            },
            checks: [
              {
                severity,
                code: "GLB_VALIDATION_FAILED",
                message: "GLB validation failed during import pipeline.",
                details: step.details,
              },
            ],
          };

          const reportPath = writeQAReport(
            {
              timestamp: new Date().toISOString(),
              status: "failed",
              assetId,
              srcGlbPath: normalizedInputPath,
              imported: false,
              limits,
              stats: qa.stats,
              checks: qa.checks,
              errorCount: 1,
              warningCount: 0,
              failureReason: "Import blocked by failed GLB validation.",
            },
            input.qaReportPath
          );
          await setImportStatus("failed", {
            errorMessage: "Import blocked by failed GLB validation.",
            notes: "Validation failed in optimization pipeline.",
            qaReportUrl: reportPath,
            normalizedFileUrl: normalizedInputPath,
            report: buildImportJobReport(qa.checks, {
              fileSizeBytes: fs.statSync(normalizedInputPath).size,
            }),
          });
          terminalImportStatusSet = true;
          console.log(`🧾 QA report written: ${reportPath}`);
          throw new Error("Import blocked: GLB validation failed.");
        }

        pipelineWarnings.push({
          severity: "warning",
          code: `PIPELINE_${step.step.toUpperCase()}_SKIPPED`,
          message: step.details,
        });
      }
    }
  } else {
    optimizedInputPath = normalizedInputPath;
  }

  await setImportStatus("optimized", {
    notes: optimizeEnabled ? "Optimization stage complete." : "Optimization skipped by configuration.",
    normalizedFileUrl: normalizedInputPath,
    optimizedFileUrl: optimizedInputPath,
  });

  qa = runImportQA(optimizedInputPath, input, limits);
  qa.checks.push(...pipelineWarnings);
  qa.checks.push(...checkBoundsScale(input, aabb, limits));

  if (optimizeEnabled && optimizedInputPath !== normalizedInputPath) {
    qa.checks.push({
      severity: "warning",
      code: "PIPELINE_OPTIMIZATION_APPLIED",
      message: "Model optimization pipeline applied before import.",
      details: path.basename(optimizedInputPath),
    });
  }

  const optimizedStat = fs.statSync(optimizedInputPath);
  const quality = computeAssetQuality({
    triangleCount: qa.stats.triangleCount,
    maxTextureResolution: qa.stats.maxTextureResolution,
    textureCount: qa.stats.textureCount,
    materialCount: qa.stats.materialCount,
    hasBaseColorTexture: qa.stats.hasBaseColorTexture,
    fileSizeBytes: optimizedStat.size,
    hasLodHint: /lod/i.test(assetId),
  });

  for (const issue of quality.issues) {
    qa.checks.push({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
    });
  }

  if (quality.score < 60) {
    qa.checks.push({
      severity: "warning",
      code: "QUALITY_SCORE_LOW",
      message: `Asset quality score is low (${quality.score}/100).`,
      details: "Investigate mesh complexity, texture footprint, and material setup before approval.",
    });
  }

  const machineQaReportEarly = buildAssetQaReport({
    score: quality.score,
    blockers: qa.checks
      .filter((c) => c.severity === "error")
      .map((c) => `[${c.code}] ${c.message}`),
    warnings: qa.checks
      .filter((c) => c.severity === "warning")
      .map((c) => `[${c.code}] ${c.message}`),
    metrics: {
      fileSizeBytes: optimizedStat.size,
      triangleCount: qa.stats.triangleCount,
      textureCount: qa.stats.textureCount,
      maxTextureSize: qa.stats.maxTextureResolution,
    },
  });

  printQASummary(qa);

  const qaErrors = qa.checks.filter((c) => c.severity === "error");
  const qaWarnings = qa.checks.filter((c) => c.severity === "warning");
  const machineQaReport = buildAssetQaReport({
    score: quality.score,
    blockers: qaErrors.map((c) => `[${c.code}] ${c.message}`),
    warnings: qaWarnings.map((c) => `[${c.code}] ${c.message}`),
    metrics: {
      fileSizeBytes: optimizedStat.size,
      triangleCount: qa.stats.triangleCount,
      textureCount: qa.stats.textureCount,
      maxTextureSize: qa.stats.maxTextureResolution,
    },
  });

  const reportBase = {
    timestamp: new Date().toISOString(),
    assetId,
    srcGlbPath: optimizedInputPath,
    limits,
    stats: qa.stats,
    checks: qa.checks,
    errorCount: qaErrors.length,
    warningCount: qaWarnings.length,
  };

  if (qaErrors.length > 0) {
    const reportPath = writeQAReport(
      {
        ...reportBase,
        status: "failed",
        imported: false,
        failureReason: `Import blocked by ${qaErrors.length} QA error(s).`,
      },
      input.qaReportPath
    );

    await setImportStatus("needs_review", {
      errorMessage: `Import blocked by ${qaErrors.length} QA error(s).`,
      notes: "QA blockers require staff review before mapping.",
      qaReportUrl: reportPath,
      normalizedFileUrl: normalizedInputPath,
      optimizedFileUrl: optimizedInputPath,
      report: buildImportJobReport(qa.checks, {
        fileSizeBytes: optimizedStat.size,
        triangleCount: qa.stats.triangleCount,
        textureCount: qa.stats.textureCount,
        maxTextureSize: qa.stats.maxTextureResolution,
      }),
      rawMetadataJson: {
        stats: qa.stats,
        qualityScore: quality.score,
        qaReport: machineQaReport,
      },
    });
    terminalImportStatusSet = true;

    console.log(`🧾 QA report written: ${reportPath}`);
    throw new Error(`Import blocked by ${qaErrors.length} QA error(s). Fix the model or metadata and retry.`);
  }

  const modelsDir = path.resolve("public/assets/models");
  const thumbsDir = path.resolve("public/assets/thumbs");
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.mkdirSync(thumbsDir, { recursive: true });

  const destGlb = path.join(modelsDir, `${assetId}.glb`);
  fs.copyFileSync(optimizedInputPath, destGlb);

  const destThumb = path.join(thumbsDir, `${assetId}.png`);
  const destHeroThumb = path.join(thumbsDir, `${assetId}-hero.png`);

  if (generateThumbEnabled) {
    const thumbResult = await generateModelThumbnail(destGlb, destThumb, 512);
    if (!thumbResult.ok) {
      createPngPlaceholder(destThumb);
      console.warn(
        `[import:model] thumbnail render failed; generated placeholder. reason=${thumbResult.reason || "unknown"}`
      );
      qa.checks.push({
        severity: "warning",
        code: "THUMBNAIL_RENDER_FAILED",
        message: "Automated thumbnail render failed; placeholder image generated.",
        details: `Ensure Playwright browser dependencies and network access for model-viewer CDN. Reason: ${thumbResult.reason || "unknown"}`,
      });
    }
  }

  if (!generateThumbEnabled && !fs.existsSync(destThumb)) {
    createPngPlaceholder(destThumb);
    console.warn("[import:model] thumbnail autogeneration disabled; generated placeholder image.");
    qa.checks.push({
      severity: "warning",
      code: "THUMBNAIL_AUTOGEN_DISABLED",
      message: "Thumbnail generation disabled; placeholder image generated.",
    });
  }

  if (generateHeroThumbEnabled) {
    const heroResult = await generateModelThumbnail(destGlb, destHeroThumb, 1024);
    if (!heroResult.ok) {
      console.warn(`[import:model] hero thumbnail render failed. reason=${heroResult.reason || "unknown"}`);
      qa.checks.push({
        severity: "warning",
        code: "HERO_THUMBNAIL_RENDER_FAILED",
        message: "Hero thumbnail render failed.",
        details: heroResult.reason || "unknown",
      });
    }
  }

  await setImportStatus("preview_generated", {
    notes: "Thumbnail generation stage complete.",
    normalizedFileUrl: normalizedInputPath,
    optimizedFileUrl: optimizedInputPath,
    thumbnailUrl: `/assets/thumbs/${assetId}.png`,
  });

  await setImportStatus("metadata_extracted", {
    notes: "Metadata + QA extraction complete.",
    normalizedFileUrl: normalizedInputPath,
    optimizedFileUrl: optimizedInputPath,
    report: buildImportJobReport(qa.checks, {
      fileSizeBytes: optimizedStat.size,
      triangleCount: qa.stats.triangleCount,
      textureCount: qa.stats.textureCount,
      maxTextureSize: qa.stats.maxTextureResolution,
    }),
    rawMetadataJson: {
      stats: qa.stats,
      qualityScore: quality.score,
      qaReport: machineQaReportEarly,
    },
  });

  if (!fs.existsSync(destThumb)) {
    throw new Error(`Import blocked: missing thumbnail at ${destThumb}`);
  }

  const modelUrl = `/assets/models/${assetId}.glb`;
  const thumbUrl = `/assets/thumbs/${assetId}.png`;
  const geometryHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(destGlb))
    .digest("hex")
    .slice(0, 16);

  const existing = await prisma.modelAsset.findUnique({ where: { id: assetId } });
  const duplicateAssets = await prisma.modelAsset.findMany({
    where: {
      id: { not: assetId },
      notes: { contains: `${GEOM_HASH_TAG_PREFIX}${geometryHash}]` },
    },
    select: { id: true },
    take: 10,
  });

  if (duplicateAssets.length > 0) {
    qa.checks.push({
      severity: "warning",
      code: "POSSIBLE_DUPLICATE_GEOMETRY",
      message: `Possible duplicate asset detected (${duplicateAssets.map((d) => d.id).join(", ")}).`,
      details: "Geometry hash matched existing asset(s). Reuse geometry where variants only differ by finish.",
    });
  }

  const qaNotes = qa.checks
    .filter((c) => c.severity === "warning")
    .map((c) => `[QA][${c.code}] ${c.message}`);

  const qaNote = qaNotes.length > 0 ? qaNotes.join("\n") : null;
  const mergedNotesBase = qaNote
    ? existing?.notes?.includes(qaNote)
      ? existing.notes
      : [existing?.notes, qaNote].filter(Boolean).join("\n")
    : existing?.notes ?? null;
  const withQualityTag = upsertTaggedValue(mergedNotesBase, QUALITY_TAG_PREFIX, String(quality.score));
  const mergedNotes = upsertTaggedValue(withQualityTag, GEOM_HASH_TAG_PREFIX, geometryHash);

  await prisma.modelAsset.upsert({
    where: { id: assetId },
    create: {
      id: assetId,
      modelUrl,
      thumbUrl,
      notes: mergedNotes,

      dimsWmm: Math.round(dims.w),
      dimsDmm: Math.round(dims.d),
      dimsHmm: Math.round(dims.h),

      aabbSizeX: aabb.size.x,
      aabbSizeY: aabb.size.y,
      aabbSizeZ: aabb.size.z,
      aabbCenterX: aabb.center.x,
      aabbCenterY: aabb.center.y,
      aabbCenterZ: aabb.center.z,

      pivotOffsetX: 0,
      pivotOffsetZ: 0,
      groundAligned: true,

      approved: input.approved ?? false,
    },
    update: {
      modelUrl,
      thumbUrl,
      notes: mergedNotes,
      dimsWmm: Math.round(dims.w),
      dimsDmm: Math.round(dims.d),
      dimsHmm: Math.round(dims.h),
      aabbSizeX: aabb.size.x,
      aabbSizeY: aabb.size.y,
      aabbSizeZ: aabb.size.z,
      aabbCenterX: aabb.center.x,
      aabbCenterY: aabb.center.y,
      aabbCenterZ: aabb.center.z,
      approved: input.approved ?? false,
    },
  });

  const supplierFinishes = input.supplierFinishes ?? [];
  if (input.catalogItemId && supplierFinishes.length > 0) {
    const brandName = (input.brandName || "unknown").trim();
    for (const finish of supplierFinishes) {
      const sourceLabel = finish.sourceLabel?.trim();
      if (!sourceLabel) continue;

      const existingBrandFinish = await prisma.brandFinish.findFirst({
        where: {
          catalogItemId: input.catalogItemId,
          brandName,
          sourceLabel,
          sourceCode: finish.sourceCode?.trim() || null,
        },
      });

      if (existingBrandFinish) continue;

      await prisma.brandFinish.create({
        data: {
          catalogItemId: input.catalogItemId,
          brandName,
          sourceLabel,
          sourceCode: finish.sourceCode?.trim() || null,
          materialFamily: (finish.materialFamily?.trim() || undefined) as
            | "fabric"
            | "leather"
            | "wood"
            | "metal"
            | "stone"
            | "glass"
            | "lacquer"
            | "composite"
            | "other"
            | undefined,
          notes: finish.notes?.trim() || null,
        },
      });
    }
  }

  console.log(`✅ Imported ModelAsset ${assetId}`);
  console.log(`   modelUrl=${modelUrl}`);
  console.log(`   thumbUrl=${thumbUrl}`);
  console.log(`   qualityScore=${quality.score}/100`);
  console.log(`   geometryHash=${geometryHash}`);

  const reportPath = writeQAReport(
    {
      ...reportBase,
      checks: qa.checks,
      errorCount: qa.checks.filter((c) => c.severity === "error").length,
      warningCount: qa.checks.filter((c) => c.severity === "warning").length,
      status: "passed",
      imported: true,
      modelUrl,
      thumbUrl,
    },
    input.qaReportPath
  );
  console.log(`🧾 QA report written: ${reportPath}`);

  await setImportStatus("needs_mapping", {
    notes: "Import succeeded; ready for finish/catalog mapping handoff.",
    qaReportUrl: reportPath,
    thumbnailUrl: thumbUrl,
    normalizedFileUrl: normalizedInputPath,
    optimizedFileUrl: optimizedInputPath,
    report: buildImportJobReport(qa.checks, {
      fileSizeBytes: optimizedStat.size,
      triangleCount: qa.stats.triangleCount,
      textureCount: qa.stats.textureCount,
      maxTextureSize: qa.stats.maxTextureResolution,
    }),
    rawMetadataJson: {
      stats: qa.stats,
      qualityScore: quality.score,
      geometryHash,
      qaReport: machineQaReport,
    },
  });
  terminalImportStatusSet = true;

  await prisma.$disconnect();
  } catch (error) {
    const err = error as Error;
    if (!terminalImportStatusSet) {
      try {
        await setImportStatus("failed", {
          errorMessage: err.message,
          notes: "Pipeline failed before handoff.",
          normalizedFileUrl: normalizedInputPath,
          optimizedFileUrl: optimizedInputPath,
        });
      } catch (statusError) {
        console.warn("[import:model] failed to persist ImportJob failed status", statusError);
      }
    }
    throw error;
  } finally {
    fs.rmSync(pipelineWorkDir, { recursive: true, force: true });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

