import type { RoomOpening2D } from "@/lib/editorScene";
import {
  ROOM_DIMENSION_DEFAULTS,
  buildHouseRoomDoorwaySuggestions,
  type HousePlanRoom2D,
  type HouseRoomDoorwaySuggestion,
} from "@/lib/design-page-house-plan";

export const SUPPORTED_FLOOR_PLAN_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

export const FLOOR_GROUT_COLOR_PALETTE = [
  "#888888", "#ffffff", "#e9e8e1", "#b2b1ae", "#444442", "#1c1d1f",
  "#fbf8f1", "#eee6d4", "#e6d5a4", "#d9b66e", "#8a6b45", "#c6bdaf",
  "#b2a39d", "#95877f", "#66564f", "#442b16", "#c7aea4", "#967a76",
  "#52484d", "#897481", "#b8b7c4", "#9ea8b6", "#84939b", "#537084",
  "#687fae", "#33266b", "#d7dad5", "#ccd4b9", "#a6afa5", "#0e3416",
  "#f3ee9e", "#cc8a10", "#a9665f", "#a72f31", "#920000",
] as const;

export const FLOOR_GROUT_SIZE_PRESETS_MM = [1, 1.5, 2, 3, 4, 5] as const;
export const HOUSE_PLAN_RENDERED_WALL_THICKNESS_METERS = 0.025;

const PDF_UNDERLAY_MAX_RENDERED_DIMENSION_PX = 1800;
const PDF_UNDERLAY_MAX_RENDER_SCALE = 2;

export function clampEditorOpacity(value: number): number {
  return Math.max(0.05, Math.min(1, Number.isFinite(value) ? value : 1));
}

export function clampRoomHeightMeters(value: number): number {
  return Math.max(
    ROOM_DIMENSION_DEFAULTS.minRoomHeight,
    Math.min(
      ROOM_DIMENSION_DEFAULTS.maxRoomHeight,
      Number.isFinite(value) ? value : ROOM_DIMENSION_DEFAULTS.roomHeight
    )
  );
}

export function clampSlabThicknessMeters(value: number): number {
  return Math.max(
    ROOM_DIMENSION_DEFAULTS.minSlabThickness,
    Math.min(
      ROOM_DIMENSION_DEFAULTS.maxSlabThickness,
      Number.isFinite(value) ? value : ROOM_DIMENSION_DEFAULTS.slabThickness
    )
  );
}

export function clampWallThicknessMeters(value: number): number {
  return Math.max(
    0.04,
    Math.min(
      0.8,
      Number.isFinite(value) ? value : ROOM_DIMENSION_DEFAULTS.wallThickness
    )
  );
}

export function resolveFloorPlanUploadMimeType(file: File): string {
  if (file.type) return file.type;

  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".pdf")) return "application/pdf";
  return "";
}

export function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Unable to read image dimensions"));
    image.src = src;
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read floor plan file"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read floor plan file"));
    reader.readAsDataURL(file);
  });
}

export function isPersistableFloorPlanAssetUrl(assetUrl: string): boolean {
  return (
    assetUrl.startsWith("data:") ||
    assetUrl.startsWith("/") ||
    assetUrl.startsWith("http://") ||
    assetUrl.startsWith("https://")
  );
}

export async function renderPdfPageToImageDataUrl(
  pdfData: ArrayBuffer,
  pageNumber: number
): Promise<{ dataUrl: string; widthPx: number; heightPx: number; pageCount: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url
  ).toString();

  const data = new Uint8Array(pdfData.slice(0));
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  try {
    const targetPage = Math.min(Math.max(1, pageNumber), pdf.numPages);
    const page = await pdf.getPage(targetPage);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      PDF_UNDERLAY_MAX_RENDER_SCALE,
      PDF_UNDERLAY_MAX_RENDERED_DIMENSION_PX / baseViewport.width,
      PDF_UNDERLAY_MAX_RENDERED_DIMENSION_PX / baseViewport.height
    );
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) throw new Error("Canvas is unavailable");

    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, viewport }).promise;

    return {
      dataUrl: canvas.toDataURL("image/png"),
      widthPx: canvas.width,
      heightPx: canvas.height,
      pageCount: pdf.numPages,
    };
  } finally {
    await loadingTask.destroy();
  }
}

export function resolveUnderlayWorldSize(params: {
  widthPx?: number;
  heightPx?: number;
  planWidthMeters: number;
  planDepthMeters: number;
}): { widthMeters: number; depthMeters: number } {
  const availableWidth = Math.max(params.planWidthMeters, 3);
  const availableDepth = Math.max(params.planDepthMeters, 3);

  if (!params.widthPx || !params.heightPx || params.widthPx <= 0 || params.heightPx <= 0) {
    return { widthMeters: availableWidth, depthMeters: availableDepth };
  }

  const aspect = params.widthPx / params.heightPx;
  let widthMeters = availableWidth;
  let depthMeters = widthMeters / aspect;

  if (depthMeters > availableDepth) {
    depthMeters = availableDepth;
    widthMeters = depthMeters * aspect;
  }

  return {
    widthMeters: Number(widthMeters.toFixed(3)),
    depthMeters: Number(depthMeters.toFixed(3)),
  };
}

