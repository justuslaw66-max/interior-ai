"use client";

import { createPortal } from "react-dom";

type FinishOption = {
  key: string;
  label: string;
  variantId: string;
  productId: string;
  colorHex: string;
  swatchTextureUrl: string | null;
  active: boolean;
};

type SwatchOption = {
  key: string;
  label: string;
  variantId: string;
  colorHex: string;
  swatchTextureUrl: string | null;
  active: boolean;
  disabled: boolean;
};

type StructuredColourOption = {
  variantId: string;
  label: string;
  colorHex: string;
  swatchTextureUrl: string | null;
  active: boolean;
  hovered: boolean;
  estimatedPreviewHeight: number;
};

type MaterialPreviewState = {
  x: number;
  y: number;
  visible: boolean;
  colorHex: string;
  swatchTextureUrl: string | null;
  title: string;
  subtitle: string | null;
  tags: string[];
  finishCode: string | null;
  compositionHeading: string | null;
  composition: string | null;
  care: string | null;
};

export type ProductFinishControlsState = {
  finish: {
    label: string;
    selectedLabel: string | null;
    layout: "swatches" | "compact-buttons" | "buttons";
    options: FinishOption[];
  } | null;
  legFinish: {
    selectedLabel: string;
    options: SwatchOption[];
  } | null;
  singleWoodFinish: {
    sectionLabel: string;
    label: string;
    colorHex: string;
    swatchTextureUrl: string | null;
  } | null;
  sloaneBench: {
    selectedLabel: string;
    options: Array<{
      key: "no" | "leather";
      label: string;
      active: boolean;
      disabled: boolean;
    }>;
  } | null;
  size: {
    options: Array<{
      key: string;
      label: string;
      variantId: string;
      active: boolean;
      disabled: boolean;
    }>;
  } | null;
  structuredColour: {
    label: string;
    selectedLabel: string | null;
    preview: MaterialPreviewState | null;
    groups: Array<{
      key: string;
      label: string | null;
      helperText: string | null;
      options: StructuredColourOption[];
    }>;
  } | null;
};

export type ProductFinishControlsActions = {
  onSelectFinishButton: (key: string, label: string, variantId: string) => void;
  onSelectFinishSwatch: (
    key: string,
    label: string,
    variantId: string,
    productId: string,
  ) => void;
  onSelectLegFinish: (variantId: string, label: string) => void;
  onSelectSloaneBenchCushion: (key: "no" | "leather", label: string) => void;
  onSelectSize: (variantId: string, label: string) => void;
  onSelectStructuredColour: (variantId: string, label: string) => void;
  onShowStructuredColourPreview: (
    variantId: string,
    target: HTMLButtonElement,
    estimatedHeight: number,
  ) => void;
  onHideStructuredColourPreview: (variantId: string) => void;
  onBlurStructuredColourPreview: (variantId: string) => void;
};

type ProductFinishControlsProps = {
  state: ProductFinishControlsState;
  configuration: {
    dark: boolean;
  };
  actions: ProductFinishControlsActions;
};

function sectionHeadingClass(dark: boolean): string {
  return dark
    ? "designer-text-primary text-sm font-semibold"
    : "text-sm font-semibold text-neutral-900";
}

function selectedLabelClass(dark: boolean): string {
  return dark
    ? "designer-text-secondary mt-2 text-xs"
    : "mt-2 text-xs text-neutral-600";
}

