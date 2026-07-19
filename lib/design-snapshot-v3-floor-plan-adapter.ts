import { catalogV1LayoutToFloorPlanDocumentV2 } from "@/lib/floor-plan-catalog-v1-adapter";
import { validateFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanFloorV2,
  FloorPlanSourceKindV2,
  FloorPlanStructureKindV2,
} from "@/lib/floor-plan-document-v2";
import type { FloorPlanReviewIssue } from "@/lib/floor-plan-imports/types";
import type {
  FloorPlanLibraryCatalog,
  FloorPlanLibraryLayout,
} from "@/lib/floor-plan-library-schema";
import type {
  DesignSnapshot,
  PersistedPlanFixedElement,
  PersistedPlanOpening,
  RoomSnapshot,
} from "@/lib/room-types";

const V2_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DEFAULT_CREATED_AT = "1970-01-01T00:00:00.000Z";

export type DesignSnapshotV3FloorPlanAdapterOptions = {
  createdAt?: string;
  documentId?: string;
  revisionId?: string;
};

export type DesignSnapshotV3FloorPlanAdapterResult = {
  document: FloorPlanDocumentV2;
  reviewIssues: FloorPlanReviewIssue[];
};

type OpeningMapping = {
  persisted: PersistedPlanOpening;
  generatedPrefix: string;
  canonicalId: string;
};

function roomFloorLevel(room: RoomSnapshot): number {
  return Number.isInteger(room.floorLevel) && (room.floorLevel ?? 0) > 0
    ? room.floorLevel!
    : 1;
}

function safeEntityId(
  id: string,
  fallback: string,
  addIssue: (
    code: string,
    message: string,
    severity: FloorPlanReviewIssue["severity"],
    entityIds?: string[]
  ) => void
): string {
  if (V2_ID_PATTERN.test(id)) return id;
  addIssue(
    "SNAPSHOT_ENTITY_ID_REQUIRES_NORMALIZATION",
    `Legacy entity id ${JSON.stringify(id)} is not a valid V2 identifier; ${fallback} was used without discarding the original review reference.`,
    "critical",
    [id]
  );
  return fallback;
}

function sourceKind(mimeType: string | undefined): FloorPlanSourceKindV2 {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType?.startsWith("image/")) return "raster";
  return "legacy";
}

function canonicalStructureKind(value: string | undefined): FloorPlanStructureKindV2 | null {
  if (
    value === "column" ||
    value === "shaft" ||
    value === "ledge" ||
    value === "service_strip" ||
    value === "void" ||
    value === "structural_core" ||
    value === "other"
  ) {
    return value;
  }
  return null;
}

/**
 * The catalog-v1 converter is intentionally single-floor and therefore emits
 * local synthetic vertex/wall IDs. Namespace those generated IDs when several
 * converted floors are merged, while keeping valid persisted room, opening,
 * and structure IDs unchanged.
 */
function namespaceSyntheticFloorTopology(
  floor: FloorPlanFloorV2,
  namespace: string
): void {
  const vertexIds = new Map(
    floor.vertices.map((vertex) => [vertex.id, `${namespace}:${vertex.id}`])
  );
  const wallIds = new Map(
    floor.walls.map((wall) => [wall.id, `${namespace}:${wall.id}`])
  );

  for (const vertex of floor.vertices) vertex.id = vertexIds.get(vertex.id)!;
  for (const wall of floor.walls) {
    wall.id = wallIds.get(wall.id)!;
    wall.path.startVertexId = vertexIds.get(wall.path.startVertexId)!;
    wall.path.endVertexId = vertexIds.get(wall.path.endVertexId)!;
    if (wall.path.kind === "arc") {
      wall.path.centerVertexId = vertexIds.get(wall.path.centerVertexId)!;
    }
  }
  for (const room of floor.rooms) {
    for (const loop of room.wallLoops) {
      for (const reference of loop.walls) {
        reference.wallId = wallIds.get(reference.wallId)!;
      }
    }
  }
  for (const opening of floor.openings) {
    opening.wallId = wallIds.get(opening.wallId)!;
  }
  for (const structure of floor.structures) {
    structure.vertexIds = structure.vertexIds.map((id) => vertexIds.get(id)!);
  }
  for (const annotation of floor.annotations) {
    if (annotation.geometry.kind === "point") {
      annotation.geometry.vertexId = vertexIds.get(annotation.geometry.vertexId)!;
    } else if (annotation.geometry.kind === "polygon") {
      annotation.geometry.vertexIds = annotation.geometry.vertexIds.map(
        (id) => vertexIds.get(id)!
      );
    } else {
      annotation.geometry.wallId = wallIds.get(annotation.geometry.wallId)!;
    }
  }
  for (const dimension of floor.dimensions) {
    dimension.fromVertexId = vertexIds.get(dimension.fromVertexId)!;
    dimension.toVertexId = vertexIds.get(dimension.toVertexId)!;
  }
}

