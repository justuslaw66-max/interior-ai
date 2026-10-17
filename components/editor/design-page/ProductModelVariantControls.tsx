"use client";

import {
  AuburnConfigurationSelector,
  type AuburnConfigurationSelectorActions,
  type AuburnConfigurationSelectorState,
} from "@/components/editor/design-page/AuburnConfigurationSelector";
import {
  JaronConfigurationSelector,
  type JaronConfigurationSelectorActions,
  type JaronConfigurationSelectorState,
} from "@/components/editor/design-page/JaronConfigurationSelector";
import { getCastleryConfigurationIconDescriptor } from "@/components/editor/design-page/castleryConfigurationIcons";
import { ChoiceTile } from "@/components/ui/ChoiceTile";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

type ProductTargetOption = {
  key: string;
  label: string;
  productId: string | null;
  active: boolean;
  disabled: boolean;
  title: string;
};

type VariantSectionOption = ProductTargetOption & {
  variantId?: string;
  cushion?: "no" | "leather";
  colorHex?: string;
  testId?: string;
};

type VariantSectionState = {
  label: string;
  kind: "model" | "shape" | "length" | "sloane-bench" | "variant";
  options: VariantSectionOption[];
};

type MaterialSwatchState = {
  label: string;
  colorHex: string;
  swatchTextureUrl: string | null;
};

type LayoutState = {
  label: string;
  options: Array<{
    code: string;
    label: string;
    active: boolean;
    disabled: boolean;
  }>;
  helperText: string | null;
  recommendedPlanningSize: string | null;
  visualFootprint: string | null;
  estimationNote: string | null;
};

export type ProductModelVariantControlsState = {
  orientationOptions: ProductTargetOption[];
  jaronConfiguration: JaronConfigurationSelectorState | null;
  auburnConfiguration: AuburnConfigurationSelectorState | null;
  armStyleOptions: ProductTargetOption[];
  variantSection: VariantSectionState | null;
  sloaneBenchMaterial: MaterialSwatchState | null;
  lengthOptions: ProductTargetOption[];
  huggModelOptions: ProductTargetOption[];
  sebModelOptions: ProductTargetOption[];
  layout: LayoutState | null;
};

export type ProductModelVariantControlsActions = {
  onSelectOrientation: (productId: string, label: string) => void;
  jaron: JaronConfigurationSelectorActions;
  auburn: AuburnConfigurationSelectorActions;
  onSelectArmStyle: (productId: string, label: string) => void;
  onSelectModel: (productId: string, label: string) => void;
  onSelectShape: (productId: string, label: string) => void;
  onSelectLengthVariant: (productId: string, label: string) => void;
  onSelectSloaneBenchCushion: (cushion: "no" | "leather", label: string) => void;
  onSelectVariant: (variantId: string) => void;
  onSelectLength: (productId: string, label: string) => void;
  onSelectHuggModel: (productId: string, label: string) => void;
  onSelectSebModel: (productId: string, label: string) => void;
  onSelectLayout: (code: string, label: string) => void;
};

type ProductModelVariantControlsProps = {
  state: ProductModelVariantControlsState;
  actions: ProductModelVariantControlsActions;
};

const sectionHeadingClass = "text-sm font-semibold text-neutral-900";

type CastleryConfigurationFamily = "hamilton" | "dawson";
type CastleryConfigurationGroupKey =
  | "standard"
  | "l-shaped"
  | "u-shaped"
  | "armchair"
  | "sleeper";

const CASTLERY_CONFIGURATION_GROUPS: Record<
  CastleryConfigurationFamily,
  Array<{
    key: CastleryConfigurationGroupKey;
    label: string;
  }>
> = {
  hamilton: [
    { key: "standard", label: "Standard" },
    { key: "l-shaped", label: "L-shaped" },
    { key: "armchair", label: "Armchair" },
    { key: "sleeper", label: "Sleeper" },
  ],
  dawson: [
    { key: "standard", label: "Standard" },
    { key: "l-shaped", label: "L-shaped" },
    { key: "u-shaped", label: "U-shaped" },
    { key: "armchair", label: "Armchair" },
  ],
};

