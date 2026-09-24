"use client";

import type { HousePlanTemplate, HousePlanTemplateFurnishingPackId } from "@/lib/design-page-house-plan";
import type { RoomType } from "@/lib/room-types";

const VIEW_WIDTH = 240;
const VIEW_HEIGHT = 140;
const PADDING = 12;
const ROOM_FILLS: Partial<Record<RoomType, string>> = {
  toilet: "#dbeafe",
  kitchen: "#dcfce7",
  bedroom: "#ede9fe",
  dining: "#fef3c7",
};
const MARKER_FILLS: Record<string, string> = {
  sofa: "#2563eb",
  accent_chair: "#2563eb",
  dining_table: "#d97706",
  dining_bench: "#d97706",
  rug: "#14b8a6",
};

function planFrame(template: HousePlanTemplate) {
  const left = Math.min(...template.rooms.map((room) => room.x - room.width / 2));
  const right = Math.max(...template.rooms.map((room) => room.x + room.width / 2));
  const top = Math.min(...template.rooms.map((room) => room.z - room.depth / 2));
  const bottom = Math.max(...template.rooms.map((room) => room.z + room.depth / 2));
  const width = Math.max(1, right - left);
  const depth = Math.max(1, bottom - top);
  const scale = Math.min((VIEW_WIDTH - PADDING * 2) / width, (VIEW_HEIGHT - PADDING * 2) / depth);
  return {
    scale,
    x: (value: number) => (VIEW_WIDTH - width * scale) / 2 + (value - left) * scale,
    y: (value: number) => (VIEW_HEIGHT - depth * scale) / 2 + (value - top) * scale,
  };
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
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
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
          fill={ROOM_FILLS[room.roomType] ?? "#e7e5e4"}
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
