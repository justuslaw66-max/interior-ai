import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  canonicalJsonBytes,
  isSha256,
  isSourceSha,
  sha256Bytes,
} from "./production-certification-contract.mjs";

export const PRODUCTION_CERTIFICATION_BUILD_GENERATED_OUTPUT_SCHEMA =
  "interior-ai.production-certification-build-generated-output-lifecycle.v1";
export const PRODUCTION_CERTIFICATION_FAILED_BUILD_GENERATED_OUTPUT_SCHEMA =
  "interior-ai.production-certification-failed-build-generated-output-lifecycle.v1";

export const NEXT_BUILD_GENERATED_TYPE_DECLARATION_PATH = "next-env.d.ts";

export const NEXT_BUILD_GENERATED_TYPE_DECLARATION_BYTES = Buffer.from(
  [
    '/// <reference types="next" />',
    '/// <reference types="next/image-types/global" />',
    'import "./.next/types/routes.d.ts";',
    "",
    "// NOTE: This file should not be edited",
    "// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.",
    "",
  ].join("\n"),
);

const IDENTITY_KEYS = Object.freeze([
  "certificationId",
  "candidateId",
  "commitSha",
  "treeSha",
  "nextBuildId",
  "artifactSha256",
  "productionManifestSha256",
  "semanticJournalSha256",
  "semanticJournalNonce",
]);

const FAILED_BUILD_IDENTITY_KEYS = Object.freeze([
  "certificationId",
  "candidateId",
  "commitSha",
  "treeSha",
  "stage",
  "attempt",
  "classification",
  "consumedSubstantiveGate",
  "semanticJournalNonce",
]);

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
}

function runGit(repositoryRoot, args) {
  return spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function assertIgnoredUntrackedOutput(repositoryRoot) {
  const ignored = runGit(repositoryRoot, [
    "check-ignore",
    "--verbose",
    "--no-index",
    "--",
    NEXT_BUILD_GENERATED_TYPE_DECLARATION_PATH,
  ]);
  const [ignoreRule = "", ignoredPath = ""] = String(ignored.stdout ?? "")
    .trim()
    .split("\t");
  const ignorePattern = ignoreRule.split(":").at(-1);
  if (
    ignored.error ||
    ignored.signal ||
    ignored.status !== 0 ||
    ignorePattern !== NEXT_BUILD_GENERATED_TYPE_DECLARATION_PATH ||
    ignoredPath !== NEXT_BUILD_GENERATED_TYPE_DECLARATION_PATH
  ) {
    throw new Error("next-env.d.ts is not an exact ignored build output");
  }
  const tracked = runGit(repositoryRoot, [
    "ls-files",
    "--error-unmatch",
    "--",
    NEXT_BUILD_GENERATED_TYPE_DECLARATION_PATH,
  ]);
  if (tracked.error || tracked.signal || tracked.status !== 1) {
    throw new Error("next-env.d.ts must remain untracked build output");
  }
}

function outputPath(repositoryRoot) {
  const root = path.resolve(repositoryRoot);
  const target = path.resolve(root, NEXT_BUILD_GENERATED_TYPE_DECLARATION_PATH);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error("build generated output escapes its repository root");
  }
  return target;
}

