"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { track } from "@/lib/analytics";
import {
  clampEditorOpacity,
  clampRoomHeightMeters,
  clampSlabThicknessMeters,
  clampWallThicknessMeters,
} from "@/lib/design-page-floor-plan-utils";
import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import { commitCanonicalTopologyMutationToSnapshotV2 } from "@/lib/floor-plan-topology-editor";
import {
  applyFloorPlanMeasuredPropertyMutationV2,
  FloorPlanMeasuredPropertyMutationErrorV2,
  type FloorPlanConsumerMeasurementEvidenceV2,
} from "@/lib/floor-plan-measured-property-mutations";
import { getWallFaceLabel } from "@/lib/surface-settings";
import type { FixedElement2D, RoomOpening2D } from "@/lib/editorScene";
import {
  getActiveRoom,
  updateRoom,
  type DesignSnapshot,
  type RoomSnapshot,
} from "@/lib/room-types";

type RoomGeometryHistory = {
  begin: (name: string) => void;
  commit: () => void;
};

export function useDesignPageRoomGeometry({
  state,
  refs,
  actions,
}: {
  state: { activeFloorLevel: number };
  refs: { designSnapshot: MutableRefObject<DesignSnapshot> };
  actions: {
    setDesignSnapshot: Dispatch<SetStateAction<DesignSnapshot>>;
    setPlanOpenings: Dispatch<SetStateAction<RoomOpening2D[]>>;
    setPlanFixedElements: Dispatch<SetStateAction<FixedElement2D[]>>;
    history: RoomGeometryHistory;
    runHistoryTransaction: (name: string, mutation: () => void) => void;
    runCoalescedHistoryTransaction: (name: string, mutation: () => void) => void;
    showToast: (message: string) => void;
  };
}) {
  const { activeFloorLevel } = state;
  const { designSnapshot: designSnapshotRef } = refs;
  const {
    setDesignSnapshot,
    setPlanOpenings,
    setPlanFixedElements,
    history,
    runHistoryTransaction,
    runCoalescedHistoryTransaction,
    showToast,
  } = actions;

  const updateActiveRoomGeometry = useCallback(
    (
      actionName: string,
      updateGeometry: (
        geometry: RoomSnapshot["geometry"]
      ) => RoomSnapshot["geometry"]
    ) => {
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) return;
      const nextSnapshot = updateRoom(designSnapshotRef.current, {
        ...room,
        geometry: updateGeometry(room.geometry),
      });
      history.begin(actionName);
      designSnapshotRef.current = nextSnapshot;
      setDesignSnapshot(nextSnapshot);
      history.commit();
    },
    [designSnapshotRef, history, setDesignSnapshot]
  );

  const changeActiveRoomHeightMm = useCallback(
    (
      valueMm: number,
      evidence: FloorPlanConsumerMeasurementEvidenceV2 = "user_confirmed",
      measurementNote?: string
    ) => {
      const height = clampRoomHeightMeters(valueMm / 1000);
      const currentSnapshot = designSnapshotRef.current;
      const canonicalDocument = currentSnapshot.floorPlan?.canonicalDocument;
      if (canonicalDocument) {
        const floor =
          canonicalDocument.floors.find(
            (candidate) => candidate.levelIndex === activeFloorLevel - 1
          ) ??
          (canonicalDocument.floors.length === 1
            ? canonicalDocument.floors[0]
            : undefined);
        if (!floor) {
          showToast("Canonical floor height could not be matched to the active floor");
          return;
        }
        if (
          floor.defaults.wallHeight.evidence === "source_documented" ||
          floor.defaults.wallHeight.evidence === "site_measured"
        ) {
          showToast("Source-documented and site-measured wall heights stay locked");
          return;
        }
        const now = new Date().toISOString();
        try {
          const result = applyFloorPlanMeasuredPropertyMutationV2(
            canonicalDocument,
            {
              target: {
                kind: "floor_default",
                floorId: floor.id,
                property: "wallHeight",
              },
              valueMm: Math.round(height * 1000),
              evidence,
            },
            {
              mutationId: `floor-height:${floor.id}:${Date.now().toString(36)}`,
              nextRevisionId: `editor-revision:${Date.now().toString(36)}:floor-height`,
              actorId: "design-editor",
              mutatedAt: now,
              note:
                measurementNote?.trim() ||
                "Consumer edited the displayed floor wall height.",
            }
          );
          const committed = commitCanonicalTopologyMutationToSnapshotV2(
            currentSnapshot,
            result
          );
          runHistoryTransaction("Edit canonical floor wall height", () => {
            designSnapshotRef.current = committed.snapshot;
            setDesignSnapshot(committed.snapshot);
            setPlanOpenings(committed.openings);
            setPlanFixedElements(committed.fixedElements);
          });
          showToast(
            evidence === "site_measured"
              ? "Wall height saved as site measured"
              : "Wall height saved as user confirmed"
          );
        } catch (cause) {
          showToast(
            cause instanceof FloorPlanMeasuredPropertyMutationErrorV2
              ? cause.message
              : "The canonical floor height could not be changed"
          );
        }
        return;
      }
      const roomsOnFloor = currentSnapshot.rooms.filter(
        (room) => (room.floorLevel ?? 1) === activeFloorLevel
      );
      if (
        roomsOnFloor.length === 0 ||
        roomsOnFloor.every(
          (room) =>
            (room.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight) === height
        )
      ) {
        return;
      }
      const nextSnapshot = {
        ...currentSnapshot,
        rooms: currentSnapshot.rooms.map((room) =>
          (room.floorLevel ?? 1) === activeFloorLevel
            ? { ...room, geometry: { ...room.geometry, height } }
            : room
        ),
      };
      runHistoryTransaction("Edit floor wall height", () => {
        designSnapshotRef.current = nextSnapshot;
        setDesignSnapshot(nextSnapshot);
      });
      track("editor_floor_wall_height_changed", {
        floorLevel: activeFloorLevel,
        height,
        roomCount: roomsOnFloor.length,
      });
    },
    [
      activeFloorLevel,
      designSnapshotRef,
      runHistoryTransaction,
      setDesignSnapshot,
      setPlanFixedElements,
      setPlanOpenings,
      showToast,
    ]
  );

  const changeSelectedWallHeight = useCallback(
    (roomId: string, faceId: string, heightMeters: number) => {
      const height = clampRoomHeightMeters(heightMeters);
      const currentSnapshot = designSnapshotRef.current;
      if (
        currentSnapshot.floorPlan?.canonicalDocument?.floors.some((floor) =>
          floor.walls.some(
            (wall) =>
              wall.id === faceId && wall.adjacentRoomIds.includes(roomId)
          )
        )
      ) {
        showToast("Canonical wall height is source-controlled and cannot be overridden here");
        return;
      }
      const room = currentSnapshot.rooms.find((entry) => entry.id === roomId);
      if (!room) return;
      const defaultHeight = room.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight;
      const currentOverrides = room.geometry.wallHeights ?? {};
      const nextOverrides = { ...currentOverrides };
      if (Math.abs(height - defaultHeight) < 0.001) delete nextOverrides[faceId];
      else nextOverrides[faceId] = height;
      const currentHeight = currentOverrides[faceId] ?? defaultHeight;
      if (Math.abs(currentHeight - height) < 0.001) return;

      const nextSnapshot = updateRoom(currentSnapshot, {
        ...room,
        geometry: {
          ...room.geometry,
          wallHeights: Object.keys(nextOverrides).length ? nextOverrides : undefined,
        },
      });
      runHistoryTransaction("Edit wall height", () => {
        designSnapshotRef.current = nextSnapshot;
        setDesignSnapshot(nextSnapshot);
      });
      track("editor_wall_height_changed", { roomId, faceId, height });
    },
    [designSnapshotRef, runHistoryTransaction, setDesignSnapshot, showToast]
  );

  const resetSelectedWallHeight = useCallback(
    (roomId: string, faceId: string) => {
      const currentSnapshot = designSnapshotRef.current;
      if (
        currentSnapshot.floorPlan?.canonicalDocument?.floors.some((floor) =>
          floor.walls.some(
            (wall) =>
              wall.id === faceId && wall.adjacentRoomIds.includes(roomId)
          )
        )
      ) {
        showToast("Canonical wall height is source-controlled and has no room override");
        return;
      }
      const room = currentSnapshot.rooms.find((entry) => entry.id === roomId);
      if (!room?.geometry.wallHeights?.[faceId]) return;
      const nextOverrides = { ...room.geometry.wallHeights };
      delete nextOverrides[faceId];
      const nextSnapshot = updateRoom(currentSnapshot, {
        ...room,
        geometry: {
          ...room.geometry,
          wallHeights: Object.keys(nextOverrides).length ? nextOverrides : undefined,
        },
      });
      runHistoryTransaction("Reset wall height", () => {
        designSnapshotRef.current = nextSnapshot;
        setDesignSnapshot(nextSnapshot);
      });
      showToast(`${getWallFaceLabel(faceId)} now uses the floor wall height`);
      track("editor_wall_height_reset", { roomId, faceId });
    },
    [designSnapshotRef, runHistoryTransaction, setDesignSnapshot, showToast]
  );

  const changeActiveRoomSlabThicknessMm = useCallback(
    (
      valueMm: number,
      evidence: FloorPlanConsumerMeasurementEvidenceV2 = "user_confirmed",
      measurementNote?: string
    ) => {
      const slabThickness = clampSlabThicknessMeters(valueMm / 1000);
      const currentSnapshot = designSnapshotRef.current;
      const canonicalDocument = currentSnapshot.floorPlan?.canonicalDocument;
      if (canonicalDocument) {
        const floor =
          canonicalDocument.floors.find(
            (candidate) => candidate.levelIndex === activeFloorLevel - 1
          ) ??
          (canonicalDocument.floors.length === 1
            ? canonicalDocument.floors[0]
            : undefined);
        if (!floor) {
          showToast("Canonical slab thickness could not be matched to the active floor");
          return;
        }
        const currentEvidence =
          floor.verticalEvidence?.slabThickness.evidence ?? "assumed";
        if (currentEvidence === "source_documented" || currentEvidence === "site_measured") {
          showToast("Source-documented and site-measured slab thicknesses stay locked");
          return;
        }
        const now = new Date().toISOString();
        try {
          const result = applyFloorPlanMeasuredPropertyMutationV2(
            canonicalDocument,
            {
              target: { kind: "floor_slab_thickness", floorId: floor.id },
              valueMm: Math.round(slabThickness * 1000),
              evidence,
            },
            {
              mutationId: `slab-thickness:${floor.id}:${Date.now().toString(36)}`,
              nextRevisionId: `editor-revision:${Date.now().toString(36)}:slab-thickness`,
              actorId: "design-editor",
              mutatedAt: now,
              note:
                measurementNote?.trim() ||
                "Consumer edited the displayed slab thickness.",
            }
          );
          const committed = commitCanonicalTopologyMutationToSnapshotV2(
            currentSnapshot,
            result
          );
          runHistoryTransaction("Edit canonical slab thickness", () => {
            designSnapshotRef.current = committed.snapshot;
            setDesignSnapshot(committed.snapshot);
            setPlanOpenings(committed.openings);
            setPlanFixedElements(committed.fixedElements);
          });
          showToast(
            evidence === "site_measured"
              ? "Slab thickness saved as site measured"
              : "Slab thickness saved as user confirmed"
          );
        } catch (cause) {
          showToast(
            cause instanceof FloorPlanMeasuredPropertyMutationErrorV2
              ? cause.message
              : "The canonical slab thickness could not be changed"
          );
        }
        return;
      }
      updateActiveRoomGeometry("Edit slab thickness", (geometry) => ({
        ...geometry,
        slabThickness,
      }));
      track("editor_slab_thickness_changed", { slabThickness });
    },
    [
      activeFloorLevel,
      designSnapshotRef,
      runHistoryTransaction,
      setDesignSnapshot,
      setPlanFixedElements,
      setPlanOpenings,
      showToast,
      updateActiveRoomGeometry,
    ]
  );

  const changeActiveRoomBaseboardDepthMm = useCallback(
    (valueMm: number) => {
      const baseboardDepth = Math.max(
        0,
        Math.min(0.2, Number.isFinite(valueMm) ? valueMm / 1000 : 0)
      );
      updateActiveRoomGeometry("Edit baseboard projection", (geometry) => ({
        ...geometry,
        baseboardDepth,
      }));
      track("editor_baseboard_depth_changed", { baseboardDepth });
    },
    [updateActiveRoomGeometry]
  );

  const changeActiveRoomWallThicknessMm = useCallback(
    (valueMm: number) => {
      const wallThickness = clampWallThicknessMeters(valueMm / 1000);
      updateActiveRoomGeometry("Edit wall thickness", (geometry) => ({
        ...geometry,
        wallThickness,
      }));
      track("editor_wall_thickness_changed", { wallThickness });
    },
    [updateActiveRoomGeometry]
  );

  const changeActiveRoomSurfaceOpacity = useCallback(
    (kind: "wall" | "floor" | "ceiling", opacity: number) => {
      const nextOpacity = clampEditorOpacity(opacity);
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) return;
      const nextSnapshot = updateRoom(designSnapshotRef.current, {
        ...room,
        surfaceOpacity: {
          wall: room.surfaceOpacity?.wall ?? 1,
          floor: room.surfaceOpacity?.floor ?? 1,
          ceiling: room.surfaceOpacity?.ceiling ?? 1,
          [kind]: nextOpacity,
        },
      });
      runCoalescedHistoryTransaction(
        kind === "wall"
          ? "Edit wall opacity"
          : kind === "floor"
            ? "Edit floor opacity"
            : "Edit ceiling opacity",
        () => {
          designSnapshotRef.current = nextSnapshot;
          setDesignSnapshot(nextSnapshot);
        }
      );
      track("editor_surface_opacity_changed", { kind, opacity: nextOpacity });
    },
    [designSnapshotRef, runCoalescedHistoryTransaction, setDesignSnapshot]
  );

  const changeActiveRoomCeilingVisible = useCallback(
    (visible: boolean) => {
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) return;
      const nextSnapshot = updateRoom(designSnapshotRef.current, {
        ...room,
        ceilingVisible: visible,
      });
      history.begin(visible ? "Show ceiling" : "Hide ceiling");
      designSnapshotRef.current = nextSnapshot;
      setDesignSnapshot(nextSnapshot);
      history.commit();
      track("editor_ceiling_visibility_changed", { visible });
    },
    [designSnapshotRef, history, setDesignSnapshot]
  );

  const changeActiveRoomCeilingColor = useCallback(
    (color: string) => {
      const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#f8f8f6";
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) return;
      const nextSnapshot = updateRoom(designSnapshotRef.current, {
        ...room,
        surfaces: {
          ...room.surfaces,
          ...room.surfaceFinishes,
          ceilingColor: safeColor,
        },
        surfaceFinishes: {
          ...room.surfaceFinishes,
          ...room.surfaces,
          ceilingColor: safeColor,
        },
      });
      history.begin("Edit ceiling color");
      designSnapshotRef.current = nextSnapshot;
      setDesignSnapshot(nextSnapshot);
      history.commit();
      track("editor_ceiling_color_changed");
    },
    [designSnapshotRef, history, setDesignSnapshot]
  );

  return {
    actions: {
      changeActiveRoomHeightMm,
      changeSelectedWallHeight,
      resetSelectedWallHeight,
      changeActiveRoomSlabThicknessMm,
      changeActiveRoomBaseboardDepthMm,
      changeActiveRoomWallThicknessMm,
      changeActiveRoomSurfaceOpacity,
      changeActiveRoomCeilingVisible,
      changeActiveRoomCeilingColor,
    },
  };
}
