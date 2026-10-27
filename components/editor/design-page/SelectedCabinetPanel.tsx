"use client";

import type { DesignItem } from "@/lib/room-types";
import type { ParametricCabinetDesignItem } from "@/features/cabinetry/designItemAdapters";
import type {
  CabinetBOMItem,
  CabinetDocumentationSnapshot,
  CabinetProjectHandoffPackage,
} from "@/features/cabinetry/types";
import type { SelectedCabinetExportKind } from "@/features/cabinetry/selectedCabinetExportFeedback";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import { formatDisplayLength } from "@/lib/display-units";
import { Button } from "@/components/ui/Button";

export type { SelectedCabinetExportKind } from "@/features/cabinetry/selectedCabinetExportFeedback";

export type SelectedCabinetDocumentation = CabinetDocumentationSnapshot & {
  bom: CabinetBOMItem[];
};

function sumEdgeBandingMetres(documentation: SelectedCabinetDocumentation | null): number {
  return documentation ? documentation.edgeBandingSchedule.reduce((sum, item) => sum + item.totalLengthM, 0) : 0;
}

export interface SelectedCabinetPanelProps {
  measurementUnit: PlanMeasurementUnit;
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
  measurementUnit,
  cabinet,
  project,
  access,
  actions,
}: SelectedCabinetPanelProps) {
  const selectedCabinetItem = cabinet.item;
  const selectedCabinetPlanningDimensionsMm = cabinet.planningDimensionsMm;
  const selectedCabinetDocumentationSnapshot = cabinet.documentation;
  const selectedCabinetAssetManifest = cabinet.assetManifest;
  const edgeBandingTotalM = sumEdgeBandingMetres(selectedCabinetDocumentationSnapshot);
  const projectCabinetHandoffPackage = project.handoffPackage;
  const {
    canEdit,
    canUseStudio: canUseCabinetryStudio,
    isDesigner,
    isClientPreview,
  } = access;

  return (
        <div
          className={`absolute right-4 top-bar-17 z-40 md:top-bar-6 w-[320px] max-h-[calc(100vh-12.75rem-env(safe-area-inset-bottom))] overflow-y-auto pr-1 transition-opacity duration-300 md:max-h-[calc(100vh-var(--editor-bar-h)-2.5rem)] md:w-[21.25rem] ${
            isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden={isClientPreview}
        >
          <div
            data-testid="selected-cabinet-panel" data-touch-area data-surface="floating"
            className="w-full rounded-xl bg-surface-floating p-4 shadow ring-1 ring-surface-floating-edge"
          >
            <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-separator bg-surface-floating/95 px-4 py-2 text-sm font-semibold text-label backdrop-blur">
              Selected built-in
            </div>
            <div className="text-label">
              <div className="text-sm font-semibold">
                {selectedCabinetItem.name ?? selectedCabinetItem.cabinetDefinition.name}
              </div>
              <div className="mt-1 text-xs text-label-secondary">
                W {formatDisplayLength(selectedCabinetItem.cabinetDefinition.totalWidth, measurementUnit)} × H {formatDisplayLength(selectedCabinetItem.cabinetDefinition.height, measurementUnit)} × D {formatDisplayLength(selectedCabinetItem.cabinetDefinition.depth, measurementUnit)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-tile p-2">
                  <div className="text-label-secondary">Modules</div>
                  <div className="mt-1 font-semibold">
                    {selectedCabinetItem.cabinetDefinition.modules.length}
                  </div>
                </div>
                {isDesigner ? (
                  <div className="rounded-lg bg-tile p-2">
                    <div className="text-label-secondary">BOM lines</div>
                    <div className="mt-1 font-semibold">
                      {cabinet.bomLineCount}
                    </div>
                  </div>
                ) : selectedCabinetDocumentationSnapshot ? (
                  <div
                    data-testid="selected-cabinet-consumer-estimate"
                    data-currency={selectedCabinetDocumentationSnapshot.quoteSummary.currency}
                    data-estimated-total={String(selectedCabinetDocumentationSnapshot.quoteSummary.estimatedTotal)}
                    className="rounded-lg bg-accent-tint p-2"
                  >
                    <div className="text-on-accent-tint">Preliminary estimate</div>
                    <div className="mt-1 font-semibold text-on-accent-tint">
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
                className="mt-3 rounded-lg bg-tile p-3"
              >
                <div className="text-xs font-semibold text-label">
                  Placement
                </div>
                <div className="mt-1 text-xs text-label-secondary">
                  {selectedCabinetPlanningDimensionsMm
                    ? `${formatDisplayLength(selectedCabinetPlanningDimensionsMm.w, measurementUnit)} × ${formatDisplayLength(selectedCabinetPlanningDimensionsMm.d, measurementUnit)} footprint`
                    : "Footprint unavailable"}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    data-testid="selected-cabinet-center"
                    variant="secondary" size="regular"
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={actions.center}
                  >
                    Centre
                  </Button>
                  <Button
                    data-testid="selected-cabinet-snap-wall"
                    variant="secondary" size="regular"
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={actions.snapToWall}
                  >
                    Snap wall
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  <Button
                    size="compact"
                    data-testid="selected-cabinet-nudge-left"
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={() => actions.nudge(-0.05, 0)}
                  >
                    Left
                  </Button>
                  <Button
                    size="compact"
                    data-testid="selected-cabinet-nudge-back"
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={() => actions.nudge(0, -0.05)}
                  >
                    Back
                  </Button>
                  <Button
                    size="compact"
                    data-testid="selected-cabinet-nudge-front"
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={() => actions.nudge(0, 0.05)}
                  >
                    Front
                  </Button>
                  <Button
                    size="compact"
                    data-testid="selected-cabinet-nudge-right"
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={() => actions.nudge(0.05, 0)}
                  >
                    Right
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    data-testid="selected-cabinet-rotate-quarter"
                    variant="secondary" size="regular"
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={() => actions.rotateByDegrees(90)}
                  >
                    +90 deg
                  </Button>
                  <Button
                    data-testid="selected-cabinet-reset-rotation"
                    variant="secondary" size="regular"
                    disabled={!canEdit || (isDesigner && Boolean(selectedCabinetItem.locked))}
                    onClick={actions.resetRotation}
                  >
                    Reset rotation
                  </Button>
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
                  data-edge-banding-total-m={String(Math.round(edgeBandingTotalM * 100) / 100)}
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
                  className="mt-3 rounded-lg bg-tile p-3"
                >
                  <div className="text-xs font-semibold text-label">
                    Design-to-build data
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-surface-floating p-2 ring-1 ring-surface-floating-edge">
                      <div className="text-label-secondary">Quote total</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.quoteSummary.currency}{" "}
                        {selectedCabinetDocumentationSnapshot.quoteSummary.estimatedTotal.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-floating p-2 ring-1 ring-surface-floating-edge">
                      <div className="text-label-secondary">RFQ status</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.supplierReadiness.status.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-floating p-2 ring-1 ring-surface-floating-edge">
                      <div className="text-label-secondary">Cut list</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.cutList.length} parts
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-floating p-2 ring-1 ring-surface-floating-edge">
                      <div className="text-label-secondary">Edge banding</div>
                      <div className="mt-1 font-semibold">
                        {formatDisplayLength(edgeBandingTotalM * 1000, measurementUnit)}
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-floating p-2 ring-1 ring-surface-floating-edge">
                      <div className="text-label-secondary">Release gates</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.releaseChecklist.length}
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-floating p-2 ring-1 ring-surface-floating-edge">
                      <div className="text-label-secondary">Release status</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.fabricationReleaseReadiness.status.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-floating p-2 ring-1 ring-surface-floating-edge">
                      <div className="text-label-secondary">Built-in type</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.assemblyProfile.label}
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-floating p-2 ring-1 ring-surface-floating-edge">
                      <div className="text-label-secondary">Complexity</div>
                      <div className="mt-1 font-semibold">
                        {selectedCabinetDocumentationSnapshot.assemblyProfile.fabricationComplexity}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div className="text-xs font-semibold text-control-label-idle">
                      Materials
                    </div>
                    <div className="grid max-h-28 gap-1 overflow-auto">
                      {selectedCabinetDocumentationSnapshot.materialSchedule.slice(0, 4).map((item) => (
                        <div
                          key={item.id}
                          data-testid="selected-cabinet-material-row"
                          className="flex justify-between gap-2 rounded-md bg-surface-floating px-2 py-1 text-xs ring-1 ring-surface-floating-edge"
                        >
                          <span className="truncate">{item.materialName}</span>
                          <span className="shrink-0 text-label-secondary">
                            {item.partCount} parts
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs font-semibold text-control-label-idle">
                      Hardware
                    </div>
                    <div className="grid max-h-24 gap-1 overflow-auto">
                      {selectedCabinetDocumentationSnapshot.hardwareSchedule.length ? (
                        selectedCabinetDocumentationSnapshot.hardwareSchedule.slice(0, 4).map((item) => (
                          <div
                            key={item.id}
                            data-testid="selected-cabinet-hardware-row"
                            className="flex justify-between gap-2 rounded-md bg-surface-floating px-2 py-1 text-xs ring-1 ring-surface-floating-edge"
                          >
                            <span className="truncate">{item.hardwareName}</span>
                            <span className="shrink-0 text-label-secondary">
                              {item.quantity} ea
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-label-secondary">
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
                  className="mt-3 rounded-lg bg-tile p-3"
                >
                  <div className="text-xs font-semibold text-label">
                    Project readiness
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-surface-floating p-2 ring-1 ring-surface-floating-edge">
                      <div className="text-label-secondary">Handoff</div>
                      <div className="mt-1 font-semibold">
                        {projectCabinetHandoffPackage.handoffStatus.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-floating p-2 ring-1 ring-surface-floating-edge">
                      <div className="text-label-secondary">Scope</div>
                      <div className="mt-1 font-semibold">
                        {projectCabinetHandoffPackage.packages.scopePackage.totals.familyCount} family /{" "}
                        {projectCabinetHandoffPackage.packages.scopePackage.totals.assemblyTypeCount} type
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-floating p-2 ring-1 ring-surface-floating-edge">
                      <div className="text-label-secondary">Quote</div>
                      <div className="mt-1 font-semibold">
                        {projectCabinetHandoffPackage.packages.quotePackage.quoteStatus.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-floating p-2 ring-1 ring-surface-floating-edge">
                      <div className="text-label-secondary">Purchase</div>
                      <div className="mt-1 font-semibold">
                        {projectCabinetHandoffPackage.packages.purchaseReadinessPackage.purchaseReadiness.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-floating p-2 ring-1 ring-surface-floating-edge">
                      <div className="text-label-secondary">Fabrication</div>
                      <div className="mt-1 font-semibold">
                        {projectCabinetHandoffPackage.packages.fabricationReleasePackage.status.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-floating p-2 ring-1 ring-surface-floating-edge">
                      <div className="text-label-secondary">Install</div>
                      <div className="mt-1 font-semibold">
                        {projectCabinetHandoffPackage.packages.installationPlanPackage.installationReadiness.replace(/_/g, " ")}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-label-secondary">
                    {projectCabinetHandoffPackage.totals.requiredApprovalCount} approvals ·{" "}
                    {projectCabinetHandoffPackage.totals.fieldVerificationRequiredCount} field checks ·{" "}
                    {projectCabinetHandoffPackage.packages.procurementPackage.totals.customQuoteRequiredCount} quote rows
                  </div>
                </div>
              ) : null}
              <Button
                data-testid="selected-cabinet-download-placed-package"
                variant="secondary" size="regular" className="mt-3 w-full"
                disabled={!canUseCabinetryStudio}
                onClick={() => actions.export("placed-package")}
              >
                Download placed package
              </Button>
              <Button
                data-testid="selected-cabinet-download-installer-work-order"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio}
                onClick={() => actions.export("installer-work-order")}
              >
                Download install work order
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-field-verification"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-field-verification")}
              >
                Download field verification
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-finish-schedule"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-finish-schedule")}
              >
                Download finish schedule
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-schedule"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-schedule")}
              >
                Download project schedule
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-schedule-csv"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-schedule-csv")}
              >
                Download project CSV
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-scope"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-scope")}
              >
                Download scope package
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-procurement"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-procurement")}
              >
                Download procurement
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-quote"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-quote")}
              >
                Download project quote
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-purchase-readiness"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-purchase-readiness")}
              >
                Download purchase readiness
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-fabrication-release"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-fabrication-release")}
              >
                Download fab release
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-approval-package"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-approval")}
              >
                Download approval
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-revision-package"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-revision")}
              >
                Download revision package
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-drawing-set"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-drawing-set")}
              >
                Download drawing set
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-cut-list"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-cut-list")}
              >
                Download cut list
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-cnc-batch"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-cnc-batch")}
              >
                Download CNC batch
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-installation-plan"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-installation-plan")}
              >
                Download install plan
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-rfq"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-rfq")}
              >
                Download project RFQ
              </Button>
              <Button
                data-testid="selected-cabinet-download-project-handoff"
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canUseCabinetryStudio || !project.hasAssets}
                onClick={() => actions.export("project-handoff")}
              >
                Download handoff bundle
              </Button>
                </>
              ) : null}
              <Button
                data-testid="edit-placed-millwork"
                variant="primary" size="regular" className="mt-4 w-full"
                disabled={!canEdit || !canUseCabinetryStudio}
                onClick={actions.edit}
              >
                <span data-testid="edit-placed-cabinet">Edit built-in</span>
              </Button>
              <Button
                variant="secondary" size="regular" className="mt-2 w-full"
                disabled={!canEdit}
                onClick={actions.delete}
              >
                Delete built-in
              </Button>
            </div>
          </div>
        </div>
  );
}
