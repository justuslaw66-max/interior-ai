import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  PRODUCTION_CERTIFICATION_SOURCE_GENERATED_OUTPUT_EVIDENCE_SCHEMA,
  canonicalJsonBytes,
  isCanonicalUtcTimestamp,
  isSha256,
  sha256Bytes,
  sourceValidationCheckSet,
} from "./production-certification-contract.mjs";
import { sourceValidationWorktreeOutputState } from "./production-certification-worktrees.mjs";

const GENERATED_OUTPUT_EVIDENCE_SEAL_DOMAIN =
  "interior-ai.production-certification-source-generated-output-evidence-seal.v1\n";
const GENERATED_OUTPUT_INVENTORY_SEAL_DOMAIN =
  "interior-ai.production-certification-source-generated-output-inventory-seal.v1\n";
const GENERATED_OUTPUT_AGGREGATE_SEAL_DOMAIN =
  "interior-ai.production-certification-source-generated-output-aggregate-seal.v1\n";

function portable(value) {
  return value.split(path.sep).join("/");
}

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
}

function pathInside(parent, child) {
  const root = path.resolve(parent);
  const target = path.resolve(child);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function lexicalOutputPath(repositoryRoot, relativePath) {
  if (
    typeof relativePath !== "string" ||
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath.split("/").some((component) => !component || component === "." || component === "..")
  ) {
    throw new Error(`generated-output path is unsafe: ${String(relativePath)}`);
  }
  const physicalRoot = realpathSync(repositoryRoot);
  const absolute = path.resolve(physicalRoot, ...relativePath.split("/"));
  if (!pathInside(physicalRoot, absolute) || absolute === physicalRoot) {
    throw new Error(`generated-output path escapes the source worktree: ${relativePath}`);
  }
  return absolute;
}

function lstatOrNull(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function noFollowPathComponents(repositoryRoot, absolutePath) {
  const root = realpathSync(repositoryRoot);
  const relative = path.relative(root, absolutePath);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error("generated-output path is outside the physical source worktree");
  }
  let current = root;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    const metadata = lstatOrNull(current);
    if (!metadata) break;
    if (metadata.isSymbolicLink()) {
      throw new Error(`generated-output path contains a symlink: ${portable(relative)}`);
    }
  }
}

function inventorySha256(entries) {
  return sha256Bytes(
    Buffer.concat([
      Buffer.from(GENERATED_OUTPUT_INVENTORY_SEAL_DOMAIN),
      canonicalJsonBytes(entries),
    ]),
  );
}

function inventoryOutput(repositoryRoot, output) {
  const absolutePath = lexicalOutputPath(repositoryRoot, output.relativePath);
  noFollowPathComponents(repositoryRoot, absolutePath);
  const metadata = lstatOrNull(absolutePath);
  if (!metadata) {
    throw new Error(`required generated output is missing: ${output.relativePath}`);
  }
  if (metadata.isSymbolicLink()) {
    throw new Error(`generated output is a symlink: ${output.relativePath}`);
  }
  const entries = [];
  if (output.pathType === "file") {
    if (!metadata.isFile()) {
      throw new Error(`generated output is not a regular file: ${output.relativePath}`);
    }
    const bytes = readFileSync(absolutePath);
    entries.push({
      path: output.relativePath,
      type: "file",
      size: bytes.byteLength,
      sha256: sha256Bytes(bytes),
    });
  } else {
    if (!metadata.isDirectory()) {
      throw new Error(`generated output is not a physical directory: ${output.relativePath}`);
    }
    for (const child of readdirSync(absolutePath).sort()) {
      const childAbsolute = path.join(absolutePath, child);
      const childMetadata = lstatSync(childAbsolute);
      if (childMetadata.isSymbolicLink()) {
        throw new Error(`generated-output directory contains a symlink: ${output.relativePath}/${child}`);
      }
      if (!childMetadata.isFile()) {
        throw new Error(
          `generated-output directory contains a non-file descendant: ${output.relativePath}/${child}`,
        );
      }
      const bytes = readFileSync(childAbsolute);
      entries.push({
        path: `${output.relativePath}/${portable(child)}`,
        type: "file",
        size: bytes.byteLength,
        sha256: sha256Bytes(bytes),
      });
    }
  }
  if (entries.length === 0 && output.emptyOutputPermitted !== true) {
    throw new Error(`generated output is unexpectedly empty: ${output.relativePath}`);
  }
  if (entries.length > output.maximumPathCount) {
    throw new Error(`generated output exceeds its maximum path count: ${output.relativePath}`);
  }
  return {
    absolutePath,
    noFollowFileType: output.pathType === "file" ? "regular-file" : "physical-directory",
    entries,
    sha256: inventorySha256(entries),
  };
}

