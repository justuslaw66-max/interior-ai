"use client";

import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { createPortal } from "react-dom";

import { CHOSEN_SWATCH_RING, ChoiceTile } from "@/components/ui/ChoiceTile";

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
  accessibleLabel: string;
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
  actions: ProductFinishControlsActions;
};

const sectionHeadingClass = "text-sm font-semibold text-neutral-900";

const selectedLabelClass = "mt-2 text-xs text-neutral-600";
const HOVERED_SWATCH_RING = "0 0 0 2px #fff, 0 0 0 3px #a0a0a0";
const swatchClass = "shrink-0 h-20 w-20 rounded-sm bg-cover bg-center";

function swatchStyle(colorHex: string, swatchTextureUrl: string | null, ring = "none"): CSSProperties {
  return {
    backgroundColor: colorHex,
    backgroundImage: swatchTextureUrl ? `url(${swatchTextureUrl})` : undefined,
    boxShadow: ring,
  };
}

type FinishSwatchButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed" | "className" | "style"> & {
  colorHex: string;
  swatchTextureUrl: string | null;
  selected: boolean;
  hovered?: boolean;
};

/** A swatch to choose, in its own colour or texture; the chosen one has the ring. */
function FinishSwatchButton({ colorHex, swatchTextureUrl, selected, hovered = false, ...props }: FinishSwatchButtonProps) {
  const ring = selected ? CHOSEN_SWATCH_RING : hovered ? HOVERED_SWATCH_RING : "none";
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`${swatchClass} transition-all`}
      style={swatchStyle(colorHex, swatchTextureUrl, ring)}
      {...props}
    />
  );
}

export function ProductFinishControls({
  state,
  actions,
}: ProductFinishControlsProps) {
  return (
    <>
      {state.finish ? (
        <div className="pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className={sectionHeadingClass}>{state.finish.label}</div>
          </div>

          {state.finish.selectedLabel ? (
            <div className={selectedLabelClass}>
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
                <FinishSwatchButton
                  key={option.key}
                  colorHex={option.colorHex}
                  swatchTextureUrl={option.swatchTextureUrl}
                  selected={option.active}
                  onClick={() => actions.onSelectFinishSwatch(option.key, option.label, option.variantId, option.productId)}
                  title={option.label}
                  aria-label={`Select fabric colour ${option.label}`}
                />
              ) : (
                <ChoiceTile
                  key={option.key}
                  selected={option.active}
                  className={
                    state.finish?.layout === "compact-buttons"
                      ? "min-h-12 w-full px-2 py-2 text-sm leading-tight"
                      : "w-full px-4 py-1 text-base"
                  }
                  onClick={() =>
                    actions.onSelectFinishButton(option.key, option.label, option.variantId)
                  }
                  title={option.label}
                >
                  {option.label}
                </ChoiceTile>
              ),
            )}
          </div>
        </div>
      ) : null}

      {state.legFinish ? (
        <div className="pt-3" data-testid="selected-leg-finish-section">
          <div className={sectionHeadingClass}>Wood colour</div>
          <div
            className={selectedLabelClass}
            data-testid="selected-leg-finish-label"
          >
            Selected: {state.legFinish.selectedLabel}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.legFinish.options.map((option) => (
              <FinishSwatchButton
                key={`leg-finish-${option.key}`}
                data-testid={`leg-finish-swatch-${option.key}`}
                data-active={option.active ? "true" : "false"}
                colorHex={option.colorHex}
                swatchTextureUrl={option.swatchTextureUrl}
                selected={option.active}
                disabled={option.disabled}
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
          <div className={sectionHeadingClass}>
            {state.singleWoodFinish.sectionLabel}
          </div>
          <div
            className={selectedLabelClass}
            data-testid="selected-single-finish-label"
          >
            Selected: {state.singleWoodFinish.label}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <div
              className={swatchClass}
              data-testid="selected-single-finish-swatch"
              role="img"
              aria-label={`${state.singleWoodFinish.label} wood swatch`}
              style={swatchStyle(state.singleWoodFinish.colorHex, state.singleWoodFinish.swatchTextureUrl, CHOSEN_SWATCH_RING)}
            />
          </div>
        </div>
      ) : null}

      {state.sloaneBench ? (
        <div className="pt-3" data-testid="selected-sloane-bench-variant-section">
          <div className={sectionHeadingClass}>Variant</div>
          <div className={selectedLabelClass}>
            Selected: {state.sloaneBench.selectedLabel}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.sloaneBench.options.map((option) => (
              <ChoiceTile
                key={`variant-swatch-sloane-bench-${option.key}`}
                data-testid={`variant-swatch-sloane-bench-${option.key}`}
                data-active={option.active ? "true" : "false"}
                selected={option.active}
                className="px-3 py-2 text-sm"
                disabled={option.disabled}
                onClick={() =>
                  actions.onSelectSloaneBenchCushion(option.key, option.label)
                }
              >
                {option.label}
              </ChoiceTile>
            ))}
          </div>
        </div>
      ) : null}

      {state.size ? (
        <div className="pt-3">
          <div className={sectionHeadingClass}>Size</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {state.size.options.map((option) => (
              <ChoiceTile
                key={option.key}
                selected={option.active}
                className="px-3 py-2 text-sm"
                disabled={option.disabled}
                onClick={() => actions.onSelectSize(option.variantId, option.label)}
                title={option.label}
              >
                {option.label}
              </ChoiceTile>
            ))}
          </div>
        </div>
      ) : null}

      {state.structuredColour ? (
        <div className="pt-3">
          <div className={sectionHeadingClass}>{state.structuredColour.label}</div>

          {state.structuredColour.selectedLabel ? (
            <div className={selectedLabelClass}>
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
                    <div className="text-base font-semibold leading-snug text-neutral-900">
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
                            className="rounded-sm bg-neutral-100 px-2 py-1 text-xs text-neutral-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {state.structuredColour.preview.finishCode ? (
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                        {state.structuredColour.preview.finishCode}
                      </div>
                    ) : null}
                    {state.structuredColour.preview.compositionHeading ? (
                      <>
                        <div className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                          {state.structuredColour.preview.compositionHeading}
                        </div>
                        <div className="text-[12px] leading-snug text-neutral-700">
                          {state.structuredColour.preview.composition}
                        </div>
                        <div className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
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
                  <div className="mb-2 text-[15px] font-medium tracking-tight text-neutral-900">
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
                    <FinishSwatchButton
                      key={option.variantId}
                      colorHex={option.colorHex}
                      swatchTextureUrl={option.swatchTextureUrl}
                      selected={option.active}
                      hovered={option.hovered}
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
                      title={option.accessibleLabel}
                      aria-label={`Select ${option.accessibleLabel || "finish"}`}
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
