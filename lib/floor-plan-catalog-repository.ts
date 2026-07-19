import type { FloorPlanLibraryCatalog } from "@/lib/floor-plan-library-schema";
import {
  browseReviewOnlyFloorPlanLibrary,
  normalizeFloorPlanAddress,
  parseFloorPlanUnitNumber,
  searchReviewOnlyFloorPlanLibrary,
  type FloorPlanLibrarySearchResult,
  type FloorPlanLibraryUnitMatch,
  type FloorPlanLibraryUnitQuery,
} from "@/lib/floor-plan-address-search";
import type {
  FloorPlanAddressTransform,
  FloorPlanVerificationTier,
} from "@/lib/floor-plan-imports/types";
import { hasPublicFloorPlanPublicationEvidence } from "@/lib/floor-plan-imports/publication-evidence";
import { publicFloorPlanRoomDisplayName } from "@/lib/floor-plan-imports/public-document";
import {
  floorPlanPublicDisplayMetadataSchema,
  type FloorPlanPublicDisplayMetadata,
} from "@/lib/floor-plan-imports/public-display-metadata";
import type { PublicFloorPlanAuthoredVariantGroup } from "@/lib/floor-plan-authored-variant-links";

const MAX_CATALOG_RESULTS = 100;

export type FloorPlanCatalogSearchOptions = {
  limit?: number;
};

export type PublishedFloorPlanCatalogKey = {
  publishedAt: string;
  revisionId: string;
  bindingId: string;
};

export type FloorPlanCatalogPageOptions = FloorPlanCatalogSearchOptions & {
  after?: PublishedFloorPlanCatalogKey | null;
};

export type FloorPlanCatalogPage = {
  results: FloorPlanCatalogSearchResult[];
  nextKey: PublishedFloorPlanCatalogKey | null;
};

export type PublishedFloorPlanAddressBindingRow = {
  id: string;
  countryCode: string;
  addressNormalized: string;
  block: string;
  street: string;
  postalCode: string | null;
  stack: string | null;
  floorMin: number | null;
  floorMax: number | null;
  transform: FloorPlanAddressTransform;
};

export type PublishedFloorPlanRevisionRow = {
  id: string;
  geometryHash: string;
  verificationTier: FloorPlanVerificationTier;
  publishedAt: Date | string | null;
  approvedByEmail?: string | null;
  publishedByEmail?: string | null;
  documentJson: unknown;
  sourceManifestJson: unknown;
  publicMetadata: FloorPlanPublicDisplayMetadata | null;
  addressBindings: PublishedFloorPlanAddressBindingRow[];
  authoredConfigurationGroups?: PublicFloorPlanAuthoredVariantGroup[];
  catalogKey?: PublishedFloorPlanCatalogKey;
};

export type PublishedFloorPlanRevisionListInput = {
  browse: boolean;
  queryTokens: string[];
  unitQuery: FloorPlanLibraryUnitQuery | null;
  take: number;
  after?: PublishedFloorPlanCatalogKey | null;
};

export type PublishedFloorPlanRevisionListPage = {
  rows: PublishedFloorPlanRevisionRow[];
  lastScannedKey: PublishedFloorPlanCatalogKey | null;
  hasMore: boolean;
};

/** Small data-source surface keeps catalog search testable without a database. */
export interface PublishedFloorPlanRevisionDataSource {
  listPublishedRevisions(
    input: PublishedFloorPlanRevisionListInput
  ): Promise<PublishedFloorPlanRevisionListPage>;
}

export type FloorPlanPublishedRevisionSearchResult = {
  resultKind: "canonical_revision";
  id: string;
  planId: string;
  layoutId: string;
  revisionId: string;
  revisionUrl: string;
  geometryHash: string;
  verificationTier: FloorPlanVerificationTier;
  addressTransform: FloorPlanAddressTransform;
  addressBinding: PublishedFloorPlanAddressBindingRow;
  projectName: string;
  addressLabel: string;
  matchedBlocks: string[];
  label: string;
  flatType: string;
  bedroomCount: number;
  floorAreaSqm: number | null;
  roomLabels: Array<{ id: string; name: string; roomType: string }>;
  previewUrl: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourcePage: number | null;
  publisher: string | null;
  fidelity: "canonical_v2";
  verificationNote: string;
  accuracyNotice: string;
  matchLevel: "street" | "block" | "unit";
  unitMatches: FloorPlanLibraryUnitMatch[];
  authoredConfigurationGroups?: PublicFloorPlanAuthoredVariantGroup[];
};

