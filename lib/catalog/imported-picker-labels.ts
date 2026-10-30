import type { ImportedModelOption } from "@/lib/catalog/imported-model-assembly";

/**
 * Pro's "All 3D models" picker names a model by its product name, and models in one family often
 * share it: Kelsey's 160 and 180 tables were both "Kelsey Marble Dining Table", so nobody could
 * tell which they were adding (31 Oct 2026; the Kelsey browser tests had failed on it since mid
 * October). Those that share a name now get what tells them apart: their widths when those differ
 * ("Kelsey Marble Dining Table (160 cm)"), otherwise the words their ids don't share (Hamilton's
 * "Left" and "Right", Hugg's "Basalt, Closed").
 */
const ID_WORDS: Record<string, string> = { opened: "Open" };

const titleCase = (word: string) => ID_WORDS[word] ?? word.charAt(0).toUpperCase() + word.slice(1);

/** What tells this model apart from the others with its name, or "" when nothing does. */
function distinguishingLabel(option: ImportedModelOption, sameName: readonly ImportedModelOption[]): string {
  const widthCm = (model: ImportedModelOption) => Math.round(model.dimsWmm / 10);
  if (new Set(sameName.map(widthCm)).size === sameName.length) return `${widthCm(option)} cm`;
  const words = (model: ImportedModelOption) => model.id.split("-");
  const shared = words(sameName[0]).filter((word) => sameName.every((model) => words(model).includes(word)));
  return words(option)
    .filter((word) => !shared.includes(word))
    .map(titleCase)
    .join(", ");
}

/** "Name (Wide Arm)" plus "160 cm" is "Name (Wide Arm, 160 cm)". */
function withLabelPart(label: string, part: string): string {
  return label.endsWith(")") ? `${label.slice(0, -1)}, ${part})` : `${label} (${part})`;
}

export function withDistinctPickerLabels(options: ImportedModelOption[]): ImportedModelOption[] {
  const byName = new Map<string, ImportedModelOption[]>();
  const nameOf = (option: ImportedModelOption) => `${option.familyKey}\n${option.pickerLabel}`;
  for (const option of options) byName.set(nameOf(option), [...(byName.get(nameOf(option)) ?? []), option]);
  return options.map((option) => {
    const sameName = byName.get(nameOf(option)) ?? [];
    const part = sameName.length > 1 ? distinguishingLabel(option, sameName) : "";
    return part ? { ...option, pickerLabel: withLabelPart(option.pickerLabel, part) } : option;
  });
}
