import { inferCollectionType, shouldShowCollectionGrouping } from "@/lib/catalog/variant-normalization";

type FinishOption = {
  id: string;
  label: string;
  swatchHex?: string;
  materialType?: "Fabric" | "Leather";
  collectionType?: string;
  finishCode?: string;
};

type Props = {
  finishOptions: FinishOption[];
  activeFinishId?: string;
  onSetFinish: (finishId: string) => void;
};

export default function CatalogItemFinishPicker({ finishOptions, activeFinishId, onSetFinish }: Props) {
  if (finishOptions.length === 0) return null;

  const resolvedCollectionTypes = finishOptions.map((finish) =>
    inferCollectionType(finish.collectionType, finish.finishCode ?? finish.id ?? finish.label)
  );
  const shouldShowCollectionGroups = shouldShowCollectionGrouping(resolvedCollectionTypes);

  // Group by collectionType first, then by materialType when meaningful.
  const collectionTypes = ["stocked", "custom"];
  const materialTypes: Array<"Fabric" | "Leather"> = ["Fabric", "Leather"];

  const buildMaterialGroups = (items: FinishOption[]) => {
    const itemsByMaterial = materialTypes
      .map((materialType) => ({
        materialType,
        items: items.filter((opt) => (opt.materialType ?? "Fabric") === materialType),
      }))
      .filter((group) => group.items.length > 0);

    if (itemsByMaterial.length > 0) return itemsByMaterial;
    return [{ materialType: "Fabric" as const, items }];
  };
  
  const grouped = shouldShowCollectionGroups
    ? collectionTypes
        .map((collectionType) => {
          const itemsByCollection = finishOptions.filter(
            (opt) =>
              inferCollectionType(opt.collectionType, opt.finishCode ?? opt.id ?? opt.label) ===
              collectionType
          );
          if (itemsByCollection.length === 0) return null;

          return {
            collectionType,
            materialGroups: buildMaterialGroups(itemsByCollection),
          };
        })
        .filter((group) => group !== null) as Array<{
          collectionType: string;
          materialGroups: Array<{
            materialType: "Fabric" | "Leather";
            items: FinishOption[];
          }>;
        }>
    : [
        {
          collectionType: null,
          materialGroups: buildMaterialGroups(finishOptions),
        },
      ];

  return (
    <div>
      <div className="text-xs font-semibold text-neutral-800">Finish</div>
      {grouped.map((collectionGroup) => (
        <div key={collectionGroup.collectionType ?? "all"} className="mt-3">
          {collectionGroup.collectionType ? (
            <div className="text-[10px] font-semibold text-neutral-600 uppercase tracking-wide">
              {collectionGroup.collectionType === "stocked" ? "Stocked" : "Custom"}
            </div>
          ) : null}
          
          {collectionGroup.materialGroups.map((materialGroup) => (
            <div key={`${collectionGroup.collectionType ?? "all"}-${materialGroup.materialType}`} className="mt-2">
              <div className="text-[11px] font-medium text-neutral-500">{materialGroup.materialType}</div>
              <div className="mt-1.5 grid grid-cols-5 gap-[6.6px]">
                {materialGroup.items.map((finish) => {
                  const active = finish.id === activeFinishId;
                  return (
                    <button
                      key={finish.id}
                      onClick={() => onSetFinish(finish.id)}
                      data-testid={`catalog-finish-option-${finish.id}`}
                      title={finish.label}
                      aria-label={finish.label}
                      className={`group relative h-14.5 w-14.5 rounded-md border transition ${
                        active
                          ? "border-[#5a2135] ring-2 ring-[#5a2135]/30"
                          : "border-neutral-200 hover:border-neutral-400"
                      }`}
                      style={{ backgroundColor: finish.swatchHex ?? "#d1d5db" }}
                    >
                      <span className="sr-only">{finish.label}</span>
                      {active ? (
                        <span className="pointer-events-none absolute inset-0 rounded-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {(() => {
                const selectedInGroup = materialGroup.items.find((finish) => finish.id === activeFinishId);
                if (!selectedInGroup) return null;
                return (
                  <div className="mt-2 text-[11px] text-neutral-600">
                    Selected: {selectedInGroup.label}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