function buildSyntheticCatalog(
  snapshot: DesignSnapshot,
  rooms: RoomSnapshot[],
  openings: PersistedPlanOpening[],
  referenceZones: PersistedPlanFixedElement[],
  floorLevel: number,
  addIssue: (
    code: string,
    message: string,
    severity: FloorPlanReviewIssue["severity"],
    entityIds?: string[]
  ) => void
): { catalog: FloorPlanLibraryCatalog; layout: FloorPlanLibraryLayout; mappings: OpeningMapping[] } {
  const doorwayMappings: OpeningMapping[] = [];
  const windowMappings: OpeningMapping[] = [];
  const doorwaySpecs: FloorPlanLibraryLayout["template"]["doorways"] = [];
  const windowSpecs: FloorPlanLibraryLayout["template"]["windows"] = [];
  const roomIds = new Set(rooms.map((room) => room.id));

  openings.forEach((opening, sourceIndex) => {
    if (!opening.roomId || !roomIds.has(opening.roomId)) {
      addIssue(
        "SNAPSHOT_OPENING_ROOM_AMBIGUOUS",
        `Opening ${opening.id} has no usable room host on floor ${floorLevel}.`,
        "critical",
        [opening.id, ...(opening.roomId ? [opening.roomId] : [])]
      );
      return;
    }
    const canonicalId = safeEntityId(
      opening.id,
      `snapshot-opening:${floorLevel}:${sourceIndex + 1}`,
      addIssue
    );
    if (opening.kind === "window") {
      windowSpecs.push({
        room_id: opening.roomId,
        wall: opening.wall,
        offset_meters: opening.offsetMm / 1000,
        width_meters: opening.widthMm / 1000,
        kind: "window",
        operation: "fixed",
      });
      windowMappings.push({
        persisted: opening,
        generatedPrefix: `window:${windowSpecs.length}:${opening.roomId}`,
        canonicalId,
      });
      return;
    }
    const operation =
      opening.operation ??
      (opening.doorStyle === "open"
        ? "open"
        : opening.doorStyle === "sliding"
          ? "sliding"
          : opening.doorStyle === "folding"
            ? "folding"
            : "swing");
    const isOpen = operation === "open";
    doorwaySpecs.push({
      from_room_id: opening.roomId,
      wall: opening.wall,
      offset_meters: opening.offsetMm / 1000,
      width_meters: opening.widthMm / 1000,
      kind: isOpen ? "opening" : "door",
      operation,
    });
    doorwayMappings.push({
      persisted: opening,
      generatedPrefix: `doorway:${doorwaySpecs.length}:${opening.roomId}`,
      canonicalId,
    });
  });

  const underlay = snapshot.floorPlan?.underlay;
  const layout: FloorPlanLibraryLayout = {
    layout_id: `snapshot-floor-${floorLevel}`,
    label: rooms[0]?.floorLabel ?? `Floor ${floorLevel}`,
    source_page: underlay?.renderedPage ?? 1,
    flat_type: "DesignSnapshot v3 migration",
    bedroom_count: rooms.filter((room) => room.roomType === "bedroom").length,
    floor_area_sqm: null,
    applies_to_building_ids: ["snapshot-building"],
    preview_url: "/assets/floor-plans/legacy-design-snapshot-v3.webp",
    fidelity: "approximate_editable",
    verification_note: "Compatibility migration; all geometry remains needs_review.",
    template: {
      summary: snapshot.title ?? "DesignSnapshot v3 compatibility migration",
      best_for: "One-way migration into FloorPlanDocumentV2",
      layout_type: "flat",
      footprint: "wide",
      tags: ["legacy", "design-snapshot-v3"],
      zones: [],
      real_life_checks: ["Review all migrated geometry and openings"],
      rooms: rooms.map((room) => {
        if (!room.planPosition) {
          addIssue(
            "SNAPSHOT_ROOM_POSITION_ASSUMED",
            `Room ${room.id} has no plan position; the legacy origin was retained for review.`,
            "critical",
            [room.id]
          );
        }
        if (
          (room.planShape === "custom_polygon" || room.planShape === "l_shape") &&
          !room.planPolygon
        ) {
          addIssue(
            "SNAPSHOT_ROOM_POLYGON_MISSING",
            `Room ${room.id} declares ${room.planShape} without a polygon; only its rectangular bounds can be migrated.`,
            "critical",
            [room.id]
          );
        }
        return {
          id: room.id,
          name: room.name,
          room_type: room.roomType,
          shape: room.planPolygon ? "custom_polygon" as const : "rectangle" as const,
          width: room.geometry.width,
          depth: room.geometry.depth,
          x: room.planPosition?.x ?? 0,
          z: room.planPosition?.z ?? 0,
          ...(room.geometry.wallThickness !== undefined
            ? { wall_thickness: room.geometry.wallThickness }
            : {}),
          ...(room.planPolygon
            ? { plan_polygon: room.planPolygon.map((point) => ({ ...point })) }
            : {}),
        };
      }),
      doorways: doorwaySpecs,
      windows: windowSpecs,
      reference_zones: referenceZones.map((zone) => ({
        id: safeEntityId(
          zone.id,
          `snapshot-reference-zone:${floorLevel}:${zone.id.length}`,
          addIssue
        ),
        label: zone.label ?? zone.id,
        kind:
          zone.canonicalKind === "structural_core" ||
          zone.canonicalKind === "shaft" ||
          zone.canonicalKind === "column"
            ? "structural" as const
            : "exterior" as const,
        width: zone.widthMm / 1000,
        depth: zone.depthMm / 1000,
        x: zone.xMm / 1000,
        z: zone.zMm / 1000,
        locked: zone.locked ?? true,
      })),
      // Legacy snapshots had no source-supported optional-space annotations.
      // Keep the list explicit so migration cannot reinterpret user labels as
      // canonical suggested rooms or optional partitions.
      annotations: [],
    },
  };
  const sourceMimeType = underlay?.sourceMimeType ?? underlay?.mimeType;
  const sha256 = snapshot.floorPlan?.sourceAssetSha256;
  const catalog: FloorPlanLibraryCatalog = {
    schema_version: 1,
    floor_plan: {
      plan_id: "design-snapshot-v3-migration",
      slug: "design-snapshot-v3-migration",
      project_name: snapshot.title ?? "Migrated design",
      title: snapshot.title ?? "DesignSnapshot v3 migration",
      country_code: "ZZ",
      property_type: "legacy_design",
    },
    address: {
      street_name: "Private legacy design",
      street_aliases: [],
      buildings: [
        {
          id: "snapshot-building",
          block: "private",
          postal_code: null,
          aliases: ["Private legacy design"],
        },
      ],
    },
    source: {
      source_url: underlay?.assetUrl ?? "urn:interior-ai:design-snapshot-v3",
      source_title: underlay?.name ?? "DesignSnapshot v3 persisted geometry",
      publisher: "Interior AI legacy snapshot",
      retrieved_at: "1970-01-01",
      sha256: sha256 && SHA256_PATTERN.test(sha256) ? sha256 : null,
      license_status: "unknown",
      corroborating_sources: [],
    },
    publication: {
      status: "draft",
      visibility: "review_only",
      accuracy_notice: "Legacy geometry requires review.",
    },
    layouts: [layout],
  };
  if (sourceMimeType && !underlay) {
    addIssue(
      "SNAPSHOT_SOURCE_METADATA_INCOMPLETE",
      "A source MIME type exists without a persisted underlay asset.",
      "warning"
    );
  }
  return {
    catalog,
    layout,
    mappings: [...doorwayMappings, ...windowMappings],
  };
}

