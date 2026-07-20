"use client";

import type { ThreeEvent } from "@react-three/fiber";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import { Furniture } from "@/components/scene/FurnitureItem";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { resolveDesignItemVisualProduct } from "@/lib/design-item-product-snapshot";
import {
  findCatalogSurfacePlacement,
  getCeilingMountedItemBaseY,
  isCeilingOnlyCatalogItem,
  isSurfaceOnlyCatalogItem,
} from "@/lib/catalog-placement";
import type {
  ConfigurableNodeTransform,
  PlanMeasurementUnit,
  WallDescriptor,
} from "@/lib/design-page-types";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";
import type { DesignItem } from "@/lib/room-types";
import { CabinetDesignItemPlan2D } from "@/features/cabinetry/components/CabinetDesignItemPlan2D";
import { CabinetDesignItemSpatial3D } from "@/features/cabinetry/components/CabinetDesignItemSpatial3D";
import { isParametricCabinetItem } from "@/features/cabinetry/designItemAdapters";
import type { SceneRoomItemEntry } from "@/lib/design-page-scene-domain";
import {
  projectSceneRoomItem,
  removeSceneProjectionElevation,
  type SceneProjection,
} from "@/lib/design-page-scene-projection";

export type SceneItemDimensionsMm = {
  w: number;
  d: number;
  h: number;
};

export type { SceneRoomItemEntry } from "@/lib/design-page-scene-domain";

export type SceneItemMoveContext = {
  sceneEntry: SceneRoomItemEntry;
  configuredPlanningDimsMm: SceneItemDimensionsMm;
  id: string;
  position: [number, number, number];
};

export type SceneItemDragEndContext = {
  sceneEntry: SceneRoomItemEntry;
  id: string;
  position: [number, number, number];
};

type SceneItemsLayerState = {
  entries: SceneRoomItemEntry[];
  selectedIds: ReadonlySet<string>;
  selectedInstanceId: string | null;
  previewVariantId: string | null;
  previewMaterialPresetId: string | null;
  hoveredCartInstanceId: string | null;
  activeSceneItemsForGuides: DesignItem[];
  itemPlanningBoundsByInstanceId: Record<string, SceneItemDimensionsMm>;
};

type SceneItemsLayerConfiguration = {
  editorMode: DesignPageEditorMode;
  viewMode: EditorViewMode;
  isClientPreview: boolean;
  canEdit: boolean;
  isDesigner: boolean;
  hasWholeHousePlan: boolean;
  renderQuality: "standard" | "lite";
  walls: WallDescriptor[];
  snapEnabled: boolean;
  rotationSnapStepRadians: number;
  rotationSnapStepDegrees: number;
  rotationSnapEnabled: boolean;
  planShowLabels: boolean;
  planShowDimensions: boolean;
  planMeasurementUnit: PlanMeasurementUnit;
};

type SceneItemsLayerResolvers = {
  resolveItemConfigurationEntry: (item: DesignItem) => unknown | null;
  resolveConfiguredVisualDimsMm: (
    item: DesignItem,
    product: CatalogItemSchema
  ) => SceneItemDimensionsMm;
  resolveConfiguredPlanningDimsMm: (
    item: DesignItem,
    product: CatalogItemSchema
  ) => SceneItemDimensionsMm;
  resolveConfiguredModelUrl: (
    item: DesignItem,
    fallbackModelUrl: string | undefined,
    variantId: string
  ) => string | undefined;
  resolveConfiguredNodeTransforms: (
    item: DesignItem
  ) => Record<string, ConfigurableNodeTransform> | null;
  getRoomItems: (roomId: string) => DesignItem[];
};

type ItemRotationMeta = {
  source?: "keyboard" | "handle" | "inspector" | "canvas";
  snap?: boolean;
};

type SceneItemsLayerActions = {
  onDraggingChange: (dragging: boolean) => void;
  onRenderReadyChange: (key: string, ready: boolean) => void;
  onSelect: (id: string, additive: boolean) => void;
  onDuplicateSelectedItem: () => void;
  onDeleteSelectedItem: () => void;
  onMove: (context: SceneItemMoveContext) => boolean | void;
  onDragPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onRotate: (id: string, rotationY: number, meta?: ItemRotationMeta) => boolean | void;
  onSnapPulse: () => void;
  onDragEnd: (context: SceneItemDragEndContext) => void;
};

type SceneItemsLayerProps = {
  state: SceneItemsLayerState;
  configuration: SceneItemsLayerConfiguration;
  resolvers: SceneItemsLayerResolvers;
  actions: SceneItemsLayerActions;
};

