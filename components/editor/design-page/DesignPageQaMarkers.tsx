import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type {
  CabinetProjectHandoffPackage,
  CabinetProjectSchedulePackage,
} from "@/features/cabinetry/types";
import type { FirstRunActivationState } from "@/lib/first-run-activation";
import type { ZoneMin } from "@/lib/room-types";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

export interface DesignPageScenePerformanceQaSnapshot {
  mode: "auto" | "quality" | "lite";
  effectiveMode: "quality" | "lite";
  renderQuality: "standard" | "lite";
  autoLite: boolean;
  sceneReady: boolean;
  roomCount: number;
  activeRoomItemCount: number;
  sceneItemCount: number;
  lastFps: number | null;
  fpsSamples: number;
}

export interface DesignPageLayoutQaSnapshot {
  viewMode: EditorViewMode;
  editorMode: DesignPageEditorMode;
  activeRoomId: string;
  activeRoomName: string;
  roomCount: number;
  roomItemCounts: string;
  planZoom: number;
  visibleLabelCount: number;
  plan2DCameraValid: boolean;
  plan2DCameraRecoveries: number;
  plan2DCameraTargetX: number;
  plan2DCameraTargetZ: number;
  projectedRoomMinWidthPx: number;
  projectedRoomMinHeightPx: number;
  projectedRoomMinAreaPx: number;
  selectedPlanRoomId: string;
}

export interface DesignPageHistoryQaSummary {
  pastCount: number;
  futureCount: number;
  transactionName: string | null;
}

export interface DesignPageProjectQaMarkersProps {
  snapshotFingerprint: string | null;
  activeRoomId: string;
  activeRoomZones: ZoneMin[];
  cabinetSchedule: CabinetProjectSchedulePackage;
  cabinetHandoff: CabinetProjectHandoffPackage | null;
}

export function DesignPageProjectQaMarkers({
  snapshotFingerprint,
  activeRoomId,
  activeRoomZones,
  cabinetSchedule,
  cabinetHandoff,
}: DesignPageProjectQaMarkersProps) {
  const manualZones = activeRoomZones.filter((zone) => zone.source === "manual");

  return (
    <>
      {snapshotFingerprint ? (
        <div
          data-testid="qa-editor-snapshot-fingerprint"
          data-fingerprint={snapshotFingerprint}
          hidden
        />
      ) : null}
      <div
        data-testid="qa-editor-zone-state"
        data-active-room-id={activeRoomId}
        data-zone-count={String(activeRoomZones.length)}
        data-manual-zone-count={String(manualZones.length)}
        data-manual-zone-items={manualZones
          .map((zone) => [...zone.itemIds].sort().join(","))
          .sort()
          .join("|")}
        hidden
      />
      {cabinetSchedule.totals.assetCount > 0 ? (
        <div
          data-testid="project-millwork-schedule"
          data-schema={cabinetSchedule.schema}
          data-source-type={cabinetSchedule.sourceType}
          data-room-count={String(cabinetSchedule.totals.roomCount)}
          data-asset-count={String(cabinetSchedule.totals.assetCount)}
          data-module-count={String(cabinetSchedule.totals.moduleCount)}
          data-bom-line-count={String(cabinetSchedule.totals.bomLineCount)}
          data-edge-banding-schedule-count={String(
            cabinetSchedule.totals.edgeBandingScheduleCount
          )}
          data-edge-banding-total-m={String(cabinetSchedule.totals.edgeBandingTotalM)}
          data-cut-list-count={String(cabinetSchedule.totals.cutListCount)}
          data-estimated-total={String(cabinetSchedule.totals.estimatedTotal)}
          data-release-blocker-count={String(cabinetSchedule.totals.releaseBlockerCount)}
          data-custom-quote-required-count={String(
            cabinetSchedule.totals.customQuoteRequiredCount
          )}
          hidden
        />
      ) : null}
      {cabinetHandoff ? (
        <div
          data-testid="project-millwork-readiness"
          data-schema={cabinetHandoff.schema}
          data-handoff-status={cabinetHandoff.handoffStatus}
          data-asset-count={String(cabinetHandoff.totals.assetCount)}
          data-package-count={String(cabinetHandoff.totals.packageCount)}
          data-scope-schema={cabinetHandoff.packages.scopePackage.schema}
          data-scope-family-count={String(
            cabinetHandoff.packages.scopePackage.totals.familyCount
          )}
          data-scope-assembly-type-count={String(
            cabinetHandoff.packages.scopePackage.totals.assemblyTypeCount
          )}
          data-scope-phase-represented-count={String(
            cabinetHandoff.packages.scopePackage.totals.phaseRepresentedCount
          )}
          data-quote-status={cabinetHandoff.packages.quotePackage.quoteStatus}
          data-purchase-readiness={
            cabinetHandoff.packages.purchaseReadinessPackage.purchaseReadiness
          }
          data-fabrication-release-status={
            cabinetHandoff.packages.fabricationReleasePackage.status
          }
          data-field-verification-status={
            cabinetHandoff.packages.fieldVerificationPackage.verificationStatus
          }
          data-installation-readiness={
            cabinetHandoff.packages.installationPlanPackage.installationReadiness
          }
          data-approval-status={cabinetHandoff.packages.approvalPackage.approvalStatus}
          data-release-blocker-count={String(cabinetHandoff.totals.releaseBlockerCount)}
          data-required-approval-count={String(cabinetHandoff.totals.requiredApprovalCount)}
          data-field-verification-required-count={String(
            cabinetHandoff.totals.fieldVerificationRequiredCount
          )}
          data-custom-quote-required-count={String(
            cabinetHandoff.packages.procurementPackage.totals.customQuoteRequiredCount
          )}
          data-can-issue-client={cabinetHandoff.canIssueToClient ? "true" : "false"}
          data-can-issue-fabricator={cabinetHandoff.canIssueToFabricator ? "true" : "false"}
          data-can-issue-installer={cabinetHandoff.canIssueToInstaller ? "true" : "false"}
          data-can-issue-purchase-review={
            cabinetHandoff.canIssueForPurchaseReview ? "true" : "false"
          }
          hidden
        />
      ) : null}
    </>
  );
}

