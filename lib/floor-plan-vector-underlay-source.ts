import type { FloorPlanUnderlay } from "@/lib/floor-plan-types";
import { vectorUnderlayPlacement, type PlanVectorUnderlay } from "@/lib/floor-plan-vector-underlay";
import { z } from "zod";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Imported bytes always pass the existing owner-scoped asset route; never fall back to a stale data URL. */
export function vectorUnderlaySource(underlay: FloorPlanUnderlay, linkedJobId?: string) {
  const match = /^\/api\/floor-plan-imports\/([a-z0-9_-]{1,191})\/assets\/([a-z0-9_-]{1,191})$/i.exec(underlay.assetUrl);
  const jobId = underlay.sourceJobId || linkedJobId || match?.[1];
  if (jobId && (!match || match[1] !== jobId)) throw new Error("Reopen the import to refresh its private reference image before export.");
  if (!match && !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(underlay.assetUrl)) {
    throw new Error("The reference image is unavailable. Reopen its import or upload the local image again.");
  }
  if (underlay.assetUrl.length > MAX_BYTES * 4 / 3 + 100) throw new Error("The reference image exceeds the 25 MB export limit.");
  return { url: underlay.assetUrl, jobId };
}

async function boundedResponse(response: Response, maxBytes: number) {
  if (!response.ok || Number(response.headers.get("Content-Length")) > maxBytes) throw new Error("The private reference image is unavailable or too large. It may have been deleted or access may have changed.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The reference image could not be read.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length;
      if (size > maxBytes) throw new Error("The reference image exceeds the export size limit.");
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

async function checkImportedSource(jobId: string, underlay: FloorPlanUnderlay, signal: AbortSignal) {
  const response = await fetch(`/api/floor-plan-imports/${encodeURIComponent(jobId)}`, { cache: "no-store", credentials: "same-origin", redirect: "error", signal });
  const bytes = await boundedResponse(response, 8 * 1024 * 1024);
  const result = z.object({ job: z.object({ id: z.literal(jobId), sourceDeletionRequestedAt: z.null(),
    sourceAsset: z.object({ contentDeletedAt: z.null(), sha256: z.string().regex(/^[a-f0-9]{64}$/i) }) }) }).safeParse(JSON.parse(new TextDecoder().decode(bytes)));
  if (!result.success || (underlay.sourceAssetSha256 && result.data.job.sourceAsset.sha256 !== underlay.sourceAssetSha256)) {
    throw new Error("The private source is deleted, changed or unavailable. Export the clean vector plan without its underlay.");
  }
}

/** Re-encode only the existing image pixels, removing EXIF/private metadata; no plan vectors pass through canvas. */
async function referencePixels(response: Response) {
  const type = response.headers.get("Content-Type")?.split(";")[0].trim() ?? "";
  if (!IMAGE_TYPES.has(type)) throw new Error("The reference image must be PNG, JPEG or WebP.");
  const bytes = await boundedResponse(response, MAX_BYTES);
  const bitmap = await createImageBitmap(new Blob([bytes.buffer], { type }));
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS) throw new Error("The reference image exceeds the 16 megapixel export limit.");
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Reference image decoding is unavailable.");
    try {
      context.drawImage(bitmap, 0, 0);
      const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The reference image could not be encoded.")), "image/png"));
      if (png.size > MAX_BYTES) throw new Error("The decoded reference image exceeds the 25 MB export limit.");
      return new Uint8Array(await png.arrayBuffer());
    } finally { canvas.width = 0; canvas.height = 0; }
  } finally { bitmap.close(); }
}

export async function loadVectorUnderlay(underlay: FloorPlanUnderlay, floorId: string, signal: AbortSignal, linkedJobId?: string): Promise<PlanVectorUnderlay> {
  const placement = vectorUnderlayPlacement(underlay, floorId), source = vectorUnderlaySource(underlay, linkedJobId);
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  if (source.jobId) await checkImportedSource(source.jobId, underlay, boundedSignal);
  const response = await fetch(source.url, { cache: "no-store", credentials: "same-origin", redirect: "error", signal: boundedSignal });
  const pngBytes = await referencePixels(response);
  if (source.jobId) await checkImportedSource(source.jobId, underlay, boundedSignal);
  boundedSignal.throwIfAborted();
  return { ...placement, pngBytes };
}

/** Recheck after font loading and PDF/SVG generation, immediately before delivering reference pixels. */
export async function confirmVectorUnderlayAccess(underlay: FloorPlanUnderlay, signal: AbortSignal, linkedJobId?: string) {
  const source = vectorUnderlaySource(underlay, linkedJobId);
  if (source.jobId) await checkImportedSource(source.jobId, underlay, AbortSignal.any([signal, AbortSignal.timeout(15_000)]));
  signal.throwIfAborted();
}
