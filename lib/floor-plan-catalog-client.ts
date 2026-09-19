import type { HousePlanTemplate } from "@/lib/design-page-house-plan";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanCatalogSearchResult,
  FloorPlanPublishedRevisionSearchResult,
} from "@/lib/floor-plan-catalog-repository";
import type { PublicFloorPlanAuthoredVariantGroup } from "@/lib/floor-plan-authored-variant-links";

type PublishedFloorPlanRevisionPayload = {
  revision: {
    id: string;
    geometryHash: string;
    verificationTier: string;
    publicationStatus: string;
    documentJson: unknown;
    authoredConfigurationGroups: PublicFloorPlanAuthoredVariantGroup[];
  };
};

export type PrivateFloorPlanExactSelection = {
  address: string;
  floor: number;
  stack: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseAuthoredConfigurationGroups(
  value: unknown
): PublicFloorPlanAuthoredVariantGroup[] {
  if (!Array.isArray(value)) return [];
  return value.map((rawGroup) => {
    if (!isRecord(rawGroup) || !Array.isArray(rawGroup.options)) {
      throw new Error("The authored floor-plan options are invalid.");
    }
    const groupId = typeof rawGroup.groupId === "string" ? rawGroup.groupId : "";
    const label = typeof rawGroup.label === "string" ? rawGroup.label : "";
    const defaultOptionId = typeof rawGroup.defaultOptionId === "string"
      ? rawGroup.defaultOptionId
      : "";
    const options = rawGroup.options.map((rawOption) => {
      if (!isRecord(rawOption)) {
        throw new Error("The authored floor-plan option is invalid.");
      }
      const option: PublicFloorPlanAuthoredVariantGroup["options"][number] = {
        optionId: typeof rawOption.optionId === "string" ? rawOption.optionId : "",
        label: typeof rawOption.label === "string" ? rawOption.label : "",
        revisionId: typeof rawOption.revisionId === "string" ? rawOption.revisionId : "",
        revisionUrl: typeof rawOption.revisionUrl === "string" ? rawOption.revisionUrl : "",
        geometryHash: typeof rawOption.geometryHash === "string" ? rawOption.geometryHash : "",
        verificationTier: rawOption.verificationTier === "construction_verified"
          ? "construction_verified"
          : "source_verified",
        defaultSelected: rawOption.defaultSelected === true,
        sourcePage: rawOption.sourcePage === null ? null : Number(rawOption.sourcePage),
      };
      if (
        !option.optionId ||
        !option.label ||
        !option.revisionId ||
        option.revisionUrl !== `/api/floor-plans/revisions/${encodeURIComponent(option.revisionId)}` ||
        !/^[a-f0-9]{64}$/.test(option.geometryHash) ||
        !["source_verified", "construction_verified"].includes(String(rawOption.verificationTier)) ||
        (option.sourcePage !== null &&
          (!Number.isSafeInteger(option.sourcePage) || option.sourcePage < 1))
      ) {
        throw new Error("The authored floor-plan option failed integrity checks.");
      }
      return option;
    });
    if (
      !groupId ||
      !label ||
      options.length < 2 ||
      options.filter((option) => option.defaultSelected).length !== 1 ||
      options.find((option) => option.defaultSelected)?.optionId !== defaultOptionId
    ) {
      throw new Error("The authored floor-plan option group failed integrity checks.");
    }
    return { groupId, label, defaultOptionId, options };
  });
}

export function isCanonicalFloorPlanCatalogResult(
  result: FloorPlanCatalogSearchResult
): result is FloorPlanPublishedRevisionSearchResult {
  return result.resultKind === "canonical_revision";
}

function parseRevisionPayload(value: unknown): PublishedFloorPlanRevisionPayload {
  if (!isRecord(value) || !isRecord(value.revision)) {
    throw new Error("The verified floor plan response is incomplete.");
  }
  const revision = value.revision;
  if (
    typeof revision.id !== "string" ||
    typeof revision.geometryHash !== "string" ||
    typeof revision.verificationTier !== "string" ||
    typeof revision.publicationStatus !== "string" ||
    !("documentJson" in revision)
  ) {
    throw new Error("The verified floor plan response is invalid.");
  }
  return {
    revision: {
      id: revision.id,
      geometryHash: revision.geometryHash,
      verificationTier: revision.verificationTier,
      publicationStatus: revision.publicationStatus,
      documentJson: revision.documentJson,
      authoredConfigurationGroups: parseAuthoredConfigurationGroups(
        revision.authoredConfigurationGroups
      ),
    },
  };
}

export function buildCanonicalFloorPlanTemplateForAuthoredVariant(input: {
  baseResult: FloorPlanPublishedRevisionSearchResult;
  matchedResult: FloorPlanPublishedRevisionSearchResult;
  groupId: string;
  option: PublicFloorPlanAuthoredVariantGroup["options"][number];
  responseValue: unknown;
  privateSelection: PrivateFloorPlanExactSelection;
}): HousePlanTemplate {
  const baseGroup = input.baseResult.authoredConfigurationGroups?.find(
    (group) => group.groupId === input.groupId
  );
  const linkedOption = baseGroup?.options.find(
    (option) => option.optionId === input.option.optionId
  );
  if (
    !linkedOption ||
    linkedOption.revisionId !== input.option.revisionId ||
    linkedOption.geometryHash !== input.option.geometryHash ||
    linkedOption.revisionId !== input.matchedResult.revisionId ||
    linkedOption.geometryHash !== input.matchedResult.geometryHash
  ) {
    throw new Error("This authored floor-plan option is no longer linked for public use.");
  }
  return buildCanonicalFloorPlanTemplate(
    input.matchedResult,
    input.responseValue,
    input.privateSelection
  );
}

export function buildFloorPlanBrowseResultForAuthoredVariant(
  baseResult: FloorPlanPublishedRevisionSearchResult,
  option: PublicFloorPlanAuthoredVariantGroup["options"][number]
): FloorPlanPublishedRevisionSearchResult {
  return {
    ...baseResult,
    id: `revision:${option.revisionId}`,
    planId: option.revisionId,
    layoutId: option.revisionId,
    revisionId: option.revisionId,
    revisionUrl: option.revisionUrl,
    geometryHash: option.geometryHash,
    verificationTier: option.verificationTier,
    // A variant link supplies a page number, not that revision's preview/source URL.
    previewUrl: null, sourceUrl: null, sourceTitle: null, sourcePage: null,
    matchLevel: "layout",
    selectedBindingId: undefined,
    addressTransform: undefined,
  };
}

function parseDocument(value: unknown): FloorPlanDocumentV2 {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    value.units !== "mm" ||
    typeof value.revisionId !== "string" ||
    !isRecord(value.verification) ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.floors)
  ) {
    throw new Error("The revision does not contain a FloorPlanDocumentV2.");
  }
  return value as unknown as FloorPlanDocumentV2;
}

