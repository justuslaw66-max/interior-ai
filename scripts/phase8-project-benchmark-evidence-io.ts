import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import {
  PHASE8_CHILD_REPORT_FILE,
  PHASE8_FINAL_REPORT_FILE,
  PHASE8_MAX_OUTPUT_BYTES,
  PHASE8_MAX_REPORT_BYTES,
  PHASE8_STDERR_FILE,
  PHASE8_STDOUT_FILE,
  PHASE8_VALIDATION_FAILURE_FILE,
  sha256Bytes,
} from "./phase8-project-benchmark-contract";

const PROTECTED_EVIDENCE_FILES = new Set([
  PHASE8_CHILD_REPORT_FILE,
  PHASE8_FINAL_REPORT_FILE,
  PHASE8_VALIDATION_FAILURE_FILE,
]);

export function canonicalJsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

export function sanitizePhase8Diagnostic(value: string, repositoryRoot: string): string {
  const absoluteRoot = path.resolve(repositoryRoot);
  return value
    .split(absoluteRoot)
    .join("<WORKSPACE>")
    .split(absoluteRoot.split(path.sep).join("/"))
    .join("<WORKSPACE>");
}

export function atomicWriteBytes(filePath: string, bytes: Buffer): void {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
      if (written <= 0) throw new Error(`atomic write made no progress for ${path.basename(filePath)}`);
      offset += written;
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    throw error;
  }
}

export function atomicWriteJson(filePath: string, value: unknown): Buffer {
  const bytes = canonicalJsonBytes(value);
  if (bytes.byteLength > PHASE8_MAX_REPORT_BYTES) {
    throw new Error(`evidence JSON exceeds ${PHASE8_MAX_REPORT_BYTES} bytes`);
  }
  atomicWriteBytes(filePath, bytes);
  return bytes;
}

export function readBoundedFile(filePath: string, maximumBytes: number): Buffer {
  const bytes = readFileSync(filePath);
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`${path.basename(filePath)} exceeds ${maximumBytes} bytes`);
  }
  return bytes;
}

export function assertCapturedOutputPath(filePath: string): void {
  const filename = path.basename(filePath);
  if (PROTECTED_EVIDENCE_FILES.has(filename)) {
    throw new Error(`captured output cannot replace ${filename}`);
  }
  if (filename !== PHASE8_STDOUT_FILE && filename !== PHASE8_STDERR_FILE) {
    throw new Error(`unexpected captured-output filename ${filename}`);
  }
}

export function writeCapturedOutput(filePath: string, value: string | Buffer): string {
  assertCapturedOutputPath(filePath);
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (bytes.byteLength > PHASE8_MAX_OUTPUT_BYTES) {
    throw new Error(`captured child output exceeds ${PHASE8_MAX_OUTPUT_BYTES} bytes`);
  }
  atomicWriteBytes(filePath, bytes);
  return sha256Bytes(bytes);
}

export function writeHashedEvidence(
  filePath: string,
  value: unknown,
): { bytes: Buffer; sha256: string; sidecarPath: string } {
  const bytes = atomicWriteJson(filePath, value);
  const sha256 = sha256Bytes(bytes);
  const sidecarPath = `${filePath}.sha256`;
  atomicWriteBytes(sidecarPath, Buffer.from(`${sha256}  ${path.basename(filePath)}\n`));
  return { bytes, sha256, sidecarPath };
}

export function prunePhase8EvidenceRuns(evidenceRoot: string, retainBeforeNewRun: number): void {
  const runName = /^\d{8}T\d{9}Z-\d+-[a-f0-9]{12}$/;
  const directories = readdirSync(evidenceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && runName.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const removeCount = Math.max(0, directories.length - retainBeforeNewRun);
  for (const name of directories.slice(0, removeCount)) {
    rmSync(path.join(evidenceRoot, name), { recursive: true, force: false });
  }
}
