"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { track } from "@/lib/analytics";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { applyFloorPlanScaleCalibration } from "@/lib/floor-plan-calibration";
import type { FloorPlanPoint, FloorPlanUnderlay } from "@/lib/floor-plan-types";
import {
  SUPPORTED_FLOOR_PLAN_MIME_TYPES,
  hashFloorPlanSourceBytes,
  loadImageDimensions,
  readFileAsDataUrl,
  renderPdfPageToImageDataUrl,
  resolveFloorPlanUploadMimeType,
  resolveUnderlayWorldSize,
} from "@/lib/design-page-floor-plan-utils";
import type { HousePlanTemplate, HousePlanTemplateApplyOptions } from "@/lib/design-page-house-plan";
import { buildPlanTemplateReplacementSnapshot } from "@/lib/design-page-plan-template-replacement";
import { shouldConfirmPlanTemplateReplacement, templateAppliedMessage } from "@/lib/design-page-template-furnishings";
import type { FixedElement2D, RoomOpening2D } from "@/lib/editorScene";
import { buildPlanTemplateDocument } from "@/lib/plan-template-document";
import type { DesignSnapshot } from "@/lib/room-types";
import type { CameraView } from "@/lib/design-page-types";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";

const floorPlanTemplateMatchLevel = (template: HousePlanTemplate) =>
  template.canonical?.addressBinding ? "unit" : "layout";

