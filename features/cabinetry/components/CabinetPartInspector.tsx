"use client";

import { Lock, Unlock } from "lucide-react";

import { getCabinetParameterState } from "../automation";
import { formatCabinetLabel } from "../formatCabinetLabel";
import {
  CABINET_MATERIALS,
} from "../catalog/materials";
import type { CabinetHardwareCompatibilityResult } from "../hardwareCompatibility";
import type {
  CabinetDefinition,
  CabinetModuleDefinition,
  CabinetPart,
  CabinetPartFabricationSpec,
  CabinetValidationIssue,
  DoorStyle,
} from "../types";
import { doorStyles, hingeSides } from "./CabinetryStudio.config";
import { CabinetNumberField } from "./CabinetNumberField";
import {
  Field,
  GuidedNumberField,
  sectionTitle,
  selectClass,
} from "./CabinetStudioFormPrimitives";
import { ModuleIssueBadges } from "./CabinetValidationFeedback";

export type CabinetPartMaterialTarget =
  | "front"
  | "carcass"
  | "countertop"
  | "backsplash"
  | "face_frame";

export interface CabinetPartInspectorProps {
  definition: CabinetDefinition;
  module: CabinetModuleDefinition;
  moduleIndex: number;
  selectedPart: CabinetPart | null;
  selectedPartType: string | null;
  materialTarget: CabinetPartMaterialTarget | null;
  materialId: string;
  materialName: string;
  materialLocked: boolean;
  frontMaterialLocked: boolean;
  isDoorFront: boolean;
  isDrawerOrHandle: boolean;
  isShelf: boolean;
  isHangingRod: boolean;
  hardwareOptions: readonly { id: string; name: string }[];
  hardwareCompatibility: CabinetHardwareCompatibilityResult | null;
  handlePlacementMode: "automatic" | "custom";
  handlePlacementAvailable: boolean;
  shelfSpacingLocked: boolean;
  shelfSpacingMode: "even" | "custom";
  shelfPositions: readonly number[];
  fabrication: CabinetPartFabricationSpec | null;
  issues: readonly CabinetValidationIssue[];
  formatMeasurement: (valueMm: number) => string;
  formatFeedback: (message: string) => string;
  getIssuesForField: (
    field: string,
    moduleId?: string
  ) => CabinetValidationIssue[];
  onToggleMaterialLock: () => void;
  onUpdatePartMaterial: (materialId: string) => void;
  onUpdateModule: (
    moduleId: string,
    patch: Partial<CabinetModuleDefinition>
  ) => void;
  onSetHandlePlacementMode: (mode: "automatic" | "custom") => void;
  onToggleShelfSpacingLock: () => void;
  onSetShelfSpacingMode: (mode: "even" | "custom") => void;
  onShelfPositionCommit: (index: number, valueMm: number) => void;
  onFocusIssue: (issue: CabinetValidationIssue) => void;
  onOpenParentModule: () => void;
}

