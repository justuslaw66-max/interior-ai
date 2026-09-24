import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  pointInPolygon,
  semanticEvidencePrior,
  type PageSemanticEvidence,
  type RegisteredPageEvidence,
  type RegisteredRoomBoundary,
  type SemanticRoomLabel,
  type SourcePointPx,
} from "./deterministic-evidence";
import type { RasterDimensionAssociation } from "./raster-dimension-spans";

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
          extensionStart: ratioPoint,
          extensionEnd: ratioPoint,
          spanSourcePx: z.tuple([point, point]),
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

/** What the adapter keeps on the page between pipeline stages (plain JSON). */
export type RegisteredVectorizerEvidence = {
  exporterVersion: string;
  imageSha256: string;
  scaleHint: FloorPlanVectorizerEvidence["scale"];
  /** Index into `semantics.dimensionLabels` → the measured span, rendered-page pixels. */
  dimensionSpans: Array<{ labelIndex: number; valueMm: number; start: SourcePointPx; end: SourcePointPx }>;
  wallEdges: FloorPlanVectorizerEvidence["wallEdges"];
  rooms: FloorPlanVectorizerEvidence["rooms"];
  diagnostics: FloorPlanVectorizerEvidence["diagnostics"];
};

export type FloorPlanVectorizerPage = {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  mimeType: string;
  bytes: Uint8Array;
};

/** Server-local boundary. Implementations must not upload page bytes. */
export interface FloorPlanVectorizerProvider {
  readonly id: string;
  analyzePage(
    page: FloorPlanVectorizerPage,
    options: { timeoutMs: number; signal?: AbortSignal }
  ): Promise<FloorPlanVectorizerEvidence>;
}

export function floorPlanVectorizerRuntimeConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env
) {
  const timeout = Number.parseInt(environment.FLOOR_PLAN_VECTORIZER_TIMEOUT_MS ?? "", 10);
  return Object.freeze({
    enabled: environment.FLOOR_PLAN_VECTORIZER_ENABLED === "1",
    pythonPath: environment.FLOOR_PLAN_VECTORIZER_PYTHON || "python3",
    directory:
      environment.FLOOR_PLAN_VECTORIZER_DIR ||
      path.join(process.cwd(), "services", "floorplan-vectorizer"),
    timeoutMs: Number.isFinite(timeout) ? Math.max(10_000, Math.min(timeout, 900_000)) : 420_000,
  });
}

function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; signal?: AbortSignal }
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => {
      child.kill("SIGKILL");
      finish(new Error("Floor-plan vectorizer was cancelled"));
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`Floor-plan vectorizer exceeded ${options.timeoutMs} ms`));
    }, options.timeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 4_000) stderr += chunk.toString("utf8");
    });
    child.on("error", (cause) => finish(cause));
    child.on("close", (code) =>
      finish(
        code === 0
          ? undefined
          : new Error(`Floor-plan vectorizer exited with ${code}: ${stderr.trim().split("\n").at(-1) ?? ""}`)
      )
    );
  });
}

/** Runs the two Python programs on a private temporary copy of the page and removes it afterwards. */
export class PythonFloorPlanVectorizerProvider implements FloorPlanVectorizerProvider {
  readonly id = "python-floorplan-vectorizer";

  constructor(private readonly config = floorPlanVectorizerRuntimeConfiguration()) {}