function parseProducerManifest(stdoutPath, output) {
  if (output.inventoryPolicy.kind !== "producer-stdout-manifest") return null;
  const prefix = output.inventoryPolicy.stdoutPrefix;
  const lines = readFileSync(stdoutPath, "utf8")
    .split("\n")
    .filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) {
    throw new Error(`generated-output producer manifest is missing or duplicated: ${output.id}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(lines[0].slice(prefix.length));
  } catch {
    throw new Error(`generated-output producer manifest is invalid JSON: ${output.id}`);
  }
  return manifest;
}

function validateProducerManifest(
  repositoryRoot,
  output,
  inventory,
  manifest,
  { verifySources = true } = {},
) {
  if (output.inventoryPolicy.kind !== "producer-stdout-manifest") {
    if (manifest !== null) throw new Error(`unexpected producer manifest: ${output.id}`);
    return;
  }
  const relativeFiles = inventory.entries.map((entry) => ({
    path: entry.path.slice(output.relativePath.length + 1),
    size: entry.size,
    sha256: entry.sha256,
  }));
  const expectedSourcePaths = output.inventoryPolicy.producerSourcePaths;
  if (
    !exactKeys(manifest, [
      "schema",
      "outputPath",
      "files",
      "producerSources",
      "inventorySha256",
    ]) ||
    manifest.schema !== output.inventoryPolicy.schema ||
    manifest.outputPath !== output.relativePath ||
    !Array.isArray(manifest.files) ||
    JSON.stringify(manifest.files) !== JSON.stringify(relativeFiles) ||
    manifest.inventorySha256 !== inventory.sha256 ||
    !Array.isArray(manifest.producerSources) ||
    JSON.stringify(manifest.producerSources.map((entry) => entry.path)) !==
      JSON.stringify(expectedSourcePaths)
  ) {
    throw new Error(`generated-output producer manifest contradicts the closed inventory: ${output.id}`);
  }
  for (const required of output.inventoryPolicy.requiredFiles) {
    if (!manifest.files.some((entry) => entry.path === required)) {
      throw new Error(`generated-output producer manifest omits required file: ${required}`);
    }
  }
  for (const source of manifest.producerSources) {
    if (
      !exactKeys(source, ["path", "sha256"]) ||
      !isSha256(source.sha256) ||
      (verifySources &&
        source.sha256 !==
          sha256Bytes(readFileSync(lexicalOutputPath(repositoryRoot, source.path))))
    ) {
      throw new Error(`generated-output producer source binding is stale: ${String(source?.path)}`);
    }
  }
}

function safeEvidenceDirectory(evidenceRoot, relativeDirectory) {
  const root = realpathSync(evidenceRoot);
  const normalized = path.posix.normalize(relativeDirectory);
  if (
    path.isAbsolute(relativeDirectory) ||
    relativeDirectory.includes("\\") ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error("generated-output evidence directory escapes its root");
  }
  let current = root;
  for (const component of normalized.split("/").filter(Boolean)) {
    current = path.join(current, component);
    const metadata = lstatOrNull(current);
    if (metadata) {
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("generated-output evidence parent is not a physical directory");
      }
    } else {
      mkdirSync(current, { mode: 0o700 });
    }
  }
  const physical = realpathSync(current);
  if (!pathInside(root, physical)) {
    throw new Error("generated-output evidence parent escapes its root");
  }
  return physical;
}

function writeEvidenceExclusive(evidenceRoot, relativePath, value) {
  const directory = safeEvidenceDirectory(evidenceRoot, path.posix.dirname(relativePath));
  const absolutePath = path.join(directory, path.posix.basename(relativePath));
  writeFileSync(absolutePath, canonicalJsonBytes(value), { flag: "wx", mode: 0o600 });
  return { path: relativePath, sha256: sha256Bytes(readFileSync(absolutePath)) };
}

function evidenceSeal(value) {
  const payload = structuredClone(value);
  delete payload.aggregateEvidenceSha256;
  return sha256Bytes(
    Buffer.concat([
      Buffer.from(GENERATED_OUTPUT_EVIDENCE_SEAL_DOMAIN),
      canonicalJsonBytes(payload),
    ]),
  );
}

function cleanupOutput(repositoryRoot, output, sealedInventory) {
  const current = inventoryOutput(repositoryRoot, output);
  if (
    current.sha256 !== sealedInventory.sha256 ||
    JSON.stringify(current.entries) !== JSON.stringify(sealedInventory.entries)
  ) {
    throw new Error(`generated output changed before cleanup: ${output.relativePath}`);
  }
  if (output.pathType === "file") {
    unlinkSync(current.absolutePath);
  } else {
    for (const entry of current.entries) {
      const descendant = lexicalOutputPath(repositoryRoot, entry.path);
      const metadata = lstatSync(descendant);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error(`generated-output cleanup target changed type: ${entry.path}`);
      }
      unlinkSync(descendant);
    }
    rmdirSync(current.absolutePath);
  }
  if (lstatOrNull(current.absolutePath)) {
    throw new Error(`generated output survived cleanup: ${output.relativePath}`);
  }
}

function worktreeBoundarySummary(state) {
  return {
    trackedAndOrdinaryUntrackedClean: state.trackedAndOrdinaryUntrackedClean,
    ordinaryStatusInventory: {
      count: state.ordinaryStatus.length,
      sha256: sha256Bytes(state.ordinaryStatus.map((entry) => `${entry}\n`).join("")),
    },
    persistentIgnoredInventory: state.persistentIgnoredInventory,
    declaredGeneratedInventory: state.declaredGeneratedInventory,
    undeclaredIgnoredInventory: state.undeclaredIgnoredInventory,
    activeGeneratedOutputIds: state.activeGeneratedOutputIds,
  };
}

export class SourceGeneratedOutputLifecycleError extends Error {
  constructor(issues) {
    super(issues.join("; "));
    this.issues = [...issues];
  }
}

export class SourceGeneratedOutputLifecycle {
  constructor({
    repositoryRoot,
    canonicalRoot,
    evidenceRoot,
    evidenceRelativeRoot,
    state,
    worktreeIdentity,
  }) {
    this.repositoryRoot = realpathSync(repositoryRoot);
    this.canonicalRoot = realpathSync(canonicalRoot);
    this.evidenceRoot = realpathSync(evidenceRoot);
    this.evidenceRelativeRoot = evidenceRelativeRoot;
    this.state = state;
    this.worktreeIdentity = structuredClone(worktreeIdentity);
    this.contract = sourceValidationCheckSet(this.repositoryRoot).generatedOutputs;
    this.checkIds = this.contract.value.checkPolicies.map((entry) => entry.checkId);
    this.entries = new Map(this.contract.value.outputs.map((entry) => [entry.id, entry]));
    this.records = new Map();
    this.active = new Map();
    this.completed = new Map();
    if (
      this.repositoryRoot === this.canonicalRoot ||
      pathInside(this.repositoryRoot, this.canonicalRoot) ||
      pathInside(this.canonicalRoot, this.repositoryRoot) ||
      worktreeIdentity?.role !== "source-validation" ||
      worktreeIdentity?.certificationId !== state.certificationId ||
      worktreeIdentity?.privateRealpathSha256 !== sha256Bytes(this.repositoryRoot) ||
      worktreeIdentity?.candidateCommitSha !== state.candidate.commitSha ||
      worktreeIdentity?.candidateTreeSha !== state.candidate.treeSha
    ) {
      throw new Error("generated-output lifecycle requires the exact disposable source-validation worktree");
    }
  }

  activeEntries() {
    return [...this.active.values()].map((record) => record.entry);
  }

  boundaryIssues() {
    const state = sourceValidationWorktreeOutputState({
      repositoryRoot: this.repositoryRoot,
      activeGeneratedOutputs: this.activeEntries(),
    });
    const issues = [];
    if (!state.trackedAndOrdinaryUntrackedClean) {
      issues.push("source-validation worktree has tracked or ordinary untracked output");
    }
    if (state.undeclaredIgnoredPaths.length > 0) {
      issues.push(
        `source-validation worktree has undeclared ignored output: ${state.undeclaredIgnoredPaths.join(", ")}`,
      );
    }
    return { state, issues };
  }

  beforeCheck(checkId, observedAt) {
    const policy = this.contract.value.checkPolicies.find((entry) => entry.checkId === checkId);
    if (!policy) throw new SourceGeneratedOutputLifecycleError([`unknown source check: ${checkId}`]);
    const issues = [];
    const currentIndex = this.checkIds.indexOf(checkId);
    for (const record of this.active.values()) {
      const lastIndex = this.checkIds.indexOf(
        record.entry.retentionLifetime.lastConsumerCheckId,
      );
      if (currentIndex > lastIndex) {
        issues.push(`generated output survived its cleanup deadline: ${record.entry.id}`);
        continue;
      }
      try {
        const retained = inventoryOutput(this.repositoryRoot, record.entry);
        if (
          retained.sha256 !== record.inventory.sha256 ||
          JSON.stringify(retained.entries) !== JSON.stringify(record.inventory.entries)
        ) {
          issues.push(`retained generated output drifted before check ${checkId}: ${record.entry.id}`);
        } else if (record.entry.permittedConsumerCheckIds.includes(checkId)) {
          record.consumerObservations.push({
            checkId,
            observedAt,
            aggregateInventorySha256: retained.sha256,
          });
        }
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
    }
    for (const outputId of policy.generatedOutputIds) {
      const entry = this.entries.get(outputId);
      const absolutePath = lexicalOutputPath(this.repositoryRoot, entry.relativePath);
      try {
        noFollowPathComponents(this.repositoryRoot, absolutePath);
        if (lstatOrNull(absolutePath)) {
          issues.push(`declared generated output existed before its owner check: ${entry.relativePath}`);
        } else {
          this.records.set(outputId, {
            entry,
            preCheckAbsenceProof: {
              observedAt,
              relativePath: entry.relativePath,
              absent: true,
            },
            consumerObservations: [],
          });
        }
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
    }
    const boundary = this.boundaryIssues();
    issues.push(...boundary.issues);
    if (issues.length > 0) throw new SourceGeneratedOutputLifecycleError(issues);
    return {
      checkId,
      policySha256: this.contract.policySha256[checkId],
      expectedTrackedModifications: policy.expectedTrackedModifications,
      declaredOutputIds: [...policy.generatedOutputIds],
      boundary: worktreeBoundarySummary(boundary.state),
      passed: true,
    };
  }

  afterCheck({ checkId, observedAt, stdoutPath, commandSucceeded, beforeCleanup = null }) {
    const policy = this.contract.value.checkPolicies.find((entry) => entry.checkId === checkId);
    const issues = [];
    const descriptors = [];
    for (const outputId of policy.generatedOutputIds) {
      const record = this.records.get(outputId);
      if (!record) {
        issues.push(`generated-output pre-check absence proof is missing: ${outputId}`);
        continue;
      }
      try {
        const inventory = inventoryOutput(this.repositoryRoot, record.entry);
        const manifest = parseProducerManifest(stdoutPath, record.entry);
        validateProducerManifest(this.repositoryRoot, record.entry, inventory, manifest);
        record.inventory = inventory;
        record.producerManifest = manifest;
        record.creationObservation = {
          observedAt,
          createdByCheckId: checkId,
          created: true,
          aggregateInventorySha256: inventory.sha256,
        };
        this.active.set(outputId, record);
      } catch (error) {
        if (commandSucceeded || lstatOrNull(lexicalOutputPath(this.repositoryRoot, record.entry.relativePath))) {
          issues.push(error instanceof Error ? error.message : String(error));
        }
      }
    }
    const producedBoundary = this.boundaryIssues();
    issues.push(...producedBoundary.issues);
    if (typeof beforeCleanup === "function") beforeCleanup({ checkId, lifecycle: this });
    for (const [outputId, record] of [...this.active.entries()]) {
      if (record.entry.cleanupDeadline.checkId !== checkId) continue;
      try {
        cleanupOutput(this.repositoryRoot, record.entry, record.inventory);
        const evidence = {
          schema: PRODUCTION_CERTIFICATION_SOURCE_GENERATED_OUTPUT_EVIDENCE_SCHEMA,
          version: 1,
          certificationId: this.state.certificationId,
          candidateId: this.state.candidate.id,
          commitSha: this.state.candidate.commitSha,
          treeSha: this.state.candidate.treeSha,
          sourceValidationWorktreeIdentitySha256: sha256Bytes(
            canonicalJsonBytes(this.worktreeIdentity),
          ),
          dependencyIdentitySha256: this.worktreeIdentity.dependencyIdentitySha256,
          outputId,
          ownerCheckId: record.entry.ownerCheckId,
          relativePath: record.entry.relativePath,
          pathType: record.entry.pathType,
          contractEntrySha256: this.contract.entrySha256[outputId],
          preCheckAbsenceProof: record.preCheckAbsenceProof,
          creationObservation: record.creationObservation,
          physicalPathClassification: "source-validation-worktree-relative",
          noFollowFileType: record.inventory.noFollowFileType,
          closedRelativeInventory: record.inventory.entries,
          aggregateInventorySha256: record.inventory.sha256,
          producerManifest: record.producerManifest,
          permittedConsumerCheckIds: [...record.entry.permittedConsumerCheckIds],
          consumerObservations: record.consumerObservations,
          cleanupEvent: {
            ownerCheckId: record.entry.cleanupOwnerCheckId,
            deadlineCheckId: record.entry.cleanupDeadline.checkId,
            completedAt: observedAt,
            removedRelativePath: record.entry.relativePath,
            preRemovalInventorySha256: record.inventory.sha256,
          },
          postCleanupAbsenceProof: {
            observedAt,
            relativePath: record.entry.relativePath,
            absent: true,
          },
          completionMarker: { complete: true, result: "cleaned" },
        };
        evidence.aggregateEvidenceSha256 = evidenceSeal(evidence);
        const relativeEvidencePath = `${this.evidenceRelativeRoot}/generated-outputs/${outputId}.json`;
        const descriptor = writeEvidenceExclusive(
          this.evidenceRoot,
          relativeEvidencePath,
          evidence,
        );
        const completed = { outputId, descriptor, evidence };
        this.completed.set(outputId, completed);
        descriptors.push({
          outputId,
          ownerCheckId: record.entry.ownerCheckId,
          permittedConsumerCheckIds: [...record.entry.permittedConsumerCheckIds],
          cleanupCompleted: true,
          evidence: descriptor,
          aggregateEvidenceSha256: evidence.aggregateEvidenceSha256,
        });
        this.active.delete(outputId);
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
    }
    const terminalBoundary = this.boundaryIssues();
    issues.push(...terminalBoundary.issues);
    return {
      checkId,
      policySha256: this.contract.policySha256[checkId],
      declaredOutputIds: [...policy.generatedOutputIds],
      generatedOutputEvidence: descriptors,
      producedBoundary: worktreeBoundarySummary(producedBoundary.state),
      terminalBoundary: worktreeBoundarySummary(terminalBoundary.state),
      passed: issues.length === 0,
      issues,
    };
  }

  finalize() {
    const issues = [];
    if (this.active.size > 0) {
      issues.push(`generated outputs survived cleanup: ${[...this.active.keys()].join(", ")}`);
    }
    const expectedIds = this.contract.value.outputs.map((entry) => entry.id);
    const completedIds = [...this.completed.keys()];
    if (JSON.stringify(completedIds.sort()) !== JSON.stringify([...expectedIds].sort())) {
      issues.push("generated-output evidence set is incomplete");
    }
    const boundary = this.boundaryIssues();
    issues.push(...boundary.issues);
    if (issues.length > 0) throw new SourceGeneratedOutputLifecycleError(issues);
    return this.snapshot();
  }

  snapshot() {
    const expectedIds = this.contract.value.outputs.map((entry) => entry.id);
    const boundary = this.boundaryIssues().state;
    const evidenceEntries = expectedIds.filter((id) => this.completed.has(id)).map((id) => {
      const completed = this.completed.get(id);
      return {
        outputId: id,
        ownerCheckId: completed.evidence.ownerCheckId,
        permittedConsumerCheckIds: completed.evidence.permittedConsumerCheckIds,
        cleanupCompleted: true,
        evidence: completed.descriptor,
        aggregateEvidenceSha256: completed.evidence.aggregateEvidenceSha256,
      };
    });
    return {
      contract: {
        schema: this.contract.value.schema,
        version: this.contract.value.version,
        path: this.contract.path,
        sha256: this.contract.sha256,
      },
      declaredOutputIds: expectedIds,
      evidenceEntries,
      aggregateGeneratedOutputEvidenceSha256: sha256Bytes(
        Buffer.concat([
          Buffer.from(GENERATED_OUTPUT_AGGREGATE_SEAL_DOMAIN),
          canonicalJsonBytes(evidenceEntries),
        ]),
      ),
      terminalWorktree: {
        ...worktreeBoundarySummary(boundary),
        nodeModulesOnlyPersistentIgnoredOutput:
          boundary.undeclaredIgnoredInventory.count === 0,
        generatedOutputsRemaining: [...this.active.keys()].sort(),
      },
    };
  }
}

function resolvedEvidenceFile(evidenceRoot, descriptor, description) {
  if (
    !exactKeys(descriptor, ["path", "sha256"]) ||
    typeof descriptor.path !== "string" ||
    path.isAbsolute(descriptor.path) ||
    descriptor.path.includes("\\") ||
    path.posix.normalize(descriptor.path) !== descriptor.path ||
    !isSha256(descriptor.sha256)
  ) {
    throw new Error(`${description} descriptor is malformed`);
  }
  const root = realpathSync(evidenceRoot);
  const absolute = path.resolve(root, ...descriptor.path.split("/"));
  if (!pathInside(root, absolute) || absolute === root) {
    throw new Error(`${description} is not a physical contained file`);
  }
  let current = root;
  const components = descriptor.path.split("/");
  for (const [index, component] of components.entries()) {
    current = path.join(current, component);
    const metadata = lstatSync(current);
    const final = index === components.length - 1;
    if (
      metadata.isSymbolicLink() ||
      (final ? !metadata.isFile() : !metadata.isDirectory())
    ) {
      throw new Error(`${description} is not a physical contained file`);
    }
  }
  const physical = realpathSync(current);
  if (physical !== absolute || !pathInside(root, physical)) {
    throw new Error(`${description} is not a physical contained file`);
  }
  const bytes = readFileSync(physical);
  if (sha256Bytes(bytes) !== descriptor.sha256) {
    throw new Error(`${description} hash mismatch`);
  }
  const value = JSON.parse(bytes.toString("utf8"));
  if (!bytes.equals(canonicalJsonBytes(value))) {
    throw new Error(`${description} is not canonical JSON`);
  }
  return value;
}

function safeClosedInventoryPath(relativePath) {
  return (
    typeof relativePath === "string" &&
    relativePath.length > 0 &&
    !path.posix.isAbsolute(relativePath) &&
    !relativePath.includes("\\") &&
    path.posix.normalize(relativePath) === relativePath &&
    relativePath
      .split("/")
      .every((component) => component && component !== "." && component !== "..")
  );
}

function generatedOutputEvidenceSemanticIssues(evidence, output) {
  const issues = [];
  const inventory = Array.isArray(evidence?.closedRelativeInventory)
    ? evidence.closedRelativeInventory
    : [];
  const inventoryPaths = inventory.map((entry) => entry?.path);
  if (
    inventory.length < 1 ||
    inventory.length > output.maximumPathCount ||
    new Set(inventoryPaths).size !== inventoryPaths.length ||
    JSON.stringify(inventoryPaths) !== JSON.stringify([...inventoryPaths].sort())
  ) {
    issues.push(`generated-output closed inventory is incomplete or unordered: ${output.id}`);
  }
  for (const entry of inventory) {
    const withinDeclaredOutput =
      output.pathType === "file"
        ? entry?.path === output.relativePath
        : typeof entry?.path === "string" &&
          entry.path.startsWith(`${output.relativePath}/`) &&
          !entry.path.slice(output.relativePath.length + 1).includes("/");
    if (
      !exactKeys(entry, ["path", "type", "size", "sha256"]) ||
      !safeClosedInventoryPath(entry.path) ||
      !withinDeclaredOutput ||
      entry.type !== "file" ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      !isSha256(entry.sha256)
    ) {
      issues.push(`generated-output closed inventory entry is malformed: ${output.id}`);
    }
  }
  const observations = Array.isArray(evidence?.consumerObservations)
    ? evidence.consumerObservations
    : [];
  if (
    JSON.stringify(observations.map((entry) => entry?.checkId)) !==
    JSON.stringify(output.permittedConsumerCheckIds)
  ) {
    issues.push(`generated-output consumer observation set is contradictory: ${output.id}`);
  }
  for (const observation of observations) {
    if (
      !exactKeys(observation, [
        "checkId",
        "observedAt",
        "aggregateInventorySha256",
      ]) ||
      !isCanonicalUtcTimestamp(observation.observedAt) ||
      observation.aggregateInventorySha256 !== evidence.aggregateInventorySha256
    ) {
      issues.push(`generated-output consumer observation is malformed: ${output.id}`);
    }
  }
  if (
    !exactKeys(evidence?.preCheckAbsenceProof, [
      "observedAt",
      "relativePath",
      "absent",
    ]) ||
    !exactKeys(evidence?.creationObservation, [
      "observedAt",
      "createdByCheckId",
      "created",
      "aggregateInventorySha256",
    ]) ||
    !exactKeys(evidence?.cleanupEvent, [
      "ownerCheckId",
      "deadlineCheckId",
      "completedAt",
      "removedRelativePath",
      "preRemovalInventorySha256",
    ]) ||
    !exactKeys(evidence?.postCleanupAbsenceProof, [
      "observedAt",
      "relativePath",
      "absent",
    ]) ||
    !exactKeys(evidence?.completionMarker, ["complete", "result"])
  ) {
    issues.push(`generated-output nested lifecycle evidence is malformed: ${output.id}`);
  }
  const timestamps = [
    evidence?.preCheckAbsenceProof?.observedAt,
    evidence?.creationObservation?.observedAt,
    ...observations.map((entry) => entry.observedAt),
    evidence?.cleanupEvent?.completedAt,
    evidence?.postCleanupAbsenceProof?.observedAt,
  ];
  if (
    timestamps.some((value) => !isCanonicalUtcTimestamp(value)) ||
    timestamps.some(
      (value, index) =>
        index > 0 && Date.parse(value) < Date.parse(timestamps[index - 1]),
    )
  ) {
    issues.push(`generated-output lifecycle chronology is invalid: ${output.id}`);
  }
  return issues;
}

export function validateSourceGeneratedOutputAggregate({
  aggregate,
  evidenceRoot,
  state,
  repositoryRoot,
  verifyPhysical = true,
  requireComplete = true,
}) {
  const issues = [];
  const physicalRepositoryMatchesBoundWorktree =
    sha256Bytes(realpathSync(repositoryRoot)) ===
    aggregate?.stageWorktree?.privateRealpathSha256;
  let contract;
  try {
    contract = sourceValidationCheckSet(repositoryRoot).generatedOutputs;
  } catch (error) {
    return { valid: false, issues: [error instanceof Error ? error.message : String(error)] };
  }
  if (
    !exactKeys(aggregate?.generatedOutputContract, ["schema", "version", "path", "sha256"]) ||
    aggregate.generatedOutputContract.schema !== contract.value.schema ||
    aggregate.generatedOutputContract.version !== contract.value.version ||
    aggregate.generatedOutputContract.path !== contract.path ||
    aggregate.generatedOutputContract.sha256 !== contract.sha256
  ) {
    issues.push("generated-output aggregate contract binding is stale");
  }
  const expectedIds = contract.value.outputs.map((entry) => entry.id);
  if (JSON.stringify(aggregate?.declaredGeneratedOutputIds) !== JSON.stringify(expectedIds)) {
    issues.push("generated-output aggregate declared set is incomplete");
  }
  const entries = Array.isArray(aggregate?.generatedOutputEvidence)
    ? aggregate.generatedOutputEvidence
    : [];
  if (
    requireComplete &&
    (entries.length !== expectedIds.length ||
      new Set(entries.map((entry) => entry?.outputId)).size !== entries.length ||
      JSON.stringify(entries.map((entry) => entry?.outputId)) !== JSON.stringify(expectedIds))
  ) {
    issues.push("generated-output aggregate evidence inventory is incomplete or duplicated");
  }
  if (
    !requireComplete &&
    (new Set(entries.map((entry) => entry?.outputId)).size !== entries.length ||
      entries.some((entry) => !expectedIds.includes(entry?.outputId)))
  ) {
    issues.push("failed generated-output aggregate evidence inventory is invalid");
  }
  for (const summary of entries) {
    const output = contract.value.outputs.find((entry) => entry.id === summary?.outputId);
    if (!output) continue;
    try {
      const evidence = resolvedEvidenceFile(
        evidenceRoot,
        summary.evidence,
        `generated-output evidence ${output.id}`,
      );
      const expectedPath = `source-validation/attempt-${String(
        state.stages["source-validation"].attempts.at(-1).number,
      ).padStart(3, "0")}/generated-outputs/${output.id}.json`;
      if (
        !exactKeys(summary, [
          "outputId",
          "ownerCheckId",
          "permittedConsumerCheckIds",
          "cleanupCompleted",
          "evidence",
          "aggregateEvidenceSha256",
        ]) ||
        summary.evidence.path !== expectedPath ||
        summary.ownerCheckId !== output.ownerCheckId ||
        JSON.stringify(summary.permittedConsumerCheckIds) !==
          JSON.stringify(output.permittedConsumerCheckIds) ||
        summary.cleanupCompleted !== true ||
        !exactKeys(evidence, [
          "schema",
          "version",
          "certificationId",
          "candidateId",
          "commitSha",
          "treeSha",
          "sourceValidationWorktreeIdentitySha256",
          "dependencyIdentitySha256",
          "outputId",
          "ownerCheckId",
          "relativePath",
          "pathType",
          "contractEntrySha256",
          "preCheckAbsenceProof",
          "creationObservation",
          "physicalPathClassification",
          "noFollowFileType",
          "closedRelativeInventory",
          "aggregateInventorySha256",
          "producerManifest",
          "permittedConsumerCheckIds",
          "consumerObservations",
          "cleanupEvent",
          "postCleanupAbsenceProof",
          "completionMarker",
          "aggregateEvidenceSha256",
        ]) ||
        evidence.schema !== PRODUCTION_CERTIFICATION_SOURCE_GENERATED_OUTPUT_EVIDENCE_SCHEMA ||
        evidence.version !== 1 ||
        evidence.certificationId !== state.certificationId ||
        evidence.candidateId !== state.candidate.id ||
        evidence.commitSha !== state.candidate.commitSha ||
        evidence.treeSha !== state.candidate.treeSha ||
        evidence.outputId !== output.id ||
        evidence.ownerCheckId !== output.ownerCheckId ||
        evidence.relativePath !== output.relativePath ||
        evidence.pathType !== output.pathType ||
        evidence.contractEntrySha256 !== contract.entrySha256[output.id] ||
        evidence.sourceValidationWorktreeIdentitySha256 !==
          aggregate.stageWorktree.identitySha256 ||
        evidence.dependencyIdentitySha256 !==
          state.worktrees.roles["source-validation"].dependencyIdentitySha256 ||
        evidence.physicalPathClassification !== "source-validation-worktree-relative" ||
        evidence.noFollowFileType !==
          (output.pathType === "file" ? "regular-file" : "physical-directory") ||
        !Array.isArray(evidence.closedRelativeInventory) ||
        evidence.closedRelativeInventory.length < 1 ||
        evidence.closedRelativeInventory.length > output.maximumPathCount ||
        inventorySha256(evidence.closedRelativeInventory) !== evidence.aggregateInventorySha256 ||
        JSON.stringify(evidence.permittedConsumerCheckIds) !==
          JSON.stringify(output.permittedConsumerCheckIds) ||
        evidence.preCheckAbsenceProof?.absent !== true ||
        evidence.preCheckAbsenceProof?.relativePath !== output.relativePath ||
        evidence.creationObservation?.created !== true ||
        evidence.creationObservation?.createdByCheckId !== output.ownerCheckId ||
        evidence.creationObservation?.aggregateInventorySha256 !==
          evidence.aggregateInventorySha256 ||
        evidence.cleanupEvent?.ownerCheckId !== output.cleanupOwnerCheckId ||
        evidence.cleanupEvent?.deadlineCheckId !== output.cleanupDeadline.checkId ||
        evidence.cleanupEvent?.removedRelativePath !== output.relativePath ||
        evidence.cleanupEvent?.preRemovalInventorySha256 !== evidence.aggregateInventorySha256 ||
        evidence.postCleanupAbsenceProof?.absent !== true ||
        evidence.postCleanupAbsenceProof?.relativePath !== output.relativePath ||
        evidence.completionMarker?.complete !== true ||
        evidence.completionMarker?.result !== "cleaned" ||
        evidence.aggregateEvidenceSha256 !== evidenceSeal(evidence) ||
        summary.aggregateEvidenceSha256 !== evidence.aggregateEvidenceSha256 ||
        !isCanonicalUtcTimestamp(evidence.preCheckAbsenceProof?.observedAt) ||
        !isCanonicalUtcTimestamp(evidence.creationObservation?.observedAt) ||
        !isCanonicalUtcTimestamp(evidence.cleanupEvent?.completedAt) ||
        !isCanonicalUtcTimestamp(evidence.postCleanupAbsenceProof?.observedAt)
      ) {
        issues.push(`generated-output evidence is stale or malformed: ${output.id}`);
      }
      issues.push(...generatedOutputEvidenceSemanticIssues(evidence, output));
      if (JSON.stringify(evidence).includes(realpathSync(repositoryRoot))) {
        issues.push(`generated-output evidence records an absolute source-worktree path: ${output.id}`);
      }
      validateProducerManifest(
        repositoryRoot,
        output,
        {
          entries: evidence.closedRelativeInventory,
          sha256: evidence.aggregateInventorySha256,
        },
        evidence.producerManifest,
        { verifySources: physicalRepositoryMatchesBoundWorktree },
      );
      if (verifyPhysical && physicalRepositoryMatchesBoundWorktree) {
        const absolute = lexicalOutputPath(repositoryRoot, output.relativePath);
        noFollowPathComponents(repositoryRoot, absolute);
        if (lstatOrNull(absolute)) {
          issues.push(`generated output remains after its cleanup deadline: ${output.relativePath}`);
        }
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  const expectedAggregateSha256 = sha256Bytes(
    Buffer.concat([
      Buffer.from(GENERATED_OUTPUT_AGGREGATE_SEAL_DOMAIN),
      canonicalJsonBytes(entries),
    ]),
  );
  if (aggregate?.aggregateGeneratedOutputEvidenceSha256 !== expectedAggregateSha256) {
    issues.push("generated-output aggregate evidence SHA-256 is stale");
  }
  if (
    requireComplete &&
    (!exactKeys(aggregate?.terminalWorktree, [
      "trackedAndOrdinaryUntrackedClean",
      "ordinaryStatusInventory",
      "persistentIgnoredInventory",
      "declaredGeneratedInventory",
      "undeclaredIgnoredInventory",
      "activeGeneratedOutputIds",
      "nodeModulesOnlyPersistentIgnoredOutput",
      "generatedOutputsRemaining",
    ]) ||
      aggregate.terminalWorktree.trackedAndOrdinaryUntrackedClean !== true ||
      aggregate.terminalWorktree.ordinaryStatusInventory?.count !== 0 ||
      aggregate.terminalWorktree.declaredGeneratedInventory?.count !== 0 ||
      aggregate.terminalWorktree.undeclaredIgnoredInventory?.count !== 0 ||
      aggregate.terminalWorktree.nodeModulesOnlyPersistentIgnoredOutput !== true ||
      JSON.stringify(aggregate.terminalWorktree.activeGeneratedOutputIds) !== "[]" ||
      JSON.stringify(aggregate.terminalWorktree.generatedOutputsRemaining) !== "[]")
  ) {
    issues.push("source-validation terminal worktree generated-output state is not clean");
  }
  if (verifyPhysical && requireComplete && physicalRepositoryMatchesBoundWorktree) {
    const terminal = sourceValidationWorktreeOutputState({ repositoryRoot });
    const physicalSummary = worktreeBoundarySummary(terminal);
    const recordedSummary = {
      trackedAndOrdinaryUntrackedClean:
        aggregate.terminalWorktree.trackedAndOrdinaryUntrackedClean,
      ordinaryStatusInventory: aggregate.terminalWorktree.ordinaryStatusInventory,
      persistentIgnoredInventory: aggregate.terminalWorktree.persistentIgnoredInventory,
      declaredGeneratedInventory: aggregate.terminalWorktree.declaredGeneratedInventory,
      undeclaredIgnoredInventory: aggregate.terminalWorktree.undeclaredIgnoredInventory,
      activeGeneratedOutputIds: aggregate.terminalWorktree.activeGeneratedOutputIds,
    };
    if (
      !terminal.valid ||
      terminal.declaredGeneratedInventory.count !== 0 ||
      JSON.stringify(physicalSummary) !== JSON.stringify(recordedSummary)
    ) {
      issues.push(
        `source-validation physical terminal worktree inventory changed (${JSON.stringify({
          physicalSummary,
          recordedSummary,
        })})`,
      );
    }
  }
  return { valid: issues.length === 0, issues };
}
