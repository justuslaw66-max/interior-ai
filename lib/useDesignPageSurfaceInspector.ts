"use client";

import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import type {
  SelectedSurfaceInspectorActions,
  SelectedSurfaceInspectorState,
} from "@/components/editor/design-page/SelectedSurfaceInspector";
import {
  DEFAULT_FLOOR_MATERIAL_ID,
  DEFAULT_FLOOR_PATTERN_SCALE,
  clampFloorPatternScale,
  getFloorMaterialById,
  normalizeFloorRotationDeg,
} from "@/lib/floor-materials";
import {
  SURFACE_MATERIAL_RENDER_REGISTRY,
  getRuntimeSurfaceMaterialById,
  getSurfaceMaterialTextureSource,
} from "@/lib/surface-material-runtime";
import {
  DEFAULT_FLOOR_JOINT_COLOR,
  DEFAULT_FLOOR_JOINT_SIZE_MM,
  DEFAULT_FLOOR_PATTERN_OFFSET,
  FLOOR_ROTATION_PRESETS_DEG,
  getCeilingSurfaceSettings,
  getWallFaceLabel,
  getWallFaceSurfaceSettings,
  normalizeFloorJointColor,
  normalizeFloorJointSizeMm,
  normalizeFloorPattern,
  normalizeFloorSurfaceSettings,
} from "@/lib/surface-settings";
import {
  formatFlooringInspectorValue,
  getFlooringInspectorMaterialGroup,
  getFlooringInspectorPatternOptions,
  getFlooringInspectorProductName,
  getFlooringInspectorSizeLabel,
  getFlooringInspectorSurfaceSwatchStyle,
} from "@/lib/design-page-surface-inspector";
import {
  FLOOR_GROUT_COLOR_PALETTE,
  FLOOR_GROUT_SIZE_PRESETS_MM,
} from "@/lib/design-page-floor-plan-utils";
import { ROOM_DIMENSION_DEFAULTS, type HousePlan2D } from "@/lib/design-page-house-plan";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import type { DesignPageSurfaceActions } from "@/lib/useDesignPageSurfaceActions";
import type {
  SelectedWallSurfaceTarget,
  SurfaceTargetMode,
} from "@/lib/useDesignPageSurfaceActions";
import type { RoomFloorPattern, RoomSnapshot } from "@/lib/room-types";
import { getWallPaintDisplayName } from "@/lib/wall-paint";
import { formatCabinetMeasurement } from "@/features/cabinetry/measurementUnits";

type InspectorRoom = HousePlan2D["rooms"][number];

export type DesignPageSurfaceInspectorContext = {
  floorInspectorRoom: RoomSnapshot | null;
  floorInspectorSurfaces:
    | RoomSnapshot["surfaces"]
    | RoomSnapshot["surfaceFinishes"];
  floorInspectorMaterialId: string;
  floorInspectorSettings: ReturnType<typeof normalizeFloorSurfaceSettings>;
  floorInspectorRotationDeg: number;
  floorInspectorScale: number;
  floorInspectorPatternOptions: ReturnType<typeof getFlooringInspectorPatternOptions>;
  floorInspectorPatternValue: RoomFloorPattern;
  floorInspectorSwatchStyle: CSSProperties;
  wallInspectorFaceId: string | null;
  wallInspectorDefaultHeight: number;
  wallInspectorHeight: number;
  wallInspectorHasHeightOverride: boolean;
  wallInspectorSettings: ReturnType<typeof getWallFaceSurfaceSettings>;
  surfaceInspectorIsWall: boolean;
  surfaceInspectorIsCeiling: boolean;
  ceilingInspectorSettings: ReturnType<typeof getCeilingSurfaceSettings>;
  surfaceInspectorMaterialId: string;
  surfaceInspectorDisplayName: string;
  surfaceInspectorMaterialFamily: string;
  surfaceInspectorSupplier: string;
  surfaceInspectorPublishStatus: string;
  surfaceInspectorBlockers: string[];
  surfaceInspectorSurfaceMaterials: typeof SURFACE_MATERIAL_RENDER_REGISTRY;
  surfaceInspectorMaterialGroup: ReturnType<typeof getFlooringInspectorMaterialGroup>;
  surfaceInspectorSizeLabel: string | null;
  surfaceInspectorSwatchStyle: CSSProperties;
  materialPickerOpen: boolean;
  groutPaletteOpen: boolean;
};

export type DesignPageSurfaceInspectorUiActions = {
  closeMaterialPicker: () => void;
  toggleGroutPalette: () => void;
  closeGroutPalette: () => void;
};

type UseDesignPageSurfaceInspectorContextInput = {
  state: {
    inspectorRoom: RoomSnapshot | null;
    activeSurfaceTarget: SurfaceTargetMode;
    selectedWallSurfaceTarget: SelectedWallSurfaceTarget | null;
  };
  configuration: {
    isClientPreview: boolean;
    isDesigner: boolean;
  };
};

