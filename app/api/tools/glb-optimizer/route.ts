import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { NextResponse } from "next/server";
import { normalizeModel } from "@/lib/asset-pipeline/normalize";
import { optimizeModel } from "@/lib/asset-pipeline/optimize";
import { resolveImportQaLimits } from "@/lib/importQaPolicy";
import type { PipelineStepResult } from "@/lib/asset-pipeline/types";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set([".glb", ".gltf"]);

function sanitizeBaseName(fileName: string) {
  const parsed = path.parse(fileName);
  return (parsed.name || "model")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "model";
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let workDir: string | null = null;

  try {
    const formData = await request.formData();
    const upload = formData.get("file");

    if (!(upload instanceof File)) {
      return errorResponse("Upload a GLB or glTF file.");
    }

    const originalName = upload.name || "model.glb";
    const extension = path.extname(originalName).toLowerCase();

    if (!ACCEPTED_EXTENSIONS.has(extension)) {
      return errorResponse("Only .glb and .gltf files are supported.");
    }

    if (upload.size <= 0) {
      return errorResponse("The uploaded file is empty.");
    }

    if (upload.size > MAX_UPLOAD_BYTES) {
      return errorResponse("The uploaded file is larger than 80 MB.");
    }

    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "glb-optimizer-"));
    const inputPath = path.join(workDir, `source${extension}`);
    const bytes = Buffer.from(await upload.arrayBuffer());
    await fs.writeFile(inputPath, bytes);

    const steps: PipelineStepResult[] = [];
    const normalized = normalizeModel(inputPath, workDir);
    const normalizedAlreadyGlb = normalized.details.toLowerCase().includes("already glb");
    steps.push({
      step: "normalize",
      success: !normalized.usedFallback || normalizedAlreadyGlb,
      details: normalized.details,
    });

    const optimized = optimizeModel(normalized.normalizedPath, workDir, resolveImportQaLimits());
    steps.push(...optimized.steps);

    const optimizedBytes = await fs.readFile(optimized.optimizedPath);
    const outputName = `${sanitizeBaseName(originalName)}-optimized.glb`;

    return new Response(optimizedBytes, {
      status: 200,
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Disposition": `attachment; filename="${outputName}"`,
        "Cache-Control": "no-store",
        "X-Optimizer-Steps": encodeURIComponent(JSON.stringify(steps)),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown optimizer error.";
    return errorResponse(message, 500);
  } finally {
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }
}
