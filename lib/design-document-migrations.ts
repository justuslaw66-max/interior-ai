import {
  DESIGN_DOCUMENT_COORDINATE_SYSTEM,
  DESIGN_DOCUMENT_SCHEMA_REVISION,
  DESIGN_DOCUMENT_UNITS,
  DESIGN_DOCUMENT_VERSION,
  validateStoredDesignDocument,
  type DesignDocumentValidationIssue,
} from "@/lib/design-document-contract";
import type { StoredDesign } from "@/lib/room-persistence";

export type DesignDocumentMigrationStep = {
  from: "v1" | "v2" | "v3-revision-0";
  to: "v3-revision-1";
};

export type DesignDocumentMigrationFailure = {
  code: "INVALID_DOCUMENT" | "UNSUPPORTED_VERSION";
  sourceVersion: string;
  message: string;
  issues: DesignDocumentValidationIssue[];
};

export type DesignDocumentMigrationResult =
  | {
      ok: true;
      document: StoredDesign;
      sourceVersion: string;
      migrations: DesignDocumentMigrationStep[];
    }
  | { ok: false; error: DesignDocumentMigrationFailure };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function sourceVersionOf(value: Record<string, unknown>): string {
  return typeof value.version === "number"
    ? `v${value.version}`
    : "unversioned";
}

function withCurrentContractMetadata(
  value: Record<string, unknown>
): StoredDesign {
  return {
    ...cloneJson(value),
    version: DESIGN_DOCUMENT_VERSION,
    schemaRevision: DESIGN_DOCUMENT_SCHEMA_REVISION,
    units: DESIGN_DOCUMENT_UNITS,
    coordinateSystem: DESIGN_DOCUMENT_COORDINATE_SYSTEM,
  } as unknown as StoredDesign;
}

function migrateLegacySingleRoom(
  value: Record<string, unknown>,
  sourceVersion: "v1" | "v2"
): StoredDesign {
  const bounds = isRecord(value.roomBounds) ? value.roomBounds : {};
  const roomId = "room_living";
  return withCurrentContractMetadata({
    ...cloneJson(value),
    version: DESIGN_DOCUMENT_VERSION,
    rooms: [
      {
        id: roomId,
        name: "Living Room",
        roomType: "living",
        floorLevel: 1,
        floorLabel: "1F",
        geometry: {
          width: positiveNumber(bounds.width ?? value.roomWidth, 5),
          depth: positiveNumber(bounds.depth ?? value.roomDepth, 4),
          wallThickness: positiveNumber(bounds.wallThickness, 0.12),
          height: positiveNumber(bounds.height, 2.6),
          slabThickness: positiveNumber(bounds.slabThickness, 0.1),
        },
        planPosition: { x: 0, z: 0 },
        planShape: "rectangle",
        surfaces: {},
        surfaceOpacity: { wall: 1, floor: 1, ceiling: 1 },
        ceilingVisible: true,
        items: Array.isArray(value.items) ? cloneJson(value.items) : [],
        zones: Array.isArray(value.zones) ? cloneJson(value.zones) : [],
        savedViews: Array.isArray(value.savedViews)
          ? cloneJson(value.savedViews)
          : [],
        layoutVersions: [],
      },
    ],
    activeRoomId: roomId,
    migrationSourceVersion: sourceVersion,
  });
}

export function migrateDesignDocument(
  value: unknown
): DesignDocumentMigrationResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: {
        code: "INVALID_DOCUMENT",
        sourceVersion: "unknown",
        message: "Design document must be an object.",
        issues: [
          {
            code: "INVALID_TYPE",
            path: "$",
            message: "Design document must be an object.",
          },
        ],
      },
    };
  }

  const sourceVersion = sourceVersionOf(value);
  let document: StoredDesign;
  let migrations: DesignDocumentMigrationStep[] = [];

  if (value.version === DESIGN_DOCUMENT_VERSION) {
    if (
      value.schemaRevision !== undefined &&
      value.schemaRevision !== 0 &&
      value.schemaRevision !== DESIGN_DOCUMENT_SCHEMA_REVISION
    ) {
      return {
        ok: false,
        error: {
          code: "UNSUPPORTED_VERSION",
          sourceVersion: `${sourceVersion}-unsupported-revision`,
          message: "Unsupported design document schema revision.",
          issues: [
            {
              code: "INVALID_VERSION",
              path: "$.schemaRevision",
              message: "A newer schema revision cannot be downgraded automatically.",
            },
          ],
        },
      };
    }
    document =
      value.schemaRevision === DESIGN_DOCUMENT_SCHEMA_REVISION
        ? (cloneJson(value) as unknown as StoredDesign)
        : withCurrentContractMetadata(value);
    if (value.schemaRevision !== DESIGN_DOCUMENT_SCHEMA_REVISION) {
      migrations = [{ from: "v3-revision-0", to: "v3-revision-1" }];
    }
  } else if (value.version === 1 || value.version === 2) {
    const legacyVersion = value.version === 1 ? "v1" : "v2";
    document = migrateLegacySingleRoom(value, legacyVersion);
    migrations = [{ from: legacyVersion, to: "v3-revision-1" }];
  } else {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_VERSION",
        sourceVersion,
        message: "Unsupported design document version.",
        issues: [
          {
            code: "INVALID_VERSION",
            path: "$.version",
            message: "Only v1, v2, and v3 design documents can be migrated.",
          },
        ],
      },
    };
  }

  const validation = validateStoredDesignDocument(document);
  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: "INVALID_DOCUMENT",
        sourceVersion,
        message: `Design document ${sourceVersion} failed validation.`,
        issues: validation.issues,
      },
    };
  }

  return { ok: true, document, sourceVersion, migrations };
}
