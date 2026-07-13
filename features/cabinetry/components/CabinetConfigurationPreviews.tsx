import type {
  CabinetWallBedDisplayState,
  CabinetWallBedMattressSize,
  CabinetWallBedOrientation,
  CabinetWallBedSideStorage,
} from "../types";

type PreviewAccessibilityProps = {
  ariaLabel?: string;
  className?: string;
};

export type CabinetWallPanelPatternPreviewProps = PreviewAccessibilityProps & {
  columns: number;
  rows: number;
};

export type CabinetDrawerConfigurationPreviewProps = PreviewAccessibilityProps & {
  mode: "equal" | "recommended" | "custom";
  drawerCount: number;
  proportions?: readonly number[];
};

export type CabinetWallBedConfigurationPreviewProps = PreviewAccessibilityProps & {
  mattressSize: CabinetWallBedMattressSize;
  orientation: CabinetWallBedOrientation;
  displayState: CabinetWallBedDisplayState;
  sideStorage: CabinetWallBedSideStorage;
};

function normalizedCount(value: number, maximum: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(maximum, Math.round(value)));
}

/** Small front-elevation diagram used by selectable drawer-height choices. */
export function CabinetDrawerConfigurationPreview({
  mode,
  drawerCount,
  proportions = [],
  ariaLabel,
  className = "h-16 w-full",
}: CabinetDrawerConfigurationPreviewProps) {
  const count = normalizedCount(drawerCount, 8);
  const equalWeights = Array.from({ length: count }, () => 1);
  const recommendedWeights = Array.from({ length: count }, (_, index) =>
    index === 0 ? 1.35 : index === count - 1 ? 0.8 : 1
  );
  const usableCustom =
    proportions.length === count && proportions.every((value) => Number.isFinite(value) && value > 0)
      ? [...proportions]
      : equalWeights;
  const weights = mode === "recommended" ? recommendedWeights : mode === "custom" ? usableCustom : equalWeights;
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  let accumulated = 0;

  return (
    <svg
      viewBox="0 0 80 90"
      className={className}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      focusable="false"
      data-cabinet-drawer-configuration={`${mode}:${count}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      vectorEffect="non-scaling-stroke"
    >
      <rect x="13" y="6" width="54" height="78" rx="3" fill="currentColor" fillOpacity="0.045" />
      {weights.map((weight, index) => {
        const start = accumulated;
        accumulated += weight;
        const y = 6 + (accumulated / weightTotal) * 78;
        const centerY = 6 + ((start + weight / 2) / weightTotal) * 78;
        return (
          <g key={index}>
            {index < weights.length - 1 ? <path d={`M13 ${y}h54`} opacity="0.66" /> : null}
            <path d={`M35 ${centerY}h10`} opacity="0.5" strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}

/** Live elevation sketch for wall-panel row/column decisions. */
export function CabinetWallPanelPatternPreview({
  columns,
  rows,
  ariaLabel,
  className = "h-28 w-full",
}: CabinetWallPanelPatternPreviewProps) {
  const safeColumns = normalizedCount(columns, 10);
  const safeRows = normalizedCount(rows, 8);
  const left = 10;
  const top = 10;
  const width = 100;
  const height = 70;

  return (
    <svg
      viewBox="0 0 120 90"
      className={className}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      focusable="false"
      data-cabinet-wall-panel-pattern={`${safeColumns}x${safeRows}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      vectorEffect="non-scaling-stroke"
    >
      <rect
        x={left}
        y={top}
        width={width}
        height={height}
        rx="3"
        fill="currentColor"
        fillOpacity="0.045"
      />
      {Array.from({ length: safeColumns - 1 }, (_, index) => {
        const x = left + (width * (index + 1)) / safeColumns;
        return <path key={`column-${index}`} d={`M${x} ${top}v${height}`} opacity="0.68" />;
      })}
      {Array.from({ length: safeRows - 1 }, (_, index) => {
        const y = top + (height * (index + 1)) / safeRows;
        return <path key={`row-${index}`} d={`M${left} ${y}h${width}`} opacity="0.68" />;
      })}
      <rect x="14" y="14" width="92" height="62" rx="1.5" opacity="0.2" />
    </svg>
  );
}

const MATTRESS_ASPECT: Record<CabinetWallBedMattressSize, number> = {
  single: 0.48,
  double: 0.66,
  queen: 0.74,
  king: 0.84,
};

/** Semantic closed/deployed elevation for wall-bed configuration choices. */
export function CabinetWallBedConfigurationPreview({
  mattressSize,
  orientation,
  displayState,
  sideStorage,
  ariaLabel,
  className = "h-28 w-full",
}: CabinetWallBedConfigurationPreviewProps) {
  const hasLeftStorage = sideStorage === "left" || sideStorage === "both";
  const hasRightStorage = sideStorage === "right" || sideStorage === "both";
  const storageWidth = 18;
  const centerLeft = 10 + (hasLeftStorage ? storageWidth + 3 : 0);
  const centerRight = 110 - (hasRightStorage ? storageWidth + 3 : 0);
  const centerWidth = centerRight - centerLeft;
  const mattressWidth = centerWidth * MATTRESS_ASPECT[mattressSize];
  const panelWidth = orientation === "vertical" ? mattressWidth : centerWidth * 0.88;
  const panelHeight = orientation === "vertical" ? 62 : 42;
  const panelX = centerLeft + (centerWidth - panelWidth) / 2;
  const panelY = 13;

  return (
    <svg
      viewBox="0 0 120 90"
      className={className}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      focusable="false"
      data-cabinet-wall-bed-preview={`${mattressSize}:${orientation}:${displayState}:${sideStorage}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      vectorEffect="non-scaling-stroke"
    >
      <path d="M7 80h106" opacity="0.28" />
      {hasLeftStorage ? (
        <g opacity="0.72">
          <rect x="10" y="12" width={storageWidth} height="66" rx="2" />
          <path d="M12 32h14M12 52h14" opacity="0.45" />
        </g>
      ) : null}
      {hasRightStorage ? (
        <g opacity="0.72">
          <rect x={110 - storageWidth} y="12" width={storageWidth} height="66" rx="2" />
          <path d={`M${112 - storageWidth} 32h14M${112 - storageWidth} 52h14`} opacity="0.45" />
        </g>
      ) : null}
      {displayState === "closed" ? (
        <g>
          <rect
            x={panelX}
            y={panelY}
            width={panelWidth}
            height={panelHeight}
            rx="2.5"
            fill="currentColor"
            fillOpacity="0.055"
          />
          <path
            d={`M${panelX + panelWidth / 2} ${panelY + 4}v${Math.max(0, panelHeight - 8)}`}
            opacity="0.2"
          />
          <path d={`M${panelX + 7} ${panelY + panelHeight - 7}h${panelWidth - 14}`} opacity="0.35" />
        </g>
      ) : (
        <g>
          <path d={`M${panelX} ${panelY}v45M${panelX + panelWidth} ${panelY}v45`} opacity="0.3" />
          <path d={`M${panelX} 58h${panelWidth}`} strokeWidth="2" />
          <path
            d={`M${panelX} 58l${Math.max(18, panelWidth * 0.28)} 22h${Math.max(
              18,
              panelWidth * 0.72
            )}l${Math.max(18, panelWidth * 0.28)}-22`}
            fill="currentColor"
            fillOpacity="0.06"
          />
          <path d={`M${panelX + 5} 63h${Math.max(12, panelWidth - 10)}`} opacity="0.3" />
        </g>
      )}
    </svg>
  );
}