export interface DesignPageRuntimeQaMarkersProps {
  qaHooksEnabled: boolean;
  firstRunActivation: FirstRunActivationState;
  scenePerformance: DesignPageScenePerformanceQaSnapshot | null;
  layout: DesignPageLayoutQaSnapshot | null;
  showLayoutDebugOverlay: boolean;
  history: DesignPageHistoryQaSummary;
}

export function DesignPageRuntimeQaMarkers({
  qaHooksEnabled,
  firstRunActivation,
  scenePerformance,
  layout,
  showLayoutDebugOverlay,
  history,
}: DesignPageRuntimeQaMarkersProps) {
  return (
    <>
      {qaHooksEnabled ? (
        <div
          data-testid="qa-first-run-activation"
          data-progress={String(firstRunActivation.progressPercent)}
          data-complete={firstRunActivation.complete ? "true" : "false"}
          data-next-step={firstRunActivation.nextStep?.id ?? "complete"}
          data-steps={firstRunActivation.steps
            .map((step) => `${step.id}:${step.complete ? "done" : "todo"}`)
            .join(",")}
          hidden
        />
      ) : null}
      {scenePerformance ? (
        <div
          data-testid="qa-scene-performance"
          data-mode={scenePerformance.mode}
          data-effective-mode={scenePerformance.effectiveMode}
          data-render-quality={scenePerformance.renderQuality}
          data-auto-lite={scenePerformance.autoLite ? "true" : "false"}
          data-scene-ready={scenePerformance.sceneReady ? "true" : "false"}
          data-room-count={String(scenePerformance.roomCount)}
          data-active-room-item-count={String(scenePerformance.activeRoomItemCount)}
          data-scene-item-count={String(scenePerformance.sceneItemCount)}
          data-last-fps={scenePerformance.lastFps === null ? "" : String(scenePerformance.lastFps)}
          data-fps-samples={String(scenePerformance.fpsSamples)}
          hidden
        />
      ) : null}
      {layout ? (
        <div
          data-testid="qa-design-layout-debug"
          data-view-mode={layout.viewMode}
          data-editor-mode={layout.editorMode}
          data-active-room-id={layout.activeRoomId}
          data-active-room-name={layout.activeRoomName}
          data-room-count={String(layout.roomCount)}
          data-room-item-counts={layout.roomItemCounts}
          data-plan-zoom={String(layout.planZoom)}
          data-visible-label-count={String(layout.visibleLabelCount)}
          data-plan-2d-camera-valid={layout.plan2DCameraValid ? "true" : "false"}
          data-plan-2d-camera-recoveries={String(layout.plan2DCameraRecoveries)}
          data-plan-2d-camera-target-x={String(layout.plan2DCameraTargetX)}
          data-plan-2d-camera-target-z={String(layout.plan2DCameraTargetZ)}
          data-plan-2d-projected-room-min-width-px={String(
            layout.projectedRoomMinWidthPx
          )}
          data-plan-2d-projected-room-min-height-px={String(
            layout.projectedRoomMinHeightPx
          )}
          data-plan-2d-projected-room-min-area-px={String(layout.projectedRoomMinAreaPx)}
          data-selected-plan-room-id={layout.selectedPlanRoomId}
          hidden
        />
      ) : null}
      {layout && showLayoutDebugOverlay ? (
        <div
          data-testid="qa-design-layout-debug-overlay"
          className="pointer-events-none fixed bottom-4 left-4 z-[80] rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-[11px] font-semibold text-neutral-700 shadow-xl backdrop-blur"
        >
          <div>Room: {layout.activeRoomName || layout.activeRoomId}</div>
          <div>Zoom: {layout.planZoom}</div>
          <div>Labels: {layout.visibleLabelCount}</div>
          <div>2D Camera: {layout.plan2DCameraValid ? "valid" : "invalid"}</div>
          <div>Items: {layout.roomItemCounts}</div>
          <div>
            Undo: {history.pastCount} · Redo: {history.futureCount}
          </div>
          <div>Txn: {history.transactionName ?? "none"}</div>
        </div>
      ) : null}
    </>
  );
}
