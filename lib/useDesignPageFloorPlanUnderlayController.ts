"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { track } from "@/lib/analytics";
import { DEFAULT_FLOOR_MATERIAL_ID } from "@/lib/floor-materials";
import { applyFloorPlanScaleCalibration } from "@/lib/floor-plan-calibration";
import type { FloorPlanPoint, FloorPlanUnderlay } from "@/lib/floor-plan-types";
import {
  SUPPORTED_FLOOR_PLAN_MIME_TYPES,
  loadImageDimensions,
  readFileAsDataUrl,
  renderPdfPageToImageDataUrl,
  resolveFloorPlanUploadMimeType,
  resolveUnderlayWorldSize,
} from "@/lib/design-page-floor-plan-utils";
import {
  roundPlanCoordinate,
  resolveHousePlanTemplateOpeningMetrics,
  type HousePlanTemplate,
  type HousePlanTemplateApplyOptions,
} from "@/lib/design-page-house-plan";
import {
  isTemplateFurnishingNearDoorway,
  resolveTemplateFurnishingProduct,
  shouldConfirmPlanTemplateReplacement,
} from "@/lib/design-page-template-furnishings";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { metersToMm, type FixedElement2D, type RoomOpening2D } from "@/lib/editorScene";
import {
  createRoom,
  type DesignSnapshot,
} from "@/lib/room-types";
import type { CameraView } from "@/lib/design-page-types";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";

type MutableRef<T> = { current: T };

type HistoryAdapter = {
  begin: (name: string) => void;
  commit: () => void;
};

export type PendingPlanTemplateReplacement = {
  template: HousePlanTemplate;
  options?: HousePlanTemplateApplyOptions;
};

type UseDesignPageFloorPlanUnderlayControllerInput = {
  state: {
    floorPlanUnderlay: FloorPlanUnderlay | null;
    calibrationPoints: FloorPlanPoint[];
    calibrationDistanceInput: string;
    planOpenings: RoomOpening2D[];
  };
  configuration: {
    planViewWidth: number;
    planViewDepth: number;
    roomHeight: number;
    wallThickness: number;
  };
  refs: {
    designSnapshotRef: MutableRef<DesignSnapshot>;
    floorCameraViewsRef: MutableRef<Record<number, CameraView>>;
    underlayObjectUrlRef: MutableRef<string | null>;
    pdfSourceDataRef: MutableRef<ArrayBuffer | null>;
  };
  actions: {
    history: HistoryAdapter;
    setDesignSnapshot: Dispatch<SetStateAction<DesignSnapshot>>;
    setFloorPlanUnderlay: Dispatch<SetStateAction<FloorPlanUnderlay | null>>;
    setFloorPlanPdfSourceReady: Dispatch<SetStateAction<boolean>>;
    setFloorPlanPdfRenderingPage: Dispatch<SetStateAction<number | null>>;
    setFloorPlanCalibrationPoints: Dispatch<SetStateAction<FloorPlanPoint[]>>;
    setPlanOpenings: Dispatch<SetStateAction<RoomOpening2D[]>>;
    setPlanFixedElements: Dispatch<SetStateAction<FixedElement2D[]>>;
    setSelectedPlanOverlayId: Dispatch<SetStateAction<string | null>>;
    setViewMode: Dispatch<SetStateAction<EditorViewMode>>;
    resetFloorPlanInteraction: () => void;
    resetFloorPlanCalibration: (resetDistance?: boolean) => void;
    clearFloorPlanTraceBuffers: () => void;
    clearAllSelection: () => void;
    prepareCameraForPlanTemplate: () => void;
    revokeUnderlayObjectUrl: () => void;
    runHistoryTransaction: (name: string, action: () => void) => void;
    runCoalescedHistoryTransaction: (name: string, action: () => void) => void;
    showRuleToast: (label: string) => void;
  };
};

