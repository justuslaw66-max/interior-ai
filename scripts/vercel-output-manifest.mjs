import { createHash } from "node:crypto";
import { lstat, readdir, readFile, readlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

export const outputRoot = path.resolve(".vercel/output");
export const manifestPath = path.resolve(".vercel/prebuilt-manifest.json");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function listEntries(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const paths = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(current, entry.name);
    const relativePath = path.relative(root, absolute).split(path.sep).join("/");
    if (entry.isDirectory()) paths.push(...(await listEntries(root, absolute)));
    else if (entry.isFile()) paths.push({ path: relativePath, type: "file" });
    else if (entry.isSymbolicLink()) paths.push({ path: relativePath, type: "symlink" });
    else throw new Error(`Unsupported artifact entry: ${absolute}`);
  }
  return paths;
}

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

export async function inspectVercelOutput() {
  const configPath = path.join(outputRoot, "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (config.version !== 3) {
    throw new Error(`Expected Build Output API version 3, received ${JSON.stringify(config.version)}.`);
  }

  const paths = await listEntries(outputRoot);
  const files = [];
  let bytes = 0;
  for (const entry of paths) {
    const absolute = path.join(outputRoot, entry.path);
    const content = entry.type === "symlink"
      ? Buffer.from(await readlink(absolute), "utf8")
      : await readFile(absolute);
    const metadata = await lstat(absolute);
    bytes += content.byteLength;
    files.push({
      path: entry.path,
      type: entry.type,
      bytes: content.byteLength,
      sha256: sha256(content),
      ...(entry.type === "symlink" ? { target: content.toString("utf8") } : {}),
    });
    if (entry.type === "file" && metadata.size !== content.byteLength) {
      throw new Error(`Artifact file changed while hashing: ${absolute}`);
    }
  }
  const digestInput = files
    .map((file) => `${file.type}  ${file.sha256}  ${file.bytes}  ${file.path}\n`)
    .join("");
  return {
    schema: "interior-ai.vercel-prebuilt-manifest.v1",
    buildOutputApiVersion: config.version,
    artifactRoot: ".vercel/output",
    artifactSha256: sha256(digestInput),
    fileCount: files.length,
    bytes,
    files,
  };
}

export async function createVercelOutputManifest() {
  const inspected = await inspectVercelOutput();
  const manifest = {
    ...inspected,
    gitCommit: git(["rev-parse", "HEAD"]),
    gitTreeStatus: git(["status", "--porcelain=v1", "--untracked-files=no"]) ? "dirty" : "clean",
    nodeVersion: process.version,
    createdAt: new Date().toISOString(),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(
    `Recorded .vercel/output ${manifest.artifactSha256} (${manifest.fileCount} files, ${manifest.bytes} bytes).`,
  );
  return manifest;
}

export async function verifyVercelOutputManifest() {
  const [recorded, inspected] = await Promise.all([
    readFile(manifestPath, "utf8").then(JSON.parse),
    inspectVercelOutput(),
  ]);
  for (const key of ["schema", "buildOutputApiVersion", "artifactSha256", "fileCount", "bytes"]) {
    if (recorded[key] !== inspected[key]) {
      throw new Error(
        `.vercel/output verification failed for ${key}: recorded ${recorded[key]}, actual ${inspected[key]}.`,
      );
    }
  }
  const currentCommit = git(["rev-parse", "HEAD"]);
  if (recorded.gitCommit !== currentCommit) {
    throw new Error(
      `.vercel/output was built from ${recorded.gitCommit}, but HEAD is ${currentCommit}.`,
    );
  }
  if (recorded.gitTreeStatus !== "clean" || git(["status", "--porcelain=v1", "--untracked-files=no"])) {
    throw new Error("The prebuilt artifact can only be verified from its clean tracked source tree.");
  }
  console.log(`Verified .vercel/output ${inspected.artifactSha256}.`);
  return recorded;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  if (process.argv.includes("--verify")) await verifyVercelOutputManifest();
  else await createVercelOutputManifest();
}
