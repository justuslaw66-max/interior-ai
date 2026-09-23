"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import { track } from "@/lib/analytics";
import { CATALOG_ITEMS } from "@/lib/catalog";
import {
  aabbIntersects,
  getFurnitureWallInset,
  type AABB,
} from "@/lib/design-page-geometry";
import { getRotatedFootprint, snapRotationRadians } from "@/lib/design-page-utils";
import {
  PLAN_OPENING_DEFAULT_HEIGHT_METERS,
} from "@/lib/design-page-plan-overlays";
import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import type { RoomOpening2D } from "@/lib/editorScene";
import { getActiveRoom } from "@/lib/room-types";
import type {
  DesignItem,
  DesignSnapshot,
  LayoutVersion,
  RoomSnapshot,
} from "@/lib/room-types";
import { createCabinetMillworkDefinition, getCabinetMillworkAssemblyType } from "@/features/millwork/createCabinetMillworkDefinition";

import {
  buildCabinetAssetManifest,
  buildCabinetMillworkMetadata,
  buildCabinetTransformMetadata,
  buildPlacedCabinetAssetPackageInput,
  getCabinetPlanningDimsMm,
  getCabinetRotationY,
  isParametricCabinetItem,
  type ParametricCabinetDesignItem,
  updateCabinetPlacementMetadata,
} from "./designItemAdapters";
import {
  createCabinetPolygonWallSpaces,
  createCabinetRoomWallSpaces,
  getCabinetFitPlacement,
  mapCabinetCardinalOpeningsToPolygonWalls,
} from "./fitToSpace";
import { generateCabinetBOM } from "./generateCabinetBOM";
import {
  buildCabinetProjectHandoffPackage,
  buildCabinetProjectSchedulePackage,
  downloadCabinetProjectApprovalPackageJson,
  downloadCabinetProjectCncBatchPackageJson,
  downloadCabinetProjectCutListPackageJson,
  downloadCabinetProjectDrawingSetPackageJson,
  downloadCabinetProjectFabricationQuoteRequestJson,
  downloadCabinetProjectFabricationReleasePackageJson,
  downloadCabinetProjectFieldVerificationPackageJson,
  downloadCabinetProjectFinishSchedulePackageJson,
  downloadCabinetProjectHandoffPackageJson,
  downloadCabinetProjectInstallationPlanPackageJson,
  downloadCabinetProjectProcurementPackageJson,
  downloadCabinetProjectPurchaseReadinessPackageJson,
  downloadCabinetProjectQuotePackageJson,
  downloadCabinetProjectRevisionPackageJson,
  downloadCabinetProjectScheduleCsv,
  downloadCabinetProjectSchedulePackageJson,
  downloadCabinetProjectScopePackageJson,
  downloadCabinetPlacedAssetInstallerWorkOrderJson,
  downloadCabinetPlacedAssetPackageJson,
  generateCabinetDocumentation,
} from "./generateCabinetDocumentation";
import { generateCabinetParts } from "./generateCabinetParts";
import { SELECTED_CABINET_EXPORT_FEEDBACK } from "./selectedCabinetExportFeedback";
import type { SelectedCabinetExportKind } from "./selectedCabinetExportFeedback";
import { CABINETRY_STUDIO_FEATURE_ENABLED } from "./designPageFeatureFlags";
import { LocalCabinetAssetStorage } from "./storage/LocalCabinetAssetStorage";
import type {
  CabinetBOMItem,
  CabinetDefinition,
  CabinetDocumentationSnapshot,
  CabinetHostSpace,
  CabinetProjectHandoffPackage,
  CabinetProjectSchedulePackage,
  PlacedCabinetAsset,
} from "./types";

type ItemPosition = [number, number, number];
type ItemUpdater = DesignItem[] | ((previous: DesignItem[]) => DesignItem[]);

export type DesignPageCabinetryStudioState = {
  mode: "create" | "edit";
  instanceId?: string;
  initialDefinition?: CabinetDefinition;
};

export type SelectedCabinetDocumentation = CabinetDocumentationSnapshot & {
  bom: CabinetBOMItem[];
};

export type DesignPageCabinetrySelectedState = {
  item: ParametricCabinetDesignItem;
  planningDimensionsMm: { w: number; d: number; h: number } | null;
  documentation: SelectedCabinetDocumentation;
  assetManifest: NonNullable<DesignItem["millworkAssetManifest"]>;
  rotationY: number;
  bomLineCount: number;
};

export type DesignPageCabinetryProjectState = {
  assets: PlacedCabinetAsset[];
  schedulePackage: CabinetProjectSchedulePackage;
  handoffPackage: CabinetProjectHandoffPackage | null;
};

export type DesignPageCabinetryState = {
  studio: DesignPageCabinetryStudioState | null;
  canUseStudio: boolean;
  accessLevel: "consumer" | "pro";
  availableSpaces: CabinetHostSpace[];
  preferredSpaceId: string | null;
  selected: DesignPageCabinetrySelectedState | null;
  project: DesignPageCabinetryProjectState;
};

export type DesignPageCabinetryConfiguration = {
  isClientPreview: boolean;
  isDesigner: boolean;
  canEdit: boolean;
  designId: string | null;
  roomWidth: number;
  roomDepth: number;
  wallThickness: number;
  rotationSnapEnabled: boolean;
  rotationSnapStepRadians: number;
};

export type DesignPageCabinetryRefs = {
  getDesignSnapshot: () => DesignSnapshot;
  replaceActiveItemsSnapshot: (items: DesignItem[]) => void;
};

type ClampToRoom = (
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  roomWidth: number,
  roomDepth: number,
  wallThickness: number,
  rotationY?: number
) => [number, number];

type ClampToCatalogPlacementRoom = (
  room: RoomSnapshot,
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  rotationY?: number
) => [number, number];

