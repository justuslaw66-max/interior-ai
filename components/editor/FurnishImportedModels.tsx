"use client";

import type { ImportedModelOption } from "@/lib/catalog/imported-model-assembly";

type ImportedFamilyOption = {
  familyKey: string;
  familyLabel: string;
};

type FurnishImportedModelsProps = {
  /** Pro only (UX audit FU5): consumers add products from the catalogue. */
  visible: boolean;
  canEdit: boolean;
  activeRoomName: string;
  selectedFamilyKey: string;
  selectedProductId: string;
  familyOptions: ImportedFamilyOption[];
  modelOptions: ImportedModelOption[];
  visibleModelOptions: ImportedModelOption[];
  onFamilyChange: (familyKey: string) => void;
  onProductChange: (productId: string) => void;
  onAdd: () => void;
};

const SELECT_CLASS = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900";

function ImportedModelSelects(props: FurnishImportedModelsProps) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      <select
        data-testid="imported-family-select"
        aria-label="Model family"
        className={SELECT_CLASS}
        value={props.selectedFamilyKey}
        onChange={(event) => {
          const nextFamilyKey = event.target.value;
          props.onFamilyChange(nextFamilyKey);
          const firstInFamily = props.modelOptions.find((item) => item.familyKey === nextFamilyKey);
          if (firstInFamily) props.onProductChange(firstInFamily.id);
        }}
      >
        {props.familyOptions.map((item) => (
          <option key={item.familyKey} value={item.familyKey}>{item.familyLabel}</option>
        ))}
      </select>
      <select
        data-testid="imported-product-select"
        aria-label="Model"
        className={SELECT_CLASS}
        value={props.selectedProductId}
        onChange={(event) => props.onProductChange(event.target.value)}
      >
        {props.visibleModelOptions.map((item) => (
          <option key={item.id} value={item.id}>{item.pickerLabel}</option>
        ))}
      </select>
    </div>
  );
}

/** "All 3D models": any verified model by family, including pieces not in the catalogue yet. */
export function FurnishImportedModels(props: FurnishImportedModelsProps) {
  const { visible, selectedProductId, modelOptions, visibleModelOptions } = props;
  if (!visible) return null;
  const selected =
    visibleModelOptions.find((option) => option.id === selectedProductId) ??
    modelOptions.find((option) => option.id === selectedProductId) ??
    null;
  return (
    <details className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm" data-testid="advanced-imported-models">
      <summary
        data-testid="advanced-imported-models-toggle"
        className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-neutral-900 marker:hidden"
      >
        <span className="text-sm font-semibold">All 3D models</span>
        <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-700">Open</span>
      </summary>
      <p className="text-xs text-neutral-600">Pick any verified model by family, including pieces not in the catalogue yet.</p>
      <ImportedModelSelects {...props} />
      {selected ? (
        <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <div className="text-xs font-semibold text-neutral-800">{selected.pickerLabel}</div>
          <div className="text-xs text-neutral-600">{selected.familyLabel}</div>
        </div>
      ) : null}
      <button
        type="button"
        data-testid="add-imported-btn"
        className="mt-3 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={props.onAdd}
        disabled={!selectedProductId || !props.canEdit}
      >
        Add to {props.activeRoomName}
      </button>
    </details>
  );
}
