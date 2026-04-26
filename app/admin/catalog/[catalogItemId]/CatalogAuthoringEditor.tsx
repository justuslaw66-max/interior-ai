"use client";

import { useMemo, useState } from "react";

type EnumFieldMap = {
  shape?: string[];
  base_type?: string[];
  material_family?: string[];
  style_cluster?: string[];
  color_family?: string[];
  tone?: string[];
  size_class?: string[];
};

type PresetDefinition = {
  category: string;
  label: string;
  requiredFields: string[];
  optionalFields: string[];
  enums: EnumFieldMap;
  validationRules?: {
    positiveNumberFields?: string[];
  };
} | null;

type ValidationSummary = {
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
} | null;

type CatalogYamlDraft = {
  brand?: string;
  category?: string;
  product_family?: string;
  product_name?: string;
  variant?: string;
  price_usd?: number;
  price_band?: string;
  brand_tier?: string;
  design_zone?: string;
  anchor_role?: string;
  dimensions?: {
    width_cm?: number;
    depth_cm?: number;
    height_cm?: number;
  };
  seat_capacity?: number;
  size_class?: string;
  shape?: string;
  base_type?: string;
  material_family?: string;
  color_family?: string;
  tone?: string;
  style_cluster?: string;
  room_compatibility?: string[];
  design_pairings?: string[];
  preset_validation?: ValidationSummary;
  preset_label?: string | null;
  file_path?: string;
};

type CatalogDbDraft = {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  defaultVariantId: string;
  tags: string[];
  styleTags: string[];
  toneTags: string[];
  roomTags: string[];
  variantsJson: unknown;
  assetId: string;
};

type Props = {
  initialDb: CatalogDbDraft;
  initialYaml: CatalogYamlDraft | null;
  initialPreset: PresetDefinition;
};

const DB_CATEGORY_OPTIONS = [
  { value: "sofa", label: "Sofa" },
  { value: "coffee_table", label: "Coffee Table" },
  { value: "rug", label: "Rug" },
  { value: "tv_console", label: "TV Console" },
  { value: "accent_chair", label: "Accent Chair" },
  { value: "floor_lamp", label: "Floor Lamp" },
] as const;

function setAtPath(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.split(".");
  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    const current = cursor[key];
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

function getAtPath(target: Record<string, unknown> | null | undefined, path: string): unknown {
  if (!target) return undefined;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (typeof acc !== "object" || acc === null || Array.isArray(acc)) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, target);
}

function normalizeCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function CatalogAuthoringEditor({ initialDb, initialYaml, initialPreset }: Props) {
  const [db, setDb] = useState(initialDb);
  const [yamlDraft, setYamlDraft] = useState<CatalogYamlDraft | null>(initialYaml);
  const [preset, setPreset] = useState<PresetDefinition>(initialPreset);
  const [validation, setValidation] = useState<ValidationSummary>(initialYaml?.preset_validation ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const yamlData = useMemo<Record<string, unknown>>(() => {
    if (!yamlDraft) return {};
    return yamlDraft as unknown as Record<string, unknown>;
  }, [yamlDraft]);

  const fieldPaths = useMemo(() => {
    if (!preset) return [] as string[];
    return Array.from(new Set([...preset.requiredFields, ...preset.optionalFields]));
  }, [preset]);

  const categoryOptions = useMemo<Array<{ value: string; label: string }>>(() => {
    const baseOptions: Array<{ value: string; label: string }> = DB_CATEGORY_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    }));

    if (!baseOptions.some((option) => option.value === db.category) && db.category.trim().length > 0) {
      baseOptions.unshift({
        value: db.category,
        label: `${db.category} (legacy value)`,
      });
    }

    return baseOptions;
  }, [db.category]);

  function updateYamlField(path: string, rawValue: string) {
    setYamlDraft((prev) => {
      const next = { ...(prev ?? {}) } as Record<string, unknown>;
      const positiveFields = preset?.validationRules?.positiveNumberFields ?? [];
      const parsedValue = positiveFields.includes(path)
        ? (rawValue.trim() === "" ? null : Number(rawValue))
        : rawValue;
      setAtPath(next, path, parsedValue);
      return next as CatalogYamlDraft;
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/catalog/${db.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db: {
            title: db.title,
            slug: db.slug,
            description: db.description || null,
            category: db.category,
            defaultVariantId: db.defaultVariantId || null,
            tags: db.tags,
            styleTags: db.styleTags,
            toneTags: db.toneTags,
            roomTags: db.roomTags,
            variantsJson: db.variantsJson,
          },
          yaml: yamlDraft,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        yaml?: CatalogYamlDraft | null;
        preset?: PresetDefinition;
        validation?: ValidationSummary;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Save failed");
      }

      setYamlDraft(payload.yaml ?? null);
      setPreset(payload.preset ?? null);
      setValidation(payload.validation ?? null);
      setMessage("Saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Catalog item</h2>
            <div className="mt-1 text-xs text-neutral-600">DB-backed runtime fields used by the app catalog.</div>
          </div>
          <div className="text-xs text-neutral-500">Asset: {db.assetId}</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-neutral-600">
            Title
            <input className="mt-1 w-full rounded border p-2 text-sm" value={db.title} onChange={(event) => setDb((prev) => ({ ...prev, title: event.target.value }))} />
          </label>
          <label className="text-xs text-neutral-600">
            Slug
            <input className="mt-1 w-full rounded border p-2 text-sm" value={db.slug} onChange={(event) => setDb((prev) => ({ ...prev, slug: event.target.value }))} />
          </label>
          <label className="text-xs text-neutral-600 md:col-span-2">
            Description
            <textarea className="mt-1 w-full rounded border p-2 text-sm" rows={3} value={db.description} onChange={(event) => setDb((prev) => ({ ...prev, description: event.target.value }))} />
          </label>
          <label className="text-xs text-neutral-600">
            Category
            <select className="mt-1 w-full rounded border p-2 text-sm" value={db.category} onChange={(event) => setDb((prev) => ({ ...prev, category: event.target.value }))}>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-600">
            Default variant id
            <input className="mt-1 w-full rounded border p-2 text-sm" value={db.defaultVariantId} onChange={(event) => setDb((prev) => ({ ...prev, defaultVariantId: event.target.value }))} />
          </label>
          <label className="text-xs text-neutral-600">
            Tags
            <input className="mt-1 w-full rounded border p-2 text-sm" value={db.tags.join(", ")} onChange={(event) => setDb((prev) => ({ ...prev, tags: normalizeCsv(event.target.value) }))} />
          </label>
          <label className="text-xs text-neutral-600">
            Style tags
            <input className="mt-1 w-full rounded border p-2 text-sm" value={db.styleTags.join(", ")} onChange={(event) => setDb((prev) => ({ ...prev, styleTags: normalizeCsv(event.target.value) }))} />
          </label>
          <label className="text-xs text-neutral-600">
            Tone tags
            <input className="mt-1 w-full rounded border p-2 text-sm" value={db.toneTags.join(", ")} onChange={(event) => setDb((prev) => ({ ...prev, toneTags: normalizeCsv(event.target.value) }))} />
          </label>
          <label className="text-xs text-neutral-600">
            Room tags
            <input className="mt-1 w-full rounded border p-2 text-sm" value={db.roomTags.join(", ")} onChange={(event) => setDb((prev) => ({ ...prev, roomTags: normalizeCsv(event.target.value) }))} />
          </label>
          <label className="text-xs text-neutral-600 md:col-span-2">
            Variants JSON
            <textarea
              className="mt-1 w-full rounded border p-2 font-mono text-xs"
              rows={8}
              value={JSON.stringify(db.variantsJson ?? [], null, 2)}
              onChange={(event) => {
                try {
                  const parsed = JSON.parse(event.target.value);
                  setDb((prev) => ({ ...prev, variantsJson: parsed }));
                } catch {
                  setDb((prev) => ({ ...prev, variantsJson: event.target.value }));
                }
              }}
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Preset authoring</h2>
            <div className="mt-1 text-xs text-neutral-600">YAML-backed governance fields tied to the linked asset.</div>
          </div>
          <div
            className={`rounded-full px-2 py-1 text-[11px] font-medium ${validation?.publishable ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}
          >
            {validation?.publishable ? "publishable" : "needs fixes"}
          </div>
        </div>

        {!yamlDraft && (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            No linked catalog YAML was found for this item&apos;s asset. The DB record can still be edited above, but preset-driven authoring is unavailable until a YAML file is linked.
          </div>
        )}

        {yamlDraft && (
          <>
            <div className="mt-3 text-xs text-neutral-600">{yamlDraft.file_path ?? "Linked YAML path unavailable"}</div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {fieldPaths.map((path) => {
                const value = getAtPath(yamlData, path);
                const enumValues = preset?.enums[path as keyof EnumFieldMap];
                const isNumeric = (preset?.validationRules?.positiveNumberFields ?? []).includes(path);
                return (
                  <label key={path} className="text-xs text-neutral-600">
                    {path}
                    {enumValues ? (
                      <select
                        className="mt-1 w-full rounded border p-2 text-sm"
                        value={typeof value === "string" ? value : ""}
                        onChange={(event) => updateYamlField(path, event.target.value)}
                      >
                        <option value="">-</option>
                        {enumValues.map((entry) => (
                          <option key={entry} value={entry}>{entry}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="mt-1 w-full rounded border p-2 text-sm"
                        type={isNumeric ? "number" : "text"}
                        value={value == null ? "" : String(value)}
                        onChange={(event) => updateYamlField(path, event.target.value)}
                      />
                    )}
                  </label>
                );
              })}

              <label className="text-xs text-neutral-600">
                room_compatibility
                <input
                  className="mt-1 w-full rounded border p-2 text-sm"
                  value={(yamlDraft.room_compatibility ?? []).join(", ")}
                  onChange={(event) => setYamlDraft((prev) => ({ ...(prev ?? {}), room_compatibility: normalizeCsv(event.target.value) }))}
                />
              </label>
              <label className="text-xs text-neutral-600">
                design_pairings
                <input
                  className="mt-1 w-full rounded border p-2 text-sm"
                  value={(yamlDraft.design_pairings ?? []).join(", ")}
                  onChange={(event) => setYamlDraft((prev) => ({ ...(prev ?? {}), design_pairings: normalizeCsv(event.target.value) }))}
                />
              </label>
            </div>

            {validation && (
              <div className="mt-4 rounded-lg border bg-neutral-50 p-3 text-xs">
                {validation.missingRequiredFields.length > 0 && (
                  <div className="mb-2">
                    <div className="font-medium text-amber-800">Missing required fields</div>
                    <div className="mt-1 text-neutral-700">{validation.missingRequiredFields.join(", ")}</div>
                  </div>
                )}
                {validation.invalidEnumFields.length > 0 && (
                  <div className="mb-2">
                    <div className="font-medium text-amber-800">Invalid controlled values</div>
                    <div className="mt-1 space-y-1 text-neutral-700">
                      {validation.invalidEnumFields.map((entry) => (
                        <div key={`${entry.field}-${entry.value}`}>
                          {entry.field}: {entry.value} (allowed: {entry.allowed.join(", ")})
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {validation.invalidPositiveNumberFields.length > 0 && (
                  <div className="mb-2">
                    <div className="font-medium text-amber-800">Expected positive numbers</div>
                    <div className="mt-1 text-neutral-700">{validation.invalidPositiveNumberFields.join(", ")}</div>
                  </div>
                )}
                {validation.warnings.length > 0 && (
                  <div>
                    <div className="font-medium text-neutral-800">Warnings</div>
                    <div className="mt-1 space-y-1 text-neutral-700">
                      {validation.warnings.map((warning) => (
                        <div key={warning}>{warning}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button type="button" className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50" disabled={saving} onClick={save}>
          {saving ? "Saving..." : "Save catalog authoring"}
        </button>
        {message && <div className="text-sm text-neutral-600">{message}</div>}
      </div>
    </div>
  );
}