export function SceneItemsLayer({
  state,
  configuration,
  resolvers,
  actions,
}: SceneItemsLayerProps) {
  return (
    <>
      {state.entries.map((sceneEntry) => {
        const item = sceneEntry.item;
        const isActiveSceneRoom = sceneEntry.isActiveRoom;
        const roomOffset = sceneEntry.roomOffset;
        const projection: SceneProjection =
          configuration.viewMode === "3d" ? "spatial" : "plan";

        if (isParametricCabinetItem(item)) {
          const sceneRenderItemKey = `${sceneEntry.roomId}:${item.instanceId}:${item.productId}:${
            item.variantId ?? ""
          }:${configuration.renderQuality}`;
          const CabinetDesignItemRenderer =
            configuration.viewMode === "3d"
              ? CabinetDesignItemSpatial3D
              : CabinetDesignItemPlan2D;

          return (
            <CabinetDesignItemRenderer
              key={`${sceneEntry.roomId}:${item.instanceId}`}
              sceneEntry={sceneEntry}
              item={item}
              selected={
                isActiveSceneRoom &&
                configuration.editorMode !== "present" &&
                state.selectedIds.has(item.instanceId)
              }
              interactive={
                isActiveSceneRoom &&
                configuration.editorMode !== "present" &&
                !configuration.isClientPreview
              }
              renderReadyKey={sceneRenderItemKey}
              onRenderReadyChange={actions.onRenderReadyChange}
              onSelect={(id, additive) => {
                if (!isActiveSceneRoom) return;
                if (
                  configuration.editorMode === "buy" ||
                  configuration.editorMode === "present"
                ) {
                  return;
                }
                actions.onSelect(id, additive);
              }}
            />
          );
        }

        const product = resolveDesignItemVisualProduct(item, CATALOG_ITEMS);
        if (!product) return null;

        const effectiveVariantId =
          isActiveSceneRoom &&
          item.instanceId === state.selectedInstanceId &&
          state.previewVariantId
            ? state.previewVariantId
            : item.variantId;
        const variant =
          product.variants.find((candidate) => candidate.id === effectiveVariantId) ??
          product.variants[0];
        const configurationEntry = resolvers.resolveItemConfigurationEntry(item);
        const configuredVisualDimsBase = resolvers.resolveConfiguredVisualDimsMm(item, product);
        const configuredPlanningDimsBase = resolvers.resolveConfiguredPlanningDimsMm(item, product);
        const variantDims = variant?.dimensionsMm;
        const useVariantDims = Boolean(
          !configurationEntry &&
            variantDims &&
            Number(variantDims.w) > 0 &&
            Number(variantDims.d) > 0
        );
        const configuredVisualDims = useVariantDims
          ? {
              w: variantDims!.w,
              d: variantDims!.d,
              h: Number(variantDims!.h) > 0 ? variantDims!.h : configuredVisualDimsBase.h,
            }
          : configuredVisualDimsBase;
        const configuredPlanningDims = useVariantDims
          ? {
              w: variantDims!.w,
              d: variantDims!.d,
              h: Number(variantDims!.h) > 0 ? variantDims!.h : configuredPlanningDimsBase.h,
            }
          : configuredPlanningDimsBase;
        const configuredModelUrl = resolvers.resolveConfiguredModelUrl(
          item,
          product.assets.modelUrl,
          variant.id
        );
        const configuredNodeTransforms = resolvers.resolveConfiguredNodeTransforms(item);
        const effectiveProduct =
          configuredVisualDims.w === product.dimsMm.w &&
          configuredVisualDims.d === product.dimsMm.d &&
          configuredVisualDims.h === product.dimsMm.h &&
          configuredModelUrl === product.assets.modelUrl
            ? product
            : {
                ...product,
                dimsMm: configuredVisualDims,
                dimensionsMm: configuredVisualDims,
                bounds: {
                  type: "aabb" as const,
                  size: {
                    w: configuredVisualDims.w / 1000,
                    d: configuredVisualDims.d / 1000,
                    h: configuredVisualDims.h / 1000,
                  },
                  center: [0, configuredVisualDims.h / 2000, 0] as [number, number, number],
                },
                assets: {
                  ...product.assets,
                  modelUrl: configuredModelUrl ?? product.assets.modelUrl,
                },
              };
        const effectiveMaterialPreset =
          isActiveSceneRoom &&
          item.instanceId === state.selectedInstanceId &&
          state.previewMaterialPresetId
            ? state.previewMaterialPresetId
            : item.materialPreset;
        const recoveredSurfacePlacement =
          isSurfaceOnlyCatalogItem(effectiveProduct) && (item.position[1] ?? 0) <= 0.001
            ? findCatalogSurfacePlacement({
                productId: item.productId,
                variantId: effectiveVariantId,
                purchaseOptionId: item.purchaseOptionId,
                roomId: sceneEntry.roomId,
                items: resolvers.getRoomItems(sceneEntry.roomId),
                nearPosition: item.position,
              })
            : null;
        const renderLocalPosition: [number, number, number] =
          recoveredSurfacePlacement?.position ??
          (isCeilingOnlyCatalogItem(effectiveProduct)
            ? [
                item.position[0],
                getCeilingMountedItemBaseY({
                  product: effectiveProduct,
                  dimsMm: configuredVisualDims,
                  roomHeight: sceneEntry.roomHeight,
                }),
                item.position[2],
              ]
            : item.position);
        const sceneProjection = projectSceneRoomItem(
          sceneEntry,
          projection,
          renderLocalPosition
        );
        const sceneRenderItemKey = `${sceneEntry.roomId}:${item.instanceId}:${item.productId}:${
          effectiveVariantId ?? ""
        }:${configuration.renderQuality}`;

        return (
          <Furniture
            key={`${sceneEntry.roomId}:${item.instanceId}`}
            data-testid="item-in-scene"
            product={effectiveProduct}
            variantColor={variant.colorHex}
            variantName={variant.label}
            variantId={variant.id}
            variantRenderAssets={variant.renderAssets}
            hangingHeightCm={item.hangingHeightCm}
            planningBoundsMm={configuredPlanningDims}
            nodeTransforms={configuredNodeTransforms ?? undefined}
            initialPosition={sceneProjection.position}
            initialRotationY={sceneProjection.rotationY}
            roomWidth={sceneEntry.roomWidth}
            roomDepth={sceneEntry.roomDepth}
            roomOriginX={roomOffset.x}
            roomOriginZ={roomOffset.z}
            roomPlanShape={sceneEntry.roomPlanShape}
            roomPlanPolygon={sceneEntry.roomPlanPolygon}
            roomPlanHoles={sceneEntry.roomPlanHoles}
            wallThickness={sceneProjection.wallThickness}
            wallContactInset={sceneProjection.wallContactInset}
            onDraggingChange={actions.onDraggingChange}
            walls={isActiveSceneRoom ? configuration.walls : []}
            instanceId={item.instanceId}
            isSelected={
              isActiveSceneRoom &&
              configuration.editorMode !== "present" &&
              state.selectedIds.has(item.instanceId)
            }
            isPrimarySelected={
              isActiveSceneRoom && item.instanceId === state.selectedInstanceId
            }
            onDuplicate={() => {
              if (item.instanceId !== state.selectedInstanceId) return;
              actions.onDuplicateSelectedItem();
            }}
            onDelete={() => {
              if (item.instanceId !== state.selectedInstanceId) return;
              actions.onDeleteSelectedItem();
            }}
            rotationSnapStepRadians={configuration.rotationSnapStepRadians}
            rotationSnapStepDegrees={configuration.rotationSnapStepDegrees}
            rotationSnapEnabled={configuration.rotationSnapEnabled}
            showGuidesAndMeasurements={
              isActiveSceneRoom &&
              (configuration.editorMode === "design" || configuration.editorMode === "adjust")
            }
            cartPreviewed={
              isActiveSceneRoom &&
              configuration.editorMode === "buy" &&
              state.hoveredCartInstanceId === item.instanceId
            }
            viewMode={configuration.viewMode}
            planShowLabels={configuration.planShowLabels}
            planShowDimensions={configuration.planShowDimensions}
            planMeasurementUnit={configuration.planMeasurementUnit}
            renderQuality={configuration.renderQuality}
            renderReadyKey={sceneRenderItemKey}
            onRenderReadyChange={actions.onRenderReadyChange}
            onSelect={(id, additive) => {
              if (!isActiveSceneRoom) return;
              if (
                configuration.editorMode === "buy" ||
                configuration.editorMode === "present"
              ) {
                return;
              }
              actions.onSelect(id, additive);
            }}
            onMove={(id, position) =>
              actions.onMove({
                sceneEntry,
                configuredPlanningDimsMm: configuredPlanningDims,
                id,
                position: removeSceneProjectionElevation(
                  sceneEntry,
                  projection,
                  position
                ),
              })
            }
            onDragPointerMove={actions.onDragPointerMove}
            onRotate={actions.onRotate}
            locked={item.locked}
            interactive={configuration.canEdit && isActiveSceneRoom}
            allowCrossRoomDrag={configuration.hasWholeHousePlan && isActiveSceneRoom}
            showSelection={configuration.canEdit && isActiveSceneRoom}
            showLocks={
              configuration.isDesigner &&
              !configuration.isClientPreview &&
              isActiveSceneRoom
            }
            onSnapPulse={actions.onSnapPulse}
            enableSnap={
              configuration.snapEnabled &&
              !configuration.isClientPreview &&
              isActiveSceneRoom
            }
            items={isActiveSceneRoom ? state.activeSceneItemsForGuides : []}
            itemPlanningBoundsByInstanceId={state.itemPlanningBoundsByInstanceId}
            materialPreset={effectiveMaterialPreset}
            materialOverrides={item.materialOverrides}
            onDragEnd={(id, position) =>
              actions.onDragEnd({
                sceneEntry,
                id,
                position: removeSceneProjectionElevation(
                  sceneEntry,
                  projection,
                  position
                ),
              })
            }
          />
        );
      })}
    </>
  );
}