function assertRevisionMatchesResult(
  result: FloorPlanPublishedRevisionSearchResult,
  revision: PublishedFloorPlanRevisionPayload["revision"],
  privateSelection?: PrivateFloorPlanExactSelection
) {
  if (revision.publicationStatus !== "published") {
    throw new Error("This floor-plan revision is no longer published.");
  }
  if (revision.id !== result.revisionId) {
    throw new Error("The floor-plan revision does not match the search result.");
  }
  if (revision.geometryHash !== result.geometryHash) {
    throw new Error("The floor-plan geometry changed. Search again for the latest revision.");
  }
  if (revision.verificationTier !== result.verificationTier) {
    throw new Error("The floor-plan verification status changed. Search again before using it.");
  }
  if (!privateSelection && result.matchLevel === "unit") {
    throw new Error("The private unit selection is no longer available. Search again.");
  }
  if (
    result.matchLevel === "unit" &&
    (!result.selectedBindingId || !result.addressTransform)
  ) {
    throw new Error("The exact floor-plan match is incomplete.");
  }
}

function compileValidatedDocument(
  result: FloorPlanPublishedRevisionSearchResult,
  revision: PublishedFloorPlanRevisionPayload["revision"]
) {
  const document = parseDocument(revision.documentJson);
  if (
    document.revisionId !== revision.id ||
    document.verification.tier !== revision.verificationTier
  ) {
    throw new Error("The floor-plan document evidence is inconsistent.");
  }
  if (compileFloorPlanDocumentV2(document).geometryHash !== revision.geometryHash) {
    throw new Error("The downloaded floor-plan geometry failed its integrity check.");
  }
  if (document.revisionId !== result.revisionId) {
    throw new Error("The floor-plan document revision is inconsistent.");
  }
  return document;
}

function buildPrivateAddressBinding(
  result: FloorPlanPublishedRevisionSearchResult,
  selection?: PrivateFloorPlanExactSelection
) {
  if (!selection || !result.selectedBindingId || !result.addressTransform) return undefined;
  return {
    bindingId: result.selectedBindingId,
    countryCode: "SG",
    addressNormalized: selection.address,
    block: "",
    street: "",
    postalCode: null,
    stack: selection.stack,
    floorMin: selection.floor,
    floorMax: selection.floor,
    transform: result.addressTransform,
    unitFloor: selection.floor,
    unitStack: selection.stack,
  };
}

/** Recompiles immutable public geometry before any private editor state is built. */
export function buildCanonicalFloorPlanTemplate(
  result: FloorPlanPublishedRevisionSearchResult,
  responseValue: unknown,
  privateSelection?: PrivateFloorPlanExactSelection
): HousePlanTemplate {
  const { revision } = parseRevisionPayload(responseValue);
  assertRevisionMatchesResult(result, revision, privateSelection);
  const document = compileValidatedDocument(result, revision);
  const canonicalId = result.revisionId.replace(/[^a-z0-9_-]+/gi, "_");
  const addressBinding = buildPrivateAddressBinding(result, privateSelection);
  return {
    id: `library_revision_${canonicalId}`,
    label: `${result.label} - ${result.projectName}`,
    summary: result.verificationNote,
    bestFor: "A reviewed address-library starter plan",
    layoutType: "flat",
    footprint: "compact",
    bedroomCount: result.bedroomCount,
    tags: [
      "address library",
      "canonical floor plan",
      result.verificationTier.replace(/_/g, " "),
    ],
    zones: result.roomLabels.map((room) => room.name),
    realLifeChecks: [result.accuracyNotice],
    rooms: [],
    doorways: [],
    windows: [],
    referenceZones: [],
    furnishingPacks: [],
    canonical: {
      document,
      revisionId: revision.id,
      geometryHash: revision.geometryHash,
      verificationTier: document.verification.tier,
      addressTransform: result.addressTransform ?? "normal",
      ...(addressBinding ? { addressBinding } : {}),
    },
  };
}