type IsCatalogPlacementContainedInRoom = (
  room: RoomSnapshot,
  position: ItemPosition,
  rotationY: number,
  dimensionsMm: { w: number; d: number; h?: number }
) => boolean;

export type DesignPageCabinetryActions = {
  setDesignSnapshot: (
    next: DesignSnapshot | ((previous: DesignSnapshot) => DesignSnapshot)
  ) => void;
  commitItems: (updater: ItemUpdater, actionName?: string) => void;
  commitItemsToRoom: (
    roomId: string,
    updater: ItemUpdater,
    actionName?: string,
    options?: { activateRoom?: boolean; beforeLayoutVersion?: LayoutVersion }
  ) => DesignItem[] | null;
  updateSelection: (next: Set<string>, primaryId: string | null) => void;
  createInstanceId: () => string;
  clampToActiveRoom: ClampToRoom;
  clampToCatalogPlacementRoom: ClampToCatalogPlacementRoom;
  isCatalogPlacementContainedInRoom: IsCatalogPlacementContainedInRoom;
  getItemAABB: (
    item: DesignItem,
    positionOverride?: ItemPosition,
    rotationOverride?: number
  ) => AABB | null;
  getItemDisplayName: (item: DesignItem | null | undefined) => string | null;
  showToast: (message: string) => void;
};

export type UseDesignPageCabinetryInput = {
  state: {
    activeRoom: RoomSnapshot | null;
    activePlanRoom: { w: number; d: number } | null;
    planRoomCount: number;
    planOpenings: RoomOpening2D[];
    preferredWallFaceId: string | null;
    selectedItem: DesignItem | null;
    designSnapshot: DesignSnapshot;
  };
  configuration: DesignPageCabinetryConfiguration;
  refs: DesignPageCabinetryRefs;
  actions: DesignPageCabinetryActions;
};

export type DesignPageCabinetryControllerActions = {
  openCreateStudio: () => void;
  dismissStudio: () => void;
  saveDefinition: (definition: CabinetDefinition) => Promise<boolean>;
  placeInPlan: (payload: {
    definition: CabinetDefinition;
    glbBlob: Blob;
    bom: CabinetBOMItem[];
    placeAsCopy?: boolean;
  }) => Promise<boolean>;
  centerSelected: () => void;
  snapSelectedToWall: () => void;
  nudgeSelected: (deltaX: number, deltaZ: number) => void;
  rotateSelectedByDegrees: (deltaDegrees: number) => void;
  resetSelectedRotation: () => void;
  exportSelected: (kind: SelectedCabinetExportKind) => void;
  editSelected: () => void;
};

type CabinetryAvailableSpacesInput = {
  activeRoom: RoomSnapshot | null;
  activePlanRoom: { w: number; d: number } | null;
  planRoomCount: number;
  planOpenings: RoomOpening2D[];
};

export function buildCabinetryAvailableSpaces({
  activeRoom,
  activePlanRoom,
  planRoomCount,
  planOpenings,
}: CabinetryAvailableSpacesInput): CabinetHostSpace[] {
  if (!activeRoom) return [];

  const wallInsetMm = Math.round(
    (activeRoom.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness) * 1000
  );
  const widthMm = Math.max(
    1,
    Math.round((activePlanRoom?.w ?? activeRoom.geometry.width) * 1000) - wallInsetMm * 2
  );
  const depthMm = Math.max(
    1,
    Math.round((activePlanRoom?.d ?? activeRoom.geometry.depth) * 1000) - wallInsetMm * 2
  );
  const heightMm = Math.round(
    (activeRoom.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight) * 1000
  );
  const includeRoomlessOpenings = planRoomCount <= 1;
  const sharedSpaceInput = {
    roomId: activeRoom.id,
    roomName: activeRoom.name,
    roomType: activeRoom.roomType,
    heightMm,
    baseboardOffsetMm: Math.max(
      0,
      Math.round((activeRoom.geometry.baseboardDepth ?? 0) * 1000)
    ),
  };
  const roomOpenings = planOpenings
    .filter(
      (opening) =>
        opening.roomId === activeRoom.id ||
        (includeRoomlessOpenings && !opening.roomId)
    )
    .map((opening) => ({
      id: opening.id,
      wall: opening.wall,
      kind: opening.kind,
      offsetMm: opening.offsetMm,
      widthMm: opening.widthMm,
      heightMm:
        opening.heightMm ?? Math.round(PLAN_OPENING_DEFAULT_HEIGHT_METERS * 1000),
      bottomMm: opening.kind === "window" ? opening.bottomMm ?? 900 : 0,
      label: opening.kind === "door" ? "Door" : "Window",
    }));

  const planShape = activeRoom.planShape ?? "rectangle";
  if (planShape !== "rectangle") {
    const polygon =
      planShape === "custom_polygon" && activeRoom.planPolygon?.length
        ? activeRoom.planPolygon
        : [
            {
              x: -activeRoom.geometry.width / 2,
              z: -activeRoom.geometry.depth / 2,
            },
            {
              x: activeRoom.geometry.width / 2,
              z: -activeRoom.geometry.depth / 2,
            },
            {
              x: activeRoom.geometry.width / 2,
              z:
                activeRoom.geometry.depth / 2 -
                activeRoom.geometry.depth * 0.42,
            },
            {
              x:
                activeRoom.geometry.width / 2 -
                activeRoom.geometry.width * 0.42,
              z:
                activeRoom.geometry.depth / 2 -
                activeRoom.geometry.depth * 0.42,
            },
            {
              x:
                activeRoom.geometry.width / 2 -
                activeRoom.geometry.width * 0.42,
              z: activeRoom.geometry.depth / 2,
            },
            {
              x: -activeRoom.geometry.width / 2,
              z: activeRoom.geometry.depth / 2,
            },
          ];

    return createCabinetPolygonWallSpaces({
      ...sharedSpaceInput,
      polygon,
      openings: mapCabinetCardinalOpeningsToPolygonWalls({
        polygon,
        openings: roomOpenings,
      }),
      // Match the rectangular adapter's adjacent-wall deduction plus the
      // default installation allowance without changing polygon geometry.
      installationClearanceSideMm: wallInsetMm + 10,
    });
  }

  return createCabinetRoomWallSpaces({
    ...sharedSpaceInput,
    widthMm,
    depthMm,
    openings: roomOpenings,
  });
}

