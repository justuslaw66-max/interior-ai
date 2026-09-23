import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const comparePaths = (left, right) => left === right ? 0 : left < right ? -1 : 1;
const DISCOVERY_ARGUMENTS = [
  "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z",
];
export const WINDOW_OPENING_IGNORED_DISCOVERY = Object.freeze({
  command: Object.freeze(["git", ...DISCOVERY_ARGUMENTS]),
  usesRepositoryIgnoreRules: true,
  directoryIdentity: "recursive path/type/mode/bytes/mtime-ns/content-sha256 tree digest",
  contentsRecorded: false,
});

export const WINDOW_OPENING_BUILD_OUTPUT_CONTRACT = Object.freeze({
  schemaVersion: "window-opening-build-output-contract/v1",
  version: "v1",
  rules: Object.freeze([
    Object.freeze({
      id: "next-build-directory",
      path: ".next/",
      displayPath: ".next/**",
      allowedPreTypes: Object.freeze(["absent", "directory"]),
      requiredPostType: "directory",
      allowedChangeKinds: Object.freeze([
        "added", "content_changed", "byte_length_changed", "metadata_changed",
      ]),
      basis: "Next.js build output directory, ignored by the repository root .gitignore.",
    }),
    Object.freeze({
      id: "next-generated-types",
      path: "next-env.d.ts",
      displayPath: "next-env.d.ts",
      allowedPreTypes: Object.freeze(["absent", "file"]),
      requiredPostType: "file",
      allowedChangeKinds: Object.freeze([
        "added", "content_changed", "byte_length_changed", "metadata_changed",
      ]),
      basis: "Next.js generated TypeScript declaration, ignored by the repository root .gitignore.",
    }),
    Object.freeze({
      id: "typescript-incremental-state",
      path: "tsconfig.tsbuildinfo",
      displayPath: "tsconfig.tsbuildinfo",
      allowedPreTypes: Object.freeze(["absent", "file"]),
      requiredPostType: "file",
      allowedChangeKinds: Object.freeze([
        "added", "content_changed", "byte_length_changed", "metadata_changed",
      ]),
      basis: "TypeScript incremental compiler output, ignored by the repository root .gitignore.",
    }),
  ]),
});

function mode(stat) {
  return (Number(stat.mode) & 0o7777).toString(8).padStart(4, "0");
}

function fileType(stat) {
  if (stat.isSymbolicLink()) return "symlink";
  if (stat.isFile()) return "file";
  if (stat.isDirectory()) return "directory";
  return "other";
}

async function contentIdentity(absolutePath, stat) {
  if (stat.isSymbolicLink()) return Buffer.from(await fs.readlink(absolutePath));
  if (stat.isFile()) return fs.readFile(absolutePath);
  return Buffer.alloc(0);
}

async function treeRecord(root, relativePath) {
  const absoluteRoot = path.join(root, relativePath);
  const rootStat = await fs.lstat(absoluteRoot, { bigint: true });
  const pending = [{ absolutePath: absoluteRoot, relativePath: "" }];
  const records = [];
  while (pending.length) {
    const current = pending.pop();
    const entries = await fs.readdir(current.absolutePath, { withFileTypes: true });
    entries.sort((left, right) => comparePaths(right.name, left.name));
    for (const entry of entries) {
      const childRelative = current.relativePath
        ? `${current.relativePath}/${entry.name}` : entry.name;
      const absolutePath = path.join(current.absolutePath, entry.name);
      const stat = await fs.lstat(absolutePath, { bigint: true });
      const type = fileType(stat);
      if (type === "directory") {
        records.push({
          path: `${childRelative}/`, type, mode: mode(stat), bytes: 0,
          modifiedTimeNs: stat.mtimeNs.toString(), sha256: null,
        });
        pending.push({ absolutePath, relativePath: childRelative });
      } else {
        const content = await contentIdentity(absolutePath, stat);
        records.push({
          path: childRelative, type, mode: mode(stat), bytes: content.byteLength,
          modifiedTimeNs: stat.mtimeNs.toString(), sha256: sha256(content),
        });
      }
    }
  }
  records.sort((left, right) => comparePaths(left.path, right.path));
  return {
    type: "directory",
    mode: mode(rootStat),
    bytes: records.reduce((sum, record) => sum + record.bytes, 0),
    modifiedTimeNs: rootStat.mtimeNs.toString(),
    sha256: sha256(JSON.stringify(records)),
    treeEntryCount: records.length,
  };
}

