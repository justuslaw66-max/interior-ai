import type {
  FloorPlanExtractionResult,
  FloorPlanRenderedPage,
  FloorPlanReviewIssue,
  FloorPlanSourceDescriptor,
} from "./types";

export type StoredFloorPlanSource = FloorPlanSourceDescriptor & {
  bytes: Uint8Array;
};

export type StoreFloorPlanSourceInput = {
  /** Privacy boundary used to prevent cross-user metadata deduplication. */
  ownerScope?: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type StoreFloorPlanDerivativeInput = {
  jobId: string;
  fileName: string;
  mimeType: "image/png" | "image/webp" | "application/json";
  bytes: Uint8Array;
};

export type StoredFloorPlanDerivative = {
  id: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  bytes: Uint8Array;
};

/**
 * Storage boundary for uploads and rendered derivatives. The first implementation
 * uses Postgres; object-store implementations can be injected without changing
 * extraction adapters or API routes.
 */
export interface FloorPlanSourceStore {
  putSource(input: StoreFloorPlanSourceInput): Promise<FloorPlanSourceDescriptor>;
  readSource(id: string): Promise<StoredFloorPlanSource | null>;
  putDerivative(input: StoreFloorPlanDerivativeInput): Promise<string>;
  /** Optional for stores that allow later semantic analysis of rendered pages. */
  readDerivative?(id: string): Promise<StoredFloorPlanDerivative | null>;
}

export type FloorPlanAdapterContext = {
  jobId: string;
  store: FloorPlanSourceStore;
  privacy: import("./privacy").FloorPlanImportPrivacy;
  signal?: AbortSignal;
};

export type FloorPlanStageResult = FloorPlanExtractionResult & {
  reviewIssues: FloorPlanReviewIssue[];
};

/**
 * Each adapter converts one source family into the same staged contract. PDF,
 * raster, and future CAD adapters may use different internals while the worker,
 * review UI, and persistence layer remain unchanged.
 */
export interface FloorPlanSourceAdapter {
  readonly id: string;
  readonly extractionVersion: string;
  supports(source: FloorPlanSourceDescriptor): boolean;
  render(
    source: StoredFloorPlanSource,
    context: FloorPlanAdapterContext
  ): Promise<FloorPlanRenderedPage[]>;
  extract(
    source: StoredFloorPlanSource,
    renderedPages: FloorPlanRenderedPage[],
    context: FloorPlanAdapterContext
  ): Promise<FloorPlanStageResult>;
  solveScale(
    result: FloorPlanStageResult,
    context: FloorPlanAdapterContext
  ): Promise<FloorPlanStageResult>;
  buildTopology(
    result: FloorPlanStageResult,
    context: FloorPlanAdapterContext
  ): Promise<FloorPlanStageResult>;
  validate(
    result: FloorPlanStageResult,
    context: FloorPlanAdapterContext
  ): Promise<FloorPlanStageResult>;
}

export class FloorPlanSourceAdapterRegistry {
  constructor(private readonly adapters: readonly FloorPlanSourceAdapter[]) {}

  getById(id: string) {
    return this.adapters.find((adapter) => adapter.id === id) ?? null;
  }

  resolve(source: FloorPlanSourceDescriptor) {
    const adapter = this.adapters.find((candidate) => candidate.supports(source));
    if (!adapter) {
      throw new Error(`No floor-plan source adapter supports ${source.mimeType}`);
    }
    return adapter;
  }
}
