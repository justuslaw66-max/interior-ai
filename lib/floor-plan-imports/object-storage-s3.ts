import type { FloorPlanS3StorageConfig } from "./object-storage-config";
import { signFloorPlanS3Request } from "./object-storage-sigv4";
import {
  assertFloorPlanObjectSha256,
  assertSafeFloorPlanObjectKey,
  createOpaqueFloorPlanObjectKey,
  FloorPlanObjectStorageError,
  sha256Hex,
  verifyFloorPlanObjectBytes,
  type GetFloorPlanObjectInput,
  type PrivateFloorPlanObjectStorage,
  type PutFloorPlanObjectInput,
} from "./object-storage";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type S3StorageDependencies = {
  fetch?: FetchLike;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
};

type PendingResponse = {
  response: Response;
  finish(): void;
};

const EMPTY_SHA256 = sha256Hex(new Uint8Array());
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

function isValidMimeType(value: string): boolean {
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(value);
}

function exactUnsignedInteger(value: string | null): number | null {
  if (value === null || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export class S3CompatibleFloorPlanObjectStorage implements PrivateFloorPlanObjectStorage {
  private readonly fetch: FetchLike;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly config: FloorPlanS3StorageConfig,
    dependencies: S3StorageDependencies = {}
  ) {
    this.fetch = dependencies.fetch ?? globalThis.fetch;
    this.now = dependencies.now ?? (() => new Date());
    this.sleep =
      dependencies.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  keyFor(kind: "source" | "derived", logicalIdentity: string): string {
    if (!logicalIdentity) {
      throw new FloorPlanObjectStorageError(
        "invalid_key",
        "Floor-plan object logical identity cannot be empty."
      );
    }
    return createOpaqueFloorPlanObjectKey({
      prefix: this.config.keyPrefix,
      kind,
      logicalIdentity,
      keySecret: this.config.keySecret,
    });
  }

  async putObject(input: PutFloorPlanObjectInput): Promise<void> {
    const key = assertSafeFloorPlanObjectKey(input.key);
    const sha256 = assertFloorPlanObjectSha256(input.sha256);
    if (!isValidMimeType(input.mimeType)) {
      throw new FloorPlanObjectStorageError(
        "invalid_metadata",
        "Floor-plan object MIME type is invalid."
      );
    }
    this.assertLengthWithinLimit(input.bytes.byteLength);
    verifyFloorPlanObjectBytes({
      bytes: input.bytes,
      expectedByteLength: input.bytes.byteLength,
      expectedSha256: sha256,
    });
    const headers: Record<string, string> = {
      "content-length": String(input.bytes.byteLength),
      "content-type": input.mimeType,
      "x-amz-meta-byte-length": String(input.bytes.byteLength),
      "x-amz-meta-sha256": sha256,
    };
    if (this.config.serverSideEncryption.mode !== "managed") {
      headers["x-amz-server-side-encryption"] = this.config.serverSideEncryption.mode;
      if (this.config.serverSideEncryption.mode === "aws:kms") {
        headers["x-amz-server-side-encryption-aws-kms-key-id"] =
          this.config.serverSideEncryption.kmsKeyId;
      }
    }
    const pending = await this.request({
      method: "PUT",
      key,
      payloadHash: sha256Hex(input.bytes),
      headers,
      body: Buffer.from(input.bytes),
    });
    try {
      if (!pending.response.ok) this.throwRequestFailure("PUT", pending.response.status);
    } finally {
      pending.finish();
    }
  }

  async getObject(input: GetFloorPlanObjectInput): Promise<Uint8Array | null> {
    const key = assertSafeFloorPlanObjectKey(input.key);
    assertFloorPlanObjectSha256(input.expectedSha256);
    this.assertLengthWithinLimit(input.expectedByteLength);
    if (!isValidMimeType(input.expectedMimeType)) {
      throw new FloorPlanObjectStorageError(
        "invalid_metadata",
        "Floor-plan object MIME type is invalid."
      );
    }
    const pending = await this.request({ method: "GET", key, payloadHash: EMPTY_SHA256 });
    try {
      if (pending.response.status === 404) return null;
      if (!pending.response.ok) this.throwRequestFailure("GET", pending.response.status);
      this.verifyResponseMetadata(pending.response, input);
      const bytes = await this.readBoundedBody(
        pending.response,
        input.expectedByteLength
      );
      verifyFloorPlanObjectBytes({
        bytes,
        expectedByteLength: input.expectedByteLength,
        expectedSha256: input.expectedSha256,
      });
      return bytes;
    } finally {
      pending.finish();
    }
  }

  async deleteObject(keyInput: string): Promise<void> {
    const key = assertSafeFloorPlanObjectKey(keyInput);
    const pending = await this.request({ method: "DELETE", key, payloadHash: EMPTY_SHA256 });
    try {
      if (pending.response.status === 404) return;
      if (!pending.response.ok) this.throwRequestFailure("DELETE", pending.response.status);
    } finally {
      pending.finish();
    }
  }

  private assertLengthWithinLimit(byteLength: number): void {
    if (
      !Number.isSafeInteger(byteLength) ||
      byteLength < 0 ||
      byteLength > this.config.maxObjectBytes
    ) {
      throw new FloorPlanObjectStorageError(
        "invalid_metadata",
        "Floor-plan object length is outside the configured storage limit."
      );
    }
  }

  private async request(input: {
    method: "PUT" | "GET" | "DELETE";
    key: string;
    payloadHash: string;
    headers?: Record<string, string>;
    body?: BodyInit;
  }): Promise<PendingResponse> {
    let lastCause: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const signed = signFloorPlanS3Request(this.config, { ...input, now: this.now() });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
      let response: Response;
      try {
        response = await this.fetch(signed.url, {
          method: input.method,
          headers: signed.headers,
          body: input.body,
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
        });
      } catch (cause) {
        clearTimeout(timeout);
        lastCause = cause;
        if (attempt < MAX_ATTEMPTS) {
          await this.sleep(attempt * 100);
          continue;
        }
        break;
      }
      if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS) {
        clearTimeout(timeout);
        await response.body?.cancel().catch(() => undefined);
        await this.sleep(attempt * 100);
        continue;
      }
      return { response, finish: () => clearTimeout(timeout) };
    }
    throw new FloorPlanObjectStorageError(
      "request_failed",
      `Private floor-plan object ${input.method} request failed after ${MAX_ATTEMPTS} attempts.`,
      { cause: lastCause }
    );
  }

  private verifyResponseMetadata(
    response: Response,
    expected: GetFloorPlanObjectInput
  ): void {
    const contentLength = response.headers.get("content-length");
    if (
      contentLength !== null &&
      exactUnsignedInteger(contentLength) !== expected.expectedByteLength
    ) {
      throw new FloorPlanObjectStorageError(
        "integrity_mismatch",
        "Floor-plan object response length does not match stored metadata."
      );
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (contentType && contentType.toLowerCase() !== expected.expectedMimeType.toLowerCase()) {
      throw new FloorPlanObjectStorageError(
        "integrity_mismatch",
        "Floor-plan object response MIME type does not match stored metadata."
      );
    }
    const metadataLength = response.headers.get("x-amz-meta-byte-length");
    if (
      metadataLength !== null &&
      exactUnsignedInteger(metadataLength) !== expected.expectedByteLength
    ) {
      throw new FloorPlanObjectStorageError(
        "integrity_mismatch",
        "Floor-plan object private metadata length is inconsistent."
      );
    }
    const metadataSha = response.headers.get("x-amz-meta-sha256");
    if (metadataSha !== null && metadataSha !== expected.expectedSha256) {
      throw new FloorPlanObjectStorageError(
        "integrity_mismatch",
        "Floor-plan object private metadata SHA-256 is inconsistent."
      );
    }
  }

  private async readBoundedBody(response: Response, expectedLength: number): Promise<Uint8Array> {
    if (!response.body) {
      if (expectedLength === 0) return new Uint8Array();
      throw new FloorPlanObjectStorageError(
        "integrity_mismatch",
        "Floor-plan object response body is missing."
      );
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > expectedLength || received > this.config.maxObjectBytes) {
        await reader.cancel().catch(() => undefined);
        throw new FloorPlanObjectStorageError(
          "integrity_mismatch",
          "Floor-plan object response exceeded its stored length."
        );
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  private throwRequestFailure(method: string, status: number): never {
    throw new FloorPlanObjectStorageError(
      "request_failed",
      `Private floor-plan object ${method} request returned HTTP ${status}.`
    );
  }
}
