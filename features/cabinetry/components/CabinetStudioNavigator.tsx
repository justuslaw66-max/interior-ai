"use client";

import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { DragEvent } from "react";

import { CABINET_PRESET_OPTIONS, type CabinetPresetId } from "../presets";
import { formatCabinetLabel } from "../formatCabinetLabel";
import type { CabinetPropertyMetadata } from "../propertyRegistry";
import type {
  CabinetModuleDefinition,
  CabinetValidationIssue,
} from "../types";
import type { CabinetSemanticSelection } from "./CabinetSceneItem";
import { sectionTitle } from "./CabinetStudioFormPrimitives";
import { ModuleIssueBadges } from "./CabinetValidationFeedback";

export interface CabinetStudioNavigatorProps {
  activePresetId: CabinetPresetId | null;
  activeSavedTemplateId: string | null;
  savedTemplates: readonly { id: string; name: string }[];
  modules: readonly CabinetModuleDefinition[];
  activeModuleId: string | null;
  activeModuleIndex: number;
  draggedModuleId: string | null;
  moduleSizingMode: "automatic" | "manual";
  structuralModuleChangeDisabled: boolean;
  structuralModuleChangeTitle: string;
  selection: CabinetSemanticSelection;
  propertyQuery: string;
  propertyResults: readonly CabinetPropertyMetadata[];
  formatMeasurement: (valueMm: number) => string;
  getIssuesForModule: (moduleId: string) => CabinetValidationIssue[];
  onApplyPreset: (presetId: CabinetPresetId) => void;
  onApplySavedTemplate: (templateId: string) => void;
  onSelectModule: (moduleId: string) => void;
  onSelectAssembly: () => void;
  onModuleDragStart: (
    moduleId: string,
    event: DragEvent<HTMLButtonElement>
  ) => void;
  onModuleDragEnd: () => void;
  onModuleDragOver: (
    moduleId: string,
    event: DragEvent<HTMLButtonElement>
  ) => void;
  onModuleDrop: (
    moduleId: string,
    event: DragEvent<HTMLButtonElement>
  ) => void;
  onAddModule: () => void;
  onDuplicateModule: () => void;
  onMoveActiveModule: (direction: -1 | 1) => void;
  onDeleteModule: () => void;
  onChangeModuleSizingMode: (mode: "automatic" | "manual") => void;
  onPropertyQueryChange: (query: string) => void;
  onSelectProperty: (property: CabinetPropertyMetadata) => void;
}

