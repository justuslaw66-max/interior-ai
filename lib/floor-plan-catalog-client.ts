import type { HousePlanTemplate } from "@/lib/design-page-house-plan";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanCatalogSearchResult,
  FloorPlanPublishedRevisionSearchResult,
} from "@/lib/floor-plan-catalog-repository";
import type {
  PublicFloorPlanAuthoredVariantGroup,
} from "@/lib/floor-plan-authored-variant-links";

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
      if (!isRecord(rawOption) || !isRecord(rawOption.addressBinding)) {
        throw new Error("The authored floor-plan option is invalid.");
      }
      const option = {
        optionId: typeof rawOption.optionId === "string" ? rawOption.optionId : "",
        label: typeof rawOption.label === "string" ? rawOption.label : "",
        revisionId: typeof rawOption.revisionId === "string" ? rawOption.revisionId : "",
        revisionUrl: typeof rawOption.revisionUrl === "string" ? rawOption.revisionUrl : "",
        geometryHash: typeof rawOption.geometryHash === "string" ? rawOption.geometryHash : "",
        verificationTier: typeof rawOption.verificationTier === "string"
          ? rawOption.verificationTier
          : "",
        defaultSelected: rawOption.defaultSelected === true,
        sourcePage: rawOption.sourcePage === null ? null : Number(rawOption.sourcePage),
        addressBinding: {
          id: typeof rawOption.addressBinding.id === "string"
            ? rawOption.addressBinding.id
            : "",
          transform: typeof rawOption.addressBinding.transform === "string"
            ? rawOption.addressBinding.transform
            : "",
        },
      };
      if (
        !option.optionId ||
        !option.label ||
        !option.revisionId ||
        option.revisionUrl !== `/api/floor-plans/revisions/${encodeURIComponent(option.revisionId)}` ||
        !/^[a-f0-9]{64}$/.test(option.geometryHash) ||
        !["source_verified", "construction_verified"].includes(option.verificationTier) ||
        !option.addressBinding.id ||
        ![
          "normal", "mirror_x", "mirror_z", "rotate_90", "rotate_180", "rotate_270",
          "mirror_x_rotate_90", "mirror_x_rotate_270",
        ].includes(option.addressBinding.transform) ||
        (option.sourcePage !== null && (!Number.isSafeInteger(option.sourcePage) || option.sourcePage < 1))
      ) {
        throw new Error("The authored floor-plan option failed integrity checks.");
      }
      return option as PublicFloorPlanAuthoredVariantGroup["options"][number];
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
  return "resultKind" in result && result.resultKind === "canonical_revision";
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
  groupId: string;
  option: PublicFloorPlanAuthoredVariantGroup["options"][number];
  responseValue: unknown;
}): HousePlanTemplate {
  const payload = parseRevisionPayload(input.responseValue);
  const publicGroup = payload.revision.authoredConfigurationGroups.find(
    (group) => group.groupId === input.groupId
  );
  const publicOption = publicGroup?.options.find(
    (option) => option.optionId === input.option.optionId
  );
  if (
    !publicOption ||
    publicOption.revisionId !== input.option.revisionId ||
    publicOption.geometryHash !== input.option.geometryHash ||
    publicOption.addressBinding.id !== input.option.addressBinding.id
  ) {
    throw new Error("This authored floor-plan option is no longer linked for public use.");
  }
  const result: FloorPlanPublishedRevisionSearchResult = {
    ...input.baseResult,
    id: `revision:${publicOption.revisionId}:${publicOption.addressBinding.id}`,
    planId: publicOption.revisionId,
    layoutId: publicOption.revisionId,
    revisionId: publicOption.revisionId,
    revisionUrl: publicOption.revisionUrl,
    geometryHash: publicOption.geometryHash,
    verificationTier: publicOption.verificationTier,
    addressTransform: publicOption.addressBinding.transform,
    addressBinding: {
      ...input.baseResult.addressBinding,
      id: publicOption.addressBinding.id,
      transform: publicOption.addressBinding.transform,
    },
    authoredConfigurationGroups: payload.revision.authoredConfigurationGroups,
  };
  return buildCanonicalFloorPlanTemplate(result, input.responseValue);
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

/**
 * Validates the immutable summary against the fetched document before it can
 * enter the editor. The compiler recomputes the geometry hash in-browser.
 */
export function buildCanonicalFloorPlanTemplate(
  result: FloorPlanPublishedRevisionSearchResult,
  responseValue: unknown
): HousePlanTemplate {
  const { revision } = parseRevisionPayload(responseValue);
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
  if (
    result.verificationTier !== "source_verified" &&
    result.verificationTier !== "construction_verified"
  ) {
    throw new Error("This floor plan has not passed publication verification.");
  }

  const document = parseDocument(revision.documentJson);
  if (document.revisionId !== revision.id) {
    throw new Error("The document revision identifier is inconsistent.");
  }
  if (document.verification.tier !== revision.verificationTier) {
    throw new Error("The document verification evidence is inconsistent.");
  }
  const scene = compileFloorPlanDocumentV2(document);
  if (scene.geometryHash !== revision.geometryHash) {
    throw new Error("The downloaded floor-plan geometry failed its integrity check.");
  }

  const canonicalId = result.revisionId.replace(/[^a-z0-9_-]+/gi, "_");
  return {
    id: `library_revision_${canonicalId}`,
    label: `${result.label} - ${result.projectName}`,
    summary: result.verificationNote,
    bestFor: `Address-matched starter plan for ${result.addressLabel}`,
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
      addressTransform: result.addressTransform,
      addressBinding: {
        bindingId: result.addressBinding.id,
        countryCode: result.addressBinding.countryCode,
        addressNormalized: result.addressBinding.addressNormalized,
        block: result.addressBinding.block,
        street: result.addressBinding.street,
        postalCode: result.addressBinding.postalCode,
        stack: result.addressBinding.stack,
        floorMin: result.addressBinding.floorMin,
        floorMax: result.addressBinding.floorMax,
        transform: result.addressBinding.transform,
        unitFloor: result.unitMatches[0]?.floor ?? null,
        unitStack: result.unitMatches[0]?.stack ?? null,
      },
    },
  };
}