async function ignoreRule(root, relativePath) {
  const candidate = relativePath.endsWith("/") ? relativePath.slice(0, -1) : relativePath;
  const { stdout } = await execFileAsync("git", ["check-ignore", "-v", "--no-index", candidate], {
    cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  });
  const separator = stdout.indexOf("\t");
  if (separator < 0) throw new Error(`Git did not report ignore provenance for ${relativePath}.`);
  const provenance = stdout.slice(0, separator);
  const match = /^(.*):(\d+):(.*)$/.exec(provenance);
  if (!match) throw new Error(`Git returned malformed ignore provenance for ${relativePath}.`);
  const source = path.isAbsolute(match[1]) ? path.relative(root, match[1]) : match[1];
  return { source, line: Number(match[2]), pattern: match[3] };
}

async function inventoryRecord(root, relativePath) {
  const normalized = relativePath.replaceAll(path.sep, "/");
  const absolutePath = path.join(root, normalized);
  const stat = await fs.lstat(absolutePath, { bigint: true });
  const type = fileType(stat);
  const identity = type === "directory"
    ? await treeRecord(root, normalized)
    : await (async () => {
      const content = await contentIdentity(absolutePath, stat);
      return {
        type, mode: mode(stat), bytes: content.byteLength,
        modifiedTimeNs: stat.mtimeNs.toString(), sha256: sha256(content),
      };
    })();
  return {
    path: type === "directory" && !normalized.endsWith("/") ? `${normalized}/` : normalized,
    ...identity,
    ignoredByGit: true,
    ignoreRule: await ignoreRule(root, normalized),
  };
}

