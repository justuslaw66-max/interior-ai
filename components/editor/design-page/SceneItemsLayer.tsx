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
import { getFurnitureWallInset } from "@/lib/design-page-geometry";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";
import type { DesignItem } from "@/lib/room-types";
import { CabinetDesignItemPlan2D } from "@/features/cabinetry/components/CabinetDesignItemPlan2D";
import { CabinetDesignItemSpatial3D } from "@/features/cabinetry/components/CabinetDesignItemSpatial3D";
import { isParametricCabinetItem } from "@/features/cabinetry/designItemAdapters";
import {
  resolveSceneItemViewContinuity,
  type SceneRoomItemEntry,
} from "@/lib/design-page-scene-domain";
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
  focusRoomId?: string | null;
};

export function SceneItemsLayer({
  state,
  configuration,
  resolvers,
  actions,
  focusRoomId = null,
}: SceneItemsLayerProps) {
  const visibleEntries = focusRoomId
    ? state.entries.filter((entry) => entry.roomId === focusRoomId)
    : state.entries;

  return (
    <>
      {visibleEntries.map((sceneEntry) => {
        if (!sceneEntry.visible) return null;

        const item = sceneEntry.item;
        const isActiveSceneRoom = sceneEntry.isActiveRoom;
        const roomOffset = sceneEntry.roomOffset;
        const projection: SceneProjection =
          configuration.viewMode === "3d" ? "spatial" : "plan";

        if (isParametricCabinetItem(item)) {
          const selected =
            isActiveSceneRoom &&
            configuration.editorMode !== "present" &&
            state.selectedIds.has(item.instanceId);
          const sceneRenderItemKey = `${sceneEntry.roomId}:${item.instanceId}:${item.productId}:${
            item.variantId ?? ""
          }:${configuration.renderQuality}`;
          const CabinetDesignItemRenderer =
            configuration.viewMode === "3d"
              ? CabinetDesignItemSpatial3D
              : CabinetDesignItemPlan2D;

          return (
            <group
              key={`${sceneEntry.roomId}:${item.instanceId}`}
              name={`${sceneEntry.layerId}:${item.instanceId}`}
              visible={sceneEntry.visible}
              userData={{
                sceneItemId: item.instanceId,
                sceneLayerId: sceneEntry.layerId,
              }}
            >
              <CabinetDesignItemRenderer
                sceneEntry={sceneEntry}
                item={item}
                selected={selected}
                interactive={
                  isActiveSceneRoom &&
                  configuration.editorMode !== "present" &&
                  !configuration.isClientPreview
                }
                showPlanLabel={configuration.planShowLabels}
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
            </group>
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
        const effectiveMaterialPreset =
          isActiveSceneRoom &&
          item.instanceId === state.selectedInstanceId &&
          state.previewMaterialPresetId
            ? state.previewMaterialPresetId
            : item.materialPreset;
        const selected =
          isActiveSceneRoom &&
          configuration.editorMode !== "present" &&
          state.selectedIds.has(item.instanceId);
        const continuity = resolveSceneItemViewContinuity(sceneEntry, {
          variantId: effectiveVariantId,
          visualDimensionsMm: configuredVisualDims,
          planningDimensionsMm: configuredPlanningDims,
          materialPreset: effectiveMaterialPreset,
          materialOverrides: item.materialOverrides,
          selected,
        });
        const effectiveProduct =
          continuity.visualDimensionsMm.w === product.dimsMm.w &&
          continuity.visualDimensionsMm.d === product.dimsMm.d &&
          continuity.visualDimensionsMm.h === product.dimsMm.h &&
          configuredModelUrl === product.assets.modelUrl
            ? product
            : {
                ...product,
                dimsMm: continuity.visualDimensionsMm,
                dimensionsMm: continuity.visualDimensionsMm,
                bounds: {
                  type: "aabb" as const,
                  size: {
                    w: continuity.visualDimensionsMm.w / 1000,
                    d: continuity.visualDimensionsMm.d / 1000,
                    h: continuity.visualDimensionsMm.h / 1000,
                  },
                  center: [
                    0,
                    continuity.visualDimensionsMm.h / 2000,
                    0,
                  ] as [number, number, number],
                },
                assets: {
                  ...product.assets,
                  modelUrl: configuredModelUrl ?? product.assets.modelUrl,
                },
              };
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
                continuity.localPosition[0],
                getCeilingMountedItemBaseY({
                  product: effectiveProduct,
                  dimsMm: continuity.visualDimensionsMm,
                  roomHeight: sceneEntry.roomHeight,
                }),
                continuity.localPosition[2],
              ]
            : continuity.localPosition);
        const sceneProjection = projectSceneRoomItem(
          sceneEntry,
          projection,
          renderLocalPosition
        );
        const sceneRenderItemKey = `${continuity.roomId}:${continuity.instanceId}:${continuity.productId}:${
          continuity.variantId ?? ""
        }:${configuration.renderQuality}`;

        return (
          <group
            key={`${sceneEntry.roomId}:${item.instanceId}`}
            name={`${continuity.layerId}:${continuity.instanceId}`}
            visible={continuity.visible}
            userData={{
              sceneItemId: continuity.instanceId,
              sceneLayerId: continuity.layerId,
            }}
          >
            <Furniture
              data-testid="item-in-scene"
              product={effectiveProduct}
              variantColor={variant.colorHex}
              variantName={variant.label}
              variantId={variant.id}
              variantRenderAssets={variant.renderAssets}
              hangingHeightCm={item.hangingHeightCm}
              planningBoundsMm={continuity.planningDimensionsMm}
              nodeTransforms={configuredNodeTransforms ?? undefined}
              initialPosition={sceneProjection.position}
              initialRotationY={continuity.rotationY}
              roomWidth={sceneEntry.roomWidth}
              roomDepth={sceneEntry.roomDepth}
              roomOriginX={roomOffset.x}
              roomOriginZ={roomOffset.z}
              roomPlanShape={sceneEntry.roomPlanShape}
              roomPlanPolygon={sceneEntry.roomPlanPolygon}
              roomPlanHoles={sceneEntry.roomPlanHoles}
              wallThickness={sceneEntry.roomWallThickness}
              wallContactInset={getFurnitureWallInset(
                sceneEntry.roomWallThickness
              )}
              onDraggingChange={actions.onDraggingChange}
              walls={isActiveSceneRoom ? configuration.walls : []}
              instanceId={continuity.instanceId}
              isSelected={continuity.selected}
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
                  configuredPlanningDimsMm: continuity.planningDimensionsMm,
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
              materialPreset={continuity.materialPreset}
              materialOverrides={continuity.materialOverrides}
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
          </group>
        );
      })}
    </>
  );
}
