import { z } from "zod";
import { mapPhotoPoint,photoDistance, type PhotoMatrix, type PhotoPoint } from "./floor-plan-photo-math";

const point = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const span = z.object({ id: z.string().min(1).max(200), first: point, second: point,
  lengthMm: z.number().int().min(100).max(1_000_000), use: z.enum(["fit", "check"]),
  quality: z.enum(["clean", "scan"]) }).strict();
const matrix=z.tuple([z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite()]);
const originalFrame=z.object({widthPx:z.number().int().positive(),heightPx:z.number().int().positive(),renderedToOriginal:matrix}).strict();
export const photoReviewDraftSchema=z.object({sourceId:z.string().min(1).max(200),pageNumber:z.number().int().positive(),
  widthPx:z.number().int().positive().max(100_000),heightPx:z.number().int().positive().max(100_000),
  measurements:z.array(span.extend({lengthMm:z.number().int().min(0).max(1_000_000)})).max(32),first:z.tuple([point,point]).nullable(),second:z.tuple([point,point]).nullable(),confirmed:z.boolean()}).strict();
export type PhotoReviewDraft=z.infer<typeof photoReviewDraftSchema>;
export const photoConstraintsSchema = z.object({
  widthPx: z.number().int().positive().max(100_000), heightPx: z.number().int().positive().max(100_000),
  originalFrame:originalFrame.optional(),
  measurements: z.array(span).min(8).max(32),
  squareCorner: z.object({ first: z.tuple([point, point]), second: z.tuple([point, point]),
    confirmed: z.literal(true) }).strict(),
}).strict();
export type PhotoConstraints = z.infer<typeof photoConstraintsSchema>;
export type PhotoCorrection = {
  kind: "constrained_photo_v1";
  originalToCorrected: PhotoMatrix;
  correctedWidthPx: number;
  correctedHeightPx: number;
  constraints: PhotoConstraints;
};

export const originalPhotoPoint=(input:PhotoConstraints,point:PhotoPoint)=>input.originalFrame?mapPhotoPoint(input.originalFrame.renderedToOriginal,point):point;

export function parsePhotoConstraints(value: unknown): PhotoConstraints {
  const input = photoConstraintsSchema.parse(value), ids = new Set<string>();
  const points: PhotoPoint[] = [...input.squareCorner.first, ...input.squareCorner.second];
  if (input.measurements.filter((m) => m.use === "fit").length < 6 || input.measurements.filter((m) => m.use === "check").length < 2) {
    throw new Error("Choose at least six fitting measurements and two separate checks.");
  }
  for (const measurement of input.measurements) {
    if (ids.has(measurement.id)) throw new Error("Measurement IDs must be distinct.");
    ids.add(measurement.id); points.push(measurement.first, measurement.second);
    if (photoDistance(measurement.first, measurement.second) < 8) throw new Error("Choose longer, legible dimension spans.");
  }
  if (points.some((p) => p.x < 0 || p.y < 0 || p.x > input.widthPx || p.y > input.heightPx)) {
    throw new Error("All anchors must be inside the original source frame.");
  }
  for (const line of [input.squareCorner.first, input.squareCorner.second]) {
    if (photoDistance(...line) < 8) throw new Error("Select a longer straight portion of each confirmed corner edge.");
  }
  for (let i = 0; i < input.measurements.length; i++) for (let j = i + 1; j < input.measurements.length; j++) {
    const a = input.measurements[i], b = input.measurements[j];
    if (Math.min(Math.max(photoDistance(a.first,b.first),photoDistance(a.second,b.second)),
      Math.max(photoDistance(a.first,b.second),photoDistance(a.second,b.first))) <= 3) {
      throw new Error("Repeated endpoints cannot count as independent measurements.");
    }
  }
  return input;
}
