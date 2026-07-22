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
import { ImportedFloorPlanWallEditor } from "@/components/editor/design-page/ImportedFloorPlanWallEditor";
import { PlanQualityReviewPanel } from "@/components/editor/design-page/PlanQualityReviewPanel";
import { PlanRoomSummaryCard } from "@/components/editor/design-page/PlanRoomSummaryCard";
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
type PlanRoomSummaryProps = ComponentProps<typeof PlanRoomSummaryCard>;
type AiLayoutPreviewBannerProps = ComponentProps<
  typeof AiLayoutPreviewBanner
>;
type CrossRoomDragTargetProps = ComponentProps<typeof CrossRoomDragTarget>;
type ViewportSelectionControlsProps = ComponentProps<
  typeof DesignPageViewportSelectionControls
>;
type RoomPanNavigatorProps = ComponentProps<typeof RoomPanNavigator>;
type FloorPropertiesPanelProps = ComponentProps<typeof FloorPropertiesPanel>;
type ImportedWallEditorProps = ComponentProps<typeof ImportedFloorPlanWallEditor>;

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
  planSummary: PlanRoomSummaryProps["state"] | null;
  planQuality: PlanQualityReviewPanelProps["state"] | null;
  planCanvas: PlanCanvasOverlaysProps["state"];
  aiLayoutPreview: AiLayoutPreviewBannerProps["state"] | null;
  crossRoomDragTarget: CrossRoomDragTargetProps["state"] | null;
  navigator: RoomPanNavigatorState | null;
  floorProperties: FloorPropertiesState | null;
  importedWallEditor: ImportedWallEditorProps["state"] | null;
  selectionControls: ViewportSelectionControlsProps["state"];
};

export type DesignPageViewportOverlayLayerConfiguration = {
  sceneLoading: SceneReadyVeilProps["configuration"];
  selectedOpening: SelectedPlanOpeningActionsProps["configuration"];
  selectionInspector: Omit<
    SelectionInspectorProps["configuration"],
    "portalTarget"
  >;
  planSummary: Omit<PlanRoomSummaryProps["configuration"], "mobile">;
  planQuality: Omit<
    PlanQualityReviewPanelProps["configuration"],
    "portalTarget"
  >;
  aiLayoutPreview: AiLayoutPreviewBannerProps["configuration"];
  navigator: RoomPanNavigatorConfiguration;
  floorProperties: FloorPropertiesConfiguration;
  importedWallEditor: ImportedWallEditorProps["configuration"];
  selectionControls: ViewportSelectionControlsProps["configuration"];
};

export type DesignPageViewportOverlayLayerReferences = {
  planQuality: PlanQualityReviewPanelProps["references"];
};

export type DesignPageViewportOverlayLayerActions = {
  selectedOpening: SelectedPlanOpeningActionsProps["actions"];
  selectionInspector: SelectionInspectorProps["actions"];
  planSummary: PlanRoomSummaryProps["actions"];
  planQuality: PlanQualityReviewPanelProps["actions"];
  planCanvas: PlanCanvasOverlaysProps["actions"];
  aiLayoutPreview: AiLayoutPreviewBannerProps["actions"];
  navigator: RoomPanNavigatorActions;
  floorProperties: FloorPropertiesActions;
  importedWallEditor: ImportedWallEditorProps["actions"];
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
  const [importedWallRailElement, setImportedWallRailElement] =
    useState<HTMLDivElement | null>(null);
  const [reviewRailElement, setReviewRailElement] =
    useState<HTMLDivElement | null>(null);
  const [selectionRailElement, setSelectionRailElement] =
    useState<HTMLDivElement | null>(null);
  const [planSummaryRailElement, setPlanSummaryRailElement] =
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
          {state.planSummary ? (
            <div
              ref={setPlanSummaryRailElement}
              className="pointer-events-auto w-[264px] shrink-0"
            />
          ) : null}
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
          {state.importedWallEditor ? (
            <div
              ref={setImportedWallRailElement}
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

      {state.planSummary ? (
        <div className="absolute bottom-3 right-3 z-50 w-[min(20rem,calc(100%-4.5rem))] lg:hidden">
          <PlanRoomSummaryCard
            state={state.planSummary}
            configuration={{ ...configuration.planSummary, mobile: true }}
            actions={actions.planSummary}
          />
        </div>
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

      {state.railVisible && state.planSummary && planSummaryRailElement
        ? createPortal(
            <PlanRoomSummaryCard
              state={state.planSummary}
              configuration={configuration.planSummary}
              actions={actions.planSummary}
            />,
            planSummaryRailElement
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

      {state.importedWallEditor && importedWallRailElement
        ? createPortal(
            <ImportedFloorPlanWallEditor
              state={state.importedWallEditor}
              configuration={configuration.importedWallEditor}
              actions={actions.importedWallEditor}
            />,
            importedWallRailElement
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
