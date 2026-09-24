import type { SourceTextEvidence } from "./deterministic-evidence";
import sharp from "sharp";
import type { FloorPlanLocalOcrCandidate, FloorPlanLocalOcrPage, FloorPlanLocalOcrResult } from "./local-ocr";

type Candidates = { candidates: FloorPlanLocalOcrCandidate[]; truncated: boolean };

export function restoreRotatedOcrCandidate(candidate: FloorPlanLocalOcrCandidate, page: FloorPlanLocalOcrPage, angle: 90 | 270): FloorPlanLocalOcrCandidate {
  const { left, top, right, bottom } = candidate.bbox;
  const bbox = angle === 90
    ? { left: top, top: page.heightPx - right, right: bottom, bottom: page.heightPx - left }
    : { left: page.widthPx - bottom, top: left, right: page.widthPx - top, bottom: right };
  return { ...candidate, bbox, rotationDegrees: angle === 90 ? 270 : 90 };
}

function overlapping(left: FloorPlanLocalOcrCandidate, right: FloorPlanLocalOcrCandidate) {
  const a = left.bbox, b = right.bbox;
  const area = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return area / Math.min((a.right - a.left) * (a.bottom - a.top), (b.right - b.left) * (b.bottom - b.top)) >= 0.6;
}

function mergeRotatedCandidates(current: FloorPlanLocalOcrCandidate[], proposed: FloorPlanLocalOcrCandidate[], maximum: number) {
  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, "");
  for (const candidate of proposed) {
    // Only add vertical source text; sideways readings of already-horizontal text are noise.
    if (candidate.bbox.bottom - candidate.bbox.top <= candidate.bbox.right - candidate.bbox.left) continue;
    const existing = current.findIndex((item) => normalize(item.text) === normalize(candidate.text) && overlapping(item, candidate));
    if (existing >= 0) {
      if (candidate.confidence > current[existing].confidence) current[existing] = candidate;
    } else if (current.length < maximum) {
      const conflicts = current.filter((item) => item.rotationDegrees !== candidate.rotationDegrees && overlapping(item, candidate));
      candidate.reviewRequired = conflicts.length > 0;
      conflicts.forEach((conflict) => { conflict.reviewRequired = true; });
      current.push(candidate);
    }
  }
}

/** Three local passes share their caller's worker, deadline and abort boundary. */
export async function recognizeLocalOcrOrientations(page: FloorPlanLocalOcrPage, maximum: number,
  recognize: (page: FloorPlanLocalOcrPage) => Promise<Candidates>): Promise<Candidates> {
  const result = await recognize(page);
  for (const angle of [90, 270] as const) {
    if (result.candidates.length >= maximum) return { ...result, truncated: true };
    const bytes = await sharp(Buffer.from(page.bytes)).rotate(angle).png().toBuffer();
    const rotated = await recognize({ ...page, bytes, widthPx: page.heightPx, heightPx: page.widthPx });
    mergeRotatedCandidates(result.candidates, rotated.candidates.map((candidate) => restoreRotatedOcrCandidate(candidate, page, angle)), maximum);
    result.truncated ||= rotated.truncated;
  }
  return result;
}

export function sourceTextEvidenceFromLocalOcr(
  pageNumber: number,
  result: FloorPlanLocalOcrResult
): SourceTextEvidence[] {
  return result.candidates.map((candidate, index) => ({
    id: `p${pageNumber}-ocr${index + 1}`,
    pageNumber,
    text: candidate.text,
    center: {
      x: (candidate.bbox.left + candidate.bbox.right) / 2,
      y: (candidate.bbox.top + candidate.bbox.bottom) / 2,
    },
    widthPx: candidate.bbox.right - candidate.bbox.left,
    ...(candidate.rotationDegrees ? { rotationDegrees: candidate.rotationDegrees } : {}),
    ...(candidate.reviewRequired ? { reviewRequired: true } : {}),
    heightPx: candidate.bbox.bottom - candidate.bbox.top,
    evidenceKind: "ocr",
  }));
}
