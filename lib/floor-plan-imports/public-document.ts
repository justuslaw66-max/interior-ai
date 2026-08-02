import {
  compileFloorPlanDocumentV2,
} from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
} from "@/lib/floor-plan-document-v2";
import { assertPublicFloorPlanEntityIdsOpaque } from "@/lib/floor-plan-imports/public-entity-ids";
import {
  projectPublicFloorPlanAuthoredVariantGroups,
  type PersistedFloorPlanAuthoredVariantGroup,
} from "@/lib/floor-plan-authored-variant-links";
import {
  projectFloorPlanPublicDisplayMetadata,
  type FloorPlanPublicDisplayMetadata,
} from "@/lib/floor-plan-imports/public-display-metadata";

const PUBLIC_EXTRACTION_VERSION = "public-projection-v1";
const PUBLIC_REVIEWER_ID = "published-verification";

const PUBLIC_ROOM_DISPLAY_NAMES = {
  living: "Living Room",
  bedroom: "Bedroom",
  dining: "Dining Room",
  kitchen: "Kitchen",
  toilet: "Bathroom",
  custom: "Room",
  service_yard: "Service Yard",
  shelter: "Household Shelter",
  study: "Study",
  other: "Room",
} as const;

type PublicRoomType = keyof typeof PUBLIC_ROOM_DISPLAY_NAMES;

/**
 * Returns the consumer-safe display label for a canonical semantic room type.
 * Unknown values are deliberately rejected instead of being echoed from an
 * internal source manifest or uploader-controlled candidate.
 */
export function publicFloorPlanRoomDisplayName(roomType: string): string | null {
  return Object.prototype.hasOwnProperty.call(PUBLIC_ROOM_DISPLAY_NAMES, roomType)
    ? PUBLIC_ROOM_DISPLAY_NAMES[roomType as PublicRoomType]
    : null;
}

const PUBLIC_STRUCTURE_DISPLAY_NAMES = {
  column: "Column",
  shaft: "Shaft",
  ledge: "Ledge",
  service_strip: "Service Strip",
  void: "Void",
  structural_core: "Structural Core",
  other: "Structure",
} as const;

function requirePublicRoomType(roomType: string): PublicRoomType {
  if (publicFloorPlanRoomDisplayName(roomType)) {
    return roomType as PublicRoomType;
  }
  // roomType participates in the immutable geometry hash. Rewriting it here
  // would make the public document differ from the approved revision, while
  // returning it could disclose arbitrary uploader-controlled text. Require
  // review to normalize the canonical semantic type before publication.
  throw new Error("The floor plan contains a non-public room type");
}

function publicFloorName(levelIndex: number): string {
  return levelIndex < 0
    ? `Basement ${Math.abs(levelIndex)}`
    : `Level ${levelIndex + 1}`;
}

function publicEntityNames(
  entities: ReadonlyArray<{ id: string; baseName: string }>
): ReadonlyMap<string, string> {
  const idsByBaseName = new Map<string, string[]>();
  for (const entity of entities) {
    const ids = idsByBaseName.get(entity.baseName) ?? [];
    ids.push(entity.id);
    idsByBaseName.set(entity.baseName, ids);
  }

  const names = new Map<string, string>();
  for (const [baseName, ids] of idsByBaseName) {
    const orderedIds = ids.slice().sort((left, right) => left.localeCompare(right));
    orderedIds.forEach((id, index) => {
      names.set(id, orderedIds.length === 1 ? baseName : `${baseName} ${index + 1}`);
    });
  }
  return names;
}

function publicProvenance(
  provenance: FloorPlanEntityProvenanceV2,
  sourceIds: ReadonlyMap<string, string>,
  calibrationIds: ReadonlyMap<string, string>
): FloorPlanEntityProvenanceV2 {
  return {
    confidence: provenance.confidence,
    extractionVersion: PUBLIC_EXTRACTION_VERSION,
    evidence: provenance.evidence.map((evidence) => {
      const sourceId = sourceIds.get(evidence.sourceId);
      const calibrationId = evidence.calibrationId
        ? calibrationIds.get(evidence.calibrationId)
        : undefined;
      if (!sourceId || (evidence.calibrationId && !calibrationId)) {
        throw new Error("The floor plan contains unresolved public provenance");
      }
      return {
        sourceId,
        basis: evidence.basis,
        confidence: evidence.confidence,
        extractorVersion: PUBLIC_EXTRACTION_VERSION,
        ...(evidence.pageNumber === undefined ? {} : { pageNumber: evidence.pageNumber }),
        ...(evidence.cropPx ? { cropPx: { ...evidence.cropPx } } : {}),
        ...(calibrationId ? { calibrationId } : {}),
        ...(evidence.sourceAnchors
          ? {
              sourceAnchors: evidence.sourceAnchors.map((anchor) => ({
                role: anchor.role,
                sourcePx: { ...anchor.sourcePx },
              })),
            }
          : {}),
        // Deliberately omit free-form evidence notes. They are part of the
        // immutable internal review record, not the consumer floor-plan API.
      };
    }),
    // The verification tier is public; the internal reviewer timeline is not.
    reviewHistory: [],
  };
}

