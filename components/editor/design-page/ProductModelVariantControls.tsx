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
  configuration: {
    dark: boolean;
  };
};

function sectionHeadingClass(dark: boolean): string {
  return dark
    ? "designer-text-primary text-sm font-semibold"
    : "text-sm font-semibold text-neutral-900";
}

function optionTextClass(dark: boolean): string {
  return dark ? "designer-text-primary" : "text-neutral-900";
}

export function ProductModelVariantControls({
  state,
  actions,
  configuration,
}: ProductModelVariantControlsProps) {
  const { dark } = configuration;

  return (
    <>
      {state.orientationOptions.length ? (
        <div className="pt-3">
          <div className={sectionHeadingClass(dark)}>Orientation</div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {state.orientationOptions.map((option) => (
              <button
                key={option.key}
                className={`rounded-lg border px-3 py-2 text-sm ${optionTextClass(dark)} ${
                  option.active ? "designer-accent-border" : "border-neutral-200"
                }`}
                disabled={option.disabled}
                onClick={() => {
                  if (option.productId) actions.onSelectOrientation(option.productId, option.label);
                }}
                title={option.title}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {state.jaronConfiguration ? (
        <JaronConfigurationSelector
          state={state.jaronConfiguration}
          configuration={configuration}
          actions={actions.jaron}
        />
      ) : null}

      {state.auburnConfiguration ? (
        <AuburnConfigurationSelector
          state={state.auburnConfiguration}
          configuration={configuration}
          actions={actions.auburn}
        />
      ) : null}

      {state.armStyleOptions.length ? (
        <div className="pt-3">
          <div className={sectionHeadingClass(dark)}>Variant</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {state.armStyleOptions.map((option) => (
              <button
                key={option.key}
                className={`rounded-lg border px-3 py-2 text-sm ${optionTextClass(dark)} ${
                  option.active ? "designer-accent-border" : "border-neutral-200"
                }`}
                disabled={option.disabled}
                onClick={() => {
                  if (option.productId) actions.onSelectArmStyle(option.productId, option.label);
                }}
                title={option.title}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {state.variantSection ? (
        <div className="pt-2">
          <div className={sectionHeadingClass(dark)}>{state.variantSection.label}</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {state.variantSection.options.map((option) => {
              const swatch =
                state.variantSection?.kind === "sloane-bench" ||
                state.variantSection?.kind === "variant";

              return (
                <button
                  key={option.key}
                  data-testid={option.testId}
                  data-active={option.testId ? (option.active ? "true" : "false") : undefined}
                  className={
                    swatch
                      ? `flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${optionTextClass(
                          dark,
                        )} ${
                          option.active ? "designer-accent-border" : "border-neutral-200"
                        }`
                      : `rounded-lg border px-3 py-2 text-sm ${optionTextClass(dark)} ${
                          option.active ? "designer-accent-border" : "border-neutral-200"
                        }`
                  }
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
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {state.sloaneBenchMaterial ? (
        <div className="pt-3" data-testid="selected-sloane-bench-material-section">
          <div className={sectionHeadingClass(dark)}>Material</div>
          <div
            className={
              dark
                ? "designer-text-secondary mt-2 text-xs"
                : "mt-2 text-xs text-neutral-600"
            }
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
                boxShadow: "0 0 0 2px #fff, 0 0 0 4px #5a2135",
              }}
            />
          </div>
        </div>
      ) : null}

      {state.lengthOptions.length ? (
        <div className="pt-3">
          <div className={sectionHeadingClass(dark)}>Length</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {state.lengthOptions.map((option) => (
              <button
                key={option.key}
                className={`rounded-lg border px-3 py-2 text-sm ${optionTextClass(dark)} ${
                  option.active ? "designer-accent-border" : "border-neutral-200"
                }`}
                disabled={option.disabled}
                onClick={() => {
                  if (option.productId) actions.onSelectLength(option.productId, option.label);
                }}
                title={option.title}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {state.huggModelOptions.length ? (
        <div className="pt-3">
          <div className={sectionHeadingClass(dark)}>Model</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {state.huggModelOptions.map((option) => (
              <button
                key={option.key}
                className={`rounded-lg border px-3 py-2 text-sm ${optionTextClass(dark)} ${
                  option.active ? "designer-accent-border" : "border-neutral-200"
                }`}
                data-testid={`hugg-model-option-${option.key}`}
                disabled={option.disabled}
                onClick={() => {
                  if (option.productId) actions.onSelectHuggModel(option.productId, option.label);
                }}
                title={option.title}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {state.sebModelOptions.length ? (
        <div className="pt-3">
          <div className={sectionHeadingClass(dark)}>Model</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {state.sebModelOptions.map((option) => (
              <button
                key={option.key}
                className={`rounded-lg border px-3 py-2 text-sm ${optionTextClass(dark)} ${
                  option.active ? "designer-accent-border" : "border-neutral-200"
                }`}
                data-testid={`seb-model-option-${option.key}`}
                data-active={option.active ? "true" : "false"}
                disabled={option.disabled}
                onClick={() => {
                  if (option.productId) actions.onSelectSebModel(option.productId, option.label);
                }}
                title={option.title}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {state.layout ? (
        <div className="pt-3">
          <div className={sectionHeadingClass(dark)}>{state.layout.label}</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {state.layout.options.map((option) => (
              <button
                key={`config-${option.code}`}
                className={`rounded-lg border px-3 py-2 text-sm ${optionTextClass(dark)} ${
                  option.active ? "designer-accent-border" : "border-neutral-200"
                }`}
                disabled={option.disabled}
                onClick={() => actions.onSelectLayout(option.code, option.label)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {state.layout.helperText ? (
            <div
              className={
                dark
                  ? "designer-text-secondary mt-2 text-xs"
                  : "mt-2 text-xs text-neutral-600"
              }
            >
              {state.layout.helperText}
            </div>
          ) : null}

          {state.layout.recommendedPlanningSize ? (
            <div
              className={
                dark
                  ? "designer-text-secondary mt-2 text-xs"
                  : "mt-2 text-xs text-neutral-600"
              }
            >
              Recommended planning size: {state.layout.recommendedPlanningSize}
            </div>
          ) : null}

          {state.layout.visualFootprint ? (
            <div
              className={
                dark
                  ? "designer-text-secondary mt-1 text-xs"
                  : "mt-1 text-xs text-neutral-600"
              }
            >
              Visual footprint: {state.layout.visualFootprint}
            </div>
          ) : null}

          {state.layout.estimationNote ? (
            <div
              className={
                dark
                  ? "designer-text-secondary mt-2 text-xs"
                  : "mt-2 text-xs text-neutral-600"
              }
            >
              {state.layout.estimationNote}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
