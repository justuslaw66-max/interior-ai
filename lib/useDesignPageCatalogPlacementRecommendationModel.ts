"use client";

import { useMemo } from "react";

import { CATALOG_ITEMS } from "@/lib/catalog";
import type { PendingCatalogPlacement } from "@/lib/catalog-placement";
import {
  findBestCatalogRoomPlacement,
  findBestCatalogVariantPlacement,
  findCatalogPlacementImprovement,
  resolveCatalogPlacementAssessment,
  type CatalogBestRoomPlacement,
  type CatalogBestVariantPlacement,
  type CatalogPlacementAssessment,
  type CatalogPlacementImprovement,
  type FindSmartCatalogPlacement,
  type ScoreCatalogPlacement,
} from "@/lib/catalog-placement-policy";
import type { ManualPlacementScore } from "@/lib/manual-placement-scoring";
import type { RoomSnapshot } from "@/lib/room-types";

export type UseDesignPageCatalogPlacementRecommendationModelInput = {
  state: {
    pendingPlacement: PendingCatalogPlacement | null;
    pendingScore: ManualPlacementScore | null;
    blocked: boolean;
    blockerLabel: string | null;
    pendingRoom: RoomSnapshot | null;
    restorablePlacement: PendingCatalogPlacement | null;
  };
  configuration: {
    activeRoom: RoomSnapshot | null;
    activeRoomId: string;
    rooms: RoomSnapshot[];
    roomSnapshotById: ReadonlyMap<string, RoomSnapshot>;
  };
  queries: {
    getActiveRoomId: () => string;
    findSmartCatalogPlacement: FindSmartCatalogPlacement;
    scoreCatalogPlacement: ScoreCatalogPlacement;
  };
};

export type DesignPageCatalogPlacementRecommendationModel = {
  pendingCatalogPlacementImprovement: CatalogPlacementImprovement | null;
  pendingCatalogBestRoomPlacement: CatalogBestRoomPlacement | null;
  pendingCatalogBestVariantPlacement: CatalogBestVariantPlacement | null;
  pendingCatalogPlacementAssessment: CatalogPlacementAssessment;
};

export function useDesignPageCatalogPlacementRecommendationModel({
  state,
  configuration,
  queries,
}: UseDesignPageCatalogPlacementRecommendationModelInput): DesignPageCatalogPlacementRecommendationModel {
  const {
    pendingPlacement,
    pendingScore,
    blocked,
    blockerLabel,
    pendingRoom,
    restorablePlacement,
  } = state;
  const { activeRoom, activeRoomId, rooms, roomSnapshotById } = configuration;
  const {
    getActiveRoomId,
    findSmartCatalogPlacement,
    scoreCatalogPlacement,
  } = queries;

  const pendingCatalogPlacementImprovement =
    useMemo<CatalogPlacementImprovement | null>(() => {
      const targetRoom = pendingPlacement
        ? roomSnapshotById.get(
            pendingPlacement.roomId ?? getActiveRoomId()
          ) ?? activeRoom
        : null;
      return findCatalogPlacementImprovement({
        pendingPlacement,
        currentScore: pendingScore,
        targetRoom,
        findPlacement: findSmartCatalogPlacement,
        scorePlacement: scoreCatalogPlacement,
      });
    }, [
      activeRoom,
      findSmartCatalogPlacement,
      getActiveRoomId,
      pendingPlacement,
      pendingScore,
      roomSnapshotById,
      scoreCatalogPlacement,
    ]);

  const pendingCatalogBestRoomPlacement =
    useMemo<CatalogBestRoomPlacement | null>(
      () =>
        findBestCatalogRoomPlacement({
          pendingPlacement,
          currentScore: pendingScore,
          rooms,
          currentRoomId:
            pendingPlacement?.roomId ?? activeRoom?.id ?? activeRoomId,
          findPlacement: findSmartCatalogPlacement,
          scorePlacement: scoreCatalogPlacement,
        }),
      [
        activeRoom?.id,
        activeRoomId,
        findSmartCatalogPlacement,
        pendingPlacement,
        pendingScore,
        rooms,
        scoreCatalogPlacement,
      ]
    );

  const pendingCatalogBestVariantPlacement =
    useMemo<CatalogBestVariantPlacement | null>(() => {
      const targetRoom = pendingPlacement
        ? roomSnapshotById.get(
            pendingPlacement.roomId ?? getActiveRoomId()
          ) ?? activeRoom
        : null;
      return findBestCatalogVariantPlacement({
        pendingPlacement,
        currentScore: pendingScore,
        targetRoom,
        product: pendingPlacement
          ? CATALOG_ITEMS[pendingPlacement.productId] ?? null
          : null,
        findPlacement: findSmartCatalogPlacement,
        scorePlacement: scoreCatalogPlacement,
      });
    }, [
      activeRoom,
      findSmartCatalogPlacement,
      getActiveRoomId,
      pendingPlacement,
      pendingScore,
      roomSnapshotById,
      scoreCatalogPlacement,
    ]);

  const pendingCatalogPlacementAssessment = useMemo(
    () =>
      resolveCatalogPlacementAssessment({
        pendingPlacement,
        blocked,
        blockerLabel,
        targetRoomName: pendingRoom?.name ?? null,
        score: pendingScore,
        improvement: pendingCatalogPlacementImprovement,
        restorablePlacement,
      }),
    [
      blocked,
      blockerLabel,
      pendingCatalogPlacementImprovement,
      pendingRoom?.name,
      pendingScore,
      pendingPlacement,
      restorablePlacement,
    ]
  );

  return {
    pendingCatalogPlacementImprovement,
    pendingCatalogBestRoomPlacement,
    pendingCatalogBestVariantPlacement,
    pendingCatalogPlacementAssessment,
  };
}
