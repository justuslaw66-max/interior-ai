import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type FloorPlanObjectKind = "source" | "derived";

export type PutFloorPlanObjectInput = {
  key: string;
  bytes: Uint8Array;
  mimeType: string;
  sha256: string;
};

export type GetFloorPlanObjectInput = {
  key: string;
  expectedByteLength: number;
  expectedMimeType: string;
  expectedSha256: string;
};

/**
 * Private byte-storage boundary. Implementations return bytes, never public or
 * pre-signed URLs, so every download remains behind the application's own
 * authorization checks.
 */
export interface PrivateFloorPlanObjectStorage {
  keyFor(kind: FloorPlanObjectKind, logicalIdentity: string): string;
  putObject(input: PutFloorPlanObjectInput): Promise<void>;
  getObject(input: GetFloorPlanObjectInput): Promise<Uint8Array | null>;
  deleteObject(key: string): Promise<void>;
}

export class FloorPlanObjectStorageError extends Error {
  constructor(
    readonly code:
      | "configuration"
      | "invalid_key"
      | "invalid_metadata"
      | "integrity_mismatch"
      | "request_failed",
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "FloorPlanObjectStorageError";
  }
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_KEY_PATTERN = /^[a-z0-9][a-z0-9/_-]{0,1023}$/;

export function assertFloorPlanObjectSha256(value: string): string {
  if (!SHA256_PATTERN.test(value)) {
    throw new FloorPlanObjectStorageError(
      "invalid_metadata",
      "Floor-plan object SHA-256 must be 64 lowercase hexadecimal characters."
    );
  }
  return value;
}

export function assertSafeFloorPlanObjectKey(key: string): string {
  if (
    !SAFE_KEY_PATTERN.test(key) ||
    key.includes("//") ||
    key.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new FloorPlanObjectStorageError(
      "invalid_key",
      "Floor-plan object key is not in the private safe-key namespace."
    );
  }
  return key;
}

export function createOpaqueFloorPlanObjectKey(input: {
  prefix: string;
  kind: FloorPlanObjectKind;
  logicalIdentity: string;
  keySecret: string;
}): string {
  const opaqueId = createHmac("sha256", input.keySecret)
    .update("floor-plan-object-key\0", "utf8")
    .update(input.kind, "utf8")
    .update("\0", "utf8")
    .update(input.logicalIdentity, "utf8")
    .digest("hex");
  return assertSafeFloorPlanObjectKey(`${input.prefix}/${input.kind}/${opaqueId}`);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyFloorPlanObjectBytes(input: {
  bytes: Uint8Array;
  expectedByteLength: number;
  expectedSha256: string;
}): void {
  const expectedSha256 = assertFloorPlanObjectSha256(input.expectedSha256);
  if (
    !Number.isSafeInteger(input.expectedByteLength) ||
    input.expectedByteLength < 0 ||
    input.bytes.byteLength !== input.expectedByteLength
  ) {
    throw new FloorPlanObjectStorageError(
      "integrity_mismatch",
      "Floor-plan object length does not match its stored metadata."
    );
  }
  const actual = Buffer.from(sha256Hex(input.bytes), "hex");
  const expected = Buffer.from(expectedSha256, "hex");
  if (!timingSafeEqual(actual, expected)) {
    throw new FloorPlanObjectStorageError(
      "integrity_mismatch",
      "Floor-plan object SHA-256 does not match its stored metadata."
    );
  }
}
