import { inferCollectionType, shouldShowCollectionGrouping } from "@/lib/catalog/variant-normalization";

type FinishOption = {
  id: string;
  productId?: string;
  variantId?: string;
  label: string;
  swatchHex?: string;
  swatchTextureUrl?: string;
  materialType: "Fabric" | "Leather" | "Wood";
  collectionType?: string;
  finishCode?: string;
};

type Props = {
  finishOptions: FinishOption[];
  activeFinishId?: string;
  onSetFinish: (finishId: string, finish: FinishOption) => void;
};

export default function CatalogItemFinishPicker({ finishOptions, activeFinishId, onSetFinish }: Props) {
  if (finishOptions.length === 0) return null;

  const selectedFinish = finishOptions.find(
    (finish) => finish.id === activeFinishId || finish.variantId === activeFinishId
  );
  const resolvedCollectionTypes = finishOptions.map((finish) =>
    inferCollectionType(finish.collectionType, finish.finishCode ?? finish.id ?? finish.label)
  );
  const shouldShowCollectionGroups = shouldShowCollectionGrouping(resolvedCollectionTypes);

  // Group by collectionType first, then by materialType when meaningful.
  const collectionTypes = ["stocked", "custom"];
  const materialTypes: Array<"Fabric" | "Leather" | "Wood"> = ["Fabric", "Wood", "Leather"];

  const getMaterialLabel = (materialType: "Fabric" | "Leather" | "Wood") =>
    materialType === "Wood" ? "Wood colour" : materialType === "Fabric" ? "Fabric colour" : "Leather";

  const renderSwatchGroup = (
    collectionKey: string,
    materialGroup: {
      materialType: "Fabric" | "Leather" | "Wood";
      items: FinishOption[];
    }
  ) => (
    <div key={`${collectionKey}-${materialGroup.materialType}`} className="mt-3 rounded-2xl border border-neutral-100 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
          {getMaterialLabel(materialGroup.materialType)}
        </div>
        <div className="text-[11px] text-neutral-500">
          {materialGroup.items.length} option{materialGroup.items.length === 1 ? "" : "s"}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2.5">
        {materialGroup.items.map((finish, index) => {
          const active = finish.id === activeFinishId;
          return (
            <button
              key={`${collectionKey}-${materialGroup.materialType}-${finish.id}-${index}`}
              type="button"
              onClick={() => onSetFinish(finish.id, finish)}
              data-testid={`catalog-finish-option-${finish.id}`}
              title={finish.label}
              aria-label={finish.label}
              aria-pressed={active}
              className={`group relative h-16 w-full overflow-hidden rounded-xl border shadow-sm transition ${
                active
                  ? "border-neutral-950 ring-2 ring-neutral-950/20"
                  : "border-neutral-200 hover:border-neutral-400 hover:shadow"
              }`}
              style={{
                backgroundColor: finish.swatchHex ?? "#d1d5db",
                backgroundImage: finish.swatchTextureUrl ? `url(${finish.swatchTextureUrl})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <span className="sr-only">{finish.label}</span>
              {active ? (
                <>
                  <span className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.75)]" />
                  <span className="pointer-events-none absolute bottom-0 left-0 right-0 bg-neutral-950/85 px-1 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-white">
                    Selected
                  </span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
      {(() => {
        const selectedInGroup = materialGroup.items.find((finish) => finish.id === activeFinishId);
        if (!selectedInGroup) return null;
        return (
          <div className="mt-2 rounded-lg bg-neutral-50 px-2.5 py-2 text-[11px] text-neutral-600">
            <span className="font-semibold text-neutral-900">Selected:</span> {selectedInGroup.label}
          </div>
        );
      })()}
    </div>
  );

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
            materialType: "Fabric" | "Leather" | "Wood";
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Finish
          </div>
          {selectedFinish ? (
            <div className="mt-1 text-sm font-semibold text-neutral-900">{selectedFinish.label}</div>
          ) : null}
        </div>
        <div className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
          Variant-safe
        </div>
      </div>
      {grouped.map((collectionGroup) => (
        <div key={collectionGroup.collectionType ?? "all"} className="mt-3">
          {collectionGroup.collectionType ? (
            <div className="text-[10px] font-semibold text-neutral-600 uppercase tracking-wide">
              {collectionGroup.collectionType === "stocked" ? "Stocked" : "Custom"}
            </div>
          ) : null}
          
          {(() => {
            const collectionKey = collectionGroup.collectionType ?? "all";
            const upholsteryGroups = collectionGroup.materialGroups.filter(
              (group) => group.materialType === "Fabric" || group.materialType === "Leather"
            );
            const woodGroups = collectionGroup.materialGroups.filter((group) => group.materialType === "Wood");
            const activeUpholsteryGroup =
              upholsteryGroups.find((group) =>
                group.items.some((finish) => finish.id === activeFinishId)
              ) ?? upholsteryGroups[0];

            return (
              <>
                {upholsteryGroups.length > 1 && activeUpholsteryGroup ? (
                  <div className="mt-3">
                    <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Material">
                      {upholsteryGroups.map((materialGroup) => {
                        const active = materialGroup.materialType === activeUpholsteryGroup.materialType;
                        const firstFinish = materialGroup.items[0];
                        return (
                          <button
                            key={`${collectionKey}-material-tab-${materialGroup.materialType}`}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => {
                              if (firstFinish) onSetFinish(firstFinish.id, firstFinish);
                            }}
                            className={[
                              "rounded-full border px-3 py-2 text-xs font-semibold transition",
                              active
                                ? "border-[#5a2135] bg-[#5a2135] text-white"
                                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400",
                            ].join(" ")}
                          >
                            {materialGroup.materialType}
                          </button>
                        );
                      })}
                    </div>
                    {renderSwatchGroup(collectionKey, activeUpholsteryGroup)}
                  </div>
                ) : (
                  upholsteryGroups.map((materialGroup) => renderSwatchGroup(collectionKey, materialGroup))
                )}

                {woodGroups.map((materialGroup) => renderSwatchGroup(collectionKey, materialGroup))}
              </>
            );
          })()}
        </div>
      ))}
    </div>
  );
}
