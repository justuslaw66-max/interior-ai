import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["app", "components", "lib"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);

function walk(directory, result = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, result);
    else if (sourceExtensions.has(extname(entry.name)) && !entry.name.endsWith(".d.ts")) {
      result.push(absolute);
    }
  }
  return result;
}

const files = sourceRoots.flatMap((directory) => walk(join(root, directory)));
const fileSet = new Set(files);

function projectPath(absolute) {
  return relative(root, absolute).replaceAll("\\", "/");
}

function isFloorPlanPlatformFile(absolute) {
  const path = projectPath(absolute);
  return path.startsWith("lib/floor-plan-") ||
    path.startsWith("lib/floor-plan-imports/") ||
    /^components\/editor\/(?:FloorPlan|renderers\/CanonicalFloorPlanStructure)/.test(path) ||
    /^components\/editor\/design-page\/.*FloorPlan/.test(path) ||
    path.startsWith("app/api/floor-plan-imports/") ||
    path.startsWith("app/api/admin/floor-plan-imports/") ||
    path.startsWith("app/admin/floor-plans/");
}

function resolveLocalImport(importer, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = join(root, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(importer), specifier);
  else return null;

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.js"),
    join(base, "index.mjs"),
  ];
  return candidates.find((candidate) => fileSet.has(candidate)) ?? null;
}

function importSpecifiers(source) {
  const result = new Set();
  // Type-only imports and `import("...").Type` queries disappear from emitted
  // JavaScript, so they cannot form a runtime initialization cycle.
  const staticPattern = /\b(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(staticPattern)) result.add(match[1]);
  return result;
}

const graph = new Map();
for (const file of files) {
  const dependencies = [...importSpecifiers(readFileSync(file, "utf8"))]
    .map((specifier) => resolveLocalImport(file, specifier))
    .filter(Boolean);
  graph.set(file, dependencies);
}

let nextIndex = 0;
const indexes = new Map();
const lowLinks = new Map();
const stack = [];
const onStack = new Set();
const components = [];

function visit(file) {
  indexes.set(file, nextIndex);
  lowLinks.set(file, nextIndex);
  nextIndex += 1;
  stack.push(file);
  onStack.add(file);

  for (const dependency of graph.get(file) ?? []) {
    if (!indexes.has(dependency)) {
      visit(dependency);
      lowLinks.set(file, Math.min(lowLinks.get(file), lowLinks.get(dependency)));
    } else if (onStack.has(dependency)) {
      lowLinks.set(file, Math.min(lowLinks.get(file), indexes.get(dependency)));
    }
  }

  if (lowLinks.get(file) !== indexes.get(file)) return;
  const component = [];
  let member;
  do {
    member = stack.pop();
    onStack.delete(member);
    component.push(member);
  } while (member !== file);
  components.push(component);
}

for (const file of files) {
  if (!indexes.has(file)) visit(file);
}

const cycles = components.filter((component) => {
  if (!component.some(isFloorPlanPlatformFile)) return false;
  if (component.length > 1) return true;
  return (graph.get(component[0]) ?? []).includes(component[0]);
});

function logicalLineCount(source) {
  return source
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("//"))
    .length;
}

function recommendedMaximum(path) {
  if (path.endsWith("/page.tsx") || path.endsWith("/route.ts")) return 350;
  return 400;
}

let locWarnings = 0;
for (const file of files.filter(isFloorPlanPlatformFile).sort()) {
  const path = projectPath(file);
  const lines = logicalLineCount(readFileSync(file, "utf8"));
  const maximum = recommendedMaximum(path);
  if (lines <= maximum) continue;
  locWarnings += 1;
  console.warn(
    `WARN ${path}: ${lines} logical lines (review recommended above ${maximum}; split by responsibility before adding more behavior).`
  );
}

// A stored candidate has its source drawing packed (lib/floor-plan-imports/candidate-storage.ts). So every candidateJson
// written is packed, and every server file that reads one unpacks it or compiles it (which unpacks): no reader may see
// the stored form. Client code reads candidates from the API, which unpacks them.
const candidateStorage = "lib/floor-plan-imports/candidate-storage.ts";
const storageFailures = [];
for (const file of files) {
  const path = projectPath(file);
  if (path === candidateStorage) continue;
  const source = readFileSync(file, "utf8");
  // `candidateJson: <value>` must be a select (true), a type (unknown) or packed; a shorthand `{ candidateJson }` is
  // refused too, so a write always says how it is stored.
  const writes = /\bcandidateJson\s*:(?!\s*(?:true|unknown)\b|\s*packFloorPlanCandidateForStorage\()|[{,]\s*candidateJson\s*[,}]/g;
  for (const match of source.matchAll(writes)) {
    const line = source.slice(0, match.index).split("\n").length;
    storageFailures.push(`${path}:${line}: candidateJson is written without packFloorPlanCandidateForStorage`);
  }
  const server = path.startsWith("app/api/") || path.startsWith("lib/");
  const reads = /\.candidateJson\b|\bcandidateJson\s*:\s*true\b/.test(source);
  if (server && reads && !/\b(?:unpackFloorPlanCandidate|compileCandidateFloorPlanDocumentV2)\(/.test(source)) {
    storageFailures.push(`${path}: reads candidateJson without unpackFloorPlanCandidate or compileCandidateFloorPlanDocumentV2`);
  }
}

if (cycles.length || storageFailures.length) {
  for (const cycle of cycles) {
    console.error(`FAIL circular dependency: ${cycle.map(projectPath).sort().join(" -> ")}`);
  }
  for (const failure of storageFailures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log(
  `Floor-plan architecture check passed: no circular dependencies, stored candidates packed and unpacked; ${locWarnings} existing oversized-file warning${locWarnings === 1 ? "" : "s"}.`
);