/**
 * Produces the only FloorPlanDocumentV2 shape that may cross the public
 * revision boundary.
 *
 * The full immutable document remains in FloorPlanRevision.documentJson.
 * Source filenames/URIs/hashes, reviewer identities, extraction versions and
 * free-form notes are replaced or removed. Canonical entity IDs and authored
 * geometry remain untouched so saved designs can safely reference them.
 */
export function projectPublicFloorPlanDocumentV2(
  internalDocument: FloorPlanDocumentV2,
  expectedGeometryHash?: string
): FloorPlanDocumentV2 {
  assertPublicFloorPlanEntityIdsOpaque(internalDocument);
  const internalScene = compileFloorPlanDocumentV2(internalDocument);
  if (
    expectedGeometryHash !== undefined &&
    internalScene.geometryHash !== expectedGeometryHash
  ) {
    throw new Error("The stored floor-plan geometry hash is inconsistent");
  }

  const orderedSources = internalDocument.sources
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  const sourceIds = new Map(
    orderedSources.map((source, index) => [source.id, `published-source-${index + 1}`])
  );
  const document: FloorPlanDocumentV2 = {
    schemaVersion: 2,
    units: "mm",
    // The internal document ID may have been derived from an upload filename.
    // The immutable revision ID is already public and remains stable.
    id: internalDocument.revisionId,
    revisionId: internalDocument.revisionId,
    ...(internalDocument.parentRevisionId
      ? { parentRevisionId: internalDocument.parentRevisionId }
      : {}),
    createdAt:
      internalDocument.verification.approvedAt ?? internalDocument.createdAt,
    verification: {
      tier: internalDocument.verification.tier,
      criticalIssueIds: [...internalDocument.verification.criticalIssueIds],
      ...(internalDocument.verification.approvedBy
        ? { approvedBy: PUBLIC_REVIEWER_ID }
        : {}),
      ...(internalDocument.verification.approvedAt
        ? { approvedAt: internalDocument.verification.approvedAt }
        : {}),
    },
    sources: orderedSources.map((source, index) => ({
      id: sourceIds.get(source.id)!,
      kind: source.kind,
      name: `Published ${source.kind.replace(/_/g, " ")} source ${index + 1}`,
      mimeType: source.mimeType,
      ...(source.pageCount === undefined ? {} : { pageCount: source.pageCount }),
      ...(source.widthPx === undefined ? {} : { widthPx: source.widthPx }),
      ...(source.heightPx === undefined ? {} : { heightPx: source.heightPx }),
      // Never expose the internal source URI, upload filename, or content hash.
    })),
    floors: internalDocument.floors.map((floor, floorIndex) => {
      const calibrationIds = new Map(
        floor.calibrations
          .slice()
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((calibration, calibrationIndex) => [
            calibration.id,
            `published-calibration-${floorIndex + 1}-${calibrationIndex + 1}`,
          ] as const)
      );
      const mapProvenance = (provenance: FloorPlanEntityProvenanceV2) =>
        publicProvenance(provenance, sourceIds, calibrationIds);
      const publicRoomTypes = new Map(
        floor.rooms.map((room) => [room.id, requirePublicRoomType(room.roomType)] as const)
      );
      const roomNames = publicEntityNames(
        floor.rooms.map((room) => ({
          id: room.id,
          baseName: PUBLIC_ROOM_DISPLAY_NAMES[publicRoomTypes.get(room.id)!],
        }))
      );
      const structureNames = publicEntityNames(
        floor.structures.map((structure) => ({
          id: structure.id,
          baseName: PUBLIC_STRUCTURE_DISPLAY_NAMES[structure.kind],
        }))
      );
      const configurationIds = new Map(
        [...new Set(
          floor.annotations
            .map((annotation) => annotation.configurationId)
            .filter((id): id is string => Boolean(id))
        )]
          .sort((left, right) => left.localeCompare(right))
          .map((id, index) => [id, `published-configuration-${floorIndex + 1}-${index + 1}`])
      );
      return {
        ...floor,
        name: publicFloorName(floor.levelIndex),
        defaults: Object.fromEntries(
          Object.entries(floor.defaults).map(([key, property]) => [
            key,
            { ...property, provenance: mapProvenance(property.provenance) },
          ])
        ) as typeof floor.defaults,
        calibrations: floor.calibrations.map((calibration) => ({
          ...calibration,
          id: calibrationIds.get(calibration.id) ?? calibration.id,
          sourceId: sourceIds.get(calibration.sourceId) ?? calibration.sourceId,
          controlPoints: calibration.controlPoints.map((point) => ({
            sourcePx: { ...point.sourcePx },
            planMm: { ...point.planMm },
          })),
        })),
        vertices: floor.vertices.map((entity) => ({
          ...entity,
          provenance: mapProvenance(entity.provenance),
        })),
        walls: floor.walls.map((entity) => ({
          ...entity,
          provenance: mapProvenance(entity.provenance),
        })),
        rooms: floor.rooms.map((entity) => ({
          ...entity,
          name: roomNames.get(entity.id)!,
          roomType: publicRoomTypes.get(entity.id)!,
          provenance: mapProvenance(entity.provenance),
        })),
        openings: floor.openings.map((entity) => ({
          ...entity,
          provenance: mapProvenance(entity.provenance),
        })),
        structures: floor.structures.map((entity) => ({
          ...entity,
          name: structureNames.get(entity.id)!,
          provenance: mapProvenance(entity.provenance),
        })),
        annotations: floor.annotations
          // Notes and free-form labels are internal review/display material.
          // Source-supported optional geometry remains useful to consumers,
          // but its uploader-controlled text is replaced by a semantic label.
          .filter(
            (annotation) =>
              annotation.kind === "suggested_room" ||
              annotation.kind === "optional_partition"
          )
          .map((entity) => ({
            ...entity,
            text:
              entity.kind === "suggested_room"
                ? "Suggested Room"
                : "Optional Partition",
            ...(entity.configurationId
              ? { configurationId: configurationIds.get(entity.configurationId)! }
              : {}),
            provenance: mapProvenance(entity.provenance),
          })),
        dimensions: floor.dimensions.map((entity) => {
          const { label: _internalLabel, ...publicDimension } = entity;
          return {
            ...publicDimension,
            provenance: mapProvenance(entity.provenance),
          };
        }),
      };
    }),
  };

  const publicScene = compileFloorPlanDocumentV2(document);
  if (publicScene.geometryHash !== internalScene.geometryHash) {
    throw new Error("Public floor-plan projection changed canonical geometry");
  }
  return document;
}