export async function collectIgnoredStateInventory(root) {
  const { stdout } = await execFileAsync("git", DISCOVERY_ARGUMENTS, {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  const paths = stdout.split("\0").filter(Boolean).sort(comparePaths);
  const entries = [];
  for (const relativePath of paths) entries.push(await inventoryRecord(root, relativePath));
  return {
    schemaVersion: "window-opening-ignored-state-inventory/v1",
    discovery: WINDOW_OPENING_IGNORED_DISCOVERY,
    entries,
    inventorySha256: sha256(JSON.stringify(entries)),
  };
}

function changesBetween(before, after) {
  if (!before) return ["added"];
  if (!after) return ["removed"];
  if (before.type !== after.type) return ["type_changed"];
  const changes = [];
  if (before.sha256 !== after.sha256) changes.push("content_changed");
  if (before.mode !== after.mode) changes.push("mode_changed");
  if (before.bytes !== after.bytes) changes.push("byte_length_changed");
  if (before.modifiedTimeNs !== after.modifiedTimeNs) changes.push("metadata_changed");
  return changes.length ? changes : ["unchanged"];
}

function matchedRule(pathname) {
  return WINDOW_OPENING_BUILD_OUTPUT_CONTRACT.rules.find((rule) => rule.path === pathname) ?? null;
}

function ruleAllows(rule, before, after, changeKinds) {
  if (!rule || changeKinds.includes("unchanged")) return changeKinds.includes("unchanged");
  const preType = before?.type ?? "absent";
  return rule.allowedPreTypes.includes(preType) && after?.type === rule.requiredPostType &&
    changeKinds.every((kind) => rule.allowedChangeKinds.includes(kind));
}

function reasonFor(rule, allowed, changeKinds) {
  if (changeKinds.includes("unchanged")) return "Ignored path did not change during the build.";
  if (!rule) return "Changed ignored path is outside the explicit build-output contract.";
  return allowed
    ? `Every observed change is allowed by ${rule.id}.`
    : `Observed type or change kind is not allowed by ${rule.id}.`;
}

export function describeIgnoredChanges(changeRecords, allAllowed) {
  const changed = changeRecords.filter((record) => !record.changeKinds.includes("unchanged"));
  if (!changed.length) return "No ignored repository paths changed.";
  const names = changed.map((record) => record.displayPath);
  if (names.length === 1 && names[0] === ".next/**" && allAllowed) return "Only .next/** changed.";
  const listed = names.length === 1 ? names[0]
    : names.length === 2 ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
  const suffix = allAllowed
    ? `all are allowed by build-output contract ${WINDOW_OPENING_BUILD_OUTPUT_CONTRACT.version}.`
    : `at least one is rejected by build-output contract ${WINDOW_OPENING_BUILD_OUTPUT_CONTRACT.version}.`;
  return `${listed} changed; ${suffix}`;
}

export function createIgnoredBuildOutputObservation(before, after) {
  const beforeByPath = new Map(before.entries.map((entry) => [entry.path, entry]));
  const afterByPath = new Map(after.entries.map((entry) => [entry.path, entry]));
  const paths = [...new Set([...beforeByPath.keys(), ...afterByPath.keys()])]
    .sort(comparePaths);
  const changeRecords = paths.map((pathname) => {
    const beforeRecord = beforeByPath.get(pathname) ?? null;
    const afterRecord = afterByPath.get(pathname) ?? null;
    const preBuild = beforeRecord ? structuredClone(beforeRecord) : null;
    const postBuild = afterRecord ? structuredClone(afterRecord) : null;
    const changeKinds = changesBetween(preBuild, postBuild);
    const rule = matchedRule(pathname);
    const allowed = ruleAllows(rule, preBuild, postBuild, changeKinds);
    return {
      path: pathname,
      displayPath: rule?.displayPath ?? (pathname.endsWith("/") ? `${pathname}**` : pathname),
      changeKinds,
      preBuild,
      postBuild,
      matchedAllowlistRule: rule ? { id: rule.id, path: rule.path } : null,
      allowed,
      reason: reasonFor(rule, allowed, changeKinds),
    };
  });
  const changedPaths = changeRecords
    .filter((record) => !record.changeKinds.includes("unchanged"))
    .map((record) => record.displayPath);
  const allObservedChangesAllowed = changeRecords.every((record) => record.allowed);
  return {
    schemaVersion: "window-opening-ignored-build-output-observation/v1",
    contract: WINDOW_OPENING_BUILD_OUTPUT_CONTRACT,
    preBuildInventory: before,
    postBuildInventory: after,
    changeRecords,
    changedPaths,
    classification: describeIgnoredChanges(changeRecords, allObservedChangesAllowed),
    allObservedChangesAllowed,
  };
}

function assertInventory(inventory, label) {
  if (inventory?.schemaVersion !== "window-opening-ignored-state-inventory/v1" ||
      !Array.isArray(inventory.entries) ||
      JSON.stringify(inventory.discovery) !== JSON.stringify(WINDOW_OPENING_IGNORED_DISCOVERY)) {
    throw new Error(`${label} ignored inventory is missing or incomplete.`);
  }
  const paths = inventory.entries.map((entry) => entry.path);
  const sorted = [...paths].sort(comparePaths);
  if (new Set(paths).size !== paths.length || JSON.stringify(paths) !== JSON.stringify(sorted)) {
    throw new Error(`${label} ignored inventory paths are duplicate or non-canonical.`);
  }
  if (inventory.entries.some((entry) => path.isAbsolute(entry.path) ||
      entry.path === ".." || entry.path.startsWith("../") ||
      !entry.ignoredByGit || !entry.ignoreRule?.pattern ||
      typeof entry.ignoreRule.source !== "string" ||
      !Number.isSafeInteger(entry.ignoreRule.line) || entry.ignoreRule.line < 1 ||
      !["file", "directory", "symlink", "other"].includes(entry.type) ||
      !/^[0-7]{4}$/.test(entry.mode) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 ||
      !/^\d+$/.test(entry.modifiedTimeNs) || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      (entry.type === "directory" && !Number.isSafeInteger(entry.treeEntryCount)))) {
    throw new Error(`${label} ignored inventory contains an incomplete path record.`);
  }
  if (inventory.inventorySha256 !== sha256(JSON.stringify(inventory.entries))) {
    throw new Error(`${label} ignored inventory digest does not match its records.`);
  }
}

export function assertIgnoredBuildOutputObservation(observation, actualPostInventory = null) {
  if (observation?.schemaVersion !== "window-opening-ignored-build-output-observation/v1" ||
      JSON.stringify(observation.contract) !== JSON.stringify(WINDOW_OPENING_BUILD_OUTPUT_CONTRACT)) {
    throw new Error("Build ignored-output contract version or allowlist is invalid.");
  }
  assertInventory(observation.preBuildInventory, "Pre-build");
  assertInventory(observation.postBuildInventory, "Post-build");
  const calculated = createIgnoredBuildOutputObservation(
    observation.preBuildInventory, observation.postBuildInventory
  );
  for (const field of [
    "changeRecords", "changedPaths", "classification", "allObservedChangesAllowed",
  ]) {
    if (JSON.stringify(observation[field]) !== JSON.stringify(calculated[field])) {
      throw new Error(`Build ignored-output ${field} disagrees with independently calculated records.`);
    }
  }
  if (actualPostInventory) {
    assertInventory(actualPostInventory, "Current post-build");
    if (actualPostInventory.inventorySha256 !== observation.postBuildInventory.inventorySha256 ||
        JSON.stringify(actualPostInventory.entries) !==
          JSON.stringify(observation.postBuildInventory.entries)) {
      throw new Error("Build result belongs to another ignored post-build state identity.");
    }
  }
  if (!calculated.allObservedChangesAllowed) {
    throw new Error("Build changed an ignored path outside the explicit build-output contract.");
  }
  return calculated;
}
