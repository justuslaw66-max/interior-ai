import type { StoredDesign } from "@/lib/room-persistence";

export const DESIGN_DOCUMENT_VERSION = 3 as const;
export const DESIGN_DOCUMENT_SCHEMA_REVISION = 1 as const;

export const DESIGN_DOCUMENT_UNITS = {
  roomGeometry: "m",
  scenePosition: "m",
  productDimensions: "mm",
  rotation: "rad",
} as const;

export const DESIGN_DOCUMENT_COORDINATE_SYSTEM = {
  handedness: "right",
  origin: "room_center_floor",
  axes: { x: "right", y: "up", z: "forward" },
} as const;

export const DESIGN_DOCUMENT_LIMITS = {
  maxSerializedBytes: 4 * 1024 * 1024,
  maxRooms: 100,
  maxItemsPerRoom: 2_000,
} as const;

export const DESIGN_DOCUMENT_TOLERANCES = {
  positionMeters: 0.000001,
  rotationRadians: 0.000001,
  dimensionMillimeters: 0.1,
} as const;

export type DesignDocumentUnits = typeof DESIGN_DOCUMENT_UNITS;
export type DesignDocumentCoordinateSystem =
  typeof DESIGN_DOCUMENT_COORDINATE_SYSTEM;

export type DesignDocumentValidationIssue = {
  code:
    | "INVALID_TYPE"
    | "INVALID_VERSION"
    | "INVALID_VALUE"
    | "DUPLICATE_ID"
    | "MISSING_REFERENCE"
    | "LIMIT_EXCEEDED";
  path: string;
  message: string;
};

export type DesignDocumentValidationResult =
  | { ok: true }
  | { ok: false; issues: DesignDocumentValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isFiniteTuple(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(isFiniteNumber)
  );
}

function validateProductSnapshot(
  value: unknown,
  path: string,
  issues: DesignDocumentValidationIssue[]
): void {
  if (!isRecord(value)) {
    issues.push({
      code: "INVALID_TYPE",
      path,
      message: "Product snapshot must be an object.",
    });
    return;
  }

  if (value.schemaVersion !== 1) {
    issues.push({
      code: "INVALID_VERSION",
      path: `${path}.schemaVersion`,
      message: "Product snapshot schemaVersion must be 1.",
    });
  }

  for (const key of [
    "productId",
    "variantId",
    "name",
    "category",
    "variantLabel",
  ] as const) {
    if (!isNonEmptyString(value[key])) {
      issues.push({
        code: "INVALID_VALUE",
        path: `${path}.${key}`,
        message: `${key} must be a non-empty string.`,
      });
    }
  }
  if (!isRecord(value.assets)) {
    issues.push({
      code: "INVALID_TYPE",
      path: `${path}.assets`,
      message: "Product snapshot assets must be an object.",
    });
  }

  const dimensions = value.dimensionsMm;
  if (
    !isRecord(dimensions) ||
    !isPositiveFiniteNumber(dimensions.w) ||
    !isPositiveFiniteNumber(dimensions.d) ||
    !isPositiveFiniteNumber(dimensions.h)
  ) {
    issues.push({
      code: "INVALID_VALUE",
      path: `${path}.dimensionsMm`,
      message: "Product snapshot dimensions must contain positive finite millimeters.",
    });
  }
}

