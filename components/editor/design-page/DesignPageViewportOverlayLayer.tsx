"use client";

import { useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import FloorPropertiesPanel from "@/components/editor/FloorPropertiesPanel";
import RoomPanNavigator from "@/components/editor/RoomPanNavigator";
import { AiLayoutPreviewBanner } from "@/components/editor/design-page/AiLayoutPreviewBanner";
import { CrossRoomDragTarget } from "@/components/editor/design-page/CrossRoomDragTarget";
import { DesignPagePlanCanvasOverlays } from "@/components/editor/design-page/DesignPagePlanCanvasOverlays";
import { DesignPageSelectionInspector } from "@/components/editor/design-page/DesignPageSelectionInspector";
import { DesignPageViewportSelectionControls } from "@/components/editor/design-page/DesignPageViewportSelectionControls";
import { PlanQualityReviewPanel } from "@/components/editor/design-page/PlanQualityReviewPanel";
import { SceneReadyVeil } from "@/components/editor/design-page/SceneReadyVeil";
import { SelectedPlanOpeningActions } from "@/components/editor/design-page/SelectedPlanOpeningActions";

type SceneReadyVeilProps = ComponentProps<typeof SceneReadyVeil>;
type SelectedPlanOpeningActionsProps = ComponentProps<
  typeof SelectedPlanOpeningActions
>;
type SelectionInspectorProps = ComponentProps<
  typeof DesignPageSelectionInspector
>;
type PlanQualityReviewPanelProps = ComponentProps<
  typeof PlanQualityReviewPanel
>;
type PlanCanvasOverlaysProps = ComponentProps<
  typeof DesignPagePlanCanvasOverlays
>;
type AiLayoutPreviewBannerProps = ComponentProps<
  typeof AiLayoutPreviewBanner
>;
type CrossRoomDragTargetProps = ComponentProps<typeof CrossRoomDragTarget>;
type ViewportSelectionControlsProps = ComponentProps<
  typeof DesignPageViewportSelectionControls
>;
type RoomPanNavigatorProps = ComponentProps<typeof RoomPanNavigator>;
type FloorPropertiesPanelProps = ComponentProps<typeof FloorPropertiesPanel>;

type HandlerKeys<T> = Extract<keyof T, `on${string}`>;

type RoomPanNavigatorState = Omit<
  RoomPanNavigatorProps,
  HandlerKeys<RoomPanNavigatorProps> | "dark" | "disabled"
>;
type RoomPanNavigatorConfiguration = Pick<
  RoomPanNavigatorProps,
  "dark" | "disabled"
>;
type RoomPanNavigatorActions = Pick<
  RoomPanNavigatorProps,
  HandlerKeys<RoomPanNavigatorProps>
>;

type FloorPropertiesState = Omit<
  FloorPropertiesPanelProps,
  HandlerKeys<FloorPropertiesPanelProps> | "dark" | "canEdit"
>;
type FloorPropertiesConfiguration = Pick<
  FloorPropertiesPanelProps,
  "dark" | "canEdit"
>;
type FloorPropertiesActions = Pick<
  FloorPropertiesPanelProps,
  HandlerKeys<FloorPropertiesPanelProps>
>;

export type DesignPageViewportOverlayLayerState = {
  railVisible: boolean;
  sceneLoadingVisible: boolean;
  selectedOpening: SelectedPlanOpeningActionsProps["state"] | null;
  selectionInspector: SelectionInspectorProps["state"] | null;
  planQuality: PlanQualityReviewPanelProps["state"] | null;
  planCanvas: PlanCanvasOverlaysProps["state"];
  aiLayoutPreview: AiLayoutPreviewBannerProps["state"] | null;
  crossRoomDragTarget: CrossRoomDragTargetProps["state"] | null;
  navigator: RoomPanNavigatorState | null;
  floorProperties: FloorPropertiesState | null;
  selectionControls: ViewportSelectionControlsProps["state"];
};

export type DesignPageViewportOverlayLayerConfiguration = {
  sceneLoading: SceneReadyVeilProps["configuration"];
  selectedOpening: SelectedPlanOpeningActionsProps["configuration"];
  selectionInspector: Omit<
    SelectionInspectorProps["configuration"],
    "portalTarget"
  >;
  planQuality: Omit<
    PlanQualityReviewPanelProps["configuration"],
    "portalTarget"
  >;
  aiLayoutPreview: AiLayoutPreviewBannerProps["configuration"];
  navigator: RoomPanNavigatorConfiguration;
  floorProperties: FloorPropertiesConfiguration;
  selectionControls: ViewportSelectionControlsProps["configuration"];
};

export type DesignPageViewportOverlayLayerReferences = {
  planQuality: PlanQualityReviewPanelProps["references"];
};

export type DesignPageViewportOverlayLayerActions = {
  selectedOpening: SelectedPlanOpeningActionsProps["actions"];
  selectionInspector: SelectionInspectorProps["actions"];
  planQuality: PlanQualityReviewPanelProps["actions"];
  planCanvas: PlanCanvasOverlaysProps["actions"];
  aiLayoutPreview: AiLayoutPreviewBannerProps["actions"];
  navigator: RoomPanNavigatorActions;
  floorProperties: FloorPropertiesActions;
  selectionControls: ViewportSelectionControlsProps["actions"];
};

type DesignPageViewportOverlayLayerProps = {
  state: DesignPageViewportOverlayLayerState;
  configuration: DesignPageViewportOverlayLayerConfiguration;
  references: DesignPageViewportOverlayLayerReferences;
  actions: DesignPageViewportOverlayLayerActions;
};

export function DesignPageViewportOverlayLayer({
  state,
  configuration,
  references,
  actions,
}: DesignPageViewportOverlayLayerProps) {
  const [navigatorRailElement, setNavigatorRailElement] =
    useState<HTMLDivElement | null>(null);
  const [floorRailElement, setFloorRailElement] =
    useState<HTMLDivElement | null>(null);
  const [reviewRailElement, setReviewRailElement] =
    useState<HTMLDivElement | null>(null);
  const [selectionRailElement, setSelectionRailElement] =
    useState<HTMLDivElement | null>(null);

  return (
    <>
      {state.railVisible ? (
        <aside
          data-testid="plan-right-rail"
          aria-label="Plan information and controls"
          className="pointer-events-none absolute bottom-24 right-1 top-16 z-30 hidden w-[268px] flex-col gap-2 overflow-y-auto overflow-x-hidden pr-1 lg:flex"
          style={{ overscrollBehavior: "contain" }}
        >
          {state.navigator ? (
            <div
              ref={setNavigatorRailElement}
              className="pointer-events-auto w-[264px] shrink-0"
            />
          ) : null}
          {state.floorProperties ? (
            <div
              ref={setFloorRailElement}
              className="pointer-events-auto w-[264px] shrink-0"
            />
          ) : null}
          {state.planQuality ? (
            <div
              ref={setReviewRailElement}
              className="pointer-events-auto w-[264px] shrink-0"
            />
          ) : null}
          {state.selectionInspector ? (
            <div
              ref={setSelectionRailElement}
              className="pointer-events-auto w-[264px] shrink-0"
            />
          ) : null}
        </aside>
      ) : null}

      {state.sceneLoadingVisible ? (
        <SceneReadyVeil configuration={configuration.sceneLoading} />
      ) : null}

      {state.selectedOpening ? (
        <SelectedPlanOpeningActions
          state={state.selectedOpening}
          configuration={configuration.selectedOpening}
          actions={actions.selectedOpening}
        />
      ) : null}

      {state.selectionInspector ? (
        <DesignPageSelectionInspector
          state={state.selectionInspector}
          configuration={{
            ...configuration.selectionInspector,
            portalTarget: selectionRailElement,
          }}
          actions={actions.selectionInspector}
        />
      ) : null}

      {state.planQuality ? (
        <PlanQualityReviewPanel
          state={state.planQuality}
          configuration={{
            ...configuration.planQuality,
            portalTarget: reviewRailElement,
          }}
          references={references.planQuality}
          actions={actions.planQuality}
        />
      ) : null}

      <DesignPagePlanCanvasOverlays
        state={state.planCanvas}
        actions={actions.planCanvas}
      />

      {state.aiLayoutPreview ? (
        <AiLayoutPreviewBanner
          state={state.aiLayoutPreview}
          configuration={configuration.aiLayoutPreview}
          actions={actions.aiLayoutPreview}
        />
      ) : null}

      {state.crossRoomDragTarget ? (
        <CrossRoomDragTarget state={state.crossRoomDragTarget} />
      ) : null}

      {state.railVisible && state.navigator && navigatorRailElement
        ? createPortal(
            <RoomPanNavigator
              {...state.navigator}
              {...configuration.navigator}
              {...actions.navigator}
            />,
            navigatorRailElement
          )
        : null}

      {state.floorProperties && floorRailElement
        ? createPortal(
            <FloorPropertiesPanel
              {...state.floorProperties}
              {...configuration.floorProperties}
              {...actions.floorProperties}
            />,
            floorRailElement
          )
        : null}

      <DesignPageViewportSelectionControls
        state={state.selectionControls}
        configuration={configuration.selectionControls}
        actions={actions.selectionControls}
      />
    </>
  );
}