/**
 * Migrates a version-3 design snapshot into canonical geometry. The result is
 * intentionally unverified; baseSnapshot remains the round-trip authority for
 * room-scoped design content such as items, finishes, views and layout history.
 */
export function designSnapshotV3ToFloorPlanDocumentV2(
  snapshot: DesignSnapshot,
  options: DesignSnapshotV3FloorPlanAdapterOptions = {}
): DesignSnapshotV3FloorPlanAdapterResult {
  if (snapshot.version !== 3 || !snapshot.rooms.length) {
    throw new Error("DesignSnapshot v3 migration requires at least one room");
  }
  const reviewIssues: FloorPlanReviewIssue[] = [];
  let reviewSequence = 0;
  const addIssue = (
    code: string,
    message: string,
    severity: FloorPlanReviewIssue["severity"],
    entityIds?: string[]
  ) => {
    reviewSequence += 1;
    reviewIssues.push({
      id: `snapshot-v3-review:${reviewSequence}`,
      code,
      message,
      severity,
      ...(entityIds?.length ? { entityIds } : {}),
      resolved: false,
    });
  };

  addIssue(
    "SNAPSHOT_V3_REVIEW_REQUIRED",
    "DesignSnapshot v3 stores room shells rather than source-registered wall topology; human review is required.",
    "critical"
  );
  if (snapshot.floorPlan?.canonicalDocument) {
    addIssue(
      "SNAPSHOT_EXISTING_CANONICAL_DOCUMENT_REBUILT",
      "The persisted canonical document was not trusted as migration evidence; geometry was rebuilt from the v3 room snapshot.",
      "warning"
    );
  }
  if (snapshot.floorPlan?.underlay?.calibration) {
    addIssue(
      "SNAPSHOT_UNDERLAY_REGISTRATION_REQUIRES_REVIEW",
      "The legacy two-point underlay calibration cannot establish V2 source registration by itself and was not promoted.",
      "critical",
      [snapshot.floorPlan.underlay.id]
    );
  }

  const duplicateRoomIds = snapshot.rooms.filter(
    (room, index) => snapshot.rooms.findIndex((candidate) => candidate.id === room.id) !== index
  );
  for (const room of duplicateRoomIds) {
    addIssue(
      "SNAPSHOT_DUPLICATE_ROOM_ID",
      `Room id ${room.id} appears more than once and cannot round-trip unambiguously.`,
      "critical",
      [room.id]
    );
  }

  const roomsByLevel = new Map<number, RoomSnapshot[]>();
  for (const room of snapshot.rooms) {
    const level = roomFloorLevel(room);
    const rooms = roomsByLevel.get(level) ?? [];
    rooms.push(room);
    roomsByLevel.set(level, rooms);
  }
  const floorPlanOpenings = snapshot.floorPlan?.openings ?? [];
  for (const opening of floorPlanOpenings) {
    if (!opening.roomId || !snapshot.rooms.some((room) => room.id === opening.roomId)) {
      addIssue(
        "SNAPSHOT_OPENING_ROOM_AMBIGUOUS",
        `Opening ${opening.id} has no valid roomId and was not assigned to a canonical wall.`,
        "critical",
        [opening.id, ...(opening.roomId ? [opening.roomId] : [])]
      );
    }
  }
  const referenceZones = (snapshot.floorPlan?.fixedElements ?? []).filter(
    (element) => element.kind === "reference_zone"
  );
  for (const element of snapshot.floorPlan?.fixedElements ?? []) {
    if (element.kind !== "reference_zone") {
      addIssue(
        "SNAPSHOT_NONSTRUCTURAL_FIXED_ELEMENT_SKIPPED",
        `Fixed element ${element.id} is ${element.kind}, not a source reference zone; it remains in the base snapshot instead of becoming canonical structure.`,
        "info",
        [element.id]
      );
    }
  }
  const activeRoomLevel = roomFloorLevel(
    snapshot.rooms.find((room) => room.id === snapshot.activeRoomId) ?? snapshot.rooms[0]
  );
  if (referenceZones.length && roomsByLevel.size > 1) {
    addIssue(
      "SNAPSHOT_REFERENCE_ZONE_FLOOR_ASSUMED",
      `Persisted reference zones have no floor id; they were assigned to active floor ${activeRoomLevel} for review.`,
      "critical",
      referenceZones.map((zone) => zone.id)
    );
  }
  for (const zone of referenceZones) {
    if (zone.rotationDeg % 360 !== 0) {
      addIssue(
        "SNAPSHOT_ROTATED_REFERENCE_ZONE_APPROXIMATED",
        `Reference zone ${zone.id} is rotated ${zone.rotationDeg}°; V2 received its unrotated legacy bounds pending review.`,
        "critical",
        [zone.id]
      );
    }
  }

  const remappedOpeningIds = new Set<string>();
  const floorDocuments = [...roomsByLevel.entries()]
    .sort(([first], [second]) => first - second)
    .map(([floorLevel, rooms]) => {
      const roomIds = new Set(rooms.map((room) => room.id));
      const floorOpenings = floorPlanOpenings.filter(
        (opening) => opening.roomId && roomIds.has(opening.roomId)
      );
      const synthetic = buildSyntheticCatalog(
        snapshot,
        rooms,
        floorOpenings,
        floorLevel === activeRoomLevel ? referenceZones : [],
        floorLevel,
        addIssue
      );
      const converted = catalogV1LayoutToFloorPlanDocumentV2(
        synthetic.catalog,
        synthetic.layout,
        {
          createdAt: options.createdAt ?? DEFAULT_CREATED_AT,
          documentId: `snapshot-floor:${floorLevel}`,
          revisionId: `snapshot-floor:${floorLevel}:revision:1`,
        }
      );
      reviewIssues.push(
        ...converted.reviewIssues.filter((issue) => !issue.code.startsWith("V2_"))
      );
      const floor = converted.document.floors[0];
      floor.id = `floor:${floorLevel}`;
      floor.name = rooms[0]?.floorLabel ?? `Floor ${floorLevel}`;
      floor.levelIndex = floorLevel - 1;
      floor.elevationMm = (floorLevel - 1) * floor.storeyHeightMm;
      namespaceSyntheticFloorTopology(floor, `snapshot-floor:${floorLevel}`);

      for (const mapping of synthetic.mappings) {
        const matches = floor.openings.filter(
          (opening) =>
            opening.id === mapping.generatedPrefix ||
            opening.id.startsWith(`${mapping.generatedPrefix}:part:`)
        );
        matches.forEach((opening, index) => {
          let id = matches.length === 1
            ? mapping.canonicalId
            : `${mapping.canonicalId}:part:${index + 1}`;
          if (remappedOpeningIds.has(id)) {
            addIssue(
              "SNAPSHOT_DUPLICATE_OPENING_ID",
              `Opening id ${id} is duplicated; a deterministic suffix was added.`,
              "critical",
              [mapping.persisted.id]
            );
            const duplicateBase = `${id}:duplicate:floor-${floorLevel}:${index + 1}`;
            id = duplicateBase;
            let duplicateSequence = 1;
            while (remappedOpeningIds.has(id)) {
              duplicateSequence += 1;
              id = `${duplicateBase}:${duplicateSequence}`;
            }
          }
          remappedOpeningIds.add(id);
          opening.id = id;
          if (mapping.persisted.heightMm !== undefined) {
            opening.heightMm = Math.round(mapping.persisted.heightMm);
          }
          if (mapping.persisted.bottomMm !== undefined) {
            opening.sillHeightMm = Math.round(mapping.persisted.bottomMm);
          }
          if (
            mapping.persisted.canonicalWallId &&
            mapping.persisted.canonicalWallId !== opening.wallId
          ) {
            addIssue(
              "SNAPSHOT_CANONICAL_WALL_ID_REBUILT",
              `Opening ${mapping.persisted.id} previously referenced ${mapping.persisted.canonicalWallId}; rebuilt host ${opening.wallId} requires review.`,
              "critical",
              [mapping.persisted.id, mapping.persisted.canonicalWallId, opening.wallId]
            );
          }
        });
      }
      for (const structure of floor.structures) {
        const source = referenceZones.find((zone) => zone.id === structure.id);
        const kind = canonicalStructureKind(source?.canonicalKind);
        if (kind) structure.kind = kind;
      }
      return { floor, source: converted.document.sources[0] };
    });

  const underlay = snapshot.floorPlan?.underlay;
  const sourceMimeType = underlay?.sourceMimeType ?? underlay?.mimeType;
  const source = floorDocuments[0].source;
  source.kind = sourceKind(sourceMimeType);
  source.name = underlay?.name ?? "DesignSnapshot v3 persisted geometry";
  source.mimeType = sourceMimeType ?? "application/vnd.interior-ai.design-snapshot-v3+json";
  source.uri = underlay?.assetUrl;
  source.pageCount = underlay?.pageCount;
  source.widthPx = underlay?.widthPx;
  source.heightPx = underlay?.heightPx;
  const sha256 = snapshot.floorPlan?.sourceAssetSha256;
  source.sha256 = sha256 && SHA256_PATTERN.test(sha256) ? sha256 : undefined;

  const document: FloorPlanDocumentV2 = {
    schemaVersion: 2,
    units: "mm",
    id: options.documentId ?? "design-snapshot-v3:migration",
    revisionId: options.revisionId ?? "design-snapshot-v3:migration:revision:1",
    createdAt: options.createdAt ?? DEFAULT_CREATED_AT,
    verification: { tier: "needs_review", criticalIssueIds: [] },
    sources: [source],
    floors: floorDocuments.map(({ floor }) => floor),
  };
  for (const issue of validateFloorPlanDocumentV2(document)) {
    addIssue(
      `V2_${issue.code}`,
      `${issue.path}: ${issue.message}`,
      issue.severity === "error" ? "critical" : "warning"
    );
  }
  document.verification.criticalIssueIds = reviewIssues
    .filter((issue) => issue.severity === "critical" && !issue.resolved)
    .map((issue) => issue.id);
  return { document, reviewIssues };
}