function validateItem(
  value: unknown,
  path: string,
  instanceIds: Set<string>,
  issues: DesignDocumentValidationIssue[]
): void {
  if (!isRecord(value)) {
    issues.push({
      code: "INVALID_TYPE",
      path,
      message: "Design item must be an object.",
    });
    return;
  }

  for (const key of ["instanceId", "productId", "variantId"] as const) {
    if (!isNonEmptyString(value[key])) {
      issues.push({
        code: "INVALID_VALUE",
        path: `${path}.${key}`,
        message: `${key} must be a non-empty stable identifier.`,
      });
    }
  }

  if (isNonEmptyString(value.instanceId)) {
    if (instanceIds.has(value.instanceId)) {
      issues.push({
        code: "DUPLICATE_ID",
        path: `${path}.instanceId`,
        message: "Item instance ID must be unique across the document.",
      });
    }
    instanceIds.add(value.instanceId);
  }

  if (!isFiniteTuple(value.position, 3)) {
    issues.push({
      code: "INVALID_VALUE",
      path: `${path}.position`,
      message: "Item position must contain three finite scene coordinates.",
    });
  }
  if (value.rotationY !== undefined && !isFiniteNumber(value.rotationY)) {
    issues.push({
      code: "INVALID_VALUE",
      path: `${path}.rotationY`,
      message: "Item rotationY must be a finite angle in radians.",
    });
  }
  for (const key of ["rotation", "scale"] as const) {
    if (value[key] !== undefined && !isFiniteTuple(value[key], 3)) {
      issues.push({
        code: "INVALID_VALUE",
        path: `${path}.${key}`,
        message: `${key} must contain three finite values.`,
      });
    }
  }
  if (value.transform !== undefined) {
    if (!isRecord(value.transform)) {
      issues.push({
        code: "INVALID_TYPE",
        path: `${path}.transform`,
        message: "Item transform must be an object.",
      });
    } else {
      if (!isFiniteTuple(value.transform.position, 3)) {
        issues.push({
          code: "INVALID_VALUE",
          path: `${path}.transform.position`,
          message: "Transform position must contain three finite coordinates.",
        });
      }
      if (
        value.transform.rotationY !== undefined &&
        !isFiniteNumber(value.transform.rotationY)
      ) {
        issues.push({
          code: "INVALID_VALUE",
          path: `${path}.transform.rotationY`,
          message: "Transform rotationY must be a finite angle in radians.",
        });
      }
      for (const key of ["rotation", "scale"] as const) {
        if (
          value.transform[key] !== undefined &&
          !isFiniteTuple(value.transform[key], 3)
        ) {
          issues.push({
            code: "INVALID_VALUE",
            path: `${path}.transform.${key}`,
            message: `Transform ${key} must contain three finite values.`,
          });
        }
      }
    }
  }

  if (value.productSnapshot !== undefined) {
    validateProductSnapshot(
      value.productSnapshot,
      `${path}.productSnapshot`,
      issues
    );
    if (isRecord(value.productSnapshot)) {
      if (value.productSnapshot.productId !== value.productId) {
        issues.push({
          code: "MISSING_REFERENCE",
          path: `${path}.productSnapshot.productId`,
          message: "Product snapshot must reference its owning item productId.",
        });
      }
      if (value.productSnapshot.variantId !== value.variantId) {
        issues.push({
          code: "MISSING_REFERENCE",
          path: `${path}.productSnapshot.variantId`,
          message: "Product snapshot must reference its owning item variantId.",
        });
      }
    }
  }
}

