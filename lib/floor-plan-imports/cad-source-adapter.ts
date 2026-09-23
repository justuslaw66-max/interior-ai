import path from "node:path";
import {
  validateFloorPlanDocumentV2,
  type FloorPlanValidationIssueV2,
} from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  buildCadDocument,
  buildCadReviewIssues,
  manifestCadEvidence,
} from "./cad-document-builder";
import { renderCadPreviewPng } from "./cad-preview";
import {
  CAD_SOURCE_LIMITS,
  type CadParsedSource,
  type CadSourceFormat,
} from "./cad-types";
import type {
  FloorPlanAdapterContext,
  FloorPlanSourceAdapter,
  FloorPlanStageResult,
  StoredFloorPlanSource,
} from "./source-adapter";
import type { FloorPlanSourceDescriptor } from "./types";

type CadAdapterEnvelope = {
  kind: "floor_plan_cad_adapter_envelope_v1";
  source: FloorPlanSourceDescriptor;
  parsed: CadParsedSource;
};

export type CadAdapterConfig = {
  id: string;
  extractionVersion: string;
  format: CadSourceFormat;
  mimeTypes: readonly string[];
  extensions: readonly string[];
  parse(
    source: StoredFloorPlanSource,
    context: FloorPlanAdapterContext
  ): CadParsedSource | Promise<CadParsedSource>;
};

function sourceDescriptor(source: StoredFloorPlanSource): FloorPlanSourceDescriptor {
  return {
    id: source.id,
    fileName: source.fileName,
    mimeType: source.mimeType,
    byteLength: source.byteLength,
    sha256: source.sha256,
  };
}

function asEnvelope(value: Record<string, unknown> | null): CadAdapterEnvelope {
  if (!value || value.kind !== "floor_plan_cad_adapter_envelope_v1") {
    throw new Error("CAD adapter stage is missing its deterministic evidence envelope");
  }
  return value as unknown as CadAdapterEnvelope;
}

function failedParse(format: CadSourceFormat, parserVersion: string, cause: unknown): CadParsedSource {
  const message = cause instanceof Error ? cause.message : "CAD parsing failed";
  return {
    kind: "floor_plan_cad_evidence_v1",
    format,
    parserVersion,
    units: { name: null, millimetresPerUnit: null, basis: "missing" },
    entityCount: 0,
    paths: [],
    texts: [],
    warnings: [message.slice(0, 2_000)],
    parseFailure: message.slice(0, 2_000),
  };
}

function demoteInvalidGeometry(
  document: FloorPlanDocumentV2,
  canonicalErrors: FloorPlanValidationIssueV2[]
) {
  if (!canonicalErrors.length) return;
  const floor = document.floors[0];
  const retainedVertexIds = new Set(
    floor.annotations.flatMap((annotation) =>
      annotation.geometry.kind === "point"
        ? [annotation.geometry.vertexId]
        : annotation.geometry.kind === "polygon"
          ? annotation.geometry.vertexIds
          : []
    )
  );
  floor.vertices = floor.vertices.filter((vertex) => retainedVertexIds.has(vertex.id));
  floor.walls = [];
  floor.openings = [];
  floor.rooms = [];
  document.verification.criticalIssueIds = [
    ...new Set([
      ...document.verification.criticalIssueIds,
      "cad-canonical-geometry-invalid",
      "cad-wall-geometry-unconfirmed",
    ]),
  ];
}

export class RegisteredCadSourceAdapter implements FloorPlanSourceAdapter {
  readonly id: string;
  readonly extractionVersion: string;
  private readonly cache = new Map<string, Promise<CadParsedSource>>();

  constructor(private readonly config: CadAdapterConfig) {
    this.id = config.id;
    this.extractionVersion = config.extractionVersion;
  }

  supports(source: FloorPlanSourceDescriptor) {
    const mimeType = source.mimeType.trim().toLowerCase();
    const extension = path.extname(source.fileName).toLowerCase();
    return this.config.mimeTypes.includes(mimeType) || this.config.extensions.includes(extension);
  }