export function buildSelectedCabinetDocumentation(
  item: ParametricCabinetDesignItem
): SelectedCabinetDocumentation {
  let generatedParts: ReturnType<typeof generateCabinetParts> | undefined;
  const getGeneratedParts = () =>
    (generatedParts ??= generateCabinetParts(item.cabinetDefinition));
  let generatedDocumentation:
    | ReturnType<typeof generateCabinetDocumentation>
    | undefined;
  const getGeneratedDocumentation = () =>
    (generatedDocumentation ??= generateCabinetDocumentation(item.cabinetDefinition, {
      parts: getGeneratedParts(),
    }));
  let generatedBom: ReturnType<typeof generateCabinetBOM> | undefined;
  const getGeneratedBom = () =>
    (generatedBom ??= generateCabinetBOM(
      item.cabinetDefinition,
      getGeneratedParts()
    ));

  return {
    assemblyProfile:
      item.millworkDefinition?.assemblyProfile ??
      createCabinetMillworkDefinition(item.cabinetDefinition).assemblyProfile,
    bom: item.bomSnapshot ?? getGeneratedBom(),
    materialSchedule:
      item.materialScheduleSnapshot ?? getGeneratedDocumentation().materialSchedule,
    hardwareSchedule:
      item.hardwareScheduleSnapshot ?? getGeneratedDocumentation().hardwareSchedule,
    edgeBandingSchedule:
      item.edgeBandingScheduleSnapshot ?? getGeneratedDocumentation().edgeBandingSchedule,
    cutList: item.cutListSnapshot ?? getGeneratedDocumentation().cutList,
    dimensionSchedule:
      item.dimensionScheduleSnapshot ?? getGeneratedDocumentation().dimensionSchedule,
    drawingViewSchedule:
      item.drawingViewScheduleSnapshot ??
      getGeneratedDocumentation().drawingViewSchedule,
    installerNotes:
      item.installerNotesSnapshot ?? getGeneratedDocumentation().installerNotes,
    releaseChecklist:
      item.releaseChecklistSnapshot ?? getGeneratedDocumentation().releaseChecklist,
    quoteSummary:
      item.quoteSummarySnapshot ?? getGeneratedDocumentation().quoteSummary,
    supplierSkuMappings:
      item.supplierSkuMappingsSnapshot ??
      getGeneratedDocumentation().supplierSkuMappings,
    supplierReadiness:
      item.supplierReadinessSnapshot ??
      getGeneratedDocumentation().supplierReadiness,
    fabricationReleaseReadiness:
      item.fabricationReleaseReadinessSnapshot ??
      getGeneratedDocumentation().fabricationReleaseReadiness,
  };
}

export function buildSelectedCabinetAssetManifest(
  item: ParametricCabinetDesignItem,
  activeRoomId?: string
): NonNullable<DesignItem["millworkAssetManifest"]> {
  const position = item.position ?? item.transform?.position ?? [0, 0, 0];
  const rotationY = getCabinetRotationY(item);
  const scale = item.transform?.scale ?? [1, 1, 1];

  return (
    item.millworkAssetManifest ??
    buildCabinetAssetManifest({
      definition: item.cabinetDefinition,
      instanceId: item.instanceId,
      roomId: item.roomId ?? activeRoomId,
      position,
      rotationY,
      scale,
      glbAssetUrl: item.glbAssetUrl,
      createdAt: item.createdAt ?? item.cabinetDefinition.createdAt,
      updatedAt:
        item.updatedAt ??
        item.cabinetUpdatedAt ??
        item.cabinetDefinition.updatedAt,
    })
  );
}

