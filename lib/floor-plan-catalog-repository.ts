import type { FloorPlanLibraryCatalog } from "@/lib/floor-plan-library-schema";
import {
  browseReviewOnlyFloorPlanLibrary,
  normalizeFloorPlanAddress,
  searchReviewOnlyFloorPlanLibrary,
  type FloorPlanLibrarySearchResult,
} from "@/lib/floor-plan-address-search";
import type { FloorPlanExactSearch } from "@/lib/floor-plan-directory-contract";
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
import {
  projectPublicFloorPlanAuthoredVariantGroups,
  type PersistedFloorPlanAuthoredVariantGroup,
  type PublicFloorPlanAuthoredVariantGroup,
} from "@/lib/floor-plan-authored-variant-links";

const MAX_CATALOG_RESULTS = 100;

export type FloorPlanCatalogSearchOptions = { limit?: number };

/** Public revision ordering key. Private binding identity is deliberately absent. */
export type PublishedFloorPlanCatalogKey = {
  publishedAt: string;
  revisionId: string;
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
  role?: "catalog" | "authored_variant";
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
  /** Private rows cross only this repository input boundary. */
  addressBindings: PublishedFloorPlanAddressBindingRow[];
  authoredVariantGroups?: PersistedFloorPlanAuthoredVariantGroup[];
  catalogKey?: PublishedFloorPlanCatalogKey;
};

export type PublishedFloorPlanRevisionListInput = {
  mode: "browse" | "search";
  countryCode?: "SG";
  addressTokens: string[];
  unit?: { floor: number; stack: string };
  targetRevisionId?: string;
  take: number;
  after?: PublishedFloorPlanCatalogKey | null;
};

export type PublishedFloorPlanRevisionListPage = {
  rows: PublishedFloorPlanRevisionRow[];
  lastScannedKey: PublishedFloorPlanCatalogKey | null;
  hasMore: boolean;
};

export interface PublishedFloorPlanRevisionDataSource {
  listPublishedRevisions(
    input: PublishedFloorPlanRevisionListInput
  ): Promise<PublishedFloorPlanRevisionListPage>;
}

/** Closed public DTO. Only an exact result receives one opaque selected binding. */
export type FloorPlanPublishedRevisionSearchResult = {
  resultKind: "canonical_revision";
  id: string;
  planId: string;
  layoutId: string;
  revisionId: string;
  revisionUrl: string;
  geometryHash: string;
  verificationTier: FloorPlanVerificationTier;
  projectName: string;
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
  matchLevel: "layout" | "unit";
  selectedBindingId?: string;
  addressTransform?: FloorPlanAddressTransform;
  authoredConfigurationGroups?: PublicFloorPlanAuthoredVariantGroup[];
};

export type FloorPlanCatalogSearchResult = FloorPlanPublishedRevisionSearchResult;

export interface FloorPlanCatalogRepository {
  search(
    exactSearch: FloorPlanExactSearch,
    options?: FloorPlanCatalogSearchOptions
  ): Promise<FloorPlanCatalogSearchResult[]>;
  browse(options?: FloorPlanCatalogSearchOptions): Promise<FloorPlanCatalogSearchResult[]>;
  searchPage(
    exactSearch: FloorPlanExactSearch,
    options?: FloorPlanCatalogPageOptions
  ): Promise<FloorPlanCatalogPage>;
  browsePage(options?: FloorPlanCatalogPageOptions): Promise<FloorPlanCatalogPage>;
}

function clampLimit(limit: number | undefined, fallback: number) {
  return Math.min(
    MAX_CATALOG_RESULTS,
    Math.max(1, Number.isFinite(limit) ? Math.floor(limit!) : fallback)
  );
}

