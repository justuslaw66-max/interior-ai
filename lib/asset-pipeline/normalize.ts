import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

type NormalizeResult = {
  normalizedPath: string;
  usedFallback: boolean;
  details: string;
};

function runCli(args: string[]): { ok: boolean; output: string } {
  try {
    const output = execFileSync("npx", ["-y", "@gltf-transform/cli", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string };
    return {
      ok: false,
      output: [err.stdout, err.stderr, err.message].filter(Boolean).join("\n"),
    };
  }
}

export function normalizeModel(srcPath: string, outDir: string): NormalizeResult {
  const normalizedPath = path.join(outDir, "normalized.glb");
  const srcExt = path.extname(srcPath).toLowerCase();

  if (srcExt === ".glb") {
    fs.copyFileSync(srcPath, normalizedPath);
    return {
      normalizedPath,
      usedFallback: true,
      details: "Input already GLB; copied as normalized baseline.",
    };
  }

  const copyStep = runCli(["copy", srcPath, normalizedPath]);
  if (!copyStep.ok) {
    fs.copyFileSync(srcPath, normalizedPath);
    return {
      normalizedPath,
      usedFallback: true,
      details: "Normalization command unavailable; source copied as fallback.",
    };
  }

  return {
    normalizedPath,
    usedFallback: false,
    details: "Model normalized to GLB.",
  };
}