export function validateStoredDesignDocument(
  value: unknown
): DesignDocumentValidationResult {
  const issues: DesignDocumentValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [
        {
          code: "INVALID_TYPE",
          path: "$",
          message: "Design document must be an object.",
        },
      ],
    };
  }

  if (value.version !== DESIGN_DOCUMENT_VERSION) {
    issues.push({
      code: "INVALID_VERSION",
      path: "$.version",
      message: `Expected design document version ${DESIGN_DOCUMENT_VERSION}.`,
    });
  }
  if (value.schemaRevision !== DESIGN_DOCUMENT_SCHEMA_REVISION) {
    issues.push({
      code: "INVALID_VERSION",
      path: "$.schemaRevision",
      message: `Expected schema revision ${DESIGN_DOCUMENT_SCHEMA_REVISION}.`,
    });
  }
  if (
    !isRecord(value.units) ||
    value.units.roomGeometry !== DESIGN_DOCUMENT_UNITS.roomGeometry ||
    value.units.scenePosition !== DESIGN_DOCUMENT_UNITS.scenePosition ||
    value.units.productDimensions !== DESIGN_DOCUMENT_UNITS.productDimensions ||
    value.units.rotation !== DESIGN_DOCUMENT_UNITS.rotation
  ) {
    issues.push({
      code: "INVALID_VALUE",
      path: "$.units",
      message: "Design document units do not match the canonical contract.",
    });
  }
  if (
    !isRecord(value.coordinateSystem) ||
    value.coordinateSystem.handedness !==
      DESIGN_DOCUMENT_COORDINATE_SYSTEM.handedness ||
    value.coordinateSystem.origin !== DESIGN_DOCUMENT_COORDINATE_SYSTEM.origin ||
    !isRecord(value.coordinateSystem.axes) ||
    value.coordinateSystem.axes.x !== DESIGN_DOCUMENT_COORDINATE_SYSTEM.axes.x ||
    value.coordinateSystem.axes.y !== DESIGN_DOCUMENT_COORDINATE_SYSTEM.axes.y ||
    value.coordinateSystem.axes.z !== DESIGN_DOCUMENT_COORDINATE_SYSTEM.axes.z
  ) {
    issues.push({
      code: "INVALID_VALUE",
      path: "$.coordinateSystem",
      message: "Design document coordinate system is not supported.",
    });
  }
  if (!Array.isArray(value.rooms) || value.rooms.length === 0) {
    issues.push({
      code: "INVALID_VALUE",
      path: "$.rooms",
      message: "Design document must contain at least one room.",
    });
    return { ok: false, issues };
  }
  if (value.rooms.length > DESIGN_DOCUMENT_LIMITS.maxRooms) {
    issues.push({
      code: "LIMIT_EXCEEDED",
      path: "$.rooms",
      message: `Design document exceeds the ${DESIGN_DOCUMENT_LIMITS.maxRooms}-room limit.`,
    });
  }
  if (!isNonEmptyString(value.activeRoomId)) {
    issues.push({
      code: "INVALID_VALUE",
      path: "$.activeRoomId",
      message: "activeRoomId must be a non-empty stable identifier.",
    });
  }

  const roomIds = new Set<string>();
  const instanceIds = new Set<string>();
  value.rooms.forEach((room, roomIndex) => {
    const path = `$.rooms[${roomIndex}]`;
    if (!isRecord(room)) {
      issues.push({
        code: "INVALID_TYPE",
        path,
        message: "Room must be an object.",
      });
      return;
    }

    for (const key of ["id", "name", "roomType"] as const) {
      if (!isNonEmptyString(room[key])) {
        issues.push({
          code: "INVALID_VALUE",
          path: `${path}.${key}`,
          message: `${key} must be a non-empty string.`,
        });
      }
    }
    if (isNonEmptyString(room.id)) {
      if (roomIds.has(room.id)) {
        issues.push({
          code: "DUPLICATE_ID",
          path: `${path}.id`,
          message: "Room ID must be unique across the document.",
        });
      }
      roomIds.add(room.id);
    }

    if (
      !isRecord(room.geometry) ||
      !isPositiveFiniteNumber(room.geometry.width) ||
      !isPositiveFiniteNumber(room.geometry.depth)
    ) {
      issues.push({
        code: "INVALID_VALUE",
        path: `${path}.geometry`,
        message: "Room geometry must contain positive finite width and depth in meters.",
      });
    }
    if (isRecord(room.geometry)) {
      for (const key of [
        "wallThickness",
        "height",
        "slabThickness",
        "baseboardDepth",
      ] as const) {
        if (
          room.geometry[key] !== undefined &&
          !isPositiveFiniteNumber(room.geometry[key])
        ) {
          issues.push({
            code: "INVALID_VALUE",
            path: `${path}.geometry.${key}`,
            message: `${key} must be a positive finite measurement in meters.`,
          });
        }
      }
    }

    for (const key of ["items", "zones", "savedViews"] as const) {
      if (!Array.isArray(room[key])) {
        issues.push({
          code: "INVALID_TYPE",
          path: `${path}.${key}`,
          message: `${key} must be an array.`,
        });
      }
    }
    if (Array.isArray(room.items)) {
      if (room.items.length > DESIGN_DOCUMENT_LIMITS.maxItemsPerRoom) {
        issues.push({
          code: "LIMIT_EXCEEDED",
          path: `${path}.items`,
          message: `Room exceeds the ${DESIGN_DOCUMENT_LIMITS.maxItemsPerRoom}-item limit.`,
        });
      }
      room.items.forEach((item, itemIndex) =>
        validateItem(item, `${path}.items[${itemIndex}]`, instanceIds, issues)
      );
    }
  });

  if (
    isNonEmptyString(value.activeRoomId) &&
    !roomIds.has(value.activeRoomId)
  ) {
    issues.push({
      code: "MISSING_REFERENCE",
      path: "$.activeRoomId",
      message: "activeRoomId does not reference a room in this document.",
    });
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function getSerializedDesignDocumentByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function isStoredDesignDocument(value: unknown): value is StoredDesign {
  return validateStoredDesignDocument(value).ok;
}