  async analyzePage(
    page: FloorPlanVectorizerPage,
    options: { timeoutMs: number; signal?: AbortSignal }
  ) {
    const workDirectory = await mkdtemp(path.join(tmpdir(), "floor-plan-vectorizer-"));
    try {
      const extension = page.mimeType === "image/webp" ? "webp" : "png";
      const input = path.join(workDirectory, `page.${extension}`);
      const base = path.join(workDirectory, "page");
      await writeFile(input, page.bytes, { mode: 0o600 });
      const started = Date.now();
      await runProcess(
        this.config.pythonPath,
        [path.join(this.config.directory, "floorplan_vectorize.py"), input, base, "--px-size"],
        { cwd: workDirectory, timeoutMs: options.timeoutMs, signal: options.signal }
      );
      await runProcess(
        this.config.pythonPath,
        [path.join(this.config.directory, "app_evidence.py"), `${base}.json`, `${base}.evidence.json`],
        {
          cwd: workDirectory,
          timeoutMs: Math.max(10_000, options.timeoutMs - (Date.now() - started)),
          signal: options.signal,
        }
      );
      return parseFloorPlanVectorizerEvidence(
        JSON.parse(await readFile(`${base}.evidence.json`, "utf8"))
      );
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }
}

export function createDefaultFloorPlanVectorizerProvider(): FloorPlanVectorizerProvider | null {
  const config = floorPlanVectorizerRuntimeConfiguration();
  return config.enabled ? new PythonFloorPlanVectorizerProvider(config) : null;
}

const scalePoint = (value: readonly [number, number], sx: number, sy: number): SourcePointPx => ({
  x: value[0] * sx,
  y: value[1] * sy,
});

/**
 * Registers vectorizer output on a page. Semantic observations are returned
 * for the adapter's ordinary `mergeSemantics`; spans, wall edges and rooms are
 * kept on the page for the scale and topology stages. The analysed image must
 * be the page's rendered derivative, so positions are rendered-page pixels.
 */
export function registerVectorizerEvidence(
  page: RegisteredPageEvidence,
  evidence: FloorPlanVectorizerEvidence,
  imageBytes: Uint8Array
): PageSemanticEvidence {
  const sx = page.widthPx / evidence.page.widthPx;
  const sy = page.heightPx / evidence.page.heightPx;
  if (Math.abs(sx - 1) > 0.02 || Math.abs(sy - 1) > 0.02) {
    throw new Error("Vectorizer evidence does not belong to the registered page image.");
  }
  const kind = "vectorizer" as const;
  // The platform prior is a ceiling; an item the vectorizer itself doubts keeps its lower value.
  const ceiling = semanticEvidencePrior(kind);
  const capped = <T extends { confidence: number }>(item: T): T => ({
    ...item,
    confidence: Math.min(item.confidence, ceiling),
  });
  const semantics: PageSemanticEvidence = {
    planRegion: evidence.semantics.planRegion
      ? { ...capped(evidence.semantics.planRegion), evidenceKind: kind }
      : null,
    unitSystem: evidence.semantics.dimensionLabels.length ? "metric_mm" : "unknown",
    roomLabels: evidence.semantics.roomLabels.map((label) => ({
      ...capped(label),
      rawText: label.label,
      evidenceKind: kind,
    })),
    // Rooms travel as registered wall topology, not as approximate proposals
    // for the vision-guided snapper.
    roomBoundaries: [],
    dimensionLabels: evidence.semantics.dimensionLabels.map(
      ({ spanSourcePx: _span, ...label }) => ({
        ...capped(label),
        extensionEvidenceKind: kind,
        evidenceKind: kind,
      })
    ),
    openingSymbols: evidence.semantics.openingSymbols.map((symbol) => ({
      ...capped(symbol),
      evidenceKind: kind,
    })),
    fixtureSymbols: evidence.semantics.fixtureSymbols.map((fixture) => ({
      ...capped(fixture),
      evidenceKind: kind,
    })),
    entrance: null,
    notes: evidence.semantics.notes,
  };
  page.vectorizer = {
    exporterVersion: evidence.exporterVersion,
    imageSha256: createHash("sha256").update(imageBytes).digest("hex"),
    scaleHint: evidence.scale,
    dimensionSpans: evidence.semantics.dimensionLabels.map((label, labelIndex) => ({
      labelIndex,
      valueMm: label.valueMm,
      start: scalePoint(label.spanSourcePx[0], sx, sy),
      end: scalePoint(label.spanSourcePx[1], sx, sy),
    })),
    wallEdges: evidence.wallEdges.map((edge) => ({
      ...edge,
      sourcePx: [
        [edge.sourcePx[0][0] * sx, edge.sourcePx[0][1] * sy],
        [edge.sourcePx[1][0] * sx, edge.sourcePx[1][1] * sy],
      ],
    })),
    rooms: evidence.rooms.map((room) => ({
      ...room,
      sourcePoints: room.sourcePoints.map((value) => ({ x: value.x * sx, y: value.y * sy })),
    })),
    diagnostics: evidence.diagnostics,
  };
  return semantics;
}

/**
 * The adapter's own tick search stays authoritative. Where it could not
 * support a printed dimension, the span the vectorizer measured between that
 * dimension's two stops stands in, so the same cross-checked solver decides.
 */
export function mergeVectorizerDimensionSpans(page: RegisteredPageEvidence) {
  const registered = page.vectorizer;
  if (!registered?.dimensionSpans.length) return 0;
  const labels = page.semantics.dimensionLabels;
  const observations: RasterDimensionAssociation[] = [
    ...(page.dimensionSpanEvidence?.observations ?? []),
  ];
  let added = 0;
  const hint = registered.scaleHint.basis === "explicit_dimension" ? registered.scaleHint.millimetresPerPixel : null;
  for (const span of registered.dimensionSpans) {
    // Only spans that agree with their printed number to two pixels are offered as source-supported; a looser span
    // would be reported by the cross-check as a conflict and sink an otherwise good scale.
    const lengthPx = Math.hypot(span.end.x - span.start.x, span.end.y - span.start.y);
    if (!hint || Math.abs(span.valueMm / hint - lengthPx) > 2) continue;
    const center = {
      x: (span.start.x + span.end.x) / 2,
      y: (span.start.y + span.end.y) / 2,
    };
    // Semantics were merged after registration: find this dimension again by
    // value and extension points rather than by its original index.
    const labelIndex = labels.findIndex(
      (label) =>
        (label.evidenceKind === "vectorizer" || label.extensionEvidenceKind === "vectorizer") &&
        label.valueMm === span.valueMm &&
        label.extensionStart !== undefined &&
        label.extensionEnd !== undefined &&
        Math.hypot(
          ((label.extensionStart.xRatio + label.extensionEnd.xRatio) / 2) * page.widthPx - center.x,
          ((label.extensionStart.yRatio + label.extensionEnd.yRatio) / 2) * page.heightPx - center.y
        ) <= 2
    );
    const label = labels[labelIndex];
    if (!label?.extensionStart || !label.extensionEnd) continue;
    const existing = observations.findIndex((entry) => entry.labelIndex === labelIndex);
    if (existing >= 0 && observations[existing].status === "source_supported") continue;
    const observation: RasterDimensionAssociation = {
      labelIndex,
      valueMm: label.valueMm,
      hintStart: {
        x: label.extensionStart.xRatio * page.widthPx,
        y: label.extensionStart.yRatio * page.heightPx,
      },
      hintEnd: {
        x: label.extensionEnd.xRatio * page.widthPx,
        y: label.extensionEnd.yRatio * page.heightPx,
      },
      start: span.start,
      end: span.end,
      lineCoverage: 1,
      status: "source_supported",
      reason: null,
    };
    if (existing >= 0) observations[existing] = observation;
    else observations.push(observation);
    added += 1;
  }
  if (added) {
    page.dimensionSpanEvidence = {
      coordinateSpace: "rendered_px",
      imageSha256: page.dimensionSpanEvidence?.imageSha256 ?? registered.imageSha256,
      observations,
    };
  }
  return added;
}

function labelsInside(page: RegisteredPageEvidence, polygon: SourcePointPx[]): SemanticRoomLabel[] {
  return page.semantics.roomLabels.filter(
    (label) =>
      label.confidence >= 0.45 &&
      pointInPolygon(
        { x: label.centerXRatio * page.widthPx, y: label.centerYRatio * page.heightPx },
        polygon
      )
  );
}

/**
 * Vectorizer rooms as registered boundaries: wall centre-line polygons whose
 * every side carries measured thickness and, where a door, window or doorway
 * stands in it, that opening. Thickness is converted with the adapter's
 * accepted scale, never with the vectorizer's own.
 */
export function vectorizerRoomBoundaries(
  page: RegisteredPageEvidence,
  millimetresPerPixel: number
): RegisteredRoomBoundary[] {
  const registered = page.vectorizer;
  if (!registered) return [];
  const edgeById = new Map(registered.wallEdges.map((edge) => [edge.id, edge]));
  return registered.rooms.flatMap((room, index): RegisteredRoomBoundary[] => {
    if (room.edgeIds.length !== room.sourcePoints.length) return [];
    const edges = room.edgeIds.map((id) => edgeById.get(id));
    if (edges.some((edge) => !edge)) return [];
    const sourceLabels = labelsInside(page, room.sourcePoints);
    const xs = room.sourcePoints.map((value) => value.x);
    const ys = room.sourcePoints.map((value) => value.y);
    const named = sourceLabels[0];
    return [
      {
        key: `room-${index + 1}`,
        label: named?.label ?? (room.label || `Room ${index + 1}`),
        roomType: named?.roomType ?? room.roomType,
        confidence: room.confidence,
        pathId: `vectorizer:${room.key}`,
        bbox: {
          left: Math.min(...xs),
          top: Math.min(...ys),
          right: Math.max(...xs),
          bottom: Math.max(...ys),
        },
        sourcePoints: room.sourcePoints,
        sourceLabels,
        registrationKind: "vectorizer_wall_topology",
        sourceEdges: edges.map((edge) => {
          const found = edge!;
          const thicknessMm = Math.max(
            40,
            Math.min(600, Math.round((found.thicknessPx * millimetresPerPixel) / 5) * 5)
          );
          return {
            evidenceId: `vectorizer:${found.id}`,
            kind: found.kind,
            thicknessMm,
            sourcePathIds: [],
            sourceSegmentIds: [],
            opening: found.opening
              ? {
                  id: `vectorizer:${found.id}`,
                  kind: found.opening.kind,
                  operation: found.opening.operation,
                  proof: "vectorizer_drawn_symbol" as const,
                  widthMm: Math.round(
                    Math.hypot(
                      found.sourcePx[1][0] - found.sourcePx[0][0],
                      found.sourcePx[1][1] - found.sourcePx[0][1]
                    ) * millimetresPerPixel
                  ),
                  confidence: found.opening.confidence,
                  supportPathIds: [],
                  supportSubpathIds: [],
                  supportSegmentIds: [],
                  supportCurveIds: [],
                  hingeSourcePx: found.opening.hingeSourcePx
                    ? { x: found.opening.hingeSourcePx[0], y: found.opening.hingeSourcePx[1] }
                    : undefined,
                  swingTowardSourcePx: found.opening.swingTowardSourcePx
                    ? {
                        x: found.opening.swingTowardSourcePx[0],
                        y: found.opening.swingTowardSourcePx[1],
                      }
                    : undefined,
                  double: found.opening.handing === "double",
                }
              : undefined,
          };
        }),
      },
    ];
  });
}

/**
 * Hinge end and handing of a swing door against the direction of the wall that
 * hosts it (`left` swings towards (-dz, dx) of start → end, as the opening
 * primitives draw it).
 */
export function swingAgainstWall(
  wallStart: SourcePointPx,
  wallEnd: SourcePointPx,
  opening: { hingeSourcePx?: SourcePointPx; swingTowardSourcePx?: SourcePointPx; double?: boolean }
): { hinge: "start" | "end" | "none" | "unknown"; handing: "left" | "right" | "double" | "unknown" } {
  if (opening.double) return { hinge: "none", handing: "double" };
  if (!opening.hingeSourcePx || !opening.swingTowardSourcePx) {
    return { hinge: "unknown", handing: "unknown" };
  }
  const distance = (a: SourcePointPx, b: SourcePointPx) => Math.hypot(a.x - b.x, a.y - b.y);
  const hinge =
    distance(opening.hingeSourcePx, wallStart) <= distance(opening.hingeSourcePx, wallEnd)
      ? "start"
      : "end";
  const dx = wallEnd.x - wallStart.x;
  const dz = wallEnd.y - wallStart.y;
  const side =
    -dz * (opening.swingTowardSourcePx.x - opening.hingeSourcePx.x) +
    dx * (opening.swingTowardSourcePx.y - opening.hingeSourcePx.y);
  return { hinge, handing: side >= 0 ? "left" : "right" };
}
