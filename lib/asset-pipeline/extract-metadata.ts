import { execFileSync } from "node:child_process";
import type { ImportQaLimits } from "@/lib/importQaPolicy";
import type { AssetPipelineCheck, ModelInspectStats } from "./types";

type MetadataExtractionResult = {
  stats: ModelInspectStats;
  checks: AssetPipelineCheck[];
  inspectError?: string;
};

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

function parseInspectStats(inspectCsv: string): ModelInspectStats {
  const lines = inspectCsv.split(/\r?\n/).map((line) => line.trim());
  const stats: ModelInspectStats = {
    materialCount: null,
    triangleCount: null,
    textureCount: null,
    maxTextureResolution: null,
    hasBaseColorTexture: null,
  };

  type Section = "MESHES" | "MATERIALS" | "TEXTURES" | null;
  let currentSection: Section = null;
  let currentHeader: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith("─")) continue;
    if (line === "MESHES" || line === "MATERIALS" || line === "TEXTURES") {
      currentSection = line;
      currentHeader = [];
      continue;
    }

    if (!currentSection) continue;
    if (line.startsWith("#,")) {
      currentHeader = parseCsvRow(line);
      continue;
    }

    if (!/^\d+,/.test(line) || currentHeader.length === 0) continue;
    const row = parseCsvRow(line);

    const valueAt = (name: string): string => {
      const idx = currentHeader.indexOf(name);
      if (idx < 0 || idx >= row.length) return "";
      return row[idx];
    };

    if (currentSection === "MESHES") {
      const tri = Number.parseInt(valueAt("glPrimitives"), 10);
      if (Number.isFinite(tri)) {
        stats.triangleCount = (stats.triangleCount ?? 0) + tri;
      }
      continue;
    }

    if (currentSection === "MATERIALS") {
      stats.materialCount = (stats.materialCount ?? 0) + 1;
      const texSlots = valueAt("textures");
      if (stats.hasBaseColorTexture !== true && texSlots.includes("baseColorTexture")) {
        stats.hasBaseColorTexture = true;
      }
      continue;
    }

    if (currentSection === "TEXTURES") {
      stats.textureCount = (stats.textureCount ?? 0) + 1;
      const match = /^(\d+)x(\d+)$/i.exec(valueAt("resolution"));
      if (match) {
        const maxAxis = Math.max(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10));
        if (Number.isFinite(maxAxis)) {
          stats.maxTextureResolution = Math.max(stats.maxTextureResolution ?? 0, maxAxis);
        }
      }
    }
  }

  if (stats.hasBaseColorTexture === null && (stats.materialCount ?? 0) > 0) {
    stats.hasBaseColorTexture = false;
  }

  return stats;
}

export function extractModelMetadata(glbPath: string, limits: ImportQaLimits): MetadataExtractionResult {
  const checks: AssetPipelineCheck[] = [];
  let stats: ModelInspectStats = {
    materialCount: null,
    triangleCount: null,
    textureCount: null,
    maxTextureResolution: null,
    hasBaseColorTexture: null,
  };

  try {
    const inspectCsv = execFileSync(
      "npx",
      ["-y", "@gltf-transform/cli", "inspect", glbPath, "--format=csv"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );

    stats = parseInspectStats(inspectCsv);

    if (stats.triangleCount !== null && stats.triangleCount > limits.maxTriangles) {
      checks.push({
        severity: "error",
        code: "TRIANGLE_BUDGET_EXCEEDED",
        message: `Triangle count exceeds limit (${stats.triangleCount} > ${limits.maxTriangles}).`,
      });
    }

    if (stats.textureCount !== null && stats.textureCount > limits.maxTextureCount) {
      checks.push({
        severity: "error",
        code: "TOO_MANY_TEXTURES",
        message: `Texture count exceeds limit (${stats.textureCount} > ${limits.maxTextureCount}).`,
      });
    }

    if (stats.maxTextureResolution !== null && stats.maxTextureResolution > limits.maxTextureResolution) {
      checks.push({
        severity: "error",
        code: "TEXTURE_RESOLUTION_TOO_HIGH",
        message: `Texture resolution exceeds limit (${stats.maxTextureResolution}px > ${limits.maxTextureResolution}px).`,
      });
    }
  } catch (error) {
    const err = error as Error;
    checks.push({
      severity: "warning",
      code: "INSPECT_SKIPPED",
      message: "glTF inspect step unavailable; mesh/material checks were skipped.",
      details: err.message,
    });
    return { stats, checks, inspectError: err.message };
  }

  return { stats, checks };
}
