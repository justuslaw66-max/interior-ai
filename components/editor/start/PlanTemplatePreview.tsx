"use client";

import type { HousePlanTemplate, HousePlanTemplateFurnishingPackId } from "@/lib/design-page-house-plan";
import {
  fitPlanThumbnail,
  PLAN_THUMBNAIL_DEFAULT_FILL,
  PLAN_THUMBNAIL_HEIGHT,
  PLAN_THUMBNAIL_ROOM_FILLS,
  PLAN_THUMBNAIL_WIDTH,
} from "@/lib/plan-thumbnail-frame";

/** The furniture's dots, from the plan tokens (dark mode PR 4). */
const MARKER_FILLS: Record<string, string> = {
  sofa: "var(--plan-marker-seat)",
  accent_chair: "var(--plan-marker-seat)",
  dining_table: "var(--plan-marker-table)",
  dining_bench: "var(--plan-marker-table)",
  rug: "var(--plan-marker-rug)",
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
      className="block h-[140px] w-full bg-plan-paper"
    >
      {template.rooms.map((room) => (
        <rect
          key={room.id}
          x={frame.x(room.x - room.width / 2)}
          y={frame.y(room.z - room.depth / 2)}
          width={room.width * frame.scale}
          height={room.depth * frame.scale}
          style={{ fill: PLAN_THUMBNAIL_ROOM_FILLS[room.roomType] ?? PLAN_THUMBNAIL_DEFAULT_FILL }}
          className="stroke-plan-line"
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
            style={{ fill: MARKER_FILLS[intent.category] ?? "var(--plan-marker)" }}
            fillOpacity={intent.category === "rug" ? 0.35 : 0.85}
          />
        );
      })}
    </svg>
  );
}
