import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, readlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

export const outputRoot = path.resolve(".vercel/output");
export const manifestPath = path.resolve(".vercel/prebuilt-manifest.json");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function comparePortablePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function listEntries(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const paths = [];
  for (const entry of entries.sort((a, b) => comparePortablePaths(a.name, b.name))) {
    const absolute = path.join(current, entry.name);
    const relativePath = path.relative(root, absolute).split(path.sep).join("/");
    if (entry.isDirectory()) paths.push(...(await listEntries(root, absolute)));
    else if (entry.isFile()) paths.push({ path: relativePath, type: "file" });
    else if (entry.isSymbolicLink()) paths.push({ path: relativePath, type: "symlink" });
    else throw new Error(`Unsupported artifact entry: ${absolute}`);
  }
  return paths;
}

function git(args, { trim = true, cwd = process.cwd() } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return trim ? result.stdout.trim() : result.stdout;
}

function allowedIgnoredVercelPath(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  const generatedRoots = [".next", ".vercel", "node_modules", "app/generated/prisma"];
  return (
    generatedRoots.some(
      (root) => normalized === root || normalized.startsWith(`${root}/`),
    ) ||
    normalized === "next-env.d.ts" ||
    normalized.endsWith(".tsbuildinfo")
  );
}

function inspectIgnoredInfluentialFiles(repositoryRoot) {
  return git(
    ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"],
    { trim: false, cwd: repositoryRoot },
  )
    .split("\0")
    .filter(Boolean)
    .filter((filePath) => !allowedIgnoredVercelPath(filePath))
    .sort(comparePortablePaths);
}

async function sha256File(filePath) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}

async function isEquivalentLfsNormalization(repositoryRoot, filePath) {
  const attribute = git(["check-attr", "filter", "--", filePath], { cwd: repositoryRoot });
  if (!attribute.endsWith(": filter: lfs")) return false;

  const indexEntry = git(["ls-files", "-s", "--", filePath], { cwd: repositoryRoot });
  const indexOid = indexEntry.match(/^\d+\s+([0-9a-f]{40,64})\s+\d+\t/)?.[1];
  if (!indexOid) return false;

  // Some historical GLBs are raw Git blobs even though a newer attribute now
  // routes GLBs through LFS. Compare their unfiltered worktree bytes directly.
  const worktreeOid = git(["hash-object", "--no-filters", "--", filePath], {
    cwd: repositoryRoot,
  });
  if (worktreeOid === indexOid) return true;

  // For a normal LFS entry, accept the smudged worktree file only when both its
  // byte length and SHA-256 match the pointer stored in the index.
  const indexBytes = Number(git(["cat-file", "-s", indexOid], { cwd: repositoryRoot }));
  if (!Number.isSafeInteger(indexBytes) || indexBytes > 1024) return false;
  const pointer = git(["cat-file", "blob", indexOid], { cwd: repositoryRoot });
  const pointerOid = pointer.match(/^oid sha256:([0-9a-f]{64})$/m)?.[1];
  const pointerBytes = Number(pointer.match(/^size (\d+)$/m)?.[1]);
  if (!pointerOid || !Number.isSafeInteger(pointerBytes)) return false;
  const absolutePath = path.join(repositoryRoot, filePath);
  const metadata = await lstat(absolutePath);
  return metadata.isFile()
    && metadata.size === pointerBytes
    && (await sha256File(absolutePath)) === pointerOid;
}

export async function inspectGitTree(repositoryRoot = process.cwd()) {
  const ignoredInfluentialFiles = inspectIgnoredInfluentialFiles(repositoryRoot);
  if (ignoredInfluentialFiles.length > 0) {
    return {
      clean: false,
      ignoredInfluentialFiles,
      lfsNormalizationEquivalentPathCount: 0,
    };
  }
  const status = git(
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { trim: false, cwd: repositoryRoot },
  );
  if (!status) {
    return {
      clean: true,
      ignoredInfluentialFiles: [],
      lfsNormalizationEquivalentPathCount: 0,
    };
  }

  const records = status.split("\0").filter(Boolean);
  const candidates = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const code = record.slice(0, 2);
    const filePath = record.slice(3);
    if (code !== " M") {
      return {
        clean: false,
        ignoredInfluentialFiles: [],
        lfsNormalizationEquivalentPathCount: 0,
      };
    }
    candidates.push(filePath);
  }

  const equivalents = await Promise.all(
    candidates.map((filePath) => isEquivalentLfsNormalization(repositoryRoot, filePath)),
  );
  return {
    clean: equivalents.every(Boolean),
    ignoredInfluentialFiles: [],
    lfsNormalizationEquivalentPathCount: equivalents.filter(Boolean).length,
  };
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
  const [inspected, gitTree] = await Promise.all([inspectVercelOutput(), inspectGitTree()]);
  const manifest = {
    ...inspected,
    gitCommit: git(["rev-parse", "HEAD"]),
    gitTreeStatus: gitTree.clean ? "clean" : "dirty",
    gitUntrackedFilesChecked: true,
    gitIgnoredInfluentialFilesChecked: true,
    gitIgnoredInfluentialFileCount: gitTree.ignoredInfluentialFiles.length,
    gitLfsNormalizationEquivalentPathCount: gitTree.lfsNormalizationEquivalentPathCount,
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
  const [recorded, inspected, gitTree] = await Promise.all([
    readFile(manifestPath, "utf8").then(JSON.parse),
    inspectVercelOutput(),
    inspectGitTree(),
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
  if (recorded.gitTreeStatus !== "clean" || !gitTree.clean) {
    throw new Error("The prebuilt artifact can only be verified from a clean source tree.");
  }
  if (recorded.gitUntrackedFilesChecked !== true) {
    throw new Error("The prebuilt artifact manifest did not verify untracked source files.");
  }
  if (
    recorded.gitIgnoredInfluentialFilesChecked !== true ||
    recorded.gitIgnoredInfluentialFileCount !== 0 ||
    gitTree.ignoredInfluentialFiles.length !== 0
  ) {
    throw new Error("The prebuilt artifact manifest did not reject ignored build inputs.");
  }
  console.log(`Verified .vercel/output ${inspected.artifactSha256}.`);
  return recorded;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  if (process.argv.includes("--verify")) await verifyVercelOutputManifest();
  else await createVercelOutputManifest();
}
