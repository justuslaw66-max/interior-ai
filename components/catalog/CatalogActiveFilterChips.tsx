import { X } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import type { CatalogFilterState } from "@/lib/catalog/view-builders";

type Props = {
  filters: CatalogFilterState;
  onClearKey: (key: keyof CatalogFilterState) => void;
  onClearAll: () => void;
};

export default function CatalogActiveFilterChips({ filters, onClearKey, onClearAll }: Props) {
  const chips: Array<{ key: keyof CatalogFilterState; label: string }> = [];

  if (filters.brandIds?.length) chips.push({ key: "brandIds", label: `Brand (${filters.brandIds.length})` });
  if (typeof filters.priceMin === "number" || typeof filters.priceMax === "number") chips.push({ key: "priceMin", label: "Price" });
  if (typeof filters.widthMinCm === "number" || typeof filters.widthMaxCm === "number") {
    const label =
      typeof filters.widthMinCm === "number" && typeof filters.widthMaxCm === "number"
        ? `Width: ${filters.widthMinCm}–${filters.widthMaxCm} cm`
        : typeof filters.widthMinCm === "number"
          ? `Width: ≥ ${filters.widthMinCm} cm`
          : `Width: ≤ ${filters.widthMaxCm} cm`;
    chips.push({ key: "widthMinCm", label });
  }
  if (filters.colorFamilies?.length) chips.push({ key: "colorFamilies", label: `Colour (${filters.colorFamilies.length})` });
  if (filters.materialFamilies?.length) chips.push({ key: "materialFamilies", label: `Material (${filters.materialFamilies.length})` });
  if (filters.styleTags?.length) chips.push({ key: "styleTags", label: `Style (${filters.styleTags.length})` });
  if (filters.sofaSeatCapacityBuckets?.length) {
    const labels = (["2", "3", "4_plus"] as const)
      .filter((bucket) => filters.sofaSeatCapacityBuckets?.includes(bucket))
      .map((bucket) => bucket === "4_plus" ? "4+" : bucket);
    chips.push({
      key: "sofaSeatCapacityBuckets",
      label: `Seats: ${labels.join(", ")}`,
    });
  }
  if (filters.smallRoomFriendly) chips.push({ key: "smallRoomFriendly", label: "Small-room" });
  if (filters.starterEligible) chips.push({ key: "starterEligible", label: "Starter-friendly" });

  if (!chips.length) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <Chip key={chip.key} aria-label={`Clear ${chip.label}`} onClick={() => onClearKey(chip.key)}>
          {chip.label}
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Chip>
      ))}
      <Chip onClick={onClearAll}>Clear all</Chip>
    </div>
  );
}
