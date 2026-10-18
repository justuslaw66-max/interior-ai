"use client";

import { Copy, Download, FileText, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRef, type ChangeEventHandler } from "react";

import type { generateCabinetDocumentation } from "../generateCabinetDocumentation";
import type {
  CabinetBOMItem,
  CabinetDefinition,
  CabinetValidationAutoFix,
  CabinetValidationIssue,
} from "../types";
import type { CabinetryStudioProps } from "./CabinetryStudio.contract";
import { CabinetOutputTabs, type CabinetOutputTab } from "./CabinetOutputTabs";
import { CabinetProductionOutputs } from "./CabinetProductionOutputs";
import { sectionTitle } from "./CabinetStudioFormPrimitives";
import {
  ValidationFixPreview,
  ValidationIssueCard,
} from "./CabinetValidationFeedback";

type CabinetDocumentation = ReturnType<typeof generateCabinetDocumentation>;

export type CabinetStudioBusyAction =
  | "download"
  | "source"
  | "import"
  | "docs"
  | "shopDrawing"
  | "dxf"
  | "rfq"
  | "package"
  | "place"
  | "copy"
  | "save";

export interface CabinetStudioOutputsPanelProps {
  outputTab: CabinetOutputTab;
  definition: CabinetDefinition;
  bom: readonly CabinetBOMItem[];
  documentation: CabinetDocumentation;
  errors: readonly CabinetValidationIssue[];
  warnings: readonly CabinetValidationIssue[];
  infos: readonly CabinetValidationIssue[];
  pendingValidationFix: {
    issue: CabinetValidationIssue;
    fix: CabinetValidationAutoFix;
    candidate: CabinetDefinition;
  } | null;
  valid: boolean;
  busyAction: CabinetStudioBusyAction | null;
  mode: CabinetryStudioProps["mode"];
  actionError: string | null;
  actionSuccess: string | null;
  canSaveDefinition: boolean;
  canPlaceInPlan: boolean;
  formatFeedback: (message: string) => string;
  onTabChange: (tab: CabinetOutputTab) => void;
  onFocusIssue: (issue: CabinetValidationIssue) => void;
  onRequestFix: (
    issue: CabinetValidationIssue,
    fix: CabinetValidationAutoFix
  ) => void;
  onCancelFix: () => void;
  onApplyFix: () => void;
  onImportSource: ChangeEventHandler<HTMLInputElement>;
  onDownloadGlb: () => void;
  onDownloadSource: () => void;
  onDownloadDocumentation: () => void;
  onDownloadShopDrawing: () => void;
  onDownloadDxf: () => void;
  onDownloadRfq: () => void;
  onDownloadPackage: () => void;
  onSaveAsCopy: () => void;
  onSaveDefinition: () => void;
  onPlaceInPlan: () => void;
}

