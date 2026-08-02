"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { track } from "@/lib/analytics";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { EditorViewMode, RoomOpening2D } from "@/lib/editorScene";
import {
  buildFloorPlanQualityReport,
  type FloorPlanQualityAction,
  type FloorPlanQualityIssue,
} from "@/lib/floor-plan-quality";
import type { DesignSnapshot } from "@/lib/room-types";

export type DesignPagePlanQualityState = {
  designSnapshot: DesignSnapshot;
  housePlanRooms: HousePlanRoom2D[];
  planOpenings: RoomOpening2D[];
  viewMode: EditorViewMode;
  isClientPreview: boolean;
  planCanvasInteractionActive: boolean;
};

export type DesignPagePlanQualityConfiguration = {
  reviewPanelTopPx: number;
  collapsedReviewPanelFallbackHeightPx: number;
  expandedReviewPanelFallbackHeightPx: number;
};

export type DesignPagePlanQualityActions = {
  switchRoom: (roomId: string) => void;
  goPlan: () => void;
  goFurnish: () => void;
  setViewMode: (viewMode: EditorViewMode) => void;
  clearNonRoomSelection: () => void;
  selectPlanRoom: (roomId: string | null) => void;
  setTraceOpeningKind: (kind: RoomOpening2D["kind"]) => void;
  updateSelection: (selectedIds: Set<string>, primaryId: string | null) => void;
  showToast: (message: string) => void;
};

export type UseDesignPagePlanQualityControllerInput = {
  state: DesignPagePlanQualityState;
  configuration: DesignPagePlanQualityConfiguration;
  actions: DesignPagePlanQualityActions;
};

