"use client";

import type { DesignItem } from "@/lib/room-types";
import type { ParametricCabinetDesignItem } from "@/features/cabinetry/designItemAdapters";
import type {
  CabinetBOMItem,
  CabinetDocumentationSnapshot,
  CabinetProjectHandoffPackage,
} from "@/features/cabinetry/types";
import type { SelectedCabinetExportKind } from "@/features/cabinetry/selectedCabinetExportFeedback";

export type { SelectedCabinetExportKind } from "@/features/cabinetry/selectedCabinetExportFeedback";

export type SelectedCabinetDocumentation = CabinetDocumentationSnapshot & {
  bom: CabinetBOMItem[];
};


export interface SelectedCabinetPanelProps {
  cabinet: {
    item: ParametricCabinetDesignItem;
    planningDimensionsMm: { w: number; d: number; h: number } | null;
    documentation: SelectedCabinetDocumentation | null;
    assetManifest: NonNullable<DesignItem["millworkAssetManifest"]> | null;
    rotationY: number;
    bomLineCount: number;
  };
  project: {
    handoffPackage: CabinetProjectHandoffPackage | null;
    hasAssets: boolean;
  };
  access: {
    canEdit: boolean;
    canUseStudio: boolean;
    isDesigner: boolean;
    isClientPreview: boolean;
    designerTheme: boolean;
  };
  actions: {
    center: () => void;
    snapToWall: () => void;
    nudge: (deltaX: number, deltaZ: number) => void;
    rotateByDegrees: (degrees: number) => void;
    resetRotation: () => void;
    export: (kind: SelectedCabinetExportKind) => void;
    edit: () => void;
    delete: () => void;
  };
}