export function CabinetStudioOutputsPanel({
  outputTab,
  definition,
  bom,
  documentation,
  errors,
  warnings,
  infos,
  pendingValidationFix,
  valid,
  busyAction,
  mode,
  actionError,
  actionSuccess,
  canSaveDefinition,
  canPlaceInPlan,
  formatFeedback,
  onTabChange,
  onFocusIssue,
  onRequestFix,
  onCancelFix,
  onApplyFix,
  onImportSource,
  onDownloadGlb,
  onDownloadSource,
  onDownloadDocumentation,
  onDownloadShopDrawing,
  onDownloadDxf,
  onDownloadRfq,
  onDownloadPackage,
  onSaveAsCopy,
  onSaveDefinition,
  onPlaceInPlan,
}: CabinetStudioOutputsPanelProps) {
  const sourceImportInputRef = useRef<HTMLInputElement>(null);
  const interactionDisabled = busyAction !== null;

  return (
    <aside className="overflow-auto border-l border-neutral-200 bg-white p-4">
      <div className="grid gap-5">
        <CabinetOutputTabs
          value={outputTab}
          issueCount={errors.length + warnings.length + infos.length}
          onChange={onTabChange}
        />
        <div
          id="cabinet-output-panel"
          role="tabpanel"
          aria-labelledby={`cabinet-output-tab-${outputTab}`}
          tabIndex={0}
          className="grid gap-5"
        >
          <div
            hidden={outputTab !== "issues"}
            data-testid="cabinet-validation"
            data-validation-policy="errors_block_warnings_allow"
            data-error-count={String(errors.length)}
            data-warning-count={String(warnings.length)}
            data-info-count={String(infos.length)}
            className="grid gap-2"
          >
            {sectionTitle("Validation")}
            {!errors.length && !warnings.length && !infos.length ? (
              <p
                data-testid="cabinet-validation-success"
                className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
              >
                Built-in parameters are valid.
              </p>
            ) : (
              <div className="grid gap-2">
                {[...errors, ...warnings, ...infos].map((issue) => (
                  <ValidationIssueCard
                    key={issue.id}
                    issue={issue}
                    onFocus={onFocusIssue}
                    onRequestFix={onRequestFix}
                  />
                ))}
              </div>
            )}
            {pendingValidationFix ? (
              <ValidationFixPreview
                pending={pendingValidationFix}
                current={definition}
                onCancel={onCancelFix}
                onApply={onApplyFix}
              />
            ) : null}
          </div>

          <CabinetProductionOutputs
            outputTab={outputTab}
            bom={bom}
            documentation={documentation}
            formatFeedback={formatFeedback}
          />

          {busyAction ? (
            <div
              data-testid="cabinet-action-status"
              className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800"
            >
              {busyActionLabel(busyAction, mode)}
            </div>
          ) : null}
          {actionError ? (
            <div
              data-testid="cabinet-action-error"
              role="alert"
              className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800"
            >
              {formatFeedback(actionError)}
            </div>
          ) : null}
          {actionSuccess ? (
            <div
              data-testid="cabinet-action-success"
              role="status"
              className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
            >
              {formatFeedback(actionSuccess)}
            </div>
          ) : null}

          <div className="grid gap-2">
            <input
              ref={sourceImportInputRef}
              type="file"
              accept="application/json,.json"
              data-testid="cabinet-import-source-definition-input"
              className="sr-only"
              onChange={onImportSource}
            />
            <div hidden={outputTab !== "outputs"} className="grid gap-2">
              <OutputButton
                testId="cabinet-download-glb"
                primary
                disabled={!valid || interactionDisabled}
                onClick={onDownloadGlb}
                icon="download"
                label={busyAction === "download" ? "Exporting…" : "Download GLB"}
              />
              <OutputButton
                testId="cabinet-download-source-definition"
                disabled={!valid || interactionDisabled}
                onClick={onDownloadSource}
                label={
                  busyAction === "source" ? "Exporting…" : "Download source JSON"
                }
              />
              <OutputButton
                testId="cabinet-import-source-definition"
                disabled={interactionDisabled}
                onClick={() => sourceImportInputRef.current?.click()}
                icon="upload"
                label={
                  busyAction === "import" ? "Importing…" : "Import source JSON"
                }
              />
              <OutputButton
                testId="cabinet-download-documentation"
                disabled={!valid || interactionDisabled}
                onClick={onDownloadDocumentation}
                label={busyAction === "docs" ? "Exporting…" : "Download docs CSV"}
              />
              <OutputButton
                testId="cabinet-download-shop-drawing-svg"
                disabled={!valid || interactionDisabled}
                onClick={onDownloadShopDrawing}
                label={
                  busyAction === "shopDrawing"
                    ? "Exporting…"
                    : "Download shop drawing SVG"
                }
              />
              <OutputButton
                testId="cabinet-download-fabrication-dxf"
                disabled={!valid || interactionDisabled}
                onClick={onDownloadDxf}
                label={
                  busyAction === "dxf" ? "Exporting…" : "Download fabrication DXF"
                }
              />
              <OutputButton
                testId="cabinet-download-fabrication-rfq"
                disabled={!valid || interactionDisabled}
                onClick={onDownloadRfq}
                label={busyAction === "rfq" ? "Exporting…" : "Download RFQ JSON"}
              />
              <OutputButton
                testId="cabinet-download-package-json"
                disabled={!valid || interactionDisabled}
                onClick={onDownloadPackage}
                label={
                  busyAction === "package" ? "Exporting…" : "Download package JSON"
                }
              />
            </div>

            <div className="sticky bottom-0 grid gap-2 border-t border-neutral-200 bg-white/95 pt-3 backdrop-blur">
              <OutputButton
                testId="cabinet-open-outputs"
                disabled={false}
                onClick={() => onTabChange("outputs")}
                icon="download"
                label="Export…"
              />
              {canPlaceInPlan ? (
                <OutputButton
                  testId="cabinet-save-as-copy"
                  disabled={!valid || interactionDisabled}
                  onClick={onSaveAsCopy}
                  icon="copy"
                  label={busyAction === "copy" ? "Copying…" : "Save as copy"}
                />
              ) : null}
              {mode === "create" || (!canPlaceInPlan && canSaveDefinition) ? (
                <OutputButton
                  testId="cabinet-save-definition"
                  disabled={(mode === "edit" && !canSaveDefinition) || !valid || interactionDisabled}
                  onClick={onSaveDefinition}
                  icon="save"
                  label={
                    busyAction === "save"
                      ? "Saving…"
                      : mode === "create"
                        ? "Save as template"
                        : "Save built-in"
                  }
                />
              ) : null}
              {canPlaceInPlan ? (
                <Button
                  data-testid={
                    mode === "edit"
                      ? "cabinet-update-placement"
                      : "cabinet-place-in-plan"
                  }
                  variant="primary" size="regular"
                  disabled={!valid || interactionDisabled}
                  onClick={onPlaceInPlan}
                >
                  {busyAction === "place"
                    ? "Generating…"
                    : mode === "edit"
                      ? "Update in plan"
                      : "Place in plan"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function busyActionLabel(
  action: CabinetStudioBusyAction,
  mode: CabinetryStudioProps["mode"]
): string {
  const labels: Partial<Record<CabinetStudioBusyAction, string>> = {
    download: "Exporting GLB...",
    source: "Exporting source definition...",
    import: "Importing source definition...",
    docs: "Exporting documentation...",
    shopDrawing: "Exporting shop drawing...",
    dxf: "Exporting fabrication DXF...",
    rfq: "Exporting fabrication RFQ...",
    package: "Exporting package...",
    copy: "Creating a separate copy…",
    save: "Saving built-in…",
  };
  return (
    labels[action] ??
    (mode === "edit"
      ? "Updating placed built-in…"
      : "Generating built-in…")
  );
}

function OutputButton({
  testId,
  disabled,
  onClick,
  label,
  icon = "file",
  primary = false,
}: {
  testId: string;
  disabled: boolean;
  onClick: () => void;
  label: string;
  icon?: "download" | "upload" | "copy" | "save" | "file";
  primary?: boolean;
}) {
  const Icon =
    icon === "download"
      ? Download
      : icon === "upload"
        ? Upload
        : icon === "copy"
          ? Copy
          : icon === "save"
            ? Save
            : FileText;
  return (
    <Button
      data-testid={testId}
      variant={primary ? "primary" : "secondary"} size="regular"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );
}
