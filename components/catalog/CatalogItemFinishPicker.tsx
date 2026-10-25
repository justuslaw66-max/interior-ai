import { CHOSEN_SWATCH_RING } from "@/components/ui/ChoiceTile";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
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
  // A material's first finish in the chosen collection (stocked or custom), else its first finish.
  const firstFinishOf = (materialType: MaterialType) => {
    const matchingOptions = finishOptions.filter((finish) => finish.materialType === materialType);
    return (
      matchingOptions.find((finish) => resolveCollectionType(finish) === activeCollectionType) ??
      matchingOptions[0]
    );
  };

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
            className={`h-16 w-full rounded-xl border border-swatch-edge shadow-sm transition ${
              active ? "" : "hover:border-control-edge-hover hover:shadow"
            }`}
            style={{
              backgroundColor: finish.swatchHex ?? "#d1d5db",
              backgroundImage: finish.swatchTextureUrl ? `url(${finish.swatchTextureUrl})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
              // The item panel's ring (J, 17 Oct): the chosen swatch shows whole, and its name is above.
              boxShadow: active ? CHOSEN_SWATCH_RING : undefined,
            }}
          >
            <span className="sr-only">{finish.label}</span>
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
            <h4 className="text-sm font-semibold text-label">
              {section.collectionType
                ? getCollectionLabel(section.collectionType, materialType)
                : getMaterialLabel(materialType)}
            </h4>
            <span className="text-xs text-label-secondary">
              {section.items.length} option{section.items.length === 1 ? "" : "s"}
            </span>
          </div>
          {section.collectionType === "custom" ? (
            <p className="mt-1 text-xs leading-relaxed text-label-secondary">
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
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-label-secondary">
            Finish
          </div>
          {selectedFinish ? (
            <div className="mt-1 text-sm font-semibold text-label">{selectedFinish.label}</div>
          ) : null}
        </div>
        <div className="rounded-full bg-control-track px-2.5 py-1 text-xs font-semibold text-label-secondary">
          Variant-safe
        </div>
      </div>

      {upholsteryMaterialTypes.length > 1 && activeUpholsteryMaterialType ? (
        <SegmentedControl
          label="Material"
          fill
          className="mt-4"
          value={activeUpholsteryMaterialType}
          onChange={(materialType) => {
            const nextFinish = firstFinishOf(materialType);
            if (nextFinish) onSetFinish(nextFinish.id, nextFinish);
          }}
          options={upholsteryMaterialTypes.map((value) => ({ value, label: value }))}
        />
      ) : null}

      {activeUpholsteryMaterialType && activeUpholsteryOptions.length > 0
        ? renderFinishSections(activeUpholsteryMaterialType, activeUpholsteryOptions)
        : null}

      {woodOptions.length > 0 ? renderFinishSections("Wood", woodOptions) : null}
    </div>
  );
}
