import { z } from "zod";

/**
 * Local floor-plan vectorizer evidence.
 *
 * The vectorizer is a Python program (services/floorplan-vectorizer) that reads
 * one rendered plan page and reports what is drawn on it: room names, printed
 * dimensions with the two points each one measures, doors / windows / doorways
 * as jamb-to-jamb spans, sanitary fixtures, and closed rooms as wall
 * centre-line polygons with measured wall thickness. Nothing leaves the
 * machine. Its output is evidence like any other: scale is still solved and
 * cross-checked by the adapter, and every entity still goes to review.
 */

export const VECTORIZER_EVIDENCE_KIND = "floorplan_vectorizer_evidence_v1";

const point = z.tuple([z.number().finite(), z.number().finite()]);
const ratioPoint = z.object({
  xRatio: z.number().min(0).max(1),
  yRatio: z.number().min(0).max(1),
});
const ratioBox = z.object({
  leftRatio: z.number().min(0).max(1),
  topRatio: z.number().min(0).max(1),
  rightRatio: z.number().min(0).max(1),
  bottomRatio: z.number().min(0).max(1),
});
const roomType = z.enum([
  "living",
  "dining",
  "bedroom",
  "kitchen",
  "toilet",
  "service_yard",
  "shelter",
  "study",
  "other",
]);
const openingKind = z.enum(["door", "window", "open_passage"]);
const openingOperation = z.enum(["swing", "sliding", "folding", "fixed", "open"]);

const edgeOpening = z.object({
  kind: openingKind,
  operation: openingOperation,
  confidence: z.number().min(0).max(1),
  handing: z.enum(["double", "unknown"]).catch("unknown"),
  hingeSourcePx: point.nullish(),
  swingTowardSourcePx: point.nullish(),
  widthMm: z.number().int().positive().nullish(),
  note: z.string().max(240).nullish(),
});

const vectorizerEvidenceSchema = z.object({
  kind: z.literal(VECTORIZER_EVIDENCE_KIND),
  exporterVersion: z.string().max(80),
  page: z.object({
    widthPx: z.number().positive(),
    heightPx: z.number().positive(),
    coordinateSpace: z.literal("source_image_px"),
  }),
  scale: z.object({
    millimetresPerPixel: z.number().positive().nullable(),
    basis: z.enum(["explicit_dimension", "estimated_door_leaf", "none"]),
    dimensionCount: z.number().int().min(0),
    needsReview: z.boolean(),
    // What an estimated scale rests on, for the reviewer. Never an accepted scale.
    estimate: z
      .object({
        method: z.string().max(80),
        assumedLeafMm: z.number().positive(),
        swingsMeasured: z.number().int().min(0),
        doorOpenings: z
          .array(
            z.object({
              openingId: z.string().max(40),
              sourcePx: z.tuple([point, point]),
              widthPx: z.number().positive(),
              widthMmAtEstimate: z.number().int().positive(),
            })
          )
          .max(8),
      })
      .nullable()
      .optional(),
  }),
  semantics: z.object({
    planRegion: z
      .object({
        bbox: ratioBox,
        rotationDegrees: z.number().min(-180).max(180),
        confidence: z.number().min(0).max(1),
      })
      .nullable(),
    roomLabels: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(120),
          roomType,
          centerXRatio: z.number().min(0).max(1),
          centerYRatio: z.number().min(0).max(1),
          bbox: ratioBox,
          confidence: z.number().min(0).max(1),
        })
      )
      .max(100),
    dimensionLabels: z
      .array(
        z.object({
          valueMm: z.number().int().min(100).max(100_000),
          rawText: z.string().max(80),
          centerXRatio: z.number().min(0).max(1),
          centerYRatio: z.number().min(0).max(1),
          orientation: z.enum(["horizontal", "vertical"]),
          // A label the vectorizer read but could not pair with two stops carries no measured span; it may still
          // carry a search hint (the printed length about the number, on its dimension line) for the tick finder.
          extensionStart: ratioPoint.optional(),
          extensionEnd: ratioPoint.optional(),
          spanSourcePx: z.tuple([point, point]).optional(),
          confidence: z.number().min(0).max(1),
        })
      )
      .max(200),
    openingSymbols: z
      .array(
        z.object({
          kind: openingKind,
          operation: openingOperation,
          centerXRatio: z.number().min(0).max(1),
          centerYRatio: z.number().min(0).max(1),
          spanStart: ratioPoint.optional(),
          spanEnd: ratioPoint.optional(),
          confidence: z.number().min(0).max(1),
        })
      )
      .max(200),
    fixtureSymbols: z
      .array(
        z.object({
          kind: z.enum(["toilet", "basin"]),
          centerXRatio: z.number().min(0).max(1),
          centerYRatio: z.number().min(0).max(1),
          bbox: ratioBox,
          confidence: z.number().min(0).max(1),
        })
      )
      .max(300),
    notes: z.array(z.string().max(240)).max(30),
  }),
  wallEdges: z
    .array(
      z.object({
        id: z.string().max(40),
        kind: z.enum(["wall_centerline", "supported_opening_span"]),
        sourcePx: z.tuple([point, point]),
        thicknessPx: z.number().positive(),
        opening: edgeOpening.nullable(),
      })
    )
    .max(4_000),
  rooms: z
    .array(
      z.object({
        key: z.string().max(40),
        label: z.string().max(240),
        roomType,
        confidence: z.number().min(0).max(1),
        sourcePoints: z
          .array(z.object({ x: z.number().finite(), y: z.number().finite() }))
          .min(3)
          .max(256),
        edgeIds: z.array(z.string().max(40)).min(3).max(256),
      })
    )
    .max(200),
  diagnostics: z.record(z.string(), z.unknown()),
});

export type FloorPlanVectorizerEvidence = z.infer<typeof vectorizerEvidenceSchema>;

export function parseFloorPlanVectorizerEvidence(value: unknown): FloorPlanVectorizerEvidence {
  return vectorizerEvidenceSchema.parse(value);
}
