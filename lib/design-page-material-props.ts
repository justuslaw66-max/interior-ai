import { getDefaultPreset, getPresetById } from "@/lib/materialPresets";
import type { ProductCategory } from "@/lib/catalog-schema";
import type { DesignItem } from "@/lib/room-types";

export type MaterialProps = {
  color: string;
  roughness: number;
  metalness: number;
};

type ResolveMaterialPropsInput = {
  category: ProductCategory;
  materialPreset?: string;
  materialOverrides?: DesignItem["materialOverrides"];
  variantColor: string;
};

export function resolveMaterialProps({
  category,
  materialPreset,
  materialOverrides,
  variantColor,
}: ResolveMaterialPropsInput): MaterialProps {
  let preset = materialPreset ? getPresetById(category, materialPreset) : null;

  if (!preset) {
    preset = getDefaultPreset(category);
  }

  if (!preset) {
    return {
      color: variantColor,
      roughness: 0.8,
      metalness: 0.05,
    };
  }

  const color = materialOverrides?.colorHex || variantColor || preset.color;
  const roughness = materialOverrides?.roughness !== undefined ? materialOverrides.roughness : preset.roughness;
  const metalness = materialOverrides?.metalness !== undefined ? materialOverrides.metalness : preset.metalness;

  return { color, roughness, metalness };
}