export function ProductFinishControls({
  state,
  configuration,
  actions,
}: ProductFinishControlsProps) {
  const { dark } = configuration;

  return (
    <>
      {state.finish ? (
        <div className="pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className={sectionHeadingClass(dark)}>{state.finish.label}</div>
          </div>

          {state.finish.selectedLabel ? (
            <div className={selectedLabelClass(dark)}>
              Selected: {state.finish.selectedLabel}
            </div>
          ) : null}

          <div
            className={
              state.finish.layout === "swatches"
                ? "mt-2 flex flex-wrap gap-2"
                : state.finish.layout === "compact-buttons"
                  ? "mt-2 grid grid-cols-3 gap-2"
                  : "mt-2 grid grid-cols-2 gap-3"
            }
          >
            {state.finish.options.map((option) =>
              state.finish?.layout === "swatches" ? (
                <button
                  key={option.key}
                  className="shrink-0 h-20 w-20 rounded-sm bg-cover bg-center transition-all"
                  style={{
                    backgroundColor: option.colorHex,
                    backgroundImage: option.swatchTextureUrl
                      ? `url(${option.swatchTextureUrl})`
                      : undefined,
                    boxShadow: option.active
                      ? "0 0 0 2px #fff, 0 0 0 4px #5a2135"
                      : "none",
                  }}
                  onClick={() =>
                    actions.onSelectFinishSwatch(
                      option.key,
                      option.label,
                      option.variantId,
                      option.productId,
                    )
                  }
                  title={option.label}
                  aria-label={`Select fabric colour ${option.label}`}
                />
              ) : (
                <button
                  key={option.key}
                  className={`w-full border transition ${
                    state.finish?.layout === "compact-buttons"
                      ? "min-h-12 rounded-lg px-2 py-2 text-sm leading-tight"
                      : "rounded-2xl px-4 py-1 text-base"
                  } ${
                    option.active
                      ? "border-[#4b1427] bg-[#4b1427] text-white"
                      : "border-neutral-300 bg-white text-[#4b2635]"
                  }`}
                  onClick={() =>
                    actions.onSelectFinishButton(option.key, option.label, option.variantId)
                  }
                  title={option.label}
                >
                  {option.label}
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}

      {state.legFinish ? (
        <div className="pt-3" data-testid="selected-leg-finish-section">
          <div className={sectionHeadingClass(dark)}>Wood colour</div>
          <div
            className={selectedLabelClass(dark)}
            data-testid="selected-leg-finish-label"
          >
            Selected: {state.legFinish.selectedLabel}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.legFinish.options.map((option) => (
              <button
                key={`leg-finish-${option.key}`}
                data-testid={`leg-finish-swatch-${option.key}`}
                data-active={option.active ? "true" : "false"}
                className="shrink-0 h-20 w-20 rounded-sm bg-cover bg-center transition-all"
                disabled={option.disabled}
                style={{
                  backgroundColor: option.colorHex,
                  backgroundImage: option.swatchTextureUrl
                    ? `url(${option.swatchTextureUrl})`
                    : undefined,
                  boxShadow: option.active
                    ? "0 0 0 2px #fff, 0 0 0 4px #5a2135"
                    : "none",
                }}
                onClick={() => actions.onSelectLegFinish(option.variantId, option.label)}
                title={option.label}
                aria-label={`Select wood colour ${option.label}`}
              />
            ))}
          </div>
        </div>
      ) : null}

      {state.singleWoodFinish ? (
        <div className="pt-3" data-testid="selected-single-finish-section">
          <div className={sectionHeadingClass(dark)}>
            {state.singleWoodFinish.sectionLabel}
          </div>
          <div
            className={selectedLabelClass(dark)}
            data-testid="selected-single-finish-label"
          >
            Selected: {state.singleWoodFinish.label}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <div
              className="shrink-0 h-20 w-20 rounded-sm bg-cover bg-center"
              data-testid="selected-single-finish-swatch"
              role="img"
              aria-label={`${state.singleWoodFinish.label} wood swatch`}
              style={{
                backgroundColor: state.singleWoodFinish.colorHex,
                backgroundImage: state.singleWoodFinish.swatchTextureUrl
                  ? `url(${state.singleWoodFinish.swatchTextureUrl})`
                  : undefined,
                boxShadow: "0 0 0 2px #fff, 0 0 0 4px #5a2135",
              }}
            />
          </div>
        </div>
      ) : null}

      {state.sloaneBench ? (
        <div className="pt-3" data-testid="selected-sloane-bench-variant-section">
          <div className={sectionHeadingClass(dark)}>Variant</div>
          <div className={selectedLabelClass(dark)}>
            Selected: {state.sloaneBench.selectedLabel}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.sloaneBench.options.map((option) => (
              <button
                key={`variant-swatch-sloane-bench-${option.key}`}
                data-testid={`variant-swatch-sloane-bench-${option.key}`}
                data-active={option.active ? "true" : "false"}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  dark ? "designer-text-primary" : "text-neutral-900"
                } ${option.active ? "designer-accent-border" : "border-neutral-200"}`}
                disabled={option.disabled}
                onClick={() =>
                  actions.onSelectSloaneBenchCushion(option.key, option.label)
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {state.size ? (
        <div className="pt-3">
          <div className={sectionHeadingClass(dark)}>Size</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {state.size.options.map((option) => (
              <button
                key={option.key}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  dark ? "designer-text-primary" : "text-neutral-900"
                } ${option.active ? "designer-accent-border" : "border-neutral-200"}`}
                disabled={option.disabled}
                onClick={() => actions.onSelectSize(option.variantId, option.label)}
                title={option.label}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {state.structuredColour ? (
        <div className="pt-3">
          <div className={sectionHeadingClass(dark)}>{state.structuredColour.label}</div>

          {state.structuredColour.selectedLabel ? (
            <div className={selectedLabelClass(dark)}>
              Selected: {state.structuredColour.selectedLabel}
            </div>
          ) : null}

          {state.structuredColour.preview && typeof document !== "undefined"
            ? createPortal(
                <div
                  id="material-swatch-preview"
                  role="tooltip"
                  data-testid="material-swatch-preview"
                  className="pointer-events-none fixed z-[90] overflow-hidden rounded-sm shadow-2xl transition-opacity duration-150 ease-out"
                  style={{
                    left: state.structuredColour.preview.x,
                    top: state.structuredColour.preview.y,
                    width: 320,
                    opacity: state.structuredColour.preview.visible ? 1 : 0,
                  }}
                >
                  <div
                    className="h-44 w-full bg-cover bg-center"
                    style={{
                      backgroundColor: state.structuredColour.preview.colorHex,
                      backgroundImage: state.structuredColour.preview.swatchTextureUrl
                        ? `url(${state.structuredColour.preview.swatchTextureUrl})`
                        : undefined,
                    }}
                  />
                  <div className="space-y-1 bg-white px-4 py-3">
                    <div className="font-serif text-[18px] leading-snug text-[#4b2635]">
                      {state.structuredColour.preview.title}
                    </div>
                    {state.structuredColour.preview.subtitle ? (
                      <div className="text-[12px] text-neutral-600">
                        {state.structuredColour.preview.subtitle}
                      </div>
                    ) : null}
                    {state.structuredColour.preview.tags.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {state.structuredColour.preview.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-sm bg-[#f4f1eb] px-2 py-1 text-[11px] text-[#5b2d3c]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {state.structuredColour.preview.finishCode ? (
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[#8f4b31]">
                        {state.structuredColour.preview.finishCode}
                      </div>
                    ) : null}
                    {state.structuredColour.preview.compositionHeading ? (
                      <>
                        <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-[#8f4b31]">
                          {state.structuredColour.preview.compositionHeading}
                        </div>
                        <div className="text-[12px] leading-snug text-neutral-700">
                          {state.structuredColour.preview.composition}
                        </div>
                        <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[#8f4b31]">
                          Care
                        </div>
                        <div className="text-[12px] leading-snug text-neutral-700">
                          {state.structuredColour.preview.care}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>,
                document.body,
              )
            : null}

          <div className="mt-2 space-y-3">
            {state.structuredColour.groups.map((group) => (
              <div key={group.key}>
                {group.label ? (
                  <div
                    className={
                      dark
                        ? "designer-text-secondary mb-2 text-[15px] font-medium tracking-tight"
                        : "mb-2 text-[15px] font-medium tracking-tight text-[#4b2635]"
                    }
                  >
                    {group.label}
                  </div>
                ) : null}
                {group.helperText ? (
                  <div className="mb-2 text-[13px] text-neutral-600">
                    {group.helperText}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {group.options.map((option) => (
                    <button
                      key={option.variantId}
                      type="button"
                      className="shrink-0 h-20 w-20 rounded-sm bg-cover bg-center transition-all"
                      style={{
                        backgroundColor: option.colorHex,
                        backgroundImage: option.swatchTextureUrl
                          ? `url(${option.swatchTextureUrl})`
                          : undefined,
                        boxShadow: option.active
                          ? "0 0 0 2px #fff, 0 0 0 4px #5a2135"
                          : option.hovered
                            ? "0 0 0 2px #fff, 0 0 0 3px #a0a0a0"
                            : "none",
                      }}
                      onClick={() =>
                        actions.onSelectStructuredColour(option.variantId, option.label)
                      }
                      onMouseEnter={(event) =>
                        actions.onShowStructuredColourPreview(
                          option.variantId,
                          event.currentTarget,
                          option.estimatedPreviewHeight,
                        )
                      }
                      onMouseLeave={() =>
                        actions.onHideStructuredColourPreview(option.variantId)
                      }
                      onFocus={(event) =>
                        actions.onShowStructuredColourPreview(
                          option.variantId,
                          event.currentTarget,
                          option.estimatedPreviewHeight,
                        )
                      }
                      onBlur={() => actions.onBlurStructuredColourPreview(option.variantId)}
                      aria-describedby={
                        option.hovered ? "material-swatch-preview" : undefined
                      }
                      aria-label={`Select ${option.label || "finish"}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
