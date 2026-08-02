export const CAD_SOURCE_LIMITS = Object.freeze({
  maxBytes: 25 * 1024 * 1024,
  maxLines: 1_000_000,
  maxStatementChars: 256_000,
  maxEntities: 25_000,
  maxPoints: 100_000,
  maxTextEntities: 5_000,
  maxReferencesPerEntity: 2_000,
  maxReferenceTraversal: 20_000,
  maxCoordinateMagnitude: 10_000_000,
  maxCanonicalMagnitudeMm: 100_000_000,
  maxCanonicalWallSegments: 12_000,
  maxPreviewSegments: 20_000,
});

export type CadSourceFormat = "dxf" | "ifc";

export type CadUnitEvidence = {
  name: string | null;
  millimetresPerUnit: number | null;
  basis: "source_declared" | "missing";
  sourceEntityId?: string;
};

export type CadPoint = {
  x: number;
  y: number;
  z?: number;
};

export type CadPathEvidence = {
  id: string;
  sourceEntityId: string;
  entityType: string;
  layer: string | null;
  role: "wall" | "unknown";
  closed: boolean;
  points: CadPoint[];
};

export type CadTextEvidence = {
  id: string;
  sourceEntityId: string;
  entityType: string;
  layer: string | null;
  text: string;
  point: CadPoint | null;
};

export type CadParsedSource = {
  kind: "floor_plan_cad_evidence_v1";
  format: CadSourceFormat;
  parserVersion: string;
  units: CadUnitEvidence;
  entityCount: number;
  paths: CadPathEvidence[];
  texts: CadTextEvidence[];
  warnings: string[];
  parseFailure: string | null;
  conversion?: {
    providerId: string;
    providerVersion: string;
    sourceFormat: "dwg";
    outputFormat: CadSourceFormat;
  };
};

export class CadSourceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CadSourceLimitError";
  }
}

export class CadSourceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CadSourceParseError";
  }
}

export function assertCadSourceByteBound(byteLength: number) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 1) {
    throw new CadSourceParseError("The CAD source is empty or has an invalid length");
  }
  if (byteLength > CAD_SOURCE_LIMITS.maxBytes) {
    throw new CadSourceLimitError(
      `CAD source exceeds the ${CAD_SOURCE_LIMITS.maxBytes} byte parser limit`
    );
  }
}

export function assertCadCoordinate(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new CadSourceParseError(`${label} is not a finite coordinate`);
  }
  if (Math.abs(value) > CAD_SOURCE_LIMITS.maxCoordinateMagnitude) {
    throw new CadSourceLimitError(
      `${label} exceeds the supported CAD coordinate magnitude`
    );
  }
  return value;
}
