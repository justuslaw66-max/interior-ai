import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const source = (relativePath) =>
  readFileSync(join(root, relativePath), "utf8");
const physicalLineCount = (relativePath) => {
  const contents = source(relativePath).replaceAll("\r\n", "\n");
  if (contents.length === 0) return 0;
  return contents.endsWith("\n")
    ? contents.slice(0, -1).split("\n").length
    : contents.split("\n").length;
};

const lineLimits = new Map([
  ["app/design/page.tsx", 30],
  ["components/editor/design-page/DesignPageWorkspace.tsx", 543],
  ["components/editor/design-page/DesignPageComposition.tsx", 700],
  ["components/editor/design-page/DesignPageSceneRegion.tsx", 700],
  ["components/editor/design-page/DesignPageEditorChrome.tsx", 700],
  ["components/editor/design-page/DesignPagePanelRegion.tsx", 700],
  ["components/editor/design-page/DesignPageDialogLayer.tsx", 700],
  ["components/editor/design-page/DesignPagePresentationQaLayer.tsx", 700],
  ["lib/design-page-viewport-workspace-registration.ts", 280],
  ["lib/design-page-panel-workspace-registration.ts", 300],
  ["lib/useDesignPageSceneRegionWorkspaceRegistration.ts", 450],
]);

for (const [relativePath, limit] of lineLimits) {
  const count = physicalLineCount(relativePath);
  if (count > limit) {
    failures.push(`${relativePath} has ${count} physical lines; limit is ${limit}.`);
  }
}

const routeSource = source("app/design/page.tsx");
if (!routeSource.includes("<DesignPageWorkspace />")) {
  failures.push("The /design route must remain a thin DesignPageWorkspace wrapper.");
}

const workspacePath =
  "components/editor/design-page/DesignPageWorkspace.tsx";
const workspaceSource = source(workspacePath);
for (const requiredBoundary of [
  "DesignPageComposition",
  "DesignPageSceneRegion",
  "DesignPageEditorChrome",
  "DesignPagePanelRegion",
  "DesignPageDialogLayer",
  "DesignPagePresentationQaLayer",
  "buildDesignPageViewportWorkspaceRegistration",
]) {
  if (!workspaceSource.includes(requiredBoundary)) {
    failures.push(`DesignPageWorkspace must compose ${requiredBoundary}.`);
  }
}

for (const forbiddenOwner of [
  "buildDesignPageViewportRegionAdapter",
  "buildDesignPageSceneRegionAdapter",
  "createContext(",
]) {
  if (workspaceSource.includes(forbiddenOwner)) {
    failures.push(`DesignPageWorkspace must not reclaim ${forbiddenOwner} ownership.`);
  }
}

const walkSourceFiles = (directory) => {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(absolutePath));
    } else if ([".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(absolutePath);
    }
  }
  return files;
};

const designPageFiles = [
  join(root, "app/design/page.tsx"),
  ...walkSourceFiles(join(root, "components/editor/design-page")),
  ...readdirSync(join(root, "lib"))
    .filter(
      (name) =>
        /^(?:design-page-|useDesignPage)/.test(name) &&
        [".ts", ".tsx"].includes(extname(name))
    )
    .map((name) => join(root, "lib", name)),
];
const designPageFileSet = new Set(designPageFiles.map((file) => resolve(file)));

const resolveLocalImport = (importer, specifier) => {
  let candidate;
  if (specifier.startsWith("@/")) {
    candidate = join(root, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    candidate = resolve(dirname(importer), specifier);
  } else {
    return null;
  }

  for (const resolvedCandidate of [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    join(candidate, "index.ts"),
    join(candidate, "index.tsx"),
  ]) {
    if (existsSync(resolvedCandidate) && statSync(resolvedCandidate).isFile()) {
      return resolve(resolvedCandidate);
    }
  }
  return null;
};

const importPattern = /(?:import|export)\s+(?:type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["']/g;
const graph = new Map();
for (const file of designPageFiles) {
  const dependencies = [];
  for (const match of source(relative(root, file)).matchAll(importPattern)) {
    const dependency = resolveLocalImport(file, match[1]);
    if (dependency && designPageFileSet.has(dependency)) {
      dependencies.push(dependency);
    }
  }
  graph.set(resolve(file), dependencies);
}

const visiting = new Set();
const visited = new Set();
const visit = (file, path) => {
  if (visiting.has(file)) {
    const cycleStart = path.indexOf(file);
    const cycle = [...path.slice(cycleStart), file]
      .map((entry) => relative(root, entry))
      .join(" -> ");
    failures.push(`Design-page dependency cycle detected: ${cycle}`);
    return;
  }
  if (visited.has(file)) return;

  visiting.add(file);
  for (const dependency of graph.get(file) ?? []) {
    visit(dependency, [...path, file]);
  }
  visiting.delete(file);
  visited.add(file);
};

for (const file of graph.keys()) visit(file, []);

const workspaceImportPattern =
  /from\s+["']@\/components\/editor\/design-page\/DesignPageWorkspace["']/;
for (const file of designPageFiles) {
  if (file.endsWith("app/design/page.tsx")) continue;
  if (workspaceImportPattern.test(source(relative(root, file)))) {
    failures.push(
      `${relative(root, file)} must not import the composition root.`
    );
  }
}

if (failures.length > 0) {
  console.error("Design-page architecture checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Design-page architecture checks passed (${designPageFiles.length} source files, no dependency cycles).`
);
