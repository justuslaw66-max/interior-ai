import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";

import {
  canonicalJsonBytes,
  isCandidateId,
  isSha256,
  isSourceSha,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import { NEXT_BUILD_GENERATED_TYPE_DECLARATION_PATH } from "./production-certification-build-generated-output.mjs";

export const PRODUCTION_CERTIFICATION_BROWSER_SERVER_LIFECYCLE_SCHEMA =
  "interior-ai.production-certification-browser-server-lifecycle.v2";
export const NEXT_DEV_GENERATED_TSCONFIG_INCLUDE =
  ".next/dev/dev/types/**/*.ts";
export const NEXT_DEV_GENERATED_OUTPUT_PATH = ".next/dev";
export const RETAILER_BROWSER_FIXTURE_OUTPUT_PATH =
  ".next/cache/retailer-confirmation-browser-fixture";
export const NEXT_DEV_GENERATED_TYPE_DECLARATION_BYTES = Buffer.from(
  [
    '/// <reference types="next" />',
    '/// <reference types="next/image-types/global" />',
    'import "./.next/dev/types/routes.d.ts";',
    "",
    "// NOTE: This file should not be edited",
    "// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.",
    "",
  ].join("\n"),
);

const EVIDENCE_SEAL_DOMAIN =
  "interior-ai.production-certification-browser-server-lifecycle-seal.v2\n";
const OUTPUT_INVENTORY_SEAL_DOMAIN =
  "interior-ai.production-certification-browser-server-output-inventory.v1\n";
const OWNERSHIP_SEAL_DOMAIN =
  "interior-ai.production-certification-browser-server-output-ownership.v1\n";
const DEVELOPMENT_SERVER_COMMAND = "npm run dev";
const DEVELOPMENT_SERVER_READINESS_URL = "http://127.0.0.1:3000";
const EXPECTED_TSCONFIG_ONLY_STATUS_SHA256 = sha256Bytes(
  Buffer.from(" M tsconfig.json\0"),
);
const MAXIMUM_GENERATED_PATH_COUNT = 100_000;

const COMMON_GENERATED_OUTPUTS = Object.freeze([
  Object.freeze({
    id: "next-development-output",
    relativePath: NEXT_DEV_GENERATED_OUTPUT_PATH,
    pathType: "directory",
    producer: "next-development-server",
    requiredOnSuccess: true,
    exactDescendants: null,
    contentContractSha256: null,
  }),
  Object.freeze({
    id: "next-development-type-declaration",
    relativePath: NEXT_BUILD_GENERATED_TYPE_DECLARATION_PATH,
    pathType: "file",
    producer: "next-development-server",
    requiredOnSuccess: true,
    exactDescendants: null,
    contentContractSha256: sha256Bytes(
      NEXT_DEV_GENERATED_TYPE_DECLARATION_BYTES,
    ),
  }),
]);

const OWNER_GENERATED_OUTPUTS = Object.freeze({
  cart: COMMON_GENERATED_OUTPUTS,
  retailer: Object.freeze([
    ...COMMON_GENERATED_OUTPUTS,
    Object.freeze({
      id: "retailer-confirmation-browser-fixture",
      relativePath: RETAILER_BROWSER_FIXTURE_OUTPUT_PATH,
      pathType: "directory",
      producer: "test:retailer-confirmation-static",
      requiredOnSuccess: true,
      exactDescendants: Object.freeze([
        Object.freeze({ path: "bundle.js", type: "file" }),
      ]),
      contentContractSha256: null,
    }),
  ]),
});

function sha256(value) {
  return sha256Bytes(value);
}

function portable(value) {
  return value.split(path.sep).join("/");
}

function pathInside(parent, child) {
  const root = path.resolve(parent);
  const target = path.resolve(child);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
}

function git(repositoryRoot, args, { allowFailure = false } = {}) {
  const child = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!allowFailure && (child.error || child.signal || child.status !== 0)) {
    throw new Error("browser-server generated-output Git owner failed closed");
  }
  return child;
}

function gitText(repositoryRoot, args) {
  return git(repositoryRoot, args).stdout.trim();
}

function pathInventory(raw) {
  return raw
    .split("\0")
    .filter(Boolean)
    .map(portable)
    .sort();
}

function normalizedInventory(paths) {
  return {
    count: paths.length,
    sha256: sha256(paths.map((value) => `${value}\n`).join("")),
  };
}

function lstatOrNull(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function assertRegularFile(filePath, label) {
  const metadata = lstatSync(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a physical regular file`);
  }
}

function assertPhysicalDirectory(directoryPath, label) {
  const metadata = lstatSync(directoryPath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a physical directory`);
  }
  return metadata;
}

