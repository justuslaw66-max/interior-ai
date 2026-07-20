"use client";

import type { generateCabinetDocumentation } from "../generateCabinetDocumentation";
import { formatCabinetLabel } from "../formatCabinetLabel";
import type { CabinetBOMItem } from "../types";
import type { CabinetOutputTab } from "./CabinetOutputTabs";
import { sectionTitle } from "./CabinetStudioFormPrimitives";

type CabinetDocumentation = ReturnType<typeof generateCabinetDocumentation>;

export interface CabinetProductionOutputsProps {
  outputTab: CabinetOutputTab;
  bom: readonly CabinetBOMItem[];
  documentation: CabinetDocumentation;
  formatFeedback: (message: string) => string;
}

export function CabinetProductionOutputs({
  outputTab,
  bom,
  documentation,
  formatFeedback,
}: CabinetProductionOutputsProps) {
  return (
    <>
      <div
        hidden={outputTab !== "bom"}
        data-testid="cabinet-bom"
        data-bom-count={String(bom.length)}
        className="grid gap-2"
      >
        {sectionTitle("BOM")}
        <div className="max-h-72 overflow-auto rounded-md border border-neutral-200">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-2 py-2 font-medium">Part</th>
                <th className="px-2 py-2 font-medium">Qty</th>
                <th className="px-2 py-2 font-medium">Size</th>
              </tr>
            </thead>
            <tbody>
              {bom.map((item) => (
                <tr
                  key={item.id}
                  data-testid="cabinet-bom-row"
                  className="border-t border-neutral-100"
                >
                  <td className="px-2 py-2">{item.name}</td>
                  <td className="px-2 py-2">{item.quantity}</td>
                  <td className="px-2 py-2 text-neutral-500">
                    {item.width}×{item.height}×{item.depth}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div
        hidden={outputTab !== "overview"}
        data-testid="cabinet-assembly-profile"
        data-assembly-profile-schema={documentation.assemblyProfile.schema}
        data-assembly-profile-label={documentation.assemblyProfile.label}
        data-assembly-profile-phase={documentation.assemblyProfile.projectPhase}
        data-assembly-profile-placement-kind={
          documentation.assemblyProfile.placementKind
        }
        data-assembly-profile-complexity={
          documentation.assemblyProfile.fabricationComplexity
        }
        className="grid gap-2"
      >
        {sectionTitle("Assembly Profile")}
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-neutral-900">
            <span>{documentation.assemblyProfile.label}</span>
            <span>{documentation.assemblyProfile.fabricationComplexity}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            <span>Phase</span>
            <span className="text-right">
              {documentation.assemblyProfile.projectPhase.replace(/_/g, " ")}
            </span>
            <span>Placement</span>
            <span className="text-right">
              {documentation.assemblyProfile.placementKind.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-neutral-500">
            {documentation.assemblyProfile.quoteDrivers.join(", ")}
          </p>
        </div>
      </div>

      <div
        hidden={outputTab !== "overview"}
        data-testid="cabinet-quote-summary"
        data-quote-total={String(documentation.quoteSummary.estimatedTotal)}
        data-quote-line-count={String(documentation.quoteSummary.lineItems.length)}
        className="grid gap-2"
      >
        {sectionTitle("Preliminary Quote")}
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
          <div className="flex items-center justify-between text-sm font-semibold text-neutral-900">
            <span>Estimated total</span>
            <span>
              {documentation.quoteSummary.currency}{" "}
              {documentation.quoteSummary.estimatedTotal.toLocaleString()}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            <span>Materials</span>
            <span className="text-right">
              {documentation.quoteSummary.materialCost.toLocaleString()}
            </span>
            <span>Hardware</span>
            <span className="text-right">
              {documentation.quoteSummary.hardwareCost.toLocaleString()}
            </span>
            <span>Fabrication</span>
            <span className="text-right">
              {documentation.quoteSummary.fabricationCost.toLocaleString()}
            </span>
            <span>Install allowance</span>
            <span className="text-right">
              {documentation.quoteSummary.installationAllowance.toLocaleString()}
            </span>
            <span>Contingency</span>
            <span className="text-right">
              {documentation.quoteSummary.contingency.toLocaleString()}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-neutral-500">
            Preliminary only; supplier pricing and fabrication quotes are not
            connected yet.
          </p>
        </div>
      </div>

      <div
        hidden={outputTab !== "overview"}
        data-testid="cabinet-supplier-readiness"
        data-supplier-readiness-status={documentation.supplierReadiness.status}
        data-supplier-sku-mapping-count={String(
          documentation.supplierSkuMappings.length
        )}
        data-mapped-sku-count={String(documentation.supplierReadiness.mappedSkuCount)}
        data-missing-sku-count={String(documentation.supplierReadiness.missingSkuCount)}
        data-custom-quote-required-count={String(
          documentation.supplierReadiness.customQuoteRequiredCount
        )}
        data-release-blocker-count={String(
          documentation.supplierReadiness.releaseBlockerCount
        )}
        className="grid gap-2"
      >
        {sectionTitle("Supplier Readiness")}
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-neutral-900">
            <span>RFQ status</span>
            <span className="text-right text-xs uppercase text-neutral-600">
              {documentation.supplierReadiness.status.replace(/_/g, " ")}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            <span>Mapped SKUs</span>
            <span className="text-right">
              {documentation.supplierReadiness.mappedSkuCount}
            </span>
            <span>Missing SKUs</span>
            <span className="text-right">
              {documentation.supplierReadiness.missingSkuCount}
            </span>
            <span>Custom quote rows</span>
            <span className="text-right">
              {documentation.supplierReadiness.customQuoteRequiredCount}
            </span>
            <span>Release blockers</span>
            <span className="text-right">
              {documentation.supplierReadiness.releaseBlockerCount}
            </span>
          </div>
        </div>
        <div className="max-h-44 overflow-auto rounded-md border border-neutral-200">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-2 py-2 font-medium">Item</th>
                <th className="px-2 py-2 font-medium">SKU</th>
                <th className="px-2 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {documentation.supplierSkuMappings.map((item) => (
                <tr
                  key={item.id}
                  data-testid="cabinet-supplier-sku-row"
                  data-source-type={item.sourceType}
                  data-status={item.status}
                  className="border-t border-neutral-100"
                >
                  <td className="px-2 py-2">{item.displayName}</td>
                  <td className="px-2 py-2 text-neutral-500">
                    {item.skuId ?? "Quote"}
                  </td>
                  <td className="px-2 py-2 text-neutral-500">
                    {item.status.replace(/_/g, " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div
        hidden={outputTab !== "overview"}
        data-testid="cabinet-fabrication-release-readiness"
        data-fabrication-release-status={
          documentation.fabricationReleaseReadiness.status
        }
        data-fabrication-release-required-count={String(
          documentation.fabricationReleaseReadiness.requiredGateCount
        )}
        data-fabrication-release-recommended-count={String(
          documentation.fabricationReleaseReadiness.recommendedGateCount
        )}
        data-fabrication-release-blocker-count={String(
          documentation.fabricationReleaseReadiness.blockerCount
        )}
        data-fabrication-release-gate-count={String(
          documentation.fabricationReleaseReadiness.fabricationReleaseGateCount
        )}
        data-installation-gate-count={String(
          documentation.fabricationReleaseReadiness.installationGateCount
        )}
        className="grid gap-2"
      >
        {sectionTitle("Fabrication Release")}
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-neutral-900">
            <span>Release status</span>
            <span className="text-right text-xs uppercase text-neutral-600">
              {documentation.fabricationReleaseReadiness.status.replace(/_/g, " ")}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            <span>Required gates</span>
            <span className="text-right">
              {documentation.fabricationReleaseReadiness.requiredGateCount}
            </span>
            <span>Blockers</span>
            <span className="text-right">
              {documentation.fabricationReleaseReadiness.blockerCount}
            </span>
            <span>Fabrication gates</span>
            <span className="text-right">
              {documentation.fabricationReleaseReadiness.fabricationReleaseGateCount}
            </span>
            <span>Install gates</span>
            <span className="text-right">
              {documentation.fabricationReleaseReadiness.installationGateCount}
            </span>
          </div>
        </div>
      </div>

      <ScheduleTable
        hidden={outputTab !== "outputs"}
        testId="cabinet-dimension-schedule"
        countAttribute="data-dimension-schedule-count"
        count={documentation.dimensionSchedule.length}
        title="Dimension Schedule"
        maxHeightClass="max-h-40"
        headings={["Scope", "Size", "Offset"]}
        rows={documentation.dimensionSchedule.map((item) => ({
          id: item.id,
          testId: "cabinet-dimension-schedule-row",
          cells: [
            item.label,
            `${item.width}×${item.height}×${item.depth}`,
            typeof item.frontOffsetX === "number" ? item.frontOffsetX : "—",
          ],
        }))}
      />
      <ScheduleTable
        hidden={outputTab !== "outputs"}
        testId="cabinet-drawing-view-schedule"
        countAttribute="data-drawing-view-schedule-count"
        count={documentation.drawingViewSchedule.length}
        title="Drawing Views"
        maxHeightClass="max-h-40"
        headings={["View", "Sheet", "Scale"]}
        rows={documentation.drawingViewSchedule.map((item) => ({
          id: item.id,
          testId: "cabinet-drawing-view-schedule-row",
          cells: [item.label, item.sheetRef, item.scale],
        }))}
      />
      <ScheduleTable
        hidden={outputTab !== "materials"}
        testId="cabinet-material-schedule"
        countAttribute="data-material-schedule-count"
        count={documentation.materialSchedule.length}
        title="Material Schedule"
        headings={["Material", "Parts", "Area"]}
        rows={documentation.materialSchedule.map((item) => ({
          id: item.id,
          testId: "cabinet-material-schedule-row",
          cells: [item.materialName, item.partCount, `${item.areaSqM} m²`],
        }))}
      />
      <ScheduleTable
        hidden={outputTab !== "hardware"}
        testId="cabinet-hardware-schedule"
        countAttribute="data-hardware-schedule-count"
        count={documentation.hardwareSchedule.length}
        title="Hardware Schedule"
        maxHeightClass="max-h-36"
        headings={["Hardware", "Qty", "Compatibility"]}
        emptyMessage="No hardware scheduled."
        rows={documentation.hardwareSchedule.map((item) => ({
          id: item.id,
          testId: "cabinet-hardware-schedule-row",
          cells: [
            item.hardwareName,
            item.quantity,
            formatCabinetLabel(item.compatibilityStatus ?? "compatible"),
          ],
        }))}
      />

      <div
        hidden={outputTab !== "materials"}
        data-testid="cabinet-edge-banding-schedule"
        data-edge-banding-schedule-count={String(
          documentation.edgeBandingSchedule.length
        )}
        data-edge-banding-total-m={String(
          Math.round(
            documentation.edgeBandingSchedule.reduce(
              (sum, item) => sum + item.totalLengthM,
              0
            ) * 100
          ) / 100
        )}
        className="grid gap-2"
      >
        {sectionTitle("Edge Banding")}
        <div className="max-h-36 overflow-auto rounded-md border border-neutral-200">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
              <tr>
                {(["Material", "Treatment", "Length", "Parts"] as const).map(
                  (heading) => (
                    <th key={heading} className="px-2 py-2 font-medium">
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {documentation.edgeBandingSchedule.length ? (
                documentation.edgeBandingSchedule.map((item) => (
                  <tr
                    key={item.id}
                    data-testid="cabinet-edge-banding-row"
                    className="border-t border-neutral-100"
                  >
                    <td className="px-2 py-2">{item.edgeMaterialName}</td>
                    <td className="px-2 py-2 text-neutral-500">
                      {formatCabinetLabel(item.edgeTreatment ?? "matching_edge_band")}
                    </td>
                    <td className="px-2 py-2 text-neutral-500">
                      {item.totalLengthM} m
                    </td>
                    <td className="px-2 py-2">{item.partCount}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-2 py-2 text-neutral-500" colSpan={4}>
                    No edge banding scheduled.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div
        hidden={outputTab !== "bom"}
        data-testid="cabinet-cut-list"
        data-cut-list-count={String(documentation.cutList.length)}
        className="grid gap-2"
      >
        {sectionTitle("Cut List")}
        <div className="max-h-48 overflow-auto rounded-md border border-neutral-200">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
              <tr>
                {(["Part", "Module", "Size", "Grain", "Edge", "Exposed"] as const).map(
                  (heading) => (
                    <th key={heading} className="px-2 py-2 font-medium">
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {documentation.cutList.slice(0, 40).map((item) => (
                <tr
                  key={item.id}
                  data-testid="cabinet-cut-list-row"
                  className="border-t border-neutral-100"
                >
                  <td className="px-2 py-2">{item.name}</td>
                  <td className="px-2 py-2">
                    {item.moduleId.replace("module-", "")}
                  </td>
                  <td className="px-2 py-2 text-neutral-500">
                    {item.width}×{item.height}×{item.depth}
                  </td>
                  <td className="px-2 py-2 text-neutral-500">
                    {formatCabinetLabel(item.grainDirection ?? "none")}
                  </td>
                  <td className="px-2 py-2 text-neutral-500">
                    {formatCabinetLabel(item.edgeTreatment ?? "none")}
                  </td>
                  <td className="px-2 py-2 text-neutral-500">
                    {item.exposedFaces?.map(formatCabinetLabel).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div
        hidden={outputTab !== "outputs"}
        data-testid="cabinet-installer-notes"
        data-installer-note-count={String(documentation.installerNotes.length)}
        className="grid gap-2"
      >
        {sectionTitle("Installer Notes")}
        <div className="grid max-h-40 gap-2 overflow-auto rounded-md border border-neutral-200 p-2">
          {documentation.installerNotes.map((item) => (
            <div
              key={item.id}
              data-testid="cabinet-installer-note-row"
              className="rounded-md bg-neutral-50 px-2 py-1.5 text-xs text-neutral-700"
            >
              <span className="font-semibold">{item.category}:</span>{" "}
              {formatFeedback(item.message)}
            </div>
          ))}
        </div>
      </div>

      <div
        hidden={outputTab !== "issues"}
        data-testid="cabinet-release-checklist"
        data-release-checklist-count={String(
          documentation.releaseChecklist.length
        )}
        data-release-blocker-count={String(
          documentation.releaseChecklist.filter(
            (item) => item.status === "blocked"
          ).length
        )}
        className="grid gap-2"
      >
        {sectionTitle("Release Checklist")}
        <div className="grid max-h-44 gap-2 overflow-auto rounded-md border border-neutral-200 p-2">
          {documentation.releaseChecklist.map((item) => (
            <div
              key={item.id}
              data-testid="cabinet-release-checklist-row"
              className="rounded-md bg-neutral-50 px-2 py-1.5 text-xs text-neutral-700"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{item.label}</span>
                <span className="shrink-0 rounded-sm bg-white px-1.5 py-0.5 text-[10px] uppercase text-neutral-500">
                  {item.status}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">
                {item.owner} · {item.dueBefore.replace(/_/g, " ")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

interface ScheduleRow {
  id: string;
  testId: string;
  cells: readonly (string | number)[];
}

function ScheduleTable({
  hidden,
  testId,
  countAttribute,
  count,
  title,
  headings,
  rows,
  emptyMessage,
  maxHeightClass = "max-h-44",
}: {
  hidden: boolean;
  testId: string;
  countAttribute: string;
  count: number;
  title: string;
  headings: readonly string[];
  rows: readonly ScheduleRow[];
  emptyMessage?: string;
  maxHeightClass?: string;
}) {
  return (
    <div
      hidden={hidden}
      data-testid={testId}
      {...{ [countAttribute]: String(count) }}
      className="grid gap-2"
    >
      {sectionTitle(title)}
      <div
        className={`${maxHeightClass} overflow-auto rounded-md border border-neutral-200`}
      >
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
            <tr>
              {headings.map((heading) => (
                <th key={heading} className="px-2 py-2 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr
                  key={row.id}
                  data-testid={row.testId}
                  className="border-t border-neutral-100"
                >
                  {row.cells.map((cell, index) => (
                    <td
                      key={index}
                      className={`px-2 py-2 ${
                        index === 0 ? "" : "text-neutral-500"
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : emptyMessage ? (
              <tr>
                <td
                  className="px-2 py-2 text-neutral-500"
                  colSpan={headings.length}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
