#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const defaultOutput = path.join(rootDir, ".local", "asset-inventory.json");
const roots = [
  "catalog",
  "public/assets/catalog",
  "public/assets/floor-plans",
  "public/assets/models",
  "public/assets/thumbs",
];

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function walk(directory, files) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolutePath, files);
    else if (entry.isFile()) files.push(absolutePath);
  }
}

function sha256(filePath) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function buildInventory() {
  const files = [];
  for (const relativeRoot of roots) walk(path.join(rootDir, relativeRoot), files);
  files.sort((left, right) => left.localeCompare(right));

  const entries = files.map((filePath) => {
    const stats = fs.statSync(filePath);
    return {
      path: path.relative(rootDir, filePath),
      bytes: stats.size,
      sha256: sha256(filePath),
    };
  });

  return {
    format: "interior_ai.asset_inventory.v1",
    generatedAt: new Date().toISOString(),
    roots,
    fileCount: entries.length,
    totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    zeroByteFileCount: entries.filter((entry) => entry.bytes === 0).length,
    zeroByteFiles: entries.filter((entry) => entry.bytes === 0).map((entry) => entry.path),
    files: entries,
  };
}

function comparable(inventory) {
  return inventory.files.map(({ path: filePath, bytes, sha256: digest }) => ({
    path: filePath,
    bytes,
    sha256: digest,
  }));
}

const verifyPath = readArgument("--verify");
const strict = process.argv.includes("--strict");
const inventory = buildInventory();

if (verifyPath) {
  const expected = JSON.parse(fs.readFileSync(path.resolve(verifyPath), "utf8"));
  const matches = JSON.stringify(comparable(inventory)) === JSON.stringify(comparable(expected));
  if (!matches) {
    console.error(`Asset inventory differs from ${verifyPath}`);
    process.exit(1);
  }
  console.log(`Asset inventory verified: ${inventory.fileCount} files`);
  if (strict && inventory.zeroByteFileCount > 0) {
    console.error(`Asset inventory contains ${inventory.zeroByteFileCount} zero-byte files.`);
    process.exit(1);
  }
  process.exit(0);
}

const outputPath = path.resolve(readArgument("--output") ?? defaultOutput);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(`Asset inventory: ${inventory.fileCount} files, ${inventory.totalBytes} bytes`);
if (inventory.zeroByteFileCount > 0) {
  console.warn(`Zero-byte files: ${inventory.zeroByteFileCount}`);
}
console.log(`Written to ${outputPath}`);
if (strict && inventory.zeroByteFileCount > 0) process.exit(1);