type MutableRef<T> = { current: T };

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
  const requirePlanChoiceForNextTemplateRef = useRef(false);
  const [pendingTemplateReplacement, setPendingTemplateReplacement] =
    useState<PendingPlanTemplateReplacement | null>(null);

  const applyPlanTemplate = useCallback(
    (template: HousePlanTemplate, options?: HousePlanTemplateApplyOptions) => {
      if (
        !skipNextTemplateReplacementConfirmRef.current &&
        (requirePlanChoiceForNextTemplateRef.current ||
          shouldConfirmPlanTemplateReplacement(designSnapshotRef.current, planOpenings))
      ) {
        requirePlanChoiceForNextTemplateRef.current = false;
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
      requirePlanChoiceForNextTemplateRef.current = false;
      const replacePlanDocument = (
        openings: RoomOpening2D[],
        fixedElements: FixedElement2D[],
        snapshot: SetStateAction<DesignSnapshot>
      ) =>
        runHistoryTransaction("Apply template", () => {
          revokeUnderlayObjectUrl();
          pdfSourceDataRef.current = null;
          setFloorPlanPdfSourceReady(false);
          setFloorPlanUnderlay(null);
          resetFloorPlanInteraction();
          setPlanOpenings(openings);
          setPlanFixedElements(fixedElements);
          setSelectedPlanOverlayId(null);
          clearAllSelection();
          prepareCameraForPlanTemplate();
          floorCameraViewsRef.current = {};
          setViewMode("2d");
          setDesignSnapshot(snapshot);
        });

      const timestamp = Date.now();
      if (template.canonical) {
        const canonical = canonicalFloorPlanToDesignSnapshot(
          template.canonical.document,
          {
            title: template.label,
            addressTransform: template.canonical.addressTransform,
            addressBinding: template.canonical.addressBinding,
            sourceRevisionGeometryHash: template.canonical.geometryHash,
            sourceAssetSha256: template.canonical.document.sources[0]?.sha256,
          }
        );
        replacePlanDocument(canonical.openings, canonical.fixedElements, canonical.snapshot);
        showRuleToast(`${template.label} added from verified revision`);
        track("floor_plan_canonical_revision_applied", {
          verificationTier: template.canonical.verificationTier,
          roomCount: canonical.snapshot.rooms.length,
          openingCount: canonical.openings.length,
          matchLevel: floorPlanTemplateMatchLevel(template),
        });
        return;
      }

      const built = buildPlanTemplateDocument(template, {
        timestamp,
        wallThickness,
        roomHeight,
        furnishingPackId: options?.furnishingPackId,
      });
      const activeTemplateRoom = built.rooms[0];
      if (!activeTemplateRoom) return;

      replacePlanDocument(built.openings, built.fixedElements, (previous) =>
        buildPlanTemplateReplacementSnapshot(previous, built.rooms, activeTemplateRoom.id)
      );

      showRuleToast(templateAppliedMessage(template.label, built.pack, built.skippedFurnishings));
      track("floor_plan_template_applied", {
        templateId: template.id,
        furnishingPackId: built.pack?.id ?? null,
        furnishedItemCount: built.furnishedItemCount,
        skippedFurnishingCount: built.skippedFurnishings.length,
        roomCount: built.rooms.length,
        openingCount: built.openings.length,
      });
      // After the template's own toast, so a follow-up (Draw room) can show its hint.
      options?.onApplied?.();
    },
    [
      clearAllSelection,
      designSnapshotRef,
      floorCameraViewsRef,
      pdfSourceDataRef,
      planOpenings,
      prepareCameraForPlanTemplate,
      resetFloorPlanInteraction,
      revokeUnderlayObjectUrl,
      roomHeight,
      runHistoryTransaction,
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

  const requirePlanChoiceForNextTemplate = useCallback(() => {
    requirePlanChoiceForNextTemplateRef.current = true;
  }, []);

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
      let sourceBytes: ArrayBuffer;
      let sourceAssetSha256: string;

      try {
        sourceBytes = await file.arrayBuffer();
        sourceAssetSha256 = await hashFloorPlanSourceBytes(sourceBytes);
      } catch {
        showRuleToast("Floor plan file could not be read securely");
        return;
      }

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
          const pdfData = sourceBytes;
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

      runHistoryTransaction("Upload floor plan", () =>
        setFloorPlanUnderlay({
          id: `underlay_${Date.now()}`,
          floorId: "floor_1",
          name: file.name || "Uploaded floor plan",
          assetUrl,
          mimeType: renderedMimeType,
          sourceMimeType: mimeType,
          sourceAssetSha256,
          renderedPage,
          pageCount,
          widthPx,
          heightPx,
          position: { x: 0, z: 0 },
          widthMeters,
          depthMeters,
          opacity: 0.45,
          visible: true,
          rotationDeg: 0,
          locked: true,
        })
      );
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
      pdfSourceDataRef,
      planViewDepth,
      planViewWidth,
      resetFloorPlanInteraction,
      runHistoryTransaction,
      setFloorPlanPdfSourceReady,
      setFloorPlanUnderlay,
      setViewMode,
      showRuleToast,
      underlayObjectUrlRef,
    ]
  );

  const changeUnderlayOpacity = useCallback(
    (opacity: number) => {
      const applyChange = () =>
        setFloorPlanUnderlay((previous) =>
          previous
            ? {
                ...previous,
                ...(opacity <= 0
                  ? { visible: false }
                  : {
                      visible: true,
                      opacity: Math.max(0.15, Math.min(0.85, opacity)),
                    }),
              }
            : previous
        );
      if (opacity <= 0 || floorPlanUnderlay?.visible === false) {
        runHistoryTransaction(
          opacity <= 0
            ? "Hide floor plan image"
            : "Show floor plan image",
          applyChange
        );
        return;
      }
      runCoalescedHistoryTransaction("Change floor plan image opacity", applyChange);
    },
    [
      floorPlanUnderlay?.visible,
      runCoalescedHistoryTransaction,
      runHistoryTransaction,
      setFloorPlanUnderlay,
    ]
  );

  const changeUnderlayLock = useCallback(
    (locked: boolean) => {
      runHistoryTransaction(
        locked ? "Lock floor plan image" : "Unlock floor plan image",
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

        runHistoryTransaction("Change floor plan page", () =>
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
          )
        );
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
      pdfSourceDataRef,
      planViewDepth,
      planViewWidth,
      resetFloorPlanInteraction,
      runHistoryTransaction,
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

    runHistoryTransaction("Set scale", () =>
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
    runHistoryTransaction("Clear floor plan", () => {
      setFloorPlanPdfSourceReady(false);
      setFloorPlanUnderlay(null);
    });
    resetFloorPlanInteraction();
  }, [
    pdfSourceDataRef,
    resetFloorPlanInteraction,
    runHistoryTransaction,
    setFloorPlanPdfSourceReady,
    setFloorPlanUnderlay,
  ]);

  return {
    state: {
      pendingTemplateReplacement,
      floorPlanUnderlay,
    },
    actions: {
      applyPlanTemplate,
      requirePlanChoiceForNextTemplate,
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
