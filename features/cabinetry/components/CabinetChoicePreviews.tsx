import type { ReactNode } from "react";

import type { CabinetFrontHardwareType } from "../catalog/hardware";
import type { DoorStyle } from "../types";

export const CABINET_DOOR_STYLE_LABELS = {
  flat_slab: "Flat slab",
  shaker: "Shaker",
  glass: "Glass",
  fluted: "Fluted",
} as const satisfies Readonly<Record<DoorStyle, string>>;

export const CABINET_FRONT_HARDWARE_LABELS = {
  none: "No handle",
  bar_pull: "Bar pull",
  knob: "Knob",
  edge_pull: "Edge pull",
  push_to_open: "Push-to-open",
} as const satisfies Readonly<Record<CabinetFrontHardwareType, string>>;

type ChoicePreviewAccessibilityProps = {
  /**
   * Omit this when the preview sits inside an already labelled choice button.
   * Supply it only when the preview needs to stand alone as a named image.
   */
  ariaLabel?: string;
  className?: string;
};

export type CabinetDoorStylePreviewProps = ChoicePreviewAccessibilityProps & {
  doorStyle: DoorStyle;
};

export type CabinetHandleTypePreviewProps = ChoicePreviewAccessibilityProps & {
  handleType: CabinetFrontHardwareType;
};

function doorStyleArtwork(doorStyle: DoorStyle): ReactNode {
  switch (doorStyle) {
    case "flat_slab":
      return (
        <>
          <path d="M24 15v50M29 15v50" opacity="0.12" />
          <path d="M51 15v50M56 15v50" opacity="0.08" />
        </>
      );
    case "shaker":
      return (
        <>
          <rect x="24" y="16" width="32" height="48" rx="1.5" opacity="0.78" />
          <rect x="29" y="21" width="22" height="38" rx="1" opacity="0.3" />
        </>
      );
    case "glass":
      return (
        <>
          <rect x="24" y="16" width="32" height="48" rx="1.5" />
          <rect
            x="29"
            y="21"
            width="22"
            height="38"
            rx="1"
            fill="currentColor"
            fillOpacity="0.1"
            strokeOpacity="0.58"
          />
          <path d="M31.5 38 42 23h6.5L36 41.5M31.5 50 49 25" opacity="0.28" />
        </>
      );
    case "fluted":
      return (
        <>
          {[25, 30, 35, 40, 45, 50, 55].map((x) => (
            <path key={x} d={`M${x} 16v48`} opacity={x === 40 ? 0.65 : 0.34} />
          ))}
        </>
      );
  }
}

function handleTypeArtwork(handleType: CabinetFrontHardwareType): ReactNode {
  switch (handleType) {
    case "none":
      return (
        <>
          <path d="M39 13v38" opacity="0.12" />
          <path d="M28 31h24" opacity="0.12" />
        </>
      );
    case "bar_pull":
      return (
        <>
          <path d="M51 22v20" strokeWidth="4" strokeLinecap="round" />
          <path d="M48 24h3M48 40h3" opacity="0.65" />
        </>
      );
    case "knob":
      return (
        <>
          <circle cx="51" cy="32" r="4.5" fill="currentColor" fillOpacity="0.2" />
          <circle cx="51" cy="32" r="2.25" fill="currentColor" stroke="none" />
        </>
      );
    case "edge_pull":
      return (
        <>
          <path d="M45 11h12v5H45z" fill="currentColor" fillOpacity="0.24" />
          <path d="M45 15h12" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M48 18h6" opacity="0.42" />
        </>
      );
    case "push_to_open":
      return (
        <>
          <circle cx="52" cy="32" r="2.5" fill="currentColor" stroke="none" />
          <path d="M59 25a10 10 0 0 1 0 14M63 22a15 15 0 0 1 0 20" opacity="0.5" />
          <path d="m46 28 4 4-4 4M41 32h9" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
  }
}

/** A code-native elevation sketch for a Guided door-style choice. */
export function CabinetDoorStylePreview({
  doorStyle,
  ariaLabel,
  className = "h-16 w-full",
}: CabinetDoorStylePreviewProps) {
  return (
    <svg
      viewBox="0 0 80 80"
      className={className}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      focusable="false"
      data-cabinet-door-style-preview={doorStyle}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      vectorEffect="non-scaling-stroke"
    >
      <rect
        x="19"
        y="10"
        width="42"
        height="60"
        rx="3"
        fill="currentColor"
        fillOpacity="0.055"
      />
      <path d="M19 13h42M19 67h42" opacity="0.2" />
      {doorStyleArtwork(doorStyle)}
    </svg>
  );
}

/** A code-native cabinet-front sketch for a Guided handle/opening choice. */
export function CabinetHandleTypePreview({
  handleType,
  ariaLabel,
  className = "h-12 w-16",
}: CabinetHandleTypePreviewProps) {
  return (
    <svg
      viewBox="0 0 80 64"
      className={className}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      focusable="false"
      data-cabinet-handle-type-preview={handleType}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      vectorEffect="non-scaling-stroke"
    >
      <rect
        x="17"
        y="9"
        width="46"
        height="46"
        rx="3"
        fill="currentColor"
        fillOpacity="0.055"
      />
      <path d="M20 12h40M20 52h40" opacity="0.2" />
      {handleTypeArtwork(handleType)}
    </svg>
  );
}