export function CabinetPartInspector({
  definition,
  module,
  moduleIndex,
  selectedPart,
  selectedPartType,
  materialTarget,
  materialId,
  materialName,
  materialLocked,
  frontMaterialLocked,
  isDoorFront,
  isDrawerOrHandle,
  isShelf,
  isHangingRod,
  hardwareOptions,
  hardwareCompatibility,
  handlePlacementMode,
  handlePlacementAvailable,
  shelfSpacingLocked,
  shelfSpacingMode,
  shelfPositions,
  fabrication,
  issues,
  formatMeasurement,
  formatFeedback,
  getIssuesForField,
  onToggleMaterialLock,
  onUpdatePartMaterial,
  onUpdateModule,
  onSetHandlePlacementMode,
  onToggleShelfSpacingLock,
  onSetShelfSpacingMode,
  onShelfPositionCommit,
  onFocusIssue,
  onOpenParentModule,
}: CabinetPartInspectorProps) {
  const materialParameterField =
    materialTarget === "countertop"
      ? "countertopMaterialId"
      : materialTarget === "backsplash"
        ? "backsplashMaterialId"
        : "faceFrameMaterialId";
  const selectedMaterialLocked =
    (materialTarget === "front" && frontMaterialLocked) ||
    (materialTarget === "carcass" && materialLocked) ||
    (["countertop", "backsplash", "face_frame"] as const).includes(
      materialTarget as "countertop" | "backsplash" | "face_frame"
    ) &&
      Boolean(getCabinetParameterState(definition, materialParameterField).locked);

  return (
    <div
      className="grid gap-4 rounded-xl border border-blue-200 bg-blue-50/50 p-3"
      data-testid="cabinet-part-inspector"
      data-part-type={selectedPart?.type ?? selectedPartType ?? "unknown"}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          {sectionTitle(
            selectedPart ? formatCabinetLabel(selectedPart.type) : "Selected part"
          )}
          <p className="mt-1 text-[11px] leading-5 text-blue-800">
            These controls update the selected part&apos;s parent module without
            exposing unrelated module settings.
          </p>
        </div>
        <ModuleIssueBadges issues={[...issues]} />
      </div>

      {!selectedPart ? (
        <p
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] leading-5 text-amber-800"
        >
          This generated part is updating. Open its parent module if you need
          the full controls now.
        </p>
      ) : (
        <>
          <div className="grid gap-2" data-testid="cabinet-part-material-control">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-neutral-700">
                {materialTarget === "front" ? "Front material" : "Part material"}
              </span>
              {materialTarget === "front" || materialTarget === "carcass" ? (
                <button
                  type="button"
                  data-testid="cabinet-part-material-lock"
                  aria-pressed={materialLocked || frontMaterialLocked}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700"
                  onClick={onToggleMaterialLock}
                >
                  {materialLocked || frontMaterialLocked ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <Unlock className="h-3 w-3" />
                  )}
                  {materialLocked || frontMaterialLocked ? "Locked" : "Lock"}
                </button>
              ) : null}
            </div>
            {materialTarget ? (
              <select
                data-testid="cabinet-part-material"
                aria-label={`Material for selected ${formatCabinetLabel(selectedPart.type)}`}
                className={selectClass()}
                value={materialId}
                disabled={selectedMaterialLocked}
                onChange={(event) => onUpdatePartMaterial(event.target.value)}
              >
                {!CABINET_MATERIALS.some((material) => material.id === materialId) ? (
                  <option value={materialId}>{materialName}</option>
                ) : null}
                {CABINET_MATERIALS.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-xs text-neutral-700">
                <span className="block font-semibold">{materialName}</span>
                <span className="mt-0.5 block text-[10px] text-neutral-500">
                  This generated or hardware finish is controlled by its parent
                  system.
                </span>
              </div>
            )}
          </div>

          {isDoorFront ? (
            <div className="grid gap-3" data-testid="cabinet-part-door-front-controls">
              <Field label="Door style">
                <select
                  data-testid="cabinet-part-door-style"
                  className={selectClass()}
                  value={module.doorStyle}
                  disabled={Boolean(
                    getCabinetParameterState(
                      definition,
                      `modules.${module.id}.doorStyle`
                    ).locked
                  )}
                  onChange={(event) =>
                    onUpdateModule(module.id, {
                      doorStyle: event.target.value as DoorStyle,
                    })
                  }
                >
                  {doorStyles.map((doorStyle) => (
                    <option key={doorStyle} value={doorStyle}>
                      {formatCabinetLabel(doorStyle)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Compatible handle">
                <select
                  data-testid="cabinet-part-hardware"
                  className={selectClass()}
                  value={module.hardwareId ?? "none"}
                  disabled={Boolean(
                    getCabinetParameterState(
                      definition,
                      `modules.${module.id}.hardwareId`
                    ).locked
                  )}
                  onChange={(event) =>
                    onUpdateModule(module.id, { hardwareId: event.target.value })
                  }
                >
                  {hardwareOptions.map((hardware) => (
                    <option key={hardware.id} value={hardware.id}>
                      {hardware.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Hinge side">
                <select
                  data-testid="cabinet-part-hinge-side"
                  className={selectClass()}
                  value={module.hingeSide ?? "left"}
                  disabled={Boolean(
                    getCabinetParameterState(
                      definition,
                      `modules.${module.id}.hingeSide`
                    ).locked
                  )}
                  onChange={(event) =>
                    onUpdateModule(module.id, {
                      hingeSide: event.target.value as NonNullable<
                        CabinetModuleDefinition["hingeSide"]
                      >,
                    })
                  }
                >
                  {hingeSides.map((hingeSide) => (
                    <option key={hingeSide} value={hingeSide}>
                      {formatCabinetLabel(hingeSide)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : null}

          {isDrawerOrHandle ? (
            <div
              className="grid gap-3"
              data-testid="cabinet-part-drawer-handle-controls"
            >
              <Field label="Compatible hardware">
                <select
                  data-testid="cabinet-part-hardware"
                  className={selectClass()}
                  value={module.hardwareId ?? "none"}
                  disabled={Boolean(
                    getCabinetParameterState(
                      definition,
                      `modules.${module.id}.hardwareId`
                    ).locked
                  )}
                  onChange={(event) =>
                    onUpdateModule(module.id, { hardwareId: event.target.value })
                  }
                >
                  {hardwareOptions.map((hardware) => (
                    <option key={hardware.id} value={hardware.id}>
                      {hardware.name}
                    </option>
                  ))}
                </select>
              </Field>
              <fieldset className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                <legend className="px-1 text-xs font-semibold text-neutral-700">
                  Handle placement
                </legend>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-neutral-100 p-1">
                  {(["automatic", "custom"] as const).map((placementMode) => (
                    <button
                      key={placementMode}
                      type="button"
                      data-testid={`cabinet-part-handle-placement-${placementMode}`}
                      aria-pressed={handlePlacementMode === placementMode}
                      disabled={
                        Boolean(
                          getCabinetParameterState(
                            definition,
                            `modules.${module.id}.handlePlacementMode`
                          ).locked
                        ) ||
                        (placementMode === "custom" && !handlePlacementAvailable)
                      }
                      className={`rounded px-2 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                        handlePlacementMode === placementMode
                          ? "bg-white shadow-sm"
                          : "text-neutral-500"
                      }`}
                      onClick={() => onSetHandlePlacementMode(placementMode)}
                    >
                      {formatCabinetLabel(placementMode)}
                    </button>
                  ))}
                </div>
                {handlePlacementMode === "custom" && handlePlacementAvailable ? (
                  <div className="grid grid-cols-2 gap-2">
                    <GuidedNumberField
                      label="Horizontal shift"
                      value={module.handleOffsetX ?? 0}
                      min={-4000}
                      max={4000}
                      step={5}
                      suffix="mm"
                      testId="cabinet-part-handle-offset-x"
                      fieldPath="handleOffsetX"
                      issues={getIssuesForField("handleOffsetX", module.id)}
                      disabled={Boolean(
                        getCabinetParameterState(
                          definition,
                          `modules.${module.id}.handleOffsetX`
                        ).locked
                      )}
                      onCommit={(value) =>
                        onUpdateModule(module.id, { handleOffsetX: value })
                      }
                    />
                    <GuidedNumberField
                      label="Vertical shift"
                      value={module.handleOffsetY ?? 0}
                      min={-4000}
                      max={4000}
                      step={5}
                      suffix="mm"
                      testId="cabinet-part-handle-offset-y"
                      fieldPath="handleOffsetY"
                      issues={getIssuesForField("handleOffsetY", module.id)}
                      disabled={Boolean(
                        getCabinetParameterState(
                          definition,
                          `modules.${module.id}.handleOffsetY`
                        ).locked
                      )}
                      onCommit={(value) =>
                        onUpdateModule(module.id, { handleOffsetY: value })
                      }
                    />
                  </div>
                ) : null}
              </fieldset>
            </div>
          ) : null}

          {(isDoorFront || isDrawerOrHandle) && hardwareCompatibility ? (
            <div
              data-testid="cabinet-part-hardware-compatibility"
              data-status={hardwareCompatibility.status}
              role={
                hardwareCompatibility.status === "incompatible"
                  ? "alert"
                  : "status"
              }
              className={`rounded-md border p-2 text-[11px] leading-5 ${
                hardwareCompatibility.status === "compatible"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : hardwareCompatibility.status === "review_required"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              <span className="block font-semibold">
                {hardwareCompatibility.status === "compatible"
                  ? "Compatible with this front"
                  : hardwareCompatibility.status === "review_required"
                    ? "Compatibility review needed"
                    : "Not compatible with this front"}
              </span>
              {hardwareCompatibility.reasons
                .filter((reason) => reason.code !== "compatible")
                .map((reason) => (
                  <span key={reason.code} className="mt-1 block">
                    {formatFeedback(reason.message)}
                  </span>
                ))}
            </div>
          ) : null}

          {isShelf ? (
            <div className="grid gap-3" data-testid="cabinet-part-shelf-controls">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-neutral-700">
                  Shelf layout
                </span>
                <button
                  type="button"
                  data-testid="cabinet-part-shelf-spacing-lock"
                  aria-pressed={shelfSpacingLocked}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700"
                  onClick={onToggleShelfSpacingLock}
                >
                  {shelfSpacingLocked ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <Unlock className="h-3 w-3" />
                  )}
                  {shelfSpacingLocked ? "Locked" : "Lock"}
                </button>
              </div>
              <CabinetNumberField
                label="Shelf count"
                testId="cabinet-part-shelf-count"
                fieldPath="shelfCount"
                min={0}
                step={1}
                integer
                disabled={shelfSpacingLocked}
                disabledReason={
                  shelfSpacingLocked
                    ? "Unlock the shelf layout before changing the shelf count."
                    : undefined
                }
                issues={getIssuesForField("shelfCount", module.id)}
                value={module.shelfCount}
                onCommit={(value) =>
                  onUpdateModule(module.id, { shelfCount: value })
                }
              />
              <div className="grid grid-cols-2 gap-1 rounded-md bg-neutral-100 p-1">
                {(["even", "custom"] as const).map((spacingMode) => (
                  <button
                    key={spacingMode}
                    type="button"
                    data-testid={`cabinet-part-shelf-spacing-${spacingMode}`}
                    aria-pressed={shelfSpacingMode === spacingMode}
                    disabled={shelfSpacingLocked}
                    className={`rounded px-2 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                      shelfSpacingMode === spacingMode
                        ? "bg-white shadow-sm"
                        : "text-neutral-500"
                    }`}
                    onClick={() => onSetShelfSpacingMode(spacingMode)}
                  >
                    {spacingMode === "even" ? "Even spacing" : "Custom heights"}
                  </button>
                ))}
              </div>
              {shelfSpacingMode === "custom" ? (
                <div className="grid grid-cols-2 gap-2">
                  {shelfPositions.map((position, index) => (
                    <CabinetNumberField
                      key={index}
                      label={`Shelf ${index + 1} height`}
                      testId={`cabinet-part-shelf-position-${index + 1}`}
                      fieldPath="shelfPositionsMm"
                      min={
                        index === 0
                          ? definition.toeKickHeight + definition.boardThickness
                          : shelfPositions[index - 1] + definition.boardThickness
                      }
                      max={
                        index === shelfPositions.length - 1
                          ? module.height - definition.boardThickness
                          : shelfPositions[index + 1] - definition.boardThickness
                      }
                      step={1}
                      keyboardStep={5}
                      unit="mm"
                      disabled={shelfSpacingLocked}
                      disabledReason={
                        shelfSpacingLocked
                          ? "Unlock the shelf layout before moving this shelf."
                          : undefined
                      }
                      issues={getIssuesForField("shelfPositionsMm", module.id)}
                      value={Math.round(position)}
                      onCommit={(value) => onShelfPositionCommit(index, value)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {isHangingRod ? (
            <div
              className="grid gap-2"
              data-testid="cabinet-part-hanging-rod-controls"
            >
              <CabinetNumberField
                label="Rod count"
                testId="cabinet-part-hanging-rod-count"
                fieldPath="hangingRodCount"
                min={0}
                step={1}
                integer
                disabled={Boolean(
                  getCabinetParameterState(
                    definition,
                    `modules.${module.id}.hangingRodCount`
                  ).locked
                )}
                issues={getIssuesForField("hangingRodCount", module.id)}
                value={module.hangingRodCount ?? 0}
                onCommit={(value) =>
                  onUpdateModule(module.id, { hangingRodCount: value })
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <CabinetNumberField
                  label="Rod height"
                  testId="cabinet-part-hanging-rod-height"
                  fieldPath="hangingRodHeight"
                  min={0}
                  max={module.height}
                  step={1}
                  keyboardStep={10}
                  unit="mm"
                  disabled={Boolean(
                    getCabinetParameterState(
                      definition,
                      `modules.${module.id}.hangingRodHeight`
                    ).locked
                  )}
                  issues={getIssuesForField("hangingRodHeight", module.id)}
                  value={module.hangingRodHeight ?? 0}
                  onCommit={(value) =>
                    onUpdateModule(module.id, { hangingRodHeight: value })
                  }
                />
                <CabinetNumberField
                  label="Rod spacing"
                  testId="cabinet-part-hanging-rod-spacing"
                  fieldPath="hangingRodSpacing"
                  min={0}
                  max={module.height}
                  step={1}
                  keyboardStep={10}
                  unit="mm"
                  disabled={Boolean(
                    getCabinetParameterState(
                      definition,
                      `modules.${module.id}.hangingRodSpacing`
                    ).locked
                  )}
                  issues={getIssuesForField("hangingRodSpacing", module.id)}
                  value={module.hangingRodSpacing ?? 0}
                  onCommit={(value) =>
                    onUpdateModule(module.id, { hangingRodSpacing: value })
                  }
                />
              </div>
            </div>
          ) : null}

          <dl
            className="grid grid-cols-3 gap-2 rounded-md border border-neutral-200 bg-white p-2 text-[11px]"
            data-testid="cabinet-part-dimensions"
          >
            {(["width", "height", "depth"] as const).map((axis) => (
              <div key={axis}>
                <dt className="text-neutral-500">{formatCabinetLabel(axis)}</dt>
                <dd className="mt-0.5 font-semibold text-neutral-900">
                  {formatMeasurement(selectedPart.size[axis])}
                </dd>
              </div>
            ))}
          </dl>

          {fabrication ? (
            <div
              className="grid gap-1 rounded-md border border-blue-200 bg-white p-2 text-[11px] leading-5 text-blue-900"
              data-testid="cabinet-selected-part-fabrication"
            >
              <span className="font-semibold">Resolved fabrication</span>
              <span>
                Cut face: {formatCabinetLabel(fabrication.cutFace.widthAxis)} ×{" "}
                {formatCabinetLabel(fabrication.cutFace.heightAxis)}; thickness{" "}
                {formatCabinetLabel(fabrication.cutFace.thicknessAxis)}
              </span>
              <span>
                Grain: {formatCabinetLabel(fabrication.grainDirection)} ({formatCabinetLabel(fabrication.grainAxis)})
              </span>
              <span>
                Edges: {formatCabinetLabel(fabrication.edgeTreatment)} ·{" "}
                {formatMeasurement(fabrication.treatedLengthMm)} ·{" "}
                {fabrication.treatedEdges.length
                  ? fabrication.treatedEdges.map(formatCabinetLabel).join(", ")
                  : "none"}
              </span>
              <span>
                Exposed faces:{" "}
                {fabrication.exposedFaces.length
                  ? fabrication.exposedFaces.map(formatCabinetLabel).join(", ")
                  : "none"}
              </span>
            </div>
          ) : (
            <p className="rounded-md border border-neutral-200 bg-white p-2 text-[11px] leading-5 text-neutral-500">
              This generated marker has no cut-sheet fabrication treatment.
            </p>
          )}

          {issues.length ? (
            <div className="grid gap-1" data-testid="cabinet-part-validation">
              <span className="text-xs font-semibold text-neutral-700">
                Parent module validation
              </span>
              {issues.slice(0, 3).map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  className="rounded-md border border-neutral-200 bg-white p-2 text-left text-[11px] leading-5 text-neutral-700"
                  onClick={() => onFocusIssue(issue)}
                >
                  <span className="font-semibold">
                    {formatCabinetLabel(issue.severity)}:
                  </span>{" "}
                  {formatFeedback(issue.message)}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}

      <button
        type="button"
        data-testid="cabinet-part-open-parent-module"
        className="min-h-9 rounded-md border border-blue-300 bg-white px-3 text-xs font-semibold text-blue-800 hover:border-blue-600"
        onClick={onOpenParentModule}
      >
        Open parent Module {moduleIndex + 1}
      </button>
    </div>
  );
}