/** Consumer catalog results are always approved immutable canonical revisions. */
export type FloorPlanCatalogSearchResult = FloorPlanPublishedRevisionSearchResult;

export interface FloorPlanCatalogRepository {
  search(
    rawQuery: string,
    options?: FloorPlanCatalogSearchOptions
  ): Promise<FloorPlanCatalogSearchResult[]>;
  browse(
    options?: FloorPlanCatalogSearchOptions
  ): Promise<FloorPlanCatalogSearchResult[]>;
  searchPage(rawQuery: string, options?: FloorPlanCatalogPageOptions): Promise<FloorPlanCatalogPage>;
  browsePage(options?: FloorPlanCatalogPageOptions): Promise<FloorPlanCatalogPage>;
}

function clampLimit(limit: number | undefined, fallback: number) {
  return Math.min(
    MAX_CATALOG_RESULTS,
    Math.max(1, Number.isFinite(limit) ? Math.floor(limit!) : fallback)
  );
}

function queryTokens(rawQuery: string) {
  const normalized = normalizeFloorPlanAddress(rawQuery);
  return normalized ? normalized.split(" ") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

type PublicRoomMetadata = {
  roomLabels: Array<{ id: string; name: string; roomType: string }>;
  roomLabelsSafe: boolean;
};

function extractPublicRoomMetadata(documentValue: unknown): PublicRoomMetadata {
  const document = isRecord(documentValue) ? documentValue : {};
  const floors = Array.isArray(document.floors) ? document.floors : [];
  let roomLabelsSafe = true;
  const roomTypes = floors.flatMap((floor) => {
    if (!isRecord(floor) || !Array.isArray(floor.rooms)) {
      roomLabelsSafe = false;
      return [];
    }
    return floor.rooms.flatMap((room) => {
      if (!isRecord(room) || typeof room.roomType !== "string") {
        roomLabelsSafe = false;
        return [];
      }
      const name = publicFloorPlanRoomDisplayName(room.roomType);
      if (!name) {
        roomLabelsSafe = false;
        return [];
      }
      return [{ roomType: room.roomType, name }];
    });
  });
  const roomLabels = roomTypes.map(({ roomType, name }, index) => ({
    id: `published-room-${index + 1}`,
    name,
    roomType,
  }));

  return { roomLabels, roomLabelsSafe };
}

function bindingSearchText(binding: PublishedFloorPlanAddressBindingRow) {
  return normalizeFloorPlanAddress(
    [
      binding.addressNormalized,
      binding.block,
      binding.street,
      binding.postalCode ?? "",
      binding.countryCode,
      binding.countryCode.toUpperCase() === "SG" ? "Singapore" : "",
    ].join(" ")
  );
}

function matchesBinding(
  binding: PublishedFloorPlanAddressBindingRow,
  tokens: string[],
  unitQuery: FloorPlanLibraryUnitQuery | null,
  browse: boolean
) {
  if (!browse) {
    const availableTokens = new Set(bindingSearchText(binding).split(" "));
    if (!tokens.every((token) => availableTokens.has(token))) return false;
  }
  if (!unitQuery) return true;
  if (!binding.stack || binding.stack.toUpperCase() !== unitQuery.stack) return false;
  if (binding.floorMin !== null && unitQuery.floor < binding.floorMin) return false;
  if (binding.floorMax !== null && unitQuery.floor > binding.floorMax) return false;
  return true;
}

function resultMatchLevel(
  binding: PublishedFloorPlanAddressBindingRow,
  tokens: string[],
  unitQuery: FloorPlanLibraryUnitQuery | null,
  browse: boolean
): "street" | "block" | "unit" {
  if (unitQuery) return "unit";
  if (browse) return "street";
  const blockTokens = normalizeFloorPlanAddress(binding.block).split(" ");
  return blockTokens.every((token) => tokens.includes(token)) ? "block" : "street";
}

export function mapPublishedFloorPlanRevisionRows(
  rows: PublishedFloorPlanRevisionRow[],
  input: {
    rawQuery?: string;
    browse?: boolean;
    limit?: number;
  } = {}
): FloorPlanPublishedRevisionSearchResult[] {
  const browse = input.browse === true;
  const rawQuery = input.rawQuery ?? "";
  const tokens = queryTokens(rawQuery);
  const unitQuery = browse ? null : parseFloorPlanUnitNumber(rawQuery);
  if (!browse && (tokens.length === 0 || normalizeFloorPlanAddress(rawQuery).length < 2)) {
    return [];
  }
  const limit = clampLimit(input.limit, browse ? 50 : 24);
  const results: FloorPlanPublishedRevisionSearchResult[] = [];

  for (const revision of rows) {
    if (
      !hasPublicFloorPlanPublicationEvidence({
        revisionId: revision.id,
        geometryHash: revision.geometryHash,
        verificationTier: revision.verificationTier,
        publishedAt: revision.publishedAt,
        approvedByEmail: revision.approvedByEmail,
        publishedByEmail: revision.publishedByEmail,
        sourceManifest: revision.sourceManifestJson,
      })
    ) {
      continue;
    }
    const parsedMetadata = floorPlanPublicDisplayMetadataSchema.safeParse(
      revision.publicMetadata
    );
    const roomMetadata = extractPublicRoomMetadata(revision.documentJson);
    if (!parsedMetadata.success || !roomMetadata.roomLabelsSafe) continue;
    const metadata = parsedMetadata.data;
    for (const binding of revision.addressBindings) {
      if (!matchesBinding(binding, tokens, unitQuery, browse)) continue;
      const sourcePage = metadata.sourcePage;
      const unitMatches: FloorPlanLibraryUnitMatch[] = unitQuery
        ? [
            {
              ...unitQuery,
              block: binding.block,
              distributionStatus: "verified",
              sourceUrl: metadata.sourceUrl,
              sourceTitle: metadata.sourceTitle,
              sourcePdfPage: sourcePage ?? 1,
              sourceBrochurePage: sourcePage ?? 1,
            },
          ]
        : [];
      const addressLabel = (binding.block || binding.street
        ? [`Block ${binding.block}`, binding.street, binding.postalCode]
        : [binding.addressNormalized, binding.postalCode])
        .filter(Boolean)
        .join(", ");
      const bedroomCount = roomMetadata.roomLabels.filter((room) =>
        room.roomType.toLowerCase().includes("bed")
      ).length;
      const verificationNote =
        revision.verificationTier === "construction_verified"
          ? "Geometry is backed by unit-specific construction or measured evidence."
          : revision.verificationTier === "source_verified"
            ? "Every critical element was reviewed against the registered source drawing."
            : "This revision still requires verification before construction use.";

      results.push({
        resultKind: "canonical_revision",
        id: `revision:${revision.id}:${binding.id}`,
        planId: revision.id,
        layoutId: revision.id,
        revisionId: revision.id,
        revisionUrl: `/api/floor-plans/revisions/${encodeURIComponent(revision.id)}`,
        geometryHash: revision.geometryHash,
        verificationTier: revision.verificationTier,
        addressTransform: binding.transform,
        addressBinding: { ...binding },
        projectName: metadata.projectName,
        addressLabel,
        matchedBlocks: binding.block ? [binding.block] : [],
        label: metadata.label,
        flatType: metadata.flatType,
        bedroomCount,
        floorAreaSqm: metadata.floorAreaSqm,
        roomLabels: roomMetadata.roomLabels,
        previewUrl: metadata.previewUrl,
        sourceUrl: metadata.sourceUrl,
        sourceTitle: metadata.sourceTitle,
        sourcePage,
        publisher: metadata.publisher,
        fidelity: "canonical_v2",
        verificationNote,
        accuracyNotice:
          "Confirm the unit orientation after opening. Construction decisions require construction-verified evidence.",
        matchLevel: resultMatchLevel(binding, tokens, unitQuery, browse),
        unitMatches,
        authoredConfigurationGroups: structuredClone(
          revision.authoredConfigurationGroups ?? []
        ),
      });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

/**
 * Schema-v1 YAML catalogs are retained for migration, admin review and golden
 * regression fixtures. Their methods are deliberately not compatible with the
 * public FloorPlanCatalogRepository surface.
 */
export class ReviewOnlyYamlFloorPlanCatalogRepository {
  constructor(private readonly loadCatalogs: () => FloorPlanLibraryCatalog[]) {}

  async searchForReview(
    rawQuery: string,
    options: FloorPlanCatalogSearchOptions = {}
  ): Promise<FloorPlanLibrarySearchResult[]> {
    return searchReviewOnlyFloorPlanLibrary(this.loadCatalogs(), rawQuery, options);
  }

  async browseForReview(
    options: FloorPlanCatalogSearchOptions = {}
  ): Promise<FloorPlanLibrarySearchResult[]> {
    return browseReviewOnlyFloorPlanLibrary(this.loadCatalogs(), options);
  }
}

export class PublishedRevisionFloorPlanCatalogRepository
  implements FloorPlanCatalogRepository
{
  constructor(private readonly dataSource: PublishedFloorPlanRevisionDataSource) {}

  private async readPage(input: {
    browse: boolean;
    rawQuery: string;
    options: FloorPlanCatalogPageOptions;
  }): Promise<FloorPlanCatalogPage> {
    const tokens = queryTokens(input.rawQuery);
    if (!input.browse && (tokens.length === 0 || normalizeFloorPlanAddress(input.rawQuery).length < 2)) {
      return { results: [], nextKey: null };
    }
    const limit = clampLimit(input.options.limit, input.browse ? 50 : 24);
    const wanted = limit + 1;
    const matches: Array<{
      result: FloorPlanCatalogSearchResult;
      key: PublishedFloorPlanCatalogKey;
    }> = [];
    let after = input.options.after ?? null;

    // Read bounded keyset batches until the page is full or the immutable
    // published set is exhausted. Invalid evidence advances the scan key but
    // never consumes a public result slot.
    while (matches.length < wanted) {
      const page = await this.dataSource.listPublishedRevisions({
        browse: input.browse,
        queryTokens: input.browse ? [] : tokens,
        unitQuery: input.browse ? null : parseFloorPlanUnitNumber(input.rawQuery),
        take: Math.max(32, Math.min(128, (wanted - matches.length) * 4)),
        after,
      });

      for (const row of page.rows) {
        const key = row.catalogKey;
        const publishedAt = row.publishedAt ? new Date(row.publishedAt) : null;
        if (
          !key ||
          !publishedAt ||
          Number.isNaN(publishedAt.getTime()) ||
          key.publishedAt !== publishedAt.toISOString() ||
          key.revisionId !== row.id ||
          row.addressBindings.length !== 1 ||
          key.bindingId !== row.addressBindings[0].id
        ) {
          continue;
        }
        const mapped = mapPublishedFloorPlanRevisionRows([row], {
          rawQuery: input.rawQuery,
          browse: input.browse,
          limit: 1,
        });
        if (mapped[0]) matches.push({ result: mapped[0], key });
        if (matches.length >= wanted) break;
      }

      if (matches.length >= wanted || !page.hasMore || !page.lastScannedKey) break;
      if (
        after &&
        after.publishedAt === page.lastScannedKey.publishedAt &&
        after.revisionId === page.lastScannedKey.revisionId &&
        after.bindingId === page.lastScannedKey.bindingId
      ) {
        throw new Error("Floor-plan catalog data source did not advance its keyset cursor.");
      }
      after = page.lastScannedKey;
    }

    const selected = matches.slice(0, limit);
    return {
      results: selected.map((entry) => entry.result),
      nextKey: matches.length > limit ? selected.at(-1)?.key ?? null : null,
    };
  }

  async search(rawQuery: string, options: FloorPlanCatalogSearchOptions = {}) {
    return (await this.searchPage(rawQuery, options)).results;
  }

  async browse(options: FloorPlanCatalogSearchOptions = {}) {
    return (await this.browsePage(options)).results;
  }

  async searchPage(rawQuery: string, options: FloorPlanCatalogPageOptions = {}) {
    return this.readPage({ browse: false, rawQuery, options });
  }

  async browsePage(options: FloorPlanCatalogPageOptions = {}) {
    return this.readPage({ browse: true, rawQuery: "", options });
  }
}
