import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import {
  PRODUCTION_VERIFIER_CLOSURE_SCHEMA,
  canonicalJsonBytes,
  sha256Bytes,
} from "./production-certification-contract.mjs";

export const PRODUCTION_VERIFIER_ENTRYPOINTS = Object.freeze([
  "scripts/production-artifact-evidence.mjs",
  "scripts/production-certification-evidence.mjs",
]);

export const PRODUCTION_VERIFIER_DATA_INPUTS = Object.freeze([
  "scripts/required-test-manifest.json",
  "docs/qa/production-certification-source-generated-outputs.v1.json",
]);

const IMPORT_PATTERNS = Object.freeze([
  /^\s*import\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gm,
  /^\s*export\s+[^;]*?\s+from\s+["']([^"']+)["']/gm,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
]);

function portable(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function contained(root, candidate) {
  return candidate.startsWith(`${root}${path.sep}`);
}

function containedRegularFile(repositoryRoot, relativePath) {
  const root = path.resolve(repositoryRoot);
  const absolutePath = path.resolve(root, relativePath);
  if (!contained(root, absolutePath)) {
    throw new Error(`verifier source escapes repository: ${relativePath}`);
  }
  let metadata;
  try {
    metadata = lstatSync(absolutePath);
  } catch {
    throw new Error(`verifier source is missing: ${relativePath}`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`verifier source must be a physical regular file: ${relativePath}`);
  }
  const resolved = realpathSync(absolutePath);
  if (!contained(realpathSync(root), resolved)) {
    throw new Error(`verifier source realpath escapes repository: ${relativePath}`);
  }
  return { absolutePath, relativePath: portable(path.relative(root, absolutePath)) };
}

function importSpecifiers(source) {
  const specifiers = [];
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
      specifiers.push(match[1]);
    }
  }
  return [...new Set(specifiers)]
    .filter((specifier) => !specifier.includes("${"))
    .sort();
}

function resolveLocalSpecifier(repositoryRoot, importer, specifier) {
  if (!specifier.startsWith(".")) {
    if (!specifier.startsWith("node:")) {
      throw new Error(
        `verifier source has prohibited package/global fallback import ${specifier} from ${importer}`,
      );
    }
    return null;
  }
  const importerDirectory = path.dirname(path.join(repositoryRoot, importer));
  const candidate = path.resolve(importerDirectory, specifier);
  const candidates = path.extname(candidate)
    ? [candidate]
    : [candidate, `${candidate}.mjs`, `${candidate}.js`, `${candidate}.json`];
  const resolved = candidates.find((entry) => existsSync(entry));
  if (!resolved) {
    throw new Error(`verifier local import is missing: ${importer} -> ${specifier}`);
  }
  return containedRegularFile(
    repositoryRoot,
    path.relative(repositoryRoot, resolved),
  ).relativePath;
}

export function deriveProductionVerifierClosure(repositoryRoot) {
  const queue = [...PRODUCTION_VERIFIER_ENTRYPOINTS];
  const visited = new Set();
  const edges = [];
  while (queue.length > 0) {
    const relativePath = queue.shift();
    if (visited.has(relativePath)) continue;
    const file = containedRegularFile(repositoryRoot, relativePath);
    visited.add(file.relativePath);
    if (path.extname(file.absolutePath) === ".json") continue;
    const source = readFileSync(file.absolutePath, "utf8");
    for (const specifier of importSpecifiers(source)) {
      const resolved = resolveLocalSpecifier(
        repositoryRoot,
        file.relativePath,
        specifier,
      );
      edges.push({
        importer: file.relativePath,
        specifier,
        resolution: resolved ?? specifier,
        kind: resolved ? "local" : "node-builtin",
      });
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  for (const dataPath of PRODUCTION_VERIFIER_DATA_INPUTS) {
    visited.add(containedRegularFile(repositoryRoot, dataPath).relativePath);
  }
  const files = [...visited].sort().map((relativePath) => {
    const bytes = readFileSync(path.join(repositoryRoot, relativePath));
    return { path: relativePath, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
  });
  edges.sort((left, right) =>
    `${left.importer}\0${left.specifier}`.localeCompare(
      `${right.importer}\0${right.specifier}`,
    ),
  );
  const closureSha256 = sha256Bytes(
    files
      .map((file) => `${file.sha256}  ${file.bytes}  ${file.path}\n`)
      .join(""),
  );
  const edgeLedgerSha256 = sha256Bytes(canonicalJsonBytes(edges));
  return Object.freeze({
    schema: PRODUCTION_VERIFIER_CLOSURE_SCHEMA,
    entrypoints: [...PRODUCTION_VERIFIER_ENTRYPOINTS],
    dataInputs: [...PRODUCTION_VERIFIER_DATA_INPUTS],
    files,
    edges,
    closureSha256,
    edgeLedgerSha256,
    missingImports: [],
    escapingImports: [],
    destinationCollisions: [],
    sourceWorktreeFallback: false,
    globalModuleFallback: false,
  });
}
