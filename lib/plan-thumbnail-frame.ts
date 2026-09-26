// The plan thumbnails' frame and colours, kept apart from the plan code so client components can
// draw a thumbnail without loading it.
import type { RoomType } from "@/lib/room-types";

type Point = { x: number; z: number };

/** Room colours shared by the template cards (Start a new design) and the My designs cards. */
export const PLAN_THUMBNAIL_ROOM_FILLS: Partial<Record<RoomType, string>> = {
  toilet: "#dbeafe",
  kitchen: "#dcfce7",
  bedroom: "#ede9fe",
  dining: "#fef3c7",
};
export const PLAN_THUMBNAIL_DEFAULT_FILL = "#e7e5e4";
export const PLAN_THUMBNAIL_WIDTH = 240;
export const PLAN_THUMBNAIL_HEIGHT = 140;
const PADDING = 12;

export type DesignPlanThumbnail = {
  rooms: Array<{ id: string; points: string; fill: string }>;
};

/** Scales plan metres into the thumbnail, centred, keeping the plan's proportions. */
export function fitPlanThumbnail(points: readonly Point[]) {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const left = Math.min(...xs);
  const top = Math.min(...zs);
  const width = Math.max(1, Math.max(...xs) - left);
  const depth = Math.max(1, Math.max(...zs) - top);
  const scale = Math.min((PLAN_THUMBNAIL_WIDTH - PADDING * 2) / width, (PLAN_THUMBNAIL_HEIGHT - PADDING * 2) / depth);
  return {
    scale,
    x: (value: number) => (PLAN_THUMBNAIL_WIDTH - width * scale) / 2 + (value - left) * scale,
    y: (value: number) => (PLAN_THUMBNAIL_HEIGHT - depth * scale) / 2 + (value - top) * scale,
  };
}