export type PublicFloorPlanRevisionRow = {
  id: string;
  geometryHash: string;
  verificationTier: string;
  publicationStatus: string;
  publishedAt: Date | string | null;
  documentJson: unknown;
  publicMetadata: FloorPlanPublicDisplayMetadata;
  addressBindings: Array<{
    id?: string;
    countryCode: string;
    addressNormalized: string;
    block: string;
    street: string;
    postalCode?: string | null;
    stack?: string | null;
    floorMin?: number | null;
    floorMax?: number | null;
    transform: string;
  }>;
  authoredVariantOptions?: Array<{
    group: PersistedFloorPlanAuthoredVariantGroup;
  }>;
};

export function buildPublicFloorPlanRevisionPayload(
  revision: PublicFloorPlanRevisionRow
) {
  const document = revision.documentJson as FloorPlanDocumentV2;
  const documentJson = projectPublicFloorPlanDocumentV2(
    document,
    revision.geometryHash
  );
  return {
    revision: {
      id: revision.id,
      geometryHash: revision.geometryHash,
      verificationTier: revision.verificationTier,
      publicationStatus: revision.publicationStatus,
      publishedAt: revision.publishedAt,
      displayMetadata: projectFloorPlanPublicDisplayMetadata(
        revision.publicMetadata
      ),
      documentJson,
      authoredConfigurationGroups: projectPublicFloorPlanAuthoredVariantGroups(
        revision.authoredVariantOptions?.map((entry) => entry.group) ?? [],
        revision.id
      ),
      addressBindings: revision.addressBindings.map((binding) => ({
        ...(binding.id ? { id: binding.id } : {}),
        countryCode: binding.countryCode,
        addressNormalized: binding.addressNormalized,
        block: binding.block,
        street: binding.street,
        postalCode: binding.postalCode ?? null,
        stack: binding.stack ?? null,
        floorMin: binding.floorMin ?? null,
        floorMax: binding.floorMax ?? null,
        transform: binding.transform,
      })),
    },
  };
}