export function useDesignPageFloorPlanUnderlayController({
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageFloorPlanUnderlayControllerInput) {
  const {
    floorPlanUnderlay,
    calibrationPoints,
    calibrationDistanceInput,
    planOpenings,
  } = state;
  const { planViewWidth, planViewDepth, roomHeight, wallThickness } = configuration;
  const {
    designSnapshotRef,
    floorCameraViewsRef,
    underlayObjectUrlRef,
    pdfSourceDataRef,
  } = refs;
  const {
    history,
    setDesignSnapshot,
    setFloorPlanUnderlay,
    setFloorPlanPdfSourceReady,
    setFloorPlanPdfRenderingPage,
    setFloorPlanCalibrationPoints,
    setPlanOpenings,
    setPlanFixedElements,
    setSelectedPlanOverlayId,
    setViewMode,
    resetFloorPlanInteraction,
    resetFloorPlanCalibration,
    clearFloorPlanTraceBuffers,
    clearAllSelection,
    prepareCameraForPlanTemplate,
    revokeUnderlayObjectUrl,
    runHistoryTransaction,
    runCoalescedHistoryTransaction,
    showRuleToast,
  } = actions;

  const skipNextTemplateReplacementConfirmRef = useRef(false);
  const [pendingTemplateReplacement, setPendingTemplateReplacement] =
    useState<PendingPlanTemplateReplacement | null>(null);

  const applyPlanTemplate = useCallback(
    (template: HousePlanTemplate, options?: HousePlanTemplateApplyOptions) => {
      if (
        !skipNextTemplateReplacementConfirmRef.current &&
        shouldConfirmPlanTemplateReplacement(designSnapshotRef.current, planOpenings)
      ) {
        setPendingTemplateReplacement({ template, options });
        track("floor_plan_template_replacement_prompted", {
          templateId: template.id,
          furnishingPackId: options?.furnishingPackId ?? null,
          roomCount: designSnapshotRef.current.rooms.length,
          openingCount: planOpenings.length,
        });
        return;
      }
      skipNextTemplateReplacementConfirmRef.current = false;

      const timestamp = Date.now();
      const templateRoomIdMap = new Map<string, string>();
      const rooms = template.rooms.map((templateRoom, index) => {
        const room = createRoom(
          `template_${template.id}_${templateRoom.id}_${timestamp}_${index}`,
          templateRoom.name,
          templateRoom.roomType,
          {
            width: templateRoom.width,
            depth: templateRoom.depth,
            wallThickness: templateRoom.wallThickness ?? wallThickness,
            height: roomHeight,
          }
        );

        room.planPosition = {
          x: roundPlanCoordinate(templateRoom.x),
          z: roundPlanCoordinate(templateRoom.z),
        };
        room.planShape = templateRoom.planPolygon?.length
          ? "custom_polygon"
          : templateRoom.shape;
        room.planPolygon = templateRoom.planPolygon?.map((point) => ({
          x: roundPlanCoordinate(point.x),
          z: roundPlanCoordinate(point.z),
        }));
        room.surfaces = {
          floorMaterialId:
            templateRoom.roomType === "kitchen" || templateRoom.roomType === "toilet"
              ? "light_stone_tile"
              : DEFAULT_FLOOR_MATERIAL_ID,
        };
        room.surfaceFinishes = { ...room.surfaces };
        templateRoomIdMap.set(templateRoom.id, room.id);
        return room;
      });
      const activeTemplateRoom = rooms[0];
      if (!activeTemplateRoom) return;

      const templateDoorOpenings: RoomOpening2D[] = template.doorways.flatMap(
        (doorway, index) => {
          const roomId = templateRoomIdMap.get(doorway.fromRoomId);
          const adjacentRoomId = doorway.toRoomId
            ? templateRoomIdMap.get(doorway.toRoomId)
            : undefined;
          const sourceRoom = template.rooms.find(
            (entry) => entry.id === doorway.fromRoomId
          );
          if (!roomId || !sourceRoom || (doorway.toRoomId && !adjacentRoomId)) {
            return [];
          }
          const spanMeters =
            doorway.wall === "north" || doorway.wall === "south"
              ? sourceRoom.width
              : sourceRoom.depth;
          const { widthMeters, offsetMeters } =
            resolveHousePlanTemplateOpeningMetrics(
              spanMeters,
              doorway.widthMeters ?? 0.9,
              doorway.offsetMeters ?? 0
            );

          return [
            {
              id: `template-opening-${template.id}-${timestamp}-${index}`,
              roomId,
              wall: doorway.wall,
              kind: "door" as const,
              doorStyle: doorway.kind === "opening" ? "open" : "swing",
              offsetMm: metersToMm(offsetMeters),
              widthMm: metersToMm(widthMeters),
              ...(doorway.kind === "opening"
                ? { heightMm: metersToMm(roomHeight) }
                : {}),
            },
          ];
        }
      );
      const templateWindowOpenings: RoomOpening2D[] = template.windows.flatMap(
        (windowSpec, index) => {
          const roomId = templateRoomIdMap.get(windowSpec.roomId);
          const sourceRoom = template.rooms.find(
            (entry) => entry.id === windowSpec.roomId
          );
          if (!roomId || !sourceRoom) return [];
          const spanMeters =
            windowSpec.wall === "north" || windowSpec.wall === "south"
              ? sourceRoom.width
              : sourceRoom.depth;
          const { widthMeters, offsetMeters } =
            resolveHousePlanTemplateOpeningMetrics(
              spanMeters,
              windowSpec.widthMeters ?? 1,
              windowSpec.offsetMeters ?? 0
            );

          return [
            {
              id: `template-window-${template.id}-${timestamp}-${index}`,
              roomId,
              wall: windowSpec.wall,
              kind: "window" as const,
              offsetMm: metersToMm(offsetMeters),
              widthMm: metersToMm(widthMeters),
            },
          ];
        }
      );
      const templateOpenings = [
        ...templateDoorOpenings,
        ...templateWindowOpenings,
      ];
      const templateFixedElements: FixedElement2D[] = (template.referenceZones ?? []).map(
        (zone, index) => ({
          id: `template-reference-zone-${template.id}-${timestamp}-${index}`,
          kind: "reference_zone",
          xMm: metersToMm(zone.x),
          zMm: metersToMm(zone.z),
          widthMm: metersToMm(zone.width),
          depthMm: metersToMm(zone.depth),
          rotationDeg: 0,
          label: zone.label,
          locked: zone.locked ?? true,
        })
      );
      const selectedFurnishingPack = options?.furnishingPackId
        ? template.furnishingPacks.find(
            (pack) => pack.id === options.furnishingPackId
          ) ?? null
        : null;
      let furnishedItemCount = 0;
      let skippedFurnishingCount = 0;

      if (selectedFurnishingPack) {
        for (const intent of selectedFurnishingPack.intents) {
          const roomId = templateRoomIdMap.get(intent.roomId);
          const targetRoom = roomId
            ? rooms.find((room) => room.id === roomId)
            : null;
          const product = resolveTemplateFurnishingProduct(intent);

          if (
            !targetRoom ||
            !product ||
            isTemplateFurnishingNearDoorway(template, intent)
          ) {
            skippedFurnishingCount += 1;
            continue;
          }

          const resolved = resolveCatalogVariant(
            product,
            product.defaultVariantId
          );
          targetRoom.items = [
            ...targetRoom.items,
            {
              instanceId: `template-furnishing-${template.id}-${intent.id}-${timestamp}-${furnishedItemCount}`,
              productId: product.id,
              variantId: resolved.variantId,
              position: [intent.x, 0, intent.z],
              rotationY:
                intent.rotationDeg === undefined
                  ? product.defaultRotation
                  : (intent.rotationDeg * Math.PI) / 180,
              qty: 1,
              includeInCheckout: true,
            },
          ];
          furnishedItemCount += 1;
        }
      }

      revokeUnderlayObjectUrl();
      pdfSourceDataRef.current = null;
      setFloorPlanPdfSourceReady(false);
      setFloorPlanUnderlay(null);
      resetFloorPlanInteraction();
      setPlanOpenings(templateOpenings);
      setPlanFixedElements(templateFixedElements);
      setSelectedPlanOverlayId(null);
      clearAllSelection();
      prepareCameraForPlanTemplate();
      floorCameraViewsRef.current = {};
      setViewMode("2d");

      setDesignSnapshot((previous) => ({
        ...previous,
        version: 3,
        rooms,
        activeRoomId: activeTemplateRoom.id,
      }));
      history.commit();

      if (selectedFurnishingPack && skippedFurnishingCount > 0) {
        showRuleToast("Some starter items were skipped");
      } else {
        showRuleToast(
          selectedFurnishingPack
            ? `${template.label} furnished starter added`
            : `${template.label} added`
        );
      }
      track("floor_plan_template_applied", {
        templateId: template.id,
        furnishingPackId: selectedFurnishingPack?.id ?? null,
        furnishedItemCount,
        skippedFurnishingCount,
        roomCount: rooms.length,
        openingCount: templateOpenings.length,
      });
    },
    [
      clearAllSelection,
      designSnapshotRef,
      floorCameraViewsRef,
      history,
      pdfSourceDataRef,
      planOpenings,
      prepareCameraForPlanTemplate,
      resetFloorPlanInteraction,
      revokeUnderlayObjectUrl,
      roomHeight,
      setDesignSnapshot,
      setFloorPlanPdfSourceReady,
      setFloorPlanUnderlay,
      setPlanFixedElements,
      setPlanOpenings,
      setSelectedPlanOverlayId,
      setViewMode,
      showRuleToast,
      wallThickness,
    ]
  );

  const cancelPendingTemplateReplacement = useCallback(() => {
    const pending = pendingTemplateReplacement;
    setPendingTemplateReplacement(null);
    if (!pending) return;
    track("floor_plan_template_apply_cancelled", {
      templateId: pending.template.id,
      furnishingPackId: pending.options?.furnishingPackId ?? null,
      roomCount: designSnapshotRef.current.rooms.length,
      openingCount: planOpenings.length,
    });
  }, [designSnapshotRef, pendingTemplateReplacement, planOpenings.length]);

  const confirmPendingTemplateReplacement = useCallback(() => {
    const pending = pendingTemplateReplacement;
    if (!pending) return;
    setPendingTemplateReplacement(null);
    skipNextTemplateReplacementConfirmRef.current = true;
    applyPlanTemplate(pending.template, pending.options);
  }, [applyPlanTemplate, pendingTemplateReplacement]);

  const uploadUnderlay = useCallback(
    async (file: File) => {
      const mimeType = resolveFloorPlanUploadMimeType(file);
      if (!SUPPORTED_FLOOR_PLAN_MIME_TYPES.has(mimeType)) {
        showRuleToast("Upload a PNG, JPG, WebP, or PDF floor plan");
        return;
      }

      let assetUrl: string;
      let renderedMimeType = mimeType;
      let widthPx: number | undefined;
      let heightPx: number | undefined;
      let renderedPage: number | undefined;
      let pageCount: number | undefined;

      if (mimeType.startsWith("image/")) {
        pdfSourceDataRef.current = null;
        setFloorPlanPdfSourceReady(false);
        try {
          assetUrl = await readFileAsDataUrl(file);
          const dimensions = await loadImageDimensions(assetUrl);
          widthPx = dimensions.width;
          heightPx = dimensions.height;
        } catch {
          showRuleToast("Floor plan image could not be read");
          return;
        }
      } else if (mimeType === "application/pdf") {
        try {
          const pdfData = await file.arrayBuffer();
          const rendered = await renderPdfPageToImageDataUrl(pdfData, 1);
          pdfSourceDataRef.current = pdfData;
          setFloorPlanPdfSourceReady(true);
          assetUrl = rendered.dataUrl;
          renderedMimeType = "image/png";
          widthPx = rendered.widthPx;
          heightPx = rendered.heightPx;
          renderedPage = 1;
          pageCount = rendered.pageCount;
        } catch {
          pdfSourceDataRef.current = null;
          setFloorPlanPdfSourceReady(false);
          showRuleToast("PDF floor plan could not be rendered");
          return;
        }
      } else {
        showRuleToast("Upload a PNG, JPG, WebP, or PDF floor plan");
        return;
      }

      underlayObjectUrlRef.current = null;
      const { widthMeters, depthMeters } = resolveUnderlayWorldSize({
        widthPx,
        heightPx,
        planWidthMeters: planViewWidth,
        planDepthMeters: planViewDepth,
      });

      history.begin("Upload floor plan");
      setFloorPlanUnderlay({
        id: `underlay_${Date.now()}`,
        floorId: "floor_1",
        name: file.name || "Uploaded floor plan",
        assetUrl,
        mimeType: renderedMimeType,
        sourceMimeType: mimeType,
        renderedPage,
        pageCount,
        widthPx,
        heightPx,
        position: { x: 0, z: 0 },
        widthMeters,
        depthMeters,
        opacity: 0.45,
        rotationDeg: 0,
        locked: true,
      });
      history.commit();
      resetFloorPlanInteraction();
      setViewMode("2d");
      track("floor_plan_underlay_uploaded", {
        mimeType,
        renderedMimeType,
        renderedPage,
        pageCount,
        hasImagePreview: renderedMimeType.startsWith("image/"),
      });
    },
    [
      history,
      pdfSourceDataRef,
      planViewDepth,
      planViewWidth,
      resetFloorPlanInteraction,
      setFloorPlanPdfSourceReady,
      setFloorPlanUnderlay,
      setViewMode,
      showRuleToast,
      underlayObjectUrlRef,
    ]
  );

  const changeUnderlayOpacity = useCallback(
    (opacity: number) => {
      runCoalescedHistoryTransaction("Change floor plan opacity", () =>
        setFloorPlanUnderlay((previous) =>
          previous
            ? {
                ...previous,
                opacity: Math.max(0.15, Math.min(0.85, opacity)),
              }
            : previous
        )
      );
    },
    [runCoalescedHistoryTransaction, setFloorPlanUnderlay]
  );

  const changeUnderlayLock = useCallback(
    (locked: boolean) => {
      runHistoryTransaction(
        locked ? "Lock floor plan" : "Unlock floor plan",
        () =>
          setFloorPlanUnderlay((previous) =>
            previous ? { ...previous, locked } : previous
          )
      );
    },
    [runHistoryTransaction, setFloorPlanUnderlay]
  );

  const changePdfPage = useCallback(
    async (pageNumber: number) => {
      if (
        !floorPlanUnderlay ||
        floorPlanUnderlay.sourceMimeType !== "application/pdf"
      ) {
        return;
      }

      const pdfData = pdfSourceDataRef.current;
      if (!pdfData) {
        showRuleToast("Re-upload the PDF to switch pages");
        return;
      }

      const pageCount = floorPlanUnderlay.pageCount ?? 1;
      const nextPage = Math.min(
        Math.max(1, Math.round(pageNumber)),
        pageCount
      );
      setFloorPlanPdfRenderingPage(nextPage);

      try {
        const rendered = await renderPdfPageToImageDataUrl(pdfData, nextPage);
        const { widthMeters, depthMeters } = resolveUnderlayWorldSize({
          widthPx: rendered.widthPx,
          heightPx: rendered.heightPx,
          planWidthMeters: planViewWidth,
          planDepthMeters: planViewDepth,
        });

        history.begin("Change floor plan page");
        setFloorPlanUnderlay((previous) =>
          previous
            ? {
                ...previous,
                assetUrl: rendered.dataUrl,
                mimeType: "image/png",
                widthPx: rendered.widthPx,
                heightPx: rendered.heightPx,
                widthMeters,
                depthMeters,
                renderedPage: nextPage,
                pageCount: rendered.pageCount,
                calibration: undefined,
              }
            : previous
        );
        history.commit();
        resetFloorPlanInteraction();
        showRuleToast(`PDF page ${nextPage} rendered`);
        track("floor_plan_pdf_page_rendered", {
          page: nextPage,
          pageCount: rendered.pageCount,
        });
      } catch {
        showRuleToast("PDF page could not be rendered");
      } finally {
        setFloorPlanPdfRenderingPage(null);
      }
    },
    [
      floorPlanUnderlay,
      history,
      pdfSourceDataRef,
      planViewDepth,
      planViewWidth,
      resetFloorPlanInteraction,
      setFloorPlanPdfRenderingPage,
      setFloorPlanUnderlay,
      showRuleToast,
    ]
  );

  const addCalibrationPoint = useCallback(
    (point: FloorPlanPoint) => {
      setFloorPlanCalibrationPoints((previous) =>
        previous.length >= 2 ? [point] : [...previous, point]
      );
    },
    [setFloorPlanCalibrationPoints]
  );

  const resetCalibrationPoints = useCallback(() => {
    setFloorPlanCalibrationPoints([]);
  }, [setFloorPlanCalibrationPoints]);

  const applyCalibration = useCallback(() => {
    if (!floorPlanUnderlay) return;
    if (calibrationPoints.length !== 2) {
      showRuleToast("Click two scale points first");
      return;
    }

    const nextUnderlay = applyFloorPlanScaleCalibration({
      underlay: floorPlanUnderlay,
      points: [calibrationPoints[0], calibrationPoints[1]],
      referenceLengthMeters: Number(calibrationDistanceInput),
    });

    if (!nextUnderlay) {
      showRuleToast("Enter a valid scale distance");
      return;
    }

    runHistoryTransaction("Calibrate floor plan", () =>
      setFloorPlanUnderlay(nextUnderlay)
    );
    resetFloorPlanCalibration(false);
    clearFloorPlanTraceBuffers();
    track("floor_plan_underlay_calibrated", {
      referenceLengthMeters: nextUnderlay.calibration?.referenceLengthMeters,
      pixelsPerMeter: nextUnderlay.calibration?.pixelsPerMeter,
    });
  }, [
    calibrationDistanceInput,
    calibrationPoints,
    clearFloorPlanTraceBuffers,
    floorPlanUnderlay,
    resetFloorPlanCalibration,
    runHistoryTransaction,
    setFloorPlanUnderlay,
    showRuleToast,
  ]);

  const clearUnderlay = useCallback(() => {
    pdfSourceDataRef.current = null;
    history.begin("Clear floor plan");
    setFloorPlanPdfSourceReady(false);
    setFloorPlanUnderlay(null);
    history.commit();
    resetFloorPlanInteraction();
  }, [
    history,
    pdfSourceDataRef,
    resetFloorPlanInteraction,
    setFloorPlanPdfSourceReady,
    setFloorPlanUnderlay,
  ]);

  return {
    state: {
      pendingTemplateReplacement,
    },
    actions: {
      applyPlanTemplate,
      cancelPendingTemplateReplacement,
      confirmPendingTemplateReplacement,
      uploadUnderlay,
      changeUnderlayOpacity,
      changeUnderlayLock,
      changePdfPage,
      addCalibrationPoint,
      resetCalibrationPoints,
      applyCalibration,
      clearUnderlay,
    },
  };
}
