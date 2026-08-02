import {
  assertSafeFloorPlanObjectKey,
  FloorPlanObjectStorageError,
} from "./object-storage";

export type FloorPlanDatabaseStorageConfig = {
  provider: "database";
};

export type FloorPlanS3StorageConfig = {
  provider: "s3";
  endpoint: URL;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  addressingStyle: "path" | "virtual";
  keyPrefix: string;
  keySecret: string;
  maxObjectBytes: number;
  requestTimeoutMs: number;
  serverSideEncryption:
    | { mode: "managed" }
    | { mode: "AES256" }
    | { mode: "aws:kms"; kmsKeyId: string };
};

export type FloorPlanObjectStorageConfig =
  | FloorPlanDatabaseStorageConfig
  | FloorPlanS3StorageConfig;

type Environment = Record<string, string | undefined>;

const S3_ACTIVATION_ENV_KEYS = [
  "FLOOR_PLAN_S3_ENDPOINT",
  "FLOOR_PLAN_S3_REGION",
  "FLOOR_PLAN_S3_BUCKET",
  "FLOOR_PLAN_S3_ACCESS_KEY_ID",
  "FLOOR_PLAN_S3_SECRET_ACCESS_KEY",
  "FLOOR_PLAN_S3_SESSION_TOKEN",
  "FLOOR_PLAN_S3_KMS_KEY_ID",
  "FLOOR_PLAN_OBJECT_STORAGE_KEY_SECRET",
] as const;

function configured(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function required(env: Environment, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new FloorPlanObjectStorageError(
      "configuration",
      `${key} is required when floor-plan S3 object storage is enabled.`
    );
  }
  return value;
}

function integerSetting(input: {
  env: Environment;
  key: string;
  fallback: number;
  min: number;
  max: number;
}): number {
  const raw = input.env[input.key]?.trim();
  if (!raw) return input.fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < input.min || value > input.max) {
    throw new FloorPlanObjectStorageError(
      "configuration",
      `${input.key} must be an integer between ${input.min} and ${input.max}.`
    );
  }
  return value;
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]";
}

function endpointFromEnv(env: Environment): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(required(env, "FLOOR_PLAN_S3_ENDPOINT"));
  } catch (cause) {
    if (cause instanceof FloorPlanObjectStorageError) throw cause;
    throw new FloorPlanObjectStorageError(
      "configuration",
      "FLOOR_PLAN_S3_ENDPOINT must be an absolute HTTPS URL.",
      { cause }
    );
  }
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    (endpoint.protocol !== "https:" &&
      !(
        endpoint.protocol === "http:" &&
        env.NODE_ENV !== "production" &&
        isLoopback(endpoint.hostname)
      ))
  ) {
    throw new FloorPlanObjectStorageError(
      "configuration",
      "FLOOR_PLAN_S3_ENDPOINT must use HTTPS without credentials, query, or fragment; HTTP is limited to a non-production loopback endpoint."
    );
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");
  return endpoint;
}

function validateBucket(value: string): string {
  if (
    value.length < 3 ||
    value.length > 63 ||
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(value) ||
    value.includes("..") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)
  ) {
    throw new FloorPlanObjectStorageError(
      "configuration",
      "FLOOR_PLAN_S3_BUCKET is not a valid S3 bucket name."
    );
  }
  return value;
}

function headerSafe(value: string, key: string, maxLength = 2_048): string {
  if (value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new FloorPlanObjectStorageError(
      "configuration",
      `${key} contains unsupported control characters or is too long.`
    );
  }
  return value;
}

function resolveEncryption(env: Environment): FloorPlanS3StorageConfig["serverSideEncryption"] {
  const mode = env.FLOOR_PLAN_S3_SERVER_SIDE_ENCRYPTION?.trim() || "AES256";
  if (mode === "managed") return { mode };
  if (mode === "AES256") return { mode };
  if (mode === "aws:kms") {
    return {
      mode,
      kmsKeyId: headerSafe(required(env, "FLOOR_PLAN_S3_KMS_KEY_ID"), "FLOOR_PLAN_S3_KMS_KEY_ID"),
    };
  }
  throw new FloorPlanObjectStorageError(
    "configuration",
    "FLOOR_PLAN_S3_SERVER_SIDE_ENCRYPTION must be managed, AES256, or aws:kms."
  );
}