function getCastleryConfigurationFamily(
  variantSection: VariantSectionState | null
): CastleryConfigurationFamily | null {
  if (variantSection?.kind !== "model" || variantSection.options.length <= 1) {
    return null;
  }

  for (const family of ["hamilton", "dawson"] as const) {
    if (
      variantSection.options.every((option) =>
        String(option.productId ?? "").includes(`real-castlery-${family}-`)
      )
    ) {
      return family;
    }
  }

  return null;
}

function castleryConfigurationGroup(
  family: CastleryConfigurationFamily,
  option: VariantSectionOption
): CastleryConfigurationGroupKey {
  const productId = String(option.productId ?? "");
  if (family === "hamilton" && productId.includes("sofa-bed")) {
    return "sleeper";
  }
  if (productId.includes("armchair")) return "armchair";
  if (family === "dawson" && productId.includes("pit-sectional")) {
    return "u-shaped";
  }
  if (productId.includes("chaise-sectional")) return "l-shaped";
  return "standard";
}

function castleryConfigurationLabel(
  family: CastleryConfigurationFamily,
  option: VariantSectionOption
): string {
  const productId = String(option.productId ?? "");
  if (family === "dawson") {
    if (productId.includes("storage-ottoman")) return "Storage Ottoman";
    if (productId.includes("dawson-ottoman")) return "Small Ottoman";
    if (productId.includes("wide-chaise-sectional")) {
      return "Wide Chaise Sectional Sofa";
    }
    if (productId.includes("chaise-sectional")) return "Chaise Sectional Sofa";
    if (productId.includes("pit-sectional")) return "Pit-Sectional Sofa";
    if (productId.includes("extended-sofa")) return "Extended 3 Seater Sofa";
    if (productId.includes("swivel-armchair")) return "Swivel Armchair";
    if (productId.includes("dawson-3s")) return "3 Seater Sofa";
  }

  if (productId.includes("round-swivel-1-5-seater")) {
    return "Round Swivel 1.5 Seater Armchair";
  }
  if (productId.includes("round-swivel-armchair")) {
    return "Round Swivel Armchair";
  }
  if (productId.includes("chaise-sectional-sofa-bed")) {
    return "Chaise Sectional Sofa Bed";
  }
  if (productId.includes("3-seater-sofa-bed")) {
    return "3 Seater Sofa Bed";
  }
  if (productId.includes("round-chaise-sectional")) {
    return "Round Chaise Sectional Sofa";
  }
  if (productId.includes("chaise-sectional-with-storage-ottoman")) {
    return "Chaise Sectional Sofa with Storage Ottoman";
  }
  if (productId.includes("chaise-sectional")) {
    return "Chaise Sectional Sofa";
  }
  if (productId.includes("3-seater-with-storage-ottoman")) {
    return "3 Seater Sofa with Storage Ottoman";
  }
  if (productId.includes("2-seater-with-storage-ottoman")) {
    return "2 Seater Sofa with Storage Ottoman";
  }
  if (productId.includes("3-seater")) return "3 Seater Sofa";
  if (productId.includes("2-seater")) return "2 Seater Sofa";
  return option.label.replace(/\s*\/\s*(?:left|right)\s+facing.*$/i, "").trim();
}

function CastleryConfigurationDiagram({
  productId,
  compact = false,
}: {
  productId: string;
  compact?: boolean;
}) {
  const descriptor = getCastleryConfigurationIconDescriptor(productId);
  const transforms = [
    descriptor.mirror ? "scaleX(-1)" : null,
    descriptor.crop?.scale ? `scale(${descriptor.crop.scale})` : null,
  ].filter(Boolean);

  return (
    // Raw transparent assets preserve Castlery's exact artwork and mirroring.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      aria-hidden="true"
      className={`pointer-events-none shrink-0 object-contain ${
        compact ? "h-8 w-14" : "h-8 w-[82%]"
      }`}
      data-fallback={descriptor.fallback ? "true" : "false"}
      decoding="async"
      draggable={false}
      loading="lazy"
      src={descriptor.src}
      style={{
        objectPosition: descriptor.crop?.objectPosition,
        transform: transforms.length ? transforms.join(" ") : undefined,
      }}
    />
  );
}

