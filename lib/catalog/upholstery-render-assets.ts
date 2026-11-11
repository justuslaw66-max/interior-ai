/**
 * A fabric option's render_assets, as the client variant carries them.
 *
 * tile_scale.x / .y are a fixed texture repeat (the older libraries). A fabric
 * that gives tile_scale.size_m, the metres of cloth one tile covers, has its
 * repeat worked out per model by the renderer and also brings its own colour
 * photo; see docs/architecture/upholstery-fabric-standard.md.
 */
export type UpholsteryRenderAssetsInput = {
  base_color_map?: string;
  normal_map?: string;
  tile_scale?: { x?: number; y?: number; size_m?: number };
};

export type VariantRenderAssets = {
  baseColorMap?: string;
  normalMap?: string;
  roughnessMap?: string;
  tileScale?: { x?: number; y?: number; sizeM?: number };
};

const MIN_TILE_SIZE_M = 0.005;
const MAX_TILE_SIZE_M = 1;

function clampRepeat(value: number | undefined): number {
  return Math.max(0.75, Math.min(4, value ?? 1));
}

function physicalTileSize(value: unknown): number | undefined {
  const size = Number(value);
  return Number.isFinite(size) && size >= MIN_TILE_SIZE_M && size <= MAX_TILE_SIZE_M
    ? size
    : undefined;
}

function textureUrl(value: unknown): string | undefined {
  const url = String(value ?? "").trim();
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return /^https?:\/\//i.test(url) ? url : undefined;
}

export function toVariantRenderAssets(
  assets: UpholsteryRenderAssetsInput | undefined
): VariantRenderAssets | undefined {
  if (!assets) return undefined;
  const sizeM = physicalTileSize(assets.tile_scale?.size_m);
  return {
    baseColorMap: sizeM ? textureUrl(assets.base_color_map) : undefined,
    normalMap: assets.normal_map,
    roughnessMap: undefined,
    tileScale: assets.tile_scale
      ? {
          x: clampRepeat(assets.tile_scale.x),
          y: clampRepeat(assets.tile_scale.y),
          ...(sizeM ? { sizeM } : {}),
        }
      : undefined,
  };
}
