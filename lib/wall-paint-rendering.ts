export const WALL_PAINT_COLOR_FIDELITY_MIN_FILL_INTENSITY = 0.35;
export const WALL_PAINT_COLOR_FIDELITY_MAX_FILL_INTENSITY = 0.8;
const WALL_PAINT_COLOR_FIDELITY_LUMINANCE_SCALE = 0.55;
const WALL_PAINT_COLOR_FIDELITY_LUMINANCE_EXPONENT = 1.25;

// PBR lighting plus ACES can make a catalog swatch read far darker when its
// wall faces away from the key light. Add color-proportional indirect fill:
// pale paints need more compensation, while darker paints retain contrast.
// The cap leaves the diffuse response visible so perpendicular walls still
// have the slight shade difference needed to read their form.
function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function getWallPaintColorFidelityFillIntensity(
  paintColorHex: string
): number {
  const match = /^#([0-9a-f]{6})$/i.exec(paintColorHex.trim());
  if (!match) return 0.5;
  const value = match[1]!;
  const red = srgbChannelToLinear(
    Number.parseInt(value.slice(0, 2), 16)
  );
  const green = srgbChannelToLinear(
    Number.parseInt(value.slice(2, 4), 16)
  );
  const blue = srgbChannelToLinear(
    Number.parseInt(value.slice(4, 6), 16)
  );
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const calibrated =
    WALL_PAINT_COLOR_FIDELITY_MIN_FILL_INTENSITY +
    WALL_PAINT_COLOR_FIDELITY_LUMINANCE_SCALE *
      luminance ** WALL_PAINT_COLOR_FIDELITY_LUMINANCE_EXPONENT;
  return Math.min(
    WALL_PAINT_COLOR_FIDELITY_MAX_FILL_INTENSITY,
    calibrated
  );
}

export function resolveWallSurfaceColorFillIntensity({
  hasTexture,
  paintColorHex,
  neutralFillIntensity,
}: {
  hasTexture: boolean;
  paintColorHex: string | null | undefined;
  neutralFillIntensity: number;
}): number {
  if (hasTexture) return 0;
  if (paintColorHex) {
    return getWallPaintColorFidelityFillIntensity(paintColorHex);
  }
  return neutralFillIntensity;
}
