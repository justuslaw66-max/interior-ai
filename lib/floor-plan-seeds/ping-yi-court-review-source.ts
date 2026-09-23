import { hashFloorPlanSource } from "@/lib/floor-plan-imports/json";
import {
  MAX_FLOOR_PLAN_UPLOAD_BYTES,
  hasExpectedFloorPlanSignature,
} from "@/lib/floor-plan-imports/validation";
import type { PingYiCourtReviewSeedBundleV2 } from "./ping-yi-court-v2";

const DOWNLOAD_TIMEOUT_MS = 30_000;

async function readBoundedResponse(response: Response): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength.trim())) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > MAX_FLOOR_PLAN_UPLOAD_BYTES) {
      throw new Error("The registered floor-plan source is larger than 25 MB");
    }
  }
  if (!response.body) throw new Error("The registered floor-plan source returned no content");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > MAX_FLOOR_PLAN_UPLOAD_BYTES) {
        await reader.cancel("floor_plan_source_too_large");
        throw new Error("The registered floor-plan source is larger than 25 MB");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  if (byteLength === 0) throw new Error("The registered floor-plan source is empty");
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function downloadPingYiCourtReviewSource(input: {
  bundle: PingYiCourtReviewSeedBundleV2;
  fetcher?: typeof fetch;
}): Promise<Uint8Array> {
  const url = new URL(input.bundle.source.url);
  if (url.protocol !== "https:") {
    throw new Error("The registered Ping Yi Court source must use HTTPS");
  }

  const response = await (input.fetcher ?? fetch)(url, {
    cache: "no-store",
    headers: { Accept: "application/pdf" },
    redirect: "follow",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`The registered floor-plan source returned HTTP ${response.status}`);
  }

  const bytes = await readBoundedResponse(response);
  if (!hasExpectedFloorPlanSignature(bytes, "application/pdf")) {
    throw new Error("The registered floor-plan source is not a valid PDF");
  }
  if (hashFloorPlanSource(bytes) !== input.bundle.source.sha256) {
    throw new Error("The registered floor-plan source no longer matches its reviewed hash");
  }
  return bytes;
}
