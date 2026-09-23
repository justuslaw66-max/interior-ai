export type ExportReadinessStylePreset = "consumer" | "pro";

export type ExportReadinessItem = {
  label: string;
  value: string;
  ready: boolean;
};

type BuildExportReadinessItemsParams = {
  roomCount: number;
  openingCount: number;
  itemCount: number;
  shoppableCount: number;
  hasRoomConnectionBlockers: boolean;
  sceneReady: boolean;
  exportStylePreset: ExportReadinessStylePreset;
};

export function buildExportReadinessItems({
  roomCount,
  openingCount,
  itemCount,
  shoppableCount,
  hasRoomConnectionBlockers,
  sceneReady,
  exportStylePreset,
}: BuildExportReadinessItemsParams): ExportReadinessItem[] {
  return [
    {
      label: "2D plan",
      value: roomCount > 0 ? `${roomCount} room${roomCount === 1 ? "" : "s"}` : "No rooms",
      ready: roomCount > 0,
    },
    {
      label: "Doors/windows",
      value: hasRoomConnectionBlockers
        ? "Review links"
        : openingCount > 0
          ? `${openingCount} placed`
          : "Optional",
      ready: !hasRoomConnectionBlockers,
    },
    {
      label: "Furniture",
      value: itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "Not started",
      ready: itemCount > 0,
    },
    {
      label: "3D views",
      value: sceneReady ? (exportStylePreset === "pro" ? "4 views" : "3 views") : "Loading",
      ready: sceneReady,
    },
    {
      label: "Shopping list",
      value:
        shoppableCount > 0
          ? `${shoppableCount} shoppable`
          : itemCount > 0
            ? "Needs review"
            : "Add furniture",
      ready: shoppableCount > 0,
    },
    {
      label: "PDF",
      value: roomCount > 0 && sceneReady ? "Ready" : "Needs plan",
      ready: roomCount > 0 && sceneReady,
    },
  ];
}

export function getExportReadinessScore(items: ExportReadinessItem[]) {
  const readyCount = items.filter((item) => item.ready).length;
  const score = items.length > 0 ? Math.round((readyCount / items.length) * 100) : 0;

  return {
    readyCount,
    score,
  };
}