function addressTokens(address: string) {
  const normalized = normalizeFloorPlanAddress(address);
  return normalized ? normalized.split(" ") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractPublicRoomMetadata(documentValue: unknown) {
  const document = isRecord(documentValue) ? documentValue : {};
  const floors = Array.isArray(document.floors) ? document.floors : [];
  let safe = true;
  const roomTypes = floors.flatMap((floor) => {
    if (!isRecord(floor) || !Array.isArray(floor.rooms)) {
      safe = false;
      return [];
    }
    return floor.rooms.flatMap((room) => {
      if (!isRecord(room) || typeof room.roomType !== "string") {
        safe = false;
        return [];
      }
      const name = publicFloorPlanRoomDisplayName(room.roomType);
      if (!name) {
        safe = false;
        return [];
      }
      return [{ roomType: room.roomType, name }];
    });
  });
  return {
    safe,
    labels: roomTypes.map(({ roomType, name }, index) => ({
      id: `published-room-${index + 1}`,
      name,
      roomType,
    })),
  };
}

function bindingSearchText(binding: PublishedFloorPlanAddressBindingRow) {
  return normalizeFloorPlanAddress([
    binding.addressNormalized,
    binding.block,
    binding.street,
    binding.postalCode ?? "",
    binding.countryCode,
    binding.countryCode.toUpperCase() === "SG" ? "Singapore" : "",
  ].join(" "));
}

function matchingBinding(
  revision: PublishedFloorPlanRevisionRow,
  exactSearch: FloorPlanExactSearch
) {
  const tokens = addressTokens(exactSearch.address);
  return revision.addressBindings.find((binding) => {
    const availableTokens = new Set(bindingSearchText(binding).split(" "));
    return (
      binding.countryCode.toUpperCase() === exactSearch.countryCode &&
      (exactSearch.revisionId !== undefined || (binding.role ?? "catalog") === "catalog") &&
      tokens.every((token) => availableTokens.has(token)) &&
      binding.stack?.toUpperCase() === exactSearch.unit.stack &&
      (binding.floorMin === null || exactSearch.unit.floor >= binding.floorMin) &&
      (binding.floorMax === null || exactSearch.unit.floor <= binding.floorMax)
    );
  });
}

function publicAuthoredVariantGroups(
  revision: PublishedFloorPlanRevisionRow,
  binding: PublishedFloorPlanAddressBindingRow | undefined
) {
  return projectPublicFloorPlanAuthoredVariantGroups(
    revision.authoredVariantGroups ?? [],
    revision.id,
    binding?.id
  );
}

export function mapPublishedFloorPlanRevisionRows(
  rows: PublishedFloorPlanRevisionRow[],
  input: { exactSearch?: FloorPlanExactSearch; limit?: number } = {}
): FloorPlanPublishedRevisionSearchResult[] {
  const limit = clampLimit(input.limit, input.exactSearch ? 24 : 50);
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
    ) continue;
    const metadata = floorPlanPublicDisplayMetadataSchema.safeParse(revision.publicMetadata);
    const rooms = extractPublicRoomMetadata(revision.documentJson);
    if (!metadata.success || !rooms.safe) continue;
    const binding = input.exactSearch
      ? matchingBinding(revision, input.exactSearch)
      : undefined;
    if (input.exactSearch && !binding) continue;
    const display = metadata.data;
    const bedroomCount = rooms.labels.filter((room) =>
      room.roomType.toLowerCase().includes("bed")
    ).length;
    const verificationNote = revision.verificationTier === "construction_verified"
      ? "Geometry is backed by reviewed construction or measured evidence."
      : "Every critical element was reviewed against the registered source drawing.";
    results.push({
      resultKind: "canonical_revision",
      id: `revision:${revision.id}`,
      planId: revision.id,
      layoutId: revision.id,
      revisionId: revision.id,
      revisionUrl: `/api/floor-plans/revisions/${encodeURIComponent(revision.id)}`,
      geometryHash: revision.geometryHash,
      verificationTier: revision.verificationTier,
      projectName: display.projectName,
      label: display.label,
      flatType: display.flatType,
      bedroomCount,
      floorAreaSqm: display.floorAreaSqm,
      roomLabels: rooms.labels,
      previewUrl: display.previewUrl,
      sourceUrl: display.sourceUrl,
      sourceTitle: display.sourceTitle,
      sourcePage: display.sourcePage,
      publisher: display.publisher,
      fidelity: "canonical_v2",
      verificationNote,
      accuracyNotice:
        "Confirm the orientation after opening. Construction decisions require construction-verified evidence.",
      matchLevel: binding ? "unit" : "layout",
      ...(binding ? {
        selectedBindingId: binding.id,
        addressTransform: binding.transform,
      } : {}),
      authoredConfigurationGroups: publicAuthoredVariantGroups(revision, binding),
    });
    if (results.length >= limit) break;
  }
  return results;
}

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
  implements FloorPlanCatalogRepository {
  constructor(private readonly dataSource: PublishedFloorPlanRevisionDataSource) {}

  private async readPage(input: {
    exactSearch?: FloorPlanExactSearch;
    options: FloorPlanCatalogPageOptions;
  }): Promise<FloorPlanCatalogPage> {
    const limit = clampLimit(input.options.limit, input.exactSearch ? 24 : 50);
    const wanted = limit + 1;
    const matches: Array<{
      result: FloorPlanCatalogSearchResult;
      key: PublishedFloorPlanCatalogKey;
    }> = [];
    const seenRevisionIds = new Set<string>();
    let after = input.options.after ?? null;
    while (matches.length < wanted) {
      const page = await this.dataSource.listPublishedRevisions({
        mode: input.exactSearch ? "search" : "browse",
        countryCode: input.exactSearch?.countryCode,
        addressTokens: input.exactSearch ? addressTokens(input.exactSearch.address) : [],
        unit: input.exactSearch?.unit,
        targetRevisionId: input.exactSearch?.revisionId,
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
          key.revisionId !== row.id
        ) continue;
        if (seenRevisionIds.has(row.id)) {
          throw new Error("Floor-plan catalog data source returned a duplicate public revision.");
        }
        seenRevisionIds.add(row.id);
        const mapped = mapPublishedFloorPlanRevisionRows([row], {
          exactSearch: input.exactSearch,
          limit: 1,
        });
        if (mapped[0]) matches.push({ result: mapped[0], key });
        if (matches.length >= wanted) break;
      }
      if (matches.length >= wanted || !page.hasMore || !page.lastScannedKey) break;
      if (
        after &&
        after.publishedAt === page.lastScannedKey.publishedAt &&
        after.revisionId === page.lastScannedKey.revisionId
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

  async search(
    exactSearch: FloorPlanExactSearch,
    options: FloorPlanCatalogSearchOptions = {}
  ) {
    return (await this.searchPage(exactSearch, options)).results;
  }

  async browse(options: FloorPlanCatalogSearchOptions = {}) {
    return (await this.browsePage(options)).results;
  }

  async searchPage(
    exactSearch: FloorPlanExactSearch,
    options: FloorPlanCatalogPageOptions = {}
  ) {
    return this.readPage({ exactSearch, options });
  }

  async browsePage(options: FloorPlanCatalogPageOptions = {}) {
    return this.readPage({ options });
  }
}
