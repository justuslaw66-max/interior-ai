/** Reference artwork stays in source pixels until a source registration exists. */
export type FloorPlanSourceDrawingGeometryV2 = {
  kind: "source_drawing";
  sourceId: string;
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  textRotationDegrees?: number;
  command: "line" | "cubic" | "quadratic" | "text" | "path";
  pathCommands?: Array<"M" | "L" | "C" | "Z">;
  strokeWidthPx?: number;
  fill?: boolean;
  groupId?: string;
  /** The grey it is drawn in (0 black - 255 white), where the trace knows it (the faithful trace). */
  tone?: number;
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
  const commandError = sourceCommandError(geometry) ?? sourceToneError(geometry.tone);
  if (commandError) return commandError;
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
  if (geometry.command === "path") {
    let index = 1, result = `M ${start.x} ${start.y}`;
    for (const c of geometry.pathCommands ?? []) {
      const count = c === "C" ? 3 : c === "Z" ? 0 : 1;
      result += ` ${c} ${geometry.points.slice(index, index + count).map(p => `${p.x} ${p.y}`).join(" ")}`; index += count;
    }
    return result;
  }
  const command = { line: "L", cubic: "C", quadratic: "Q", text: "M" }[geometry.command];
  return `M ${start.x} ${start.y}${points.length ? ` ${command} ${points.map((point) => `${point.x} ${point.y}`).join(" ")}` : ""}`;
}

/** The colour a source shape is drawn in: its own grey where the trace gave one, else the view's own ink. */
export function sourceDrawingInk(geometry: Pick<FloorPlanSourceDrawingGeometryV2, "tone">, fallback: string): string {
  const tone = geometry.tone;
  return tone === undefined ? fallback : `rgb(${tone},${tone},${tone})`;
}

export function sourceDrawingSvgPoints(points: FloorPlanSourceDrawingGeometryV2["points"]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function sourceCommandError(geometry: FloorPlanSourceDrawingGeometryV2): string | null {
  const commands = geometry.pathCommands;
  if (geometry.command === "path" && (!Array.isArray(commands) || commands.length > 4000 || commands.some(c => !["M","L","C","Z"].includes(c)))) return "Invalid source path commands.";
  if (geometry.strokeWidthPx !== undefined && !validStrokeWidth(geometry.strokeWidthPx)) return "Invalid source stroke width.";
  if (geometry.fill !== undefined && typeof geometry.fill !== "boolean") return "Invalid source fill.";
  const expected = geometry.command === "path" ? 1 + (commands ?? []).reduce((n,c) => n + (c === "C" ? 3 : c === "Z" ? 0 : 1), 0) : { line: 2, cubic: 4, quadratic: 3, text: 1 }[geometry.command];
  if (!expected || !Array.isArray(geometry.points) || geometry.points.length !== expected) {
    return "Source artwork has an unsupported command or incorrect point count.";
  }
  return null;
}

const validStrokeWidth = (value:number) => Number.isFinite(value) && value > 0 && value <= 100;

/** A grey, 0 black - 255 white, where the trace gave one. */
function sourceToneError(tone: number | undefined): string | null {
  if (tone === undefined) return null;
  return Number.isInteger(tone) && tone >= 0 && tone <= 255 ? null : "Invalid source tone.";
}
