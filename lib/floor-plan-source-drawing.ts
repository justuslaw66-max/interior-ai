/** Reference artwork stays in source pixels until a source registration exists. */
export type FloorPlanSourceDrawingGeometryV2 = {
  kind: "source_drawing";
  sourceId: string;
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  textRotationDegrees?: number;
  command: "line" | "cubic" | "quadratic" | "text";
  points: Array<{ x: number; y: number }>;
};

function validPageLength(value: number) {
  return Number.isFinite(value) && value > 0 && value <= 20_000;
}

export function sourceDrawingGeometryError(geometry: FloorPlanSourceDrawingGeometryV2): string | null {
  if (geometry.textRotationDegrees !== undefined &&
    (!Number.isFinite(geometry.textRotationDegrees) || Math.abs(geometry.textRotationDegrees) > 360)) {
    return "Source text rotation must be a finite angle in degrees.";
  }
  const expected = { line: 2, cubic: 4, quadratic: 3, text: 1 }[geometry.command];
  if (!expected || !Array.isArray(geometry.points) || geometry.points.length !== expected) {
    return "Source artwork has an unsupported command or incorrect point count.";
  }
  if (!geometry.sourceId || !Number.isSafeInteger(geometry.pageNumber) || geometry.pageNumber < 1 ||
    ![geometry.widthPx, geometry.heightPx].every(validPageLength)) {
    return "Source artwork requires a source page with bounded pixel dimensions.";
  }
  // PDF curve controls can lie outside the visible page; retain them without clipping.
  if (geometry.points.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
    Math.abs(point.x) > geometry.widthPx * 10 || Math.abs(point.y) > geometry.heightPx * 10)) {
    return "Source artwork coordinates exceed the bounded page range.";
  }
  return null;
}

export function sourceDrawingSvgPath(geometry: FloorPlanSourceDrawingGeometryV2): string {
  const [start, ...points] = geometry.points;
  if (!start) return "";
  const command = { line: "L", cubic: "C", quadratic: "Q", text: "M" }[geometry.command];
  return `M ${start.x} ${start.y}${points.length ? ` ${command} ${points.map((point) => `${point.x} ${point.y}`).join(" ")}` : ""}`;
}

export function sourceDrawingSvgPoints(points: FloorPlanSourceDrawingGeometryV2["points"]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}
