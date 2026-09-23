import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const repositoryRoot = process.cwd();
const nextRoot = path.join(repositoryRoot, ".next");
const staticRoot = path.join(nextRoot, "static");
const routeManifestPath = path.join(
  nextRoot,
  "server/app/design/page_client-reference-manifest.js"
);
const buildManifestPath = path.join(nextRoot, "build-manifest.json");
const budgetPath = path.join(
  repositoryRoot,
  "config/phase8-performance-budgets.json"
);

function requireFile(filePath, guidance) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${guidance}: ${path.relative(repositoryRoot, filePath)}`);
  }
}

requireFile(routeManifestPath, "Run npm run build before measuring the /design bundle");
requireFile(buildManifestPath, "Run npm run build before measuring shared chunks");

const routeManifest = fs.readFileSync(routeManifestPath, "utf8");
const buildManifest = JSON.parse(fs.readFileSync(buildManifestPath, "utf8"));
const routeChunkMatches = routeManifest.matchAll(/(static\/chunks\/[^"\\]+\.(?:js|css))/g);
const routeChunks = new Set(Array.from(routeChunkMatches, (match) => match[1]));
for (const chunk of [
  ...(buildManifest.polyfillFiles ?? []),
  ...(buildManifest.rootMainFiles ?? []),
]) {
  routeChunks.add(chunk);
}

function chunkPath(relativePath) {
  return path.join(nextRoot, relativePath);
}

function summarizeFiles(files) {
  let rawBytes = 0;
  let gzipBytes = 0;
  let brotliBytes = 0;
  for (const file of files) {
    const filePath = chunkPath(file);
    requireFile(filePath, "Build manifest references a missing chunk");
    const bytes = fs.readFileSync(filePath);
    rawBytes += bytes.byteLength;
    gzipBytes += zlib.gzipSync(bytes, { level: 9 }).byteLength;
    brotliBytes += zlib.brotliCompressSync(bytes).byteLength;
  }
  return { rawBytes, gzipBytes, brotliBytes };
}

const initialJsFiles = [...routeChunks].filter((file) => file.endsWith(".js")).sort();
const initialCssFiles = [...routeChunks].filter((file) => file.endsWith(".css")).sort();
const staticChunkDirectory = path.join(staticRoot, "chunks");
const allChunks = fs
  .readdirSync(staticChunkDirectory)
  .filter((file) => file.endsWith(".js"))
  .map((file) => `static/chunks/${file}`);

function findChunksContaining(pattern) {
  return allChunks
    .filter((file) => pattern.test(fs.readFileSync(chunkPath(file), "utf8")))
    .sort();
}

const cabinetryStudioFiles = findChunksContaining(/CabinetryStudio|cabinetry-studio/).filter(
  (file) => !initialJsFiles.includes(file)
);
const gltfExporterFiles = findChunksContaining(/THREE\.GLTFExporter/).filter(
  (file) => !initialJsFiles.includes(file)
);

const result = {
  route: "/design",
  initial: {
    js: { files: initialJsFiles, ...summarizeFiles(initialJsFiles) },
    css: { files: initialCssFiles, ...summarizeFiles(initialCssFiles) },
  },
  lazy: {
    cabinetryStudio: {
      files: cabinetryStudioFiles,
      ...summarizeFiles(cabinetryStudioFiles),
    },
    gltfExporter: {
      files: gltfExporterFiles,
      ...summarizeFiles(gltfExporterFiles),
    },
  },
};

if (process.argv.includes("--check")) {
  requireFile(budgetPath, "Phase 8 bundle budgets are missing");
  const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8")).bundle;
  const checks = [
    ["initial JS raw", result.initial.js.rawBytes, budget.initialJsRawBytes],
    ["initial JS Brotli", result.initial.js.brotliBytes, budget.initialJsBrotliBytes],
    ["initial CSS raw", result.initial.css.rawBytes, budget.initialCssRawBytes],
    ["initial CSS Brotli", result.initial.css.brotliBytes, budget.initialCssBrotliBytes],
    [
      "Cabinetry Studio raw",
      result.lazy.cabinetryStudio.rawBytes,
      budget.cabinetryStudioRawBytes,
    ],
    [
      "Cabinetry Studio Brotli",
      result.lazy.cabinetryStudio.brotliBytes,
      budget.cabinetryStudioBrotliBytes,
    ],
    ["GLTF exporter raw", result.lazy.gltfExporter.rawBytes, budget.gltfExporterRawBytes],
    [
      "GLTF exporter Brotli",
      result.lazy.gltfExporter.brotliBytes,
      budget.gltfExporterBrotliBytes,
    ],
  ];
  for (const [label, actual, limit] of checks) {
    if (actual > limit) {
      throw new Error(`${label} ${actual} bytes exceeds the ${limit}-byte budget.`);
    }
  }
  if (result.lazy.cabinetryStudio.files.length === 0) {
    throw new Error("Cabinetry Studio no longer has a measurable lazy chunk.");
  }
  if (result.lazy.gltfExporter.files.length === 0) {
    throw new Error("GLTF exporter no longer has a measurable lazy chunk.");
  }
}

console.log(JSON.stringify(result, null, 2));
if (process.argv.includes("--check")) {
  console.log("Phase 8 bundle budgets passed.");
}
