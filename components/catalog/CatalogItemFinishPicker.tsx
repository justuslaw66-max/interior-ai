import { inferCollectionType, shouldShowCollectionGrouping } from "@/lib/catalog/variant-normalization";

type MaterialType = "Fabric" | "Leather" | "Wood";
type CollectionType = "stocked" | "custom";

type FinishOption = {
  id: string;
  productId?: string;
  variantId?: string;
  label: string;
  swatchHex?: string;
  swatchTextureUrl?: string;
  materialType: MaterialType;
  collectionType?: string;
  finishCode?: string;
};

type Props = {
  finishOptions: FinishOption[];
  activeFinishId?: string;
  onSetFinish: (finishId: string, finish: FinishOption) => void;
};

const COLLECTION_TYPES: CollectionType[] = ["stocked", "custom"];
const UPHOLSTERY_TYPES: Array<Exclude<MaterialType, "Wood">> = ["Fabric", "Leather"];

function getMaterialLabel(materialType: MaterialType): string {
  if (materialType === "Wood") return "Wood colour";
  return `${materialType} colour`;
}

function getCollectionLabel(collectionType: CollectionType, materialType: MaterialType): string {
  const collectionLabel = collectionType === "stocked" ? "Stocked" : "Custom";
  const materialLabel =
    materialType === "Fabric" ? "Fabrics" : materialType === "Leather" ? "Leathers" : "Finishes";
  return `${collectionLabel} ${materialLabel}:`;
}

export default function CatalogItemFinishPicker({ finishOptions, activeFinishId, onSetFinish }: Props) {
  if (finishOptions.length === 0) return null;

  const isActiveFinish = (finish: FinishOption) =>
    finish.id === activeFinishId || finish.variantId === activeFinishId;
  const resolveCollectionType = (finish: FinishOption) =>
    inferCollectionType(finish.collectionType, finish.finishCode ?? finish.id ?? finish.label);
  const selectedFinish = finishOptions.find(isActiveFinish);
  const shouldShowCollectionGroups = shouldShowCollectionGrouping(
    finishOptions.map(resolveCollectionType)
  );
  const upholsteryMaterialTypes = UPHOLSTERY_TYPES.filter((materialType) =>
    finishOptions.some((finish) => finish.materialType === materialType)
  );
  const activeUpholsteryMaterialType =
    selectedFinish && selectedFinish.materialType !== "Wood"
      ? selectedFinish.materialType
      : upholsteryMaterialTypes[0];
  const activeCollectionType = selectedFinish ? resolveCollectionType(selectedFinish) : undefined;

  const renderSwatches = (sectionKey: string, items: FinishOption[]) => (
    <div className="mt-3 grid grid-cols-4 gap-2.5">
      {items.map((finish, index) => {
        const active = isActiveFinish(finish);
        return (
          <button
            key={`${sectionKey}-${finish.id}-${index}`}
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
  );

  const renderFinishSections = (materialType: MaterialType, items: FinishOption[]) => {
    const sections = shouldShowCollectionGroups
      ? COLLECTION_TYPES.map((collectionType) => ({
          collectionType,
          items: items.filter((finish) => resolveCollectionType(finish) === collectionType),
        })).filter((section) => section.items.length > 0)
      : [{ collectionType: null, items }];

    return sections.map((section) => {
      const sectionKey = `${section.collectionType ?? "all"}-${materialType.toLowerCase()}`;
      return (
        <section
          key={sectionKey}
          className="mt-4"
          data-testid={`catalog-finish-section-${sectionKey}`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="text-sm font-semibold text-[#4b2635]">
              {section.collectionType
                ? getCollectionLabel(section.collectionType, materialType)
                : getMaterialLabel(materialType)}
            </h4>
            <span className="text-[11px] text-neutral-500">
              {section.items.length} option{section.items.length === 1 ? "" : "s"}
            </span>
          </div>
          {section.collectionType === "custom" ? (
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              Create a piece made just for you in one of our custom {materialType.toLowerCase()}s.
            </p>
          ) : null}
          {renderSwatches(sectionKey, section.items)}
        </section>
      );
    });
  };

  const activeUpholsteryOptions = activeUpholsteryMaterialType
    ? finishOptions.filter((finish) => finish.materialType === activeUpholsteryMaterialType)
    : [];
  const woodOptions = finishOptions.filter((finish) => finish.materialType === "Wood");

  return (
    <div data-testid="catalog-finish-picker">
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

      {upholsteryMaterialTypes.length > 1 && activeUpholsteryMaterialType ? (
        <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Material">
          {upholsteryMaterialTypes.map((materialType) => {
            const active = materialType === activeUpholsteryMaterialType;
            const matchingOptions = finishOptions.filter(
              (finish) => finish.materialType === materialType
            );
            const nextFinish =
              matchingOptions.find(
                (finish) => resolveCollectionType(finish) === activeCollectionType
              ) ?? matchingOptions[0];

            return (
              <button
                key={`material-tab-${materialType}`}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (nextFinish) onSetFinish(nextFinish.id, nextFinish);
                }}
                className={[
                  "rounded-full border px-3 py-2 text-xs font-semibold transition",
                  active
                    ? "border-[#5a2135] bg-[#5a2135] text-white"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400",
                ].join(" ")}
              >
                {materialType}
              </button>
            );
          })}
        </div>
      ) : null}

      {activeUpholsteryMaterialType && activeUpholsteryOptions.length > 0
        ? renderFinishSections(activeUpholsteryMaterialType, activeUpholsteryOptions)
        : null}

      {woodOptions.length > 0 ? renderFinishSections("Wood", woodOptions) : null}
    </div>
  );
}