export function resolveFloorPlanObjectStorageConfig(
  env: Environment = process.env
): FloorPlanObjectStorageConfig {
  const explicitProvider = env.FLOOR_PLAN_OBJECT_STORAGE_PROVIDER?.trim();
  const provider = explicitProvider || "database";
  if (provider !== "database" && provider !== "s3") {
    throw new FloorPlanObjectStorageError(
      "configuration",
      "FLOOR_PLAN_OBJECT_STORAGE_PROVIDER must be database or s3."
    );
  }
  if (provider === "database") {
    const unexpected = explicitProvider
      ? undefined
      : S3_ACTIVATION_ENV_KEYS.find((key) => configured(env[key]));
    if (unexpected) {
      throw new FloorPlanObjectStorageError(
        "configuration",
        `${unexpected} is set but FLOOR_PLAN_OBJECT_STORAGE_PROVIDER is not s3.`
      );
    }
    return { provider };
  }

  const endpoint = endpointFromEnv(env);
  const region = required(env, "FLOOR_PLAN_S3_REGION");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(region)) {
    throw new FloorPlanObjectStorageError(
      "configuration",
      "FLOOR_PLAN_S3_REGION contains unsupported characters."
    );
  }
  const bucket = validateBucket(required(env, "FLOOR_PLAN_S3_BUCKET"));
  const addressingStyle = env.FLOOR_PLAN_S3_ADDRESSING_STYLE?.trim() || "path";
  if (addressingStyle !== "path" && addressingStyle !== "virtual") {
    throw new FloorPlanObjectStorageError(
      "configuration",
      "FLOOR_PLAN_S3_ADDRESSING_STYLE must be path or virtual."
    );
  }
  if (addressingStyle === "virtual" && bucket.includes(".") && endpoint.protocol === "https:") {
    throw new FloorPlanObjectStorageError(
      "configuration",
      "Dotted bucket names are not accepted with HTTPS virtual-host addressing."
    );
  }
  const keyPrefix = env.FLOOR_PLAN_S3_KEY_PREFIX?.trim() || "floor-plans/v1";
  assertSafeFloorPlanObjectKey(`${keyPrefix}/probe`);
  const keySecret = required(env, "FLOOR_PLAN_OBJECT_STORAGE_KEY_SECRET");
  if (Buffer.byteLength(keySecret, "utf8") < 32) {
    throw new FloorPlanObjectStorageError(
      "configuration",
      "FLOOR_PLAN_OBJECT_STORAGE_KEY_SECRET must be at least 32 bytes."
    );
  }
  return {
    provider,
    endpoint,
    region,
    bucket,
    accessKeyId: headerSafe(
      required(env, "FLOOR_PLAN_S3_ACCESS_KEY_ID"),
      "FLOOR_PLAN_S3_ACCESS_KEY_ID",
      256
    ),
    secretAccessKey: required(env, "FLOOR_PLAN_S3_SECRET_ACCESS_KEY"),
    sessionToken: env.FLOOR_PLAN_S3_SESSION_TOKEN?.trim()
      ? headerSafe(env.FLOOR_PLAN_S3_SESSION_TOKEN.trim(), "FLOOR_PLAN_S3_SESSION_TOKEN", 8_192)
      : undefined,
    addressingStyle,
    keyPrefix,
    keySecret,
    maxObjectBytes: integerSetting({
      env,
      key: "FLOOR_PLAN_S3_MAX_OBJECT_BYTES",
      fallback: 32 * 1024 * 1024,
      min: 1024,
      max: 256 * 1024 * 1024,
    }),
    requestTimeoutMs: integerSetting({
      env,
      key: "FLOOR_PLAN_S3_REQUEST_TIMEOUT_MS",
      fallback: 30_000,
      min: 1_000,
      max: 120_000,
    }),
    serverSideEncryption: resolveEncryption(env),
  };
}
