import type {
  MillworkAssetManifest,
  MillworkAssetType,
  MillworkDefinition,
  MillworkPlacementTransform,
} from "./types";

type VersionedSource = {
  id?: string;
  version?: number;
};

function isDurableGeneratedOutputUrl(url?: string): boolean {
  return Boolean(url && !url.startsWith("blob:"));
}

export function buildMillworkAssetManifest<TSource extends VersionedSource>({
  assetId,
  assetType,
  millworkDefinition,
  sourceDefinition = millworkDefinition.sourceDefinition,
  roomId,
  transform,
  glbAssetUrl,
  createdAt,
  updatedAt,
}: {
  assetId: string;
  assetType: MillworkAssetType;
  millworkDefinition: MillworkDefinition<TSource>;
  sourceDefinition?: TSource;
  roomId?: string;
  transform: MillworkPlacementTransform;
  glbAssetUrl?: string;
  createdAt: string;
  updatedAt: string;
}): MillworkAssetManifest {
  return {
    schema: "custom_millwork.asset_manifest.v1",
    version: 1,
    assetType,
    assetId,
    family: millworkDefinition.family,
    assemblyType: millworkDefinition.assemblyType,
    sourceType: millworkDefinition.sourceType,
    sourceDefinitionId: sourceDefinition?.id ?? millworkDefinition.id,
    sourceDefinitionVersion:
      typeof sourceDefinition?.version === "number"
        ? sourceDefinition.version
        : millworkDefinition.version,
    millworkDefinitionId: millworkDefinition.id,
    millworkDefinitionVersion: millworkDefinition.version,
    roomId,
    transform,
    generatedOutput: {
      kind: "glb",
      url: glbAssetUrl,
      durable: isDurableGeneratedOutputUrl(glbAssetUrl),
    },
    createdAt,
    updatedAt,
  };
}
