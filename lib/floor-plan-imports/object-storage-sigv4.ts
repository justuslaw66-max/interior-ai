import { createHmac } from "node:crypto";
import type { FloorPlanS3StorageConfig } from "./object-storage-config";
import { FloorPlanObjectStorageError, sha256Hex } from "./object-storage";

type SignS3RequestInput = {
  method: "PUT" | "GET" | "DELETE";
  key: string;
  payloadHash: string;
  headers?: Record<string, string>;
  now: Date;
};

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function uriEncodeSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function canonicalPath(parts: readonly string[]): string {
  return `/${parts.filter(Boolean).map(uriEncodeSegment).join("/")}`;
}

function endpointPathParts(endpoint: URL): string[] {
  try {
    return endpoint.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
  } catch (cause) {
    throw new FloorPlanObjectStorageError(
      "configuration",
      "Floor-plan S3 endpoint contains an invalid encoded path.",
      { cause }
    );
  }
}

function objectLocation(
  config: FloorPlanS3StorageConfig,
  key: string
): { url: URL; canonicalUri: string; host: string } {
  const baseParts = endpointPathParts(config.endpoint);
  const url = new URL(config.endpoint.toString());
  const pathParts =
    config.addressingStyle === "virtual"
      ? [...baseParts, ...key.split("/")]
      : [...baseParts, config.bucket, ...key.split("/")];
  if (config.addressingStyle === "virtual") {
    url.hostname = `${config.bucket}.${config.endpoint.hostname}`;
  }
  const canonicalUri = canonicalPath(pathParts);
  url.pathname = canonicalUri;
  url.search = "";
  url.hash = "";
  return { url, canonicalUri, host: url.host };
}

export function signFloorPlanS3Request(
  config: FloorPlanS3StorageConfig,
  input: SignS3RequestInput
): { url: URL; headers: Headers } {
  const timestamp = input.now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = timestamp.slice(0, 8);
  const location = objectLocation(config, input.key);
  const signingHeaders: Record<string, string> = {
    host: location.host,
    ...(input.headers ?? {}),
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": timestamp,
  };
  if (config.sessionToken) signingHeaders["x-amz-security-token"] = config.sessionToken;
  const names = Object.keys(signingHeaders).map((name) => name.toLowerCase()).sort();
  const canonicalHeaders = names
    .map((name) => `${name}:${(signingHeaders[name] ?? "").trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    input.method,
    location.canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    credentialScope,
    sha256Hex(Buffer.from(canonicalRequest, "utf8")),
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), "s3"),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");
  const requestHeaders = new Headers();
  for (const [name, value] of Object.entries(signingHeaders)) {
    if (name !== "host") requestHeaders.set(name, value);
  }
  requestHeaders.set(
    "authorization",
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  );
  return { url: location.url, headers: requestHeaders };
}