function lstatIfPresent(target) {
  try {
    return lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function assertIdentity(identity) {
  if (
    !exactKeys(identity, IDENTITY_KEYS) ||
    typeof identity.certificationId !== "string" ||
    !identity.certificationId ||
    typeof identity.candidateId !== "string" ||
    !identity.candidateId ||
    !isSourceSha(identity.commitSha) ||
    !isSourceSha(identity.treeSha) ||
    typeof identity.nextBuildId !== "string" ||
    !identity.nextBuildId ||
    !isSha256(identity.artifactSha256) ||
    !isSha256(identity.productionManifestSha256) ||
    !isSha256(identity.semanticJournalSha256) ||
    typeof identity.semanticJournalNonce !== "string" ||
    !identity.semanticJournalNonce
  ) {
    throw new Error("build generated-output identity is malformed");
  }
}

function assertFailedBuildIdentity(identity) {
  if (
    !exactKeys(identity, FAILED_BUILD_IDENTITY_KEYS) ||
    typeof identity.certificationId !== "string" ||
    !identity.certificationId ||
    typeof identity.candidateId !== "string" ||
    !identity.candidateId ||
    !isSourceSha(identity.commitSha) ||
    !isSourceSha(identity.treeSha) ||
    identity.stage !== "build" ||
    !Number.isSafeInteger(identity.attempt) ||
    identity.attempt < 1 ||
    typeof identity.classification !== "string" ||
    !identity.classification ||
    typeof identity.consumedSubstantiveGate !== "boolean" ||
    typeof identity.semanticJournalNonce !== "string" ||
    !identity.semanticJournalNonce
  ) {
    throw new Error("failed build generated-output identity is malformed");
  }
}

export function preflightCertificationBuildGeneratedOutput({ repositoryRoot }) {
  assertIgnoredUntrackedOutput(repositoryRoot);
  const target = outputPath(repositoryRoot);
  if (lstatIfPresent(target)) {
    throw new Error("next-env.d.ts must be absent before the strict build");
  }
  return Object.freeze({
    relativePath: NEXT_BUILD_GENERATED_TYPE_DECLARATION_PATH,
    producerCommand: "npm run build",
    preBuildAbsenceProof: true,
    ignoredByGit: true,
    trackedByGit: false,
  });
}

function assertGeneratedOutputPreflight(preflight) {
  if (
    !exactKeys(preflight, [
      "relativePath",
      "producerCommand",
      "preBuildAbsenceProof",
      "ignoredByGit",
      "trackedByGit",
    ]) ||
    preflight.relativePath !== NEXT_BUILD_GENERATED_TYPE_DECLARATION_PATH ||
    preflight.producerCommand !== "npm run build" ||
    preflight.preBuildAbsenceProof !== true ||
    preflight.ignoredByGit !== true ||
    preflight.trackedByGit !== false
  ) {
    throw new Error("build generated-output preflight is malformed");
  }
}

function sealAndCleanupCertificationBuildGeneratedOutput({
  repositoryRoot,
  preflight,
  identity,
  schema,
  testHooks = null,
}) {
  assertGeneratedOutputPreflight(preflight);
  assertIgnoredUntrackedOutput(repositoryRoot);
  const target = outputPath(repositoryRoot);
  const pathMetadata = lstatIfPresent(target);
  if (!pathMetadata) {
    throw new Error("next-env.d.ts was not produced by the strict build");
  }
  if (!pathMetadata.isFile() || pathMetadata.isSymbolicLink()) {
    throw new Error("next-env.d.ts is not a physical regular generated file");
  }
  let descriptor;
  let bytes;
  try {
    if (!Number.isInteger(constants.O_NOFOLLOW)) {
      throw new Error("no-follow file opening is unavailable");
    }
    descriptor = openSync(
      target,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const descriptorMetadata = fstatSync(descriptor);
    if (
      !descriptorMetadata.isFile() ||
      descriptorMetadata.dev !== pathMetadata.dev ||
      descriptorMetadata.ino !== pathMetadata.ino ||
      descriptorMetadata.nlink !== 1
    ) {
      throw new Error("next-env.d.ts changed identity during no-follow inventory");
    }
    bytes = readFileSync(descriptor);
    if (!bytes.equals(NEXT_BUILD_GENERATED_TYPE_DECLARATION_BYTES)) {
      throw new Error(
        "next-env.d.ts differs from the current strict build contract",
      );
    }
    const cleanupMetadata = lstatIfPresent(target);
    if (
      !cleanupMetadata ||
      cleanupMetadata.isSymbolicLink() ||
      !cleanupMetadata.isFile() ||
      cleanupMetadata.dev !== descriptorMetadata.dev ||
      cleanupMetadata.ino !== descriptorMetadata.ino ||
      cleanupMetadata.nlink !== 1 ||
      cleanupMetadata.size !== bytes.byteLength ||
      cleanupMetadata.mtimeMs !== descriptorMetadata.mtimeMs
    ) {
      throw new Error("next-env.d.ts changed identity before exact cleanup");
    }
    testHooks?.beforeExactUnlink?.({ target });
    unlinkSync(target);
    const unlinkedMetadata = fstatSync(descriptor);
    if (
      unlinkedMetadata.dev !== descriptorMetadata.dev ||
      unlinkedMetadata.ino !== descriptorMetadata.ino ||
      unlinkedMetadata.nlink !== 0
    ) {
      throw new Error("next-env.d.ts exact cleanup unlinked a different file");
    }
    if (lstatIfPresent(target)) {
      throw new Error("next-env.d.ts exact cleanup did not prove absence");
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const payload = {
    schema,
    identity: { ...identity },
    output: {
      relativePath: NEXT_BUILD_GENERATED_TYPE_DECLARATION_PATH,
      pathType: "file",
      producerCommand: "npm run build",
      bytes: bytes.byteLength,
      sha256: sha256Bytes(bytes),
      contentContractSha256: sha256Bytes(
        NEXT_BUILD_GENERATED_TYPE_DECLARATION_BYTES,
      ),
      preBuildAbsenceProof: true,
      ignoredByGit: true,
      trackedByGit: false,
      physicalRegularFile: true,
    },
    cleanup: {
      owner: "certification-build-generated-output",
      method: "exact-file-unlink",
      postCleanupAbsenceProof: true,
    },
    complete: true,
  };
  return Object.freeze({
    ...payload,
    seal: {
      algorithm: "sha256",
      sha256: sha256Bytes(canonicalJsonBytes(payload)),
    },
  });
}

export function finalizeCertificationBuildGeneratedOutput(options) {
  assertIdentity(options.identity);
  return sealAndCleanupCertificationBuildGeneratedOutput({
    ...options,
    schema: PRODUCTION_CERTIFICATION_BUILD_GENERATED_OUTPUT_SCHEMA,
  });
}

export function finalizeCertificationFailedBuildGeneratedOutput(options) {
  assertFailedBuildIdentity(options.identity);
  return sealAndCleanupCertificationBuildGeneratedOutput({
    ...options,
    schema: PRODUCTION_CERTIFICATION_FAILED_BUILD_GENERATED_OUTPUT_SCHEMA,
  });
}

function generatedOutputIssues(
  evidence,
  expectedIdentity,
  { schema, assertEvidenceIdentity },
) {
  const issues = [];
  if (
    !exactKeys(evidence, [
      "schema",
      "identity",
      "output",
      "cleanup",
      "complete",
      "seal",
    ]) ||
    evidence.schema !== schema
  ) {
    return ["build generated-output lifecycle schema is invalid"];
  }
  try {
    assertEvidenceIdentity(evidence.identity);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  if (
    expectedIdentity &&
    JSON.stringify(evidence.identity) !== JSON.stringify(expectedIdentity)
  ) {
    issues.push("build generated-output identity does not match the candidate");
  }
  if (
    !exactKeys(evidence.output, [
      "relativePath",
      "pathType",
      "producerCommand",
      "bytes",
      "sha256",
      "contentContractSha256",
      "preBuildAbsenceProof",
      "ignoredByGit",
      "trackedByGit",
      "physicalRegularFile",
    ]) ||
    evidence.output.relativePath !== NEXT_BUILD_GENERATED_TYPE_DECLARATION_PATH ||
    evidence.output.pathType !== "file" ||
    evidence.output.producerCommand !== "npm run build" ||
    evidence.output.bytes !== NEXT_BUILD_GENERATED_TYPE_DECLARATION_BYTES.byteLength ||
    evidence.output.sha256 !==
      sha256Bytes(NEXT_BUILD_GENERATED_TYPE_DECLARATION_BYTES) ||
    evidence.output.contentContractSha256 !==
      sha256Bytes(NEXT_BUILD_GENERATED_TYPE_DECLARATION_BYTES) ||
    evidence.output.preBuildAbsenceProof !== true ||
    evidence.output.ignoredByGit !== true ||
    evidence.output.trackedByGit !== false ||
    evidence.output.physicalRegularFile !== true
  ) {
    issues.push("build generated-output inventory is invalid");
  }
  if (
    !exactKeys(evidence.cleanup, [
      "owner",
      "method",
      "postCleanupAbsenceProof",
    ]) ||
    evidence.cleanup.owner !== "certification-build-generated-output" ||
    evidence.cleanup.method !== "exact-file-unlink" ||
    evidence.cleanup.postCleanupAbsenceProof !== true ||
    evidence.complete !== true
  ) {
    issues.push("build generated-output cleanup evidence is invalid");
  }
  const { seal, ...payload } = evidence;
  if (
    !exactKeys(seal, ["algorithm", "sha256"]) ||
    seal.algorithm !== "sha256" ||
    !isSha256(seal.sha256) ||
    seal.sha256 !== sha256Bytes(canonicalJsonBytes(payload))
  ) {
    issues.push("build generated-output lifecycle seal is invalid");
  }
  return issues;
}


export function certificationBuildGeneratedOutputIssues(
  evidence,
  expectedIdentity,
) {
  return generatedOutputIssues(evidence, expectedIdentity, {
    schema: PRODUCTION_CERTIFICATION_BUILD_GENERATED_OUTPUT_SCHEMA,
    assertEvidenceIdentity: assertIdentity,
  });
}

export function certificationFailedBuildGeneratedOutputIssues(
  evidence,
  expectedIdentity,
) {
  return generatedOutputIssues(evidence, expectedIdentity, {
    schema: PRODUCTION_CERTIFICATION_FAILED_BUILD_GENERATED_OUTPUT_SCHEMA,
    assertEvidenceIdentity: assertFailedBuildIdentity,
  });
}