  private parsed(source: StoredFloorPlanSource, context: FloorPlanAdapterContext) {
    const key = `${context.jobId}:${source.sha256}`;
    const existing = this.cache.get(key);
    if (existing) return existing;
    const pending = Promise.resolve()
      .then(() => this.config.parse(source, context))
      .catch((cause) => {
        if (context.signal?.aborted) {
          this.cache.delete(key);
          throw cause;
        }
        return failedParse(this.config.format, this.extractionVersion, cause);
      });
    this.cache.set(key, pending);
    return pending;
  }

  async render(source: StoredFloorPlanSource, context: FloorPlanAdapterContext) {
    const parsed = await this.parsed(source, context);
    try {
      const preview = renderCadPreviewPng(parsed);
      const assetKey = await context.store.putDerivative({
        jobId: context.jobId,
        fileName: `${this.config.format}-preview.png`,
        mimeType: "image/png",
        bytes: preview.bytes,
      });
      return [{
        pageNumber: 1,
        widthPx: preview.layout.widthPx,
        heightPx: preview.layout.heightPx,
        assetKey,
      }];
    } catch (cause) {
      this.cache.delete(`${context.jobId}:${source.sha256}`);
      throw cause;
    }
  }

  async extract(source: StoredFloorPlanSource, _pages: unknown, context: FloorPlanAdapterContext) {
    const parsed = await this.parsed(source, context);
    this.cache.delete(`${context.jobId}:${source.sha256}`);
    const envelope: CadAdapterEnvelope = {
      kind: "floor_plan_cad_adapter_envelope_v1",
      source: sourceDescriptor(source),
      parsed,
    };
    return {
      candidate: envelope as unknown as Record<string, unknown>,
      sourceManifest: {
        schemaVersion: 1,
        extractorVersion: this.extractionVersion,
        source: envelope.source,
        cad: manifestCadEvidence(parsed),
        limits: CAD_SOURCE_LIMITS,
      },
      reviewIssues: [],
      metrics: {
        entityCount: parsed.entityCount,
        pathCount: parsed.paths.length,
        textCount: parsed.texts.length,
        parseFailed: Boolean(parsed.parseFailure),
      },
    };
  }

  async solveScale(result: FloorPlanStageResult) {
    asEnvelope(result.candidate);
    return result;
  }

  async buildTopology(result: FloorPlanStageResult): Promise<FloorPlanStageResult> {
    const envelope = asEnvelope(result.candidate);
    let built;
    try {
      built = buildCadDocument(envelope);
    } catch (cause) {
      envelope.parsed = failedParse(
        envelope.parsed.format,
        envelope.parsed.parserVersion,
        cause
      );
      built = buildCadDocument(envelope);
    }
    const canonicalErrors = validateFloorPlanDocumentV2(built.document).filter(
      (issue) => issue.severity === "error"
    );
    demoteInvalidGeometry(built.document, canonicalErrors);
    return {
      ...result,
      candidate: built.document as unknown as Record<string, unknown>,
      sourceManifest: {
        ...(result.sourceManifest ?? {}),
        cad: manifestCadEvidence(envelope.parsed),
        canonicalTransform: built.canonicalTransform,
        canonicalBuild: {
          promotedWallCount: built.document.floors[0]?.walls.length ?? 0,
          rejectedGeometryIssues: canonicalErrors.slice(0, 50),
        },
      },
    };
  }

  async validate(result: FloorPlanStageResult): Promise<FloorPlanStageResult> {
    const document = result.candidate as unknown as FloorPlanDocumentV2;
    const manifest = result.sourceManifest as {
      cad?: CadParsedSource;
      canonicalBuild?: { rejectedGeometryIssues?: FloorPlanValidationIssueV2[] };
    } | null;
    const parsed = manifest?.cad;
    if (!parsed) throw new Error("CAD source manifest is missing deterministic evidence");
    const validation = validateFloorPlanDocumentV2(document).filter(
      (issue) => issue.severity === "error"
    );
    const issues = buildCadReviewIssues(parsed, document);
    const rejectedGeometryIssues = manifest.canonicalBuild?.rejectedGeometryIssues ?? [];
    if (validation.length || rejectedGeometryIssues.length) {
      issues.push({
        id: "cad-canonical-geometry-invalid",
        code: "cad_canonical_geometry_invalid",
        message: [...rejectedGeometryIssues, ...validation]
          .slice(0, 8)
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; "),
        severity: "critical",
        resolved: false,
      });
    }
    return { ...result, reviewIssues: [...result.reviewIssues, ...issues] };
  }
}