export function useDesignPagePlanQualityController({
  state,
  configuration,
  actions,
}: UseDesignPagePlanQualityControllerInput) {
  const {
    designSnapshot,
    housePlanRooms,
    planOpenings,
    viewMode,
    isClientPreview,
    planCanvasInteractionActive,
  } = state;
  const {
    reviewPanelTopPx,
    collapsedReviewPanelFallbackHeightPx,
    expandedReviewPanelFallbackHeightPx,
  } = configuration;
  const {
    switchRoom,
    goPlan,
    goFurnish,
    setViewMode,
    clearNonRoomSelection,
    selectPlanRoom,
    setTraceOpeningKind,
    updateSelection,
    showToast,
  } = actions;

  const [reviewPanelCollapsed, setReviewPanelCollapsed] = useState(false);
  const [reviewPanelHeightPx, setReviewPanelHeightPx] = useState(0);
  const reviewPanelRef = useRef<HTMLDivElement | null>(null);
  const lastTrackedQualityRef = useRef<{
    score: number;
    label: string;
    issueCount: number;
  } | null>(null);

  const report = useMemo(
    () =>
      buildFloorPlanQualityReport({
        rooms: housePlanRooms,
        openings: planOpenings,
        items: designSnapshot.rooms.flatMap((room) =>
          room.items.map((item) => ({
            ...item,
            roomId: room.id,
          }))
        ),
        activeRoomId: designSnapshot.activeRoomId,
      }),
    [designSnapshot.activeRoomId, designSnapshot.rooms, housePlanRooms, planOpenings]
  );

  const reviewPanelVisible =
    !isClientPreview &&
    viewMode === "2d" &&
    report.issues.length > 0 &&
    !planCanvasInteractionActive;

  const setReviewPanelNode = useCallback((panel: HTMLDivElement | null) => {
    reviewPanelRef.current = panel;
    // The workspace conditionally unmounts the review panel when it is hidden.
    // Clear the old measurement so the next mount starts from the safe fallback.
    if (!panel) setReviewPanelHeightPx(0);
  }, []);

  useEffect(() => {
    if (!reviewPanelVisible) return;

    const panel = reviewPanelRef.current;
    if (!panel) return;

    const updatePanelHeight = () => {
      setReviewPanelHeightPx(Math.ceil(panel.getBoundingClientRect().height));
    };

    updatePanelHeight();
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePanelHeight);
    resizeObserver?.observe(panel);
    window.addEventListener("resize", updatePanelHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePanelHeight);
    };
  }, [report.issues.length, reviewPanelCollapsed, reviewPanelVisible]);

  useEffect(() => {
    if (housePlanRooms.length === 0) return;
    const previous = lastTrackedQualityRef.current;
    const current = {
      score: report.score,
      label: report.label,
      issueCount: report.issues.length,
    };
    if (!previous) {
      lastTrackedQualityRef.current = current;
      return;
    }
    const materiallyChanged =
      Math.abs(current.score - previous.score) >= 8 ||
      current.label !== previous.label ||
      Math.abs(current.issueCount - previous.issueCount) >= 2;
    if (!materiallyChanged) return;

    track("floor_plan_quality_changed", {
      score: current.score,
      label: current.label,
      previous_score: previous.score,
      previous_label: previous.label,
      issue_count: current.issueCount,
      top_issue: report.issues[0]?.id ?? null,
    });
    lastTrackedQualityRef.current = current;
  }, [housePlanRooms.length, report]);

  const activateIssue = useCallback(
    (action: FloorPlanQualityAction, issue?: FloorPlanQualityIssue) => {
      const target = issue?.target;
      const targetRoomId = target?.roomId ?? issue?.roomId ?? designSnapshot.activeRoomId;

      track("floor_plan_quality_fix_clicked", {
        action,
        issue_id: issue?.id ?? null,
        score: report.score,
        label: report.label,
        target_room_id: targetRoomId ?? null,
        target_wall: target?.wall ?? null,
        target_item_id: target?.itemInstanceId ?? null,
        top_issue: report.issues[0]?.id ?? null,
      });

      if (targetRoomId && designSnapshot.activeRoomId !== targetRoomId) {
        switchRoom(targetRoomId);
      }

      if (action === "add_window" || action === "add_doorway") {
        goPlan();
        setViewMode("2d");
        clearNonRoomSelection();
        if (targetRoomId) selectPlanRoom(targetRoomId);
        setTraceOpeningKind(action === "add_window" ? "window" : "door");
        showToast(
          action === "add_window"
            ? target?.wall
              ? `Add a window on the ${target.wall} wall`
              : "Add a window to the highlighted room"
            : target?.wall
              ? `Add a doorway on the ${target.wall} wall`
              : "Add a doorway for the highlighted rooms"
        );
        return;
      }

      if (action === "review_plan_layout") {
        goPlan();
        setViewMode("2d");
        clearNonRoomSelection();
        if (targetRoomId) selectPlanRoom(targetRoomId);
        showToast("Review the highlighted plan issue");
        return;
      }

      if (action === "review_furniture_fit") {
        goFurnish();
        selectPlanRoom(null);
        if (target?.itemInstanceId) {
          updateSelection(new Set([target.itemInstanceId]), target.itemInstanceId);
        }
        showToast("Review the highlighted furniture fit");
        return;
      }

      goFurnish();
      if (targetRoomId) selectPlanRoom(null);
      showToast("Add a storage piece or support space");
    },
    [
      clearNonRoomSelection,
      designSnapshot.activeRoomId,
      goFurnish,
      goPlan,
      report,
      selectPlanRoom,
      setTraceOpeningKind,
      setViewMode,
      showToast,
      switchRoom,
      updateSelection,
    ]
  );

  const toggleReviewPanel = useCallback(() => {
    setReviewPanelCollapsed((collapsed) => !collapsed);
  }, []);

  const reviewPanelFallbackHeightPx = reviewPanelCollapsed
    ? collapsedReviewPanelFallbackHeightPx
    : expandedReviewPanelFallbackHeightPx;
  const reviewPanelReservedBottomPx =
    reviewPanelTopPx + (reviewPanelHeightPx || reviewPanelFallbackHeightPx);

  return {
    state: {
      report,
      reviewPanelCollapsed,
      reviewPanelVisible,
      reviewPanelTopPx,
      reviewPanelReservedBottomPx,
    },
    refs: { setReviewPanelNode },
    actions: { toggleReviewPanel, activateIssue },
  };
}