export function useDesignPageCabinetry({
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageCabinetryInput): {
  state: DesignPageCabinetryState;
  actions: DesignPageCabinetryControllerActions;
  refs: { openedAt: MutableRefObject<number | null> };
} {
  const {
    activeRoom,
    activePlanRoom,
    planRoomCount,
    planOpenings,
    preferredWallFaceId,
    selectedItem,
    designSnapshot,
  } = state;
  const {
    isClientPreview,
    isDesigner,
    canEdit,
    designId,
    roomWidth,
    roomDepth,
    wallThickness,
    rotationSnapEnabled,
    rotationSnapStepRadians,
  } = configuration;
  const { getDesignSnapshot, replaceActiveItemsSnapshot } = refs;
  const {
    setDesignSnapshot,
    commitItems,
    commitItemsToRoom,
    updateSelection,
    createInstanceId,
    clampToActiveRoom,
    clampToCatalogPlacementRoom,
    isCatalogPlacementContainedInRoom,
    getItemAABB,
    getItemDisplayName,
    showToast,
  } = actions;

  const [studio, setStudio] = useState<DesignPageCabinetryStudioState | null>(null);
  const openedAtRef = useRef<number | null>(null);
  const [assetStorage] = useState(() => new LocalCabinetAssetStorage());
  const canUseStudio = CABINETRY_STUDIO_FEATURE_ENABLED && !isClientPreview;
  const accessLevel = isDesigner ? "pro" : "consumer";

  useEffect(() => () => assetStorage.dispose(), [assetStorage]);

  useEffect(() => {
    const staleCabinets = designSnapshot.rooms.flatMap((room) =>
      room.items
        .filter(isParametricCabinetItem)
        .filter(
          (item) =>
            !item.glbAssetUrl ||
            (item.glbAssetUrl.startsWith("blob:") &&
              !assetStorage.ownsGeneratedGlb(item.glbAssetUrl))
        )
        .map((item) => ({ roomId: room.id, item }))
    );

    if (staleCabinets.length === 0) return;

    let cancelled = false;
    void import("./exportCabinetGlb")
      .then(({ exportCabinetAsGlb }) =>
        Promise.all(
          staleCabinets.map(async ({ roomId, item }) => {
            const blob = await exportCabinetAsGlb(item.cabinetDefinition);
            const { glbAssetUrl } = await assetStorage.saveGeneratedGlb({
              cabinetId: item.instanceId,
              blob,
            });
            return { roomId, instanceId: item.instanceId, glbAssetUrl };
          })
        )
      )
      .then((updates) => {
        if (cancelled || updates.length === 0) return;
        const urlByInstanceId = new Map(
          updates.map((update) => [update.instanceId, update.glbAssetUrl])
        );

        setDesignSnapshot((previous) => {
          let changed = false;
          const rooms = previous.rooms.map((room) => {
            const items = room.items.map((item) => {
              if (!isParametricCabinetItem(item)) return item;
              const glbAssetUrl = urlByInstanceId.get(item.instanceId);
              if (!glbAssetUrl || item.glbAssetUrl === glbAssetUrl) return item;
              changed = true;
              return {
                ...item,
                glbAssetUrl,
                updatedAt: item.updatedAt ?? item.cabinetUpdatedAt,
              };
            });

            return items === room.items ? room : { ...room, items };
          });

          if (!changed) return previous;
          const next = { ...previous, rooms };
          const nextActiveRoom = getActiveRoom(next);
          if (nextActiveRoom) {
            replaceActiveItemsSnapshot(nextActiveRoom.items);
          }
          return next;
        });
      })
      .catch((error) => {
        console.warn("Unable to regenerate cabinet GLB asset URL", error);
      });

    return () => {
      cancelled = true;
    };
  }, [assetStorage, designSnapshot.rooms, replaceActiveItemsSnapshot, setDesignSnapshot]);

  const availableSpaces = useMemo(
    () =>
      buildCabinetryAvailableSpaces({
        activeRoom,
        activePlanRoom,
        planRoomCount,
        planOpenings,
      }),
    [activePlanRoom, activeRoom, planOpenings, planRoomCount]
  );
  const preferredSpaceId =
    activeRoom &&
    preferredWallFaceId &&
    availableSpaces.some((space) => space.wallId === preferredWallFaceId)
      ? `${activeRoom.id}:${preferredWallFaceId}`
      : null;

  const selectedCabinetItem =
    selectedItem && isParametricCabinetItem(selectedItem) ? selectedItem : null;
  const selected = useMemo<DesignPageCabinetrySelectedState | null>(() => {
    if (!selectedCabinetItem) return null;
    const documentation = buildSelectedCabinetDocumentation(selectedCabinetItem);
    return {
      item: selectedCabinetItem,
      planningDimensionsMm: getCabinetPlanningDimsMm(selectedCabinetItem),
      documentation,
      assetManifest: buildSelectedCabinetAssetManifest(
        selectedCabinetItem,
        activeRoom?.id
      ),
      rotationY: getCabinetRotationY(selectedCabinetItem),
      bomLineCount:
        selectedCabinetItem.bomSnapshot?.length ??
        generateCabinetBOM(selectedCabinetItem.cabinetDefinition).length,
    };
  }, [activeRoom?.id, selectedCabinetItem]);

  const projectRoomNamesById = useMemo(
    () =>
      Object.fromEntries(
        designSnapshot.rooms.map((room) => [room.id, room.name])
      ),
    [designSnapshot.rooms]
  );
  const projectAssets = useMemo(
    () =>
      designSnapshot.rooms.flatMap((room) =>
        room.items
          .filter(isParametricCabinetItem)
          .map((item) => buildPlacedCabinetAssetPackageInput(item, room.id))
      ),
    [designSnapshot.rooms]
  );
  const projectSchedulePackage = useMemo(
    () =>
      buildCabinetProjectSchedulePackage({
        assets: projectAssets,
        projectId: designId ?? undefined,
        projectName: designSnapshot.title ?? "Custom Millwork Project",
        roomNamesById: projectRoomNamesById,
      }),
    [designId, designSnapshot.title, projectAssets, projectRoomNamesById]
  );
  const projectHandoffPackage = useMemo(
    () =>
      projectAssets.length
        ? buildCabinetProjectHandoffPackage({
            assets: projectAssets,
            projectId: designId ?? undefined,
            projectName: designSnapshot.title ?? "Custom Millwork Project",
            roomNamesById: projectRoomNamesById,
          })
        : null,
    [designId, designSnapshot.title, projectAssets, projectRoomNamesById]
  );

  const updateCabinetItemDefinition = useCallback(
    (
      instanceId: string,
      definition: CabinetDefinition,
      options: {
        glbAssetUrl?: string;
        bom?: CabinetBOMItem[];
        closeStudio?: boolean;
      } = {}
    ): boolean => {
      if (!canUseStudio) return false;
      const snapshot = getDesignSnapshot();
      const targetRoom = snapshot.rooms.find((room) =>
        room.items.some((item) => item.instanceId === instanceId)
      );
      if (!targetRoom) return false;

      const now = new Date().toISOString();
      const bomSnapshot = options.bom ?? generateCabinetBOM(definition);
      const documentationSnapshot = generateCabinetDocumentation(definition);
      let previousGlbAssetUrl: string | undefined;
      const nextItems = commitItemsToRoom(
        targetRoom.id,
        (previous) =>
          previous.map((item) => {
            if (item.instanceId !== instanceId) return item;
            previousGlbAssetUrl = item.glbAssetUrl;
            const previousFitState = item.cabinetDefinition?.fitState;
            const fitWasExplicitlyChanged = Boolean(
              definition.fitState &&
                definition.fitState.appliedAt !== previousFitState?.appliedAt
            );
            const fitPlacement =
              fitWasExplicitlyChanged &&
              definition.fitState?.host.roomId === targetRoom.id
                ? getCabinetFitPlacement(
                    definition,
                    targetRoom.geometry.width,
                    targetRoom.geometry.depth
                  )
                : null;
            const rotationY = fitPlacement?.rotationY ?? getCabinetRotationY(item);
            const [safeX, safeZ] = fitPlacement
              ? clampToCatalogPlacementRoom(
                  targetRoom,
                  fitPlacement.position[0],
                  fitPlacement.position[2],
                  definition.totalWidth / 1000,
                  definition.depth / 1000,
                  rotationY
                )
              : [item.position?.[0] ?? 0, item.position?.[2] ?? 0];
            const position: ItemPosition = fitPlacement
              ? [safeX, fitPlacement.position[1], safeZ]
              : item.position ?? [0, 0, 0];
            const scale = item.transform?.scale ?? [1, 1, 1];
            const glbAssetUrl = options.glbAssetUrl ?? item.glbAssetUrl;
            const createdAt = item.createdAt ?? definition.createdAt ?? now;

            return {
              ...item,
              id: item.id ?? item.instanceId,
              ...buildCabinetMillworkMetadata(definition, targetRoom.id),
              productId: "parametric-cabinet",
              variantId: definition.id,
              assetType: "parametric_cabinet",
              name: definition.name,
              cabinetDefinition: definition,
              glbAssetUrl,
              millworkAssetManifest: buildCabinetAssetManifest({
                definition,
                instanceId,
                roomId: targetRoom.id,
                position,
                rotationY,
                scale,
                glbAssetUrl,
                createdAt,
                updatedAt: now,
              }),
              bomSnapshot,
              materialScheduleSnapshot: documentationSnapshot.materialSchedule,
              hardwareScheduleSnapshot: documentationSnapshot.hardwareSchedule,
              edgeBandingScheduleSnapshot:
                documentationSnapshot.edgeBandingSchedule,
              cutListSnapshot: documentationSnapshot.cutList,
              dimensionScheduleSnapshot: documentationSnapshot.dimensionSchedule,
              drawingViewScheduleSnapshot:
                documentationSnapshot.drawingViewSchedule,
              installerNotesSnapshot: documentationSnapshot.installerNotes,
              releaseChecklistSnapshot: documentationSnapshot.releaseChecklist,
              quoteSummarySnapshot: documentationSnapshot.quoteSummary,
              supplierSkuMappingsSnapshot:
                documentationSnapshot.supplierSkuMappings,
              supplierReadinessSnapshot: documentationSnapshot.supplierReadiness,
              fabricationReleaseReadinessSnapshot:
                documentationSnapshot.fabricationReleaseReadiness,
              cabinetUpdatedAt: now,
              createdAt,
              updatedAt: now,
              position,
              rotationY,
              transform: buildCabinetTransformMetadata(position, rotationY, scale),
              qty: typeof item.qty === "number" && item.qty > 0 ? item.qty : 1,
              includeInCheckout: false,
            };
          }),
        "Update cabinet"
      );

      if (!nextItems) return false;
      if (
        options.glbAssetUrl &&
        previousGlbAssetUrl &&
        previousGlbAssetUrl !== options.glbAssetUrl
      ) {
        assetStorage.deleteGeneratedGlb({ glbAssetUrl: previousGlbAssetUrl });
      }
      updateSelection(new Set([instanceId]), instanceId);
      if (options.closeStudio) setStudio(null);
      showToast("Millwork updated");
      return true;
    },
    [
      assetStorage,
      canUseStudio,
      clampToCatalogPlacementRoom,
      commitItemsToRoom,
      getDesignSnapshot,
      showToast,
      updateSelection,
    ]
  );

  const saveDefinition = useCallback(
    async (definition: CabinetDefinition) => {
      if (!canUseStudio) return false;
      if (studio?.mode === "edit" && studio.instanceId) {
        return updateCabinetItemDefinition(studio.instanceId, definition);
      }

      showToast("Millwork definition ready");
      return false;
    },
    [canUseStudio, showToast, studio, updateCabinetItemDefinition]
  );

  const placeInPlan = useCallback(
    async (payload: {
      definition: CabinetDefinition;
      glbBlob: Blob;
      bom: CabinetBOMItem[];
      placeAsCopy?: boolean;
    }) => {
      if (!canUseStudio) return false;

      if (studio?.mode === "edit" && studio.instanceId && !payload.placeAsCopy) {
        const { glbAssetUrl } = await assetStorage.saveGeneratedGlb({
          cabinetId: studio.instanceId,
          blob: payload.glbBlob,
        });
        const updated = updateCabinetItemDefinition(
          studio.instanceId,
          payload.definition,
          {
            glbAssetUrl,
            bom: payload.bom,
            closeStudio: true,
          }
        );
        if (!updated) {
          assetStorage.deleteGeneratedGlb({ glbAssetUrl });
        } else {
          track("millwork_assembly_updated", {
            access_level: accessLevel,
            assembly_type: getCabinetMillworkAssemblyType(payload.definition),
            module_count: payload.definition.modules.length,
            fitted_to_space: Boolean(payload.definition.fitState),
            reopen_edit_success: studio?.mode === "edit",
            elapsed_ms:
              openedAtRef.current === null
                ? null
                : Math.max(
                    0,
                    Math.round(performance.now() - openedAtRef.current)
                  ),
          });
          openedAtRef.current = null;
        }
        return updated;
      }

      const fittedRoomId = payload.definition.fitState?.host.roomId;
      const snapshot = getDesignSnapshot();
      const room = fittedRoomId
        ? snapshot.rooms.find((entry) => entry.id === fittedRoomId) ?? null
        : getActiveRoom(snapshot);
      if (!room) return false;

      const instanceId = createInstanceId();
      const { glbAssetUrl } = await assetStorage.saveGeneratedGlb({
        cabinetId: instanceId,
        blob: payload.glbBlob,
      });
      const fitPlacement = getCabinetFitPlacement(
        payload.definition,
        room.geometry.width,
        room.geometry.depth
      );
      const placementRotationY = fitPlacement?.rotationY ?? 0;
      const fitWall = payload.definition.fitState?.host.wall;
      const copyOffsetX =
        payload.placeAsCopy &&
        (!fitWall || fitWall === "north" || fitWall === "south")
          ? 0.15
          : 0;
      const copyOffsetZ =
        payload.placeAsCopy &&
        (fitWall === "east" || fitWall === "west" || !fitWall)
          ? 0.15
          : 0;
      const [safeX, safeZ] = clampToCatalogPlacementRoom(
        room,
        (fitPlacement?.position[0] ?? 0) + copyOffsetX,
        (fitPlacement?.position[2] ?? 0) + copyOffsetZ,
        payload.definition.totalWidth / 1000,
        payload.definition.depth / 1000,
        placementRotationY
      );
      const now = new Date().toISOString();
      const documentationSnapshot = generateCabinetDocumentation(payload.definition);
      const position: ItemPosition = [
        safeX,
        fitPlacement?.position[1] ?? 0,
        safeZ,
      ];
      const item: DesignItem = {
        id: instanceId,
        instanceId,
        productId: "parametric-cabinet",
        variantId: payload.definition.id,
        assetType: "parametric_cabinet",
        ...buildCabinetMillworkMetadata(payload.definition, room.id),
        name: payload.definition.name,
        cabinetDefinition: payload.definition,
        glbAssetUrl,
        millworkAssetManifest: buildCabinetAssetManifest({
          definition: payload.definition,
          instanceId,
          roomId: room.id,
          position,
          rotationY: placementRotationY,
          glbAssetUrl,
          createdAt: now,
          updatedAt: now,
        }),
        bomSnapshot: payload.bom,
        materialScheduleSnapshot: documentationSnapshot.materialSchedule,
        hardwareScheduleSnapshot: documentationSnapshot.hardwareSchedule,
        edgeBandingScheduleSnapshot: documentationSnapshot.edgeBandingSchedule,
        cutListSnapshot: documentationSnapshot.cutList,
        dimensionScheduleSnapshot: documentationSnapshot.dimensionSchedule,
        drawingViewScheduleSnapshot: documentationSnapshot.drawingViewSchedule,
        installerNotesSnapshot: documentationSnapshot.installerNotes,
        releaseChecklistSnapshot: documentationSnapshot.releaseChecklist,
        quoteSummarySnapshot: documentationSnapshot.quoteSummary,
        supplierSkuMappingsSnapshot: documentationSnapshot.supplierSkuMappings,
        supplierReadinessSnapshot: documentationSnapshot.supplierReadiness,
        fabricationReleaseReadinessSnapshot:
          documentationSnapshot.fabricationReleaseReadiness,
        cabinetUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
        position,
        rotationY: placementRotationY,
        transform: buildCabinetTransformMetadata(position, placementRotationY),
        qty: 1,
        includeInCheckout: false,
      };

      const nextItems = commitItemsToRoom(
        room.id,
        (previous) => [...previous, item],
        "Place cabinet",
        { activateRoom: true }
      );
      if (!nextItems) {
        assetStorage.deleteGeneratedGlb({ glbAssetUrl });
        return false;
      }
      updateSelection(new Set([instanceId]), instanceId);
      track("millwork_assembly_placed", {
        access_level: accessLevel,
        assembly_type: getCabinetMillworkAssemblyType(payload.definition),
        module_count: payload.definition.modules.length,
        fitted_to_space: Boolean(payload.definition.fitState),
        placed_as_copy: Boolean(payload.placeAsCopy),
        elapsed_ms:
          openedAtRef.current === null
            ? null
            : Math.max(
                0,
                Math.round(performance.now() - openedAtRef.current)
              ),
      });
      openedAtRef.current = null;
      setStudio(null);
      showToast("Millwork placed");
      return true;
    },
    [
      accessLevel,
      assetStorage,
      canUseStudio,
      clampToCatalogPlacementRoom,
      commitItemsToRoom,
      createInstanceId,
      getDesignSnapshot,
      showToast,
      studio,
      updateCabinetItemDefinition,
      updateSelection,
    ]
  );

  const findSelectedPlacementBlocker = useCallback(
    (
      cabinet: DesignItem,
      position: ItemPosition,
      rotationY: number
    ): DesignItem | null => {
      if (!activeRoom) return null;
      const candidateAABB = getItemAABB(cabinet, position, rotationY);
      if (!candidateAABB) return null;

      for (const blocker of activeRoom.items) {
        if (blocker.instanceId === cabinet.instanceId) continue;
        const blockerProduct = CATALOG_ITEMS[blocker.productId];
        if (blockerProduct?.category === "rug") continue;
        const blockerAABB = getItemAABB(blocker);
        if (blockerAABB && aabbIntersects(candidateAABB, blockerAABB)) {
          return blocker;
        }
      }

      return null;
    },
    [activeRoom, getItemAABB]
  );

  const moveSelectedToPosition = useCallback(
    (targetX: number, targetZ: number, actionLabel = "Move millwork") => {
      if (!selected || !activeRoom || !canEdit) return;
      if (isDesigner && selected.item.locked) return;
      const { item, planningDimensionsMm } = selected;
      if (!planningDimensionsMm) return;
      const rotationY = getCabinetRotationY(item);
      const [safeX, safeZ] = clampToActiveRoom(
        targetX,
        targetZ,
        planningDimensionsMm.w / 1000,
        planningDimensionsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        rotationY
      );
      const nextPosition: ItemPosition = [
        safeX,
        item.position[1] ?? 0,
        safeZ,
      ];

      if (
        !isCatalogPlacementContainedInRoom(
          activeRoom,
          nextPosition,
          rotationY,
          planningDimensionsMm
        )
      ) {
        showToast(`Place fully inside ${activeRoom.name}`);
        return;
      }

      const blocker = findSelectedPlacementBlocker(
        item,
        nextPosition,
        rotationY
      );
      if (blocker) {
        showToast(`Blocked by ${getItemDisplayName(blocker) ?? "another item"}`);
        return;
      }

      commitItems(
        (previous) =>
          previous.map((entry) =>
            entry.instanceId === item.instanceId
              ? updateCabinetPlacementMetadata(
                  entry,
                  nextPosition,
                  rotationY,
                  activeRoom.id
                )
              : entry
          ),
        actionLabel
      );
    },
    [
      activeRoom,
      canEdit,
      clampToActiveRoom,
      commitItems,
      findSelectedPlacementBlocker,
      getItemDisplayName,
      isCatalogPlacementContainedInRoom,
      isDesigner,
      roomDepth,
      roomWidth,
      selected,
      showToast,
      wallThickness,
    ]
  );

  const centerSelected = useCallback(() => {
    moveSelectedToPosition(0, 0, "Center millwork");
  }, [moveSelectedToPosition]);

  const nudgeSelected = useCallback(
    (deltaX: number, deltaZ: number) => {
      if (!selected) return;
      moveSelectedToPosition(
        selected.item.position[0] + deltaX,
        selected.item.position[2] + deltaZ,
        "Nudge millwork"
      );
    },
    [moveSelectedToPosition, selected]
  );

  const snapSelectedToWall = useCallback(() => {
    if (!selected || !canEdit) return;
    if (isDesigner && selected.item.locked) return;
    const planningDimensionsMm = selected.planningDimensionsMm;
    if (!planningDimensionsMm) return;
    const rotationY = getCabinetRotationY(selected.item);
    const [effectiveWidth, effectiveDepth] = getRotatedFootprint(
      planningDimensionsMm.w / 1000,
      planningDimensionsMm.d / 1000,
      rotationY
    );
    const wallInset = getFurnitureWallInset(wallThickness);
    const wallX = Math.max(0, roomWidth / 2 - wallInset - effectiveWidth / 2);
    const wallZ = Math.max(0, roomDepth / 2 - wallInset - effectiveDepth / 2);
    const candidates: Array<[number, number]> = [
      [-wallX, selected.item.position[2]],
      [wallX, selected.item.position[2]],
      [selected.item.position[0], -wallZ],
      [selected.item.position[0], wallZ],
    ];
    const [targetX, targetZ] = candidates.reduce((best, candidate) => {
      const bestDistance = Math.hypot(
        best[0] - selected.item.position[0],
        best[1] - selected.item.position[2]
      );
      const candidateDistance = Math.hypot(
        candidate[0] - selected.item.position[0],
        candidate[1] - selected.item.position[2]
      );
      return candidateDistance < bestDistance ? candidate : best;
    }, candidates[0]);
    moveSelectedToPosition(targetX, targetZ, "Snap millwork to wall");
  }, [
    canEdit,
    isDesigner,
    moveSelectedToPosition,
    roomDepth,
    roomWidth,
    selected,
    wallThickness,
  ]);

  const setSelectedRotation = useCallback(
    (targetRotationY: number, actionLabel = "Rotate millwork") => {
      if (!selected || !activeRoom || !canEdit) return;
      if (isDesigner && selected.item.locked) return;
      const planningDimensionsMm = selected.planningDimensionsMm;
      if (!planningDimensionsMm) return;
      const resolvedRotationY = rotationSnapEnabled
        ? snapRotationRadians(targetRotationY, rotationSnapStepRadians)
        : targetRotationY;
      const [safeX, safeZ] = clampToActiveRoom(
        selected.item.position[0],
        selected.item.position[2],
        planningDimensionsMm.w / 1000,
        planningDimensionsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        resolvedRotationY
      );
      const nextPosition: ItemPosition = [
        safeX,
        selected.item.position[1] ?? 0,
        safeZ,
      ];

      if (
        !isCatalogPlacementContainedInRoom(
          activeRoom,
          nextPosition,
          resolvedRotationY,
          planningDimensionsMm
        )
      ) {
        showToast(`Place fully inside ${activeRoom.name}`);
        return;
      }

      const blocker = findSelectedPlacementBlocker(
        selected.item,
        nextPosition,
        resolvedRotationY
      );
      if (blocker) {
        showToast(`Blocked by ${getItemDisplayName(blocker) ?? "another item"}`);
        return;
      }

      commitItems(
        (previous) =>
          previous.map((entry) =>
            entry.instanceId === selected.item.instanceId
              ? updateCabinetPlacementMetadata(
                  entry,
                  nextPosition,
                  resolvedRotationY,
                  activeRoom.id
                )
              : entry
          ),
        actionLabel
      );
    },
    [
      activeRoom,
      canEdit,
      clampToActiveRoom,
      commitItems,
      findSelectedPlacementBlocker,
      getItemDisplayName,
      isCatalogPlacementContainedInRoom,
      isDesigner,
      roomDepth,
      roomWidth,
      rotationSnapEnabled,
      rotationSnapStepRadians,
      selected,
      showToast,
      wallThickness,
    ]
  );

  const rotateSelectedByDegrees = useCallback(
    (deltaDegrees: number) => {
      if (!selected) return;
      const deltaRadians = (deltaDegrees * Math.PI) / 180;
      setSelectedRotation(
        getCabinetRotationY(selected.item) + deltaRadians,
        `Rotate millwork ${deltaDegrees > 0 ? "+" : ""}${deltaDegrees} deg`
      );
    },
    [selected, setSelectedRotation]
  );

  const resetSelectedRotation = useCallback(() => {
    setSelectedRotation(0, "Reset millwork rotation");
  }, [setSelectedRotation]);

  const exportSelected = useCallback(
    (kind: SelectedCabinetExportKind) => {
      if (!selected) return;

      const feedback = SELECTED_CABINET_EXPORT_FEEDBACK[kind];
      const projectInput = {
        assets: projectAssets,
        projectId: designId ?? undefined,
        projectName: designSnapshot.title ?? "Custom Millwork Project",
        roomNamesById: projectRoomNamesById,
      };

      try {
        switch (kind) {
          case "placed-package":
            downloadCabinetPlacedAssetPackageJson(
              buildPlacedCabinetAssetPackageInput(
                selected.item,
                selected.item.roomId ?? activeRoom?.id
              )
            );
            break;
          case "installer-work-order": {
            const placedAsset = buildPlacedCabinetAssetPackageInput(
              selected.item,
              selected.item.roomId ?? activeRoom?.id
            );
            downloadCabinetPlacedAssetInstallerWorkOrderJson(placedAsset, {
              roomName:
                (placedAsset.roomId
                  ? projectRoomNamesById[placedAsset.roomId]
                  : undefined) ?? activeRoom?.name,
            });
            break;
          }
          case "project-field-verification":
            downloadCabinetProjectFieldVerificationPackageJson(projectInput);
            break;
          case "project-finish-schedule":
            downloadCabinetProjectFinishSchedulePackageJson(projectInput);
            break;
          case "project-schedule":
            downloadCabinetProjectSchedulePackageJson(projectInput);
            break;
          case "project-schedule-csv":
            downloadCabinetProjectScheduleCsv(projectInput);
            break;
          case "project-scope":
            downloadCabinetProjectScopePackageJson(projectInput);
            break;
          case "project-procurement":
            downloadCabinetProjectProcurementPackageJson(projectInput);
            break;
          case "project-quote":
            downloadCabinetProjectQuotePackageJson(projectInput);
            break;
          case "project-purchase-readiness":
            downloadCabinetProjectPurchaseReadinessPackageJson(projectInput);
            break;
          case "project-fabrication-release":
            downloadCabinetProjectFabricationReleasePackageJson(projectInput);
            break;
          case "project-approval":
            downloadCabinetProjectApprovalPackageJson(projectInput);
            break;
          case "project-revision":
            downloadCabinetProjectRevisionPackageJson(projectInput);
            break;
          case "project-drawing-set":
            downloadCabinetProjectDrawingSetPackageJson(projectInput);
            break;
          case "project-cut-list":
            downloadCabinetProjectCutListPackageJson(projectInput);
            break;
          case "project-cnc-batch":
            downloadCabinetProjectCncBatchPackageJson(projectInput);
            break;
          case "project-installation-plan":
            downloadCabinetProjectInstallationPlanPackageJson(projectInput);
            break;
          case "project-rfq":
            downloadCabinetProjectFabricationQuoteRequestJson(projectInput);
            break;
          case "project-handoff":
            downloadCabinetProjectHandoffPackageJson(projectInput);
            break;
        }
        showToast(feedback.success);
      } catch (error) {
        console.error(
          `[Cabinetry] Unable to export ${feedback.consoleLabel}`,
          error
        );
        showToast(feedback.failure);
      }
    },
    [
      activeRoom,
      designId,
      designSnapshot.title,
      projectAssets,
      projectRoomNamesById,
      selected,
      showToast,
    ]
  );

  const openCreateStudio = useCallback(() => {
    if (!canUseStudio) return;
    openedAtRef.current = performance.now();
    track("millwork_studio_opened", {
      access_level: accessLevel,
      entry_point: "command_bar",
      studio_mode: "create",
    });
    setStudio({ mode: "create" });
  }, [accessLevel, canUseStudio]);

  const editSelected = useCallback(() => {
    if (!canUseStudio || !selected) return;
    openedAtRef.current = performance.now();
    track("millwork_studio_opened", {
      access_level: accessLevel,
      entry_point: "placed_asset",
      studio_mode: "edit",
    });
    setStudio({
      mode: "edit",
      instanceId: selected.item.instanceId,
      initialDefinition: selected.item.cabinetDefinition,
    });
  }, [accessLevel, canUseStudio, selected]);

  const dismissStudio = useCallback(() => setStudio(null), []);

  return {
    state: {
      studio,
      canUseStudio,
      accessLevel,
      availableSpaces,
      preferredSpaceId,
      selected,
      project: {
        assets: projectAssets,
        schedulePackage: projectSchedulePackage,
        handoffPackage: projectHandoffPackage,
      },
    },
    refs: { openedAt: openedAtRef },
    actions: {
      openCreateStudio,
      dismissStudio,
      saveDefinition,
      placeInPlan,
      centerSelected,
      snapSelectedToWall,
      nudgeSelected,
      rotateSelectedByDegrees,
      resetSelectedRotation,
      exportSelected,
      editSelected,
    },
  };
}
