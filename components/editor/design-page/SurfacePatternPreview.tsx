import type { RoomFloorPattern } from "@/lib/room-types";
import { getSurfacePatternPreviewTiles } from "@/lib/design-page-surface-inspector";

export type SurfacePatternPreviewProps = {
  pattern: RoomFloorPattern;
};

export default function SurfacePatternPreview({
  pattern,
}: SurfacePatternPreviewProps) {
  const background = "#f8fafc";
  const stroke = "#b8bec7";
  const fill = "#ffffff";
  const shadedFill = "#eef0f3";
  const centerFill = "#9ca3af";

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 60 42"
      className="h-full w-full"
      preserveAspectRatio="none"
    >
      <rect x="0" y="0" width="60" height="42" rx="2" fill={background} />
      {getSurfacePatternPreviewTiles(pattern).map((tile, index) => (
        <rect
          key={`${pattern}-${index}`}
          x={tile.x}
          y={tile.y}
          width={tile.width}
          height={tile.height}
          fill={tile.shade ? shadedFill : fill}
          stroke={stroke}
          strokeWidth="1"
        />
      ))}
      <rect x="25" y="17" width="10" height="8" rx="1" fill={centerFill} />
      <circle cx="30" cy="21" r="1.1" fill="#ffffff" opacity="0.9" />
    </svg>
  );
}
