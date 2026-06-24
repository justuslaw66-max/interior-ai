import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

type ArtifactManifestEntry = {
  path: string;
  sizeBytes: number;
  sha256: string;
};

type ArtifactManifest = {
  generatedAt: string;
  evidenceDir: string;
  fileCount: number;
  entries: ArtifactManifestEntry[];
};

const root = process.cwd();
const evidenceDir = "reports/staging-smoke-evidence-2026-06-24";
const manifestPath = join(root, evidenceDir, "artifact-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ArtifactManifest;

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function toRepoPath(name: string) {
  return `${evidenceDir}/${name}`;
}

assert.equal(manifest.evidenceDir, evidenceDir, "artifact manifest should point at the staging evidence directory.");
assert.match(manifest.generatedAt, /^2026-06-24T/, "artifact manifest should record the staging evidence date.");
assert.equal(manifest.fileCount, manifest.entries.length, "artifact manifest file count should match entries.");

const actualFiles = readdirSync(join(root, evidenceDir))
  .filter((name) => statSync(join(root, evidenceDir, name)).isFile())
  .filter((name) => name !== "artifact-manifest.json")
  .sort()
  .map(toRepoPath);
const manifestFiles = manifest.entries.map((entry) => entry.path).sort();
assert.deepEqual(manifestFiles, actualFiles, "artifact manifest should cover every evidence file exactly once.");

const requiredArtifacts = [
  "01-editor-open.png",
  "02-template-picker.png",
  "03-template-applied.png",
  "06-placement-preview.png",
  "11-signed-editor-loaded.png",
  "12-share-export.pdf",
  "12-share-page.png",
  "14-shopping-list.csv",
  "15-2d-plan.svg",
  "16-2d-plan.png",
  "17-cart-retailer-ready.png",
  "18-retest-editor-fingerprint.png",
  "19-retest-share-fingerprint.png",
  "20-retest-export-fingerprint.png",
  "feedback-reference-result.json",
  "other-checks-result.json",
  "retest-checkout-fingerprint-result.json",
  "smoke-result.json",
  "stable-alias-promotion-result.json",
];
for (const file of requiredArtifacts) {
  assert.ok(manifestFiles.includes(toRepoPath(file)), `artifact manifest should include ${file}.`);
}

const rawSecretNeedles = [
  "set-cookie:",
  "authorization:",
  "cookie:",
  ["x", "vercel", "protection", "bypass"].join("-"),
  ["_", "vercel", "jwt"].join(""),
];

for (const entry of manifest.entries) {
  assert.ok(entry.path.startsWith(`${evidenceDir}/`), `artifact should stay inside evidence directory: ${entry.path}`);
  assert.match(entry.sha256, /^[a-f0-9]{64}$/, `artifact should have a sha256 hash: ${entry.path}`);

  const absPath = resolve(root, entry.path);
  assert.ok(absPath.startsWith(root), `artifact must stay inside repository: ${entry.path}`);
  assert.ok(existsSync(absPath), `artifact should exist: ${entry.path}`);

  const bytes = readFileSync(absPath);
  assert.equal(bytes.length, entry.sizeBytes, `artifact size should match manifest: ${entry.path}`);
  assert.equal(sha256(bytes), entry.sha256, `artifact hash should match manifest: ${entry.path}`);

  const ext = extname(entry.path).toLowerCase();
  if (ext === ".png") {
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `PNG artifact should have a valid header: ${entry.path}`);
  } else if (ext === ".pdf") {
    assert.equal(bytes.subarray(0, 4).toString("utf8"), "%PDF", `PDF artifact should have a valid header: ${entry.path}`);
  } else if (ext === ".csv") {
    assert.match(bytes.toString("utf8"), /^Room,Category,Item,/, `CSV artifact should contain the shopping-list header: ${entry.path}`);
  } else if (ext === ".svg") {
    assert.match(bytes.toString("utf8"), /<svg[\s>]/, `SVG artifact should contain an svg root: ${entry.path}`);
  }

  if ([".json", ".csv", ".svg", ".md", ".txt"].includes(ext)) {
    const content = bytes.toString("utf8").toLowerCase();
    for (const needle of rawSecretNeedles) {
      assert.ok(!content.includes(needle), `text artifact should not store raw auth/protection headers: ${entry.path}`);
    }
  }
}

console.log(`Beta staging artifact manifest checks passed for ${manifest.fileCount} files.`);
