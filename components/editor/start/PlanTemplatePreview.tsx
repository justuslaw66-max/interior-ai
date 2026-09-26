"use client";

import type { HousePlanTemplate, HousePlanTemplateFurnishingPackId } from "@/lib/design-page-house-plan";
import {
  fitPlanThumbnail,
  PLAN_THUMBNAIL_DEFAULT_FILL,
  PLAN_THUMBNAIL_HEIGHT,
  PLAN_THUMBNAIL_ROOM_FILLS,
  PLAN_THUMBNAIL_WIDTH,
} from "@/lib/plan-thumbnail-frame";

const MARKER_FILLS: Record<string, string> = {
  sofa: "#2563eb",
  accent_chair: "#2563eb",
  dining_table: "#d97706",
  dining_bench: "#d97706",
  rug: "#14b8a6",
};

function planFrame(template: HousePlanTemplate) {
  return fitPlanThumbnail(
    template.rooms.flatMap((room) => [
      { x: room.x - room.width / 2, z: room.z - room.depth / 2 },
      { x: room.x + room.width / 2, z: room.z + room.depth / 2 },
    ])
  );
}

type PlanTemplatePreviewProps = {
  template: HousePlanTemplate;
  /** The furniture pack to sketch in, for the Furnished choice. */
  furnishingPackId?: HousePlanTemplateFurnishingPackId | null;
};

/** A small drawing of a template's rooms, and of its furniture when Furnished is chosen. */
export function PlanTemplatePreview({ template, furnishingPackId = null }: PlanTemplatePreviewProps) {
  const frame = planFrame(template);
  const pack = furnishingPackId
    ? template.furnishingPacks.find((entry) => entry.id === furnishingPackId)
    : undefined;
  return (
    <svg
      viewBox={`0 0 ${PLAN_THUMBNAIL_WIDTH} ${PLAN_THUMBNAIL_HEIGHT}`}
      aria-hidden="true"
      data-testid={`start-template-preview-${template.id}`}
      className="block h-[140px] w-full bg-[#f6f5f1]"
    >
      {template.rooms.map((room) => (
        <rect
          key={room.id}
          x={frame.x(room.x - room.width / 2)}
          y={frame.y(room.z - room.depth / 2)}
          width={room.width * frame.scale}
          height={room.depth * frame.scale}
          fill={PLAN_THUMBNAIL_ROOM_FILLS[room.roomType] ?? PLAN_THUMBNAIL_DEFAULT_FILL}
          stroke="#78716c"
          strokeWidth="1.5"
        />
      ))}
      {pack?.intents.map((intent) => {
        const room = template.rooms.find((entry) => entry.id === intent.roomId);
        if (!room) return null;
        return (
          <circle
            key={intent.id}
            cx={frame.x(room.x + intent.x)}
            cy={frame.y(room.z + intent.z)}
            r={intent.category === "rug" ? 4 : 2.6}
            fill={MARKER_FILLS[intent.category] ?? "#1c1917"}
            fillOpacity={intent.category === "rug" ? 0.35 : 0.85}
          />
        );
      })}
    </svg>
  );
}
