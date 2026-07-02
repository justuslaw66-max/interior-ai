"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getModelAssetStatus } from "@/lib/modelAssetStatus";

type EditableModelAsset = {
  id: string;
  approved: boolean;
  notes: string | null;
  dimsWmm: number;
  dimsDmm: number;
  dimsHmm: number;
  aabbSizeX: number;
  aabbSizeY: number;
  aabbSizeZ: number;
  aabbCenterX: number;
  aabbCenterY: number;
  aabbCenterZ: number;
  pivotOffsetX: number;
  pivotOffsetZ: number;
  groundAligned: boolean;
};

type CatalogPresetSummary = {
  category?: string;
  product_name?: string;
  variant?: string;
  preset_label?: string | null;
  file_path?: string;
  preset_validation?: {
    label: string | null;
    missingRequiredFields: string[];
    invalidEnumFields: Array<{
      field: string;
      value: string;
      allowed: string[];
    }>;
    invalidPositiveNumberFields: string[];
    errors: string[];
    warnings: string[];
    publishable: boolean;
  };
  auto_metadata?: Record<string, unknown>;
} | null;

type CatalogPresetValidation = NonNullable<NonNullable<CatalogPresetSummary>["preset_validation"]>;

export default function ModelEditForm({
  asset,
  catalogEntry,
}: {
  asset: EditableModelAsset;
  catalogEntry: CatalogPresetSummary;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saveIssues, setSaveIssues] = useState<string[]>([]);

  const initialAssetStatus: "draft" | "needs_fix" | "approved" = useMemo(() => {
    return getModelAssetStatus(asset);
  }, [asset]);

  const stripStatusMarker = (notes: string) =>
    notes.replace(/\[STATUS:(draft|needs_fix|approved)\]\s*/g, "").trim();

  const [form, setForm] = useState({
    assetStatus: initialAssetStatus,
    notes: stripStatusMarker(asset.notes ?? ""),
    dimsWmm: asset.dimsWmm,
    dimsDmm: asset.dimsDmm,
    dimsHmm: asset.dimsHmm,
    aabbSizeX: asset.aabbSizeX,
    aabbSizeY: asset.aabbSizeY,
    aabbSizeZ: asset.aabbSizeZ,
    aabbCenterX: asset.aabbCenterX,
    aabbCenterY: asset.aabbCenterY,
    aabbCenterZ: asset.aabbCenterZ,
    pivotOffsetX: asset.pivotOffsetX,
    pivotOffsetZ: asset.pivotOffsetZ,
    groundAligned: asset.groundAligned,
  });

  const hasChanges = useMemo(() => {
    return (
      form.assetStatus !== initialAssetStatus ||
      form.notes !== stripStatusMarker(asset.notes ?? "") ||
      form.dimsWmm !== asset.dimsWmm ||
      form.dimsDmm !== asset.dimsDmm ||
      form.dimsHmm !== asset.dimsHmm ||
      form.aabbSizeX !== asset.aabbSizeX ||
      form.aabbSizeY !== asset.aabbSizeY ||
      form.aabbSizeZ !== asset.aabbSizeZ ||
      form.aabbCenterX !== asset.aabbCenterX ||
      form.aabbCenterY !== asset.aabbCenterY ||
      form.aabbCenterZ !== asset.aabbCenterZ ||
      form.pivotOffsetX !== asset.pivotOffsetX ||
      form.pivotOffsetZ !== asset.pivotOffsetZ ||
      form.groundAligned !== asset.groundAligned
    );
  }, [form, asset, initialAssetStatus]);

  const numberField = (
    key:
      | "dimsWmm"
      | "dimsDmm"
      | "dimsHmm"
      | "aabbSizeX"
      | "aabbSizeY"
      | "aabbSizeZ"
      | "aabbCenterX"
      | "aabbCenterY"
      | "aabbCenterZ"
      | "pivotOffsetX"
      | "pivotOffsetZ",
    value: string
  ) => {
    const parsed = Number(value);
    setForm((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) ? parsed : 0,
    }));
  };

  function buildNotesPayload(rawNotes: string, assetStatus: "draft" | "needs_fix" | "approved") {
    const cleanNotes = stripStatusMarker(rawNotes);
    const marker = `[STATUS:${assetStatus}]`;
    if (!cleanNotes) return marker;
    return `${marker}\n${cleanNotes}`;
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    setSaveIssues([]);
    try {
      const response = await fetch(`/api/admin/models/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved: form.assetStatus === "approved",
          notes: buildNotesPayload(form.notes, form.assetStatus),
          dimsWmm: Math.round(form.dimsWmm),
          dimsDmm: Math.round(form.dimsDmm),
          dimsHmm: Math.round(form.dimsHmm),
          aabbSizeX: form.aabbSizeX,
          aabbSizeY: form.aabbSizeY,
          aabbSizeZ: form.aabbSizeZ,
          aabbCenterX: form.aabbCenterX,
          aabbCenterY: form.aabbCenterY,
          aabbCenterZ: form.aabbCenterZ,
          pivotOffsetX: form.pivotOffsetX,
          pivotOffsetZ: form.pivotOffsetZ,
          groundAligned: form.groundAligned,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const issues: string[] = [];
        if (payload?.presetValidation) {
          const validation = payload.presetValidation as CatalogPresetValidation;
          if (validation?.missingRequiredFields?.length) {
            issues.push(`Missing required catalog fields: ${validation.missingRequiredFields.join(", ")}`);
          }
          if (validation?.invalidEnumFields?.length) {
            issues.push(
              ...validation.invalidEnumFields.map(
                (entry: CatalogPresetValidation["invalidEnumFields"][number]) =>
                  `${entry.field} has invalid value \"${entry.value}\"`
              )
            );
          }
          if (validation?.invalidPositiveNumberFields?.length) {
            issues.push(
              `Expected positive numbers for: ${validation.invalidPositiveNumberFields.join(", ")}`
            );
          }
          if (validation?.errors?.length) {
            issues.push(...validation.errors);
          }
        }
        if (Array.isArray(payload?.finishMappingIssues)) {
          issues.push(
            ...payload.finishMappingIssues.flatMap((entry: { catalogItemId?: string; issues?: string[] }) =>
              Array.isArray(entry.issues)
                ? entry.issues.map((issue) =>
                    entry.catalogItemId ? `${entry.catalogItemId}: ${issue}` : issue
                  )
                : []
            )
          );
        }
        setSaveIssues(issues);
        throw new Error(payload?.error || "Save failed");
      }

      setStatus("Saved");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed";
      setStatus(`Error: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  const presetValidation = catalogEntry?.preset_validation ?? null;
  const autoMetadataEntries = Object.entries(catalogEntry?.auto_metadata ?? {});

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <div className="font-semibold">Edit asset data</div>

      {catalogEntry && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">Linked catalog preset</div>
              <div className="mt-1 text-neutral-600">
                {catalogEntry.preset_label ?? catalogEntry.category ?? "Unknown category"}
                {catalogEntry.product_name ? ` · ${catalogEntry.product_name}` : ""}
                {catalogEntry.variant ? ` · ${catalogEntry.variant}` : ""}
              </div>
            </div>
            <div
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                presetValidation?.publishable
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {presetValidation?.publishable ? "publishable" : "needs catalog fixes"}
            </div>
          </div>

          {catalogEntry.file_path && (
            <div className="mt-2 break-all text-neutral-600">{catalogEntry.file_path}</div>
          )}

          {presetValidation && (
            <div className="mt-3 space-y-2">
              {presetValidation.missingRequiredFields.length > 0 && (
                <div>
                  <div className="font-medium text-amber-800">Missing required fields</div>
                  <div className="mt-1 text-neutral-700">
                    {presetValidation.missingRequiredFields.join(", ")}
                  </div>
                </div>
              )}

              {presetValidation.invalidEnumFields.length > 0 && (
                <div>
                  <div className="font-medium text-amber-800">Invalid controlled values</div>
                  <div className="mt-1 space-y-1 text-neutral-700">
                    {presetValidation.invalidEnumFields.map((entry) => (
                      <div key={`${entry.field}-${entry.value}`}>
                        {entry.field}: {entry.value} (allowed: {entry.allowed.join(", ")})
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {presetValidation.invalidPositiveNumberFields.length > 0 && (
                <div>
                  <div className="font-medium text-amber-800">Expected positive numbers</div>
                  <div className="mt-1 text-neutral-700">
                    {presetValidation.invalidPositiveNumberFields.join(", ")}
                  </div>
                </div>
              )}

              {presetValidation.warnings.length > 0 && (
                <div>
                  <div className="font-medium text-neutral-800">Warnings</div>
                  <div className="mt-1 space-y-1 text-neutral-700">
                    {presetValidation.warnings.map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {autoMetadataEntries.length > 0 && (
            <div className="mt-3 border-t border-neutral-200 pt-2 text-neutral-700">
              <div className="font-medium text-neutral-800">Auto metadata</div>
              <div className="mt-1 grid grid-cols-1 gap-1">
                {autoMetadataEntries.map(([key, value]) => (
                  <div key={key}>
                    <span className="font-medium">{key}:</span>{" "}
                    {Array.isArray(value) ? value.join(", ") : String(value)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <label className="block text-xs">
        <div className="mb-1 font-medium">Status</div>
        <select
          className="w-full rounded-md border px-2 py-1"
          value={form.assetStatus}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              assetStatus: e.target.value as "draft" | "needs_fix" | "approved",
            }))
          }
        >
          <option value="draft">draft</option>
          <option value="needs_fix">needs_fix</option>
          <option value="approved">approved</option>
        </select>
      </label>

      <label className="block text-xs">
        <div className="mb-1 font-medium">Notes</div>
        <textarea
          className="w-full rounded-md border px-2 py-1"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="Optional notes"
        />
      </label>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <label>
          <div className="mb-1 font-medium">W (mm)</div>
          <input className="w-full rounded-md border px-2 py-1" type="number" value={form.dimsWmm} onChange={(e) => numberField("dimsWmm", e.target.value)} />
        </label>
        <label>
          <div className="mb-1 font-medium">D (mm)</div>
          <input className="w-full rounded-md border px-2 py-1" type="number" value={form.dimsDmm} onChange={(e) => numberField("dimsDmm", e.target.value)} />
        </label>
        <label>
          <div className="mb-1 font-medium">H (mm)</div>
          <input className="w-full rounded-md border px-2 py-1" type="number" value={form.dimsHmm} onChange={(e) => numberField("dimsHmm", e.target.value)} />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <label>
          <div className="mb-1 font-medium">AABB size X</div>
          <input className="w-full rounded-md border px-2 py-1" type="number" step="0.001" value={form.aabbSizeX} onChange={(e) => numberField("aabbSizeX", e.target.value)} />
        </label>
        <label>
          <div className="mb-1 font-medium">AABB size Y</div>
          <input className="w-full rounded-md border px-2 py-1" type="number" step="0.001" value={form.aabbSizeY} onChange={(e) => numberField("aabbSizeY", e.target.value)} />
        </label>
        <label>
          <div className="mb-1 font-medium">AABB size Z</div>
          <input className="w-full rounded-md border px-2 py-1" type="number" step="0.001" value={form.aabbSizeZ} onChange={(e) => numberField("aabbSizeZ", e.target.value)} />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <label>
          <div className="mb-1 font-medium">AABB center X</div>
          <input className="w-full rounded-md border px-2 py-1" type="number" step="0.001" value={form.aabbCenterX} onChange={(e) => numberField("aabbCenterX", e.target.value)} />
        </label>
        <label>
          <div className="mb-1 font-medium">AABB center Y</div>
          <input className="w-full rounded-md border px-2 py-1" type="number" step="0.001" value={form.aabbCenterY} onChange={(e) => numberField("aabbCenterY", e.target.value)} />
        </label>
        <label>
          <div className="mb-1 font-medium">AABB center Z</div>
          <input className="w-full rounded-md border px-2 py-1" type="number" step="0.001" value={form.aabbCenterZ} onChange={(e) => numberField("aabbCenterZ", e.target.value)} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <label>
          <div className="mb-1 font-medium">Pivot offset X</div>
          <input className="w-full rounded-md border px-2 py-1" type="number" step="0.001" value={form.pivotOffsetX} onChange={(e) => numberField("pivotOffsetX", e.target.value)} />
        </label>
        <label>
          <div className="mb-1 font-medium">Pivot offset Z</div>
          <input className="w-full rounded-md border px-2 py-1" type="number" step="0.001" value={form.pivotOffsetZ} onChange={(e) => numberField("pivotOffsetZ", e.target.value)} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={form.groundAligned}
          onChange={(e) => setForm((prev) => ({ ...prev, groundAligned: e.target.checked }))}
        />
        Ground aligned
      </label>

      <div className="flex items-center gap-2">
        <button
          className="rounded-md bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50"
          disabled={!hasChanges || saving}
          onClick={save}
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {status && <div className="text-xs opacity-80">{status}</div>}
      </div>

      {saveIssues.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="font-medium">Approval blockers</div>
          <div className="mt-2 space-y-1">
            {saveIssues.map((issue) => (
              <div key={issue}>{issue}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