export function SelectedCabinetPanel({
  cabinet,
  project,
  access,
  actions,
}: SelectedCabinetPanelProps) {
  const selectedCabinetItem = cabinet.item;
  const selectedCabinetPlanningDimensionsMm = cabinet.planningDimensionsMm;
  const selectedCabinetDocumentationSnapshot = cabinet.documentation;
  const selectedCabinetAssetManifest = cabinet.assetManifest;
  const projectCabinetHandoffPackage = project.handoffPackage;
  const {
    canEdit,
    canUseStudio: canUseCabinetryStudio,
    isDesigner,
    isClientPreview,
    designerTheme: showDesignerTheme,
  } = access;

  return (
        <div
          className={`absolute right-4 top-15 z-40 w-[320px] max-h-[calc(100vh-4.75rem)] overflow-y-auto pr-1 transition-opacity duration-300 md:w-[21.25rem] ${
            isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden={isClientPreview}
        >
          <div
            data-testid="selected-cabinet-panel"
            className={
              showDesignerTheme
                ? "designer-panel designer-panel-strong w-full rounded-xl p-4"
                : "w-full rounded-xl bg-white p-4 shadow"
            }
          >
            <div
              className={
                showDesignerTheme
                  ? "designer-raised designer-divider sticky top-0 z-20 -mx-4 mb-3 border-b px-4 py-2 text-sm font-semibold"
                  : "sticky top-0 z-20 -mx-4 mb-3 border-b border-neutral-200 bg-white/95 px-4 py-2 text-sm font-semibold text-neutral-900 backdrop-blur"
              }
            >
              Selected Millwork
            </div>
            <div className={showDesignerTheme ? "text-neutral-100" : "text-neutral-900"}>
              <div className="text-sm font-semibold">
                {selectedCabinetItem.name ?? selectedCabinetItem.cabinetDefinition.name}
              </div>
              <div className={showDesignerTheme ? "mt-1 text-xs text-neutral-400" : "mt-1 text-xs text-neutral-500"}>
                {selectedCabinetItem.cabinetDefinition.totalWidth}w x {selectedCabinetItem.cabinetDefinition.height}h x {selectedCabinetItem.cabinetDefinition.depth}d mm
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className={showDesignerTheme ? "rounded-lg bg-white/5 p-2" : "rounded-lg bg-neutral-50 p-2"}>
                  <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>Modules</div>
                  <div className="mt-1 font-semibold">
                    {selectedCabinetItem.cabinetDefinition.modules.length}
                  </div>
                </div>
                {isDesigner ? (
                  <div className={showDesignerTheme ? "rounded-lg bg-white/5 p-2" : "rounded-lg bg-neutral-50 p-2"}>
                    <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>BOM lines</div>
                    <div className="mt-1 font-semibold">
                      {cabinet.bomLineCount}
                    </div>
                  </div>
                ) : selectedCabinetDocumentationSnapshot ? (
                  <div
                    data-testid="selected-cabinet-consumer-estimate"
                    data-currency={selectedCabinetDocumentationSnapshot.quoteSummary.currency}
                    data-estimated-total={String(selectedCabinetDocumentationSnapshot.quoteSummary.estimatedTotal)}
                    className="rounded-lg bg-blue-50 p-2"
                  >
                    <div className="text-blue-700">Preliminary estimate</div>
                    <div className="mt-1 font-semibold text-blue-950">
                      {selectedCabinetDocumentationSnapshot.quoteSummary.estimatedTotal.toLocaleString("en-US", {
                        style: "currency",
                        currency: selectedCabinetDocumentationSnapshot.quoteSummary.currency,
                        maximumFractionDigits: 0,
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
              <div
                data-testid="selected-cabinet-placement-controls"
                data-position={selectedCabinetItem.position.join(",")}
                data-rotation-y={String(cabinet.rotationY)}
                className={showDesignerTheme ? "mt-3 rounded-lg bg-white/5 p-3" : "mt-3 rounded-lg bg-neutral-50 p-3"}
              >
                <div className={showDesignerTheme ? "text-xs font-semibold text-neutral-200" : "text-xs font-semibold text-neutral-800"}>
                  Placement
                </div>
                <div className={showDesignerTheme ? "mt-1 text-xs text-neutral-400" : "mt-1 text-xs text-neutral-500"}>
                  {selectedCabinetPlanningDimensionsMm
                    ? `${(selectedCabinetPlanningDimensionsMm.w / 1000).toFixed(2)} x ${(selectedCabinetPlanningDimensionsMm.d / 1000).toFixed(2)} m footprint`
                    : "Footprint unavailable"}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid="selected-cabinet-center"
                    className={
                      showDesignerTheme
                        ? "min-h-9 rounded-md border border-white/15 px-2 text-xs text-neutral-100 disabled:opacity-40"
                        : "min-h-9 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-800 disabled:opacity-40"
                    }
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={actions.center}
                  >
                    Center
                  </button>
                  <button
                    type="button"
                    data-testid="selected-cabinet-snap-wall"
                    className={
                      showDesignerTheme
                        ? "min-h-9 rounded-md border border-white/15 px-2 text-xs text-neutral-100 disabled:opacity-40"
                        : "min-h-9 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-800 disabled:opacity-40"
                    }
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={actions.snapToWall}
                  >
                    Snap wall
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    data-testid="selected-cabinet-nudge-left"
                    className={
                      showDesignerTheme
                        ? "min-h-9 rounded-md border border-white/15 px-2 text-xs text-neutral-100 disabled:opacity-40"
                        : "min-h-9 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-800 disabled:opacity-40"
                    }
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={() => actions.nudge(-0.05, 0)}
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    data-testid="selected-cabinet-nudge-back"
                    className={
                      showDesignerTheme
                        ? "min-h-9 rounded-md border border-white/15 px-2 text-xs text-neutral-100 disabled:opacity-40"
                        : "min-h-9 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-800 disabled:opacity-40"
                    }
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={() => actions.nudge(0, -0.05)}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    data-testid="selected-cabinet-nudge-front"
                    className={
                      showDesignerTheme
                        ? "min-h-9 rounded-md border border-white/15 px-2 text-xs text-neutral-100 disabled:opacity-40"
                        : "min-h-9 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-800 disabled:opacity-40"
                    }
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={() => actions.nudge(0, 0.05)}
                  >
                    Front
                  </button>
                  <button
                    type="button"
                    data-testid="selected-cabinet-nudge-right"
                    className={
                      showDesignerTheme
                        ? "min-h-9 rounded-md border border-white/15 px-2 text-xs text-neutral-100 disabled:opacity-40"
                        : "min-h-9 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-800 disabled:opacity-40"
                    }
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={() => actions.nudge(0.05, 0)}
                  >
                    Right
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid="selected-cabinet-rotate-quarter"
                    className={
                      showDesignerTheme
                        ? "min-h-9 rounded-md border border-white/15 px-2 text-xs text-neutral-100 disabled:opacity-40"
                        : "min-h-9 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-800 disabled:opacity-40"
                    }
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={() => actions.rotateByDegrees(90)}
                  >
                    +90 deg
                  </button>
                  <button
                    type="button"
                    data-testid="selected-cabinet-reset-rotation"
                    className={
                      showDesignerTheme
                        ? "min-h-9 rounded-md border border-white/15 px-2 text-xs text-neutral-100 disabled:opacity-40"
                        : "min-h-9 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-800 disabled:opacity-40"
                    }
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={actions.resetRotation}
                  >
                    Reset rotation
                  </button>
                </div>
              </div>
              {isDesigner ? (
                <>
              {selectedCabinetDocumentationSnapshot ? (
                <div
                  data-testid="selected-cabinet-documentation-summary"
                  data-bom-count={String(selectedCabinetDocumentationSnapshot.bom.length)}
                  data-material-schedule-count={String(selectedCabinetDocumentationSnapshot.materialSchedule.length)}
                  data-hardware-schedule-count={String(selectedCabinetDocumentationSnapshot.hardwareSchedule.length)}
                  data-edge-banding-schedule-count={String(selectedCabinetDocumentationSnapshot.edgeBandingSchedule.length)}
                  data-edge-banding-total-m={String(
                    Math.round(
                      selectedCabinetDocumentationSnapshot.edgeBandingSchedule.reduce(
                        (sum, item) => sum + item.totalLengthM,
                        0
                      ) * 100
                    ) / 100
                  )}
                  data-cut-list-count={String(selectedCabinetDocumentationSnapshot.cutList.length)}
                  data-dimension-schedule-count={String(selectedCabinetDocumentationSnapshot.dimensionSchedule.length)}
                  data-drawing-view-schedule-count={String(selectedCabinetDocumentationSnapshot.drawingViewSchedule.length)}
                  data-release-checklist-count={String(selectedCabinetDocumentationSnapshot.releaseChecklist.length)}
                  data-release-blocker-count={String(
                    selectedCabinetDocumentationSnapshot.releaseChecklist.filter((item) => item.status === "blocked").length
                  )}
                  data-quote-total={String(selectedCabinetDocumentationSnapshot.quoteSummary.estimatedTotal)}
                  data-supplier-readiness-status={selectedCabinetDocumentationSnapshot.supplierReadiness.status}
                  data-supplier-sku-mapping-count={String(selectedCabinetDocumentationSnapshot.supplierSkuMappings.length)}
                  data-fabrication-release-status={selectedCabinetDocumentationSnapshot.fabricationReleaseReadiness.status}
                  data-fabrication-release-required-count={String(selectedCabinetDocumentationSnapshot.fabricationReleaseReadiness.requiredGateCount)}
                  data-fabrication-release-blocker-count={String(selectedCabinetDocumentationSnapshot.fabricationReleaseReadiness.blockerCount)}
                  data-assembly-profile-schema={selectedCabinetDocumentationSnapshot.assemblyProfile.schema}
                  data-assembly-profile-label={selectedCabinetDocumentationSnapshot.assemblyProfile.label}
                  data-assembly-profile-phase={selectedCabinetDocumentationSnapshot.assemblyProfile.projectPhase}
                  data-assembly-profile-placement-kind={selectedCabinetDocumentationSnapshot.assemblyProfile.placementKind}
                  data-assembly-profile-complexity={selectedCabinetDocumentationSnapshot.assemblyProfile.fabricationComplexity}
                  data-asset-manifest-schema={selectedCabinetAssetManifest?.schema ?? ""}
                  data-asset-manifest-version={String(selectedCabinetAssetManifest?.version ?? "")}
                  data-asset-manifest-source-definition-version={String(
                    selectedCabinetAssetManifest?.sourceDefinitionVersion ?? ""
                  )}
                  data-generated-output-kind={selectedCabinetAssetManifest?.generatedOutput.kind ?? ""}
                  data-generated-output-durable={
                    selectedCabinetAssetManifest?.generatedOutput.durable ? "true" : "false"
                  }
                  className={showDesignerTheme ? "mt-3 rounded-lg bg-white/5 p-3" : "mt-3 rounded-lg bg-neutral-50 p-3"}
                >
                  <div className={showDesignerTheme ? "text-xs font-semibold text-neutral-200" : "text-xs font-semibold text-neutral-800"}>
                    Design-to-build data
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className={showDesignerTheme ? "rounded-md bg-black/10 p-2" : "rounded-md bg-white p-2"}>
                      <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>Quote total</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.quoteSummary.currency}{" "}
                        {selectedCabinetDocumentationSnapshot.quoteSummary.estimatedTotal.toLocaleString()}
                      </div>
                    </div>
                    <div className={showDesignerTheme ? "rounded-md bg-black/10 p-2" : "rounded-md bg-white p-2"}>
                      <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>RFQ status</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.supplierReadiness.status.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className={showDesignerTheme ? "rounded-md bg-black/10 p-2" : "rounded-md bg-white p-2"}>
                      <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>Cut list</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.cutList.length} parts
                      </div>
                    </div>
                    <div className={showDesignerTheme ? "rounded-md bg-black/10 p-2" : "rounded-md bg-white p-2"}>
                      <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>Edge banding</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.edgeBandingSchedule.reduce(
                          (sum, item) => sum + item.totalLengthM,
                          0
                        ).toFixed(2)} m
                      </div>
                    </div>
                    <div className={showDesignerTheme ? "rounded-md bg-black/10 p-2" : "rounded-md bg-white p-2"}>
                      <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>Release gates</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.releaseChecklist.length}
                      </div>
                    </div>
                    <div className={showDesignerTheme ? "rounded-md bg-black/10 p-2" : "rounded-md bg-white p-2"}>
                      <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>Release status</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.fabricationReleaseReadiness.status.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className={showDesignerTheme ? "rounded-md bg-black/10 p-2" : "rounded-md bg-white p-2"}>
                      <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>Built-in type</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.assemblyProfile.label}
                      </div>
                    </div>
                    <div className={showDesignerTheme ? "rounded-md bg-black/10 p-2" : "rounded-md bg-white p-2"}>
                      <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>Complexity</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.assemblyProfile.fabricationComplexity}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div className={showDesignerTheme ? "text-xs font-semibold text-neutral-300" : "text-xs font-semibold text-neutral-700"}>
                      Materials
                    </div>
                    <div className="grid max-h-28 gap-1 overflow-auto">
                      {selectedCabinetDocumentationSnapshot.materialSchedule.slice(0, 4).map((item) => (
                        <div
                          key={item.id}
                          data-testid="selected-cabinet-material-row"
                          className={showDesignerTheme ? "flex justify-between gap-2 rounded-md bg-black/10 px-2 py-1 text-xs" : "flex justify-between gap-2 rounded-md bg-white px-2 py-1 text-xs"}
                        >
                          <span className="truncate">{item.materialName}</span>
                          <span className={showDesignerTheme ? "shrink-0 text-neutral-400" : "shrink-0 text-neutral-500"}>
                            {item.partCount} parts
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className={showDesignerTheme ? "text-xs font-semibold text-neutral-300" : "text-xs font-semibold text-neutral-700"}>
                      Hardware
                    </div>
                    <div className="grid max-h-24 gap-1 overflow-auto">
                      {selectedCabinetDocumentationSnapshot.hardwareSchedule.length ? (
                        selectedCabinetDocumentationSnapshot.hardwareSchedule.slice(0, 4).map((item) => (
                          <div
                            key={item.id}
                            data-testid="selected-cabinet-hardware-row"
                            className={showDesignerTheme ? "flex justify-between gap-2 rounded-md bg-black/10 px-2 py-1 text-xs" : "flex justify-between gap-2 rounded-md bg-white px-2 py-1 text-xs"}
                          >
                            <span className="truncate">{item.hardwareName}</span>
                            <span className={showDesignerTheme ? "shrink-0 text-neutral-400" : "shrink-0 text-neutral-500"}>
                              {item.quantity} ea
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className={showDesignerTheme ? "text-xs text-neutral-400" : "text-xs text-neutral-500"}>
                          No hardware scheduled.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
              {projectCabinetHandoffPackage ? (
                <div
                  data-testid="selected-cabinet-project-readiness"
                  data-schema={projectCabinetHandoffPackage.schema}
                  data-handoff-status={projectCabinetHandoffPackage.handoffStatus}
                  data-asset-count={String(projectCabinetHandoffPackage.totals.assetCount)}
                  data-package-count={String(projectCabinetHandoffPackage.totals.packageCount)}
                  data-scope-schema={projectCabinetHandoffPackage.packages.scopePackage.schema}
                  data-scope-family-count={String(projectCabinetHandoffPackage.packages.scopePackage.totals.familyCount)}
                  data-scope-assembly-type-count={String(
                    projectCabinetHandoffPackage.packages.scopePackage.totals.assemblyTypeCount
                  )}
                  data-scope-phase-represented-count={String(
                    projectCabinetHandoffPackage.packages.scopePackage.totals.phaseRepresentedCount
                  )}
                  data-quote-status={projectCabinetHandoffPackage.packages.quotePackage.quoteStatus}
                  data-purchase-readiness={
                    projectCabinetHandoffPackage.packages.purchaseReadinessPackage.purchaseReadiness
                  }
                  data-fabrication-release-status={projectCabinetHandoffPackage.packages.fabricationReleasePackage.status}
                  data-field-verification-status={
                    projectCabinetHandoffPackage.packages.fieldVerificationPackage.verificationStatus
                  }
                  data-installation-readiness={
                    projectCabinetHandoffPackage.packages.installationPlanPackage.installationReadiness
                  }
                  data-approval-status={projectCabinetHandoffPackage.packages.approvalPackage.approvalStatus}
                  data-release-blocker-count={String(projectCabinetHandoffPackage.totals.releaseBlockerCount)}
                  data-required-approval-count={String(projectCabinetHandoffPackage.totals.requiredApprovalCount)}
                  data-field-verification-required-count={String(
                    projectCabinetHandoffPackage.totals.fieldVerificationRequiredCount
                  )}
                  data-custom-quote-required-count={String(
                    projectCabinetHandoffPackage.packages.procurementPackage.totals.customQuoteRequiredCount
                  )}
                  data-can-issue-client={projectCabinetHandoffPackage.canIssueToClient ? "true" : "false"}
                  data-can-issue-fabricator={projectCabinetHandoffPackage.canIssueToFabricator ? "true" : "false"}
                  data-can-issue-installer={projectCabinetHandoffPackage.canIssueToInstaller ? "true" : "false"}
                  data-can-issue-purchase-review={
                    projectCabinetHandoffPackage.canIssueForPurchaseReview ? "true" : "false"
                  }
                  className={showDesignerTheme ? "mt-3 rounded-lg bg-white/5 p-3" : "mt-3 rounded-lg bg-neutral-50 p-3"}
                >
                  <div className={showDesignerTheme ? "text-xs font-semibold text-neutral-200" : "text-xs font-semibold text-neutral-800"}>
                    Project readiness
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className={showDesignerTheme ? "rounded-md bg-black/10 p-2" : "rounded-md bg-white p-2"}>
                      <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>Handoff</div>
                      <div className="mt-1 font-semibold">
                        {projectCabinetHandoffPackage.handoffStatus.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className={showDesignerTheme ? "rounded-md bg-black/10 p-2" : "rounded-md bg-white p-2"}>
                      <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>Scope</div>
                      <div className="mt-1 font-semibold">
                        {projectCabinetHandoffPackage.packages.scopePackage.totals.familyCount} family /{" "}
                        {projectCabinetHandoffPackage.packages.scopePackage.totals.assemblyTypeCount} type
                      </div>
                    </div>
                    <div className={showDesignerTheme ? "rounded-md bg-black/10 p-2" : "rounded-md bg-white p-2"}>
                      <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>Quote</div>
                      <div className="mt-1 font-semibold">
                        {projectCabinetHandoffPackage.packages.quotePackage.quoteStatus.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className={showDesignerTheme ? "rounded-md bg-black/10 p-2" : "rounded-md bg-white p-2"}>
                      <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>Purchase</div>
                      <div className="mt-1 font-semibold">
                        {projectCabinetHandoffPackage.packages.purchaseReadinessPackage.purchaseReadiness.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className={showDesignerTheme ? "rounded-md bg-black/10 p-2" : "rounded-md bg-white p-2"}>
                      <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>Fabrication</div>
                      <div className="mt-1 font-semibold">
                        {projectCabinetHandoffPackage.packages.fabricationReleasePackage.status.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className={showDesignerTheme ? "rounded-md bg-black/10 p-2" : "rounded-md bg-white p-2"}>
                      <div className={showDesignerTheme ? "text-neutral-400" : "text-neutral-500"}>Install</div>
                      <div className="mt-1 font-semibold">
                        {projectCabinetHandoffPackage.packages.installationPlanPackage.installationReadiness.replace(/_/g, " ")}
                      </div>
                    </div>
                  </div>
                  <div className={showDesignerTheme ? "mt-2 text-xs text-neutral-400" : "mt-2 text-xs text-neutral-500"}>
                    {projectCabinetHandoffPackage.totals.requiredApprovalCount} approvals ·{" "}
                    {projectCabinetHandoffPackage.totals.fieldVerificationRequiredCount} field checks ·{" "}
                    {projectCabinetHandoffPackage.packages.procurementPackage.totals.customQuoteRequiredCount} quote rows
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                data-testid="selected-cabinet-download-placed-package"
                className={
                  showDesignerTheme
                    ? "mt-3 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-3 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio}
                onClick={() => actions.export("placed-package")}
              >
                Download Placed Package
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-installer-work-order"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio}
                onClick={() => actions.export("installer-work-order")}
              >
                Download Install Work Order
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-field-verification"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-field-verification")}
              >
                Download Field Verification
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-finish-schedule"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-finish-schedule")}
              >
                Download Finish Schedule
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-schedule"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-schedule")}
              >
                Download Project Schedule
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-schedule-csv"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-schedule-csv")}
              >
                Download Project CSV
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-scope"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-scope")}
              >
                Download Scope Package
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-procurement"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-procurement")}
              >
                Download Procurement
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-quote"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-quote")}
              >
                Download Project Quote
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-purchase-readiness"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-purchase-readiness")}
              >
                Download Purchase Readiness
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-fabrication-release"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-fabrication-release")}
              >
                Download Fab Release
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-approval-package"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-approval")}
              >
                Download Approval
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-revision-package"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-revision")}
              >
                Download Revision Package
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-drawing-set"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-drawing-set")}
              >
                Download Drawing Set
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-cut-list"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-cut-list")}
              >
                Download Cut List
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-cnc-batch"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-cnc-batch")}
              >
                Download CNC Batch
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-installation-plan"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-installation-plan")}
              >
                Download Install Plan
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-rfq"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-rfq")}
              >
                Download Project RFQ
              </button>
              <button
                type="button"
                data-testid="selected-cabinet-download-project-handoff"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-handoff")}
              >
                Download Handoff Bundle
              </button>
                </>
              ) : null}
              <button
                type="button"
                data-testid="edit-placed-millwork"
                className="mt-4 min-h-10 w-full rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white disabled:opacity-40"
                disabled={!canEdit || !canUseCabinetryStudio}
                onClick={actions.edit}
              >
                <span data-testid="edit-placed-cabinet">Edit Millwork</span>
              </button>
              <button
                type="button"
                className={
                  showDesignerTheme
                    ? "mt-2 min-h-10 w-full rounded-lg bg-white/10 px-3 text-sm font-semibold text-neutral-100 disabled:opacity-40"
                    : "mt-2 min-h-10 w-full rounded-lg bg-neutral-100 px-3 text-sm font-semibold text-neutral-900 disabled:opacity-40"
                }
                disabled={!canEdit}
                onClick={actions.delete}
              >
                Delete Millwork
              </button>
            </div>
          </div>
        </div>
  );
}
