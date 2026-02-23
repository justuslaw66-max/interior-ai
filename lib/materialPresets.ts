/**
 * Material and finish presets for furniture
 * Each preset defines visual properties: color, roughness, metalness
 */

export type StyleTone = "warm" | "neutral" | "cool";

export interface MaterialPreset {
  id: string;
  label: string;
  color: string;
  roughness: number; // 0-1, higher = more matte
  metalness: number; // 0-1, higher = more reflective
  styleTone?: StyleTone; // What tone this preset fits best
}

/**
 * Material presets organized by furniture category
 */
export const MATERIAL_PRESETS: Record<string, MaterialPreset[]> = {
  sofa: [
    {
      id: "fabric_warm",
      label: "Fabric (Warm)",
      color: "#8a786a",
      roughness: 0.85,
      metalness: 0.0,
      styleTone: "warm",
    },
    {
      id: "fabric_neutral",
      label: "Fabric (Neutral)",
      color: "#7a7a7a",
      roughness: 0.85,
      metalness: 0.0,
      styleTone: "neutral",
    },
    {
      id: "fabric_cool",
      label: "Fabric (Cool)",
      color: "#6a7a8a",
      roughness: 0.85,
      metalness: 0.0,
      styleTone: "cool",
    },
    {
      id: "leather_brown",
      label: "Leather (Brown)",
      color: "#5c3b2e",
      roughness: 0.55,
      metalness: 0.05,
      styleTone: "warm",
    },
    {
      id: "leather_charcoal",
      label: "Leather (Charcoal)",
      color: "#3a3a42",
      roughness: 0.52,
      metalness: 0.05,
      styleTone: "neutral",
    },
  ],

  coffee_table: [
    {
      id: "oak_light",
      label: "Oak (Light)",
      color: "#b79a72",
      roughness: 0.75,
      metalness: 0.0,
      styleTone: "warm",
    },
    {
      id: "walnut_dark",
      label: "Walnut (Dark)",
      color: "#5b3a2a",
      roughness: 0.72,
      metalness: 0.0,
      styleTone: "warm",
    },
    {
      id: "ash_grey",
      label: "Ash (Grey)",
      color: "#8a8a8a",
      roughness: 0.73,
      metalness: 0.0,
      styleTone: "neutral",
    },
    {
      id: "matte_black_metal",
      label: "Metal (Matte Black)",
      color: "#1f1f1f",
      roughness: 0.35,
      metalness: 0.85,
      styleTone: "cool",
    },
    {
      id: "marble_white",
      label: "Marble (White)",
      color: "#f0f0f0",
      roughness: 0.4,
      metalness: 0.0,
      styleTone: "neutral",
    },
  ],

  accent_chair: [
    {
      id: "fabric_warm",
      label: "Fabric (Warm)",
      color: "#8a786a",
      roughness: 0.85,
      metalness: 0.0,
      styleTone: "warm",
    },
    {
      id: "fabric_neutral",
      label: "Fabric (Neutral)",
      color: "#7a7a7a",
      roughness: 0.85,
      metalness: 0.0,
      styleTone: "neutral",
    },
    {
      id: "leather_tan",
      label: "Leather (Tan)",
      color: "#9d7e5c",
      roughness: 0.55,
      metalness: 0.05,
      styleTone: "warm",
    },
  ],

  floor_lamp: [
    {
      id: "brass",
      label: "Brass",
      color: "#b08d57",
      roughness: 0.25,
      metalness: 0.95,
      styleTone: "warm",
    },
    {
      id: "matte_black",
      label: "Matte Black",
      color: "#1a1a1a",
      roughness: 0.6,
      metalness: 0.3,
      styleTone: "neutral",
    },
    {
      id: "brushed_nickel",
      label: "Brushed Nickel",
      color: "#c0c0c0",
      roughness: 0.3,
      metalness: 0.9,
      styleTone: "cool",
    },
    {
      id: "copper",
      label: "Copper",
      color: "#d4764d",
      roughness: 0.22,
      metalness: 0.92,
      styleTone: "warm",
    },
  ],

  tv_console: [
    {
      id: "walnut",
      label: "Walnut",
      color: "#5b3a2a",
      roughness: 0.72,
      metalness: 0.0,
      styleTone: "warm",
    },
    {
      id: "white_oak",
      label: "White Oak",
      color: "#d4c5b9",
      roughness: 0.75,
      metalness: 0.0,
      styleTone: "neutral",
    },
    {
      id: "black_lacquer",
      label: "Black Lacquer",
      color: "#0f0f0f",
      roughness: 0.15,
      metalness: 0.1,
      styleTone: "cool",
    },
  ],

  rug: [
    {
      id: "wool_warm",
      label: "Wool (Warm)",
      color: "#9d7e5c",
      roughness: 0.92,
      metalness: 0.0,
      styleTone: "warm",
    },
    {
      id: "wool_neutral",
      label: "Wool (Neutral)",
      color: "#8a8a8a",
      roughness: 0.92,
      metalness: 0.0,
      styleTone: "neutral",
    },
    {
      id: "wool_grey",
      label: "Wool (Grey Blue)",
      color: "#7a8a9a",
      roughness: 0.92,
      metalness: 0.0,
      styleTone: "cool",
    },
    {
      id: "cotton_cream",
      label: "Cotton (Cream)",
      color: "#f5ede2",
      roughness: 0.88,
      metalness: 0.0,
      styleTone: "warm",
    },
  ],
};

/**
 * Get material presets for a product category
 */
export function getPresetsForCategory(category: string): MaterialPreset[] {
  return MATERIAL_PRESETS[category] || [];
}

/**
 * Get a specific preset by ID and category
 */
export function getPresetById(category: string, presetId: string): MaterialPreset | null {
  const presets = MATERIAL_PRESETS[category];
  if (!presets) return null;
  return presets.find((p) => p.id === presetId) || null;
}

/**
 * Get default preset for a category (first one)
 */
export function getDefaultPreset(category: string): MaterialPreset | null {
  const presets = MATERIAL_PRESETS[category];
  return presets && presets.length > 0 ? presets[0] : null;
}

/**
 * Get presets filtered by style tone
 */
export function getPresetsByTone(category: string, tone: StyleTone): MaterialPreset[] {
  const presets = MATERIAL_PRESETS[category] || [];
  return presets.filter((p) => p.styleTone === tone || !p.styleTone);
}

/**
 * Get best preset for a tone in category
 * Prefers exact tone match, falls back to first available
 */
export function getBestPresetForTone(category: string, tone: StyleTone): MaterialPreset | null {
  const presets = MATERIAL_PRESETS[category];
  if (!presets || presets.length === 0) return null;

  // Try to find exact tone match
  const tonedPreset = presets.find((p) => p.styleTone === tone);
  if (tonedPreset) return tonedPreset;

  // Fall back to first preset
  return presets[0];
}