export function getPlan2DRoomFitBounds(
  rooms: HousePlanRoom2D[],
  fallbackWidthMeters: number,
  fallbackDepthMeters: number
): { centerX: number; centerZ: number; widthMeters: number; depthMeters: number } {
  if (rooms.length === 0) {
    return {
      centerX: 0,
      centerZ: 0,
      widthMeters: Math.max(0.1, fallbackWidthMeters),
      depthMeters: Math.max(0.1, fallbackDepthMeters),
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const room of rooms) {
    const wallPadding = Math.max(0, room.wallThickness ?? 0) / 2;
    minX = Math.min(minX, room.x - room.w / 2 - wallPadding);
    maxX = Math.max(maxX, room.x + room.w / 2 + wallPadding);
    minZ = Math.min(minZ, room.z - room.d / 2 - wallPadding);
    maxZ = Math.max(maxZ, room.z + room.d / 2 + wallPadding);
  }

  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) {
    return {
      centerX: 0,
      centerZ: 0,
      widthMeters: Math.max(0.1, fallbackWidthMeters),
      depthMeters: Math.max(0.1, fallbackDepthMeters),
    };
  }

  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    widthMeters: Math.max(0.1, maxX - minX),
    depthMeters: Math.max(0.1, maxZ - minZ),
  };
}

export function getDoorwaySuggestionKey(suggestion: HouseRoomDoorwaySuggestion): string {
  return [
    suggestion.roomId,
    suggestion.adjacentRoomId,
    suggestion.wall,
    Math.round((suggestion.offsetMeters * 1000) / 50),
    Math.round((suggestion.widthMeters * 1000) / 50),
  ].join(":");
}

function getWallOffsetCenter(
  room: HousePlanRoom2D,
  wall: RoomOpening2D["wall"],
  offsetMeters: number
) {
  if (wall === "north" || wall === "south") {
    return {
      x: room.x + offsetMeters,
      z: room.z + (wall === "north" ? -room.d / 2 : room.d / 2),
    };
  }

  return {
    x: room.x + (wall === "west" ? -room.w / 2 : room.w / 2),
    z: room.z + offsetMeters,
  };
}

function getDoorwaySuggestionCenter(
  suggestion: HouseRoomDoorwaySuggestion,
  rooms: HousePlanRoom2D[]
) {
  const room = rooms.find((entry) => entry.id === suggestion.roomId);
  return room ? getWallOffsetCenter(room, suggestion.wall, suggestion.offsetMeters) : null;
}

export function getDeletedDoorwaySuggestionKeys(
  opening: Pick<RoomOpening2D, "kind" | "roomId" | "wall" | "offsetMm" | "widthMm">,
  rooms: HousePlanRoom2D[]
) {
  if (opening.kind !== "door") return [];

  const openingRoom = opening.roomId
    ? rooms.find((entry) => entry.id === opening.roomId)
    : null;
  const openingCenter = openingRoom
    ? getWallOffsetCenter(openingRoom, opening.wall, opening.offsetMm / 1000)
    : null;
  const openingWidthMeters = opening.widthMm / 1000;
  const openingOffsetMeters = opening.offsetMm / 1000;
  const centerToleranceMeters = Math.max(0.35, openingWidthMeters / 2);
  const widthToleranceMeters = Math.max(0.45, openingWidthMeters * 0.6);

  const matchingKeys = buildHouseRoomDoorwaySuggestions(rooms)
    .filter((suggestion) => {
      const widthMatches =
        Math.abs(suggestion.widthMeters - openingWidthMeters) <= widthToleranceMeters;

      if (openingCenter) {
        const suggestionCenter = getDoorwaySuggestionCenter(suggestion, rooms);
        if (!suggestionCenter) return false;
        const distance = Math.hypot(
          suggestionCenter.x - openingCenter.x,
          suggestionCenter.z - openingCenter.z
        );
        return widthMatches && distance <= centerToleranceMeters;
      }

      return (
        widthMatches &&
        suggestion.wall === opening.wall &&
        Math.abs(suggestion.offsetMeters - openingOffsetMeters) <= centerToleranceMeters
      );
    })
    .map(getDoorwaySuggestionKey);

  return Array.from(new Set(matchingKeys));
}

export type PlanOverlayDragKind = "opening" | "opening_resize" | "fixed" | "annotation";

export function getPlanOverlayMoveHistoryLabel(kind?: PlanOverlayDragKind): string {
  if (kind === "opening") return "Move opening";
  if (kind === "opening_resize") return "Resize opening";
  if (kind === "fixed") return "Move plan fixture";
  if (kind === "annotation") return "Move annotation";
  return "Move plan overlay";
}
