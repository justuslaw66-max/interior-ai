import type { WallBackingState } from "@/components/editor/design-page/WallPanelBackingControls";
import type { SurfaceGroutState } from "@/components/editor/design-page/SurfacePatternControls";
import { getSurfaceJointLabel } from "@/lib/design-page-surface-inspector";
import {
  getLaminateWallPanelJointMm,
  getWallPanelBacking,
  getWallPanelBuildUpMm,
  LAMINATE_SHEET_THICKNESS_MM,
  LAMINATE_WALL_PANEL_MIN_JOINT_MM,
} from "@/lib/laminate-wall-backing";
import type { SurfaceMaterialRenderInfo } from "@/lib/surface-material-runtime";
import { normalizeFloorJointColor, type NormalizedSurfaceSettings } from "@/lib/surface-settings";

/**
 * The selected wall finish's joints and, for a laminate sheet, its board, as the surface inspector shows them
 * (components/editor/design-page/SelectedSurfaceInspector.tsx). Kept out of useDesignPageSurfaceInspector.ts, which is over
 * its size limit.
 */

type WallFinishInput = {
  material: SurfaceMaterialRenderInfo | null;
  settings: NormalizedSurfaceSettings;
  disabled: boolean;
};

function isLaminateSheet(material: SurfaceMaterialRenderInfo | null): boolean {
  return Boolean(material?.suitability?.laminate_sheet);
}

/** The grout sizes and colours the inspector offers (FLOOR_GROUT_SIZE_PRESETS_MM and FLOOR_GROUT_COLOR_PALETTE). */
export type WallJointPresets = { sizesMm: readonly number[]; colours: readonly string[] };

/**
 * Tile grout or a wall panel's joints: size and colour. A laminate sheet's joint is at least Greenlam's 3 mm (J, 28 Oct
 * 2026: "3 mm minimum"), so it offers 3 mm and up, and a thinner joint saved before reads as 3 mm.
 */
export function buildWallJointControls({
  material,
  settings,
  disabled,
  paletteOpen,
  presets,
}: WallFinishInput & { paletteOpen: boolean; presets: WallJointPresets }): SurfaceGroutState {
  const laminate = isLaminateSheet(material);
  const jointSizeMm = laminate ? getLaminateWallPanelJointMm(settings.jointSizeMm) : settings.jointSizeMm;
  const sizes = laminate ? presets.sizesMm.filter((sizeMm) => sizeMm >= LAMINATE_WALL_PANEL_MIN_JOINT_MM) : presets.sizesMm;
  return {
    label: getSurfaceJointLabel(material),
    groutSizes: sizes.map((sizeMm) => {
      const selected = jointSizeMm === sizeMm;
      return {
        valueMm: sizeMm,
        selected,
        testId: selected ? "wall-surface-joint-size" : `wall-surface-joint-size-${String(sizeMm).replace(".", "-")}`,
      };
    }),
    groutColor: settings.jointColor,
    groutPaletteOpen: paletteOpen,
    groutColors: presets.colours.map((color) => {
      const normalizedColor = normalizeFloorJointColor(color);
      return {
        key: color,
        color: normalizedColor,
        selected: normalizedColor.toLowerCase() === settings.jointColor.toLowerCase(),
        testId: `wall-surface-grout-color-${color.replace("#", "")}`,
      };
    }),
    disabled,
  };
}

/** A laminate sheet's board and fixing, and how far the panel stands off the wall; null for any other finish. */
export function buildWallBackingControls({ material, settings, disabled }: WallFinishInput): WallBackingState | null {
  if (!material || !isLaminateSheet(material)) return null;
  const backing = getWallPanelBacking(settings);
  return { backing, buildUpMm: Math.round(getWallPanelBuildUpMm(LAMINATE_SHEET_THICKNESS_MM, backing)), disabled };
}