function CastleryConfigurationSelector({
  family,
  variantSection,
  orientationOptions,
  actions,
}: {
  family: CastleryConfigurationFamily;
  variantSection: VariantSectionState;
  orientationOptions: ProductTargetOption[];
  actions: ProductModelVariantControlsActions;
}) {
  const activeOption =
    variantSection.options.find((option) => option.active) ??
    variantSection.options[0];
  const activeGroupKey = castleryConfigurationGroup(family, activeOption);
  const visibleGroups = CASTLERY_CONFIGURATION_GROUPS[family]
    .map((group) => ({
      ...group,
      options: variantSection.options.filter(
        (option) => castleryConfigurationGroup(family, option) === group.key
      ),
    }))
    .filter((group) => group.options.length > 0);
  const activeGroup =
    visibleGroups.find((group) => group.key === activeGroupKey) ??
    visibleGroups[0];

  return (
    <div className="pt-3" data-testid={`${family}-configuration-selector`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className={sectionHeadingClass}>Configuration</div>
        <div className="text-xs text-neutral-500">
          {variantSection.options.length} configurations
        </div>
      </div>

      <div className="mt-2 text-sm font-semibold leading-snug text-neutral-900">
        {castleryConfigurationLabel(family, activeOption)}
      </div>
      <div className="mt-0.5 text-xs text-neutral-500">Select a layout below</div>

      <SegmentedControl
        label="Configuration type"
        size="compact"
        fill
        className="mt-2"
        value={activeGroup?.key ?? null}
        onChange={(groupKey) => {
          const firstOption = visibleGroups.find((group) => group.key === groupKey)?.options[0];
          if (groupKey !== activeGroup?.key && firstOption?.productId) {
            actions.onSelectModel(firstOption.productId, castleryConfigurationLabel(family, firstOption));
          }
        }}
        options={visibleGroups.map((group) => ({
          value: group.key,
          label: group.label,
          testId: `${family}-config-tab-${group.key}`,
          disabled: group.options[0].disabled,
        }))}
      />

      <div
        className="grid grid-cols-4 gap-1.5 mt-2"
        data-testid={`${family}-configuration-grid`}
      >
        {activeGroup?.options.map((option) => {
          const label = castleryConfigurationLabel(family, option);

          return (
            <ChoiceTile
              key={option.key}
              selected={option.active}
              aria-label={`Select ${label}`}
              title={label}
              data-testid={`${family}-config-option-${option.key}`}
              data-active={option.active ? "true" : "false"}
              className="flex h-12 min-w-0 items-center justify-center"
              disabled={option.disabled}
              onClick={() => {
                if (option.productId) {
                  actions.onSelectModel(option.productId, label);
                }
              }}
            >
              <CastleryConfigurationDiagram productId={String(option.productId ?? "")} />
              <span className="sr-only">{label}</span>
            </ChoiceTile>
          );
        })}
      </div>

      {orientationOptions.length ? (
        <div className="mt-3" data-testid={`${family}-orientation-selector`}>
          <div className={`mb-2 ${sectionHeadingClass}`}>Orientation</div>
          <div className="grid grid-cols-2 gap-2">
            {orientationOptions.map((option) => {
              const isRightFacing = /right/i.test(option.label);

              return (
                <ChoiceTile
                  key={option.key}
                  selected={option.active}
                  data-testid={`${family}-orientation-${isRightFacing ? "right" : "left"}`}
                  data-active={option.active ? "true" : "false"}
                  className="flex min-h-[4.5rem] items-center justify-center gap-1 overflow-hidden px-2 py-2 text-xs font-semibold"
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.productId) {
                      actions.onSelectOrientation(option.productId, option.label);
                    }
                  }}
                  title={option.title}
                >
                  <CastleryConfigurationDiagram productId={String(option.productId ?? "")} compact />
                  <span className="whitespace-nowrap">{option.label}</span>
                </ChoiceTile>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ProductModelVariantControls({
  state,
  actions,
}: ProductModelVariantControlsProps) {
  const castleryConfigurationFamily = getCastleryConfigurationFamily(
    state.variantSection
  );
  const castleryVariantSection = castleryConfigurationFamily
    ? state.variantSection
    : null;
  const activeCastleryConfigurationGroup =
    castleryConfigurationFamily && castleryVariantSection
      ? castleryConfigurationGroup(
          castleryConfigurationFamily,
          castleryVariantSection.options.find((option) => option.active) ??
            castleryVariantSection.options[0]
        )
      : null;

  return (
    <>
      {state.orientationOptions.length && !castleryVariantSection ? (
        <div className="pt-3">
          <div className={sectionHeadingClass}>Orientation</div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {state.orientationOptions.map((option) => (
              <ChoiceTile
                key={option.key}
                selected={option.active}
                className="px-3 py-2 text-sm"
                disabled={option.disabled}
                onClick={() => {
                  if (option.productId) actions.onSelectOrientation(option.productId, option.label);
                }}
                title={option.title}
              >
                {option.label}
              </ChoiceTile>
            ))}
          </div>
        </div>
      ) : null}

      {state.jaronConfiguration ? (
        <JaronConfigurationSelector
          state={state.jaronConfiguration}
          actions={actions.jaron}
        />
      ) : null}

      {state.auburnConfiguration ? (
        <AuburnConfigurationSelector
          state={state.auburnConfiguration}
          actions={actions.auburn}
        />
      ) : null}

      {state.armStyleOptions.length ? (
        <div className="pt-3">
          <div className={sectionHeadingClass}>Variant</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {state.armStyleOptions.map((option) => (
              <ChoiceTile
                key={option.key}
                selected={option.active}
                className="px-3 py-2 text-sm"
                disabled={option.disabled}
                onClick={() => {
                  if (option.productId) actions.onSelectArmStyle(option.productId, option.label);
                }}
                title={option.title}
              >
                {option.label}
              </ChoiceTile>
            ))}
          </div>
        </div>
      ) : null}

      {castleryVariantSection && castleryConfigurationFamily ? (
        <CastleryConfigurationSelector
          family={castleryConfigurationFamily}
          variantSection={castleryVariantSection}
          orientationOptions={state.orientationOptions}
          actions={actions}
        />
      ) : state.variantSection ? (
        <div className="pt-2">
          <div className={sectionHeadingClass}>{state.variantSection.label}</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {state.variantSection.options.map((option) => {
              const swatch =
                state.variantSection?.kind === "sloane-bench" ||
                state.variantSection?.kind === "variant";

              return (
                <ChoiceTile
                  key={option.key}
                  selected={option.active}
                  data-testid={option.testId}
                  data-active={option.testId ? (option.active ? "true" : "false") : undefined}
                  className={swatch ? "flex items-center gap-2 px-3 py-2 text-sm" : "px-3 py-2 text-sm"}
                  disabled={option.disabled}
                  onClick={() => {
                    switch (state.variantSection?.kind) {
                      case "model":
                        if (option.productId) actions.onSelectModel(option.productId, option.label);
                        break;
                      case "shape":
                        if (option.productId) actions.onSelectShape(option.productId, option.label);
                        break;
                      case "length":
                        if (option.productId) {
                          actions.onSelectLengthVariant(option.productId, option.label);
                        }
                        break;
                      case "sloane-bench":
                        if (option.cushion) {
                          actions.onSelectSloaneBenchCushion(option.cushion, option.label);
                        }
                        break;
                      case "variant":
                        if (option.variantId) actions.onSelectVariant(option.variantId);
                        break;
                    }
                  }}
                  title={option.title || undefined}
                >
                  {swatch ? (
                    <span
                      className="h-5 w-5 rounded-full border"
                      style={{ background: option.colorHex }}
                    />
                  ) : null}
                  {option.label}
                </ChoiceTile>
              );
            })}
          </div>
        </div>
      ) : null}

      {state.sloaneBenchMaterial ? (
        <div className="pt-3" data-testid="selected-sloane-bench-material-section">
          <div className={sectionHeadingClass}>Material</div>
          <div
            className="mt-2 text-xs text-neutral-600"
            data-testid="selected-sloane-bench-material-label"
          >
            Selected: {state.sloaneBenchMaterial.label}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <div
              className="shrink-0 h-20 w-20 rounded-sm bg-cover bg-center"
              data-testid="selected-sloane-bench-material-swatch"
              role="img"
              aria-label={`${state.sloaneBenchMaterial.label} leather swatch`}
              style={{
                backgroundColor: state.sloaneBenchMaterial.colorHex,
                backgroundImage: state.sloaneBenchMaterial.swatchTextureUrl
                  ? `url(${state.sloaneBenchMaterial.swatchTextureUrl})`
                  : undefined,
                boxShadow: "0 0 0 2px #fff, 0 0 0 4px #171717",
              }}
            />
          </div>
        </div>
      ) : null}

      {state.lengthOptions.length ? (
        <div className="pt-3">
          <div className={sectionHeadingClass}>Length</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {state.lengthOptions.map((option) => (
              <ChoiceTile
                key={option.key}
                selected={option.active}
                className="px-3 py-2 text-sm"
                disabled={option.disabled}
                onClick={() => {
                  if (option.productId) actions.onSelectLength(option.productId, option.label);
                }}
                title={option.title}
              >
                {option.label}
              </ChoiceTile>
            ))}
          </div>
        </div>
      ) : null}

      {state.huggModelOptions.length ? (
        <div className="pt-3">
          <div className={sectionHeadingClass}>Model</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {state.huggModelOptions.map((option) => (
              <ChoiceTile
                key={option.key}
                selected={option.active}
                className="px-3 py-2 text-sm"
                data-testid={`hugg-model-option-${option.key}`}
                disabled={option.disabled}
                onClick={() => {
                  if (option.productId) actions.onSelectHuggModel(option.productId, option.label);
                }}
                title={option.title}
              >
                {option.label}
              </ChoiceTile>
            ))}
          </div>
        </div>
      ) : null}

      {state.sebModelOptions.length ? (
        <div className="pt-3">
          <div className={sectionHeadingClass}>Model</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {state.sebModelOptions.map((option) => (
              <ChoiceTile
                key={option.key}
                selected={option.active}
                className="px-3 py-2 text-sm"
                data-testid={`seb-model-option-${option.key}`}
                data-active={option.active ? "true" : "false"}
                disabled={option.disabled}
                onClick={() => {
                  if (option.productId) actions.onSelectSebModel(option.productId, option.label);
                }}
                title={option.title}
              >
                {option.label}
              </ChoiceTile>
            ))}
          </div>
        </div>
      ) : null}

      {state.layout &&
      (!castleryVariantSection || activeCastleryConfigurationGroup === "sleeper") ? (
        <div className="pt-3">
          <div className={sectionHeadingClass}>{state.layout.label}</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {state.layout.options.map((option) => (
              <ChoiceTile
                key={`config-${option.code}`}
                selected={option.active}
                className="px-3 py-2 text-sm"
                disabled={option.disabled}
                onClick={() => actions.onSelectLayout(option.code, option.label)}
              >
                {option.label}
              </ChoiceTile>
            ))}
          </div>

          {state.layout.helperText ? (
            <div className="mt-2 text-xs text-neutral-600">
              {state.layout.helperText}
            </div>
          ) : null}

          {state.layout.recommendedPlanningSize ? (
            <div className="mt-2 text-xs text-neutral-600">
              Recommended planning size: {state.layout.recommendedPlanningSize}
            </div>
          ) : null}

          {state.layout.visualFootprint ? (
            <div className="mt-1 text-xs text-neutral-600">
              Visual footprint: {state.layout.visualFootprint}
            </div>
          ) : null}

          {state.layout.estimationNote ? (
            <div className="mt-2 text-xs text-neutral-600">
              {state.layout.estimationNote}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
