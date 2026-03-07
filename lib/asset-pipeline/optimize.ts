import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import type { ImportQaLimits } from "@/lib/importQaPolicy";
import type { PipelineStepResult } from "./types";

function runPipelineCommand(args: string[]): { ok: boolean; output: string } {
  try {
    const output = execFileSync("npx", ["-y", "@gltf-transform/cli", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string };
    const output = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n");
    return { ok: false, output };
  }
}

function summarizePipelineFailure(output: string): { reason: string; toolUnavailable: boolean } {
  const trimmed = output.trim();
  const firstNonEmptyLine = trimmed
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0);
  const reason = (firstNonEmptyLine || "Unknown pipeline failure").trim();

  const lower = trimmed.toLowerCase();
  const toolUnavailable =
    lower.includes("command not found") ||
    lower.includes("enoent") ||
    lower.includes("could not determine executable") ||
    lower.includes("not recognized as an internal or external command") ||
    lower.includes("eai_again") ||
    lower.includes("enotfound");

  return { reason, toolUnavailable };
}

export function optimizeModel(
  src: string,
  outDir: string,
  limits: ImportQaLimits
): { optimizedPath: string; steps: PipelineStepResult[] } {
  const steps: PipelineStepResult[] = [];
  const optimizedPath = path.join(outDir, "optimized.glb");

  const validateStep = runPipelineCommand(["validate", src]);
  const validateFailure = validateStep.ok ? null : summarizePipelineFailure(validateStep.output);
  steps.push({
    step: "validate",
    success: validateStep.ok,
    details: validateStep.ok
      ? "GLB validation passed."
      : `Validation command failed (${validateFailure?.reason || "unknown"}); continuing with fallback.`,
    toolUnavailable: validateFailure?.toolUnavailable,
  });

  const optimizeStep = runPipelineCommand([
    "optimize",
    src,
    optimizedPath,
    "--compress",
    "meshopt",
    "--texture-size",
    String(limits.maxTextureResolution),
  ]);

  if (!optimizeStep.ok) {
    const optimizeFailure = summarizePipelineFailure(optimizeStep.output);
    fs.copyFileSync(src, optimizedPath);
    steps.push({
      step: "optimize",
      success: false,
      details: `gltf-transform optimize failed (${optimizeFailure.reason}); copied source GLB as fallback.`,
      toolUnavailable: optimizeFailure.toolUnavailable,
    });
    return { optimizedPath, steps };
  }

  steps.push({
    step: "optimize",
    success: true,
    details: "Mesh and accessor optimization completed.",
  });

  const textureStep = runPipelineCommand([
    "textureCompress",
    optimizedPath,
    optimizedPath,
    "--slots",
    "baseColorTexture,normalTexture,metallicRoughnessTexture,emissiveTexture,occlusionTexture",
    "--target",
    "webp",
    "--quality",
    "85",
    "--max-texture-size",
    String(limits.maxTextureResolution),
  ]);

  const textureFailure = textureStep.ok ? null : summarizePipelineFailure(textureStep.output);
  steps.push({
    step: "textureCompress",
    success: textureStep.ok,
    details: textureStep.ok
      ? "Texture compression/downscale completed."
      : `Texture compression failed (${textureFailure?.reason || "unknown"}); keeping optimized GLB without texture transcode.`,
    toolUnavailable: textureFailure?.toolUnavailable,
  });

  return { optimizedPath, steps };
}
