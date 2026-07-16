"use client";

import { useCallback, useState, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { CATALOG_ITEMS } from "@/lib/catalog";
import { track } from "@/lib/analytics";
import type { CameraView } from "@/lib/design-page-types";
import type { FunnelEventName } from "@/lib/design-page-paywall";
import { getItemPrice } from "@/lib/design-page-utils";
import { isPro, type Plan } from "@/lib/plan";
import type { DesignItem, DesignSnapshot } from "@/lib/room-types";
import { getRuntimeSurfaceMaterialById } from "@/lib/surface-material-runtime";
import type { ExportStylePreset } from "@/lib/useDesignPagePlanState";

type ExportUpgradeReason = "designer" | "export_images" | "export_pdf" | null;

type DesignPageExportState = {
  designId: string | null;
  plan: Plan;
  exportStylePreset: ExportStylePreset;
  sceneReady: boolean;
  cameraView: CameraView;
  clientPreview: boolean;
  items: DesignItem[];
};

type DesignPageExportActions = {
  setClientPreview: Dispatch<SetStateAction<boolean>>;
  setUpgradeReason: Dispatch<SetStateAction<ExportUpgradeReason>>;
  setShowUpgrade: Dispatch<SetStateAction<boolean>>;
  updateProjection: (camera: THREE.Camera | null) => void;
  showToast: (message: string) => void;
  logFunnelEvent: (eventType: FunnelEventName, meta?: Record<string, unknown>) => void;
};

type DesignPageExportRefs = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cameraRef: MutableRefObject<THREE.Camera | null>;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  designSnapshotRef: MutableRefObject<DesignSnapshot>;
};

export function countExportedSurfaceMaterials(snapshot: DesignSnapshot): number {
  return snapshot.rooms.reduce((count, room) => {
    const surfaces = room.surfaces ?? room.surfaceFinishes;
    const floorCount = getRuntimeSurfaceMaterialById(surfaces?.floorMaterialId) ? 1 : 0;
    const defaultWallCount = getRuntimeSurfaceMaterialById(
      surfaces?.walls?.default?.materialId ?? surfaces?.wallMaterialId
    )
      ? 1
      : 0;
    const faceCount = Object.values(surfaces?.walls?.faces ?? {}).filter((settings) =>
      Boolean(getRuntimeSurfaceMaterialById(settings?.materialId))
    ).length;
    return count + floorCount + defaultWallCount + faceCount;
  }, 0);
}

function waitForFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let frames = 0;
    const tick = () => {
      frames += 1;
      if (frames >= count) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function useDesignPageExport({
  state,
  actions,
  refs,
}: {
  state: DesignPageExportState;
  actions: DesignPageExportActions;
  refs: DesignPageExportRefs;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const {
    designId,
    plan,
    exportStylePreset,
    sceneReady,
    cameraView,
    clientPreview,
    items,
  } = state;
  const {
    setClientPreview,
    setUpgradeReason,
    setShowUpgrade,
    updateProjection,
    showToast,
    logFunnelEvent,
  } = actions;
  const {
    canvasRef,
    cameraRef,
    controlsRef,
    rendererRef,
    sceneRef,
    designSnapshotRef,
  } = refs;

  const captureCanvasImage = useCallback((): string | null => {
    if (!cameraRef.current || !rendererRef.current || !sceneRef.current) return null;
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    const canvas = rendererRef.current.domElement ?? canvasRef.current;
    if (!canvas) return null;

    const { width, height } = canvas;
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = width * 2;
    offscreenCanvas.height = height * 2;
    const context = offscreenCanvas.getContext("2d");
    if (!context) return null;

    context.scale(2, 2);
    context.drawImage(canvas, 0, 0);
    if (plan !== "pro") {
      context.resetTransform();
      context.fillStyle = "rgba(0, 0, 0, 0.6)";
      context.font = "bold 32px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("Free Tier - Interior AI", width, height);
    }
    return offscreenCanvas.toDataURL("image/png");
  }, [cameraRef, canvasRef, plan, rendererRef, sceneRef]);

  const captureCanvasImageForPdf = useCallback((): string | null => {
    if (!cameraRef.current || !rendererRef.current || !sceneRef.current) return null;
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    const canvas = rendererRef.current.domElement ?? canvasRef.current;
    if (!canvas) return null;

    const width = Math.max(1, Math.floor(canvas.width * 0.6));
    const height = Math.max(1, Math.floor(canvas.height * 0.6));
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;
    const context = offscreenCanvas.getContext("2d");
    if (!context) return null;
    context.drawImage(canvas, 0, 0, width, height);
    return offscreenCanvas.toDataURL("image/jpeg", 0.8);
  }, [cameraRef, canvasRef, rendererRef, sceneRef]);

  const captureExportImages = useCallback(async () => {
    if (!canvasRef.current || !cameraRef.current || !sceneReady) {
      throw new Error("Scene not ready for export");
    }

    const camera = cameraRef.current;
    const originalPosition = camera.position.clone();
    const originalTarget = new THREE.Vector3(...cameraView.target);
    const previousPreview = clientPreview;
    setClientPreview(true);
    await waitForFrames(2);

    const angles =
      exportStylePreset === "pro"
        ? [
            { name: "hero", yaw: 0 },
            { name: "left", yaw: Math.PI / 9 },
            { name: "right", yaw: -Math.PI / 9 },
            { name: "overview", yaw: Math.PI / 4 },
          ]
        : [
            { name: "hero", yaw: 0 },
            { name: "left", yaw: Math.PI / 9 },
            { name: "right", yaw: -Math.PI / 9 },
          ];

    const images: string[] = [];
    for (const angle of angles) {
      camera.position.set(Math.sin(angle.yaw) * 8, 3.5, Math.cos(angle.yaw) * 8);
      camera.lookAt(originalTarget);
      updateProjection(camera);
      await waitForFrames(2);
      const imageUrl = captureCanvasImageForPdf();
      if (imageUrl) images.push(imageUrl);
    }

    camera.position.copy(originalPosition);
    if (controlsRef.current) {
      (controlsRef.current.target as THREE.Vector3).copy(originalTarget);
    }
    camera.lookAt(originalTarget);
    updateProjection(camera);
    setClientPreview(previousPreview);
    return images;
  }, [
    cameraRef,
    cameraView.target,
    canvasRef,
    captureCanvasImageForPdf,
    clientPreview,
    controlsRef,
    exportStylePreset,
    sceneReady,
    setClientPreview,
    updateProjection,
  ]);

  const exportImages = useCallback(async () => {
    track("export_clicked", {
      design_id: designId,
      channel: "images",
      is_pro: isPro(plan),
      export_style: exportStylePreset,
    });
    logFunnelEvent("export_clicked", {
      channel: "images",
      plan,
      export_style: exportStylePreset,
    });

    if (!canvasRef.current || !cameraRef.current || !sceneReady) {
      showToast("Scene not ready for export");
      return;
    }
    if (!isPro(plan)) track("export_attempted", { is_pro: false });
    setIsExporting(true);

    try {
      const camera = cameraRef.current;
      const originalPosition = camera.position.clone();
      const originalTarget = new THREE.Vector3(...cameraView.target);
      setClientPreview(true);
      await waitForFrames(2);
      const angles =
        !isPro(plan)
          ? [{ name: "hero", yaw: 0 }]
          : exportStylePreset === "pro"
            ? [
                { name: "hero", yaw: 0 },
                { name: "left", yaw: Math.PI / 9 },
                { name: "right", yaw: -Math.PI / 9 },
                { name: "overview", yaw: Math.PI / 4 },
              ]
            : [
                { name: "hero", yaw: 0 },
                { name: "left", yaw: Math.PI / 9 },
                { name: "right", yaw: -Math.PI / 9 },
              ];
      const images: Array<{ name: string; url: string }> = [];

      for (const angle of angles) {
        camera.position.set(Math.sin(angle.yaw) * 8, 3.5, Math.cos(angle.yaw) * 8);
        camera.lookAt(originalTarget);
        updateProjection(camera);
        await waitForFrames(2);
        const imageUrl = captureCanvasImage();
        if (imageUrl) images.push({ name: angle.name, url: imageUrl });
        else console.warn(`Failed to capture ${angle.name} image`);
      }

      camera.position.copy(originalPosition);
      if (controlsRef.current) {
        (controlsRef.current.target as THREE.Vector3).copy(originalTarget);
      }
      camera.lookAt(originalTarget);
      updateProjection(camera);
      setClientPreview(false);

      images.forEach(({ name, url }, index) => {
        setTimeout(() => {
          const link = document.createElement("a");
          link.href = url;
          link.download = `room-${exportStylePreset}-${name}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, index * 300);
      });

      const surfaceMaterialCount = countExportedSurfaceMaterials(designSnapshotRef.current);
      track("images_exported", {
        design_id: designId,
        count: images.length,
        is_pro: isPro(plan),
        export_style: exportStylePreset,
        surface_material_floor_count: surfaceMaterialCount,
        surface_material_count: surfaceMaterialCount,
      });
      if (!isPro(plan)) {
        track("upgrade_prompt_shown", { source: "export_images" });
        setUpgradeReason("export_images");
        setShowUpgrade(true);
      }
      showToast(`Exported ${images.length} ${exportStylePreset} images`);
    } catch (error) {
      console.error("Export error:", error);
      setClientPreview(false);
      showToast("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, [
    cameraRef,
    cameraView.target,
    canvasRef,
    captureCanvasImage,
    controlsRef,
    designId,
    designSnapshotRef,
    exportStylePreset,
    logFunnelEvent,
    plan,
    sceneReady,
    setClientPreview,
    setShowUpgrade,
    setUpgradeReason,
    showToast,
    updateProjection,
  ]);

  const exportPdf = useCallback(async () => {
    track("export_clicked", {
      design_id: designId,
      channel: "pdf",
      is_pro: isPro(plan),
      export_style: exportStylePreset,
    });
    logFunnelEvent("export_clicked", {
      channel: "pdf",
      plan,
      export_style: exportStylePreset,
    });

    const isProPlan = isPro(plan);
    if (!isProPlan) track("pdf_export_attempted", { is_pro: false, tier: "free" });
    if (items.length === 0) {
      showToast("Add some items before exporting to PDF");
      return;
    }

    setIsPdfExporting(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const images = await captureExportImages();
      const tierImages = isProPlan ? images : images.slice(0, 1);
      const response = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: isProPlan
            ? exportStylePreset === "pro"
              ? "Interior AI Room Design - Technical Set"
              : "Interior AI Room Design - Presentation Set"
            : "Interior AI Room Design - Free Preview",
          images: tierImages,
          exportStylePreset,
          requestedTier: isProPlan ? "pro" : "free",
          items: items
            .map((item) => {
              const product = CATALOG_ITEMS[item.productId];
              if (!product) return null;
              return {
                name: product.title,
                price: getItemPrice(product),
                qty: item.qty || 1,
                retailer:
                  product.commerce.type === "affiliate"
                    ? product.commerce.data.retailer
                    : null,
                buyUrl:
                  product.commerce.type === "affiliate" ? product.commerce.data.url : null,
              };
            })
            .filter(Boolean),
        }),
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`PDF export failed: ${response.status} ${responseText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `room-design-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const surfaceMaterialCount = countExportedSurfaceMaterials(designSnapshotRef.current);
      track("pdf_exported", {
        design_id: designId,
        items_count: items.length,
        is_pro: isProPlan,
        tier: isProPlan ? "pro" : "free",
        export_style: exportStylePreset,
        surface_material_floor_count: surfaceMaterialCount,
        surface_material_count: surfaceMaterialCount,
      });
      if (!isProPlan) {
        track("upgrade_prompt_shown", { source: "export_pdf_free_completion" });
        setUpgradeReason("export_pdf");
        setShowUpgrade(true);
      }
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "PDF generation timed out. Please try again."
          : error instanceof Error
            ? error.message
            : "PDF export failed";
      console.error("PDF export error:", error);
      showToast(message);
    } finally {
      window.clearTimeout(timeoutId);
      setIsPdfExporting(false);
    }
  }, [
    captureExportImages,
    designId,
    designSnapshotRef,
    exportStylePreset,
    items,
    logFunnelEvent,
    plan,
    setShowUpgrade,
    setUpgradeReason,
    showToast,
  ]);

  return {
    state: { isExporting, isPdfExporting },
    actions: { exportImages, exportPdf },
  };
}