export function useDesignPageSurfaceInspectorContext({
  state,
  configuration,
}: UseDesignPageSurfaceInspectorContextInput): {
  context: DesignPageSurfaceInspectorContext;
  actions: DesignPageSurfaceInspectorUiActions;
} {
  const { inspectorRoom, activeSurfaceTarget, selectedWallSurfaceTarget } = state;
  const { isClientPreview, isDesigner } = configuration;
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [groutPaletteOpen, setGroutPaletteOpen] = useState(false);

  const floorInspectorSurfaces =
    inspectorRoom?.surfaces ?? inspectorRoom?.surfaceFinishes;
  const floorInspectorMaterialId =
    floorInspectorSurfaces?.floorMaterialId ?? DEFAULT_FLOOR_MATERIAL_ID;
  const floorInspectorSettings = normalizeFloorSurfaceSettings(
    floorInspectorSurfaces,
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  const floorInspectorRotationDeg = floorInspectorSettings.floorRotationDeg;
  const floorInspectorScale = floorInspectorSettings.floorScale;
  const floorInspectorSurfaceMaterial = getRuntimeSurfaceMaterialById(
    floorInspectorMaterialId
  );
  const floorInspectorStarterMaterial = getFloorMaterialById(
    floorInspectorMaterialId
  );
  const floorInspectorDisplayName =
    (floorInspectorSurfaceMaterial
      ? getFlooringInspectorProductName(floorInspectorSurfaceMaterial)
      : null) ?? floorInspectorStarterMaterial.name;
  const floorInspectorTextureSource = getSurfaceMaterialTextureSource(
    floorInspectorSurfaceMaterial
  );
  const floorInspectorMaterialFamily = floorInspectorSurfaceMaterial
    ? formatFlooringInspectorValue(
        floorInspectorSurfaceMaterial.surface_material.material_family
      )
    : formatFlooringInspectorValue(floorInspectorStarterMaterial.category);
  const floorInspectorSupplier = floorInspectorSurfaceMaterial
    ? floorInspectorSurfaceMaterial.surface_material.brand ??
      formatFlooringInspectorValue(
        floorInspectorSurfaceMaterial.surface_material.supplier
      )
    : "Starter finish";
  const floorInspectorPublishStatus =
    floorInspectorSurfaceMaterial?.import_governance.publish_status ?? "starter";
  const floorInspectorBlockers =
    floorInspectorSurfaceMaterial?.import_governance.publish_blockers ?? [];
  const surfaceMaterialDraftsVisible =
    !isClientPreview &&
    (isDesigner || process.env.NODE_ENV !== "production");
  const floorInspectorPatternOptions = useMemo(
    () => getFlooringInspectorPatternOptions(floorInspectorSurfaceMaterial),
    [floorInspectorSurfaceMaterial]
  );
  const floorInspectorPatternOptionIds = useMemo(
    () => new Set(floorInspectorPatternOptions.map((option) => option.id)),
    [floorInspectorPatternOptions]
  );
  const floorInspectorPatternValue = floorInspectorPatternOptionIds.has(
    floorInspectorSettings.floorPattern
  )
    ? floorInspectorSettings.floorPattern
    : floorInspectorPatternOptions[0]?.id ?? "straight";
  const floorInspectorSwatchStyle = useMemo<CSSProperties>(() => {
    if (floorInspectorTextureSource) {
      return {
        backgroundColor: "#e8e2d6",
        backgroundImage: `url("${floorInspectorTextureSource.url}")`,
        backgroundPosition: "center",
        backgroundSize:
          floorInspectorTextureSource.kind === "swatch" ? "cover" : "48px 48px",
      };
    }

    if (floorInspectorStarterMaterial.pattern === "tile_grid") {
      return {
        backgroundColor: floorInspectorStarterMaterial.swatchColor,
        backgroundImage: [
          `repeating-linear-gradient(0deg, transparent 0 10px, ${floorInspectorStarterMaterial.lineColor}66 10px 11px)`,
          `repeating-linear-gradient(90deg, transparent 0 10px, ${floorInspectorStarterMaterial.lineColor}66 10px 11px)`,
          `linear-gradient(135deg, ${floorInspectorStarterMaterial.swatchColor}, ${floorInspectorStarterMaterial.accentColor})`,
        ].join(", "),
      };
    }

    if (floorInspectorStarterMaterial.pattern === "soft_fleck") {
      return {
        backgroundColor: floorInspectorStarterMaterial.swatchColor,
        backgroundImage: [
          `radial-gradient(circle at 24% 28%, ${floorInspectorStarterMaterial.lineColor}80 0 1px, transparent 2px)`,
          `radial-gradient(circle at 68% 58%, ${floorInspectorStarterMaterial.accentColor}70 0 1px, transparent 2px)`,
          `linear-gradient(135deg, ${floorInspectorStarterMaterial.swatchColor}, ${floorInspectorStarterMaterial.accentColor})`,
        ].join(", "),
      };
    }

    return {
      backgroundColor: floorInspectorStarterMaterial.swatchColor,
      backgroundImage: [
        `repeating-linear-gradient(0deg, transparent 0 8px, ${floorInspectorStarterMaterial.lineColor}66 8px 9px)`,
        `linear-gradient(135deg, ${floorInspectorStarterMaterial.swatchColor}, ${floorInspectorStarterMaterial.accentColor})`,
      ].join(", "),
    };
  }, [floorInspectorStarterMaterial, floorInspectorTextureSource]);
  const wallInspectorFaceId =
    activeSurfaceTarget === "selected_wall" &&
    selectedWallSurfaceTarget &&
    selectedWallSurfaceTarget.roomId === inspectorRoom?.id
      ? selectedWallSurfaceTarget.faceId
      : null;
  const surfaceInspectorIsWall = Boolean(wallInspectorFaceId);
  const surfaceInspectorIsCeiling = activeSurfaceTarget === "ceiling";
  const ceilingInspectorSettings = getCeilingSurfaceSettings(
    floorInspectorSurfaces,
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  const ceilingInspectorColor =
    ceilingInspectorSettings.paintColorHex ??
    floorInspectorSurfaces?.ceilingColor ??
    "#f8f8f6";
  const wallInspectorDefaultHeight =
    inspectorRoom?.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight;
  const wallInspectorHeight = wallInspectorFaceId
    ? inspectorRoom?.geometry.wallHeights?.[wallInspectorFaceId] ??
      wallInspectorDefaultHeight
    : wallInspectorDefaultHeight;
  const wallInspectorHasHeightOverride = Boolean(
    wallInspectorFaceId &&
      inspectorRoom?.geometry.wallHeights &&
      Object.prototype.hasOwnProperty.call(
        inspectorRoom.geometry.wallHeights,
        wallInspectorFaceId
      )
  );
  const wallInspectorSettings = getWallFaceSurfaceSettings(
    floorInspectorSurfaces,
    wallInspectorFaceId,
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  const wallInspectorMaterialId = wallInspectorSettings.materialId ?? null;
  const wallInspectorSurfaceMaterial = wallInspectorMaterialId
    ? getRuntimeSurfaceMaterialById(wallInspectorMaterialId)
    : null;
  const wallInspectorStarterMaterial = wallInspectorMaterialId
    ? getFloorMaterialById(wallInspectorMaterialId)
    : null;
  const surfaceInspectorMaterialId = surfaceInspectorIsWall
    ? wallInspectorMaterialId ?? ""
    : surfaceInspectorIsCeiling
      ? ceilingInspectorSettings.materialId ?? ""
      : floorInspectorMaterialId;
  const surfaceInspectorSurfaceMaterial = surfaceInspectorIsWall
    ? wallInspectorSurfaceMaterial
    : surfaceInspectorIsCeiling
      ? getRuntimeSurfaceMaterialById(ceilingInspectorSettings.materialId)
      : floorInspectorSurfaceMaterial;
  const surfaceInspectorDisplayName = surfaceInspectorIsWall
    ? wallInspectorSurfaceMaterial
      ? getFlooringInspectorProductName(wallInspectorSurfaceMaterial)
      : wallInspectorSettings.paintColorHex
        ? getWallPaintDisplayName(
            wallInspectorSettings.paintColorHex,
            wallInspectorSettings.paintName
          )
        : wallInspectorStarterMaterial?.name ?? "No wall material"
    : surfaceInspectorIsCeiling
      ? surfaceInspectorSurfaceMaterial
        ? getFlooringInspectorProductName(surfaceInspectorSurfaceMaterial)
        : ceilingInspectorSettings.paintColorHex
          ? getWallPaintDisplayName(
              ceilingInspectorSettings.paintColorHex,
              ceilingInspectorSettings.paintName
            )
          : "No ceiling paint"
      : floorInspectorDisplayName;
  const surfaceInspectorTextureSource = surfaceInspectorSurfaceMaterial
    ? getSurfaceMaterialTextureSource(surfaceInspectorSurfaceMaterial)
    : null;
  const surfaceInspectorMaterialFamily = surfaceInspectorSurfaceMaterial
    ? formatFlooringInspectorValue(
        surfaceInspectorSurfaceMaterial.surface_material.material_family
      )
    : surfaceInspectorIsWall
      ? wallInspectorSettings.paintColorHex
        ? "Paint"
        : "Wall finish"
      : surfaceInspectorIsCeiling
        ? "Ceiling paint"
        : floorInspectorMaterialFamily;
  const surfaceInspectorSupplier = surfaceInspectorSurfaceMaterial
    ? surfaceInspectorSurfaceMaterial.surface_material.brand ??
      formatFlooringInspectorValue(
        surfaceInspectorSurfaceMaterial.surface_material.supplier
      )
    : surfaceInspectorIsWall
      ? wallInspectorSettings.paintName
        ? "Paint colour"
        : "No catalog material"
      : surfaceInspectorIsCeiling
        ? ceilingInspectorSettings.paintName
          ? "Paint colour"
          : "No catalog material"
        : floorInspectorSupplier;
  const surfaceInspectorPublishStatus =
    surfaceInspectorSurfaceMaterial?.import_governance.publish_status ??
    (surfaceInspectorIsWall || surfaceInspectorIsCeiling
      ? "custom"
      : floorInspectorPublishStatus);
  const surfaceInspectorBlockers =
    surfaceInspectorSurfaceMaterial?.import_governance.publish_blockers ??
    (surfaceInspectorIsWall || surfaceInspectorIsCeiling
      ? []
      : floorInspectorBlockers);
  const surfaceInspectorSurfaceMaterials = useMemo(
    () =>
      SURFACE_MATERIAL_RENDER_REGISTRY.filter((material) => {
        const category = material.surface_material.surface_category;
        const matchesTarget = surfaceInspectorIsWall
          ? category === "wall_tile" ||
            category === "wallpaper" ||
            category === "wall_panel"
          : surfaceInspectorIsCeiling
            ? category === "paint"
            : category === "flooring";
        const matchesVisibility =
          surfaceMaterialDraftsVisible ||
          material.import_governance.publish_status === "published";
        return matchesTarget && matchesVisibility;
      }).sort((a, b) =>
        a.surface_material.product_name.localeCompare(
          b.surface_material.product_name
        )
      ),
    [surfaceInspectorIsCeiling, surfaceInspectorIsWall, surfaceMaterialDraftsVisible]
  );
  const surfaceInspectorMaterialGroup = useMemo(
    () =>
      getFlooringInspectorMaterialGroup(
        surfaceInspectorSurfaceMaterials,
        surfaceInspectorSurfaceMaterial
      ),
    [surfaceInspectorSurfaceMaterial, surfaceInspectorSurfaceMaterials]
  );
  const surfaceInspectorSizeLabel = surfaceInspectorSurfaceMaterial
    ? getFlooringInspectorSizeLabel(surfaceInspectorSurfaceMaterial)
    : null;
  const surfaceInspectorSwatchStyle = useMemo<CSSProperties>(() => {
    if (surfaceInspectorTextureSource) {
      return {
        backgroundColor: "#e8e2d6",
        backgroundImage: `url("${surfaceInspectorTextureSource.url}")`,
        backgroundPosition: "center",
        backgroundSize:
          surfaceInspectorTextureSource.kind === "swatch" ? "cover" : "48px 48px",
      };
    }
    if (surfaceInspectorIsWall) {
      return {
        backgroundColor: wallInspectorSettings.paintColorHex ?? "#d8d8d4",
        backgroundImage: wallInspectorSettings.paintColorHex
          ? "none"
          : "linear-gradient(135deg, #f3f2ee, #c9cac5)",
      };
    }
    if (surfaceInspectorIsCeiling) {
      return { backgroundColor: ceilingInspectorColor, backgroundImage: "none" };
    }
    return floorInspectorSwatchStyle;
  }, [
    ceilingInspectorColor,
    floorInspectorSwatchStyle,
    surfaceInspectorIsCeiling,
    surfaceInspectorIsWall,
    surfaceInspectorTextureSource,
    wallInspectorSettings.paintColorHex,
  ]);

  const closeMaterialPicker = useCallback(() => setMaterialPickerOpen(false), []);
  const toggleGroutPalette = useCallback(
    () => setGroutPaletteOpen((open) => !open),
    []
  );
  const closeGroutPalette = useCallback(() => setGroutPaletteOpen(false), []);
  const uiActions = useMemo(
    () => ({ closeMaterialPicker, toggleGroutPalette, closeGroutPalette }),
    [closeGroutPalette, closeMaterialPicker, toggleGroutPalette]
  );

  return {
    context: {
      floorInspectorRoom: inspectorRoom,
      floorInspectorSurfaces,
      floorInspectorMaterialId,
      floorInspectorSettings,
      floorInspectorRotationDeg,
      floorInspectorScale,
      floorInspectorPatternOptions,
      floorInspectorPatternValue,
      floorInspectorSwatchStyle,
      wallInspectorFaceId,
      wallInspectorDefaultHeight,
      wallInspectorHeight,
      wallInspectorHasHeightOverride,
      wallInspectorSettings,
      surfaceInspectorIsWall,
      surfaceInspectorIsCeiling,
      ceilingInspectorSettings,
      surfaceInspectorMaterialId,
      surfaceInspectorDisplayName,
      surfaceInspectorMaterialFamily,
      surfaceInspectorSupplier,
      surfaceInspectorPublishStatus,
      surfaceInspectorBlockers,
      surfaceInspectorSurfaceMaterials,
      surfaceInspectorMaterialGroup,
      surfaceInspectorSizeLabel,
      surfaceInspectorSwatchStyle,
      materialPickerOpen,
      groutPaletteOpen,
    },
    actions: uiActions,
  };
}

type UseDesignPageSurfaceInspectorInput = {
  state: {
    context: DesignPageSurfaceInspectorContext;
    selectedPlanRoom: InspectorRoom | null;
    hasSelectedItem: boolean;
    hasVisiblePlanOpening: boolean;
    hasSelectedPlanFixedElement: boolean;
    hasSelectedPlanAnnotation: boolean;
    planMeasurementUnit: PlanMeasurementUnit;
  };
  configuration: {
    canEdit: boolean;
    canEditPlanGeometry: boolean;
    isDesigner: boolean;
  };
  actions: {
    surface: DesignPageSurfaceActions;
    inspectorUi: DesignPageSurfaceInspectorUiActions;
    changeSelectedWallHeight: (
      roomId: string,
      faceId: string,
      heightMeters: number
    ) => void;
    resetSelectedWallHeight: (roomId: string, faceId: string) => void;
    openFloorEditorForRoom: (roomId: string) => void;
    openWallMaterialEditorForRoom: (roomId: string, faceId: string) => void;
    openCeilingEditorForRoom: (roomId: string) => void;
  };
};

export function useDesignPageSurfaceInspector({
  state,
  configuration,
  actions,
}: UseDesignPageSurfaceInspectorInput): {
  state: SelectedSurfaceInspectorState | null;
  actions: SelectedSurfaceInspectorActions;
} {
  const {
    context,
    selectedPlanRoom,
    hasSelectedItem,
    hasVisiblePlanOpening,
    hasSelectedPlanFixedElement,
    hasSelectedPlanAnnotation,
    planMeasurementUnit,
  } = state;
  const { canEdit, canEditPlanGeometry, isDesigner } = configuration;
  const {
    surface,
    inspectorUi,
    changeSelectedWallHeight,
    resetSelectedWallHeight,
    openFloorEditorForRoom,
    openWallMaterialEditorForRoom,
    openCeilingEditorForRoom,
  } = actions;
  const {
    floorInspectorMaterialId,
    floorInspectorSettings,
    floorInspectorRotationDeg,
    floorInspectorScale,
    floorInspectorPatternOptions,
    floorInspectorPatternValue,
    wallInspectorFaceId,
    wallInspectorDefaultHeight,
    wallInspectorHeight,
    wallInspectorHasHeightOverride,
    wallInspectorSettings,
    surfaceInspectorIsWall,
    surfaceInspectorIsCeiling,
    ceilingInspectorSettings,
    surfaceInspectorMaterialId,
    surfaceInspectorDisplayName,
    surfaceInspectorMaterialFamily,
    surfaceInspectorSupplier,
    surfaceInspectorPublishStatus,
    surfaceInspectorBlockers,
    surfaceInspectorSurfaceMaterials,
    surfaceInspectorMaterialGroup,
    surfaceInspectorSizeLabel,
    surfaceInspectorSwatchStyle,
    materialPickerOpen,
    groutPaletteOpen,
  } = context;

  const onCommitWallHeight = useCallback(
    (valueMm: number) => {
      if (!selectedPlanRoom || !wallInspectorFaceId) return;
      changeSelectedWallHeight(
        selectedPlanRoom.id,
        wallInspectorFaceId,
        valueMm / 1000
      );
    },
    [changeSelectedWallHeight, selectedPlanRoom, wallInspectorFaceId]
  );
  const onResetWallHeight = useCallback(() => {
    if (!selectedPlanRoom || !wallInspectorFaceId) return;
    resetSelectedWallHeight(selectedPlanRoom.id, wallInspectorFaceId);
  }, [resetSelectedWallHeight, selectedPlanRoom, wallInspectorFaceId]);
  const onSelectSize = useCallback(
    (materialId: string) => {
      if (!selectedPlanRoom) return;
      if (surfaceInspectorIsWall) {
        surface.applyWallMaterialToRoom(
          materialId,
          selectedPlanRoom.id,
          wallInspectorFaceId
        );
        return;
      }
      surface.applyFloorSizeVariantToRoom(materialId, selectedPlanRoom.id);
    },
    [selectedPlanRoom, surface, surfaceInspectorIsWall, wallInspectorFaceId]
  );
  const onChangeMaterial = useCallback(() => {
    if (!selectedPlanRoom) return;
    if (surfaceInspectorIsCeiling) {
      openCeilingEditorForRoom(selectedPlanRoom.id);
      return;
    }
    if (surfaceInspectorIsWall && wallInspectorFaceId) {
      openWallMaterialEditorForRoom(selectedPlanRoom.id, wallInspectorFaceId);
      return;
    }
    openFloorEditorForRoom(selectedPlanRoom.id);
  }, [
    openCeilingEditorForRoom,
    openFloorEditorForRoom,
    openWallMaterialEditorForRoom,
    selectedPlanRoom,
    surfaceInspectorIsCeiling,
    surfaceInspectorIsWall,
    wallInspectorFaceId,
  ]);
  const onRotate = useCallback(() => {
    if (!selectedPlanRoom) return;
    if (surfaceInspectorIsWall) {
      surface.changeActiveWallSurfaceSettings(
        {
          rotationDeg: normalizeFloorRotationDeg(
            wallInspectorSettings.rotationDeg + 90
          ),
        },
        selectedPlanRoom.id,
        wallInspectorFaceId
      );
      return;
    }
    surface.rotateActiveFloorMaterial(selectedPlanRoom.id);
  }, [
    selectedPlanRoom,
    surface,
    surfaceInspectorIsWall,
    wallInspectorFaceId,
    wallInspectorSettings.rotationDeg,
  ]);
  const onReset = useCallback(() => {
    if (!selectedPlanRoom) return;
    if (surfaceInspectorIsCeiling) {
      surface.resetActiveCeilingSurface(selectedPlanRoom.id);
      return;
    }
    if (surfaceInspectorIsWall) {
      surface.resetActiveWallSurface(selectedPlanRoom.id, wallInspectorFaceId);
      return;
    }
    surface.resetActiveFloorMaterialPattern(selectedPlanRoom.id);
  }, [selectedPlanRoom, surface, surfaceInspectorIsCeiling, surfaceInspectorIsWall, wallInspectorFaceId]);
  const onApplyAll = useCallback(() => {
    if (!selectedPlanRoom) return;
    if (surfaceInspectorIsCeiling) {
      if (!ceilingInspectorSettings.paintColorHex) return;
      surface.applyCeilingPaintToAllRooms(
        ceilingInspectorSettings.paintColorHex,
        ceilingInspectorSettings.paintName
      );
      return;
    }
    if (surfaceInspectorIsWall) {
      if (!surfaceInspectorMaterialId) return;
      surface.applyWallMaterialToAllRooms(surfaceInspectorMaterialId);
      return;
    }
    surface.applyFloorMaterialToAllRooms(floorInspectorMaterialId);
  }, [
    ceilingInspectorSettings.paintColorHex,
    ceilingInspectorSettings.paintName,
    floorInspectorMaterialId,
    selectedPlanRoom,
    surface,
    surfaceInspectorIsCeiling,
    surfaceInspectorIsWall,
    surfaceInspectorMaterialId,
  ]);
  const onSelectPickerMaterial = useCallback(
    (materialId: string) => {
      if (!selectedPlanRoom) return;
      if (surfaceInspectorIsWall) {
        surface.applyWallMaterialToRoom(
          materialId,
          selectedPlanRoom.id,
          wallInspectorFaceId
        );
      } else {
        surface.applyFloorMaterialToRoom(materialId, selectedPlanRoom.id);
      }
      inspectorUi.closeMaterialPicker();
    },
    [inspectorUi, selectedPlanRoom, surface, surfaceInspectorIsWall, wallInspectorFaceId]
  );
  const onSelectPattern = useCallback(
    (pattern: RoomFloorPattern) => {
      if (!selectedPlanRoom) return;
      surface.changeActiveFloorSurfaceSettings(
        { floorPattern: normalizeFloorPattern(pattern) },
        selectedPlanRoom.id
      );
    },
    [selectedPlanRoom, surface]
  );
  const onSelectRotation = useCallback(
    (rotationDeg: number) => {
      if (!selectedPlanRoom) return;
      surface.changeActiveFloorSurfaceSettings(
        { floorRotationDeg: rotationDeg },
        selectedPlanRoom.id
      );
    },
    [selectedPlanRoom, surface]
  );
  const onChangeScale = useCallback(
    (scale: number) => {
      if (!selectedPlanRoom) return;
      surface.changeActiveFloorMaterialScale(
        clampFloorPatternScale(scale || DEFAULT_FLOOR_PATTERN_SCALE),
        selectedPlanRoom.id
      );
    },
    [selectedPlanRoom, surface]
  );
  const onSelectGroutSize = useCallback(
    (sizeMm: number) => {
      if (!selectedPlanRoom) return;
      surface.changeActiveFloorSurfaceSettings(
        { floorJointSizeMm: normalizeFloorJointSizeMm(sizeMm) },
        selectedPlanRoom.id
      );
    },
    [selectedPlanRoom, surface]
  );
  const onSelectGroutColor = useCallback(
    (color: string) => {
      if (!selectedPlanRoom) return;
      surface.changeActiveFloorSurfaceSettings(
        { floorJointColor: color },
        selectedPlanRoom.id
      );
      inspectorUi.closeGroutPalette();
    },
    [inspectorUi, selectedPlanRoom, surface]
  );
  const onMovePattern = useCallback(
    (deltaX: number, deltaY: number) => {
      if (!selectedPlanRoom) return;
      surface.changeActiveFloorSurfaceSettings(
        {
          floorPatternOffset: {
            x: floorInspectorSettings.floorPatternOffset.x + deltaX,
            y: floorInspectorSettings.floorPatternOffset.y + deltaY,
          },
        },
        selectedPlanRoom.id
      );
    },
    [
      floorInspectorSettings.floorPatternOffset.x,
      floorInspectorSettings.floorPatternOffset.y,
      selectedPlanRoom,
      surface,
    ]
  );
  const onResetPattern = useCallback(() => {
    if (!selectedPlanRoom) return;
    surface.changeActiveFloorSurfaceSettings(
      {
        floorPatternOffset: DEFAULT_FLOOR_PATTERN_OFFSET,
        floorJointSizeMm: DEFAULT_FLOOR_JOINT_SIZE_MM,
        floorJointColor: DEFAULT_FLOOR_JOINT_COLOR,
        floorRotationDeg: 0,
        floorScale: DEFAULT_FLOOR_PATTERN_SCALE,
      },
      selectedPlanRoom.id
    );
  }, [selectedPlanRoom, surface]);
  const onResetSurface = useCallback(() => {
    if (!selectedPlanRoom) return;
    surface.resetActiveFloorMaterialPattern(selectedPlanRoom.id);
  }, [selectedPlanRoom, surface]);

  const selectedSurfaceInspectorState: SelectedSurfaceInspectorState | null =
    !selectedPlanRoom ||
    hasSelectedItem ||
    hasVisiblePlanOpening ||
    hasSelectedPlanFixedElement ||
    hasSelectedPlanAnnotation
      ? null
      : (() => {
          const target = surfaceInspectorIsWall
            ? "wall"
            : surfaceInspectorIsCeiling
              ? "ceiling"
              : "floor";
          const wallHeight =
            surfaceInspectorIsWall && wallInspectorFaceId
              ? {
                  label: `${getWallFaceLabel(wallInspectorFaceId)} height`,
                  valueMm: wallInspectorHeight * 1000,
                  unit: planMeasurementUnit,
                  minMm: ROOM_DIMENSION_DEFAULTS.minRoomHeight * 1000,
                  maxMm: ROOM_DIMENSION_DEFAULTS.maxRoomHeight * 1000,
                  stepMm: 10,
                  keyboardStepMm: 50,
                  disabled: !canEditPlanGeometry,
                  resetDisabled:
                    !canEditPlanGeometry || !wallInspectorHasHeightOverride,
                  hint: wallInspectorHasHeightOverride
                    ? `Override; floor default is ${formatCabinetMeasurement(
                        wallInspectorDefaultHeight * 1000,
                        planMeasurementUnit
                      )}.`
                    : "Inherited from the floor wall height.",
                }
              : null;
          const sizeOptions =
            !surfaceInspectorIsCeiling &&
            surfaceInspectorMaterialGroup &&
            surfaceInspectorMaterialGroup.variants.length > 1
              ? surfaceInspectorMaterialGroup.variants.map((variant) => {
                  const materialId = variant.surface_material.material_id;
                  return {
                    materialId,
                    label: getFlooringInspectorSizeLabel(variant),
                    title: variant.surface_material.product_name,
                    selected: materialId === surfaceInspectorMaterialId,
                    disabled: !canEdit,
                  };
                })
              : [];
          const picker =
            materialPickerOpen && !surfaceInspectorIsCeiling
              ? {
                  title: surfaceInspectorIsWall
                    ? "Wall materials"
                    : "Flooring materials",
                  options: surfaceInspectorSurfaceMaterials.map((material) => {
                    const materialId = material.surface_material.material_id;
                    const draft =
                      material.import_governance.publish_status === "draft";
                    return {
                      materialId,
                      name: material.surface_material.product_name,
                      metadata: `${
                        material.surface_material.brand ??
                        formatFlooringInspectorValue(
                          material.surface_material.supplier
                        )
                      } · ${formatFlooringInspectorValue(
                        material.surface_material.material_family
                      )}`,
                      swatchStyle:
                        getFlooringInspectorSurfaceSwatchStyle(material),
                      selected: materialId === surfaceInspectorMaterialId,
                      disabled: !canEdit,
                      showGovernance: isDesigner,
                      draft,
                      publishStatus: formatFlooringInspectorValue(
                        material.import_governance.publish_status
                      ),
                      blockerCount:
                        material.import_governance.publish_blockers.length,
                    };
                  }),
                  emptyMessage: `No published ${
                    surfaceInspectorIsWall ? "wall" : "flooring"
                  } catalog materials are available in this mode.`,
                }
              : null;
          const floorPattern =
            !surfaceInspectorIsWall && !surfaceInspectorIsCeiling
              ? {
                  value: floorInspectorPatternValue,
                  options: floorInspectorPatternOptions.map((option) => ({
                    id: option.id,
                    label: option.label,
                    selected: option.id === floorInspectorPatternValue,
                  })),
                  rotations: FLOOR_ROTATION_PRESETS_DEG.map((rotation) => ({
                    value: rotation,
                    selected: floorInspectorRotationDeg === rotation,
                  })),
                  scale: floorInspectorScale,
                  groutSizes: FLOOR_GROUT_SIZE_PRESETS_MM.map((sizeMm) => {
                    const selected =
                      floorInspectorSettings.floorJointSizeMm === sizeMm;
                    return {
                      valueMm: sizeMm,
                      selected,
                      testId: selected
                        ? "surface-joint-size"
                        : `surface-joint-size-${String(sizeMm).replace(".", "-")}`,
                    };
                  }),
                  groutColor: floorInspectorSettings.floorJointColor,
                  groutPaletteOpen,
                  groutColors: FLOOR_GROUT_COLOR_PALETTE.map((color) => {
                    const normalizedColor = normalizeFloorJointColor(color);
                    return {
                      key: color,
                      color: normalizedColor,
                      selected:
                        normalizedColor.toLowerCase() ===
                        floorInspectorSettings.floorJointColor.toLowerCase(),
                      testId: `surface-grout-color-${color.replace("#", "")}`,
                    };
                  }),
                  offset: floorInspectorSettings.floorPatternOffset,
                  disabled: !canEdit,
                }
              : null;
          const headerLabel = surfaceInspectorIsWall
            ? `${getWallFaceLabel(wallInspectorFaceId)} settings`
            : surfaceInspectorIsCeiling
              ? "Ceiling settings"
              : "Floor settings";
          const footer = surfaceInspectorIsWall
            ? `Wall rotation ${wallInspectorSettings.rotationDeg}°`
            : surfaceInspectorIsCeiling
              ? `Ceiling paint · Height ${Math.round(
                  wallInspectorDefaultHeight * 1000
                )} mm`
              : `Rotation ${floorInspectorRotationDeg}° · Room area ${(
                  selectedPlanRoom.w * selectedPlanRoom.d
                ).toFixed(2)} sqm`;
          const blockers =
            isDesigner && surfaceInspectorBlockers.length > 0
              ? `Blockers: ${surfaceInspectorBlockers
                  .slice(0, 2)
                  .map(formatFlooringInspectorValue)
                  .join(", ")}${
                  surfaceInspectorBlockers.length > 2
                    ? ` +${surfaceInspectorBlockers.length - 2}`
                    : ""
                }`
              : null;

          return {
            target,
            floorMaterialId: floorInspectorMaterialId,
            materialId: surfaceInspectorMaterialId,
            wallHeight,
            header: {
              label: headerLabel,
              displayName: surfaceInspectorDisplayName,
              metadata: `${surfaceInspectorSupplier} · ${surfaceInspectorMaterialFamily}${
                surfaceInspectorSizeLabel
                  ? ` · Size ${surfaceInspectorSizeLabel}`
                  : ""
              }`,
              swatchStyle: surfaceInspectorSwatchStyle,
              publishStatus: formatFlooringInspectorValue(
                surfaceInspectorPublishStatus
              ),
              draft: surfaceInspectorPublishStatus === "draft",
            },
            sizeOptions,
            controls: {
              changeDisabled: !canEdit,
              rotateDisabled:
                !canEdit ||
                (surfaceInspectorIsWall && !surfaceInspectorMaterialId),
              resetDisabled: !canEdit,
              applyAllDisabled:
                !canEdit ||
                (surfaceInspectorIsWall && !surfaceInspectorMaterialId) ||
                (surfaceInspectorIsCeiling &&
                  !ceilingInspectorSettings.paintColorHex),
            },
            picker,
            floorPattern,
            footer,
            blockers,
          };
        })();

  return {
    state: selectedSurfaceInspectorState,
    actions: {
      onCommitWallHeight,
      onResetWallHeight,
      onSelectSize,
      onChangeMaterial,
      onRotate,
      onReset,
      onApplyAll,
      onClosePicker: inspectorUi.closeMaterialPicker,
      onSelectPickerMaterial,
      onSelectPattern,
      onSelectRotation,
      onChangeScale,
      onSelectGroutSize,
      onToggleGroutPalette: inspectorUi.toggleGroutPalette,
      onSelectGroutColor,
      onMovePattern,
      onResetPattern,
      onResetSurface,
    },
  };
}
