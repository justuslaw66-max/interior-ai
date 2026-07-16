"use client";

import { useCallback } from "react";
import { track } from "@/lib/analytics";
import {
  DEFAULT_FLOOR_PATTERN_SCALE,
  clampFloorPatternScale,
  getFloorMaterialById,
  normalizeFloorRotationDeg,
} from "@/lib/floor-materials";
import {
  getCompatibleFloorPatternForMaterial,
  getDefaultFloorPatternForMaterial,
} from "@/lib/design-page-surface-inspector";
import { getRuntimeSurfaceMaterialById } from "@/lib/surface-material-runtime";
import {
  getActiveRoom,
  updateRoom,
  type DesignSnapshot,
  type RoomSurfaceAssignments,
  type SurfaceSettings,
} from "@/lib/room-types";
import {
  DEFAULT_FLOOR_JOINT_COLOR,
  DEFAULT_FLOOR_JOINT_SIZE_MM,
  DEFAULT_FLOOR_PATTERN_OFFSET,
  createSurfaceSettingsPatch,
  getWallFaceLabel,
  normalizeFloorJointColor,
  normalizeFloorJointSizeMm,
  normalizeFloorPattern,
  normalizeFloorPatternOffset,
  type FloorSurfacePatch,
  type SurfaceSettingsPatch,
} from "@/lib/surface-settings";
import {
  getWallPaintDisplayName,
  normalizeWallPaintColorHex,
} from "@/lib/wall-paint";

export type SurfaceTargetMode = "floor" | "walls" | "selected_wall" | "ceiling";

export type SelectedWallSurfaceTarget = {
  roomId: string;
  faceId: string;
};

export type RendererSurfaceTarget = {
  kind: "floor" | "wall" | "ceiling";
  roomId: string;
  id: string;
};

export type SurfaceBrushPaint = {
  colorHex: string;
  name: string;
};

type DesignSnapshotSetter = (
  next: DesignSnapshot | ((previous: DesignSnapshot) => DesignSnapshot),
) => void;

export type DesignPageSurfaceActions = {
  applyFloorMaterialToRoom: (
    materialId: string,
    roomId?: string | null,
  ) => void;
  applyFloorSizeVariantToRoom: (
    materialId: string,
    roomId?: string | null,
  ) => void;
  applyFloorMaterialToAllRooms: (materialId: string) => void;
  applyWallMaterialToRoom: (
    materialId: string,
    roomId?: string | null,
    faceId?: string | null,
  ) => void;
  applyWallMaterialToAllRooms: (materialId: string) => void;
  applyWallPaintToRoom: (
    colorHex: string,
    name?: string | null,
    roomId?: string | null,
    faceId?: string | null,
  ) => void;
  applyWallPaintToAllRooms: (colorHex: string, name?: string | null) => void;
  applyCeilingPaintToRoom: (
    colorHex: string,
    name?: string | null,
    roomId?: string | null,
  ) => void;
  applyCeilingPaintToAllRooms: (colorHex: string, name?: string | null) => void;
  resetActiveCeilingSurface: (roomId?: string | null) => void;
  changeActiveWallSurfaceSettings: (
    patch: SurfaceSettingsPatch,
    roomId?: string | null,
    faceId?: string | null,
  ) => void;
  resetActiveWallSurface: (
    roomId?: string | null,
    faceId?: string | null,
  ) => void;
  changeSurfaceTargetMode: (mode: SurfaceTargetMode) => void;
  changeSurfaceBrushActive: (active: boolean) => void;
  selectSurfaceMaterialForBrush: (materialId: string | null) => void;
  selectSurfacePaintForBrush: (
    colorHex: string | null,
    name?: string | null,
  ) => void;
  rotateActiveFloorMaterial: (roomId?: string | null) => void;
  resetActiveFloorMaterialPattern: (roomId?: string | null) => void;
  changeActiveFloorMaterialScale: (
    scale: number,
    roomId?: string | null,
  ) => void;
  changeActiveFloorSurfaceSettings: (
    patch: FloorSurfacePatch,
    roomId?: string | null,
  ) => void;
};

export type UseDesignPageSurfaceActionsInput = {
  state: {
    selectedWallSurfaceTarget: SelectedWallSurfaceTarget | null;
    surfaceBrushPaint: SurfaceBrushPaint | null;
  };
  configuration: {
    isClientPreview: boolean;
    liveCatalogReady: boolean;
  };
  adapters: {
    designSnapshotRef: { current: DesignSnapshot };
    setDesignSnapshot: DesignSnapshotSetter;
    runHistoryTransaction: (name: string, action: () => void) => void;
    runCoalescedHistoryTransaction: (
      name: string,
      action: () => void,
      idleMs?: number,
    ) => void;
    showRuleToast: (message: string) => void;
    setActiveSurfaceTarget: (mode: SurfaceTargetMode) => void;
    setSelectedRendererSurfaceTarget: (
      target: RendererSurfaceTarget | null,
    ) => void;
    setSelectedWallSurfaceTarget: (
      target: SelectedWallSurfaceTarget | null,
    ) => void;
    setSurfaceBrushActive: (active: boolean) => void;
    setSurfaceBrushMaterialId: (materialId: string | null) => void;
    setSurfaceBrushPaint: (paint: SurfaceBrushPaint | null) => void;
  };
};

export type UseDesignPageSurfaceActionsResult = {
  canApplySurfaceBrush: boolean;
  actions: DesignPageSurfaceActions;
};

