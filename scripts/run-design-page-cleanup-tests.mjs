import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDirectory = join(root, "scripts");
const require = createRequire(import.meta.url);
const tsNodeBin = require.resolve("ts-node/dist/bin.js");

const compatibilityGuards = new Set([
  "test-catalog-placement.ts",
  "test-manual-placement-scoring.ts",
  "test-room-resize-handle-style.ts",
  "test-tap-target-placement.ts",
  "test-touch-placement-polish.ts",
]);

const guardFiles = readdirSync(scriptsDirectory)
  .filter((fileName) => {
    if (!fileName.startsWith("test-") || !fileName.endsWith(".ts")) {
      return false;
    }
    if (
      fileName.startsWith("test-design-page-") ||
      fileName.startsWith("test-placement-") ||
      compatibilityGuards.has(fileName)
    ) {
      return true;
    }

    const source = readFileSync(join(scriptsDirectory, fileName), "utf8");
    return (
      source.includes("DesignPageWorkspace.tsx") ||
      source.includes("useDesignPageCatalogPlacement.ts")
    );
  })
  .sort();

if (guardFiles.length === 0) {
  console.error("No design-page cleanup guards were discovered.");
  process.exit(1);
}

const compilerOptions = JSON.stringify({
  module: "CommonJS",
  moduleResolution: "node",
  jsx: "react-jsx",
});

for (const fileName of guardFiles) {
  console.log(`\n[design-page-cleanup] ${fileName}`);
  const result = spawnSync(
    process.execPath,
    [
      tsNodeBin,
      "--transpile-only",
      "--compiler-options",
      compilerOptions,
      "-r",
      "tsconfig-paths/register",
      join(scriptsDirectory, fileName),
    ],
    {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    }
  );

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\nDesign-page cleanup guards passed (${guardFiles.length} files).`);