function expectedGeneratedTsconfig(preBytes) {
  const parsed = JSON.parse(preBytes.toString("utf8"));
  if (!Array.isArray(parsed.include)) {
    throw new Error("browser-server tsconfig include contract is malformed");
  }
  if (parsed.include.includes(NEXT_DEV_GENERATED_TSCONFIG_INCLUDE)) {
    throw new Error("browser-server tsconfig contains unowned persistent dev output");
  }
  parsed.include.push(NEXT_DEV_GENERATED_TSCONFIG_INCLUDE);
  return Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`);
}

function sealEvidence(value) {
  const payload = structuredClone(value);
  delete payload.aggregateEvidenceSha256;
  return {
    ...payload,
    aggregateEvidenceSha256: sha256(
      Buffer.concat([Buffer.from(EVIDENCE_SEAL_DOMAIN), canonicalJsonBytes(payload)]),
    ),
  };
}

function lifecycleError(message, evidence = null) {
  const error = new Error(message);
  error.code = "BROWSER_SERVER_GENERATED_OUTPUT_REJECTED";
  error.safeEvidence = evidence;
  return error;
}

function ownedOutputPath(repositoryRoot, relativePath) {
  if (
    typeof relativePath !== "string" ||
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath
      .split("/")
      .some((component) => !component || component === "." || component === "..")
  ) {
    throw new Error(`browser generated-output path is unsafe: ${String(relativePath)}`);
  }
  const root = realpathSync(repositoryRoot);
  const target = path.resolve(root, ...relativePath.split("/"));
  if (target === root || !pathInside(root, target)) {
    throw new Error(`browser generated-output path escapes its worktree: ${relativePath}`);
  }
  return target;
}

function assertNoFollowComponents(repositoryRoot, absolutePath) {
  const root = realpathSync(repositoryRoot);
  const relative = path.relative(root, absolutePath);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error("browser generated-output path is outside its physical worktree");
  }
  let current = root;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    const metadata = lstatOrNull(current);
    if (!metadata) break;
    if (metadata.isSymbolicLink()) {
      throw new Error(
        `browser generated-output path contains a symlink: ${portable(relative)}`,
      );
    }
  }
}

function outputMatches(relativePath, declaration) {
  return declaration.pathType === "directory"
    ? relativePath === declaration.relativePath ||
        relativePath.startsWith(`${declaration.relativePath}/`)
    : relativePath === declaration.relativePath;
}

function ignoredPaths(repositoryRoot) {
  const result = git(repositoryRoot, [
    "ls-files",
    "--others",
    "--ignored",
    "--exclude-standard",
    "-z",
  ]);
  return pathInventory(result.stdout);
}

function dependencyPaths(paths) {
  return paths.filter(
    (relativePath) =>
      relativePath === "node_modules" ||
      relativePath.startsWith("node_modules/"),
  );
}

function exactGeneratedOutputs(ownerId) {
  const declarations = OWNER_GENERATED_OUTPUTS[ownerId];
  if (!declarations) {
    throw new Error("browser generated-output owner is unknown");
  }
  return declarations;
}

export function developmentBrowserGeneratedOutputDeclarations(ownerId) {
  return structuredClone(exactGeneratedOutputs(ownerId));
}

function generatedParentPaths(declarations) {
  const parents = new Set();
  for (const declaration of declarations) {
    let current = path.posix.dirname(declaration.relativePath);
    while (current !== ".") {
      parents.add(current);
      current = path.posix.dirname(current);
    }
  }
  return [...parents].sort(
    (left, right) => right.split("/").length - left.split("/").length,
  );
}

function assertIgnoredUntrackedDeclaration(repositoryRoot, declaration) {
  const ignored = git(repositoryRoot, [
    "check-ignore",
    "--verbose",
    "--no-index",
    "--",
    declaration.relativePath,
  ], { allowFailure: true });
  if (ignored.error || ignored.signal || ignored.status !== 0) {
    throw new Error(
      `browser generated output is not ignored: ${declaration.relativePath}`,
    );
  }
  const tracked = git(repositoryRoot, [
    "ls-files",
    "--error-unmatch",
    "--",
    declaration.relativePath,
  ], { allowFailure: true });
  if (tracked.error || tracked.signal || tracked.status !== 1) {
    throw new Error(
      `browser generated output must remain untracked: ${declaration.relativePath}`,
    );
  }
}

function nodeModulesIdentity(repositoryRoot) {
  const target = path.join(repositoryRoot, "node_modules");
  const metadata = assertPhysicalDirectory(
    target,
    "browser-server bound node_modules root",
  );
  const physical = realpathSync(target);
  if (!pathInside(repositoryRoot, physical)) {
    throw new Error("browser-server bound node_modules root escapes its worktree");
  }
  return {
    identitySha256: sha256(`${metadata.dev}:${metadata.ino}`),
    physicalRealpathSha256: sha256(physical),
  };
}

function cleanPreState(repositoryRoot, candidate, declarations) {
  const commitSha = gitText(repositoryRoot, ["rev-parse", "HEAD"]);
  const treeSha = gitText(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
  const branch = gitText(repositoryRoot, ["branch", "--show-current"]);
  const status = git(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]).stdout;
  const ignored = ignoredPaths(repositoryRoot);
  const persistentDependencyPaths = dependencyPaths(ignored);
  const unexpectedIgnoredPaths = ignored.filter(
    (relativePath) => !persistentDependencyPaths.includes(relativePath),
  );
  if (
    commitSha !== candidate.commitSha ||
    treeSha !== candidate.treeSha ||
    branch !== "" ||
    status !== "" ||
    unexpectedIgnoredPaths.length > 0
  ) {
    throw new Error(
      "browser-server lifecycle requires the clean detached development-browser candidate",
    );
  }
  for (const declaration of declarations) {
    assertIgnoredUntrackedDeclaration(repositoryRoot, declaration);
    const target = ownedOutputPath(repositoryRoot, declaration.relativePath);
    assertNoFollowComponents(repositoryRoot, target);
    if (lstatOrNull(target)) {
      throw new Error(
        `browser generated output belongs to a foreign attempt: ${declaration.relativePath}`,
      );
    }
  }
  const parentPaths = generatedParentPaths(declarations);
  for (const relativePath of parentPaths) {
    const target = ownedOutputPath(repositoryRoot, relativePath);
    assertNoFollowComponents(repositoryRoot, target);
    if (lstatOrNull(target)) {
      throw new Error(
        `browser generated-output parent belongs to a foreign attempt: ${relativePath}`,
      );
    }
  }
  return {
    commitSha,
    treeSha,
    statusSha256: sha256(status),
    persistentDependencyPaths,
    persistentDependencyInventory: normalizedInventory(persistentDependencyPaths),
    parentPaths,
    nodeModules: nodeModulesIdentity(repositoryRoot),
  };
}

function ownershipIdentity(lifecycle, declarations) {
  return sha256(
    Buffer.concat([
      Buffer.from(OWNERSHIP_SEAL_DOMAIN),
      canonicalJsonBytes({
        certificationId: lifecycle.certificationId,
        candidateId: lifecycle.candidate.id,
        candidateCommitSha: lifecycle.candidate.commitSha,
        candidateTreeSha: lifecycle.candidate.treeSha,
        ownerId: lifecycle.ownerId,
        stageAttempt: lifecycle.stageAttempt,
        worktreeIdentitySha256: lifecycle.worktreeIdentitySha256,
        dependencyBinding: lifecycle.dependencyBinding,
        outputs: declarations.map(({ id, relativePath, pathType, producer }) => ({
          id,
          relativePath,
          pathType,
          producer,
        })),
      }),
    ]),
  );
}

export function beginBrowserServerTrackedOutputLifecycle({
  repositoryRoot,
  candidate,
  certificationId,
  ownerId,
  stageAttempt,
  dependencyBinding,
  command = DEVELOPMENT_SERVER_COMMAND,
  readinessUrl = DEVELOPMENT_SERVER_READINESS_URL,
}) {
  if (
    !isCandidateId(candidate?.id) ||
    !isSourceSha(candidate?.commitSha) ||
    !isSourceSha(candidate?.treeSha) ||
    typeof certificationId !== "string" ||
    !certificationId ||
    !new Set(["cart", "retailer"]).has(ownerId) ||
    !Number.isSafeInteger(stageAttempt) ||
    stageAttempt < 1 ||
    command !== DEVELOPMENT_SERVER_COMMAND ||
    readinessUrl !== DEVELOPMENT_SERVER_READINESS_URL
  ) {
    throw new Error("browser-server lifecycle identity or server contract is invalid");
  }
  const requestedRoot = path.resolve(repositoryRoot);
  assertPhysicalDirectory(requestedRoot, "development-browser worktree root");
  const root = realpathSync(requestedRoot);
  const declarations = exactGeneratedOutputs(ownerId);
  const preState = cleanPreState(root, candidate, declarations);
  if (
    !exactKeys(dependencyBinding, [
      "bindingEvidenceSha256",
      "dependencyIdentitySha256",
      "dependencyInventorySha256",
      "nodeModulesRootIdentitySha256",
      "nodeModulesFilesystemIdentitySha256",
    ]) ||
    !Object.values(dependencyBinding).every(isSha256) ||
    dependencyBinding.nodeModulesRootIdentitySha256 !==
      preState.nodeModules.physicalRealpathSha256 ||
    dependencyBinding.nodeModulesFilesystemIdentitySha256 !==
      preState.nodeModules.identitySha256
  ) {
    throw new Error(
      "browser-server lifecycle dependency binding does not match node_modules",
    );
  }
  const tsconfigPath = path.join(root, "tsconfig.json");
  assertRegularFile(tsconfigPath, "browser-server tsconfig");
  const tsconfigPreBytes = readFileSync(tsconfigPath);
  const lifecycle = {
    repositoryRoot: root,
    candidate: Object.freeze({ ...candidate }),
    certificationId,
    ownerId,
    stageAttempt,
    dependencyBinding: Object.freeze({ ...dependencyBinding }),
    command,
    readinessUrl,
    preState,
    declarations,
    tsconfigPreBytes,
    tsconfigPreBlob: gitText(root, ["rev-parse", "HEAD:tsconfig.json"]),
    expectedGeneratedBytes: expectedGeneratedTsconfig(tsconfigPreBytes),
    worktreeIdentitySha256: sha256(root),
  };
  lifecycle.ownershipIdentitySha256 = ownershipIdentity(lifecycle, declarations);
  return Object.freeze(lifecycle);
}

function metadataIdentity(metadata) {
  return {
    device: metadata.dev,
    inode: metadata.ino,
    links: metadata.nlink,
    size: metadata.size,
    modifiedMilliseconds: metadata.mtimeMs,
  };
}

function sameMetadataIdentity(left, right) {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.links === right.links &&
    left.size === right.size &&
    left.modifiedMilliseconds === right.modifiedMilliseconds
  );
}

function sameDirectoryIdentity(left, right) {
  return left.device === right.device && left.inode === right.inode;
}

function fileInventory(repositoryRoot, absolutePath, relativePath, metadata) {
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    throw new Error(`browser generated output is not an exact regular file: ${relativePath}`);
  }
  if (!Number.isInteger(constants.O_NOFOLLOW)) {
    throw new Error("browser generated-output no-follow file opening is unavailable");
  }
  const descriptor = openSync(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const descriptorMetadata = fstatSync(descriptor);
    const identity = metadataIdentity(metadata);
    if (
      !descriptorMetadata.isFile() ||
      !sameMetadataIdentity(identity, metadataIdentity(descriptorMetadata))
    ) {
      throw new Error(
        `browser generated output changed during no-follow inventory: ${relativePath}`,
      );
    }
    const bytes = readFileSync(descriptor);
    return {
      safe: {
        path: relativePath,
        type: "file",
        size: bytes.byteLength,
        sha256: sha256(bytes),
        physicalIdentitySha256: sha256(canonicalJsonBytes(identity)),
      },
      private: { absolutePath, identity },
    };
  } finally {
    closeSync(descriptor);
  }
}

function directoryInventory(repositoryRoot, absolutePath, relativePath, metadata) {
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(
      `browser generated output is not a physical directory: ${relativePath}`,
    );
  }
  const physical = realpathSync(absolutePath);
  if (!pathInside(repositoryRoot, physical)) {
    throw new Error(`browser generated output escapes its worktree: ${relativePath}`);
  }
  return {
    safe: {
      path: relativePath,
      type: "directory",
      physicalIdentitySha256: sha256(
        canonicalJsonBytes(metadataIdentity(metadata)),
      ),
    },
    private: { absolutePath, identity: metadataIdentity(metadata) },
  };
}

function inventoryDirectoryDescendants(
  repositoryRoot,
  absoluteDirectory,
  relativeDirectory,
  entries,
) {
  for (const child of readdirSync(absoluteDirectory).sort()) {
    const absolutePath = path.join(absoluteDirectory, child);
    const relativePath = `${relativeDirectory}/${portable(child)}`;
    const metadata = lstatSync(absolutePath);
    if (metadata.isSymbolicLink()) {
      throw new Error(
        `browser generated-output directory contains a symlink: ${relativePath}`,
      );
    }
    const entry = metadata.isDirectory()
      ? directoryInventory(repositoryRoot, absolutePath, relativePath, metadata)
      : fileInventory(repositoryRoot, absolutePath, relativePath, metadata);
    entries.push(entry);
    if (metadata.isDirectory()) {
      inventoryDirectoryDescendants(
        repositoryRoot,
        absolutePath,
        relativePath,
        entries,
      );
    }
    if (entries.length > MAXIMUM_GENERATED_PATH_COUNT) {
      throw new Error("browser generated output exceeds its path-count contract");
    }
  }
}

function inventoryOutput(repositoryRoot, declaration) {
  const absolutePath = ownedOutputPath(repositoryRoot, declaration.relativePath);
  assertNoFollowComponents(repositoryRoot, absolutePath);
  const metadata = lstatOrNull(absolutePath);
  if (!metadata) return null;
  if (metadata.isSymbolicLink()) {
    throw new Error(`browser generated output is a symlink: ${declaration.relativePath}`);
  }
  const entries = [
    declaration.pathType === "directory"
      ? directoryInventory(
          repositoryRoot,
          absolutePath,
          declaration.relativePath,
          metadata,
        )
      : fileInventory(
          repositoryRoot,
          absolutePath,
          declaration.relativePath,
          metadata,
        ),
  ];
  if (declaration.pathType === "directory") {
    inventoryDirectoryDescendants(
      repositoryRoot,
      absolutePath,
      declaration.relativePath,
      entries,
    );
  }
  const safeEntries = entries.map((entry) => entry.safe);
  const fileEntries = safeEntries.filter((entry) => entry.type === "file");
  const exactDescendants = safeEntries.slice(1).map((entry) => ({
    path: entry.path.slice(declaration.relativePath.length + 1),
    type: entry.type,
  }));
  if (
    declaration.exactDescendants &&
    JSON.stringify(exactDescendants) !==
      JSON.stringify(declaration.exactDescendants)
  ) {
    throw new Error(
      `browser generated output has an altered exact inventory: ${declaration.relativePath}`,
    );
  }
  if (
    declaration.contentContractSha256 &&
    (fileEntries.length !== 1 ||
      fileEntries[0].sha256 !== declaration.contentContractSha256)
  ) {
    throw new Error(
      `browser generated output differs from its exact content contract: ${declaration.relativePath}`,
    );
  }
  const privateIdentity = entries.map((entry) => ({
    path: entry.safe.path,
    identity: entry.private.identity,
  }));
  return {
    absolutePath,
    entries,
    safeEntries,
    safeInventorySha256: sha256(
      Buffer.concat([
        Buffer.from(OUTPUT_INVENTORY_SEAL_DOMAIN),
        canonicalJsonBytes(safeEntries),
      ]),
    ),
    privateIdentitySha256: sha256(canonicalJsonBytes(privateIdentity)),
    totalBytes: fileEntries.reduce((total, entry) => total + entry.size, 0),
  };
}

function inspectTrackedTerminalState(lifecycle) {
  const root = lifecycle.repositoryRoot;
  const changedResult = git(
    root,
    ["diff", "--name-only", "-z", "HEAD", "--"],
    { allowFailure: true },
  );
  const stagedResult = git(
    root,
    ["diff", "--cached", "--name-only", "-z", "HEAD", "--"],
    { allowFailure: true },
  );
  const untrackedResult = git(
    root,
    ["ls-files", "--others", "--exclude-standard", "-z"],
    { allowFailure: true },
  );
  const statusResult = git(
    root,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { allowFailure: true },
  );
  const gitResults = [changedResult, stagedResult, untrackedResult, statusResult];
  if (
    gitResults.some(
      (result) => result.error || result.signal || result.status !== 0,
    )
  ) {
    return {
      status: null,
      changedPaths: null,
      stagedPaths: null,
      ordinaryUntrackedPaths: null,
      tsconfigPostBytes: null,
      mutationClassification: "not-observed",
      issues: ["terminal-inspection-failed"],
    };
  }
  const changedPaths = pathInventory(changedResult.stdout);
  const stagedPaths = pathInventory(stagedResult.stdout);
  const ordinaryUntrackedPaths = pathInventory(untrackedResult.stdout);
  const status = statusResult.stdout;
  const issues = [];
  const tsconfigPath = path.join(root, "tsconfig.json");
  let tsconfigPostBytes = Buffer.alloc(0);
  try {
    assertRegularFile(tsconfigPath, "browser-server terminal tsconfig");
    tsconfigPostBytes = readFileSync(tsconfigPath);
  } catch {
    issues.push("tsconfig-type");
  }
  if (stagedPaths.length > 0) issues.push("staged-paths");
  if (ordinaryUntrackedPaths.length > 0) issues.push("ordinary-untracked-paths");
  if (
    changedPaths.length > 1 ||
    (changedPaths.length === 1 && changedPaths[0] !== "tsconfig.json")
  ) {
    issues.push("unexpected-tracked-paths");
  }
  let mutationClassification = "absent";
  if (changedPaths.length === 0) {
    if (!tsconfigPostBytes.equals(lifecycle.tsconfigPreBytes)) {
      issues.push("unreported-tsconfig-change");
    }
  } else if (changedPaths.includes("tsconfig.json")) {
    if (tsconfigPostBytes.equals(lifecycle.expectedGeneratedBytes)) {
      mutationClassification = "deterministic-next-dev-generated";
    } else {
      mutationClassification = "unexpected";
      issues.push("unexpected-tsconfig-mutation");
    }
  } else {
    mutationClassification = "unexpected";
  }
  return {
    status,
    changedPaths,
    stagedPaths,
    ordinaryUntrackedPaths,
    tsconfigPostBytes,
    mutationClassification,
    issues,
  };
}

function inspectIgnoredTerminalState(lifecycle) {
  const paths = ignoredPaths(lifecycle.repositoryRoot);
  const dependency = dependencyPaths(paths);
  const generated = paths.filter((relativePath) =>
    lifecycle.declarations.some((declaration) =>
      outputMatches(relativePath, declaration),
    ),
  );
  const unexpected = paths.filter(
    (relativePath) =>
      !dependency.includes(relativePath) && !generated.includes(relativePath),
  );
  return {
    dependency,
    generated,
    unexpected,
    dependencyInventory: normalizedInventory(dependency),
    generatedInventory: normalizedInventory(generated),
    unexpectedInventory: normalizedInventory(unexpected),
  };
}

function exactUnlink(entry) {
  const metadata = lstatSync(entry.private.absolutePath);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    !sameMetadataIdentity(
      entry.private.identity,
      metadataIdentity(metadata),
    )
  ) {
    throw new Error(`browser generated-output cleanup target changed: ${entry.safe.path}`);
  }
  const descriptor = openSync(
    entry.private.absolutePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const descriptorIdentity = metadataIdentity(fstatSync(descriptor));
    if (!sameMetadataIdentity(entry.private.identity, descriptorIdentity)) {
      throw new Error(
        `browser generated-output cleanup descriptor changed: ${entry.safe.path}`,
      );
    }
    unlinkSync(entry.private.absolutePath);
    const unlinked = fstatSync(descriptor);
    if (
      unlinked.dev !== metadata.dev ||
      unlinked.ino !== metadata.ino ||
      unlinked.nlink !== 0
    ) {
      throw new Error(
        `browser generated-output exact cleanup unlinked another file: ${entry.safe.path}`,
      );
    }
  } finally {
    closeSync(descriptor);
  }
}

function cleanupOutput(repositoryRoot, declaration, sealedInventory) {
  const current = inventoryOutput(repositoryRoot, declaration);
  if (
    !current ||
    current.safeInventorySha256 !== sealedInventory.safeInventorySha256 ||
    current.privateIdentitySha256 !== sealedInventory.privateIdentitySha256
  ) {
    throw new Error(
      `browser generated output changed after evidence sealing: ${declaration.relativePath}`,
    );
  }
  const entries = [...sealedInventory.entries].reverse();
  let removedPathCount = 0;
  try {
    for (const entry of entries) {
      if (entry.safe.type === "file") {
        exactUnlink(entry);
      } else {
        const metadata = lstatSync(entry.private.absolutePath);
        if (
          metadata.isSymbolicLink() ||
          !metadata.isDirectory() ||
          !sameDirectoryIdentity(
            entry.private.identity,
            metadataIdentity(metadata),
          )
        ) {
          throw new Error(
            `browser generated-output cleanup directory changed: ${entry.safe.path}`,
          );
        }
        rmdirSync(entry.private.absolutePath);
      }
      removedPathCount += 1;
    }
  } catch (error) {
    if (error && typeof error === "object") {
      error.removedPathCount = removedPathCount;
    }
    throw error;
  }
  if (lstatOrNull(sealedInventory.absolutePath)) {
    throw new Error(
      `browser generated output survived exact cleanup: ${declaration.relativePath}`,
    );
  }
  return removedPathCount;
}

function restoreOwnedTsconfig(lifecycle, terminal) {
  const ownsExactTsconfigMutation =
    terminal.mutationClassification === "deterministic-next-dev-generated" &&
    Array.isArray(terminal.stagedPaths) &&
    !terminal.stagedPaths.includes("tsconfig.json");
  const restoredPaths = [];
  const issues = [];
  if (ownsExactTsconfigMutation) {
    const restored = git(
      lifecycle.repositoryRoot,
      ["restore", "--source=HEAD", "--worktree", "--", "tsconfig.json"],
      { allowFailure: true },
    );
    if (restored.error || restored.signal || restored.status !== 0) {
      issues.push("tracked-output-cleanup-failed");
    } else {
      restoredPaths.push("tsconfig.json");
    }
  }
  let byteIdentical = false;
  try {
    assertRegularFile(
      path.join(lifecycle.repositoryRoot, "tsconfig.json"),
      "browser-server restored tsconfig",
    );
    byteIdentical = readFileSync(
      path.join(lifecycle.repositoryRoot, "tsconfig.json"),
    ).equals(lifecycle.tsconfigPreBytes);
  } catch {
    issues.push("tracked-output-cleanup-observation-failed");
  }
  return { restoredPaths, byteIdentical, issues };
}

function removeEmptyOwnedParents(lifecycle) {
  const removedPaths = [];
  const issues = [];
  for (const relativePath of lifecycle.preState.parentPaths) {
    const target = ownedOutputPath(lifecycle.repositoryRoot, relativePath);
    const metadata = lstatOrNull(target);
    if (!metadata) continue;
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      issues.push(`generated-parent-type:${relativePath}`);
      continue;
    }
    try {
      rmdirSync(target);
      removedPaths.push(relativePath);
    } catch {
      issues.push(`generated-parent-not-empty:${relativePath}`);
    }
  }
  return { removedPaths, issues };
}

function terminalWorktreeState(lifecycle) {
  const statusResult = git(
    lifecycle.repositoryRoot,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { allowFailure: true },
  );
  const stagedResult = git(
    lifecycle.repositoryRoot,
    ["diff", "--cached", "--name-only", "-z", "HEAD", "--"],
    { allowFailure: true },
  );
  const ignored = ignoredPaths(lifecycle.repositoryRoot);
  const status = statusResult.status === 0 ? statusResult.stdout : null;
  const staged = stagedResult.status === 0 ? pathInventory(stagedResult.stdout) : null;
  const remainingGeneratedPaths = lifecycle.declarations
    .filter((declaration) =>
      lstatOrNull(
        ownedOutputPath(lifecycle.repositoryRoot, declaration.relativePath),
      ),
    )
    .map((declaration) => declaration.relativePath);
  const remainingParentPaths = lifecycle.preState.parentPaths.filter(
    (relativePath) =>
      lstatOrNull(ownedOutputPath(lifecycle.repositoryRoot, relativePath)),
  );
  let currentNodeModules = null;
  try {
    currentNodeModules = nodeModulesIdentity(lifecycle.repositoryRoot);
  } catch {
    // The terminal result below remains fail-closed.
  }
  const ignoredInventory = normalizedInventory(ignored);
  const expectedIgnoredInventory =
    lifecycle.preState.persistentDependencyInventory;
  const nodeModulesUnchanged =
    JSON.stringify(currentNodeModules) ===
    JSON.stringify(lifecycle.preState.nodeModules);
  return {
    statusSha256: status === null ? null : sha256(status),
    trackedAndOrdinaryUntrackedClean: status === "",
    indexClean: Array.isArray(staged) && staged.length === 0,
    ignoredInventory,
    expectedIgnoredInventory,
    ignoredInventoryUnchanged:
      JSON.stringify(ignoredInventory) ===
      JSON.stringify(expectedIgnoredInventory),
    remainingGeneratedPaths,
    remainingParentPaths,
    nodeModulesPresentAndUnchanged: nodeModulesUnchanged,
    complete:
      status === "" &&
      Array.isArray(staged) &&
      staged.length === 0 &&
      JSON.stringify(ignoredInventory) ===
        JSON.stringify(expectedIgnoredInventory) &&
      remainingGeneratedPaths.length === 0 &&
      remainingParentPaths.length === 0 &&
      nodeModulesUnchanged,
  };
}

function outputEvidence(declaration, inventory, cleanup) {
  return {
    id: declaration.id,
    relativePath: declaration.relativePath,
    pathType: declaration.pathType,
    producer: declaration.producer,
    requiredOnSuccess: declaration.requiredOnSuccess,
    contentContractSha256: declaration.contentContractSha256,
    produced: inventory !== null,
    physicalTypeValidated: inventory !== null,
    realpathContainmentValidated: inventory !== null,
    symlinksRejected: inventory !== null,
    entryCount: inventory?.safeEntries.length ?? 0,
    totalBytes: inventory?.totalBytes ?? 0,
    inventorySha256: inventory?.safeInventorySha256 ?? null,
    entries: inventory?.safeEntries ?? [],
    evidenceSealedBeforeCleanup: inventory !== null,
    cleanup,
  };
}

export function completeBrowserServerTrackedOutputLifecycle(
  lifecycle,
  {
    processExitCode,
    signal = null,
    dispatchError = false,
    testHooks = null,
  } = {},
) {
  const processExitObserved =
    Number.isSafeInteger(processExitCode) ||
    (typeof signal === "string" && signal.length > 0) ||
    dispatchError === true;
  const childSucceeded = processExitCode === 0 && signal === null && !dispatchError;
  const terminal = inspectTrackedTerminalState(lifecycle);
  const ignored = inspectIgnoredTerminalState(lifecycle);
  const issues = [...terminal.issues];
  if (!processExitObserved) issues.push("browser-owner-process-exit-not-observed");
  if (ignored.unexpected.length > 0) issues.push("unexpected-ignored-paths");
  if (
    JSON.stringify(ignored.dependency) !==
    JSON.stringify(lifecycle.preState.persistentDependencyPaths)
  ) {
    issues.push("node-modules-ignored-inventory-changed");
  }

  const inventories = new Map();
  const inventoryFailures = new Map();
  for (const declaration of lifecycle.declarations) {
    try {
      const inventory = inventoryOutput(lifecycle.repositoryRoot, declaration);
      if (!inventory && childSucceeded && declaration.requiredOnSuccess) {
        throw new Error(
          `required browser generated output is missing: ${declaration.relativePath}`,
        );
      }
      inventories.set(declaration.id, inventory);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      inventoryFailures.set(declaration.id, message);
      issues.push(message);
    }
  }

  const sealedOutputInventorySha256 = sha256(
    Buffer.concat([
      Buffer.from(OUTPUT_INVENTORY_SEAL_DOMAIN),
      canonicalJsonBytes(
        lifecycle.declarations.map((declaration) => ({
          id: declaration.id,
          inventorySha256:
            inventories.get(declaration.id)?.safeInventorySha256 ?? null,
          inventoryFailure: inventoryFailures.get(declaration.id) ?? null,
        })),
      ),
    ]),
  );
  testHooks?.afterEvidenceSealed?.({
    sealedOutputInventorySha256,
    repositoryRoot: lifecycle.repositoryRoot,
  });

  const cleanupById = new Map();
  for (const declaration of lifecycle.declarations) {
    const inventory = inventories.get(declaration.id);
    if (!inventory) {
      cleanupById.set(declaration.id, {
        attempted: false,
        removedPathCount: 0,
        postCleanupAbsenceProof:
          !lstatOrNull(
            ownedOutputPath(lifecycle.repositoryRoot, declaration.relativePath),
          ),
      });
      continue;
    }
    try {
      const removedPathCount = cleanupOutput(
        lifecycle.repositoryRoot,
        declaration,
        inventory,
      );
      cleanupById.set(declaration.id, {
        attempted: true,
        removedPathCount,
        postCleanupAbsenceProof: true,
      });
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
      cleanupById.set(declaration.id, {
        attempted: true,
        removedPathCount: Number.isSafeInteger(error?.removedPathCount)
          ? error.removedPathCount
          : 0,
        postCleanupAbsenceProof: false,
      });
    }
  }

  const trackedCleanup = restoreOwnedTsconfig(lifecycle, terminal);
  issues.push(...trackedCleanup.issues);
  const parentCleanup = removeEmptyOwnedParents(lifecycle);
  issues.push(...parentCleanup.issues);
  const terminalWorktree = terminalWorktreeState(lifecycle);
  if (!terminalWorktree.complete) issues.push("terminal-worktree-not-clean");

  const generatedOutputs = lifecycle.declarations.map((declaration) =>
    outputEvidence(
      declaration,
      inventories.get(declaration.id) ?? null,
      cleanupById.get(declaration.id),
    ),
  );
  const cleanup = {
    performed: true,
    exactOutputPaths: lifecycle.declarations.map(
      (declaration) => declaration.relativePath,
    ),
    removedEmptyParentPaths: parentCleanup.removedPaths,
    restoredTrackedPaths: trackedCleanup.restoredPaths,
    tsconfigRestoredByteIdentical: trackedCleanup.byteIdentical,
    nodeModulesPreserved: terminalWorktree.nodeModulesPresentAndUnchanged,
    postCleanupAbsenceProof: generatedOutputs.every(
      (output) => output.cleanup.postCleanupAbsenceProof === true,
    ),
  };
  const uniqueIssues = [...new Set(issues)];
  const evidence = sealEvidence({
    schema: PRODUCTION_CERTIFICATION_BROWSER_SERVER_LIFECYCLE_SCHEMA,
    owner: "scripts/production-certification-browser-server-lifecycle.mjs",
    executionClass: "real-candidate",
    certificationId: lifecycle.certificationId,
    candidateId: lifecycle.candidate.id,
    ownerId: lifecycle.ownerId,
    stageAttempt: lifecycle.stageAttempt,
    candidateCommitSha: lifecycle.candidate.commitSha,
    candidateTreeSha: lifecycle.candidate.treeSha,
    worktreeRole: "development-browser",
    worktreeIdentitySha256: lifecycle.worktreeIdentitySha256,
    dependencyBinding: lifecycle.dependencyBinding,
    ownershipIdentitySha256: lifecycle.ownershipIdentitySha256,
    server: {
      command: lifecycle.command,
      cwdRole: "development-browser",
      readinessUrl: lifecycle.readinessUrl,
      retries: 0,
    },
    process: {
      exitCode: Number.isSafeInteger(processExitCode) ? processExitCode : null,
      signal: typeof signal === "string" && signal ? signal : null,
      dispatchError: dispatchError === true,
      exitObservedBeforeFinalization: processExitObserved,
    },
    finalizationOrdering: [
      "browser-owner-process-exit-observed",
      "generated-output-evidence-sealed",
      "exact-generated-output-cleanup",
      "tracked-output-cleanup",
      "terminal-worktree-validation",
    ],
    sealedOutputInventorySha256,
    generatedOutputs,
    trackedOutput: {
      physicalObservation: true,
      preStatusSha256: lifecycle.preState.statusSha256,
      postStatusSha256:
        terminal.status === null ? null : sha256(terminal.status),
      changedPaths: terminal.changedPaths,
      changedPathCount: terminal.changedPaths?.length ?? null,
      stagedPathCount: terminal.stagedPaths?.length ?? null,
      ordinaryUntrackedPathCount:
        terminal.ordinaryUntrackedPaths?.length ?? null,
      mutationClassification: terminal.mutationClassification,
      expectedGeneratedInclude: NEXT_DEV_GENERATED_TSCONFIG_INCLUDE,
      tsconfigPreBlob: lifecycle.tsconfigPreBlob,
      tsconfigPreSha256: sha256(lifecycle.tsconfigPreBytes),
      tsconfigPostSha256:
        terminal.tsconfigPostBytes === null
          ? null
          : sha256(terminal.tsconfigPostBytes),
      expectedGeneratedSha256: sha256(lifecycle.expectedGeneratedBytes),
      issues: uniqueIssues,
    },
    ignoredOutputBoundary: {
      dependencyInventory: ignored.dependencyInventory,
      generatedInventory: ignored.generatedInventory,
      unexpectedInventory: ignored.unexpectedInventory,
    },
    cleanup,
    terminalWorktree,
    complete: uniqueIssues.length === 0 && cleanup.postCleanupAbsenceProof,
  });
  if (!evidence.complete) {
    throw lifecycleError(
      "browser-server generated-output lifecycle failed closed",
      evidence,
    );
  }
  return Object.freeze(evidence);
}

export function simulatedBrowserServerTrackedOutputLifecycle({
  repositoryRoot,
  candidate,
  certificationId,
  ownerId,
  stageAttempt,
  dependencyBinding,
}) {
  if (
    !isCandidateId(candidate?.id) ||
    !isSourceSha(candidate?.commitSha) ||
    !isSourceSha(candidate?.treeSha) ||
    typeof certificationId !== "string" ||
    !certificationId ||
    !new Set(["cart", "retailer"]).has(ownerId) ||
    !Number.isSafeInteger(stageAttempt) ||
    stageAttempt < 1
  ) {
    throw new Error("simulated browser-server lifecycle identity is invalid");
  }
  const requestedRoot = path.resolve(repositoryRoot);
  assertPhysicalDirectory(requestedRoot, "simulated development-browser root");
  const root = realpathSync(requestedRoot);
  const declarations = exactGeneratedOutputs(ownerId);
  const preState = cleanPreState(root, candidate, declarations);
  if (
    !exactKeys(dependencyBinding, [
      "bindingEvidenceSha256",
      "dependencyIdentitySha256",
      "dependencyInventorySha256",
      "nodeModulesRootIdentitySha256",
      "nodeModulesFilesystemIdentitySha256",
    ]) ||
    !Object.values(dependencyBinding).every(isSha256) ||
    dependencyBinding.nodeModulesRootIdentitySha256 !==
      preState.nodeModules.physicalRealpathSha256 ||
    dependencyBinding.nodeModulesFilesystemIdentitySha256 !==
      preState.nodeModules.identitySha256
  ) {
    throw new Error(
      "simulated browser-server lifecycle dependency binding does not match node_modules",
    );
  }
  const lifecycle = {
    certificationId,
    candidate,
    ownerId,
    stageAttempt,
    worktreeIdentitySha256: sha256(root),
    dependencyBinding: Object.freeze({ ...dependencyBinding }),
  };
  const ownershipIdentitySha256 = ownershipIdentity(lifecycle, declarations);
  const generatedOutputs = declarations.map((declaration) => ({
    id: declaration.id,
    relativePath: declaration.relativePath,
    pathType: declaration.pathType,
    producer: declaration.producer,
    requiredOnSuccess: declaration.requiredOnSuccess,
    contentContractSha256: declaration.contentContractSha256,
    produced: false,
    physicalTypeValidated: false,
    realpathContainmentValidated: false,
    symlinksRejected: false,
    entryCount: 0,
    totalBytes: 0,
    inventorySha256: null,
    entries: [],
    evidenceSealedBeforeCleanup: false,
    cleanup: {
      attempted: false,
      removedPathCount: 0,
      postCleanupAbsenceProof: true,
    },
  }));
  const emptyInventory = normalizedInventory([]);
  return Object.freeze(
    sealEvidence({
      schema: PRODUCTION_CERTIFICATION_BROWSER_SERVER_LIFECYCLE_SCHEMA,
      owner: "scripts/production-certification-browser-server-lifecycle.mjs",
      executionClass: "deterministic-simulation",
      certificationId,
      candidateId: candidate.id,
      ownerId,
      stageAttempt,
      candidateCommitSha: candidate.commitSha,
      candidateTreeSha: candidate.treeSha,
      worktreeRole: "development-browser",
      worktreeIdentitySha256: sha256(root),
      dependencyBinding: lifecycle.dependencyBinding,
      ownershipIdentitySha256,
      server: {
        command: DEVELOPMENT_SERVER_COMMAND,
        cwdRole: "development-browser",
        readinessUrl: DEVELOPMENT_SERVER_READINESS_URL,
        retries: 0,
      },
      process: {
        exitCode: 0,
        signal: null,
        dispatchError: false,
        exitObservedBeforeFinalization: true,
      },
      finalizationOrdering: [
        "browser-owner-process-exit-observed",
        "generated-output-evidence-sealed",
        "exact-generated-output-cleanup",
        "tracked-output-cleanup",
        "terminal-worktree-validation",
      ],
      sealedOutputInventorySha256: sha256(
        Buffer.concat([
          Buffer.from(OUTPUT_INVENTORY_SEAL_DOMAIN),
          canonicalJsonBytes(
            declarations.map((declaration) => ({
              id: declaration.id,
              inventorySha256: null,
              inventoryFailure: null,
            })),
          ),
        ]),
      ),
      generatedOutputs,
      trackedOutput: {
        physicalObservation: false,
        preStatusSha256: preState.statusSha256,
        mutationClassification: "not-observed-in-simulation",
        issues: [],
      },
      ignoredOutputBoundary: {
        dependencyInventory: preState.persistentDependencyInventory,
        generatedInventory: emptyInventory,
        unexpectedInventory: emptyInventory,
      },
      cleanup: {
        performed: false,
        exactOutputPaths: declarations.map(
          (declaration) => declaration.relativePath,
        ),
        removedEmptyParentPaths: [],
        restoredTrackedPaths: [],
        tsconfigRestoredByteIdentical: true,
        nodeModulesPreserved: true,
        postCleanupAbsenceProof: true,
      },
      terminalWorktree: {
        statusSha256: preState.statusSha256,
        trackedAndOrdinaryUntrackedClean: true,
        indexClean: true,
        ignoredInventory: preState.persistentDependencyInventory,
        expectedIgnoredInventory: preState.persistentDependencyInventory,
        ignoredInventoryUnchanged: true,
        remainingGeneratedPaths: [],
        remainingParentPaths: [],
        nodeModulesPresentAndUnchanged: true,
        complete: true,
      },
      complete: true,
    }),
  );
}

function outputEvidenceValid(output, declaration, executionClass) {
  const commonValid =
    exactKeys(output, [
      "id",
      "relativePath",
      "pathType",
      "producer",
      "requiredOnSuccess",
      "contentContractSha256",
      "produced",
      "physicalTypeValidated",
      "realpathContainmentValidated",
      "symlinksRejected",
      "entryCount",
      "totalBytes",
      "inventorySha256",
      "entries",
      "evidenceSealedBeforeCleanup",
      "cleanup",
    ]) &&
    output.id === declaration.id &&
    output.relativePath === declaration.relativePath &&
    output.pathType === declaration.pathType &&
    output.producer === declaration.producer &&
    output.requiredOnSuccess === declaration.requiredOnSuccess &&
    output.contentContractSha256 === declaration.contentContractSha256 &&
    exactKeys(output.cleanup, [
      "attempted",
      "removedPathCount",
      "postCleanupAbsenceProof",
    ]) &&
    output.cleanup.postCleanupAbsenceProof === true;
  if (!commonValid) return false;
  if (executionClass === "deterministic-simulation") {
    return (
      output.produced === false &&
      output.physicalTypeValidated === false &&
      output.realpathContainmentValidated === false &&
      output.symlinksRejected === false &&
      output.entryCount === 0 &&
      output.totalBytes === 0 &&
      output.inventorySha256 === null &&
      Array.isArray(output.entries) &&
      output.entries.length === 0 &&
      output.evidenceSealedBeforeCleanup === false &&
      output.cleanup.attempted === false &&
      output.cleanup.removedPathCount === 0
    );
  }
  const entryPaths = Array.isArray(output.entries)
    ? output.entries.map((entry) => entry?.path)
    : [];
  const entriesValid =
    Array.isArray(output.entries) &&
    output.entries.every((entry, index) => {
      const pathValid =
        typeof entry?.path === "string" &&
        path.posix.normalize(entry.path) === entry.path &&
        !entry.path.includes("\\") &&
        (index === 0
          ? entry.path === declaration.relativePath
          : entry.path.startsWith(`${declaration.relativePath}/`));
      if (entry?.type === "directory") {
        return (
          pathValid &&
          exactKeys(entry, ["path", "type", "physicalIdentitySha256"]) &&
          isSha256(entry.physicalIdentitySha256)
        );
      }
      return (
        entry?.type === "file" &&
        pathValid &&
        exactKeys(entry, [
          "path",
          "type",
          "size",
          "sha256",
          "physicalIdentitySha256",
        ]) &&
        Number.isSafeInteger(entry.size) &&
        entry.size >= 0 &&
        isSha256(entry.sha256) &&
        isSha256(entry.physicalIdentitySha256)
      );
    }) &&
    new Set(entryPaths).size === entryPaths.length &&
    output.entries[0]?.type === declaration.pathType &&
    output.totalBytes ===
      output.entries
        .filter((entry) => entry.type === "file")
        .reduce((total, entry) => total + entry.size, 0) &&
    output.inventorySha256 ===
      sha256(
        Buffer.concat([
          Buffer.from(OUTPUT_INVENTORY_SEAL_DOMAIN),
          canonicalJsonBytes(output.entries),
        ]),
      );
  const exactDescendantInventory = output.entries.slice(1).map((entry) => ({
    path: entry.path.slice(declaration.relativePath.length + 1),
    type: entry.type,
  }));
  const exactDescendantsValid =
    declaration.exactDescendants === null ||
    JSON.stringify(exactDescendantInventory) ===
      JSON.stringify(declaration.exactDescendants);
  const contentValid =
    declaration.contentContractSha256 === null ||
    (output.entries.length === 1 &&
      output.entries[0]?.type === "file" &&
      output.entries[0].sha256 === declaration.contentContractSha256);
  return (
    output.produced === true &&
    output.physicalTypeValidated === true &&
    output.realpathContainmentValidated === true &&
    output.symlinksRejected === true &&
    Number.isSafeInteger(output.entryCount) &&
    output.entryCount > 0 &&
    Number.isSafeInteger(output.totalBytes) &&
    output.totalBytes >= 0 &&
    isSha256(output.inventorySha256) &&
    Array.isArray(output.entries) &&
    output.entries.length === output.entryCount &&
    entriesValid &&
    exactDescendantsValid &&
    contentValid &&
    output.evidenceSealedBeforeCleanup === true &&
    output.cleanup.attempted === true &&
    Number.isSafeInteger(output.cleanup.removedPathCount) &&
    output.cleanup.removedPathCount === output.entryCount
  );
}

function normalizedInventoryValid(value) {
  return (
    exactKeys(value, ["count", "sha256"]) &&
    Number.isSafeInteger(value.count) &&
    value.count >= 0 &&
    isSha256(value.sha256)
  );
}

export function browserServerTrackedOutputEvidenceIssues(
  evidence,
  expectedIdentity = null,
) {
  const issues = [];
  const declarations = OWNER_GENERATED_OUTPUTS[evidence?.ownerId] ?? [];
  const expectedOwnershipIdentitySha256 = sha256(
    Buffer.concat([
      Buffer.from(OWNERSHIP_SEAL_DOMAIN),
      canonicalJsonBytes({
        certificationId: evidence?.certificationId,
        candidateId: evidence?.candidateId,
        candidateCommitSha: evidence?.candidateCommitSha,
        candidateTreeSha: evidence?.candidateTreeSha,
        ownerId: evidence?.ownerId,
        stageAttempt: evidence?.stageAttempt,
        worktreeIdentitySha256: evidence?.worktreeIdentitySha256,
        dependencyBinding: evidence?.dependencyBinding,
        outputs: declarations.map(({ id, relativePath, pathType, producer }) => ({
          id,
          relativePath,
          pathType,
          producer,
        })),
      }),
    ]),
  );
  const expectedSealedOutputInventorySha256 = sha256(
    Buffer.concat([
      Buffer.from(OUTPUT_INVENTORY_SEAL_DOMAIN),
      canonicalJsonBytes(
        (evidence?.generatedOutputs ?? []).map((output) => ({
          id: output?.id,
          inventorySha256: output?.inventorySha256 ?? null,
          inventoryFailure: null,
        })),
      ),
    ]),
  );
  const commonValid =
    exactKeys(evidence, [
      "schema",
      "owner",
      "executionClass",
      "certificationId",
      "candidateId",
      "ownerId",
      "stageAttempt",
      "candidateCommitSha",
      "candidateTreeSha",
      "worktreeRole",
      "worktreeIdentitySha256",
      "dependencyBinding",
      "ownershipIdentitySha256",
      "server",
      "process",
      "finalizationOrdering",
      "sealedOutputInventorySha256",
      "generatedOutputs",
      "trackedOutput",
      "ignoredOutputBoundary",
      "cleanup",
      "terminalWorktree",
      "complete",
      "aggregateEvidenceSha256",
    ]) &&
    evidence?.schema === PRODUCTION_CERTIFICATION_BROWSER_SERVER_LIFECYCLE_SCHEMA &&
    evidence?.owner ===
      "scripts/production-certification-browser-server-lifecycle.mjs" &&
    new Set(["real-candidate", "deterministic-simulation"]).has(
      evidence?.executionClass,
    ) &&
    typeof evidence?.certificationId === "string" &&
    evidence.certificationId.length > 0 &&
    isCandidateId(evidence?.candidateId) &&
    declarations.length > 0 &&
    Number.isSafeInteger(evidence?.stageAttempt) &&
    evidence.stageAttempt > 0 &&
    evidence?.worktreeRole === "development-browser" &&
    isSourceSha(evidence?.candidateCommitSha) &&
    isSourceSha(evidence?.candidateTreeSha) &&
    isSha256(evidence?.worktreeIdentitySha256) &&
    exactKeys(evidence?.dependencyBinding, [
      "bindingEvidenceSha256",
      "dependencyIdentitySha256",
      "dependencyInventorySha256",
      "nodeModulesRootIdentitySha256",
      "nodeModulesFilesystemIdentitySha256",
    ]) &&
    Object.values(evidence.dependencyBinding).every(isSha256) &&
    (expectedIdentity === null ||
      (evidence.candidateId === expectedIdentity.candidateId &&
        evidence.dependencyBinding.bindingEvidenceSha256 ===
          expectedIdentity.bindingEvidenceSha256 &&
        evidence.dependencyBinding.dependencyIdentitySha256 ===
          expectedIdentity.dependencyIdentitySha256 &&
        evidence.dependencyBinding.dependencyInventorySha256 ===
          expectedIdentity.dependencyInventorySha256 &&
        evidence.dependencyBinding.nodeModulesRootIdentitySha256 ===
          expectedIdentity.nodeModulesRootIdentitySha256 &&
        evidence.dependencyBinding.nodeModulesFilesystemIdentitySha256 ===
          expectedIdentity.nodeModulesFilesystemIdentitySha256)) &&
    evidence?.ownershipIdentitySha256 === expectedOwnershipIdentitySha256 &&
    evidence?.sealedOutputInventorySha256 ===
      expectedSealedOutputInventorySha256 &&
    exactKeys(evidence?.server, [
      "command",
      "cwdRole",
      "readinessUrl",
      "retries",
    ]) &&
    evidence.server.command === DEVELOPMENT_SERVER_COMMAND &&
    evidence.server.cwdRole === "development-browser" &&
    evidence.server.readinessUrl === DEVELOPMENT_SERVER_READINESS_URL &&
    evidence.server.retries === 0 &&
    exactKeys(evidence?.process, [
      "exitCode",
      "signal",
      "dispatchError",
      "exitObservedBeforeFinalization",
    ]) &&
    evidence.process.exitCode === 0 &&
    evidence.process.signal === null &&
    evidence.process.dispatchError === false &&
    evidence.process.exitObservedBeforeFinalization === true &&
    JSON.stringify(evidence?.finalizationOrdering) ===
      JSON.stringify([
        "browser-owner-process-exit-observed",
        "generated-output-evidence-sealed",
        "exact-generated-output-cleanup",
        "tracked-output-cleanup",
        "terminal-worktree-validation",
      ]) &&
    Array.isArray(evidence?.generatedOutputs) &&
    evidence.generatedOutputs.length === declarations.length &&
    evidence.generatedOutputs.every((output, index) =>
      outputEvidenceValid(output, declarations[index], evidence.executionClass),
    ) &&
    evidence?.complete === true &&
    evidence?.aggregateEvidenceSha256 ===
      sealEvidence(evidence).aggregateEvidenceSha256;

  const emptySha256 = sha256(Buffer.alloc(0));
  const trackedValid =
    evidence?.executionClass === "real-candidate"
      ? exactKeys(evidence?.trackedOutput, [
          "physicalObservation",
          "preStatusSha256",
          "postStatusSha256",
          "changedPaths",
          "changedPathCount",
          "stagedPathCount",
          "ordinaryUntrackedPathCount",
          "mutationClassification",
          "expectedGeneratedInclude",
          "tsconfigPreBlob",
          "tsconfigPreSha256",
          "tsconfigPostSha256",
          "expectedGeneratedSha256",
          "issues",
        ]) &&
        evidence.trackedOutput?.physicalObservation === true &&
        evidence.trackedOutput.preStatusSha256 === emptySha256 &&
        isSha256(evidence.trackedOutput.postStatusSha256) &&
        Array.isArray(evidence.trackedOutput.changedPaths) &&
        evidence.trackedOutput.changedPathCount ===
          evidence.trackedOutput.changedPaths.length &&
        evidence.trackedOutput.stagedPathCount === 0 &&
        evidence.trackedOutput.ordinaryUntrackedPathCount === 0 &&
        evidence.trackedOutput.expectedGeneratedInclude ===
          NEXT_DEV_GENERATED_TSCONFIG_INCLUDE &&
        isSourceSha(evidence.trackedOutput.tsconfigPreBlob) &&
        isSha256(evidence.trackedOutput.tsconfigPreSha256) &&
        isSha256(evidence.trackedOutput.tsconfigPostSha256) &&
        isSha256(evidence.trackedOutput.expectedGeneratedSha256) &&
        Array.isArray(evidence.trackedOutput.issues) &&
        evidence.trackedOutput.issues.length === 0 &&
        ((evidence.trackedOutput.mutationClassification === "absent" &&
          evidence.trackedOutput.changedPathCount === 0 &&
          evidence.trackedOutput.postStatusSha256 === emptySha256 &&
          evidence.trackedOutput.tsconfigPostSha256 ===
            evidence.trackedOutput.tsconfigPreSha256 &&
          evidence.cleanup?.restoredTrackedPaths?.length === 0) ||
          (evidence.trackedOutput.mutationClassification ===
            "deterministic-next-dev-generated" &&
            evidence.trackedOutput.changedPathCount === 1 &&
            evidence.trackedOutput.changedPaths[0] === "tsconfig.json" &&
            evidence.trackedOutput.postStatusSha256 ===
              EXPECTED_TSCONFIG_ONLY_STATUS_SHA256 &&
            evidence.trackedOutput.tsconfigPostSha256 ===
              evidence.trackedOutput.expectedGeneratedSha256 &&
            JSON.stringify(evidence.cleanup?.restoredTrackedPaths) ===
              JSON.stringify(["tsconfig.json"])))
      : exactKeys(evidence?.trackedOutput, [
          "physicalObservation",
          "preStatusSha256",
          "mutationClassification",
          "issues",
        ]) &&
        evidence.trackedOutput.physicalObservation === false &&
        evidence.trackedOutput.preStatusSha256 === emptySha256 &&
        evidence.trackedOutput.mutationClassification ===
          "not-observed-in-simulation" &&
        Array.isArray(evidence.trackedOutput.issues) &&
        evidence.trackedOutput.issues.length === 0;

  const cleanupValid =
    exactKeys(evidence?.cleanup, [
      "performed",
      "exactOutputPaths",
      "removedEmptyParentPaths",
      "restoredTrackedPaths",
      "tsconfigRestoredByteIdentical",
      "nodeModulesPreserved",
      "postCleanupAbsenceProof",
    ]) &&
    evidence.cleanup.performed ===
      (evidence?.executionClass === "real-candidate") &&
    JSON.stringify(evidence?.cleanup?.exactOutputPaths) ===
      JSON.stringify(declarations.map((entry) => entry.relativePath)) &&
    Array.isArray(evidence?.cleanup?.removedEmptyParentPaths) &&
    (evidence?.executionClass === "deterministic-simulation" ||
      JSON.stringify(evidence.cleanup.removedEmptyParentPaths) ===
        JSON.stringify(generatedParentPaths(declarations))) &&
    Array.isArray(evidence?.cleanup?.restoredTrackedPaths) &&
    evidence?.cleanup?.tsconfigRestoredByteIdentical === true &&
    evidence?.cleanup?.nodeModulesPreserved === true &&
    evidence?.cleanup?.postCleanupAbsenceProof === true;

  const terminalValid =
    exactKeys(evidence?.terminalWorktree, [
      "statusSha256",
      "trackedAndOrdinaryUntrackedClean",
      "indexClean",
      "ignoredInventory",
      "expectedIgnoredInventory",
      "ignoredInventoryUnchanged",
      "remainingGeneratedPaths",
      "remainingParentPaths",
      "nodeModulesPresentAndUnchanged",
      "complete",
    ]) &&
    evidence.terminalWorktree.statusSha256 === emptySha256 &&
    evidence?.terminalWorktree?.trackedAndOrdinaryUntrackedClean === true &&
    evidence?.terminalWorktree?.indexClean === true &&
    normalizedInventoryValid(evidence?.terminalWorktree?.ignoredInventory) &&
    evidence.terminalWorktree.ignoredInventory.count > 0 &&
    normalizedInventoryValid(
      evidence?.terminalWorktree?.expectedIgnoredInventory,
    ) &&
    JSON.stringify(evidence.terminalWorktree.ignoredInventory) ===
      JSON.stringify(evidence.terminalWorktree.expectedIgnoredInventory) &&
    evidence?.terminalWorktree?.ignoredInventoryUnchanged === true &&
    Array.isArray(evidence?.terminalWorktree?.remainingGeneratedPaths) &&
    evidence.terminalWorktree.remainingGeneratedPaths.length === 0 &&
    Array.isArray(evidence?.terminalWorktree?.remainingParentPaths) &&
    evidence.terminalWorktree.remainingParentPaths.length === 0 &&
    evidence?.terminalWorktree?.nodeModulesPresentAndUnchanged === true &&
    evidence?.terminalWorktree?.complete === true;

  const ignoredBoundaryValid =
    exactKeys(evidence?.ignoredOutputBoundary, [
      "dependencyInventory",
      "generatedInventory",
      "unexpectedInventory",
    ]) &&
    normalizedInventoryValid(evidence.ignoredOutputBoundary.dependencyInventory) &&
    evidence.ignoredOutputBoundary.dependencyInventory.count > 0 &&
    normalizedInventoryValid(evidence.ignoredOutputBoundary.generatedInventory) &&
    normalizedInventoryValid(evidence.ignoredOutputBoundary.unexpectedInventory) &&
    evidence.ignoredOutputBoundary.unexpectedInventory.count === 0 &&
    evidence.ignoredOutputBoundary.unexpectedInventory.sha256 === emptySha256 &&
    JSON.stringify(evidence.ignoredOutputBoundary.dependencyInventory) ===
      JSON.stringify(evidence.terminalWorktree?.expectedIgnoredInventory) &&
    (evidence.executionClass === "deterministic-simulation"
      ? evidence.ignoredOutputBoundary.generatedInventory.count === 0 &&
        evidence.ignoredOutputBoundary.generatedInventory.sha256 === emptySha256
      : evidence.ignoredOutputBoundary.generatedInventory.count > 0);

  if (
    !commonValid ||
    !trackedValid ||
    !cleanupValid ||
    !terminalValid ||
    !ignoredBoundaryValid
  ) {
    issues.push("browser-server generated-output evidence is invalid or incomplete");
  }
  return issues;
}
