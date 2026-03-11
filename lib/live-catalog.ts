import { prisma } from "@/lib/prisma";
import { evaluateCatalogFinishCoverage } from "@/lib/finish-gate";

const prismaCompat = prisma as unknown as {
  modelAsset: {
    findMany: (args: {
      select: {
        id: true;
        approved: true;
        modelUrl: true;
        thumbUrl: true;
        dimsWmm: true;
        dimsDmm: true;
        dimsHmm: true;
        aabbSizeX: true;
        aabbSizeY: true;
        aabbSizeZ: true;
        catalogItems: {
          select: {
            id: true;
            variantsJson: true;
            brandFinishes: { select: { id: true } };
            finishMappings: {
              select: {
                id: true;
                variantId: true;
                component: true;
                brandFinishId: true;
                needsReview: true;
              };
            };
          };
        };
        updatedAt: true;
      };
      orderBy: { updatedAt: "desc" };
    }) => Promise<AssetForGate[]>;
  };
  catalogItem: {
    findMany: (args: {
      where: { assetId: { in: string[] } };
      select: { id: true };
    }) => Promise<Array<{ id: string }>>;
  };
};

export type LiveCatalogEligibility = {
  approved: boolean;
  valid: boolean;
  hasRequiredMetadata: boolean;
};

export type LiveGateReasonCode =
  | "NOT_APPROVED"
  | "INVALID_AABB"
  | "MISSING_MODEL_URL"
  | "MISSING_THUMB_URL"
  | "INVALID_DIMS"
  | "MISSING_CATALOG_ITEM"
  | "MISSING_BRAND_FINISHES"
  | "MISSING_FINISH_MAPPINGS";

export type LiveGateEvaluation = {
  id: string;
  approved: boolean;
  valid: boolean;
  hasRequiredMetadata: boolean;
  eligible: boolean;
  reasons: LiveGateReasonCode[];
  updatedAt: Date;
};

type AssetForGate = {
  id: string;
  approved: boolean;
  modelUrl: string;
  thumbUrl: string;
  dimsWmm: number;
  dimsDmm: number;
  dimsHmm: number;
  aabbSizeX: number;
  aabbSizeY: number;
  aabbSizeZ: number;
  catalogItems: {
    id: string;
    variantsJson: unknown;
    brandFinishes: Array<{ id: string }>;
    finishMappings: Array<{
      id: string;
      variantId: string;
      component: string;
      brandFinishId: string;
      needsReview: boolean;
    }>;
  }[];
  updatedAt: Date;
};

const REQUIRE_FINISH_MAPPING = process.env.LIVE_GATE_REQUIRE_FINISH_MAPPING === "true";

export function hasRequiredAssetMetadata(asset: {
  id: string;
  modelUrl: string;
  thumbUrl: string;
  dimsWmm: number;
  dimsDmm: number;
  dimsHmm: number;
  aabbSizeX: number;
  aabbSizeY: number;
  aabbSizeZ: number;
}): boolean {
  return (
    Boolean(asset.modelUrl) &&
    Boolean(asset.thumbUrl) &&
    asset.dimsWmm > 0 &&
    asset.dimsDmm > 0 &&
    asset.dimsHmm > 0 &&
    asset.aabbSizeX > 0 &&
    asset.aabbSizeY > 0 &&
    asset.aabbSizeZ > 0
  );
}

function evaluateAsset(asset: AssetForGate): LiveGateEvaluation {
  const reasons: LiveGateReasonCode[] = [];

  if (!asset.approved) reasons.push("NOT_APPROVED");
  if (!(asset.aabbSizeX > 0 && asset.aabbSizeY > 0 && asset.aabbSizeZ > 0)) {
    reasons.push("INVALID_AABB");
  }
  if (!asset.modelUrl) reasons.push("MISSING_MODEL_URL");
  if (!asset.thumbUrl) reasons.push("MISSING_THUMB_URL");
  if (!(asset.dimsWmm > 0 && asset.dimsDmm > 0 && asset.dimsHmm > 0)) {
    reasons.push("INVALID_DIMS");
  }

  if (REQUIRE_FINISH_MAPPING) {
    if (asset.catalogItems.length === 0) {
      reasons.push("MISSING_CATALOG_ITEM");
    } else {
      const hasMissingBrandFinishes = asset.catalogItems.some(
        (catalogItem) => evaluateCatalogFinishCoverage(catalogItem).issues.some((issue) => issue.code === "MISSING_BRAND_FINISHES")
      );
      const hasIncompleteFinishMappings = asset.catalogItems.some(
        (catalogItem) => !evaluateCatalogFinishCoverage(catalogItem).complete
      );

      if (hasMissingBrandFinishes) {
        reasons.push("MISSING_BRAND_FINISHES");
      }
      if (hasIncompleteFinishMappings) {
        reasons.push("MISSING_FINISH_MAPPINGS");
      }
    }
  }

  const eligibility: LiveCatalogEligibility = {
    approved: asset.approved === true,
    valid: asset.aabbSizeX > 0 && asset.aabbSizeY > 0 && asset.aabbSizeZ > 0,
    hasRequiredMetadata: hasRequiredAssetMetadata(asset),
  };

  return {
    id: asset.id,
    approved: eligibility.approved,
    valid: eligibility.valid,
    hasRequiredMetadata: eligibility.hasRequiredMetadata,
    eligible: reasons.length === 0,
    reasons,
    updatedAt: asset.updatedAt,
  };
}

async function fetchAssetsForGate(): Promise<AssetForGate[]> {
  return prismaCompat.modelAsset.findMany({
    select: {
      id: true,
      approved: true,
      modelUrl: true,
      thumbUrl: true,
      dimsWmm: true,
      dimsDmm: true,
      dimsHmm: true,
      aabbSizeX: true,
      aabbSizeY: true,
      aabbSizeZ: true,
      catalogItems: {
        select: {
          id: true,
          variantsJson: true,
          brandFinishes: {
            select: { id: true },
          },
          finishMappings: {
            select: {
              id: true,
              variantId: true,
              component: true,
              brandFinishId: true,
              needsReview: true,
            },
          },
        },
      },
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getLiveGateEvaluations(): Promise<LiveGateEvaluation[]> {
  const assets = await fetchAssetsForGate();
  return assets.map(evaluateAsset);
}

export async function getRejectedLiveGateAssets(): Promise<LiveGateEvaluation[]> {
  const evaluations = await getLiveGateEvaluations();
  return evaluations.filter((entry) => !entry.eligible);
}

export async function getLiveCatalogAssetIds(): Promise<string[]> {
  const evaluations = await getLiveGateEvaluations();
  return evaluations.filter((entry) => entry.eligible).map((entry) => entry.id);
}

export async function getLiveCatalogItemIds(): Promise<string[]> {
  const liveAssetIds = await getLiveCatalogAssetIds();
  if (liveAssetIds.length === 0) return [];

  const items = await prismaCompat.catalogItem.findMany({
    where: { assetId: { in: liveAssetIds } },
    select: { id: true },
  });

  return items.map((item) => item.id);
}