export function CabinetStudioNavigator({
  activePresetId,
  activeSavedTemplateId,
  savedTemplates,
  modules,
  activeModuleId,
  activeModuleIndex,
  draggedModuleId,
  moduleSizingMode,
  structuralModuleChangeDisabled,
  structuralModuleChangeTitle,
  selection,
  propertyQuery,
  propertyResults,
  formatMeasurement,
  getIssuesForModule,
  onApplyPreset,
  onApplySavedTemplate,
  onSelectModule,
  onSelectAssembly,
  onModuleDragStart,
  onModuleDragEnd,
  onModuleDragOver,
  onModuleDrop,
  onAddModule,
  onDuplicateModule,
  onMoveActiveModule,
  onDeleteModule,
  onChangeModuleSizingMode,
  onPropertyQueryChange,
  onSelectProperty,
}: CabinetStudioNavigatorProps) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        {sectionTitle("Built-in type")}
        <div className="grid grid-cols-2 gap-2">
          {CABINET_PRESET_OPTIONS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`cabinet-preset-${preset.id}`}
              aria-pressed={preset.id === activePresetId}
              className={`min-h-9 rounded-md border px-2 text-left text-xs font-medium ${
                preset.id === activePresetId
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 text-neutral-700 hover:border-neutral-900"
              }`}
              onClick={() => onApplyPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {savedTemplates.length ? (
          <div className="mt-2 grid gap-1 border-t border-neutral-200 pt-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              My templates
            </span>
            {savedTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={`min-h-8 rounded-md border px-2 text-left text-xs font-medium ${
                  activeSavedTemplateId === template.id
                    ? "border-blue-700 bg-blue-700 text-white"
                    : "border-neutral-200 text-neutral-700 hover:border-blue-500"
                }`}
                onClick={() => onApplySavedTemplate(template.id)}
              >
                {template.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2">
        {sectionTitle("Modules")}
        <div className="grid gap-2">
          {modules.map((module, index) => (
            <button
              key={module.id}
              type="button"
              draggable={modules.length > 1}
              data-testid={`cabinet-module-${index + 1}`}
              data-module-id={module.id}
              data-module-index={String(index)}
              className={`min-h-9 rounded-md border px-2 text-left text-xs ${
                module.id === activeModuleId
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 text-neutral-700 hover:border-neutral-500"
              } ${draggedModuleId === module.id ? "opacity-50" : ""}`}
              title="Select this module, or drag it to reorder the run"
              onClick={() => onSelectModule(module.id)}
              onDragStart={(event) => onModuleDragStart(module.id, event)}
              onDragEnd={onModuleDragEnd}
              onDragOver={(event) => onModuleDragOver(module.id, event)}
              onDrop={(event) => onModuleDrop(module.id, event)}
            >
              <span className="flex items-center gap-2">
                <span>
                  Module {index + 1} · {formatMeasurement(module.width)}
                </span>
                <ModuleIssueBadges issues={getIssuesForModule(module.id)} />
              </span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-2">
          <button
            type="button"
            data-testid="cabinet-module-add"
            className="grid h-8 place-items-center rounded-md bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onAddModule}
            disabled={structuralModuleChangeDisabled}
            title={structuralModuleChangeTitle}
            aria-label="Add module"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            data-testid="cabinet-module-duplicate"
            className="grid h-8 place-items-center rounded-md bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onDuplicateModule}
            disabled={structuralModuleChangeDisabled}
            title={structuralModuleChangeTitle}
            aria-label="Duplicate selected module"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            data-testid="cabinet-module-move-left"
            aria-label="Move selected module left"
            className="grid h-8 place-items-center rounded-md bg-neutral-100 disabled:opacity-40"
            onClick={() => onMoveActiveModule(-1)}
            disabled={activeModuleIndex <= 0}
            title="Move module left"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            data-testid="cabinet-module-move-right"
            aria-label="Move selected module right"
            className="grid h-8 place-items-center rounded-md bg-neutral-100 disabled:opacity-40"
            onClick={() => onMoveActiveModule(1)}
            disabled={activeModuleIndex < 0 || activeModuleIndex >= modules.length - 1}
            title="Move module right"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            data-testid="cabinet-module-delete"
            className="grid h-8 place-items-center rounded-md bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onDeleteModule}
            disabled={structuralModuleChangeDisabled || modules.length <= 1}
            title={
              modules.length <= 1
                ? "An assembly needs at least one module"
                : structuralModuleChangeTitle
            }
            aria-label="Delete selected module"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2">
          <div
            role="group"
            className="grid grid-cols-2 rounded-md bg-neutral-200/70 p-0.5"
            aria-label="Module sizing mode"
          >
            {(["automatic", "manual"] as const).map((value) => (
              <button
                key={value}
                type="button"
                data-testid={`cabinet-module-sizing-${value}`}
                aria-pressed={moduleSizingMode === value}
                className={`rounded px-2 py-1.5 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  moduleSizingMode === value
                    ? "bg-white text-neutral-950 shadow-sm"
                    : "text-neutral-600"
                }`}
                onClick={() => onChangeModuleSizingMode(value)}
              >
                {formatCabinetLabel(value)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-neutral-500">
            {moduleSizingMode === "automatic"
              ? "Structural changes preserve the overall target and redistribute unlocked bays."
              : "Structural changes preserve entered bay widths and derive the overall width."}
          </p>
        </div>
      </div>

      <div className="grid gap-2" data-testid="cabinet-selection-breadcrumb">
        {sectionTitle("Editing")}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            className={`rounded-md px-2 py-1.5 font-semibold ${
              selection.scope === "assembly"
                ? "bg-blue-600 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
            onClick={onSelectAssembly}
          >
            Complete assembly
          </button>
          {activeModuleId ? (
            <>
              <span aria-hidden="true" className="text-neutral-300">
                /
              </span>
              <button
                type="button"
                className={`rounded-md px-2 py-1.5 font-semibold ${
                  selection.scope === "module"
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                }`}
                onClick={() => onSelectModule(activeModuleId)}
              >
                Module {activeModuleIndex + 1}
              </button>
            </>
          ) : null}
          {selection.scope === "part" ? (
            <>
              <span aria-hidden="true" className="text-neutral-300">
                /
              </span>
              <span className="rounded-md bg-blue-600 px-2 py-1.5 font-semibold text-white">
                {formatCabinetLabel(selection.partType ?? "part")}
              </span>
            </>
          ) : null}
        </div>
        <p className="text-[11px] leading-5 text-neutral-500">
          Select a generated part in the preview to open its parent module and
          relevant properties.
        </p>
      </div>

      <div className="grid gap-2" data-testid="cabinet-property-search">
        {sectionTitle("Find a property")}
        <label className="relative block">
          <span className="sr-only">Search millwork properties</span>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
          <input
            data-testid="cabinet-property-search-input"
            type="search"
            className="h-9 w-full rounded-md border border-neutral-300 bg-white pl-8 pr-3 text-xs outline-none focus:border-neutral-900"
            placeholder="Filler, scribe, hinge, clearance…"
            value={propertyQuery}
            onChange={(event) => onPropertyQueryChange(event.target.value)}
          />
        </label>
        {propertyQuery.trim() ? (
          <div className="grid max-h-64 gap-1 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-1">
            {propertyResults.length ? (
              propertyResults.map((property) => (
                <button
                  key={property.id}
                  type="button"
                  data-testid="cabinet-property-search-result"
                  data-property-id={property.id}
                  className="rounded-md bg-white px-2.5 py-2 text-left hover:bg-blue-50"
                  onClick={() => onSelectProperty(property)}
                >
                  <span className="block text-xs font-semibold text-neutral-900">
                    {property.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-neutral-500">
                    {formatCabinetLabel(property.section)} · {property.description}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-xs text-neutral-500">
                No relevant properties match this selection.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[11px] leading-5 text-neutral-500">
            Search friendly or trade terms without opening every construction
            section.
          </p>
        )}
      </div>
    </div>
  );
}
