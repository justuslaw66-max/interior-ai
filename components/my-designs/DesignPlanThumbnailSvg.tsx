import {
  PLAN_THUMBNAIL_HEIGHT,
  PLAN_THUMBNAIL_WIDTH,
  type DesignPlanThumbnail,
} from "@/lib/plan-thumbnail-frame";

/** A saved design's rooms, drawn small for its card; an empty frame when it has none. */
export function DesignPlanThumbnailSvg({ thumbnail }: { thumbnail: DesignPlanThumbnail | null }) {
  return (
    <svg viewBox={`0 0 ${PLAN_THUMBNAIL_WIDTH} ${PLAN_THUMBNAIL_HEIGHT}`} aria-hidden="true"
      data-testid="my-design-thumbnail" className="block h-[150px] w-full bg-[#f6f5f1]">
      {thumbnail?.rooms.map((room) => (
        <polygon key={room.id} points={room.points} fill={room.fill} stroke="#78716c" strokeWidth="1.5"
          strokeLinejoin="round" />
      ))}
    </svg>
  );
}