export function useDesignPageSurfaceActions({
  state,
  configuration,
  adapters,
}: UseDesignPageSurfaceActionsInput): UseDesignPageSurfaceActionsResult {
  const { selectedWallSurfaceTarget, surfaceBrushPaint } = state;
  const { isClientPreview, liveCatalogReady } = configuration;
  const {
    designSnapshotRef,
    setDesignSnapshot,
    runHistoryTransaction,
    runCoalescedHistoryTransaction,
    showRuleToast,
    setActiveSurfaceTarget,
    setSelectedRendererSurfaceTarget,
    setSelectedWallSurfaceTarget,
    setSurfaceBrushActive,
    setSurfaceBrushMaterialId,
    setSurfaceBrushPaint,
  } = adapters;

  const handleApplyFloorMaterialToRoom = useCallback(
    (materialId: string, roomId?: string | null) => {
      const surfaceMaterial = getRuntimeSurfaceMaterialById(materialId);
      const material = getFloorMaterialById(materialId);
      const appliedMaterialId =
        surfaceMaterial?.surface_material.material_id ?? material.id;
      const appliedMaterialName =
        surfaceMaterial?.surface_material.product_name ?? material.name;
      const appliedFloorPattern =
        getDefaultFloorPatternForMaterial(surfaceMaterial);
      const room =
        (roomId
          ? (designSnapshotRef.current.rooms.find(
              (entry) => entry.id === roomId,
            ) ?? null)
          : null) ?? getActiveRoom(designSnapshotRef.current);
      if (!room) return;

      runHistoryTransaction("Apply floor material", () =>
        setDesignSnapshot((prev) => {
          const target = prev.rooms.find((entry) => entry.id === room.id);
          if (!target) return prev;

          return updateRoom(prev, {
            ...target,
            surfaces: {
              ...target.surfaces,
              ...target.surfaceFinishes,
              floorMaterialId: appliedMaterialId,
              ...(surfaceMaterial
                ? {
                    floorPattern: appliedFloorPattern,
                    floorScale: DEFAULT_FLOOR_PATTERN_SCALE,
                    floorPatternOffset: DEFAULT_FLOOR_PATTERN_OFFSET,
                    floorJointSizeMm: DEFAULT_FLOOR_JOINT_SIZE_MM,
                    floorJointColor: DEFAULT_FLOOR_JOINT_COLOR,
                  }
                : {}),
            },
            surfaceFinishes: {
              ...target.surfaceFinishes,
              ...target.surfaces,
              floorMaterialId: appliedMaterialId,
              ...(surfaceMaterial
                ? {
                    floorPattern: appliedFloorPattern,
                    floorScale: DEFAULT_FLOOR_PATTERN_SCALE,
                    floorPatternOffset: DEFAULT_FLOOR_PATTERN_OFFSET,
                    floorJointSizeMm: DEFAULT_FLOOR_JOINT_SIZE_MM,
                    floorJointColor: DEFAULT_FLOOR_JOINT_COLOR,
                  }
                : {}),
            },
          });
        }),
      );

      showRuleToast(`${appliedMaterialName} applied to ${room.name}`);
      track("floor_finish_applied", {
        materialId: appliedMaterialId,
        roomId: room.id,
        scope: "room",
      });
    },
    [
      designSnapshotRef,
      runHistoryTransaction,
      setDesignSnapshot,
      showRuleToast,
    ],
  );

  const handleApplyFloorSizeVariantToRoom = useCallback(
    (materialId: string, roomId?: string | null) => {
      const surfaceMaterial = getRuntimeSurfaceMaterialById(materialId);
      if (!surfaceMaterial) {
        handleApplyFloorMaterialToRoom(materialId, roomId);
        return;
      }

      const room =
        (roomId
          ? (designSnapshotRef.current.rooms.find(
              (entry) => entry.id === roomId,
            ) ?? null)
          : null) ?? getActiveRoom(designSnapshotRef.current);
      if (!room) return;

      runHistoryTransaction("Change floor tile size", () =>
        setDesignSnapshot((prev) => {
          const target = prev.rooms.find((entry) => entry.id === room.id);
          if (!target) return prev;
          const currentSurfaces = {
            ...target.surfaces,
            ...target.surfaceFinishes,
          };
          const nextFloorPattern = getCompatibleFloorPatternForMaterial(
            surfaceMaterial,
            currentSurfaces.floorPattern ?? currentSurfaces.floor?.pattern,
          );

          return updateRoom(prev, {
            ...target,
            surfaces: {
              ...target.surfaces,
              ...target.surfaceFinishes,
              floorMaterialId: surfaceMaterial.surface_material.material_id,
              floorPattern: nextFloorPattern,
            },
            surfaceFinishes: {
              ...target.surfaceFinishes,
              ...target.surfaces,
              floorMaterialId: surfaceMaterial.surface_material.material_id,
              floorPattern: nextFloorPattern,
            },
          });
        }),
      );

      showRuleToast(
        `${surfaceMaterial.surface_material.product_name} applied to ${room.name}`,
      );
      track("floor_finish_size_variant_applied", {
        materialId: surfaceMaterial.surface_material.material_id,
        roomId: room.id,
      });
    },
    [
      designSnapshotRef,
      handleApplyFloorMaterialToRoom,
      runHistoryTransaction,
      setDesignSnapshot,
      showRuleToast,
    ],
  );

  const handleApplyFloorMaterialToAllRooms = useCallback(
    (materialId: string) => {
      const surfaceMaterial = getRuntimeSurfaceMaterialById(materialId);
      const material = getFloorMaterialById(materialId);
      const appliedMaterialId =
        surfaceMaterial?.surface_material.material_id ?? material.id;
      const appliedMaterialName =
        surfaceMaterial?.surface_material.product_name ?? material.name;
      const appliedFloorPattern =
        getDefaultFloorPatternForMaterial(surfaceMaterial);

      runHistoryTransaction("Apply floor material", () =>
        setDesignSnapshot((prev) => {
          if (prev.rooms.length === 0) return prev;

          return {
            ...prev,
            rooms: prev.rooms.map((room) => ({
              ...room,
              surfaces: {
                ...room.surfaces,
                ...room.surfaceFinishes,
                floorMaterialId: appliedMaterialId,
                ...(surfaceMaterial
                  ? {
                      floorPattern: appliedFloorPattern,
                      floorScale: DEFAULT_FLOOR_PATTERN_SCALE,
                      floorPatternOffset: DEFAULT_FLOOR_PATTERN_OFFSET,
                      floorJointSizeMm: DEFAULT_FLOOR_JOINT_SIZE_MM,
                      floorJointColor: DEFAULT_FLOOR_JOINT_COLOR,
                    }
                  : {}),
              },
              surfaceFinishes: {
                ...room.surfaceFinishes,
                ...room.surfaces,
                floorMaterialId: appliedMaterialId,
                ...(surfaceMaterial
                  ? {
                      floorPattern: appliedFloorPattern,
                      floorScale: DEFAULT_FLOOR_PATTERN_SCALE,
                      floorPatternOffset: DEFAULT_FLOOR_PATTERN_OFFSET,
                      floorJointSizeMm: DEFAULT_FLOOR_JOINT_SIZE_MM,
                      floorJointColor: DEFAULT_FLOOR_JOINT_COLOR,
                    }
                  : {}),
              },
            })),
          };
        }),
      );

      showRuleToast(`${appliedMaterialName} applied to all rooms`);
      track("floor_finish_applied", {
        materialId: appliedMaterialId,
        scope: "home",
      });
    },
    [runHistoryTransaction, setDesignSnapshot, showRuleToast],
  );

  const buildWallSurfaceSettings = useCallback(
    (materialId: string, current?: SurfaceSettings): SurfaceSettings =>
      createSurfaceSettingsPatch(
        materialId,
        normalizeFloorRotationDeg,
        clampFloorPatternScale,
        {
          materialId,
          pattern: "straight",
          rotationDeg: 0,
          scale: DEFAULT_FLOOR_PATTERN_SCALE,
          offset: DEFAULT_FLOOR_PATTERN_OFFSET,
          jointSizeMm: DEFAULT_FLOOR_JOINT_SIZE_MM,
          jointColor: DEFAULT_FLOOR_JOINT_COLOR,
        },
        current,
      ),
    [],
  );

  const handleApplyWallMaterialToRoom = useCallback(
    (materialId: string, roomId?: string | null, faceId?: string | null) => {
      const surfaceMaterial = getRuntimeSurfaceMaterialById(materialId);
      const material = getFloorMaterialById(materialId);
      const appliedMaterialId =
        surfaceMaterial?.surface_material.material_id ?? material.id;
      const appliedMaterialName =
        surfaceMaterial?.surface_material.product_name ?? material.name;
      const room =
        (roomId
          ? (designSnapshotRef.current.rooms.find(
              (entry) => entry.id === roomId,
            ) ?? null)
          : null) ?? getActiveRoom(designSnapshotRef.current);
      if (!room) return;

      const normalizedFaceId = faceId?.trim() || null;
      runHistoryTransaction(
        normalizedFaceId
          ? "Apply selected wall material"
          : "Apply wall material",
        () =>
          setDesignSnapshot((prev) => {
            const target = prev.rooms.find((entry) => entry.id === room.id);
            if (!target) return prev;

            const currentSurfaces: RoomSurfaceAssignments = {
              ...target.surfaces,
              ...target.surfaceFinishes,
            };
            const currentWalls = currentSurfaces.walls ?? {};
            const currentFaces = currentWalls.faces ?? {};
            const nextWallSettings = buildWallSurfaceSettings(
              appliedMaterialId,
              normalizedFaceId
                ? (currentFaces[normalizedFaceId] ?? currentWalls.default)
                : currentWalls.default,
            );
            const nextWalls = normalizedFaceId
              ? {
                  ...currentWalls,
                  faces: {
                    ...currentFaces,
                    [normalizedFaceId]: nextWallSettings,
                  },
                }
              : {
                  ...currentWalls,
                  default: nextWallSettings,
                };
            const nextSurfaces: RoomSurfaceAssignments = {
              ...currentSurfaces,
              ...(normalizedFaceId
                ? {}
                : { wallMaterialId: appliedMaterialId }),
              walls: nextWalls,
            };

            return updateRoom(prev, {
              ...target,
              surfaces: nextSurfaces,
              surfaceFinishes: nextSurfaces,
            });
          }),
      );

      showRuleToast(
        normalizedFaceId
          ? `${appliedMaterialName} applied to ${getWallFaceLabel(normalizedFaceId)}`
          : `${appliedMaterialName} applied to ${room.name} walls`,
      );
      track("wall_finish_applied", {
        materialId: appliedMaterialId,
        roomId: room.id,
        scope: normalizedFaceId ? "selected_wall" : "room_walls",
        faceId: normalizedFaceId,
      });
    },
    [
      buildWallSurfaceSettings,
      designSnapshotRef,
      runHistoryTransaction,
      setDesignSnapshot,
      showRuleToast,
    ],
  );

  const handleApplyWallMaterialToAllRooms = useCallback(
    (materialId: string) => {
      const surfaceMaterial = getRuntimeSurfaceMaterialById(materialId);
      const material = getFloorMaterialById(materialId);
      const appliedMaterialId =
        surfaceMaterial?.surface_material.material_id ?? material.id;
      const appliedMaterialName =
        surfaceMaterial?.surface_material.product_name ?? material.name;

      runHistoryTransaction("Apply wall material", () =>
        setDesignSnapshot((prev) => {
          if (prev.rooms.length === 0) return prev;

          return {
            ...prev,
            rooms: prev.rooms.map((room) => {
              const currentSurfaces: RoomSurfaceAssignments = {
                ...room.surfaces,
                ...room.surfaceFinishes,
              };
              const currentWalls = currentSurfaces.walls ?? {};
              const nextSurfaces: RoomSurfaceAssignments = {
                ...currentSurfaces,
                wallMaterialId: appliedMaterialId,
                walls: {
                  ...currentWalls,
                  default: buildWallSurfaceSettings(
                    appliedMaterialId,
                    currentWalls.default,
                  ),
                },
              };
              return {
                ...room,
                surfaces: nextSurfaces,
                surfaceFinishes: nextSurfaces,
              };
            }),
          };
        }),
      );

      showRuleToast(`${appliedMaterialName} applied to all room walls`);
      track("wall_finish_applied", {
        materialId: appliedMaterialId,
        scope: "home_walls",
      });
    },
    [
      buildWallSurfaceSettings,
      runHistoryTransaction,
      setDesignSnapshot,
      showRuleToast,
    ],
  );

  const buildWallPaintSettings = useCallback(
    (
      colorHex: string,
      name?: string | null,
      current?: SurfaceSettings,
    ): SurfaceSettings | null => {
      const normalizedColor = normalizeWallPaintColorHex(colorHex);
      if (!normalizedColor) return null;
      return createSurfaceSettingsPatch(
        null,
        normalizeFloorRotationDeg,
        clampFloorPatternScale,
        {
          materialId: null,
          paintColorHex: normalizedColor,
          paintName: getWallPaintDisplayName(normalizedColor, name),
          pattern: "straight",
          rotationDeg: 0,
          scale: DEFAULT_FLOOR_PATTERN_SCALE,
          offset: DEFAULT_FLOOR_PATTERN_OFFSET,
          jointSizeMm: DEFAULT_FLOOR_JOINT_SIZE_MM,
          jointColor: DEFAULT_FLOOR_JOINT_COLOR,
        },
        current,
      );
    },
    [],
  );

  const handleApplyWallPaintToRoom = useCallback(
    (
      colorHex: string,
      name?: string | null,
      roomId?: string | null,
      faceId?: string | null,
    ) => {
      const normalizedColor = normalizeWallPaintColorHex(colorHex);
      if (!normalizedColor) {
        showRuleToast("Choose a valid wall colour");
        return;
      }
      const paintName = getWallPaintDisplayName(normalizedColor, name);
      const room =
        (roomId
          ? (designSnapshotRef.current.rooms.find(
              (entry) => entry.id === roomId,
            ) ?? null)
          : null) ?? getActiveRoom(designSnapshotRef.current);
      if (!room) return;

      const normalizedFaceId = faceId?.trim() || null;
      runHistoryTransaction(
        normalizedFaceId ? "Paint selected wall" : "Paint walls",
        () =>
          setDesignSnapshot((prev) => {
            const target = prev.rooms.find((entry) => entry.id === room.id);
            if (!target) return prev;

            const currentSurfaces: RoomSurfaceAssignments = {
              ...target.surfaces,
              ...target.surfaceFinishes,
            };
            const currentWalls = currentSurfaces.walls ?? {};
            const currentFaces = currentWalls.faces ?? {};
            const nextWallSettings = buildWallPaintSettings(
              normalizedColor,
              paintName,
              normalizedFaceId
                ? (currentFaces[normalizedFaceId] ?? currentWalls.default)
                : currentWalls.default,
            );
            if (!nextWallSettings) return prev;

            const nextWalls = normalizedFaceId
              ? {
                  ...currentWalls,
                  faces: {
                    ...currentFaces,
                    [normalizedFaceId]: nextWallSettings,
                  },
                }
              : {
                  ...currentWalls,
                  default: nextWallSettings,
                };
            const nextSurfaces: RoomSurfaceAssignments = {
              ...currentSurfaces,
              ...(normalizedFaceId ? {} : { wallMaterialId: null }),
              walls: nextWalls,
            };

            return updateRoom(prev, {
              ...target,
              surfaces: nextSurfaces,
              surfaceFinishes: nextSurfaces,
            });
          }),
      );

      showRuleToast(
        normalizedFaceId
          ? `${paintName} applied to ${getWallFaceLabel(normalizedFaceId)}`
          : `${paintName} applied to ${room.name} walls`,
      );
      track("wall_paint_applied", {
        colorHex: normalizedColor,
        name: paintName,
        roomId: room.id,
        scope: normalizedFaceId ? "selected_wall" : "room_walls",
        faceId: normalizedFaceId,
      });
    },
    [
      buildWallPaintSettings,
      designSnapshotRef,
      runHistoryTransaction,
      setDesignSnapshot,
      showRuleToast,
    ],
  );

  const handleApplyWallPaintToAllRooms = useCallback(
    (colorHex: string, name?: string | null) => {
      const normalizedColor = normalizeWallPaintColorHex(colorHex);
      if (!normalizedColor) {
        showRuleToast("Choose a valid wall colour");
        return;
      }
      const paintName = getWallPaintDisplayName(normalizedColor, name);

      runHistoryTransaction("Paint all room walls", () =>
        setDesignSnapshot((prev) => {
          if (prev.rooms.length === 0) return prev;

          return {
            ...prev,
            rooms: prev.rooms.map((room) => {
              const currentSurfaces: RoomSurfaceAssignments = {
                ...room.surfaces,
                ...room.surfaceFinishes,
              };
              const currentWalls = currentSurfaces.walls ?? {};
              const nextWallSettings = buildWallPaintSettings(
                normalizedColor,
                paintName,
                currentWalls.default,
              );
              if (!nextWallSettings) return room;
              const nextSurfaces: RoomSurfaceAssignments = {
                ...currentSurfaces,
                wallMaterialId: null,
                walls: {
                  ...currentWalls,
                  default: nextWallSettings,
                },
              };
              return {
                ...room,
                surfaces: nextSurfaces,
                surfaceFinishes: nextSurfaces,
              };
            }),
          };
        }),
      );

      showRuleToast(`${paintName} applied to all room walls`);
      track("wall_paint_applied", {
        colorHex: normalizedColor,
        name: paintName,
        scope: "home_walls",
      });
    },
    [
      buildWallPaintSettings,
      runHistoryTransaction,
      setDesignSnapshot,
      showRuleToast,
    ],
  );

  const handleApplyCeilingPaintToRoom = useCallback(
    (colorHex: string, name?: string | null, roomId?: string | null) => {
      const normalizedColor = normalizeWallPaintColorHex(colorHex);
      if (!normalizedColor) {
        showRuleToast("Choose a valid ceiling colour");
        return;
      }
      const paintName = getWallPaintDisplayName(normalizedColor, name);
      const room =
        (roomId
          ? (designSnapshotRef.current.rooms.find(
              (entry) => entry.id === roomId,
            ) ?? null)
          : null) ?? getActiveRoom(designSnapshotRef.current);
      if (!room) return;

      runHistoryTransaction("Paint ceiling", () =>
        setDesignSnapshot((prev) => {
          const target = prev.rooms.find((entry) => entry.id === room.id);
          if (!target) return prev;

          const currentSurfaces: RoomSurfaceAssignments = {
            ...target.surfaceFinishes,
            ...target.surfaces,
          };
          const nextCeilingSettings = buildWallPaintSettings(
            normalizedColor,
            paintName,
            currentSurfaces.ceiling,
          );
          if (!nextCeilingSettings) return prev;
          const nextSurfaces: RoomSurfaceAssignments = {
            ...currentSurfaces,
            ceiling: nextCeilingSettings,
            ceilingColor: normalizedColor,
          };

          return updateRoom(prev, {
            ...target,
            surfaces: nextSurfaces,
            surfaceFinishes: nextSurfaces,
          });
        }),
      );

      showRuleToast(`${paintName} applied to ${room.name} ceiling`);
      track("ceiling_paint_applied", {
        colorHex: normalizedColor,
        name: paintName,
        roomId: room.id,
        scope: "room_ceiling",
      });
    },
    [
      buildWallPaintSettings,
      designSnapshotRef,
      runHistoryTransaction,
      setDesignSnapshot,
      showRuleToast,
    ],
  );

  const handleApplyCeilingPaintToAllRooms = useCallback(
    (colorHex: string, name?: string | null) => {
      const normalizedColor = normalizeWallPaintColorHex(colorHex);
      if (!normalizedColor) {
        showRuleToast("Choose a valid ceiling colour");
        return;
      }
      const paintName = getWallPaintDisplayName(normalizedColor, name);

      runHistoryTransaction("Paint all ceilings", () =>
        setDesignSnapshot((prev) => {
          if (prev.rooms.length === 0) return prev;

          return {
            ...prev,
            rooms: prev.rooms.map((room) => {
              const currentSurfaces: RoomSurfaceAssignments = {
                ...room.surfaceFinishes,
                ...room.surfaces,
              };
              const nextCeilingSettings = buildWallPaintSettings(
                normalizedColor,
                paintName,
                currentSurfaces.ceiling,
              );
              if (!nextCeilingSettings) return room;
              const nextSurfaces: RoomSurfaceAssignments = {
                ...currentSurfaces,
                ceiling: nextCeilingSettings,
                ceilingColor: normalizedColor,
              };
              return {
                ...room,
                surfaces: nextSurfaces,
                surfaceFinishes: nextSurfaces,
              };
            }),
          };
        }),
      );

      showRuleToast(`${paintName} applied to all ceilings`);
      track("ceiling_paint_applied", {
        colorHex: normalizedColor,
        name: paintName,
        scope: "home_ceilings",
      });
    },
    [
      buildWallPaintSettings,
      runHistoryTransaction,
      setDesignSnapshot,
      showRuleToast,
    ],
  );

  const handleResetActiveCeilingSurface = useCallback(
    (roomId?: string | null) => {
      const room =
        (roomId
          ? (designSnapshotRef.current.rooms.find(
              (entry) => entry.id === roomId,
            ) ?? null)
          : null) ?? getActiveRoom(designSnapshotRef.current);
      if (!room) return;

      runHistoryTransaction("Reset ceiling surface", () =>
        setDesignSnapshot((prev) => {
          const target = prev.rooms.find((entry) => entry.id === room.id);
          if (!target) return prev;

          const currentSurfaces: RoomSurfaceAssignments = {
            ...target.surfaceFinishes,
            ...target.surfaces,
          };
          const nextSurfaces = { ...currentSurfaces };
          delete nextSurfaces.ceiling;
          delete nextSurfaces.ceilingColor;

          return updateRoom(prev, {
            ...target,
            surfaces: nextSurfaces,
            surfaceFinishes: nextSurfaces,
          });
        }),
      );

      showRuleToast(`${room.name} ceiling reset`);
      track("ceiling_finish_reset", {
        roomId: room.id,
      });
    },
    [
      designSnapshotRef,
      runHistoryTransaction,
      setDesignSnapshot,
      showRuleToast,
    ],
  );

  const handleActiveWallSurfaceSettingsChange = useCallback(
    (
      patch: SurfaceSettingsPatch,
      roomId?: string | null,
      faceId?: string | null,
    ) => {
      const room =
        (roomId
          ? (designSnapshotRef.current.rooms.find(
              (entry) => entry.id === roomId,
            ) ?? null)
          : null) ?? getActiveRoom(designSnapshotRef.current);
      if (!room) return;

      const normalizedFaceId = faceId?.trim() || null;
      runHistoryTransaction("Update wall surface", () =>
        setDesignSnapshot((prev) => {
          const target = prev.rooms.find((entry) => entry.id === room.id);
          if (!target) return prev;

          const currentSurfaces: RoomSurfaceAssignments = {
            ...target.surfaces,
            ...target.surfaceFinishes,
          };
          const currentWalls = currentSurfaces.walls ?? {};
          const currentFaces = currentWalls.faces ?? {};
          const baseSettings = normalizedFaceId
            ? (currentFaces[normalizedFaceId] ?? currentWalls.default)
            : currentWalls.default;
          const normalizedSettings = createSurfaceSettingsPatch(
            patch.materialId ??
              baseSettings?.materialId ??
              currentSurfaces.wallMaterialId ??
              null,
            normalizeFloorRotationDeg,
            clampFloorPatternScale,
            patch,
            baseSettings,
          );
          const nextWalls = normalizedFaceId
            ? {
                ...currentWalls,
                faces: {
                  ...currentFaces,
                  [normalizedFaceId]: normalizedSettings,
                },
              }
            : {
                ...currentWalls,
                default: normalizedSettings,
              };
          const nextSurfaces: RoomSurfaceAssignments = {
            ...currentSurfaces,
            ...(normalizedFaceId
              ? {}
              : { wallMaterialId: normalizedSettings.materialId }),
            walls: nextWalls,
          };

          return updateRoom(prev, {
            ...target,
            surfaces: nextSurfaces,
            surfaceFinishes: nextSurfaces,
          });
        }),
      );

      track("wall_finish_pattern_changed", {
        roomId: room.id,
        faceId: normalizedFaceId,
        fields: Object.keys(patch).join(","),
      });
    },
    [designSnapshotRef, runHistoryTransaction, setDesignSnapshot],
  );

  const handleResetActiveWallSurface = useCallback(
    (roomId?: string | null, faceId?: string | null) => {
      const room =
        (roomId
          ? (designSnapshotRef.current.rooms.find(
              (entry) => entry.id === roomId,
            ) ?? null)
          : null) ?? getActiveRoom(designSnapshotRef.current);
      if (!room) return;

      const normalizedFaceId = faceId?.trim() || null;
      runHistoryTransaction("Reset wall surface", () =>
        setDesignSnapshot((prev) => {
          const target = prev.rooms.find((entry) => entry.id === room.id);
          if (!target) return prev;

          const currentSurfaces: RoomSurfaceAssignments = {
            ...target.surfaces,
            ...target.surfaceFinishes,
          };
          const currentWalls = currentSurfaces.walls ?? {};
          const currentFaces = { ...(currentWalls.faces ?? {}) };
          let nextWalls = currentWalls;
          let nextSurfaces: RoomSurfaceAssignments = { ...currentSurfaces };

          if (normalizedFaceId) {
            delete currentFaces[normalizedFaceId];
            nextWalls = {
              ...currentWalls,
              faces: currentFaces,
            };
          } else {
            nextWalls = {
              ...currentWalls,
              default: undefined,
              faces: {},
            };
            nextSurfaces = {
              ...nextSurfaces,
              wallMaterialId: null,
            };
          }

          nextSurfaces = {
            ...nextSurfaces,
            walls: nextWalls,
          };

          return updateRoom(prev, {
            ...target,
            surfaces: nextSurfaces,
            surfaceFinishes: nextSurfaces,
          });
        }),
      );

      showRuleToast(
        normalizedFaceId
          ? `${getWallFaceLabel(normalizedFaceId)} reset`
          : `${room.name} walls reset`,
      );
      track("wall_finish_reset", {
        roomId: room.id,
        faceId: normalizedFaceId,
      });
    },
    [
      designSnapshotRef,
      runHistoryTransaction,
      setDesignSnapshot,
      showRuleToast,
    ],
  );

  const handleSurfaceTargetModeChange = useCallback(
    (mode: SurfaceTargetMode) => {
      setActiveSurfaceTarget(mode);
      setSelectedRendererSurfaceTarget(null);
      if (mode !== "selected_wall") {
        setSelectedWallSurfaceTarget(null);
      }
      if (mode === "selected_wall" && !selectedWallSurfaceTarget) {
        showRuleToast("Click a wall in 3D to target one wall");
      }
      track("surface_workspace_target_changed", {
        target: mode,
        roomId: designSnapshotRef.current.activeRoomId,
        faceId: selectedWallSurfaceTarget?.faceId ?? null,
      });
    },
    [
      designSnapshotRef,
      selectedWallSurfaceTarget,
      setActiveSurfaceTarget,
      setSelectedRendererSurfaceTarget,
      setSelectedWallSurfaceTarget,
      showRuleToast,
    ],
  );

  const handleSurfaceBrushActiveChange = useCallback(
    (active: boolean) => {
      setSurfaceBrushActive(active);
      track("surface_material_brush_toggled", {
        active,
      });
    },
    [setSurfaceBrushActive],
  );

  const handleSurfaceMaterialSelectedForBrush = useCallback(
    (materialId: string | null) => {
      setSurfaceBrushMaterialId(materialId);
      if (materialId) setSurfaceBrushPaint(null);
    },
    [setSurfaceBrushMaterialId, setSurfaceBrushPaint],
  );

  const handleSurfacePaintSelectedForBrush = useCallback(
    (colorHex: string | null, name?: string | null) => {
      const normalizedColor = normalizeWallPaintColorHex(colorHex);
      if (!normalizedColor) {
        setSurfaceBrushPaint(null);
        return;
      }
      setSurfaceBrushMaterialId(null);
      setSurfaceBrushPaint({
        colorHex: normalizedColor,
        name: getWallPaintDisplayName(normalizedColor, name),
      });
    },
    [setSurfaceBrushMaterialId, setSurfaceBrushPaint],
  );

  const canApplySurfaceBrush =
    !isClientPreview && (liveCatalogReady || Boolean(surfaceBrushPaint));

  const handleRotateActiveFloorMaterial = useCallback(
    (roomId?: string | null) => {
      const room =
        (roomId
          ? (designSnapshotRef.current.rooms.find(
              (entry) => entry.id === roomId,
            ) ?? null)
          : null) ?? getActiveRoom(designSnapshotRef.current);
      if (!room) return;

      runHistoryTransaction("Rotate floor pattern", () =>
        setDesignSnapshot((prev) => {
          const target = prev.rooms.find((entry) => entry.id === room.id);
          if (!target) return prev;

          const currentSurfaces = target.surfaces ?? target.surfaceFinishes;
          return updateRoom(prev, {
            ...target,
            surfaces: {
              ...target.surfaces,
              ...target.surfaceFinishes,
              floorRotationDeg: normalizeFloorRotationDeg(
                (currentSurfaces?.floorRotationDeg ?? 0) + 90,
              ),
            },
            surfaceFinishes: {
              ...target.surfaceFinishes,
              ...target.surfaces,
              floorRotationDeg: normalizeFloorRotationDeg(
                (currentSurfaces?.floorRotationDeg ?? 0) + 90,
              ),
            },
          });
        }),
      );

      showRuleToast(`Floor direction rotated in ${room.name}`);
      track("floor_finish_pattern_changed", {
        roomId: room.id,
        action: "rotate_90",
      });
    },
    [
      designSnapshotRef,
      runHistoryTransaction,
      setDesignSnapshot,
      showRuleToast,
    ],
  );

  const handleResetActiveFloorMaterialPattern = useCallback(
    (roomId?: string | null) => {
      const room =
        (roomId
          ? (designSnapshotRef.current.rooms.find(
              (entry) => entry.id === roomId,
            ) ?? null)
          : null) ?? getActiveRoom(designSnapshotRef.current);
      if (!room) return;
      const currentSurfaces = {
        ...room.surfaces,
        ...room.surfaceFinishes,
      };
      const currentSurfaceMaterial = getRuntimeSurfaceMaterialById(
        currentSurfaces.floorMaterialId ?? currentSurfaces.floor?.materialId,
      );
      const resetFloorPattern = getDefaultFloorPatternForMaterial(
        currentSurfaceMaterial,
      );

      runHistoryTransaction("Reset floor pattern", () =>
        setDesignSnapshot((prev) => {
          const target = prev.rooms.find((entry) => entry.id === room.id);
          if (!target) return prev;

          return updateRoom(prev, {
            ...target,
            surfaces: {
              ...target.surfaces,
              ...target.surfaceFinishes,
              floorRotationDeg: 0,
              floorScale: DEFAULT_FLOOR_PATTERN_SCALE,
              floorPattern: resetFloorPattern,
              floorPatternOffset: DEFAULT_FLOOR_PATTERN_OFFSET,
              floorJointSizeMm: DEFAULT_FLOOR_JOINT_SIZE_MM,
              floorJointColor: DEFAULT_FLOOR_JOINT_COLOR,
            },
            surfaceFinishes: {
              ...target.surfaceFinishes,
              ...target.surfaces,
              floorRotationDeg: 0,
              floorScale: DEFAULT_FLOOR_PATTERN_SCALE,
              floorPattern: resetFloorPattern,
              floorPatternOffset: DEFAULT_FLOOR_PATTERN_OFFSET,
              floorJointSizeMm: DEFAULT_FLOOR_JOINT_SIZE_MM,
              floorJointColor: DEFAULT_FLOOR_JOINT_COLOR,
            },
          });
        }),
      );

      showRuleToast(`Floor pattern reset in ${room.name}`);
      track("floor_finish_pattern_changed", {
        roomId: room.id,
        action: "reset",
      });
    },
    [
      designSnapshotRef,
      runHistoryTransaction,
      setDesignSnapshot,
      showRuleToast,
    ],
  );

  const handleActiveFloorMaterialScaleChange = useCallback(
    (scale: number, roomId?: string | null) => {
      const room =
        (roomId
          ? (designSnapshotRef.current.rooms.find(
              (entry) => entry.id === roomId,
            ) ?? null)
          : null) ?? getActiveRoom(designSnapshotRef.current);
      if (!room) return;
      const nextScale = clampFloorPatternScale(scale);

      runCoalescedHistoryTransaction("Scale floor pattern", () =>
        setDesignSnapshot((prev) => {
          const target = prev.rooms.find((entry) => entry.id === room.id);
          if (!target) return prev;

          return updateRoom(prev, {
            ...target,
            surfaces: {
              ...target.surfaces,
              ...target.surfaceFinishes,
              floorScale: nextScale,
            },
            surfaceFinishes: {
              ...target.surfaceFinishes,
              ...target.surfaces,
              floorScale: nextScale,
            },
          });
        }),
      );
    },
    [designSnapshotRef, runCoalescedHistoryTransaction, setDesignSnapshot],
  );

  const handleActiveFloorSurfaceSettingsChange = useCallback(
    (patch: FloorSurfacePatch, roomId?: string | null) => {
      const room =
        (roomId
          ? (designSnapshotRef.current.rooms.find(
              (entry) => entry.id === roomId,
            ) ?? null)
          : null) ?? getActiveRoom(designSnapshotRef.current);
      if (!room) return;

      const normalizedPatch: RoomSurfaceAssignments = {};
      if ("floorPattern" in patch) {
        const currentSurfaces = {
          ...room.surfaces,
          ...room.surfaceFinishes,
        };
        const currentSurfaceMaterial = getRuntimeSurfaceMaterialById(
          currentSurfaces.floorMaterialId ?? currentSurfaces.floor?.materialId,
        );
        normalizedPatch.floorPattern = getCompatibleFloorPatternForMaterial(
          currentSurfaceMaterial,
          normalizeFloorPattern(patch.floorPattern),
        );
      }
      if ("floorRotationDeg" in patch) {
        normalizedPatch.floorRotationDeg = normalizeFloorRotationDeg(
          patch.floorRotationDeg,
        );
      }
      if ("floorScale" in patch) {
        normalizedPatch.floorScale = clampFloorPatternScale(patch.floorScale);
      }
      if ("floorPatternOffset" in patch) {
        normalizedPatch.floorPatternOffset = normalizeFloorPatternOffset(
          patch.floorPatternOffset,
        );
      }
      if ("floorJointSizeMm" in patch) {
        normalizedPatch.floorJointSizeMm = normalizeFloorJointSizeMm(
          patch.floorJointSizeMm,
        );
      }
      if ("floorJointColor" in patch) {
        normalizedPatch.floorJointColor = normalizeFloorJointColor(
          patch.floorJointColor,
        );
      }

      runHistoryTransaction("Update floor surface", () =>
        setDesignSnapshot((prev) => {
          const target = prev.rooms.find((entry) => entry.id === room.id);
          if (!target) return prev;

          return updateRoom(prev, {
            ...target,
            surfaces: {
              ...target.surfaces,
              ...target.surfaceFinishes,
              ...normalizedPatch,
            },
            surfaceFinishes: {
              ...target.surfaceFinishes,
              ...target.surfaces,
              ...normalizedPatch,
            },
          });
        }),
      );

      track("floor_finish_pattern_changed", {
        roomId: room.id,
        action: "surface_settings",
        fields: Object.keys(normalizedPatch).join(","),
      });
    },
    [designSnapshotRef, runHistoryTransaction, setDesignSnapshot],
  );

  return {
    canApplySurfaceBrush,
    actions: {
      applyFloorMaterialToRoom: handleApplyFloorMaterialToRoom,
      applyFloorSizeVariantToRoom: handleApplyFloorSizeVariantToRoom,
      applyFloorMaterialToAllRooms: handleApplyFloorMaterialToAllRooms,
      applyWallMaterialToRoom: handleApplyWallMaterialToRoom,
      applyWallMaterialToAllRooms: handleApplyWallMaterialToAllRooms,
      applyWallPaintToRoom: handleApplyWallPaintToRoom,
      applyWallPaintToAllRooms: handleApplyWallPaintToAllRooms,
      applyCeilingPaintToRoom: handleApplyCeilingPaintToRoom,
      applyCeilingPaintToAllRooms: handleApplyCeilingPaintToAllRooms,
      resetActiveCeilingSurface: handleResetActiveCeilingSurface,
      changeActiveWallSurfaceSettings: handleActiveWallSurfaceSettingsChange,
      resetActiveWallSurface: handleResetActiveWallSurface,
      changeSurfaceTargetMode: handleSurfaceTargetModeChange,
      changeSurfaceBrushActive: handleSurfaceBrushActiveChange,
      selectSurfaceMaterialForBrush: handleSurfaceMaterialSelectedForBrush,
      selectSurfacePaintForBrush: handleSurfacePaintSelectedForBrush,
      rotateActiveFloorMaterial: handleRotateActiveFloorMaterial,
      resetActiveFloorMaterialPattern: handleResetActiveFloorMaterialPattern,
      changeActiveFloorMaterialScale: handleActiveFloorMaterialScaleChange,
      changeActiveFloorSurfaceSettings: handleActiveFloorSurfaceSettingsChange,
    },
  };
}
