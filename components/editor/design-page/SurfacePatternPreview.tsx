import type { RoomFloorPattern } from "@/lib/room-types";
import { getSurfacePatternPreviewTiles } from "@/lib/design-page-surface-inspector";
import { getChevronLayout, getChevronPiecePolygons } from "@/lib/surface-chevron-layout";

// Tabulae's chevron proportions (150 x 850 mm, 70.7 mm end cuts) in the 60 x 42 preview, moved up 7 so that a band
// line crosses the middle.
const PREVIEW_CHEVRON = getChevronLayout({ pieceWidth: 6, pieceLength: 34, endOffset: 2.83 });
const PREVIEW_CHEVRON_PIECES = PREVIEW_CHEVRON ? getChevronPiecePolygons(PREVIEW_CHEVRON, 60, 49) : [];

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
      {pattern === "chevron" && PREVIEW_CHEVRON_PIECES.map((piece) => (
        <polygon
          key={`chevron-${piece.band}-${piece.piece}`}
          points={piece.points.map(([x, y]) => `${x},${y - 7}`).join(" ")}
          fill={piece.piece % 2 === 0 ? fill : shadedFill}
          stroke={stroke}
          strokeWidth="0.75"
        />
      ))}
      {pattern !== "chevron" && getSurfacePatternPreviewTiles(pattern).map((tile, index) => (
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
